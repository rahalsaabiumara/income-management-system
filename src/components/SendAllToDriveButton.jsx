import { useState, useCallback } from 'react';
import { sendAllFilesToDrive } from '../lib/api.js';

/**
 * SendAllToDriveButton — Sends all visible/filtered files to the target Google Drive folder.
 *
 * Props:
 *   filteredData: Array<{fileId, nama, namaStandar, ...}> — currently visible rows
 */
export default function SendAllToDriveButton({ filteredData = [] }) {
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [toast, setToast] = useState(null);
  const [progress, setProgress] = useState(null); // { sent, failed, total }

  const filesWithId = filteredData.filter((r) => r.fileId);

  const handleSend = useCallback(async () => {
    if (filesWithId.length === 0) return;

    // Confirmation dialog
    const confirmed = window.confirm(
      `Kirim ${filesWithId.length} file ke folder Google Drive tujuan?\n\nFile akan di-copy ke folder Drive yang sudah ditentukan.`
    );
    if (!confirmed) return;

    setState('sending');
    setToast(null);
    setProgress({ sent: 0, failed: 0, total: filesWithId.length });

    try {
      const files = filesWithId.map((r) => ({
        fileId: r.fileId,
        nama: r.nama || r.namaStandar,
      }));

      const result = await sendAllFilesToDrive(files);

      setProgress({ sent: result.sent, failed: result.failed, total: filesWithId.length });
      setState('done');

      if (result.failed > 0) {
        setToast({
          type: 'warning',
          message: `${result.sent} file berhasil dikirim, ${result.failed} gagal.`,
        });
      } else {
        setToast({
          type: 'success',
          message: `${result.sent} file berhasil dikirim ke Google Drive.`,
        });
      }

      setTimeout(() => setToast(null), 6000);
    } catch (err) {
      setState('error');
      setToast({
        type: 'error',
        message: `Gagal mengirim: ${err.message}`,
      });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setTimeout(() => {
        setState('idle');
        setProgress(null);
      }, 2000);
    }
  }, [filesWithId]);

  return (
    <>
      <button
        id="send-all-to-drive"
        onClick={handleSend}
        disabled={state === 'sending' || filesWithId.length === 0}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                    transition-all duration-200 shadow-sm
                    ${state === 'sending'
                      ? 'bg-emerald-400 text-white cursor-wait'
                      : filesWithId.length === 0
                        ? 'bg-surface-100 dark:bg-surface-800 text-surface-300 dark:text-surface-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-500/20 active:scale-[0.98]'
                    }`}
        title={filesWithId.length === 0 ? 'Tidak ada file dengan ID untuk dikirim' : `Kirim ${filesWithId.length} file ke Google Drive`}
      >
        {state === 'sending' ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Mengirim…
            {progress && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold bg-white/20">
                {progress.sent + progress.failed}/{progress.total}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Google Drive upload icon */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Kirim ke Drive
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
              : toast.type === 'warning'
                ? 'bg-amber-500/95 text-white'
                : 'bg-rose-500/95 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : toast.type === 'warning' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
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
