/**
 * dataAccess.js — Supabase data fetching for BI Dashboard.
 *
 * Uses the EXISTING supabase client from src/supabase.js.
 * Queries all 4 financial tables with ALL relevant columns.
 * Filters by jenis (REALISASI/RKAP).
 */

import { supabase } from '../../supabase.js';
import { SECTIONS } from './constants.js';

/**
 * Fetch all financial data from Supabase for a given jenis.
 *
 * @param {string} jenis - 'REALISASI' or 'RKAP'
 * @returns {Promise<{ LR: Array, CF: Array, BS: Array, REV: Array, errors: Array }>}
 */
export async function fetchAllFinancialData(jenis = 'REALISASI') {
  const result = { LR: [], CF: [], BS: [], REV: [], errors: [] };

  const queries = Object.entries(SECTIONS).map(async ([key, section]) => {
    try {
      let allRows = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(section.table)
          .select('*')
          .eq('jenis', jenis)
          .order('bulan', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error(`[BI DataAccess] Error fetching ${section.table}:`, error.message);
          result.errors.push({ table: section.table, error: error.message });
          hasMore = false;
          continue;
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      result[key] = allRows;
    } catch (err) {
      console.error(`[BI DataAccess] Exception fetching ${section.table}:`, err.message);
      result.errors.push({ table: section.table, error: err.message });
    }
  });

  await Promise.all(queries);

  console.log(`[BI DataAccess] Fetched: LR=${result.LR.length}, CF=${result.CF.length}, BS=${result.BS.length}, REV=${result.REV.length} (jenis=${jenis})`);

  return result;
}

/**
 * Get available years from the fetched data.
 * @param {{ LR: Array, CF: Array, BS: Array, REV: Array }} rawData
 * @returns {number[]} sorted list of years
 */
export function getAvailableYears(rawData) {
  const years = new Set();
  for (const section of Object.values(rawData)) {
    if (!Array.isArray(section)) continue;
    for (const row of section) {
      if (row.bulan) {
        const year = parseInt(String(row.bulan).substring(0, 4), 10);
        if (!isNaN(year)) years.add(year);
      }
    }
  }
  return [...years].sort((a, b) => b - a); // newest first
}

/**
 * Fetch both REALISASI and RKAP data in parallel.
 * @returns {Promise<{ realisasi: object, rkap: object, years: number[] }>}
 */
export async function fetchBothJenis() {
  const [realisasi, rkap] = await Promise.all([
    fetchAllFinancialData('REALISASI'),
    fetchAllFinancialData('RKAP'),
  ]);

  // Combine years from both
  const yearsSet = new Set([
    ...getAvailableYears(realisasi),
    ...getAvailableYears(rkap),
  ]);
  const years = [...yearsSet].sort((a, b) => b - a);

  return { realisasi, rkap, years };
}
