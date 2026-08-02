const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { generateVoiceAccessToken, buildDialTwiml, buildCallMetadataPush } = require('../services/twilio');

const router = express.Router();

function getUserCompany(userId) {
  return db.prepare(`
    SELECT c.* FROM companies c
    JOIN company_members cm ON cm.company_id = c.id
    WHERE cm.user_id = ?
    LIMIT 1
  `).get(userId);
}

function publicBaseUrl() {
  return process.env.PUBLIC_BASE_URL || 'https://example.com';
}

// GET /api/calls/voice-token
// Issues a short-lived Twilio Access Token so the employer's browser can
// register as a Voice client and place a real outbound call over WebRTC —
// no phone number or SIM needed on the employer's own device.
router.get('/voice-token', authMiddleware, (req, res) => {
  const token = generateVoiceAccessToken(req.user.id);
  if (!token) {
    return res.status(503).json({ error: 'Calling is not configured yet. Add your Twilio API Key, API Secret, and TwiML App SID to enable real calls.' });
  }
  res.json({ token, identity: req.user.id });
});

// POST /api/calls/initiate
// Creates the call record and (for ClearCall Verified Calls) the metadata
// that will be shown on the receiver's Incoming Verified Call screen. The
// actual audio connection is placed afterwards by the employer's browser
// using the Twilio Voice SDK and the returned call.id.
router.post('/initiate', authMiddleware, async (req, res) => {
  const { receiverPhone, receiverName, jobRole, callType, note } = req.body;
  if (!receiverPhone || !callType) {
    return res.status(400).json({ error: 'receiverPhone and callType are required' });
  }
  if (!['clearcall', 'normal'].includes(callType)) {
    return res.status(400).json({ error: 'callType must be clearcall or normal' });
  }

  const company = getUserCompany(req.user.id);
  if (callType === 'clearcall' && !company) {
    return res.status(403).json({ error: 'Only verified employer accounts can make ClearCall Verified Calls' });
  }
  if (company && company.suspension_status) {
    return res.status(403).json({ error: 'This company account is suspended pending review and cannot make calls' });
  }
  if (company && !company.abn_verified) {
    return res.status(403).json({ error: 'Your company ABN must be verified before making calls' });
  }

  const settings = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id) || {
    hide_number: 1, show_name: 1, show_designation: 1, show_photo: 0,
  };

  const id = newId('call');

  db.prepare(`
    INSERT INTO calls (id, caller_user_id, company_id, receiver_phone, receiver_name, job_role, call_type, call_status,
      hide_number, show_name, show_designation, show_photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'initiated', ?, ?, ?, ?)
  `).run(
    id, req.user.id, company ? company.id : null, receiverPhone.trim(), receiverName || null, jobRole || null, callType,
    settings.hide_number, settings.show_name, settings.show_designation, settings.show_photo
  );

  let metadataPush = null;

  if (callType === 'clearcall') {
    const activeProfile = db.prepare('SELECT * FROM work_profiles WHERE user_id = ? AND is_active = 1').get(req.user.id);
    metadataPush = buildCallMetadataPush({
      company,
      callerName: settings.show_name ? req.user.full_name : null,
      designation: settings.show_designation ? (activeProfile ? activeProfile.designation : company.contact_name) : null,
      jobRole,
      hideNumber: !!settings.hide_number,
      recruiterPhone: req.user.phone,
    });
  }

  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
  res.status(201).json({ call, metadataPush });
});

// POST /api/calls/voice-twiml
// Public Twilio webhook — hit automatically when the employer's browser
// calls device.connect(). Twilio POSTs the custom params we passed from
// the browser (PhoneNumber, CallId) alongside its own CallSid. We record
// the Twilio CallSid against our internal call row so voice-status
// callbacks below can later be matched back to it, then return TwiML that
// dials the receiver's real phone with the masked ClearCall number as
// caller ID.
router.post('/voice-twiml', express.urlencoded({ extended: false }), (req, res) => {
  const { PhoneNumber, CallId, CallSid } = req.body;

  if (CallId && CallSid) {
    db.prepare('UPDATE calls SET twilio_call_sid = ? WHERE id = ?').run(CallSid, CallId);
  }

  if (!PhoneNumber) {
    res.type('text/xml');
    return res.send('<Response><Say>Sorry, this call could not be connected. Goodbye.</Say></Response>');
  }

  const twiml = buildDialTwiml({
    toPhone: PhoneNumber,
    statusCallbackUrl: `${publicBaseUrl()}/api/calls/voice-status`,
  });

  res.type('text/xml');
  res.send(twiml);
});

// POST /api/calls/voice-status
// Public Twilio webhook — status callback for the <Dial><Number> leg.
// Updates our call record's status/duration as the receiver's phone rings,
// answers, and the call ends.
router.post('/voice-status', express.urlencoded({ extended: false }), (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  if (!CallSid) return res.sendStatus(200);

  const call = db.prepare('SELECT * FROM calls WHERE twilio_call_sid = ?').get(CallSid);
  if (!call) return res.sendStatus(200);

  let status = null;
  if (CallStatus === 'in-progress') status = 'answered';
  else if (CallStatus === 'completed') status = Number(CallDuration) > 0 ? 'answered' : 'missed';
  else if (CallStatus === 'no-answer') status = 'missed';
  else if (CallStatus === 'busy') status = 'declined';
  else if (CallStatus === 'failed' || CallStatus === 'canceled') status = 'missed';

  if (status) {
    db.prepare('UPDATE calls SET call_status = ?, duration_seconds = ? WHERE id = ?')
      .run(status, Number(CallDuration) || call.duration_seconds || 0, call.id);
  }

  res.sendStatus(200);
});

// PUT /api/calls/:id/status  (update status + duration, e.g. answered/declined/missed)
router.put('/:id/status', authMiddleware, (req, res) => {
  const { callStatus, durationSeconds } = req.body;
  if (!['answered', 'declined', 'missed'].includes(callStatus)) {
    return res.status(400).json({ error: 'callStatus must be answered, declined, or missed' });
  }
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  db.prepare('UPDATE calls SET call_status = ?, duration_seconds = ? WHERE id = ?')
    .run(callStatus, durationSeconds || 0, req.params.id);

  res.json({ call: db.prepare('SELECT * FROM calls WHERE id = ?').get(req.params.id) });
});

// GET /api/calls/history
// The recruiter (caller) always sees the full receiver phone number.
// If this endpoint is ever used to serve the RECEIVER's view of a call,
// the receiver_phone/recruiter number must be stripped when hide_number = 1.
router.get('/history', authMiddleware, (req, res) => {
  const { filter } = req.query; // all | clearcall | normal

  let query = `
    SELECT calls.*, companies.name as company_name, companies.logo_url as company_logo_url, companies.abn_verified as company_abn_verified
    FROM calls
    LEFT JOIN companies ON companies.id = calls.company_id
    WHERE calls.caller_user_id = ?
  `;
  const params = [req.user.id];

  if (filter === 'clearcall' || filter === 'normal') {
    query += ' AND calls.call_type = ?';
    params.push(filter);
  }
  query += ' ORDER BY calls.created_at DESC';

  const calls = db.prepare(query).all(...params);
  res.json({ calls });
});

module.exports = router;
