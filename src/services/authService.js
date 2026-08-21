const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userSheetService = require('./userSheetService');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '12h';

async function verifyCredentials(username, password) {
  const user = await userSheetService.findUserByUsername((username || '').trim());
  if (!user || !user.active || !user.password_hash) return null;

  const match = await bcrypt.compare(password || '', user.password_hash);
  if (!match) return null;

  return { username: user.username, role: user.role };
}

function createSessionToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET non configurato');
  return jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifySessionToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET non configurato');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = {
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
};
