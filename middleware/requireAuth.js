function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session?.role === 'admin') return next();
  return res.status(403).json({ error: 'forbidden' });
}

module.exports = { requireAuth, requireAdmin };
