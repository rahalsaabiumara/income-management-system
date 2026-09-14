import { describe, it, expect } from 'vitest';
import { parseLMName, sortKey, extractDriveFileId } from './dateParser.js';

// ── parseLMName ──────────────────────────────────────────────────

describe('parseLMName', () => {
  // ── Real-world filenames from user ─────────────────────────────
  it.each([
    ['1. LM Januari 2022',   { bulan: 1,  bulanNama: 'Januari',   tahun: 2022, tanggal: 'Januari 22',   namaStandar: '1. LM Januari 2022' }],
    ['2. LM Februari 2022',  { bulan: 2,  bulanNama: 'Februari',  tahun: 2022, tanggal: 'Februari 22',  namaStandar: '2. LM Februari 2022' }],
    ['3. LM Maret 2022',     { bulan: 3,  bulanNama: 'Maret',     tahun: 2022, tanggal: 'Maret 22',     namaStandar: '3. LM Maret 2022' }],
    ['4. LM April 2022',     { bulan: 4,  bulanNama: 'April',     tahun: 2022, tanggal: 'April 22',     namaStandar: '4. LM April 2022' }],
    ['5. LM Mei 2022',       { bulan: 5,  bulanNama: 'Mei',       tahun: 2022, tanggal: 'Mei 22',       namaStandar: '5. LM Mei 2022' }],
    ['6. LM Juni 2022',      { bulan: 6,  bulanNama: 'Juni',      tahun: 2022, tanggal: 'Juni 22',      namaStandar: '6. LM Juni 2022' }],
    ['9. LM September 2023', { bulan: 9,  bulanNama: 'September', tahun: 2023, tanggal: 'September 23', namaStandar: '9. LM September 2023' }],
    ['10. LM Oktober 2023',  { bulan: 10, bulanNama: 'Oktober',   tahun: 2023, tanggal: 'Oktober 23',   namaStandar: '10. LM Oktober 2023' }],
  ])('parses real filename "%s"', (input, expected) => {
    expect(parseLMName(input)).toEqual(expected);
  });

  // ── Alias variants ─────────────────────────────────────────────
  it.each([
    ['LM_agt_26.pdf',      { bulan: 8,  bulanNama: 'Agustus',  tahun: 2026, tanggal: 'Agustus 26',  namaStandar: '8. LM Agustus 2026' }],
    ['LM Peb 2024.pdf',    { bulan: 2,  bulanNama: 'Februari', tahun: 2024, tanggal: 'Februari 24', namaStandar: '2. LM Februari 2024' }],
    ['LM_sept_2025.pdf',   { bulan: 9,  bulanNama: 'September',tahun: 2025, tanggal: 'September 25',namaStandar: '9. LM September 2025' }],
    ['LM des 23',          { bulan: 12, bulanNama: 'Desember', tahun: 2023, tanggal: 'Desember 23', namaStandar: '12. LM Desember 2023' }],
    ['LM-okt-2024',        { bulan: 10, bulanNama: 'Oktober',  tahun: 2024, tanggal: 'Oktober 24',  namaStandar: '10. LM Oktober 2024' }],
    ['LM may 26',          { bulan: 5,  bulanNama: 'Mei',      tahun: 2026, tanggal: 'Mei 26',      namaStandar: '5. LM Mei 2026' }],
    ['LM agu 2022',        { bulan: 8,  bulanNama: 'Agustus',  tahun: 2022, tanggal: 'Agustus 22',  namaStandar: '8. LM Agustus 2022' }],
    ['LM aug 2022',        { bulan: 8,  bulanNama: 'Agustus',  tahun: 2022, tanggal: 'Agustus 22',  namaStandar: '8. LM Agustus 2022' }],
    ['LM dis 2022',        { bulan: 12, bulanNama: 'Desember', tahun: 2022, tanggal: 'Desember 22', namaStandar: '12. LM Desember 2022' }],
    ['LM dec 2022',        { bulan: 12, bulanNama: 'Desember', tahun: 2022, tanggal: 'Desember 22', namaStandar: '12. LM Desember 2022' }],
  ])('handles alias "%s"', (input, expected) => {
    expect(parseLMName(input)).toEqual(expected);
  });

  // ── Case insensitivity ─────────────────────────────────────────
  it('is case-insensitive', () => {
    expect(parseLMName('LM AGUSTUS 2026')).toEqual(
      expect.objectContaining({ bulan: 8, bulanNama: 'Agustus', tahun: 2026 })
    );
    expect(parseLMName('lm januari 2022')).toEqual(
      expect.objectContaining({ bulan: 1, bulanNama: 'Januari', tahun: 2022 })
    );
  });

  // ── 4-digit year preference over 2-digit ───────────────────────
  it('prefers 4-digit year when both 2 and 4 digit appear', () => {
    // "10. LM Oktober 2023" → token "10", "LM", "Oktober", "2023"
    // 10 is 2 digits but 2023 is 4 digits → pick 2023
    const result = parseLMName('10. LM Oktober 2023');
    expect(result.tahun).toBe(2023);
  });

  // ── No month found → null ──────────────────────────────────────
  it.each([
    'Notulen Rapat.pdf',
    'Agenda 2026.pdf',
    'random text without month',
    '',
  ])('returns null for "%s"', (input) => {
    expect(parseLMName(input)).toBeNull();
  });

  // ── Edge: null / undefined / non-string ─────────────────────────
  it.each([null, undefined, 42, {}])('returns null for %s', (input) => {
    expect(parseLMName(input)).toBeNull();
  });

  // ── Month found but no year → null ────────────────────────────
  it('returns null when month found but no year', () => {
    expect(parseLMName('LM Januari')).toBeNull();
  });

  // ── CSV "Nama Standar" column must be IGNORED ──────────────────
  it('always regenerates standard name from raw input, ignoring external Nama Standar', () => {
    // Simulating: CSV row has Nama="2. LM Februari 2022"
    // but Nama Standar column (which we IGNORE) says "LPPAN LM Tahun 2022 Audited"
    const rawNama = '2. LM Februari 2022';
    const csvNamaStandar = 'LPPAN LM Tahun 2022 Audited'; // this is WRONG data

    const parsed = parseLMName(rawNama);
    expect(parsed.namaStandar).toBe('2. LM Februari 2022');
    expect(parsed.namaStandar).not.toBe(csvNamaStandar);
  });
});

// ── sortKey ──────────────────────────────────────────────────────

describe('sortKey', () => {
  it('produces correct chronological order', () => {
    const jan22 = parseLMName('1. LM Januari 2022');
    const feb22 = parseLMName('2. LM Februari 2022');
    const sep23 = parseLMName('9. LM September 2023');

    expect(sortKey(jan22)).toBeLessThan(sortKey(feb22));
    expect(sortKey(feb22)).toBeLessThan(sortKey(sep23));
  });

  it('returns 0 for null', () => {
    expect(sortKey(null)).toBe(0);
  });
});

// ── extractDriveFileId ───────────────────────────────────────────

describe('extractDriveFileId', () => {
  it('extracts from /file/d/ URL', () => {
    expect(extractDriveFileId(
      'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view?usp=sharing'
    )).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('extracts from open?id= URL', () => {
    expect(extractDriveFileId(
      'https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ'
    )).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('extracts from docs.google.com URL', () => {
    expect(extractDriveFileId(
      'https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit'
    )).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('returns null for invalid input', () => {
    expect(extractDriveFileId(null)).toBeNull();
    expect(extractDriveFileId('')).toBeNull();
    expect(extractDriveFileId('not a url')).toBeNull();
  });
});
