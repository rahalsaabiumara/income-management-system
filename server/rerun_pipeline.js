import { processAndSendReport } from './services/processingService.js';
import { updateDocumentStatus } from './services/documentTrackingService.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const fileId = '1OE1kyPL7aBaXM0etWum808usEBnU_Io4';
  const report = {
    fileId,
    nama: 'LM Agustus 2026',
    namaStandar: 'LM Agustus 2026',
  };
  
  try {
    const result = await processAndSendReport(report);
    console.log('Result:', result.summary);
    
    // Ensure document remains POSTED if it was already POSTED (or just keep it POSTED)
    const docId = 'bf718543-3977-424e-ba33-cad7f954a0e4';
    await updateDocumentStatus(docId, 'POSTED');
    console.log('Restored POSTED status on document');
  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
