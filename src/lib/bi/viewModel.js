/**
 * viewModel.js — Orchestrator that builds the complete dashboard view model.
 *
 * Pipeline:
 *   fetchAllFinancialData() → mapAllSections() → deduplicateRecords() →
 *   aggregateMetrics() → buildDashboardViewModel()
 */

import { mapAllSections } from './mapping.js';
import { deduplicateRecords, validateRecords } from './validation.js';
import { aggregateMetrics, buildMonthlyData, filterByYear, aggregateQuarter, aggregateYTD, getEffectiveYTDMonth } from './aggregation.js';
import { calcGrowth, calcMargin } from './calculations.js';
import { MONTH_NAMES, QUARTER_MONTHS } from './constants.js';

/**
 * Build the complete dashboard view model from raw Supabase data.
 *
 * @param {{ LR: Array, CF: Array, BS: Array, REV: Array }} rawData
 * @param {number} year
 * @param {'annual'|'quarterly'} mode
 * @returns {object} viewModel ready for UI consumption
 */
export function buildDashboardViewModel(rawData, year, mode = 'annual', ytdMonth = 8) {
  // Step 1: Map all sections
  const allMapped = mapAllSections(rawData);

  // Step 2: Deduplicate each section
  const allDeduped = {};
  const allUnmapped = {};
  const allConflicts = {};

  for (const [key, { mapped, unmapped }] of Object.entries(allMapped)) {
    const { deduped, conflicts } = deduplicateRecords(mapped);
    const warnings = validateRecords(deduped);
    if (warnings.length > 0) {
      console.warn(`[BI ViewModel] ${key}: ${warnings.length} validation warnings`);
    }
    allDeduped[key] = deduped;
    allUnmapped[key] = unmapped;
    allConflicts[key] = conflicts;
  }

  // Step 3: Build section view models
  const cashFlow = buildCashFlowVM(allDeduped.CF, year, mode, ytdMonth);
  const profitLoss = buildProfitLossVM(allDeduped.LR, year, mode, ytdMonth);
  const balanceSheet = buildBalanceSheetVM(allDeduped.BS, year, mode, ytdMonth);
  const revenue = buildRevenueVM(allDeduped.REV, year, mode, ytdMonth);

  return {
    cashFlow,
    profitLoss,
    balanceSheet,
    revenue,
    meta: {
      year,
      mode,
      unmapped: allUnmapped,
      conflicts: allConflicts,
      totalUnmapped: Object.values(allUnmapped).reduce((s, arr) => s + arr.length, 0),
    },
  };
}

// ── Cash Flow View Model ─────────────────────────────────────────

function buildCashFlowVM(records, year, mode, ytdMonth) {
  const yearRecs = filterByYear(records, year);
  const annual = mode === 'ytd' ? aggregateYTD(records, year, ytdMonth, { clampToAvailable: true }) : aggregateMetrics(records, 'annual', year);
  const monthly = buildMonthlyData(yearRecs, year);

  const getValue = (key) => annual.get(key)?.value ?? null;

  // KPIs
  const kpis = {
    openingCash: getValue('openingCash'),
    operatingCF: getValue('operating.netCashFlow'),
    investingCF: getValue('investing.netCashFlow'),
    financingCF: getValue('financing.netCashFlow'),
    netChange: getValue('netChange'),
    closingCash: getValue('closingCash'),
  };

  // Monthly Operating CF Trend
  const opCFMonthly = monthly.get('operating.netCashFlow');
  const monthlyOperatingTrend = opCFMonthly
    ? opCFMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel,
      month: m.month,
      value: m.value,
    }))
    : [];

  // Cash Flow by Activity (for comparison chart)
  const activityComparison = [
    { name: 'Operasi', value: kpis.operatingCF, color: '#2FA84A' },
    { name: 'Investasi', value: kpis.investingCF, color: '#E0A83C' },
    { name: 'Pendanaan', value: kpis.financingCF, color: '#2389C4' },
  ].filter(a => a.value !== null);

  // Cash Position (closing cash per month)
  const closingMonthly = monthly.get('closingCash');
  const cashPositionTrend = closingMonthly
    ? closingMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel,
      month: m.month,
      value: m.value,
    }))
    : [];

  // Operating Breakdown
  const opBreakdownKeys = [
    'operating.customerReceipts',
    'operating.supplierPayments',
    'operating.employeePayments',
    'operating.otherReceipts',
    'operating.taxPayments',
    'operating.otherPayments',
  ];
  const operatingBreakdown = opBreakdownKeys
    .map(key => {
      const item = annual.get(key);
      return item ? { name: item.label, value: item.value, canonical: key } : null;
    })
    .filter(Boolean);

  return {
    kpis,
    monthlyOperatingTrend,
    activityComparison,
    cashPositionTrend,
    operatingBreakdown,
  };
}

// ── Profit & Loss View Model ─────────────────────────────────────

function buildProfitLossVM(records, year, mode, ytdMonth) {
  const annual = mode === 'ytd' ? aggregateYTD(records, year, ytdMonth, { clampToAvailable: true }) : aggregateMetrics(records, 'annual', year);
  const yearRecs = filterByYear(records, year);
  const monthly = buildMonthlyData(yearRecs, year);

  const getValue = (key) => annual.get(key)?.value ?? null;

  const revenue = getValue('revenue');
  const grossProfit = getValue('grossProfit');
  const operatingProfit = getValue('operatingProfit');
  const netIncome = getValue('netIncome');

  // Calculate previous year for growth (compare up to effective last month of selected year)
  const effMonth = getEffectiveYTDMonth(records, year, mode === 'ytd' ? ytdMonth : 12);
  const prevAnnual = effMonth
    ? aggregateYTD(records, year - 1, effMonth, { clampToAvailable: true })
    : aggregateMetrics(records, 'annual', year - 1);
  const prevRevenue = prevAnnual.get('revenue')?.value ?? null;
  const revenueGrowth = calcGrowth(revenue, prevRevenue);

  const kpis = {
    revenue,
    grossProfit,
    operatingProfit,
    netIncome,
    revenueGrowth,
    grossMargin: calcMargin(grossProfit, revenue),
    operatingMargin: calcMargin(operatingProfit, revenue),
    netMargin: calcMargin(netIncome, revenue),
  };

  // Monthly Net Income Trend
  const netIncomeMonthly = monthly.get('netIncome');
  const monthlyNetIncomeTrend = netIncomeMonthly
    ? netIncomeMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel,
      month: m.month,
      value: m.value,
    }))
    : [];

  // Monthly Revenue Trend
  const revenueMonthly = monthly.get('revenue');
  const monthlyRevenueTrend = revenueMonthly
    ? revenueMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel,
      month: m.month,
      value: m.value,
    }))
    : [];

  // Hierarchy rows for table
  const hierarchyKeys = [
    'revenue', 'cogs', 'grossProfit',
    'opex.marketing', 'opex.admin', 'opex.total',
    'operatingProfit', 'otherIncome', 'otherExpense', 'operatingPL',
    'financeIncome', 'financeCost', 'profitBeforeTax',
    'tax.current', 'tax.deferred', 'tax.total',
    'netIncome', 'oci', 'comprehensiveIncome',
  ];
  const hierarchy = hierarchyKeys
    .map(key => {
      const item = annual.get(key);
      return item ? { canonical: key, name: item.label, value: item.value, isTotal: item.isTotal, group: item.group } : null;
    })
    .filter(Boolean);

  return {
    kpis,
    monthlyNetIncomeTrend,
    monthlyRevenueTrend,
    hierarchy,
  };
}

// ── Balance Sheet View Model ─────────────────────────────────────

function buildBalanceSheetVM(records, year, mode, ytdMonth) {
  const annual = mode === 'ytd' ? aggregateYTD(records, year, ytdMonth, { clampToAvailable: true }) : aggregateMetrics(records, 'annual', year);
  const yearRecs = filterByYear(records, year);
  const monthly = buildMonthlyData(yearRecs, year);

  const getValue = (key) => annual.get(key)?.value ?? null;

  const kpis = {
    totalAssets: getValue('totalAssets'),
    totalLiabilities: getValue('totalLiabilities'),
    totalEquity: getValue('totalEquity'),
    currentAssets: getValue('currentAssets.total'),
    nonCurrentAssets: getValue('nonCurrentAssets.total'),
    currentLiabilities: getValue('currentLiabilities.total'),
    nonCurrentLiabilities: getValue('nonCurrentLiabilities.total'),
  };

  // Monthly Total Assets trend (for line chart)
  const assetsMonthly = monthly.get('totalAssets');
  const monthlyAssetsTrend = assetsMonthly
    ? assetsMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel, month: m.month, value: m.value,
    }))
    : [];

  // Composition: Assets vs Liabilities vs Equity
  const composition = [
    { name: 'Aset', value: kpis.totalAssets, color: '#2FA84A' },
    { name: 'Liabilitas', value: kpis.totalLiabilities, color: '#DC2626' },
    { name: 'Ekuitas', value: kpis.totalEquity, color: '#2389C4' },
  ].filter(c => c.value !== null);

  // Monthly position for all 3 (assets, liab, equity) — for multi-line chart
  const liabMonthly = monthly.get('totalLiabilities');
  const equityMonthly = monthly.get('totalEquity');
  const availableMonths = assetsMonthly
    ? assetsMonthly.monthlyValues.filter(m => m.hasData).map(m => m.month)
    : [];

  const positionTrend = availableMonths.map(m => {
    const idx = m - 1;
    return {
      name: MONTH_NAMES[idx],
      month: m,
      assets: assetsMonthly?.monthlyValues[idx]?.value ?? null,
      liabilities: liabMonthly?.monthlyValues[idx]?.value ?? null,
      equity: equityMonthly?.monthlyValues[idx]?.value ?? null,
    };
  });

  // Detail hierarchy
  const hierarchyKeys = [
    'currentAssets.cash', 'currentAssets.tradeReceivables3rd', 'currentAssets.tradeReceivablesRelated',
    'currentAssets.otherReceivables3rd', 'currentAssets.otherReceivablesRelated',
    'currentAssets.inventory', 'currentAssets.prepaidTax', 'currentAssets.otherCurrentAssets',
    'currentAssets.prepaidExpenses', 'currentAssets.total',
    'nonCurrentAssets.fixedAssets', 'nonCurrentAssets.otherNCA', 'nonCurrentAssets.deferredTaxAsset', 'nonCurrentAssets.total',
    'totalAssets',
    'currentLiabilities.tradePayables', 'currentLiabilities.otherPayables', 'currentLiabilities.taxPayable',
    'currentLiabilities.unearnedRevenue', 'currentLiabilities.accruedExpenses', 'currentLiabilities.total',
    'nonCurrentLiabilities.employeeBenefits', 'nonCurrentLiabilities.deferredTaxLiability', 'nonCurrentLiabilities.total',
    'totalLiabilities',
    'equity.paidUpCapital', 'equity.oci', 'equity.retainedEarnings',
    'totalEquity', 'totalLiabilitiesEquity',
  ];
  const hierarchy = hierarchyKeys
    .map(key => {
      const item = annual.get(key);
      return item ? { canonical: key, name: item.label, value: item.value, isTotal: item.isTotal, group: item.group } : null;
    })
    .filter(Boolean);

  return { kpis, monthlyAssetsTrend, composition, positionTrend, hierarchy };
}

// ── Revenue View Model ───────────────────────────────────────────

function buildRevenueVM(records, year, mode, ytdMonth) {
  const annual = mode === 'ytd' ? aggregateYTD(records, year, ytdMonth, { clampToAvailable: true }) : aggregateMetrics(records, 'annual', year);
  const yearRecs = filterByYear(records, year);
  const monthly = buildMonthlyData(yearRecs, year);

  const getValue = (key) => annual.get(key)?.value ?? null;

  const totalRevenue = getValue('total');
  const effMonth = getEffectiveYTDMonth(records, year, mode === 'ytd' ? ytdMonth : 12);
  const prevAnnual = effMonth
    ? aggregateYTD(records, year - 1, effMonth, { clampToAvailable: true })
    : aggregateMetrics(records, 'annual', year - 1);
  const prevRevenue = prevAnnual.get('total')?.value ?? null;
  const revenueGrowth = calcGrowth(totalRevenue, prevRevenue);

  const kpis = {
    totalRevenue,
    revenueGrowth,
  };

  // Monthly Total Revenue Trend
  const totalMonthly = monthly.get('total');
  const monthlyTotalTrend = totalMonthly
    ? totalMonthly.monthlyValues.filter(m => m.hasData).map(m => ({
      name: m.monthLabel, month: m.month, value: m.value,
    }))
    : [];

  // Revenue by Category
  const categoryKeys = ['training', 'consulting', 'assessment', 'hotelMice', 'digitalBusiness'];
  const categoryBreakdown = categoryKeys
    .map(key => {
      const item = annual.get(key);
      return item ? { canonical: key, name: item.label, value: item.value } : null;
    })
    .filter(Boolean);

  // Monthly by category (for stacked chart)
  const monthlyCategoryData = [];
  const availableMonths = totalMonthly
    ? totalMonthly.monthlyValues.filter(m => m.hasData).map(m => m.month)
    : [];

  for (const m of availableMonths) {
    const entry = { name: MONTH_NAMES[m - 1], month: m };
    for (const key of categoryKeys) {
      const catMonthly = monthly.get(key);
      if (catMonthly) {
        const monthData = catMonthly.monthlyValues[m - 1];
        entry[key] = monthData?.value ?? 0;
      }
    }
    monthlyCategoryData.push(entry);
  }

  return {
    kpis,
    monthlyTotalTrend,
    categoryBreakdown,
    monthlyCategoryData,
    categoryKeys,
  };
}

// ── Multi-Year Helpers (for PerformanceBarChart & DataTable) ──────

/**
 * Build multi-year bar chart data for a set of parent keys.
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number[]} years - sorted desc
 * @param {Array<{key: string, label: string, color: string}>} seriesDefs
 * @returns {{ years: number[], series: Array<{key, label, color, data: {[year]: number}}> }}
 */
export function buildMultiYearBarData(records, years, seriesDefs) {
  const sortedYears = [...years].sort((a, b) => a - b);
  const series = seriesDefs.map(def => {
    const data = {};
    for (const y of sortedYears) {
      const annual = aggregateMetrics(records, 'annual', y);
      const item = annual.get(def.key);
      data[y] = item?.value ?? null;
    }
    return { key: def.key, label: def.label, color: def.color, data };
  });

  return { years: sortedYears, series };
}

/**
 * Build quarterly bar chart data for a SINGLE uraian key.
 * Returns data shaped for PerformanceBarChart quarterly mode:
 * Each year has 4 bars (Q1-Q4) for the selected uraian.
 *
 * @param {Array} records - all mapped+deduped records
 * @param {number[]} years - sorted desc
 * @param {string} metricKey - canonical key of the selected uraian
 * @param {string} metricLabel - display label
 * @returns {{ years: number[], series: Array<{key, label, color, data: {[year]: number}}> }}
 */
export function buildQuarterlyBarData(records, years, metricKey, metricLabel) {
  const sortedYears = [...years].sort((a, b) => a - b);
  const quarterColors = ['#2FA84A', '#5FC98A', '#E0A83C', '#2389C4'];

  const series = [1, 2, 3, 4].map((q, idx) => {
    const data = {};
    for (const y of sortedYears) {
      const qMap = aggregateQuarter(records, y, q);
      const item = qMap.get(metricKey);
      data[y] = item?.value ?? null;
    }
    return {
      key: `Q${q}`,
      label: `Q${q}`,
      color: quarterColors[idx],
      data,
    };
  });

  return { years: sortedYears, series };
}

/**
 * Build multi-year table rows for DataTable.
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number[]} years - sorted desc
 * @param {string[]} hierarchyKeys - canonical keys in display order
 * @param {object} [rkapAnnualMap] - Map from aggregateMetrics for RKAP data (optional)
 * @param {number} [rkapYear] - which year the RKAP column represents
 * @returns {Array<{canonical, name, isTotal, group, values: {[year]: number}, rkap: {[year]: number}, yoyChanges: {[year]: number|null}}>}
 */
export function buildMultiYearTableRows(records, years, hierarchyKeys, rkapAnnualMap = null, rkapYear = null) {
  const sortedYears = [...years].sort((a, b) => b - a); // newest first for table display

  return hierarchyKeys.map(key => {
    const values = {};
    const yoyChanges = {};

    for (const y of sortedYears) {
      const annual = aggregateMetrics(records, 'annual', y);
      const item = annual.get(key);
      values[y] = item?.value ?? null;
    }

    // YoY change calculation
    for (let i = 0; i < sortedYears.length - 1; i++) {
      const currYear = sortedYears[i];
      const prevYear = sortedYears[i + 1];
      const curr = values[currYear];
      const prev = values[prevYear];
      if (curr !== null && prev !== null && prev !== 0) {
        yoyChanges[currYear] = ((curr - prev) / Math.abs(prev)) * 100;
      } else {
        yoyChanges[currYear] = null;
      }
    }

    // RKAP value
    const rkap = {};
    if (rkapAnnualMap && rkapYear) {
      const rkItem = rkapAnnualMap.get(key);
      rkap[rkapYear] = rkItem?.value ?? null;
    }

    // Get label & metadata from most recent year's aggregation
    const latestAnnual = aggregateMetrics(records, 'annual', sortedYears[0]);
    const meta = latestAnnual.get(key);

    return {
      canonical: key,
      name: meta?.label || key,
      isTotal: meta?.isTotal || false,
      group: meta?.group || '',
      values,
      rkap,
      yoyChanges,
    };
  }).filter(row => {
    // Only keep rows where at least one year has data
    return Object.values(row.values).some(v => v !== null) || Object.values(row.rkap).some(v => v !== null);
  });
}

/**
 * Hierarchy node definition used by section components.
 * @typedef {Object} HierarchyNode
 * @property {string} key - canonical metric key (e.g. 'totalAssets')
 * @property {string} label - display label override
 * @property {HierarchyNode[]} [children] - child nodes
 */

/**
 * Build hierarchical table rows with depth, parent, and hasChildren metadata.
 * Flattens a tree config into ordered rows suitable for DataTable expand/collapse.
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number[]} years - sorted desc
 * @param {HierarchyNode[]} hierarchy - tree-shaped config
 * @param {Array} [rkapRecords] - RKAP records for RKAP column
 * @param {number|null} [rkapYear] - which year has RKAP data
 * @returns {Array<{id, canonical, name, isTotal, group, depth, hasChildren, parentId, values, rkap, yoyChanges}>}
 */
export function buildHierarchicalTableRows(records, years, hierarchy, rkapRecords = null, rkapYear = null) {
  const sortedYears = [...years].sort((a, b) => b - a);
  const rows = [];

  // Pre-compute annual aggregations per year (once per year, shared across all rows)
  const annualCache = new Map();
  const getAnnual = (recs, y) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}`;
    if (!annualCache.has(cacheKey)) {
      annualCache.set(cacheKey, aggregateMetrics(recs, 'annual', y));
    }
    return annualCache.get(cacheKey);
  };

  // RKAP annual map
  const rkapAnnualMap = rkapRecords && rkapYear ? getAnnual(rkapRecords, rkapYear) : null;

  function walk(nodes, depth, parentId) {
    for (const node of nodes) {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const rowId = node.key;

      // Build values per year
      const values = {};
      const yoyChanges = {};

      for (const y of sortedYears) {
        const annual = getAnnual(records, y);
        const item = annual.get(node.key);
        values[y] = item?.value ?? null;
      }

      // YoY change calculation
      for (let i = 0; i < sortedYears.length - 1; i++) {
        const currYear = sortedYears[i];
        const prevYear = sortedYears[i + 1];
        const curr = values[currYear];
        const prev = values[prevYear];
        if (curr !== null && prev !== null && prev !== 0) {
          yoyChanges[currYear] = ((curr - prev) / Math.abs(prev)) * 100;
        } else {
          yoyChanges[currYear] = null;
        }
      }

      // RKAP value
      const rkap = {};
      if (rkapAnnualMap && rkapYear) {
        const rkItem = rkapAnnualMap.get(node.key);
        rkap[rkapYear] = rkItem?.value ?? null;
      }

      // Get metadata from the latest year's aggregation
      const latestAnnual = getAnnual(records, sortedYears[0]);
      const meta = latestAnnual.get(node.key);

      rows.push({
        id: rowId,
        canonical: node.key,
        name: node.label || meta?.label || node.key,
        isTotal: hasChildren, // Nodes with children are "total/group" rows
        group: meta?.group || '',
        depth,
        hasChildren,
        accent: node.accent === true, // Force accent bar even on leaf rows
        color: node.color || null,
        parentId,
        values,
        rkap,
        yoyChanges,
      });

      if (hasChildren) {
        walk(node.children, depth + 1, rowId);
      }
    }
  }

  walk(hierarchy, 0, null);
  return rows;
}

/**
 * Build hierarchical table rows for QUARTERLY mode.
 * Same hierarchy structure, but columns are Q4 2026, Q3 2026, ... Q1 2022.
 * Values come from aggregateQuarter. YoY = same quarter previous year.
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number[]} years - available years
 * @param {HierarchyNode[]} hierarchy - tree-shaped config
 * @param {Array} [rkapRecords] - RKAP records for RKAP column
 * @param {number|null} [rkapYear] - which year has RKAP data
 * @returns {{ columns: Array<{key: string, label: string, year: number, quarter: number}>, rows: Array }}
 */
export function buildHierarchicalTableRowsQuarterly(records, years, hierarchy, rkapRecords = null, rkapYear = null) {
  const sortedYears = [...years].sort((a, b) => b - a);

  // Build quarter columns: newest first (Q4 2026, Q3 2026, ..., Q1 2022)
  const columns = [];
  for (const y of sortedYears) {
    for (let q = 4; q >= 1; q--) {
      columns.push({ key: `Q${q}_${y}`, label: `Q${q} ${y}`, year: y, quarter: q });
    }
  }

  // Cache quarter aggregations
  const quarterCache = new Map();
  const getQuarter = (recs, y, q) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}_Q${q}`;
    if (!quarterCache.has(cacheKey)) {
      quarterCache.set(cacheKey, aggregateQuarter(recs, y, q));
    }
    return quarterCache.get(cacheKey);
  };

  // RKAP annual map for the RKAP column (stays annual)
  const annualCache = new Map();
  const getAnnual = (recs, y) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}`;
    if (!annualCache.has(cacheKey)) {
      annualCache.set(cacheKey, aggregateMetrics(recs, 'annual', y));
    }
    return annualCache.get(cacheKey);
  };

  const rkapAnnualMap = rkapRecords && rkapYear ? getAnnual(rkapRecords, rkapYear) : null;

  const rows = [];

  function walk(nodes, depth, parentId) {
    for (const node of nodes) {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const rowId = node.key;

      // Build values per quarter column
      const values = {};
      const yoyChanges = {};

      for (const col of columns) {
        const qMap = getQuarter(records, col.year, col.quarter);
        const item = qMap.get(node.key);
        values[col.key] = item?.value ?? null;
      }

      // YoY change: compare same quarter in previous year
      for (const col of columns) {
        const prevYear = col.year - 1;
        const prevKey = `Q${col.quarter}_${prevYear}`;
        const curr = values[col.key];
        // Find previous year same quarter value
        const prevCol = columns.find(c => c.key === prevKey);
        if (prevCol) {
          const prev = values[prevKey];
          if (curr !== null && prev !== null && prev !== 0) {
            yoyChanges[col.key] = ((curr - prev) / Math.abs(prev)) * 100;
          } else {
            yoyChanges[col.key] = null;
          }
        } else {
          // Previous year not in dataset — try computing anyway
          const prevQMap = getQuarter(records, prevYear, col.quarter);
          const prevItem = prevQMap.get(node.key);
          const prev = prevItem?.value ?? null;
          if (curr !== null && prev !== null && prev !== 0) {
            yoyChanges[col.key] = ((curr - prev) / Math.abs(prev)) * 100;
          } else {
            yoyChanges[col.key] = null;
          }
        }
      }

      // RKAP value (annual, same as annual mode)
      const rkap = {};
      if (rkapAnnualMap && rkapYear) {
        const rkItem = rkapAnnualMap.get(node.key);
        rkap[rkapYear] = rkItem?.value ?? null;
      }

      // Get metadata from the latest year's aggregation
      const latestAnnual = getAnnual(records, sortedYears[0]);
      const meta = latestAnnual.get(node.key);

      rows.push({
        id: rowId,
        canonical: node.key,
        name: node.label || meta?.label || node.key,
        isTotal: hasChildren,
        group: meta?.group || '',
        depth,
        hasChildren,
        accent: node.accent === true,
        color: node.color || null,
        parentId,
        values,
        rkap,
        yoyChanges,
      });

      if (hasChildren) {
        walk(node.children, depth + 1, rowId);
      }
    }
  }

  walk(hierarchy, 0, null);
  return { columns, rows };
}

/**
 * Build hierarchical table rows for YTD mode.
 * One column per year, each showing the accumulated value from Jan to the selected month.
 * For SNAPSHOT metrics, uses the value at the selected month (not accumulated).
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number[]} years - available years
 * @param {HierarchyNode[]} hierarchy - tree-shaped config
 * @param {number} targetMonth - 1-12, the month selected by the user
 * @param {Array} [rkapRecords] - RKAP records for RKAP column
 * @param {number|null} [rkapYear] - which year has RKAP data
 * @param {object} [options]
 * @param {boolean} [options.clampToAvailable=false] - per year, fall back to the last
 *   month with data when targetMonth has no data yet (used by the YTD bar chart)
 * @returns {{ columns: Array<{key: string, label: string, year: number, effectiveMonth: number|null}>, rows: Array }}
 */
export function buildHierarchicalTableRowsYTD(records, years, hierarchy, targetMonth, rkapRecords = null, rkapYear = null, options = {}) {
  const { clampToAvailable = false } = options;
  const sortedYears = [...years].sort((a, b) => b - a);
  const monthLabel = MONTH_NAMES[targetMonth - 1]?.toUpperCase() || `M${targetMonth}`;

  // Build columns: one per year, label = "<MONTH> <YEAR>"
  const columns = sortedYears.map(y => ({
    key: `YTD_${y}`,
    label: `${monthLabel} ${y}`,
    year: y,
    effectiveMonth: clampToAvailable ? getEffectiveYTDMonth(records, y, targetMonth) : targetMonth,
  }));

  // Cache YTD aggregations
  const ytdCache = new Map();
  const getYTD = (recs, y, m) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}_M${m}`;
    if (!ytdCache.has(cacheKey)) {
      ytdCache.set(cacheKey, aggregateYTD(recs, y, m, { clampToAvailable }));
    }
    return ytdCache.get(cacheKey);
  };

  // RKAP annual map (stays annual, not YTD)
  const annualCacheYTD = new Map();
  const getAnnual = (recs, y) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}`;
    if (!annualCacheYTD.has(cacheKey)) {
      annualCacheYTD.set(cacheKey, aggregateMetrics(recs, 'annual', y));
    }
    return annualCacheYTD.get(cacheKey);
  };

  const rkapAnnualMap = rkapRecords && rkapYear ? getAnnual(rkapRecords, rkapYear) : null;

  const rows = [];

  function walk(nodes, depth, parentId) {
    for (const node of nodes) {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const rowId = node.key;

      // Build values per YTD column
      const values = {};
      const yoyChanges = {};

      for (const col of columns) {
        const ytdMap = getYTD(records, col.year, targetMonth);
        const item = ytdMap.get(node.key);
        values[col.key] = item?.value ?? null;
      }

      // YoY change: compare same YTD month in previous year
      for (let i = 0; i < columns.length - 1; i++) {
        const currCol = columns[i];
        const prevCol = columns[i + 1];
        const curr = values[currCol.key];
        const prev = values[prevCol.key];
        if (curr !== null && prev !== null && prev !== 0) {
          yoyChanges[currCol.key] = ((curr - prev) / Math.abs(prev)) * 100;
        } else {
          yoyChanges[currCol.key] = null;
        }
      }

      // RKAP value (annual, same as annual mode)
      const rkap = {};
      if (rkapAnnualMap && rkapYear) {
        const rkItem = rkapAnnualMap.get(node.key);
        rkap[rkapYear] = rkItem?.value ?? null;
      }

      // Get metadata from the latest year's aggregation
      const latestAnnual = getAnnual(records, sortedYears[0]);
      const meta = latestAnnual.get(node.key);

      rows.push({
        id: rowId,
        canonical: node.key,
        name: node.label || meta?.label || node.key,
        isTotal: hasChildren,
        group: meta?.group || '',
        depth,
        hasChildren,
        accent: node.accent === true,
        color: node.color || null,
        parentId,
        values,
        rkap,
        yoyChanges,
      });

      if (hasChildren) {
        walk(node.children, depth + 1, rowId);
      }
    }
  }

  walk(hierarchy, 0, null);
  return { columns, rows };
}

/**
 * Build hierarchical table rows for MONTHLY mode.
 * Columns: RKAP {year}, DES {year}, NOV {year}, ..., JAN {year}
 * Values come from buildMonthlyData (per-month actual values).
 * FLOW metrics: actual value for that month (NOT cumulative).
 * SNAPSHOT metrics: actual value for that month (position at month-end).
 * MoM change: compare current month vs previous month.
 *
 * @param {Array} records - all mapped+deduped records (across ALL years)
 * @param {number} targetYear - the selected year
 * @param {HierarchyNode[]} hierarchy - tree-shaped config
 * @param {Array} [rkapRecords] - RKAP records for RKAP column
 * @param {number|null} [rkapYear] - which year has RKAP data
 * @returns {{ columns: Array<{key: string, label: string, year: number, month: number}>, rows: Array }}
 */
export function buildHierarchicalTableRowsMonthly(records, targetYear, hierarchy, rkapRecords = null, rkapYear = null) {
  const yearRecs = records.filter(r => r?.period?.year === targetYear);
  const maxMonth = yearRecs.length > 0 ? Math.max(...yearRecs.map(r => r.period?.month).filter(Boolean)) : 12;

  // Build month columns: maxMonth → Jan (newest month first)
  const columns = [];
  for (let m = maxMonth; m >= 1; m--) {
    const monthLabel = MONTH_NAMES[m - 1]?.toUpperCase() || `M${m}`;
    columns.push({
      key: `M${m}_${targetYear}`,
      label: `${monthLabel} ${targetYear}`,
      year: targetYear,
      month: m,
    });
  }

  // Cache monthly data for the target year
  const monthlyCache = new Map();
  const getMonthly = (recs, y) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}`;
    if (!monthlyCache.has(cacheKey)) {
      const yearRecs = recs.filter(r => r.period.year === y);
      monthlyCache.set(cacheKey, buildMonthlyData(yearRecs, y));
    }
    return monthlyCache.get(cacheKey);
  };

  // RKAP annual map (stays annual — do NOT split into months)
  const annualCache = new Map();
  const getAnnual = (recs, y) => {
    const cacheKey = `${recs === records ? 'real' : 'rkap'}_${y}`;
    if (!annualCache.has(cacheKey)) {
      annualCache.set(cacheKey, aggregateMetrics(recs, 'annual', y));
    }
    return annualCache.get(cacheKey);
  };

  const rkapAnnualMap = rkapRecords && rkapYear ? getAnnual(rkapRecords, rkapYear) : null;
  const monthlyData = getMonthly(records, targetYear);

  const rows = [];

  function walk(nodes, depth, parentId) {
    for (const node of nodes) {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const rowId = node.key;

      // Build values per month column
      const values = {};
      const yoyChanges = {};

      const metricMonthly = monthlyData.get(node.key);

      for (const col of columns) {
        if (metricMonthly) {
          const monthEntry = metricMonthly.monthlyValues[col.month - 1];
          values[col.key] = monthEntry?.hasData ? monthEntry.value : null;
        } else {
          values[col.key] = null;
        }
      }

      // MoM change: compare each month vs the previous month
      for (let i = 0; i < columns.length - 1; i++) {
        const currCol = columns[i];     // e.g. Dec
        const prevCol = columns[i + 1]; // e.g. Nov
        const curr = values[currCol.key];
        const prev = values[prevCol.key];
        if (curr !== null && prev !== null && prev !== 0) {
          yoyChanges[currCol.key] = ((curr - prev) / Math.abs(prev)) * 100;
        } else {
          yoyChanges[currCol.key] = null;
        }
      }

      // RKAP value (annual, same as annual mode)
      const rkap = {};
      if (rkapAnnualMap && rkapYear) {
        const rkItem = rkapAnnualMap.get(node.key);
        rkap[rkapYear] = rkItem?.value ?? null;
      }

      // Get metadata from the latest year's aggregation
      const latestAnnual = getAnnual(records, targetYear);
      const meta = latestAnnual.get(node.key);

      rows.push({
        id: rowId,
        canonical: node.key,
        name: node.label || meta?.label || node.key,
        isTotal: hasChildren,
        group: meta?.group || '',
        depth,
        hasChildren,
        accent: node.accent === true,
        color: node.color || null,
        parentId,
        values,
        rkap,
        yoyChanges,
      });

      if (hasChildren) {
        walk(node.children, depth + 1, rowId);
      }
    }
  }

  walk(hierarchy, 0, null);
  return { columns, rows };
}

/**
 * Build monthly trend chart data for MONTHLY mode.
 * X-axis: Jan → Dec, series: one line per selected uraian key.
 * Used to compare multiple uraian across months within a single year.
 *
 * @param {Array} records - all mapped+deduped records
 * @param {number} targetYear - the selected year
 * @param {Array<{key: string, label: string, color: string}>} seriesDefs - selected uraian definitions
 * @returns {{ months: string[], series: Array<{key, label, color}>, chartData: Array<{name: string, month: number, [label]: number}> }}
 */
export function buildMonthlyTrendData(records, targetYear, seriesDefs) {
  const yearRecs = records.filter(r => r.period.year === targetYear);
  const monthly = buildMonthlyData(yearRecs, targetYear);

  const chartData = MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    const entry = { name, month };
    for (const def of seriesDefs) {
      const metricData = monthly.get(def.key);
      if (metricData) {
        const mv = metricData.monthlyValues[month - 1];
        entry[def.label] = mv?.hasData ? mv.value : null;
      } else {
        entry[def.label] = null;
      }
    }
    return entry;
  });

  return {
    months: [...MONTH_NAMES],
    series: seriesDefs,
    chartData,
  };
}
