const twilio = require('twilio');

function credentialsConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID, TWILIO_PHONE_NUMBER } = process.env;
  return !!(
    TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your-twilio-sid-here' &&
    TWILIO_API_KEY && TWILIO_API_KEY !== 'your-twilio-api-key-here' &&
    TWILIO_API_SECRET && TWILIO_API_SECRET !== 'your-twilio-api-secret-here' &&
    TWILIO_TWIML_APP_SID && TWILIO_TWIML_APP_SID !== 'your-twiml-app-sid-here' &&
    TWILIO_PHONE_NUMBER
  );
}

/**
 * Generates a short-lived Twilio Access Token that lets the employer's own
 * browser register as a Twilio Voice client and place outbound calls
 * directly via WebRTC — no phone, SIM, or dialler app needed on their end.
 *
 * The token only grants OUTGOING call permission (incomingAllow: false)
 * because ClearCall employers only ever place calls from the browser; they
 * never receive calls on this client identity.
 */
function generateVoiceAccessToken(identity) {
  if (!credentialsConfigured()) return null;

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: false,
  });

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: String(identity), ttl: 3600 }
  );
  token.addGrant(voiceGrant);

  return token.toJwt();
}

/**
 * Twilio requires phone numbers in E.164 format (e.g. +61414705803).
 * Employers naturally type Australian numbers in local format
 * (0414 705 803, 04 1470 5803, etc.), so we normalise here rather than
 * force a strict format on the form. This converts:
 *  - "0414 705 803"   -> "+61414705803"
 *  - "61414705803"    -> "+61414705803"
 *  - "+61414705803"   -> unchanged
 */
function normalizeAuPhone(raw) {
  if (!raw) return raw;
  let digits = String(raw).trim().replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  if (digits.startsWith('61')) return `+${digits}`;
  return `+61${digits}`;
}

/**
 * Builds the TwiML returned to Twilio when the browser places a ClearCall
 * Verified Call. Twilio dials the receiver's real phone number, and the
 * masked ClearCall number (TWILIO_PHONE_NUMBER) is always used as the
 * caller ID — the employer's own number is never sent to the network,
 * regardless of their hide-number display setting (that setting only
 * controls what is shown on the ClearCall app screen, not the real
 * telephone network caller ID).
 */
function buildDialTwiml({ toPhone, statusCallbackUrl }) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const dial = response.dial({
    callerId: process.env.TWILIO_PHONE_NUMBER,
    answerOnBridge: true,
  });
  dial.number({
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  }, normalizeAuPhone(toPhone));
  return response.toString();
}

/**
 * Builds the call metadata payload pushed to the receiver's device before
 * the call connects, so the ClearCall app can render the Incoming Verified
 * Call screen with correct company/caller details. The recruiter's phone
 * number is deliberately excluded here whenever hideNumber is true.
 */
function buildCallMetadataPush({ company, callerName, designation, jobRole, hideNumber, recruiterPhone }) {
  const payload = {
    type: 'clearcall_verified_call',
    companyName: company.name,
    companyLogoUrl: company.logo_url,
    abnVerified: !!company.abn_verified,
    jobRole: jobRole || null,
    callerName: callerName || null,
    designation: designation || null,
    hideNumber: !!hideNumber,
  };
  if (!hideNumber) {
    payload.recruiterPhone = recruiterPhone;
  }
  return payload;
}

module.exports = { generateVoiceAccessToken, buildDialTwiml, buildCallMetadataPush, credentialsConfigured, normalizeAuPhone };
