/**
 * validation.js — Data validation and duplicate detection.
 */

/**
 * Detect duplicate records based on business key.
 * Business key = period.year + period.month + canonical + type(jenis was already filtered).
 *
 * @param {Array<object>} mappedRecords
 * @returns {{ deduped: Array<object>, duplicates: Array<object>, conflicts: Array<object> }}
 */
export function deduplicateRecords(mappedRecords) {
  const seen = new Map(); // businessKey → record
  const deduped = [];
  const duplicates = [];
  const conflicts = [];

  for (const record of mappedRecords) {
    const bk = `${record.period.year}-${String(record.period.month).padStart(2, '0')}::${record.canonical}`;

    if (seen.has(bk)) {
      const existing = seen.get(bk);
      if (existing.value === record.value) {
        // Exact duplicate — skip silently
        duplicates.push({ businessKey: bk, record, existingId: existing.originalId });
      } else {
        // Value conflict — log but keep first
        conflicts.push({
          businessKey: bk,
          existingValue: existing.value,
          existingId: existing.originalId,
          duplicateValue: record.value,
          duplicateId: record.originalId,
        });
      }
    } else {
      seen.set(bk, record);
      deduped.push(record);
    }
  }

  if (duplicates.length > 0) {
    console.log(`[BI Validation] ${duplicates.length} exact duplicates removed.`);
  }
  if (conflicts.length > 0) {
    console.warn(`[BI Validation] ${conflicts.length} VALUE CONFLICTS detected:`);
    conflicts.forEach(c => console.warn(`  - ${c.businessKey}: ${c.existingValue} vs ${c.duplicateValue}`));
  }

  return { deduped, duplicates, conflicts };
}

/**
 * Collect validation warnings for a set of mapped records.
 *
 * @param {Array<object>} records
 * @returns {Array<{ type: string, message: string, record?: object }>}
 */
export function validateRecords(records) {
  const warnings = [];

  for (const r of records) {
    if (r.value === null || r.value === undefined || isNaN(r.value)) {
      warnings.push({ type: 'invalid_value', message: `Invalid value for ${r.canonical} at ${r.period.year}-${r.period.month}`, record: r });
    }
    if (!r.period.year || !r.period.month) {
      warnings.push({ type: 'missing_period', message: `Missing period for ${r.canonical}`, record: r });
    }
  }

  return warnings;
}
