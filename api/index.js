const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
dotenv.config();

const app = express();

// Middleware di Sicurezza
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*'
}));

// Parsing body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Dashboard Statica
app.use('/dashboard', express.static(path.join(__dirname, '../src/dashboard')));

// Rotte API
const leadRoutes = require('../src/routes/leads');
app.use('/api/leads', leadRoutes);

// Config Check
app.get('/api/config', (req, res) => {
  res.json({
    spreadsheetId: process.env.SPREADSHEET_ID,
    sheetRange: process.env.SHEET_RANGE,
    serviceEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Root route - Ridirige al dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Gestione 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rotta non trovata' });
});

// Middleware Gestione Errori
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Qualcosa è andato storto sul server.' });
});

module.exports = app;
