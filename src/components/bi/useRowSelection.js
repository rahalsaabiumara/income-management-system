import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getDescendantLeafIds, isLeafRow } from '../../lib/bi/breakdown.js';
import { SELECTION_LIMIT_MESSAGE, SELECTION_NOTICE_MS, TREND_COLORS } from '../../lib/bi/constants.js';
import { DEPTH_COLORS } from '../../lib/bi/depthColors.js';
import { generateShades } from '../../lib/bi/colorShades.js';

/** Default (unselected) state. `colors` holds the sticky line color per selected row. */
export const DEFAULT_SELECTION_STATE = Object.freeze({ mode: 'default', parentIds: [], leafIds: [], selectedIds: [], colors: {} });

const EMPTY_SET = new Set();

/**
 * Pure transition for a click on row `id`.
 * Returns the next { mode, parentIds, leafIds } or `null` when the click is
 * rejected because the selection is already at `max`.
 */
export function nextSelection(prev, id, isLeaf, max = Infinity) {
  const listKey = isLeaf ? 'leafIds' : 'parentIds';
  const list = prev[listKey] || [];
  let newParents = prev.parentIds || [];
  let newLeaves = prev.leafIds || [];

  if (list.includes(id)) {
    // toggle off
    if (isLeaf) newLeaves = newLeaves.filter(x => x !== id);
    else newParents = newParents.filter(x => x !== id);
  } else {
    // toggle on
    if ((newParents.length + newLeaves.length) >= max) return null; // rejected
    if (isLeaf) newLeaves = [...newLeaves, id];
    else newParents = [...newParents, id];
  }

  const isDefault = newParents.length === 0 && newLeaves.length === 0;
  return {
    mode: isDefault ? 'default' : 'custom',
    parentIds: newParents,
    leafIds: newLeaves,
  };
}

function getBaseColor(row) {
  if (!row) return null;
  const hasAccent = row.hasChildren || row.accent === true;
  if (row.color) return row.color;
  if (hasAccent && DEPTH_COLORS[row.depth]) return DEPTH_COLORS[row.depth];
  return null;
}

function findAncestorColor(rowId, rowsById) {
  let curr = rowsById.get(rowId);
  while (curr) {
    const color = getBaseColor(curr);
    if (color) return color;
    curr = rowsById.get(curr.parentId);
  }
  return '#4B5563'; // fallback gray if somehow nothing found
}

/** Group selected ids by their ancestor base color, then assign ordered shades. */
function assignColors(ids, prevColors, rowsById) {
  const colors = {};
  const groupedByBase = {};

  for (const id of ids) {
    const baseColor = findAncestorColor(id, rowsById);
    if (!groupedByBase[baseColor]) groupedByBase[baseColor] = [];
    groupedByBase[baseColor].push(id);
  }

  for (const [baseColor, groupIds] of Object.entries(groupedByBase)) {
    // Sort so parent/shallower depths come first
    groupIds.sort((a, b) => {
      const rowA = rowsById.get(a);
      const rowB = rowsById.get(b);
      return (rowA?.depth || 0) - (rowB?.depth || 0);
    });

    const shades = generateShades(baseColor, groupIds.length);
    for (let i = 0; i < groupIds.length; i++) {
      colors[groupIds[i]] = shades[i];
    }
  }

  return colors;
}

/**
 * useRowSelection — shared table selection driving the bar chart and line chart.
 *
 * State: { mode: 'default' | 'custom', parentIds[], leafIds[], selectedIds[] }
 * Max `maxSelections` rows; an extra click is rejected and `notice` is shown briefly.
 *
 * @param {Array} rows - hierarchical rows (table order)
 * @param {object} [opts]
 * @param {string|string[]|null} [opts.defaultParentId] - package(s) used by the bar chart in default state
 * @param {boolean} [opts.flat=false] - treat every row as a leaf (Revenue: flat multi-select)
 */
export function useRowSelection(rows, { defaultParentId = null, flat = false } = {}) {
  const [state, setState] = useState(DEFAULT_SELECTION_STATE);
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const defaultKey = Array.isArray(defaultParentId) ? defaultParentId.join('|') : (defaultParentId || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultIds = useMemo(() => (defaultKey ? defaultKey.split('|') : []), [defaultKey]);

  const rowsById = useMemo(() => new Map((rows || []).map(r => [r.id, r])), [rows]);

  const showLimitNotice = useCallback(() => {
    setNotice(SELECTION_LIMIT_MESSAGE);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(null), SELECTION_NOTICE_MS);
  }, []);

  const select = useCallback((rowId) => {
    const row = rowsById.get(rowId);
    if (!row) return;
    const isLeaf = flat || isLeafRow(row);
    const next = nextSelection(state, rowId, isLeaf);
    if (next === null) {
      showLimitNotice();
      return;
    }
    
    // Maintain click order for selectedIds
    const newSelectedIds = state.selectedIds ? [...state.selectedIds] : [];
    if (newSelectedIds.includes(rowId)) {
      newSelectedIds.splice(newSelectedIds.indexOf(rowId), 1);
    } else {
      newSelectedIds.push(rowId);
    }
    next.selectedIds = newSelectedIds;

    setState({ ...next, colors: assignColors(newSelectedIds, state.colors, rowsById) });
  }, [state, rowsById, flat, showLimitNotice]);

  const reset = useCallback(() => setState(DEFAULT_SELECTION_STATE), []);

  const isDefault = state.mode === 'default';

  /** Selected row ids in click order (parents or leaves). */
  const selectedIds = useMemo(() => state.selectedIds || [], [state.selectedIds]);

  /** Rows highlighted in the table (leaves of a selected parent are NOT highlighted). */
  const selectedRowKeys = useMemo(
    () => (selectedIds.length ? new Set(selectedIds) : EMPTY_SET),
    [selectedIds],
  );

  /** Leaves plotted by the breakdown bar chart (deduped union of all selected parents' leaves + selected leaves). */
  const activeLeafIds = useMemo(() => {
    if (state.mode === 'default' && defaultIds.length) {
      const seen = new Set();
      for (const pid of defaultIds) {
        for (const leafId of getDescendantLeafIds(rows || [], pid)) seen.add(leafId);
      }
      return [...seen];
    }
    const seen = new Set(state.leafIds);
    for (const pid of state.parentIds) {
      for (const leafId of getDescendantLeafIds(rows || [], pid)) seen.add(leafId);
    }
    return [...seen];
  }, [state, rows, defaultIds]);

  /** Label of the plotted package (parents view incl. default). */
  const packageLabel = useMemo(() => {
    if (isDefault && defaultIds.length) return defaultIds.map(id => rowsById.get(id)?.name || id).join(' + ');
    return selectedIds.map(id => rowsById.get(id)?.name || id).join(' + ');
  }, [selectedIds, isDefault, defaultIds, rowsById]);

  return {
    state,
    isDefault,
    select,
    reset,
    notice,
    selectedIds,
    selectedRowKeys,
    activeLeafIds,
    packageLabel,
    colors: state.colors,
    // 'parent' for package views (incl. default), 'leaves' for free leaf selection
    viewMode: (state.mode === 'default' || state.parentIds.length > 0) ? 'parent' : 'leaves',
  };
}

/**
 * Build line-chart items from row ids.
 * @param {string[]} ids
 * @param {Array} rows - table rows (for labels)
 * @param {object} [colors] - sticky colors by id
 * @returns {Array<{ key: string, label: string, color: string|undefined }>}
 */
export function toLineItems(ids, rows, colors = {}) {
  const byId = new Map((rows || []).map(r => [r.id, r]));
  return ids.filter(Boolean).map(id => ({ key: id, label: byId.get(id)?.name || id, color: colors[id] }));
}
