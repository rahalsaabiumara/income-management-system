/**
 * mapping.js — Semantic mapping from raw Supabase records to canonical metrics.
 *
 * Maps each record using uraian + sub_uraian (NOT row position).
 * Tracks unmapped items for debugging.
 */

import { SECTION_MAPPINGS } from './constants.js';
import { buildLookupKey, parsePeriod } from './normalize.js';

/**
 * Map raw records from a section to canonical metrics.
 *
 * @param {string} sectionKey - 'LR', 'CF', 'BS', or 'REV'
 * @param {Array<object>} records - raw records from Supabase
 * @returns {{ mapped: Array<object>, unmapped: Array<object> }}
 *
 * Each mapped record has:
 *   { canonical, group, label, type, isTotal, period: { year, month }, value, originalUraian, originalSubUraian }
 */
export function mapToCanonical(sectionKey, records) {
  const mappingTable = SECTION_MAPPINGS[sectionKey];
  if (!mappingTable) {
    console.warn(`[BI Mapping] No mapping table for section: ${sectionKey}`);
    return { mapped: [], unmapped: records.map(r => ({ ...r, reason: 'no_mapping_table' })) };
  }

  const mapped = [];
  const unmapped = [];

  for (const record of records) {
    const subUraian = record.sub_uraian || null;
    
    // Try composite key first (uraian::sub_uraian), then uraian-only
    const compositeKey = buildLookupKey(record.uraian, subUraian);
    const uraianOnlyKey = buildLookupKey(record.uraian, null);
    
    const mapping = mappingTable[compositeKey] || (subUraian ? null : mappingTable[uraianOnlyKey]);

    if (!mapping) {
      unmapped.push({
        id: record.id,
        uraian: record.uraian,
        sub_uraian: subUraian,
        value: record.value,
        bulan: record.bulan,
        lookupKey: compositeKey,
        reason: 'no_mapping_found',
      });
      continue;
    }

    const period = parsePeriod(record.bulan);

    mapped.push({
      canonical: mapping.canonical,
      group: mapping.group,
      label: mapping.label,
      type: mapping.type,
      isTotal: mapping.isTotal || false,
      period,
      value: record.value,
      originalUraian: record.uraian,
      originalSubUraian: subUraian,
      originalId: record.id,
    });
  }

  if (unmapped.length > 0) {
    console.warn(`[BI Mapping] ${sectionKey}: ${unmapped.length} unmapped records:`);
    const uniqueKeys = [...new Set(unmapped.map(u => u.lookupKey))];
    uniqueKeys.forEach(k => console.warn(`  - "${k}"`));
  }

  return { mapped, unmapped };
}

/**
 * Map all sections at once.
 *
 * @param {{ LR: Array, CF: Array, BS: Array, REV: Array }} rawData
 * @returns {{ LR: { mapped, unmapped }, CF: { mapped, unmapped }, BS: { mapped, unmapped }, REV: { mapped, unmapped } }}
 */
export function mapAllSections(rawData) {
  return {
    LR: mapToCanonical('LR', rawData.LR || []),
    CF: mapToCanonical('CF', rawData.CF || []),
    BS: mapToCanonical('BS', rawData.BS || []),
    REV: mapToCanonical('REV', rawData.REV || []),
  };
}
