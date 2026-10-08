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
 * Hierarchy config for Balance Sheet table.
 * Maps to canonical keys from BS_MAPPING in constants.js.
 * Labels are shortened for dashboard display (per user request).
 */
const BS_HIERARCHY = [
  {
    key: 'totalAssets', label: 'Total Aset',
    children: [
      {
        key: 'currentAssets.total', label: 'Aset Lancar',
        children: [
          { key: 'currentAssets.cash', label: 'Kas dan setara kas' },
          { key: 'currentAssets.tradeReceivables3rd', label: 'Piutang usaha - neto: Pihak ketiga' },
          { key: 'currentAssets.tradeReceivablesRelated', label: 'Piutang usaha - neto: Pihak-pihak berelasi' },
          { key: 'currentAssets.otherReceivables3rd', label: 'Piutang lain-lain - neto: Pihak ketiga' },
          { key: 'currentAssets.otherReceivablesRelated', label: 'Piutang lain-lain - neto: Pihak-pihak berelasi' },
          { key: 'currentAssets.inventory', label: 'Persediaan' },
          { key: 'currentAssets.prepaidTax', label: 'Pajak dibayar di muka' },
          { key: 'currentAssets.otherCurrentAssets', label: 'Aset lancar lainnya' },
          { key: 'currentAssets.prepaidExpenses', label: 'Biaya dibayar dimuka dan uang muka' },
        ],
      },
      {
        key: 'nonCurrentAssets.total', label: 'Aset Tidak Lancar',
        children: [
          { key: 'nonCurrentAssets.investmentAssociates', label: 'Investasi pada entitas asosiasi' },
          { key: 'nonCurrentAssets.fixedAssets', label: 'Aset tetap' },
          { key: 'nonCurrentAssets.otherNCA', label: 'Aset tidak lancar lainnya' },
        ],
      },
    ],
  },
  {
    key: 'totalLiabilitiesEquity', label: 'Total Liabilitas dan Ekuitas',
    children: [
      {
        key: 'totalEquity', label: 'Total Ekuitas',
        children: [
          { key: 'equity.paidUpCapital', label: 'Modal ditempatkan dan disetor penuh' },
          { key: 'equity.oci', label: 'Modal dasar: Penghasilan komprehensif lain' },
          { key: 'equity.retainedEarnings', label: 'Saldo laba: Belum ditentukan penggunaannya' },
        ],
      },
      {
        key: 'totalLiabilities', label: 'Total Liabilitas',
        children: [
          {
            key: 'currentLiabilities.total', label: 'Liabilitas Jangka Pendek',
            children: [
              { key: 'currentLiabilities.tradePayables', label: 'Utang usaha: Pihak ketiga' },
              { key: 'currentLiabilities.otherPayables', label: 'Utang lain-lain: Pihak ketiga' },
              { key: 'currentLiabilities.taxPayable', label: 'Utang pajak' },
              { key: 'currentLiabilities.unearnedRevenue', label: 'Pendapatan diterima di muka satu tahun' },
              { key: 'currentLiabilities.accruedExpenses', label: 'Biaya yang masih harus dibayar' },
            ],
          },
          {
            key: 'nonCurrentLiabilities.total', label: 'Liabilitas Jangka Panjang',
            children: [
              { key: 'nonCurrentLiabilities.otherLTPayables', label: 'Utang lain-lain jangka panjang' },
              { key: 'nonCurrentLiabilities.employeeBenefits', label: 'Program lainnya yang tidak didanai' },
              { key: 'nonCurrentLiabilities.deferredTaxLiability', label: 'Liabilitas pajak tangguhan' },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Combined KPI tree root — merges both BS roots so drill-down starts
 * from Total Aset with all sub-categories (incl. Ekuitas & Liabilitas)
 */
const BS_KPI_ROOT = {
  key: 'totalAssets',
  label: 'Total Aset',
  children: [
    ...BS_HIERARCHY[0].children,  // Aset Lancar, Aset Tidak Lancar
    ...BS_HIERARCHY[1].children,  // Total Ekuitas, Total Liabilitas
  ],
};

/** All items for label/color lookup */
const ALL_BAR_OPTIONS = [
  { key: 'currentAssets.total', label: 'Aset Lancar' },
  { key: 'nonCurrentAssets.total', label: 'Aset Tidak Lancar' },
  { key: 'totalLiabilities', label: 'Total Liabilitas' },
  { key: 'totalEquity', label: 'Total Ekuitas' },
  { key: 'totalAssets', label: 'Total Aset' },
  { key: 'totalLiabilitiesEquity', label: 'Total Liabilitas dan Ekuitas' },
  { key: 'currentAssets.cash', label: 'Kas dan setara kas' },
  { key: 'currentAssets.tradeReceivables3rd', label: 'Piutang usaha - neto: Pihak ketiga' },
  { key: 'currentAssets.tradeReceivablesRelated', label: 'Piutang usaha - neto: Pihak-pihak berelasi' },
  { key: 'currentAssets.otherReceivables3rd', label: 'Piutang lain-lain - neto: Pihak ketiga' },
  { key: 'currentAssets.otherReceivablesRelated', label: 'Piutang lain-lain - neto: Pihak-pihak berelasi' },
  { key: 'currentAssets.inventory', label: 'Persediaan' },
  { key: 'currentAssets.prepaidTax', label: 'Pajak dibayar di muka' },
  { key: 'currentAssets.otherCurrentAssets', label: 'Aset lancar lainnya' },
  { key: 'currentAssets.prepaidExpenses', label: 'Biaya dibayar dimuka dan uang muka' },
  { key: 'nonCurrentAssets.investmentAssociates', label: 'Investasi pada entitas asosiasi' },
  { key: 'nonCurrentAssets.fixedAssets', label: 'Aset tetap' },
  { key: 'nonCurrentAssets.otherNCA', label: 'Aset tidak lancar lainnya' },
  { key: 'currentLiabilities.total', label: 'Liabilitas Jangka Pendek' },
  { key: 'currentLiabilities.tradePayables', label: 'Utang usaha: Pihak ketiga' },
  { key: 'currentLiabilities.otherPayables', label: 'Utang lain-lain: Pihak ketiga' },
  { key: 'currentLiabilities.taxPayable', label: 'Utang pajak' },
  { key: 'currentLiabilities.unearnedRevenue', label: 'Pendapatan diterima di muka satu tahun' },
  { key: 'currentLiabilities.accruedExpenses', label: 'Biaya yang masih harus dibayar' },
  { key: 'nonCurrentLiabilities.total', label: 'Liabilitas Jangka Panjang' },
  { key: 'nonCurrentLiabilities.otherLTPayables', label: 'Utang lain-lain jangka panjang' },
  { key: 'nonCurrentLiabilities.employeeBenefits', label: 'Program lainnya yang tidak didanai' },
  { key: 'nonCurrentLiabilities.deferredTaxLiability', label: 'Liabilitas pajak tangguhan' },
  { key: 'equity.paidUpCapital', label: 'Modal ditempatkan dan disetor penuh' },
  { key: 'equity.oci', label: 'Penghasilan komprehensif lain' },
  { key: 'equity.retainedEarnings', label: 'Saldo laba: Belum ditentukan penggunaannya' },
];

const DEFAULT_BAR_KEYS = ['currentAssets.total', 'nonCurrentAssets.total', 'totalLiabilities', 'totalEquity'];

const BAR_COLORS = {
  'currentAssets.total': '#2FA84A',
  'nonCurrentAssets.total': '#5FC98A',
  'totalLiabilities': '#DC2626',
  'totalEquity': '#2389C4',
  'totalAssets': '#16A34A',
  'totalLiabilitiesEquity': '#94A3B8',
  'currentAssets.cash': '#10B981',
  'currentAssets.inventory': '#F59E0B',
  'nonCurrentAssets.fixedAssets': '#7C3AED',
  'currentLiabilities.total': '#EF4444',
  'nonCurrentLiabilities.total': '#F97316',
  'equity.paidUpCapital': '#0EA5E9',
  'equity.retainedEarnings': '#8B5CF6',
};

function getLabelForKey(key) {
  const opt = ALL_BAR_OPTIONS.find(o => o.key === key);
  return opt?.label || key;
}

export default function SectionBalanceSheet({ data, allRecords, rkapRecords, years, selectedYear, onYearChange, searchTerm, mode = 'annual', onModeChange, ytdMonth = 8, onYtdMonthChange, chartRowRef, chartsCollapsed, onToggleCharts, chartSticky, isShortViewport }) {
  if (!data) return null;
  const { kpis } = data;

  // Separate selection state per mode
  // Annual & YTD share one shared selection, Monthly has its own; Quarterly stays single-select.
  const DEFAULT_ANNUAL_KEYS = ['totalAssets', 'currentAssets.total', 'nonCurrentAssets.total', 'totalEquity', 'totalLiabilities'];
  const DEFAULT_PARENT = BS_HIERARCHY[0].key; // 'Total Aset' — default line chart item
  // Default bar chart package: all three types (Aset, Liabilitas, Ekuitas) without selecting table rows
  const DEFAULT_BAR_PARENTS = BS_HIERARCHY.map(h => h.key); // 'Total Aset' + 'Total Liabilitas dan Ekuitas'
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
    return buildHierarchicalTableRows(allRecords, years, BS_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear]);

  // Build hierarchical table rows (quarterly)
  const quarterlyData = useMemo(() => {
    if (!allRecords || !isQuarterly) return null;
    return buildHierarchicalTableRowsQuarterly(allRecords, years, BS_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isQuarterly]);

  // Build hierarchical table rows (YTD)
  const ytdData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, BS_HIERARCHY, ytdMonth, rkapRecords, rkapYear);
  }, [allRecords, years, rkapRecords, rkapYear, isYTD, ytdMonth]);

  // YTD rows for the bar chart: per year, falls back to the last month with data
  // when ytdMonth has no data yet (e.g. 2026 only until Aug, Sep selected → position Aug)
  const ytdChartData = useMemo(() => {
    if (!allRecords || !isYTD) return null;
    return buildHierarchicalTableRowsYTD(allRecords, years, BS_HIERARCHY, ytdMonth, null, null, { clampToAvailable: true });
  }, [allRecords, years, isYTD, ytdMonth]);

  // Build hierarchical table rows (Monthly)
  const monthlyData = useMemo(() => {
    if (!allRecords || !isMonthly) return null;
    return buildHierarchicalTableRowsMonthly(allRecords, monthlyYear, BS_HIERARCHY, rkapRecords, rkapYear);
  }, [allRecords, monthlyYear, rkapRecords, rkapYear, isMonthly]);

  // Shared table selection (default package = top-level parent 'Total Aset')
  const annualSel = useRowSelection(tableRows, { defaultParentId: DEFAULT_BAR_PARENTS });
  const monthlySel = useRowSelection(monthlyData?.rows || [], { defaultParentId: DEFAULT_BAR_PARENTS });
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

  // Build breakdown data (annual/YTD/Monthly) — values come from annual table rows (snapshot)
  const breakdownData = useMemo(() => {
    if (!isBreakdownMode) return null;
    if (isMonthly) {
      if (!monthlyData?.rows) return null;
      return buildBreakdownBarDataMonthly({ rows: monthlyData.rows, targetYear: monthlyYear, leafIds: activeSel.activeLeafIds, variant: 'balance' });
    }
    if (isYTD) {
      // YTD: Balance Sheet is positional — position at ytdMonth (or last available month)
      if (!ytdChartData?.rows) return null;
      return buildBreakdownBarData({
        rows: ytdChartData.rows, years, leafIds: activeSel.activeLeafIds, variant: 'balance',
        valueKey: (y) => `YTD_${y}`,
        noteFor: buildYTDNoteFor(ytdChartData.columns, ytdMonth, 'balance'),
      });
    }
    return buildBreakdownBarData({ rows: tableRows, years, leafIds: activeSel.activeLeafIds, variant: 'balance' });
  }, [isBreakdownMode, isMonthly, isYTD, monthlyData, ytdChartData, ytdMonth, monthlyYear, tableRows, years, activeSel.activeLeafIds]);

  const ytdPeriodNote = isYTD ? formatYTDNote(ytdMonth, 'balance') : null;

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

  // Type-based KPI strip: selected year, position at the last month with data
  const typeKpis = useMemo(() => {
    if (!allRecords) return null;
    return buildTypeKpis({
      records: allRecords, rkapRecords, hierarchy: BS_HIERARCHY, year: selectedYear,
      variant: 'balance', typeOrder: KPI_TYPE_ORDER.balanceSheet, profile: 'balanceSheet',
    });
  }, [allRecords, rkapRecords, selectedYear]);

  return (
    <div className="bi-section-stack">
      <TypeKpiStrip data={typeKpis} sectionId="bs" />
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
        title="Balance Sheet"
        sectionLabel="Balance Sheet Statements"
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
