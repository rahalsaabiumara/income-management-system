import React, { useState, useCallback, useMemo } from 'react';
import PerformanceBarChart from './PerformanceBarChart.jsx';
import BreakdownBarChart from './BreakdownBarChart.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import ChartRow from './ChartRow.jsx';
import DataTable from './DataTable.jsx';
import TypeKpiStrip from './TypeKpiStrip.jsx';
import { useRowSelection, toLineItems } from './useRowSelection.js';
import { buildQuarterlyBarData, buildHierarchicalTableRows, buildHierarchicalTableRowsQuarterly, buildHierarchicalTableRowsYTD, buildHierarchicalTableRowsMonthly, buildMonthlyTrendData } from '../../lib/bi/viewModel.js';
import { buildMonthlyData } from '../../lib/bi/aggregation.js';
import { buildBreakdownBarData, buildBreakdownBarDataMonthly, formatYTDNote, buildYTDNoteFor } from '../../lib/bi/breakdown.js';
import { buildTypeKpis } from '../../lib/bi/typeKpi.js';
import { KPI_TYPE_ORDER } from '../../lib/bi/constants.js';

/**
 * Hierarchy config for Cash Flow table.
 * Three root-level groups (all depth 0), matching Figma reference.
 * All sub-items are plain leaf rows.
 */
const CF_HIERARCHY = [
  {
    key: 'closingCash', label: 'Kas dan Setara Kas Akhir Tahun', color: '#DC2626',
    children: [
      { key: 'openingCash', label: 'Kas dan Setara Kas Awal Tahun' },
      {
        key: 'netChange', label: 'Kenaikan (Penurunan) Bersih Kas dan Setara Kas', color: '#2FA84A',
        children: [
          {
            key: 'operating.netCashFlow', label: 'Arus Kas', color: '#E0A83C',
            children: [
              { key: 'operating.customerReceipts', label: 'Penerimaan dari pelanggan' },
              { key: 'operating.supplierPayments', label: 'Pembayaran kas kepada pemasok' },
              { key: 'operating.employeePayments', label: 'Pembayaran kas kepada karyawan' },
              { key: 'operating.otherReceipts', label: 'Penerimaan kas lainnya' },
              { key: 'operating.interestReceipts', label: 'Penerimaan bunga' },
              { key: 'operating.taxPayments', label: 'Pembayaran Pajak' },
              { key: 'operating.otherPayments', label: 'Pembayaran lain-lain' },
            ],
          },
          {
            key: 'investing.netCashFlow', label: 'Arus Kas dari Aktivitas Investasi', color: '#E0A83C',
            children: [
              { key: 'investing.fixedAssets', label: 'Perolehan aset tetap' },
              { key: 'investing.intangibleAssets', label: 'Penambahan aset tak berwujud' },
            ],
          },
        ]
      },
    ],
  },
];

/** All items for label/color lookup */
const ALL_BAR_OPTIONS = [
  { key: 'operating.netCashFlow', label: 'Arus Kas' },
  { key: 'investing.netCashFlow', label: 'Arus Kas dari Aktivitas Investasi' },
  { key: 'closingCash', label: 'Kas dan Setara Kas Akhir Tahun' },
  { key: 'openingCash', label: 'Kas dan Setara Kas Awal Tahun' },
  { key: 'netChange', label: 'Kenaikan (Penurunan) Bersih Kas dan Setara Kas' },
  { key: 'operating.customerReceipts', label: 'Penerimaan dari pelanggan' },
  { key: 'operating.supplierPayments', label: 'Pembayaran kas kepada pemasok' },
  { key: 'operating.employeePayments', label: 'Pembayaran kas kepada karyawan' },
  { key: 'operating.otherReceipts', label: 'Penerimaan kas lainnya' },
  { key: 'operating.interestReceipts', label: 'Penerimaan bunga' },
  { key: 'operating.taxPayments', label: 'Pembayaran Pajak' },
  { key: 'operating.otherPayments', label: 'Pembayaran lain-lain' },
  { key: 'investing.fixedAssets', label: 'Perolehan aset tetap' },
  { key: 'investing.intangibleAssets', label: 'Penambahan aset tak berwujud' },
];

const DEFAULT_BAR_KEYS = ['operating.netCashFlow', 'investing.netCashFlow', 'closingCash'];

const BAR_COLORS = {
  'operating.netCashFlow': '#2FA84A',
  'investing.netCashFlow': '#E0A83C',
  'closingCash': '#2389C4',
  'openingCash': '#94A3B8',
  'netChange': '#16A34A',
  'operating.customerReceipts': '#10B981',
  'operating.supplierPayments': '#EF4444',
  'operating.employeePayments': '#F59E0B',
  'operating.otherReceipts': '#8B5CF6',
  'operating.interestReceipts': '#0EA5E9',
  'operating.taxPayments': '#DC2626',
  'operating.otherPayments': '#F97316',
  'investing.fixedAssets': '#7C3AED',
  'investing.intangibleAssets': '#A855F7',
};

function getLabelForKey(key) {
  const opt = ALL_BAR_OPTIONS.find(o => o.key === key);
  return opt?.label || key;
}

export default function SectionCashFlow({ data, allRecords, rkapRecords, years, selectedYear, onYearChange, searchTerm, mode = 'annual', onModeChange, ytdMonth = 8, onYtdMonthChange, chartRowRef, chartsCollapsed, onToggleCharts, chartSticky, isShortViewport }) {
  if (!data) return null;
  const { kpis } = data;

  // Separate selection state per mode
  // Annual & YTD share one shared selection, Monthly has its own; Quarterly stays single-select.
  const DEFAULT_ANNUAL_KEYS = ['closingCash', 'netChange', 'operating.netCashFlow', 'investing.netCashFlow'];
  const DEFAULT_PARENT = 'operating.netCashFlow'; // 'Arus Kas' — default package / default line
  const [quarterlySelectedKey, setQuarterlySelectedKey] = useState(DEFAULT_ANNUAL_KEYS[0]);

  const isQuarterly = mode === 'quarterly';
  const isYTD = mode === 'ytd';
  const isMonthly = mode === 'monthly';
  const isBreakdownMode = !isQuarterly; // Annual + YTD + Monthly

  // Monthly year = selectedYear (from global filter)
  const monthlyYear = selectedYear;

  const rkapYear = rkapRecords && years.length > 0 ? years[0] : null;

  // Build hierarchical table rows (annual)
  const tableRows = useMemo(() => {
    if (!allRecords) return [];
    return buildHierarchicalTableRows(allRecords, years, CF_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear]);

  // Build hierarchical table rows (quarterly)
  const quarterlyData = useMemo(() => {
    if (!allRecords || !isQuarterly) return null;
    return buildHierarchicalTableRowsQuarterly(allRecords, years, CF_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isQuarterly]);

  // Build hierarchical table rows (YTD)
  const ytdData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, CF_HIERARCHY, ytdMonth, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isYTD, ytdMonth]);

  // YTD rows for the bar chart: per year, falls back to the last month with data
  // when ytdMonth has no data yet (e.g. 2026 only until Aug, Sep selected → Jan..Aug)
  const ytdChartData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, CF_HIERARCHY, ytdMonth, null, null, { clampToAvailable: true });
  }, [allRecords, years, isYTD, ytdMonth]);

  // Build hierarchical table rows (Monthly)
  const monthlyData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    return buildHierarchicalTableRowsMonthly(allRecords, monthlyYear, CF_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, monthlyYear, rkapRecords, rkapYear, isMonthly]);

  // Shared table selection (default package = 'Arus Kas')
  const annualSel = useRowSelection(tableRows, { defaultParentId: DEFAULT_PARENT });
  const monthlySel = useRowSelection(monthlyData?.rows || [], { defaultParentId: DEFAULT_PARENT });
  const activeSel = isMonthly ? monthlySel : annualSel;

  const currentSelectedKeys = isQuarterly
    ? new Set(quarterlySelectedKey ? [quarterlySelectedKey] : [])
    : activeSel.selectedRowKeys;

  const handleReset = useCallback(() => {
    activeSel.reset();
    if (isQuarterly) {
      setQuarterlySelectedKey(DEFAULT_ANNUAL_KEYS[0]);
    }
  }, [activeSel.reset, isQuarterly]);

  const canReset = !activeSel.isDefault || (isQuarterly && quarterlySelectedKey !== DEFAULT_ANNUAL_KEYS[0]);

  const handleRowSelect = useCallback((canonicalKey) => {
    if (isQuarterly) {
      setQuarterlySelectedKey(canonicalKey);
    } else {
      // Annual / YTD / Monthly: parents or leaves, max 4
      activeSel.select(canonicalKey);
    }
  }, [isQuarterly, activeSel.select]);

  // Build bar data (quarterly only — annual/YTD use breakdownData)
  const barData = useMemo(() => {
    if (!allRecords || !isQuarterly) return null;
    if (!quarterlySelectedKey) return null;
    return buildQuarterlyBarData(allRecords, years, quarterlySelectedKey, getLabelForKey(quarterlySelectedKey));
  }, [allRecords, years, isQuarterly, quarterlySelectedKey]);

  // Build breakdown data (annual/YTD/Monthly)
  const breakdownData = useMemo(() => {
    if (!isBreakdownMode) return null;
    if (isMonthly) {
      if (!monthlyData?.rows) return null;
      return buildBreakdownBarDataMonthly({ rows: monthlyData.rows, targetYear: monthlyYear, leafIds: activeSel.activeLeafIds, variant: 'flow' });
    }
    if (isYTD) {
      // YTD: flows cumulative Jan..ytdMonth, closing cash = position at ytdMonth,
      // opening cash = start of year (last available month if ytdMonth not reached yet)
      if (!ytdChartData?.rows) return null;
      return buildBreakdownBarData({
        rows: ytdChartData.rows, years, leafIds: activeSel.activeLeafIds, variant: 'flow',
        valueKey: (y) => `YTD_${y}`,
        noteFor: buildYTDNoteFor(ytdChartData.columns, ytdMonth, 'flow'),
      });
    }
    return buildBreakdownBarData({ rows: tableRows, years, leafIds: activeSel.activeLeafIds, variant: 'flow' });
  }, [isBreakdownMode, isMonthly, isYTD, monthlyData, ytdChartData, ytdMonth, monthlyYear, tableRows, years, activeSel.activeLeafIds]);

  const ytdPeriodNote = isYTD ? formatYTDNote(ytdMonth, 'flow') : null;

  // Build monthly trend data (for chart in monthly mode) — selected rows, or default parent
  const monthlyTrendData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    const keys = monthlySel.isDefault ? [DEFAULT_PARENT] : monthlySel.selectedIds;
    if (keys.length === 0) return null;
    const seriesDefs = keys.map(key => ({
      key,
      label: getLabelForKey(key),
      color: BAR_COLORS[key] || '#94A3B8',
    }));
    return buildMonthlyTrendData(allRecords, monthlyYear, seriesDefs);
  }, [allRecords, isMonthly, monthlyYear, monthlySel.isDefault, monthlySel.selectedIds]);

  // Line chart items: selected rows (default parent when nothing is selected)
  const lineItems = useMemo(() => {
    if (isQuarterly) return toLineItems([quarterlySelectedKey], tableRows);
    const ids = activeSel.selectedIds.length ? activeSel.selectedIds : [DEFAULT_PARENT];
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

  // Type-based KPI strip: selected year, YTD to the last month with data
  const typeKpis = useMemo(() => {
    if (!allRecords) return null;
    return buildTypeKpis({
      records: allRecords, rkapRecords, hierarchy: CF_HIERARCHY, year: selectedYear,
      variant: 'flow', typeOrder: KPI_TYPE_ORDER.cashFlow, profile: 'cashFlow',
    });
  }, [allRecords, rkapRecords, selectedYear]);

  return (
    <div className="bi-section-stack">
      <TypeKpiStrip data={typeKpis} sectionId="cf" />
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
        right={isBreakdownMode ? (
          <BreakdownBarChart
            data={breakdownData}
            viewMode={activeSel.viewMode}
            parentLabel={activeSel.packageLabel}
            leafCount={activeSel.state.leafIds.length}
            periodNote={ytdPeriodNote}
          />
        ) : (
          <PerformanceBarChart
            barData={barData}
            mode={mode}
            emptyMessage="Pilih uraian pada tabel untuk melihat chart"
          />
        )}
      />
      <DataTable
        tableRows={tableRows}
        quarterlyData={quarterlyData}
        ytdData={ytdData}
        monthlyData={monthlyData}
        years={years}
        rkapYear={rkapYear}
        title="Cash Flow"
        sectionLabel="Cash Flow Statements"
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
