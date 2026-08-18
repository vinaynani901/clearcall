// Agency Pipeline (Plan Control Stage 3) + Connected Job Seekers (Stage 5).
// Both live under the employer side, gated by the company's plan: the
// pipeline itself needs `agency_pipeline` (Growth/Enterprise), the
// Connected Job Seekers section needs `job_seeker_connection` (also
// Growth/Enterprise) — see FEATURES_EMPLOYER in utils/planFeatures.js.
const express = require('express');
const db = require('../db');
const { newId } = require('../utils/ids');
const authMiddleware = require('../middleware/auth');
const { createNotification } = require('../services/notifications');
const { getCompanyIdForUser, hasFeature, checkCountLimit } = require('../services/featureFlags');

const router = express.Router();
router.use(authMiddleware);

function requireEmployerCompany(req, res) {
  if (req.user.role !== 'employer') { res.status(403).json({ error: 'Employer account required' }); return null; }
  const companyId = getCompanyIdForUser(req.user.id);
  if (!companyId) { res.status(404).json({ error: 'No company profile found for this user' }); return null; }
  return companyId;
}

// The cross-recruiter performance views (summary stats + the recruiter
// table/detail, which show every OTHER recruiter's own calls/answer rate)
// are owner-only — spec: "The agency admin account can see all recruiters
// combined," implying a regular recruiter does not. A recruiter's own
// dashboard (routes/dashboard.js) is already scoped to just their own
// calls/campaigns regardless of this check, so this only restricts the
// aggregate oversight view, not their day-to-day one.
function requirePipelineAccess(req, res) {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return null;
  if (!hasFeature('company', companyId, 'agency_pipeline')) {
    res.status(403).json({ error: 'This feature requires the Growth plan or above.', featureLocked: true, feature: 'agency_pipeline' });
    return null;
  }
  const membership = db.prepare('SELECT member_role FROM company_members WHERE company_id = ? AND user_id = ?').get(companyId, req.user.id);
  if (!membership || membership.member_role !== 'owner') {
    res.status(403).json({ error: 'Only the agency owner can view the combined recruiter pipeline.' });
    return null;
  }
  return companyId;
}

function requireJobSeekerConnectionAccess(req, res) {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return null;
  if (!hasFeature('company', companyId, 'job_seeker_connection')) {
    res.status(403).json({ error: 'This feature requires the Growth plan or above.', featureLocked: true, feature: 'job_seeker_connection' });
    return null;
  }
  return companyId;
}

function companyMemberIds(companyId) {
  return db.prepare('SELECT user_id FROM company_members WHERE company_id = ?').all(companyId).map((r) => r.user_id);
}

// --- Section: summary stat cards -----------------------------------------

router.get('/summary', (req, res) => {
  const companyId = requirePipelineAccess(req, res);
  if (!companyId) return;

  const memberIds = companyMemberIds(companyId);
  const placeholders = memberIds.map(() => '?').join(',') || 'NULL';
  const today = new Date().toISOString().slice(0, 10);

  const totalRecruiters = memberIds.length;
  const activeToday = memberIds.length === 0 ? 0 : db.prepare(`
    SELECT COUNT(DISTINCT caller_user_id) as n FROM calls
    WHERE caller_user_id IN (${placeholders}) AND created_at >= datetime('now', '-15 minutes')
  `).get(...memberIds).n;
  const totalCallsToday = memberIds.length === 0 ? 0 : db.prepare(`
    SELECT COUNT(*) as n FROM calls WHERE caller_user_id IN (${placeholders}) AND date(created_at) = date(?)
  `).get(...memberIds, today).n;
  const totalInterviewsToday = memberIds.length === 0 ? 0 : db.prepare(`
    SELECT COUNT(*) as n FROM campaign_candidates cc
    JOIN campaign_batches cb ON cb.id = cc.batch_id
    JOIN campaigns camp ON camp.id = cb.campaign_id
    WHERE camp.employer_user_id IN (${placeholders}) AND cc.outcome = 'Interview Scheduled' AND date(cc.called_at) = date(?)
  `).get(...memberIds, today).n;

  res.json({ totalRecruiters, activeToday, totalCallsToday, totalInterviewsToday });
});

// --- Section: recruiter table ---------------------------------------------

router.get('/recruiters', (req, res) => {
  const companyId = requirePipelineAccess(req, res);
  if (!companyId) return;

  const members = db.prepare(`
    SELECT cm.id as member_id, cm.user_id, cm.member_role, cm.deactivated, u.full_name, u.email
    FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ?
    ORDER BY cm.member_role = 'owner' DESC, u.full_name ASC
  `).all(companyId);

  const today = new Date().toISOString().slice(0, 10);

  const recruiters = members.map((m) => {
    const callsToday = db.prepare('SELECT call_status FROM calls WHERE caller_user_id = ? AND date(created_at) = date(?)').all(m.user_id, today);
    const answered = callsToday.filter((c) => c.call_status === 'answered').length;
    const answerRate = callsToday.length ? Math.round((answered / callsToday.length) * 100) : 0;
    const interviewsToday = db.prepare(`
      SELECT COUNT(*) as n FROM campaign_candidates cc
      JOIN campaign_batches cb ON cb.id = cc.batch_id
      JOIN campaigns camp ON camp.id = cb.campaign_id
      WHERE camp.employer_user_id = ? AND cc.outcome = 'Interview Scheduled' AND date(cc.called_at) = date(?)
    `).get(m.user_id, today).n;
    const campaignsActive = db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE employer_user_id = ?').get(m.user_id).n;
    const recentlyActive = db.prepare(`
      SELECT 1 FROM calls WHERE caller_user_id = ? AND created_at >= datetime('now', '-15 minutes') LIMIT 1
    `).get(m.user_id);

    return {
      memberId: m.member_id, userId: m.user_id, name: m.full_name, email: m.email,
      role: m.member_role, deactivated: !!m.deactivated,
      callsToday: callsToday.length, answerRate, interviewsToday, campaignsActive,
      status: recentlyActive ? 'active' : 'offline',
    };
  });

  res.json({ recruiters });
});

// GET /api/pipeline/recruiters/:userId — detail: full call history + campaign activity.
router.get('/recruiters/:userId', (req, res) => {
  const companyId = requirePipelineAccess(req, res);
  if (!companyId) return;

  const member = db.prepare('SELECT cm.*, u.full_name, u.email FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE cm.company_id = ? AND cm.user_id = ?').get(companyId, req.params.userId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  const calls = db.prepare('SELECT * FROM calls WHERE caller_user_id = ? ORDER BY created_at DESC LIMIT 200').all(member.user_id);
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE employer_user_id = ? ORDER BY created_at DESC').all(member.user_id);

  res.json({
    recruiter: { userId: member.user_id, name: member.full_name, email: member.email, role: member.member_role, deactivated: !!member.deactivated },
    calls,
    campaigns,
  });
});

// --- Section: Connected Job Seekers (Stage 5) ------------------------------

function jobSeekerDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'Job Seeker';
  const first = parts[0];
  const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return lastInitial ? `${first} ${lastInitial}` : first;
}

router.get('/connected-job-seekers', (req, res) => {
  const companyId = requireJobSeekerConnectionAccess(req, res);
  if (!companyId) return;

  const memberIds = companyMemberIds(companyId);
  if (memberIds.length === 0) return res.json({ jobSeekers: [] });
  const placeholders = memberIds.map(() => '?').join(',');

  const rows = db.prepare(`
    SELECT ac.jobseeker_user_id, MIN(ac.connected_at) as connected_at, u.full_name, u.looking_for_work
    FROM agent_clients ac JOIN users u ON u.id = ac.jobseeker_user_id
    WHERE ac.agent_user_id IN (${placeholders})
    GROUP BY ac.jobseeker_user_id
    ORDER BY connected_at DESC
  `).all(...memberIds);

  const jobSeekers = rows.map((r) => {
    const applications = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ? AND applied_by_user_id IN (' + placeholders + ')').get(r.jobseeker_user_id, ...memberIds).n;
    return {
      jobseekerId: r.jobseeker_user_id,
      displayName: jobSeekerDisplayName(r.full_name),
      profileType: r.looking_for_work ? 'Actively Looking' : 'Employed',
      applicationsSubmitted: applications,
      connectedAt: r.connected_at,
    };
  });

  res.json({ jobSeekers });
});

// GET /connected-job-seekers/:id/profile — read-only, respects the
// permission flags on whichever access key connected this job seeker to
// someone at this company.
router.get('/connected-job-seekers/:id/profile', (req, res) => {
  const companyId = requireJobSeekerConnectionAccess(req, res);
  if (!companyId) return;

  const memberIds = companyMemberIds(companyId);
  const placeholders = memberIds.map(() => '?').join(',') || 'NULL';
  const link = db.prepare(`SELECT * FROM agent_clients WHERE jobseeker_user_id = ? AND agent_user_id IN (${placeholders})`).get(req.params.id, ...memberIds);
  if (!link) return res.status(404).json({ error: 'This job seeker is not connected to your agency' });

  const key = db.prepare(`
    SELECT * FROM agent_access_keys WHERE jobseeker_user_id = ? AND agent_user_id IN (${placeholders}) AND revoked_at IS NULL
    ORDER BY redeemed_at DESC LIMIT 1
  `).get(req.params.id, ...memberIds);
  const canViewProfile = key ? !!key.can_view_profile : true;
  if (!canViewProfile) return res.status(403).json({ error: 'This job seeker has not granted profile access' });

  const user = db.prepare('SELECT id, full_name, email, phone, looking_for_work, resume_filename, resume_path FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Job seeker not found' });

  const resumes = db.prepare('SELECT id, name, template, personal_details, summary, experience, education, skills, certifications FROM resumes WHERE user_id = ? ORDER BY updated_at DESC').all(req.params.id);

  res.json({
    profile: {
      displayName: jobSeekerDisplayName(user.full_name),
      profileType: user.looking_for_work ? 'Actively Looking' : 'Employed',
      hasUploadedResume: !!user.resume_filename,
      resumes: resumes.map((r) => ({
        id: r.id, name: r.name, template: r.template,
        summary: r.summary,
        skills: (() => { try { return JSON.parse(r.skills || '[]'); } catch { return []; } })(),
        experience: (() => { try { return JSON.parse(r.experience || '[]'); } catch { return []; } })(),
        education: (() => { try { return JSON.parse(r.education || '[]'); } catch { return []; } })(),
      })),
    },
    canApplyForJobs: key ? !!key.can_apply_for_jobs : false,
  });
});

// POST /connected-job-seekers/:id/apply — apply to a ClearCall Direct job on behalf.
router.post('/connected-job-seekers/:id/apply', (req, res) => {
  const companyId = requireJobSeekerConnectionAccess(req, res);
  if (!companyId) return;
  applyOnBehalf(req, res, companyId, () => {
    const { jobId } = req.body;
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) return { error: 'Job not found', status: 404 };
    const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(job.company_id);
    const already = db.prepare("SELECT id FROM job_applications WHERE user_id = ? AND clearcall_job_id = ?").get(req.params.id, jobId);
    if (already) return { error: 'Already applied to this job', status: 409 };
    return {
      companyName: company?.name || 'Unknown company', jobTitle: job.title, source: 'agent', clearcallJobId: jobId,
    };
  });
});

// POST /connected-job-seekers/:id/apply-external — apply to an Adzuna job on behalf.
router.post('/connected-job-seekers/:id/apply-external', (req, res) => {
  const companyId = requireJobSeekerConnectionAccess(req, res);
  if (!companyId) return;
  applyOnBehalf(req, res, companyId, () => {
    const { companyName, jobTitle, jobDescription, salaryRange, externalJobId, platform } = req.body;
    if (!companyName || !jobTitle) return { error: 'companyName and jobTitle are required', status: 400 };
    return { companyName, jobTitle, jobDescription, salaryRange, source: 'agent', externalJobId, platform: platform || 'Adzuna' };
  });
});

function applyOnBehalf(req, res, companyId, buildApplication) {
  const memberIds = companyMemberIds(companyId);
  const placeholders = memberIds.map(() => '?').join(',') || 'NULL';
  const link = db.prepare(`SELECT * FROM agent_clients WHERE jobseeker_user_id = ? AND agent_user_id IN (${placeholders})`).get(req.params.id, ...memberIds);
  if (!link) return res.status(404).json({ error: 'This job seeker is not connected to your agency' });

  const key = db.prepare(`
    SELECT * FROM agent_access_keys WHERE jobseeker_user_id = ? AND agent_user_id IN (${placeholders}) AND revoked_at IS NULL
    ORDER BY redeemed_at DESC LIMIT 1
  `).get(req.params.id, ...memberIds);
  if (!key || !key.can_apply_for_jobs) {
    return res.status(403).json({ error: 'This job seeker has not granted permission to apply for jobs on their behalf' });
  }

  const built = buildApplication();
  if (built.error) return res.status(built.status || 400).json({ error: built.error });

  const id = newId('app');
  db.prepare(`
    INSERT INTO job_applications (id, user_id, company_name, job_title, platform, date_applied, job_description, salary_range, source, clearcall_job_id, external_job_id, applied_by_user_id)
    VALUES (?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.params.id, built.companyName, built.jobTitle, built.platform || 'ClearCall',
    built.jobDescription || null, built.salaryRange || null, built.source, built.clearcallJobId || null, built.externalJobId || null, req.user.id
  );

  if (built.clearcallJobId) {
    db.prepare('UPDATE jobs SET application_count = application_count + 1 WHERE id = ?').run(built.clearcallJobId);
  }

  createNotification(req.params.id, {
    type: 'agent_applied',
    title: 'Your agent applied on your behalf',
    message: `${req.user.full_name} applied for ${built.jobTitle} at ${built.companyName} on your behalf.`,
    link: '/jobseeker/applications',
  });

  res.status(201).json({ application: db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id) });
}

module.exports = router;
