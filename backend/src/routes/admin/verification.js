const express = require('express');
const db = require('../../db');
const { sendAdminMessageEmail } = require('../../services/resend');

const router = express.Router();

function monthsAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function buildFlags(company) {
  const flags = [];
  const abnAge = monthsAgo(company.abn_registration_date);
  if (abnAge !== null && abnAge < 6) flags.push('ABN registered under 6 months ago');
  if (!company.email_verified) flags.push('Work email not yet confirmed');
  if (!company.abn_verified) flags.push('ABN not automatically verified');
  return flags;
}

// GET /api/admin/verification-queue — companies awaiting manual review,
// oldest application first (most overdue at the top).
router.get('/', (req, res) => {
  const pending = db.prepare("SELECT * FROM companies WHERE admin_review_status = 'pending' ORDER BY created_at ASC").all();
  const entries = pending.map((c) => ({
    id: c.id,
    companyName: c.name,
    abn: c.abn,
    abnRegistrationDate: c.abn_registration_date,
    abnAgeMonths: monthsAgo(c.abn_registration_date),
    workEmail: c.work_email,
    workEmailVerified: !!c.email_verified,
    // No domain-intelligence service (WHOIS/lookalike-domain detection) is
    // connected yet, so this is honestly reported as unavailable rather
    // than a fabricated number.
    domainAge: null,
    flags: buildFlags(c),
    appliedAt: c.created_at,
  }));
  res.json({ queue: entries, count: entries.length });
});

// GET /api/admin/verification-queue/count — lightweight count for the
// sidebar nav badge.
router.get('/count', (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as n FROM companies WHERE admin_review_status = 'pending'").get().n;
  res.json({ count });
});

// PUT /api/admin/verification-queue/:id/approve
router.put('/:id/approve', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.prepare(`
    UPDATE companies SET admin_review_status = 'approved', admin_reviewed_at = datetime('now'), rejection_reason = NULL WHERE id = ?
  `).run(company.id);
  res.json({ success: true });
});

// PUT /api/admin/verification-queue/:id/reject — sends an automated
// rejection email with the admin's written reason.
router.put('/:id/reject', async (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A rejection reason is required' });

  db.prepare(`
    UPDATE companies SET admin_review_status = 'rejected', rejection_reason = ?, admin_reviewed_at = datetime('now') WHERE id = ?
  `).run(reason.trim(), company.id);

  try {
    await sendAdminMessageEmail(
      company.work_email,
      'Your ClearCall employer application',
      `Thanks for applying to ClearCall. After review, we're unable to approve "${company.name}" at this time.\n\nReason: ${reason.trim()}\n\nIf you believe this is a mistake or would like to provide more information, please reply to this email.`
    );
  } catch (err) {
    // Company record is already marked rejected — surface the email
    // failure separately so the admin knows to follow up manually.
    return res.status(207).json({ success: true, emailError: err.message });
  }

  res.json({ success: true });
});

// PUT /api/admin/verification-queue/:id/hold — keeps the account pending
// with an internal note, e.g. "waiting on more info".
router.put('/:id/hold', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { note } = req.body;
  db.prepare(`
    UPDATE companies SET admin_review_status = 'pending', admin_review_note = ? WHERE id = ?
  `).run(note || null, company.id);
  res.json({ success: true });
});

module.exports = router;
