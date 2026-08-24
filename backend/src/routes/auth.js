const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { newId } = require('../utils/ids');
const { isPersonalEmailDomain } = require('../utils/emailDomains');
const authMiddleware = require('../middleware/auth');
const { sendOtpEmail, sendJobseekerWelcomeEmail, logTestOtp } = require('../services/resend');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/signup/jobseeker
router.post('/signup/jobseeker', (req, res) => {
  const { fullName, email, phone, password, lookingForWork } = req.body;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required: full name, email, phone, password' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const id = newId('user');

  db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified, looking_for_work)
    VALUES (?, ?, ?, ?, ?, 'jobseeker', 0, ?)
  `).run(id, fullName.trim(), email.toLowerCase().trim(), passwordHash, phone.trim(), lookingForWork === false ? 0 : 1);

  db.prepare(`
    INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo)
    VALUES (?, 1, 1, 1, 0)
  `).run(id);

  const token = signToken(id);
  const { password_hash, ...user } = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ token, user });

  // Fire-and-forget — a failed/unconfigured welcome email must never block
  // or delay account creation (the response above has already been sent).
  sendJobseekerWelcomeEmail(user.email, fullName.trim().split(' ')[0])
    .catch((err) => console.error('[email] Failed to send jobseeker welcome email:', err.message));
});

// POST /api/auth/signup/jobseeker/google — Google sign-in/signup. Real once
// GOOGLE_OAUTH_CLIENT_ID/SECRET are configured (same honest "not configured"
// pattern as Gmail connect and the AI Assistant); left unset, this returns a
// clear 503 instead of pretending to authenticate anyone.
router.post('/signup/jobseeker/google', (req, res) => {
  const configured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!configured) {
    return res.status(503).json({ error: 'Google sign-in is not configured yet. Please sign up with your email and password instead.' });
  }
  res.status(501).json({ error: 'Google OAuth flow not yet implemented.' });
});

// POST /api/auth/signup/employer
router.post('/signup/employer', (req, res) => {
  const { companyName, abn, industry, contactName, workEmail, password, linkedinUrl, companySector, companySize } = req.body;

  if (!companyName || !abn || !industry || !contactName || !workEmail || !password) {
    return res.status(400).json({ error: 'All fields are required: company name, ABN, industry, contact name, work email, password' });
  }
  if (isPersonalEmailDomain(workEmail)) {
    return res.status(400).json({ error: 'Personal emails are not accepted. Please use your company work email.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(workEmail.toLowerCase().trim());
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this work email already exists' });
  }

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const userId = newId('user');
  const companyId = newId('company');

  const insertUser = db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified)
    VALUES (?, ?, ?, ?, NULL, 'employer', 0)
  `);
  const insertCompany = db.prepare(`
    INSERT INTO companies (id, owner_user_id, name, abn, industry, contact_name, work_email, linkedin_url, company_sector, company_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO company_members (id, company_id, user_id, work_email, email_verified)
    VALUES (?, ?, ?, ?, 0)
  `);
  const insertSettings = db.prepare(`
    INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo)
    VALUES (?, 1, 1, 1, 0)
  `);

  const tx = db.transaction(() => {
    insertUser.run(userId, contactName.trim(), workEmail.toLowerCase().trim(), passwordHash);
    insertCompany.run(companyId, userId, companyName.trim(), abn.replace(/\s/g, ''), industry, contactName.trim(), workEmail.toLowerCase().trim(), linkedinUrl || null, companySector || 'other', companySize || 'small');
    insertMember.run(newId('member'), companyId, userId, workEmail.toLowerCase().trim());
    insertSettings.run(userId);
  });
  tx();

  const token = signToken(userId);
  const user = db.prepare('SELECT id, full_name, email, phone, role, email_verified, created_at FROM users WHERE id = ?').get(userId);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  res.status(201).json({ token, user, company });
});

// POST /api/auth/signup/agent — recruitment agents/agencies get their own
// role (not employer, not jobseeker). No work-email-domain restriction like
// employers, since independent recruiters commonly operate from a personal
// or agency-branded address rather than a corporate one.
router.post('/signup/agent', (req, res) => {
  const { agencyName, fullName, email, phone, password, abn } = req.body;

  if (!agencyName || !fullName || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required: agency name, full name, email, phone, password' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const userId = newId('user');

  const insertUser = db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified)
    VALUES (?, ?, ?, ?, ?, 'agent', 0)
  `);
  const insertAgent = db.prepare(`
    INSERT INTO agents (user_id, agency_name, abn) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertUser.run(userId, fullName.trim(), email.toLowerCase().trim(), passwordHash, phone.trim());
    insertAgent.run(userId, agencyName.trim(), abn ? abn.replace(/\s/g, '') : null);
  });
  tx();

  const token = signToken(userId);
  const user = db.prepare('SELECT id, full_name, email, phone, role, email_verified, created_at FROM users WHERE id = ?').get(userId);
  const agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(userId);
  res.status(201).json({ token, user, agent });
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.suspended) {
    return res.status(403).json({ error: 'This account has been deactivated' });
  }

  if (user.role === 'employer' && isPersonalEmailDomain(user.email)) {
    return res.status(403).json({ error: 'Only company work emails are accepted for employer login' });
  }

  const token = signToken(user.id);
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!fullUser || !bcrypt.compareSync(currentPassword, fullUser.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  res.json({ message: 'Password changed successfully' });
});

// POST /api/auth/delete-account — self-service. Historical rows (applications,
// call records, etc.) reference this user_id all over the platform, so a
// hard DELETE would either fail on foreign keys or silently orphan/corrupt
// other people's data (e.g. an employer's call history). Instead this does a
// real, honest deactivation: the password is confirmed, then the account is
// suspended and its identifying details (email, phone) are scrubbed so the
// person can never log in again and isn't reachable — while their historical
// activity rows stay intact for everyone else's records, same as if the
// account were simply closed.
router.post('/delete-account', authMiddleware, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account' });

  const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!fullUser || !bcrypt.compareSync(password, fullUser.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const scrubbedEmail = `deleted-${req.user.id}@clearcall.invalid`;
  const randomPasswordHash = bcrypt.hashSync(newId('deleted'), BCRYPT_ROUNDS);
  db.prepare(`
    UPDATE users SET suspended = 1, email = ?, phone = NULL, password_hash = ? WHERE id = ?
  `).run(scrubbedEmail, randomPasswordHash, req.user.id);

  res.json({ message: 'Your account has been deleted' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  let company = null;
  let agent = null;
  if (req.user.role === 'employer') {
    company = db.prepare(`
      SELECT c.* FROM companies c
      JOIN company_members cm ON cm.company_id = c.id
      WHERE cm.user_id = ?
      LIMIT 1
    `).get(req.user.id);
  } else if (req.user.role === 'agent') {
    agent = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(req.user.id);
  }
  res.json({ user: req.user, company, agent });
});

// --- Work email OTP ---
const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body.email || req.ip).toLowerCase(),
  message: { error: 'Maximum 3 OTP requests per hour reached for this email. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/send-otp
router.post('/send-otp', otpSendLimiter, async (req, res) => {
  const { email, purpose } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // 'work_email_verify' (default, employer flow) requires a company work
  // email — personal domains are rejected. 'jobseeker_email_verify' has no
  // such restriction: job seekers sign up with whatever personal email they
  // used at signup, and that address IS the one being verified here.
  const otpPurpose = purpose === 'jobseeker_email_verify' ? 'jobseeker_email_verify' : 'work_email_verify';

  if (otpPurpose === 'work_email_verify' && isPersonalEmailDomain(email)) {
    return res.status(400).json({ error: 'Personal emails are not accepted. Please use your company work email.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO otp_codes (id, email, code, purpose, expires_at, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(newId('otp'), email.toLowerCase().trim(), code, otpPurpose, expiresAt);

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
    // Common cause during local testing: Resend's sandbox sender can only
    // deliver to the account owner's own email until a domain is verified.
    // Print the code here too so testing can still proceed.
    logTestOtp(email, code);
  }

  res.json({ message: `Verification code sent to ${email}`, expiresInMinutes: 10 });
});

// Master OTP for testing: '000000' always verifies any email on this
// allowlist, in every environment including production. It intentionally
// does NOT check NODE_ENV — gating is entirely the allowlist below, so it
// can be used to test the live production deployment without needing real
// email delivery, while remaining completely unusable for any real user
// account that isn't explicitly listed here.
const MASTER_OTP_CODE = '000000';
const MASTER_OTP_ALLOWLIST = new Set([
  'vinay@company.com.au',
  'test@clearcall.test',
]);

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, code, purpose } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

  const normalizedEmail = email.toLowerCase().trim();
  const otpPurpose = purpose === 'jobseeker_email_verify' ? 'jobseeker_email_verify' : 'work_email_verify';

  if (code === MASTER_OTP_CODE && MASTER_OTP_ALLOWLIST.has(normalizedEmail)) {
    db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(normalizedEmail);
    db.prepare('UPDATE companies SET email_verified = 1 WHERE work_email = ?').run(normalizedEmail);
    db.prepare('UPDATE company_members SET email_verified = 1 WHERE work_email = ?').run(normalizedEmail);
    return res.json({ message: 'Work email verified successfully' });
  }

  const record = db.prepare(`
    SELECT * FROM otp_codes
    WHERE email = ? AND code = ? AND purpose = ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail, code, otpPurpose);

  if (!record) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(record.id);
  db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(normalizedEmail);
  db.prepare('UPDATE companies SET email_verified = 1 WHERE work_email = ?').run(normalizedEmail);
  db.prepare('UPDATE company_members SET email_verified = 1 WHERE work_email = ?').run(normalizedEmail);

  res.json({ message: 'Work email verified successfully' });
});

module.exports = router;
