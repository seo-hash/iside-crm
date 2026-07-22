const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

// Scope richiesti per accedere a Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Prepariamo le credenziali dal file .env
let privateKey = process.env.SERVICE_ACCOUNT_PRIVATE_KEY;

if (privateKey) {
  // Rimuoviamo eventuali virgolette all'inizio e alla fine se presenti
  privateKey = privateKey.replace(/^"|"$/g, '');
  // Convertiamo i \n letterali in vere nuove linee
  privateKey = privateKey.replace(/\\n/g, '\n');
}

const clientEmail = process.env.SERVICE_ACCOUNT_CLIENT_EMAIL;

// Inizializzazione dell'autenticazione tramite credenziali passate direttamente
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: SCOPES,
});


const sheets = google.sheets({ version: 'v4', auth });

module.exports = {
  sheets,
  spreadsheetId: process.env.SPREADSHEET_ID,
  range: process.env.SHEET_RANGE || 'Leads!A:J',
  formSheetRange: process.env.FORM_SHEET_RANGE || 'Risposte del modulo 1!A:Z',
};
