const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const googleOAuth = require('../services/googleOAuth');
const { syncGmailForUser } = require('../services/gmail');
const { hasFeature } = require('../services/featureFlags');

const router = express.Router();

function frontendUrl(path) {
  return `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}${path}`;
}

// GET /api/gmail/authorize — authenticated. Returns the Google consent
// screen URL for the frontend to navigate the browser to directly (a full
// page redirect can't carry our Bearer token, so this is a two-step
// handoff: fetch the URL with auth, then window.location to it).
router.get('/authorize', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  if (!hasFeature('user', req.user.id, 'gmail_sync')) {
    return res.status(403).json({ error: 'Gmail Sync requires the Premium plan.', featureLocked: true, feature: 'gmail_sync' });
  }
  if (!googleOAuth.isConfigured()) {
    return res.status(503).json({ error: 'Gmail connect is not configured yet. Add Google OAuth credentials to enable automatic application tracking from your inbox.' });
  }
  res.json({ url: googleOAuth.buildAuthUrl(req.user.id) });
});

// GET /api/gmail/callback — PUBLIC. Google redirects the browser here
// directly after the person approves (or denies) access on Google's own
// consent screen, so this route intentionally has no auth middleware — the
// user is instead identified via the signed `state` token minted in
// buildAuthUrl above. Always ends in a redirect back to the app; never
// returns raw JSON (nobody's looking at this response directly).
router.get('/callback', async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    return res.redirect(frontendUrl(`/settings?gmail=error&message=${encodeURIComponent('Google sign-in was cancelled or denied.')}`));
  }

  const userId = googleOAuth.verifyState(state);
  if (!userId) {
    return res.redirect(frontendUrl(`/settings?gmail=error&message=${encodeURIComponent('This Gmail connection link expired. Please try again.')}`));
  }

  try {
    const tokens = await googleOAuth.exchangeCodeForTokens(code);
    const profile = await googleOAuth.fetchGoogleProfile(tokens.access_token);
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    db.prepare(`
      UPDATE users SET gmail_connected = 1, gmail_access_token = ?, gmail_refresh_token = COALESCE(?, gmail_refresh_token),
        gmail_token_expires_at = ?, gmail_email = ?
      WHERE id = ?
    `).run(tokens.access_token, tokens.refresh_token || null, expiresAt, profile?.email || null, userId);

    const result = await syncGmailForUser(userId).catch((err) => {
      console.error('[gmail] Initial sync after connect failed:', err.message);
      return { imported: 0 };
    });

    res.redirect(frontendUrl(`/settings?gmail=connected&imported=${result.imported || 0}`));
  } catch (err) {
    console.error('[gmail] OAuth callback failed:', err.message);
    res.redirect(frontendUrl(`/settings?gmail=error&message=${encodeURIComponent('Could not connect Gmail. Please try again.')}`));
  }
});

// POST /api/gmail/sync — authenticated, manual/on-app-open sync trigger.
router.post('/sync', authMiddleware, async (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  try {
    const result = await syncGmailForUser(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Gmail sync failed, please try again.', detail: err.message });
  }
});

module.exports = router;
