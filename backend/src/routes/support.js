const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');

const router = express.Router();

const CATEGORIES = ['general', 'billing', 'technical', 'account', 'report_followup'];

function withMessages(ticket) {
  const messages = db.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);
  return { ...ticket, messages };
}

// POST /api/support/tickets — any logged-in user (job seeker, employer, or
// agent) can open a ticket. Real feature, not a "coming soon" placeholder:
// this is what feeds the admin Support Tickets portal.
router.post('/tickets', authMiddleware, (req, res) => {
  const { subject, message, category } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }
  const finalCategory = CATEGORIES.includes(category) ? category : 'general';

  const id = newId('ticket');
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO support_tickets (id, user_id, subject, category) VALUES (?, ?, ?, ?)
    `).run(id, req.user.id, subject.trim(), finalCategory);
    db.prepare(`
      INSERT INTO support_ticket_messages (id, ticket_id, sender_type, message) VALUES (?, ?, 'user', ?)
    `).run(newId('ticketmsg'), id, message.trim());
  });
  tx();

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
  res.status(201).json({ ticket: withMessages(ticket) });
});

// GET /api/support/tickets — the current user's own tickets, each with its
// full message thread (ticket counts per user are small, so this is cheap
// and saves the frontend a second round-trip per ticket to render inline).
router.get('/tickets', authMiddleware, (req, res) => {
  const tickets = db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({ tickets: tickets.map(withMessages) });
});

// GET /api/support/tickets/:id — own ticket only, with the full thread.
router.get('/tickets/:id', authMiddleware, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ ticket: withMessages(ticket) });
});

// POST /api/support/tickets/:id/reply — user adds to their own thread.
// Replying to a closed ticket reopens it.
router.post('/tickets/:id/reply', authMiddleware, (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO support_ticket_messages (id, ticket_id, sender_type, message) VALUES (?, ?, 'user', ?)
    `).run(newId('ticketmsg'), ticket.id, message.trim());
    db.prepare(`
      UPDATE support_tickets SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END, updated_at = datetime('now') WHERE id = ?
    `).run(ticket.id);
  });
  tx();

  const updated = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id);
  res.json({ ticket: withMessages(updated) });
});

module.exports = router;
