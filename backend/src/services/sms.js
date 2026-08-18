// Advance SMS reminders to candidates ahead of a scheduled/callback call.
// Separate from services/twilio.js (which handles browser-to-phone Voice
// calling) because SMS only needs the basic Account SID + Auth Token REST
// client, not the Voice-specific API Key/Secret/TwiML App credentials.
const twilio = require('twilio');
const { normalizeAuPhone } = require('./twilio');

function smsConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  return !!(
    TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your-twilio-sid-here' &&
    TWILIO_AUTH_TOKEN && TWILIO_AUTH_TOKEN !== 'your-twilio-token-here' &&
    TWILIO_PHONE_NUMBER && TWILIO_PHONE_NUMBER !== 'your-twilio-number-here'
  );
}

function getClient() {
  if (!smsConfigured()) return null;
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Sends a plain SMS to a candidate, e.g. "an employer will be calling you
 * soon" or a callback reminder. Falls back to a dev-mode console log (same
 * pattern as the OTP/admin-message email services) when Twilio credentials
 * aren't configured, so the feature is usable end-to-end in local dev
 * without real SMS credits.
 */
async function sendCandidateSms(toPhone, body) {
  const client = getClient();
  const to = normalizeAuPhone(toPhone);

  if (!client) {
    console.log(`[DEV MODE - no Twilio SMS credentials set] SMS to ${to}: ${body}`);
    return { devMode: true, to, body };
  }

  const message = await client.messages.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
    body,
  });
  return { sid: message.sid, status: message.status, to };
}

function buildCandidateReminderText({ companyName, jobRole, candidateName }) {
  const rolePart = jobRole ? ` about the ${jobRole} role` : '';
  return `Hi ${candidateName ? candidateName.split(' ')[0] : 'there'}, this is a reminder that ${companyName} will be calling you soon${rolePart}. Sent via ClearCall.`;
}

module.exports = { sendCandidateSms, buildCandidateReminderText, smsConfigured };
