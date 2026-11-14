const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const valid = require('../utils/validation');
const rateLimit = require('../middleware/rate-limit');
router.post('/register', rateLimit(10), async (req, res, next) => {
  const { username, email, password } = req.body || {};
  if (!valid.text(username, 3, 50) || !valid.email(email) || !valid.password(password)) return res.status(400).json({ message: 'Use a 3-50 character username, valid email, and password of at least 8 characters (maximum 72 UTF-8 bytes).' });
  try {
    await User.create({ username: username.trim(), email: email.trim().toLowerCase(), password, role: 'user' });
    res.status(201).json({ message: 'Account created. Please log in.' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Unable to register with those details.' });
    next(error);
  }
});
router.post('/login', rateLimit(20), async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!valid.text(username, 1, 50) || typeof password !== 'string' || !password.length || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Enter a valid username and password.' });
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ message: 'Invalid username or password.' });
    const token = jwt.sign({ id: user.id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1d' });
    res.json({ token, role: user.role, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) { next(error); }
});
module.exports = router;
