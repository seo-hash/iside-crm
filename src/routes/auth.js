const express = require('express');
const path = require('path');
const { verifyCredentials, createSessionToken } = require('../services/authService');
const { COOKIE_NAME } = require('../middleware/authGuard');

const router = express.Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/login.html'));
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await verifyCredentials(username, password);

    if (!user) {
      return res.status(401).json({ error: 'Nome utente o password non validi.' });
    }

    const token = createSessionToken(user);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ ok: true, user: { username: user.username, role: user.role } });
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ error: 'Errore durante il login.' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

module.exports = router;
