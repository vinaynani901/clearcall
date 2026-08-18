// Job seeker-facing Auto Apply endpoints — preferences CRUD (Part 1),
// today's slot usage, this-month's auto-applied stat (Part 6 dashboard
// stat), and reading back a resume_versions row (the "View Resume Used"
// button on both the per-application notification and the tracker).
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { getFeatureValue, hasFeature } = require('../services/featureFlags');
const { todayAEST } = require('../utils/timezone');
const { getDailyUsage } = require('../services/autoApplyEngine');

const router = express.Router();

function requireJobseeker(req, res, next) {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  next();
}
router.use(authMiddleware, requireJobseeker);

const JSON_FIELDS = ['jobTitles', 'industries', 'locations', 'employmentTypes', 'experienceLevels', 'excludedCompanies', 'excludedKeywords'];

function serializePreferences(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobTitles: JSON.parse(row.job_titles || '[]'),
    industries: JSON.parse(row.industries || '[]'),
    locations: JSON.parse(row.locations || '[]'),
    salaryMinimum: row.salary_minimum,
    employmentTypes: JSON.parse(row.employment_types || '[]'),
    experienceLevels: JSON.parse(row.experience_levels || '[]'),
    excludedCompanies: JSON.parse(row.excluded_companies || '[]'),
    excludedKeywords: JSON.parse(row.excluded_keywords || '[]'),
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
}

// GET /api/auto-apply/preferences — preferences (or null if never saved)
// plus the resolved plan gate so the frontend can render the locked state,
// slot counter, and Priority Apply badge from one call.
router.get('/preferences', (req, res) => {
  const row = db.prepare('SELECT * FROM auto_apply_preferences WHERE user_id = ?').get(req.user.id);
  const dailyLimit = getFeatureValue('user', req.user.id, 'auto_apply_slots_per_day');
  const numericLimit = typeof dailyLimit === 'number' ? dailyLimit : 0;
  const usage = getDailyUsage(req.user.id, todayAEST());

  res.json({
    preferences: serializePreferences(row),
    plan: req.user.plan,
    locked: numericLimit <= 0,
    dailyLimit: numericLimit,
    slotsUsedToday: usage.slots_used || 0,
    slotsRemainingToday: Math.max(0, numericLimit - (usage.slots_used || 0)),
    aiResumeTailoring: hasFeature('user', req.user.id, 'ai_resume_tailoring'),
    instantPriorityApply: hasFeature('user', req.user.id, 'instant_priority_apply'),
  });
});

// PUT /api/auto-apply/preferences — create-or-update, upsert style. Locked
// (Free plan, 0 daily slots) can never set isActive true even if they send
// it — the toggle itself is gated server-side, not just hidden in the UI.
router.put('/preferences', (req, res) => {
  const dailyLimit = getFeatureValue('user', req.user.id, 'auto_apply_slots_per_day');
  const numericLimit = typeof dailyLimit === 'number' ? dailyLimit : 0;
  if (numericLimit <= 0 && req.body.isActive) {
    return res.status(403).json({
      error: 'Auto Apply is a Premium feature. Upgrade your plan to turn it on.',
      featureLocked: true,
      feature: 'auto_apply_slots_per_day',
    });
  }

  const body = req.body || {};
  const salaryMinimum = body.salaryMinimum === '' || body.salaryMinimum === undefined || body.salaryMinimum === null
    ? null : Number(body.salaryMinimum);

  const existing = db.prepare('SELECT id FROM auto_apply_preferences WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(`
      UPDATE auto_apply_preferences SET
        job_titles = ?, industries = ?, locations = ?, salary_minimum = ?,
        employment_types = ?, experience_levels = ?, excluded_companies = ?, excluded_keywords = ?,
        is_active = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      JSON.stringify(asArray(body.jobTitles)), JSON.stringify(asArray(body.industries)), JSON.stringify(asArray(body.locations)),
      salaryMinimum, JSON.stringify(asArray(body.employmentTypes)), JSON.stringify(asArray(body.experienceLevels)),
      JSON.stringify(asArray(body.excludedCompanies)), JSON.stringify(asArray(body.excludedKeywords)),
      body.isActive ? 1 : 0, req.user.id
    );
  } else {
    db.prepare(`
      INSERT INTO auto_apply_preferences (
        id, user_id, job_titles, industries, locations, salary_minimum,
        employment_types, experience_levels, excluded_companies, excluded_keywords, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId('aaprefs'), req.user.id,
      JSON.stringify(asArray(body.jobTitles)), JSON.stringify(asArray(body.industries)), JSON.stringify(asArray(body.locations)),
      salaryMinimum, JSON.stringify(asArray(body.employmentTypes)), JSON.stringify(asArray(body.experienceLevels)),
      JSON.stringify(asArray(body.excludedCompanies)), JSON.stringify(asArray(body.excludedKeywords)),
      body.isActive ? 1 : 0
    );
  }

  const row = db.prepare('SELECT * FROM auto_apply_preferences WHERE user_id = ?').get(req.user.id);
  res.json({ preferences: serializePreferences(row) });
});

// GET /api/auto-apply/stats — powers the "auto-applied this month" dashboard
// stat (Part 6) on My Applications.
router.get('/stats', (req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const count = db.prepare(`
    SELECT COUNT(*) as n FROM job_applications WHERE user_id = ? AND source = 'auto_apply' AND created_at >= ?
  `).get(req.user.id, monthStart).n;
  res.json({ autoAppliedThisMonth: count });
});

// GET /api/auto-apply/resume-version/:id — "View Resume Used" — the exact
// resume text (tailored or base) actually submitted with one auto-applied
// (or agent-applied-with-AI-in-future) application.
router.get('/resume-version/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM resume_versions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Resume version not found' });
  res.json({
    resumeVersion: {
      id: row.id,
      tailoredContent: row.tailored_content,
      aiProviderUsed: row.ai_provider_used,
      jobTitleTailoredFor: row.job_title_tailored_for,
      matchScore: row.match_score,
      wasTailored: !!row.was_tailored,
      createdAt: row.created_at,
    },
  });
});

module.exports = router;
