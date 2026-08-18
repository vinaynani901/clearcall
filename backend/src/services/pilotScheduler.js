// Daily in-process check (same lightweight setInterval pattern as
// services/callbackReminders.js — no new cron dependency) for two pilot
// program events the spec calls out as automatic, not admin-triggered:
//   1. A pilot ending in exactly 7 days gets a one-time reminder email.
//   2. A pilot whose end_date has already passed gets auto-expired: the
//      company drops to the free plan and receives the "pilot ended" email.
const db = require('../db');
const { newId } = require('../utils/ids');
const { sendPilotEndingReminderEmail, sendPilotEndedEmail } = require('./resend');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours is plenty for day-granularity events

async function checkPilots() {
  const active = db.prepare("SELECT * FROM pilot_programs WHERE status = 'active'").all();
  let remindersSent = 0;
  let expired = 0;

  for (const pilot of active) {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(pilot.company_id);
    if (!company) continue;

    const daysRemaining = Math.ceil((new Date(pilot.end_date).getTime() - Date.now()) / 86400000);

    if (daysRemaining <= 7 && daysRemaining > 0 && !pilot.seven_day_reminder_sent_at) {
      try {
        if (company.work_email) {
          const pricingUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/pricing`;
          await sendPilotEndingReminderEmail(company.work_email, {
            companyName: company.name, endDate: new Date(pilot.end_date).toLocaleDateString('en-AU'), pricingUrl,
          });
        }
        db.prepare("UPDATE pilot_programs SET seven_day_reminder_sent_at = datetime('now') WHERE id = ?").run(pilot.id);
        remindersSent += 1;
      } catch (err) {
        console.error(`[pilot-scheduler] 7-day reminder failed for pilot ${pilot.id}:`, err.message);
      }
    }

    if (daysRemaining <= 0) {
      try {
        db.prepare("UPDATE pilot_programs SET status = 'expired' WHERE id = ?").run(pilot.id);
        db.prepare("UPDATE companies SET plan = 'free', is_pilot = 0 WHERE id = ?").run(company.id);
        db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, 'free');
        if (company.work_email) {
          const pricingUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/pricing`;
          await sendPilotEndedEmail(company.work_email, { companyName: company.name, pricingUrl });
        }
        expired += 1;
      } catch (err) {
        console.error(`[pilot-scheduler] Auto-expiry failed for pilot ${pilot.id}:`, err.message);
      }
    }
  }

  return { checked: active.length, remindersSent, expired };
}

let intervalHandle = null;

function startPilotScheduler() {
  if (intervalHandle) return;
  checkPilots().catch((err) => console.error('[pilot-scheduler] Initial check failed:', err.message));
  intervalHandle = setInterval(() => {
    checkPilots().catch((err) => console.error('[pilot-scheduler] Check failed:', err.message));
  }, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
  console.log('[pilot-scheduler] Scheduler started — checking every 6h for pilots ending soon or expired.');
}

function stopPilotScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startPilotScheduler, stopPilotScheduler, checkPilots };
