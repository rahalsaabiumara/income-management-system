export function validateTabularRecords(records) {
  const validRecords = [];
  const invalidRecords = [];

  for (const record of records) {
    let isValid = true;
    const reasons = [];

    if (!record.id) {
      isValid = false;
      reasons.push('ID is missing');
    }
    if (!record.bulan) {
      isValid = false;
      reasons.push('Bulan is missing');
    }
    if (!record.uraian) {
      isValid = false;
      reasons.push('Uraian is missing');
    }
    if (record.jenis !== 'REALISASI' && record.jenis !== 'RKAP') {
      isValid = false;
      reasons.push('Jenis must be REALISASI or RKAP');
    }
    if (typeof record.value !== 'number' || isNaN(record.value)) {
      isValid = false;
      reasons.push('Value is not a valid number');
    }

    if (isValid) {
      validRecords.push(record);
    } else {
      invalidRecords.push({ record, reasons });
    }
  }

  // Deduplicate IDs in the batch itself, taking the last occurrence
  const dedupedRecords = [];
  const seenIds = new Set();
  
  // Iterate backwards to keep the latest if duplicates exist
  for (let i = validRecords.length - 1; i >= 0; i--) {
    const rec = validRecords[i];
    if (!seenIds.has(rec.id)) {
      seenIds.add(rec.id);
      dedupedRecords.unshift(rec);
    } else {
      invalidRecords.push({ record: rec, reasons: ['Duplicate ID in batch'] });
    }
  }

  return {
    valid: dedupedRecords,
    invalid: invalidRecords
  };
}
