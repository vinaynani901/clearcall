const express = require('express');
const db = require('../../db');
const { newId } = require('../../utils/ids');

const router = express.Router();

const AUDIENCES = ['all', 'employer', 'jobseeker', 'agent'];

// GET /api/admin/announcements
router.get('/', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json({ announcements });
});

// POST /api/admin/announcements
router.post('/', (req, res) => {
  const { title, body, audience, startDate, endDate, active } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  const finalAudience = AUDIENCES.includes(audience) ? audience : 'all';

  const id = newId('announcement');
  db.prepare(`
    INSERT INTO announcements (id, title, body, audience, active, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), body.trim(), finalAudience, active === false ? 0 : 1, startDate || null, endDate || null);

  res.status(201).json({ announcement: db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) });
});

// PUT /api/admin/announcements/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Announcement not found' });
  const { title, body, audience, startDate, endDate, active } = req.body;
  const finalAudience = AUDIENCES.includes(audience) ? audience : existing.audience;

  db.prepare(`
    UPDATE announcements SET title = ?, body = ?, audience = ?, active = ?, start_date = ?, end_date = ? WHERE id = ?
  `).run(
    title !== undefined ? title.trim() : existing.title,
    body !== undefined ? body.trim() : existing.body,
    finalAudience,
    active === undefined ? existing.active : (active ? 1 : 0),
    startDate !== undefined ? (startDate || null) : existing.start_date,
    endDate !== undefined ? (endDate || null) : existing.end_date,
    existing.id,
  );

  res.json({ announcement: db.prepare('SELECT * FROM announcements WHERE id = ?').get(existing.id) });
});

// PUT /api/admin/announcements/:id/toggle
router.put('/:id/toggle', (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Announcement not found' });
  db.prepare('UPDATE announcements SET active = ? WHERE id = ?').run(existing.active ? 0 : 1, existing.id);
  res.json({ announcement: db.prepare('SELECT * FROM announcements WHERE id = ?').get(existing.id) });
});

// DELETE /api/admin/announcements/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Announcement not found' });
  db.prepare('DELETE FROM announcements WHERE id = ?').run(existing.id);
  res.json({ success: true });
});

module.exports = router;
