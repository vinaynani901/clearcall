const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');
const { sendAdminMessageEmail } = require('../../services/resend');

const router = express.Router();

function withComputed(t) {
  const messages = db.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(t.id);
  const last = messages[messages.length - 1];
  return {
    ...t,
    userName: t.full_name,
    userEmail: t.email,
    userRole: t.role,
    messageCount: messages.length,
    lastMessagePreview: last ? last.message.slice(0, 120) : '',
  };
}

const LIST_QUERY = `
  SELECT st.*, u.full_name, u.email, u.role
  FROM support_tickets st
  JOIN users u ON u.id = st.user_id
`;

// GET /api/admin/support-tickets
router.get('/', (req, res) => {
  const rows = db.prepare(`${LIST_QUERY} ORDER BY st.updated_at DESC`).all();
  res.json({ tickets: rows.map(withComputed) });
});

// GET /api/admin/support-tickets/counts — for the nav badge.
router.get('/counts', (req, res) => {
  const open = db.prepare("SELECT COUNT(*) as n FROM support_tickets WHERE status IN ('open', 'in_progress')").get().n;
  res.json({ open });
});

// GET /api/admin/support-tickets/:id — full thread.
router.get('/:id', (req, res) => {
  const row = db.prepare(`${LIST_QUERY} WHERE st.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ticket not found' });
  const messages = db.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(row.id);
  res.json({ ticket: { ...withComputed(row), messages } });
});

// POST /api/admin/support-tickets/:id/reply — replies in-thread AND emails
// the user (best-effort — if email fails, the reply is still saved so the
// user sees it next time they open Help & Support in the app).
router.post('/:id/reply', async (req, res) => {
  const row = db.prepare(`${LIST_QUERY} WHERE st.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ticket not found' });
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO support_ticket_messages (id, ticket_id, sender_type, message) VALUES (?, ?, 'admin', ?)
    `).run(newId('ticketmsg'), row.id, message.trim());
    db.prepare(`
      UPDATE support_tickets SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?
    `).run(row.id);
  });
  tx();

  let emailError = null;
  try {
    await sendAdminMessageEmail(row.email, `Re: ${row.subject}`, message.trim());
  } catch (err) {
    emailError = err.message;
  }

  const messages = db.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(row.id);
  const updated = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(row.id);
  res.json({ ticket: { ...withComputed({ ...updated, full_name: row.full_name, email: row.email, role: row.role }), messages }, emailError });
});

// PUT /api/admin/support-tickets/:id/status
router.put('/:id/status', (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const { status } = req.body;
  if (!['open', 'in_progress', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: open, in_progress, closed' });
  }
  db.prepare(`
    UPDATE support_tickets SET status = ?, updated_at = datetime('now'), closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END WHERE id = ?
  `).run(status, status, ticket.id);
  res.json({ ticket: db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id) });
});

// PUT /api/admin/support-tickets/:id/priority
router.put('/:id/priority', (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const { priority } = req.body;
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
    return res.status(400).json({ error: 'Priority must be one of: low, normal, high, urgent' });
  }
  db.prepare("UPDATE support_tickets SET priority = ?, updated_at = datetime('now') WHERE id = ?").run(priority, ticket.id);
  res.json({ ticket: db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id) });
});

module.exports = router;
