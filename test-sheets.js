const leadsService = require('./src/services/leadsService');
const config = require('./src/config/googleSheets');

async function test() {
  console.log('Testing FB Leads (Foglio1)...');
  try {
    const fb = await leadsService.readRows('Foglio1!A:W');
    console.log('FB Success, rows:', fb.length);
  } catch (e) {
    console.error('FB Error:', e.message);
  }

  console.log('\nTesting Google Form (Risposte del modulo 1)...');
  try {
    const form = await leadsService.readRows(config.formSheetRange);
    console.log('Form Success, rows:', form.length);
  } catch (e) {
    console.error('Form Error:', e.message);
  }
}

test();
