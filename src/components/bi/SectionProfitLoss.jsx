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
 * Hierarchy config for Profit Loss table.
 * Inverted tree: top-level = Comprehensive Income (depth 0), drilling down
 * to revenue/COGS at the deepest level. Matches Figma reference exactly.
 */
const LR_HIERARCHY = [
  {
    key: 'comprehensiveIncome', label: 'Laba (Rugi) Komprehensif Tahun Berjalan',
    children: [
      { key: 'oci', label: 'Pendapatan komprehensif lain' },
      {
        key: 'netIncome', label: 'Laba (Rugi) Tahun Berjalan',
        children: [
          {
            key: 'tax.total', label: 'Jumlah Beban (Manfaat) Pajak',
            children: [
              { key: 'tax.current', label: 'Pajak kini' },
              { key: 'tax.deferred', label: 'Pajak tangguhan' },
            ],
          },
          {
            key: 'profitBeforeTax', label: 'Laba (Rugi) sebelum beban pajak penghasilan',
            children: [
              {
                key: 'operatingPL', label: 'Laba (Rugi) Operasi',
                children: [
                  { key: 'otherExpense', label: 'Beban operasi lainnya' },
                  { key: 'financeIncome', label: 'Pendapatan keuangan' },
                  { key: 'financeCost', label: 'Beban keuangan' },
                  {
                    key: 'operatingProfit', label: 'Laba (Rugi) Usaha',
                    children: [
                      {
                        key: 'grossProfit', label: 'Laba (Rugi) Kotor',
                        children: [
                          { key: 'revenue', label: 'Penjualan bersih' },
                          { key: 'cogs', label: 'Beban pokok penjualan' },
                        ],
                      },
                      {
                        key: 'opex.total', label: 'Jumlah Beban Usaha',
                        children: [
                          { key: 'opex.marketing', label: 'Beban pemasaran dan penjualan' },
                          { key: 'opex.admin', label: 'Beban umum dan administrasi' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

/** All possible bar chart filter options (used for labels/colors lookup) */
const ALL_BAR_OPTIONS = [
  { key: 'comprehensiveIncome', label: 'Laba (Rugi) Komprehensif' },
  { key: 'tax.total', label: 'Jumlah Beban (Manfaat) Pajak' },
  { key: 'netIncome', label: 'Laba (Rugi) Tahun Berjalan' },
  { key: 'operatingPL', label: 'Laba (Rugi) Operasi' },
  { key: 'operatingProfit', label: 'Laba (Rugi) Usaha' },
  { key: 'grossProfit', label: 'Laba (Rugi) Kotor' },
  { key: 'opex.total', label: 'Jumlah Beban Usaha' },
  { key: 'revenue', label: 'Penjualan bersih' },
  { key: 'cogs', label: 'Beban pokok penjualan' },
  { key: 'oci', label: 'Pendapatan komprehensif lain' },
  { key: 'profitBeforeTax', label: 'Laba (Rugi) sebelum beban pajak penghasilan' },
  { key: 'operatingPL', label: 'Laba (Rugi) Operasi' },
  { key: 'otherExpense', label: 'Beban operasi lainnya' },
  { key: 'financeIncome', label: 'Pendapatan keuangan' },
  { key: 'financeCost', label: 'Beban keuangan' },
  { key: 'opex.marketing', label: 'Beban pemasaran dan penjualan' },
  { key: 'opex.admin', label: 'Beban umum dan administrasi' },
  { key: 'tax.current', label: 'Pajak kini' },
  { key: 'tax.deferred', label: 'Pajak tangguhan' },
];

const DEFAULT_BAR_KEYS = ['netIncome', 'operatingProfit', 'grossProfit', 'revenue'];

const BAR_COLORS = {
  'comprehensiveIncome': '#DC2626',
  'tax.total': '#94A3B8',
  'netIncome': '#2389C4',
  'operatingPL': '#7C3AED',
  'operatingProfit': '#E0A83C',
  'grossProfit': '#2FA84A',
  'opex.total': '#F59E0B',
  'revenue': '#16A34A',
  'cogs': '#DC2626',
  'oci': '#8B5CF6',
  'profitBeforeTax': '#0EA5E9',
  'otherExpense': '#F97316',
  'financeIncome': '#10B981',
  'financeCost': '#EF4444',
  'opex.marketing': '#F59E0B',
  'opex.admin': '#A855F7',
  'tax.current': '#6B7280',
  'tax.deferred': '#9CA3AF',
};

/** Get label for a canonical key from hierarchy or options */
function getLabelForKey(key) {
  const opt = ALL_BAR_OPTIONS.find(o => o.key === key);
  return opt?.label || key;
}

export default function SectionProfitLoss({ data, allRecords, rkapRecords, years, selectedYear, onYearChange, searchTerm, mode = 'annual', onModeChange, ytdMonth = 8, onYtdMonthChange, chartRowRef, chartsCollapsed, onToggleCharts, chartSticky, isShortViewport }) {
  if (!data) return null;
  const { kpis } = data;

  // Separate selection state per mode
  // Annual & YTD share one shared selection, Monthly has its own; Quarterly stays single-select.
  const DEFAULT_ANNUAL_KEYS = ['comprehensiveIncome', 'netIncome', 'tax.total', 'profitBeforeTax'];
  const DEFAULT_PARENT = LR_HIERARCHY[0].key; // default package / default line
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
    return buildHierarchicalTableRows(allRecords, years, LR_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear]);

  // Build hierarchical table rows (quarterly)
  const quarterlyData = useMemo(() => {
    if (!allRecords || !isQuarterly) return null;
    return buildHierarchicalTableRowsQuarterly(allRecords, years, LR_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isQuarterly]);

  // Build hierarchical table rows (YTD)
  const ytdData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, LR_HIERARCHY, ytdMonth, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isYTD, ytdMonth]);

  // YTD rows for the bar chart: per year, falls back to the last month with data
  // when ytdMonth has no data yet (e.g. 2026 only until Aug, Sep selected → Jan..Aug)
  const ytdChartData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, LR_HIERARCHY, ytdMonth, null, null, { clampToAvailable: true });
  }, [allRecords, years, isYTD, ytdMonth]);

  // Build hierarchical table rows (Monthly)
  const monthlyData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    return buildHierarchicalTableRowsMonthly(allRecords, monthlyYear, LR_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, monthlyYear, rkapRecords, rkapYear, isMonthly]);

  // Shared table selection (default package = top-level parent)
  const annualSel = useRowSelection(tableRows, { defaultParentId: DEFAULT_PARENT });
  const monthlySel = useRowSelection(monthlyData?.rows || [], { defaultParentId: DEFAULT_PARENT });
  const activeSel = isMonthly ? monthlySel : annualSel;

  // Current selection for table highlight
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

  // Handle row selection
  const handleRowSelect = useCallback((canonicalKey) => {
    if (isQuarterly) {
      // Single-select: always set (don't deselect on re-click)
      setQuarterlySelectedKey(canonicalKey);
    } else {
      // Annual / YTD / Monthly: parents or leaves
      activeSel.select(canonicalKey);
    }
  }, [isQuarterly, activeSel.select]);

  // Build bar data (quarterly only — annual/YTD/Monthly use breakdownData)
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
      // YTD: cumulative Jan..ytdMonth per year (last available month if not reached yet)
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
      records: allRecords, rkapRecords, hierarchy: LR_HIERARCHY, year: selectedYear,
      variant: 'flow', typeOrder: KPI_TYPE_ORDER.profitLoss, profile: 'profitLoss',
    });
  }, [allRecords, rkapRecords, selectedYear]);

  return (
    <div className="bi-section-stack">
      <TypeKpiStrip data={typeKpis} sectionId="pl" />
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
        title="Profit Loss"
        sectionLabel="Profit Loss Statements"
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
