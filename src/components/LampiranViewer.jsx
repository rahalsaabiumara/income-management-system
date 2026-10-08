import { useState, useCallback, useEffect, useRef } from 'react';
import { getTabelLmInfo, getTabelLmPageUrl } from '../lib/api.js';

/**
 * LampiranViewer (Tabel LM) — Modal to preview the 4 target tables
 * extracted from an LM PDF.
 */
export default function LampiranViewer({ isOpen, onClose, row, inline, onConvertExcel, onProcessTabular, role }) {
  const [state, setState] = useState('loading'); // loading | preview | error
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('PDPT');

  const tabs = [
    { id: 'PDPT', label: 'Pendapatan' },
    { id: 'LR', label: 'Laba Rugi' },
    { id: 'NERACA', label: 'Neraca' },
    { id: 'ARUS_KAS', label: 'Arus Kas' },
  ];

  // Fetch tabel-lm info when opened
  useEffect(() => {
    if (!isOpen || !row?.fileId) return;

    setState('loading');
    setInfo(null);
    setError('');
    setActiveTab('PDPT');

    getTabelLmInfo(row.fileId)
      .then((data) => {
        setInfo(data);
        if (data.detected) {
          // Set active tab to the first one that has a page
          const firstAvailable = tabs.find(t => data.pages[t.id]);
          if (firstAvailable) {
            setActiveTab(firstAvailable.id);
          }
          setState('preview');
        } else {
          setError('Tabel Laporan Manajemen tidak ditemukan secara otomatis.');
          setState('error');
        }
      })
      .catch((err) => {
        setError(err.message);
        setState('error');
      });
  }, [isOpen, row?.fileId]);

  const handleClose = useCallback(() => {
    setState('loading');
    setInfo(null);
    setError('');
    onClose?.();
  }, [onClose]);

  if (!isOpen) return null;

  const content = (
    <div className={inline ? "flex-1 flex flex-col h-full bg-white relative" : "relative w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col animate-slide-up overflow-hidden"}>
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 truncate">
              Tabel LM — {row?.namaStandar || row?.nama || 'Dokumen'}
            </h2>
            {info?.detected && (
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
                Ditemukan {info.foundCount} dari 4 tabel target
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {/* Inline Action Buttons (for when used in Dashboard) */}
            {inline && (
              <>
                {onConvertExcel && (
                  <button
                    onClick={() => onConvertExcel(row)}
                    className="p-2 sm:px-3 sm:py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors hidden sm:block"
                  >
                    Convert Excel
                  </button>
                )}
                {onProcessTabular && (
                  <button
                    onClick={() => onProcessTabular(row)}
                    className="p-2 sm:px-3 sm:py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors hidden sm:block"
                  >
                    Ekstrak Tabular
                  </button>
                )}
              </>
            )}
            
            {!inline && (
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Loading state */}
          {state === 'loading' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-500">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-base font-medium text-gray-900">Mencari Tabel Target…</p>
                <p className="text-sm mt-1">Memeriksa halaman PDF untuk 4 tabel laporan manajemen</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-8">
              <div className="p-4 rounded-2xl bg-rose-100">
                <svg className="w-10 h-10 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center max-w-md">
                <h3 className="text-lg font-bold text-gray-900">Gagal mendeteksi tabel</h3>
                <p className="text-sm text-gray-500 mt-2">{error}</p>
              </div>
            </div>
          )}

          {/* Preview state (Sidebar + Iframe) */}
          {/* Preview state (Sidebar + Iframe) */}
          {state === 'preview' && (
            <>
              {/* Sidebar Tabs */}
              <div className="w-64 border-r border-gray-200 bg-gray-50/50 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Daftar Tabel
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {tabs.map(tab => {
                    const pageNum = info.pages[tab.id];
                    const isFound = pageNum != null;
                    const isActive = activeTab === tab.id;
                    
                    return (
                      <button
                        key={tab.id}
                        onClick={() => isFound && setActiveTab(tab.id)}
                        disabled={!isFound}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all
                          ${isActive ? 'bg-brand-50 shadow-sm border border-brand-200' : 
                            isFound ? 'hover:bg-gray-100 border border-transparent' : 
                            'opacity-50 cursor-not-allowed border border-transparent'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${isFound ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className={`text-sm font-medium ${isActive ? 'text-brand-700' : 'text-gray-700'}`}>
                            {tab.label}
                          </span>
                        </div>
                        {isFound && (
                          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-md">
                            Hal {pageNum}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Preview Area */}
              <div className="flex-1 bg-gray-100 relative">
                {info.pages[activeTab] ? (
                  <iframe
                    key={activeTab} // Force re-render on tab change
                    src={`${getTabelLmPageUrl(row.fileId, info.pages[activeTab])}#toolbar=0&navpanes=0&view=FitH`}
                    className="w-full h-full border-0"
                    title={`Preview ${activeTab}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <p>Halaman tidak ditemukan.</p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
  );
  
  if (inline) {
    return content;
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      {content}
    </div>
  );
}
