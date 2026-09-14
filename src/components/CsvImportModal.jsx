import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { parseLMName } from '../lib/dateParser.js';

/**
 * CsvImportModal — Upload & preview CSV before applying to Master data.
 *
 * • Drag & drop or click to upload
 * • Preview first rows with validation status
 * • Re-generates Nama Standar (ignores CSV column)
 * • Client-side only — no backend required
 */

const STATUS = {
  VALID: 'valid',
  WARNING: 'warning',
  ERROR: 'error',
};

function StatusBadge({ status }) {
  const styles = {
    [STATUS.VALID]:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    [STATUS.WARNING]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    [STATUS.ERROR]:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };
  const labels = {
    [STATUS.VALID]:   '✓ Valid',
    [STATUS.WARNING]: '⚠ Peringatan',
    [STATUS.ERROR]:   '✗ Error',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function CsvImportModal({ isOpen, onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null);
    setParsedRows([]);
    setPreview([]);
    setError('');
    setIsDragging(false);
    setIsImporting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [reset, onClose]);

  /**
   * Parse CSV and validate rows.
   * Expected columns: Tanggal, Nama, File [, Nama Standar (ignored)]
   */
  const processFile = useCallback((csvFile) => {
    setFile(csvFile);
    setError('');

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`Gagal parse CSV: ${results.errors[0].message}`);
          return;
        }

        const headers = results.meta.fields || [];
        // Flexible column matching
        const namaCol = headers.find((h) => /^nama$/i.test(h.trim()));
        const fileCol = headers.find((h) => /^file$/i.test(h.trim()) || /^link/i.test(h.trim()));

        if (!namaCol) {
          setError('Kolom "Nama" tidak ditemukan di CSV. Pastikan header CSV memiliki kolom Nama.');
          return;
        }

        const rows = results.data.map((row, idx) => {
          const nama = (row[namaCol] || '').trim();
          const link = fileCol ? (row[fileCol] || '').trim() : '';

          if (!nama && !link) {
            return { idx: idx + 1, nama, link, parsed: null, status: STATUS.ERROR, message: 'Kolom Nama & File kosong' };
          }

          // IMPORTANT: Always re-generate standard name from 'Nama',
          // NEVER trust 'Nama Standar' column from CSV
          const parsed = parseLMName(nama);

          if (!parsed) {
            return {
              idx: idx + 1, nama, link, parsed: null,
              status: STATUS.WARNING,
              message: 'Bulan tidak terdeteksi — disimpan tanpa standarisasi',
            };
          }

          return {
            idx: idx + 1, nama, link, parsed,
            status: STATUS.VALID,
            message: `→ ${parsed.namaStandar}`,
          };
        });

        setParsedRows(rows);
        setPreview(rows.slice(0, 15)); // Show first 15 rows in preview
      },
      error: (err) => {
        setError(`Gagal membaca file: ${err.message}`);
      },
    });
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv')) {
      processFile(droppedFile);
    } else {
      setError('Hanya file .csv yang diterima.');
    }
  }, [processFile]);

  const handleFileInput = useCallback((e) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  }, [processFile]);

  // Import action
  const handleImport = useCallback(async () => {
    setIsImporting(true);
    const importData = parsedRows
      .filter((r) => r.status !== STATUS.ERROR)
      .map((r) => ({
        tanggal: r.parsed?.tanggal || '',
        nama: r.nama,
        namaStandar: r.parsed?.namaStandar || r.nama,
        link: r.link,
        fileId: r.link ? extractFileIdSafe(r.link) : null,
      }));

    try {
      await onImport?.(importData);
      handleClose();
    } catch (err) {
      setError(`Import gagal: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  }, [parsedRows, onImport, handleClose]);

  // Stats
  const stats = {
    total: parsedRows.length,
    valid: parsedRows.filter((r) => r.status === STATUS.VALID).length,
    warning: parsedRows.filter((r) => r.status === STATUS.WARNING).length,
    error: parsedRows.filter((r) => r.status === STATUS.ERROR).length,
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-white dark:bg-surface-900 rounded-2xl shadow-2xl
                      border border-surface-200 dark:border-surface-800 flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-800">
          <div>
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100">Import CSV</h2>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">Upload file CSV hasil export Master Sheet</p>
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!file ? (
            /* ── Upload area ─────────────────────────────── */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
                         transition-all duration-300
                         ${isDragging
                           ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30 scale-[1.01]'
                           : 'border-surface-200 dark:border-surface-800 hover:border-brand-300 hover:bg-surface-50 dark:hover:bg-surface-900'
                         }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-2xl transition-colors duration-300
                  ${isDragging ? 'bg-brand-100 dark:bg-brand-900/30' : 'bg-surface-100 dark:bg-surface-800'}`}>
                  <svg className="w-8 h-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-surface-900 dark:text-surface-100">
                    {isDragging ? 'Lepas file di sini' : 'Drag & drop file CSV'}
                  </p>
                  <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    atau <span className="text-brand-500 font-medium">klik untuk pilih file</span>
                  </p>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Kolom yang diharapkan: <code className="bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">Tanggal, Nama, File</code>
                </p>
              </div>
            </div>
          ) : (
            /* ── Preview ─────────────────────────────────── */
            <div className="space-y-4">
              {/* File info + stats */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl
                             bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/30">
                    <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-sm text-surface-900 dark:text-surface-100">{file.name}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                    ✓ {stats.valid}
                  </span>
                  {stats.warning > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                      ⚠ {stats.warning}
                    </span>
                  )}
                  {stats.error > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-medium">
                      ✗ {stats.error}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-medium">
                    Total: {stats.total}
                  </span>
                </div>
              </div>

              {/* Nama Standar warning */}
              <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800
                             text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>
                  Kolom <strong>"Nama Standar"</strong> dari CSV <strong>diabaikan</strong>. Nama standar selalu
                  di-generate ulang dari kolom "Nama" untuk menghindari data yang nyasar.
                </span>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold w-10">#</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold">Nama (dari CSV)</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold">→ Nama Standar</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                    {preview.map((row) => (
                      <tr key={row.idx} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                        <td className="px-3 py-2 text-surface-500 dark:text-surface-400 font-medium">{row.idx}</td>
                        <td className="px-3 py-2 text-surface-900 dark:text-surface-100 font-mono text-xs">{row.nama || '—'}</td>
                        <td className="px-3 py-2 text-brand-600 dark:text-brand-400 font-medium text-xs">
                          {row.parsed?.namaStandar || row.message}
                        </td>
                        <td className="px-3 py-2 text-center"><StatusBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedRows.length > 15 && (
                <p className="text-xs text-center text-surface-500 dark:text-surface-400">
                  Menampilkan 15 dari {parsedRows.length} baris. Semua baris akan di-import.
                </p>
              )}

              {/* Change file */}
              <button
                onClick={reset}
                className="text-sm text-brand-500 hover:text-brand-600 font-medium transition-colors"
              >
                ← Pilih file lain
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800
                           text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-800
                       bg-surface-50 dark:bg-surface-900">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-surface-900 dark:text-surface-100
                       hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={!file || parsedRows.length === 0 || stats.valid === 0 || isImporting}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white
                       bg-brand-500 hover:bg-brand-600 active:bg-brand-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       shadow-md shadow-brand-500/20
                       transition-all duration-200
                       inline-flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Mengimport…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import {stats.valid + stats.warning} baris
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper — safe file ID extraction (no import needed for client-side)
function extractFileIdSafe(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}
