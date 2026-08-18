// Auto Apply — daily AEST-boundary tasks (Part 5's 6pm summary + Part 7's
// midnight slot reset). Both are "fire once when the Sydney clock crosses a
// specific point" events, so they share one lightweight polling interval
// (every 5 minutes — plenty of precision for day-granularity triggers, same
// philosophy as pilotScheduler.js's 6-hour poll for 7-day-out events) rather
// than two separate schedulers.
//
// Note on the slot reset: auto_apply_daily_usage is keyed by (user_id,
// date), so a brand-new AEST calendar date already has no usage row and
// therefore reads as zero slots used — the "reset" is inherent in the data
// model, the same way usage_tracking's monthly counters reset by simply
// having no row for the new month. This scheduler makes that reset an
// explicit, logged, verifiable event as the spec asks for, by proactively
// zeroing (or creating a zeroed) row for every active Auto Apply user right
// as the AEST date rolls over, rather than relying purely on the row's
// absence.
const db = require('../db');
const { newId } = require('../utils/ids');
const { todayAEST, currentAESTHourMinute } = require('../utils/timezone');
const { createNotification } = require('./notifications');
const { sendPushToUser } = require('./push');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SUMMARY_HOUR_AEST = 18; // 6pm

function getActiveAutoApplyUserIds() {
  return db.prepare('SELECT DISTINCT user_id FROM auto_apply_preferences WHERE is_active = 1').all().map((r) => r.user_id);
}

// --- Part 7: midnight AEST daily slot reset -------------------------------

let lastResetDate = null;

function performDailyReset() {
  const today = todayAEST();
  if (lastResetDate === today) return { skipped: true };

  const userIds = getActiveAutoApplyUserIds();
  const upsert = db.prepare(`
    INSERT INTO auto_apply_daily_usage (id, user_id, date, slots_used, last_updated)
    VALUES (?, ?, ?, 0, datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET slots_used = 0, last_updated = datetime('now')
  `);
  const tx = db.transaction((ids) => {
    for (const userId of ids) upsert.run(newId('aausage'), userId, today);
  });
  tx(userIds);

  lastResetDate = today;
  console.log(`[auto-apply-daily-tasks] Daily slot reset complete for ${userIds.length} active Auto Apply user(s) — ${today} (AEST).`);
  return { reset: userIds.length, date: today };
}

// --- Part 5: 6pm AEST daily summary notification --------------------------

function countAutoAppliedToday(userId, today) {
  const rows = db.prepare("SELECT created_at FROM job_applications WHERE user_id = ? AND source = 'auto_apply'").all(userId);
  return rows.filter((r) => todayAEST(new Date(`${r.created_at.replace(' ', 'T')}Z`)) === today).length;
}

let lastSummaryDate = null;

async function sendDailySummaries() {
  const today = todayAEST();
  if (lastSummaryDate === today) return { skipped: true };

  const { hour } = currentAESTHourMinute();
  if (hour < SUMMARY_HOUR_AEST) return { skipped: true, reason: 'before-6pm' };

  const userIds = getActiveAutoApplyUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const count = countAutoAppliedToday(userId, today);
    if (count === 0) continue;

    const message = `ClearCall applied to ${count} job${count === 1 ? '' : 's'} for you today — tap to see them all.`;
    createNotification(userId, { type: 'auto_apply_summary', title: 'Your Auto Apply summary', message, link: '/jobseeker/applications' });
    try {
      await sendPushToUser(userId, { title: 'Your Auto Apply summary', body: message, url: '/jobseeker/applications', tag: 'auto-apply-summary' });
    } catch (err) {
      console.error(`[auto-apply-daily-tasks] Summary push failed for user ${userId}:`, err.message);
    }
    sent += 1;
  }

  lastSummaryDate = today;
  console.log(`[auto-apply-daily-tasks] Sent ${sent} daily summary notification(s) for ${today} (AEST, 6pm check).`);
  return { sent, date: today };
}

// --- Scheduler --------------------------------------------------------

let intervalHandle = null;

async function checkDailyTasks() {
  try { performDailyReset(); } catch (err) { console.error('[auto-apply-daily-tasks] Reset check failed:', err.message); }
  try { await sendDailySummaries(); } catch (err) { console.error('[auto-apply-daily-tasks] Summary check failed:', err.message); }
}

function startAutoApplyDailyTasksScheduler() {
  if (intervalHandle) return;
  checkDailyTasks();
  intervalHandle = setInterval(checkDailyTasks, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
  console.log('[auto-apply-daily-tasks] Scheduler started — checking every 5 minutes for the midnight and 6pm AEST boundaries.');
}

function stopAutoApplyDailyTasksScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startAutoApplyDailyTasksScheduler,
  stopAutoApplyDailyTasksScheduler,
  performDailyReset,
  sendDailySummaries,
  countAutoAppliedToday,
};
