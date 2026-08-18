const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { createNotification } = require('../services/notifications');
const { checkCountLimit, hasFeature, getCompanyIdForUser } = require('../services/featureFlags');

const router = express.Router();

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    keyPreview: row.key_preview,
    canViewProfile: !!row.can_view_profile,
    canApplyForJobs: !!row.can_apply_for_jobs,
    canViewApplications: !!row.can_view_applications,
    agentUserId: row.agent_user_id,
    agentName: row.agent_full_name || null,
    agencyName: row.agency_name || null,
    redeemedAt: row.redeemed_at,
    expiresAt: row.expires_at,
    applicationsCount: row.applications_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    isExpired: !!row.expires_at && row.expires_at < new Date().toISOString(),
  };
}

// GET /api/access-keys — job seeker's own keys, most recent first.
router.get('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });

  const rows = db.prepare(`
    SELECT k.*, u.full_name as agent_full_name, a.agency_name
    FROM agent_access_keys k
    LEFT JOIN users u ON u.id = k.agent_user_id
    LEFT JOIN agents a ON a.user_id = k.agent_user_id
    WHERE k.jobseeker_user_id = ?
    ORDER BY k.created_at DESC
  `).all(req.user.id);
  res.json({ accessKeys: rows.map(serialize) });
});

// POST /api/access-keys — generate a new key. The plaintext is returned
// exactly once, in this response only — only its sha256 hash and a short
// preview (for the list view, so the person can recognise which key is
// which without the full secret being retrievable) are ever stored.
router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });

  const activeCount = db.prepare('SELECT COUNT(*) as n FROM agent_access_keys WHERE jobseeker_user_id = ? AND revoked_at IS NULL').get(req.user.id).n;
  const limitCheck = checkCountLimit('user', req.user.id, 'access_keys_limit', activeCount);
  if (!limitCheck.allowed) {
    const isFree = (req.user.plan || 'free') === 'free';
    return res.status(403).json({
      error: isFree
        ? `You can only have ${limitCheck.limit} active access key${limitCheck.limit === 1 ? '' : 's'} on the free plan. Upgrade to Premium for up to 5 keys.`
        : `You have reached the maximum of ${limitCheck.limit} active access keys on the Premium plan. Revoke an existing key to create a new one.`,
      featureLocked: true,
      feature: 'access_keys_limit',
    });
  }

  const { name, canViewProfile, canApplyForJobs, canViewApplications, expiresAt } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name for this key is required, e.g. "For Career Connect Agency"' });

  const plaintext = `cc_key_${crypto.randomBytes(24).toString('base64url')}`;
  const preview = `${plaintext.slice(0, 10)}…${plaintext.slice(-4)}`;
  const id = newId('key');

  db.prepare(`
    INSERT INTO agent_access_keys
      (id, jobseeker_user_id, name, key_hash, key_preview, can_view_profile, can_apply_for_jobs, can_view_applications, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, name.trim(), hashKey(plaintext), preview,
    canViewProfile === false ? 0 : 1,
    canApplyForJobs ? 1 : 0,
    canViewApplications ? 1 : 0,
    expiresAt || null
  );

  const row = db.prepare('SELECT * FROM agent_access_keys WHERE id = ?').get(id);
  res.status(201).json({ key: plaintext, accessKey: serialize(row) });
});

// DELETE /api/access-keys/:id — revoke. Doesn't remove an already-connected
// agent (that link is a separate, real relationship by this point) — just
// stops the key itself from being redeemable again.
router.delete('/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });

  const existing = db.prepare('SELECT id FROM agent_access_keys WHERE id = ? AND jobseeker_user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Access key not found' });

  db.prepare("UPDATE agent_access_keys SET revoked_at = datetime('now') WHERE id = ?").run(req.params.id);

  createNotification(req.user.id, {
    type: 'key_revoked',
    title: 'Access Key Revoked',
    message: 'An access key you generated has been revoked.',
    link: '/jobseeker/agent',
  });

  res.json({ message: 'Access key revoked' });
});

// POST /api/access-keys/redeem — links the caller as one of the job
// seeker's connected agents. Two kinds of caller can redeem: a standalone
// placement agent (role='agent', always allowed — this predates the plan
// system and stays free), or a recruiter/owner on a Growth+/Enterprise
// employer plan whose job_seeker_connection feature is unlocked (Plan
// Control Stage 5 — "Connect directly with job seekers").
router.post('/redeem', authMiddleware, (req, res) => {
  let employerCompanyId = null;
  if (req.user.role === 'agent') {
    // always allowed
  } else if (req.user.role === 'employer') {
    employerCompanyId = getCompanyIdForUser(req.user.id);
    if (!employerCompanyId || !hasFeature('company', employerCompanyId, 'job_seeker_connection')) {
      return res.status(403).json({
        error: 'Connecting directly with job seekers requires the Growth plan or above.',
        featureLocked: true,
        feature: 'job_seeker_connection',
      });
    }
  } else {
    return res.status(403).json({ error: 'Agent or employer account required' });
  }

  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'An access key is required' });

  const row = db.prepare('SELECT * FROM agent_access_keys WHERE key_hash = ?').get(hashKey(key));
  if (!row) return res.status(404).json({ error: 'Invalid access key' });
  if (row.revoked_at) return res.status(410).json({ error: 'This access key has been revoked' });
  if (row.expires_at && row.expires_at < new Date().toISOString()) return res.status(410).json({ error: 'This access key has expired' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE agent_access_keys SET agent_user_id = ?, redeemed_at = datetime('now') WHERE id = ?").run(req.user.id, row.id);

    const existingLink = db.prepare('SELECT id FROM agent_clients WHERE jobseeker_user_id = ? AND agent_user_id = ?').get(row.jobseeker_user_id, req.user.id);
    if (existingLink) {
      db.prepare("UPDATE agent_clients SET connected_at = datetime('now') WHERE id = ?").run(existingLink.id);
    } else {
      db.prepare('INSERT INTO agent_clients (id, agent_user_id, jobseeker_user_id) VALUES (?, ?, ?)').run(newId('agentlink'), req.user.id, row.jobseeker_user_id);
      if (req.user.role === 'agent') db.prepare('UPDATE agents SET active_clients = active_clients + 1 WHERE user_id = ?').run(req.user.id);
    }
  });
  tx();

  createNotification(row.jobseeker_user_id, {
    type: 'agent_connected',
    title: 'New Agent Connected',
    message: `${req.user.full_name} connected using your access key "${row.name}".`,
    link: '/jobseeker/agent',
  });

  res.json({ message: 'Access key redeemed — you are now connected as this job seeker\'s placement agent' });
});

module.exports = router;
