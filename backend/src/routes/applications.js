const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendPushToUser } = require('../services/push');
const fcm = require('../services/fcm');
const { createNotification } = require('../services/notifications');

const router = express.Router();

const STATUS_LABEL = { awaiting: 'Awaiting Response', interview: 'Interview Scheduled', offer: 'Offer Received', rejected: 'Rejected', withdrawn: 'Withdrawn' };

// Fire-and-forget notification when an application's status changes,
// respecting the job seeker's notif_application_updates toggle in Settings.
// Sent over both channels (web push + FCM) best-effort — a failure on
// either never throws or blocks the response.
function notifyApplicationStatusChange(userId, application) {
  const user = db.prepare('SELECT notif_application_updates FROM users WHERE id = ?').get(userId);
  if (!user || !user.notif_application_updates) return;

  const title = 'Application Update';
  const body = `${application.company_name} — ${STATUS_LABEL[application.status] || application.status}`;
  const data = { applicationId: application.id, status: application.status };

  createNotification(userId, { type: 'application_update', title, message: body, link: '/jobseeker/applications' });

  sendPushToUser(userId, { title, body, url: '/jobseeker/applications', tag: 'application-update', data })
    .catch((err) => console.error('[applications] Web push failed:', err.message));
  fcm.sendFcmToUser(userId, { title, body, data })
    .catch((err) => console.error('[applications] FCM failed:', err.message));
}

function requireJobseeker(req, res, next) {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  next();
}

router.use(authMiddleware, requireJobseeker);

// GET /api/applications — list, optionally filtered by status/search.
// LEFT JOINs resume_versions so every "ClearCall Applied" (source =
// auto_apply) row already carries whether AI tailoring was actually used
// (was_tailored/ai_provider_used) without the frontend needing a second
// request per card — same match_score/minutes_after_posting/
// resume_version_id columns on job_applications itself power the rest of
// the "ClearCall Applied" section (Part 6).
router.get('/', (req, res) => {
  const { status, q } = req.query;
  let query = `
    SELECT ja.*, rv.was_tailored as resume_was_tailored, rv.ai_provider_used as resume_ai_provider_used
    FROM job_applications ja
    LEFT JOIN resume_versions rv ON rv.id = ja.resume_version_id
    WHERE ja.user_id = ?
  `;
  const params = [req.user.id];

  if (status && status !== 'all') {
    query += ' AND ja.status = ?';
    params.push(status);
  }
  if (q) {
    query += ' AND (ja.company_name LIKE ? OR ja.job_title LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  query += ' ORDER BY ja.date_applied DESC, ja.created_at DESC';

  const applications = db.prepare(query).all(...params);
  res.json({ applications });
});

// GET /api/applications/:id
router.get('/:id', (req, res) => {
  const application = db.prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  res.json({ application });
});

// POST /api/applications — manual entry is intentionally disabled. Job
// seekers should never be able to hand-type an application into existence;
// real records only ever come from Apply Now on a ClearCall Direct job
// (routes/jobs.js :id/apply), Apply Now on an external Adzuna job
// (routes/jobs.js /apply-external), or Gmail auto-import (services/gmail.js).
// Kept as a route (rather than deleted) so hitting it returns a clear,
// honest error instead of a generic 404 — this is enforced here, not just
// hidden in the UI, so calling the API directly can't bypass it either.
router.post('/', (req, res) => {
  res.status(410).json({ error: 'Manual application entry has been removed. Applications are created automatically when you apply through ClearCall Jobs or connect Gmail.' });
});

// PUT /api/applications/:id — update status/notes/interview time/etc.
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Application not found' });

  const { status, interviewAt, notes, companyName, jobTitle, platform, dateApplied, jobDescription, salaryRange } = req.body;
  if (status && !['awaiting', 'interview', 'offer', 'rejected', 'withdrawn'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.prepare(`
    UPDATE job_applications SET
      status = ?, interview_at = ?, notes = ?, company_name = ?, job_title = ?, platform = ?,
      date_applied = ?, job_description = ?, salary_range = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status || existing.status,
    interviewAt !== undefined ? interviewAt : existing.interview_at,
    notes !== undefined ? notes : existing.notes,
    companyName || existing.company_name,
    jobTitle || existing.job_title,
    platform !== undefined ? platform : existing.platform,
    dateApplied || existing.date_applied,
    jobDescription !== undefined ? jobDescription : existing.job_description,
    salaryRange !== undefined ? salaryRange : existing.salary_range,
    req.params.id
  );

  const application = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(req.params.id);
  if (status && status !== existing.status) {
    notifyApplicationStatusChange(req.user.id, application);
  }
  res.json({ application });
});

// DELETE /api/applications/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM job_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Application not found' });
  db.prepare('DELETE FROM job_applications WHERE id = ?').run(req.params.id);
  res.json({ message: 'Application deleted' });
});

module.exports = router;
