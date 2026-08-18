// Firebase Cloud Messaging — sends push notifications to device tokens
// registered in the fcm_tokens table, using FIREBASE_SERVER_KEY as
// requested.
//
// IMPORTANT CAVEAT: FIREBASE_SERVER_KEY corresponds to the legacy FCM HTTP
// API (https://fcm.googleapis.com/fcm/send), which Google shut off for all
// Firebase projects in June 2024. It has been replaced by the FCM HTTP v1
// API, which requires a service-account JSON key + OAuth2 access token
// rather than a bare server key. This module is implemented exactly as
// specified (a single FIREBASE_SERVER_KEY env var), so on any Firebase
// project created after the legacy API was retired, sends will fail with a
// 404/401 from Google — this is called out explicitly rather than silently
// pretending the notification went out.
//
// Because of this, ClearCall's already-working VAPID web push
// (services/push.js) remains the real, functioning push channel for
// verified-call notifications today. This FCM module runs alongside it:
// if FCM succeeds (e.g. on an older project, or once upgraded to a real v1
// service-account setup), great — if it fails, that's logged and the caller
// falls through to web push / SMS, so a failure here never blocks the
// notification from reaching the person some other way.
const db = require('../db');

function fcmConfigured() {
  const key = process.env.FIREBASE_SERVER_KEY;
  return !!(key && !key.startsWith('your-') && key.trim().length > 0);
}

/**
 * Sends an FCM data+notification payload to every device token a user has
 * registered. Dead tokens (NotRegistered / InvalidRegistration) are pruned.
 * Never throws — always resolves with a result summary so callers can
 * decide whether to fall back to another channel (web push, SMS).
 */
async function sendFcmToUser(userId, { title, body, data } = {}) {
  if (!fcmConfigured()) {
    console.log(`[DEV MODE - no FIREBASE_SERVER_KEY set] FCM to user ${userId}:`, JSON.stringify({ title, body, data }));
    return { devMode: true, sent: 0, total: 0 };
  }

  const tokens = db.prepare('SELECT * FROM fcm_tokens WHERE user_id = ?').all(userId);
  if (tokens.length === 0) return { sent: 0, total: 0 };

  let sent = 0;
  for (const t of tokens) {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${process.env.FIREBASE_SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: t.token,
          notification: { title, body },
          data: data || {},
          priority: 'high',
        }),
      });

      if (!res.ok) {
        console.error(`[fcm] Send failed for token ${t.id}: HTTP ${res.status} (legacy FCM HTTP API — see services/fcm.js comment; Google retired this API in June 2024)`);
        continue;
      }

      const json = await res.json().catch(() => ({}));
      if (json.failure === 1 && /NotRegistered|InvalidRegistration/.test(json.results?.[0]?.error || '')) {
        db.prepare('DELETE FROM fcm_tokens WHERE id = ?').run(t.id);
        continue;
      }
      if (json.success === 1) sent += 1;
    } catch (err) {
      console.error(`[fcm] Send failed for token ${t.id}:`, err.message);
    }
  }

  return { sent, total: tokens.length };
}

function registerToken(userId, token, platform) {
  const { newId } = require('../utils/ids');
  const existing = db.prepare('SELECT id FROM fcm_tokens WHERE user_id = ? AND token = ?').get(userId, token);
  if (existing) return;
  db.prepare('INSERT INTO fcm_tokens (id, user_id, token, platform) VALUES (?, ?, ?, ?)').run(newId('fcmtoken'), userId, token, platform || null);
}

function removeToken(userId, token) {
  db.prepare('DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?').run(userId, token);
}

module.exports = { sendFcmToUser, fcmConfigured, registerToken, removeToken };
