import { useState } from 'react';
import { triggerSync } from '../lib/api.js';

/**
 * SyncButton — Trigger sync from Google Drive → Master Sheet.
 * Shows loading state, success/error toast.
 */
export default function SyncButton({ onSyncComplete }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error', message }

  async function handleSync() {
    setIsLoading(true);
    setResult(null);
    try {
      const data = await triggerSync();
      setResult({
        type: 'success',
        message: `Sinkronisasi selesai: ${data.added} ditambah, ${data.updated} diupdate, ${data.skipped} dilewati.`,
      });
      onSyncComplete?.();
    } catch (err) {
      setResult({
        type: 'error',
        message: `Sinkronisasi gagal: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
      // Auto-dismiss toast after 5s
      setTimeout(() => setResult(null), 5000);
    }
  }

  return (
    <div className="relative">
      <button
        id="sync-button"
        onClick={handleSync}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                   bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700
                   disabled:opacity-60 disabled:cursor-not-allowed
                   shadow-md shadow-brand-500/20
                   transition-all duration-200"
      >
        {isLoading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Menyinkronkan…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Drive
          </>
        )}
      </button>

      {/* Toast notification */}
      {result && (
        <div
          className={`absolute top-full right-0 mt-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50
                     whitespace-nowrap animate-slide-up
                     ${result.type === 'success'
                       ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                       : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                     }`}
        >
          <div className="flex items-center gap-2">
            {result.type === 'success' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {result.message}
          </div>
        </div>
      )}
    </div>
  );
}
