// Employer-facing monthly billing summaries (Part 9) — read-only view of
// the same monthly_invoices rows the admin Revenue portal sees, generated
// automatically by services/billingScheduler.js at the end of each month.
const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { getCompanyIdForUser } = require('../services/featureFlags');

const router = express.Router();
router.use(authMiddleware);

// GET /api/billing/invoices — this company's full billing history, most
// recent month first.
router.get('/invoices', (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ error: 'Employer account required' });
  const companyId = getCompanyIdForUser(req.user.id);
  if (!companyId) return res.status(404).json({ error: 'No company profile found for this user' });

  const invoices = db.prepare('SELECT * FROM monthly_invoices WHERE company_id = ? ORDER BY month DESC').all(companyId);
  res.json({ invoices });
});

module.exports = router;
