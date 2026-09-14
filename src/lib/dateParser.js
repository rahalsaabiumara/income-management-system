/**
 * dateParser.js
 * ─────────────
 * Parses Laporan Manajemen (LM) filenames to extract month & year,
 * then produces a standardised name and display date.
 *
 * The same module is used on both the frontend (CSV validation) and
 * the backend (Drive sync).  Keep it dependency-free.
 */

// ── Month definitions ────────────────────────────────────────────
const BULAN_DEFS = [
  { nomor: 1,  nama: 'Januari',   aliases: ['jan'] },
  { nomor: 2,  nama: 'Februari',  aliases: ['feb', 'peb'] },
  { nomor: 3,  nama: 'Maret',     aliases: ['mar'] },
  { nomor: 4,  nama: 'April',     aliases: ['apr'] },
  { nomor: 5,  nama: 'Mei',       aliases: ['mei', 'may'] },
  { nomor: 6,  nama: 'Juni',      aliases: ['jun'] },
  { nomor: 7,  nama: 'Juli',      aliases: ['jul'] },
  { nomor: 8,  nama: 'Agustus',   aliases: ['agt', 'ags', 'agu', 'aug'] },
  { nomor: 9,  nama: 'September', aliases: ['sep', 'sept'] },
  { nomor: 10, nama: 'Oktober',   aliases: ['okt', 'oct'] },
  { nomor: 11, nama: 'November',  aliases: ['nov'] },
  { nomor: 12, nama: 'Desember',  aliases: ['des', 'dec', 'dis'] },
];

// Build a fast lookup map:  lowercase-alias → { nomor, nama }
const ALIAS_MAP = new Map();
for (const def of BULAN_DEFS) {
  // Full name is also a valid alias
  ALIAS_MAP.set(def.nama.toLowerCase(), def);
  for (const a of def.aliases) {
    ALIAS_MAP.set(a.toLowerCase(), def);
  }
}

/**
 * Tokenise a filename – split on every non-alphanumeric character.
 * E.g. "LM_Agt-2026 (v2).pdf" → ["LM", "Agt", "2026", "v2", "pdf"]
 */
function tokenise(filename) {
  return filename.split(/[^a-zA-Z0-9]+/).filter(Boolean);
}

/**
 * Normalise a 2-digit year to 4 digits.
 *   00-49 → 2000-2049
 *   50-99 → 1950-1999
 */
function normaliseYear(y) {
  if (y < 100) {
    return y <= 49 ? 2000 + y : 1900 + y;
  }
  return y;
}

/**
 * Parse a filename (or the "Nama" column value) and extract month + year.
 *
 * @param {string} input – The raw filename / nama value.
 * @returns {{ bulan: number, bulanNama: string, tahun: number,
 *             tanggal: string, namaStandar: string } | null}
 *   Returns null when no month can be detected.
 */
export function parseLMName(input) {
  if (!input || typeof input !== 'string') return null;

  const tokens = tokenise(input);

  let bulanDef = null;
  let tahun = null;

  // Candidate year tokens (2-digit or 4-digit numbers)
  const yearCandidates = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Try matching month alias
    if (!bulanDef && ALIAS_MAP.has(lower)) {
      bulanDef = ALIAS_MAP.get(lower);
      continue;
    }

    // Try matching year (pure digits, 2 or 4 chars)
    if (/^\d{2}$/.test(token) || /^\d{4}$/.test(token)) {
      yearCandidates.push(parseInt(token, 10));
    }
  }

  // No month found → return null
  if (!bulanDef) return null;

  // Pick the best year candidate
  // Prefer 4-digit years; otherwise use the first 2-digit one
  const fourDigit = yearCandidates.find((y) => y >= 1900 && y <= 2099);
  const twoDigit = yearCandidates.find((y) => y < 100);

  if (fourDigit != null) {
    tahun = fourDigit;
  } else if (twoDigit != null) {
    tahun = normaliseYear(twoDigit);
  }

  // If we found a month but no year, still return null
  // (we can't build a valid standard name without year)
  if (tahun == null) return null;

  const tahun2digit = String(tahun).slice(-2);

  return {
    bulan: bulanDef.nomor,
    bulanNama: bulanDef.nama,
    tahun,
    tanggal: `${bulanDef.nama} ${tahun2digit}`,
    namaStandar: `${bulanDef.nomor}. LM ${bulanDef.nama} ${tahun}`,
  };
}

/**
 * Sort key for chronological ordering.
 * Returns a numeric value  YYYYMM  that sorts correctly.
 */
export function sortKey(parsed) {
  if (!parsed) return 0;
  return parsed.tahun * 100 + parsed.bulan;
}

/**
 * Extract a Google Drive file ID from a Drive URL.
 * Supports several common URL formats:
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - https://drive.google.com/open?id=FILE_ID
 *   - https://docs.google.com/…/d/FILE_ID/…
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;

  // Pattern 1: /d/FILE_ID/
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];

  // Pattern 2: ?id=FILE_ID or &id=FILE_ID
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];

  return null;
}

/**
 * All month definitions, exported for use in tests or UI.
 */
export { BULAN_DEFS };
