const { sheets } = require('../config/googleSheets');

/**
 * Formatta il range per fogli con spazi nel nome
 * Esempio: "Risposte del modulo 1!A:Z" → "'Risposte del modulo 1'!A:Z"
 */
const formatRange = (rawRange) => {
  if (!rawRange) return '';
  // Se già formattato con apici, lascia invariato
  if (rawRange.includes("'") && rawRange.includes("!")) return rawRange;
  // Se contiene spazi ma non apici, aggiungi apici
  if (rawRange.includes(' ') && !rawRange.includes("'")) {
    const [sheet, cells] = rawRange.split('!');
    return `'${sheet}'!${cells}`;
  }
  return rawRange;
};

const leadsService = {
  /**
   * Legge tutte le righe da un foglio specifico
   */
  async readRows(spreadsheetId, rawRange) {
    try {
      if (!spreadsheetId) throw new Error("spreadsheetId mancante");
      if (!rawRange) throw new Error("rawRange mancante");
      
      const range = formatRange(rawRange);
      console.log(`📖 Lettura: ${spreadsheetId} / ${range}`);
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
      });
      
      const values = response.data.values || [];
      console.log(`✅ Trovate ${values.length} righe`);
      return values;
    } catch (error) {
      console.error('❌ Errore lettura righe:', error.message);
      if (error.response) {
        console.error('📄 Dettagli:', error.response.data);
      }
      throw error;
    }
  },

  /**
   * Aggiunge una riga a un foglio
   */
  async appendRow(spreadsheetId, rawRange, rowData) {
    try {
      const range = formatRange(rawRange);
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] },
      });
      return response.data;
    } catch (error) {
      console.error('❌ Errore append:', error.message);
      throw new Error('Impossibile salvare il lead su Google Sheets.');
    }
  },

  /**
   * Aggiorna lo stato di un lead in una riga specifica
   */
  async updateLeadStatus(spreadsheetId, rawRange, rowIndex, newStatus, statusColumn = 'W', workedColumn = 'S') {
    try {
      const targetRange = formatRange(rawRange);
      const sheetName = targetRange.split('!')[0].replace(/'/g, '');
      
      // 1. Aggiorna lo Stato
      const statusCell = `'${sheetName}'!${statusColumn}${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: statusCell,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[newStatus]] },
      });

      // 2. Aggiorna Data Lavorazione (solo se non siamo in "Nuovo")
      const now = new Date().toLocaleString('it-IT');
      const workedCell = `'${sheetName}'!${workedColumn}${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: workedCell,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[now]] },
      });

      console.log(`✏️ Aggiornamento riga ${rowIndex}: Stato -> ${newStatus}, Data Lavorazione -> ${now}`);
      return true;
    } catch (error) {
      console.error('❌ Errore update status/worked date:', error.message);
      throw new Error('Impossibile aggiornare il lead su Google Sheets.');
    }
  },

};

module.exports = leadsService;