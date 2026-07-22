const { sheets, spreadsheetId } = require('./src/config/googleSheets');

async function checkData() {
  try {
    const range = 'Foglio1!A:W';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    console.log('Righe trovate:', response.data.values ? response.data.values.length : 0);
    if (response.data.values && response.data.values.length > 0) {
      console.log('Esempio riga 1 (Header):', response.data.values[0]);
    }
  } catch (error) {
    console.error('Errore:', error.message);
    if (error.response) {
      console.error('Dettagli:', error.response.data);
    }
  }
}

checkData();
