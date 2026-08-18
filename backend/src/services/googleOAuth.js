const jwt = require('jsonwebtoken');

// Real Google OAuth 2.0 (Authorization Code flow) for Gmail read-only
// access. Uses raw fetch against Google's endpoints directly — no
// googleapis SDK dependency, same lightweight-integration pattern used
// elsewhere in this backend (aiAssistant.js, adzuna.js). Left unconfigured
// (no GOOGLE_OAUTH_CLIENT_ID/SECRET), every function below reports that
// clearly instead of half-working.

function isConfigured() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET } = process.env;
  return !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri() {
  return `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/api/gmail/callback`;
}

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// The OAuth redirect comes back from Google as a plain browser GET request —
// no Authorization header, so we can't use the normal JWT auth middleware on
// the callback. Instead the user's id is carried through as a short-lived,
// signed `state` token (5 minutes — just long enough to complete the Google
// consent screen) and verified on the way back, which also doubles as CSRF
// protection for the OAuth flow.
function buildAuthUrl(userId) {
  const state = jwt.sign({ userId, purpose: 'gmail_oauth' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GMAIL_READONLY_SCOPE,
    access_type: 'offline', // needed to receive a refresh_token
    prompt: 'consent', // forces refresh_token on every re-connect, not just the first
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function verifyState(state) {
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    if (payload.purpose !== 'gmail_oauth') return null;
    return payload.userId;
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Google rejected the authorization code');
  return data; // { access_token, refresh_token, expires_in, scope, token_type, id_token }
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Could not refresh Google access token');
  return data; // { access_token, expires_in, scope, token_type }
}

async function fetchGoogleProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json(); // { email, ... }
}

module.exports = { isConfigured, buildAuthUrl, verifyState, exchangeCodeForTokens, refreshAccessToken, fetchGoogleProfile, GMAIL_READONLY_SCOPE };
