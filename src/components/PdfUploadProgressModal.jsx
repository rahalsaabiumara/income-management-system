import { useEffect, useState, useRef } from 'react';
import { uploadAndProcessPdf, getProcessStatus } from '../lib/api.js';

const STATUS_STEPS = [
  { id: 'UPLOADING_PDF', label: 'Mengunggah PDF ke Google Drive' },
  { id: 'PROCESSING', label: 'Memulai Proses' },
  { id: 'CONVERTING', label: 'Ekstrak & Konversi PDF' },
  { id: 'SAVING_EXCEL', label: 'Menyimpan Excel' },
  { id: 'UPLOADING_EXCEL_TO_DRIVE', label: 'Mengunggah Excel ke Drive' },
  { id: 'DRAFT_READY', label: 'Siap di-Review' }
];

const AUTO_CLOSE_SECONDS = 4;

export default function PdfUploadProgressModal({ file, onClose, onSuccess }) {
  const [status, setStatus] = useState('UPLOADING_PDF');
  const [lastStep, setLastStep] = useState('UPLOADING_PDF');
  const [details, setDetails] = useState({});
  const [error, setError] = useState(null);
  const [closeCountdown, setCloseCountdown] = useState(null);
  const hasStarted = useRef(false);
  // Ref (bukan variabel lokal efek) agar tetap benar di React StrictMode, yang menjalankan
  // efek mount → cleanup → mount; variabel lokal akan tertinggal bernilai false.
  const mountedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onCloseRef.current = onClose;
  }, [onSuccess, onClose]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS = 6 * 60 * 1000;

    async function startFlow() {
      try {
        // Step 1: Upload PDF
        setStatus('UPLOADING_PDF');
        setLastStep('UPLOADING_PDF');
        const res = await uploadAndProcessPdf(file);

        if (!mountedRef.current) return;

        const fileId = res.fileId;
        setStatus('PROCESSING');
        setLastStep('PROCESSING');
        const pollStartedAt = Date.now();

        // Step 2: Poll status (setTimeout berantai agar request tidak tumpang tindih)
        const poll = async () => {
          if (!mountedRef.current) return;
          let done = false;
          try {
            const currentStatus = await getProcessStatus(fileId);
            if (!mountedRef.current) return;

            // IDLE = status belum tercatat; tetap tampilkan langkah sebelumnya
            if (currentStatus.status && currentStatus.status !== 'IDLE') {
              setStatus(currentStatus.status);
              if (STATUS_STEPS.some(s => s.id === currentStatus.status)) {
                setLastStep(currentStatus.status);
              }
            }
            setDetails(currentStatus);

            if (['DRAFT_READY', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'].includes(currentStatus.status)) {
              done = true;
              if (currentStatus.status !== 'FAILED') {
                setLastStep('DRAFT_READY');
                if (onSuccessRef.current) onSuccessRef.current();
                // Jangan tutup otomatis bila ada tabel yang gagal — pengguna perlu membaca peringatannya
                const hasFailedTables = Array.isArray(currentStatus.failedTables) && currentStatus.failedTables.length > 0;
                if (!hasFailedTables) setCloseCountdown(AUTO_CLOSE_SECONDS);
              }
            }
          } catch (e) {
            console.error(e);
          }

          if (done || !mountedRef.current) return;
          if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
            setStatus('FAILED');
            setError('Proses ekstraksi melebihi batas waktu. PDF sudah tersimpan di Drive; silakan cek ReviewHub beberapa saat lagi atau unggah ulang.');
            return;
          }
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        };

        poll();
      } catch (err) {
        if (mountedRef.current) {
          setStatus('FAILED');
          setError(err.message || 'Gagal mengunggah PDF.');
        }
      }
    }

    startFlow();
  }, [file]);

  // Hitung mundur lalu tutup modal otomatis setelah berhasil
  useEffect(() => {
    if (closeCountdown === null) return undefined;
    if (closeCountdown <= 0) {
      if (onCloseRef.current) onCloseRef.current();
      return undefined;
    }
    const t = setTimeout(() => setCloseCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [closeCountdown]);

  const isFailed = status === 'FAILED';
  const activeStepIndex = STATUS_STEPS.findIndex(s => s.id === (isFailed ? lastStep : status));
  const isComplete = ['DRAFT_READY', 'SUCCESS', 'PARTIAL_SUCCESS'].includes(status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 dark:bg-surface-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-slide-up border border-surface-200 dark:border-surface-800">
        
        <div className="px-6 py-5 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
            Proses Upload & Ekstrak PDF
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
              {file.name}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              {isComplete ? 'Proses selesai' : isFailed ? 'Proses gagal' : 'Sedang memproses...'}
            </p>
          </div>

          <div className="space-y-4">
            {STATUS_STEPS.map((step, idx) => {
              const isPast = activeStepIndex > idx || isComplete;
              const isCurrent = activeStepIndex === idx && !isFailed && !isComplete;
              
              return (
                <div key={step.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center mt-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                      isPast
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : isCurrent
                        ? 'border-brand-500 text-brand-500'
                        : isFailed && activeStepIndex === idx
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-surface-200 dark:border-surface-700 text-surface-300 dark:text-surface-600'
                    }`}>
                      {isPast ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isFailed && activeStepIndex === idx ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : isCurrent ? (
                        <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                      ) : (
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      )}
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`w-0.5 h-6 my-1 ${isPast ? 'bg-brand-500' : 'bg-surface-200 dark:bg-surface-700'}`} />
                    )}
                  </div>
                  <div className="pt-0.5 flex-1">
                    <p className={`text-sm font-medium ${
                      isPast || isCurrent 
                        ? 'text-surface-900 dark:text-surface-100' 
                        : isFailed && activeStepIndex === idx
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-surface-400 dark:text-surface-600'
                    }`}>
                      {step.label}
                    </p>
                    {isCurrent && details.details && Object.keys(details.details).length > 0 && (
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                        {JSON.stringify(details.details)}
                      </p>
                    )}
                    {isFailed && activeStepIndex === idx && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1 break-words">
                        {error || details.error || 'Terjadi kesalahan sistem.'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isComplete && (
            <div
              role="status"
              aria-live="polite"
              className="mt-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/40"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm">
                <p className="font-semibold text-brand-800 dark:text-brand-200">Ekstraksi berhasil</p>
                <p className="text-brand-700 dark:text-brand-300 mt-0.5">
                  Draft Excel sudah tersimpan di Drive dan siap di-review di daftar dokumen.
                  {closeCountdown !== null && closeCountdown > 0 && ` Jendela ini tertutup otomatis dalam ${closeCountdown} detik.`}
                </p>
                {Array.isArray(details.failedTables) && details.failedTables.length > 0 && (
                  <p className="mt-2 text-amber-700 dark:text-amber-300">
                    Perhatian: tabel <strong>{details.failedTables.join(', ')}</strong> gagal diekstrak (layanan AI sedang sibuk),
                    sehingga sheet tersebut masih kosong di draft. Silakan lengkapi saat review atau unggah ulang nanti.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-surface-50 dark:bg-surface-800/50 border-t border-surface-100 dark:border-surface-800 flex justify-end">
          <button
            onClick={onClose}
            disabled={!isComplete && !isFailed}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              isComplete || isFailed
                ? 'bg-surface-900 dark:bg-white text-white dark:text-surface-900 hover:bg-surface-800 dark:hover:bg-surface-100'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-400 dark:text-surface-500 cursor-not-allowed'
            }`}
          >
            {isComplete ? 'Selesai' : isFailed ? 'Tutup' : 'Memproses...'}
          </button>
        </div>
      </div>
    </div>
  );
}
