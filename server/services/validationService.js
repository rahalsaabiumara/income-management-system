/**
 * validationService.js — Sanity checks for extracted financial data.
 *
 * Validates extracted tables using the unified format:
 *   {
 *     tableType, rows: [{
 *       rawUraian, canonicalUraian,
 *       realisasiA, rkapC,
 *       // Legacy compat: label, realisasiBulan, rkapBulan
 *     }]
 *   }
 *
 * Checks:
 *   - Row count is reasonable
 *   - Labels are not empty
 *   - Values are valid numbers or null
 *   - Required fields are present
 *   - Neraca: TOTAL ASET == TOTAL LIABILITAS & EKUITAS
 *   - LR: Laba Kotor = Penjualan - HPP
 *   - Arus Kas: Net change = Operating + Investing + Financing
 *
 * Label matching uses the canonical uraian names from the updated template.xlsx.
 */

/**
 * Normalize a label for fuzzy matching.
 */
function norm(label) {
  if (!label) return '';
  return label.toLowerCase()
    .replace(/[()&.,-:;]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a row's value by label.
 * Supports both new format (canonicalUraian/realisasiA/rkapC)
 * and legacy format (label/realisasiBulan/rkapBulan).
 *
 * @param {Array} rows
 * @param {string} searchLabel
 * @param {string} [field='realisasiA'] — 'realisasiA' or 'rkapC'
 * @returns {number|null}
 */
function findValue(rows, searchLabel, field = 'realisasiA') {
  const target = norm(searchLabel);

  // Map field names for backward compatibility
  const fieldAlt = field === 'realisasiA' ? 'realisasiBulan' : (field === 'rkapC' ? 'rkapBulan' : field);

  for (const row of rows) {
    // Try canonical uraian first, then raw uraian, then label
    const rowLabel = row.canonicalUraian || row.rawUraian || row.label || '';
    const rowNorm = norm(rowLabel);
    if (rowNorm.includes(target) || target.includes(rowNorm)) {
      return row[field] ?? row[fieldAlt] ?? null;
    }
  }
  return null;
}

function approxEqual(a, b, tolerancePct = 0.02) {
  if (a === 0 && b === 0) return true;
  if (a == null || b == null) return false;
  const diff = Math.abs(a - b);
  const base = Math.max(Math.abs(a), Math.abs(b));
  return diff / base <= tolerancePct;
}

/**
 * Basic validation: check row count, label presence, value types.
 */
function validateBasic(tableType, rows) {
  const warnings = [];

  if (!rows || rows.length === 0) {
    return { valid: false, warnings: [`Tidak ada data ${tableType} yang diekstrak`] };
  }

  if (rows.length < 3) {
    warnings.push(`Hanya ${rows.length} baris ditemukan — kemungkinan data tidak lengkap`);
  }

  // Check for empty labels
  const emptyLabels = rows.filter(r => {
    const label = r.canonicalUraian || r.rawUraian || r.label || '';
    return label.trim().length === 0;
  });
  if (emptyLabels.length > 0) {
    warnings.push(`${emptyLabels.length} baris memiliki label kosong`);
  }

  // Check for rows where both values are null
  const nullRows = rows.filter(r => {
    const realisasi = r.realisasiA ?? r.realisasiBulan ?? null;
    const rkap = r.rkapC ?? r.rkapBulan ?? null;
    return realisasi == null && rkap == null;
  });
  if (nullRows.length > rows.length * 0.5) {
    warnings.push(`${nullRows.length}/${rows.length} baris tidak memiliki nilai — kemungkinan tabel tidak terbaca`);
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Validate LR (Laba Rugi).
 * Uses canonical names from updated template.
 */
export function validateLR(data) {
  const rows = data?.rows || data;
  const basic = validateBasic('LR', rows);

  // Subtotal check: Laba Kotor = Penjualan - HPP
  const penjualan = findValue(rows, 'penjualan bersih');
  const hpp = findValue(rows, 'beban pokok penjualan');
  const labaKotor = findValue(rows, 'laba rugi kotor');

  if (penjualan != null && hpp != null && labaKotor != null) {
    const expected = penjualan + hpp; // HPP is typically negative
    if (!approxEqual(expected, labaKotor) && !approxEqual(penjualan - Math.abs(hpp), labaKotor)) {
      basic.warnings.push(
        `Laba Kotor (${labaKotor.toLocaleString()}) tidak konsisten dengan Penjualan - HPP`
      );
    }
  }

  basic.valid = basic.warnings.length === 0;
  return basic;
}

/**
 * Validate NERACA (Balance Sheet).
 * Uses canonical names from updated template:
 *   TOTAL ASET, TOTAL LIABILITAS, TOTAL EKUITAS, TOTAL LIABILITAS & EKUITAS
 */
export function validateNeraca(data) {
  const rows = data?.rows || data;
  const basic = validateBasic('NERACA', rows);

  // TOTAL ASET == TOTAL LIABILITAS & EKUITAS
  const totalAset = findValue(rows, 'total aset');
  const totalLiabilitas = findValue(rows, 'total liabilitas');
  const totalEkuitas = findValue(rows, 'total ekuitas');
  const totalLiabEkuitas = findValue(rows, 'total liabilitas ekuitas');

  if (totalAset != null && totalLiabEkuitas != null) {
    if (!approxEqual(totalAset, totalLiabEkuitas)) {
      basic.warnings.push(
        `TOTAL ASET (${totalAset.toLocaleString()}) != TOTAL LIABILITAS & EKUITAS (${totalLiabEkuitas.toLocaleString()})`
      );
    }
  } else if (totalAset != null && totalLiabilitas != null && totalEkuitas != null) {
    const sum = totalLiabilitas + totalEkuitas;
    if (!approxEqual(totalAset, sum)) {
      basic.warnings.push(
        `TOTAL ASET (${totalAset.toLocaleString()}) != TOTAL LIABILITAS + TOTAL EKUITAS (${sum.toLocaleString()})`
      );
    }
  }

  basic.valid = basic.warnings.length === 0;
  return basic;
}

/**
 * Validate ARUS_KAS (Cash Flow).
 * Uses canonical names from updated template.
 */
export function validateArusKas(data) {
  const rows = data?.rows || data;
  const basic = validateBasic('ARUS_KAS', rows);

  const kasOperasi = findValue(rows, 'kas bersih yang diperoleh dari digunakan untuk operasi');
  const kasInvestasi = findValue(rows, 'kas bersih yang diperoleh dari digunakan untuk investasi');
  const kasPendanaan = findValue(rows, 'kas bersih yang diperoleh dari digunakan untuk pendanaan');
  const netChange = findValue(rows, 'kenaikan penurunan bersih kas');

  if (kasOperasi != null && kasInvestasi != null && kasPendanaan != null && netChange != null) {
    const sum = kasOperasi + kasInvestasi + kasPendanaan;
    if (!approxEqual(sum, netChange)) {
      basic.warnings.push(
        `KENAIKAN KAS (${netChange.toLocaleString()}) != Operasi + Investasi + Pendanaan (${sum.toLocaleString()})`
      );
    }
  }

  basic.valid = basic.warnings.length === 0;
  return basic;
}

/**
 * Validate PDPT (Revenue).
 */
export function validatePDPT(data) {
  const rows = data?.rows || data;
  return validateBasic('PDPT', rows);
}

/**
 * Validate all extracted tables.
 * @param {Object.<string, {tableType: string, rows: Array}>} tables
 * @returns {Object.<string, {valid: boolean, warnings: string[]}>}
 */
export function validateAllTables(tables) {
  const results = {};

  if (tables.PDPT) results.PDPT = validatePDPT(tables.PDPT);
  if (tables.LR) results.LR = validateLR(tables.LR);
  if (tables.NERACA) results.NERACA = validateNeraca(tables.NERACA);
  if (tables.ARUS_KAS) results.ARUS_KAS = validateArusKas(tables.ARUS_KAS);

  const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);
  console.log(`[Validation] ${Object.keys(results).length} table(s) checked, ${totalWarnings} warning(s)`);

  return results;
}
