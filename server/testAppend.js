import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { initSheets, appendToMaster, readSheet } from './services/googleSheets.js';

async function test() {
  await initSheets();
  await appendToMaster([['Agustus 26', '8. LM Agustus 2026', 'https://test-link.com/file', '8. LM Agustus 2026']]);
  console.log('Appended row');

  const rows = await readSheet('Master', 'A50:E100');
  console.log('Last row inserted:', rows[rows.length - 1]);
}

test().catch(console.error);
