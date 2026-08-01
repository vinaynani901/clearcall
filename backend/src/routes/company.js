const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');

const router = express.Router();

function getUserCompany(userId) {
  return db.prepare(`
    SELECT c.* FROM companies c
    JOIN company_members cm ON cm.company_id = c.id
    WHERE cm.user_id = ?
    LIMIT 1
  `).get(userId);
}

// GET /api/company/profile
router.get('/profile', authMiddleware, (req, res) => {
  const company = getUserCompany(req.user.id);
  if (!company) return res.status(404).json({ error: 'No company profile found for this user' });
  res.json({ company });
});

// PUT /api/company/profile
router.put('/profile', authMiddleware, (req, res) => {
  const company = getUserCompany(req.user.id);
  if (!company) return res.status(404).json({ error: 'No company profile found for this user' });

  const { description, location, employeeCount, logoUrl, linkedinUrl, industry } = req.body;
  db.prepare(`
    UPDATE companies
    SET description = COALESCE(?, description),
        location = COALESCE(?, location),
        employee_count = COALESCE(?, employee_count),
        logo_url = COALESCE(?, logo_url),
        linkedin_url = COALESCE(?, linkedin_url),
        industry = COALESCE(?, industry)
    WHERE id = ?
  `).run(description, location, employeeCount, logoUrl, linkedinUrl, industry, company.id);

  const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id);
  res.json({ company: updated });
});

// GET /api/company/:id (public-ish profile view, requires auth)
router.get('/:id', authMiddleware, (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const recentRoles = db.prepare(`
    SELECT DISTINCT job_role FROM calls WHERE company_id = ? AND job_role IS NOT NULL ORDER BY created_at DESC LIMIT 5
  `).all(company.id);

  res.json({ company, recentRoles: recentRoles.map(r => r.job_role) });
});

module.exports = router;
