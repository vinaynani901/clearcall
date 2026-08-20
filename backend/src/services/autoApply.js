const { matchJob } = require('../utils/jobMatcher');

function getDb() {
  return require('../database').getDb();
}

function getDailySlots(userId, plan) {
  return plan === 'premium_plus' ? 25 : 10;
}

function getSlotsUsedToday(db, userId) {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare('SELECT slots_used FROM auto_apply_daily_usage WHERE user_id = ? AND date = ?').get(userId, today);
  return row ? row.slots_used : 0;
}

function incrementSlots(db, userId) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO auto_apply_daily_usage (user_id, date, slots_used) VALUES (?, ?, 1) ON CONFLICT(user_id, date) DO UPDATE SET slots_used = slots_used + 1').run(userId, today);
}

async function runAutoApply() {
  const db = getDb();
  const seekers = db.prepare('SELECT u.id, u.plan FROM users u JOIN auto_apply_preferences p ON p.user_id = u.id WHERE u.role = ? AND p.is_active = 1 AND u.plan IN (?, ?)').all('jobseeker', 'premium', 'premium_plus');
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const jobs = db.prepare('SELECT * FROM jobs WHERE created_at >= ? AND status = ?').all(thirtyMinsAgo, 'active');

  for (const seeker of seekers) {
    const slotsAllowed = getDailySlots(seeker.id, seeker.plan);
    const slotsUsed = getSlotsUsedToday(db, seeker.id);
    if (slotsUsed >= slotsAllowed) continue;

    const prefs = db.prepare('SELECT * FROM auto_apply_preferences WHERE user_id = ?').get(seeker.id);

    for (const job of jobs) {
      if (slotsUsed >= slotsAllowed) break;
      const score = matchJob(job, prefs);
      if (score < 60) continue;
      const already = db.prepare('SELECT id FROM job_applications WHERE user_id = ? AND job_id = ?').get(seeker.id, job.id);
      if (already) continue;
      db.prepare('INSERT INTO job_applications (user_id, job_id, company, role, source, match_score, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(seeker.id, job.id, job.company, job.title, 'auto_apply', score, 'applied', new Date().toISOString());
      incrementSlots(db, seeker.id);
    }
  }

  console.log('Auto apply run complete');
}

module.exports = { runAutoApply };