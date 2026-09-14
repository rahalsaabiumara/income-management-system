import { useEffect, useState } from 'react';
import { getProcessStatus, processReport } from '../lib/api.js';

const STATUS_STEPS = [
  { id: 'CONVERTING', label: 'Ekstrak & Konversi PDF' },
  { id: 'SAVING_EXCEL', label: 'Menyimpan Excel' },
  { id: 'TRANSFORMING_TABULAR', label: 'Transformasi Tabular' },
  { id: 'VALIDATING', label: 'Validasi Data' },
  { id: 'SYNCING_SPREADSHEET', label: 'Sinkronisasi ke Spreadsheet' }
];

export default function ProcessingModal({ report, onClose }) {
  const [status, setStatus] = useState('STARTING');
  const [details, setDetails] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let interval;
    let isMounted = true;

    async function startProcessing() {
      try {
        await processReport(report);
        
        interval = setInterval(async () => {
          if (!isMounted) return;
          try {
            const currentStatus = await getProcessStatus(report.fileId);
            setStatus(currentStatus.status);
            setDetails(currentStatus);

            if (['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'].includes(currentStatus.status)) {
              clearInterval(interval);
            }
          } catch (e) {
            console.error(e);
          }
        }, 2000);
      } catch (err) {
        if (isMounted) {
          setStatus('FAILED');
          setError(err.message);
        }
      }
    }

    startProcessing();

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [report]);

  const activeStepIndex = STATUS_STEPS.findIndex(s => s.id === status);
  const isComplete = ['SUCCESS', 'PARTIAL_SUCCESS'].includes(status);
  const isFailed = status === 'FAILED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 dark:bg-surface-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-slide-up border border-surface-200 dark:border-surface-800">
        
        <div className="px-6 py-5 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
            Memproses Data Tabular
          </h2>
          {isComplete || isFailed ? (
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="p-6">
          <div className="mb-6">
            <p className="text-sm font-medium text-surface-900 dark:text-surface-100 mb-1 truncate">
              {report.namaStandar || report.nama}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Proses ini melibatkan konversi PDF ke Excel, ekstraksi data, dan sinkronisasi ke Google Spreadsheet.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {STATUS_STEPS.map((step, idx) => {
              const isPast = activeStepIndex > idx || isComplete;
              const isCurrent = activeStepIndex === idx && !isComplete && !isFailed;
              
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    isPast ? 'bg-emerald-500 text-white' :
                    isCurrent ? 'bg-brand-500 text-white animate-pulse' :
                    'bg-surface-100 dark:bg-surface-800 text-surface-400'
                  }`}>
                    {isPast ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (idx + 1)}
                  </div>
                  <span className={`text-sm font-medium ${
                    isPast || isCurrent ? 'text-surface-900 dark:text-surface-100' : 'text-surface-400 dark:text-surface-600'
                  }`}>
                    {step.label}
                  </span>
                  {isCurrent && (
                    <div className="ml-auto w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                  )}
                </div>
              );
            })}
          </div>

          {isFailed && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 mb-6">
              <h4 className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-1">Proses Gagal</h4>
              <p className="text-sm text-rose-600 dark:text-rose-300">
                {error || details.error || 'Terjadi kesalahan sistem.'}
              </p>
            </div>
          )}

          {isComplete && details.summary && (
            <div className="p-4 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 mb-6">
              <h4 className="text-sm font-bold text-surface-900 dark:text-surface-100 mb-3">Ringkasan Sinkronisasi</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Total Diekstrak</p>
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{details.summary.totalExtracted}</p>
                </div>
                <div>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Gagal Validasi</p>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{details.summary.invalid}</p>
                </div>
                <div>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Data Baru (Insert)</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{details.summary.inserted}</p>
                </div>
                <div>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Data Diperbarui (Update)</p>
                  <p className="text-lg font-bold text-brand-600 dark:text-brand-400">{details.summary.updated}</p>
                </div>
              </div>
            </div>
          )}

          {isComplete && details.unmatched && details.unmatched.length > 0 && (
             <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 max-h-40 overflow-y-auto">
               <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">Beberapa baris dilewati:</h4>
               <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-disc pl-4">
                 {details.unmatched.slice(0, 10).map((u, i) => (
                   <li key={i}>{u.record.uraian} - {u.reasons.join(', ')}</li>
                 ))}
                 {details.unmatched.length > 10 && (
                   <li>...dan {details.unmatched.length - 10} lainnya.</li>
                 )}
               </ul>
             </div>
          )}

        </div>

        <div className="px-6 py-4 bg-surface-50 dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 flex justify-end">
          <button
            onClick={onClose}
            disabled={!isComplete && !isFailed}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              isComplete || isFailed
                ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-brand-500/25'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-400 cursor-not-allowed'
            }`}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
