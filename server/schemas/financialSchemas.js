/**
 * financialSchemas.js — Gemini prompts & table metadata for TABEL LM extraction.
 *
 * Each schema defines:
 *   - sheetName: target sheet in template.xlsx
 *   - geminiPrompt: targeted prompt for Gemini Vision API
 *   - expectedRows: expected uraian labels (for reference/documentation)
 *
 * Column mapping (uraianCol, targetCols, dataStartRow, dataEndRow) is
 * read dynamically from template.xlsx by templateMapper.js.
 *
 * IMPORTANT: Gemini prompts instruct the model to return STRUCTURED data
 * with each value associated to its URAIAN, REALISASI (A), and RKAP (C).
 * Gemini must NOT return values as unassociated lists.
 *
 * Gemini output format per table:
 *   {
 *     tableType, bulan,
 *     rows: [{
 *       rawUraian, canonicalUraian,
 *       realisasiA, rkapC,
 *       confidence, matchType, status
 *     }]
 *   }
 */

// ── Helper: Build the canonical uraian instruction block ────────
// This is injected into each Gemini prompt so the model knows
// exactly which uraian labels are valid mapping targets.
function buildCanonicalBlock(uraianList) {
  return uraianList.map((u, i) => `  ${i + 1}. ${u}`).join('\n');
}

// ── PDPT (Tabel Pendapatan) ──────────────────────────────────
export const PDPT_SCHEMA = {
  sheetName: 'PDPT',

  expectedRows: [
    'Pelatihan',
    'Konsultansi',
    'Asesmen dan Sertifikasi',
    'Digital Bisnis',
    'Hotel MICE',
    'TOTAL',
  ],

  geminiPrompt: `Anda adalah sistem ekstraksi dan pemetaan tabel laporan keuangan.

Anda melihat halaman PDF yang berisi "Tabel 1. Pendapatan" atau "Tabel 2. Pendapatan Usaha PT LPP Agro Nusantara".

TUGAS UTAMA:
1. Identifikasi nama BULAN dari kolom realisasi bulan paling kanan yang terisi (misalnya "Juli", "Agustus").
2. Baca tabel dan identifikasi setiap URAIAN beserta value-nya.
3. Untuk setiap baris, tentukan:
   - Value dari kolom REALISASI (A) = realisasiA
   - Value dari kolom RKAP (C) = rkapC

CANONICAL URAIAN YANG TERSEDIA PADA TEMPLATE:
  1. Pelatihan
  2. Konsultansi
  3. Asesmen dan Sertifikasi
  4. Digital Bisnis
  5. Hotel MICE
  6. TOTAL

ATURAN MAPPING:
- Setiap value HARUS dihubungkan dengan URAIAN yang benar pada baris yang sama.
- Jangan mengembalikan angka sebagai daftar terpisah tanpa URAIAN.
- Jangan memetakan berdasarkan urutan baris saja.
- Jangan menukar value REALISASI dan RKAP.
- Value dari kolom A/Realisasi harus dipetakan ke realisasiA.
- Value dari kolom C/RKAP harus dipetakan ke rkapC.
- Gunakan canonical URAIAN yang tersedia di atas sebagai target mapping.
- Jika uraian pada PDF berbeda penamaannya tetapi memiliki makna bisnis yang sama, petakan ke canonical URAIAN yang paling tepat.
  Contoh: "HOTEL & MICE" → "Hotel MICE", "Assessment & Sertifikasi" → "Asesmen dan Sertifikasi", "Jumlah Pendapatan Usaha" → "TOTAL"
- Jangan membuat nama uraian baru yang tidak ada pada daftar canonical.
- Jika confidence tidak cukup, tandai status sebagai "UNMATCHED".
- Angka harus PERSIS seperti yang tercetak, jangan dibulatkan.
- Angka negatif (tanda kurung) = negatif.
- Jika cell kosong atau tidak terbaca, gunakan null.
- "bulan" harus berisi nama bulan Indonesia (contoh: "Juli", "Agustus").

Return JSON object PERSIS format ini:
{
  "tableType": "PDPT",
  "bulan": "Juli",
  "rows": [
    {
      "rawUraian": "Pelatihan",
      "canonicalUraian": "Pelatihan",
      "realisasiA": 4024312588,
      "rkapC": 6480000000,
      "confidence": "high",
      "matchType": "exact",
      "status": "MATCHED"
    }
  ]
}

HANYA return JSON, tanpa penjelasan atau markdown.`,
};

// ── LR (Lampiran 1 — Laba Rugi) ────────────────────────────────
export const LR_SCHEMA = {
  sheetName: 'LR',

  expectedRows: [
    'Penjualan bersih',
    'Beban pokok penjualan',
    'Laba (Rugi) kotor',
    'Beban usaha: Beban pemasaran dan penjualan',
    'Beban usaha: Beban umum dan administrasi',
    'Jumlah beban usaha',
    'Laba (Rugi) usaha',
    'Pendapatan operasi lainnya',
    'Beban operasi lainnya',
    'Laba (Rugi) operasi',
    'Pendapatan keuangan',
    'Beban keuangan',
    'Laba (Rugi) sebelum beban pajak penghasilan',
    'Beban (manfaat) pajak: Pajak kini',
    'Beban (manfaat) pajak: Pajak tangguhan',
    'Jumlah beban (manfaat) pajak',
    'Laba (Rugi) tahun berjalan',
    'Pendapatan komprehensif lain',
    'Laba (Rugi) komprehensif tahun berjalan',
  ],

  geminiPrompt: `Anda adalah sistem ekstraksi dan pemetaan tabel laporan keuangan.

Anda melihat halaman PDF "Lampiran 1" yang berisi Laporan Laba Rugi.

TUGAS UTAMA:
1. Identifikasi nama BULAN dari kolom realisasi bulan paling kanan yang terisi.
2. Baca tabel dan identifikasi setiap URAIAN beserta value-nya.
3. Untuk setiap baris, tentukan:
   - Value dari kolom REALISASI (A) = realisasiA
   - Value dari kolom RKAP (C) = rkapC
4. JANGAN ekstrak kolom lain (Januari, Februari, S.D., RKO, Real tahun lalu, dll).

CANONICAL URAIAN YANG TERSEDIA PADA TEMPLATE:
  1. Penjualan bersih
  2. Beban pokok penjualan
  3. Laba (Rugi) kotor
  4. Beban usaha: Beban pemasaran dan penjualan
  5. Beban usaha: Beban umum dan administrasi
  6. Jumlah beban usaha
  7. Laba (Rugi) usaha
  8. Pendapatan operasi lainnya
  9. Beban operasi lainnya
  10. Laba (Rugi) operasi
  11. Pendapatan keuangan
  12. Beban keuangan
  13. Laba (Rugi) sebelum beban pajak penghasilan
  14. Beban (manfaat) pajak: Pajak kini
  15. Beban (manfaat) pajak: Pajak tangguhan
  16. Jumlah beban (manfaat) pajak
  17. Laba (Rugi) tahun berjalan
  18. Pendapatan komprehensif lain
  19. Laba (Rugi) komprehensif tahun berjalan

ATURAN MAPPING:
- Setiap value HARUS dihubungkan dengan URAIAN yang benar pada baris yang sama.
- Jangan mengembalikan angka sebagai daftar terpisah tanpa URAIAN.
- Jangan memetakan berdasarkan urutan baris saja.
- Jangan menukar value REALISASI dan RKAP.
- Value dari kolom A/Realisasi harus dipetakan ke realisasiA.
- Value dari kolom C/RKAP harus dipetakan ke rkapC.
- Gunakan canonical URAIAN yang tersedia di atas sebagai target mapping.
- Jika PDF menyebut "Beban pemasaran dan penjualan" tanpa prefix "Beban usaha:", petakan ke "Beban usaha: Beban pemasaran dan penjualan".
- Jika PDF menyebut "Pajak kini" tanpa prefix "Beban (manfaat) pajak:", petakan ke "Beban (manfaat) pajak: Pajak kini".
- Jika PDF menyebut "Laba kotor" atau "Rugi kotor", petakan ke "Laba (Rugi) kotor".
- Pertimbangkan variasi penamaan, alias, singkatan, dan tanda kurung.
- Jika confidence tidak cukup, tandai status sebagai "UNMATCHED".
- Jangan membuat nama uraian baru yang tidak ada pada daftar canonical.
- Angka harus PERSIS seperti yang tercetak, jangan dibulatkan.
- Angka negatif (tanda kurung) = negatif. Contoh: (1.234) = -1234.
- Jika cell kosong atau "-", gunakan null.
- "bulan" harus berisi nama bulan Indonesia.
- Pastikan Laba (Rugi) tahun berjalan dan Laba (Rugi) komprehensif tahun berjalan selalu diekstrak jika tersedia.
- ABAIKAN bagian "EBITDA" jika ada pada halaman yang sama.

Return JSON object PERSIS format ini:
{
  "tableType": "LR",
  "bulan": "Juli",
  "rows": [
    {
      "rawUraian": "Penjualan bersih",
      "canonicalUraian": "Penjualan bersih",
      "realisasiA": 1234567890,
      "rkapC": 9876543210,
      "confidence": "high",
      "matchType": "exact",
      "status": "MATCHED"
    }
  ]
}

HANYA return JSON, tanpa penjelasan atau markdown.`,
};

// ── NERACA (Lampiran 2 — Posisi Keuangan) ──────────────────────
export const NERACA_SCHEMA = {
  sheetName: 'NERACA',

  expectedRows: [
    'Kas dan setara kas',
    'Piutang usaha - neto: Pihak ketiga',
    'Piutang usaha - neto: Pihak-pihak berelasi',
    'Cadangan Kerugian Piutang Usaha-Pihak Ketiga',
    'Piutang lain-lain - neto: Pihak ketiga',
    'Piutang lain-lain - neto: Pihak-pihak berelasi',
    'Persediaan',
    'Pajak dibayar di muka',
    'Aset lancar lainnya',
    'Biaya dibayar dimuka dan uang muka',
    'TOTAL ASET LANCAR',
    'Aset pajak tangguhan',
    'Aset tetap',
    'Aset tidak lancar lainnya',
    'TOTAL ASET TIDAK LANCAR',
    'TOTAL ASET',
    'Utang usaha: Pihak ketiga',
    'Utang lain-lain: Pihak ketiga',
    'Utang pajak',
    'Pendapatan diterima di muka jatuh tempo satu tahun',
    'Biaya yang masih harus dibayar',
    'TOTAL LIABILITAS JANGKA PENDEK',
    'Utang lain-lain jangka panjang',
    'Liabilitas imbalan kerja karyawan: Dapenbun',
    'Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai',
    'Liabilitas pajak tangguhan',
    'TOTAL LIABILITAS JANGKA PANJANG',
    'TOTAL LIABILITAS',
    'Modal dasar: Modal ditempatkan dan disetor penuh',
    'Modal dasar: Penghasilan komprehensif lain',
    'Saldo laba: Belum ditentukan penggunaannya',
    'TOTAL EKUITAS',
    'TOTAL LIABILITAS & EKUITAS',
  ],

  geminiPrompt: `Anda adalah sistem ekstraksi dan pemetaan tabel laporan keuangan.

Anda melihat halaman PDF "Lampiran 2" yang berisi Laporan Posisi Keuangan (Neraca).

TUGAS UTAMA:
1. Identifikasi nama BULAN dari kolom realisasi bulan paling kanan/terbaru yang terisi.
2. Baca tabel dan identifikasi setiap URAIAN beserta value-nya.
3. Untuk setiap baris, tentukan:
   - Value dari kolom REALISASI (A) = realisasiA
   - Value dari kolom RKAP (B) = rkapB
4. JANGAN ekstrak kolom lain (Real tahun lalu, realisasi bulan sebelumnya, dll).

CANONICAL URAIAN YANG TERSEDIA PADA TEMPLATE:
  1. Kas dan setara kas
  2. Piutang usaha - neto: Pihak ketiga
  3. Piutang usaha - neto: Pihak-pihak berelasi
  4. Cadangan Kerugian Piutang Usaha-Pihak Ketiga
  5. Piutang lain-lain - neto: Pihak ketiga
  6. Piutang lain-lain - neto: Pihak-pihak berelasi
  7. Persediaan
  8. Pajak dibayar di muka
  9. Aset lancar lainnya
  10. Biaya dibayar dimuka dan uang muka
  11. TOTAL ASET LANCAR
  12. Aset pajak tangguhan
  13. Aset tetap
  14. Aset tidak lancar lainnya
  15. TOTAL ASET TIDAK LANCAR
  16. TOTAL ASET
  17. Utang usaha: Pihak ketiga
  18. Utang lain-lain: Pihak ketiga
  19. Utang pajak
  20. Pendapatan diterima di muka jatuh tempo satu tahun
  21. Biaya yang masih harus dibayar
  22. TOTAL LIABILITAS JANGKA PENDEK
  23. Utang lain-lain jangka panjang
  24. Liabilitas imbalan kerja karyawan: Dapenbun
  25. Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai
  26. Liabilitas pajak tangguhan
  27. TOTAL LIABILITAS JANGKA PANJANG
  28. TOTAL LIABILITAS
  29. Modal dasar: Modal ditempatkan dan disetor penuh
  30. Modal dasar: Penghasilan komprehensif lain
  31. Saldo laba: Belum ditentukan penggunaannya
  32. TOTAL EKUITAS
  33. TOTAL LIABILITAS & EKUITAS

ATURAN MAPPING:
- Setiap value HARUS dihubungkan dengan URAIAN yang benar pada baris yang sama.
- Jangan mengembalikan angka sebagai daftar terpisah tanpa URAIAN.
- Jangan memetakan berdasarkan urutan baris saja.
- Jangan menukar value REALISASI dan RKAP.
- Gunakan canonical URAIAN yang tersedia di atas sebagai target mapping.
- ABAIKAN section headers: "ASET LANCAR", "ASET TIDAK LANCAR", "LIABILITAS JANGKA PENDEK", "LIABILITAS JANGKA PANJANG", "Ekuitas yang dapat diatribusikan kepada pemilik entitas induk" — jangan buat row untuk header ini.
- Jika PDF menyebut "Pihak ketiga" di bawah "Piutang usaha", petakan ke "Piutang usaha - neto: Pihak ketiga".
- Jika PDF menyebut "Modal ditempatkan dan disetor penuh" tanpa "Modal dasar:", petakan ke "Modal dasar: Modal ditempatkan dan disetor penuh".
- Jika PDF menyebut "Belum ditentukan penggunaannya" di bawah "Saldo laba", petakan ke "Saldo laba: Belum ditentukan penggunaannya".
- Pertimbangkan variasi penamaan, singkatan, dan perbedaan formatting.
- Jika confidence tidak cukup, tandai status sebagai "UNMATCHED".
- Jangan membuat nama uraian baru.
- Angka harus PERSIS seperti yang tercetak, jangan dibulatkan.
- Angka negatif (tanda kurung) = negatif.
- Jika cell kosong atau "-", gunakan null.
- "bulan" harus berisi nama bulan Indonesia.

Return JSON object PERSIS format ini:
{
  "tableType": "NERACA",
  "bulan": "Juli",
  "rows": [
    {
      "rawUraian": "Kas dan setara kas",
      "canonicalUraian": "Kas dan setara kas",
      "realisasiA": 1234567890,
      "rkapB": 9876543210,
      "confidence": "high",
      "matchType": "exact",
      "status": "MATCHED"
    }
  ]
}

HANYA return JSON, tanpa penjelasan atau markdown.`,
};

// ── ARUS KAS (Lampiran 3 — Arus Kas) ──────────────────────────
export const ARUS_KAS_SCHEMA = {
  sheetName: 'ARUS KAS',

  expectedRows: [
    'Penerimaan dari pelanggan',
    'Pembayaran kas kepada pemasok',
    'Pembayaran kas kepada karyawan',
    'Penerimaan kas lainnya',
    'Pembayaran pajak',
    'Pembayaran lain-lain',
    'Kas bersih yang diperoleh dari (digunakan untuk) operasi',
    'Perolehan aset tetap',
    'Penambahan aset tak berwujud',
    'Kas bersih yang diperoleh dari (digunakan untuk) investasi',
    'Penerimaan setoran modal',
    'Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan',
    'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS',
    'DAMPAK NETO PERUBAHAN NILAI TUKAR ATAS KAS DAN SETARA KAS',
    'KAS DAN SETARA KAS AWAL TAHUN',
    'KAS DAN SETARA KAS AKHIR TAHUN',
  ],

  geminiPrompt: `Anda adalah sistem ekstraksi dan pemetaan tabel laporan keuangan.

Anda melihat halaman PDF "Lampiran 3" yang berisi Laporan Arus Kas.

TUGAS UTAMA:
1. Identifikasi nama BULAN dari kolom realisasi bulan paling kanan/terbaru yang terisi.
2. Baca tabel dan identifikasi setiap URAIAN beserta value-nya.
3. Untuk setiap baris, tentukan:
   - Value dari kolom REALISASI (A) = realisasiA
   - Value dari kolom RKAP (C) = rkapC
4. JANGAN ekstrak kolom lain (Realisasi Januari-Juni, S.D., dll).

CANONICAL URAIAN YANG TERSEDIA PADA TEMPLATE:
  1. Penerimaan dari pelanggan
  2. Pembayaran kas kepada pemasok
  3. Pembayaran kas kepada karyawan
  4. Penerimaan kas lainnya
  5. Pembayaran pajak
  6. Pembayaran lain-lain
  7. Kas bersih yang diperoleh dari (digunakan untuk) operasi
  8. Perolehan aset tetap
  9. Penambahan aset tak berwujud
  10. Kas bersih yang diperoleh dari (digunakan untuk) investasi
  11. Penerimaan setoran modal
  12. Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan
  13. KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS
  14. DAMPAK NETO PERUBAHAN NILAI TUKAR ATAS KAS DAN SETARA KAS
  15. KAS DAN SETARA KAS AWAL TAHUN
  16. KAS DAN SETARA KAS AKHIR TAHUN

ATURAN MAPPING:
- Setiap value HARUS dihubungkan dengan URAIAN yang benar pada baris yang sama.
- Jangan mengembalikan angka sebagai daftar terpisah tanpa URAIAN.
- Jangan memetakan berdasarkan urutan baris saja.
- Jangan menukar value REALISASI dan RKAP.
- Gunakan canonical URAIAN yang tersedia di atas sebagai target mapping.
- ABAIKAN section headers: "ARUS KAS DARI AKTIVITAS OPERASI", "ARUS KAS DARI AKTIVITAS INVESTASI", "ARUS KAS DARI AKTIVITAS PENDANAAN" — jangan buat row untuk header ini kecuali ada angka pada header tersebut.
- Pahami bahwa "Kas bersih..." bisa juga ditulis sebagai "Arus kas bersih dari aktivitas operasi" dll.
- Pertimbangkan variasi penamaan, singkatan, tanda kurung.
- Angka negatif (pembayaran/arus keluar) harus tetap negatif.
- Angka dalam kurung seperti (1.234) = -1234.
- Jika confidence tidak cukup, tandai status sebagai "UNMATCHED".
- Jangan membuat nama uraian baru.
- Jika cell kosong atau "-", gunakan null.
- "bulan" harus berisi nama bulan Indonesia.

Return JSON object PERSIS format ini:
{
  "tableType": "ARUS_KAS",
  "bulan": "Juli",
  "rows": [
    {
      "rawUraian": "Penerimaan dari pelanggan",
      "canonicalUraian": "Penerimaan dari pelanggan",
      "realisasiA": 1234567890,
      "rkapC": 9876543210,
      "confidence": "high",
      "matchType": "exact",
      "status": "MATCHED"
    }
  ]
}

HANYA return JSON, tanpa penjelasan atau markdown.`,
};

// ── Lookup maps ─────────────────────────────────────────────────
export const SCHEMAS = {
  PDPT: PDPT_SCHEMA,
  LR: LR_SCHEMA,
  NERACA: NERACA_SCHEMA,
  ARUS_KAS: ARUS_KAS_SCHEMA,
};

export const SCHEMA_BY_SHEET = {
  'PDPT': PDPT_SCHEMA,
  'LR': LR_SCHEMA,
  'NERACA': NERACA_SCHEMA,
  'ARUS KAS': ARUS_KAS_SCHEMA,
};
