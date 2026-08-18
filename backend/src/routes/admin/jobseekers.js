const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');
const { sendAdminMessageEmail, sendPlanUpgradeConfirmationEmail } = require('../../services/resend');
const { JOBSEEKER_PLANS, JOBSEEKER_PLAN_LABELS, JOBSEEKER_PLAN_PRICES } = require('../../utils/plans');
const { getPlanLimitsForPlan, logPlanChange, FEATURES_JOBSEEKER } = require('../../services/featureFlags');

const router = express.Router();

// GET /api/admin/jobseekers
router.get('/', (req, res) => {
  const jobseekers = db.prepare("SELECT * FROM users WHERE role = 'jobseeker' ORDER BY created_at DESC").all();
  const withComputed = jobseekers.map((u) => {
    // Matches by receiver_user_id (set at call-initiation time) with a
    // phone fallback for any rows created before that column existed.
    const callsReceived = db.prepare(`
      SELECT COUNT(*) as n FROM calls WHERE receiver_user_id = ? OR receiver_phone = ?
    `).get(u.id, u.phone).n;
    const applicationsTracked = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ?').get(u.id).n;
    const agentConnections = db.prepare('SELECT COUNT(*) as n FROM agent_clients WHERE jobseeker_user_id = ?').get(u.id).n;
    const { password_hash, gmail_access_token, gmail_refresh_token, ...safe } = u;
    return { ...safe, callsReceived, applicationsTracked, agentConnections };
  });
  res.json({ jobseekers: withComputed });
});

// GET /api/admin/jobseekers/:id — full profile for the admin "View Profile"
// panel. Strips password_hash and gmail OAuth tokens, neither of which
// should ever leave the server.
router.get('/:id', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  const { password_hash, gmail_access_token, gmail_refresh_token, ...safe } = user;

  const applicationsTracked = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ?').get(user.id).n;
  const callsReceived = db.prepare('SELECT COUNT(*) as n FROM calls WHERE receiver_user_id = ? OR receiver_phone = ?').get(user.id, user.phone).n;
  const agent = db.prepare(`
    SELECT a.agency_name, u.full_name FROM agent_clients ac
    JOIN agents a ON a.user_id = ac.agent_user_id
    JOIN users u ON u.id = a.user_id
    WHERE ac.jobseeker_user_id = ?
  `).get(user.id);

  res.json({ jobseeker: { ...safe, applicationsTracked, callsReceived, agent: agent || null } });
});

// GET /api/admin/jobseekers/:id/calls — matches by receiver_user_id (the
// real link, set at call-initiation time) with a phone fallback for any
// older rows created before that column existed.
router.get('/:id/calls', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  const calls = db.prepare(`
    SELECT calls.*, companies.name as company_name FROM calls
    LEFT JOIN companies ON companies.id = calls.company_id
    WHERE calls.receiver_user_id = ? OR calls.receiver_phone = ?
    ORDER BY calls.created_at DESC
  `).all(user.id, user.phone);
  res.json({ calls });
});

// POST /api/admin/jobseekers/:id/message
router.post('/:id/message', async (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  try {
    await sendAdminMessageEmail(user.email, subject, message);
  } catch (err) {
    return res.status(502).json({ error: `Could not send email: ${err.message}` });
  }

  const id = newId('adminmsg');
  db.prepare(`
    INSERT INTO admin_messages (id, target_type, target_id, subject, message) VALUES (?, 'jobseeker', ?, ?, ?)
  `).run(id, user.id, subject, message);

  res.json({ success: true });
});

// PUT /api/admin/jobseekers/:id/suspend — job seeker accounts don't have a
// suspension column yet (only companies do); add one lazily on first use
// rather than a schema migration nobody may ever need.
function ensureSuspendedColumn() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('suspended')) {
    db.exec('ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0');
  }
}

router.put('/:id/suspend', (req, res) => {
  ensureSuspendedColumn();
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(user.id);
  res.json({ success: true });
});

router.put('/:id/unsuspend', (req, res) => {
  ensureSuspendedColumn();
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(user.id);
  res.json({ success: true });
});

// PUT /api/admin/jobseekers/:id/plan — moves a job seeker onto Free or
// Premium. Logged to plan_change_log (entity_type='user', feature_name=
// 'plan') so GET /api/plans/my can honestly derive a "next billing date"
// from a real record rather than inventing one.
router.put('/:id/plan', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  const { plan } = req.body;
  if (!JOBSEEKER_PLANS.includes(plan)) return res.status(400).json({ error: `Plan must be one of: ${JOBSEEKER_PLANS.join(', ')}` });

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, user.id);
  logPlanChange({ entityId: user.id, entityType: 'user', featureName: 'plan', oldValue: user.plan, newValue: plan, changedByAdminId: req.admin.email });

  if (plan !== 'free' && user.plan !== plan && user.email) {
    const unlocks = Object.entries(getPlanLimitsForPlan(`jobseeker_${plan}`))
      .filter(([, v]) => v === true)
      .map(([k]) => FEATURES_JOBSEEKER.find((f) => f.key === k)?.label || k);
    sendPlanUpgradeConfirmationEmail(user.email, {
      name: user.full_name, planLabel: JOBSEEKER_PLAN_LABELS[plan], price: JOBSEEKER_PLAN_PRICES[plan],
      unlocks, billingDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'),
    }).catch((err) => console.error('[jobseekers] upgrade confirmation email failed:', err.message));
  }

  const updated = db.prepare('SELECT id, plan FROM users WHERE id = ?').get(user.id);
  res.json({ jobseeker: updated });
});

// DELETE /api/admin/jobseekers/:id
router.delete('/:id', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM call_display_settings WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    // This job seeker has submitted scam reports (or similar) that are
    // kept for audit purposes and reference them by ID, so the row can't
    // be hard-deleted without losing that trail.
    res.status(409).json({ error: 'This job seeker has report or activity history that must be preserved and cannot be deleted. Suspend the account instead.' });
  }
});

module.exports = router;
