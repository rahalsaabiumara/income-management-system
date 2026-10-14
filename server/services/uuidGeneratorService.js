import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { readAllMappings } from './templateMapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tag map
const TAG_MAP = {
  'LR': 'LR',
  'ARUS_KAS': 'CF',
  'NERACA': 'BL',
  'PDPT': 'RE'
};

// Cache for the schema so we don't read exceljs on every request
let uuidSchemaCache = null;
// Objek mapping yang dipakai saat cache dibangun; jika templateMapper memuat ulang
// (template.xlsx berubah), objeknya berbeda dan skema dibangun ulang.
let uuidSchemaSource = null;

/**
 * Normalise uraian strings for matching.
 */
function norm(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Pre-computes the UUID metadata structure from template.xlsx using exceljs.
 * We iterate through the data rows defined by templateMapper and assign:
 * - Bold rows: type='bold', code='A', 'B', 'C'
 * - Non-bold rows: type='normal', parentCode='A', childNumber=1, 2, 3
 * 
 * Returns a schema map.
 */
export async function buildUuidMetadata() {
  const mappings = readAllMappings();
  if (uuidSchemaCache && uuidSchemaSource === mappings) return uuidSchemaCache;

  const TEMPLATE_PATH = path.join(__dirname, '../../src/assets/template.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const schema = {};

  for (const [tableType, mapData] of Object.entries(mappings)) {
    const sheetName = mapData.sheetName;
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;

    const sheetSchema = {};
    const tag = TAG_MAP[tableType] || tableType;

    let parentCharCode = 64; // Start at '@' so first increment gives 'A'
    let childCount = 0;
    
    // For flat structures like PDPT, we don't append parentCode to child
    const isFlat = (tableType === 'PDPT');

    // Iterate through data rows defined by templateMapper
    for (let r = mapData.dataStartRow + 1; r <= mapData.dataEndRow + 1; r++) { // exceljs is 1-indexed
      const uraianColIndex = mapData.uraianCol + 1;
      const cell = ws.getRow(r).getCell(uraianColIndex);
      
      const rawText = cell.value;
      if (!rawText) continue;
      
      const textStr = rawText.toString().trim();
      if (!textStr) continue;

      const isBold = cell.font && cell.font.bold;

      if (isBold) {
        parentCharCode++;
        childCount = 0; // reset child count
        sheetSchema[norm(textStr)] = {
          type: 'bold',
          tag,
          code: String.fromCharCode(parentCharCode)
        };
      } else {
        childCount++;
        // If we haven't seen a parent yet, we default to '0' to avoid colliding with the first parent ('A')
        const currentParentCode = parentCharCode === 64 ? '0' : String.fromCharCode(parentCharCode);
        sheetSchema[norm(textStr)] = {
          type: 'normal',
          tag,
          parentCode: currentParentCode,
          childNumber: childCount,
          isFlat
        };
      }
    }

    schema[tableType] = sheetSchema;
  }

  uuidSchemaCache = schema;
  uuidSchemaSource = mappings;
  return schema;
}

/**
 * Clears the cache.
 */
export function clearUuidSchemaCache() {
  uuidSchemaCache = null;
}

/**
 * Generates the UUID for a specific record.
 * 
 * @param {object} params
 * @param {string} params.monthCode - e.g. 'JAN'
 * @param {number} params.year - e.g. 2025
 * @param {string} params.tableType - e.g. 'LR', 'ARUS_KAS'
 * @param {string} params.uraian - Original uraian from template
 * @param {string} params.jenis - 'REALISASI' or 'RKAP'
 * @returns {string} 
 */
export async function generateTabularUuid({ monthCode, year, tableType, uraian, jenis }) {
  const schema = await buildUuidMetadata();
  const sheetSchema = schema[tableType];
  
  if (!sheetSchema) {
    throw new Error(`Schema not found for tableType: ${tableType}`);
  }

  const meta = sheetSchema[norm(uraian)];
  if (!meta) {
    console.warn(`[Warning] Uraian not found in template for UUID generation: "${uraian}"`);
    return null;
  }

  const yy = year.toString().slice(-2);
  const tag = meta.tag;
  const suffix = jenis === 'REALISASI' ? 'REAL' : (jenis === 'RKAP' ? 'RKAP' : jenis);

  if (meta.type === 'bold') {
    // Bold: {BLN}-{huruf}-{TAG}{YY}-{REAL/RKAP}
    return `${monthCode}-${meta.code}-${tag}${yy}-${suffix}`;
  } else {
    if (meta.isFlat) {
      // Non-bold flat: {BLN}-{nomor}-{TAG}{YY}-{REAL/RKAP}
      return `${monthCode}-${meta.childNumber}-${tag}${yy}-${suffix}`;
    } else {
      // Non-bold hierarchal: {BLN}-{nomor}-{hurufSub}-{TAG}{YY}-{REAL/RKAP}
      return `${monthCode}-${meta.childNumber}-${meta.parentCode}-${tag}${yy}-${suffix}`;
    }
  }
}
