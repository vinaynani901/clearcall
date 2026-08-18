// Notifies a call's receiver at the moment a ClearCall Verified Call is
// initiated. The matching (does this phone number belong to a registered
// job seeker?) happens in routes/calls.js POST /initiate, right when the
// call is created — this module just decides how to reach that person:
//
//   - Registered job seeker with verified-call notifications on: push
//     (FCM + the already-working VAPID web push, sent together) carrying
//     the full verified details (company name, caller name, designation,
//     job role, company logo, hide-number flag).
//   - Push not configured / no devices registered / both channels fail:
//     fall back to an advance SMS so the person isn't left with no signal
//     at all — a push failure must never mean total silence.
//   - Not a registered job seeker: there's no app to push to, so send the
//     advance SMS directly.
const db = require('../db');
const { sendPushToUser } = require('./push');
const fcm = require('./fcm');
const { sendCandidateSms } = require('./sms');
const { normalizeAuPhone } = require('./twilio');
const { createNotification } = require('./notifications');

function buildVerifiedCallSmsText({ companyName, jobRole }) {
  const rolePart = jobRole ? ` about the ${jobRole} role` : '';
  return `Hi, this is ClearCall — ${companyName} is calling you now${rolePart} from a verified employer account. Sent via ClearCall.`;
}

/**
 * @param {object} opts
 * @param {object|null} opts.receiverUser - the matched jobseeker `users` row, or null if the dialed number isn't registered
 * @param {string} opts.receiverPhone - the raw phone number that was dialed (used for the SMS fallback)
 * @param {object} opts.company - the calling company row
 * @param {string|null} opts.callerName
 * @param {string|null} opts.designation
 * @param {string|null} opts.jobRole
 * @param {boolean} opts.hideNumber
 * @returns {Promise<{channel: string, result: object}>}
 */
async function notifyIncomingVerifiedCall({ receiverUser, receiverPhone, company, callerName, designation, jobRole, hideNumber }) {
  const smsFallback = async (reason) => {
    try {
      const result = await sendCandidateSms(receiverPhone, buildVerifiedCallSmsText({ companyName: company.name, jobRole }));
      return { channel: 'sms', reason, result };
    } catch (err) {
      console.error('[callNotify] SMS fallback failed:', err.message);
      return { channel: 'sms', reason, result: { error: err.message } };
    }
  };

  if (!receiverUser) {
    return smsFallback('not_a_registered_jobseeker');
  }

  const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(receiverUser.id);
  if (!fullUser || !fullUser.notif_verified_calls) {
    // They're a ClearCall user but have verified-call notifications turned
    // off in Settings — respect that. No push, and no SMS either, since
    // (unlike an unregistered number) they do have an account and have
    // explicitly opted out of being alerted this way.
    return { channel: 'none', reason: 'notifications_disabled', result: {} };
  }

  // If this job seeker has a tracked application with this company, surface
  // it in the push payload itself — not just looked up client-side once the
  // call screen is already open — so a background/killed-app push handler
  // can show "You applied for this role X days ago" without needing a
  // separate API round-trip. Best-effort text match on company name, since
  // manually-entered/Gmail-imported applications aren't linked to a
  // companies.id the way ClearCall Direct applications are.
  const matchedApplication = db.prepare(`
    SELECT date_applied FROM job_applications
    WHERE user_id = ? AND LOWER(company_name) = LOWER(?)
    ORDER BY date_applied DESC LIMIT 1
  `).get(receiverUser.id, company.name);
  let appliedDaysAgo = null;
  if (matchedApplication?.date_applied) {
    const appliedAt = new Date(`${matchedApplication.date_applied}T00:00:00Z`);
    appliedDaysAgo = Math.max(0, Math.floor((Date.now() - appliedAt.getTime()) / 86400000));
  }

  const payload = {
    title: 'Incoming Verified Call',
    body: `${company.name} is calling you now${jobRole ? ` about ${jobRole}` : ''}.`,
    url: '/jobseeker/calls',
    tag: 'incoming-call',
    data: {
      companyName: company.name,
      companyLogoUrl: company.logo_url || null,
      callerName: callerName || null,
      designation: designation || null,
      jobRole: jobRole || null,
      hideNumber: !!hideNumber,
      applicationDate: matchedApplication?.date_applied || null,
      appliedDaysAgo,
    },
  };

  createNotification(receiverUser.id, {
    type: 'verified_call',
    title: 'Verified Call Received',
    message: `${company.name} called you${jobRole ? ` about ${jobRole}` : ''}.`,
    link: '/jobseeker/calls',
  });

  const [webPushResult, fcmResult] = await Promise.all([
    sendPushToUser(receiverUser.id, payload).catch((err) => {
      console.error('[callNotify] Web push failed:', err.message);
      return { sent: 0 };
    }),
    fcm.sendFcmToUser(receiverUser.id, { title: payload.title, body: payload.body, data: payload.data }).catch((err) => {
      console.error('[callNotify] FCM failed:', err.message);
      return { sent: 0 };
    }),
  ]);

  const totalSent = (webPushResult.sent || 0) + (fcmResult.sent || 0);
  if (totalSent > 0) {
    return { channel: 'push', result: { webPush: webPushResult, fcm: fcmResult } };
  }

  // Both push channels reached nobody (not configured, no registered
  // devices, or delivery failed) — fall back to SMS so the notification
  // still reaches the person somehow.
  return smsFallback('push_unavailable');
}

module.exports = { notifyIncomingVerifiedCall, normalizeAuPhone };
