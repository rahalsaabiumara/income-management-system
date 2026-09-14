/**
 * dateParser.js — Server-side copy of the shared date parser.
 *
 * Identical logic to src/lib/dateParser.js.
 * Kept as a separate file to avoid import path issues between
 * the frontend (Vite/ESM) and backend (Node ESM) environments.
 */

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

const ALIAS_MAP = new Map();
for (const def of BULAN_DEFS) {
  ALIAS_MAP.set(def.nama.toLowerCase(), def);
  for (const a of def.aliases) {
    ALIAS_MAP.set(a.toLowerCase(), def);
  }
}

function tokenise(filename) {
  return filename.split(/[^a-zA-Z0-9]+/).filter(Boolean);
}

function normaliseYear(y) {
  if (y < 100) return y <= 49 ? 2000 + y : 1900 + y;
  return y;
}

export function parseLMName(input) {
  if (!input || typeof input !== 'string') return null;

  const tokens = tokenise(input);
  let bulanDef = null;
  const yearCandidates = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!bulanDef && ALIAS_MAP.has(lower)) {
      bulanDef = ALIAS_MAP.get(lower);
      continue;
    }
    if (/^\d{2}$/.test(token) || /^\d{4}$/.test(token)) {
      yearCandidates.push(parseInt(token, 10));
    }
  }

  if (!bulanDef) return null;

  const fourDigit = yearCandidates.find((y) => y >= 1900 && y <= 2099);
  const twoDigit = yearCandidates.find((y) => y < 100);
  let tahun = null;

  if (fourDigit != null) tahun = fourDigit;
  else if (twoDigit != null) tahun = normaliseYear(twoDigit);

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

export function sortKey(parsed) {
  if (!parsed) return 0;
  return parsed.tahun * 100 + parsed.bulan;
}

export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}
