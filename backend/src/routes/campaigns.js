const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { resolveCandidateName } = require('../utils/candidateName');
const { sendCandidateSms, buildCandidateReminderText } = require('../services/sms');
const { hasFeature, getFeatureValue, checkCountLimit, incrementUsage, checkAndSendUsageAlerts } = require('../services/featureFlags');

const router = express.Router();

// Default quick-tap tags used when a campaign doesn't specify its own
// (custom tag builder lands in a later stage — this keeps campaigns usable
// end-to-end before that exists).
const DEFAULT_TAGS = [
  { label: 'Answered', emoji: '✅' },
  { label: 'Not Answered', emoji: '📵' },
  { label: 'Went to Voicemail', emoji: '📩' },
  { label: 'Interested', emoji: '👍' },
  { label: 'Not Interested', emoji: '👎' },
  { label: 'Callback Requested', emoji: '🔁' },
  { label: 'Interview Scheduled', emoji: '📅' },
  { label: 'Not Suitable', emoji: '❌' },
  { label: 'Visa Issue', emoji: '🛂' },
  { label: 'Salary Too High', emoji: '💰' },
  { label: 'Immediate Start Available', emoji: '🚀' },
  { label: 'Requires Sponsorship', emoji: '📄' },
];

// Six pre-populated industry tag sets recruiters can load and customise from
// the Custom Tag Sets settings screen or the new-campaign tag-set picker.
// These are static/read-only — "loading" one just copies its tags into the
// editor, where saving creates a real employer-owned tag_templates row.
const STARTER_TAG_SETS = [
  {
    key: 'immigration-visa',
    name: 'Immigration and Visa',
    tags: [
      { label: 'Permanent Resident', emoji: '🟢' },
      { label: 'Student Visa', emoji: '🎓' },
      { label: '482 Work Visa', emoji: '🛂' },
      { label: 'Working Holiday Visa', emoji: '🌏' },
      { label: 'No Work Rights', emoji: '🚫' },
      { label: 'Needs Sponsorship', emoji: '📄' },
      { label: 'Full Work Rights', emoji: '✅' },
      { label: 'Visa Expiring Soon', emoji: '⏳' },
    ],
  },
  {
    key: 'technology-it',
    name: 'Technology and IT',
    tags: [
      { label: 'React Developer', emoji: '⚛️' },
      { label: 'Python Developer', emoji: '🐍' },
      { label: 'Notice Period 2 weeks', emoji: '📆' },
      { label: 'Notice Period 4 weeks', emoji: '📆' },
      { label: 'Salary Match', emoji: '💰' },
      { label: 'Salary Too High', emoji: '💸' },
      { label: 'Willing to Relocate', emoji: '🧳' },
      { label: 'Immediate Start', emoji: '🚀' },
    ],
  },
  {
    key: 'healthcare',
    name: 'Healthcare',
    tags: [
      { label: 'AHPRA Registered', emoji: '✅' },
      { label: 'AHPRA In Progress', emoji: '⏳' },
      { label: 'ICU Experience', emoji: '🏥' },
      { label: 'Emergency Experience', emoji: '🚑' },
      { label: 'Aged Care Experience', emoji: '👵' },
      { label: 'Working with Children Check', emoji: '🧒' },
      { label: 'Overseas Trained', emoji: '🌏' },
      { label: 'Needs Credentialing', emoji: '📋' },
    ],
  },
  {
    key: 'construction-trades',
    name: 'Construction and Trades',
    tags: [
      { label: 'White Card Holder', emoji: '🦺' },
      { label: 'Licence Current', emoji: '✅' },
      { label: 'Licence Expired', emoji: '⚠️' },
      { label: 'Own Transport', emoji: '🚗' },
      { label: 'Local to Site', emoji: '📍' },
      { label: 'Heavy Machinery Licence', emoji: '🚜' },
      { label: 'Site Supervisor Experience', emoji: '👷' },
      { label: 'SWMS Familiar', emoji: '📋' },
    ],
  },
  {
    key: 'education',
    name: 'Education',
    tags: [
      { label: 'Teaching Registration Current', emoji: '✅' },
      { label: 'Primary Specialist', emoji: '🧑‍🏫' },
      { label: 'Secondary Specialist', emoji: '📚' },
      { label: 'Relief Available', emoji: '🔁' },
      { label: 'Immediate Start', emoji: '🚀' },
      { label: 'Interstate Candidate', emoji: '✈️' },
      { label: 'Postgraduate Qualified', emoji: '🎓' },
    ],
  },
  {
    key: 'finance',
    name: 'Finance',
    tags: [
      { label: 'CPA Qualified', emoji: '📊' },
      { label: 'CA Qualified', emoji: '📈' },
      { label: 'AFSL Holder', emoji: '📜' },
      { label: 'Compliance Background', emoji: '🛡️' },
      { label: 'Big Four Experience', emoji: '🏢' },
      { label: 'Available Immediately', emoji: '🚀' },
    ],
  },
];

function getEmployerCompany(userId) {
  return db.prepare(`
    SELECT c.* FROM companies c
    JOIN company_members cm ON cm.company_id = c.id
    WHERE cm.user_id = ?
    LIMIT 1
  `).get(userId);
}

// GET /api/campaigns/default-tags
router.get('/default-tags', authMiddleware, (req, res) => {
  res.json({ tags: DEFAULT_TAGS });
});

// GET /api/campaigns/starter-tag-sets — the six pre-populated industry tag
// sets. Read-only and not tied to any employer; the frontend copies one
// into the tag set editor when a recruiter chooses to "load and customise"
// it, and only saving there creates a real employer-owned template.
router.get('/starter-tag-sets', authMiddleware, (req, res) => {
  res.json({ tagSets: STARTER_TAG_SETS });
});

// GET /api/campaigns/tag-templates — employer's own saved custom tag sets
router.get('/tag-templates', authMiddleware, (req, res) => {
  const templates = db.prepare('SELECT * FROM tag_templates WHERE employer_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ templates: templates.map((t) => ({ ...t, tags: JSON.parse(t.tags) })) });
});

// POST /api/campaigns/tag-templates
router.post('/tag-templates', authMiddleware, (req, res) => {
  const company = getEmployerCompany(req.user.id);
  if (company) {
    const existingCount = db.prepare('SELECT COUNT(*) as n FROM tag_templates WHERE employer_user_id = ?').get(req.user.id).n;
    const check = checkCountLimit('company', company.id, 'custom_tag_sets_limit', existingCount);
    if (!check.allowed) {
      return res.status(403).json({
        error: `Your plan allows up to ${check.limit} custom tag set${check.limit === 1 ? '' : 's'}. Upgrade to create more.`,
        featureLocked: true,
        feature: 'custom_tag_sets_limit',
      });
    }
  }

  const { name, tags } = req.body;
  if (!name || !Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ error: 'A template name and at least one tag are required' });
  }
  const id = newId('tagtpl');
  db.prepare('INSERT INTO tag_templates (id, employer_user_id, name, tags) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, name.trim(), JSON.stringify(tags));
  res.status(201).json({ template: { id, name: name.trim(), tags } });
});

// PUT /api/campaigns/tag-templates/:id — rename/edit an existing saved tag set
router.put('/tag-templates/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM tag_templates WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Tag set not found' });

  const { name, tags } = req.body;
  if (!name || !Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ error: 'A template name and at least one tag are required' });
  }
  db.prepare('UPDATE tag_templates SET name = ?, tags = ? WHERE id = ?')
    .run(name.trim(), JSON.stringify(tags), req.params.id);
  res.json({ template: { id: req.params.id, name: name.trim(), tags } });
});

// DELETE /api/campaigns/tag-templates/:id
router.delete('/tag-templates/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM tag_templates WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Tag set not found' });
  db.prepare('DELETE FROM tag_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/campaigns
// body: { name, tags: [{label,emoji}]?, tagTemplateId?, batches: [{ callDate, candidates: [{name, phone, jobRole, extra}] }] }
// Candidate parsing/column-mapping happens client-side (SheetJS in the
// browser) — this endpoint just receives the already-mapped structured data
// and splits it into day-batches.
router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'employer') {
    return res.status(403).json({ error: 'Only employer accounts can create campaigns' });
  }

  const company = getEmployerCompany(req.user.id);
  if (!company) return res.status(404).json({ error: 'No company profile found for this user' });

  // Campaign Manager is a plan-gated feature — the free plan doesn't
  // include it at all (see services/featureFlags.js / Plan Control).
  if (!hasFeature('company', company.id, 'campaign_manager')) {
    return res.status(403).json({
      error: 'The Campaign Manager requires the Starter plan or above.',
      featureLocked: true,
      feature: 'campaign_manager',
    });
  }

  const { name, tags, tagTemplateId, batches, campaignType, assignedTo, routeId } = req.body;
  if (!name || !Array.isArray(batches) || batches.length === 0) {
    return res.status(400).json({ error: 'A campaign name and at least one candidate list are required' });
  }
  for (const batch of batches) {
    if (!batch.callDate || !Array.isArray(batch.candidates) || batch.candidates.length === 0) {
      return res.status(400).json({ error: 'Each list needs a call date and at least one candidate' });
    }
    for (const c of batch.candidates) {
      if (!c.name || !c.phone) {
        return res.status(400).json({ error: 'Every candidate needs a name and phone number' });
      }
    }
  }

  // File upload / candidate-count cap — "up to N candidates" is a per-upload
  // ceiling, checked against the total across every batch in this request.
  const totalCandidates = batches.reduce((sum, b) => sum + b.candidates.length, 0);
  const uploadLimit = getFeatureValue('company', company.id, 'file_upload_max_candidates');
  const numericUploadLimit = typeof uploadLimit === 'number' ? uploadLimit : Infinity;
  if (totalCandidates > numericUploadLimit) {
    return res.status(403).json({
      error: numericUploadLimit === 0
        ? 'File upload is not available on your current plan.'
        : `Your plan allows up to ${numericUploadLimit} candidates per upload — this file has ${totalCandidates}. Upgrade to upload more at once.`,
      featureLocked: true,
      feature: 'file_upload_max_candidates',
    });
  }

  const finalTags = Array.isArray(tags) && tags.length > 0 ? tags : DEFAULT_TAGS;
  const campaignId = newId('campaign');

  db.prepare(`
    INSERT INTO campaigns (id, employer_user_id, company_id, name, tag_template_id, tags, campaign_type, assigned_to, route_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(campaignId, req.user.id, company ? company.id : null, name.trim(), tagTemplateId || null, JSON.stringify(finalTags), campaignType || 'recruitment', assignedTo || null, routeId || null);

  const insertBatch = db.prepare('INSERT INTO campaign_batches (id, campaign_id, call_date) VALUES (?, ?, ?)');
  const insertCandidate = db.prepare(`
    INSERT INTO campaign_candidates (id, batch_id, order_index, name, phone, job_role, extra_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const batchSummaries = [];
  for (const batch of batches) {
    const batchId = newId('batch');
    insertBatch.run(batchId, campaignId, batch.callDate);
    batch.candidates.forEach((c, idx) => {
      insertCandidate.run(
        newId('cand'), batchId, idx, String(c.name).trim(), String(c.phone).trim(), c.jobRole ? String(c.jobRole).trim() : null,
        JSON.stringify(c.extra || {})
      );
    });
    batchSummaries.push({ id: batchId, callDate: batch.callDate, candidateCount: batch.candidates.length });
  }

  incrementUsage('company', company.id, 'campaigns_count', 1);
  incrementUsage('company', company.id, 'candidates_uploaded_count', totalCandidates);
  checkAndSendUsageAlerts('company', company.id).catch((err) => console.error('[campaigns] usage alert failed:', err.message));

  res.status(201).json({ campaign: { id: campaignId, name: name.trim(), tags: finalTags }, batches: batchSummaries });
});

// GET /api/campaigns/callbacks/due — every scheduled callback across all of
// this employer's campaigns, soonest first. Feeds the "Callbacks Due Today"
// dashboard section.
router.get('/callbacks/due', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT cc.*, camp.name as campaign_name, camp.id as campaign_id
    FROM campaign_candidates cc
    JOIN campaign_batches cb ON cb.id = cc.batch_id
    JOIN campaigns camp ON camp.id = cb.campaign_id
    WHERE camp.employer_user_id = ? AND cc.callback_at IS NOT NULL
    ORDER BY cc.callback_at ASC
  `).all(req.user.id);
  res.json({ callbacks: rows.map((r) => ({ ...r, tags: JSON.parse(r.tags), extra_data: JSON.parse(r.extra_data) })) });
});

// GET /api/campaigns — employer's campaign list with basic counts
router.get('/', authMiddleware, (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE employer_user_id = ? ORDER BY created_at DESC').all(req.user.id);

  const withCounts = campaigns.map((camp) => {
    const batches = db.prepare('SELECT id, call_date FROM campaign_batches WHERE campaign_id = ?').all(camp.id);
    let candidateCount = 0;
    for (const b of batches) {
      candidateCount += db.prepare('SELECT COUNT(*) as n FROM campaign_candidates WHERE batch_id = ?').get(b.id).n;
    }
    return { ...camp, tags: JSON.parse(camp.tags), batchCount: batches.length, candidateCount };
  });

  res.json({ campaigns: withCounts });
});

// GET /api/campaigns/:id — full detail including batches + candidates
router.get('/:id', authMiddleware, (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const batches = db.prepare('SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY call_date ASC').all(campaign.id);
  const batchesWithCandidates = batches.map((batch) => {
    const candidates = db.prepare('SELECT * FROM campaign_candidates WHERE batch_id = ? ORDER BY order_index ASC').all(batch.id);
    return {
      ...batch,
      candidates: candidates.map((c) => ({ ...c, tags: JSON.parse(c.tags), extra_data: JSON.parse(c.extra_data) })),
    };
  });

  res.json({ campaign: { ...campaign, tags: JSON.parse(campaign.tags) }, batches: batchesWithCandidates });
});

// PUT /api/campaigns/:id — rename a campaign
router.put('/:id', authMiddleware, (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Campaign name cannot be empty' });
  }
  db.prepare('UPDATE campaigns SET name = ? WHERE id = ?').run(name.trim(), campaign.id);
  res.json({ campaign: { ...campaign, name: name.trim() } });
});

// DELETE /api/campaigns/:id — removes the campaign and every candidate in it
router.delete('/:id', authMiddleware, (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const batches = db.prepare('SELECT id FROM campaign_batches WHERE campaign_id = ?').all(campaign.id);
  const deleteCandidates = db.prepare('DELETE FROM campaign_candidates WHERE batch_id = ?');
  for (const b of batches) deleteCandidates.run(b.id);
  db.prepare('DELETE FROM campaign_batches WHERE campaign_id = ?').run(campaign.id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaign.id);

  res.json({ success: true });
});

// PUT /api/campaigns/:campaignId/candidates/:candidateId
// Saves the outcome of a live call — tags, free-text notes, outcome,
// duration, the linked call record, and any scheduled callback — against a
// campaign candidate. Used by the two-column live call screen's
// "Save and Next" action.
router.put('/:campaignId/candidates/:candidateId', authMiddleware, (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.campaignId, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const candidate = db.prepare(`
    SELECT cc.* FROM campaign_candidates cc
    JOIN campaign_batches cb ON cb.id = cc.batch_id
    WHERE cc.id = ? AND cb.campaign_id = ?
  `).get(req.params.candidateId, campaign.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const { tags, notes, outcome, callStatus, durationSeconds, callId, callbackAt, name, phone, jobRole } = req.body;

  // name/phone/jobRole are corrections the recruiter makes by hand when the
  // uploaded file had bad data in that column (e.g. a LinkedIn URL instead
  // of a name) — everything else is the live-call-notes save path.
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }
  if (phone !== undefined && !String(phone).trim()) {
    return res.status(400).json({ error: 'Phone number cannot be empty' });
  }

  const next = {
    tags: tags !== undefined ? JSON.stringify(tags) : candidate.tags,
    notes: notes !== undefined ? notes : candidate.notes,
    outcome: outcome !== undefined ? outcome : candidate.outcome,
    call_status: callStatus !== undefined ? callStatus : candidate.call_status,
    duration_seconds: durationSeconds !== undefined ? durationSeconds : candidate.duration_seconds,
    call_id: callId !== undefined ? callId : candidate.call_id,
    callback_at: callbackAt !== undefined ? callbackAt : candidate.callback_at,
    called_at: callStatus !== undefined ? new Date().toISOString() : candidate.called_at,
    name: name !== undefined ? String(name).trim() : candidate.name,
    phone: phone !== undefined ? String(phone).trim() : candidate.phone,
    job_role: jobRole !== undefined ? (String(jobRole).trim() || null) : candidate.job_role,
    // A changed callback time (including rescheduling to a new time, or
    // clearing it) means any previously-sent reminder no longer applies —
    // reset it so the reminder scheduler can fire again for the new time.
    callback_reminder_sent_at: callbackAt !== undefined && callbackAt !== candidate.callback_at ? null : candidate.callback_reminder_sent_at,
  };

  db.prepare(`
    UPDATE campaign_candidates SET
      tags = ?, notes = ?, outcome = ?, call_status = ?, duration_seconds = ?, call_id = ?, callback_at = ?, called_at = ?,
      name = ?, phone = ?, job_role = ?, callback_reminder_sent_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    next.tags, next.notes, next.outcome, next.call_status, next.duration_seconds, next.call_id, next.callback_at, next.called_at,
    next.name, next.phone, next.job_role, next.callback_reminder_sent_at, req.params.candidateId
  );

  const updated = db.prepare('SELECT * FROM campaign_candidates WHERE id = ?').get(req.params.candidateId);
  res.json({ candidate: { ...updated, tags: JSON.parse(updated.tags), extra_data: JSON.parse(updated.extra_data) } });
});

function findOwnedCandidate(req) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.campaignId, req.user.id);
  if (!campaign) return { campaign: null, candidate: null };
  const candidate = db.prepare(`
    SELECT cc.* FROM campaign_candidates cc
    JOIN campaign_batches cb ON cb.id = cc.batch_id
    WHERE cc.id = ? AND cb.campaign_id = ?
  `).get(req.params.candidateId, campaign.id);
  return { campaign, candidate };
}

// PUT /api/campaigns/:campaignId/candidates/:candidateId/skip
// "Skip for Now" — pushes the candidate to the back of their batch's
// calling order instead of recording a fabricated call outcome, so they
// naturally come up again later in the queue.
router.put('/:campaignId/candidates/:candidateId/skip', authMiddleware, (req, res) => {
  const { campaign, candidate } = findOwnedCandidate(req);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM campaign_candidates WHERE batch_id = ?').get(candidate.batch_id).m || 0;
  db.prepare('UPDATE campaign_candidates SET order_index = ?, updated_at = datetime(\'now\') WHERE id = ?').run(maxOrder + 1, candidate.id);

  res.json({ success: true });
});

// POST /api/campaigns/:campaignId/candidates/:candidateId/sms — sends an
// advance SMS reminder to the candidate ("an employer will be calling you
// soon"). Falls back to a dev-mode console log if Twilio SMS credentials
// aren't configured, same pattern as OTP/admin emails.
router.post('/:campaignId/candidates/:candidateId/sms', authMiddleware, async (req, res) => {
  const employerCompany = getEmployerCompany(req.user.id);
  if (employerCompany && !hasFeature('company', employerCompany.id, 'advance_sms')) {
    return res.status(403).json({
      error: 'Advance SMS requires the Growth plan or above.',
      featureLocked: true,
      feature: 'advance_sms',
    });
  }

  const { campaign, candidate } = findOwnedCandidate(req);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const company = campaign.company_id
    ? db.prepare('SELECT name FROM companies WHERE id = ?').get(campaign.company_id)
    : null;
  const { name: candidateName } = resolveCandidateName({ name: candidate.name, extra_data: JSON.parse(candidate.extra_data || '{}') });

  const body = buildCandidateReminderText({
    companyName: company?.name || 'The employer',
    jobRole: candidate.job_role,
    candidateName,
  });

  try {
    const result = await sendCandidateSms(candidate.phone, body);
    db.prepare("UPDATE campaign_candidates SET sms_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(candidate.id);
    res.json({ success: true, devMode: !!result.devMode });
  } catch (err) {
    res.status(502).json({ error: `Could not send SMS: ${err.message}` });
  }
});

// DELETE /api/campaigns/:campaignId/candidates/:candidateId — removes a
// single candidate from a campaign (used by "Remove from Queue" / "Remove
// from Campaign" quick actions).
router.delete('/:campaignId/candidates/:candidateId', authMiddleware, (req, res) => {
  const { campaign, candidate } = findOwnedCandidate(req);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  db.prepare('DELETE FROM campaign_candidates WHERE id = ?').run(candidate.id);
  res.json({ success: true });
});

// GET /api/campaigns/:id/results.xlsx
// Always generated fresh from the current database state, so it's
// effectively "live" — there's no separately-maintained file to fall out of
// sync. The original uploaded file is never touched; this is a distinct
// results export.
router.get('/:id/results.xlsx', authMiddleware, (req, res) => {
  const exportCompany = getEmployerCompany(req.user.id);
  if (exportCompany && !hasFeature('company', exportCompany.id, 'results_export')) {
    return res.status(403).json({ error: 'Results export requires the Starter plan or above.', featureLocked: true, feature: 'results_export' });
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const batches = db.prepare('SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY call_date ASC').all(campaign.id);
  const rows = [];
  for (const batch of batches) {
    const candidates = db.prepare('SELECT * FROM campaign_candidates WHERE batch_id = ? ORDER BY order_index ASC').all(batch.id);
    for (const c of candidates) {
      const tags = JSON.parse(c.tags || '[]');
      const extraData = JSON.parse(c.extra_data || '{}');
      const { name: realName } = resolveCandidateName({ name: c.name, extra_data: extraData });
      rows.push({
        'Candidate Name': realName,
        'Phone Number': c.phone,
        'Job Role': c.job_role || '',
        'Call Date': batch.call_date,
        'Called At': c.called_at || '',
        'Answered': c.call_status === 'not_called' ? '' : (c.call_status === 'answered' ? 'Yes' : 'No'),
        'Duration': c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : '',
        'Tags': tags.map((t) => (typeof t === 'string' ? t : t.label)).join(', '),
        'Notes': c.notes || '',
        'Outcome': c.outcome || '',
        'Callback Time': c.callback_at || '',
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const safeName = campaign.name.replace(/[\\/:*?"<>|]/g, '');
  const filename = `ClearCall Results ${safeName} ${dateStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// GET /api/campaigns/:id/callbacks.xlsx — just the candidates in this
// campaign with a scheduled callback, for the "Download Callbacks Due"
// button on the end-of-day summary screen.
router.get('/:id/callbacks.xlsx', authMiddleware, (req, res) => {
  const exportCompany = getEmployerCompany(req.user.id);
  if (exportCompany && !hasFeature('company', exportCompany.id, 'results_export')) {
    return res.status(403).json({ error: 'Results export requires the Starter plan or above.', featureLocked: true, feature: 'results_export' });
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND employer_user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const batches = db.prepare('SELECT * FROM campaign_batches WHERE campaign_id = ? ORDER BY call_date ASC').all(campaign.id);
  const rows = [];
  for (const batch of batches) {
    const candidates = db.prepare('SELECT * FROM campaign_candidates WHERE batch_id = ? AND callback_at IS NOT NULL ORDER BY callback_at ASC').all(batch.id);
    for (const c of candidates) {
      const extraData = JSON.parse(c.extra_data || '{}');
      const { name: realName } = resolveCandidateName({ name: c.name, extra_data: extraData });
      rows.push({
        'Candidate Name': realName,
        'Phone Number': c.phone,
        'Job Role': c.job_role || '',
        'Callback Time': c.callback_at || '',
        'Outcome': c.outcome || '',
        'Notes': c.notes || '',
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Callbacks Due');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const safeName = campaign.name.replace(/[\\/:*?"<>|]/g, '');
  const filename = `ClearCall Callbacks Due ${safeName} ${dateStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

module.exports = router;
