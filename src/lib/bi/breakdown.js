/**
 * breakdown.js — Pure helpers for the Annual "Performance Breakdown" bar chart
 * (Profit Loss, Cash Flow, Balance Sheet).
 *
 * - Leaf classification into types (Pendapatan / Pengeluaran / Bunga / Pajak /
 *   Lainnya for flow sections; Aset / Liabilitas / Ekuitas for Balance Sheet).
 * - Descendant-leaf resolution for parent ("induk") packages.
 * - Shaping hierarchical table rows into stacked-bar chart data.
 *
 * Values are taken as-is from the hierarchical table rows (which already use
 * the existing annual aggregation: FLOW summed, SNAPSHOT period-end). No new
 * calculations are introduced here — only Math.abs() for bar height.
 */

import {
  BREAKDOWN_TYPES,
  BREAKDOWN_TYPE_ORDER,
  BREAKDOWN_KEYWORD_RULES,
  BREAKDOWN_NAME_OVERRIDES,
  BREAKDOWN_BS_BRANCH_RULES,
  MONTH_NAMES,
} from './constants.js';
import { normalizeKey } from './normalize.js';
import { generateShades } from './colorShades.js';

/** A leaf ("sub uraian") is a row without children. */
export const isLeafRow = (row) => !row?.hasChildren;

/**
 * Human label for a YTD period.
 * 'flow' → "YTD Jan–Mei"; 'balance' → "Posisi akhir Mei".
 * @param {number} month - 1-12
 * @param {'flow'|'balance'} [variant]
 */
export function formatYTDNote(month, variant = 'flow') {
  const m = MONTH_NAMES[month - 1] || `M${month}`;
  if (variant === 'balance') return `Posisi akhir ${m}`;
  return month > 1 ? `YTD Jan–${m}` : 'YTD Jan';
}

/**
 * Per-year note for YTD charts built with clampToAvailable. Returns a function
 * year → { note, fallback } | null; only years whose effective month is earlier
 * than the requested month get a note (e.g. "YTD Jan–Agu · data terakhir").
 *
 * @param {Array<{year:number, effectiveMonth:number|null}>} columns - YTD columns
 * @param {number} targetMonth
 * @param {'flow'|'balance'} [variant]
 */
export function buildYTDNoteFor(columns, targetMonth, variant = 'flow') {
  const byYear = new Map((columns || []).map(c => [c.year, c.effectiveMonth]));
  return (y) => {
    const eff = byYear.get(y);
    if (!eff || eff >= targetMonth) return null;
    return { note: `${formatYTDNote(eff, variant)} · data terakhir`, fallback: true };
  };
}

/**
 * Classify a Profit Loss / Cash Flow leaf by its uraian name.
 * Priority: name override → keyword rules (top to bottom) → 'lainnya'.
 * The sign of the value is intentionally NOT used.
 *
 * @param {string} name
 * @returns {string} type key
 */
export function classifyFlowLeaf(name) {
  const norm = normalizeKey(name);
  if (BREAKDOWN_NAME_OVERRIDES[norm]) return BREAKDOWN_NAME_OVERRIDES[norm];
  for (const rule of BREAKDOWN_KEYWORD_RULES) {
    const terms = [...(rule.phrases || []), ...(rule.keywords || [])];
    if (terms.some(t => norm.includes(t))) return rule.type;
  }
  return 'lainnya';
}

/**
 * Classify a Balance Sheet leaf by the branch it belongs to.
 * Scans ancestors nearest → farthest; first ancestor matching exactly one
 * branch rule decides. Falls back to 'lainnya'.
 *
 * @param {object} row - leaf row
 * @param {Map<string, object>} rowsById
 * @returns {string} type key
 */
export function classifyBalanceLeaf(row, rowsById) {
  const norm = normalizeKey(row.name);
  if (BREAKDOWN_NAME_OVERRIDES[norm]) return BREAKDOWN_NAME_OVERRIDES[norm];
  let parentId = row.parentId;
  while (parentId !== null && parentId !== undefined) {
    const parent = rowsById.get(parentId);
    if (!parent) break;
    const pName = normalizeKey(parent.name);
    const matches = BREAKDOWN_BS_BRANCH_RULES.filter(r => r.keywords.some(k => pName.includes(k)));
    if (matches.length === 1) return matches[0].type;
    parentId = parent.parentId;
  }
  return 'lainnya';
}

/**
 * Classify a leaf for the given section variant.
 * @param {object} row
 * @param {Map<string, object>} rowsById
 * @param {'flow'|'balance'} variant
 */
export function classifyLeaf(row, rowsById, variant) {
  return variant === 'balance' ? classifyBalanceLeaf(row, rowsById) : classifyFlowLeaf(row.name);
}

/**
 * All leaf descendants (recursive) of a parent row, in table order.
 * Intermediate parents are excluded to avoid double counting.
 *
 * @param {Array} rows - hierarchical rows (table order)
 * @param {string} parentId
 * @returns {string[]} leaf row ids
 */
export function getDescendantLeafIds(rows, parentId) {
  if (!parentId) return [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const isDescendant = (row) => {
    let pid = row.parentId;
    while (pid !== null && pid !== undefined) {
      if (pid === parentId) return true;
      pid = byId.get(pid)?.parentId;
    }
    return false;
  };
  return rows.filter(r => isLeafRow(r) && isDescendant(r)).map(r => r.id);
}

/** Recharts-safe data key (dots would be read as object paths). */
const toDataKey = (typeKey, rowId) => `${typeKey}__${String(rowId).replace(/[^a-zA-Z0-9_]/g, '_')}`;

/**
 * Build stacked-bar data for the breakdown chart.
 *
 * @param {object} params
 * @param {Array} params.rows - annual hierarchical table rows (values keyed by year)
 * @param {number[]} params.years
 * @param {string[]} params.leafIds - leaf row ids to plot
 * @param {'flow'|'balance'} params.variant
 * @param {(year: number) => string|number} [params.valueKey] - maps a year to the key in row.values
 *   (annual rows: the year itself; YTD rows: `YTD_<year>`)
 * @param {(year: number) => string} [params.periodLabel] - x-axis label for a year
 * @returns {{
 *   years: number[],
 *   types: Array<{ key, label, color, segments: Array<{ id, dataKey, label, color }> }>,
 *   chartData: Array<object>
 * } | null}
 *   chartData entries: { year: '2024', [dataKey]: absValue, __raw: { [dataKey]: signedValue }, __top: { [typeKey]: dataKey } }
 */
export function buildBreakdownBarData({ rows, years, leafIds, variant, valueKey = (y) => y, periodLabel = (y) => String(y), noteFor = null }) {
  if (!rows || rows.length === 0 || !leafIds || leafIds.length === 0) return null;

  const sortedYears = [...years].sort((a, b) => a - b);
  const valueOf = (row, y) => row?.values?.[valueKey(y)];
  const rowsById = new Map(rows.map(r => [r.id, r]));
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const hasValue = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  // Leaves in table order, only those with at least one value
  const leaves = [...new Set(leafIds)]
    .map(id => rowsById.get(id))
    .filter(r => r && isLeafRow(r))
    .sort((a, b) => order.get(a.id) - order.get(b.id))
    .filter(r => sortedYears.some(y => hasValue(valueOf(r, y))));

  // Group by type
  const byType = new Map();
  for (const row of leaves) {
    const typeKey = classifyLeaf(row, rowsById, variant);
    if (!byType.has(typeKey)) byType.set(typeKey, []);
    byType.get(typeKey).push(row);
  }

  const typeOrder = BREAKDOWN_TYPE_ORDER[variant] || BREAKDOWN_TYPE_ORDER.flow;
  const orderedTypeKeys = [
    ...typeOrder.filter(k => byType.has(k)),
    ...[...byType.keys()].filter(k => !typeOrder.includes(k)),
  ];

  const types = orderedTypeKeys.map(typeKey => {
    const meta = BREAKDOWN_TYPES[typeKey] || BREAKDOWN_TYPES.lainnya;
    const typeRows = byType.get(typeKey);
    const shades = generateShades(meta.color, typeRows.length);
    return {
      key: typeKey,
      label: meta.label,
      color: meta.color,
      segments: typeRows.map((row, i) => ({
        id: row.id,
        dataKey: toDataKey(typeKey, row.id),
        label: row.name,
        color: shades[i],
      })),
    };
  });

  if (types.length === 0) return null;

  const chartData = sortedYears.map(y => {
    const entry = { period: periodLabel(y), year: String(y), __raw: {}, __top: {} };
    const n = noteFor ? noteFor(y) : null;
    if (n) { entry.__note = n.note; entry.__fallback = !!n.fallback; }
    for (const type of types) {
      for (const seg of type.segments) {
        const v = valueOf(rowsById.get(seg.id), y);
        if (!hasValue(v)) continue;
        entry[seg.dataKey] = Math.abs(v);
        entry.__raw[seg.dataKey] = v;
        if (v !== 0) entry.__top[type.key] = seg.dataKey;
      }
    }
    return entry;
  });

  return { years: sortedYears, types, chartData };
}

/**
 * Builds breakdown chart data for MONTHLY mode.
 * @param {Array} rows - table rows with monthly values
 * @param {number} targetYear
 * @param {string[]} leafIds
 * @param {'flow'|'balance'} variant
 */
export function buildBreakdownBarDataMonthly({ rows, targetYear, leafIds, variant }) {
  if (!rows || rows.length === 0 || !leafIds || leafIds.length === 0) return null;

  const rowsById = new Map(rows.map(r => [r.id, r]));
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const hasValue = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  // We need to know which month columns exist in the rows
  // Find the first row to extract month keys (M1_2026, M2_2026, etc)
  // Actually, we can just check M1 to M12
  const monthKeys = [];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  for (let m = 1; m <= 12; m++) {
    const key = `M${m}_${targetYear}`;
    // check if this key exists in any row's values
    if (rows.some(r => hasValue(r.values?.[key]))) {
      monthKeys.push({ m, key, label: monthLabels[m - 1] });
    }
  }

  const leaves = [...new Set(leafIds)]
    .map(id => rowsById.get(id))
    .filter(r => r && isLeafRow(r))
    .sort((a, b) => order.get(a.id) - order.get(b.id))
    .filter(r => monthKeys.some(mk => hasValue(r.values?.[mk.key])));

  const byType = new Map();
  for (const row of leaves) {
    const typeKey = classifyLeaf(row, rowsById, variant);
    if (!byType.has(typeKey)) byType.set(typeKey, []);
    byType.get(typeKey).push(row);
  }

  const typeOrder = BREAKDOWN_TYPE_ORDER[variant] || BREAKDOWN_TYPE_ORDER.flow;
  const orderedTypeKeys = [
    ...typeOrder.filter(k => byType.has(k)),
    ...[...byType.keys()].filter(k => !typeOrder.includes(k)),
  ];

  const types = orderedTypeKeys.map(typeKey => {
    const meta = BREAKDOWN_TYPES[typeKey] || BREAKDOWN_TYPES.lainnya;
    const typeRows = byType.get(typeKey);
    const shades = generateShades(meta.color, typeRows.length);
    return {
      key: typeKey,
      label: meta.label,
      color: meta.color,
      segments: typeRows.map((row, i) => ({
        id: row.id,
        dataKey: toDataKey(typeKey, row.id),
        label: row.name,
        color: shades[i],
      })),
    };
  });

  if (types.length === 0) return null;

  const chartData = monthKeys.map(mk => {
    const entry = { period: mk.label, month: mk.m, year: targetYear, __raw: {}, __top: {} };
    for (const type of types) {
      for (const seg of type.segments) {
        const v = rowsById.get(seg.id)?.values?.[mk.key];
        if (!hasValue(v)) continue;
        entry[seg.dataKey] = Math.abs(v);
        entry.__raw[seg.dataKey] = v;
        if (v !== 0) entry.__top[type.key] = seg.dataKey;
      }
    }
    return entry;
  });

  return { periods: monthKeys, types, chartData };
}
