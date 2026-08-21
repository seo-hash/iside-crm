const { sheets } = require('../config/googleSheets');

const spreadsheetId = process.env.SPREADSHEET_ID_DATI;
const RANGE = process.env.RANGE_UTENTI || 'Utenti!A:D';
const SHEET_NAME = RANGE.split('!')[0].replace(/'/g, '');

// Colonne foglio "Utenti": A=username, B=password_hash, C=role, D=active

function rowToUser(row, rowNumber) {
  if (!row || !row[0]) return null;
  return {
    rowNumber,
    username: row[0],
    password_hash: row[1] || '',
    role: row[2] || 'user',
    active: (row[3] || '').toString().trim().toUpperCase() !== 'FALSE',
  };
}

async function readAllUsers() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });
  const values = response.data.values || [];
  // Riga 1 = intestazioni, quindi si parte dalla riga 2
  return values
    .slice(1)
    .map((row, i) => rowToUser(row, i + 2))
    .filter(Boolean);
}

async function findUserByUsername(username) {
  const users = await readAllUsers();
  return users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase()) || null;
}

async function appendUser({ username, password_hash, role = 'user' }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[username, password_hash, role, 'TRUE']] },
  });
}

async function updateUserCell(rowNumber, column, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET_NAME}'!${column}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[value]] },
  });
}

module.exports = {
  readAllUsers,
  findUserByUsername,
  appendUser,
  updateUserCell,
};
