import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { readAllMappings } from './templateMapper.js';
import { buildUuidMetadata, generateTabularUuid } from './uuidGeneratorService.js';
import { parseLMName } from '../utils/dateParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONTH_CONFIG = {
  januari:   { display: 'JANUARI', code: 'JAN' },
  februari:  { display: 'FEBRUARI', code: 'FEB' },
  maret:     { display: 'MARET', code: 'MAR' },
  april:     { display: 'APRIL', code: 'APR' },
  mei:       { display: 'MEI', code: 'MEI' },
  juni:      { display: 'JUNI', code: 'JUN' },
  juli:      { display: 'JULI', code: 'JUL' },
  agustus:   { display: 'AGUSTUS', code: 'AGU' },
  september: { display: 'SEPTEMBER', code: 'SEP' },
  oktober:   { display: 'OKTOBER', code: 'OKT' },
  november:  { display: 'NOVEMBER', code: 'NOV' },
  desember:  { display: 'DESEMBER', code: 'DES' }
};

function norm(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Transforms an generated Excel workbook into Tabular Records.
 * 
 * @param {string} excelPath - Absolute path to the generated output.xlsx
 * @param {object} report - { nama, fileId, tanggal, ... }
 * @returns {Promise<Array>} Array of tabular records
 */
export async function transformExcelToTabular(excelPath, report) {
  const wb = XLSX.readFile(excelPath);
  const mappings = readAllMappings();
  const schemaMeta = await buildUuidMetadata();
  const records = [];

  // Parse month/year from report name
  const parsedName = parseLMName(report.nama || report.namaStandar);
  let bulanStr = parsedName?.bulanNama ? parsedName.bulanNama.toLowerCase() : null;
  let year = parsedName?.tahun;

  if (!bulanStr || !year) {
    throw new Error(`Unable to determine month/year from report name: ${report.nama}`);
  }

  const monthInfo = MONTH_CONFIG[bulanStr];
  if (!monthInfo) {
    throw new Error(`Unknown month string: ${bulanStr}`);
  }

  for (const [tableType, mapData] of Object.entries(mappings)) {
    const sheetName = mapData.sheetName;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const sheetSchema = schemaMeta[tableType];
    let currentParent = null; // Used for ARUS_KAS and NERACA

    for (let r = mapData.dataStartRow; r <= mapData.dataEndRow; r++) {
      const uraianCell = ws[XLSX.utils.encode_cell({ r, c: mapData.uraianCol })];
      const realisasiCell = ws[XLSX.utils.encode_cell({ r, c: mapData.realisasiCol })];
      const rkapCell = ws[XLSX.utils.encode_cell({ r, c: mapData.rkapCol })];

      const rawUraian = uraianCell ? uraianCell.v : null;
      if (!rawUraian) continue;

      const uraianStr = rawUraian.toString().trim();
      const meta = sheetSchema[norm(uraianStr)];
      
      let realisasiVal = realisasiCell && typeof realisasiCell.v === 'number' ? realisasiCell.v : null;
      let rkapVal = rkapCell && typeof rkapCell.v === 'number' ? rkapCell.v : null;

      // Ensure zero is not treated as null
      if (realisasiVal === 0) realisasiVal = 0;
      if (rkapVal === 0) rkapVal = 0;

      // Handle String values that look like '-'
      if (typeof realisasiCell?.v === 'string' && realisasiCell.v.trim() === '-') realisasiVal = null;
      if (typeof rkapCell?.v === 'string' && rkapCell.v.trim() === '-') rkapVal = null;

      const hasRealisasi = realisasiVal !== null && realisasiVal !== 0;
      const hasRkap = rkapVal !== null && rkapVal !== 0;

      // Hierarchy Logic
      let finalUraian = null;
      let finalSubUraian = null;
      const isBold = meta && meta.type === 'bold';

      if (tableType === 'LR') {
        if (uraianStr.includes(':')) {
          const parts = uraianStr.split(':');
          finalUraian = parts[0].trim();
          finalSubUraian = parts.slice(1).join(':').trim();
        } else {
          finalUraian = uraianStr;
          finalSubUraian = null;
        }
      } 
      else if (tableType === 'ARUS_KAS' || tableType === 'NERACA') {
        if (isBold && !hasRealisasi && !hasRkap) {
          // Parent
          currentParent = uraianStr;
          continue; // Don't create a record for empty parents
        } else {
          // Child
          if (currentParent) {
            finalUraian = currentParent;
            finalSubUraian = uraianStr;
          } else {
            finalUraian = uraianStr;
            finalSubUraian = null;
          }
        }
      } 
      else if (tableType === 'PDPT') {
        finalUraian = uraianStr;
        finalSubUraian = null;
        // Scaling x1000 is already handled in excelWriter, so we don't scale here.
      }

      // If no value exists at all, skip generating record
      if (!hasRealisasi && !hasRkap) continue;

      const baseRecord = {
        sheetName: sheetName,
        bulan: monthInfo.display,
        uraian: finalUraian,
        subUraian: finalSubUraian
      };

      // Create REALISASI record
      if (hasRealisasi) {
        const id = await generateTabularUuid({
          monthCode: monthInfo.code,
          year,
          tableType,
          uraian: uraianStr,
          jenis: 'REALISASI'
        });
        records.push({ ...baseRecord, id, jenis: 'REALISASI', value: realisasiVal });
      }

      // Create RKAP record
      if (hasRkap) {
        const id = await generateTabularUuid({
          monthCode: monthInfo.code,
          year,
          tableType,
          uraian: uraianStr,
          jenis: 'RKAP'
        });
        records.push({ ...baseRecord, id, jenis: 'RKAP', value: rkapVal });
      }
    }
  }

  return records;
}
