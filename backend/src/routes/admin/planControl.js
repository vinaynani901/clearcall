// Admin "Plan Control" portal backend — the six sections from the spec:
// 1. Plan Feature Editor  2. (Company overrides live under Companies, see
// routes/admin/companies.js)  3. Bulk Plan Actions  4. Pilot Program
// Manager  5. Feature Change History  6. Live Plan Dashboard.
const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');
const { PLAN_PRICES, PLAN_LABELS, PLANS, JOBSEEKER_PLAN_PRICES, JOBSEEKER_PLAN_LABELS, JOBSEEKER_PLANS } = require('../../utils/plans');
const {
  FEATURES_EMPLOYER, FEATURES_JOBSEEKER, FEATURES_GLOBAL_BILLING, GLOBAL_BILLING_PLAN_KEY,
  getPlanLimitsForPlan, setPlanLimit, getUsageSummary, getTeamMemberCount, syncExtraMemberCharge, getFeatureValue,
} = require('../../services/featureFlags');
const {
  sendPlanUpgradeConfirmationEmail, sendPilotWelcomeEmail, sendPilotEndedEmail, sendAdminMessageEmail,
} = require('../../services/resend');

const router = express.Router();

const EMPLOYER_PLAN_KEYS = PLANS.map((p) => `employer_${p}`);
const JOBSEEKER_PLAN_KEYS = JOBSEEKER_PLANS.map((p) => `jobseeker_${p}`);
// GLOBAL_BILLING_PLAN_KEY ('global_billing') is included here so the same
// generic GET/PUT /limits machinery below can read+write extra_member_price
// (the one usage-based setting that isn't per-plan — see planFeatures.js)
// without any special-cased route.
const ALL_PLAN_KEYS = [...EMPLOYER_PLAN_KEYS, ...JOBSEEKER_PLAN_KEYS, GLOBAL_BILLING_PLAN_KEY];

function planBareValue(planKey) {
  return planKey.split('_')[1]; // 'employer_starter' -> 'starter'
}

function serializeValue(v) {
  return v === Infinity ? 'unlimited' : v;
}

// --- Section 1: Plan Feature Editor --------------------------------------

// GET /api/admin/plan-control/limits — every plan's current values, plus
// the feature metadata (label/description/type) needed to render the six
// tabs and their rows. One call powers the whole editor.
router.get('/limits', (req, res) => {
  const plans = {};
  for (const key of ALL_PLAN_KEYS) {
    const raw = getPlanLimitsForPlan(key);
    const out = {};
    for (const [f, v] of Object.entries(raw)) out[f] = serializeValue(v);
    plans[key] = out;
  }
  const planLabels = {
    jobseeker_free: 'Free (Job Seeker)',
    [GLOBAL_BILLING_PLAN_KEY]: 'Global Billing Settings',
  };
  for (const p of PLANS) planLabels[`employer_${p}`] = p === 'free' ? 'Free (Employer)' : PLAN_LABELS[p];
  for (const p of JOBSEEKER_PLANS) { if (p !== 'free') planLabels[`jobseeker_${p}`] = JOBSEEKER_PLAN_LABELS[p]; }

  res.json({
    plans,
    featuresEmployer: FEATURES_EMPLOYER,
    featuresJobseeker: FEATURES_JOBSEEKER,
    featuresGlobalBilling: FEATURES_GLOBAL_BILLING,
    globalBillingPlanKey: GLOBAL_BILLING_PLAN_KEY,
    planLabels,
  });
});

// PUT /api/admin/plan-control/limits/:planKey — body: { changes: { featureName: value } }.
// Applies immediately — every request that resolves this plan's features
// afterwards reads straight from plan_limits, no restart/redeploy needed.
router.put('/limits/:planKey', (req, res) => {
  const { planKey } = req.params;
  if (!ALL_PLAN_KEYS.includes(planKey)) return res.status(400).json({ error: 'Unknown plan' });
  const { changes } = req.body;
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'changes object is required' });

  for (const [featureName, value] of Object.entries(changes)) {
    setPlanLimit(planKey, featureName, value, req.admin.email);
  }
  const raw = getPlanLimitsForPlan(planKey);
  const out = {};
  for (const [f, v] of Object.entries(raw)) out[f] = serializeValue(v);
  res.json({ plan: planKey, limits: out });
});

// --- Section 3: Bulk Plan Actions ----------------------------------------

const BULK_PLAN_ACTIONS = {
  plan_free: 'free', plan_starter: 'starter', plan_growth: 'growth', plan_enterprise: 'enterprise', plan_enterprise_plus: 'enterprise_plus',
};

// POST /api/admin/plan-control/bulk — body: { companyIds: [...], action, months }
// action one of: plan_free | plan_starter | plan_growth | plan_enterprise | plan_enterprise_plus |
// pilot_enable | pilot_disable | reset_usage | send_expiry_reminder |
// increase_member_limit | reset_member_limit
router.post('/bulk', async (req, res) => {
  const { companyIds, action, months } = req.body;
  if (!Array.isArray(companyIds) || companyIds.length === 0) return res.status(400).json({ error: 'companyIds is required' });

  const results = { succeeded: 0, failed: 0, errors: [] };

  for (const companyId of companyIds) {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!company) { results.failed += 1; results.errors.push(`${companyId}: not found`); continue; }

    try {
      if (BULK_PLAN_ACTIONS[action]) {
        const newPlan = BULK_PLAN_ACTIONS[action];
        db.prepare('UPDATE companies SET plan = ? WHERE id = ?').run(newPlan, company.id);
        db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, newPlan);
        if (newPlan !== 'free' && company.work_email) {
          const unlocks = Object.entries(getPlanLimitsForPlan(`employer_${newPlan}`))
            .filter(([, v]) => v === true)
            .map(([k]) => FEATURES_EMPLOYER.find((f) => f.key === k)?.label || k);
          sendPlanUpgradeConfirmationEmail(company.work_email, {
            name: company.contact_name, planLabel: PLAN_LABELS[newPlan], price: PLAN_PRICES[newPlan],
            unlocks, billingDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'),
          }).catch((err) => console.error('[planControl] upgrade email failed:', err.message));
        }
      } else if (action === 'pilot_enable') {
        const weeks = Number(months) > 0 ? Number(months) * 4 : 4; // `months` field doubles as weeks-input from the UI when pilot is chosen inline
        const start = new Date();
        const end = new Date(start.getTime() + weeks * 7 * 86400000);
        db.prepare(`UPDATE companies SET is_pilot = 1, pilot_start_date = ?, pilot_end_date = ? WHERE id = ?`)
          .run(start.toISOString(), end.toISOString(), company.id);
        db.prepare(`
          INSERT INTO pilot_programs (id, company_id, plan_granted, start_date, end_date, activated_by_admin_id, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(newId('pilot'), company.id, company.plan === 'free' ? 'growth' : company.plan, start.toISOString(), end.toISOString(), req.admin.email);
      } else if (action === 'pilot_disable') {
        db.prepare('UPDATE companies SET is_pilot = 0 WHERE id = ?').run(company.id);
        db.prepare("UPDATE pilot_programs SET status = 'expired' WHERE company_id = ? AND status = 'active'").run(company.id);
      } else if (action === 'reset_usage') {
        const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        db.prepare(`
          UPDATE usage_tracking SET verified_calls_count = 0, campaigns_count = 0, candidates_uploaded_count = 0, job_postings_count = 0,
            overage_calls_count = 0, overage_charge = 0,
            warning_email_sent_at = NULL, limit_email_sent_at = NULL, updated_at = datetime('now')
          WHERE entity_id = ? AND entity_type = 'company' AND month = ?
        `).run(company.id, month);
        // Extra-member charge isn't part of the monthly counter reset (team
        // size didn't change) — recomputed here just to keep the row
        // consistent immediately after the other counters are zeroed.
        syncExtraMemberCharge(company.id);
      } else if (action === 'increase_member_limit') {
        // Per-company override on top of whatever the plan currently
        // grants (including any prior override) — a raw upsert against
        // company_feature_overrides directly, since this fires once per
        // company in the bulk loop rather than through the single-company
        // admin UI.
        const currentLimit = getFeatureValue('company', company.id, 'team_members_limit');
        const base = typeof currentLimit === 'number' ? currentLimit : 0;
        const newLimit = base + 5;
        db.prepare(`
          INSERT INTO company_feature_overrides (id, company_id, feature_name, override_value, set_by_admin_id)
          VALUES (?, ?, 'team_members_limit', ?, ?)
          ON CONFLICT(company_id, feature_name) DO UPDATE SET override_value = excluded.override_value, set_by_admin_id = excluded.set_by_admin_id, set_at = datetime('now')
        `).run(newId('override'), company.id, String(newLimit), req.admin.email);
        syncExtraMemberCharge(company.id);
      } else if (action === 'reset_member_limit') {
        db.prepare("DELETE FROM company_feature_overrides WHERE company_id = ? AND feature_name = 'team_members_limit'").run(company.id);
        syncExtraMemberCharge(company.id);
      } else if (action === 'send_expiry_reminder') {
        if (company.work_email) {
          await sendAdminMessageEmail(
            company.work_email,
            'Your ClearCall plan is coming up for renewal',
            `Hi ${company.contact_name || 'there'}, this is a reminder that your ${PLAN_LABELS[company.plan] || company.plan} plan subscription is coming up for renewal. Visit ClearCall and go to Settings to review your plan.`
          );
        }
      } else {
        results.failed += 1; results.errors.push(`${companyId}: unknown action`); continue;
      }
      results.succeeded += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push(`${companyId}: ${err.message}`);
    }
  }

  res.json(results);
});

// --- Section 4: Pilot Program Manager -------------------------------------

function pilotWithStats(p) {
  const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(p.company_id);
  const daysRemaining = Math.max(0, Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000));
  const usage = company ? getUsageSummary('company', company.id) : [];
  return {
    id: p.id, companyId: p.company_id, companyName: company ? company.name : 'Unknown company',
    planGranted: p.plan_granted, startDate: p.start_date, endDate: p.end_date,
    daysRemaining, status: p.status, usage,
  };
}

// GET /api/admin/plan-control/pilots — all pilots (active by default).
router.get('/pilots', (req, res) => {
  const status = req.query.status || 'active';
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM pilot_programs ORDER BY start_date DESC').all()
    : db.prepare('SELECT * FROM pilot_programs WHERE status = ? ORDER BY start_date DESC').all(status);
  res.json({ pilots: rows.map(pilotWithStats) });
});

// POST /api/admin/plan-control/pilots — start a new pilot.
// body: { companyId, plan, weeks }
router.post('/pilots', (req, res) => {
  const { companyId, plan, weeks } = req.body;
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!['starter', 'growth', 'enterprise'].includes(plan)) return res.status(400).json({ error: 'plan must be starter, growth, or enterprise' });
  const w = Number(weeks) > 0 ? Number(weeks) : 4;

  const start = new Date();
  const end = new Date(start.getTime() + w * 7 * 86400000);
  const id = newId('pilot');

  db.prepare(`
    INSERT INTO pilot_programs (id, company_id, plan_granted, start_date, end_date, activated_by_admin_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(id, company.id, plan, start.toISOString(), end.toISOString(), req.admin.email);

  db.prepare(`UPDATE companies SET plan = ?, is_pilot = 1, pilot_start_date = ?, pilot_end_date = ? WHERE id = ?`)
    .run(plan, start.toISOString(), end.toISOString(), company.id);
  db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, plan);

  if (company.work_email) {
    sendPilotWelcomeEmail(company.work_email, {
      companyName: company.name, planLabel: PLAN_LABELS[plan] || plan, endDate: end.toLocaleDateString('en-AU'),
    }).catch((err) => console.error('[planControl] pilot welcome email failed:', err.message));
  }

  res.status(201).json({ pilot: pilotWithStats(db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(id)) });
});

// PUT /api/admin/plan-control/pilots/:id/extend — body: { weeks }
router.put('/pilots/:id/extend', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(req.params.id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });
  const weeks = Number(req.body.weeks) > 0 ? Number(req.body.weeks) : 4;
  const newEnd = new Date(new Date(pilot.end_date).getTime() + weeks * 7 * 86400000);

  db.prepare('UPDATE pilot_programs SET end_date = ?, seven_day_reminder_sent_at = NULL WHERE id = ?').run(newEnd.toISOString(), pilot.id);
  db.prepare('UPDATE companies SET pilot_end_date = ? WHERE id = ?').run(newEnd.toISOString(), pilot.company_id);

  res.json({ pilot: pilotWithStats(db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(pilot.id)) });
});

// PUT /api/admin/plan-control/pilots/:id/end — ends now, drops to free, sends the thank-you email.
router.put('/pilots/:id/end', async (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(req.params.id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(pilot.company_id);

  db.prepare("UPDATE pilot_programs SET status = 'expired' WHERE id = ?").run(pilot.id);
  if (company) {
    db.prepare("UPDATE companies SET plan = 'free', is_pilot = 0 WHERE id = ?").run(company.id);
    db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, 'free');
    if (company.work_email) {
      const pricingUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/pricing`;
      try { await sendPilotEndedEmail(company.work_email, { companyName: company.name, pricingUrl }); }
      catch (err) { console.error('[planControl] pilot ended email failed:', err.message); }
    }
  }

  res.json({ pilot: pilotWithStats(db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(pilot.id)) });
});

// PUT /api/admin/plan-control/pilots/:id/convert — body: { plan } — keeps
// the plan they were piloting (or a different one) as a real paid plan.
router.put('/pilots/:id/convert', (req, res) => {
  const pilot = db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(req.params.id);
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });
  const plan = req.body.plan || pilot.plan_granted;
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(pilot.company_id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  db.prepare("UPDATE pilot_programs SET status = 'converted' WHERE id = ?").run(pilot.id);
  db.prepare("UPDATE companies SET plan = ?, is_pilot = 0 WHERE id = ?").run(plan, company.id);
  db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, plan);

  if (company.work_email) {
    const unlocks = Object.entries(getPlanLimitsForPlan(`employer_${plan}`)).filter(([, v]) => v === true).map(([k]) => FEATURES_EMPLOYER.find((f) => f.key === k)?.label || k);
    sendPlanUpgradeConfirmationEmail(company.work_email, {
      name: company.contact_name, planLabel: PLAN_LABELS[plan] || plan, price: PLAN_PRICES[plan] || 0,
      unlocks, billingDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'),
    }).catch((err) => console.error('[planControl] convert email failed:', err.message));
  }

  res.json({ pilot: pilotWithStats(db.prepare('SELECT * FROM pilot_programs WHERE id = ?').get(pilot.id)) });
});

// --- Section 5: Feature Change History ------------------------------------

// GET /api/admin/plan-control/change-log — insert-only audit trail, most recent first.
router.get('/change-log', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db.prepare('SELECT * FROM plan_change_log ORDER BY changed_at DESC LIMIT ?').all(limit);
  res.json({ changes: rows });
});

// --- Section 6: Live Plan Dashboard ---------------------------------------

// GET /api/admin/plan-control/summary
router.get('/summary', (req, res) => {
  const employerCounts = db.prepare('SELECT plan, COUNT(*) as n FROM companies GROUP BY plan').all();
  const jobseekerCounts = db.prepare("SELECT plan, COUNT(*) as n FROM users WHERE role = 'jobseeker' GROUP BY plan").all();
  const pilotCount = db.prepare("SELECT COUNT(*) as n FROM pilot_programs WHERE status = 'active'").get().n;

  // Average team size per plan — mean of getTeamMemberCount() (active
  // company_members) across every company currently on that plan. A plan
  // with zero companies reports null rather than 0/0, so the frontend can
  // show "—" instead of a misleading zero.
  const employerPlans = PLANS.map((plan) => {
    const companiesOnPlan = db.prepare('SELECT id FROM companies WHERE plan = ?').all(plan);
    const avgTeamSize = companiesOnPlan.length > 0
      ? Math.round((companiesOnPlan.reduce((sum, c) => sum + getTeamMemberCount(c.id), 0) / companiesOnPlan.length) * 10) / 10
      : null;
    return { plan, label: PLAN_LABELS[plan], count: employerCounts.find((c) => c.plan === plan)?.n || 0, avgTeamSize };
  });
  const jobseekerPlans = JOBSEEKER_PLANS.map((plan) => ({
    plan, label: JOBSEEKER_PLAN_LABELS[plan], count: jobseekerCounts.find((c) => c.plan === plan)?.n || 0,
  }));

  // MRR: current plan distribution snapshot, excluding companies presently
  // on a free pilot (they're not paying) — a richer historical MRR replay
  // already exists in the Revenue portal; this is a live "as of now" figure.
  // Enterprise Plus has no fixed price (PLAN_PRICES.enterprise_plus is
  // null) — `|| 0` means custom-quote companies simply don't contribute a
  // number here rather than throwing or showing NaN, since their real
  // price isn't tracked anywhere yet.
  const payingCompanies = db.prepare('SELECT plan FROM companies WHERE is_pilot = 0').all();
  const employerMrr = payingCompanies.reduce((sum, c) => sum + (PLAN_PRICES[c.plan] || 0), 0);
  const payingJobseekers = db.prepare("SELECT plan FROM users WHERE role = 'jobseeker'").all();
  const jobseekerMrr = payingJobseekers.reduce((sum, u) => sum + (JOBSEEKER_PLAN_PRICES[u.plan] || 0), 0);

  // Approaching-limit count: companies with any metered feature at >=80%
  // this month. Enterprise now has real (large) caps with overage billing
  // rather than being unlimited, so it's included here too — only
  // Enterprise Plus (truly unlimited on every metric) is excluded.
  const allCompanies = db.prepare("SELECT id FROM companies WHERE plan != 'enterprise_plus'").all();
  let approachingLimitCount = 0;
  for (const c of allCompanies) {
    const usage = getUsageSummary('company', c.id);
    if (usage.some((u) => u.warning || u.atLimit)) approachingLimitCount += 1;
  }

  res.json({
    employerPlans, jobseekerPlans, pilotCount, approachingLimitCount,
    mrr: Math.round((employerMrr + jobseekerMrr) * 100) / 100,
    employerMrr: Math.round(employerMrr * 100) / 100,
    jobseekerMrr: Math.round(jobseekerMrr * 100) / 100,
  });
});

module.exports = router;
