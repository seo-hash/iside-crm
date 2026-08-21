#!/usr/bin/env node
/*
 * CLI per gestire manualmente gli utenti del CRM (nessun pannello admin).
 * Gli utenti sono salvati nel foglio Google "Utenti" (stesso spreadsheet dei lead).
 *
 * Uso:
 *   node scripts/manage-user.js create <username> <password> [role]
 *   node scripts/manage-user.js set-password <username> <nuova-password>
 *   node scripts/manage-user.js deactivate <username>
 *   node scripts/manage-user.js activate <username>
 *   node scripts/manage-user.js list
 *
 * Richiede nel .env le stesse credenziali Google già usate per i lead
 * (SERVICE_ACCOUNT_CLIENT_EMAIL, SERVICE_ACCOUNT_PRIVATE_KEY, SPREADSHEET_ID_DATI)
 * e un foglio chiamato "Utenti" con intestazioni: username | password_hash | role | active
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const userSheetService = require('../src/services/userSheetService');

async function create(username, password, role = 'user') {
  const existing = await userSheetService.findUserByUsername(username);
  if (existing) throw new Error(`Utente "${username}" esiste già.`);

  const password_hash = await bcrypt.hash(password, 10);
  await userSheetService.appendUser({ username, password_hash, role });
  console.log(`Utente "${username}" creato con ruolo "${role}".`);
}

async function setPassword(username, password) {
  const user = await userSheetService.findUserByUsername(username);
  if (!user) throw new Error(`Utente "${username}" non trovato.`);

  const password_hash = await bcrypt.hash(password, 10);
  await userSheetService.updateUserCell(user.rowNumber, 'B', password_hash);
  console.log(`Password aggiornata per "${username}".`);
}

async function setActive(username, active) {
  const user = await userSheetService.findUserByUsername(username);
  if (!user) throw new Error(`Utente "${username}" non trovato.`);

  await userSheetService.updateUserCell(user.rowNumber, 'D', active ? 'TRUE' : 'FALSE');
  console.log(`Utente "${username}" ${active ? 'attivato' : 'disattivato'}.`);
}

async function list() {
  const users = await userSheetService.readAllUsers();
  console.table(users.map(({ username, role, active }) => ({ username, role, active })));
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  switch (cmd) {
    case 'create':
      await create(args[0], args[1], args[2]);
      break;
    case 'set-password':
      await setPassword(args[0], args[1]);
      break;
    case 'deactivate':
      await setActive(args[0], false);
      break;
    case 'activate':
      await setActive(args[0], true);
      break;
    case 'list':
      await list();
      break;
    default:
      console.log('Comando sconosciuto. Usa: create | set-password | deactivate | activate | list');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Errore:', err.message);
  process.exit(1);
});
