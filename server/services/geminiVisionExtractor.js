/**
 * geminiVisionExtractor.js — Extract financial table data from single PDF pages
 * using Gemini Vision API.
 *
 * Each table gets exactly 1 page sent to Gemini with a targeted prompt.
 *
 * NEW OUTPUT FORMAT:
 * {
 *   tableType, bulan,
 *   rows: [{
 *     rawUraian, canonicalUraian,
 *     realisasiA, rkapC,
 *     confidence, matchType, status
 *   }]
 * }
 *
 * For backward compatibility, the writer also supports legacy format:
 *   { label, realisasiBulan, rkapBulan }
 *
 * The "bulan" field contains the month name detected from the PDF header
 * (e.g., "Juli", "Agustus"), which is used by excelWriter to determine
 * the target column via template mapping.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { SCHEMAS } from '../schemas/financialSchemas.js';
import { normalizeMonth } from './templateMapper.js';

let apiKeys = [];
let currentKeyIndex = 0;

/**
 * Get all available API keys from environment.
 */
function getKeys() {
  if (apiKeys.length === 0) {
    const keyString = process.env.GEMINI_API_KEY;
    if (!keyString) {
      throw new Error('GEMINI_API_KEY not set in environment variables.');
    }
    apiKeys = keyString.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) {
      throw new Error('No valid GEMINI API keys found in environment variables.');
    }
  }
  return apiKeys;
}

/**
 * Get Gemini client using the current active key.
 */
function getClient() {
  const keys = getKeys();
  return new GoogleGenerativeAI(keys[currentKeyIndex]);
}

/**
 * Normalize a single row from Gemini response.
 * Handles both new format (rawUraian/canonicalUraian/realisasiA/rkapC)
 * and legacy format (label/realisasiBulan/rkapBulan).
 *
 * @param {object} row — Raw row from Gemini
 * @returns {object} Normalized row
 */
function normalizeRow(row) {
  const rawUraian = row.rawUraian || row.label || '';
  const canonicalUraian = row.canonicalUraian || row.label || rawUraian;
  const realisasiA = row.realisasiA ?? row.realisasiBulan ?? null;
  const rkapC = row.rkapC ?? row.rkapB ?? row.rkapBulan ?? null;
  const confidence = row.confidence || 'unknown';
  const matchType = row.matchType || 'unknown';
  const status = row.status || 'MATCHED';

  return {
    // New format (primary)
    rawUraian,
    canonicalUraian,
    realisasiA,
    rkapC,
    confidence,
    matchType,
    status,
    // Legacy compatibility (used by excelWriter for backward compat)
    label: canonicalUraian,
    realisasiBulan: realisasiA,
    rkapBulan: rkapC,
  };
}

/**
 * Extract a single table from a single-page PDF buffer.
 *
 * @param {Buffer} singlePagePdf — PDF buffer containing exactly 1 page
 * @param {string} tableType — 'PDPT' | 'LR' | 'NERACA' | 'ARUS_KAS'
 * @returns {Promise<{ tableType: string, bulan: string|null, rows: Array }>}
 */
export async function extractSingleTable(singlePagePdf, tableType) {
  const schema = SCHEMAS[tableType];
  if (!schema) {
    throw new Error(`Unknown table type: ${tableType}`);
  }

  console.log(`[GeminiVision] Sending 1 page for ${tableType}...`);

  const parts = [
    { text: schema.geminiPrompt },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: singlePagePdf.toString('base64'),
      },
    },
  ];

  let responseText = '';
  const keys = getKeys();
  let attempts = 0;
  const maxAttempts = keys.length * 2; // Allow more attempts for 503 retries

  while (attempts < maxAttempts) {
    try {
      const client = getClient();
      const model = client.getGenerativeModel({ model: 'gemini-3.6-flash' });

      const result = await model.generateContent(parts);
      const response = await result.response;
      responseText = response.text();
      break; // Berhasil, keluar dari loop
    } catch (err) {
      const isRateLimit = err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit'));
      const isServerError = err.message && (err.message.includes('503') || err.message.includes('500') || err.message.includes('502') || err.message.toLowerCase().includes('unavailable'));

      if (isRateLimit) {
        console.warn(`[GeminiVision] Rate limit hit on key index ${currentKeyIndex}. Switching to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;
      } else if (isServerError) {
        console.warn(`[GeminiVision] Google API Server Error (5xx). Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } else {
        throw err; // Lempar error jika bukan karena limit atau server error
      }
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error('Gagal memproses setelah beberapa kali percobaan (Mencapai batas API limit atau server sedang sibuk). Silakan coba lagi nanti.');
  }

  // Parse JSON from response (Gemini may wrap in ```json blocks)
  let jsonStr = responseText;

  // Strip markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  // Find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    console.warn(`[GeminiVision] No JSON found in response for ${tableType}`);
    console.warn(`[GeminiVision] Raw response: ${responseText.substring(0, 500)}`);
    return { tableType, bulan: null, rows: [] };
  }

  try {
    const parsed = JSON.parse(objectMatch[0]);
    const rawRows = parsed.rows || [];

    // Normalize all rows to unified format
    const rows = rawRows
      .map(normalizeRow)
      .filter(r => r.status !== 'UNMATCHED'); // Filter out unmatched rows

    // Log unmatched rows separately
    const unmatchedRows = rawRows.filter(r => r.status === 'UNMATCHED');
    if (unmatchedRows.length > 0) {
      console.warn(`[GeminiVision] ${tableType}: ${unmatchedRows.length} rows marked UNMATCHED by Gemini:`);
      for (const u of unmatchedRows) {
        console.warn(`  - "${u.rawUraian || u.label}" (confidence: ${u.confidence || 'n/a'})`);
      }
    }

    // Extract and normalize month name
    let bulan = parsed.bulan || null;
    if (bulan) {
      const normalized = normalizeMonth(bulan);
      if (normalized) {
        console.log(`[GeminiVision] Bulan ditemukan: "${bulan}" → normalized: "${normalized}"`);
        bulan = normalized;
      } else {
        console.warn(`[GeminiVision] Bulan "${bulan}" tidak dapat dinormalisasi`);
      }
    } else {
      console.warn(`[GeminiVision] Bulan tidak ditemukan dalam response ${tableType}`);
    }

    // Log extraction summary
    console.log(`[GeminiVision] Extracted ${rows.length} rows for ${tableType}, bulan: ${bulan || '(not detected)'}`);
    for (const row of rows) {
      console.log(
        `  [${row.status}] "${row.rawUraian}" → "${row.canonicalUraian}" ` +
        `(realisasiA: ${row.realisasiA}, rkapC: ${row.rkapC}, ` +
        `confidence: ${row.confidence}, matchType: ${row.matchType})`
      );
    }

    return { tableType, bulan, rows };
  } catch (err) {
    console.warn(`[GeminiVision] JSON parse failed for ${tableType}: ${err.message}`);
    console.warn(`[GeminiVision] Attempted to parse: ${objectMatch[0].substring(0, 300)}`);
    return { tableType, bulan: null, rows: [] };
  }
}

/**
 * Extract all 4 tables from their respective single-page PDFs.
 *
 * @param {Object.<string, Buffer>} pagePdfs — { PDPT: Buffer, LR: Buffer, NERACA: Buffer, ARUS_KAS: Buffer }
 * @returns {Promise<Object.<string, {tableType: string, bulan: string|null, rows: Array}>>}
 */
export async function extractAllTables(pagePdfs) {
  const results = {};

  for (const [tableType, pdfBuffer] of Object.entries(pagePdfs)) {
    if (!pdfBuffer) {
      console.log(`[GeminiVision] Skipping ${tableType} — no page provided`);
      continue;
    }

    try {
      results[tableType] = await extractSingleTable(pdfBuffer, tableType);
    } catch (err) {
      console.error(`[GeminiVision] Failed ${tableType}: ${err.message}`);
      results[tableType] = { tableType, bulan: null, rows: [] };
    }
  }

  return results;
}
