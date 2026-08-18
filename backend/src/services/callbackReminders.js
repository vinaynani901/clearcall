// Activates the previously-dead campaign_candidates.callback_reminder_sent_at
// column: a lightweight in-process interval (no new cron dependency) that
// periodically checks for scheduled callbacks whose time has arrived and
// haven't been reminded about yet, and emails the employer who owns that
// campaign via the existing Resend integration.
const db = require('../db');
const { sendCallbackReminderEmail } = require('./resend');
const { sendPushToUser } = require('./push');

const CHECK_INTERVAL_MS = 60 * 1000; // once a minute is plenty for a "due now" reminder

async function checkDueCallbacks() {
  const due = db.prepare(`
    SELECT cc.id, cc.name as candidate_name, cc.job_role, cc.callback_at,
      camp.id as campaign_id, camp.name as campaign_name, u.id as employer_user_id, u.email as employer_email
    FROM campaign_candidates cc
    JOIN campaign_batches cb ON cb.id = cc.batch_id
    JOIN campaigns camp ON camp.id = cb.campaign_id
    JOIN users u ON u.id = camp.employer_user_id
    WHERE cc.callback_at IS NOT NULL
      AND cc.callback_at <= datetime('now')
      AND cc.callback_reminder_sent_at IS NULL
  `).all();

  if (due.length === 0) return { checked: 0, sent: 0 };

  const markSent = db.prepare("UPDATE campaign_candidates SET callback_reminder_sent_at = datetime('now') WHERE id = ?");
  let sent = 0;

  for (const row of due) {
    try {
      await sendCallbackReminderEmail(row.employer_email, {
        candidateName: row.candidate_name,
        jobRole: row.job_role,
        campaignName: row.campaign_name,
        callbackTime: new Date(row.callback_at.replace(' ', 'T')).toLocaleString('en-AU'),
      });
      sent += 1;
    } catch (err) {
      console.error(`[callback-reminders] Failed to send reminder for candidate ${row.id}:`, err.message);
      // Don't mark as sent — it'll be retried on the next tick.
      continue;
    }

    // Push is best-effort on top of the email above — a push failure (or no
    // subscription at all) must never stop the email reminder from counting
    // as sent.
    sendPushToUser(row.employer_user_id, {
      title: 'Callback due',
      body: `${row.candidate_name} — ${row.campaign_name}`,
      url: `/employer/campaigns/${row.campaign_id}`,
      tag: `callback-${row.id}`,
    }).catch((err) => console.error(`[callback-reminders] Push failed for candidate ${row.id}:`, err.message));

    markSent.run(row.id);
  }

  return { checked: due.length, sent };
}

let intervalHandle = null;

function startCallbackReminderScheduler() {
  if (intervalHandle) return; // already running — avoid double-starting on hot reload etc.
  intervalHandle = setInterval(() => {
    checkDueCallbacks().catch((err) => console.error('[callback-reminders] Check failed:', err.message));
  }, CHECK_INTERVAL_MS);
  // Node shouldn't stay alive purely because of this timer if everything
  // else has shut down.
  if (intervalHandle.unref) intervalHandle.unref();
  console.log('[callback-reminders] Scheduler started — checking every 60s for due callbacks.');
}

function stopCallbackReminderScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startCallbackReminderScheduler, stopCallbackReminderScheduler, checkDueCallbacks };
