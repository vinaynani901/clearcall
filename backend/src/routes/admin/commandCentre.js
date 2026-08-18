const express = require('express');
const db = require('../../db');
const { PLAN_PRICES } = require('../../utils/plans');
const { mrrAt, buildHistoryMap } = require('../../utils/mrrReplay');
const { checkTeamMemberLimit } = require('../../services/featureFlags');

const router = express.Router();

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function serviceConfigured(...envVars) {
  return envVars.every((v) => v && !v.startsWith('your-'));
}

// Builds a 7-value array (oldest to newest, today last) from day-bucketed
// SQL rows ({ day: 'YYYY-MM-DD', n: number }), filling zero for days with
// no rows at all.
function fillDaySeries(rows, days = 7) {
  const map = new Map(rows.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push(map.get(key) || 0);
  }
  return series;
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// GET /api/admin/command-centre — the one-glance platform overview shown
// first after admin login. Every stat card also gets a 7-day sparkline
// series and a %-change so the dashboard can show real trends, not just
// point-in-time snapshots.
router.get('/', (req, res) => {
  const monthStart = monthStartIso();
  const today = new Date().toISOString().slice(0, 10);

  const totalCompanies = db.prepare('SELECT COUNT(*) as n FROM companies').get().n;
  const activeCompanies = db.prepare(`
    SELECT COUNT(DISTINCT company_id) as n FROM calls WHERE company_id IS NOT NULL AND created_at >= ?
  `).get(monthStart).n;
  const totalJobSeekers = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'jobseeker'").get().n;
  const totalAgents = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'agent'").get().n;
  const verifiedCallsToday = db.prepare(`
    SELECT COUNT(*) as n FROM calls WHERE call_type = 'clearcall' AND date(created_at) = date(?)
  `).get(today).n;

  const plans = db.prepare('SELECT plan FROM companies').all();
  const revenueThisMonth = plans.reduce((sum, c) => sum + (PLAN_PRICES[c.plan] || 0), 0);

  const scamReportsPending = db.prepare("SELECT COUNT(*) as n FROM reports WHERE status = 'pending'").get().n;
  const supportTicketsOpen = db.prepare("SELECT COUNT(*) as n FROM support_tickets WHERE status IN ('open', 'in_progress')").get().n;

  // --- Sparklines + deltas (real data only — anything without real
  // historical tracking, like uptime history, is shown flat/dashed rather
  // than invented). ---
  const callsRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as n FROM calls
    WHERE call_type = 'clearcall' AND created_at >= date('now', '-6 days')
    GROUP BY day
  `).all();
  const callsSeries = fillDaySeries(callsRows);
  const callsYesterday = callsSeries[callsSeries.length - 2] || 0;
  const callsTodayCount = callsSeries[callsSeries.length - 1] || 0;

  const activeCompanyRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(DISTINCT company_id) as n FROM calls
    WHERE company_id IS NOT NULL AND created_at >= date('now', '-6 days')
    GROUP BY day
  `).all();
  const activeCompaniesSeries = fillDaySeries(activeCompanyRows);
  const activeCompaniesThisWeek = db.prepare(`
    SELECT COUNT(DISTINCT company_id) as n FROM calls WHERE company_id IS NOT NULL AND created_at >= date('now', '-6 days')
  `).get().n;
  const activeCompaniesPrevWeek = db.prepare(`
    SELECT COUNT(DISTINCT company_id) as n FROM calls WHERE company_id IS NOT NULL AND created_at >= date('now', '-13 days') AND created_at < date('now', '-6 days')
  `).get().n;

  // "Job Seekers Online" isn't a real, trackable signal — ClearCall has no
  // presence system. Reported honestly as new signups instead, which is a
  // real number with a real 7-day trend.
  const newJobSeekerRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as n FROM users
    WHERE role = 'jobseeker' AND created_at >= date('now', '-6 days')
    GROUP BY day
  `).all();
  const newJobSeekersSeries = fillDaySeries(newJobSeekerRows);
  const newJobSeekersThisWeek = newJobSeekersSeries.reduce((a, b) => a + b, 0);
  const newJobSeekersPrevWeek = db.prepare(`
    SELECT COUNT(*) as n FROM users WHERE role = 'jobseeker' AND created_at >= date('now', '-13 days') AND created_at < date('now', '-6 days')
  `).get().n;

  const reportRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as n FROM reports WHERE created_at >= date('now', '-6 days') GROUP BY day
  `).all();
  const reportsSeries = fillDaySeries(reportRows);
  const scamReportsNewToday = reportsSeries[reportsSeries.length - 1] || 0;

  const historyMap = buildHistoryMap();
  const revenueSeries = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(23, 59, 59, 999);
    revenueSeries.push(mrrAt(d, historyMap));
  }
  const revenueLastMonthEnd = mrrAt(new Date(new Date(monthStart).getTime() - 1), historyMap);

  const services = [
    { name: 'Railway Server', status: 'operational' },
    { name: 'Database', status: 'operational' },
    { name: 'Twilio', status: serviceConfigured(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) ? 'operational' : 'down' },
    { name: 'Resend', status: serviceConfigured(process.env.RESEND_API_KEY) ? 'operational' : 'down' },
    { name: 'ABN API', status: serviceConfigured(process.env.ABN_API_GUID) ? 'operational' : 'down' },
  ];
  const operationalCount = services.filter((s) => s.status === 'operational').length;
  const healthPct = Math.round((operationalCount / services.length) * 100);

  // --- Needs Attention -----------------------------------------------------
  const pendingApproval = db.prepare("SELECT id, name FROM companies WHERE admin_review_status = 'pending' ORDER BY created_at ASC").all();
  const autoSuspended = db.prepare("SELECT id, name FROM companies WHERE suspension_status = 1").all();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const abnAgeFlags = db.prepare("SELECT id, name, abn_registration_date FROM companies WHERE admin_review_status = 'pending' AND abn_registration_date IS NOT NULL")
    .all()
    .filter((c) => new Date(c.abn_registration_date) > sixMonthsAgo);
  const urgentTickets = db.prepare(`
    SELECT st.id, st.subject FROM support_tickets st WHERE st.priority = 'urgent' AND st.status != 'closed'
  `).all();

  // Pilot Program Manager (Plan Control Section 4): flag any active pilot
  // ending within the next 7 days right on the Command Centre landing page.
  const pilotsEndingSoon = db.prepare(`
    SELECT pp.id, c.name FROM pilot_programs pp
    JOIN companies c ON c.id = pp.company_id
    WHERE pp.status = 'active' AND julianday(pp.end_date) - julianday('now') <= 7 AND julianday(pp.end_date) - julianday('now') >= 0
  `).all();

  // Member usage alerts (Part 8): any company using 80%+ of its plan's
  // included team member slots — same 80% warning threshold used
  // everywhere else usage is checked (call/candidate/job-posting limits).
  // Skipped for unlimited-member plans (Enterprise Plus), where this can
  // never trigger.
  const allCompaniesForMemberCheck = db.prepare('SELECT id, name FROM companies').all();
  const memberUsageAlerts = [];
  for (const c of allCompaniesForMemberCheck) {
    const check = checkTeamMemberLimit(c.id);
    if (check.limit === Infinity) continue;
    const percent = check.limit > 0 ? Math.round((check.used / check.limit) * 100) : 0;
    if (percent >= 80) {
      memberUsageAlerts.push({
        level: 'orange',
        category: percent >= 100 ? 'Team member limit reached' : 'Approaching team member limit',
        label: `${c.name} — ${check.used} of ${check.limit} member slots used`,
        link: '/admin/companies',
      });
    }
  }

  const needsAttention = [
    ...pendingApproval.map((c) => ({ level: 'red', category: 'New company awaiting approval', label: c.name, link: '/admin/verification-queue' })),
    ...autoSuspended.map((c) => ({ level: 'red', category: 'Company auto-suspended', label: c.name, link: '/admin/companies' })),
    ...urgentTickets.map((t) => ({ level: 'red', category: 'Urgent support ticket', label: t.subject, link: '/admin/support-tickets' })),
    ...memberUsageAlerts,
    ...abnAgeFlags.map((c) => ({ level: 'yellow', category: 'ABN registered under 6 months ago', label: c.name, link: '/admin/verification-queue' })),
    ...pilotsEndingSoon.map((p) => ({ level: 'yellow', category: 'Pilot ending within 7 days', label: p.name, link: '/admin/plan-control' })),
  ];

  res.json({
    generatedAt: new Date().toISOString(),
    systemHealth: services,
    healthPct,
    stats: {
      totalCompanies,
      activeCompanies,
      totalJobSeekers,
      totalAgents,
      verifiedCallsToday,
      revenueThisMonth,
      scamReportsPending,
      supportTicketsOpen,
    },
    sparklines: {
      verifiedCalls: { series: callsSeries, changePct: pctChange(callsTodayCount, callsYesterday) },
      activeCompanies: { series: activeCompaniesSeries, changePct: pctChange(activeCompaniesThisWeek, activeCompaniesPrevWeek) },
      newJobSeekers: { series: newJobSeekersSeries, total: newJobSeekersThisWeek, changePct: pctChange(newJobSeekersThisWeek, newJobSeekersPrevWeek) },
      scamReports: { series: reportsSeries, newToday: scamReportsNewToday },
      revenue: { series: revenueSeries, changePct: pctChange(revenueThisMonth, revenueLastMonthEnd) },
      health: { series: new Array(7).fill(healthPct), changePct: null }, // no historical uptime tracking — flat by design, not fabricated
    },
    needsAttention,
  });
});

// GET /api/admin/command-centre/activity — a merged, real feed of recent
// platform events. Every event type here maps to an actual database write
// (a call, a signup, a report, a suspension, a plan change) — nothing here
// is synthetic.
router.get('/activity', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const events = [];

  const calls = db.prepare(`
    SELECT calls.id, calls.created_at, calls.receiver_name, calls.receiver_phone, companies.name as company_name
    FROM calls LEFT JOIN companies ON companies.id = calls.company_id
    WHERE calls.call_type = 'clearcall' AND calls.call_status = 'answered'
    ORDER BY calls.created_at DESC LIMIT 15
  `).all();
  for (const c of calls) {
    events.push({
      type: 'call_completed', color: 'green', timestamp: c.created_at,
      description: `Verified call completed — ${c.company_name || 'Unknown company'} → ${c.receiver_name || c.receiver_phone}`,
      link: '/admin/companies',
    });
  }

  const signups = db.prepare(`
    SELECT id, full_name, created_at FROM users WHERE role = 'jobseeker' ORDER BY created_at DESC LIMIT 15
  `).all();
  for (const u of signups) {
    events.push({
      type: 'jobseeker_signup', color: 'blue', timestamp: u.created_at,
      description: `New job seeker joined — ${u.full_name}`,
      link: '/admin/jobseekers',
    });
  }

  const reports = db.prepare(`
    SELECT reports.id, reports.reason, reports.created_at, companies.name as company_name
    FROM reports LEFT JOIN companies ON companies.id = reports.reported_company_id
    ORDER BY reports.created_at DESC LIMIT 15
  `).all();
  for (const r of reports) {
    events.push({
      type: 'scam_report', color: 'orange', timestamp: r.created_at,
      description: `Scam report submitted — ${r.reason}${r.company_name ? ` (${r.company_name})` : ''}`,
      link: '/admin/scam-reports',
    });
  }

  const suspensions = db.prepare(`
    SELECT id, name, abn, suspended_at FROM companies WHERE suspension_status = 1 AND suspended_at IS NOT NULL ORDER BY suspended_at DESC LIMIT 15
  `).all();
  for (const c of suspensions) {
    events.push({
      type: 'company_suspended', color: 'red', timestamp: c.suspended_at,
      description: `Company suspended — ${c.name} (ABN ${c.abn})`,
      link: '/admin/companies',
    });
  }

  const payments = db.prepare(`
    SELECT h.id, h.plan, h.changed_at, c.name as company_name FROM company_plan_history h
    JOIN companies c ON c.id = h.company_id WHERE h.plan != 'free' ORDER BY h.changed_at DESC LIMIT 15
  `).all();
  for (const p of payments) {
    events.push({
      type: 'payment_received', color: 'purple', timestamp: p.changed_at,
      description: `Plan payment — ${p.company_name} moved to ${p.plan}`,
      link: '/admin/revenue',
    });
  }

  events.sort((a, b) => new Date(b.timestamp.replace(' ', 'T')) - new Date(a.timestamp.replace(' ', 'T')));
  res.json({ events: events.slice(0, limit) });
});

// GET /api/admin/command-centre/scam-hotspots — real report counts grouped
// by company location. There's no dedicated geocoding service connected,
// so matching is a case-insensitive substring match against a fixed list
// of major Australian cities (honest best-effort, not a real geocoder —
// unmatched locations are grouped as "Other").
const CITY_COORDS = {
  Sydney: { x: 210, y: 175 }, Melbourne: { x: 175, y: 230 }, Brisbane: { x: 220, y: 120 },
  Perth: { x: 40, y: 180 }, Adelaide: { x: 145, y: 210 }, 'Gold Coast': { x: 222, y: 128 },
  Canberra: { x: 200, y: 195 }, Hobart: { x: 185, y: 275 }, Darwin: { x: 130, y: 30 },
  Newcastle: { x: 213, y: 165 }, Wollongong: { x: 208, y: 183 },
};

router.get('/scam-hotspots', (req, res) => {
  const reports = db.prepare(`
    SELECT reports.id, companies.location FROM reports
    LEFT JOIN companies ON companies.id = reports.reported_company_id
    WHERE companies.location IS NOT NULL AND companies.location != ''
  `).all();

  const counts = {};
  for (const r of reports) {
    const loc = r.location.toLowerCase();
    const matched = Object.keys(CITY_COORDS).find((city) => loc.includes(city.toLowerCase()));
    const key = matched || 'Other';
    counts[key] = (counts[key] || 0) + 1;
  }

  const cities = Object.entries(counts)
    .filter(([city]) => city !== 'Other')
    .map(([city, count]) => ({ city, count, ...CITY_COORDS[city] }))
    .sort((a, b) => b.count - a.count);

  const max = Math.max(1, ...cities.map((c) => c.count));
  const withIntensity = cities.map((c) => ({
    ...c,
    intensity: c.count / max >= 0.66 ? 'high' : c.count / max >= 0.33 ? 'medium' : 'low',
  }));

  res.json({
    hotspots: withIntensity,
    top5: withIntensity.slice(0, 5),
    unmatched: counts.Other || 0,
    totalMatchedReports: reports.length - (counts.Other || 0),
  });
});

module.exports = router;
