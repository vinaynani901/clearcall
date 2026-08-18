// Auto Apply engine (Part 3) — the scheduled job that actually applies to
// jobs on behalf of Premium/Premium Plus job seekers who've turned Auto
// Apply on. Runs on the same lightweight in-process setInterval pattern as
// pilotScheduler.js/billingScheduler.js (no new cron dependency), default
// every 30 minutes but restartable at a different interval from the admin
// panel (Part 8's "change run frequency" control).
//
// Exact algorithm from the spec, steps 1-6:
//   1. All job seekers with auto_apply_preferences.is_active = 1 on
//      Premium/Premium Plus.
//   2. Skip a job seeker whose today's (AEST) daily slots are exhausted.
//   3. New job listings posted since the last run (the scheduler's own
//      interval — falls back to 30 minutes if unset).
//   4. Score every new job against that job seeker's preferences via
//      jobMatcher, keep only qualifying (>=60) matches, sort by score desc.
//   5. For each match not already applied to, while slots remain: tailor
//      the resume (Part 4), submit the application, notify (Part 5),
//      increment the daily slot count.
//   6. Log the run per job seeker in auto_apply_log.
const db = require('../db');
const { newId } = require('../utils/ids');
const { todayAEST } = require('../utils/timezone');
const { scoreJobMatch } = require('../utils/jobMatcher');
const { tailorResume } = require('./aiTailor');
const { getFeatureValue, hasFeature } = require('./featureFlags');
const { createNotification } = require('./notifications');
const { sendPushToUser } = require('./push');

// --- Small data-shaping helpers -------------------------------------------

function normalizeJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    industry: row.industry,
    location: row.location,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    companyName: row.company_name || 'ClearCall Employer',
    postedAt: row.posted_at,
  };
}

function deserializePreferences(row) {
  return {
    jobTitles: JSON.parse(row.job_titles || '[]'),
    industries: JSON.parse(row.industries || '[]'),
    locations: JSON.parse(row.locations || '[]'),
    salaryMinimum: row.salary_minimum,
    employmentTypes: JSON.parse(row.employment_types || '[]'),
    experienceLevels: JSON.parse(row.experience_levels || '[]'),
    excludedCompanies: JSON.parse(row.excluded_companies || '[]'),
    excludedKeywords: JSON.parse(row.excluded_keywords || '[]'),
  };
}

function formatSalaryRange(min, max) {
  const fmt = (n) => `$${Number(n).toLocaleString('en-AU')}`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return null;
}

// Renders a built resume's structured JSON sections into plain text so it
// can be handed to the AI tailoring prompt (or stored as the base-resume
// text when no AI key is configured). Mirrors the same field set
// routes/resumes.js uses to render the PDF/DOCX exports.
function resumeRowToText(row) {
  const pd = JSON.parse(row.personal_details || '{}');
  const experience = JSON.parse(row.experience || '[]');
  const education = JSON.parse(row.education || '[]');
  const skills = JSON.parse(row.skills || '[]');
  const certifications = JSON.parse(row.certifications || '[]');

  const lines = [];
  if (pd.fullName) lines.push(pd.fullName);
  if (row.summary) lines.push(`Professional Summary: ${row.summary}`);
  if (experience.length > 0) {
    lines.push('Work Experience:');
    experience.forEach((e) => lines.push(`- ${e.role || ''} at ${e.company || ''} (${e.startDate || ''} - ${e.endDate || 'Present'}): ${e.description || ''}`));
  }
  if (education.length > 0) {
    lines.push('Education:');
    education.forEach((e) => lines.push(`- ${e.qualification || ''}, ${e.institution || ''} (${e.startDate || ''} - ${e.endDate || ''})`));
  }
  if (skills.length > 0) lines.push(`Skills: ${skills.join(', ')}`);
  if (certifications.length > 0) lines.push(`Certifications: ${certifications.map((c) => c.name).filter(Boolean).join(', ')}`);
  return lines.join('\n');
}

// Prefers the job seeker's designated profile resume; falls back to their
// most recently updated built resume if the profile one isn't a built
// resume (e.g. they've uploaded a file instead) — an uploaded PDF/DOCX has
// no extractable text in this build, so there's nothing to tailor against
// in that case and the base (uploaded) resume is used as-is.
function getResumeForUser(userId) {
  const user = db.prepare('SELECT profile_resume_type, profile_resume_id FROM users WHERE id = ?').get(userId);
  if (!user) return { text: null, baseResumeId: null };

  if (user.profile_resume_type === 'built' && user.profile_resume_id) {
    const row = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(user.profile_resume_id, userId);
    if (row) return { text: resumeRowToText(row), baseResumeId: row.id };
  }

  const anyBuilt = db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId);
  if (anyBuilt) return { text: resumeRowToText(anyBuilt), baseResumeId: anyBuilt.id };

  return { text: null, baseResumeId: null };
}

// --- Daily slot usage (Part 7 — the engine only ever reads today's row) --

function getDailyUsage(userId, date) {
  const row = db.prepare('SELECT * FROM auto_apply_daily_usage WHERE user_id = ? AND date = ?').get(userId, date);
  return row || { slots_used: 0 };
}

function incrementDailySlot(userId) {
  const date = todayAEST();
  const existing = db.prepare('SELECT id FROM auto_apply_daily_usage WHERE user_id = ? AND date = ?').get(userId, date);
  if (existing) {
    db.prepare("UPDATE auto_apply_daily_usage SET slots_used = slots_used + 1, last_updated = datetime('now') WHERE id = ?").run(existing.id);
  } else {
    db.prepare('INSERT INTO auto_apply_daily_usage (id, user_id, date, slots_used) VALUES (?, ?, ?, 1)').run(newId('aausage'), userId, date);
  }
}

// --- Engine admin settings (Part 8 pause/frequency controls) -------------

function getEngineSettings() {
  return db.prepare("SELECT * FROM auto_apply_engine_settings WHERE id = 'singleton'").get() || { paused: 0, run_frequency_minutes: 30 };
}

// --- Per-application notification (Part 5) --------------------------------

async function notifyAutoApplication(userId, { applicationId, resumeVersionId, job, matchScore, tailorResult }) {
  const today = todayAEST();
  const usage = getDailyUsage(userId, today);
  const rawLimit = getFeatureValue('user', userId, 'auto_apply_slots_per_day');
  const limitLabel = rawLimit === Infinity ? 'unlimited' : rawLimit;

  const salaryRange = formatSalaryRange(job.salaryMin, job.salaryMax);
  const messageParts = [
    `${job.title} at ${job.companyName}`,
    job.location || null,
    salaryRange,
    `${matchScore}% match`,
    `${usage.slots_used}/${limitLabel} slots used today`,
  ].filter(Boolean);

  const title = 'ClearCall auto-applied on your behalf';
  const message = messageParts.join(' · ');
  const link = `/jobseeker/applications?openId=${applicationId}`;

  createNotification(userId, {
    type: 'auto_apply',
    title,
    message,
    link,
    // Structured payload behind the two notification action buttons the
    // spec calls for: "View Application" (the tracker row, via `link`
    // above) and "View Resume Used" (the resume_versions row this carries).
    actionData: { applicationId, resumeVersionId, wasTailored: tailorResult.wasTailored, aiProvider: tailorResult.provider },
  });

  try {
    await sendPushToUser(userId, {
      title,
      body: `${job.title} at ${job.companyName} — ${matchScore}% match`,
      url: link,
      tag: 'auto-apply',
      data: { applicationId, resumeVersionId },
    });
  } catch (err) {
    console.error(`[auto-apply-engine] Push notification failed for user ${userId}:`, err.message);
  }
}

// --- Submitting one application -------------------------------------------

async function submitAutoApplication(seekerUserId, job, matchScore) {
  const { text: baseResumeText, baseResumeId } = getResumeForUser(seekerUserId);
  const resumeText = baseResumeText || 'No resume on file — this candidate has not built or uploaded a resume yet.';

  // AI tailoring is gated by the ai_resume_tailoring plan feature (Premium
  // Plus only, per plan_limits) on top of aiTailor.js's own key-presence
  // check — a Premium job seeker without that feature always gets the base
  // resume submitted, exactly like "no AI key configured" does.
  const aiEligible = hasFeature('user', seekerUserId, 'ai_resume_tailoring') && !!baseResumeText;
  const tailorResult = aiEligible
    ? await tailorResume({ resumeText, jobDescription: job.description || '' })
    : { tailoredText: resumeText, provider: null, wasTailored: false };

  const applicationId = newId('application');
  const salaryRange = formatSalaryRange(job.salaryMin, job.salaryMax);
  const postedAtMs = job.postedAt ? new Date(`${job.postedAt.replace(' ', 'T')}Z`).getTime() : null;
  const minutesAfterPosting = postedAtMs ? Math.max(0, Math.round((Date.now() - postedAtMs) / 60000)) : null;

  db.prepare(`
    INSERT INTO job_applications (id, user_id, company_name, job_title, platform, date_applied, job_description, salary_range, source, clearcall_job_id, match_score, minutes_after_posting)
    VALUES (?, ?, ?, ?, 'ClearCall Direct', date('now'), ?, ?, 'auto_apply', ?, ?, ?)
  `).run(applicationId, seekerUserId, job.companyName, job.title, job.description, salaryRange, job.id, matchScore, minutesAfterPosting);

  db.prepare('UPDATE jobs SET application_count = application_count + 1 WHERE id = ?').run(job.id);

  const resumeVersionId = newId('resumever');
  db.prepare(`
    INSERT INTO resume_versions (id, user_id, base_resume_id, job_application_id, tailored_content, ai_provider_used, job_title_tailored_for, match_score, was_tailored)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(resumeVersionId, seekerUserId, baseResumeId, applicationId, tailorResult.tailoredText, tailorResult.provider, job.title, matchScore, tailorResult.wasTailored ? 1 : 0);

  db.prepare('UPDATE job_applications SET resume_version_id = ? WHERE id = ?').run(resumeVersionId, applicationId);

  incrementDailySlot(seekerUserId);
  await notifyAutoApplication(seekerUserId, { applicationId, resumeVersionId, job, matchScore, tailorResult });

  return applicationId;
}

function logRun(runId, userId, jobsChecked, jobsMatched, applicationsSubmitted) {
  db.prepare(`
    INSERT INTO auto_apply_log (id, run_id, user_id, jobs_checked, jobs_matched, applications_submitted)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(newId('aalog'), runId, userId, jobsChecked, jobsMatched, applicationsSubmitted);
}

// --- Main run ---------------------------------------------------------

async function runAutoApplyEngine() {
  const settings = getEngineSettings();
  if (settings.paused) {
    console.log('[auto-apply-engine] Skipped this run — engine is paused by an admin.');
    return { skipped: true, reason: 'paused' };
  }

  const lookbackMinutes = Math.max(1, settings.run_frequency_minutes || 30);
  const today = todayAEST();
  const runId = newId('aarun');

  // Step 1: every job seeker with Auto Apply switched on, on a plan that
  // actually includes slots (auto_apply_slots_per_day > 0 -> Premium/Premium Plus).
  const candidates = db.prepare(`
    SELECT p.*, u.plan as user_plan
    FROM auto_apply_preferences p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = 1 AND u.role = 'jobseeker'
  `).all().filter((row) => {
    const limit = getFeatureValue('user', row.user_id, 'auto_apply_slots_per_day');
    return typeof limit === 'number' && limit > 0;
  });

  // Step 3: new job listings since the last run window (shared across every
  // job seeker checked this run — re-scored per person in step 4).
  const newJobs = db.prepare(`
    SELECT jobs.*, companies.name as company_name
    FROM jobs LEFT JOIN companies ON companies.id = jobs.company_id
    WHERE jobs.active = 1 AND jobs.posted_at >= datetime('now', ?)
  `).all(`-${lookbackMinutes} minutes`).map(normalizeJob);

  let totalApplicationsSubmitted = 0;

  for (const row of candidates) {
    const preferences = deserializePreferences(row);
    const planLimit = getFeatureValue('user', row.user_id, 'auto_apply_slots_per_day');
    const numericLimit = typeof planLimit === 'number' ? planLimit : 0;

    // Step 2: skip if today's slots are already exhausted.
    const usage = getDailyUsage(row.user_id, today);
    let slotsRemaining = Math.max(0, numericLimit - usage.slots_used);
    if (slotsRemaining <= 0) {
      logRun(runId, row.user_id, newJobs.length, 0, 0);
      continue;
    }

    // Step 4: score every new job, keep qualifying matches, sort descending.
    const scored = newJobs
      .map((job) => ({ job, result: scoreJobMatch(job, preferences) }))
      .filter((x) => x.result.qualifies)
      .sort((a, b) => b.result.score - a.result.score);

    // Step 5: apply while slots remain, skipping jobs already applied to.
    let submitted = 0;
    for (const { job, result } of scored) {
      if (slotsRemaining <= 0) break;
      const already = db.prepare('SELECT id FROM job_applications WHERE user_id = ? AND clearcall_job_id = ?').get(row.user_id, job.id);
      if (already) continue;

      try {
        await submitAutoApplication(row.user_id, job, result.score);
        submitted += 1;
        slotsRemaining -= 1;
        totalApplicationsSubmitted += 1;
      } catch (err) {
        console.error(`[auto-apply-engine] Failed to submit auto application for user ${row.user_id}, job ${job.id}:`, err.message);
      }
    }

    // Step 6: log this job seeker's outcome for this run.
    logRun(runId, row.user_id, newJobs.length, scored.length, submitted);
  }

  const summary = { jobSeekersChecked: candidates.length, newJobsFound: newJobs.length, applicationsSubmitted: totalApplicationsSubmitted };
  console.log(`[auto-apply-engine] Run complete — ${summary.jobSeekersChecked} job seeker(s) checked, ${summary.newJobsFound} new job(s) found, ${summary.applicationsSubmitted} application(s) submitted.`);
  return summary;
}

// --- Scheduler (30 min default, admin-adjustable) -------------------------

let intervalHandle = null;

function startAutoApplyScheduler() {
  if (intervalHandle) return;
  const settings = getEngineSettings();
  const intervalMs = Math.max(1, settings.run_frequency_minutes || 30) * 60 * 1000;

  runAutoApplyEngine().catch((err) => console.error('[auto-apply-engine] Initial run failed:', err.message));
  intervalHandle = setInterval(() => {
    runAutoApplyEngine().catch((err) => console.error('[auto-apply-engine] Run failed:', err.message));
  }, intervalMs);
  if (intervalHandle.unref) intervalHandle.unref();
  console.log(`[auto-apply-engine] Scheduler started — running every ${settings.run_frequency_minutes || 30} minute(s).`);
}

function stopAutoApplyScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// Called by the admin route when the run-frequency control changes, so the
// new interval takes effect immediately rather than after the next restart.
function restartAutoApplyScheduler() {
  stopAutoApplyScheduler();
  startAutoApplyScheduler();
}

module.exports = {
  runAutoApplyEngine,
  startAutoApplyScheduler,
  stopAutoApplyScheduler,
  restartAutoApplyScheduler,
  getEngineSettings,
  // exported for reuse by routes/tests — jobMatcher-facing normalization,
  // preference parsing, and resume text rendering are all pure/deterministic.
  normalizeJob,
  deserializePreferences,
  resumeRowToText,
  getResumeForUser,
  getDailyUsage,
  formatSalaryRange,
};
