import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { formatCompact, formatFull } from '../../lib/bi/calculations.js';
import { DEPTH_COLORS, getDepthTint } from '../../lib/bi/depthColors.js';

/** Solid gray for selected rows (same token the parent rows / sticky cells used before). */
const SELECTED_ROW_BG = '#F3F4F6';

/**
 * DataTable — Multi-year financial data table with hierarchy, expand/collapse,
 * depth-based accent bars, YoY badges, optional RKAP column, quarterly mode,
 * YTD mode, monthly mode, and row selection for bar chart filtering.
 *
 * Mode toggle and filter controls have been moved to the Topbar.
 * This component only renders the table header (title + currency label)
 * and the data rows.
 *
 * Props:
 *   tableRows: Array (annual mode rows with values keyed by year)
 *   quarterlyData: { columns, rows } (quarterly mode)
 *   ytdData: { columns, rows } (ytd mode)
 *   monthlyData: { columns, rows } (monthly mode)
 *   years: number[]
 *   rkapYear: number | null
 *   title: string
 *   sectionLabel: string
 *   searchTerm: string
 *   mode: 'annual' | 'quarterly' | 'ytd' | 'monthly'
 *   selectedYear: number (global filter year, for column highlighting)
 *   maxSelections: number (max selectable rows, default: 5)
 *   selectedRowKeys: Set<string>
 *   onRowSelect: (canonicalKey: string) => void
 */

export default function DataTable({
  tableRows,
  quarterlyData,
  ytdData,
  monthlyData,
  years,
  rkapYear,
  title,
  sectionLabel = '',
  searchTerm = '',
  mode = 'annual',
  selectedYear,
  maxSelections = 5,
  selectedRowKeys,
  onRowSelect,
  canReset = false,
  onReset,
}) {
  const isQuarterly = mode === 'quarterly';
  const isYTD = mode === 'ytd';
  const isMonthly = mode === 'monthly';
  const activeRows = isMonthly
    ? (monthlyData?.rows || [])
    : isYTD
      ? (ytdData?.rows || [])
      : isQuarterly
        ? (quarterlyData?.rows || [])
        : (tableRows || []);
  const quarterColumns = isQuarterly ? (quarterlyData?.columns || []) : [];
  const ytdColumns = isYTD ? (ytdData?.columns || []) : [];
  const monthlyColumns = isMonthly ? (monthlyData?.columns || []) : [];
  const useColumnar = isQuarterly || isYTD || isMonthly;

  if (activeRows.length === 0) {
    return (
      <div className="bg-white p-5 border border-[#E5E7EB] shadow-none flex items-center justify-center min-h-[200px]">
        <p className="text-gray-400 text-sm">Tidak ada data untuk tabel.</p>
      </div>
    );
  }

  const sortedYears = [...(years || [])].sort((a, b) => b - a);
  // In monthly mode, only show RKAP column when the selected year matches the RKAP year
  const monthlyYear = isMonthly && monthlyData?.rows?.[0]?.values ? Object.keys(monthlyData.rows[0].values).length : null;
  const showRkapInMode = isMonthly ? (selectedYear === rkapYear) : true;
  const hasRkap = showRkapInMode && rkapYear && activeRows.some(r => r.rkap && r.rkap[rkapYear] !== null && r.rkap[rkapYear] !== undefined);

  const isHierarchical = activeRows.some(r => r.depth !== undefined);

  const parentIds = useMemo(() => {
    if (!isHierarchical) return new Set();
    return new Set(activeRows.filter(r => r.hasChildren).map(r => r.id));
  }, [activeRows, isHierarchical]);

  const [expandedRows, setExpandedRows] = useState(() => new Set(parentIds));

  const toggleExpand = useCallback((rowId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const isRowVisible = useCallback((row) => {
    if (!isHierarchical) return true;
    if (row.depth === 0) return true;
    let currentParentId = row.parentId;
    while (currentParentId !== null && currentParentId !== undefined) {
      if (!expandedRows.has(currentParentId)) return false;
      const parentRow = activeRows.find(r => r.id === currentParentId);
      if (!parentRow) break;
      currentParentId = parentRow.parentId;
    }
    return true;
  }, [isHierarchical, expandedRows, activeRows]);

  const renderRows = useMemo(() => {
    let rows = activeRows;
    if (searchTerm) {
      rows = rows.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return rows;
  }, [activeRows, searchTerm]);

  const getSolidBg = (depth, hasAccent) => {
    if (!hasAccent) return '#ffffff';
    const color = DEPTH_COLORS[depth];
    if (!color) return '#ffffff';
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const mix = (c) => Math.round(255 + (c - 255) * 0.08);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  };

  const namedColumns = isMonthly ? monthlyColumns : isQuarterly ? quarterColumns : isYTD ? ytdColumns : [];

  const headerScrollRef = useRef(null);

  // ── Optional: highlight column matching global selectedYear ──
  const isYearHighlighted = useCallback((colKey) => {
    if (!selectedYear) return false;
    // For annual mode, colKey is the year number
    if (!useColumnar) return colKey === selectedYear;
    // For quarterly/YTD columns, check if the column label contains the year
    if (typeof colKey === 'string') return colKey.includes(String(selectedYear));
    return false;
  }, [selectedYear, useColumnar]);

  const colGroup = (
    <colgroup>
      <col style={{ width: '280px', minWidth: '280px' }} />
      {hasRkap && <col style={{ width: '110px', minWidth: '110px' }} />}
      {useColumnar ? (
        namedColumns.map(col => <col key={col.key} style={{ width: '110px', minWidth: '110px' }} />)
      ) : (
        sortedYears.map(y => <col key={y} style={{ width: '110px', minWidth: '110px' }} />)
      )}
    </colgroup>
  );

  return (
    <div className="bg-white border border-[#E5E7EB] shadow-none overflow-visible flex flex-col relative">
      {/* Table Header — title + currency label (mode toggle removed, now in Topbar) */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-200 sticky z-40 bg-white" style={{ top: 'calc(var(--topbar-h) + var(--chart-row-h))' }}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-sm font-semibold text-gray-900">{sectionLabel || title}</span>
        </div>
        <div className="flex items-center gap-3">
          {canReset && onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Kembali ke tampilan default"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>
          )}
          <span className="text-xs text-gray-400">Reporting Currency: <strong className="text-gray-600">IDR</strong></span>
        </div>
      </div>

      {/* Fixed Table Header (Native CSS Sticky for perfectly smooth vertical scroll) */}
      <div
        ref={headerScrollRef}
        className="overflow-hidden sticky z-30 bg-gray-50 border-b border-gray-200"
        style={{ top: 'calc(var(--topbar-h) + var(--chart-row-h) + 42px)' }}
      >
        <table className="w-full text-sm table-fixed" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          {colGroup}
          <thead>
            <tr className="bg-gray-50">
              <th
                className="px-5 py-3 text-left text-xs font-semibold text-gray-400"
                style={{
                  position: useColumnar ? 'sticky' : 'static',
                  left: useColumnar ? 0 : undefined,
                  zIndex: useColumnar ? 30 : 20,
                  backgroundColor: '#F9FAFB'
                }}
              >
                Uraian (Description)
              </th>
              {hasRkap && (
                <th className="px-2 py-3 text-right text-xs font-semibold text-gray-400">RKAP {rkapYear}</th>
              )}
              {useColumnar ? (
                namedColumns.map(col => {
                  const highlighted = isYearHighlighted(col.key);
                  return (
                    <th
                      key={col.key}
                      className={`px-2 py-3 text-right text-xs font-semibold whitespace-nowrap ${highlighted ? 'text-gray-700' : 'text-gray-400'}`}
                      style={highlighted ? { fontWeight: 700 } : undefined}
                    >
                      {col.label}
                    </th>
                  );
                })
              ) : (
                sortedYears.map(y => {
                  const highlighted = y === selectedYear;
                  return (
                    <th
                      key={y}
                      className={`px-2 py-3 text-right text-xs font-semibold ${highlighted ? 'text-gray-700' : 'text-gray-400'}`}
                      style={highlighted ? { fontWeight: 700 } : undefined}
                    >
                      {y}
                    </th>
                  );
                })
              )}
            </tr>
          </thead>
        </table>
      </div>

      {/* Table Body */}
      <div
        className="overflow-x-auto"
        onScroll={(e) => {
          if (headerScrollRef.current) {
            headerScrollRef.current.scrollLeft = e.target.scrollLeft;
          }
        }}
      >
        <table className="w-full text-sm table-fixed" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          {colGroup}
          <tbody>
            {renderRows.map((row, i) => {
              const depth = row.depth ?? 0;
              const hasChildren = row.hasChildren ?? false;
              const hasAccent = hasChildren || (row.accent === true);
              const isExpanded = expandedRows.has(row.id);
              const isVisible = searchTerm ? true : isRowVisible(row);
              const accentColor = row.color || (hasAccent ? DEPTH_COLORS[depth] || null : null);

              const indentPx = isHierarchical ? depth * 12 : (row.isTotal ? 0 : 12);
              const isSelected = selectedRowKeys && selectedRowKeys.has(row.canonical);
              const isMaxReached = selectedRowKeys && maxSelections && selectedRowKeys.size >= maxSelections;
              const isDisabled = !isSelected && isMaxReached;

              // Background follows the selection only: white when unselected (parents
              // included), solid gray when selected (parent or leaf). The sticky Uraian
              // cell uses the same opaque color so scrolled numbers never show through.
              const rowBg = isSelected ? SELECTED_ROW_BG : '#FFFFFF';
              const stickyBg = rowBg;
              const pyClass = isVisible ? (hasChildren ? 'py-2' : 'py-1.5') : 'py-0';

              let rowClasses = `transition-colors ${isVisible ? 'border-b border-gray-200' : 'border-none'}`;
              if (isDisabled) {
                rowClasses += ' cursor-not-allowed';
              } else if (isVisible) {
                rowClasses += ' cursor-pointer';
              }
              if (!isSelected && !isDisabled) {
                rowClasses += ' hover:bg-gray-50';
              }

              return (
                <tr
                  key={row.id || row.canonical || i}
                  className={rowClasses}
                  style={{ backgroundColor: isSelected ? SELECTED_ROW_BG : undefined }}
                  onClick={() => { if (isVisible && onRowSelect && !isDisabled) onRowSelect(row.canonical); }}
                  title={isDisabled ? `Maksimal ${maxSelections} pilihan. Unselect salah satu untuk memilih yang lain.` : undefined}
                >
                  {/* Uraian */}
                  <td
                    className={`px-5 relative transition-all duration-200 ease-in-out ${pyClass}`}
                    style={useColumnar ? {
                      position: 'sticky', left: 0, zIndex: 10, backgroundColor: stickyBg
                    } : {}}
                  >
                    {accentColor && (
                      <div
                        className={`absolute left-0 top-0 bottom-0 transition-all ${isSelected ? 'w-2' : 'w-1'}`}
                        style={{ backgroundColor: accentColor }}
                      />
                    )}
                    <div
                      className={`transition-all duration-200 ease-in-out overflow-hidden flex items-center gap-1.5 ${isVisible ? 'max-h-[100px] opacity-100' : 'max-h-0 opacity-0'}`}
                      style={{ paddingLeft: `${indentPx}px` }}
                    >
                      {hasChildren ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <svg
                            className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ) : (
                        isHierarchical && <div className="w-5 h-5 flex-shrink-0" />
                      )}
                      <span
                        className={`truncate ${hasAccent ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                        title={row.name}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>

                  {/* RKAP Column */}
                  {hasRkap && (
                    <td className={`px-2 text-right tabular-nums whitespace-nowrap transition-all duration-200 ease-in-out ${pyClass}`}>
                      <div className={`transition-all duration-200 ease-in-out overflow-hidden flex justify-end ${isVisible ? 'max-h-[100px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <CellValue value={row.rkap?.[rkapYear]} />
                      </div>
                    </td>
                  )}

                  {/* Value Columns */}
                  {useColumnar ? (
                    namedColumns.map(col => (
                      <td
                        key={col.key}
                        className={`px-2 text-right tabular-nums whitespace-nowrap transition-all duration-200 ease-in-out ${pyClass}`}
                      >
                        <div className={`transition-all duration-200 ease-in-out overflow-hidden flex justify-end ${isVisible ? 'max-h-[100px] opacity-100' : 'max-h-0 opacity-0'}`}>
                          <CellValue value={row.values[col.key]} yoy={row.yoyChanges?.[col.key]} />
                        </div>
                      </td>
                    ))
                  ) : (
                    sortedYears.map(y => (
                      <td
                        key={y}
                        className={`px-2 text-right tabular-nums whitespace-nowrap transition-all duration-200 ease-in-out ${pyClass}`}
                      >
                        <div className={`transition-all duration-200 ease-in-out overflow-hidden flex justify-end ${isVisible ? 'max-h-[100px] opacity-100' : 'max-h-0 opacity-0'}`}>
                          <CellValue value={row.values[y]} yoy={row.yoyChanges?.[y]} />
                        </div>
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellValue({ value, yoy }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col items-end justify-center w-full">
        <span className="text-gray-300">-</span>
        <div className="text-[10px] font-semibold mt-0.5 opacity-0 select-none pointer-events-none">0%</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end justify-center w-full">
      <span className="text-gray-900" title={formatFull(value)}>
        {(() => {
          const str = formatCompact(value);
          const match = str.match(/^(.*?)(Rb|Jt|M|T)$/);
          if (match) {
            return <>{match[1]}<span className="text-[0.8em]">{match[2]}</span></>;
          }
          return str;
        })()}
      </span>
      {yoy !== null && yoy !== undefined ? (
        <div className={`text-[10px] font-semibold mt-0.5 ${yoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
        </div>
      ) : (
        <div className="text-[10px] font-semibold mt-0.5 opacity-0 select-none pointer-events-none">0%</div>
      )}
    </div>
  );
}
