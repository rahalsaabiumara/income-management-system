import fs from 'fs';
import path from 'path';

const file = 'd:/Study/company project/automation/server/data/uploads/local_1789629185854_2.pdf';

async function test() {
  const pdfBuffer = fs.readFileSync(file);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  
  const pdf = await loadingTask.promise;
  
  const page = await pdf.getPage(30);
  const textContent = await page.getTextContent();
  const text = textContent.items.map(item => item.str).join(' ');
  const textNoSpace = text.replace(/\s+/g, '');
  
  console.log('PAGE 30 RAW TEXT:');
  console.log(text);
  console.log('PAGE 30 NO SPACE:');
  console.log(textNoSpace);
  
  const match1 = /lampiran\s*1\b/i.test(text);
  const matchNoSpace = /lampiran1/i.test(textNoSpace);
  
  console.log('Regex Match (Original):', match1);
  console.log('Regex Match (No Space):', matchNoSpace);
}

test().catch(console.error);
