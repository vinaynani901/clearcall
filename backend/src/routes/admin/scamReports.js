const express = require('express');
const db = require('../../db');

const router = express.Router();

// Derives a priority/colour from the real reason the reporter selected —
// there's no separate "priority" field collected at report time, so this
// is an honest mapping of the actual reason values used across the app
// (see backend/src/routes/reports.js VALID_REASONS), not invented data.
const PRIORITY_BY_REASON = {
  'Asked for money or fees': 'red', // financial loss reported
  'Asked for personal information': 'orange',
  'Felt like a scam': 'yellow',
  'Company details seemed fake': 'yellow',
  'Caller was aggressive or inappropriate': 'yellow',
  'Other': 'grey',
};
const PRIORITY_ORDER = { red: 0, orange: 1, yellow: 2, grey: 3 };

function withPriority(report) {
  return { ...report, priority: PRIORITY_BY_REASON[report.reason] || 'grey' };
}

// GET /api/admin/scam-reports — most urgent (red) first.
router.get('/', (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, u.full_name as reporter_name, u.email as reporter_email,
      c.name as reported_company_name
    FROM reports r
    LEFT JOIN users u ON u.id = r.reporter_user_id
    LEFT JOIN companies c ON c.id = r.reported_company_id
    ORDER BY r.created_at DESC
  `).all().map(withPriority);

  reports.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  res.json({ reports });
});

// GET /api/admin/scam-reports/counts — for the sidebar nav badges.
router.get('/counts', (req, res) => {
  const pending = db.prepare("SELECT COUNT(*) as n FROM reports WHERE status = 'pending'").get().n;
  const urgent = db.prepare("SELECT COUNT(*) as n FROM reports WHERE status = 'pending' AND reason = 'Asked for money or fees'").get().n;
  res.json({ pending, urgent });
});

// PUT /api/admin/scam-reports/:id/investigate
router.put('/:id/investigate', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE reports SET status = 'investigating' WHERE id = ?").run(report.id);
  res.json({ success: true });
});

// PUT /api/admin/scam-reports/:id/suspend-company
router.put('/:id/suspend-company', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!report.reported_company_id) return res.status(400).json({ error: 'This report has no linked company to suspend' });
  db.prepare('UPDATE companies SET suspension_status = 1 WHERE id = ?').run(report.reported_company_id);
  db.prepare("UPDATE reports SET status = 'investigating' WHERE id = ?").run(report.id);
  res.json({ success: true });
});

// PUT /api/admin/scam-reports/:id/clear — not a valid report.
router.put('/:id/clear', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE reports SET status = 'cleared', resolved_at = datetime('now') WHERE id = ?").run(report.id);
  res.json({ success: true });
});

// PUT /api/admin/scam-reports/:id/resolve
router.put('/:id/resolve', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const { adminNote } = req.body;
  db.prepare("UPDATE reports SET status = 'resolved', resolved_at = datetime('now'), admin_note = COALESCE(?, admin_note) WHERE id = ?")
    .run(adminNote || null, report.id);
  res.json({ success: true });
});

// GET /api/admin/scam-reports/:id/scamwatch — pre-filled Scamwatch report
// payload for the admin to review and submit manually (Scamwatch has no
// public submission API, so this can't be posted automatically).
router.get('/:id/scamwatch', (req, res) => {
  const report = db.prepare(`
    SELECT r.*, u.full_name as reporter_name, u.email as reporter_email, c.name as reported_company_name
    FROM reports r
    LEFT JOIN users u ON u.id = r.reporter_user_id
    LEFT JOIN companies c ON c.id = r.reported_company_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  res.json({
    scamwatchUrl: 'https://www.scamwatch.gov.au/report-a-scam',
    prefill: {
      scamType: 'Employment scam',
      contactMethod: 'Phone call',
      businessName: report.reported_company_name || 'Unknown',
      contactNumber: report.reported_phone || '',
      description: report.description || report.reason,
      reportedBy: report.reporter_name,
      dateOccurred: report.created_at,
    },
  });
});

module.exports = router;
module.exports.PRIORITY_BY_REASON = PRIORITY_BY_REASON;
