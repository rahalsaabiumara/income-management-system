/**
 * templateMapper.js — Dynamically read template.xlsx structure to determine
 * cell mapping for PDF data insertion.
 *
 * Instead of hardcoding column indices, this module scans each sheet for:
 *   1. "NAMA BULAN DARI FILE" markers (month header cells)
 *   2. Reference row with "a" (realisasi) and "c" (RKAP) markers
 *   3. Uraian (account label) column
 *   4. Data row range with account labels for matching
 *
 * The mapping is read once and cached for the lifetime of the process.
 *
 * IMPORTANT: template.xlsx is the SOLE SOURCE OF TRUTH.
 * No hardcoded row/column positions are allowed.
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.join(__dirname, '../../src/assets/template.xlsx');

// Sheets to process
const TARGET_SHEETS = ['LR', 'ARUS KAS', 'NERACA', 'PDPT'];

// Table type to sheet name mapping
const TABLE_TYPE_TO_SHEET = {
  LR: 'LR',
  ARUS_KAS: 'ARUS KAS',
  NERACA: 'NERACA',
  PDPT: 'PDPT',
};

// Cache for mappings (read once per process; reloaded when template.xlsx changes)
let cachedMappings = null;
let cachedTemplateMtime = null;

// ──────────────────────────────────────────────────────────────────
// ALIAS DICTIONARY
// Known PDF→Template name variations per sheet.
// Key = normalized PDF label, Value = canonical template label.
// ──────────────────────────────────────────────────────────────────
const GLOBAL_ALIASES = {
  // PDPT
  'hotel & mice': 'Hotel MICE',
  'hotel mice': 'Hotel MICE',
  'hotel dan mice': 'Hotel MICE',
  'hotel&mice': 'Hotel MICE',
  'jumlah pendapatan usaha': 'TOTAL',
  'jumlah pendapatan': 'TOTAL',
  'total pendapatan usaha': 'TOTAL',
  'total pendapatan': 'TOTAL',
  'assessment & sertifikasi': 'Asesmen dan Sertifikasi',
  'assessment dan sertifikasi': 'Asesmen dan Sertifikasi',
  'assessment and sertifikasi': 'Asesmen dan Sertifikasi',
  'asesmen & sertifikasi': 'Asesmen dan Sertifikasi',
  'asesmen and sertifikasi': 'Asesmen dan Sertifikasi',
  'digital business': 'Digital Bisnis',

  // LR
  'beban pemasaran dan penjualan': 'Beban usaha: Beban pemasaran dan penjualan',
  'beban pemasaran & penjualan': 'Beban usaha: Beban pemasaran dan penjualan',
  'beban umum dan administrasi': 'Beban usaha: Beban umum dan administrasi',
  'beban umum & administrasi': 'Beban usaha: Beban umum dan administrasi',
  'pajak kini': 'Beban (manfaat) pajak: Pajak kini',
  'pajak tangguhan': 'Beban (manfaat) pajak: Pajak tangguhan',
  'beban pajak kini': 'Beban (manfaat) pajak: Pajak kini',
  'beban pajak tangguhan': 'Beban (manfaat) pajak: Pajak tangguhan',
  'laba rugi kotor': 'Laba (Rugi) kotor',
  'laba kotor': 'Laba (Rugi) kotor',
  'rugi kotor': 'Laba (Rugi) kotor',
  'laba rugi usaha': 'Laba (Rugi) usaha',
  'laba usaha': 'Laba (Rugi) usaha',
  'rugi usaha': 'Laba (Rugi) usaha',
  'laba rugi operasi': 'Laba (Rugi) operasi',
  'laba operasi': 'Laba (Rugi) operasi',
  'rugi operasi': 'Laba (Rugi) operasi',
  'laba rugi sebelum beban pajak penghasilan': 'Laba (Rugi) sebelum beban pajak penghasilan',
  'laba sebelum pajak': 'Laba (Rugi) sebelum beban pajak penghasilan',
  'laba rugi sebelum pajak': 'Laba (Rugi) sebelum beban pajak penghasilan',
  'laba rugi tahun berjalan': 'Laba (Rugi) tahun berjalan',
  'laba tahun berjalan': 'Laba (Rugi) tahun berjalan',
  'rugi tahun berjalan': 'Laba (Rugi) tahun berjalan',
  'laba bersih': 'Laba (Rugi) tahun berjalan',
  'laba rugi komprehensif tahun berjalan': 'Laba (Rugi) komprehensif tahun berjalan',
  'laba komprehensif': 'Laba (Rugi) komprehensif tahun berjalan',
  'jumlah beban manfaat pajak': 'Jumlah beban (manfaat) pajak',
  'jumlah beban pajak': 'Jumlah beban (manfaat) pajak',
  'hpp': 'Beban pokok penjualan',
  'harga pokok penjualan': 'Beban pokok penjualan',

  // NERACA
  'total aset lancar': 'TOTAL ASET LANCAR',
  'jumlah aset lancar': 'TOTAL ASET LANCAR',
  'total aset tidak lancar': 'TOTAL ASET TIDAK LANCAR',
  'jumlah aset tidak lancar': 'TOTAL ASET TIDAK LANCAR',
  'total aset': 'TOTAL ASET',
  'jumlah aset': 'TOTAL ASET',
  'total liabilitas jangka pendek': 'TOTAL LIABILITAS JANGKA PENDEK',
  'jumlah liabilitas jangka pendek': 'TOTAL LIABILITAS JANGKA PENDEK',
  'total liabilitas jangka panjang': 'TOTAL LIABILITAS JANGKA PANJANG',
  'jumlah liabilitas jangka panjang': 'TOTAL LIABILITAS JANGKA PANJANG',
  'total liabilitas': 'TOTAL LIABILITAS',
  'jumlah liabilitas': 'TOTAL LIABILITAS',
  'total ekuitas': 'TOTAL EKUITAS',
  'jumlah ekuitas': 'TOTAL EKUITAS',
  'total liabilitas & ekuitas': 'TOTAL LIABILITAS & EKUITAS',
  'total liabilitas dan ekuitas': 'TOTAL LIABILITAS & EKUITAS',
  'jumlah liabilitas & ekuitas': 'TOTAL LIABILITAS & EKUITAS',
  'jumlah liabilitas dan ekuitas': 'TOTAL LIABILITAS & EKUITAS',
  'modal ditempatkan dan disetor penuh': 'Modal dasar: Modal ditempatkan dan disetor penuh',
  'modal ditempatkan & disetor penuh': 'Modal dasar: Modal ditempatkan dan disetor penuh',
  'modal disetor': 'Modal dasar: Modal ditempatkan dan disetor penuh',
  'penghasilan komprehensif lain': 'Modal dasar: Penghasilan komprehensif lain',
  'belum ditentukan penggunaannya': 'Saldo laba: Belum ditentukan penggunaannya',
  'saldo laba belum ditentukan penggunaannya': 'Saldo laba: Belum ditentukan penggunaannya',
  'saldo laba': 'Saldo laba: Belum ditentukan penggunaannya',
  'cadangan kerugian piutang usaha pihak ketiga': 'Cadangan Kerugian Piutang Usaha-Pihak Ketiga',
  'cadangan kerugian piutang usaha': 'Cadangan Kerugian Piutang Usaha-Pihak Ketiga',
  'piutang lain-lain neto pihak-pihak berelasi': 'Piutang lain-lain - neto: Pihak-pihak berelasi',
  'piutang lain-lain pihak berelasi': 'Piutang lain-lain - neto: Pihak-pihak berelasi',
  'piutang lain lain pihak berelasi': 'Piutang lain-lain - neto: Pihak-pihak berelasi',
  'pendapatan diterima dimuka': 'Pendapatan diterima di muka jatuh tempo satu tahun',
  'pendapatan diterima di muka': 'Pendapatan diterima di muka jatuh tempo satu tahun',
  'pendapatan diterima di muka jangka pendek': 'Pendapatan diterima di muka jatuh tempo satu tahun',
  'utang lain lain jangka panjang': 'Utang lain-lain jangka panjang',
  'utang lain-lain jangka panjang': 'Utang lain-lain jangka panjang',
  'liabilitas imbalan kerja dapenbun': 'Liabilitas imbalan kerja karyawan: Dapenbun',
  'imbalan kerja dapenbun': 'Liabilitas imbalan kerja karyawan: Dapenbun',
  'liabilitas imbalan kerja program lainnya': 'Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai',
  'imbalan kerja program lainnya yang tidak didanai': 'Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai',
  'imbalan kerja program lainnya': 'Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai',
  'liabilitas pajak tangguhan': 'Liabilitas pajak tangguhan',
  'aset pajak tangguhan': 'Aset pajak tangguhan',
  // Harus lewat alias: tanpa ini contains-match akan memetakan ke "Aset tetap"
  'revaluasi aset tetap': 'Revaluasi asset tetap',
  'revaluasi asset tetap': 'Revaluasi asset tetap',
  'surplus revaluasi aset tetap': 'Revaluasi asset tetap',
  'selisih revaluasi aset tetap': 'Revaluasi asset tetap',
  'cadangan revaluasi aset tetap': 'Revaluasi asset tetap',
  'surplus revaluasi': 'Revaluasi asset tetap',

  // ARUS KAS
  'kas bersih dari operasi': 'Kas bersih yang diperoleh dari (digunakan untuk) operasi',
  'kas bersih operasi': 'Kas bersih yang diperoleh dari (digunakan untuk) operasi',
  'arus kas bersih dari aktivitas operasi': 'Kas bersih yang diperoleh dari (digunakan untuk) operasi',
  'kas bersih dari investasi': 'Kas bersih yang diperoleh dari (digunakan untuk) investasi',
  'kas bersih investasi': 'Kas bersih yang diperoleh dari (digunakan untuk) investasi',
  'arus kas bersih dari aktivitas investasi': 'Kas bersih yang diperoleh dari (digunakan untuk) investasi',
  'kas bersih dari pendanaan': 'Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan',
  'kas bersih pendanaan': 'Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan',
  'arus kas bersih dari aktivitas pendanaan': 'Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan',
  'kenaikan penurunan bersih kas': 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS',
  'kenaikan penurunan bersih kas dan setara kas': 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS',
  'kenaikan (penurunan) bersih kas': 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS',
  'dampak neto perubahan nilai tukar': 'DAMPAK NETO PERUBAHAN NILAI TUKAR ATAS KAS DAN SETARA KAS',
  'dampak perubahan nilai tukar': 'DAMPAK NETO PERUBAHAN NILAI TUKAR ATAS KAS DAN SETARA KAS',
  'kas dan setara kas awal': 'KAS DAN SETARA KAS AWAL TAHUN',
  'kas awal tahun': 'KAS DAN SETARA KAS AWAL TAHUN',
  'saldo kas awal': 'KAS DAN SETARA KAS AWAL TAHUN',
  'kas dan setara kas akhir': 'KAS DAN SETARA KAS AKHIR TAHUN',
  'kas akhir tahun': 'KAS DAN SETARA KAS AKHIR TAHUN',
  'saldo kas akhir': 'KAS DAN SETARA KAS AKHIR TAHUN',
  'penerimaan bunga': 'Penerimaan bunga',
  'penerimaan pendapatan bunga': 'Penerimaan bunga',
  'penerimaan bunga bank': 'Penerimaan bunga',
  'penerimaan bunga jasa giro': 'Penerimaan bunga',
  'penerimaan bunga deposito': 'Penerimaan bunga',
  'bunga yang diterima': 'Penerimaan bunga',
  'bunga diterima': 'Penerimaan bunga',
  'penerimaan jasa giro': 'Penerimaan bunga',
  'buyback saham perkumpulan lpp': 'Buyback saham Perkumpulan LPP',
  'buyback saham': 'Buyback saham Perkumpulan LPP',
  'buy back saham': 'Buyback saham Perkumpulan LPP',
  'buy back saham perkumpulan lpp': 'Buyback saham Perkumpulan LPP',
  'pembelian kembali saham': 'Buyback saham Perkumpulan LPP',
  'pembelian kembali saham perkumpulan lpp': 'Buyback saham Perkumpulan LPP',
};

// Section headers that should NOT receive values
const SECTION_HEADERS = new Set([
  'ASET LANCAR',
  'ASET TIDAK LANCAR',
  'LIABILITAS JANGKA PENDEK',
  'LIABILITAS JANGKA PANJANG',
  'ARUS KAS',
  'ARUS KAS DARI AKTIVITAS INVESTASI',
  'ARUS KAS DARI AKTIVITAS PENDANAAN',
  'EBITDA OPERASIONAL',
  'Ekuitas yang dapat diatribusikan kepada pemilik entitas induk',
]);

/**
 * Normalize a cell value to a comparable string.
 * @param {*} value
 * @returns {string}
 */
function cellStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Check if a cell value contains the "NAMA BULAN DARI FILE" marker.
 * @param {string} value
 * @returns {boolean}
 */
function isMonthMarker(value) {
  if (!value || typeof value !== 'string') return false;
  const upper = value.toUpperCase().replace(/"/g, '');
  return upper.includes('NAMA BULAN DARI FILE');
}

/**
 * Check if a cell value is the "a" reference (realisasi).
 * @param {*} value
 * @returns {boolean}
 */
function isRefA(value) {
  return cellStr(value).toLowerCase().trim() === 'a';
}

/**
 * Check if a cell value is the RKAP reference (can be "c" or "b").
 * @param {*} value
 * @returns {boolean}
 */
function isRefRkap(value) {
  const val = cellStr(value).toLowerCase().trim();
  return val === 'c' || val === 'b';
}

/**
 * Read the mapping structure from a single worksheet.
 *
 * @param {object} ws — XLSX worksheet object
 * @param {string} sheetName — Sheet name for logging
 * @returns {object|null} Mapping object or null if structure not found
 */
function readSheetMapping(ws, sheetName) {
  if (!ws || !ws['!ref']) {
    console.warn(`[TEMPLATE] Sheet: ${sheetName} — No data found`);
    return null;
  }

  const range = XLSX.utils.decode_range(ws['!ref']);

  // ──────────────────────────────────────────────────────
  // Step 1: Find "NAMA BULAN DARI FILE" cells
  // Scan first 15 rows to find month marker cells
  // ──────────────────────────────────────────────────────
  let monthHeaderRow = -1;
  const monthHeaderCols = []; // columns containing the marker

  for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell && isMonthMarker(cell.v)) {
        if (monthHeaderRow === -1) monthHeaderRow = r;
        if (r === monthHeaderRow) {
          monthHeaderCols.push(c);
        }
      }
    }
    // Stop scanning once we found the row
    if (monthHeaderRow !== -1 && r > monthHeaderRow) break;
  }

  if (monthHeaderRow === -1 || monthHeaderCols.length === 0) {
    console.warn(`[TEMPLATE] Sheet: ${sheetName} — "NAMA BULAN DARI FILE" not found`);
    return null;
  }

  console.log(
    `[TEMPLATE] Sheet: ${sheetName} — NAMA BULAN DARI FILE ditemukan di ` +
    monthHeaderCols.map(c => XLSX.utils.encode_cell({ r: monthHeaderRow, c })).join(', ')
  );

  // ──────────────────────────────────────────────────────
  // Step 2: Read "a" and "c" references from row below
  // Only consider columns at or adjacent to monthHeaderCols
  // ──────────────────────────────────────────────────────
  const refRow = monthHeaderRow + 1;
  let realisasiCol = -1;
  let rkapCol = -1;

  // Build a set of columns that are relevant (month marker cols + 1 col before)
  const relevantCols = new Set();
  for (const col of monthHeaderCols) {
    relevantCols.add(col);
    relevantCols.add(col - 1); // column just before might have 'a' too
  }

  // First pass: find 'a' and 'c' specifically under/at the NAMA BULAN DARI FILE columns
  for (const c of monthHeaderCols) {
    const cellRef = XLSX.utils.encode_cell({ r: refRow, c });
    const cell = ws[cellRef];
    if (cell) {
      if (isRefA(cell.v) && realisasiCol === -1) {
        realisasiCol = c;
      } else if (isRefRkap(cell.v) && rkapCol === -1) {
        rkapCol = c;
      }
    }
  }

  // Second pass: if not found directly under marker, check adjacent columns
  if (realisasiCol === -1 || rkapCol === -1) {
    for (let c = 0; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: refRow, c });
      const cell = ws[cellRef];
      if (cell) {
        if (isRefA(cell.v) && realisasiCol === -1 && relevantCols.has(c)) {
          realisasiCol = c;
        }
        if (isRefRkap(cell.v) && rkapCol === -1 && relevantCols.has(c)) {
          rkapCol = c;
        }
      }
    }
  }

  // Final fallback: if still not found, take the first 'a' and 'c' in the ref row
  // that are near the month header area
  if (realisasiCol === -1 || rkapCol === -1) {
    const minMonthCol = Math.min(...monthHeaderCols);
    const maxMonthCol = Math.max(...monthHeaderCols);

    for (let c = Math.max(0, minMonthCol - 2); c <= Math.min(range.e.c, maxMonthCol + 2); c++) {
      const cellRef = XLSX.utils.encode_cell({ r: refRow, c });
      const cell = ws[cellRef];
      if (cell) {
        if (isRefA(cell.v) && realisasiCol === -1) realisasiCol = c;
        if (isRefRkap(cell.v) && rkapCol === -1) rkapCol = c;
      }
    }
  }

  if (realisasiCol === -1 || rkapCol === -1) {
    console.warn(`[TEMPLATE] Sheet: ${sheetName} — Reference "a" or RKAP ref ("c"/"b") not found in row ${refRow + 1}`);
    return null;
  }

  console.log(
    `[TEMPLATE] Sheet: ${sheetName} — Reference row: ${refRow}, ` +
    `Realisasi col: ${realisasiCol} (${XLSX.utils.encode_col(realisasiCol)}), ` +
    `RKAP col: ${rkapCol} (${XLSX.utils.encode_col(rkapCol)})`
  );

  // ──────────────────────────────────────────────────────
  // Step 3: Identify uraian (account label) column
  // Look for "URAIAN" in header rows, or use first column with string labels
  // ──────────────────────────────────────────────────────
  let uraianCol = -1;

  // Search for cell containing "URAIAN" in first few rows
  for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 5); c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell && cellStr(cell.v).toUpperCase() === 'URAIAN') {
        uraianCol = c;
        break;
      }
    }
    if (uraianCol >= 0) break;
  }

  // Also check merged cells — URAIAN might be in a merged range
  if (uraianCol === -1 && ws['!merges']) {
    for (const merge of ws['!merges']) {
      const topLeft = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
      const cell = ws[topLeft];
      if (cell && cellStr(cell.v).toUpperCase() === 'URAIAN') {
        uraianCol = merge.s.c;
        break;
      }
    }
  }

  // Fallback: detect from data — find column that has the most string values after ref row
  if (uraianCol === -1) {
    const colStringCounts = {};
    for (let c = 0; c <= Math.min(range.e.c, 3); c++) {
      colStringCounts[c] = 0;
      for (let r = refRow + 1; r <= Math.min(range.e.r, refRow + 20); r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellRef];
        if (cell && cell.t === 's' && cellStr(cell.v).length > 3) {
          colStringCounts[c]++;
        }
      }
    }
    // Pick column with most strings
    let maxCount = 0;
    for (const [col, count] of Object.entries(colStringCounts)) {
      if (count > maxCount) {
        maxCount = count;
        uraianCol = parseInt(col);
      }
    }
  }

  if (uraianCol === -1) {
    console.warn(`[TEMPLATE] Sheet: ${sheetName} — Uraian column not found`);
    return null;
  }

  // ──────────────────────────────────────────────────────
  // Step 4: Identify data row range and extract uraian labels
  // ──────────────────────────────────────────────────────
  const dataStartRow = refRow + 1;
  let dataEndRow = dataStartRow;
  const uraianLabels = [];
  let consecutiveEmpty = 0;

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: uraianCol });
    const cell = ws[cellRef];
    const label = cell ? cellStr(cell.v) : '';

    // Stop scanning if we hit a second "URAIAN" header (section boundary)
    if (label.toUpperCase() === 'URAIAN') {
      console.log(`[TEMPLATE] Sheet: ${sheetName} — Section boundary at row ${r} ("URAIAN"), stopping scan`);
      break;
    }

    // Stop scanning if we hit a gap of 3+ empty rows (section separator)
    if (label.length < 2) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3 && uraianLabels.length > 0) {
        console.log(`[TEMPLATE] Sheet: ${sheetName} — Gap detected at row ${r}, stopping scan`);
        break;
      }
      continue;
    }

    consecutiveEmpty = 0;

    // Mark section headers
    const isSectionHeader = SECTION_HEADERS.has(label);
    uraianLabels.push({ row: r, label, isSectionHeader });
    dataEndRow = r;
  }

  console.log(
    `[TEMPLATE] Sheet: ${sheetName} — Uraian col: ${uraianCol} ` +
    `(${XLSX.utils.encode_col(uraianCol)}), ` +
    `Data rows: ${dataStartRow}-${dataEndRow} (${uraianLabels.length} labels)`
  );

  // ──────────────────────────────────────────────────────
  // Step 5: Read existing month names from the header row
  // These are the fixed month columns (JANUARI, FEBRUARI, etc.)
  // ──────────────────────────────────────────────────────
  const existingMonths = [];
  for (let c = 0; c <= range.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: monthHeaderRow, c });
    const cell = ws[cellRef];
    if (cell && typeof cell.v === 'string' && !isMonthMarker(cell.v)) {
      const monthName = cellStr(cell.v).toLowerCase();
      if (isValidMonth(monthName)) {
        existingMonths.push({ col: c, month: monthName });
      }
    }
  }

  return {
    sheetName,
    uraianCol,
    dataStartRow,
    dataEndRow,
    monthHeaderRow,
    monthHeaderCols,
    refRow,
    realisasiCol,
    rkapCol,
    uraianLabels,
    existingMonths,
  };
}

/**
 * Indonesian month names for validation.
 */
const VALID_MONTHS = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
];

/**
 * Check if a string is a valid Indonesian month name.
 * @param {string} name
 * @returns {boolean}
 */
function isValidMonth(name) {
  if (!name) return false;
  return VALID_MONTHS.includes(name.toLowerCase().trim());
}

/**
 * Normalize a month name to lowercase Indonesian.
 * @param {string} monthStr
 * @returns {string|null}
 */
export function normalizeMonth(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') return null;

  const cleaned = monthStr.trim().toLowerCase()
    .replace(/\s+/g, '')
    .replace(/['"]/g, '');

  // Direct match
  if (VALID_MONTHS.includes(cleaned)) return cleaned;

  // Alias matching
  const MONTH_ALIASES = {
    jan: 'januari', january: 'januari',
    feb: 'februari', peb: 'februari', february: 'februari',
    mar: 'maret', march: 'maret',
    apr: 'april', april: 'april',
    may: 'mei',
    jun: 'juni', june: 'juni',
    jul: 'juli', july: 'juli',
    agt: 'agustus', ags: 'agustus', agu: 'agustus', aug: 'agustus', august: 'agustus',
    sep: 'september', sept: 'september',
    okt: 'oktober', oct: 'oktober', october: 'oktober',
    nov: 'november', november: 'november',
    des: 'desember', dec: 'desember', dis: 'desember', december: 'desember',
  };

  if (MONTH_ALIASES[cleaned]) return MONTH_ALIASES[cleaned];

  // Partial match — check if the string starts with a known month
  for (const month of VALID_MONTHS) {
    if (cleaned.startsWith(month) || month.startsWith(cleaned)) {
      return month;
    }
  }

  return null;
}

/**
 * Read all sheet mappings from template.xlsx.
 * Results are cached after first read.
 *
 * @param {boolean} [forceReload=false] — Force re-read from disk
 * @returns {Object.<string, object>} Mapping keyed by table type (LR, ARUS_KAS, NERACA, PDPT)
 */
export function readAllMappings(forceReload = false) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
  }

  // Muat ulang otomatis bila template.xlsx diperbarui (baris ditambah/digeser),
  // agar posisi baris tidak memakai struktur lama sampai server di-restart.
  let templateMtime = null;
  try { templateMtime = fs.statSync(TEMPLATE_PATH).mtimeMs; } catch { /* ignore */ }

  if (cachedMappings && !forceReload && templateMtime === cachedTemplateMtime) {
    return cachedMappings;
  }

  console.log(`[TEMPLATE] Reading template structure from: ${TEMPLATE_PATH}`);

  const wb = XLSX.read(fs.readFileSync(TEMPLATE_PATH), { type: 'buffer' });

  const mappings = {};

  for (const [tableType, sheetName] of Object.entries(TABLE_TYPE_TO_SHEET)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.warn(`[TEMPLATE] Sheet "${sheetName}" not found in template`);
      continue;
    }

    const mapping = readSheetMapping(ws, sheetName);
    if (mapping) {
      mappings[tableType] = mapping;
    }
  }

  console.log(
    `[TEMPLATE] Mappings loaded for: ${Object.keys(mappings).join(', ')} ` +
    `(${Object.keys(mappings).length}/${Object.keys(TABLE_TYPE_TO_SHEET).length})`
  );

  cachedMappings = mappings;
  cachedTemplateMtime = templateMtime;
  return mappings;
}

/**
 * Get mapping for a specific table type.
 * @param {string} tableType — 'LR' | 'ARUS_KAS' | 'NERACA' | 'PDPT'
 * @returns {object|null}
 */
export function getMapping(tableType) {
  const mappings = readAllMappings();
  return mappings[tableType] || null;
}

/**
 * Get the list of canonical uraian labels for a given table type.
 * Used to inject into Gemini prompts so it knows the valid target labels.
 *
 * @param {string} tableType — 'LR' | 'ARUS_KAS' | 'NERACA' | 'PDPT'
 * @returns {string[]} Array of canonical uraian labels (excluding section headers)
 */
export function getCanonicalUraianList(tableType) {
  const mapping = getMapping(tableType);
  if (!mapping) return [];
  return mapping.uraianLabels
    .filter(l => !l.isSectionHeader)
    .map(l => l.label);
}

/**
 * Normalize a label for matching.
 * Removes punctuation, normalizes whitespace, lowercases.
 * @param {string} label
 * @returns {string}
 */
export function normLabel(label) {
  if (!label) return '';
  return label.toString().toLowerCase()
    .replace(/[()&.,-:;/\\]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deeper normalization: also replace "dan" with "&", strip common prefixes.
 * @param {string} label
 * @returns {string}
 */
function deepNormLabel(label) {
  if (!label) return '';
  let s = normLabel(label);
  // Remove common noise words that differ between PDF and template
  s = s.replace(/\bdan\b/g, ' ')
    .replace(/\bneto\b/g, ' ')
    .replace(/\byang\b/g, ' ')
    .replace(/\bdari\b/g, ' ')
    .replace(/\buntuk\b/g, ' ')
    .replace(/\batas\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * Check if a label is a section header that should NOT receive values.
 * @param {string} label
 * @returns {boolean}
 */
export function isSectionHeader(label) {
  return SECTION_HEADERS.has(label);
}

/**
 * Find the best matching template row for a given PDF label.
 * Uses a 6-step hybrid matching pipeline:
 *   1. Exact normalized match
 *   2. Alias match (known PDF→Template name variations)
 *   3. Hierarchical context match (strip prefix before ":")
 *   4. Contains match (bidirectional substring)
 *   5. Strong word overlap (≥ 70% of significant words)
 *   6. Deep normalization match
 *
 * @param {Array<{row: number, label: string, isSectionHeader?: boolean}>} uraianLabels — Template labels
 * @param {string} pdfLabel — Label from PDF extraction
 * @returns {{ row: number, label: string, confidence: string, isSectionHeader?: boolean }|null}
 */
export function findRowMatch(uraianLabels, pdfLabel) {
  const target = normLabel(pdfLabel);
  if (!target || target.length < 2) return null;

  // ─── Step 1: Exact normalized match ───────────────────────
  for (const entry of uraianLabels) {
    if (normLabel(entry.label) === target) {
      return { ...entry, confidence: 'exact' };
    }
  }

  // ─── Step 2: Alias match ──────────────────────────────────
  const aliasResult = GLOBAL_ALIASES[target];
  if (aliasResult) {
    for (const entry of uraianLabels) {
      if (entry.label === aliasResult) {
        return { ...entry, confidence: 'alias' };
      }
    }
  }

  // Also try alias lookup with the raw (non-normalized) label lowercased
  const rawLower = pdfLabel.trim().toLowerCase();
  const aliasResult2 = GLOBAL_ALIASES[rawLower];
  if (aliasResult2) {
    for (const entry of uraianLabels) {
      if (entry.label === aliasResult2) {
        return { ...entry, confidence: 'alias' };
      }
    }
  }

  // ─── Step 3: Hierarchical context match ───────────────────
  // Handle template labels like "Beban usaha: Beban pemasaran dan penjualan"
  // where PDF might just say "Beban pemasaran dan penjualan"
  for (const entry of uraianLabels) {
    const entryLabel = entry.label;
    // If template label has ":" — compare the part after ":"
    if (entryLabel.includes(':')) {
      const afterColon = normLabel(entryLabel.split(':').pop());
      if (afterColon.length >= 5 && afterColon === target) {
        return { ...entry, confidence: 'hierarchical' };
      }
    }
    // If PDF label has ":" — compare the part after ":"
    if (pdfLabel.includes(':')) {
      const pdfAfterColon = normLabel(pdfLabel.split(':').pop());
      if (pdfAfterColon.length >= 5 && normLabel(entryLabel) === pdfAfterColon) {
        return { ...entry, confidence: 'hierarchical' };
      }
    }
  }

  // ─── Step 4: Contains match (min 5 chars to avoid false positives) ───
  if (target.length >= 5) {
    for (const entry of uraianLabels) {
      const entryNorm = normLabel(entry.label);
      if (entryNorm.length >= 5) {
        if (entryNorm.includes(target) || target.includes(entryNorm)) {
          return { ...entry, confidence: 'contains' };
        }
      }
    }
  }

  // ─── Step 5: Strong word overlap (≥ 70% match) ────────────
  const targetWords = target.split(' ').filter(w => w.length >= 3);
  if (targetWords.length >= 2) {
    let bestMatch = null;
    let bestScore = 0;

    for (const entry of uraianLabels) {
      const entryWords = normLabel(entry.label).split(' ').filter(w => w.length >= 3);
      if (entryWords.length < 2) continue;

      const commonWords = targetWords.filter(w => entryWords.includes(w));
      const score = commonWords.length / Math.max(targetWords.length, entryWords.length);

      if (score >= 0.7 && score > bestScore) {
        bestScore = score;
        bestMatch = { ...entry, confidence: 'strong-similarity' };
      }
    }

    if (bestMatch) return bestMatch;
  }

  // ─── Step 6: Deep normalization match ─────────────────────
  const deepTarget = deepNormLabel(pdfLabel);
  if (deepTarget.length >= 5) {
    for (const entry of uraianLabels) {
      const deepEntry = deepNormLabel(entry.label);
      if (deepEntry.length >= 5 && deepEntry === deepTarget) {
        return { ...entry, confidence: 'deep-normalized' };
      }
    }

    // Deep contains
    for (const entry of uraianLabels) {
      const deepEntry = deepNormLabel(entry.label);
      if (deepEntry.length >= 5 && deepTarget.length >= 5) {
        if (deepEntry.includes(deepTarget) || deepTarget.includes(deepEntry)) {
          return { ...entry, confidence: 'deep-contains' };
        }
      }
    }
  }

  return null;
}

/**
 * Clear cached mappings (useful for testing or template updates).
 */
export function clearMappingCache() {
  cachedMappings = null;
}

/**
 * Test function: read and print all mappings.
 */
export function testReadAll() {
  clearMappingCache();
  const mappings = readAllMappings(true);

  for (const [tableType, mapping] of Object.entries(mappings)) {
    console.log(`\n--- ${tableType} (${mapping.sheetName}) ---`);
    console.log(`  Uraian col: ${mapping.uraianCol} (${XLSX.utils.encode_col(mapping.uraianCol)})`);
    console.log(`  Data rows: ${mapping.dataStartRow}-${mapping.dataEndRow}`);
    console.log(`  Month header row: ${mapping.monthHeaderRow}`);
    console.log(`  Month header cols: ${mapping.monthHeaderCols.join(', ')}`);
    console.log(`  Realisasi col: ${mapping.realisasiCol} (${XLSX.utils.encode_col(mapping.realisasiCol)})`);
    console.log(`  RKAP col: ${mapping.rkapCol} (${XLSX.utils.encode_col(mapping.rkapCol)})`);
    console.log(`  Labels (${mapping.uraianLabels.length}):`);
    for (const l of mapping.uraianLabels) {
      console.log(`    Row ${l.row}: "${l.label}"${l.isSectionHeader ? ' [SECTION HEADER]' : ''}`);
    }
    if (mapping.existingMonths.length > 0) {
      console.log(`  Existing months: ${mapping.existingMonths.map(m => `${m.month}(col ${m.col})`).join(', ')}`);
    }
  }
}
