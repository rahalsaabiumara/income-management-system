import { useState, useMemo, useEffect } from 'react';
import { sortKey, parseLMName } from '../lib/dateParser.js';
import ProcessingModal from './ProcessingModal.jsx';

/**
 * MasterTable — Main data table for Laporan Manajemen records.
 *
 * Features: sort by date, full-text search, year filter, pagination,
 * row actions (open in Drive, view Lampiran).
 */

const PAGE_SIZE = 25;

// Year badge colour palette
const YEAR_COLORS = {
  2020: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  2021: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
  2022: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300' },
  2023: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  2024: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  2025: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300' },
  2026: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
};

function getYearColor(tahun) {
  return YEAR_COLORS[tahun] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };
}

// Sort direction icons
function SortIcon({ direction }) {
  if (!direction) return (
    <svg className="w-4 h-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {direction === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );
}

// Skeleton loading row
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-surface-200 dark:bg-surface-800 rounded w-8" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-surface-200 dark:bg-surface-800 rounded w-28" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-surface-200 dark:bg-surface-800 rounded w-40" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-surface-200 dark:bg-surface-800 rounded w-24" /></td>
    </tr>
  );
}

export default function MasterTable({ data = [], isLoading = false, selectedRow, onSelectRow, onConvertExcel, onFilteredDataChange, uploadProps }) {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [sortDir, setSortDir] = useState('desc'); // desc = terbaru dulu
  const [page, setPage] = useState(1);
  const [processingReport, setProcessingReport] = useState(null);

  // Handle opening the processing modal
  const handleProcessTabular = (row) => {
    setProcessingReport(row);
  };

  // Parse all rows and enrich with sortKey
  const enrichedData = useMemo(() => {
    return data.map((row) => {
      const parsed = parseLMName(row.nama || row.namaStandar || '');
      return {
        ...row,
        parsed,
        _sortKey: sortKey(parsed),
      };
    });
  }, [data]);

  // Available years for filter dropdown
  const years = useMemo(() => {
    const set = new Set();
    enrichedData.forEach((r) => {
      if (r.parsed?.tahun) set.add(r.parsed.tahun);
    });
    return [...set].sort((a, b) => b - a);
  }, [enrichedData]);

  // Filter + search
  const filtered = useMemo(() => {
    let rows = enrichedData;

    // Year filter
    if (yearFilter !== 'all') {
      const yr = parseInt(yearFilter, 10);
      rows = rows.filter((r) => r.parsed?.tahun === yr);
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        (r.nama || '').toLowerCase().includes(q) ||
        (r.namaStandar || '').toLowerCase().includes(q) ||
        (r.tanggal || '').toLowerCase().includes(q)
      );
    }

    return rows;
  }, [enrichedData, yearFilter, search]);

  // Notify parent of filtered data changes (for Download All button)
  useEffect(() => {
    onFilteredDataChange?.(filtered);
  }, [filtered, onFilteredDataChange]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = a._sortKey - b._sortKey;
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [filtered, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  function toggleSort() {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  }

  // Reset page when filter changes
  function handleYearChange(e) {
    setYearFilter(e.target.value);
    setPage(1);
  }

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  return (
    <>
      <div className="animate-fade-in flex flex-col h-full p-4">
        {/* ── Toolbar ────────────────────────────────────── */}
        {uploadProps && (
          <div className="flex flex-col gap-2 mb-4">
            <label className={`flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-xl cursor-pointer transition-all shadow-sm ${uploadProps.isUploading ? 'bg-gray-400' : 'bg-brand-600 hover:bg-brand-700'}`}>
              {uploadProps.isUploading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {uploadProps.isUploading ? 'Mengunggah & Memproses...' : 'Upload PDF Laporan'}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={uploadProps.handlePdfUpload}
                disabled={uploadProps.isUploading}
              />
            </label>
            {uploadProps.uploadError && (
              <div className="text-xs text-rose-600 font-medium px-1">{uploadProps.uploadError}</div>
            )}
            {uploadProps.uploadSuccess && (
              <div className="text-xs text-emerald-600 font-medium px-1">{uploadProps.uploadSuccess}</div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 dark:text-surface-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="master-search"
              type="text"
              placeholder="Cari laporan…"
              value={search}
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200
                       bg-white text-sm text-gray-900
                       focus:ring-2 focus:ring-brand-400 focus:border-brand-400
                       transition-all duration-200
                       placeholder-gray-400"
            />
          </div>

          {/* Year filter */}
          <select
            id="year-filter"
            value={yearFilter}
            onChange={handleYearChange}
            className="px-4 py-2.5 rounded-xl border border-gray-200
                     bg-white text-sm font-medium text-gray-900
                     focus:ring-2 focus:ring-brand-400 focus:border-brand-400
                     transition-all duration-200 cursor-pointer min-w-[140px]"
          >
            <option value="all">Semua Tahun</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* ── Card List ──────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm p-2 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3 p-4 border rounded-xl bg-gray-50">
                <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            ))
          ) : paginated.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-12 h-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-base font-medium">Tidak ada data laporan</p>
                <p className="text-sm">Gunakan tombol <strong>Sync</strong> atau <strong>Import CSV</strong> untuk menambahkan data.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {paginated.map((row, idx) => {
                const isSelected = selectedRow?.fileId === row.fileId;
                const yc = row.parsed ? getYearColor(row.parsed.tahun) : null;

                return (
                  <li
                    key={row.fileId || idx}
                    onClick={() => onSelectRow?.(row)}
                    className={`cursor-pointer group p-4 rounded-xl border transition-all duration-200 ${isSelected
                      ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500'
                      : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {yc && (
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${yc.bg} ${yc.text}`}>
                            {row.parsed.tahun}
                          </span>
                        )}
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {row.tanggal || row.parsed?.tanggal || '—'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {row.link && (
                          <a
                            href={row.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Buka di Google Drive"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                        {row.fileId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProcessTabular(row);
                            }}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ekstrak & Sinkronisasi Data Tabular"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className={`text-sm font-bold leading-snug line-clamp-2 ${isSelected ? 'text-brand-900' : 'text-gray-800'}`}>
                      {row.namaStandar || row.parsed?.namaStandar || '—'}
                    </h4>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Pagination ────────────────────────────────── */}
        {!isLoading && sorted.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-surface-200 dark:text-surface-800">
            <span>
              Menampilkan {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, sorted.length)} dari {sorted.length} laporan
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (safeCurrentPage <= 4) {
                  pageNum = i + 1;
                } else if (safeCurrentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = safeCurrentPage - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200
                    ${safeCurrentPage === pageNum
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                        : 'hover:bg-gray-100 text-gray-600'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {processingReport && (
        <ProcessingModal
          report={processingReport}
          onClose={() => setProcessingReport(null)}
        />
      )}
    </>
  );
}
