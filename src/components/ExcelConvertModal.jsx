import { useState, useCallback, useEffect } from 'react';
import { convertToExcel, getExcelDownloadUrl, uploadExcelBatch } from '../lib/api.js';

/**
 * ExcelConvertModal — Modal to convert lampiran PDF to structured Excel.
 *
 * States:
 *   1. idle → initial (trigger conversion on open)
 *   2. processing → extracting tables, calling API
 *   3. review → show validation results, download link
 *   4. error → show error with retry option
 */
export default function ExcelConvertModal({ isOpen, onClose, row }) {
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progressText, setProgressText] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Start conversion when modal opens
  useEffect(() => {
    if (!isOpen || !row?.fileId) return;

    setState('processing');
    setResult(null);
    setError('');
    setProgressText('Mencari halaman target Tabel LM…');

    const timer1 = setTimeout(() => setProgressText('Mengirim tabel ke Gemini Vision AI…'), 2000);
    const timer2 = setTimeout(() => setProgressText('Mengekstrak data keuangan…'), 7000);
    const timer3 = setTimeout(() => setProgressText('Validasi & menulis file Excel…'), 12000);

    convertToExcel(row.fileId, { nama: row.nama, namaStandar: row.namaStandar })
      .then((data) => {
        setResult(data);
        setState('review');
      })
      .catch((err) => {
        setError(err.message);
        setState('error');
      })
      .finally(() => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      });

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isOpen, row?.fileId]);

  const handleClose = useCallback(() => {
    setState('idle');
    setResult(null);
    setError('');
    setProgressText('');
    onClose?.();
  }, [onClose]);

  const handleRetry = useCallback(() => {
    setState('processing');
    setError('');
    setProgressText('Mencoba ulang…');

    convertToExcel(row.fileId, { nama: row.nama, namaStandar: row.namaStandar })
      .then((data) => {
        setResult(data);
        setState('review');
      })
      .catch((err) => {
        setError(err.message);
        setState('error');
      });
  }, [row]);

  const handleUploadToDrive = useCallback(async () => {
    if (!result?.token) return;
    setIsUploading(true);
    try {
      const res = await uploadExcelBatch([result.token]);
      if (res.success) {
        alert('Berhasil mengunggah file Excel ke Google Drive.');
      } else {
        alert(`Terjadi error saat upload: ${res.errors.map(e => e.error).join(', ')}`);
      }
    } catch (err) {
      alert(`Gagal upload: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [result]);

  const handleDownloadAndUpload = useCallback(async () => {
    if (!result?.token) return;
    
    // Trigger download
    const link = document.createElement('a');
    link.href = getExcelDownloadUrl(result.token);
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Trigger upload
    await handleUploadToDrive();
  }, [result, handleUploadToDrive]);

  if (!isOpen) return null;

  const hasWarnings = result?.validation &&
    Object.values(result.validation).some(v => v.warnings?.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-surface-900 rounded-2xl shadow-2xl
                      border border-surface-200 dark:border-surface-800 flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-800
                       bg-surface-50 dark:bg-surface-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 truncate">
                Convert to Excel
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                {row?.namaStandar || row?.nama || 'Dokumen'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Processing */}
          {state === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  Sedang Memproses…
                </p>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 animate-pulse">
                  {progressText}
                </p>
              </div>
            </div>
          )}

          {/* Review */}
          {state === 'review' && result && (
            <div className="space-y-5">
              {/* Method badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                  ${result.extractionMethod === 'text-layer'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                  }`}>
                  {result.extractionMethod === 'text-layer' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                  Metode: {result.extractionMethod === 'text-layer' ? 'Text Layer' : 'Gemini Vision AI'}
                </span>
              </div>

              {/* Row counts */}
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(result.rowsExtracted).map(([key, count]) => (
                  <div key={key} className="p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 text-center">
                    <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums">{count}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 font-medium mt-0.5">
                      {key === 'PDPT' ? 'Pendapatan' : key === 'LR' ? 'Laba Rugi' : key === 'NERACA' ? 'Neraca' : key === 'ARUS_KAS' ? 'Arus Kas' : key}
                    </p>
                  </div>
                ))}
              </div>

              {/* Validation results */}
              {result.validation && Object.entries(result.validation).map(([key, val]) => (
                <div key={key} className={`px-4 py-3 rounded-xl border ${val.valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                  }`}>
                  <div className="flex items-center gap-2">
                    {val.valid ? (
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    )}
                    <span className={`text-sm font-semibold ${val.valid
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                      }`}>
                      {key === 'PDPT' ? 'Pendapatan' : key === 'LR' ? 'Laba Rugi' : key === 'NERACA' ? 'Neraca' : key === 'ARUS_KAS' ? 'Arus Kas' : key}
                      {val.valid ? ' — Valid ✓' : ' — Perlu Review'}
                    </span>
                  </div>
                  {val.warnings?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {val.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-300 pl-6">• {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {/* Warning notice */}
              {hasWarnings && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Beberapa validasi gagal. Silakan review data di Excel sebelum digunakan. Baris yang bermasalah mungkin perlu koreksi manual.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex gap-3">
                  <a
                    href={getExcelDownloadUrl(result.token)}
                    download
                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                               bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20
                               active:scale-[0.98] transition-all duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Excel
                  </a>
                  <button
                    onClick={handleUploadToDrive}
                    disabled={isUploading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                               bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20
                               active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {isUploading ? 'Mengunggah...' : 'Kirim ke Drive'}
                  </button>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadAndUpload}
                    disabled={isUploading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
                               bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20
                               active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                  >
                    Download & Kirim ke Drive
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={isUploading}
                    className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold
                               border border-surface-200 dark:border-surface-800
                               text-surface-700 dark:text-surface-300
                               hover:bg-surface-100 dark:hover:bg-surface-800
                               transition-all duration-200 disabled:opacity-50"
                  >
                    Tutup / Nanti
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="p-4 rounded-2xl bg-rose-100 dark:bg-rose-900/20">
                <svg className="w-10 h-10 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">Gagal Mengkonversi</h3>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">{error}</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleRetry}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
                             bg-indigo-500 hover:bg-indigo-600 shadow-md shadow-indigo-500/20
                             transition-all duration-200"
                >
                  Coba Lagi
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold
                             border border-surface-200 dark:border-surface-800
                             text-surface-700 dark:text-surface-300
                             hover:bg-surface-100 dark:hover:bg-surface-800
                             transition-all duration-200"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
