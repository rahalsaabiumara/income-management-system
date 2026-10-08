# Prompt Eksekusi — Struktur & Pewarnaan Hierarki Tabel (Profit Loss, Balance Sheet, Cash Flow)

Referensi: `table-card.jpg` (hasil layout Figma final SectionProfitLoss),
`table-card_aruskas.jpg` (referensi struktur SectionCashFlow). Warna di
bawah sudah dikonfirmasi lewat sampling piksel langsung dari kedua
gambar ini, bukan perkiraan visual.

## Sistem Pewarnaan Unified (berbasis DEPTH LEVEL, lintas section)

- Depth 0 (root — Uraian paling atas, tanpa induk): `#5FC98A`
- Depth 1: `#2FA84A`
- Depth 2: `#E0A83C`
- Depth 3: `#2389C4`
- Depth 4: `#8B5CF6`
- Depth 5: `#8E9CA3`
- Baris leaf/tanpa anak: PLAIN, tanpa accent bar sama sekali.
- Setiap baris yang punya accent bar JUGA mendapat tint background pada
  SELURUH baris (bukan cuma bar kirinya) dengan warna yang sama pada
  opacity rendah (~8-10%). Hasil sampling dari referensi mengonfirmasi
  kira-kira: depth0≈#F2FBF6, depth1≈#EFF9F1, depth2≈#FDF9F0,
  depth3≈#EEF6F9, depth4≈#F6F3FE, depth5≈#F6F7F9 — pakai ini sebagai
  acuan hasil akhir yang benar (tidak perlu hardcode tint-nya, cukup
  hitung dari base color + opacity, hasilnya akan mendekati ini).

Sistem ini FLEKSIBEL per section — dalamnya level yang dipakai
menyesuaikan kedalaman struktur masing-masing section (lihat detail per
section di bawah), bukan semua section wajib pakai sampai depth 5.

---

## 🎯 Prompt Siap Tempel

```
Lakukan penyesuaian struktur & pewarnaan berikut di project ini.

## 1) SectionProfitLoss.jsx

Implementasikan struktur hierarki berikut (sudah final sesuai hasil
layout Figma di table-card.jpg), lengkap dengan warna per depth level:

Laba (Rugi) Komprehensif Tahun Berjalan          #5FC98A (depth 0)
  |_ Pendapatan komprehensif lain                 plain
  |_ Laba (Rugi) Tahun Berjalan                   #2FA84A (depth 1)
      |_ Jumlah Beban (Manfaat) Pajak             #E0A83C (depth 2)
          |_ Pajak kini                           plain
          |_ Pajak tangguhan                      plain
      |_ Laba (Rugi) sebelum beban pajak penghasilan  #E0A83C (depth 2)
          |_ Laba (Rugi) Operasi                  #2389C4 (depth 3)
              |_ Beban operasi lainnya            plain
              |_ Pendapatan keuangan               plain
              |_ Beban keuangan                    plain
              |_ Laba (Rugi) Usaha                 #8B5CF6 (depth 4)
                  |_ Laba (Rugi) Kotor              #8E9CA3 (depth 5)
                      |_ Penjualan bersih           plain
                      |_ Beban pokok penjualan      plain
                  |_ Jumlah Beban Usaha             #8E9CA3 (depth 5)
                      |_ Beban pemasaran dan penjualan   plain
                      |_ Beban umum dan administrasi     plain

PENTING — mapping ke Supabase: nama Uraian di atas adalah versi
final UI/Figma. Value ASLI diambil dari view Supabase, yang
kemungkinan penamaannya SEDIKIT berbeda (misal tanpa tanda kurung,
singkatan berbeda, urutan kata berbeda). Lakukan pencocokan
berdasarkan KATA KUNCI/kemiripan makna (fuzzy match), BUKAN exact
string match. Kalau untuk salah satu baris di atas TIDAK ditemukan
Uraian yang cukup mirip di Supabase, JANGAN ditebak/dipaksakan —
laporkan ke user baris mana yang tidak ketemu pasangannya.

Default state tetap expand-all (semua baris terbuka) saat halaman
pertama kali dibuka, sesuai ketentuan sebelumnya.

## 2) SectionBalanceSheet.jsx — RECOLOR SAJA, struktur tidak berubah

Struktur yang sudah ada sebelumnya TETAP DIPERTAHANKAN (Total Aset /
Total Liabilitas dan Ekuitas sebagai root, dst). Yang berubah HANYA
warnanya, mengikuti sistem depth unified di atas:
- depth 0 (Total Aset, Total Liabilitas dan Ekuitas): #5FC98A
- depth 1 (Aset Lancar, Aset Tidak Lancar, TotalEkuitas,
  Total Liabilitas): #2FA84A
- depth 2 (Liabilitas Jangka Pendek, Liabilitas Jangka Panjang):
  #E0A83C
(Balance Sheet tidak perlu warna sampai depth 3+ karena struktur
maksimalnya memang cuma sedalam itu.)

Tambahkan juga row-background-tint per baris ber-accent, dengan
opacity yang sama seperti SectionProfitLoss (~8-10%).

## 3) SectionCashFlow.jsx — STRUKTUR BARU + recolor

Ubah struktur mengikuti referensi table-card_aruskas.jpg:

Arus Kas                                          #5FC98A (depth 0)
  |_ Penerimaan dari pelanggan                     plain
  |_ Pembayaran kas kepada pemasok                 plain
  |_ Pembayaran kas kepada karyawan                plain
  |_ Penerimaan kas lainnya                        plain
  |_ Pembayaran pajak                              plain
  |_ Pembayaran lain-lain                          plain
Arus Kas dari Aktivitas Investasi                  #5FC98A (depth 0)
  |_ Perolehan aset tetap                          plain
  |_ Penambahan aset tak berwujud                  plain
Kas dan Setara Kas Akhir Tahun                     #5FC98A (depth 0)
  |_ Kas dan Setara Kas Awal Tahun                 plain
  |_ Kenaikan Penurunan Bersih Kas dan Setara Kas  plain

CATATAN: ketiga baris teratas (Arus Kas, Arus Kas dari Aktivitas
Investasi, Kas dan Setara Kas Akhir Tahun) SAMA-SAMA depth-0 (tidak
ada induk bersama di atasnya), jadi ketiganya diwarnai SERAGAM
#5FC98A mengikuti sistem unified — JANGAN mengikuti warna yang
mungkin masih terlihat berbeda (hijau vs gold) di screenshot
referensi lama, karena kemungkinan itu belum di-update ke skema
final. KALAU ternyata maksud user memang ingin 3 warna berbeda untuk
membedakan kategori operasi/investasi/saldo akhir (bukan seragam),
STOP dan konfirmasi dulu ke user sebelum lanjut implementasi bagian
ini.

Baris di bawah masing-masing root adalah leaf langsung (depth 1,
plain, tanpa accent) — tidak ada level tambahan di antaranya.

## 4) SectionRevenue.jsx — TIDAK diubah

Revenue tetap flat (tanpa hierarki/expand-collapse) sesuai ketentuan
sebelumnya. Warna kategori yang sudah ada (Pelatihan, Konsultansi,
dst — yang juga dipakai di legend bar/line chart) JANGAN diseragamkan
ke sistem depth-color ini, karena fungsinya beda: warna di Revenue
menandakan IDENTITAS KATEGORI supaya match dengan legend chart, bukan
penanda kedalaman hierarki. Kalau asumsi ini keliru, konfirmasi dulu
ke user.

## BATASAN
- Semua warna diterapkan via token/variable terpusat (bukan hardcode
  berulang di tiap section) supaya konsisten dan mudah diubah lagi.
- Kalau ada mapping Uraian-ke-Supabase yang tidak match/ambigu di
  section mana pun, STOP dan laporkan ke user, jangan menebak.
```
