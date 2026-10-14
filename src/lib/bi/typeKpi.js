/**
 * typeKpi.js — Pure builder for the type-based KPI strip
 * (Profit Loss, Cash Flow, Balance Sheet).
 *
 * Uses the SAME leaf classification and leaf resolution as the breakdown bar
 * chart (breakdown.js → classifyLeaf / isLeafRow) and the EXISTING
 * aggregations (YTD via buildHierarchicalTableRowsYTD, monthly series via
 * buildMonthlyData). No new aggregation rules are introduced:
 *   - Period: selected year, Jan..m where m = last month with data
 *     (SNAPSHOT metrics → value at month m).
 *   - Type realisation = Σ |leaf value| (= bar height in the bar chart).
 *   - Type RKAP = Σ |leaf annual RKAP|.
 */

import { classifyLeaf, isLeafRow } from './breakdown.js';
import { buildHierarchicalTableRowsYTD } from './viewModel.js';
import { buildMonthlyData, getEffectiveYTDMonth } from './aggregation.js';
import { BREAKDOWN_TYPES, MONTH_NAMES } from './constants.js';
import { normalizeKey } from './normalize.js';
import { formatCompact } from './calculations.js';

const hasValue = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const sumAbs = (vals) => {
  const present = vals.filter(hasValue);
  return present.length ? present.reduce((s, v) => s + Math.abs(v), 0) : null;
};
const pct = (num, den) => (hasValue(num) && hasValue(den) && den !== 0 ? (num / den) * 100 : null);
const fmtPct = (v) => (hasValue(v) ? `${v.toFixed(1)}%` : '-');

/**
 * @param {object} p
 * @param {Array} p.records - realisasi records of the section (all years)
 * @param {Array} [p.rkapRecords] - RKAP records of the section
 * @param {Array} p.hierarchy - section hierarchy config (same as the table)
 * @param {number} p.year - selected (global) year
 * @param {'flow'|'balance'} p.variant - classification variant
 * @param {string[]} p.typeOrder - fixed type order for the section
 * @param {'profitLoss'|'cashFlow'|'balanceSheet'} p.profile - insight profile
 * @returns {{ month: number|null, pace: number|null, types: Array }}
 */
export function buildTypeKpis({ records, rkapRecords, hierarchy, year, variant, typeOrder, profile, ytdMonth }) {
  const recs = records || [];
  const m = getEffectiveYTDMonth(recs, year, ytdMonth || 12); // last month with data up to ytdMonth
  const isBalance = variant === 'balance';
  const pace = !isBalance && m && m < 12 ? (m / 12) * 100 : null;

  // Current YTD rows (+ annual RKAP of the selected year) and previous-year YTD rows (same months)
  const curKey = `YTD_${year}`;
  const prevKey = `YTD_${year - 1}`;
  const hasRkap = rkapRecords && rkapRecords.length > 0;
  const cur = buildHierarchicalTableRowsYTD(recs, [year], hierarchy, m || 1, hasRkap ? rkapRecords : null, hasRkap ? year : null);
  const prev = m ? buildHierarchicalTableRowsYTD(recs, [year - 1], hierarchy, m, null, null, { clampToAvailable: true }) : null;
  const prevById = new Map((prev?.rows || []).map(r => [r.id, r]));
  const rows = cur.rows;
  const rowsById = new Map(rows.map(r => [r.id, r]));

  // Monthly series of the selected year (existing per-month values; SNAPSHOT = position)
  const monthly = buildMonthlyData(recs.filter(r => r.period?.year === year), year);

  // Leaves grouped by type, in table order
  const byType = new Map();
  for (const row of rows) {
    if (!isLeafRow(row)) continue;
    const typeKey = classifyLeaf(row, rowsById, variant);
    if (!typeOrder.includes(typeKey)) continue;
    if (!byType.has(typeKey)) byType.set(typeKey, []);
    byType.get(typeKey).push(row);
  }

  const types = typeOrder.filter(k => byType.has(k)).map(typeKey => {
    const meta = BREAKDOWN_TYPES[typeKey] || BREAKDOWN_TYPES.lainnya;
    const leafRows = byType.get(typeKey);

    const curVals = leafRows.map(r => (m ? r.values?.[curKey] : null));
    const prevVals = leafRows.map(r => prevById.get(r.id)?.values?.[prevKey]);
    const rkapVals = leafRows.map(r => r.rkap?.[year]);

    const value = sumAbs(curVals);
    const prevValue = sumAbs(prevVals);
    const rkap = sumAbs(rkapVals) ?? 0;
    const achievement = rkap !== 0 && hasValue(value) ? pct(value, rkap) : null;
    const yoy = hasValue(value) && hasValue(prevValue) && prevValue !== 0
      ? ((value - prevValue) / prevValue) * 100
      : null;

    // Sparkline: Σ |leaf| per month, months 1..m
    const spark = [];
    if (m) {
      for (let mo = 1; mo <= m; mo++) {
        const vals = leafRows.map(r => monthly.get(r.canonical)?.monthlyValues?.[mo - 1]?.value);
        spark.push({ month: mo, value: sumAbs(vals) });
      }
    }

    const leaves = leafRows.map((r, i) => {
      const v = curVals[i];
      const pv = prevVals[i];
      const rk = rkapVals[i];
      return {
        id: r.id,
        name: r.name,
        value: hasValue(v) ? v : null,
        rkap: hasValue(rk) ? rk : null,
        achievement: hasValue(v) && hasValue(rk) && rk !== 0 ? (Math.abs(v) / Math.abs(rk)) * 100 : null,
        share: hasValue(v) && hasValue(value) && value !== 0 ? (Math.abs(v) / value) * 100 : null,
        // Same YoY formula as the table (signed values)
        yoy: hasValue(v) && hasValue(pv) && pv !== 0 ? ((v - pv) / Math.abs(pv)) * 100 : null,
      };
    });

    return {
      key: typeKey,
      label: meta.label,
      color: meta.color,
      gradient: meta.gradient,
      value,
      rkap,
      achievement,
      yoy,
      spark,
      leaves,
      insight: null,
    };
  });

  // Insights (ratios use type realisations, not table total rows)
  const t = Object.fromEntries(types.map(x => [x.key, x]));
  const avgPeak = (type) => {
    if (!hasValue(type.value) || !m) return null;
    const peak = type.spark.filter(s => hasValue(s.value)).reduce((a, b) => (!a || b.value > a.value ? b : a), null);
    return `Rata-rata ${formatCompact(type.value / m)} per bulan${peak ? ` · puncak ${MONTH_NAMES[peak.month - 1]}` : ''}`;
  };
  const ratioOf = (type, base, baseLabel) => `${fmtPct(pct(type.value, base?.value))} dari ${baseLabel}`;
  const join = (...parts) => parts.filter(Boolean).join(' · ');

  for (const type of types) {
    if (profile === 'profitLoss') {
      if (type.key === 'pendapatan') type.insight = avgPeak(type);
      else if (type.key === 'pengeluaran') type.insight = ratioOf(type, t.pendapatan, 'pendapatan');
      else if (type.key === 'bunga') type.insight = ratioOf(type, t.pendapatan, 'pendapatan');
      else if (type.key === 'pajak') {
        const pbt = rows.find(r => {
          const n = normalizeKey(r.name);
          return n.includes('laba') && n.includes('sebelum') && n.includes('pajak');
        });
        type.insight = pbt
          ? `Tarif efektif ${fmtPct(pct(type.value, hasValue(pbt.values?.[curKey]) ? Math.abs(pbt.values[curKey]) : null))} dari laba sebelum pajak`
          : ratioOf(type, t.pendapatan, 'pendapatan');
      }
    } else if (profile === 'cashFlow') {
      if (type.key === 'pendapatan') type.insight = avgPeak(type);
      else if (type.key === 'pengeluaran') type.insight = ratioOf(type, t.pendapatan, 'penerimaan');
      else if (type.key === 'pajak' || type.key === 'bunga') type.insight = ratioOf(type, t.pendapatan, 'penerimaan');
      else if (type.key === 'lainnya') type.insight = `${type.leaves.length} sub uraian di luar tipe utama`;
    } else if (profile === 'balanceSheet') {
      if (type.key === 'aset') type.insight = null;
      else if (type.key === 'liabilitas') type.insight = ratioOf(type, t.aset, 'total aset');
      else if (type.key === 'ekuitas') type.insight = ratioOf(type, t.aset, 'total aset');
    }
  }

  return { month: m, pace, types };
}
