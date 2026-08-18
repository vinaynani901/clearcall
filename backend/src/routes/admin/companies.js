const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');
const { sendAdminMessageEmail, sendPlanUpgradeConfirmationEmail } = require('../../services/resend');
const { PLANS, PLAN_PRICES, PLAN_LABELS } = require('../../utils/plans');
const {
  FEATURES_EMPLOYER, getPlanLimitsForPlan, hasOverride, setCompanyOverride, clearCompanyOverride, syncExtraMemberCharge,
} = require('../../services/featureFlags');

const router = express.Router();

// hasCustomRate / hasCustomLimit power the "Custom Rate" / "Custom Limit"
// badges on the Companies portal list (Part 8) — both are just existing
// company_feature_overrides rows, reusing the same override mechanism
// every other per-company feature override already goes through (no new
// table). "Custom Limit" covers either a custom member limit or a custom
// usage cap, since both are the same kind of "this company's cap differs
// from its plan default" override.
function withComputed(company) {
  const callsThisMonth = db.prepare(`
    SELECT COUNT(*) as n FROM calls WHERE company_id = ? AND created_at >= date('now', 'start of month')
  `).get(company.id).n;
  const hasCustomRate = hasOverride(company.id, 'extra_call_price');
  const hasCustomLimit = hasOverride(company.id, 'team_members_limit') || hasOverride(company.id, 'usage_cap');
  return { ...company, callsThisMonth, hasCustomRate, hasCustomLimit };
}

// GET /api/admin/companies — full list. Filtering by tab/search/sort is
// cheap enough at this scale to just do client-side over the full list, so
// this returns everything with a couple of useful computed fields attached.
router.get('/', (req, res) => {
  const companies = db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all();
  res.json({ companies: companies.map(withComputed) });
});

// GET /api/admin/companies/pilots — companies currently on a free pilot.
router.get('/pilots', (req, res) => {
  const pilots = db.prepare('SELECT * FROM companies WHERE is_pilot = 1 ORDER BY pilot_start_date DESC').all();
  const withStats = pilots.map((c) => {
    const start = c.pilot_start_date || c.created_at;
    const end = c.pilot_end_date || new Date().toISOString();
    const calls = db.prepare(`
      SELECT call_status FROM calls WHERE company_id = ? AND created_at BETWEEN ? AND ?
    `).all(c.id, start, end);
    const callsMade = calls.length;
    const answered = calls.filter((call) => call.call_status === 'answered').length;
    const answerRate = callsMade ? Math.round((answered / callsMade) * 100) : 0;
    return { ...c, callsMade, answerRate };
  });
  res.json({ pilots: withStats });
});

// PUT /api/admin/companies/:id/pilot/start — puts a company on a free
// pilot, recording the manually-entered "before" baseline the eventual
// impact report will compare against.
router.put('/:id/pilot/start', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { startDate, endDate, beforeCallVolume, beforeAnswerRate, beforeNotes } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  const beforeData = JSON.stringify({
    callVolume: beforeCallVolume || 0,
    answerRate: beforeAnswerRate || 0,
    notes: beforeNotes || '',
  });
  db.prepare(`
    UPDATE companies SET is_pilot = 1, pilot_start_date = ?, pilot_end_date = ?, pilot_before_data = ? WHERE id = ?
  `).run(startDate, endDate, beforeData, company.id);
  res.json({ company: db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id) });
});

// GET /api/admin/companies/:id/pilot-report — before/after data for the
// PDF impact report (frontend renders this into a PDF client-side).
router.get('/:id/pilot-report', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!company.is_pilot) return res.status(400).json({ error: 'This company is not on a pilot program' });

  const start = company.pilot_start_date;
  const end = company.pilot_end_date || new Date().toISOString();
  const calls = db.prepare('SELECT call_status, duration_seconds FROM calls WHERE company_id = ? AND created_at BETWEEN ? AND ?').all(company.id, start, end);
  const callVolume = calls.length;
  const answered = calls.filter((c) => c.call_status === 'answered').length;
  const answerRate = callVolume ? Math.round((answered / callVolume) * 100) : 0;
  const outcomeBreakdown = {
    answered,
    declined: calls.filter((c) => c.call_status === 'declined').length,
    missed: calls.filter((c) => c.call_status === 'missed').length,
    initiated: calls.filter((c) => c.call_status === 'initiated').length,
  };

  let before;
  try { before = JSON.parse(company.pilot_before_data || '{}'); } catch { before = {}; }

  res.json({
    company: { name: company.name, industry: company.industry },
    pilotStartDate: start,
    pilotEndDate: end,
    before: { callVolume: before.callVolume || 0, answerRate: before.answerRate || 0, notes: before.notes || '' },
    after: { callVolume, answerRate, outcomeBreakdown },
  });
});

// GET /api/admin/companies/:id — full profile for the side panel.
router.get('/:id', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const recruiters = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.email_verified, u.created_at, wp.is_active
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN work_profiles wp ON wp.user_id = u.id AND wp.company_id = ?
    WHERE cm.company_id = ?
    ORDER BY u.created_at ASC
  `).all(company.id, company.id);

  const totalCalls = db.prepare('SELECT COUNT(*) as n FROM calls WHERE company_id = ?').get(company.id).n;
  const reports = db.prepare('SELECT * FROM reports WHERE reported_company_id = ? ORDER BY created_at DESC').all(company.id);

  res.json({ company: withComputed(company), recruiters, totalCalls, reports });
});

// GET /api/admin/companies/:id/calls
router.get('/:id/calls', (req, res) => {
  const calls = db.prepare('SELECT * FROM calls WHERE company_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ calls });
});

// GET /api/admin/companies/:id/reports
router.get('/:id/reports', (req, res) => {
  const reports = db.prepare('SELECT * FROM reports WHERE reported_company_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ reports });
});

// PUT /api/admin/companies/:id/approve
router.put('/:id/approve', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.prepare(`
    UPDATE companies SET admin_review_status = 'approved', admin_reviewed_at = datetime('now'), rejection_reason = NULL WHERE id = ?
  `).run(company.id);
  res.json({ company: db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id) });
});

// PUT /api/admin/companies/:id/suspend
router.put('/:id/suspend', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.prepare("UPDATE companies SET suspension_status = 1, suspended_at = datetime('now') WHERE id = ?").run(company.id);
  res.json({ company: db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id) });
});

// PUT /api/admin/companies/:id/plan — changes a company's plan and logs it
// to company_plan_history, which is what the Revenue portal replays to
// compute new/churned MRR and the 12-month trend.
router.put('/:id/plan', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { plan } = req.body;
  if (!PLANS.includes(plan)) return res.status(400).json({ error: `Plan must be one of: ${PLANS.join(', ')}` });

  const tx = db.transaction(() => {
    db.prepare('UPDATE companies SET plan = ? WHERE id = ?').run(plan, company.id);
    db.prepare('INSERT INTO company_plan_history (id, company_id, plan) VALUES (?, ?, ?)').run(newId('planhist'), company.id, plan);
  });
  tx();

  // Stage 7: upgrade confirmation email whenever an admin moves a company
  // onto a paid plan (the only way plans actually change today, since
  // there's no live Stripe billing yet).
  if (plan !== 'free' && company.plan !== plan && company.work_email) {
    const unlocks = Object.entries(getPlanLimitsForPlan(`employer_${plan}`))
      .filter(([, v]) => v === true)
      .map(([k]) => FEATURES_EMPLOYER.find((f) => f.key === k)?.label || k);
    sendPlanUpgradeConfirmationEmail(company.work_email, {
      name: company.contact_name, planLabel: PLAN_LABELS[plan], price: PLAN_PRICES[plan],
      unlocks, billingDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'),
    }).catch((err) => console.error('[companies] upgrade confirmation email failed:', err.message));
  }

  res.json({ company: db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id) });
});

// GET /api/admin/companies/:id/feature-overrides — every employer feature
// with its plan default and any active company-specific override, for the
// "Feature Overrides" section on the company profile screen.
router.get('/:id/feature-overrides', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const defaults = getPlanLimitsForPlan(`employer_${company.plan}`);
  const overrideRows = db.prepare('SELECT feature_name, override_value, set_by_admin_id, set_at FROM company_feature_overrides WHERE company_id = ?').all(company.id);
  const overrideMap = Object.fromEntries(overrideRows.map((r) => [r.feature_name, r]));

  const features = FEATURES_EMPLOYER.map((f) => {
    const def = defaults[f.key];
    const override = overrideMap[f.key];
    return {
      key: f.key, label: f.label, description: f.description, type: f.type,
      planDefault: def === Infinity ? 'unlimited' : def,
      override: override ? (override.override_value === 'unlimited' ? 'unlimited' : override.override_value) : null,
      hasOverride: !!override,
      setAt: override ? override.set_at : null,
    };
  });

  res.json({ plan: company.plan, features });
});

// PUT /api/admin/companies/:id/feature-overrides — body: { featureName, value }
router.put('/:id/feature-overrides', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { featureName, value } = req.body;
  if (!featureName || value === undefined) return res.status(400).json({ error: 'featureName and value are required' });
  if (!FEATURES_EMPLOYER.some((f) => f.key === featureName)) return res.status(400).json({ error: 'Unknown feature' });

  setCompanyOverride(company.id, featureName, value, req.admin.email);
  // A custom team_members_limit changes the live extra-member gauge
  // immediately — every other override doesn't affect usage_tracking.
  if (featureName === 'team_members_limit') syncExtraMemberCharge(company.id);
  res.json({ success: true });
});

// DELETE /api/admin/companies/:id/feature-overrides/:featureName — reset to plan default.
router.delete('/:id/feature-overrides/:featureName', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  clearCompanyOverride(company.id, req.params.featureName, req.admin.email);
  if (req.params.featureName === 'team_members_limit') syncExtraMemberCharge(company.id);
  res.json({ success: true });
});

// PUT /api/admin/companies/:id/unsuspend
router.put('/:id/unsuspend', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.prepare('UPDATE companies SET suspension_status = 0 WHERE id = ?').run(company.id);
  res.json({ company: db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id) });
});

// POST /api/admin/companies/:id/message — sends a real email via Resend
// (falls back to a dev-mode console log, same as the OTP email service,
// when RESEND_API_KEY isn't configured) and logs it to admin_messages.
router.post('/:id/message', async (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  try {
    await sendAdminMessageEmail(company.work_email, subject, message);
  } catch (err) {
    return res.status(502).json({ error: `Could not send email: ${err.message}` });
  }

  const id = newId('adminmsg');
  db.prepare(`
    INSERT INTO admin_messages (id, target_type, target_id, subject, message) VALUES (?, 'company', ?, ?, ?)
  `).run(id, company.id, subject, message);

  res.json({ success: true });
});

// DELETE /api/admin/companies/:id — cascades through campaign data owned
// by this company and detaches (rather than deletes) historical calls, so
// call/report history isn't silently destroyed.
router.delete('/:id', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const tx = db.transaction(() => {
    const campaigns = db.prepare('SELECT id FROM campaigns WHERE company_id = ?').all(company.id);
    for (const camp of campaigns) {
      const batches = db.prepare('SELECT id FROM campaign_batches WHERE campaign_id = ?').all(camp.id);
      for (const batch of batches) {
        db.prepare('DELETE FROM campaign_candidates WHERE batch_id = ?').run(batch.id);
      }
      db.prepare('DELETE FROM campaign_batches WHERE campaign_id = ?').run(camp.id);
    }
    db.prepare('DELETE FROM campaigns WHERE company_id = ?').run(company.id);
    db.prepare('DELETE FROM company_members WHERE company_id = ?').run(company.id);
    db.prepare('UPDATE calls SET company_id = NULL WHERE company_id = ?').run(company.id);
    db.prepare('DELETE FROM companies WHERE id = ?').run(company.id);
  });
  tx();

  res.json({ success: true });
});

module.exports = router;
