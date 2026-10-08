/**
 * constants.js — BI Dashboard mapping configuration.
 *
 * Single source of truth for:
 * - Section definitions (table → section)
 * - Canonical metric names
 * - Uraian → canonical mapping (semantic, NOT positional)
 * - Alias mapping for variant spellings
 * - FLOW vs SNAPSHOT classification
 * - Chart colors
 */

// ── Section Definitions ──────────────────────────────────────────

export const SECTIONS = {
  LR: { key: 'LR', table: 'bi_laba_rugi', label: 'Laba Rugi', labelEn: 'Profit & Loss', type: 'FLOW' },
  CF: { key: 'CF', table: 'bi_arus_kas', label: 'Arus Kas', labelEn: 'Cash Flow', type: 'MIXED' },
  BS: { key: 'BS', table: 'bi_neraca', label: 'Neraca', labelEn: 'Balance Sheet', type: 'SNAPSHOT' },
  REV: { key: 'REV', table: 'bi_pendapatan', label: 'Pendapatan', labelEn: 'Revenue', type: 'FLOW' },
};

// ── Dashboard Sections (UI order) ────────────────────────────────
// Order of the /bi-dashboard sub-menu. The FIRST entry is the default section
// (no ?section= param or an invalid one). Sidebar, Topbar breadcrumb and the
// page orchestrator all read from here. `param` = ?section= value, `tab` = SECTIONS key.

export const DASHBOARD_SECTIONS = [
  { param: 'revenue', label: 'Revenue', tab: 'REV' },
  { param: 'profit-loss', label: 'Profit Loss', tab: 'LR' },
  { param: 'cash-flow', label: 'Cash Flow', tab: 'CF' },
  { param: 'balance-sheet', label: 'Balance Sheet', tab: 'BS' },
];

export const DEFAULT_DASHBOARD_SECTION = DASHBOARD_SECTIONS[0];

/** Resolve a ?section= value to its section entry (falls back to the default). */
export function resolveDashboardSection(param) {
  return DASHBOARD_SECTIONS.find(s => s.param === param) || DEFAULT_DASHBOARD_SECTION;
}

// ── Alias Mapping ────────────────────────────────────────────────
// Normalized key → canonical normalized key
// Used to resolve variant spellings in the database.

export const URAIAN_ALIASES = {
  'hotel mice': 'hotel & mice',
  'ekuitas yang dapat diatribusikan kepada pemilik entitas induk':
    'ekuitas yang dapat diatribusikan kepada pemilik entitas induk',
};

// ── Profit & Loss Mapping ────────────────────────────────────────
// Maps normalized uraian (+ optional sub_uraian) to canonical metric keys.
// Keys with sub_uraian use format: "uraian::sub_uraian"

export const LR_MAPPING = {
  // Revenue
  'penjualan bersih': { canonical: 'revenue', group: 'revenue', label: 'Penjualan Bersih', type: 'FLOW' },

  // COGS
  'beban pokok penjualan': { canonical: 'cogs', group: 'cogs', label: 'Beban Pokok Penjualan', type: 'FLOW' },

  // Gross Profit (explicit total)
  'laba (rugi) kotor': { canonical: 'grossProfit', group: 'grossProfit', label: 'Laba (Rugi) Kotor', type: 'FLOW', isTotal: true },

  // Operating Expenses
  'beban usaha::beban pemasaran dan penjualan': { canonical: 'opex.marketing', group: 'opex', label: 'Beban Pemasaran & Penjualan', type: 'FLOW' },
  'beban usaha::beban umum dan administrasi': { canonical: 'opex.admin', group: 'opex', label: 'Beban Umum & Administrasi', type: 'FLOW' },
  'jumlah beban usaha': { canonical: 'opex.total', group: 'opex', label: 'Jumlah Beban Usaha', type: 'FLOW', isTotal: true },

  // Operating Profit
  'laba (rugi) usaha': { canonical: 'operatingProfit', group: 'operatingProfit', label: 'Laba (Rugi) Usaha', type: 'FLOW', isTotal: true },

  // Other Income/Expense
  'pendapatan operasi lainnya': { canonical: 'otherIncome', group: 'otherIncomeExpense', label: 'Pendapatan Operasi Lainnya', type: 'FLOW' },
  'beban operasi lainnya': { canonical: 'otherExpense', group: 'otherIncomeExpense', label: 'Beban Operasi Lainnya', type: 'FLOW' },

  // Operating P&L
  'laba (rugi) operasi': { canonical: 'operatingPL', group: 'operatingPL', label: 'Laba (Rugi) Operasi', type: 'FLOW', isTotal: true },

  // Finance
  'pendapatan keuangan': { canonical: 'financeIncome', group: 'finance', label: 'Pendapatan Keuangan', type: 'FLOW' },
  'beban keuangan': { canonical: 'financeCost', group: 'finance', label: 'Beban Keuangan', type: 'FLOW' },

  // Profit Before Tax
  'laba (rugi) sebelum beban pajak penghasilan': { canonical: 'profitBeforeTax', group: 'profitBeforeTax', label: 'Laba (Rugi) Sebelum Pajak', type: 'FLOW', isTotal: true },

  // Tax
  'beban (manfaat) pajak::pajak kini': { canonical: 'tax.current', group: 'tax', label: 'Pajak Kini', type: 'FLOW' },
  'beban (manfaat) pajak::pajak tangguhan': { canonical: 'tax.deferred', group: 'tax', label: 'Pajak Tangguhan', type: 'FLOW' },
  'jumlah beban (manfaat) pajak': { canonical: 'tax.total', group: 'tax', label: 'Jumlah Beban Pajak', type: 'FLOW', isTotal: true },
  'beban (manfaat) pajak': { canonical: 'tax.line', group: 'tax', label: 'Beban (Manfaat) Pajak', type: 'FLOW' },

  // Net Income
  'laba (rugi) tahun berjalan': { canonical: 'netIncome', group: 'netIncome', label: 'Laba (Rugi) Tahun Berjalan', type: 'FLOW', isTotal: true },

  // OCI
  'pendapatan komprehensif lain': { canonical: 'oci', group: 'comprehensive', label: 'Pendapatan Komprehensif Lain', type: 'FLOW' },
  'laba (rugi) komprehensif tahun berjalan': { canonical: 'comprehensiveIncome', group: 'comprehensive', label: 'Laba (Rugi) Komprehensif', type: 'FLOW', isTotal: true },
};

// ── Cash Flow Mapping ────────────────────────────────────────────

export const CF_MAPPING = {
  // Operating Activity Details (uraian="ARUS KAS", sub_uraian=detail)
  'arus kas::penerimaan dari pelanggan': { canonical: 'operating.customerReceipts', group: 'operating', label: 'Penerimaan dari Pelanggan', type: 'FLOW' },
  'arus kas::pembayaran kas kepada pemasok': { canonical: 'operating.supplierPayments', group: 'operating', label: 'Pembayaran kepada Pemasok', type: 'FLOW' },
  'arus kas::pembayaran kas kepada karyawan': { canonical: 'operating.employeePayments', group: 'operating', label: 'Pembayaran kepada Karyawan', type: 'FLOW' },
  'arus kas::penerimaan kas lainnya': { canonical: 'operating.otherReceipts', group: 'operating', label: 'Penerimaan Kas Lainnya', type: 'FLOW' },
  'arus kas::penerimaan bunga': { canonical: 'operating.interestReceipts', group: 'operating', label: 'Penerimaan Bunga', type: 'FLOW' },
  'arus kas::pembayaran pajak': { canonical: 'operating.taxPayments', group: 'operating', label: 'Pembayaran Pajak', type: 'FLOW' },
  'arus kas::pembayaran lain-lain': { canonical: 'operating.otherPayments', group: 'operating', label: 'Pembayaran Lain-lain', type: 'FLOW' },

  // Operating subtotals that appear as standalone uraian
  'penerimaan dari pelanggan': { canonical: 'operating.customerReceipts', group: 'operating', label: 'Penerimaan dari Pelanggan', type: 'FLOW' },
  'pembayaran kas kepada pemasok': { canonical: 'operating.supplierPayments', group: 'operating', label: 'Pembayaran kepada Pemasok', type: 'FLOW' },
  'pembayaran kas kepada karyawan': { canonical: 'operating.employeePayments', group: 'operating', label: 'Pembayaran kepada Karyawan', type: 'FLOW' },
  'penerimaan kas lainnya': { canonical: 'operating.otherReceipts', group: 'operating', label: 'Penerimaan Kas Lainnya', type: 'FLOW' },
  'penerimaan bunga': { canonical: 'operating.interestReceipts', group: 'operating', label: 'Penerimaan Bunga', type: 'FLOW' },
  'pembayaran pajak': { canonical: 'operating.taxPayments', group: 'operating', label: 'Pembayaran Pajak', type: 'FLOW' },
  'pembayaran lain-lain': { canonical: 'operating.otherPayments', group: 'operating', label: 'Pembayaran Lain-lain', type: 'FLOW' },

  // Net Operating CF (explicit total)
  'kas bersih yang diperoleh dari (digunakan untuk) operasi': { canonical: 'operating.netCashFlow', group: 'operating', label: 'Kas Bersih Aktivitas Operasi', type: 'FLOW', isTotal: true },
  'arus kas::kas bersih yang diperoleh dari (digunakan untuk) operasi': { canonical: 'operating.netCashFlow', group: 'operating', label: 'Kas Bersih Aktivitas Operasi', type: 'FLOW', isTotal: true },

  // Investing Activity Details
  'arus kas dari aktivitas investasi::perolehan aset tetap': { canonical: 'investing.fixedAssets', group: 'investing', label: 'Perolehan Aset Tetap', type: 'FLOW' },
  'arus kas dari aktivitas investasi::penambahan aset tak berwujud': { canonical: 'investing.intangibleAssets', group: 'investing', label: 'Penambahan Aset Tak Berwujud', type: 'FLOW' },
  'arus kas dari aktivitas investasi::kas bersih yang diperoleh dari (digunakan untuk) investasi': { canonical: 'investing.netCashFlow', group: 'investing', label: 'Kas Bersih Aktivitas Investasi', type: 'FLOW', isTotal: true },

  // Net Investing CF (explicit total — may appear as standalone uraian)
  'kas bersih yang diperoleh dari (digunakan untuk) investasi': { canonical: 'investing.netCashFlow', group: 'investing', label: 'Kas Bersih Aktivitas Investasi', type: 'FLOW', isTotal: true },

  // Financing Activity Details
  'arus kas dari aktivitas pendanaan::penerimaan setoran modal': { canonical: 'financing.capitalContribution', group: 'financing', label: 'Penerimaan Setoran Modal', type: 'FLOW' },

  // Net Financing CF (explicit total)
  'kas bersih yang diperoleh dari (digunakan untuk) pendanaan': { canonical: 'financing.netCashFlow', group: 'financing', label: 'Kas Bersih Aktivitas Pendanaan', type: 'FLOW', isTotal: true },

  // Net Change
  'kenaikan (penurunan) bersih kas dan setara kas': { canonical: 'netChange', group: 'position', label: 'Kenaikan (Penurunan) Bersih Kas', type: 'FLOW', isTotal: true },

  // FX Impact
  'dampak neto perubahan nilai tukar atas kas dan setara kas': { canonical: 'fxImpact', group: 'position', label: 'Dampak Perubahan Nilai Tukar', type: 'FLOW' },

  // Cash Position — SNAPSHOT! Do NOT SUM across months.
  'kas dan setara kas awal tahun': { canonical: 'openingCash', group: 'position', label: 'Kas Awal', type: 'SNAPSHOT' },
  'kas dan setara kas akhir tahun': { canonical: 'closingCash', group: 'position', label: 'Kas Akhir', type: 'SNAPSHOT' },
  // Also appears as sub_uraian under KENAIKAN...
  'kenaikan (penurunan) bersih kas dan setara kas::kas dan setara kas awal tahun': { canonical: 'openingCash', group: 'position', label: 'Kas Awal', type: 'SNAPSHOT' },
  'kenaikan (penurunan) bersih kas dan setara kas::kenaikan (penurunan) bersih kas dan setara kas': { canonical: 'netChange', group: 'position', label: 'Kenaikan (Penurunan) Bersih Kas', type: 'FLOW', isTotal: true },
};

// ── Balance Sheet Mapping ────────────────────────────────────────

export const BS_MAPPING = {
  // Current Assets
  'aset lancar::kas dan setara kas': { canonical: 'currentAssets.cash', group: 'currentAssets', label: 'Kas dan Setara Kas', type: 'SNAPSHOT' },
  'aset lancar::piutang usaha - neto: pihak ketiga': { canonical: 'currentAssets.tradeReceivables3rd', group: 'currentAssets', label: 'Piutang Usaha - Pihak Ketiga', type: 'SNAPSHOT' },
  'aset lancar::piutang usaha - neto: pihak-pihak berelasi': { canonical: 'currentAssets.tradeReceivablesRelated', group: 'currentAssets', label: 'Piutang Usaha - Pihak Berelasi', type: 'SNAPSHOT' },
  'aset lancar::piutang lain-lain - neto: pihak ketiga': { canonical: 'currentAssets.otherReceivables3rd', group: 'currentAssets', label: 'Piutang Lain-lain - Pihak Ketiga', type: 'SNAPSHOT' },
  'aset lancar::piutang lain-lain - neto: pihak-pihak berelasi': { canonical: 'currentAssets.otherReceivablesRelated', group: 'currentAssets', label: 'Piutang Lain-lain - Pihak Berelasi', type: 'SNAPSHOT' },
  'aset lancar::persediaan': { canonical: 'currentAssets.inventory', group: 'currentAssets', label: 'Persediaan', type: 'SNAPSHOT' },
  'aset lancar::pajak dibayar di muka': { canonical: 'currentAssets.prepaidTax', group: 'currentAssets', label: 'Pajak Dibayar di Muka', type: 'SNAPSHOT' },
  'aset lancar::aset lancar lainnya': { canonical: 'currentAssets.otherCurrentAssets', group: 'currentAssets', label: 'Aset Lancar Lainnya', type: 'SNAPSHOT' },
  'aset lancar::biaya dibayar dimuka dan uang muka': { canonical: 'currentAssets.prepaidExpenses', group: 'currentAssets', label: 'Biaya Dibayar Dimuka & Uang Muka', type: 'SNAPSHOT' },
  'aset lancar::cadangan kerugian piutang usaha-pihak ketiga': { canonical: 'currentAssets.allowanceReceivables', group: 'currentAssets', label: 'Cadangan Kerugian Piutang', type: 'SNAPSHOT' },
  'total aset lancar': { canonical: 'currentAssets.total', group: 'currentAssets', label: 'Total Aset Lancar', type: 'SNAPSHOT', isTotal: true },

  // Non-Current Assets
  'aset tidak lancar::investasi pada entitas asosiasi': { canonical: 'nonCurrentAssets.investmentAssociates', group: 'nonCurrentAssets', label: 'Investasi pada Entitas Asosiasi', type: 'SNAPSHOT' },
  'aset tidak lancar::aset tetap': { canonical: 'nonCurrentAssets.fixedAssets', group: 'nonCurrentAssets', label: 'Aset Tetap', type: 'SNAPSHOT' },
  'aset tidak lancar::aset tidak lancar lainnya': { canonical: 'nonCurrentAssets.otherNCA', group: 'nonCurrentAssets', label: 'Aset Tidak Lancar Lainnya', type: 'SNAPSHOT' },
  'aset tidak lancar::aset pajak tangguhan': { canonical: 'nonCurrentAssets.deferredTaxAsset', group: 'nonCurrentAssets', label: 'Aset Pajak Tangguhan', type: 'SNAPSHOT' },
  'total aset tidak lancar': { canonical: 'nonCurrentAssets.total', group: 'nonCurrentAssets', label: 'Total Aset Tidak Lancar', type: 'SNAPSHOT', isTotal: true },

  // Total Assets
  'total aset': { canonical: 'totalAssets', group: 'totalAssets', label: 'Total Aset', type: 'SNAPSHOT', isTotal: true },

  // Current Liabilities
  'liabilitas jangka pendek::utang usaha: pihak ketiga': { canonical: 'currentLiabilities.tradePayables', group: 'currentLiabilities', label: 'Utang Usaha - Pihak Ketiga', type: 'SNAPSHOT' },
  'liabilitas jangka pendek::utang lain-lain: pihak ketiga': { canonical: 'currentLiabilities.otherPayables', group: 'currentLiabilities', label: 'Utang Lain-lain - Pihak Ketiga', type: 'SNAPSHOT' },
  'liabilitas jangka pendek::utang pajak': { canonical: 'currentLiabilities.taxPayable', group: 'currentLiabilities', label: 'Utang Pajak', type: 'SNAPSHOT' },
  'liabilitas jangka pendek::pendapatan diterima di muka jatuh tempo satu tahun': { canonical: 'currentLiabilities.unearnedRevenue', group: 'currentLiabilities', label: 'Pendapatan Diterima di Muka', type: 'SNAPSHOT' },
  'liabilitas jangka pendek::biaya yang masih harus dibayar': { canonical: 'currentLiabilities.accruedExpenses', group: 'currentLiabilities', label: 'Biaya Masih Harus Dibayar', type: 'SNAPSHOT' },
  'total liabilitas jangka pendek': { canonical: 'currentLiabilities.total', group: 'currentLiabilities', label: 'Total Liabilitas Jangka Pendek', type: 'SNAPSHOT', isTotal: true },

  // Non-Current Liabilities
  'liabilitas jangka panjang::utang lain-lain jangka panjang': { canonical: 'nonCurrentLiabilities.otherLTPayables', group: 'nonCurrentLiabilities', label: 'Utang Lain-lain Jangka Panjang', type: 'SNAPSHOT' },
  'liabilitas jangka panjang::liabilitas imbalan kerja karyawan: program lainnya yang tidak didanai': { canonical: 'nonCurrentLiabilities.employeeBenefits', group: 'nonCurrentLiabilities', label: 'Program Lainnya yang Tidak Didanai', type: 'SNAPSHOT' },
  'liabilitas jangka panjang::liabilitas pajak tangguhan': { canonical: 'nonCurrentLiabilities.deferredTaxLiability', group: 'nonCurrentLiabilities', label: 'Liabilitas Pajak Tangguhan', type: 'SNAPSHOT' },
  'total liabilitas jangka panjang': { canonical: 'nonCurrentLiabilities.total', group: 'nonCurrentLiabilities', label: 'Total Liabilitas Jangka Panjang', type: 'SNAPSHOT', isTotal: true },

  // Total Liabilities
  'total liabilitas': { canonical: 'totalLiabilities', group: 'totalLiabilities', label: 'Total Liabilitas', type: 'SNAPSHOT', isTotal: true },

  // Equity
  'ekuitas yang dapat diatribusikan kepada pemilik entitas induk::modal dasar: modal ditempatkan dan disetor penuh': { canonical: 'equity.paidUpCapital', group: 'equity', label: 'Modal Ditempatkan & Disetor', type: 'SNAPSHOT' },
  'ekuitas yang dapat diatribusikan kepada pemilik entitas induk::modal dasar: penghasilan komprehensif lain': { canonical: 'equity.oci', group: 'equity', label: 'Penghasilan Komprehensif Lain', type: 'SNAPSHOT' },
  'ekuitas yang dapat diatribusikan kepada pemilik entitas induk::saldo laba: belum ditentukan penggunaannya': { canonical: 'equity.retainedEarnings', group: 'equity', label: 'Saldo Laba', type: 'SNAPSHOT' },
  'total ekuitas': { canonical: 'totalEquity', group: 'totalEquity', label: 'Total Ekuitas', type: 'SNAPSHOT', isTotal: true },

  // Total L&E
  'total liabilitas & ekuitas': { canonical: 'totalLiabilitiesEquity', group: 'check', label: 'Total Liabilitas & Ekuitas', type: 'SNAPSHOT', isTotal: true },
};

// ── Revenue Mapping ──────────────────────────────────────────────

export const REV_MAPPING = {
  'pelatihan': { canonical: 'training', group: 'categories', label: 'Pelatihan', type: 'FLOW' },
  'konsultansi': { canonical: 'consulting', group: 'categories', label: 'Konsultansi', type: 'FLOW' },
  'asesmen dan sertifikasi': { canonical: 'assessment', group: 'categories', label: 'Asesmen & Sertifikasi', type: 'FLOW' },
  'hotel & mice': { canonical: 'hotelMice', group: 'categories', label: 'Hotel & MICE', type: 'FLOW' },
  'digital bisnis': { canonical: 'digitalBusiness', group: 'categories', label: 'Digital Bisnis', type: 'FLOW' },
  'total': { canonical: 'total', group: 'total', label: 'Total Pendapatan', type: 'FLOW', isTotal: true },
};

// ── Section → Mapping Table Lookup ───────────────────────────────

export const SECTION_MAPPINGS = {
  LR: LR_MAPPING,
  CF: CF_MAPPING,
  BS: BS_MAPPING,
  REV: REV_MAPPING,
};

// ── Chart Colors ─────────────────────────────────────────────────

export const CHART_COLORS = {
  primary: '#2FA84A',     // brand green
  secondary: '#5FC98A',   // brand tint
  accent1: '#E0A83C',     // gold
  accent2: '#2389C4',     // blue
  neutral: '#94A3B8',     // slate
  positive: '#16A34A',
  negative: '#DC2626',
  palette: ['#2FA84A', '#5FC98A', '#E0A83C', '#2389C4', '#94A3B8', '#7C3AED', '#F59E0B'],
};

// ── Table Selection & Trend Line Chart ───────────────────────────
// Shared row selection (table → bar chart + line chart) on /bi-dashboard.

/** Max rows (induk or sub uraian) selectable at once. */
export const SELECTION_MAX = 4;
/** Short notice shown when the user tries to select beyond SELECTION_MAX. */
export const SELECTION_LIMIT_MESSAGE = `Maksimal ${SELECTION_MAX} uraian`;
/** How long the limit notice stays visible (ms). */
export const SELECTION_NOTICE_MS = 2000;

/** Trend line chart colors. `compare` is the sticky palette for comparison view (length = SELECTION_MAX). */
export const TREND_COLORS = {
  realisasi: '#2FA84A',
  rkap: '#E0A83C',
  compare: ['#2389C4', '#8B5CF6', '#F28C28', '#D4537E'],
};

// ── Performance Breakdown (Annual bar chart) ─────────────────────
// Configuration for the type-based stacked bar chart in Annual mode
// (Profit Loss, Cash Flow, Balance Sheet). Edit here to re-classify uraian.

/**
 * Gradient tokens per color family (KPI type cards, 135deg, from → to).
 * Darkened from the original proposal (#3DBE5F→#1E7A38, …) so that 12px white
 * and white/85 text keep a contrast ratio ≥ 4.5:1 even at the lightest end.
 */
export const TYPE_GRADIENTS = {
  green:  { from: '#1B7434', to: '#0F4D21' },
  red:    { from: '#B83136', to: '#8A1C21' },
  blue:   { from: '#19699F', to: '#0F4670' },
  orange: { from: '#A04B09', to: '#723405' },
  gray:   { from: '#5C686F', to: '#3C464C' },
};

/** Breakdown types: label + base color (shades are generated per uraian) + KPI gradient. */
export const BREAKDOWN_TYPES = {
  pendapatan:  { key: 'pendapatan',  label: 'Pendapatan',  color: '#2FA84A', gradient: TYPE_GRADIENTS.green },
  pengeluaran: { key: 'pengeluaran', label: 'Pengeluaran', color: '#DC2626', gradient: TYPE_GRADIENTS.red },
  bunga:       { key: 'bunga',       label: 'Bunga',       color: '#2389C4', gradient: TYPE_GRADIENTS.blue },
  pajak:       { key: 'pajak',       label: 'Pajak',       color: '#F28C28', gradient: TYPE_GRADIENTS.orange },
  aset:        { key: 'aset',        label: 'Aset',        color: '#DC2626', gradient: TYPE_GRADIENTS.red },
  liabilitas:  { key: 'liabilitas',  label: 'Liabilitas',  color: '#2389C4', gradient: TYPE_GRADIENTS.blue },
  ekuitas:     { key: 'ekuitas',     label: 'Ekuitas',     color: '#F28C28', gradient: TYPE_GRADIENTS.orange },
  lainnya:     { key: 'lainnya',     label: 'Lainnya',     color: '#8E9CA3', gradient: TYPE_GRADIENTS.gray },
};

/** Bar order within each year. 'flow' = Profit Loss & Cash Flow, 'balance' = Balance Sheet. */
export const BREAKDOWN_TYPE_ORDER = {
  flow: ['pendapatan', 'pengeluaran', 'bunga', 'pajak', 'lainnya'],
  balance: ['aset', 'liabilitas', 'ekuitas', 'lainnya'],
};

/**
 * KPI type cards per section (fixed order). Only types with ≥ 1 leaf are shown;
 * leaves of types not listed here are not part of the KPI strip.
 */
export const KPI_TYPE_ORDER = {
  profitLoss:   ['pendapatan', 'pengeluaran', 'bunga', 'pajak'],
  cashFlow:     ['pendapatan', 'pengeluaran', 'bunga', 'pajak', 'lainnya'],
  balanceSheet: ['aset', 'liabilitas', 'ekuitas'],
};

/**
 * Keyword rules for Profit Loss & Cash Flow leaf classification.
 * Matched against the normalized (lowercase) uraian name.
 * Evaluated TOP → BOTTOM; the first matching rule wins.
 * `keywords` and `phrases` are both substring matches — `phrases` holds
 * multi-word overrides (e.g. "pendapatan keuangan" → Bunga, not Pendapatan).
 * Order matters: Pengeluaran is checked before Pendapatan so that
 * "Beban pokok penjualan" / "Beban pemasaran dan penjualan" → Pengeluaran.
 */
export const BREAKDOWN_KEYWORD_RULES = [
  { type: 'pajak',       keywords: ['pajak'],                                 phrases: [] },
  { type: 'bunga',       keywords: ['bunga'],                                 phrases: ['pendapatan keuangan'] },
  { type: 'pengeluaran', keywords: ['pembayaran', 'pengeluaran', 'beban'],    phrases: [] },
  { type: 'pendapatan',  keywords: ['penerimaan', 'pendapatan', 'penjualan'], phrases: [] },
];

/**
 * Exact-name overrides (normalized uraian name → type key).
 * Checked BEFORE the keyword rules. Empty by default; use it to correct
 * individual uraian without touching the keyword list, e.g.
 *   'kas dan setara kas awal tahun': 'pendapatan',
 */
export const BREAKDOWN_NAME_OVERRIDES = {};

/**
 * Balance Sheet classification — by top-level branch, NOT by leaf keywords.
 * A leaf's ancestors are scanned from nearest to farthest; the first ancestor
 * whose name matches EXACTLY ONE rule decides the type. Ancestors matching
 * several rules (e.g. "Total Liabilitas dan Ekuitas") are skipped.
 */
export const BREAKDOWN_BS_BRANCH_RULES = [
  { type: 'aset',       keywords: ['aset'] },
  { type: 'liabilitas', keywords: ['liabilitas'] },
  { type: 'ekuitas',    keywords: ['ekuitas'] },
];

// ── Months ───────────────────────────────────────────────────────

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export const QUARTER_MONTHS = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};
