const jwt = require('jsonwebtoken');

// The one hardcoded admin account. Not stored in the `users` table at all —
// deliberately disconnected from the regular employer/job seeker auth
// system per the admin panel spec.
const ADMIN_EMAIL = 'admin@clearcall.com.au';

function adminSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
}

// Guards every /api/admin/* route except /api/admin/login. Rejects
// immediately (401) if there's no valid, non-expired admin token —
// regular employer/job seeker tokens are signed with the same JWT library
// but never carry `admin: true`, so they're rejected here too.
function adminAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    const payload = jwt.verify(token, adminSecret());
    if (!payload.admin || payload.email !== ADMIN_EMAIL) {
      return res.status(401).json({ error: 'Invalid admin session' });
    }
    req.admin = { email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Admin session expired — please log in again' });
  }
}

module.exports = adminAuthMiddleware;
module.exports.ADMIN_EMAIL = ADMIN_EMAIL;
module.exports.adminSecret = adminSecret;
