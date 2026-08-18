// Monthly billing summary generation (Part 9). Same lightweight in-process
// setInterval pattern as pilotScheduler.js/callbackReminders.js — no new
// cron dependency. Every 6 hours it checks whether last calendar month's
// summary has been generated yet for each company and, if not, builds one
// from that month's final usage_tracking row (verified calls, overage
// count/charge, extra member count/charge) plus whatever plan was actually
// active during that month (replayed from company_plan_history, not just
// the company's current plan — a company that upgraded partway through a
// month still gets billed for the plan it was actually on).
//
// Invoices are generate-once: once a (company, month) row exists in
// monthly_invoices it is never overwritten, even if usage_tracking somehow
// changes afterwards (e.g. an admin's "Reset monthly usage" bulk action) —
// a generated invoice is a frozen historical record, not a live view.
const db = require('../db');
const { newId } = require('../utils/ids');
const { PLAN_PRICES } = require('../utils/plans');
const { getPlanLimitsForPlan } = require('./featureFlags');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function previousMonthKey(d = new Date()) {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

// Which plan was active for a company during a given "YYYY-MM" month —
// the most recent company_plan_history row at or before the end of that
// month, falling back to the company's current plan if it has no recorded
// history at all (e.g. it has never changed plans since signup).
function planActiveDuring(companyId, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const monthEnd = new Date(y, m, 0, 23, 59, 59).toISOString();
  const row = db.prepare(`
    SELECT plan FROM company_plan_history WHERE company_id = ? AND changed_at <= ? ORDER BY changed_at DESC LIMIT 1
  `).get(companyId, monthEnd);
  if (row) return row.plan;
  const company = db.prepare('SELECT plan FROM companies WHERE id = ?').get(companyId);
  return company ? company.plan : 'free';
}

// Generates (and returns the new id) or does nothing (returns null) if
// already generated or there's no usage_tracking row for that month at all
// (a company with zero activity that month has nothing to bill beyond the
// base plan charge — still worth a row so "no calls this month" shows up
// honestly rather than a gap in the invoice history; base-only invoices
// are generated too, just with zeros for the usage columns).
function generateInvoiceForCompany(companyId, monthKey) {
  const existing = db.prepare('SELECT id FROM monthly_invoices WHERE company_id = ? AND month = ?').get(companyId, monthKey);
  if (existing) return null;

  const usage = db.prepare('SELECT * FROM usage_tracking WHERE entity_id = ? AND entity_type = ? AND month = ?').get(companyId, 'company', monthKey)
    || { verified_calls_count: 0, overage_calls_count: 0, overage_charge: 0, extra_members_count: 0, extra_member_charge: 0 };

  const plan = planActiveDuring(companyId, monthKey);
  const limits = getPlanLimitsForPlan(`employer_${plan}`);
  const basePlanCharge = PLAN_PRICES[plan] || 0;
  const includedCallsLimit = typeof limits.verified_calls_monthly_limit === 'number' ? limits.verified_calls_monthly_limit : null;

  const totalDue = Math.round((basePlanCharge + (usage.overage_charge || 0) + (usage.extra_member_charge || 0)) * 100) / 100;

  const id = newId('invoice');
  db.prepare(`
    INSERT INTO monthly_invoices (
      id, company_id, month, plan_name, base_plan_charge,
      included_calls_used, included_calls_limit, extra_calls_count, extra_calls_charge,
      extra_members_count, extra_members_charge, total_due
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, companyId, monthKey, plan, basePlanCharge,
    usage.verified_calls_count || 0, includedCallsLimit, usage.overage_calls_count || 0, usage.overage_charge || 0,
    usage.extra_members_count || 0, usage.extra_member_charge || 0, totalDue
  );
  return id;
}

// Runs the generation pass for one month across every company — exported
// separately so both the interval below and an admin "Generate Now" action
// (routes/admin/revenue.js) can call the exact same logic.
function generateMonthlyInvoices(monthKey = previousMonthKey()) {
  const companies = db.prepare('SELECT id FROM companies').all();
  let generated = 0;
  for (const c of companies) {
    try {
      if (generateInvoiceForCompany(c.id, monthKey)) generated += 1;
    } catch (err) {
      console.error(`[billing-scheduler] Failed to generate invoice for company ${c.id}, month ${monthKey}:`, err.message);
    }
  }
  return { month: monthKey, checked: companies.length, generated };
}

let intervalHandle = null;

function startBillingScheduler() {
  if (intervalHandle) return;
  try {
    const result = generateMonthlyInvoices();
    if (result.generated > 0) console.log(`[billing-scheduler] Generated ${result.generated} invoice(s) for ${result.month} on startup.`);
  } catch (err) {
    console.error('[billing-scheduler] Initial run failed:', err.message);
  }
  intervalHandle = setInterval(() => {
    try { generateMonthlyInvoices(); } catch (err) { console.error('[billing-scheduler] Run failed:', err.message); }
  }, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
  console.log('[billing-scheduler] Scheduler started — checking every 6h to generate last month\'s billing summaries.');
}

function stopBillingScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startBillingScheduler, stopBillingScheduler, generateMonthlyInvoices, generateInvoiceForCompany, previousMonthKey };
