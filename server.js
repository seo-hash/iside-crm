const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware di Sicurezza
app.use(helmet({
  contentSecurityPolicy: false, // Disabilitato per semplicità di demo frontend locale
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*'
}));

// Parsing body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Dashboard Statica (Opzionale, utile per hosting unico)
app.use('/dashboard', express.static(path.join(__dirname, 'src/dashboard')));

// Rotte API - DICHIARAZIONE SINGOLA
const leadRoutes = require('./src/routes/leads');
app.use('/api/leads', leadRoutes);

// Config Check
app.get('/api/config', (req, res) => {
  res.json({
    spreadsheetId: process.env.SPREADSHEET_ID_DATI,
    sheetRange: process.env.RANGE_DATI,
    serviceEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Middleware Gestione Errori
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Qualcosa è andato storto sul server.' });
});

// Avvio Server (Solo se eseguito direttamente, non su Vercel)
if (require.main === module) {
  console.log('Avvio server locale...');
  app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`| CRM Platform avviata su porta: ${PORT}    |`);
    console.log(`| Dashboard: http://localhost:${PORT}/dashboard |`);
    console.log(`-------------------------------------------`);
  });
}

// Esporta per Vercel
module.exports = app;

// Gestione Errori Fatali
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  // Non chiudiamo il processo per ora per permettere il debug, ma logghiamo tutto
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
