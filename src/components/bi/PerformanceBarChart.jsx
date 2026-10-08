import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { createPortal } from 'react-dom';
import { formatCompact, formatFull } from '../../lib/bi/calculations.js';

const CustomTooltip = ({ active, payload, label, periodNote }) => {
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

  if (active && payload && payload.length && pos) {
    const point = payload[0]?.payload || {};
    const note = point.__note || periodNote;
    return createPortal(
      <div
        ref={tipRef}
        className="bg-white p-3 rounded-lg border border-gray-200 shadow-xl text-xs min-w-[150px] pointer-events-none"
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
          {note && (
            <span className={`ml-1.5 font-semibold text-[10px] px-1.5 py-0.5 rounded ${point.__fallback ? 'text-amber-700 bg-amber-100' : 'text-[#2FA84A] bg-[#2FA84A]/10'}`}>
              {note}
            </span>
          )}
        </p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex justify-between items-center text-black">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}</span>
              </span>
              <span className="font-semibold ml-4">{formatFull(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );
  }
  return null;
};

/**
 * PerformanceBarChart — Multi-year grouped bar chart, with monthly trend line support.
 *
 * Props:
 *   barData: { years: number[], series: Array<{key, label, color, data: {[year]: number}}>, notes?: {[year]: {note, fallback}} }
 *   monthlyTrendData: { months: string[], series: Array<{key, label, color}>, chartData: Array } (monthly mode)
 *   mode: 'annual' | 'quarterly' | 'ytd' | 'monthly'
 *   subtitle: string (optional override for subtitle)
 *   emptyMessage: string (optional override for empty state message)
 *   periodNote: optional string (e.g. "YTD Jan–Mei") shown in subtitle + tooltip
 */
export default function PerformanceBarChart({ barData, monthlyTrendData, mode = 'annual', subtitle, emptyMessage, periodNote = null }) {
  const isMonthly = mode === 'monthly';

  // Monthly half-year toggle state (kept outside conditional so hook order is stable)
  const [halfYear, setHalfYear] = useState('H1'); // 'all' | 'H1' | 'H2'

  // Monthly mode: render bar chart with months on X-axis
  if (isMonthly) {
    if (!monthlyTrendData || !monthlyTrendData.series || monthlyTrendData.series.length === 0) {
      return (
        <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[338px]">
          <p className="text-gray-400 text-sm">{emptyMessage || 'Pilih uraian pada tabel untuk melihat chart'}</p>
        </div>
      );
    }

    const { series, chartData } = monthlyTrendData;
    const subtitleText = subtitle || 'Monthly trend comparison across selected components';

    // Filter chart data by half-year
    const filteredData = halfYear === 'H1'
      ? chartData.filter(d => d.month >= 1 && d.month <= 6)
      : halfYear === 'H2'
        ? chartData.filter(d => d.month >= 7 && d.month <= 12)
        : chartData;

    return (
      <div data-chart-card className="p-5 flex-1 flex flex-col min-h-[338px]">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Tren Bulanan</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitleText}</p>
          </div>
          {/* Half-year toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden flex-shrink-0">
            {[
              { key: 'H1', label: 'Jan-Jun' },
              { key: 'H2', label: 'Jul-Des' },
              { key: 'all', label: 'Semua' },
            ].map(h => (
              <button
                key={h.key}
                onClick={() => setHalfYear(h.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${halfYear === h.key
                    ? 'bg-[#2FA84A] text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                  }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredData} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickFormatter={v => formatCompact(v)}
                width={75}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.label}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Non-monthly modes: standard bar chart
  if (!barData || !barData.series || barData.series.length === 0) {
    return (
      <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[338px]">
        <p className="text-gray-400 text-sm">{emptyMessage || 'Pilih uraian pada tabel untuk melihat chart'}</p>
      </div>
    );
  }

  const { years, series, notes } = barData;
  const isQuarterly = mode === 'quarterly';

  // Transform data for Recharts: [{year: '2022', 'Q1': 100, 'Q2': 50, ...}, ...]
  const chartData = years.map(y => {
    const entry = { year: String(y) };
    for (const s of series) {
      entry[s.label] = s.data[y] ?? 0;
    }
    const n = notes?.[y];
    if (n) { entry.__note = n.note; entry.__fallback = !!n.fallback; }
    return entry;
  });

  const baseSubtitle = subtitle || (isQuarterly
    ? 'Quarterly breakdown for selected uraian'
    : 'Comparative annual trends across selected components');
  const subtitleText = periodNote ? `${periodNote} · ${baseSubtitle}` : baseSubtitle;

  return (
    <div data-chart-card className="p-5 flex-1 flex flex-col min-h-[338px]">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900">Performance Breakdown Across Key Metrics</h3>
        <p className="text-xs text-gray-500 mt-0.5">{subtitleText}</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="year"
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
            />
            <Tooltip content={<CustomTooltip periodNote={periodNote} />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.label}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

