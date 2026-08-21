const { verifySessionToken } = require('../services/authService');

const COOKIE_NAME = 'crm_session';

function authGuard(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Accesso non autorizzato. Effettua il login.' });
    }
    return res.redirect('/login');
  }

  req.user = session;
  next();
}

module.exports = { authGuard, COOKIE_NAME };
