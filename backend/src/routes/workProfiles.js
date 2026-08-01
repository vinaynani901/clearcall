const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');

const router = express.Router();

// GET /api/work-profiles
router.get('/', authMiddleware, (req, res) => {
  const profiles = db.prepare('SELECT * FROM work_profiles WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ profiles });
});

// POST /api/work-profiles
router.post('/', authMiddleware, (req, res) => {
  const { designation, organisation, industryCategory } = req.body;
  if (!designation || !organisation) {
    return res.status(400).json({ error: 'Designation and organisation are required' });
  }

  const id = newId('wp');
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM work_profiles WHERE user_id = ?').get(req.user.id).c;

  db.prepare(`
    INSERT INTO work_profiles (id, user_id, designation, organisation, industry_category, is_active, abn_verified)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, req.user.id, designation.trim(), organisation.trim(), industryCategory || null, existingCount === 0 ? 1 : 0);

  const profile = db.prepare('SELECT * FROM work_profiles WHERE id = ?').get(id);
  res.status(201).json({ profile, note: 'Each work profile needs its own ABN verification before it can be used to make calls.' });
});

// PUT /api/work-profiles/:id/activate
router.put('/:id/activate', authMiddleware, (req, res) => {
  const profile = db.prepare('SELECT * FROM work_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!profile) return res.status(404).json({ error: 'Work profile not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE work_profiles SET is_active = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE work_profiles SET is_active = 1 WHERE id = ?').run(req.params.id);
  });
  tx();

  const updated = db.prepare('SELECT * FROM work_profiles WHERE id = ?').get(req.params.id);
  res.json({ profile: updated });
});

module.exports = router;
