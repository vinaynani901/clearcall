const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { newId } = require('../utils/ids');
const { isPersonalEmailDomain } = require('../utils/emailDomains');
const authMiddleware = require('../middleware/auth');
const { sendOtpEmail } = require('../services/resend');

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
  const { fullName, email, phone, password } = req.body;

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
    INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified)
    VALUES (?, ?, ?, ?, ?, 'jobseeker', 0)
  `).run(id, fullName.trim(), email.toLowerCase().trim(), passwordHash, phone.trim());

  db.prepare(`
    INSERT INTO call_display_settings (user_id, hide_number, show_name, show_designation, show_photo)
    VALUES (?, 1, 1, 1, 0)
  `).run(id);

  const token = signToken(id);
  const user = db.prepare('SELECT id, full_name, email, phone, role, email_verified, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json({ token, user });
});

// POST /api/auth/signup/employer
router.post('/signup/employer', (req, res) => {
  const { companyName, abn, industry, contactName, workEmail, password, linkedinUrl } = req.body;

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
    INSERT INTO companies (id, owner_user_id, name, abn, industry, contact_name, work_email, linkedin_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    insertCompany.run(companyId, userId, companyName.trim(), abn.replace(/\s/g, ''), industry, contactName.trim(), workEmail.toLowerCase().trim(), linkedinUrl || null);
    insertMember.run(newId('member'), companyId, userId, workEmail.toLowerCase().trim());
    insertSettings.run(userId);
  });
  tx();

  const token = signToken(userId);
  const user = db.prepare('SELECT id, full_name, email, phone, role, email_verified, created_at FROM users WHERE id = ?').get(userId);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  res.status(201).json({ token, user, company });
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

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  let company = null;
  if (req.user.role === 'employer') {
    company = db.prepare(`
      SELECT c.* FROM companies c
      JOIN company_members cm ON cm.company_id = c.id
      WHERE cm.user_id = ?
      LIMIT 1
    `).get(req.user.id);
  }
  res.json({ user: req.user, company });
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
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  if (isPersonalEmailDomain(email)) {
    return res.status(400).json({ error: 'Personal emails are not accepted. Please use your company work email.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO otp_codes (id, email, code, purpose, expires_at, used)
    VALUES (?, ?, ?, 'work_email_verify', ?, 0)
  `).run(newId('otp'), email.toLowerCase().trim(), code, expiresAt);

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
    // Common cause during local testing: Resend's sandbox sender can only
    // deliver to the account owner's own email until a domain is verified.
    // Print the code here too so testing can still proceed.
    console.log(`[EMAIL SEND FAILED - fallback] OTP for ${email}: ${code}`);
  }

  res.json({ message: `Verification code sent to ${email}`, expiresInMinutes: 10 });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

  const record = db.prepare(`
    SELECT * FROM otp_codes
    WHERE email = ? AND code = ? AND purpose = 'work_email_verify' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email.toLowerCase().trim(), code);

  if (!record) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(record.id);
  db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email.toLowerCase().trim());
  db.prepare('UPDATE companies SET email_verified = 1 WHERE work_email = ?').run(email.toLowerCase().trim());
  db.prepare('UPDATE company_members SET email_verified = 1 WHERE work_email = ?').run(email.toLowerCase().trim());

  res.json({ message: 'Work email verified successfully' });
});

module.exports = router;
