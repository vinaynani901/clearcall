// Employer "My Team" — every team member on a company account, not just
// agency recruiters. Originally built for recruiter sub-accounts under
// Growth+ agency_pipeline (member_role = 'recruiter'); Part 6/7 of the team
// plan spec generalizes this to every plan, gated by team_members_limit
// (Free=1 through Enterprise Plus=unlimited) instead of the
// agency-specific recruiter_sub_accounts_limit, and adds a role field per
// invite. member_role is still NOT a new users.role value — see
// db/index.js runAgencyMigrations for why that would be far more invasive.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { checkTeamMemberLimit, getGlobalBillingValue, syncExtraMemberCharge } = require('../services/featureFlags');
const { sendRecruiterInviteEmail } = require('../services/resend');

const router = express.Router();
router.use(authMiddleware);

const INVITE_EXPIRY_HOURS = 48;

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

function getMembership(userId) {
  return db.prepare('SELECT * FROM company_members WHERE user_id = ?').get(userId);
}

function requireEmployer(req, res) {
  if (req.user.role !== 'employer') {
    res.status(403).json({ error: 'Employer account required' });
    return null;
  }
  const membership = getMembership(req.user.id);
  if (!membership) {
    res.status(404).json({ error: 'No company profile found for this user' });
    return null;
  }
  return membership;
}

function requireOwner(req, res) {
  const membership = requireEmployer(req, res);
  if (!membership) return null;
  if (membership.member_role !== 'owner') {
    res.status(403).json({ error: 'Only the account owner can manage the team' });
    return null;
  }
  return membership;
}

function activeMemberCount(companyId) {
  return db.prepare(`
    SELECT COUNT(*) as n FROM company_members WHERE company_id = ? AND (deactivated IS NULL OR deactivated = 0)
  `).get(companyId).n;
}

function pendingInviteCount(companyId) {
  return db.prepare("SELECT COUNT(*) as n FROM recruiter_invitations WHERE company_id = ? AND status = 'pending'").get(companyId).n;
}

// GET /api/team — everyone on the team, plus member-slot usage.
router.get('/', (req, res) => {
  const membership = requireEmployer(req, res);
  if (!membership) return;

  const members = db.prepare(`
    SELECT cm.id, cm.user_id, cm.member_role, cm.deactivated, cm.created_at,
      u.full_name, u.email, u.phone
    FROM company_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ?
    ORDER BY cm.member_role = 'owner' DESC, cm.created_at ASC
  `).all(membership.company_id);

  const invitations = db.prepare(`
    SELECT id, invited_name, invited_email, invited_role, status, expires_at, created_at
    FROM recruiter_invitations WHERE company_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).all(membership.company_id);

  const check = checkTeamMemberLimit(membership.company_id);

  res.json({
    members: members.map((m) => ({
      id: m.id, userId: m.user_id, fullName: m.full_name, email: m.email, phone: m.phone,
      role: m.member_role, deactivated: !!m.deactivated, addedAt: m.created_at,
    })),
    pendingInvitations: invitations.map((i) => ({
      id: i.id, name: i.invited_name, email: i.invited_email, role: i.invited_role,
      expiresAt: i.expires_at, createdAt: i.created_at,
    })),
    isOwner: membership.member_role === 'owner',
    slots: { used: check.used, limit: check.limit === Infinity ? null : check.limit },
    extraMemberPrice: getGlobalBillingValue('extra_member_price') || 0,
  });
});

// POST /api/team/invite — owner only. body: { fullName, email, role, confirmExtra }
// confirmExtra: when the company is already at/over its plan's included
// member slots, the first call returns 403 with overLimit:true instead of
// sending the invite; the frontend shows a confirm dialog ("add extra
// members at $X/member/month") and re-submits with confirmExtra:true to
// proceed anyway — the invite is never silently blocked past this point,
// matching the "never block, always allow with billing" pattern used for
// verified call overage.
router.post('/invite', async (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;

  const { fullName, email, role, confirmExtra } = req.body;
  if (!fullName || !fullName.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: 'Full name and work email are required' });
  }
  const normalizedEmail = email.toLowerCase().trim();
  const invitedRole = (role && role.trim()) || 'Member';

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

  const existingInvite = db.prepare("SELECT id FROM recruiter_invitations WHERE company_id = ? AND invited_email = ? AND status = 'pending'").get(membership.company_id, normalizedEmail);
  if (existingInvite) return res.status(409).json({ error: 'An invitation has already been sent to this email' });

  const projectedCount = activeMemberCount(membership.company_id) + pendingInviteCount(membership.company_id);
  const check = checkTeamMemberLimit(membership.company_id);
  const overLimit = check.limit !== Infinity && projectedCount >= check.limit;
  const extraMemberPrice = getGlobalBillingValue('extra_member_price') || 0;

  if (overLimit && !confirmExtra) {
    return res.status(403).json({
      error: `You have used all included member slots — add extra members at $${extraMemberPrice.toFixed(2)} per member per month.`,
      overLimit: true,
      extraMemberPrice,
      feature: 'team_members_limit',
    });
  }

  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(membership.company_id);
  const inviter = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user.id);
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const id = newId('invite');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO recruiter_invitations (id, company_id, invited_name, invited_email, invited_role, token_hash, invited_by_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, membership.company_id, fullName.trim(), normalizedEmail, invitedRole, hashToken(plaintext), req.user.id, expiresAt);

  try {
    await sendRecruiterInviteEmail(normalizedEmail, {
      recruiterName: fullName.trim(), companyName: company?.name || 'your ClearCall company', token: plaintext,
      inviterName: inviter?.full_name, role: invitedRole,
    });
  } catch (err) {
    // The invitation row still exists (they can be re-sent), but the admin
    // should know the email itself didn't go out.
    return res.status(502).json({ error: `Invitation created, but the email could not be sent: ${err.message}` });
  }

  res.status(201).json({ message: `Invitation sent to ${normalizedEmail}` });
});

// POST /api/team/invitations/:id/resend — regenerates the token (old link
// stops working) and expiry, and re-sends the email. Only ever applies to
// a still-pending invitation.
router.post('/invitations/:id/resend', async (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;
  const invite = db.prepare("SELECT * FROM recruiter_invitations WHERE id = ? AND company_id = ? AND status = 'pending'").get(req.params.id, membership.company_id);
  if (!invite) return res.status(404).json({ error: 'Invitation not found' });

  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(membership.company_id);
  const inviter = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user.id);
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare("UPDATE recruiter_invitations SET token_hash = ?, expires_at = ? WHERE id = ?").run(hashToken(plaintext), expiresAt, invite.id);

  try {
    await sendRecruiterInviteEmail(invite.invited_email, {
      recruiterName: invite.invited_name, companyName: company?.name || 'your ClearCall company', token: plaintext,
      inviterName: inviter?.full_name, role: invite.invited_role,
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not resend the invitation email: ${err.message}` });
  }

  res.json({ message: `Invitation resent to ${invite.invited_email}` });
});

// DELETE /api/team/invitations/:id — revoke a pending invite.
router.delete('/invitations/:id', (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;
  const invite = db.prepare("SELECT id FROM recruiter_invitations WHERE id = ? AND company_id = ? AND status = 'pending'").get(req.params.id, membership.company_id);
  if (!invite) return res.status(404).json({ error: 'Invitation not found' });
  db.prepare("UPDATE recruiter_invitations SET status = 'revoked' WHERE id = ?").run(invite.id);
  res.json({ message: 'Invitation revoked' });
});

// PUT /api/team/:memberId/deactivate
router.put('/:memberId/deactivate', (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;
  const member = db.prepare('SELECT * FROM company_members WHERE id = ? AND company_id = ?').get(req.params.memberId, membership.company_id);
  if (!member) return res.status(404).json({ error: 'Team member not found' });
  if (member.member_role === 'owner') return res.status(400).json({ error: 'The account owner cannot be deactivated' });
  db.prepare('UPDATE company_members SET deactivated = 1 WHERE id = ?').run(member.id);
  syncExtraMemberCharge(membership.company_id);
  res.json({ message: 'Team member deactivated' });
});

// PUT /api/team/:memberId/reactivate
router.put('/:memberId/reactivate', (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;
  const member = db.prepare('SELECT * FROM company_members WHERE id = ? AND company_id = ?').get(req.params.memberId, membership.company_id);
  if (!member) return res.status(404).json({ error: 'Team member not found' });
  db.prepare('UPDATE company_members SET deactivated = 0 WHERE id = ?').run(member.id);
  syncExtraMemberCharge(membership.company_id);
  res.json({ message: 'Team member reactivated' });
});

// DELETE /api/team/:memberId — removes a member entirely (does not delete
// their user account or historical campaigns/calls — only revokes their
// membership in this company, same "detach don't destroy" pattern as admin
// company deletion).
router.delete('/:memberId', (req, res) => {
  const membership = requireOwner(req, res);
  if (!membership) return;
  const member = db.prepare('SELECT * FROM company_members WHERE id = ? AND company_id = ?').get(req.params.memberId, membership.company_id);
  if (!member) return res.status(404).json({ error: 'Team member not found' });
  if (member.member_role === 'owner') return res.status(400).json({ error: 'The account owner cannot be removed' });
  db.prepare('DELETE FROM company_members WHERE id = ?').run(member.id);
  syncExtraMemberCharge(membership.company_id);
  res.json({ message: 'Team member removed' });
});

module.exports = router;
module.exports.hashToken = hashToken;
