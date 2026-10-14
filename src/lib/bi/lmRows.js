/**
 * lmRows.js — Builds the rows of the "Laporan Manajemen" (LM) table view.
 *
 * 1. resolveLMLayout(sectionKey) matches every template label from lmLayout.js
 *    to a canonical metric key, in this order:
 *      1) exact match after normalization (trim, lowercase, collapse spaces)
 *         against the labels carried by the data (mapping labels in constants.js)
 *      2) the existing canonical dictionary (SECTION_MAPPINGS, same lookup keys
 *         as mapping.js: "uraian", "uraian::sub_uraian", or the sub_uraian part)
 *      3) keyword match (all words of the label found in exactly one canonical's
 *         dictionary entry / label)
 *    A canonical key is used by at most ONE template row: when two rows resolve
 *    to the same key, the stronger match wins (1 > 2 > 3, then first row), so a
 *    block title such as "ASET TIDAK LANCAR" does not duplicate the value of
 *    "TOTAL ASET TIDAK LANCAR". Unmatched rows have canonical = null.
 *
 * 2. buildLMRows(...) feeds the resolved keys as a FLAT list of nodes into the
 *    SAME table builders used by the Analitik table (viewModel.js), so period
 *    aggregation (flow vs snapshot, Kas Awal/Akhir, quarter, YTD, monthly, RKAP)
 *    is exactly the existing logic. Nothing is recomputed from components.
 */

import { SECTION_MAPPINGS } from './constants.js';
import { normalizeKey, buildLookupKey } from './normalize.js';
import {
  buildHierarchicalTableRows,
  buildHierarchicalTableRowsQuarterly,
  buildHierarchicalTableRowsYTD,
  buildHierarchicalTableRowsMonthly,
} from './viewModel.js';
import { LM_LAYOUT, LM_SHEETS } from './lmLayout.js';

const MATCH_RANK = { exact: 1, canonical: 2, keyword: 3 };

/** Words ignored by the keyword matcher. */
const STOP_WORDS = new Set(['dan', 'yang', 'dari', 'untuk', 'di', 'ke', 'atas', 'kepada']);

function tokenize(str) {
  return normalizeKey(str).split(/[^a-z0-9]+/).filter(t => t && !STOP_WORDS.has(t));
}

/** Single canonical key out of a set, or null when empty / ambiguous. */
function single(set) {
  return set.size === 1 ? [...set][0] : null;
}

/** Step 1 — exact (normalized) match against the data labels. */
function matchExact(label, mappingTable) {
  const norm = normalizeKey(label);
  const hits = new Set();
  for (const m of Object.values(mappingTable)) {
    if (normalizeKey(m.label) === norm) hits.add(m.canonical);
  }
  return single(hits);
}

/** Step 2 — existing canonical dictionary (mapping lookup keys). */
function matchCanonical(label, mappingTable) {
  // 2a) whole label as uraian
  const whole = buildLookupKey(label, null);
  if (mappingTable[whole]) return mappingTable[whole].canonical;

  // 2b) "uraian: sub_uraian" written on one line in the template
  const colon = label.indexOf(':');
  if (colon > 0) {
    const composite = buildLookupKey(label.slice(0, colon), label.slice(colon + 1));
    if (mappingTable[composite]) return mappingTable[composite].canonical;
  }

  // 2c) label equals the sub_uraian part of a composite key (any parent uraian)
  const hits = new Set();
  for (const [key, m] of Object.entries(mappingTable)) {
    const sep = key.indexOf('::');
    if (sep >= 0 && key.slice(sep + 2) === whole) hits.add(m.canonical);
  }
  return single(hits);
}

/** Step 3 — keyword match: every word of the label appears in the candidate. */
function matchKeyword(label, mappingTable) {
  const words = tokenize(label);
  if (words.length === 0) return null;

  const contains = new Set();
  const equal = new Set();
  for (const [key, m] of Object.entries(mappingTable)) {
    for (const text of [key.replace('::', ' '), m.label]) {
      const tokens = new Set(tokenize(text));
      if (words.every(w => tokens.has(w))) {
        contains.add(m.canonical);
        if (tokens.size === new Set(words).size) equal.add(m.canonical);
      }
    }
  }
  return single(contains) || single(equal);
}

const resolvedCache = new Map();
const warnedSections = new Set();

/**
 * Resolve the LM layout of a section to canonical keys.
 *
 * @param {'LR'|'CF'|'BS'|'REV'} sectionKey
 * @returns {Array<{ label: string, bold: boolean, canonical: string|null, matchedBy: string|null, note: string|null }>}
 */
export function resolveLMLayout(sectionKey) {
  if (resolvedCache.has(sectionKey)) return resolvedCache.get(sectionKey);

  const layout = LM_LAYOUT[sectionKey] || [];
  const mappingTable = SECTION_MAPPINGS[sectionKey] || {};

  const resolved = layout.map(({ label, bold }) => {
    let canonical = matchExact(label, mappingTable);
    let matchedBy = canonical ? 'exact' : null;
    if (!canonical) { canonical = matchCanonical(label, mappingTable); matchedBy = canonical ? 'canonical' : null; }
    if (!canonical) { canonical = matchKeyword(label, mappingTable); matchedBy = canonical ? 'keyword' : null; }
    return { label, bold, canonical, matchedBy, note: null };
  });

  // One template row per canonical key — the strongest match keeps it.
  const owner = new Map();
  resolved.forEach((r, i) => {
    if (!r.canonical) return;
    const prev = owner.get(r.canonical);
    if (prev === undefined || MATCH_RANK[r.matchedBy] < MATCH_RANK[resolved[prev].matchedBy]) {
      owner.set(r.canonical, i);
    }
  });
  resolved.forEach((r, i) => {
    if (r.canonical && owner.get(r.canonical) !== i) {
      r.note = `"${r.canonical}" sudah dipakai baris "${resolved[owner.get(r.canonical)].label}"`;
      r.canonical = null;
      r.matchedBy = null;
    }
  });

  if (!warnedSections.has(sectionKey)) {
    warnedSections.add(sectionKey);
    const unmatched = resolved.filter(r => !r.canonical);
    if (unmatched.length > 0) {
      console.warn(
        `[BI LM] ${sectionKey} (sheet ${LM_SHEETS[sectionKey]}): ${unmatched.length} baris template tanpa pasangan data:\n` +
        unmatched.map(r => `  - "${r.label}"${r.bold ? ' (tebal)' : ''}${r.note ? ` — ${r.note}` : ''}`).join('\n'),
      );
    }
  }

  resolvedCache.set(sectionKey, resolved);
  return resolved;
}

/**
 * Build the LM table rows for the active period mode.
 * Values come from the same builders (and therefore the same aggregation) as
 * the Analitik table; column keys are identical to the Analitik columns.
 *
 * @param {object} p
 * @param {'LR'|'CF'|'BS'|'REV'} p.sectionKey
 * @param {'annual'|'quarterly'|'ytd'|'monthly'} p.mode
 * @param {Array} p.records - mapped + deduped realisasi records (all years)
 * @param {Array|null} p.rkapRecords
 * @param {number[]} p.years
 * @param {number|null} p.rkapYear
 * @param {number} p.ytdMonth
 * @param {number} p.monthlyYear
 * @returns {Array<{ id, label, bold, canonical, values, rkap }>}
 */
export function buildLMRows({ sectionKey, mode, records, rkapRecords, years, rkapYear, ytdMonth, monthlyYear }) {
  if (!records) return [];
  const resolved = resolveLMLayout(sectionKey);
  // Flat node list (no children). Unmatched rows get a key that has no data.
  const nodes = resolved.map((r, i) => ({ key: r.canonical || `__lm_unmatched_${i}`, label: r.label }));

  let built;
  if (mode === 'quarterly') {
    built = buildHierarchicalTableRowsQuarterly(records, years, nodes, rkapRecords, rkapYear).rows;
  } else if (mode === 'ytd') {
    built = buildHierarchicalTableRowsYTD(records, years, nodes, ytdMonth, rkapRecords, rkapYear).rows;
  } else if (mode === 'monthly') {
    built = buildHierarchicalTableRowsMonthly(records, monthlyYear, nodes, rkapRecords, rkapYear).rows;
  } else {
    built = buildHierarchicalTableRows(records, years, nodes, rkapRecords, rkapYear);
  }

  return built.map((row, i) => ({
    id: `lm_${i}`,
    label: resolved[i].label,
    bold: resolved[i].bold,
    canonical: resolved[i].canonical,
    values: row.values || {},
    rkap: row.rkap || {},
  }));
}
