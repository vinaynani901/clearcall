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

async function sendOtpEmail(toEmail, code) {
  const client = getClient();
  if (!client) {
    console.log(`[DEV MODE - no RESEND_API_KEY set] OTP for ${toEmail}: ${code}`);
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

module.exports = { sendOtpEmail };
