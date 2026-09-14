import { extractLampiranPdf, detectLampiran, findTabelLMPages, extractSinglePagePdf } from './lampiranService.js';
import { extractAllTables } from './geminiVisionExtractor.js';
import { validateAllTables } from './validationService.js';
import { writeExcelFromTemplate } from './excelWriter.js';
import { transformExcelToTabular } from './excelToTabularService.js';
import { validateTabularRecords } from './tabularValidationService.js';
import { upsertToGoogleSheets } from './googleSheets.js';
import { syncAllSheetsToSupabase } from './supabaseSyncService.js';
import { buildUuidMetadata } from './uuidGeneratorService.js';

import fs from 'fs';
import { isSupabaseConfigured } from './supabaseClient.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_CACHE_DIR = path.join(__dirname, '../data', 'excel-cache');
const TABULAR_DATA_DIR = path.join(__dirname, '../data', 'tabular');

const processingLocks = new Map();
const processingStatuses = new Map();

function updateStatus(reportId, status, details = {}) {
  const current = processingStatuses.get(reportId) || {};
  processingStatuses.set(reportId, { ...current, status, ...details, updatedAt: Date.now() });
  console.log(`[Processing:${reportId}] Status updated to: ${status}`);
}

export function getProcessingStatus(reportId) {
  return processingStatuses.get(reportId) || { status: 'IDLE' };
}

/**
 * Main pipeline orchestration function.
 * @param {object} report - e.g. { fileId, nama, namaStandar, tanggal, ... }
 */
export async function processAndSendReport(report) {
  const reportId = report.fileId;
  
  if (processingLocks.has(reportId)) {
    throw new Error('Report is already being processed');
  }

  processingLocks.set(reportId, true);
  updateStatus(reportId, 'PROCESSING');

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
        supabaseSyncResult = await syncAllSheetsToSupabase(groupedRecords);
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
