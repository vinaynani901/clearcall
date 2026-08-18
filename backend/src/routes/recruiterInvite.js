// Public routes (no auth) a recruiter follows from their invitation email
// to set a password and activate their account. Modeled directly on the
// access-key generate/redeem pattern in accessKeys.js: only a sha256 hash
// of the token is ever stored, the plaintext lives only in the emailed link.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { newId } = require('../utils/ids');
const { syncExtraMemberCharge } = require('../services/featureFlags');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

function findInvite(token) {
  return db.prepare('SELECT * FROM recruiter_invitations WHERE token_hash = ?').get(hashToken(token));
}

// GET /api/recruiter-invite/:token — validate + show who/what this invite is
// for. Powers the /invite/accept/:token welcome screen: company name,
// inviter's name, and the pre-filled name/role the invite was sent with.
router.get('/:token', (req, res) => {
  const invite = findInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'This invitation link is invalid.' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invitation has already been used or was revoked.' });
  if (invite.expires_at < new Date().toISOString()) return res.status(410).json({ error: 'This invitation link has expired. Ask the company owner to send a new one.' });

  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(invite.company_id);
  const inviter = db.prepare('SELECT full_name FROM users WHERE id = ?').get(invite.invited_by_user_id);
  res.json({
    invitedName: invite.invited_name,
    invitedEmail: invite.invited_email,
    invitedRole: invite.invited_role || 'Member',
    companyName: company?.name || 'a ClearCall company',
    inviterName: inviter?.full_name || null,
  });
});

// POST /api/recruiter-invite/:token/activate — body: { password, fullName? }
// fullName is optional — the welcome screen pre-fills it from the
// invitation but lets the person correct it before creating their account.
router.post('/:token/activate', (req, res) => {
  const invite = findInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'This invitation link is invalid.' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invitation has already been used or was revoked.' });
  if (invite.expires_at < new Date().toISOString()) return res.status(410).json({ error: 'This invitation link has expired. Ask the company owner to send a new one.' });

  const { password, fullName } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(invite.invited_email);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists — please log in instead.' });

  const finalName = (fullName && fullName.trim()) || invite.invited_name;
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const userId = newId('user');

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified)
      VALUES (?, ?, ?, ?, NULL, 'employer', 1)
    `).run(userId, finalName, invite.invited_email, passwordHash);
    db.prepare(`
      INSERT INTO company_members (id, company_id, user_id, work_email, email_verified, member_role)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(newId('member'), invite.company_id, userId, invite.invited_email, invite.invited_role || 'Member');
    db.prepare(`
      INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo)
      VALUES (?, 1, 1, 1, 0)
    `).run(userId);
    db.prepare("UPDATE recruiter_invitations SET status = 'accepted', redeemed_at = datetime('now') WHERE id = ?").run(invite.id);
  });
  tx();

  // This member may push the company over its included plan limit (if the
  // owner confirmed adding an "extra" member at invite time) — recompute
  // the live extra-member gauge now that they're actually active.
  syncExtraMemberCharge(invite.company_id);

  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const user = db.prepare('SELECT id, full_name, email, phone, role, email_verified, created_at FROM users WHERE id = ?').get(userId);
  res.status(201).json({ token, user, message: 'Your account is active — welcome to the team.' });
});

module.exports = router;
