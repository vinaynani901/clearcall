const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const adzuna = require('../services/adzuna');
const { checkCountLimit, checkUsageLimit, incrementUsage, getCompanyIdForUser } = require('../services/featureFlags');

const router = express.Router();

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'contract'];

function requireEmployerCompany(req, res) {
  if (req.user.role !== 'employer') { res.status(403).json({ error: 'Employer account required' }); return null; }
  const companyId = getCompanyIdForUser(req.user.id);
  if (!companyId) { res.status(404).json({ error: 'No company profile found for this user' }); return null; }
  return companyId;
}

function serializeEmployerJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    industry: row.industry,
    location: row.location,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    skills: JSON.parse(row.skills || '[]'),
    applicationDeadline: row.application_deadline,
    contactRecruiter: row.contact_recruiter,
    status: row.status,
    applicationCount: row.application_count,
    postedAt: row.posted_at,
  };
}

// Shared by both apply routes below — the free plan caps tracked
// applications at 10; premium is unlimited. Returns an error response body
// (not a thrown error) so callers can `return res.status(403).json(...)`
// directly.
function applicationLimitError(userId) {
  const count = db.prepare('SELECT COUNT(*) as n FROM job_applications WHERE user_id = ?').get(userId).n;
  const check = checkCountLimit('user', userId, 'applications_limit', count);
  if (check.allowed) return null;
  return {
    error: `You have reached the limit of ${check.limit} tracked applications on the free plan. Upgrade to Premium to track unlimited applications.`,
    featureLocked: true,
    feature: 'applications_limit',
  };
}

function mapClearCallJob(row) {
  return {
    id: row.id,
    source: 'clearcall',
    verified: !!row.company_abn_verified,
    title: row.title,
    companyName: row.company_name || 'ClearCall Employer',
    companyLogoUrl: row.company_logo_url || null,
    companyId: row.company_id,
    location: row.location,
    employmentType: row.employment_type,
    salaryRange: row.salary_range,
    description: row.description,
    skills: JSON.parse(row.skills || '[]'),
    postedAt: row.posted_at,
  };
}

// GET /api/jobs — merges real ClearCall direct postings with Adzuna
// external results. verifiedOnly filters to ClearCall direct jobs only
// (every ClearCall direct posting requires a verified employer account).
// When q is blank (the very first load, before the person has typed
// anything) no `what` keyword is sent to Adzuna at all, rather than
// searching a made-up default term — Adzuna's own default ordering for an
// unfiltered /jobs/au/search/1 call already returns a broad, popular spread
// of current Australian listings, which is exactly "popular Australian
// jobs" without artificially narrowing results with a guessed keyword.
router.get('/', authMiddleware, async (req, res) => {
  const { q, location, jobType, salaryMin, industry, verifiedOnly } = req.query;

  let ccQuery = `
    SELECT jobs.*, companies.name as company_name, companies.logo_url as company_logo_url,
      companies.abn_verified as company_abn_verified, companies.industry as company_industry
    FROM jobs
    LEFT JOIN companies ON companies.id = jobs.company_id
    WHERE jobs.active = 1
  `;
  const ccParams = [];
  if (q) {
    ccQuery += ' AND (jobs.title LIKE ? OR companies.name LIKE ?)';
    ccParams.push(`%${q}%`, `%${q}%`);
  }
  if (location) {
    ccQuery += ' AND jobs.location LIKE ?';
    ccParams.push(`%${location}%`);
  }
  if (jobType) {
    ccQuery += ' AND jobs.employment_type = ?';
    ccParams.push(jobType);
  }
  if (industry) {
    ccQuery += ' AND companies.industry = ?';
    ccParams.push(industry);
  }
  ccQuery += ' ORDER BY jobs.posted_at DESC';

  let clearcallJobs = db.prepare(ccQuery).all(...ccParams).map(mapClearCallJob);

  // salary_range on ClearCall Direct postings is free text (e.g. "$60,000 -
  // $70,000"), not structured — best-effort numeric filter by pulling the
  // first number out of the string rather than silently ignoring the filter.
  if (salaryMin) {
    const min = Number(salaryMin);
    clearcallJobs = clearcallJobs.filter((j) => {
      if (!j.salaryRange) return true; // don't hide postings with no salary listed
      const match = j.salaryRange.replace(/,/g, '').match(/\d+/);
      return match ? Number(match[0]) >= min : true;
    });
  }

  let externalJobs = [];
  let externalError = null;
  if (verifiedOnly !== 'true' && verifiedOnly !== '1') {
    const result = await adzuna.searchJobs({ what: q, where: location, salaryMin, industry, employmentType: jobType });
    externalJobs = result.jobs;
    externalError = result.error;
  }

  res.json({
    clearcallJobs,
    externalJobs,
    externalConfigured: adzuna.isConfigured(),
    externalError,
  });
});

// GET /api/jobs/meta/industries — static list for the Industry filter dropdown.
router.get('/meta/industries', authMiddleware, (req, res) => {
  res.json({ industries: adzuna.INDUSTRIES });
});

// --- Employer job postings (Plan Control Stage 6) ---------------------
// Starter plan and above; enforced purely through job_postings_monthly_limit
// (0 on Free acts as the gate, no separate boolean feature needed) using the
// same usage_tracking counter the dashboard usage card already reads.

// GET /api/jobs/employer/mine — this employer's own postings.
router.get('/employer/mine', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;
  const rows = db.prepare('SELECT * FROM jobs WHERE company_id = ? ORDER BY posted_at DESC').all(companyId);
  res.json({ jobs: rows.map(serializeEmployerJob) });
});

// POST /api/jobs/employer — create a new posting.
router.post('/employer', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;

  const check = checkUsageLimit('company', companyId, 'job_postings_monthly_limit', 'job_postings_count');
  if (!check.allowed) {
    return res.status(403).json({
      error: `You have reached the limit of ${check.limit} job posting${check.limit === 1 ? '' : 's'} this month on your current plan. Upgrade your plan to post more jobs.`,
      featureLocked: true,
      feature: 'job_postings_monthly_limit',
    });
  }

  const {
    title, description, industry, location, employmentType,
    salaryMin, salaryMax, skills, applicationDeadline, contactRecruiter,
  } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Job title is required' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Job description is required' });
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType)) {
    return res.status(400).json({ error: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` });
  }

  const id = newId('job');
  db.prepare(`
    INSERT INTO jobs (id, company_id, title, description, industry, location, employment_type,
      salary_min, salary_max, skills, application_deadline, contact_recruiter, posted_by_user_id, status, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)
  `).run(
    id, companyId, title.trim(), description.trim(), industry || null, location || null, employmentType || null,
    salaryMin || null, salaryMax || null, JSON.stringify(Array.isArray(skills) ? skills : []),
    applicationDeadline || null, contactRecruiter || null, req.user.id
  );

  incrementUsage('company', companyId, 'job_postings_count');

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  res.status(201).json({ job: serializeEmployerJob(row) });
});

// PUT /api/jobs/employer/:id — edit an existing posting.
router.put('/employer/:id', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!existing) return res.status(404).json({ error: 'Job posting not found' });

  const {
    title, description, industry, location, employmentType,
    salaryMin, salaryMax, skills, applicationDeadline, contactRecruiter,
  } = req.body;
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType)) {
    return res.status(400).json({ error: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` });
  }

  db.prepare(`
    UPDATE jobs SET title = ?, description = ?, industry = ?, location = ?, employment_type = ?,
      salary_min = ?, salary_max = ?, skills = ?, application_deadline = ?, contact_recruiter = ?
    WHERE id = ?
  `).run(
    title ? title.trim() : existing.title,
    description ? description.trim() : existing.description,
    industry !== undefined ? industry : existing.industry,
    location !== undefined ? location : existing.location,
    employmentType !== undefined ? employmentType : existing.employment_type,
    salaryMin !== undefined ? salaryMin : existing.salary_min,
    salaryMax !== undefined ? salaryMax : existing.salary_max,
    skills !== undefined ? JSON.stringify(skills) : existing.skills,
    applicationDeadline !== undefined ? applicationDeadline : existing.application_deadline,
    contactRecruiter !== undefined ? contactRecruiter : existing.contact_recruiter,
    req.params.id
  );

  res.json({ job: serializeEmployerJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id)) });
});

// POST /api/jobs/employer/:id/close — stop new applications; still visible
// in My Job Postings, no longer shown to job seekers (active = 0 already
// drives that exclusion in the search query above).
router.post('/employer/:id/close', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!existing) return res.status(404).json({ error: 'Job posting not found' });
  db.prepare("UPDATE jobs SET status = 'closed', active = 0 WHERE id = ?").run(req.params.id);
  res.json({ message: 'Job posting closed' });
});

// DELETE /api/jobs/employer/:id
router.delete('/employer/:id', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!existing) return res.status(404).json({ error: 'Job posting not found' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Job posting deleted' });
});

// GET /api/jobs/employer/:id/applications — applications received for one posting.
router.get('/employer/:id/applications', authMiddleware, (req, res) => {
  const companyId = requireEmployerCompany(req, res);
  if (!companyId) return;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
  if (!job) return res.status(404).json({ error: 'Job posting not found' });

  const rows = db.prepare(`
    SELECT ja.*, u.full_name, u.email, u.phone
    FROM job_applications ja JOIN users u ON u.id = ja.user_id
    WHERE ja.clearcall_job_id = ?
    ORDER BY ja.created_at DESC
  `).all(req.params.id);

  res.json({
    applications: rows.map((r) => ({
      id: r.id, applicantName: r.full_name, applicantEmail: r.email, applicantPhone: r.phone,
      status: r.status, appliedAt: r.created_at, source: r.source,
    })),
  });
});

// GET /api/jobs/:id — a single ClearCall direct job
router.get('/:id', authMiddleware, (req, res) => {
  const row = db.prepare(`
    SELECT jobs.*, companies.name as company_name, companies.logo_url as company_logo_url, companies.abn_verified as company_abn_verified
    FROM jobs LEFT JOIN companies ON companies.id = jobs.company_id
    WHERE jobs.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: mapClearCallJob(row) });
});

// POST /api/jobs/:id/apply — applying to a ClearCall direct job submits
// straight through ClearCall: creates a tracked application automatically.
router.post('/:id/apply', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });

  const row = db.prepare(`
    SELECT jobs.*, companies.name as company_name FROM jobs LEFT JOIN companies ON companies.id = jobs.company_id
    WHERE jobs.id = ? AND jobs.active = 1
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });

  const already = db.prepare("SELECT id FROM job_applications WHERE user_id = ? AND clearcall_job_id = ?").get(req.user.id, row.id);
  if (already) return res.status(409).json({ error: 'You have already applied to this job' });

  const limitError = applicationLimitError(req.user.id);
  if (limitError) return res.status(403).json(limitError);

  const id = newId('application');
  db.prepare(`
    INSERT INTO job_applications (id, user_id, company_name, job_title, platform, date_applied, job_description, salary_range, source, clearcall_job_id)
    VALUES (?, ?, ?, ?, 'ClearCall Direct', date('now'), ?, ?, 'clearcall', ?)
  `).run(id, req.user.id, row.company_name || 'ClearCall Employer', row.title, row.description, row.salary_range, row.id);

  db.prepare('UPDATE jobs SET application_count = application_count + 1 WHERE id = ?').run(row.id);

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
  res.status(201).json({ application });
});

// POST /api/jobs/apply-external — applying to an Adzuna (external) job.
// Adzuna listings aren't rows in our own `jobs` table, so this takes the
// job's details straight from the search result the job seeker is looking
// at (title/company/location/salary/applyUrl/externalId — all values
// already shown on the job card) rather than looking anything up server
// side. The frontend opens applyUrl in a new tab *and* calls this so a
// tracked record shows up in My Applications automatically, matching the
// same "no manual entry" flow as ClearCall Direct applies.
router.post('/apply-external', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });

  const { externalId, title, companyName, location, salaryRange, applyUrl } = req.body;
  if (!externalId || !title || !companyName) {
    return res.status(400).json({ error: 'externalId, title, and companyName are required' });
  }

  const already = db.prepare("SELECT id FROM job_applications WHERE user_id = ? AND external_job_id = ?").get(req.user.id, externalId);
  if (already) return res.status(409).json({ error: 'You have already applied to this job' });

  const limitError = applicationLimitError(req.user.id);
  if (limitError) return res.status(403).json(limitError);

  const id = newId('application');
  const description = [location ? `Location: ${location}` : null, applyUrl ? `Original listing: ${applyUrl}` : null].filter(Boolean).join('\n') || null;

  db.prepare(`
    INSERT INTO job_applications (id, user_id, company_name, job_title, platform, date_applied, job_description, salary_range, source, external_job_id)
    VALUES (?, ?, ?, ?, 'Adzuna', date('now'), ?, ?, 'adzuna', ?)
  `).run(id, req.user.id, companyName.trim(), title.trim(), description, salaryRange || null, externalId);

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
  res.status(201).json({ application });
});

// --- Bookmarks -------------------------------------------------------------

router.get('/me/bookmarks', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM job_bookmarks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const bookmarks = rows.map((r) => ({
    id: r.id,
    jobSource: r.job_source,
    jobId: r.job_id,
    externalKey: r.external_key,
    job: JSON.parse(r.snapshot || '{}'),
    createdAt: r.created_at,
  }));
  res.json({ bookmarks });
});

router.post('/me/bookmarks', authMiddleware, (req, res) => {
  const { jobSource, jobId, externalKey, job } = req.body;
  if (!jobSource || !job) return res.status(400).json({ error: 'jobSource and job are required' });

  const id = newId('bookmark');
  db.prepare(`
    INSERT INTO job_bookmarks (id, user_id, job_source, job_id, external_key, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, jobSource, jobId || null, externalKey || null, JSON.stringify(job));

  res.status(201).json({ bookmark: { id, jobSource, jobId, externalKey, job, createdAt: new Date().toISOString() } });
});

router.delete('/me/bookmarks/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT id FROM job_bookmarks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Bookmark not found' });
  db.prepare('DELETE FROM job_bookmarks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Bookmark removed' });
});

module.exports = router;
