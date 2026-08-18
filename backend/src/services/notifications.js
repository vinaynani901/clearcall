// Job seeker notifications feed — a real DB row per event, backing the bell
// dropdown in JobSeekerTopBar. Kept deliberately simple (insert + read),
// separate from the push/FCM/SMS channels in push.js/fcm.js/sms.js: this is
// the in-app "what happened on my account" log, those are the "reach me
// even when the app is closed" channels. The two overlap in triggers
// (verified call, application status change, new job match) but are
// independent — a push failure must never stop the notification row from
// being written, and vice versa.
const db = require('../db');
const { newId } = require('../utils/ids');

function createNotification(userId, { type, title, message, link, actionData }) {
  try {
    const id = newId('notif');
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link, action_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, title, message, link || null, actionData ? JSON.stringify(actionData) : null);
    return id;
  } catch (err) {
    // A notification-row failure must never break the caller's real work
    // (recording a call, updating an application, etc.) — log and move on.
    console.error('[notifications] Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { createNotification };
