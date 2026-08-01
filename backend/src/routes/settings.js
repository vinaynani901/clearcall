const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/settings/call-display
router.get('/call-display', authMiddleware, (req, res) => {
  let settings = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id);
  if (!settings) {
    db.prepare(`
      INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo)
      VALUES (?, 1, 1, 1, 0)
    `).run(req.user.id);
    settings = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id);
  }
  res.json({ settings });
});

// PUT /api/settings/call-display
router.put('/call-display', authMiddleware, (req, res) => {
  const { hideNumber, showName, showDesignation, showPhoto, defaultCallType } = req.body;

  const existing = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id);
  if (!existing) {
    db.prepare(`
      INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo, default_call_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      hideNumber === undefined ? 1 : (hideNumber ? 1 : 0),
      showName === undefined ? 1 : (showName ? 1 : 0),
      showDesignation === undefined ? 1 : (showDesignation ? 1 : 0),
      showPhoto === undefined ? 0 : (showPhoto ? 1 : 0),
      defaultCallType || 'clearcall'
    );
  } else {
    db.prepare(`
      UPDATE call_display_settings
      SET hide_number = ?, show_name = ?, show_designation = ?, show_photo = ?, default_call_type = ?
      WHERE user_id = ?
    `).run(
      hideNumber === undefined ? existing.hide_number : (hideNumber ? 1 : 0),
      showName === undefined ? existing.show_name : (showName ? 1 : 0),
      showDesignation === undefined ? existing.show_designation : (showDesignation ? 1 : 0),
      showPhoto === undefined ? existing.show_photo : (showPhoto ? 1 : 0),
      defaultCallType || existing.default_call_type,
      req.user.id
    );
  }

  const updated = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id);
  res.json({ settings: updated });
});

module.exports = router;
