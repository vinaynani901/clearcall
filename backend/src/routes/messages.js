const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');

const router = express.Router();
router.use(authMiddleware);

// GET /api/messages/conversations — one row per other-participant this user
// has ever exchanged messages with, most recent message first. Works the
// same for a job seeker (conversations with their agent(s)) or an agent
// (conversations with their clients) since messages are symmetric.
router.get('/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT
      other.id as other_user_id, other.full_name as other_name, other.role as other_role,
      last_msg.content as last_content, last_msg.created_at as last_at, last_msg.sender_id as last_sender_id,
      (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND sender_id = other.id AND read_at IS NULL) as unread_count
    FROM (
      SELECT DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_id
      FROM messages WHERE sender_id = ? OR receiver_id = ?
    ) participants
    JOIN users other ON other.id = participants.other_id
    JOIN (
      SELECT m1.* FROM messages m1
      WHERE m1.id = (
        SELECT m2.id FROM messages m2
        WHERE (m2.sender_id = ? AND m2.receiver_id = participants.other_id) OR (m2.sender_id = participants.other_id AND m2.receiver_id = ?)
        ORDER BY m2.created_at DESC LIMIT 1
      )
    ) last_msg ON 1=1
    ORDER BY last_msg.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({
    conversations: rows.map((r) => ({
      userId: r.other_user_id,
      name: r.other_name,
      role: r.other_role,
      lastMessage: r.last_content,
      lastMessageAt: r.last_at,
      lastMessageFromMe: r.last_sender_id === req.user.id,
      unreadCount: r.unread_count,
    })),
  });
});

// GET /api/messages/:otherUserId — full thread with one person, oldest first.
router.get('/:otherUserId', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `).all(req.user.id, req.params.otherUserId, req.params.otherUserId, req.user.id);

  res.json({
    messages: rows.map((m) => ({
      id: m.id, senderId: m.sender_id, receiverId: m.receiver_id, content: m.content,
      read: !!m.read_at, createdAt: m.created_at, fromMe: m.sender_id === req.user.id,
    })),
  });
});

// POST /api/messages — send. Only allowed between a job seeker and their
// actually-connected agent (either direction) — prevents messaging an
// arbitrary user id.
router.post('/', (req, res) => {
  const { receiverId, content } = req.body;
  if (!receiverId || !content || !content.trim()) return res.status(400).json({ error: 'receiverId and content are required' });

  const link = db.prepare(`
    SELECT id FROM agent_clients
    WHERE (jobseeker_user_id = ? AND agent_user_id = ?) OR (jobseeker_user_id = ? AND agent_user_id = ?)
  `).get(req.user.id, receiverId, receiverId, req.user.id);
  if (!link) return res.status(403).json({ error: 'You can only message your connected placement agent' });

  const id = newId('msg');
  db.prepare('INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)').run(id, req.user.id, receiverId, content.trim());

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  res.status(201).json({ message: { id: row.id, senderId: row.sender_id, receiverId: row.receiver_id, content: row.content, read: false, createdAt: row.created_at, fromMe: true } });
});

// PUT /api/messages/:otherUserId/read — mark every message FROM that person
// TO me as read (i.e. opening the conversation).
router.put('/:otherUserId/read', (req, res) => {
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL")
    .run(req.params.otherUserId, req.user.id);
  res.json({ message: 'Marked as read' });
});

module.exports = router;
