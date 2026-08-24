const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const adminAuthMiddleware = require('../../middleware/adminAuth');

const router = express.Router();
const { ADMIN_EMAIL, adminSecret } = adminAuthMiddleware;
const ADMIN_JWT_EXPIRY = '24h';

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/admin/login — completely separate from /api/auth/login. Checks
// against the single hardcoded admin account; the password itself is never
// stored, only its bcrypt hash (ADMIN_PASSWORD env var).
router.post('/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (String(email).toLowerCase().trim() !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const hash = process.env.ADMIN_PASSWORD;
  if (!hash) {
    console.error('[admin] ADMIN_PASSWORD env var is not set — admin login is disabled until it is configured.');
    return res.status(503).json({ error: 'Admin login is not configured yet' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const token = jwt.sign({ admin: true, email: ADMIN_EMAIL }, adminSecret(), { expiresIn: ADMIN_JWT_EXPIRY });
  res.json({ token, email: ADMIN_EMAIL, expiresIn: ADMIN_JWT_EXPIRY });
});

// Everything below requires a valid, non-expired admin session.
router.use(adminAuthMiddleware);

router.get('/me', (req, res) => {
  res.json({ email: req.admin.email });
});

router.post('/logout', (req, res) => {
  // JWTs are stateless — logging out is the frontend discarding the token.
  // This endpoint exists for symmetry / future server-side session tracking.
  res.json({ success: true });
});

router.use('/command-centre', require('./commandCentre'));
router.use('/companies', require('./companies'));
router.use('/jobseekers', require('./jobseekers'));
router.use('/verification-queue', require('./verification'));
router.use('/scam-reports', require('./scamReports'));
router.use('/revenue', require('./revenue'));
router.use('/agents', require('./agents'));
router.use('/support-tickets', require('./supportTickets'));
router.use('/announcements', require('./announcements'));
router.use('/system-health', require('./systemHealth'));
router.use('/ai-assistant', require('./aiAssistant'));
router.use('/plan-control', require('./planControl'));
router.use('/auto-apply', require('./autoApply'));

// POST /api/admin/maintenance/enable — enable or disable maintenance mode
router.post('/maintenance/enable', (req, res) => {
  const { enabled, message, estimatedEndTime } = req.body;
  const db = require('../../db');

  if (enabled) {
    db.prepare(`INSERT INTO app_settings (id, key, value) VALUES (?, 'maintenance_mode', 'true')
      ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`).run(require('../../utils/ids').newId('setting'));
    db.prepare(`INSERT INTO app_settings (id, key, value) VALUES (?, 'maintenance_message', ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`).run(require('../../utils/ids').newId('setting'), message || '', message || '');
    db.prepare(`INSERT INTO app_settings (id, key, value) VALUES (?, 'maintenance_end_time', ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`).run(require('../../utils/ids').newId('setting'), estimatedEndTime || '', estimatedEndTime || '');
  } else {
    db.prepare("DELETE FROM app_settings WHERE key IN ('maintenance_mode', 'maintenance_message', 'maintenance_end_time')").run();
  }
  res.json({ success: true, enabled: !!enabled });
});

// GET /api/admin/maintenance/status — public endpoint, no auth needed
router.get('/maintenance/status', (req, res) => {
  const db = require('../../db');
  const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'maintenance_mode'").get();
  const message = db.prepare("SELECT value FROM app_settings WHERE key = 'maintenance_message'").get();
  const endTime = db.prepare("SELECT value FROM app_settings WHERE key = 'maintenance_end_time'").get();
  res.json({
    maintenanceMode: mode?.value === 'true',
    message: message?.value || '',
    estimatedEndTime: endTime?.value || '',
  });
});

module.exports = router;
