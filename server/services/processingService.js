import { extractLampiranPdf, detectLampiran, findTabelLMPages, extractSinglePagePdf } from './lampiranService.js';
import { extractAllTables } from './geminiVisionExtractor.js';
import { validateAllTables } from './validationService.js';
import { writeExcelFromTemplate } from './excelWriter.js';
import { transformExcelToTabular } from './excelToTabularService.js';
import { validateTabularRecords } from './tabularValidationService.js';
import { upsertToGoogleSheets } from './googleSheets.js';
import { syncAllSheetsToSupabase } from './supabaseSyncService.js';
import { buildUuidMetadata } from './uuidGeneratorService.js';
import { updateDocumentStatus, updateDocumentExcelId } from './documentTrackingService.js';

import fs from 'fs';
import { isSupabaseConfigured } from './supabaseClient.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_CACHE_DIR = process.env.VERCEL ? path.join('/tmp', 'excel-cache') : path.join(__dirname, '../data', 'excel-cache');
const TABULAR_DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'tabular') : path.join(__dirname, '../data', 'tabular');

const processingLocks = new Map();
const processingStatuses = new Map();

// Anggaran waktu untuk langkah ekstraksi Gemini. Di Vercel, fungsi dihentikan paksa
// setelah maxDuration (300 dtk), jadi ekstraksi harus berhenti lebih awal agar Excel
// tetap sempat ditulis, diunggah ke Drive, dan status dokumen diperbarui.
const EXTRACTION_BUDGET_MS = Number(process.env.EXTRACTION_BUDGET_MS)
  || (process.env.VERCEL ? 230000 : 330000);

function updateStatus(reportId, status, details = {}) {
  const current = processingStatuses.get(reportId) || {};
  processingStatuses.set(reportId, { ...current, status, ...details, updatedAt: Date.now() });
  console.log(`[Processing:${reportId}] Status updated to: ${status}`);
}

async function uploadExcelToDriveUsingGAS(excelBuffer, filename) {
  const gasUrl = process.env.GAS_UPLOAD_URL;
  const folderId = process.env.GOOGLE_DRIVE_EXCEL_FOLDER_ID;

  if (!gasUrl) throw new Error('GAS_UPLOAD_URL tidak ditemukan di environment.');
  if (!folderId) throw new Error('GOOGLE_DRIVE_EXCEL_FOLDER_ID tidak ditemukan di environment.');

  const base64Data = excelBuffer.toString('base64');
  const payload = {
    data: base64Data,
    filename: filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    folderId: folderId
  };

  const gasResponse = await fetch(gasUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  const contentType = gasResponse.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`Google Apps Script URL requires login (returned HTML).`);
  }

  const gasResult = await gasResponse.json();
  if (!gasResult.success) {
    throw new Error(gasResult.error || 'Unknown error from GAS');
  }

  return gasResult.fileId;
}

export function getProcessingStatus(reportId) {
  return processingStatuses.get(reportId) || { status: 'IDLE' };
}

export { EXCEL_CACHE_DIR };

/**
 * Extraction-only pipeline: PDF → Excel Cache.
 * Does NOT send data to Tabular, Google Sheets, or Supabase.
 * Sets document status to DRAFT_READY when done.
 *
 * @param {object} report - { fileId, nama, namaStandar, tanggal, ... }
 * @param {string} [document_id] - Optional Supabase document UUID
 */
export async function extractToExcelCache(report, document_id) {
  const reportId = report.fileId;

  if (processingLocks.has(reportId)) {
    throw new Error('Report is already being processed');
  }

  const startedAt = Date.now();

  processingLocks.set(reportId, true);
  updateStatus(reportId, 'PROCESSING');

  if (document_id) {
    try { await updateDocumentStatus(document_id, 'PROCESSING'); } catch (e) {
      console.warn('[extractToExcelCache] Gagal update status PROCESSING:', e.message);
    }
  }

  let failedTables = [];

  try {
    const excelPath = path.join(EXCEL_CACHE_DIR, `${reportId}.xlsx`);

    if (!fs.existsSync(excelPath)) {
      updateStatus(reportId, 'CONVERTING');

      const info = await findTabelLMPages(reportId);
      if (!info.detected) throw new Error('Halaman target Tabel LM tidak terdeteksi.');

      const pagePdfs = {};
      for (const [tableType, pageNum] of Object.entries(info.pages)) {
        if (pageNum) pagePdfs[tableType] = await extractSinglePagePdf(reportId, pageNum);
      }

      let tables = await extractAllTables(pagePdfs, { deadline: startedAt + EXTRACTION_BUDGET_MS });
      for (const key of Object.keys(tables)) {
        if (!tables[key] || !tables[key].rows || tables[key].rows.length === 0) delete tables[key];
      }
      failedTables = Object.keys(pagePdfs).filter(t => !tables[t]);
      if (failedTables.length > 0) {
        console.warn(`[extractToExcelCache:${reportId}] Tabel gagal diekstrak: ${failedTables.join(', ')}`);
      }
      if (Object.keys(tables).length === 0) throw new Error('Tidak ada tabel yang berhasil diekstrak.');

      const validation = validateAllTables(tables);
      const metadata = {
        nama: report.namaStandar || report.nama || '',
        companyName: 'PT LPP AGRO NUSANTARA',
        period: report.namaStandar || report.nama || '',
      };

      updateStatus(reportId, 'SAVING_EXCEL');
      const excelBuffer = writeExcelFromTemplate(tables, validation, metadata);
      if (!fs.existsSync(EXCEL_CACHE_DIR)) fs.mkdirSync(EXCEL_CACHE_DIR, { recursive: true });
      fs.writeFileSync(excelPath, excelBuffer);

      // Upload the generated Excel to Google Drive
      updateStatus(reportId, 'UPLOADING_EXCEL_TO_DRIVE');
      try {
        const excelFilename = `${metadata.nama || reportId}.xlsx`;
        const excelDriveId = await uploadExcelToDriveUsingGAS(excelBuffer, excelFilename);
        console.log(`[extractToExcelCache:${reportId}] Uploaded Excel to Drive: ${excelDriveId}`);
        
        if (document_id) {
          await updateDocumentExcelId(document_id, excelDriveId);
        }
      } catch (uploadErr) {
        console.error(`[extractToExcelCache:${reportId}] Failed to upload Excel to Drive:`, uploadErr.message);
        // We continue even if upload fails, since it's cached locally
      }
    } else {
      console.log(`[extractToExcelCache:${reportId}] Using cached Excel file.`);
    }

    updateStatus(reportId, 'DRAFT_READY', { failedTables });

    if (document_id) {
      try { await updateDocumentStatus(document_id, 'DRAFT_READY'); } catch (e) {
        console.warn('[extractToExcelCache] Gagal update status DRAFT_READY:', e.message);
      }
    }

    console.log(`[extractToExcelCache:${reportId}] Selesai dalam ${Math.round((Date.now() - startedAt) / 1000)}s`);
    return { success: true, status: 'DRAFT_READY', excelFile: `${reportId}.xlsx`, failedTables };
  } catch (err) {
    updateStatus(reportId, 'FAILED', { error: err.message });
    if (document_id) {
      try { await updateDocumentStatus(document_id, 'UNPROCESSED'); } catch (_) {}
    }
    throw err;
  } finally {
    processingLocks.delete(reportId);
  }
}

/**
 * Main pipeline orchestration function.
 * @param {object} report - e.g. { fileId, nama, namaStandar, tanggal, ... }
 * @param {string} [document_id] - Optional ID dari tabel documents Supabase
 */
export async function processAndSendReport(report, document_id) {
  const reportId = report.fileId;
  
  if (processingLocks.has(reportId)) {
    throw new Error('Report is already being processed');
  }

  processingLocks.set(reportId, true);
  updateStatus(reportId, 'PROCESSING');

  if (document_id) {
    try {
      await updateDocumentStatus(document_id, 'PROCESSING');
    } catch (err) {
      console.warn('[Phase3] Gagal update status PROCESSING, lanjutkan proses:', err.message);
    }
  }

  try {
    // PRE-FETCH EXCEL CACHE
    const excelPath = path.join(EXCEL_CACHE_DIR, `${reportId}.xlsx`);
    let finalExcelPath = excelPath;

    // STEP 1: CONVERTING (Only if not already cached)
    if (!fs.existsSync(excelPath)) {
      updateStatus(reportId, 'CONVERTING');
      
      const info = await findTabelLMPages(reportId);
      if (!info.detected) {
        throw new Error('Halaman target Tabel LM tidak terdeteksi.');
      }

      const pagePdfs = {};
      for (const [tableType, pageNum] of Object.entries(info.pages)) {
        if (pageNum) {
          pagePdfs[tableType] = await extractSinglePagePdf(reportId, pageNum);
        }
      }

      let tables = await extractAllTables(pagePdfs);
      for (const key of Object.keys(tables)) {
        if (!tables[key] || !tables[key].rows || tables[key].rows.length === 0) {
          delete tables[key];
        }
      }

      if (Object.keys(tables).length === 0) {
        throw new Error('Tidak ada tabel yang berhasil diekstrak oleh Gemini.');
      }

      const validation = validateAllTables(tables);
      
      const metadata = {
        nama: report.namaStandar || report.nama || '',
        companyName: 'PT LPP AGRO NUSANTARA',
        period: report.namaStandar || report.nama || '',
      };

      updateStatus(reportId, 'SAVING_EXCEL');
      const excelBuffer = writeExcelFromTemplate(tables, validation, metadata);
      
      if (!fs.existsSync(EXCEL_CACHE_DIR)) {
        fs.mkdirSync(EXCEL_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(excelPath, excelBuffer);

      // Upload the generated Excel to Google Drive
      updateStatus(reportId, 'UPLOADING_EXCEL_TO_DRIVE');
      try {
        const excelFilename = `${metadata.nama || reportId}.xlsx`;
        const excelDriveId = await uploadExcelToDriveUsingGAS(excelBuffer, excelFilename);
        console.log(`[Processing:${reportId}] Uploaded Excel to Drive: ${excelDriveId}`);
        
        if (document_id) {
          await updateDocumentExcelId(document_id, excelDriveId);
        }
      } catch (uploadErr) {
        console.error(`[Processing:${reportId}] Failed to upload Excel to Drive:`, uploadErr.message);
        // We continue even if upload fails, since it's cached locally
      }
    } else {
      console.log(`[Processing:${reportId}] Using cached Excel file.`);
    }

    // PRE-LOAD UUID SCHEMA
    await buildUuidMetadata();

    // STEP 2: READING EXCEL & TRANSFORMING TABULAR
    updateStatus(reportId, 'TRANSFORMING_TABULAR');
    const records = await transformExcelToTabular(finalExcelPath, report);

    if (records.length === 0) {
      throw new Error('Tidak ada data tabular yang dapat diekstrak dari Excel hasil.');
    }

    // STEP 3: VALIDATION & DEDUPLICATION
    updateStatus(reportId, 'VALIDATING');
    const { valid, invalid } = validateTabularRecords(records);

    if (valid.length === 0) {
      throw new Error('Semua record tabular gagal divalidasi.');
    }

    // STEP 4: UPSERT TO GOOGLE SPREADSHEET
    updateStatus(reportId, 'SYNCING_SPREADSHEET');
    
    // Group records by sheetName
    const groupedRecords = {
      'LR': [],
      'ARUS KAS': [],
      'NERACA': [],
      'PDPT': []
    };
    
    for (const record of valid) {
      if (record.sheetName) {
        if (!groupedRecords[record.sheetName]) {
          groupedRecords[record.sheetName] = [];
        }
        groupedRecords[record.sheetName].push(record);
      }
    }

    const spreadsheetId = process.env.GOOGLE_TABULAR_SPREADSHEET_ID;
    const summaryPerSheet = {};
    let hasFailedSheet = false;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (const [sheetName, recordsToUpsert] of Object.entries(groupedRecords)) {
      if (recordsToUpsert.length === 0) continue;
      
      try {
        const result = await upsertToGoogleSheets({
          spreadsheetId,
          sheetName,
          records: recordsToUpsert
        });
        summaryPerSheet[sheetName] = result;
        totalInserted += result.inserted;
        totalUpdated += result.updated;
      } catch (sheetErr) {
        console.error(`[Processing:${reportId}] Error syncing sheet ${sheetName}:`, sheetErr);
        summaryPerSheet[sheetName] = {
          total: recordsToUpsert.length,
          inserted: 0,
          updated: 0,
          failed: recordsToUpsert.length,
          error: sheetErr.message
        };
        hasFailedSheet = true;
      }
    }

    // STEP 4.5: SAVE TABULAR DATA LOCALLY (for audit/retry)
    try {
      if (!fs.existsSync(TABULAR_DATA_DIR)) {
        fs.mkdirSync(TABULAR_DATA_DIR, { recursive: true });
      }
      const tabularFilename = `${report.nama || report.namaStandar || reportId}.json`.replace(/[/\\:*?"<>|]/g, '-');
      const tabularPath = path.join(TABULAR_DATA_DIR, tabularFilename);
      fs.writeFileSync(tabularPath, JSON.stringify({
        generated_at: new Date().toISOString(),
        source: report.nama || reportId,
        records: groupedRecords,
      }, null, 2));
      console.log(`[Processing:${reportId}] Tabular data saved locally: ${tabularFilename}`);
    } catch (saveErr) {
      console.warn(`[Processing:${reportId}] Failed to save tabular data locally:`, saveErr.message);
    }

    // STEP 5: SYNC TO SUPABASE (modular, non-blocking)
    let supabaseSyncResult = null;
    if (isSupabaseConfigured()) {
      updateStatus(reportId, 'SYNCING_SUPABASE');
      try {
        supabaseSyncResult = await syncAllSheetsToSupabase(groupedRecords, document_id);
        console.log(`[Processing:${reportId}] Supabase sync: ${supabaseSyncResult.status}`);
      } catch (supabaseErr) {
        console.warn(`[Processing:${reportId}] Supabase sync failed (non-critical):`, supabaseErr.message);
        supabaseSyncResult = { success: false, status: 'FAILED', error: supabaseErr.message };
      }
    } else {
      console.log(`[Processing:${reportId}] Supabase not configured, skipping sync.`);
    }

    const summary = {
      totalExtracted: records.length,
      valid: valid.length,
      invalid: invalid.length,
      inserted: totalInserted,
      updated: totalUpdated,
      ...summaryPerSheet,
      supabase: supabaseSyncResult,
    };

    // Supabase failure does NOT affect overall pipeline status
    let finalStatus = (invalid.length > 0 || hasFailedSheet) ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    updateStatus(reportId, finalStatus, { summary, unmatched: invalid });

    if (document_id) {
      try {
        await updateDocumentStatus(document_id, 'DRAFT_READY');
      } catch (err) {
        console.warn('[Phase3] Gagal update status DRAFT_READY, response tetap dikirim:', err.message);
      }
    }

    return {
      success: true,
      status: finalStatus,
      report: {
        fileName: report.nama,
        excelFile: `Excel-${reportId}.xlsx`
      },
      summary,
      unmatched: invalid
    };

  } catch (err) {
    updateStatus(reportId, 'FAILED', { error: err.message });
    throw err;
  } finally {
    processingLocks.delete(reportId);
  }
}
