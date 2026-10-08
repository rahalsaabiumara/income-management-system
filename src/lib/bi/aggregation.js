/**
 * aggregation.js — Aggregation engine respecting FLOW vs SNAPSHOT semantics.
 *
 * FLOW metrics: SUM monthly values for annual/quarterly.
 * SNAPSHOT metrics: Use LAST available month in period.
 */

import { MONTH_NAMES, QUARTER_MONTHS } from './constants.js';

/**
 * Filter records by year.
 * @param {Array<object>} records - mapped & deduped records
 * @param {number} year
 * @returns {Array<object>}
 */
export function filterByYear(records, year) {
  return records.filter(r => r.period.year === year);
}

/**
 * Get available months for a year from a set of records.
 * @param {Array<object>} records
 * @param {number} year
 * @returns {number[]} sorted month numbers (1-12)
 */
export function getAvailableMonths(records, year) {
  const months = new Set();
  for (const r of records) {
    if (r.period.year === year) months.add(r.period.month);
  }
  return [...months].sort((a, b) => a - b);
}

/**
 * Aggregate a set of records to produce a single value per canonical metric.
 *
 * @param {Array<object>} records - mapped & deduped records for a specific period
 * @param {'annual'|'monthly'} mode
 * @param {number} year
 * @param {number} [quarter] - 1-4, only used when mode is 'quarterly' (we treat as monthly with quarter filter)
 * @returns {Map<string, { value: number, label: string, type: string, isTotal: boolean, group: string, periods: number[] }>}
 */
export function aggregateMetrics(records, mode, year) {
  const yearRecords = filterByYear(records, year);
  const result = new Map();

  if (mode === 'monthly') {
    // Return per-month data — no aggregation needed, structure as monthly arrays
    return buildMonthlyData(yearRecords, year);
  }

  // Annual aggregation
  // Group by canonical
  const byCanonical = new Map();
  for (const r of yearRecords) {
    if (!byCanonical.has(r.canonical)) {
      byCanonical.set(r.canonical, { records: [], meta: r });
    }
    byCanonical.get(r.canonical).records.push(r);
  }

  for (const [canonical, { records: recs, meta }] of byCanonical) {
    let value;
    const periods = recs.map(r => r.period.month);

    if (meta.type === 'SNAPSHOT') {
      // Use LAST available month
      const sorted = [...recs].sort((a, b) => a.period.month - b.period.month);
      value = sorted[sorted.length - 1].value;
    } else {
      // FLOW: SUM all months
      value = recs.reduce((sum, r) => sum + (r.value || 0), 0);
    }

    result.set(canonical, {
      value,
      label: meta.label,
      type: meta.type,
      isTotal: meta.isTotal,
      group: meta.group,
      periods,
    });
  }

  return result;
}

/**
 * Build monthly data structure for chart rendering.
 *
 * @param {Array<object>} yearRecords - records filtered to a single year
 * @param {number} year
 * @returns {Map<string, { monthlyValues: Array<{month, value, label}>, label, type, isTotal, group }>}
 */
export function buildMonthlyData(yearRecords, year) {
  const result = new Map();

  // Group by canonical
  const byCanonical = new Map();
  for (const r of yearRecords) {
    if (!byCanonical.has(r.canonical)) {
      byCanonical.set(r.canonical, { records: [], meta: r });
    }
    byCanonical.get(r.canonical).records.push(r);
  }

  for (const [canonical, { records: recs, meta }] of byCanonical) {
    const monthlyValues = [];

    for (let m = 1; m <= 12; m++) {
      const monthRec = recs.find(r => r.period.month === m);
      monthlyValues.push({
        month: m,
        monthLabel: MONTH_NAMES[m - 1],
        value: monthRec ? monthRec.value : null,
        hasData: !!monthRec,
      });
    }

    result.set(canonical, {
      monthlyValues,
      label: meta.label,
      type: meta.type,
      isTotal: meta.isTotal,
      group: meta.group,
    });
  }

  return result;
}

/**
 * Aggregate for a specific quarter.
 *
 * @param {Array<object>} records
 * @param {number} year
 * @param {number} quarter - 1-4
 * @returns {Map<string, object>} same structure as aggregateMetrics
 */
export function aggregateQuarter(records, year, quarter) {
  const quarterKey = `Q${quarter}`;
  const months = QUARTER_MONTHS[quarterKey];
  if (!months) return new Map();

  const yearRecords = filterByYear(records, year);
  const quarterRecords = yearRecords.filter(r => months.includes(r.period.month));

  const result = new Map();
  const byCanonical = new Map();

  for (const r of quarterRecords) {
    if (!byCanonical.has(r.canonical)) {
      byCanonical.set(r.canonical, { records: [], meta: r });
    }
    byCanonical.get(r.canonical).records.push(r);
  }

  for (const [canonical, { records: recs, meta }] of byCanonical) {
    let value;

    if (canonical === 'openingCash') {
      // Special case: opening cash for a quarter = value at FIRST month of the quarter
      const sorted = [...recs].sort((a, b) => a.period.month - b.period.month);
      value = sorted[0].value;
    } else if (meta.type === 'SNAPSHOT') {
      const sorted = [...recs].sort((a, b) => a.period.month - b.period.month);
      value = sorted[sorted.length - 1].value;
    } else {
      value = recs.reduce((sum, r) => sum + (r.value || 0), 0);
    }

    result.set(canonical, {
      value,
      label: meta.label,
      type: meta.type,
      isTotal: meta.isTotal,
      group: meta.group,
      periods: recs.map(r => r.period.month),
    });
  }

  return result;
}

/**
 * Aggregate Year-To-Date data for a specific year and month.
 *
 * FLOW metrics: SUM of months 1..targetMonth.
 * SNAPSHOT metrics: value at targetMonth (not summed).
 * Special: openingCash uses month 1 value.
 *
 * If targetMonth data is not available for ANY metric in the year, returns null
 * for that metric to signal incomplete data.
 *
 * @param {Array<object>} records - all mapped+deduped records
 * @param {number} year
 * @param {number} targetMonth - 1-12
 * @param {object} [options]
 * @param {boolean} [options.clampToAvailable=false] - if the year has no data for
 *   targetMonth, fall back to the last available month <= targetMonth
 *   (e.g. data only until Aug and Sep requested → YTD Jan..Aug).
 * @returns {Map<string, object>} same structure as aggregateMetrics
 */
export function aggregateYTD(records, year, targetMonth, { clampToAvailable = false } = {}) {
  if (clampToAvailable) {
    const eff = getEffectiveYTDMonth(records, year, targetMonth);
    if (eff === null) return new Map();
    targetMonth = eff;
  }
  const yearRecords = filterByYear(records, year);
  const ytdRecords = yearRecords.filter(r => r.period.month >= 1 && r.period.month <= targetMonth);

  const result = new Map();
  const byCanonical = new Map();

  for (const r of ytdRecords) {
    if (!byCanonical.has(r.canonical)) {
      byCanonical.set(r.canonical, { records: [], meta: r });
    }
    byCanonical.get(r.canonical).records.push(r);
  }

  // Determine the max month available in this year's data
  const availableMonths = new Set(yearRecords.map(r => r.period.month));

  for (const [canonical, { records: recs, meta }] of byCanonical) {
    let value;

    if (canonical === 'openingCash') {
      // Opening cash: value at month 1
      const m1 = recs.find(r => r.period.month === 1);
      value = m1 ? m1.value : null;
    } else if (meta.type === 'SNAPSHOT') {
      // SNAPSHOT: value at targetMonth
      const targetRec = recs.find(r => r.period.month === targetMonth);
      value = targetRec ? targetRec.value : null;
    } else {
      // FLOW: SUM months 1..targetMonth
      // But only if data up to targetMonth is actually available
      const hasTargetMonth = recs.some(r => r.period.month === targetMonth);
      if (!hasTargetMonth && !availableMonths.has(targetMonth)) {
        // Year doesn't have data up to targetMonth → show null
        value = null;
      } else {
        value = recs.reduce((sum, r) => sum + (r.value || 0), 0);
      }
    }

    result.set(canonical, {
      value,
      label: meta.label,
      type: meta.type,
      isTotal: meta.isTotal,
      group: meta.group,
      periods: recs.map(r => r.period.month),
    });
  }

  return result;
}

/**
 * Effective YTD month for a year: the last month <= targetMonth that has data.
 * Returns null when the year has no data at all up to targetMonth.
 *
 * @param {Array<object>} records
 * @param {number} year
 * @param {number} targetMonth - 1-12
 * @returns {number|null}
 */
export function getEffectiveYTDMonth(records, year, targetMonth) {
  let eff = null;
  for (const r of filterByYear(records, year)) {
    const m = r.period?.month;
    if (m && m <= targetMonth && (eff === null || m > eff)) eff = m;
  }
  return eff;
}
