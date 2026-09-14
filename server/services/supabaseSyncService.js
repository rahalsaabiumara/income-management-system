/**
 * supabaseSyncService.js — Modular Supabase sync adapter.
 *
 * Receives normalised tabular records (already processed by the existing pipeline)
 * and upserts them to the corresponding Supabase PostgreSQL tables.
 *
 * Design principles:
 * - Uses the SAME normalised data object as Google Sheets sync (no double transformation)
 * - Isolated from the main pipeline — failures here NEVER break PDF→Excel→Sheets flow
 * - Batch upsert with configurable batch size
 * - Per-sheet error isolation (one sheet failing doesn't roll back others)
 */
import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient.js';

// ── Constants ────────────────────────────────────────────────────

/**
 * Explicit mapping from Google Sheet names to Supabase table names.
 * No fallback table — unknown sheets throw an error.
 */
const SUPABASE_TABLE_MAPPING = {
  'LR': 'laba_rugi',
  'ARUS KAS': 'arus_kas',
  'NERACA': 'neraca',
  'PDPT': 'pendapatan',
};

/**
 * Indonesian month name → month number mapping.
 */
const MONTH_MAP = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

/**
 * UUID tag patterns for year extraction.
 * Maps the 2-letter tag in the UUID to its meaning.
 */
const UUID_TAG_PATTERN = /(?:LR|CF|BL|RE)(\d{2})/i;

const BATCH_SIZE = 500;

// ── Utility Functions ────────────────────────────────────────────

/**
 * Extract the year from a UUID string.
 *
 * UUID examples:
 *   JAN-1-A-LR22-REAL  → 2022
 *   FEB-3-B-CF25-REAL  → 2025
 *   MAR-2-C-BL24-RKAP  → 2024
 *   APR-4-RE26-REAL    → 2026
 *
 * @param {string} id
 * @returns {number} Four-digit year
 * @throws {Error} If the ID doesn't contain a recognisable year tag
 */
export function extractYearFromId(id) {
  const match = String(id).match(UUID_TAG_PATTERN);
  if (!match) {
    throw new Error(`Tidak dapat mengambil tahun dari ID: ${id}`);
  }
  return 2000 + Number(match[1]);
}

/**
 * Normalise an Indonesian month name to an ISO date string (YYYY-MM-01).
 *
 * @param {string} monthName — e.g. "JANUARI", "Februari", "maret"
 * @param {number} year — four-digit year
 * @returns {string} ISO date string, e.g. "2022-01-01"
 * @throws {Error} If the month name is not recognised
 */
export function normalizeMonthToDate(monthName, year) {
  const normalised = String(monthName).trim().toLowerCase();
  const month = MONTH_MAP[normalised];
  if (!month) {
    throw new Error(`Nama bulan tidak valid: ${monthName}`);
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Normalise a spreadsheet header to a consistent format.
 * "Sub Uraian" → "sub_uraian"
 *
 * @param {string} header
 * @returns {string}
 */
export function normalizeHeader(header) {
  return String(header).trim().toLowerCase().replace(/\s+/g, '_');
}

// ── Core Sync Functions ──────────────────────────────────────────

/**
 * Transform a single pipeline record into a Supabase-ready row.
 *
 * @param {string} sheetName — e.g. "LR", "ARUS KAS"
 * @param {object} record — { id, bulan, uraian, subUraian, jenis, value }
 * @returns {object} Supabase row object
 */
function transformRecordForSupabase(sheetName, record) {
  const year = extractYearFromId(record.id);
  const bulanDate = normalizeMonthToDate(record.bulan, year);

  const row = {
    id: record.id,
    bulan: bulanDate,
    uraian: record.uraian,
    jenis: record.jenis,
    value: record.value,
  };

  // PDPT does NOT have sub_uraian
  if (sheetName !== 'PDPT') {
    row.sub_uraian = record.subUraian || null;
  }

  return row;
}

/**
 * Sync records for a single sheet to its Supabase table.
 *
 * @param {string} sheetName — e.g. "LR", "ARUS KAS"
 * @param {Array<object>} records — Array of pipeline records
 * @returns {Promise<object>} Result summary { total, inserted, updated, failed, errors }
 */
export async function syncRecordsToSupabase(sheetName, records) {
  const tableName = SUPABASE_TABLE_MAPPING[sheetName];
  if (!tableName) {
    throw new Error(`Tidak ditemukan mapping Supabase untuk sheet: ${sheetName}`);
  }

  if (!records || records.length === 0) {
    return { total: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
  }

  const supabase = getSupabaseAdmin();
  const result = { total: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };

  // Transform all records
  const transformedRecords = [];
  for (const record of records) {
    try {
      const transformed = transformRecordForSupabase(sheetName, record);
      transformedRecords.push(transformed);
    } catch (err) {
      result.failed++;
      result.errors.push({
        id: record.id,
        error: err.message,
      });
    }
  }

  // Batch upsert
  for (let i = 0; i < transformedRecords.length; i += BATCH_SIZE) {
    const batch = transformedRecords.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'id' })
        .select('id');

      if (error) {
        console.error(`[SupabaseSync] Batch error on ${tableName} (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message);
        result.failed += batch.length;
        result.errors.push({
          batch: Math.floor(i / BATCH_SIZE) + 1,
          count: batch.length,
          error: error.message,
        });
      } else {
        // Supabase upsert doesn't distinguish insert vs update in response,
        // so we count the total as "upserted"
        result.inserted += data ? data.length : batch.length;
      }
    } catch (err) {
      console.error(`[SupabaseSync] Exception on ${tableName} (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, err.message);
      result.failed += batch.length;
      result.errors.push({
        batch: Math.floor(i / BATCH_SIZE) + 1,
        count: batch.length,
        error: err.message,
      });
    }
  }

  console.log(
    `[SupabaseSync] ${tableName}: ${result.inserted} upserted, ${result.failed} failed out of ${result.total}`
  );

  return result;
}

/**
 * Sync all sheets to Supabase.
 * Receives the SAME grouped records object used for Google Sheets sync.
 *
 * @param {object} groupedRecords — { 'LR': [...], 'ARUS KAS': [...], 'NERACA': [...], 'PDPT': [...] }
 * @returns {Promise<object>} Overall sync result
 */
export async function syncAllSheetsToSupabase(groupedRecords) {
  if (!isSupabaseConfigured()) {
    console.warn('[SupabaseSync] Supabase belum dikonfigurasi. Skip sync.');
    return {
      success: false,
      status: 'SKIPPED',
      reason: 'Supabase not configured',
      sheets: {},
    };
  }

  const sheetsResult = {};
  let hasSuccess = false;
  let hasFailure = false;

  for (const [sheetName, records] of Object.entries(groupedRecords)) {
    if (!records || records.length === 0) continue;

    // Only sync sheets that have a mapping
    if (!SUPABASE_TABLE_MAPPING[sheetName]) {
      console.warn(`[SupabaseSync] Sheet "${sheetName}" tidak memiliki mapping Supabase. Skip.`);
      continue;
    }

    try {
      const result = await syncRecordsToSupabase(sheetName, records);
      sheetsResult[sheetName] = {
        status: result.failed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        ...result,
      };
      hasSuccess = true;
      if (result.failed > 0) hasFailure = true;
    } catch (err) {
      console.error(`[SupabaseSync] Error syncing sheet ${sheetName}:`, err.message);
      sheetsResult[sheetName] = {
        status: 'FAILED',
        total: records.length,
        inserted: 0,
        updated: 0,
        failed: records.length,
        error: err.message,
      };
      hasFailure = true;
    }
  }

  let overallStatus = 'SUCCESS';
  if (hasFailure && hasSuccess) overallStatus = 'PARTIAL_SUCCESS';
  else if (hasFailure && !hasSuccess) overallStatus = 'FAILED';
  else if (!hasSuccess && !hasFailure) overallStatus = 'NO_DATA';

  return {
    success: overallStatus !== 'FAILED',
    status: overallStatus,
    sheets: sheetsResult,
  };
}

/**
 * Read all data from a Supabase table (for validation/comparison).
 *
 * @param {string} tableName — e.g. "lr", "arus_kas"
 * @returns {Promise<{ count: number, sampleIds: string[] }>}
 */
export async function getTableStats(tableName) {
  const supabase = getSupabaseAdmin();

  const { count, error: countError } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`Failed to get count for ${tableName}: ${countError.message}`);
  }

  // Get sample IDs for validation
  const { data: sampleData, error: sampleError } = await supabase
    .from(tableName)
    .select('id, value')
    .limit(5);

  if (sampleError) {
    throw new Error(`Failed to get samples for ${tableName}: ${sampleError.message}`);
  }

  return {
    count: count || 0,
    sampleIds: (sampleData || []).map(r => ({ id: r.id, value: r.value })),
  };
}
