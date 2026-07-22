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
    
    // Legge i due fogli
    const [googleFormRows, facebookRows] = await Promise.all([
      leadsService.readRows(process.env.SPREADSHEET_ID_MODULO, process.env.RANGE_MODULO),  // Google Form
      leadsService.readRows(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_DATI)       // Facebook Ads
    ]);

    console.log(`✅ Google Form: ${googleFormRows?.length || 0} righe lette`);
    console.log(`✅ Facebook Ads: ${facebookRows?.length || 0} righe lette`);
    
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
      stats: stats,
      config: {
        spreadsheetId: process.env.SPREADSHEET_ID_MODULO,
        sheetRange: process.env.RANGE_MODULO,
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
    
    // Sceglie il foglio e la colonna corretta in base alla sorgente
    const sId = source === 'facebook' ? process.env.SPREADSHEET_ID_DATI : process.env.SPREADSHEET_ID_MODULO;
    const sRange = source === 'facebook' ? process.env.RANGE_DATI : process.env.RANGE_MODULO;
    
    // Identifica la colonna corretta per lo stato e la data lavorazione
    // Facebook: Stato V (21), Lavorazione W (22)
    // Google Form: Stato R (17), Lavorazione S (18)
    const statusColumn = source === 'facebook' ? 'V' : 'R';
    const workedColumn = source === 'facebook' ? 'W' : 'S';

    await leadsService.updateLeadStatus(sId, sRange, rowIndex, status, statusColumn, workedColumn);
    
    cache.timestamp = 0; // Invalida cache
    res.json({ message: 'Stato aggiornato correttamente.' });
  } catch (error) {
    console.error('❌ Errore aggiornamento stato:', error.message);
    res.status(500).json({ error: error.message || 'Errore durante l\'aggiornamento dello stato.' });
  }
});

// --- FUNZIONI DI SUPPORTO ---

function calculateStats(googleFormRows, facebookRows) {
  const stats = {
    total: 0,
    byStatus: {},
    bySource: { 'Google Form': 0, 'Facebook': 0 },
    byCourse: {},
    bySede: {},
    last7Days: 0,
    conversionRate: 0
  };

  const oggi = new Date();
  const setteGiorniFa = new Date();
  setteGiorniFa.setDate(oggi.getDate() - 7);

  const processSet = (rows, sourceName) => {
    if (!Array.isArray(rows) || rows.length <= 1) {
      console.log(`⚠️ Nessun dato per ${sourceName}`);
      return;
    }
    const data = rows.slice(1); // salta header
    stats.total += data.length;
    stats.bySource[sourceName] = data.length;
    
    console.log(`📊 ${sourceName}: ${data.length} lead processati`);

    data.forEach((row, idx) => {
      // Identifica le colonne corrette in base alla sorgente
      let statusIdx, courseIdx, sedeIdx;
      
      if (sourceName === 'Google Form') {
        statusIdx = 17; // Colonna R
        courseIdx = 11; // Colonna L
        sedeIdx = 15;   // Colonna P
      } else {
        statusIdx = 21; // Colonna V
        courseIdx = 13; // Colonna N
        sedeIdx = 14;   // Colonna O
      }

      // Stato
      const status = row[statusIdx] || 'Nuovo';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      // Corso
      const corso = row[courseIdx];
      if (corso && corso !== '' && corso !== '-') {
        stats.byCourse[corso] = (stats.byCourse[corso] || 0) + 1;
      }
      
      // Sede
      const sede = row[sedeIdx];
      if (sede && sede !== '' && sede !== '-') {
        stats.bySede[sede] = (stats.bySede[sede] || 0) + 1;
      }
      
      // Lead degli ultimi 7 giorni (data in colonna 0/A)
      const dataStr = row[0];
      if (dataStr && dataStr !== '-') {
        try {
          let dataLead;
          // Prova a parsare la data nel formato italiano dd/mm/yyyy
          if (dataStr.includes('/')) {
            const [day, month, year] = dataStr.split('/');
            dataLead = new Date(year, month - 1, day);
          } else {
            dataLead = new Date(dataStr);
          }
          
          if (!isNaN(dataLead) && dataLead >= setteGiorniFa && dataLead <= oggi) {
            stats.last7Days++;
          }
        } catch(e) {
          // Ignora errori di parsing
        }
      }
    });
  };

  processSet(googleFormRows, 'Google Form');
  processSet(facebookRows, 'Facebook');

  const convertiti = stats.byStatus['Convertito'] || 0;
  stats.conversionRate = stats.total > 0 ? ((convertiti / stats.total) * 100).toFixed(1) : 0;

  console.log('📈 Statistiche calcolate:', {
    total: stats.total,
    last7Days: stats.last7Days,
    conversionRate: stats.conversionRate,
    bySource: stats.bySource
  });

  return stats;
}

// Endpoint di test per diagnosticare
router.get('/debug', async (req, res) => {
  try {
    const [googleForm, facebook] = await Promise.all([
      leadsService.readRows(process.env.SPREADSHEET_ID_MODULO, process.env.RANGE_MODULO),
      leadsService.readRows(process.env.SPREADSHEET_ID_DATI, process.env.RANGE_DATI)
    ]);
    
    res.json({
      success: true,
      googleForm: {
        rows: googleForm?.length || 0,
        headers: googleForm?.[0] || null,
        firstDataRow: googleForm?.[1] || null
      },
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