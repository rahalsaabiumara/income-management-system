/**
 * migrateGoogleSheetsToSupabase.js — Initial migration script.
 *
 * Reads all 4 sheets (LR, ARUS KAS, NERACA, PDPT) from the Google Tabular
 * Spreadsheet and upserts them into the corresponding Supabase tables.
 *
 * Usage:
 *   cd server
 *   npm run migrate:supabase
 *
 * This script:
 * 1. Initialises Google Sheets (uses existing OAuth credentials)
 * 2. Reads each sheet with header-based column mapping
 * 3. Normalises headers, extracts year from UUID, normalises month to DATE
 * 4. Validates consistency
 * 5. Batch upserts to Supabase
 * 6. Validates row counts and UUID sampling
 *
 * IMPORTANT: This is a one-time migration script. It should NOT run on every server start.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { initSheets } from '../services/googleSheets.js';
import { getOAuth2Client, isAuthReady } from '../services/googleAuth.js';
import { google } from 'googleapis';
import {
  extractYearFromId,
  normalizeMonthToDate,
  normalizeHeader,
  syncRecordsToSupabase,
  getTableStats,
} from '../services/supabaseSyncService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

// ── Configuration ────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.GOOGLE_TABULAR_SPREADSHEET_ID;

const SHEETS_TO_MIGRATE = [
  { sheetName: 'LR', hasSubUraian: true },
  { sheetName: 'ARUS KAS', hasSubUraian: true },
  { sheetName: 'NERACA', hasSubUraian: true },
  { sheetName: 'PDPT', hasSubUraian: false },
];

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Google Sheets → Supabase Migration');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Pre-flight checks
  if (!SPREADSHEET_ID) {
    console.error('❌ GOOGLE_TABULAR_SPREADSHEET_ID belum dikonfigurasi di .env');
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error('❌ SUPABASE_URL atau SUPABASE_SECRET_KEY belum dikonfigurasi di .env');
    process.exit(1);
  }

  // Initialise Google Sheets
  console.log('📋 Menginisialisasi Google Sheets...');
  try {
    initSheets();
  } catch (err) {
    console.error('❌ Gagal menginisialisasi Google Sheets:', err.message);
    process.exit(1);
  }

  if (!isAuthReady()) {
    console.error('❌ Google OAuth belum siap. Jalankan server terlebih dahulu untuk login.');
    process.exit(1);
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  const overallResults = {};
  let totalRecords = 0;
  let totalUpserted = 0;
  let totalFailed = 0;

  for (const config of SHEETS_TO_MIGRATE) {
    const { sheetName, hasSubUraian } = config;

    console.log(`\n────────────────────────────────────────────────`);
    console.log(`📄 Processing sheet: ${sheetName}`);
    console.log(`────────────────────────────────────────────────`);

    try {
      // Step 1: Read all data from the sheet
      console.log(`  📖 Membaca data dari sheet "${sheetName}"...`);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const rawRows = res.data.values || [];
      if (rawRows.length < 2) {
        console.log(`  ⚠️  Sheet "${sheetName}" kosong atau hanya memiliki header. Skip.`);
        overallResults[sheetName] = { status: 'SKIPPED', reason: 'No data rows' };
        continue;
      }

      // Step 2: Parse headers
      const rawHeaders = rawRows[0];
      const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));
      console.log(`  📋 Headers: [${normalizedHeaders.join(', ')}]`);

      // Build column index map
      const colMap = {};
      for (let i = 0; i < normalizedHeaders.length; i++) {
        colMap[normalizedHeaders[i]] = i;
      }

      // Validate required columns
      const requiredCols = ['id', 'bulan', 'uraian', 'jenis', 'value'];
      const missingCols = requiredCols.filter(c => colMap[c] === undefined);
      if (missingCols.length > 0) {
        throw new Error(`Kolom wajib tidak ditemukan: ${missingCols.join(', ')}`);
      }

      // Step 3: Transform rows to records
      const records = [];
      const warnings = [];

      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const id = (row[colMap['id']] || '').trim();

        if (!id) continue; // Skip empty rows

        const bulanRaw = (row[colMap['bulan']] || '').trim();
        const uraian = (row[colMap['uraian']] || '').trim();
        const jenis = (row[colMap['jenis']] || '').trim();
        const valueRaw = row[colMap['value']];

        // Parse value
        let value = parseFloat(valueRaw);
        if (isNaN(value)) {
          warnings.push(`  ⚠️  Row ${i + 1}: ID=${id} — value "${valueRaw}" bukan angka. Skip.`);
          continue;
        }
        if (value === 0) {
          continue; // Skip zero values
        }

        // Extract year from ID to validate it
        try {
          extractYearFromId(id);
        } catch (err) {
          warnings.push(`  ⚠️  Row ${i + 1}: ${err.message}. Skip.`);
          continue;
        }

        const record = {
          id,
          bulan: bulanRaw,
          uraian,
          jenis,
          value,
        };

        // Add sub_uraian only for sheets that have it
        if (hasSubUraian) {
          const subUraianCol = colMap['sub_uraian'] ?? colMap['suburaian'] ?? colMap['sub uraian'];
          record.subUraian = subUraianCol !== undefined ? (row[subUraianCol] || '').trim() || null : null;
        }

        records.push(record);
      }

      if (warnings.length > 0) {
        console.log(`\n  ⚠️  ${warnings.length} warnings:`);
        warnings.slice(0, 10).forEach(w => console.log(w));
        if (warnings.length > 10) {
          console.log(`  ... and ${warnings.length - 10} more warnings.`);
        }
      }

      console.log(`  ✅ ${records.length} valid records dari ${rawRows.length - 1} data rows.`);

      if (records.length === 0) {
        overallResults[sheetName] = { status: 'SKIPPED', reason: 'No valid records' };
        continue;
      }

      // Step 4: Sync to Supabase
      console.log(`  🔄 Mengirim ke Supabase...`);
      const syncResult = await syncRecordsToSupabase(sheetName, records);

      overallResults[sheetName] = syncResult;
      totalRecords += syncResult.total;
      totalUpserted += syncResult.inserted;
      totalFailed += syncResult.failed;

      console.log(
        `  ✅ Selesai: ${syncResult.inserted} upserted, ${syncResult.failed} failed`
      );

    } catch (err) {
      console.error(`  ❌ Error pada sheet "${sheetName}":`, err.message);
      overallResults[sheetName] = {
        status: 'FAILED',
        error: err.message,
      };
    }
  }

  // ── Validation ───────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Post-Migration Validation`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const SUPABASE_TABLE_MAPPING = {
    'LR': 'laba_rugi',
    'ARUS KAS': 'arus_kas',
    'NERACA': 'neraca',
    'PDPT': 'pendapatan',
  };

  for (const [sheetName, tableName] of Object.entries(SUPABASE_TABLE_MAPPING)) {
    try {
      const stats = await getTableStats(tableName);
      console.log(`  📊 ${tableName}: ${stats.count} rows`);
      if (stats.sampleIds && stats.sampleIds.length > 0) {
        console.log(`     Sample IDs:`);
        stats.sampleIds.forEach(s => {
          console.log(`       ${s.id} → value: ${s.value}`);
        });
      }
    } catch (err) {
      console.log(`  ❌ Gagal membaca stats untuk ${tableName}: ${err.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Migration Summary`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  for (const [sheetName, result] of Object.entries(overallResults)) {
    const status = result.status || (result.failed > 0 ? 'PARTIAL' : 'SUCCESS');
    const icon = status === 'SUCCESS' ? '✅' :
                 status === 'FAILED' ? '❌' :
                 status === 'SKIPPED' ? '⏭️' : '⚠️';
    console.log(`  ${icon} ${sheetName}: ${status}`);
    if (result.inserted) console.log(`     Upserted: ${result.inserted}`);
    if (result.failed) console.log(`     Failed: ${result.failed}`);
    if (result.error) console.log(`     Error: ${result.error}`);
    if (result.reason) console.log(`     Reason: ${result.reason}`);
  }

  console.log(`\n  📊 Total: ${totalRecords} records | ${totalUpserted} upserted | ${totalFailed} failed`);
  console.log(`\n═══════════════════════════════════════════════════════════\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Migration failed with unexpected error:', err);
  process.exit(1);
});
