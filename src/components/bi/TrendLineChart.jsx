import React, { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized,
  useXAxisScale, useYAxisScale, usePlotArea, useChartWidth,
} from 'recharts';
import { formatCompact } from '../../lib/bi/calculations.js';
import { MONTH_NAMES, TREND_COLORS } from '../../lib/bi/constants.js';

const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const LABEL_MIN_GAP = 14;      // px between end labels
const LABEL_MAX_CHARS = 18;    // end label truncation
const CHART_RIGHT_MARGIN = 72; // room for end labels

const hasVal = (v) => v !== null && v !== undefined && !Number.isNaN(v);
/** Same compact format as the table, with a space before the unit (e.g. "6.40 M"). */
const fmt = (v) => (hasVal(v) ? formatCompact(v).replace(/(Rb|Jt|M|T)$/, ' $1') : '-');
const fmtIndex = (v) => (hasVal(v) ? v.toFixed(1) : '-');
const toMonthMap = (arr) => new Map((arr || []).map(d => [d.month, d.value]));
const dataKeyOf = (id) => `s_${String(id).replace(/[^a-zA-Z0-9_]/g, '_')}`;
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Shared line style: 2px round stroke, 3.75px filled dots without white border. */
const lineStyle = (color) => ({
  type: 'monotone',
  stroke: color,
  strokeWidth: 2,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  dot: { r: 3.75, fill: color, stroke: 'none' },
  activeDot: { r: 5, fill: color, stroke: 'none' },
  connectNulls: true,
});

/**
 * Direct labels at the right of each series' last data point, with a simple
 * vertical de-collision pass (min LABEL_MIN_GAP px apart).
 */
function EndLabels({ data, series }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  const chartWidth = useChartWidth();
  if (!xScale || !yScale || !plot) return null;

  const labels = [];
  for (const s of series) {
    let idx = -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (hasVal(data[i][s.dataKey])) { idx = i; break; }
    }
    if (idx < 0) continue;
    const x = xScale(data[idx].name, { position: 'middle' });
    const y = yScale(data[idx][s.dataKey]);
    if (!hasVal(x) || !hasVal(y)) continue;
    labels.push({ ...s, x, y, ly: y });
  }

  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].ly - labels[i - 1].ly < LABEL_MIN_GAP) labels[i].ly = labels[i - 1].ly + LABEL_MIN_GAP;
  }
  const bottom = plot.y + plot.height;
  const overflow = labels.length ? labels[labels.length - 1].ly - bottom : 0;
  if (overflow > 0) labels.forEach(l => { l.ly -= overflow; });
  const topOverflow = labels.length ? plot.y - labels[0].ly : 0;
  if (topOverflow > 0) labels.forEach(l => { l.ly += topOverflow; });

  const rightLimit = (chartWidth || plot.x + plot.width + CHART_RIGHT_MARGIN) - 2;

  return (
    <g className="trend-end-labels" pointerEvents="none">
      {labels.map(l => {
        const text = truncate(l.label, LABEL_MAX_CHARS);
        const approxWidth = text.length * 5.8;
        const placeLeft = l.x + 8 + approxWidth > rightLimit;
        return (
          <text
            key={l.dataKey}
            x={placeLeft ? l.x - 8 : l.x + 8}
            y={l.ly}
            dy="0.35em"
            textAnchor={placeLeft ? 'end' : 'start'}
            fill={l.color}
            fontSize={10}
            fontWeight={600}
          >
            <title>{l.label}</title>
            {text}
          </text>
        );
      })}
    </g>
  );
}

/** Tooltip: month name, then each series with its signed value (and index in Indeks mode). */
function TrendTooltip({ active, payload, rows, showIndex }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  const visible = rows.filter(r => hasVal(entry[r.valueKey]));
  if (visible.length === 0) return null;
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-md text-xs min-w-[170px] max-w-[300px]">
      <p className="font-bold text-gray-900 mb-2">{MONTH_FULL[entry.month - 1] || entry.name}</p>
      <div className="space-y-1.5">
        {visible.map(r => (
          <div key={r.valueKey} className="flex justify-between items-start gap-3 text-gray-700">
            <span className="flex items-start gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full mt-[3px] flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="leading-snug">{r.label}</span>
            </span>
            <span className="text-right whitespace-nowrap">
              <span className={`font-semibold tabular-nums ${entry[r.valueKey] < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(entry[r.valueKey])}</span>
              {showIndex && r.indexKey && (
                <span className="block text-[10px] text-gray-400 tabular-nums">Indeks {fmtIndex(entry[r.indexKey])}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, bold, color, icon }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm tabular-nums ${bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`} style={color ? { color } : undefined}>
        {icon && <span className="mr-0.5">{icon}</span>}{value}
      </p>
    </div>
  );
}

/**
 * TrendLineChart — Monthly trend for the selected year, driven by the table selection.
 *
 * View is chosen by the number of items:
 *   1 item  → View A "Realisasi vs RKAP" (solid Realisasi + dashed RKAP)
 *   ≥2 items → View B "Perbandingan uraian" (realisasi only, one line per item,
 *              scale toggle Nilai | Indeks (Jan = 100))
 *
 * Props:
 *   items: Array<{ key, label, color? }> — selected rows (default row when nothing selected)
 *   availableYears: number[]
 *   selectedYear: number
 *   onYearChange: (year) => void
 *   getMonthlyDataForKey: (key, jenis, overrideYear?) => Array<{ month, value }>
 *   onRemoveItem: (key) => void — same as re-clicking the row in the table
 *   notice: string | null — transient message (e.g. selection limit)
 */
export default function TrendLineChart({
  items = [],
  availableYears, selectedYear, onYearChange,
  getMonthlyDataForKey,
  onRemoveItem,
  notice,
}) {
  const isCompare = items.length >= 2;
  const primary = items[0] || null;

  const [showRealisasi, setShowRealisasi] = useState(true);
  const [showRkap, setShowRkap] = useState(true);
  const [scaleMode, setScaleMode] = useState('value'); // 'value' | 'index'

  // Realisasi series per item (original signed values)
  const series = useMemo(() => items.map((it, i) => ({
    ...it,
    dataKey: dataKeyOf(it.key),
    indexKey: `${dataKeyOf(it.key)}__idx`,
    color: it.color || TREND_COLORS.compare[i % TREND_COLORS.compare.length],
    real: toMonthMap(getMonthlyDataForKey(it.key, 'REALISASI')),
  })), [items, getMonthlyDataForKey]);

  // RKAP only for View A
  const rkapMap = useMemo(() => (
    !isCompare && primary ? toMonthMap(getMonthlyDataForKey(primary.key, 'RKAP')) : new Map()
  ), [isCompare, primary, getMonthlyDataForKey]);

  // Index (Jan = 100) needs a positive January value on every series
  const indexAllowed = isCompare && series.every(s => hasVal(s.real.get(1)) && s.real.get(1) > 0);
  useEffect(() => {
    if (scaleMode === 'index' && !indexAllowed) setScaleMode('value');
  }, [scaleMode, indexAllowed]);
  const isIndex = isCompare && scaleMode === 'index' && indexAllowed;

  const chartData = useMemo(() => MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    const entry = { name, month };
    if (isCompare) {
      for (const s of series) {
        const v = s.real.get(month);
        entry[s.dataKey] = hasVal(v) ? v : null;
        const jan = s.real.get(1);
        entry[s.indexKey] = hasVal(v) && hasVal(jan) && jan > 0 ? (v / jan) * 100 : null;
      }
    } else if (series[0]) {
      const v = series[0].real.get(month);
      entry.realisasi = hasVal(v) ? v : null;
      const r = rkapMap.get(month);
      entry.rkap = hasVal(r) ? r : null;
    }
    return entry;
  }), [isCompare, series, rkapMap]);

  // View A summary (always from realisasi)
  const summary = useMemo(() => {
    if (isCompare || !primary) return null;
    const pts = chartData.filter(d => hasVal(d.realisasi));
    const total = pts.reduce((s, d) => s + d.realisasi, 0);
    const avg = pts.length > 0 ? total / pts.length : 0;
    const peak = pts.length > 0 ? pts.reduce((best, d) => (d.realisasi > best.realisasi ? d : best), pts[0]) : null;
    const prevData = getMonthlyDataForKey(primary.key, 'REALISASI', selectedYear - 1);
    const prevTotal = prevData ? prevData.reduce((s, d) => s + (d.value || 0), 0) : 0;
    const yoyGrowth = prevTotal !== 0 ? ((total - prevTotal) / Math.abs(prevTotal)) * 100 : null;
    return { total, avg, peakMonth: peak ? peak.name : '-', yoyGrowth };
  }, [isCompare, primary, chartData, selectedYear, getMonthlyDataForKey]);

  // View B per-item totals
  const compareTotals = useMemo(() => (isCompare ? series.map(s => {
    const vals = [...s.real.values()].filter(hasVal);
    return { key: s.key, total: vals.length ? vals.reduce((a, b) => a + b, 0) : null };
  }) : []), [isCompare, series]);

  // What is drawn
  const realHas = chartData.some(d => hasVal(d.realisasi));
  const rkapHas = chartData.some(d => hasVal(d.rkap));
  const hasAnyData = isCompare
    ? series.some(s => chartData.some(d => hasVal(d[s.dataKey])))
    : (showRealisasi && realHas) || (showRkap && rkapHas);

  // Y axis
  let yAxisProps;
  if (!isCompare) {
    yAxisProps = { scale: 'symlog', domain: ['auto', 'auto'], tickFormatter: v => formatCompact(v) };
  } else if (isIndex) {
    yAxisProps = { domain: ['auto', 'auto'], tickFormatter: v => Number(v).toFixed(0) };
  } else {
    const vals = series.flatMap(s => chartData.map(d => d[s.dataKey]).filter(hasVal));
    const minVal = vals.length ? Math.min(...vals) : 0;
    yAxisProps = { domain: [Math.min(0, minVal), 'auto'], tickFormatter: v => formatCompact(v) };
  }

  // Tooltip rows + end labels
  const tooltipRows = isCompare
    ? series.map(s => ({ valueKey: s.dataKey, indexKey: s.indexKey, label: s.label, color: s.color }))
    : [
      ...(showRealisasi ? [{ valueKey: 'realisasi', label: 'Realisasi', color: TREND_COLORS.realisasi }] : []),
      ...(showRkap ? [{ valueKey: 'rkap', label: 'RKAP', color: TREND_COLORS.rkap }] : []),
    ];
  const labelSeries = isCompare
    ? series.map(s => ({ dataKey: isIndex ? s.indexKey : s.dataKey, label: s.label, color: s.color }))
    : tooltipRows.map(r => ({ dataKey: r.valueKey, label: r.label, color: r.color }));

  // Header text
  const title = isCompare ? 'Perbandingan tren realisasi' : `Tren ${primary?.label || ''}`;
  const chip = isCompare ? 'Perbandingan uraian' : 'Realisasi vs RKAP';
  const subtitle = isCompare
    ? `${items.length} uraian · klik × pada ringkasan untuk melepas`
    : 'Realisasi vs RKAP · klik baris tabel untuk membandingkan';

  // At least one of Realisasi / RKAP stays active
  const toggleRealisasi = () => { if (showRealisasi && !showRkap) return; setShowRealisasi(v => !v); };
  const toggleRkap = () => { if (showRkap && !showRealisasi) return; setShowRkap(v => !v); };

  return (
    <div className="relative p-5 flex-1 flex flex-col min-h-[338px]">
      {/* Header — single row: title + chip | controls | year */}
      <div className="flex items-start justify-between gap-2 mb-3 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate" title={title}>{title}</h3>
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 whitespace-nowrap">{chip}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate" title={subtitle}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isCompare ? (
            <div className="flex items-center rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Skala">
              <button
                id="trend-scale-value"
                onClick={() => setScaleMode('value')}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${!isIndex ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Nilai
              </button>
              <button
                id="trend-scale-index"
                onClick={() => indexAllowed && setScaleMode('index')}
                disabled={!indexAllowed}
                title={indexAllowed ? 'Tiap seri dibagi nilai Januari × 100' : 'Indeks butuh nilai Januari positif'}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${isIndex ? 'bg-gray-800 text-white' : indexAllowed ? 'text-gray-500 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
              >
                Indeks (Jan = 100)
              </button>
            </div>
          ) : (
            <>
              <button
                id="trend-toggle-realisasi"
                onClick={toggleRealisasi}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${showRealisasi ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={showRealisasi ? { backgroundColor: TREND_COLORS.realisasi } : undefined}
              >
                Realisasi
              </button>
              <button
                id="trend-toggle-rkap"
                onClick={toggleRkap}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${showRkap ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={showRkap ? { backgroundColor: TREND_COLORS.rkap } : undefined}
              >
                RKAP
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transient notice (floating — does not change card height) */}
      {notice && (
        <div
          role="status"
          className="absolute left-5 top-[62px] z-20 px-2.5 py-1 rounded-full bg-gray-900/90 text-white text-[11px] font-semibold shadow-md pointer-events-none"
        >
          {notice}
        </div>
      )}

      {/* Chart — fills the space left by header + legend, never below a readable minimum */}
      <div className="flex-1 min-h-[140px]">
        {!hasAnyData ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400 text-sm">Belum ada data bulanan untuk tahun ini</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: CHART_RIGHT_MARGIN, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRealisasi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TREND_COLORS.realisasi} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={TREND_COLORS.realisasi} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRkap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TREND_COLORS.rkap} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={TREND_COLORS.rkap} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
              />
              <YAxis
                {...yAxisProps}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                width={75}
              />
              <Tooltip
                content={<TrendTooltip rows={tooltipRows} showIndex={isIndex} />}
                cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '3 3' }}
              />

              {!isCompare && showRealisasi && (
                <Area {...lineStyle(TREND_COLORS.realisasi)} dataKey="realisasi" name="Realisasi" fill="url(#gradRealisasi)" />
              )}
              {!isCompare && showRkap && (
                <Area {...lineStyle(TREND_COLORS.rkap)} dataKey="rkap" name="RKAP" strokeDasharray="6 4" fill="url(#gradRkap)" />
              )}
              {isCompare && series.map(s => (
                <Line key={s.dataKey} {...lineStyle(s.color)} dataKey={isIndex ? s.indexKey : s.dataKey} name={s.label} />
              ))}

              <Customized component={<EndLabels data={chartData} series={labelSeries} />} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom strip — View A: summary stats; View B: per-uraian legend with ×
          (multi-column grid, max 4 rows, scrolls inside when longer) */}
      {isCompare ? (
        <div className="flex-shrink-0 mt-2 pt-2 border-t border-gray-100">
          <div className="trend-legend">
            {series.map(s => {
              const total = compareTotals.find(t => t.key === s.key)?.total ?? null;
              return (
                <div key={s.key} className="flex items-center gap-1.5 min-w-0 text-[11px]">
                  <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-gray-700 flex-1 min-w-0" title={s.label}>{s.label}</span>
                  <span className="tabular-nums font-semibold text-gray-900 whitespace-nowrap" title={`Total ${selectedYear}`}>{fmt(total)}</span>
                  {onRemoveItem && (
                    <button
                      onClick={() => onRemoveItem(s.key)}
                      aria-label={`Lepas ${s.label}`}
                      title="Lepas uraian ini"
                      className="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0 leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6 mt-3 pt-3 border-t border-gray-100 flex-shrink-0">
          <SummaryStat label={`Total ${selectedYear}`} value={formatCompact(summary?.total ?? 0)} bold />
          <SummaryStat
            label="YoY Growth"
            value={summary?.yoyGrowth != null ? `${summary.yoyGrowth >= 0 ? '+' : ''}${summary.yoyGrowth.toFixed(1)}%` : '-'}
            color={summary?.yoyGrowth != null ? (summary.yoyGrowth >= 0 ? '#2FA84A' : '#DC2626') : undefined}
            icon={summary?.yoyGrowth != null ? (summary.yoyGrowth >= 0 ? '↗' : '↘') : undefined}
          />
          <SummaryStat label="Monthly Avg" value={formatCompact(summary?.avg ?? 0)} />
          <SummaryStat label="Peak Month" value={summary?.peakMonth ?? '-'} />
        </div>
      )}
    </div>
  );
}
