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

export default function MasterTable({ data = [], isLoading = false, onViewLampiran, onConvertExcel, onFilteredDataChange }) {
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
      <div className="animate-fade-in">
        {/* ── Toolbar ────────────────────────────────────── */}
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
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-800
                       bg-white dark:bg-surface-900 text-sm
                       focus:ring-2 focus:ring-brand-400 focus:border-brand-400
                       transition-all duration-200
                       placeholder:text-surface-500 dark:placeholder:text-surface-400"
            />
          </div>

          {/* Year filter */}
          <select
            id="year-filter"
            value={yearFilter}
            onChange={handleYearChange}
            className="px-4 py-2.5 rounded-xl border border-surface-200 dark:border-surface-800
                     bg-white dark:bg-surface-900 text-sm font-medium
                     focus:ring-2 focus:ring-brand-400 focus:border-brand-400
                     transition-all duration-200 cursor-pointer min-w-[140px]"
          >
            <option value="all">Semua Tahun</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* ── Table ──────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-2xl border border-surface-200 dark:border-surface-800
                      bg-white dark:bg-surface-900 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
                <th className="px-4 py-3 text-left font-semibold text-surface-900 dark:text-surface-100 w-12">#</th>
                <th
                  className="px-4 py-3 text-left font-semibold text-surface-900 dark:text-surface-100 cursor-pointer select-none
                           hover:text-brand-600 dark:hover:text-brand-400 transition-colors group"
                  onClick={toggleSort}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Tanggal
                    <SortIcon direction={sortDir} />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-surface-900 dark:text-surface-100">Nama</th>
                <th className="px-4 py-3 text-center font-semibold text-surface-900 dark:text-surface-100 w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-surface-500 dark:text-surface-400">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-base font-medium">Tidak ada data laporan</p>
                      <p className="text-sm">Gunakan tombol <strong>Sync</strong> atau <strong>Import CSV</strong> untuk menambahkan data.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((row, idx) => {
                  const globalIdx = (safeCurrentPage - 1) * PAGE_SIZE + idx + 1;
                  const yc = row.parsed ? getYearColor(row.parsed.tahun) : null;
                  return (
                    <tr
                      key={row.fileId || idx}
                      className="hover:bg-brand-50/50 dark:hover:bg-brand-950/30 transition-colors duration-150"
                    >
                      <td className="px-4 py-3 tabular-nums text-surface-500 dark:text-surface-400 font-medium">{globalIdx}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-surface-900 dark:text-surface-100">
                          {row.tanggal || row.parsed?.tanggal || '—'}
                        </span>
                        {yc && (
                          <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${yc.bg} ${yc.text}`}>
                            {row.parsed.tahun}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-surface-900 dark:text-surface-100 font-medium max-w-[300px] truncate" title={row.namaStandar || row.parsed?.namaStandar || ''}>
                        {row.namaStandar || row.parsed?.namaStandar || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Lampiran button */}
                          {row.fileId && (
                            <button
                              id={`lampiran-${row.fileId}`}
                              onClick={() => onViewLampiran?.(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                       text-brand-600 dark:text-brand-400
                                       hover:bg-brand-100 dark:hover:bg-brand-900/40
                                       transition-all duration-200"
                              title="Lihat Lampiran"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              Lampiran
                            </button>
                          )}
                          {/* Drive link */}
                          {row.link && (
                            <a
                              href={row.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                       text-teal-600 dark:text-teal-400
                                       hover:bg-teal-100 dark:hover:bg-teal-900/40
                                       transition-all duration-200"
                              title="Buka di Google Drive"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Drive
                            </a>
                          )}
                          {/* Convert to Excel button */}
                          {row.fileId && (
                            <button
                              id={`excel-${row.fileId}`}
                              onClick={() => onConvertExcel?.(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                       text-indigo-600 dark:text-indigo-400
                                       hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                       transition-all duration-200"
                              title="Convert lampiran ke Excel"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Excel
                            </button>
                          )}
                          {/* Send to Drive button -> now Process Tabular */}
                          {row.fileId && (
                            <button
                              id={`send-drive-${row.fileId}`}
                              onClick={() => handleProcessTabular(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all duration-200"
                              title="Ekstrak & Sinkronisasi Data Tabular"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              Kirim
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
                        : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-900 dark:text-surface-100'
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
