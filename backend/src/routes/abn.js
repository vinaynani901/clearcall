const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { verifyAbn } = require('../services/abr');

const router = express.Router();

// POST /api/abn/verify
// Body: { abn, companyId (optional), workProfileId (optional) }
router.post('/verify', authMiddleware, async (req, res) => {
  const { abn, companyId, workProfileId } = req.body;
  if (!abn) return res.status(400).json({ error: 'ABN is required' });

  const result = await verifyAbn(abn);
  if (!result.success) {
    return res.status(422).json({ error: result.error, abnStatus: result.abnStatus || null });
  }

  if (companyId) {
    // The officially registered name from the Australian Business Register
    // always overwrites whatever the employer typed at sign-up — this is
    // the whole point of ABN verification: job seekers must see the real,
    // government-confirmed company name, never a self-entered one.
    db.prepare(`
      UPDATE companies SET abn_verified = 1, abn_registration_date = ?, abn_status = ?, name = ?
      WHERE id = ? AND owner_user_id = ?
    `).run(result.abnRegistrationDate, result.abnStatus, result.companyName, companyId, req.user.id);
  }

  if (workProfileId) {
    db.prepare(`
      UPDATE work_profiles SET abn_verified = 1, abn = ?
      WHERE id = ? AND user_id = ?
    `).run(result.abn, workProfileId, req.user.id);
  }

  res.json(result);
});

module.exports = router;
