const db = require('../db');
const { newId } = require('../utils/ids');
const googleOAuth = require('./googleOAuth');
const { hasFeature, checkCountLimit } = require('./featureFlags');

// Job platform senders ClearCall is allowed to read. Every Gmail search
// below is scoped to `from:(...)` these exact domains — ClearCall never
// reads any email outside this list, regardless of subject/content.
const KNOWN_SENDERS = [
  { domain: 'seek.com.au', platform: 'Seek' },
  { domain: 'linkedin.com', platform: 'LinkedIn' },
  { domain: 'indeed.com', platform: 'Indeed' },
  { domain: 'indeedemail.com', platform: 'Indeed' },
  { domain: 'jora.com', platform: 'Jora' },
  { domain: 'glassdoor.com', platform: 'Glassdoor' },
  { domain: 'ethicaljobs.com.au', platform: 'EthicalJobs' },
  { domain: 'careerone.com.au', platform: 'CareerOne' },
];

function buildSearchQuery(afterEpochSeconds) {
  const fromClause = KNOWN_SENDERS.map((s) => `@${s.domain}`).join(' OR ');
  const subjectClause = '(application OR applied OR "thank you for applying" OR "application received" OR "application sent")';
  const recency = afterEpochSeconds ? `after:${afterEpochSeconds}` : 'newer_than:180d';
  return `from:(${fromClause}) subject:${subjectClause} ${recency}`;
}

function platformForSender(fromHeader) {
  const lower = (fromHeader || '').toLowerCase();
  const match = KNOWN_SENDERS.find((s) => lower.includes(`@${s.domain}`));
  return match ? match.platform : null;
}

// Best-effort extraction from subject + snippet. Real job-platform emails
// don't follow one fixed format, so this tries several known phrasings per
// platform and falls back to using the subject itself as the job title
// (with the platform name as the company) rather than silently dropping the
// email — every matched email still becomes a real, editable application
// record even when parsing can't fully separate title from company.
function parseJobDetails(subject, snippet, platform) {
  const text = `${subject} ${snippet || ''}`;

  const patterns = [
    /application (?:for|to) (.+?) at (.+?)(?:\.|,|$)/i,
    /applied (?:for|to) (.+?) at (.+?)(?:\.|,|$)/i,
    /(?:your )?application (?:was |has been )?sent to (.+?)(?:\.|,|for|$)/i,
    /(.+?) role at (.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m.length >= 3) {
      return { jobTitle: m[1].trim(), companyName: m[2].trim() };
    }
    if (m && m.length === 2) {
      return { jobTitle: `Application via ${platform}`, companyName: m[1].trim() };
    }
  }

  // Nothing matched — keep the raw subject as the title so nothing is lost.
  return { jobTitle: subject.replace(/^(re:|fwd:)\s*/i, '').trim() || `Application via ${platform}`, companyName: null };
}

async function ensureFreshToken(user) {
  const expiresAt = user.gmail_token_expires_at ? new Date(user.gmail_token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60000) return user.gmail_access_token; // still valid for at least 60s

  if (!user.gmail_refresh_token) throw new Error('Gmail is connected but no refresh token is on file — please reconnect Gmail in Settings.');

  const refreshed = await googleOAuth.refreshAccessToken(user.gmail_refresh_token);
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
  db.prepare('UPDATE users SET gmail_access_token = ?, gmail_token_expires_at = ? WHERE id = ?')
    .run(refreshed.access_token, newExpiresAt, user.id);
  return refreshed.access_token;
}

async function gmailFetch(accessToken, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Gmail API request failed (${res.status})`);
  }
  return res.json();
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

// Scans the connected Gmail inbox for known job-platform application emails
// and imports any not already tracked. Safe to call repeatedly (e.g. every
// dashboard load) — dedupes by Gmail message id, and only ever looks at
// messages from the fixed KNOWN_SENDERS domain list.
async function syncGmailForUser(userId) {
  if (!googleOAuth.isConfigured()) {
    return { synced: false, reason: 'not_configured' };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.gmail_connected || !user.gmail_refresh_token) {
    return { synced: false, reason: 'not_connected' };
  }
  // Gmail Sync is a plan-gated feature (free plan doesn't include it). A
  // free-plan job seeker who connected Gmail while on premium and then
  // downgraded should stop syncing immediately, not just be blocked from
  // reconnecting — so this is checked here, every sync, not only at
  // connect-time.
  if (!hasFeature('user', userId, 'gmail_sync')) {
    return { synced: false, reason: 'feature_locked' };
  }

  const accessToken = await ensureFreshToken(user);

  const afterEpoch = user.gmail_last_sync_at ? Math.floor(new Date(user.gmail_last_sync_at).getTime() / 1000) : null;
  const query = buildSearchQuery(afterEpoch);
  const list = await gmailFetch(accessToken, `/messages?${new URLSearchParams({ q: query, maxResults: '30' })}`);

  const messages = list.messages || [];
  let imported = 0;

  const alreadyImported = new Set(
    db.prepare('SELECT gmail_message_id FROM job_applications WHERE user_id = ? AND gmail_message_id IS NOT NULL').all(userId)
      .map((r) => r.gmail_message_id)
  );

  const insert = db.prepare(`
    INSERT INTO job_applications (id, user_id, company_name, job_title, platform, date_applied, source, gmail_message_id)
    VALUES (?, ?, ?, ?, ?, ?, 'gmail', ?)
  `);

  let currentApplicationCount = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ?').get(userId).n;

  for (const m of messages) {
    if (alreadyImported.has(m.id)) continue;

    // Stop importing once the applications_limit is reached (free plan) —
    // silently rather than erroring, since this runs as a background sync,
    // not a direct user action. Whatever was imported before hitting the
    // cap is kept; the rest will pick back up automatically after an
    // upgrade or once existing applications are removed.
    if (!checkCountLimit('user', userId, 'applications_limit', currentApplicationCount).allowed) break;

    const detail = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
    const from = headerValue(detail.payload?.headers, 'From');
    const subject = headerValue(detail.payload?.headers, 'Subject') || '(no subject)';
    const dateHeader = headerValue(detail.payload?.headers, 'Date');

    const platform = platformForSender(from);
    if (!platform) continue; // safety net — query already scopes senders, but never act on anything outside the known list

    const { jobTitle, companyName } = parseJobDetails(subject, detail.snippet, platform);
    const dateApplied = dateHeader ? new Date(dateHeader).toISOString().slice(0, 10) : new Date(Number(detail.internalDate)).toISOString().slice(0, 10);

    insert.run(newId('application'), userId, companyName || `Applied via ${platform}`, jobTitle, platform, dateApplied, m.id);
    imported += 1;
    currentApplicationCount += 1;
  }

  db.prepare('UPDATE users SET gmail_last_sync_at = datetime(\'now\') WHERE id = ?').run(userId);

  return { synced: true, imported };
}

module.exports = { syncGmailForUser, KNOWN_SENDERS };
