const jwt = require('jsonwebtoken');
const db = require('../db');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    const user = fullUser ? (({ password_hash, ...rest }) => rest)(fullUser) : null;
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if (user.suspended) {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
