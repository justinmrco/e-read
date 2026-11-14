const jwt = require('jsonwebtoken');
const User = require('../models/User');
async function authMiddleware(req, res, next) {
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Please log in.' });
  let decoded;
  try { decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return res.status(401).json({ message: 'Session expired. Please log in again.' }); }
  if (!decoded || typeof decoded.id !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.id)) return res.status(401).json({ message: 'Invalid session.' });
  try {
    const user = await User.findById(decoded.id).select('role tokenVersion');
    if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    req.user = { id: user.id, role: user.role, expiresAt: typeof decoded.exp === 'number' ? decoded.exp * 1000 : null };
    next();
  } catch (error) { next(error); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Administrator access required.' });
  next();
}
module.exports = { authMiddleware, adminOnly };
