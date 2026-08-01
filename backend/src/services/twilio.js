let twilioClient = null;

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || sid === 'your-twilio-sid-here' || !token || token === 'your-twilio-token-here') {
    return null;
  }
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

/**
 * Initiates a ClearCall Verified Call via Twilio Programmable Voice.
 * The recruiter's real number is never passed to the receiver — Twilio's
 * masked ClearCall number (TWILIO_PHONE_NUMBER) is used as caller ID for
 * every ClearCall Verified Call, regardless of the recruiter's hide-number
 * setting. The hide-number setting only controls what is DISPLAYED on the
 * receiver's ClearCall app screen (see call metadata push below) — the
 * network-level caller ID is always masked for verified calls.
 */
async function initiateVerifiedCall({ toPhone, twimlUrl, statusCallbackUrl }) {
  const client = getClient();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!client) {
    console.log(`[DEV MODE - no Twilio credentials set] Would call ${toPhone} from masked ClearCall number ${fromNumber}`);
    return { devMode: true, sid: `dev_sim_${Date.now()}` };
  }

  const call = await client.calls.create({
    to: toPhone,
    from: fromNumber,
    url: twimlUrl,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ['initiated', 'answered', 'completed'],
  });

  return { sid: call.sid };
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

module.exports = { initiateVerifiedCall, buildCallMetadataPush };
