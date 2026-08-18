const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { PLAN_PRICES, PLAN_LABELS, PLANS, JOBSEEKER_PLAN_PRICES, JOBSEEKER_PLAN_LABELS, JOBSEEKER_PLANS } = require('../utils/plans');
const {
  getCompanyIdForUser, getPlanLimitsForPlan, getUsageSummary, getBillingSummary,
  planKeyFor,
} = require('../services/featureFlags');

const router = express.Router();
router.use(authMiddleware);

function serializeLimits(limits) {
  const out = {};
  for (const [k, v] of Object.entries(limits)) out[k] = v === Infinity ? 'unlimited' : v;
  return out;
}

// GET /api/plans/employer — public-to-any-signed-in-user catalog, used by
// the employer Pricing page. Marks isCurrent against the caller's own
// company plan when the caller is an employer.
router.get('/employer', (req, res) => {
  const companyId = req.user.role === 'employer' ? getCompanyIdForUser(req.user.id) : null;
  const company = companyId ? db.prepare('SELECT plan FROM companies WHERE id = ?').get(companyId) : null;

  const plans = PLANS.map((planName) => ({
    key: planName,
    label: PLAN_LABELS[planName],
    price: PLAN_PRICES[planName],
    limits: serializeLimits(getPlanLimitsForPlan(planKeyFor('company', planName))),
    isCurrent: company ? company.plan === planName : false,
  }));
  res.json({ plans, currentPlan: company ? company.plan : null });
});

// GET /api/plans/jobseeker — same idea for the job seeker Pricing page.
router.get('/jobseeker', (req, res) => {
  const currentPlan = req.user.role === 'jobseeker' ? req.user.plan : null;
  const plans = JOBSEEKER_PLANS.map((planName) => ({
    key: planName,
    label: JOBSEEKER_PLAN_LABELS[planName],
    price: JOBSEEKER_PLAN_PRICES[planName],
    limits: serializeLimits(getPlanLimitsForPlan(planKeyFor('user', planName))),
    isCurrent: currentPlan === planName,
  }));
  res.json({ plans, currentPlan });
});

// GET /api/plans/my — the caller's own resolved plan, limits, and current
// usage/counts. Powers the sidebar lock icons, Settings plan badge, and the
// employer dashboard usage card all from one call.
router.get('/my', (req, res) => {
  if (req.user.role === 'employer') {
    const companyId = getCompanyIdForUser(req.user.id);
    if (!companyId) return res.status(404).json({ error: 'No company profile found for this user' });
    const company = db.prepare('SELECT plan, pending_plan, is_pilot, pilot_end_date FROM companies WHERE id = ?').get(companyId);
    const limits = serializeLimits(getPlanLimitsForPlan(planKeyFor('company', company.plan)));
    res.json({
      entityType: 'company',
      plan: company.plan,
      planLabel: PLAN_LABELS[company.plan] || company.plan,
      price: PLAN_PRICES[company.plan] ?? null,
      pendingPlan: company.pending_plan,
      limits,
      usage: getUsageSummary('company', companyId),
      billing: getBillingSummary(companyId),
      isPilot: !!company.is_pilot,
      pilotEndDate: company.pilot_end_date || null,
    });
    return;
  }

  if (req.user.role === 'jobseeker') {
    const plan = req.user.plan || 'free';
    const limits = serializeLimits(getPlanLimitsForPlan(planKeyFor('user', plan)));
    const applications = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ?').get(req.user.id).n;
    const resumesBuilt = db.prepare('SELECT COUNT(*) as n FROM resumes WHERE user_id = ?').get(req.user.id).n;
    const hasUploadedResume = db.prepare('SELECT resume_path FROM users WHERE id = ?').get(req.user.id).resume_path ? 1 : 0;
    const agentConnections = db.prepare('SELECT COUNT(*) as n FROM agent_clients WHERE jobseeker_user_id = ?').get(req.user.id).n;
    const accessKeys = db.prepare("SELECT COUNT(*) as n FROM agent_access_keys WHERE jobseeker_user_id = ? AND revoked_at IS NULL").get(req.user.id).n;

    // "Next billing date" is genuinely derived, not invented: 30 days after
    // the most recent recorded change to this exact plan (plan_change_log,
    // written whenever an admin moves a job seeker onto Premium — see
    // routes/admin/jobseekers.js PUT /:id/plan). No real Stripe billing
    // cycle exists yet, so if there's no such record (e.g. the plan was
    // seeded/edited directly), nextBillingDate is honestly null rather than
    // a made-up date.
    let nextBillingDate = null;
    if (plan === 'premium' || plan === 'premium_plus') {
      const lastChange = db.prepare(`
        SELECT changed_at FROM plan_change_log
        WHERE entity_id = ? AND entity_type = 'user' AND feature_name = 'plan' AND new_value = ?
        ORDER BY changed_at DESC LIMIT 1
      `).get(req.user.id, plan);
      if (lastChange) {
        nextBillingDate = new Date(new Date(lastChange.changed_at.replace(' ', 'T')).getTime() + 30 * 86400000).toISOString();
      }
    }

    res.json({
      entityType: 'user',
      plan,
      planLabel: JOBSEEKER_PLAN_LABELS[plan] || plan,
      price: JOBSEEKER_PLAN_PRICES[plan] ?? null,
      pendingPlan: req.user.pending_plan || null,
      limits,
      nextBillingDate,
      counts: {
        applications,
        resumes: resumesBuilt + hasUploadedResume,
        agentConnections,
        accessKeys,
      },
    });
    return;
  }

  res.status(400).json({ error: 'Plan info is only available for employer and job seeker accounts' });
});

// POST /api/plans/select — records upgrade *intent* (no real payment
// processor yet). Does not change the active plan — see Stage 4: the
// Proceed to Payment button shows a "coming soon" message, and this is what
// makes that honest — activation will read pending_plan once Stripe exists.
router.post('/select', (req, res) => {
  const { plan } = req.body;

  if (req.user.role === 'employer') {
    if (!PLANS.includes(plan)) return res.status(400).json({ error: 'Unknown plan' });
    const companyId = getCompanyIdForUser(req.user.id);
    if (!companyId) return res.status(404).json({ error: 'No company profile found for this user' });
    db.prepare('UPDATE companies SET pending_plan = ? WHERE id = ?').run(plan, companyId);
    res.json({ message: `We've noted your interest in the ${plan} plan.`, pendingPlan: plan });
    return;
  }

  if (req.user.role === 'jobseeker') {
    if (!JOBSEEKER_PLANS.includes(plan)) return res.status(400).json({ error: 'Unknown plan' });
    db.prepare('UPDATE users SET pending_plan = ? WHERE id = ?').run(plan, req.user.id);
    res.json({ message: `We've noted your interest in the ${plan} plan.`, pendingPlan: plan });
    return;
  }

  res.status(400).json({ error: 'Plan selection is only available for employer and job seeker accounts' });
});

module.exports = router;
