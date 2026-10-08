/**
 * calculations.js — Derived metrics calculated from aggregated data.
 */

/**
 * Calculate revenue growth between two periods.
 * @param {number} current - current period revenue
 * @param {number} previous - previous period revenue
 * @returns {number|null} growth percentage, or null if previous is 0/missing
 */
export function calcGrowth(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Calculate margin percentage.
 * @param {number} numerator - e.g. gross profit
 * @param {number} denominator - e.g. revenue
 * @returns {number|null} margin percentage, or null if denominator is 0/missing
 */
export function calcMargin(numerator, denominator) {
  if (!denominator || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

/**
 * Format a large number in compact form (Indonesian).
 * Rp 1.234.567.890 → "Rp 1,2 M" (Miliar)
 * Rp 123.456.789 → "Rp 123,5 Jt" (Juta)
 *
 * @param {number} value
 * @param {{ prefix?: string, decimals?: number }} options
 * @returns {string}
 */
export function formatCompact(value, { prefix = '', decimals = 2 } = {}) {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000_000_000).toFixed(decimals)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(decimals)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000).toFixed(decimals)}Jt`;
  }
  if (abs >= 1_000) {
    return `${sign}${prefix}${(abs / 1_000).toFixed(decimals)}Rb`;
  }
  return `${sign}${prefix}${abs.toFixed(decimals)}`;
}

/**
 * Format a number with Indonesian locale separators (full form).
 * @param {number} value
 * @returns {string}
 */
export function formatFull(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a percentage.
 * @param {number|null} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}
