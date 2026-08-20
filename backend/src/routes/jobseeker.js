const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const adzuna = require('../services/adzuna');
const googleOAuth = require('../services/googleOAuth');
const { syncGmailForUser } = require('../services/gmail');
const { sendPushToUser } = require('../services/push');
const fcm = require('../services/fcm');
const { createNotification } = require('../services/notifications');
const { checkCountLimit } = require('../services/featureFlags');

const router = express.Router();

function requireJobseeker(req, res, next) {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  next();
}
router.use(authMiddleware, requireJobseeker);

// --- Resume upload -----------------------------------------------------
const RESUME_DIR = path.join(__dirname, '..', '..', 'uploads', 'resumes');
fs.mkdirSync(RESUME_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESUME_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${req.user.id}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const okTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!okTypes.includes(ext)) return cb(new Error('Resume must be a PDF, DOC, or DOCX file'));
    cb(null, true);
  },
});

router.post('/resume', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Remove the previously uploaded resume, if any, so we don't accumulate
    // orphaned files on disk every time someone updates their resume.
    const existing = db.prepare('SELECT resume_path FROM users WHERE id = ?').get(req.user.id);

    // Re-uploading replaces the existing uploaded resume (not an addition),
    // so only check the limit when there wasn't one already.
    if (!existing?.resume_path) {
      const builtCount = db.prepare('SELECT COUNT(*) as n FROM resumes WHERE user_id = ?').get(req.user.id).n;
      const check = checkCountLimit('user', req.user.id, 'resume_uploads_limit', builtCount);
      if (!check.allowed) {
        return res.status(403).json({
          error: `Your plan allows up to ${check.limit} resume${check.limit === 1 ? '' : 's'} (uploaded + built combined). Upgrade to save more.`,
          featureLocked: true,
          feature: 'resume_uploads_limit',
        });
      }
    }

    if (existing?.resume_path && fs.existsSync(existing.resume_path)) {
      fs.unlink(existing.resume_path, () => {});
    }

    db.prepare(`
      UPDATE users SET full_name = ?, phone = ?, looking_for_work = ? WHERE id = ?
    `).run(
      fullName ? fullName.trim() : existing.full_name,
      phone !== undefined ? phone.trim() : existing.phone,
      lookingForWork !== undefined ? (lookingForWork ? 1 : 0) : existing.looking_for_work,
      req.user.id
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const { password_hash, resume_path, avatar_path, gmail_access_token, gmail_refresh_token, ...safe } = user;
    res.json({ profile: safe });
  });
});

router.get('/resume', (req, res) => {
  const user = db.prepare('SELECT resume_path, resume_filename FROM users WHERE id = ?').get(req.user.id);
  if (!user?.resume_path || !fs.existsSync(user.resume_path)) {
    return res.status(404).json({ error: 'No resume uploaded yet' });
  }
  res.download(user.resume_path, user.resume_filename);
});

router.delete('/resume', (req, res) => {
  const user = db.prepare('SELECT resume_path FROM users WHERE id = ?').get(req.user.id);
  if (user?.resume_path && fs.existsSync(user.resume_path)) {
    fs.unlink(user.resume_path, () => {});
  }
  db.prepare("UPDATE users SET resume_filename = NULL, resume_path = NULL, resume_uploaded_at = NULL WHERE id = ?").run(req.user.id);
  res.json({ message: 'Resume removed' });
});

// POST /api/jobseeker/resume/set-profile — marks the uploaded resume file
// (as opposed to one of the built resumes in /api/resumes) as the one
// automatically attached to job applications.
router.post('/resume/set-profile', (req, res) => {
  const user = db.prepare('SELECT resume_path FROM users WHERE id = ?').get(req.user.id);
  if (!user?.resume_path) return res.status(400).json({ error: 'No uploaded resume to set as your profile resume' });
  db.prepare("UPDATE users SET profile_resume_type = 'uploaded', profile_resume_id = NULL WHERE id = ?").run(req.user.id);
  res.json({ message: 'Set as your profile resume' });
});

// --- Profile photo upload -------------------------------------------------
const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${req.user.id}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const okTypes = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!okTypes.includes(ext)) return cb(new Error('Profile photo must be a JPG, PNG, or WEBP image'));
    cb(null, true);
  },
});

router.post('/avatar', (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const existing = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
    if (existing?.avatar_path && fs.existsSync(existing.avatar_path)) {
      fs.unlink(existing.avatar_path, () => {});
    }

    db.prepare(`
      UPDATE users SET avatar_filename = ?, avatar_path = ? WHERE id = ?
    `).run(req.file.originalname, req.file.path, req.user.id);

    res.status(201).json({ avatarUrl: '/api/jobseeker/avatar' });
  });
});

router.get('/avatar', (req, res) => {
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
  if (!user?.avatar_path || !fs.existsSync(user.avatar_path)) {
    return res.status(404).json({ error: 'No profile photo uploaded yet' });
  }
  res.sendFile(user.avatar_path);
});

router.delete('/avatar', (req, res) => {
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
  if (user?.avatar_path && fs.existsSync(user.avatar_path)) {
    fs.unlink(user.avatar_path, () => {});
  }
  db.prepare('UPDATE users SET avatar_filename = NULL, avatar_path = NULL WHERE id = ?').run(req.user.id);
  res.json({ message: 'Profile photo removed' });
});

// --- Profile -------------------------------------------------------------

router.get('/profile', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const { password_hash, resume_path, avatar_path, gmail_access_token, gmail_refresh_token, ...safe } = user;
  res.json({ profile: safe });
});

// Email is intentionally not editable here — changing the address tied to
// an account is a security-sensitive action (it's also the login
// credential), so it's deliberately left out of this general profile-edit
// endpoint entirely. Any "email" field in the request body is ignored, not
// just hidden client-side, so this holds even if someone calls the API
// directly instead of going through the Settings screen.
router.put('/profile', (req, res) => {
  const { fullName, phone, lookingForWork } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  db.prepare(`
    UPDATE users SET full_name = ?, phone = ?, looking_for_work = ? WHERE id = ?
  `).run(
    fullName ? fullName.trim() : existing.full_name,
    phone !== undefined ? phone.trim() : existing.phone,
    lookingForWork !== undefined ? (lookingForWork ? 1 : 0) : existing.looking_for_work,
    req.user.id
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const { password_hash, resume_path, avatar_path, gmail_access_token, gmail_refresh_token, ...safe } = user;
  res.json({ profile: safe });
});

// --- Notification + privacy settings --------------------------------------

router.get('/notification-settings', (req, res) => {
  const u = db.prepare('SELECT notif_verified_calls, notif_application_updates, notif_new_matches, notif_interview_reminders FROM users WHERE id = ?').get(req.user.id);
  res.json({ settings: u });
});

router.put('/notification-settings', (req, res) => {
  const { verifiedCalls, applicationUpdates, newMatches, interviewReminders } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  db.prepare(`
    UPDATE users SET notif_verified_calls = ?, notif_application_updates = ?, notif_new_matches = ?, notif_interview_reminders = ? WHERE id = ?
  `).run(
    verifiedCalls !== undefined ? (verifiedCalls ? 1 : 0) : existing.notif_verified_calls,
    applicationUpdates !== undefined ? (applicationUpdates ? 1 : 0) : existing.notif_application_updates,
    newMatches !== undefined ? (newMatches ? 1 : 0) : existing.notif_new_matches,
    interviewReminders !== undefined ? (interviewReminders ? 1 : 0) : existing.notif_interview_reminders,
    req.user.id
  );
  const u = db.prepare('SELECT notif_verified_calls, notif_application_updates, notif_new_matches, notif_interview_reminders FROM users WHERE id = ?').get(req.user.id);
  res.json({ settings: u });
});

// "Show my profile to placement agents" — a single toggle, per spec. Stored
// in the pre-existing profile_visibility column ('agents_employers' = shown,
// 'private' = hidden) so no migration is needed.
router.put('/privacy', (req, res) => {
  const { showProfileToAgents } = req.body;
  if (typeof showProfileToAgents !== 'boolean') {
    return res.status(400).json({ error: 'showProfileToAgents (boolean) is required' });
  }
  const profileVisibility = showProfileToAgents ? 'agents_employers' : 'private';
  db.prepare('UPDATE users SET profile_visibility = ? WHERE id = ?').run(profileVisibility, req.user.id);
  res.json({ profileVisibility, showProfileToAgents });
});

// --- Gmail connect (stub — real once Google OAuth credentials are set) ---

router.get('/gmail/status', (req, res) => {
  const u = db.prepare('SELECT gmail_connected, gmail_email, gmail_last_sync_at FROM users WHERE id = ?').get(req.user.id);
  res.json({
    configured: googleOAuth.isConfigured(),
    connected: !!u.gmail_connected,
    email: u.gmail_email,
    lastSyncAt: u.gmail_last_sync_at,
  });
});

// The real connect flow is GET /api/gmail/authorize (returns the Google
// consent URL) → browser navigates there → GET /api/gmail/callback (public,
// see routes/gmailAuth.js). This route only handles turning it back off.
router.post('/gmail/disconnect', (req, res) => {
  db.prepare(`
    UPDATE users SET gmail_connected = 0, gmail_access_token = NULL, gmail_refresh_token = NULL,
      gmail_token_expires_at = NULL, gmail_email = NULL
    WHERE id = ?
  `).run(req.user.id);
  res.json({ message: 'Gmail disconnected' });
});

// --- Placement agent -------------------------------------------------------

// A job seeker can now have more than one connected agent at once (up to
// their plan's agent_connections_limit) — this returns all of them,
// newest-connected first. `agent` (singular) is also included for any
// older frontend code expecting the old shape, set to the most recent
// connection or null.
router.get('/agent', (req, res) => {
  const rows = db.prepare(`
    SELECT ac.connected_at, a.user_id, a.agency_name, a.rating, a.specialty, a.successful_placements,
      u.full_name, u.email, u.phone, u.avatar_path
    FROM agent_clients ac
    JOIN agents a ON a.user_id = ac.agent_user_id
    JOIN users u ON u.id = a.user_id
    WHERE ac.jobseeker_user_id = ?
    ORDER BY ac.connected_at DESC
  `).all(req.user.id);

  const shaped = rows.map((row) => ({
    userId: row.user_id,
    agencyName: row.agency_name,
    fullName: row.full_name,
    email: row.email,
    maskedPhone: row.phone ? row.phone.replace(/(\d{2,4})\d+(\d{2})/, '$1•••••$2') : null,
    rating: row.rating,
    specialty: row.specialty,
    successfulPlacements: row.successful_placements,
    hasPhoto: !!row.avatar_path,
    connectedAt: row.connected_at,
  }));

  res.json({ agents: shaped, agent: shaped[0] || null });
});

// Job applications this job seeker's connected agent has submitted on
// their behalf (source = 'agent' — see routes/jobs.js apply-as-agent).
router.get('/agent/applications', (req, res) => {
  const applications = db.prepare(`
    SELECT id, company_name, job_title, date_applied, status, created_at
    FROM job_applications WHERE user_id = ? AND source = 'agent'
    ORDER BY date_applied DESC
  `).all(req.user.id);
  res.json({ applications });
});

router.get('/agents/available', (req, res) => {
  const search = (req.query.search || '').trim();
  let rows;
  if (search) {
    const like = `%${search}%`;
    rows = db.prepare(`
      SELECT a.user_id, a.agency_name, a.rating, a.specialty, a.successful_placements, u.full_name
      FROM agents a JOIN users u ON u.id = a.user_id
      WHERE a.suspension_status = 0
        AND (u.full_name LIKE ? OR a.agency_name LIKE ? OR a.specialty LIKE ?)
      ORDER BY a.featured DESC, a.rating DESC
    `).all(like, like, like);
  } else {
    rows = db.prepare(`
      SELECT a.user_id, a.agency_name, a.rating, a.specialty, a.successful_placements, u.full_name
      FROM agents a JOIN users u ON u.id = a.user_id
      WHERE a.suspension_status = 0
      ORDER BY a.featured DESC, a.rating DESC
    `).all();
  }
  res.json({
    agents: rows.map((r) => ({
      userId: r.user_id,
      agencyName: r.agency_name,
      fullName: r.full_name,
      rating: r.rating,
      specialty: r.specialty,
      successfulPlacements: r.successful_placements,
    })),
  });
});

router.post('/agent/connect', (req, res) => {
  const { agentUserId } = req.body;
  if (!agentUserId) return res.status(400).json({ error: 'agentUserId is required' });

  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(agentUserId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const existing = db.prepare('SELECT id FROM agent_clients WHERE jobseeker_user_id = ? AND agent_user_id = ?').get(req.user.id, agentUserId);
  if (existing) {
    db.prepare("UPDATE agent_clients SET connected_at = datetime('now') WHERE id = ?").run(existing.id);
    return res.json({ message: 'Already connected with this agent' });
  }

  const currentCount = db.prepare('SELECT COUNT(*) as n FROM agent_clients WHERE jobseeker_user_id = ?').get(req.user.id).n;
  const check = checkCountLimit('user', req.user.id, 'agent_connections_limit', currentCount);
  if (!check.allowed) {
    const isFree = (req.user.plan || 'free') === 'free';
    return res.status(403).json({
      error: isFree
        ? `You can only connect with ${check.limit} agent${check.limit === 1 ? '' : 's'} on the free plan. Upgrade to Premium to connect with up to 3 agents.`
        : `You have reached the maximum of ${check.limit} agent connections on the Premium plan. Disconnect an existing agent to connect with a new one.`,
      featureLocked: true,
      feature: 'agent_connections_limit',
    });
  }

  db.prepare('INSERT INTO agent_clients (id, agent_user_id, jobseeker_user_id) VALUES (?, ?, ?)').run(newId('agentlink'), agentUserId, req.user.id);
  db.prepare('UPDATE agents SET active_clients = active_clients + 1 WHERE user_id = ?').run(agentUserId);

  res.json({ message: 'Connected with agent' });
});

// DELETE /jobseeker/agent/:agentUserId — disconnect from one specific
// agent (a job seeker may have several connected at once on Premium).
router.delete('/agent/:agentUserId', (req, res) => {
  const existing = db.prepare('SELECT * FROM agent_clients WHERE jobseeker_user_id = ? AND agent_user_id = ?').get(req.user.id, req.params.agentUserId);
  if (!existing) return res.status(404).json({ error: 'No such agent connection' });
  db.prepare('DELETE FROM agent_clients WHERE id = ?').run(existing.id);
  db.prepare('UPDATE agents SET active_clients = MAX(0, active_clients - 1) WHERE user_id = ?').run(existing.agent_user_id);
  res.json({ message: 'Disconnected from agent' });
});

// DELETE /jobseeker/agent — back-compat: disconnects from all connected
// agents at once (older frontend code path).
router.delete('/agent', (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_clients WHERE jobseeker_user_id = ?').all(req.user.id);
  if (rows.length === 0) return res.status(404).json({ error: 'No agent connected' });
  for (const row of rows) {
    db.prepare('UPDATE agents SET active_clients = MAX(0, active_clients - 1) WHERE user_id = ?').run(row.agent_user_id);
  }
  db.prepare('DELETE FROM agent_clients WHERE jobseeker_user_id = ?').run(req.user.id);
  res.json({ message: 'Disconnected from agent' });
});

// --- Messages (admin -> jobseeker messages, e.g. from ClearCall support) --

router.get('/messages', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM admin_messages WHERE target_type = 'jobseeker' AND target_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  const messages = rows.map((r) => ({ id: r.id, subject: r.subject, message: r.message, sentBy: r.sent_by, createdAt: r.created_at, read: !!r.read_at }));
  res.json({ messages, unreadCount: messages.filter((m) => !m.read).length });
});

router.put('/messages/:id/read', (req, res) => {
  const existing = db.prepare("SELECT id FROM admin_messages WHERE id = ? AND target_type = 'jobseeker' AND target_id = ?").get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Message not found' });
  db.prepare("UPDATE admin_messages SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL").run(req.params.id);
  res.json({ message: 'Marked as read' });
});

// --- Dashboard + activity feed ---------------------------------------------

function weekAgoIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function buildActivityFeed(userId, limit) {
  const events = [];

  const calls = db.prepare(`
    SELECT calls.id, calls.job_role, calls.call_type, calls.created_at, companies.name as company_name
    FROM calls LEFT JOIN companies ON companies.id = calls.company_id
    WHERE calls.receiver_user_id = ? AND calls.call_type = 'clearcall'
    ORDER BY calls.created_at DESC LIMIT 20
  `).all(userId);
  for (const c of calls) {
    events.push({
      type: 'verified_call',
      at: c.created_at,
      title: 'Verified call received',
      detail: `${c.company_name || 'A verified employer'}${c.job_role ? ` — ${c.job_role}` : ''}`,
    });
  }

  const PLATFORM_LABEL = { clearcall: 'ClearCall Jobs', gmail: 'Gmail', adzuna: 'Adzuna', agent: 'Placement Agent', manual: 'Manual' };
  const applications = db.prepare('SELECT * FROM job_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(userId);
  for (const a of applications) {
    events.push({
      type: 'application_submitted',
      at: a.created_at,
      title: 'Application submitted',
      detail: `${a.company_name} — ${a.job_title} (${PLATFORM_LABEL[a.source] || a.source})`,
    });
    if (a.updated_at !== a.created_at) {
      if (a.status === 'interview') {
        events.push({
          type: 'interview_scheduled',
          at: a.updated_at,
          title: 'Interview scheduled',
          detail: `${a.company_name}${a.interview_at ? ` — ${new Date(a.interview_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}`,
        });
      } else if (a.status === 'rejected') {
        events.push({
          type: 'application_rejected',
          at: a.updated_at,
          title: 'Application rejected',
          detail: a.company_name,
        });
      } else if (['offer', 'withdrawn'].includes(a.status)) {
        events.push({
          type: 'status_updated',
          at: a.updated_at,
          title: 'Application status updated',
          detail: `${a.company_name} — ${a.status === 'offer' ? 'Offer Received' : 'Withdrawn'}`,
        });
      }
    }
  }

  // New job matches: genuinely new ClearCall Direct postings (last 14 days)
  // — surfaced as-is, no fabricated matching score.
  const newJobs = db.prepare(`
    SELECT jobs.id, jobs.title, jobs.posted_at FROM jobs
    WHERE jobs.active = 1 AND jobs.posted_at >= datetime('now', '-14 days')
    ORDER BY jobs.posted_at DESC LIMIT 5
  `).all();
  for (const j of newJobs) {
    events.push({ type: 'new_job_match', at: j.posted_at, title: 'New job match found', detail: j.title });
  }

  // Agent connected / access key revoked — sourced from the notifications
  // table since those events are already recorded there when they happen
  // (see services/notifications.js callers in accessKeys.js).
  const agentEvents = db.prepare(`
    SELECT type, message, created_at FROM notifications
    WHERE user_id = ? AND type IN ('agent_connected', 'key_revoked')
    ORDER BY created_at DESC LIMIT 20
  `).all(userId);
  for (const n of agentEvents) {
    events.push({
      type: n.type,
      at: n.created_at,
      title: n.type === 'agent_connected' ? 'New agent connected' : 'Access key revoked',
      detail: n.message,
    });
  }

  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return events.slice(0, limit || events.length);
}

router.get('/activity', (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || 20, 50);
  const type = req.query.type;

  const events = buildActivityFeed(req.user.id, pageSize);
  res.json({ events });
});

// --- Generate Access Key Route ---
router.post('/access-keys/generate', (req, res) => {
  const { key_name } = req.body;
  if (!key_name) return res.status(400).json({ error: 'key_name is required' });

  const userPlan = req.user.plan || 'free';
  const maxKeys = userPlan === 'free' ? 1 : 5;

  const activeKeys = db.prepare('SELECT COUNT(*) as count FROM access_keys WHERE user_id = ? AND status = "active"').get(req.user.id).count;
  if (activeKeys >= maxKeys) {
    return res.status(403).json({ error: `You have reached your plan limit for access keys (${maxKeys} allowed)` });
  }

  const keyString = `CC-2026-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  db.prepare('INSERT INTO access_keys (id, user_id, key_string, key_name) VALUES (?, ?, ?, ?)').run(newId('key'), req.user.id, keyString, key_name);

  res.json({ key_string: keyString });
});

// --- List Access Keys Route ---
router.get('/access-keys', (req, res) => {
  const keys = db.prepare('SELECT id, key_name, status, applications_made, created_at FROM access_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ keys });
});

// --- Revoke Access Key Route ---
router.delete('/access-keys/:id', (req, res) => {
  const key = db.prepare('SELECT id FROM access_keys WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  db.prepare('UPDATE access_keys SET status = ? WHERE id = ?').run('revoked', req.params.id);
  res.json({ success: true });
});

module.exports = router;
