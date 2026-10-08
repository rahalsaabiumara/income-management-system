import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProcessingModal from '../components/ProcessingModal.jsx';
import MasterTable from '../components/MasterTable.jsx';
import LampiranViewer from '../components/LampiranViewer.jsx';
import ExcelConvertModal from '../components/ExcelConvertModal.jsx';
import BatchConvertModal from '../components/BatchConvertModal.jsx';
import { fetchMaster, checkAuthStatus, getAuthUrl, uploadAndProcessPdf } from '../lib/api.js';
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
 * Dashboard — Main page composing all Income Statement components.
 */
export default function Dashboard() {
  const { user, fullName, logout, role } = useAuth();
  const queryClient = useQueryClient();
  const [lampiranRow, setLampiranRow] = useState(null);
  const [excelConvertRow, setExcelConvertRow] = useState(null);
  const [processingReport, setProcessingReport] = useState(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [localData, setLocalData] = useState(null); // For local data override

  // PDF Upload State (Admin only)
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return false; // Default to Light Mode as per requirement
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

  // Lampiran viewer
  const handleViewLampiran = useCallback((row) => {
    setLampiranRow(row);
  }, []);

  const handleCloseLampiran = useCallback(() => {
    setLampiranRow(null);
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

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];

    // Reset file input so the same file can be selected again and to prevent duplicate triggers
    e.target.value = null;

    if (!file) return;

    if (file.type !== 'application/pdf') {
      setUploadError('Hanya file PDF yang diperbolehkan.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // Kita panggil API yang akan upload ke Drive lalu initiate processing
      const res = await uploadAndProcessPdf(file);

      setUploadSuccess(true);
      // Timeout to clear success message
      setTimeout(() => setUploadSuccess(false), 5000);

      // Optionally refresh the table if needed
      queryClient.invalidateQueries({ queryKey: ['master'] });

    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Gagal mengunggah file.');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="bg-gray-50 flex-1">
      {/* ── Main Content ──────────────────────────────── */}
      <main className="w-full mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-var(--topbar-h))]">

        {/* Upload PDF is now handled inside the Sidebar/MasterTable area */}

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

        {/* Split View Container */}
        <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">

          {/* Left Panel: Sidebar / MasterTable */}
          <div className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col min-h-0 bg-white border border-surface-200 dark:border-surface-800 rounded-xl overflow-hidden shadow-sm">
            <MasterTable
              data={tableData}
              isLoading={isLoading && !isError}
              selectedRow={lampiranRow}
              onSelectRow={handleViewLampiran}
              role={role}
              uploadProps={role === 'ADMIN' ? {
                isUploading,
                uploadError,
                uploadSuccess,
                handlePdfUpload
              } : null}
            />
          </div>

          {/* Right Panel: PDF Viewer inline */}
          <div className="flex-1 flex flex-col min-h-0 bg-white border border-surface-200 dark:border-surface-800 rounded-xl overflow-hidden shadow-sm">
            {lampiranRow ? (
              <LampiranViewer
                isOpen={true}
                onClose={handleCloseLampiran}
                row={lampiranRow}
                inline={true}
                onConvertExcel={handleConvertExcel}
                onProcessTabular={() => setProcessingReport(lampiranRow)}
                role={role}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-surface-400 bg-surface-50 dark:bg-surface-900/50">
                <div className="p-4 rounded-full bg-white dark:bg-surface-800 shadow-sm border border-surface-200 dark:border-surface-700 mb-4">
                  <svg className="w-12 h-12 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">Belum Ada Laporan Terpilih</h3>
                <p className="text-sm mt-1 max-w-sm text-center">Pilih laporan di sebelah kiri untuk melihat preview dokumen disini secara langsung.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-surface-200 dark:border-surface-800 mt-6 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 text-center text-xs text-surface-500 dark:text-surface-400">
          Income Statement — Laporan Manajemen &copy; {new Date().getFullYear()}
        </div>
      </footer>

      {/* ── Modals ──────────────────────────────────────── */}

      {processingReport && (
        <ProcessingModal
          report={processingReport}
          onClose={() => setProcessingReport(null)}
        />
      )}


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
