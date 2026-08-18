const express = require('express');
const db = require('../../db');
const { PLAN_PRICES, PLAN_LABELS } = require('../../utils/plans');
const { mrrAt } = require('../../utils/mrrReplay');
const { generateMonthlyInvoices } = require('../../services/billingScheduler');

const router = express.Router();

function priceFor(plan) {
  return PLAN_PRICES[plan] || 0;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d) {
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

// Adds `months` calendar months to a Date, then keeps adding `months` until
// the result is strictly after `now` — used to estimate a recurring
// "next billing date" from a plan's start date without any real billing
// system to ask.
function nextOccurrenceAfter(anchor, now, months = 1) {
  const d = new Date(anchor.getTime());
  if (Number.isNaN(d.getTime())) return null;
  let guard = 0;
  while (d <= now && guard < 240) {
    d.setMonth(d.getMonth() + months);
    guard += 1;
  }
  return d;
}

router.get('/', (req, res) => {
  const now = new Date();
  const companies = db.prepare('SELECT id, name, plan, payment_status, created_at, suspension_status FROM companies').all();

  // Full plan-change history per company, oldest first — this is the
  // ledger every calculation below replays. Every company has at least one
  // row (backfilled at migration time), so there's never a "no history"
  // special case.
  const historyRows = db.prepare('SELECT company_id, plan, changed_at FROM company_plan_history ORDER BY company_id ASC, changed_at ASC').all();
  const historyByCompany = new Map();
  for (const row of historyRows) {
    if (!historyByCompany.has(row.company_id)) historyByCompany.set(row.company_id, []);
    historyByCompany.get(row.company_id).push(row);
  }

  // ---- Current MRR: sum of each company's current plan price. ----
  const mrr = companies.reduce((sum, c) => sum + priceFor(c.plan), 0);

  // ---- This month's New / Churned / Net New MRR, replayed from history. ----
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let newRevenueThisMonth = 0;
  let churnedRevenueThisMonth = 0;
  let netNewMrrThisMonth = 0;

  for (const [, rows] of historyByCompany) {
    for (let i = 0; i < rows.length; i += 1) {
      const changedAt = new Date(rows[i].changed_at.replace(' ', 'T'));
      if (Number.isNaN(changedAt.getTime()) || changedAt < startOfMonth || changedAt > now) continue;

      const priceBefore = i === 0 ? 0 : priceFor(rows[i - 1].plan);
      const priceAfter = priceFor(rows[i].plan);
      const delta = priceAfter - priceBefore;
      netNewMrrThisMonth += delta;

      if (priceBefore === 0 && priceAfter > 0) newRevenueThisMonth += delta;
      else if (priceAfter === 0 && priceBefore > 0) churnedRevenueThisMonth += -delta; // report as a positive "lost" amount
    }
  }

  // ---- 12-month trend: reconstruct each month's end-of-month MRR by
  // finding, for every company, the last plan change on or before that
  // month's end and pricing it. ----
  const trend = [];
  for (let i = 11; i >= 0; i -= 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    trend.push({ month: monthKey(monthStart), label: monthLabel(monthStart), mrr: mrrAt(monthEnd, historyByCompany) });
  }

  // ---- Plan-type breakdown. ----
  const breakdownMap = new Map();
  for (const c of companies) {
    if (!breakdownMap.has(c.plan)) breakdownMap.set(c.plan, { plan: c.plan, label: PLAN_LABELS[c.plan] || c.plan, count: 0, mrr: 0 });
    const entry = breakdownMap.get(c.plan);
    entry.count += 1;
    entry.mrr += priceFor(c.plan);
  }
  const breakdown = Array.from(breakdownMap.values()).sort((a, b) => b.mrr - a.mrr);

  // ---- Paying companies list, with an estimated next billing date. ----
  const payingCompanies = companies
    .filter((c) => priceFor(c.plan) > 0)
    .map((c) => {
      const rows = historyByCompany.get(c.id) || [];
      const currentRow = [...rows].reverse().find((r) => r.plan === c.plan);
      const anchorStr = currentRow ? currentRow.changed_at : c.created_at;
      const anchor = new Date((anchorStr || c.created_at).replace(' ', 'T'));
      const nextBilling = nextOccurrenceAfter(anchor, now, 1);
      return {
        id: c.id,
        name: c.name,
        plan: c.plan,
        planLabel: PLAN_LABELS[c.plan] || c.plan,
        monthlyFee: priceFor(c.plan),
        nextBillingDate: nextBilling ? nextBilling.toISOString().slice(0, 10) : null,
        paymentStatus: c.payment_status || 'active',
        suspended: !!c.suspension_status,
      };
    })
    .sort((a, b) => b.monthlyFee - a.monthlyFee);

  res.json({
    mrr,
    newRevenueThisMonth,
    churnedRevenueThisMonth,
    netNewMrrThisMonth,
    trend,
    breakdown,
    payingCompanies,
  });
});

// --- Monthly billing summaries / invoices (Part 9) ------------------------

// GET /api/admin/revenue/invoices?month=YYYY-MM — every generated monthly
// invoice, most recent first. Omit `month` for the full history across all
// months (used by the admin Revenue portal's Billing Summaries tab).
router.get('/invoices', (req, res) => {
  const { month } = req.query;
  const rows = month
    ? db.prepare('SELECT mi.*, c.name as company_name FROM monthly_invoices mi JOIN companies c ON c.id = mi.company_id WHERE mi.month = ? ORDER BY mi.total_due DESC').all(month)
    : db.prepare('SELECT mi.*, c.name as company_name FROM monthly_invoices mi JOIN companies c ON c.id = mi.company_id ORDER BY mi.month DESC, mi.total_due DESC').all();
  res.json({ invoices: rows });
});

// POST /api/admin/revenue/invoices/generate — body: { month? }. Manually
// runs the same generation pass the billing scheduler runs automatically
// every 6 hours (services/billingScheduler.js) — lets an admin generate a
// month's summaries on demand (e.g. to demo the feature, or catch up a
// month that was somehow missed) without waiting for the next scheduled
// check. Never overwrites an invoice that already exists for a given
// company+month.
router.post('/invoices/generate', (req, res) => {
  const result = generateMonthlyInvoices(req.body.month || undefined);
  res.json(result);
});

module.exports = router;
