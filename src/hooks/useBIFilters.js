import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

const VALID_MODES = ['annual', 'quarterly', 'ytd', 'monthly'];
const DEFAULT_MODE = 'annual';

/**
 * useBIFilters — single-source-of-truth hook for BI dashboard filters.
 *
 * Reads and writes URL query params: year, mode, month.
 * Params that equal their default are omitted from the URL.
 *
 * @param {Object} opts
 * @param {number[]} opts.availableYears — sorted desc (latest first)
 * @param {number}   [opts.latestMonth]  — last month with data (1-12), used as default for YTD month
 * @returns {{ year, mode, month, setYear, setMode, setMonth, availableYears }}
 */
export default function useBIFilters({ availableYears = [], latestMonth = 8 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultYear = availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
  const defaultMonth = latestMonth;

  // ── Read ──
  const year = useMemo(() => {
    const raw = searchParams.get('year');
    if (!raw) return defaultYear;
    const n = Number(raw);
    if (!Number.isFinite(n) || !availableYears.includes(n)) return defaultYear;
    return n;
  }, [searchParams, defaultYear, availableYears]);

  const mode = useMemo(() => {
    const raw = searchParams.get('mode');
    if (!raw || !VALID_MODES.includes(raw)) return DEFAULT_MODE;
    return raw;
  }, [searchParams]);

  const month = useMemo(() => {
    const raw = searchParams.get('month');
    if (!raw) return defaultMonth;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 12) return defaultMonth;
    return n;
  }, [searchParams, defaultMonth]);

  // ── Write helpers ──
  // We use a functional updater that merges with the current params,
  // stripping defaults to keep the URL clean.
  const updateParams = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined) {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      }
      // Strip defaults
      if (next.get('year') === String(defaultYear)) next.delete('year');
      if (next.get('mode') === DEFAULT_MODE || !next.get('mode')) next.delete('mode');
      if (next.get('month') === String(defaultMonth)) next.delete('month');
      return next;
    }, { replace: true });
  }, [setSearchParams, defaultYear, defaultMonth]);

  const setYear = useCallback((y) => updateParams({ year: y }), [updateParams]);
  const setMode = useCallback((m) => updateParams({ mode: m }), [updateParams]);
  const setMonth = useCallback((m) => updateParams({ month: m }), [updateParams]);

  return useMemo(() => ({
    year,
    mode,
    month,
    setYear,
    setMode,
    setMonth,
    availableYears
  }), [year, mode, month, setYear, setMode, setMonth, availableYears]);
}
