// ponytail: single-process demo limiter; use a shared store before running multiple instances.
function rateLimit(max, windowMs = 15 * 60 * 1000, identify = req => req.user?.id ? 'user:' + req.user.id : 'ip:' + req.ip) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of clients) if (value.reset <= now) clients.delete(key);
    const key = identify(req);
    let entry = clients.get(key);
    if (!entry) {
      if (clients.size >= 10000) return res.status(503).json({ message: 'Please try again later.' });
      entry = { count: 0, reset: now + windowMs };
      clients.set(key, entry);
    }
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    }
    return next();
  };
}
module.exports = rateLimit;
