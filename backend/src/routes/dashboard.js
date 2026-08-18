const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { resolveCandidateName } = require('../utils/candidateName');

const router = express.Router();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getEmployerCompany(userId) {
  return db.prepare(`
    SELECT c.* FROM companies c
    JOIN company_members cm ON cm.company_id = c.id
    WHERE cm.user_id = ?
    LIMIT 1
  `).get(userId);
}

// Categorises one candidate row into the five queue-table statuses. The
// donut chart on the active campaign card folds "No Answer" into
// "Not Reached" since it only has four segments.
function candidateStatus(c) {
  if (c.outcome === 'Callback Requested') return 'callback';
  if (c.call_status === 'answered') {
    return c.duration_seconds > 60 ? 'in_conversation' : 'connected';
  }
  if (c.call_status === 'no_answer' || c.call_status === 'voicemail') return 'no_answer';
  return 'not_reached';
}

const HOUR_WINDOWS = [
  { label: '6am – 9am', start: 6, end: 9 },
  { label: '9am – 12pm', start: 9, end: 12 },
  { label: '12pm – 3pm', start: 12, end: 15 },
  { label: '3pm – 6pm', start: 15, end: 18 },
  { label: '6pm – 9pm', start: 18, end: 21 },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_CALLS_FOR_INSIGHT = 8;

function computeInsights(myCalls, teamCalls, myUserId) {
  const insights = { bestTime: null, connectionRate: null, bestDay: null };

  // Best calling time — bucket this recruiter's own calls by hour of day,
  // find the window with the highest answer rate among windows with a
  // reasonable sample size.
  if (myCalls.length >= MIN_CALLS_FOR_INSIGHT) {
    const buckets = HOUR_WINDOWS.map((w) => ({ ...w, total: 0, answered: 0 }));
    for (const call of myCalls) {
      const hour = new Date(call.created_at).getHours();
      const bucket = buckets.find((b) => hour >= b.start && hour < b.end);
      if (!bucket) continue;
      bucket.total += 1;
      if (call.call_status === 'answered') bucket.answered += 1;
    }
    const eligible = buckets.filter((b) => b.total >= 3);
    if (eligible.length > 0) {
      const best = eligible.reduce((a, b) => ((b.answered / b.total) > (a.answered / a.total) ? b : a));
      insights.bestTime = { label: best.label, answerRate: Math.round((best.answered / best.total) * 100) };
    }
  }

  // Connection rate vs team average (other members of the same company).
  if (myCalls.length >= MIN_CALLS_FOR_INSIGHT) {
    const myAnswered = myCalls.filter((c) => c.call_status === 'answered').length;
    const myRate = myAnswered / myCalls.length;

    const byUser = new Map();
    for (const call of teamCalls) {
      if (call.caller_user_id === myUserId) continue; // compare against teammates, not against myself
      if (!byUser.has(call.caller_user_id)) byUser.set(call.caller_user_id, { total: 0, answered: 0 });
      const bucket = byUser.get(call.caller_user_id);
      bucket.total += 1;
      if (call.call_status === 'answered') bucket.answered += 1;
    }
    const otherRates = [...byUser.entries()]
      .filter(([, b]) => b.total >= MIN_CALLS_FOR_INSIGHT)
      .map(([, b]) => b.answered / b.total);

    if (otherRates.length > 0) {
      const teamAvg = otherRates.reduce((a, b) => a + b, 0) / otherRates.length;
      if (teamAvg > 0) {
        const diffPct = Math.round(((myRate - teamAvg) / teamAvg) * 100);
        insights.connectionRate = { myRatePct: Math.round(myRate * 100), diffPct };
      }
    } else {
      // Solo recruiter or no other teammate has enough history yet — still
      // worth surfacing their own rate without a fabricated comparison.
      insights.connectionRate = { myRatePct: Math.round(myRate * 100), diffPct: null };
    }
  }

  // Best day of week — same idea, bucketed by day-of-week instead of hour.
  if (myCalls.length >= MIN_CALLS_FOR_INSIGHT) {
    const buckets = DAY_NAMES.map((name) => ({ name, total: 0, answered: 0 }));
    for (const call of myCalls) {
      const day = new Date(call.created_at).getDay();
      buckets[day].total += 1;
      if (call.call_status === 'answered') buckets[day].answered += 1;
    }
    const eligible = buckets.filter((b) => b.total >= 3);
    if (eligible.length >= 2) {
      const rates = eligible.map((b) => ({ ...b, rate: b.answered / b.total }));
      const best = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
      const others = rates.filter((b) => b.name !== best.name);
      const othersAvg = others.reduce((sum, b) => sum + b.rate, 0) / others.length;
      if (othersAvg > 0) {
        const diffPct = Math.round(((best.rate - othersAvg) / othersAvg) * 100);
        insights.bestDay = { day: best.name, diffPct };
      }
    }
  }

  return insights;
}

// Safe, fully-shaped "nothing to show" response. Used both for a genuinely
// empty account and as the fallback if anything above throws unexpectedly —
// the dashboard must always get a 200 with every field present so the
// frontend never has to fall back to a bare error screen.
function emptyDashboardPayload(firstName) {
  return {
    greeting: { firstName: firstName || 'there', jobTitle: null },
    todaySummary: { plannedCalls: 0, activeCampaignCount: 0 },
    stats: {
      todaysCalls: { made: 0, total: 0, pct: 0 },
      connected: { count: 0, pct: 0 },
      conversations: { count: 0 },
      callbackRequested: { count: 0 },
      avgDurationSeconds: 0,
    },
    activeCampaign: null,
    callingQueue: [],
    campaignsSummary: [],
    verification: { abnVerified: false, workEmailVerified: false },
    tasks: { callbacksDueToday: 0, newCandidatesThisWeek: 0, campaignNeedsAttention: false, campaignNeedsAttentionName: null, campaignNeedsAttentionId: null },
    recentCalls: [],
    insights: { bestTime: null, connectionRate: null, bestDay: null },
    myTeam: null,
    notifications: { unreadCount: 0 },
  };
}

// GET /api/dashboard/employer — everything the redesigned employer
// dashboard needs in one call: greeting, live stats, the most recently
// active campaign with a donut breakdown, the calling queue, verification
// status, task list, recent calls, and real insights from call history.
// Never lets an unexpected error surface as a 500 — the dashboard must
// always render, even with a completely empty or unusual account.
router.get('/employer', authMiddleware, (req, res) => {
  if (req.user.role !== 'employer') {
    return res.status(403).json({ error: 'Employer account required' });
  }

  try {
    buildAndSendDashboard(req, res);
  } catch (err) {
    console.error('[dashboard] Failed to build employer dashboard, returning empty state:', err);
    res.json(emptyDashboardPayload((req.user.full_name || '').split(' ')[0]));
  }
});

function buildAndSendDashboard(req, res) {
  const company = getEmployerCompany(req.user.id);
  const activeProfile = db.prepare('SELECT * FROM work_profiles WHERE user_id = ? AND is_active = 1').get(req.user.id);
  const today = todayIso();

  // --- Pull every campaign + batch + candidate for this employer ---------
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE employer_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const campaignsFull = campaigns.map((camp) => {
    const batches = db.prepare('SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY call_date ASC').all(camp.id);
    const batchesWithCandidates = batches.map((batch) => ({
      ...batch,
      candidates: db.prepare('SELECT * FROM campaign_candidates WHERE batch_id = ? ORDER BY order_index ASC').all(batch.id)
        .map((c) => ({ ...c, extra_data: JSON.parse(c.extra_data || '{}') })),
    }));
    return { ...camp, batches: batchesWithCandidates };
  });

  const allCandidates = campaignsFull.flatMap((c) => c.batches.flatMap((b) => b.candidates.map((cand) => ({ ...cand, campaignId: c.id, campaignName: c.name }))));

  // --- Greeting + today summary -------------------------------------------
  const todaysBatchCandidates = allCandidates.filter((c) => {
    const batch = campaignsFull.flatMap((camp) => camp.batches).find((b) => b.id === c.batch_id);
    return batch && batch.call_date === today;
  });
  const activeCampaignIdsToday = new Set(todaysBatchCandidates.map((c) => c.campaignId));

  // --- Stats row (today only) ---------------------------------------------
  const todaysMade = todaysBatchCandidates.filter((c) => c.call_status !== 'not_called');
  const todaysAnswered = todaysMade.filter((c) => c.call_status === 'answered');
  const todaysConversations = todaysAnswered.filter((c) => c.duration_seconds > 60);
  const todaysCallbacks = todaysMade.filter((c) => c.outcome === 'Callback Requested');
  const avgDuration = todaysAnswered.length
    ? Math.round(todaysAnswered.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / todaysAnswered.length)
    : 0;

  const stats = {
    todaysCalls: { made: todaysMade.length, total: todaysBatchCandidates.length, pct: todaysBatchCandidates.length ? Math.round((todaysMade.length / todaysBatchCandidates.length) * 100) : 0 },
    connected: { count: todaysAnswered.length, pct: todaysMade.length ? Math.round((todaysAnswered.length / todaysMade.length) * 100) : 0 },
    conversations: { count: todaysConversations.length },
    callbackRequested: { count: todaysCallbacks.length },
    avgDurationSeconds: avgDuration,
  };

  // --- Active campaign: most recent call activity, else most recently created
  let activeCampaign = null;
  let queueCandidates = [];
  if (campaignsFull.length > 0) {
    const withActivity = campaignsFull
      .map((c) => {
        const lastCalledAt = c.batches.flatMap((b) => b.candidates).reduce((max, cand) => (cand.called_at && cand.called_at > max ? cand.called_at : max), '');
        return { campaign: c, lastCalledAt };
      })
      .sort((a, b) => (b.lastCalledAt || '').localeCompare(a.lastCalledAt || ''));

    const chosen = withActivity[0].lastCalledAt ? withActivity[0].campaign : campaignsFull[0];
    const relevantBatch = chosen.batches.find((b) => b.call_date === today)
      || chosen.batches.find((b) => b.call_date <= today)
      || chosen.batches[0];

    if (relevantBatch) {
      queueCandidates = relevantBatch.candidates;
      const buckets = { connected: 0, in_conversation: 0, callback: 0, not_reached: 0 };
      for (const c of queueCandidates) {
        const status = candidateStatus(c);
        if (status === 'no_answer') buckets.not_reached += 1;
        else buckets[status] += 1;
      }
      const totalCandidates = chosen.batches.reduce((sum, b) => sum + b.candidates.length, 0);
      const totalCalled = chosen.batches.reduce((sum, b) => sum + b.candidates.filter((c) => c.call_status !== 'not_called').length, 0);

      activeCampaign = {
        id: chosen.id,
        name: chosen.name,
        candidateCount: totalCandidates,
        createdAt: chosen.created_at,
        progress: { called: totalCalled, total: totalCandidates },
        donut: { ...buckets, total: queueCandidates.length },
        batchId: relevantBatch.id,
        batchDate: relevantBatch.call_date,
      };
    }
  }

  // The queue table itself spans every campaign's today-batch (not just the
  // single "active" campaign shown in the hero card above), so the Campaign
  // filter on the Calling Queue panel has something real to filter across.
  const callingQueue = todaysBatchCandidates.map((c) => {
    const { name } = resolveCandidateName(c);
    return {
      id: c.id,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      name,
      phone: c.phone,
      jobRole: c.job_role || '',
      company: c.extra_data?.Company || c.extra_data?.company || (company ? company.name : ''),
      status: candidateStatus(c),
      callStatus: c.call_status,
      outcome: c.outcome || null,
      lastActionAt: c.called_at || null,
      callbackAt: c.callback_at || null,
    };
  });

  const campaignsSummary = campaignsFull.map((c) => ({ id: c.id, name: c.name }));

  // --- Verification --------------------------------------------------------
  const verification = {
    abnVerified: !!company?.abn_verified,
    workEmailVerified: !!company?.email_verified,
  };

  // --- Today's tasks ---------------------------------------------------------
  const callbacksDueToday = allCandidates.filter((c) => c.callback_at && c.callback_at.slice(0, 10) === today).length;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newCandidatesThisWeek = allCandidates.filter((c) => c.created_at >= weekAgo).length;
  const campaignNeedingAttention = campaignsFull.find((c) => {
    const batch = c.batches.find((b) => b.call_date === today);
    return batch && batch.candidates.length > 0 && batch.candidates.every((cand) => cand.call_status !== 'not_called');
  });

  const tasks = {
    callbacksDueToday,
    newCandidatesThisWeek,
    campaignNeedsAttention: !!campaignNeedingAttention,
    campaignNeedsAttentionName: campaignNeedingAttention ? campaignNeedingAttention.name : null,
    campaignNeedsAttentionId: campaignNeedingAttention ? campaignNeedingAttention.id : null,
  };

  // --- Recent calls (unified log — covers ad-hoc and campaign calls) -------
  // LEFT JOINed through to campaign_candidates/campaigns (mirrors calls.js's
  // /history route) so each recent call carries candidateId/campaignId for
  // the three-dot menu's View Candidate Profile / Schedule Callback actions.
  const recentCalls = db.prepare(`
    SELECT calls.id, calls.receiver_name, calls.job_role, calls.call_status, calls.created_at,
      cc.id as candidate_id, camp.id as campaign_id, camp.name as campaign_name
    FROM calls
    LEFT JOIN campaign_candidates cc ON cc.call_id = calls.id
    LEFT JOIN campaign_batches cb ON cb.id = cc.batch_id
    LEFT JOIN campaigns camp ON camp.id = cb.campaign_id
    WHERE calls.caller_user_id = ?
    ORDER BY calls.created_at DESC LIMIT 8
  `).all(req.user.id);

  // --- Insights from real call history --------------------------------------
  const myCalls = db.prepare('SELECT caller_user_id, call_status, created_at FROM calls WHERE caller_user_id = ?').all(req.user.id);
  let teamCalls = [];
  if (company) {
    const memberIds = db.prepare('SELECT user_id FROM company_members WHERE company_id = ?').all(company.id).map((r) => r.user_id);
    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(',');
      teamCalls = db.prepare(`SELECT caller_user_id, call_status, created_at FROM calls WHERE caller_user_id IN (${placeholders})`).all(...memberIds);
    }
  }
  const insights = computeInsights(myCalls, teamCalls, req.user.id);

  // --- My Team snapshot (Part 10, admins only) ------------------------------
  // getEmployerCompany's JOIN doesn't surface member_role, so it's looked up
  // separately here. Hidden entirely (myTeam stays null) for non-owner
  // members — the frontend sidebar card only renders when this is present.
  let myTeam = null;
  if (company) {
    const membership = db.prepare('SELECT member_role FROM company_members WHERE user_id = ? AND company_id = ?').get(req.user.id, company.id);
    if (membership && membership.member_role === 'owner') {
      const memberIds = db.prepare("SELECT user_id FROM company_members WHERE company_id = ? AND (deactivated IS NULL OR deactivated = 0)").all(company.id).map((r) => r.user_id);
      let activeToday = 0;
      let onCallNow = 0;
      if (memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(',');
        activeToday = db.prepare(`SELECT COUNT(DISTINCT caller_user_id) as n FROM calls WHERE caller_user_id IN (${placeholders}) AND date(created_at) = date(?)`).get(...memberIds, today).n;
        // "Currently making calls" = an 'initiated' call less than 10
        // minutes old. Older initiated rows are treated as stale (the
        // Twilio status webhook never resolved them — e.g. a dropped
        // browser tab) rather than an indefinitely "active" call.
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        onCallNow = db.prepare(`SELECT COUNT(DISTINCT caller_user_id) as n FROM calls WHERE caller_user_id IN (${placeholders}) AND call_status = 'initiated' AND created_at >= ?`).get(...memberIds, cutoff).n;
      }
      myTeam = { totalMembers: memberIds.length, activeToday, onCallNow };
    }
  }

  res.json({
    greeting: {
      firstName: (req.user.full_name || '').split(' ')[0] || 'there',
      jobTitle: activeProfile ? activeProfile.designation : null,
    },
    todaySummary: {
      plannedCalls: todaysBatchCandidates.length,
      activeCampaignCount: activeCampaignIdsToday.size,
    },
    stats,
    activeCampaign,
    callingQueue,
    campaignsSummary,
    verification,
    tasks,
    recentCalls,
    insights,
    myTeam,
    notifications: { unreadCount: callbacksDueToday + (tasks.campaignNeedsAttention ? 1 : 0) },
  });
}

module.exports = router;
