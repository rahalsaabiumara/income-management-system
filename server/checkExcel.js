import * as XLSX from 'xlsx';
import path from 'path';

function checkExcel() {
  const filePath = path.join(process.cwd(), 'server', 'data', 'excel-cache', '1906e9mTarqiCPI9nKBsLzpS45a2Cbm6R.xlsx');
  try {
    const workbook = XLSX.readFile(filePath);
    console.log('Sheets:', workbook.SheetNames);
    
    // Read first sheet
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`\nData in ${firstSheetName}:`);
    console.log(data.slice(0, 5)); // print first 5 rows
  } catch (err) {
    console.error('Error reading excel:', err);
  }
}

checkExcel();
