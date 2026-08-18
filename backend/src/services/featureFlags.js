// Core feature access control resolver. Plan limits are never hardcoded
// here — every numeric/boolean value is read from the plan_limits table
// (seeded with defaults in db/index.js, editable live from the admin Plan
// Control > Plan Feature Editor), with an optional per-company override
// checked first. This is the single place both the API routes and the
// admin portal go through to answer "does this company/job seeker have
// access to X, and how much of it."
const db = require('../db');
const { newId } = require('../utils/ids');
const { FEATURES_EMPLOYER, FEATURES_JOBSEEKER, FEATURES_GLOBAL_BILLING, GLOBAL_BILLING_PLAN_KEY, DEFAULT_PLAN_LIMITS } = require('../utils/planFeatures');
const { sendUsageWarningEmail, sendUsageLimitReachedEmail } = require('./resend');

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// entityType is 'company' (employer) or 'user' (job seeker) throughout this
// module and the usage_tracking table — matches the CHECK constraint.
function planKeyFor(entityType, planColumnValue) {
  return `${entityType === 'company' ? 'employer' : 'jobseeker'}_${planColumnValue || 'free'}`;
}

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'unlimited') return Infinity;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

function getCompanyIdForUser(userId) {
  const row = db.prepare(`
    SELECT c.id FROM companies c JOIN company_members cm ON cm.company_id = c.id WHERE cm.user_id = ? LIMIT 1
  `).get(userId);
  return row ? row.id : null;
}

// Resolves the raw (string) feature value: active company override first,
// then the plan_limits row for the entity's current plan, then falling back
// to the hardcoded DEFAULT_PLAN_LIMITS only if plan_limits somehow has no
// row at all (shouldn't happen once seeded, but keeps this resilient).
function getFeatureRaw(entityType, entityId, featureName) {
  if (entityType === 'company') {
    const override = db.prepare('SELECT override_value FROM company_feature_overrides WHERE company_id = ? AND feature_name = ?').get(entityId, featureName);
    if (override) return override.override_value;
  }

  const table = entityType === 'company' ? 'companies' : 'users';
  const row0 = db.prepare(`SELECT plan FROM ${table} WHERE id = ?`).get(entityId);
  const planKey = planKeyFor(entityType, row0 && row0.plan);

  const row = db.prepare('SELECT feature_value FROM plan_limits WHERE plan_name = ? AND feature_name = ?').get(planKey, featureName);
  if (row) return row.feature_value;

  const fallback = DEFAULT_PLAN_LIMITS[planKey] && DEFAULT_PLAN_LIMITS[planKey][featureName];
  return fallback === undefined ? null : String(fallback);
}

function getFeatureValue(entityType, entityId, featureName) {
  return parseValue(getFeatureRaw(entityType, entityId, featureName));
}

// Whether a company/override actually has an active override on this
// feature (used by the admin UI to show a highlighted indicator).
function hasOverride(companyId, featureName) {
  return !!db.prepare('SELECT 1 FROM company_feature_overrides WHERE company_id = ? AND feature_name = ?').get(companyId, featureName);
}

// Boolean-style gate — true if the feature is enabled/unlimited/non-zero.
function hasFeature(entityType, entityId, featureName) {
  const v = getFeatureValue(entityType, entityId, featureName);
  if (typeof v === 'boolean') return v;
  if (v === Infinity) return true;
  if (typeof v === 'number') return v > 0;
  return !!v;
}

// --- Usage tracking ---------------------------------------------------

function getUsageRow(entityType, entityId, month = currentMonth()) {
  const row = db.prepare('SELECT * FROM usage_tracking WHERE entity_id = ? AND entity_type = ? AND month = ?').get(entityId, entityType, month);
  return row || {
    entity_id: entityId, entity_type: entityType, month,
    verified_calls_count: 0, campaigns_count: 0, candidates_uploaded_count: 0, job_postings_count: 0,
  };
}

const USAGE_COUNTERS = ['verified_calls_count', 'campaigns_count', 'candidates_uploaded_count', 'job_postings_count'];

// Increments a monthly counter for the current calendar month — a new month
// simply has no row yet, so the "reset to zero at the start of each month"
// requirement falls out naturally with no separate cron job needed.
function incrementUsage(entityType, entityId, counterKey, by = 1) {
  if (!USAGE_COUNTERS.includes(counterKey)) throw new Error(`Unknown usage counter: ${counterKey}`);
  const month = currentMonth();
  const existing = db.prepare('SELECT id FROM usage_tracking WHERE entity_id = ? AND entity_type = ? AND month = ?').get(entityId, entityType, month);
  if (existing) {
    db.prepare(`UPDATE usage_tracking SET ${counterKey} = ${counterKey} + ?, updated_at = datetime('now') WHERE id = ?`).run(by, existing.id);
  } else {
    db.prepare(`INSERT INTO usage_tracking (id, entity_id, entity_type, month, ${counterKey}) VALUES (?, ?, ?, ?, ?)`).run(newId('usage'), entityId, entityType, month, by);
  }
  return getUsageRow(entityType, entityId, month);
}

// Checks a monthly-counter feature (verified calls, job postings, etc.)
// against the entity's plan limit. limit === Infinity always allows.
function checkUsageLimit(entityType, entityId, featureName, counterKey) {
  const limit = getFeatureValue(entityType, entityId, featureName);
  const numericLimit = typeof limit === 'number' ? limit : Infinity;
  const used = getUsageRow(entityType, entityId)[counterKey] || 0;
  return { allowed: used < numericLimit, used, limit: numericLimit, remaining: numericLimit === Infinity ? Infinity : Math.max(0, numericLimit - used) };
}

// Checks a "live total row count" style limit (applications, resumes, agent
// connections, access keys) — these aren't monthly events, so the caller
// passes in a fresh COUNT(*) rather than reading usage_tracking.
function checkCountLimit(entityType, entityId, featureName, currentCount) {
  const limit = getFeatureValue(entityType, entityId, featureName);
  const numericLimit = typeof limit === 'number' ? limit : Infinity;
  return { allowed: currentCount < numericLimit, used: currentCount, limit: numericLimit, remaining: numericLimit === Infinity ? Infinity : Math.max(0, numericLimit - currentCount) };
}

// --- Global (non-plan) billing settings ---------------------------------

// extra_member_price is the one usage-based setting that is NOT per-plan —
// it's stored under the synthetic GLOBAL_BILLING_PLAN_KEY row in plan_limits
// so the existing admin editor (setPlanLimit/getPlanLimitsForPlan) can read
// and write it with zero new machinery, while every other feature still
// resolves per-plan via getFeatureValue.
function getGlobalBillingValue(featureName) {
  const row = db.prepare('SELECT feature_value FROM plan_limits WHERE plan_name = ? AND feature_name = ?').get(GLOBAL_BILLING_PLAN_KEY, featureName);
  if (row) return parseValue(row.feature_value);
  const fallback = DEFAULT_PLAN_LIMITS[GLOBAL_BILLING_PLAN_KEY] && DEFAULT_PLAN_LIMITS[GLOBAL_BILLING_PLAN_KEY][featureName];
  return fallback === undefined ? null : parseValue(String(fallback));
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// --- Verified call overage billing (Part 3) ------------------------------
//
// Design: calls are never blocked once a company has an active paid plan
// relationship (Starter/Growth/Enterprise) — the included monthly limit
// becomes a soft cap and every call past it is tracked as overage and
// billed at that plan's extra_call_price. Free plan is the one exception:
// it stays hard-capped exactly as before, because there is no billing
// relationship to charge overage against. Enterprise Plus has an
// 'unlimited' call limit so overage never triggers for it either.

function companyPlan(companyId) {
  const row = db.prepare('SELECT plan FROM companies WHERE id = ?').get(companyId);
  return (row && row.plan) || 'free';
}

// Pre-flight check used by the call-initiate route: only Free actually
// blocks. Every other plan reports allowed:true even past its limit — the
// caller (routes/calls.js) still calls recordVerifiedCall afterwards to do
// the real increment + overage accounting.
function checkVerifiedCallLimit(companyId) {
  const usage = checkUsageLimit('company', companyId, 'verified_calls_monthly_limit', 'verified_calls_count');
  const plan = companyPlan(companyId);
  const blocked = plan === 'free' && !usage.allowed;
  return { ...usage, blocked, plan };
}

// Increments verified_calls_count as usual (so getUsageSummary/dashboards
// keep working unchanged), then — only once the plan's included limit has
// actually been exceeded — also increments the running overage_calls_count
// and adds this single call's cost to overage_charge, both updated in real
// time on every call rather than recomputed in a batch job. A company-level
// usage_cap override (max monthly bill) clamps how much further
// overage_charge can grow once reached; the call itself is still recorded
// and never blocked.
function recordVerifiedCall(companyId) {
  const usageRow = incrementUsage('company', companyId, 'verified_calls_count', 1);
  const limit = getFeatureValue('company', companyId, 'verified_calls_monthly_limit');
  const numericLimit = typeof limit === 'number' ? limit : Infinity;

  if (usageRow.verified_calls_count > numericLimit) {
    const rawPrice = getFeatureValue('company', companyId, 'extra_call_price');
    const price = typeof rawPrice === 'number' ? rawPrice : 0;
    const cap = getFeatureValue('company', companyId, 'usage_cap');
    const numericCap = typeof cap === 'number' ? cap : Infinity;

    const currentCharge = usageRow.overage_charge || 0;
    const room = numericCap === Infinity ? price : Math.max(0, round2(numericCap - currentCharge));
    const chargeForThisCall = Math.min(price, room);

    const month = currentMonth();
    db.prepare(`
      UPDATE usage_tracking
      SET overage_calls_count = overage_calls_count + 1,
          overage_charge = ?,
          updated_at = datetime('now')
      WHERE entity_id = ? AND entity_type = 'company' AND month = ?
    `).run(round2(currentCharge + chargeForThisCall), companyId, month);
  }

  return getUsageRow('company', companyId);
}

// --- Team member limits + extra-member billing (Part 3 / Part 6) --------

function getTeamMemberCount(companyId) {
  const row = db.prepare(`
    SELECT COUNT(*) as n FROM company_members
    WHERE company_id = ? AND (deactivated IS NULL OR deactivated = 0)
  `).get(companyId);
  return row ? row.n : 0;
}

function checkTeamMemberLimit(companyId) {
  const currentCount = getTeamMemberCount(companyId);
  return checkCountLimit('company', companyId, 'team_members_limit', currentCount);
}

// Unlike call overage, extra-member charge is NOT a running monthly total —
// team size can go down (deactivation) as well as up, so this recalculates
// the live gauge in full every time it's called. Call this after any
// membership change (invite accepted, member deactivated/reactivated) to
// keep usage_tracking.extra_members_count/extra_member_charge current; the
// dashboard/admin reads also call it defensively so the numbers are never
// stale even if a call site forgets to.
function syncExtraMemberCharge(companyId) {
  const check = checkTeamMemberLimit(companyId);
  const extraCount = check.limit === Infinity ? 0 : Math.max(0, check.used - check.limit);
  const price = getGlobalBillingValue('extra_member_price');
  const numericPrice = typeof price === 'number' ? price : 0;
  const charge = round2(extraCount * numericPrice);
  const month = currentMonth();

  const existing = db.prepare('SELECT id FROM usage_tracking WHERE entity_id = ? AND entity_type = ? AND month = ?').get(companyId, 'company', month);
  if (existing) {
    db.prepare("UPDATE usage_tracking SET extra_members_count = ?, extra_member_charge = ?, updated_at = datetime('now') WHERE id = ?").run(extraCount, charge, existing.id);
  } else {
    db.prepare('INSERT INTO usage_tracking (id, entity_id, entity_type, month, extra_members_count, extra_member_charge) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('usage'), companyId, 'company', month, extraCount, charge);
  }
  return { extraCount, charge };
}

// Full billing/usage picture for the employer dashboard Usage card (Part 4)
// and the admin Companies/Revenue portals (Part 8/9) — one call gets both
// progress bars' worth of data plus the estimated extra charge so far this
// month, without the caller needing to know how overage/team accounting is
// stored.
function getBillingSummary(companyId) {
  syncExtraMemberCharge(companyId);
  const usage = getUsageRow('company', companyId);
  const plan = companyPlan(companyId);

  const callsLimitRaw = getFeatureValue('company', companyId, 'verified_calls_monthly_limit');
  const callsLimit = typeof callsLimitRaw === 'number' ? callsLimitRaw : Infinity;
  const callsUsed = usage.verified_calls_count || 0;
  const callsPercent = callsLimit === Infinity ? 0 : Math.min(100, Math.round((callsUsed / Math.max(callsLimit, 1)) * 100));

  const teamCheck = checkTeamMemberLimit(companyId);
  const teamPercent = teamCheck.limit === Infinity ? 0 : Math.min(100, Math.round((teamCheck.used / Math.max(teamCheck.limit, 1)) * 100));

  const extraCallPrice = getFeatureValue('company', companyId, 'extra_call_price');
  const extraMemberPrice = getGlobalBillingValue('extra_member_price');
  const usageCapRaw = getFeatureValue('company', companyId, 'usage_cap');
  const usageCap = typeof usageCapRaw === 'number' ? usageCapRaw : null;

  const estimatedExtraCharge = round2((usage.overage_charge || 0) + (usage.extra_member_charge || 0));

  return {
    plan,
    calls: {
      used: callsUsed, limit: callsLimit === Infinity ? null : callsLimit, percent: callsPercent,
      warning: callsPercent >= 80 && callsPercent < 100,
      atLimit: callsLimit !== Infinity && callsUsed >= callsLimit,
      overageCount: usage.overage_calls_count || 0,
      overageCharge: usage.overage_charge || 0,
      extraCallPrice: typeof extraCallPrice === 'number' ? extraCallPrice : 0,
    },
    team: {
      used: teamCheck.used, limit: teamCheck.limit === Infinity ? null : teamCheck.limit, percent: teamPercent,
      warning: teamPercent >= 80 && teamPercent < 100,
      atLimit: teamCheck.limit !== Infinity && teamCheck.used >= teamCheck.limit,
      extraCount: usage.extra_members_count || 0,
      extraCharge: usage.extra_member_charge || 0,
      extraMemberPrice: typeof extraMemberPrice === 'number' ? extraMemberPrice : 0,
    },
    usageCap,
    estimatedExtraCharge,
  };
}

// Usage summary for the employer dashboard usage card + admin "approaching
// limit" count — one entry per monthly-counter metric that has a plan cap.
function getUsageSummary(entityType, entityId) {
  const usage = getUsageRow(entityType, entityId);
  const metrics = [
    { key: 'verified_calls_count', feature: 'verified_calls_monthly_limit', label: 'Verified Calls' },
    { key: 'candidates_uploaded_count', feature: 'file_upload_max_candidates', label: 'Candidates Uploaded' },
    { key: 'job_postings_count', feature: 'job_postings_monthly_limit', label: 'Job Postings' },
  ];
  return metrics.map((m) => {
    const limit = getFeatureValue(entityType, entityId, m.feature);
    const numericLimit = typeof limit === 'number' ? limit : Infinity;
    const used = usage[m.key] || 0;
    const percent = numericLimit === Infinity ? 0 : Math.min(100, Math.round((used / Math.max(numericLimit, 1)) * 100));
    return {
      key: m.key, feature: m.feature, label: m.label, used, limit: numericLimit === Infinity ? null : numericLimit,
      percent, warning: percent >= 80 && percent < 100, atLimit: numericLimit !== Infinity && used >= numericLimit,
    };
  });
}

// Fires the 80%-warning / 100%-limit-reached emails (Stage 7) the first
// time a metered feature crosses each threshold in a given month — guarded
// by usage_tracking.warning_email_sent_at / limit_email_sent_at so a busy
// day of calls doesn't send the same email over and over. Best-effort: a
// failed send is logged and swallowed, never thrown back at the caller
// (this runs synchronously after the action that incremented usage, and
// that action must still succeed even if Resend is down/unconfigured).
async function checkAndSendUsageAlerts(entityType, entityId) {
  const summary = getUsageSummary(entityType, entityId);
  const crossed = summary.find((m) => m.warning || m.atLimit);
  if (!crossed) return;

  const month = currentMonth();
  const row = db.prepare('SELECT * FROM usage_tracking WHERE entity_id = ? AND entity_type = ? AND month = ?').get(entityId, entityType, month);
  if (!row) return;

  const table = entityType === 'company' ? 'companies' : 'users';
  const emailCol = entityType === 'company' ? 'work_email' : 'email';
  const entity = db.prepare(`SELECT ${emailCol} as email, ${entityType === 'company' ? 'name' : 'full_name'} as name FROM ${table} WHERE id = ?`).get(entityId);
  if (!entity || !entity.email) return;

  const pricingUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}${entityType === 'company' ? '/pricing' : '/pricing/jobseeker'}`;

  try {
    if (crossed.atLimit && !row.limit_email_sent_at) {
      await sendUsageLimitReachedEmail(entity.email, { featureLabel: crossed.label, limit: crossed.limit, pricingUrl });
      db.prepare('UPDATE usage_tracking SET limit_email_sent_at = datetime(\'now\') WHERE id = ?').run(row.id);
    } else if (crossed.warning && !row.warning_email_sent_at) {
      await sendUsageWarningEmail(entity.email, { featureLabel: crossed.label, used: crossed.used, limit: crossed.limit });
      db.prepare('UPDATE usage_tracking SET warning_email_sent_at = datetime(\'now\') WHERE id = ?').run(row.id);
    }
  } catch (err) {
    console.error(`[featureFlags] Usage alert email failed for ${entityType} ${entityId}:`, err.message);
  }
}

// --- Express middleware -------------------------------------------------

// requireFeature('campaign_manager') — 403s with a consistent,
// frontend-recognisable shape if the signed-in employer's plan doesn't
// include this feature. Expects authMiddleware to have already run.
function requireFeature(featureName) {
  return (req, res, next) => {
    const companyId = getCompanyIdForUser(req.user.id);
    if (!companyId) return res.status(404).json({ error: 'No company profile found for this user' });
    if (!hasFeature('company', companyId, featureName)) {
      return res.status(403).json({ error: 'This feature is not available on your current plan.', featureLocked: true, feature: featureName });
    }
    req.companyId = companyId;
    next();
  };
}

// --- Admin write paths (Plan Control portal) ----------------------------

function logPlanChange({ entityId, entityType, featureName, oldValue, newValue, changedByAdminId }) {
  db.prepare(`
    INSERT INTO plan_change_log (id, entity_id, entity_type, feature_name, old_value, new_value, changed_by_admin_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId('planlog'), entityId, entityType, featureName,
    oldValue === undefined || oldValue === null ? null : String(oldValue),
    newValue === undefined || newValue === null ? null : String(newValue),
    changedByAdminId || null
  );
}

function setPlanLimit(planName, featureName, value, adminId) {
  const existing = db.prepare('SELECT feature_value FROM plan_limits WHERE plan_name = ? AND feature_name = ?').get(planName, featureName);
  const newValue = String(value);
  db.prepare(`
    INSERT INTO plan_limits (plan_name, feature_name, feature_value, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(plan_name, feature_name) DO UPDATE SET feature_value = excluded.feature_value, updated_at = datetime('now')
  `).run(planName, featureName, newValue);
  logPlanChange({ entityId: planName, entityType: 'plan', featureName, oldValue: existing ? existing.feature_value : null, newValue, changedByAdminId: adminId });
}

function setCompanyOverride(companyId, featureName, value, adminId) {
  const existing = db.prepare('SELECT override_value FROM company_feature_overrides WHERE company_id = ? AND feature_name = ?').get(companyId, featureName);
  const newValue = String(value);
  if (existing) {
    db.prepare("UPDATE company_feature_overrides SET override_value = ?, set_by_admin_id = ?, set_at = datetime('now') WHERE company_id = ? AND feature_name = ?")
      .run(newValue, adminId || null, companyId, featureName);
  } else {
    db.prepare('INSERT INTO company_feature_overrides (id, company_id, feature_name, override_value, set_by_admin_id) VALUES (?, ?, ?, ?, ?)')
      .run(newId('override'), companyId, featureName, newValue, adminId || null);
  }
  logPlanChange({ entityId: companyId, entityType: 'company', featureName, oldValue: existing ? existing.override_value : null, newValue, changedByAdminId: adminId });
}

function clearCompanyOverride(companyId, featureName, adminId) {
  const existing = db.prepare('SELECT override_value FROM company_feature_overrides WHERE company_id = ? AND feature_name = ?').get(companyId, featureName);
  if (!existing) return;
  db.prepare('DELETE FROM company_feature_overrides WHERE company_id = ? AND feature_name = ?').run(companyId, featureName);
  logPlanChange({ entityId: companyId, entityType: 'company', featureName, oldValue: existing.override_value, newValue: null, changedByAdminId: adminId });
}

function getPlanLimitsForPlan(planName) {
  const rows = db.prepare('SELECT feature_name, feature_value FROM plan_limits WHERE plan_name = ?').all(planName);
  const map = {};
  for (const r of rows) map[r.feature_name] = parseValue(r.feature_value);
  return map;
}

module.exports = {
  FEATURES_EMPLOYER, FEATURES_JOBSEEKER, FEATURES_GLOBAL_BILLING, GLOBAL_BILLING_PLAN_KEY, DEFAULT_PLAN_LIMITS,
  currentMonth, planKeyFor, parseValue,
  getCompanyIdForUser,
  getFeatureValue, hasFeature, hasOverride,
  getUsageRow, incrementUsage, checkUsageLimit, checkCountLimit, getUsageSummary, checkAndSendUsageAlerts,
  getGlobalBillingValue,
  checkVerifiedCallLimit, recordVerifiedCall,
  getTeamMemberCount, checkTeamMemberLimit, syncExtraMemberCharge, getBillingSummary,
  requireFeature,
  logPlanChange, setPlanLimit, setCompanyOverride, clearCompanyOverride, getPlanLimitsForPlan,
};
