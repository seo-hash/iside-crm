const express = require('express');
const router = express.Router();
const leadsService = require('../services/leadsService');

// Semplice cache in memoria
let cache = {
  data: null,
  timestamp: 0,
  TTL: 60000 // 1 minuto
};

/**
 * Endpoint unificato per leggere entrambi i fogli
 */
router.get('/all-data', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < cache.TTL) {
      console.log('📦 Dati dalla cache');
      return res.json(cache.data);
    }

    console.log('📊 Caricamento dati da Google Sheets...');
    console.log('📁 Google Form ID:', process.env.SPREADSHEET_ID_MODULO);
    console.log('📁 Facebook ID:', process.env.SPREADSHEET_ID_DATI);

    // Legge i due fogli in modo indipendente: l'assenza di uno non blocca l'altro
    const readSheet = (id, range) => id && range
      ? leadsService.readRows(id, range).catch(err => {
          console.warn('⚠️ Foglio non disponibile:', err.message);
          return [];
        })
      : Promise.resolve([]);

    const [googleFormRows, facebookRows, compleanniRows, eventiRows] = await Promise.all([
      readSheet(process.env.SPREADSHEET_ID_MODULO, process.env.RANGE_MODULO),  // Google Form
      readSheet(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_DATI),      // Facebook Ads
      readSheet(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_COMPLEANNI), // Compleanno_bimbi
      readSheet(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_EVENTI)      // Eventi_privati_aziendali
    ]);

    console.log(`✅ Google Form: ${googleFormRows?.length || 0} righe lette`);
    console.log(`✅ Facebook Ads: ${facebookRows?.length || 0} righe lette`);
    console.log(`✅ Compleanno_bimbi: ${compleanniRows?.length || 0} righe lette`);
    console.log(`✅ Eventi_privati_aziendali: ${eventiRows?.length || 0} righe lette`);

    if (googleFormRows && googleFormRows.length > 0) {
      console.log('📋 Google Form headers:', googleFormRows[0]);
    }
    if (facebookRows && facebookRows.length > 0) {
      console.log('📋 Facebook headers:', facebookRows[0]);
    }

    const stats = calculateStats(googleFormRows, facebookRows);

    const allData = {
      googleFormLeads: googleFormRows || [],  // ← ATTENZIONE: nome corretto per frontend
      facebookLeads: facebookRows || [],      // ← ATTENZIONE: nome corretto per frontend
      compleanniLeads: compleanniRows || [],
      eventiLeads: eventiRows || [],
      stats: stats,
      config: {
        spreadsheetId: process.env.SPREADSHEET_ID_DATI,
        sheetRange: process.env.RANGE_DATI,
        serviceEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL
      }
    };

    cache.data = allData;
    cache.timestamp = now;

    res.json(allData);
  } catch (error) {
    console.error('❌ Errore lettura dati:', error.message);
    if (error.response) {
      console.error('📄 Dettagli errore Google:', error.response.data);
    }
    if (cache.data) {
      console.warn('⚠️ Utilizzo cache scaduta per errore');
      return res.json(cache.data);
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * Aggiorna lo stato di un lead
 */
router.patch('/:rowIndex/status', async (req, res) => {
  try {
    const { rowIndex } = req.params;
    const { status } = req.body;
    const { source } = req.query; // 'facebook' o 'googleform'
    
    if (!status) return res.status(400).json({ error: 'Nuovo stato richiesto.' });
    
    console.log(`🔄 Aggiornamento stato riga ${rowIndex}, source: ${source}, nuovo stato: ${status}`);

    // Colonne native del foglio: A..Q; R = Stato CRM (interno), S = Data Lavorazione (interno)
    const RANGE_BY_SOURCE = {
      facebook: process.env.RANGE_DATI,
      compleanni: process.env.RANGE_COMPLEANNI,
      eventi: process.env.RANGE_EVENTI
    };

    const sId = process.env.SPREADSHEET_ID_DATI;
    const sRange = RANGE_BY_SOURCE[source] || process.env.RANGE_DATI;
    const statusColumn = 'R';
    const workedColumn = 'S';

    await leadsService.updateLeadStatus(sId, sRange, rowIndex, status, statusColumn, workedColumn);

    cache.timestamp = 0; // Invalida cache
    res.json({ message: 'Stato aggiornato correttamente.' });
  } catch (error) {
    console.error('❌ Errore aggiornamento stato:', error.message);
    res.status(500).json({ error: error.message || 'Errore durante l\'aggiornamento dello stato.' });
  }
});


// --- FUNZIONI DI SUPPORTO ---

// Colonne del foglio "Facebook Ads" (Meta Lead Ads):
// A=id, B=created_time, ..., M(12)=che_evento_vuoi_organizzare?, N(13)=quante_persone_indicativamente?,
// O(14)=full_name, P(15)=phone_number, Q(16)=lead_status (di Meta), R(17)=Stato CRM, S(18)=Data Lavorazione
const META_DATE_IDX = 1;
const META_COURSE_IDX = 12;
const META_STATUS_IDX = 17;

function calculateStats(googleFormRows, facebookRows) {
  const stats = {
    total: 0,
    byStatus: {},
    byCourse: {},
    last7Days: 0,
    conversionRate: 0
  };

  const oggi = new Date();
  const setteGiorniFa = new Date();
  setteGiorniFa.setDate(oggi.getDate() - 7);

  const rows = Array.isArray(facebookRows) && facebookRows.length > 1 ? facebookRows.slice(1) : [];
  stats.total = rows.length;

  rows.forEach(row => {
    const status = row[META_STATUS_IDX] || 'Nuovo';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    const tipoEvento = row[META_COURSE_IDX];
    if (tipoEvento && tipoEvento !== '' && tipoEvento !== '-') {
      stats.byCourse[tipoEvento] = (stats.byCourse[tipoEvento] || 0) + 1;
    }

    const dataStr = row[META_DATE_IDX];
    if (dataStr) {
      const dataLead = new Date(dataStr);
      if (!isNaN(dataLead) && dataLead >= setteGiorniFa && dataLead <= oggi) {
        stats.last7Days++;
      }
    }
  });

  const convertiti = stats.byStatus['Convertito'] || 0;
  stats.conversionRate = stats.total > 0 ? ((convertiti / stats.total) * 100).toFixed(1) : 0;

  console.log('📈 Statistiche calcolate:', {
    total: stats.total,
    last7Days: stats.last7Days,
    conversionRate: stats.conversionRate
  });

  return stats;
}

// Endpoint di test per diagnosticare
router.get('/debug', async (req, res) => {
  try {
    const facebook = await leadsService.readRows(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_DATI);

    res.json({
      success: true,
      facebook: {
        rows: facebook?.length || 0,
        headers: facebook?.[0] || null,
        firstDataRow: facebook?.[1] || null
      }
    });
  } catch(err) {
    res.status(500).json({ 
      success: false, 
      error: err.message,
      stack: err.stack 
    });
  }
});

module.exports = router;