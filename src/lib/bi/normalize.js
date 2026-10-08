/**
 * normalize.js — Text normalization for semantic matching.
 *
 * Normalizes uraian/sub_uraian strings so that variant spellings
 * can be matched to the same canonical key.
 *
 * Rules:
 * - trim whitespace
 * - lowercase
 * - collapse multiple spaces to single space
 * - normalize whitespace characters (tabs, nbsp, etc.)
 * - DO NOT alter the original value displayed to user
 */

import { URAIAN_ALIASES } from './constants.js';

/**
 * Normalize a string for lookup purposes.
 * @param {string} str
 * @returns {string} normalized key
 */
export function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s\u00A0\t\n\r]+/g, ' ') // collapse all whitespace
    .replace(/\s+/g, ' ');
}

/**
 * Build a lookup key from uraian + optional sub_uraian.
 * Format: "normalized_uraian" or "normalized_uraian::normalized_sub_uraian"
 *
 * @param {string} uraian
 * @param {string|null} subUraian
 * @returns {string} lookup key
 */
export function buildLookupKey(uraian, subUraian) {
  const normUraian = resolveAlias(normalizeKey(uraian));
  if (subUraian) {
    const normSub = resolveAlias(normalizeKey(subUraian));
    return `${normUraian}::${normSub}`;
  }
  return normUraian;
}

/**
 * Resolve alias to canonical name.
 * @param {string} normalized
 * @returns {string} canonical normalized name
 */
function resolveAlias(normalized) {
  return URAIAN_ALIASES[normalized] || normalized;
}

/**
 * Parse a bulan (ISO date string) into year and month number.
 * @param {string} bulan - e.g. "2025-01-01"
 * @returns {{ year: number, month: number }}
 */
export function parsePeriod(bulan) {
  const parts = String(bulan).split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}
