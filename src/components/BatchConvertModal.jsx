import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { convertToExcel, downloadExcelZip, uploadExcelBatch } from '../lib/api';

export default function BatchConvertModal({ isOpen, onClose, data }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState(null);

  // Filter files by the selected year. Only pick files that have valid fileId and parseable name.
  const targetFiles = React.useMemo(() => {
    return data.filter(item => {
      if (!item.fileId) return false;
      if (item.namaStandar && item.namaStandar.includes(String(selectedYear))) return true;
      if (item.nama && item.nama.includes(String(selectedYear))) return true;
      return false;
    });
  }, [data, selectedYear]);

  // Extract available years from data
  const availableYears = React.useMemo(() => {
    const years = new Set();
    data.forEach(item => {
      const match = (item.namaStandar || item.nama || '').match(/\b(20\d{2})\b/);
      if (match) years.add(parseInt(match[1], 10));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
        setSelectedYear(availableYears[0]);
      }
      setIsProcessing(false);
      setIsUploading(false);
      setCurrentIndex(0);
      setResults([]);
      setIsDone(false);
      setError(null);
    }
  }, [isOpen, selectedYear, availableYears]);

  const startBatchProcess = async () => {
    setIsProcessing(true);
    setError(null);
    setResults([]);
    setCurrentIndex(0);

    const tempResults = [];

    for (let i = 0; i < targetFiles.length; i++) {
      setCurrentIndex(i);
      const file = targetFiles[i];

      try {
        // Attempt conversion (or read from cache)
        const res = await convertToExcel(file.fileId, {
          nama: file.nama,
          namaStandar: file.namaStandar
        });

        tempResults.push({
          fileId: file.fileId,
          nama: file.nama,
          status: 'success',
          token: res.token,
          cached: res.cached,
          filename: res.filename
        });

        // Throttle delay to respect Gemini RPM, ONLY if we actually hit Gemini (cached === false)
        if (!res.cached && i < targetFiles.length - 1) {
          await new Promise(r => setTimeout(r, 16000));
        }

      } catch (err) {
        tempResults.push({
          fileId: file.fileId,
          nama: file.nama,
          status: 'error',
          error: err.message
        });
      }

      setResults([...tempResults]);
    }

    setIsProcessing(false);
    setIsDone(true);
  };

  const downloadZip = async () => {
    const tokens = results.filter(r => r.status === 'success' && r.token).map(r => r.token);
    if (tokens.length === 0) {
      setError('Tidak ada file berhasil dikonversi untuk di-download.');
      return;
    }

    try {
      const blob = await downloadExcelZip(tokens, String(selectedYear));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Tabel-LM-Batch-${selectedYear}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadToDrive = async () => {
    const tokens = results.filter(r => r.status === 'success' && r.token).map(r => r.token);
    if (tokens.length === 0) {
      setError('Tidak ada file berhasil dikonversi untuk di-upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const res = await uploadExcelBatch(tokens);
      if (res.success) {
        alert(`Berhasil mengunggah ${res.results.length} file Excel ke Google Drive.`);
      } else {
        setError(`Terjadi error saat upload: ${res.errors.map(e => e.error).join(', ')}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAndUpload = async () => {
    await downloadZip();
    await uploadToDrive();
  };

  return (
    <Dialog open={isOpen} onClose={() => { if (!isProcessing && !isUploading) onClose(); }} className="relative z-50">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

          <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <Dialog.Title className="text-xl font-bold text-gray-900">
                Batch Excel Convert & Upload
              </Dialog.Title>
              {!isProcessing && !isDone && !isUploading && availableYears.length > 0 && (
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing || isUploading}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <div className="mb-6">
              <p className="text-gray-600 text-sm mb-2">
                Ditemukan <strong>{targetFiles.length} file</strong> Laporan Manajemen pada tahun {selectedYear}.
              </p>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex gap-2 items-start mt-4">
                  <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>

            {targetFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Tidak ada file Laporan Manajemen untuk tahun {selectedYear}.
              </div>
            ) : (
              <div className="space-y-4">
                {isProcessing || isDone ? (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                      <span>Progres Antrean</span>
                      <span>{results.length} / {targetFiles.length} Selesai</span>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(results.length / targetFiles.length) * 100}%` }}
                      ></div>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {targetFiles.map((f, idx) => {
                        const result = results[idx];
                        const isCurrent = idx === currentIndex && isProcessing;
                        const isWaiting = idx > currentIndex && isProcessing;

                        return (
                          <div key={f.fileId} className="flex items-center justify-between text-sm p-2 rounded bg-white border border-gray-100 shadow-sm">
                            <span className="truncate flex-1 pr-4 font-medium text-gray-700">{f.nama}</span>
                            <div className="shrink-0 flex items-center">
                              {result ? (
                                result.status === 'success' ? (
                                  <span className="flex items-center text-green-600 text-xs font-semibold bg-green-50 px-2 py-1 rounded">
                                    <CheckCircleIcon className="w-4 h-4 mr-1" /> {result.cached ? 'Sukses (Cached)' : 'Sukses'}
                                  </span>
                                ) : (
                                  <span className="flex items-center text-red-600 text-xs font-semibold bg-red-50 px-2 py-1 rounded">
                                    <ExclamationTriangleIcon className="w-4 h-4 mr-1" /> Error
                                  </span>
                                )
                              ) : isCurrent ? (
                                <span className="flex items-center text-blue-600 text-xs font-semibold animate-pulse">
                                  Memproses...
                                </span>
                              ) : isWaiting ? (
                                <span className="text-gray-400 text-xs">Menunggu</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Pending</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              disabled={isProcessing || isUploading}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Tutup
            </button>

            {isDone ? (
              <>
                <button
                  onClick={downloadZip}
                  disabled={isUploading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm transition-all"
                >
                  Unduh ZIP
                </button>
                <button
                  onClick={uploadToDrive}
                  disabled={isUploading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all flex items-center"
                >
                  {isUploading ? 'Mengunggah...' : 'Upload ke Drive'}
                </button>
                <button
                  onClick={handleDownloadAndUpload}
                  disabled={isUploading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-all flex items-center"
                >
                  Unduh ZIP & Upload ke Drive
                </button>
              </>
            ) : (
              <button
                onClick={startBatchProcess}
                disabled={isProcessing || targetFiles.length === 0}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all flex items-center"
              >
                {isProcessing ? 'Memproses Antrean...' : 'Cek Status & Konversi'}
              </button>
            )}
          </div>

        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
