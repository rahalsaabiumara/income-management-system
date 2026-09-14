import xlsx from 'xlsx';

const workbook = xlsx.readFile('src/assets/template.xlsx');

for (const sheetName of workbook.SheetNames) {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);

  for (let r = 0; r <= 10; r++) {
    let rowValues = [];
    for (let c = 0; c <= range.e.c && c < 20; c++) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      rowValues.push(cell ? cell.v : '');
    }
    console.log(`Row ${r} (${r + 1}): ${JSON.stringify(rowValues)}`);
  }
}
