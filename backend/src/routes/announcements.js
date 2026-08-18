const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/announcements/active — announcements targeted at the current
// user's role (or "all"), currently within their start/end date window.
router.get('/active', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE active = 1
      AND (audience = 'all' OR audience = ?)
      AND (start_date IS NULL OR date(start_date) <= date(?))
      AND (end_date IS NULL OR date(end_date) >= date(?))
    ORDER BY created_at DESC
  `).all(req.user.role, today, today);
  res.json({ announcements });
});

module.exports = router;
