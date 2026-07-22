const dotenv = require('dotenv');
dotenv.config({ path: 'c:/Users/Giorgio_Madroom/Desktop/my-crm-platform/.env' });

const pk = process.env.SERVICE_ACCOUNT_PRIVATE_KEY;
if (!pk) {
  console.log('Private key NOT FOUND in .env');
  process.exit(1);
}

console.log('Type of PK:', typeof pk);
console.log('Length of PK:', pk.length);
console.log('First 50 chars:', JSON.stringify(pk.substring(0, 50)));
console.log('Contains literal \\n:', pk.includes('\\n'));
console.log('Contains real newline:', pk.includes('\n'));

const replaced = pk.replace(/\\n/g, '\n');
console.log('After potential replace, contains real newline:', replaced.includes('\n'));
console.log('Final Key Start:', JSON.stringify(replaced.substring(0, 50)));
