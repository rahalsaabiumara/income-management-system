import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MasterTable from '../components/MasterTable.jsx';
import SyncButton from '../components/SyncButton.jsx';
import CsvImportModal from '../components/CsvImportModal.jsx';
import LampiranViewer from '../components/LampiranViewer.jsx';
import ExcelConvertModal from '../components/ExcelConvertModal.jsx';
import DownloadAllButton from '../components/DownloadAllButton.jsx';
import BatchConvertModal from '../components/BatchConvertModal.jsx';
import SendAllToDriveButton from '../components/SendAllToDriveButton.jsx';
import { fetchMaster, checkAuthStatus, getAuthUrl } from '../lib/api.js';
import { parseLMName, sortKey } from '../lib/dateParser.js';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * DUMMY DATA — used before backend is available.
 * Will be replaced by actual API calls.
 */
const DUMMY_DATA = generateDummyData();

function generateDummyData() {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const data = [];
  for (let year = 2022; year <= 2026; year++) {
    const maxMonth = year === 2026 ? 8 : 12; // Current year up to August
    for (let m = 0; m < maxMonth; m++) {
      const bulan = months[m];
      const thn2 = String(year).slice(-2);
      data.push({
        tanggal: `${bulan} ${thn2}`,
        nama: `${m + 1}. LM ${bulan} ${year}`,
        namaStandar: `${m + 1}. LM ${bulan} ${year}`,
        link: `https://drive.google.com/file/d/dummy_${year}_${m + 1}/view`,
        fileId: `dummy_${year}_${m + 1}`,
      });
    }
  }
  return data;
}

/**
 * Dashboard — Main page composing all LM Manager components.
 */
export default function Dashboard() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [lampiranRow, setLampiranRow] = useState(null);
  const [excelConvertRow, setExcelConvertRow] = useState(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [localData, setLocalData] = useState(null); // For CSV-imported data
  const [filteredData, setFilteredData] = useState([]); // Current filtered rows from MasterTable
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Toggle dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Check auth status
  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: checkAuthStatus,
    refetchOnWindowFocus: true, // re-check when user returns after OAuth
  });
  const isAuthReady = authStatus?.ready;

  // Fetch master data from API (falls back to dummy if backend not available)
  const { data: apiData, isLoading, isError } = useQuery({
    queryKey: ['master'],
    queryFn: fetchMaster,
    enabled: isAuthReady, // only fetch if authenticated
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Use local data (from CSV import) if available, otherwise API data, fallback to dummy
  const tableData = localData || ((isError || !isAuthReady) ? DUMMY_DATA : (apiData || DUMMY_DATA));

  // Handle sync complete
  const handleSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['master'] });
    setLocalData(null); // Clear local override
  }, [queryClient]);

  // Handle CSV import
  const handleCsvImport = useCallback((importedRows) => {
    // Sort imported data chronologically
    const sorted = [...importedRows].sort((a, b) => {
      const pa = parseLMName(a.nama || a.namaStandar);
      const pb = parseLMName(b.nama || b.namaStandar);
      return sortKey(pa) - sortKey(pb);
    });
    setLocalData(sorted);
  }, []);

  // Lampiran viewer
  const handleViewLampiran = useCallback((row) => {
    setLampiranRow(row);
  }, []);

  const handleCloseLampiran = useCallback(() => {
    setLampiranRow(null);
  }, []);

  // Track filtered rows from MasterTable for Download All
  const handleFilteredDataChange = useCallback((rows) => {
    setFilteredData(rows);
  }, []);

  // Excel convert
  const handleConvertExcel = useCallback((row) => {
    setExcelConvertRow(row);
  }, []);

  const handleCloseExcelConvert = useCallback(() => {
    setExcelConvertRow(null);
  }, []);

  const handleLogin = async () => {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (err) {
      alert('Gagal mendapatkan URL login: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 transition-colors duration-300">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-surface-900/80 backdrop-blur-xl
                         border-b border-surface-200 dark:border-surface-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600
                             flex items-center justify-center shadow-lg shadow-brand-500/20">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-surface-900 dark:text-surface-100 leading-tight">
                  LM Manager
                </h1>
                <p className="text-xs text-surface-500 dark:text-surface-400 leading-tight">
                  Laporan Manajemen
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Dark mode toggle */}
              <button
                id="dark-mode-toggle"
                onClick={() => setDarkMode((d) => !d)}
                className="p-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800
                           transition-all duration-200"
                title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
              >
                {darkMode ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-surface-900 dark:text-surface-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Import CSV */}
              <button
                id="import-csv-button"
                onClick={() => setCsvModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                           border border-surface-200 dark:border-surface-800
                           text-surface-900 dark:text-surface-100
                           hover:bg-surface-100 dark:hover:bg-surface-800
                           transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import CSV
              </button>

              {/* Download All Lampiran */}
              <DownloadAllButton filteredData={filteredData} />

              {/* Batch Download/Upload Excel */}
              <button
                onClick={() => setBatchModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                           text-white bg-brand-600 hover:bg-brand-700 shadow-sm
                           transition-all duration-200"
                title="Download/Upload Excel Semua Bulan (Batch)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Batch Excel
              </button>

              {/* Send All to Drive */}
              <SendAllToDriveButton filteredData={filteredData} />

              {/* Sync */}
              <SyncButton onSyncComplete={handleSyncComplete} />

              {/* Logout */}
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                           text-red-600 bg-red-50 hover:bg-red-100 shadow-sm
                           transition-all duration-200 ml-2"
                title="Keluar (Logout)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Auth notice */}
        {authStatus && !isAuthReady && (
          <div className="mb-6 px-5 py-4 rounded-2xl bg-gradient-to-r from-brand-50 to-brand-100 dark:from-brand-950/40 dark:to-brand-900/40 border border-brand-200 dark:border-brand-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500 text-white rounded-xl shadow-inner shadow-white/20">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-brand-900 dark:text-brand-100">Autentikasi Google Diperlukan</h3>
                <p className="text-xs text-brand-700 dark:text-brand-300 mt-0.5">Anda sedang melihat data dummy. Silakan login untuk menghubungkan Google Drive & Sheets.</p>
              </div>
            </div>
            <button
              onClick={handleLogin}
              className="whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 shadow-md shadow-brand-500/20 active:scale-95 transition-all"
            >
              Login dengan Google
            </button>
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Total Laporan"
            value={tableData.length}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            color="brand"
          />
          <StatCard
            label="Tahun Tercakup"
            value={new Set(tableData.map((r) => parseLMName(r.nama)?.tahun).filter(Boolean)).size}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            color="teal"
          />
          <StatCard
            label="Dengan Link"
            value={tableData.filter((r) => r.link).length}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
            color="violet"
          />
          <StatCard
            label="Sumber Data"
            value={localData ? 'CSV' : (isError ? 'Dummy' : 'API')}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
            color="amber"
          />
        </div>

        {/* Local data notice */}
        {localData && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800
                         text-sm text-brand-700 dark:text-brand-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Menampilkan data dari <strong>CSV import</strong>. Data ini belum disimpan ke server.</span>
            </div>
            <button
              onClick={() => setLocalData(null)}
              className="text-xs font-medium px-3 py-1 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
            >
              Hapus & kembali ke data server
            </button>
          </div>
        )}

        {/* Backend offline / Not Auth notice */}
        {(isError || !isAuthReady) && !localData && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800
                         text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{isError ? 'Backend belum tersedia' : 'Akses Google belum terhubung'} — menampilkan <strong>data dummy</strong>. Silakan login atau import CSV.</span>
          </div>
        )}

        {/* Table */}
        <MasterTable
          data={tableData}
          isLoading={isLoading && !isError}
          onViewLampiran={handleViewLampiran}
          onConvertExcel={handleConvertExcel}
          onFilteredDataChange={handleFilteredDataChange}
        />
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-surface-200 dark:border-surface-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-surface-500 dark:text-surface-400">
          LM Manager — Sistem Otomasi Laporan Manajemen &copy; {new Date().getFullYear()}
        </div>
      </footer>

      {/* ── Modals ──────────────────────────────────────── */}
      <CsvImportModal
        isOpen={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImport={handleCsvImport}
      />

      <LampiranViewer
        isOpen={!!lampiranRow}
        onClose={handleCloseLampiran}
        row={lampiranRow}
      />

      <ExcelConvertModal
        isOpen={!!excelConvertRow}
        onClose={handleCloseExcelConvert}
        row={excelConvertRow}
      />

      <BatchConvertModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        data={tableData}
      />
    </div>
  );
}

// ── Stat Card sub-component ──────────────────────────────────────

const COLOR_MAP = {
  brand: { bg: 'bg-brand-50 dark:bg-brand-950/20', icon: 'text-brand-500', border: 'border-brand-100 dark:border-brand-900/30' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-950/20', icon: 'text-teal-500', border: 'border-teal-100 dark:border-teal-900/30' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/20', icon: 'text-violet-500', border: 'border-violet-100 dark:border-violet-900/30' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/20', icon: 'text-amber-500', border: 'border-amber-100 dark:border-amber-900/30' },
};

function StatCard({ label, value, icon, color = 'brand' }) {
  const c = COLOR_MAP[color];
  return (
    <div className={`p-4 rounded-2xl border ${c.border} ${c.bg} transition-all duration-200 hover:scale-[1.02]`}>
      <div className="flex items-center gap-3">
        <div className={`${c.icon}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{value}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}
