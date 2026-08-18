// Shared MRR-replay logic, used by both the Revenue portal (12-month trend)
// and the Command Centre (7-day sparkline). Replays each company's
// company_plan_history to reconstruct what plan was active at any given
// point in time — the same technique, just called with different date
// ranges, so this lives in one place rather than being duplicated.
const db = require('../db');
const { PLAN_PRICES } = require('./plans');

function priceFor(plan) {
  return PLAN_PRICES[plan] || 0;
}

function buildHistoryMap() {
  const rows = db.prepare('SELECT company_id, plan, changed_at FROM company_plan_history ORDER BY company_id ASC, changed_at ASC').all();
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.company_id)) map.set(row.company_id, []);
    map.get(row.company_id).push(row);
  }
  return map;
}

/**
 * MRR as of the end of `atDate`, replaying every company's plan history to
 * find whichever plan was active at that moment (or none, if they hadn't
 * signed up yet).
 */
function mrrAt(atDate, historyMap) {
  const map = historyMap || buildHistoryMap();
  let total = 0;
  for (const [, rows] of map) {
    let lastPlan = null;
    for (const row of rows) {
      const changedAt = new Date(row.changed_at.replace(' ', 'T'));
      if (Number.isNaN(changedAt.getTime()) || changedAt > atDate) break;
      lastPlan = row.plan;
    }
    if (lastPlan) total += priceFor(lastPlan);
  }
  return total;
}

module.exports = { buildHistoryMap, mrrAt, priceFor };
