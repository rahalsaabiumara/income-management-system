import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Rectangle,
} from 'recharts';
import { createPortal } from 'react-dom';
import { formatCompact, formatFull } from '../../lib/bi/calculations.js';

const signed = (v) => (v > 0 ? `+${formatFull(v)}` : formatFull(v));

/** Tooltip: year → per type: segments (uraian + signed original value) + absolute total. */
function BreakdownTooltip({ active, payload, label, types, periodNote }) {
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    // Anchor tooltip below the chart card; follow cursor horizontally only.
    const updateMouse = (e) => {
      const card = e.target?.closest?.('[data-chart-card]');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const w = tipRef.current?.offsetWidth || 0;
      const margin = 8;
      const minX = margin + w / 2;
      const maxX = document.documentElement.clientWidth - margin - w / 2;
      const cx = Math.min(Math.max(e.clientX, minX), Math.max(minX, maxX));
      setPos({ x: cx + window.scrollX, y: rect.bottom + window.scrollY + 8 });
    };
    window.addEventListener('mousemove', updateMouse);
    return () => window.removeEventListener('mousemove', updateMouse);
  }, [active]);

  if (!active || !payload || payload.length === 0 || !pos) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  const groups = types
    .map(type => {
      const segs = type.segments.filter(s => entry.__raw?.[s.dataKey] !== undefined);
      const total = segs.reduce((sum, s) => sum + Math.abs(entry.__raw[s.dataKey]), 0);
      return { type, segs, total };
    })
    .filter(g => g.segs.length > 0);

  if (groups.length === 0) return null;

  return createPortal(
    <div
      ref={tipRef}
      className="bg-white p-3 rounded-lg border border-gray-200 shadow-xl text-xs min-w-[240px] max-w-[340px] pointer-events-none"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translateX(-50%)',
        zIndex: 999999
      }}
    >
      <p className="font-bold text-gray-900 mb-2">
        {label}
        {(entry.__note || periodNote) && (
          <span className={`ml-1.5 font-semibold text-[10px] px-1.5 py-0.5 rounded ${entry.__fallback ? 'text-amber-700 bg-amber-100' : 'text-[#2FA84A] bg-[#2FA84A]/10'}`}>
            {entry.__note || periodNote}
          </span>
        )}
      </p>
      <div className="space-y-2.5">
        {groups.map(({ type, segs, total }) => (
          <div key={type.key}>
            <div className="flex justify-between items-center font-semibold text-gray-900 border-b border-gray-100 pb-1 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
                {type.label}
              </span>
              <span className="ml-4 tabular-nums">{formatFull(total)}</span>
            </div>
            <div className="space-y-1">
              {segs.map(s => {
                const v = entry.__raw[s.dataKey];
                return (
                  <div key={s.dataKey} className="flex justify-between items-start gap-3 text-gray-700">
                    <span className="flex items-start gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full mt-[3px] flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="leading-snug">{s.label}</span>
                    </span>
                    <span className={`tabular-nums whitespace-nowrap ${v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{signed(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

/** Legend: per type (package view) or per uraian grouped by type (leaf view). */
function BreakdownLegend({ types, viewMode }) {
  if (viewMode === 'leaves') {
    return (
      <div className="mt-2 max-h-[72px] overflow-y-auto space-y-1 pr-1">
        {types.map(type => (
          <div key={type.key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span className="font-semibold text-gray-700">{type.label}:</span>
            {type.segments.map(s => (
              <span key={s.dataKey} className="flex items-center gap-1 text-gray-600">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
      {types.map(type => (
        <span key={type.key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
          {type.label}
        </span>
      ))}
    </div>
  );
}

/**
 * BreakdownBarChart — Annual "Performance Breakdown" for Profit Loss, Cash Flow
 * and Balance Sheet. One stacked bar per type per year; each segment = one uraian.
 *
 * Props:
 *   data: result of buildBreakdownBarData() or null
 *   viewMode: 'parent' | 'leaves'
 *   parentLabel: string (package name, parent view)
 *   leafCount: number (selected leaves, leaf view)
 *   canReset: boolean (true when state is not default)
 *   onReset: () => void
 *   periodNote: optional string (e.g. "YTD Jan–Mei") shown in subtitle + tooltip
 */
export default function BreakdownBarChart({ data, viewMode = 'parent', parentLabel, leafCount = 0, periodNote = null }) {
  const baseSubtitle = viewMode === 'leaves'
    ? `${leafCount} sub uraian dipilih`
    : parentLabel ? `Paket: ${parentLabel}` : 'Komposisi per tipe uraian';
  const subtitle = periodNote ? `${periodNote} · ${baseSubtitle}` : baseSubtitle;

  const hasData = data && data.types && data.types.length > 0;

  return (
    <div data-chart-card className="p-5 flex-1 flex flex-col min-h-[338px]">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">Performance Breakdown Across Key Metrics</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate" title={subtitle}>{subtitle}</p>
        </div>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Tidak ada data untuk uraian terpilih</p>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartData} barGap={2} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  tickFormatter={v => formatCompact(v)}
                  width={75}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<BreakdownTooltip types={data.types} periodNote={periodNote} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                {data.types.map(type =>
                  type.segments.map(seg => (
                    <Bar
                      key={seg.dataKey}
                      dataKey={seg.dataKey}
                      name={seg.label}
                      stackId={type.key}
                      fill={seg.color}
                      maxBarSize={28}
                      shape={(props) => (
                        <Rectangle
                          {...props}
                          radius={props?.payload?.__top?.[type.key] === seg.dataKey ? [3, 3, 0, 0] : 0}
                        />
                      )}
                    />
                  ))
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <BreakdownLegend types={data.types} viewMode={viewMode} />
        </>
      )}
    </div>
  );
}
