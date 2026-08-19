const { Resend } = require('resend');

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === 'your-resend-key-here') return null;
  return new Resend(key);
}

function otpEmailHtml(code) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Know who is calling before you answer</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">Your ClearCall verification code</h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.5;margin:0 0 24px;">
          Enter this code to verify your work email and confirm your employment with your organisation.
        </p>
        <div style="background:#f8fafc;border:2px solid #1e3a8a;border-radius:10px;text-align:center;padding:20px;margin-bottom:20px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e3a8a;">${code}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong>. If you did not request this code, you can safely ignore this email.</p>
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">ClearCall &middot; Verified employer calling platform &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

function logTestOtp(toEmail, code) {
  console.log('============================');
  console.log(`TEST OTP FOR ${toEmail}`);
  console.log(`CODE: ${code}`);
  console.log('============================');
}

async function sendOtpEmail(toEmail, code) {
  const client = getClient();
  if (!client) {
    logTestOtp(toEmail, code);
    return { devMode: true, code };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: 'Your ClearCall verification code',
    html: otpEmailHtml(code),
  });

  // The Resend SDK often reports failures (e.g. "recipient not allowed in
  // sandbox mode") inside result.error instead of throwing an exception.
  // Turn that into a real thrown error so callers' catch blocks fire.
  if (result && result.error) {
    throw new Error(result.error.message || 'Resend rejected this email');
  }

  return result;
}

function adminMessageEmailHtml(message) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Know who is calling before you answer</div>
      </div>
      <div style="padding:32px 28px;">
        <p style="color:#4b5563;font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0;">${message}</p>
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">Sent by the ClearCall team &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

// Used by the admin panel's "Send Message" action (companies + job
// seekers) and, later, rejection-reason emails from the Verification
// Queue — anywhere the admin needs to reach a user directly by email.
async function sendAdminMessageEmail(toEmail, subject, message) {
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] Admin message to ${toEmail} — "${subject}": ${message}`);
    return { devMode: true };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({
    from: fromAddress,
    to: toEmail,
    subject,
    html: adminMessageEmailHtml(message),
  });
  if (result && result.error) {
    throw new Error(result.error.message || 'Resend rejected this email');
  }
  return result;
}

function callbackReminderEmailHtml({ candidateName, jobRole, campaignName, callbackTime }) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Know who is calling before you answer</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">Callback reminder</h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.5;margin:0 0 20px;">
          You scheduled a callback with <strong>${candidateName}</strong>${jobRole ? ` for ${jobRole}` : ''} in your campaign "<strong>${campaignName}</strong>". It's due now.
        </p>
        <div style="background:#f8fafc;border:2px solid #1e3a8a;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
          <span style="font-size:15px;font-weight:700;color:#1e3a8a;">${callbackTime}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0;">Open ClearCall and go to your campaign to make the call.</p>
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">ClearCall &middot; Verified employer calling platform &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

// Used by the callback reminder scheduler (services/callbackReminders.js) —
// fires when a scheduled callback_at time is reached.
async function sendCallbackReminderEmail(toEmail, { candidateName, jobRole, campaignName, callbackTime }) {
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] Callback reminder to ${toEmail}: ${candidateName} — ${campaignName} — due ${callbackTime}`);
    return { devMode: true };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `Callback due: ${candidateName}`,
    html: callbackReminderEmailHtml({ candidateName, jobRole, campaignName, callbackTime }),
  });
  if (result && result.error) {
    throw new Error(result.error.message || 'Resend rejected this email');
  }
  return result;
}

function jobseekerWelcomeEmailHtml(firstName) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Verified. Trusted. Protected.</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#111827;font-size:19px;margin:0 0 10px;">Welcome to ClearCall, ${firstName}! 👋</h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Your account is ready. From now on, every call from a verified employer will show you exactly who's calling — company, caller name, and the role — before you ever answer.
        </p>
        <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Here's what you can do next:
        </p>
        <ul style="color:#4b5563;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:20px;">
          <li>Track your job applications in one place</li>
          <li>Search ClearCall Verified and external job listings</li>
          <li>Connect with a placement agent</li>
          <li>Upload your resume</li>
        </ul>
        <p style="color:#6b7280;font-size:13px;margin:0;">We're glad you're here.</p>
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">ClearCall &middot; Verified employer calling platform &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

// Fired once at job seeker signup (auth.js POST /signup/jobseeker). A failed
// or unconfigured send must never block account creation — callers wrap this
// in try/catch and only log, same pattern as the OTP email.
async function sendJobseekerWelcomeEmail(toEmail, firstName) {
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] Welcome email to ${toEmail} (${firstName})`);
    return { devMode: true };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: 'Welcome to ClearCall',
    html: jobseekerWelcomeEmailHtml(firstName),
  });
  if (result && result.error) {
    throw new Error(result.error.message || 'Resend rejected this email');
  }
  return result;
}

// --- Plan Control emails (Stage 7) --------------------------------------
// All six share one visual shell (planEmailShell) — only the headline,
// body, and optional CTA button change. `getClient()`/dev-mode-log/thrown-
// on-`result.error` behaviour matches every email function above exactly.

function planEmailShell({ title, bodyHtml, ctaLabel, ctaUrl }) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Know who is calling before you answer</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">${title}</h2>
        ${bodyHtml}
        ${ctaLabel && ctaUrl ? `
        <div style="text-align:center;margin-top:24px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;">${ctaLabel}</a>
        </div>` : ''}
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">ClearCall &middot; Verified employer calling platform &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

async function sendPlanEmail(toEmail, subject, html, devLabel) {
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] ${devLabel} to ${toEmail}`);
    return { devMode: true };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({ from: fromAddress, to: toEmail, subject, html });
  if (result && result.error) throw new Error(result.error.message || 'Resend rejected this email');
  return result;
}

// 1. Upgrade confirmation — plan changed to a paid plan (via admin action,
// since real Stripe billing doesn't exist yet).
async function sendPlanUpgradeConfirmationEmail(toEmail, { name, planLabel, price, unlocks, billingDate }) {
  // price is `null` for custom-quote tiers (Enterprise Plus) — there's no
  // fixed monthly figure to show, so the sentence reads naturally instead
  // of interpolating "$null/month".
  const priceClause = price === null || price === undefined ? 'on a custom pricing plan' : `at $${price}/month`;
  const html = planEmailShell({
    title: `You're now on the ${planLabel} plan`,
    bodyHtml: `
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'}, your ClearCall account has been upgraded to <strong>${planLabel}</strong> ${priceClause}.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>Newly unlocked:</strong></p>
      <ul style="color:#4b5563;font-size:14px;line-height:1.8;margin:0 0 16px;padding-left:20px;">${(unlocks || []).map((u) => `<li>${u}</li>`).join('')}</ul>
      <p style="color:#6b7280;font-size:13px;margin:0;">Your next billing date is <strong>${billingDate}</strong>.</p>
    `,
  });
  return sendPlanEmail(toEmail, `You're now on the ${planLabel} plan`, html, `Upgrade confirmation (${planLabel})`);
}

// 2. Pilot welcome — activated by the admin's "Start New Pilot" action.
async function sendPilotWelcomeEmail(toEmail, { companyName, planLabel, endDate }) {
  const html = planEmailShell({
    title: `${companyName}, your ClearCall pilot has started`,
    bodyHtml: `
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">You've been granted free access to the <strong>${planLabel}</strong> plan as part of a pilot program.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Your pilot runs until <strong>${endDate}</strong>. When it ends, your account will automatically move to the Free plan unless you choose to subscribe — we'll email you a reminder before that happens.</p>
    `,
  });
  return sendPlanEmail(toEmail, `Your ClearCall pilot has started`, html, `Pilot welcome (${companyName})`);
}

// 3. Pilot ending in 7 days — sent once by the daily pilot scheduler.
async function sendPilotEndingReminderEmail(toEmail, { companyName, endDate, pricingUrl }) {
  const html = planEmailShell({
    title: `Your pilot ends in 7 days`,
    bodyHtml: `
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${companyName}, your ClearCall pilot ends on <strong>${endDate}</strong>. After that, your account moves to the Free plan.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0;">Subscribe now to keep the features you've been using without interruption.</p>
    `,
    ctaLabel: 'View Plans', ctaUrl: pricingUrl,
  });
  return sendPlanEmail(toEmail, 'Your ClearCall pilot ends in 7 days', html, `Pilot 7-day reminder (${companyName})`);
}

// 4. Pilot ended — sent automatically the moment the pilot's end date passes.
async function sendPilotEndedEmail(toEmail, { companyName, pricingUrl }) {
  const html = planEmailShell({
    title: `Your pilot has ended — thank you`,
    bodyHtml: `
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${companyName}, thanks for trying ClearCall. Your pilot has ended and your account is now on the Free plan.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0;">We'd love to have you continue — subscribe any time to pick up where you left off.</p>
    `,
    ctaLabel: 'View Plans', ctaUrl: pricingUrl,
  });
  return sendPlanEmail(toEmail, 'Your ClearCall pilot has ended', html, `Pilot ended (${companyName})`);
}

// 5. Usage warning — fired once per month the first time a metered feature
// crosses 80%.
async function sendUsageWarningEmail(toEmail, { featureLabel, used, limit }) {
  const html = planEmailShell({
    title: `You're approaching your ${featureLabel} limit`,
    bodyHtml: `<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0;">You've used <strong>${used} of ${limit}</strong> ${featureLabel.toLowerCase()} included in your plan this month. Upgrade to avoid interruption once you hit the limit.</p>`,
  });
  return sendPlanEmail(toEmail, `Approaching your ${featureLabel} limit`, html, `Usage warning (${featureLabel})`);
}

// 6. Usage limit reached — fired once per month the first time a metered
// feature hits 100%.
async function sendUsageLimitReachedEmail(toEmail, { featureLabel, limit, pricingUrl }) {
  const html = planEmailShell({
    title: `You've reached your ${featureLabel} limit`,
    bodyHtml: `<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0;">You've used all <strong>${limit}</strong> ${featureLabel.toLowerCase()} included in your plan this month. Upgrade to keep going.</p>`,
    ctaLabel: 'Upgrade Now', ctaUrl: pricingUrl,
  });
  return sendPlanEmail(toEmail, `You've reached your ${featureLabel} limit`, html, `Usage limit reached (${featureLabel})`);
}

// Team member invitation (Plan Control / My Team — generalized in Part 6/7
// to every plan, not just Growth+ recruiter sub-accounts). The link carries
// the plaintext token exactly once — same one-time-reveal principle as the
// job seeker access-key flow — and always points at the frontend's
// invitation-acceptance screen, never a raw API URL.
function recruiterInviteEmailHtml({ recruiterName, companyName, inviteUrl, inviterName, role }) {
  const invitedByLine = inviterName ? `${inviterName} has invited you` : `You've been invited`;
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f8fafc; padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1e3a8a;padding:24px;text-align:center;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">ClearCall</div>
        <div style="color:#c7d2fe;font-size:12px;margin-top:4px;">Know who is calling before you answer</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">You have been invited to join ${companyName} on ClearCall</h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Hi ${recruiterName}, ${invitedByLine} to join <strong>${companyName}</strong> on ClearCall${role ? ` as ${role}` : ''}. Set a password to activate your account and get started.
        </p>
        <div style="text-align:center;margin-bottom:20px;">
          <a href="${inviteUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;">Accept Invitation</a>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0;">This invitation link expires in 48 hours. If you weren't expecting this, you can safely ignore this email.</p>
      </div>
      <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">ClearCall &middot; Verified employer calling platform &middot; Australia</p>
      </div>
    </div>
  </div>`;
}

async function sendRecruiterInviteEmail(toEmail, { recruiterName, companyName, token, inviterName, role }) {
  const inviteUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/invite/accept/${token}`;
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] Team invite to ${toEmail} — accept at ${inviteUrl}`);
    return { devMode: true, inviteUrl };
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'ClearCall <onboarding@resend.dev>';
  const result = await client.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `You have been invited to join ${companyName} on ClearCall`,
    html: recruiterInviteEmailHtml({ recruiterName, companyName, inviteUrl, inviterName, role }),
  });
  if (result && result.error) throw new Error(result.error.message || 'Resend rejected this email');
  return result;
}

module.exports = {
  sendOtpEmail, sendAdminMessageEmail, sendCallbackReminderEmail, sendJobseekerWelcomeEmail,
  sendPlanUpgradeConfirmationEmail, sendPilotWelcomeEmail, sendPilotEndingReminderEmail,
  sendPilotEndedEmail, sendUsageWarningEmail, sendUsageLimitReachedEmail,
  sendRecruiterInviteEmail, logTestOtp,
};
