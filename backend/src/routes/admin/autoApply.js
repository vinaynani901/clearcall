// Admin "Auto Apply" section (Part 8) + "AI Configuration" section (Part 10)
// of the Plan Control portal. Mounted at /api/admin/auto-apply — every route
// here already sits behind adminAuthMiddleware via routes/admin/index.js.
const express = require('express');
const db = require('../../db');
const { todayAEST } = require('../../utils/timezone');
const { setEnvVar } = require('../../utils/envFile');
const {
  runAutoApplyEngine, getEngineSettings, restartAutoApplyScheduler,
} = require('../../services/autoApplyEngine');
const { getProviderStatus, testProvider, PROVIDER_CONFIG, getActiveProvider } = require('../../services/aiTailor');

const router = express.Router();

function rowsToday(table, dateExpr = 'run_at') {
  // auto_apply_log.run_at is UTC (SQLite datetime('now')) — re-derive each
  // row's real AEST calendar date in JS rather than a SQL date() compare,
  // so this agrees with every other AEST-aware read in the Auto Apply
  // feature (see utils/timezone.js).
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  const today = todayAEST();
  return rows.filter((r) => todayAEST(new Date(`${String(r[dateExpr]).replace(' ', 'T')}Z`)) === today);
}

// --- Part 8: Auto Apply engine stats + controls ---------------------------

// GET /api/admin/auto-apply/stats
router.get('/stats', (req, res) => {
  const todaysLogRows = rowsToday('auto_apply_log', 'run_at');
  const totalRunsToday = new Set(todaysLogRows.map((r) => r.run_id)).size;
  const totalApplicationsToday = todaysLogRows.reduce((sum, r) => sum + (r.applications_submitted || 0), 0);

  const enabledCount = db.prepare("SELECT COUNT(*) as n FROM auto_apply_preferences WHERE is_active = 1").get().n;

  const autoApplied = db.prepare("SELECT match_score, status FROM job_applications WHERE source = 'auto_apply'").all();
  const scores = autoApplied.map((a) => a.match_score).filter((s) => typeof s === 'number');
  const averageMatchScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // "Success rate" — % of auto-applied jobs that have moved past "awaiting"
  // (interview, offer, or rejected all count as "received a response";
  // withdrawn is excluded from the denominator since the job seeker pulled
  // it, not the employer responding).
  const responded = autoApplied.filter((a) => ['interview', 'offer', 'rejected'].includes(a.status)).length;
  const eligible = autoApplied.filter((a) => a.status !== 'withdrawn').length;
  const successRate = eligible > 0 ? Math.round((responded / eligible) * 100) : null;

  const settings = getEngineSettings();
  const activeProvider = getActiveProvider();

  res.json({
    totalRunsToday,
    totalApplicationsSubmittedToday: totalApplicationsToday,
    jobSeekersWithAutoApplyEnabled: enabledCount,
    averageMatchScore,
    successRate,
    totalAutoApplicationsAllTime: autoApplied.length,
    activeAiProvider: activeProvider ? PROVIDER_CONFIG[activeProvider].label : 'Not configured',
    engine: { paused: !!settings.paused, runFrequencyMinutes: settings.run_frequency_minutes },
  });
});

// GET /api/admin/auto-apply/settings
router.get('/settings', (req, res) => {
  const settings = getEngineSettings();
  res.json({ paused: !!settings.paused, runFrequencyMinutes: settings.run_frequency_minutes });
});

// PUT /api/admin/auto-apply/settings — body: { paused?, runFrequencyMinutes? }.
// Changing the frequency restarts the interval immediately so the new
// cadence takes effect without waiting for the next server boot.
router.put('/settings', (req, res) => {
  const { paused, runFrequencyMinutes } = req.body;
  const current = getEngineSettings();

  const nextPaused = typeof paused === 'boolean' ? (paused ? 1 : 0) : current.paused;
  const nextFrequency = Number.isFinite(Number(runFrequencyMinutes)) && Number(runFrequencyMinutes) > 0
    ? Math.round(Number(runFrequencyMinutes)) : current.run_frequency_minutes;

  db.prepare("UPDATE auto_apply_engine_settings SET paused = ?, run_frequency_minutes = ?, updated_at = datetime('now') WHERE id = 'singleton'")
    .run(nextPaused, nextFrequency);

  if (nextFrequency !== current.run_frequency_minutes) restartAutoApplyScheduler();

  res.json({ paused: !!nextPaused, runFrequencyMinutes: nextFrequency });
});

// POST /api/admin/auto-apply/run-now — manual trigger, useful for verifying
// the engine works without waiting for the next scheduled interval.
router.post('/run-now', async (req, res) => {
  try {
    const result = await runAutoApplyEngine();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/auto-apply/log — full run history, most recent first.
router.get('/log', (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const rows = db.prepare(`
    SELECT l.*, u.full_name as user_name, u.email as user_email
    FROM auto_apply_log l JOIN users u ON u.id = l.user_id
    ORDER BY l.run_at DESC LIMIT ?
  `).all(limit);
  res.json({ log: rows });
});

// GET /api/admin/auto-apply/jobseeker/:userId — one job seeker's full Auto
// Apply history (run log + applications the engine actually submitted).
router.get('/jobseeker/:userId', (req, res) => {
  const user = db.prepare("SELECT id, full_name, email, plan FROM users WHERE id = ? AND role = 'jobseeker'").get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });

  const preferences = db.prepare('SELECT * FROM auto_apply_preferences WHERE user_id = ?').get(req.params.userId);
  const log = db.prepare('SELECT * FROM auto_apply_log WHERE user_id = ? ORDER BY run_at DESC LIMIT 100').all(req.params.userId);
  const applications = db.prepare(`
    SELECT * FROM job_applications WHERE user_id = ? AND source = 'auto_apply' ORDER BY created_at DESC LIMIT 100
  `).all(req.params.userId);

  res.json({
    user,
    isActive: !!(preferences && preferences.is_active),
    log,
    applications,
  });
});

// --- Part 10: AI Configuration ---------------------------------------

// GET /api/admin/auto-apply/ai-config — per-provider configured/active
// status, cost reference, and last test result.
router.get('/ai-config', (req, res) => {
  res.json({ providers: getProviderStatus(), activeProvider: getActiveProvider() });
});

// PUT /api/admin/auto-apply/ai-config/provider — body: { provider }. Updates
// AI_PROVIDER in .env (and process.env immediately) — see utils/envFile.js.
router.put('/ai-config/provider', (req, res) => {
  const { provider } = req.body;
  if (!PROVIDER_CONFIG[provider]) return res.status(400).json({ error: `Unknown provider: ${provider}` });

  setEnvVar('AI_PROVIDER', provider);
  res.json({
    message: `AI_PROVIDER set to ${provider} — takes effect immediately, no restart needed (every tailoring call reads .env fresh).`,
    activeProvider: getActiveProvider(),
  });
});

// POST /api/admin/auto-apply/ai-config/test/:provider — runs a real sample
// tailoring call (if the provider's key is configured) and records the
// result for the "last test result / pass or fail" display.
router.post('/ai-config/test/:provider', async (req, res) => {
  const { provider } = req.params;
  if (!PROVIDER_CONFIG[provider]) return res.status(400).json({ error: `Unknown provider: ${provider}` });
  const result = await testProvider(provider);
  res.json(result);
});

module.exports = router;
