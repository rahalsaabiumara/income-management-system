import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wb = xlsx.read(xlsx.readFileSync(path.join(__dirname, '../src/assets/template.xlsx')), { type: 'buffer' });
const TARGET_SHEETS = ['LR', 'ARUS KAS', 'NERACA', 'PDPT'];

for (const name of TARGET_SHEETS) {
  const ws = wb.Sheets[name];
  if (!ws) continue;
  const range = xlsx.utils.decode_range(ws['!ref']);
  console.log('\n=== ' + name + ' === range: ' + ws['!ref']);
  for (let r = 0; r <= 3; r++) {
    let vals = [];
    for (let c = 0; c <= range.e.c; c++) {
      const ref = xlsx.utils.encode_cell({r,c});
      const cell = ws[ref];
      if (cell) vals.push(ref + '=' + JSON.stringify(cell.v));
    }
    console.log('Row ' + r + ': ' + vals.join(' | '));
  }
}
