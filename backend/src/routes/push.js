const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { vapidConfigured } = require('../services/push');
const fcm = require('../services/fcm');

const router = express.Router();

// GET /api/push/vapid-public-key — the frontend needs this to call
// pushManager.subscribe(). Not a secret (only the private key is).
router.get('/vapid-public-key', (req, res) => {
  if (!vapidConfigured()) return res.status(503).json({ error: 'Push notifications are not configured on this server yet' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — body: the PushSubscription object from
// pushManager.subscribe() ({ endpoint, keys: { p256dh, auth } }).
router.post('/subscribe', authMiddleware, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'A valid push subscription (endpoint + keys) is required' });
  }

  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').get(req.user.id, endpoint);
  if (existing) {
    db.prepare('UPDATE push_subscriptions SET keys_p256dh = ?, keys_auth = ? WHERE id = ?').run(keys.p256dh, keys.auth, existing.id);
    return res.json({ success: true, id: existing.id });
  }

  const id = newId('push');
  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, endpoint, keys.p256dh, keys.auth);
  res.status(201).json({ success: true, id });
});

// POST /api/push/unsubscribe — body: { endpoint }
router.post('/unsubscribe', authMiddleware, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.user.id, endpoint);
  res.json({ success: true });
});

// POST /api/push/fcm-token — body: { token, platform }. Registers a Firebase
// Cloud Messaging device token against the logged-in user, so verified-call
// notifications can also be sent through FCM alongside web push. See
// services/fcm.js for a caveat about the legacy FIREBASE_SERVER_KEY API.
router.post('/fcm-token', authMiddleware, (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });
  fcm.registerToken(req.user.id, token, platform);
  res.status(201).json({ success: true });
});

// POST /api/push/fcm-token/remove — body: { token }
router.post('/fcm-token/remove', authMiddleware, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });
  fcm.removeToken(req.user.id, token);
  res.json({ success: true });
});

module.exports = router;
