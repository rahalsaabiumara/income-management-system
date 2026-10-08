import React, { useState, useCallback, useMemo } from 'react';
import PerformanceBarChart from './PerformanceBarChart.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import ChartRow from './ChartRow.jsx';
import DataTable from './DataTable.jsx';
import KPICard, { KPICardGroup } from './KPICard.jsx';
import { useRowSelection, toLineItems } from './useRowSelection.js';
import { buildMultiYearBarData, buildQuarterlyBarData, buildHierarchicalTableRows, buildHierarchicalTableRowsQuarterly, buildHierarchicalTableRowsYTD, buildHierarchicalTableRowsMonthly, buildMonthlyTrendData } from '../../lib/bi/viewModel.js';
import { buildMonthlyData } from '../../lib/bi/aggregation.js';
import { formatYTDNote, buildYTDNoteFor } from '../../lib/bi/breakdown.js';

const REV_HIERARCHY = [
  {
    key: 'total', label: 'Total Pendapatan', color: '#DC2626',
    children: [
      { key: 'training', label: 'Pelatihan' },
      { key: 'consulting', label: 'Konsultansi' },
      { key: 'assessment', label: 'Asesmen & Sertifikasi' },
      { key: 'digitalBusiness', label: 'Digital Bisnis' },
      { key: 'hotelMice', label: 'Hotel & MICE' },
    ],
  },
];

const ALL_BAR_OPTIONS = [
  { key: 'training', label: 'Pelatihan' },
  { key: 'consulting', label: 'Konsultansi' },
  { key: 'assessment', label: 'Asesmen & Sertifikasi' },
  { key: 'digitalBusiness', label: 'Digital Bisnis' },
  { key: 'hotelMice', label: 'Hotel & MICE' },
  { key: 'total', label: 'Total Pendapatan' },
];

const DEFAULT_BAR_KEYS = ['training', 'consulting', 'assessment', 'digitalBusiness', 'hotelMice', 'total'];

const BAR_COLORS = {
  'training': '#2FA84A',
  'consulting': '#E0A83C',
  'assessment': '#7C3AED',
  'digitalBusiness': '#2389C4',
  'hotelMice': '#F59E0B',
  'total': '#DC2626',
};

function getLabelForKey(key) {
  const opt = ALL_BAR_OPTIONS.find(o => o.key === key);
  return opt?.label || key;
}

export default function SectionRevenue({ data, allRecords, rkapRecords, years, selectedYear, onYearChange, searchTerm, mode = 'annual', onModeChange, ytdMonth = 8, onYtdMonthChange, chartRowRef, chartsCollapsed, onToggleCharts, chartSticky, isShortViewport }) {
  if (!data) return null;
  const { kpis, categoryBreakdown } = data;

  // Separate selection state per mode
  // Annual & YTD share one flat selection, Monthly has its own; Quarterly stays single-select.
  // DEFAULT_ANNUAL_KEYS = bar chart fallback (5 categories) while nothing is selected.
  const DEFAULT_ANNUAL_KEYS = REV_HIERARCHY[0].children.map(c => c.key);
  const DEFAULT_LINE_KEY = REV_HIERARCHY[0].key; // 'Total Pendapatan'
  const [quarterlySelectedKey, setQuarterlySelectedKey] = useState(REV_HIERARCHY[0].key);

  const isQuarterly = mode === 'quarterly';
  const isYTD = mode === 'ytd';
  const isMonthly = mode === 'monthly';

  // Monthly year = selectedYear (from global filter)
  const monthlyYear = selectedYear;

  const rkapYear = rkapRecords && years.length > 0 ? years[0] : null;

  // Build hierarchical table rows for Revenue (annual)
  const tableRows = useMemo(() => {
    if (!allRecords) return [];
    return buildHierarchicalTableRows(allRecords, years, REV_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear]);

  // Build hierarchical table rows (quarterly)
  const quarterlyData = useMemo(() => {
    if (!allRecords || !isQuarterly) return null;
    return buildHierarchicalTableRowsQuarterly(allRecords, years, REV_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isQuarterly]);

  // Build hierarchical table rows (YTD)
  const ytdData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, REV_HIERARCHY, ytdMonth, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isYTD, ytdMonth]);

  // YTD rows for the bar chart: per year, falls back to the last month with data
  // when ytdMonth has no data yet (e.g. 2026 only until Aug, Sep selected → Jan..Aug)
  const ytdChartData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, REV_HIERARCHY, ytdMonth, null, null, { clampToAvailable: true });
  }, [allRecords, years, isYTD, ytdMonth]);

  // Build hierarchical table rows (Monthly)
  const monthlyData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    return buildHierarchicalTableRowsMonthly(allRecords, monthlyYear, REV_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, monthlyYear, rkapRecords, rkapYear, isMonthly]);

  // Flat selection (every row selectable, no parent/leaf distinction), max 4
  const annualSel = useRowSelection(tableRows, { flat: true });
  const monthlySel = useRowSelection(tableRows, { flat: true });
  const activeSel = isMonthly ? monthlySel : annualSel;

  const currentSelectedKeys = isQuarterly
    ? new Set(quarterlySelectedKey ? [quarterlySelectedKey] : [])
    : activeSel.selectedRowKeys;

  const handleReset = useCallback(() => {
    activeSel.reset();
    if (isQuarterly) {
      setQuarterlySelectedKey(REV_HIERARCHY[0].key);
    }
  }, [activeSel.reset, isQuarterly]);

  const canReset = !activeSel.isDefault || (isQuarterly && quarterlySelectedKey !== REV_HIERARCHY[0].key);

  const handleRowSelect = useCallback((canonicalKey) => {
    if (isQuarterly) {
      setQuarterlySelectedKey(canonicalKey);
    } else {
      activeSel.select(canonicalKey);
    }
  }, [isQuarterly, activeSel.select]);

  // Build bar data (annual/quarterly/YTD)
  const barData = useMemo(() => {
    if (!allRecords || isMonthly) return null;
    if (isQuarterly) {
      if (!quarterlySelectedKey) return null;
      return buildQuarterlyBarData(allRecords, years, quarterlySelectedKey, getLabelForKey(quarterlySelectedKey));
    }
    const keys = annualSel.isDefault ? DEFAULT_ANNUAL_KEYS : annualSel.selectedIds;
    if (keys.length === 0) return null;
    const barSeries = keys.map(key => ({
      key,
      label: getLabelForKey(key),
      color: BAR_COLORS[key] || '#94A3B8',
    }));
    if (isYTD) {
      // YTD: cumulative Jan..ytdMonth per year (last available month if not reached yet)
      if (!ytdChartData?.rows) return null;
      const sortedYears = [...years].sort((a, b) => a - b);
      const rowsById = new Map(ytdChartData.rows.map(r => [r.id, r]));
      const series = barSeries.map(def => {
        const row = rowsById.get(def.key);
        const data = {};
        for (const y of sortedYears) data[y] = row?.values?.[`YTD_${y}`] ?? null;
        return { ...def, data };
      });
      const noteFor = buildYTDNoteFor(ytdChartData.columns, ytdMonth, 'flow');
      const notes = {};
      for (const y of sortedYears) { const n = noteFor(y); if (n) notes[y] = n; }
      return { years: sortedYears, series, notes };
    }
    return buildMultiYearBarData(allRecords, years, barSeries);
  }, [allRecords, years, isQuarterly, isMonthly, isYTD, ytdChartData, ytdMonth, annualSel.isDefault, annualSel.selectedIds, quarterlySelectedKey]);

  const ytdPeriodNote = isYTD ? formatYTDNote(ytdMonth, 'flow') : null;

  // Build monthly trend data (for chart in monthly mode)
  const monthlyTrendData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    const keys = monthlySel.isDefault ? DEFAULT_ANNUAL_KEYS : monthlySel.selectedIds;
    if (keys.length === 0) return null;
    const seriesDefs = keys.map(key => ({
      key,
      label: getLabelForKey(key),
      color: BAR_COLORS[key] || '#94A3B8',
    }));
    return buildMonthlyTrendData(allRecords, monthlyYear, seriesDefs);
  }, [allRecords, isMonthly, monthlyYear, monthlySel.isDefault, monthlySel.selectedIds]);

  // Line chart items: selected rows ('Total Pendapatan' when nothing is selected)
  const lineItems = useMemo(() => {
    if (isQuarterly) return toLineItems([quarterlySelectedKey], tableRows);
    const ids = activeSel.selectedIds.length ? activeSel.selectedIds : [DEFAULT_LINE_KEY];
    return toLineItems(ids, tableRows, activeSel.colors);
  }, [isQuarterly, quarterlySelectedKey, activeSel.selectedIds, activeSel.colors, tableRows]);

  const handleRemoveLineItem = useCallback((key) => {
    if (!isQuarterly) activeSel.select(key);
  }, [isQuarterly, activeSel.select]);

  const getMonthlyDataForKey = useCallback((key, jenis, overrideYear) => {
    let records = jenis === 'RKAP' ? rkapRecords : allRecords;
    if (!records) return [];
    if (jenis === 'RKAP') {
      // no-op, just use rkapRecords
    }
    const yr = overrideYear || selectedYear;
    const yearRecs = records.filter(r => r.period?.year === yr);
    const monthly = buildMonthlyData(yearRecs, yr);
    const metricData = monthly.get(key);
    if (!metricData) return [];
    let result = metricData.monthlyValues.filter(m => m.hasData).map(m => ({ month: m.month, value: m.value }));

    if (jenis === 'RKAP' && allRecords) {
      const realYearRecs = allRecords.filter(r => r.period?.year === yr);
      if (realYearRecs.length > 0) {
        const maxRealMonth = Math.max(...realYearRecs.map(r => r.period?.month).filter(Boolean));
        result = result.filter(m => m.month <= maxRealMonth);
      }
    }

    return result;
  }, [allRecords, rkapRecords, selectedYear]);

  return (
    <div className="bi-section-stack">
      {(() => {
        const getVal = (key) => { const row = tableRows?.find(r => r.canonical === key); return row?.values?.[selectedYear] ?? null; };
        const getRkap = (key) => { const row = tableRows?.find(r => r.canonical === key); return row?.rkap?.[rkapYear] ?? null; };
        const calcTrend = (key) => { const val = getVal(key); const prev = tableRows?.find(r => r.canonical === key)?.values?.[selectedYear - 1] ?? null; return val !== null && prev !== null && prev !== 0 ? ((val - prev) / Math.abs(prev)) * 100 : null; };
        const achPct = (key) => { const v = Math.abs(getVal(key) ?? 0); const r = Math.abs(getRkap(key) ?? 1); return Math.min((v / r) * 100, 100); };

        const segments = [
          { key: 'training', label: 'Pelatihan', color: '#2FA84A' },
          { key: 'consulting', label: 'Konsultansi', color: '#E0A83C' },
          { key: 'assessment', label: 'Asesmen & Sertifikasi', color: '#7C3AED' },
          { key: 'digitalBusiness', label: 'Digital Bisnis', color: '#2389C4' },
          { key: 'hotelMice', label: 'Hotel & MICE', color: '#F59E0B' },
        ];

        const compItems = segments.map(s => ({ label: s.label, value: getVal(s.key), color: s.color }));
        
        const rawMonthly = getMonthlyDataForKey('total', 'Actual', selectedYear);
        const sparkData = Array.from({ length: 12 }, (_, i) => ({ value: null }));
        rawMonthly.forEach(d => { sparkData[d.month - 1] = { value: d.value }; });

        return (
          // Revenue-only top spacing: KPICardGroup had no top padding and sat flush
          // against the top bar (main has pb only; TypeKpiStrip in other sections has its own pt-1).
          <div className="pt-3.5">
          <KPICardGroup>
            <KPICard label="Total Pendapatan" value={getVal('total')} rkap={getRkap('total')} trend={calcTrend('total')} prevYearLabel={`${selectedYear - 1}`} isHighlight color="green" animDelay={0}
              compositionItems={compItems}
              typeKey="pendapatan"
              sparkPoints={sparkData} />
            {segments.map((seg, i) => (
              <KPICard key={seg.key} label={seg.label} value={getVal(seg.key)} rkap={getRkap(seg.key)} trend={calcTrend(seg.key)} animDelay={80 + i * 80}
                donutSegments={[{ percent: achPct(seg.key), color: seg.color }]} accentColor={seg.color} />
            ))}
          </KPICardGroup>
          </div>
        );
      })()}
      {/* Chart Row — one merged card, sticky when chartSticky is true */}
      <ChartRow
        chartRowRef={chartRowRef}
        chartsCollapsed={chartsCollapsed}
        onToggleCharts={onToggleCharts}
        chartSticky={chartSticky}
        isShortViewport={isShortViewport}
        left={
          <TrendLineChart
            availableYears={years}
            selectedYear={selectedYear}
            onYearChange={onYearChange}
            items={lineItems}
            getMonthlyDataForKey={getMonthlyDataForKey}
            onRemoveItem={handleRemoveLineItem}
            notice={isQuarterly ? null : activeSel.notice}
          />
        }
        right={
          <PerformanceBarChart
            barData={barData}
            monthlyTrendData={monthlyTrendData}
            mode={mode}
            periodNote={ytdPeriodNote}
            emptyMessage="Pilih uraian pada tabel untuk melihat chart"
          />
        }
      />
      <DataTable
        tableRows={tableRows}
        quarterlyData={quarterlyData}
        ytdData={ytdData}
        monthlyData={monthlyData}
        years={years}
        rkapYear={rkapYear}
        title="Revenue"
        sectionLabel="Revenue Statements"
        searchTerm={searchTerm}
        mode={mode}
        selectedYear={selectedYear}
        selectedRowKeys={currentSelectedKeys}
        onRowSelect={handleRowSelect}
        maxSelections={Infinity}
        canReset={canReset}
        onReset={handleReset}
      />
    </div>
  );
}
