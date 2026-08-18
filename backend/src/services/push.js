// Real Web Push (RFC 8030) notifications — the push_subscriptions table
// existed in the schema long before any code actually used it; this is the
// first real send/receive implementation.
const webpush = require('web-push');
const db = require('../db');

function vapidConfigured() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && !VAPID_PUBLIC_KEY.startsWith('your-'));
}

let configured = false;
function ensureConfigured() {
  if (configured || !vapidConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@clearcall.com.au',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  configured = true;
}

/**
 * Sends a push notification to every subscription a user has registered
 * (they may have more than one — different browsers/devices). Expired or
 * invalid subscriptions (410 Gone / 404) are pruned automatically so the
 * table doesn't accumulate dead endpoints.
 */
async function sendPushToUser(userId, payload) {
  if (!vapidConfigured()) {
    console.log(`[DEV MODE - no VAPID keys set] Push to user ${userId}:`, JSON.stringify(payload));
    return { devMode: true, sent: 0 };
  }
  ensureConfigured();

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (subs.length === 0) return { sent: 0, total: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        body,
      );
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription is dead (browser unsubscribed, permission revoked,
        // etc.) — remove it rather than retrying forever.
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error(`[push] Failed to send to subscription ${sub.id}:`, err.message);
      }
    }
  }

  return { sent, total: subs.length };
}

module.exports = { sendPushToUser, vapidConfigured };
