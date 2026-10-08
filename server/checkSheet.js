import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { initSheets, readSheet } from './services/googleSheets.js';

async function check() {
  await initSheets();
  const rows = await readSheet('Master', 'A1:D2000');
  const found = rows.findIndex(r => r.join(' ').includes('1PhVoPwijkCxSH4bnsoS4juGgXjImUh-4'));
  console.log('Found at row:', found + 1);
  if (found >= 0) console.log('Row data:', rows[found]);
}

check().catch(console.error);
