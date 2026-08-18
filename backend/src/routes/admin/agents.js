const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');
const { sendAdminMessageEmail } = require('../../services/resend');
const { PLAN_LABELS } = require('../../utils/plans');

const router = express.Router();

function withUser(row) {
  return {
    id: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    emailVerified: !!row.email_verified,
    agencyName: row.agency_name,
    abn: row.abn,
    abnVerified: !!row.abn_verified,
    plan: row.plan,
    planLabel: PLAN_LABELS[row.plan] || row.plan,
    featured: !!row.featured,
    rating: row.rating,
    activeClients: row.active_clients,
    successfulPlacements: row.successful_placements,
    reportCount: row.report_count,
    suspended: !!row.suspension_status,
    createdAt: row.created_at,
  };
}

const LIST_QUERY = `
  SELECT a.*, u.full_name, u.email, u.phone, u.email_verified
  FROM agents a
  JOIN users u ON u.id = a.user_id
`;

// GET /api/admin/agents
router.get('/', (req, res) => {
  const rows = db.prepare(`${LIST_QUERY} ORDER BY a.created_at DESC`).all();
  res.json({ agents: rows.map(withUser) });
});

// GET /api/admin/agents/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`${LIST_QUERY} WHERE a.user_id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  res.json({ agent: withUser(row) });
});

// PUT /api/admin/agents/:id/approve — marks the agency's ABN as verified,
// same trust signal companies get from ABN verification.
router.put('/:id/approve', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare('UPDATE agents SET abn_verified = 1 WHERE user_id = ?').run(agent.user_id);
  res.json({ success: true });
});

// PUT /api/admin/agents/:id/suspend
router.put('/:id/suspend', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare('UPDATE agents SET suspension_status = 1 WHERE user_id = ?').run(agent.user_id);
  res.json({ success: true });
});

// PUT /api/admin/agents/:id/unsuspend
router.put('/:id/unsuspend', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare('UPDATE agents SET suspension_status = 0 WHERE user_id = ?').run(agent.user_id);
  res.json({ success: true });
});

// POST /api/admin/agents/:id/message
router.post('/:id/message', async (req, res) => {
  const row = db.prepare(`${LIST_QUERY} WHERE a.user_id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  try {
    await sendAdminMessageEmail(row.email, subject, message);
  } catch (err) {
    return res.status(502).json({ error: `Could not send email: ${err.message}` });
  }

  const id = newId('adminmsg');
  db.prepare(`
    INSERT INTO admin_messages (id, target_type, target_id, subject, message) VALUES (?, 'agent', ?, ?, ?)
  `).run(id, row.user_id, subject, message);

  res.json({ success: true });
});

// DELETE /api/admin/agents/:id
router.delete('/:id', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM agents WHERE user_id = ?').run(agent.user_id);
      db.prepare('DELETE FROM users WHERE id = ?').run(agent.user_id);
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: 'This agent has activity history that must be preserved and cannot be deleted. Suspend the account instead.' });
  }
});

module.exports = router;
