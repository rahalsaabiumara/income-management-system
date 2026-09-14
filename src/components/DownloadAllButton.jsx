import { useState, useCallback } from 'react';
import { downloadAllLampiran } from '../lib/api.js';

/**
 * DownloadAllButton — Downloads all visible lampiran as a ZIP file.
 *
 * Props:
 *   filteredData: Array<{fileId, nama, namaStandar, ...}> — currently visible rows
 */
export default function DownloadAllButton({ filteredData = [] }) {
  const [state, setState] = useState('idle'); // idle | downloading | done | error
  const [toast, setToast] = useState(null);

  const filesWithId = filteredData.filter((r) => r.fileId);

  const handleDownload = useCallback(async () => {
    if (filesWithId.length === 0) return;

    setState('downloading');
    setToast(null);

    try {
      const files = filesWithId.map((r) => ({
        fileId: r.fileId,
        nama: r.nama,
        namaStandar: r.namaStandar,
      }));

      const blob = await downloadAllLampiran(files);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `Lampiran-LM-${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState('done');
      setToast({
        type: 'success',
        message: `ZIP berhasil diunduh — ${filesWithId.length} file diproses.`,
      });

      // Auto-dismiss toast after 6s
      setTimeout(() => setToast(null), 6000);
    } catch (err) {
      setState('error');
      setToast({
        type: 'error',
        message: `Gagal mengunduh: ${err.message}`,
      });
      setTimeout(() => setToast(null), 6000);
    } finally {
      // Reset to idle after a moment
      setTimeout(() => setState('idle'), 2000);
    }
  }, [filesWithId]);

  return (
    <>
      <button
        id="download-all-lampiran"
        onClick={handleDownload}
        disabled={state === 'downloading' || filesWithId.length === 0}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                    transition-all duration-200 shadow-sm
                    ${state === 'downloading'
                      ? 'bg-brand-400 text-white cursor-wait'
                      : filesWithId.length === 0
                        ? 'bg-surface-100 dark:bg-surface-800 text-surface-300 dark:text-surface-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-md shadow-brand-500/20 active:scale-[0.98]'
                    }`}
        title={filesWithId.length === 0 ? 'Tidak ada file dengan ID untuk diunduh' : `Download ${filesWithId.length} lampiran sebagai ZIP`}
      >
        {state === 'downloading' ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Memproses…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Semua Lampiran
            {filesWithId.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold bg-white/20">
                {filesWithId.length}
              </span>
            )}
          </>
        )}
      </button>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-slide-up">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl
            ${toast.type === 'success'
              ? 'bg-emerald-500/95 text-white'
              : 'bg-rose-500/95 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
