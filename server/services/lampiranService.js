/**
 * lampiranService.js — Find target table pages in LM PDFs.
 *
 * TABEL LM: finds exactly 4 pages by keyword:
 *   - "Tabel Pendapatan"    → PDPT
 *   - "Lampiran 1"          → LR
 *   - "Lampiran 2"          → NERACA
 *   - "Lampiran 3"          → ARUS_KAS
 *
 * Does NOT return page ranges — returns single page numbers.
 * Results are cached in-memory per fileId.
 */
import { PDFDocument } from 'pdf-lib';
import { downloadFile } from './googleDrive.js';

// In-memory cache: fileId → { pages, pdfBuffer }
const cache = new Map();

// Target table keywords — order is display order
const TARGET_TABLES = [
  { type: 'PDPT',     keyword: /tabel\s*[12][\s.:]+pendapatan|tabel\s+pendapatan/i, keywordNoSpace: /tabel[12][.:]?pendapatan|tabelpendapatan/i, label: 'Tabel Pendapatan' },
  { type: 'LR',       keyword: /lampiran\s*1\b/i, keywordNoSpace: /lampiran1/i, label: 'Lampiran 1 (Laba Rugi)' },
  { type: 'NERACA',   keyword: /lampiran\s*2\b/i, keywordNoSpace: /lampiran2/i, label: 'Lampiran 2 (Neraca)' },
  { type: 'ARUS_KAS', keyword: /lampiran\s*3\b/i, keywordNoSpace: /lampiran3/i, label: 'Lampiran 3 (Arus Kas)' },
];

/**
 * Ensure PDF is downloaded and cached.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function ensurePdfCached(fileId) {
  if (cache.has(fileId)) return cache.get(fileId).pdfBuffer;
  
  const pdfBuffer = await downloadFile(fileId);
  
  cache.set(fileId, { pdfBuffer, pages: null });
  return pdfBuffer;
}

/**
 * Find the 4 target table pages in a PDF.
 * Returns exactly one page per table type (or null if not found).
 *
 * @param {string} fileId — Google Drive file ID
 * @returns {Promise<{
 *   detected: boolean,
 *   pages: { PDPT: number|null, LR: number|null, NERACA: number|null, ARUS_KAS: number|null },
 *   foundCount: number,
 *   details: Array<{type: string, label: string, page: number|null}>
 * }>}
 */
export async function findTabelLMPages(fileId) {
  // Check cache
  const cached = cache.get(fileId);
  if (cached?.pages) {
    return cached.pages;
  }

  const pdfBuffer = await ensurePdfCached(fileId);

  // Scan PDF text
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  // Result: type → page number
  const foundPages = {};
  const details = TARGET_TABLES.map(t => ({ type: t.type, label: t.label, page: null }));

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str).join(' ');
    const textNoSpace = text.replace(/\s+/g, '');

    for (const target of TARGET_TABLES) {
      // Only take the FIRST match for each keyword
      if (!foundPages[target.type]) {
        const isMatch = target.keyword.test(text) || (target.keywordNoSpace && target.keywordNoSpace.test(textNoSpace));
        if (isMatch) {
          foundPages[target.type] = i;
          const detail = details.find(d => d.type === target.type);
          if (detail) detail.page = i;
          console.log(`[TabelLM] Found "${target.label}" on page ${i}`);
        }
      }
    }

    // Early exit if all 4 found
    if (Object.keys(foundPages).length === 4) break;
  }

  const foundCount = Object.keys(foundPages).length;
  console.log(`[TabelLM] Found ${foundCount}/4 target pages for ${fileId}`);

  const result = {
    detected: foundCount > 0,
    pages: {
      PDPT: foundPages.PDPT || null,
      LR: foundPages.LR || null,
      NERACA: foundPages.NERACA || null,
      ARUS_KAS: foundPages.ARUS_KAS || null,
    },
    foundCount,
    details,
  };

  // Update cache
  const entry = cache.get(fileId) || { pdfBuffer };
  entry.pages = result;
  cache.set(fileId, entry);

  return result;
}

/**
 * Extract a SINGLE page from the cached PDF as a standalone PDF buffer.
 *
 * @param {string} fileId
 * @param {number} pageNum — 1-indexed
 * @returns {Promise<Buffer>}
 */
export async function extractSinglePagePdf(fileId, pageNum) {
  const pdfBuffer = await ensurePdfCached(fileId);

  const srcDoc = await PDFDocument.load(pdfBuffer);
  if (pageNum < 1 || pageNum > srcDoc.getPageCount()) {
    throw new Error(`Page ${pageNum} out of range (1-${srcDoc.getPageCount()})`);
  }

  const newDoc = await PDFDocument.create();
  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageNum - 1]);
  newDoc.addPage(copiedPage);
  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Legacy: detect lampiran section (kept for backward compatibility with LampiranViewer).
 * Now delegates to findTabelLMPages.
 */
export async function detectLampiran(fileId) {
  const result = await findTabelLMPages(fileId);
  if (!result.detected) {
    return {
      detected: false,
      message: 'Tabel/lampiran tidak terdeteksi otomatis.',
    };
  }

  // Find first and last page for legacy range
  const allPages = Object.values(result.pages).filter(p => p != null);
  const startPage = Math.min(...allPages);
  const endPage = Math.max(...allPages);

  return {
    detected: true,
    startPage,
    endPage,
    tables: result.pages,
    details: result.details,
    method: 'keyword-scan',
  };
}

/**
 * Legacy: extract lampiran PDF pages (kept for backward compatibility).
 */
export async function extractLampiranPdf(fileId, startPage, endPage) {
  const pdfBuffer = await ensurePdfCached(fileId);
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

  const startIdx = Math.max(0, (startPage || 1) - 1);
  const endIdx = Math.min(srcDoc.getPageCount() - 1, (endPage || srcDoc.getPageCount()) - 1);

  const indices = [];
  for (let i = startIdx; i <= endIdx; i++) indices.push(i);

  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) newDoc.addPage(page);

  return Buffer.from(await newDoc.save());
}

/**
 * Clear cache for a specific file or all files.
 */
export function clearCache(fileId) {
  if (fileId) cache.delete(fileId);
  else cache.clear();
}
