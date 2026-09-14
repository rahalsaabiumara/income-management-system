/**
 * excelWriter.js — Fill template.xlsx with extracted financial data
 * using dynamic template-driven mapping.
 *
 * Reads src/assets/template.xlsx, dynamically determines column positions
 * from the template structure (NAMA BULAN DARI FILE + a/c references),
 * matches extracted rows by URAIAN label, and writes values to the correct cells.
 *
 * CORE PRINCIPLE: The template is the SOLE source of truth for:
 *   - Sheet structure
 *   - Row positions (via uraian labels — NOT via index order)
 *   - Column positions (via "a" = realisasi, "c" = RKAP references)
 *   - Month mapping (via "NAMA BULAN DARI FILE" markers)
 *
 * MAPPING FLOW:
 *   PDF Row → Identify URAIAN → Identify REALISASI (A) → Identify RKAP (C)
 *   → Canonical Mapping → Find target row in template → Find target columns
 *   → Validate → Insert value
 *
 * VALUES MUST ALWAYS BE ASSOCIATED WITH:
 *   1. Correct URAIAN
 *   2. Correct column (REALISASI vs RKAP)
 *   3. Correct cell in template
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SCHEMAS } from '../schemas/financialSchemas.js';
import { parseLMName } from '../utils/dateParser.js';
import {
  readAllMappings,
  getMapping,
  normalizeMonth,
  findRowMatch,
  isSectionHeader,
} from './templateMapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Utility to parse Indonesian number strings to float.
 * Cleans OCR artifacts and handles various formatting.
 */
function parseIndonesianNumber(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  
  let str = value.trim();
  if (str === '') return NaN;
  
  // Remove spaces, currency symbols, and other invalid chars (except dot, comma, minus)
  str = str.replace(/[^\d.,-]/g, '');
  
  const lastCommaIndex = str.lastIndexOf(',');
  const lastDotIndex = str.lastIndexOf('.');
  
  if (lastCommaIndex > -1 && lastDotIndex > -1) {
    if (lastCommaIndex > lastDotIndex) {
      // ID format: 1.234,56 -> remove dots, comma to dot
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // EN format: 1,234.56 -> remove commas
      str = str.replace(/,/g, '');
    }
  } else if (lastCommaIndex > -1) {
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      // ID decimal: 1234,56
      str = str.replace(',', '.');
    } else {
      // EN thousand sep: 1,234,567
      str = str.replace(/,/g, '');
    }
  } else if (lastDotIndex > -1) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // ID thousand sep: 1.234.567
      str = str.replace(/\./g, '');
    }
  }
  
  const parsed = parseFloat(str);
  return isNaN(parsed) ? NaN : parsed;
}


const TEMPLATE_PATH = path.join(__dirname, '../../src/assets/template.xlsx');

/**
 * Fill template.xlsx with extracted data and return as Buffer.
 *
 * @param {Object.<string, {tableType: string, bulan: string|null, rows: Array}>} tables
 * @param {object} [validation] — validation results (for logging)
 * @param {object} [metadata] — { nama }
 * @returns {Buffer}
 */
export function writeExcelFromTemplate(tables, validation, metadata = {}) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
  }

  const wb = XLSX.read(fs.readFileSync(TEMPLATE_PATH), { type: 'buffer', cellStyles: true });

  // ──────────────────────────────────────────────────────
  // Step 1: Load template mappings
  // ──────────────────────────────────────────────────────
  const mappings = readAllMappings();

  // ──────────────────────────────────────────────────────
  // Step 2: Determine month name from extracted data or metadata
  // ──────────────────────────────────────────────────────
  let detectedMonth = null;

  // Try to get month from extracted data (bulan field)
  for (const [tableType, data] of Object.entries(tables)) {
    if (data?.bulan) {
      const normalized = normalizeMonth(data.bulan);
      if (normalized) {
        detectedMonth = normalized;
        console.log(`[ExcelWriter] Bulan detected from ${tableType}: "${data.bulan}" → "${normalized}"`);
        break;
      }
    }
  }

  // Fallback: try metadata (filename)
  if (!detectedMonth && metadata.nama) {
    const parsed = parseLMName(metadata.nama);
    if (parsed && parsed.bulanNama) {
      detectedMonth = normalizeMonth(parsed.bulanNama);
      console.log(`[ExcelWriter] Bulan from metadata: "${parsed.bulanNama}" → "${detectedMonth}"`);
    }
  }

  if (!detectedMonth) {
    console.warn('[ExcelWriter] Bulan tidak terdeteksi — month header cells will not be updated');
  }

  // Extract year from metadata for display
  let yearStr = '';
  if (metadata.nama) {
    const parsed = parseLMName(metadata.nama);
    if (parsed?.tahun) yearStr = String(parsed.tahun);
  }

  // ──────────────────────────────────────────────────────
  // Step 3: Replace "NAMA BULAN DARI FILE" markers in ALL sheets
  // ──────────────────────────────────────────────────────
  const monthDisplay = detectedMonth
    ? detectedMonth.charAt(0).toUpperCase() + detectedMonth.slice(1)
    : '...';
  const monthYearDisplay = yearStr ? `${monthDisplay.toUpperCase()}-${yearStr}` : monthDisplay.toUpperCase();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
      for (let c = 0; c <= Math.min(range.e.c, 25); c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellRef];

        if (cell && cell.v && typeof cell.v === 'string') {
          if (cell.v.includes('NAMA BULAN DARI FILE-TAHUN')) {
            cell.v = cell.v.replace(/"NAMA BULAN DARI FILE-TAHUN"|NAMA BULAN DARI FILE-TAHUN/g, monthYearDisplay);
            console.log(`[MONTH] Cell ${cellRef} (${sheetName}) diperbarui → "${cell.v}"`);
          } else if (cell.v.includes('NAMA BULAN DARI FILE')) {
            cell.v = cell.v.replace(/"NAMA BULAN DARI FILE"|NAMA BULAN DARI FILE/g, monthDisplay.toUpperCase());
            console.log(`[MONTH] Cell ${cellRef} (${sheetName}) diperbarui → "${cell.v}"`);
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // Step 4: Process each extracted table
  // ──────────────────────────────────────────────────────
  const summaryLog = [];
  const insertionMetadata = []; // Post-insertion verification data

  for (const [tableType, data] of Object.entries(tables)) {
    const schema = SCHEMAS[tableType];
    if (!schema) {
      console.warn(`[ExcelWriter] No schema for type "${tableType}"`);
      continue;
    }

    const mapping = getMapping(tableType);
    if (!mapping) {
      console.warn(`[ExcelWriter] No template mapping for type "${tableType}"`);
      continue;
    }

    const rows = data?.rows || [];
    if (rows.length === 0) {
      console.warn(`[ExcelWriter] No rows for ${tableType}, skipping`);
      continue;
    }

    const ws = wb.Sheets[mapping.sheetName];
    if (!ws) {
      console.warn(`[ExcelWriter] Sheet "${mapping.sheetName}" not found in template`);
      continue;
    }

    console.log(`\n[PDF] Sheet target: ${mapping.sheetName}`);
    console.log(`[PDF] Bulan: ${data.bulan || '(not detected)'}`);
    console.log(`[MAPPING] Realisasi col: ${mapping.realisasiCol} (${XLSX.utils.encode_col(mapping.realisasiCol)}) [ref: a]`);
    console.log(`[MAPPING] RKAP col: ${mapping.rkapCol} (${XLSX.utils.encode_col(mapping.rkapCol)}) [ref: c/b]`);
    console.log(`[MAPPING] Uraian col: ${mapping.uraianCol} (${XLSX.utils.encode_col(mapping.uraianCol)})`);
    console.log(`[MAPPING] Data range: rows ${mapping.dataStartRow}-${mapping.dataEndRow} (${mapping.uraianLabels.length} template labels)`);

    let filledCount = 0;
    let matchedCount = 0;
    const unmatchedRows = [];

    // ──────────────────────────────────────────────────────
    // Step 4a: Match each PDF row to a template row BY URAIAN
    // NOT by index or order
    // ──────────────────────────────────────────────────────
    for (const row of rows) {
      // Support both new format (canonicalUraian/rawUraian) and legacy (label)
      const rawLabel = (row.rawUraian || row.label || '').trim();
      const canonicalLabel = (row.canonicalUraian || row.label || rawLabel).trim();
      
      if (!rawLabel || rawLabel.length < 2) continue;

      // Skip rows that Gemini already marked as UNMATCHED
      if (row.status === 'UNMATCHED') {
        unmatchedRows.push({ rawLabel, reason: 'UNMATCHED by Gemini', confidence: row.confidence });
        console.log(`[SKIP] "${rawLabel}" — marked UNMATCHED by Gemini`);
        continue;
      }

      // ─── Find matching template row by URAIAN ───────────
      // Try canonical first, then raw
      let match = findRowMatch(mapping.uraianLabels, canonicalLabel);
      if (!match && canonicalLabel !== rawLabel) {
        match = findRowMatch(mapping.uraianLabels, rawLabel);
      }

      if (!match) {
        unmatchedRows.push({ rawLabel, reason: 'No template match found', confidence: row.confidence || 'n/a' });
        console.log(`[WARNING] Akun tidak ditemukan pada template: "${rawLabel}" (canonical: "${canonicalLabel}")`);
        continue;
      }

      // ─── Validate: Skip section headers ─────────────────
      if (match.isSectionHeader) {
        console.log(`[SKIP] "${rawLabel}" → section header "${match.label}", skipping value insertion`);
        continue;
      }

      matchedCount++;
      const targetRow = match.row;

      console.log(
        `[MATCH] "${rawLabel}" → Template Row: ${targetRow + 1} ` +
        `("${match.label}") [${match.confidence}]`
      );

      // Helper to process value based on sheet rules
      const processValue = (val) => {
        if (val === '' || val == null) return null;
        let num = parseIndonesianNumber(val);
        if (!isFinite(num)) return null; // Skip NaN, undefined, objects

        if (mapping.sheetName === 'PDPT') {
          // PDPT scaling rule: multiply by 1000 if less than 1 billion
          if (Math.abs(num) < 1000000000) {
            num *= 1000;
          }
        }
        return num;
      };

      // ─── Get REALISASI value (from column A / realisasiA) ───
      const realisasiRaw = row.realisasiA ?? row.realisasiBulan ?? null;
      // ─── Get RKAP value (from column C / rkapC) ─────────
      const rkapRaw = row.rkapC ?? row.rkapBulan ?? null;

      // ──────────────────────────────────────────────────────
      // Step 4b: Write REALISASI to the "a" (realisasi) column
      // ──────────────────────────────────────────────────────
      if (realisasiRaw != null && realisasiRaw !== '') {
        const val = processValue(realisasiRaw);
        if (val != null) {
          const cellRef = XLSX.utils.encode_cell({ r: targetRow, c: mapping.realisasiCol });

          // PRE-INSERTION VALIDATION
          if (targetRow >= mapping.dataStartRow && targetRow <= mapping.dataEndRow) {
            ws[cellRef] = { t: 'n', v: val };
            filledCount++;
            console.log(`[TARGET] Cell: ${cellRef} (REALISASI) = ${val}`);

            insertionMetadata.push({
              sheet: mapping.sheetName,
              rawUraian: rawLabel,
              canonicalUraian: match.label,
              targetRow: targetRow + 1,
              column: 'REALISASI',
              targetCell: cellRef,
              sourceValue: realisasiRaw,
              insertedValue: val,
              confidence: match.confidence,
              status: 'SUCCESS',
            });
          } else {
            console.warn(
              `[WARNING] Target cell ${cellRef} is outside data range ` +
              `(${mapping.dataStartRow}-${mapping.dataEndRow}), skipping`
            );
            insertionMetadata.push({
              sheet: mapping.sheetName,
              rawUraian: rawLabel,
              canonicalUraian: match.label,
              targetRow: targetRow + 1,
              column: 'REALISASI',
              targetCell: cellRef,
              sourceValue: realisasiRaw,
              insertedValue: null,
              confidence: match.confidence,
              status: 'REJECTED_OUT_OF_RANGE',
            });
          }
        }
      }

      // ──────────────────────────────────────────────────────
      // Step 4c: Write RKAP to the "c" (RKAP) column
      // ──────────────────────────────────────────────────────
      if (rkapRaw != null && rkapRaw !== '') {
        const val = processValue(rkapRaw);
        if (val != null) {
          const cellRef = XLSX.utils.encode_cell({ r: targetRow, c: mapping.rkapCol });

          // PRE-INSERTION VALIDATION
          if (targetRow >= mapping.dataStartRow && targetRow <= mapping.dataEndRow) {
            ws[cellRef] = { t: 'n', v: val };
            filledCount++;
            console.log(`[TARGET] Cell: ${cellRef} (RKAP) = ${val}`);

            insertionMetadata.push({
              sheet: mapping.sheetName,
              rawUraian: rawLabel,
              canonicalUraian: match.label,
              targetRow: targetRow + 1,
              column: 'RKAP',
              targetCell: cellRef,
              sourceValue: rkapRaw,
              insertedValue: val,
              confidence: match.confidence,
              status: 'SUCCESS',
            });
          } else {
            console.warn(
              `[WARNING] Target cell ${cellRef} is outside data range ` +
              `(${mapping.dataStartRow}-${mapping.dataEndRow}), skipping`
            );
            insertionMetadata.push({
              sheet: mapping.sheetName,
              rawUraian: rawLabel,
              canonicalUraian: match.label,
              targetRow: targetRow + 1,
              column: 'RKAP',
              targetCell: cellRef,
              sourceValue: rkapRaw,
              insertedValue: null,
              confidence: match.confidence,
              status: 'REJECTED_OUT_OF_RANGE',
            });
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // Step 4d: Summary for this sheet
    // ──────────────────────────────────────────────────────
    const summary = `${mapping.sheetName}: ${matchedCount}/${rows.length} rows matched, ${filledCount} cells filled`;
    summaryLog.push(summary);
    console.log(`[SUMMARY] ${summary}`);

    if (unmatchedRows.length > 0) {
      console.log(`[WARNING] ${mapping.sheetName}: ${unmatchedRows.length} rows tidak cocok:`);
      for (const u of unmatchedRows) {
        console.log(`  - "${u.rawLabel}" (reason: ${u.reason}, confidence: ${u.confidence})`);
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // Step 5: Post-insertion verification
  // ──────────────────────────────────────────────────────
  console.log('\n[VERIFICATION] Post-insertion summary:');

  const successCount = insertionMetadata.filter(m => m.status === 'SUCCESS').length;
  const rejectedCount = insertionMetadata.filter(m => m.status !== 'SUCCESS').length;

  console.log(`  Total insertions: ${successCount} SUCCESS, ${rejectedCount} REJECTED/FAILED`);

  // Verify REALISASI vs RKAP separation
  const realisasiInserts = insertionMetadata.filter(m => m.column === 'REALISASI' && m.status === 'SUCCESS');
  const rkapInserts = insertionMetadata.filter(m => m.column === 'RKAP' && m.status === 'SUCCESS');
  console.log(`  REALISASI cells filled: ${realisasiInserts.length}`);
  console.log(`  RKAP cells filled: ${rkapInserts.length}`);

  // Check for any rejected insertions
  if (rejectedCount > 0) {
    console.log('\n  Rejected insertions:');
    for (const m of insertionMetadata.filter(m => m.status !== 'SUCCESS')) {
      console.log(`    [${m.status}] ${m.sheet}: "${m.rawUraian}" → ${m.targetCell} (${m.column})`);
    }
  }

  // ──────────────────────────────────────────────────────
  // Step 6: Final validation before export
  // ──────────────────────────────────────────────────────
  console.log('\n[VALIDATION] Pre-export checks:');

  // Check sheet names are preserved
  const originalSheetNames = ['LR', 'ARUS KAS', 'NERACA', 'PDPT'];
  for (const name of originalSheetNames) {
    if (wb.SheetNames.includes(name)) {
      console.log(`[VALIDATION] Sheet "${name}": ✓ present`);
    } else {
      console.warn(`[VALIDATION] Sheet "${name}": ✗ MISSING`);
    }
  }

  // Ensure sheet ranges are correct
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      ws['!ref'] = XLSX.utils.encode_range(range);
    }
  }

  // Log final summary
  console.log('\n[EXPORT] Summary:');
  for (const s of summaryLog) {
    console.log(`  ${s}`);
  }

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// Legacy export
export function writeExcel(tables, validation, metadata) {
  return writeExcelFromTemplate(tables, validation, metadata);
}
