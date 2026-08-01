const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');

const router = express.Router();

const VALID_REASONS = [
  'Felt like a scam',
  'Asked for personal information',
  'Asked for money or fees',
  'Company details seemed fake',
  'Caller was aggressive or inappropriate',
  'Other',
];

// POST /api/reports
router.post('/', authMiddleware, (req, res) => {
  const { reportedCompanyId, reportedPhone, reason, description, callId } = req.body;
  if (!reason || !VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: `Reason must be one of: ${VALID_REASONS.join(', ')}` });
  }
  if (!reportedCompanyId && !reportedPhone) {
    return res.status(400).json({ error: 'Either reportedCompanyId or reportedPhone is required' });
  }

  const id = newId('report');
  db.prepare(`
    INSERT INTO reports (id, reporter_user_id, reported_company_id, reported_phone, reason, description, call_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, reportedCompanyId || null, reportedPhone || null, reason, description || null, callId || null);

  let flagResult = null;

  if (reportedCompanyId) {
    db.prepare('UPDATE companies SET report_count = report_count + 1 WHERE id = ?').run(reportedCompanyId);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(reportedCompanyId);

    if (company) {
      let underReview = company.under_review;
      let suspended = company.suspension_status;

      if (company.report_count >= 5) {
        suspended = 1;
        underReview = 1;
      } else if (company.report_count >= 3) {
        underReview = 1;
      }

      if (underReview !== company.under_review || suspended !== company.suspension_status) {
        db.prepare('UPDATE companies SET under_review = ?, suspension_status = ? WHERE id = ?')
          .run(underReview, suspended, reportedCompanyId);
      }

      flagResult = {
        reportCount: company.report_count,
        underReview: !!underReview,
        suspended: !!suspended,
      };
    }
  }

  res.status(201).json({
    report: db.prepare('SELECT * FROM reports WHERE id = ?').get(id),
    companyFlagStatus: flagResult,
    message: 'Your report helps protect other job seekers and is reviewed by the ClearCall team.',
  });
});

// GET /api/reports/company/:id
router.get('/company/:id', authMiddleware, (req, res) => {
  const reports = db.prepare('SELECT * FROM reports WHERE reported_company_id = ? ORDER BY created_at DESC').all(req.params.id);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  res.json({ company, reports });
});

module.exports = router;
