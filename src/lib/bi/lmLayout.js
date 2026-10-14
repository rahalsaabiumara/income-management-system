/**
 * lmLayout.js — Row layout of the "Laporan Manajemen" (LM) table view.
 *
 * Mirrors the row names and row order of the raw management report file
 * (src/assets/template.xlsx). One array per dashboard section (SECTIONS key),
 * each entry `{ label, bold }`:
 *   - label: row text exactly as in the template (trimmed)
 *   - bold:  true for rows printed bold in the template (totals / block titles)
 *
 * Values are NOT defined here. Each label is matched to a canonical metric key
 * at runtime (see lmRows.js) and takes its numbers from the same aggregated
 * data as the Analitik table.
 *
 * If the template changes, update THIS file only.
 */

/** Dashboard section (SECTIONS key) → sheet name in template.xlsx. */
export const LM_SHEETS = {
  LR: 'LR',
  CF: 'ARUS KAS',
  BS: 'NERACA',
  REV: 'PDPT',
};

const row = (label, bold = false) => ({ label: label.trim(), bold });

export const LM_LAYOUT = {
  // ── Profit Loss (sheet LR) ──
  LR: [
    row('Penjualan bersih'),
    row('Beban pokok penjualan'),
    row('Laba (Rugi) kotor', true),
    row('Beban usaha: Beban pemasaran dan penjualan'),
    row('Beban usaha: Beban umum dan administrasi'),
    row('Jumlah beban usaha', true),
    row('Laba (Rugi) usaha', true),
    row('Pendapatan operasi lainnya'),
    row('Beban operasi lainnya'),
    row('Laba (Rugi) operasi', true),
    row('Pendapatan keuangan'),
    row('Beban keuangan'),
    row('Laba (Rugi) sebelum beban pajak penghasilan', true),
    row('Beban (manfaat) pajak: Pajak kini'),
    row('Beban (manfaat) pajak: Pajak tangguhan'),
    row('Jumlah beban (manfaat) pajak', true),
    row('Laba (Rugi) tahun berjalan', true),
    row('Pendapatan komprehensif lain'),
    row('Laba (Rugi) komprehensif tahun berjalan', true),
  ],

  // ── Cash Flow (sheet ARUS KAS) ──
  CF: [
    row('ARUS KAS', true),
    row('Penerimaan dari pelanggan'),
    row('Pembayaran kas kepada pemasok'),
    row('Pembayaran kas kepada karyawan'),
    row('Penerimaan bunga'),
    row('Penerimaan kas lainnya'),
    row('Pembayaran pajak'),
    row('Pembayaran lain-lain'),
    row('Kas bersih yang diperoleh dari (digunakan untuk) operasi', true),
    row('ARUS KAS DARI AKTIVITAS INVESTASI', true),
    row('Perolehan aset tetap'),
    row('Penambahan aset tak berwujud'),
    row('Kas bersih yang diperoleh dari (digunakan untuk) investasi', true),
    row('ARUS KAS DARI AKTIVITAS PENDANAAN', true),
    row('Penerimaan setoran modal'),
    row('Kas Bersih yang diperoleh dari (digunakan untuk) pendanaan', true),
    row('KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS', true),
    row('DAMPAK NETO PERUBAHAN NILAI TUKAR ATAS KAS DAN SETARA KAS', true),
    row('KAS DAN SETARA KAS AWAL TAHUN'),
    row('KAS DAN SETARA KAS AKHIR TAHUN', true),
  ],

  // ── Balance Sheet (sheet NERACA) ──
  BS: [
    row('ASET LANCAR', true),
    row('Kas dan setara kas'),
    row('Piutang usaha - neto: Pihak ketiga'),
    row('Piutang usaha - neto: Pihak-pihak berelasi'),
    row('Cadangan Kerugian Piutang Usaha Pihak Ketiga'),
    row('Piutang lain-lain - neto: Pihak ketiga'),
    row('Piutang lain-lain - neto: Pihak-pihak berelasi'),
    row('Persediaan'),
    row('Pajak dibayar di muka'),
    row('Aset lancar lainnya'),
    row('Biaya dibayar dimuka dan uang muka'),
    row('TOTAL ASET LANCAR', true),
    row('ASET TIDAK LANCAR', true),
    row('Aset pajak tangguhan'),
    row('Aset tetap'),
    row('Aset tidak lancar lainnya'),
    row('TOTAL ASET TIDAK LANCAR', true),
    row('TOTAL ASET', true),
    row('LIABILITAS JANGKA PENDEK', true),
    row('Utang usaha: Pihak ketiga'),
    row('Utang lain-lain: Pihak ketiga'),
    row('Utang pajak'),
    row('Pendapatan diterima di muka jatuh tempo satu tahun'),
    row('Biaya yang masih harus dibayar'),
    row('TOTAL LIABILITAS JANGKA PENDEK', true),
    row('LIABILITAS JANGKA PANJANG', true),
    row('Utang lain-lain jangka panjang'),
    row('Liabilitas imbalan kerja karyawan: Dapenbun'),
    row('Liabilitas imbalan kerja karyawan: Program lainnya yang tidak didanai'),
    row('Liabilitas pajak tangguhan'),
    row('TOTAL LIABILITAS JANGKA PANJANG', true),
    row('TOTAL LIABILITAS', true),
    row('Ekuitas yang dapat diatribusikan kepada pemilik entitas induk', true),
    row('Modal dasar: Modal ditempatkan dan disetor penuh'),
    row('Modal dasar: Penghasilan komprehensif lain'),
    row('Saldo laba: Belum ditentukan penggunaannya'),
    row('TOTAL EKUITAS', true),
    row('TOTAL LIABILITAS & EKUITAS', true),
  ],

  // ── Revenue (sheet PDPT) ──
  REV: [
    row('Pelatihan'),
    row('Konsultansi'),
    row('Asesmen dan Sertifikasi'),
    row('Digital Bisnis'),
    row('Hotel MICE'),
    row('TOTAL', true),
  ],
};
