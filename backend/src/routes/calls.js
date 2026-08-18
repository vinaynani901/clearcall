const express = require('express');
const twilio = require('twilio');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { generateVoiceAccessToken, buildDialTwiml, buildCallMetadataPush, normalizeAuPhone } = require('../services/twilio');
const { notifyIncomingVerifiedCall } = require('../services/callNotify');
const { getFeatureValue, checkAndSendUsageAlerts, checkVerifiedCallLimit, recordVerifiedCall } = require('../services/featureFlags');

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

/**
 * Rejects any POST to our Twilio webhooks that doesn't carry a valid
 * X-Twilio-Signature header, so nobody can forge a request to fake a call
 * connecting or manipulate call records. Requires app.set('trust proxy', 1)
 * in server.js so req.protocol correctly reflects https behind Railway's
 * reverse proxy — otherwise the reconstructed URL won't match what Twilio
 * signed and every real request would be rejected too.
 *
 * Skipped when running without real Twilio credentials (local dev with
 * placeholder .env values) so local testing isn't blocked.
 */
function requireTwilioSignature(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || authToken === 'your-twilio-token-here') {
    return next();
  }
  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!valid) {
    console.warn(`Rejected webhook request with invalid Twilio signature: ${url}`);
    return res.status(403).send('Invalid Twilio signature');
  }
  next();
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
  if (company && callType === 'clearcall') {
    // Only the Free plan actually blocks here — Starter/Growth/Enterprise
    // never block once the included monthly limit is reached, they switch
    // to overage billing instead (see recordVerifiedCall below, called
    // after the call record is created). Enterprise Plus has an unlimited
    // limit so this never trips for it either.
    const usageCheck = checkVerifiedCallLimit(company.id);
    if (usageCheck.blocked) {
      return res.status(403).json({
        error: `You have used all ${usageCheck.limit} verified call${usageCheck.limit === 1 ? '' : 's'} on your plan this month. Upgrade to continue making verified calls.`,
        featureLocked: true,
        feature: 'verified_calls_monthly_limit',
      });
    }
  }

  const settings = db.prepare('SELECT * FROM call_display_settings WHERE user_id = ?').get(req.user.id) || {
    hide_number: 1, show_name: 1, show_designation: 1, show_photo: 0,
  };

  const id = newId('call');

  db.prepare(`
    INSERT INTO calls (id, caller_user_id, company_id, receiver_phone, receiver_name, job_role, note, call_type, call_status,
      hide_number, show_name, show_designation, show_photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'initiated', ?, ?, ?, ?)
  `).run(
    id, req.user.id, company ? company.id : null, receiverPhone.trim(), receiverName || null, jobRole || null, note || null, callType,
    settings.hide_number, settings.show_name, settings.show_designation, settings.show_photo
  );

  let metadataPush = null;

  // Link this call to a ClearCall job seeker account by phone number,
  // regardless of call type — this is what lets the receiver's own Call
  // Protection screen show both verified ClearCall calls and unverified
  // "normal" calls placed through the platform, so the contrast between the
  // two is meaningful rather than only ever showing verified calls.
  const normalizedReceiver = normalizeAuPhone(receiverPhone);
  const receiverUser = db.prepare("SELECT id, phone FROM users WHERE role = 'jobseeker' AND phone IS NOT NULL").all()
    .find((u) => normalizeAuPhone(u.phone) === normalizedReceiver);
  if (receiverUser) {
    db.prepare('UPDATE calls SET receiver_user_id = ? WHERE id = ?').run(receiverUser.id, id);
  }

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

    // metadataPush above only reaches the caller's own browser (returned in
    // this response, used to render their side of the flow) — this is the
    // actual delivery to the receiver. The matching (is this phone number a
    // registered job seeker?) happens right here, at call-initiation time,
    // as required: if yes, they get a real push (FCM + web push) with the
    // full verified details; if either the match fails or every push
    // channel comes up empty, an advance SMS goes out instead so the person
    // is never left with no notification at all. Fire-and-forget: a
    // notification failure must never block call setup.
    notifyIncomingVerifiedCall({
      receiverUser,
      receiverPhone,
      company,
      callerName: settings.show_name ? req.user.full_name : null,
      designation: settings.show_designation ? (activeProfile ? activeProfile.designation : company.contact_name) : null,
      jobRole,
      hideNumber: !!settings.hide_number,
    }).catch((err) => console.error('[callNotify] Failed to notify call receiver:', err.message));

    if (company) {
      // recordVerifiedCall handles both the plain increment (for
      // Free/dashboard display) and, once the plan's included limit is
      // exceeded, the real-time overage count + charge for Starter/
      // Growth/Enterprise — see services/featureFlags.js.
      recordVerifiedCall(company.id);
      checkAndSendUsageAlerts('company', company.id).catch((err) => console.error('[calls] usage alert failed:', err.message));
    }
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
router.post('/voice-twiml', express.urlencoded({ extended: false }), requireTwilioSignature, (req, res) => {
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
router.post('/voice-status', express.urlencoded({ extended: false }), requireTwilioSignature, (req, res) => {
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

// PUT /api/calls/:id/outcome — the Call Outcome screen shown after a
// manually-placed (non-campaign) Make a Call ends. Sets the human-chosen
// outcome label (same OUTCOME_OPTIONS set campaign calls use) and, since a
// "normal" call never gets a Twilio status-callback update (no browser
// Device connection is placed for that call type — see routes/calls.js
// POST /initiate), also derives a sensible call_status from the outcome so
// the record doesn't sit at 'initiated' forever. An optional edited note
// overwrites whatever was captured on the Make a Call form.
const OUTCOME_TO_STATUS = {
  'Not Answered': 'missed',
  'Went to Voicemail': 'missed',
};
router.put('/:id/outcome', authMiddleware, (req, res) => {
  const { outcome, note } = req.body;
  if (!outcome || typeof outcome !== 'string') {
    return res.status(400).json({ error: 'outcome is required' });
  }
  const call = db.prepare('SELECT * FROM calls WHERE id = ? AND caller_user_id = ?').get(req.params.id, req.user.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const derivedStatus = OUTCOME_TO_STATUS[outcome] || (call.call_status === 'initiated' ? 'answered' : call.call_status);

  db.prepare('UPDATE calls SET outcome = ?, call_status = ?, note = ? WHERE id = ?')
    .run(outcome, derivedStatus, note !== undefined ? note : call.note, req.params.id);

  res.json({ call: db.prepare('SELECT * FROM calls WHERE id = ?').get(req.params.id) });
});

// GET /api/calls/history
// The recruiter (caller) always sees the full receiver phone number.
// If this endpoint is ever used to serve the RECEIVER's view of a call,
// the receiver_phone/recruiter number must be stripped when hide_number = 1.
router.get('/history', authMiddleware, (req, res) => {
  const { filter } = req.query; // all | clearcall | normal

  let query = `
    SELECT calls.*, companies.name as company_name, companies.logo_url as company_logo_url, companies.abn_verified as company_abn_verified,
      cc.id as candidate_id, COALESCE(calls.outcome, cc.outcome) as outcome, camp.id as campaign_id, camp.name as campaign_name
    FROM calls
    LEFT JOIN companies ON companies.id = calls.company_id
    LEFT JOIN campaign_candidates cc ON cc.call_id = calls.id
    LEFT JOIN campaign_batches cb ON cb.id = cc.batch_id
    LEFT JOIN campaigns camp ON camp.id = cb.campaign_id
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

// GET /api/calls/received — the JOB SEEKER's own view of calls placed to
// them through ClearCall (both verified and normal). Deliberately excludes
// receiver_phone/any employer phone number from the response — a job
// seeker's Call Protection screen must never show a phone number, whether
// it's their own or the caller's.
router.get('/received', authMiddleware, (req, res) => {
  if (req.user.role !== 'jobseeker') {
    return res.status(403).json({ error: 'Job seeker account required' });
  }

  // Free plan sees only the most recent N calls (call_history_limit);
  // premium's limit resolves to Infinity, so the LIMIT clause is simply
  // omitted rather than passing a non-numeric bind value.
  const limitValue = getFeatureValue('user', req.user.id, 'call_history_limit');
  const numericLimit = typeof limitValue === 'number' ? limitValue : null;

  const calls = db.prepare(`
    SELECT calls.id, calls.job_role, calls.call_type, calls.call_status, calls.duration_seconds,
      calls.show_name, calls.show_designation, calls.created_at,
      companies.id as company_id, companies.name as company_name, companies.logo_url as company_logo_url,
      companies.abn_verified as company_abn_verified
    FROM calls
    LEFT JOIN companies ON companies.id = calls.company_id
    WHERE calls.receiver_user_id = ?
    ORDER BY calls.created_at DESC
    ${numericLimit !== null ? 'LIMIT ?' : ''}
  `).all(...(numericLimit !== null ? [req.user.id, numericLimit] : [req.user.id]));

  res.json({ calls, limited: numericLimit !== null, limit: numericLimit });
});

module.exports = router;
