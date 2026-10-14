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

// Model utama & cadangan bisa diatur lewat env tanpa ubah kode.
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || '';
// Timeout per panggilan Gemini (ms) agar request yang macet tidak menggantung selamanya.
// Catatan: halaman Neraca (tabel terbesar) bisa butuh > 45 detik saat model sibuk;
// timeout yang terlalu pendek justru membatalkan request yang sebenarnya hampir selesai.
const CALL_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 120000;
// Sisa waktu minimum agar percobaan baru masih layak dimulai sebelum deadline.
const MIN_ATTEMPT_MS = 20000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * @param {number} [startKeyIndex] — Index API key awal (untuk menyebar beban antar key)
 * @param {number} [deadline] — Epoch ms; tidak memulai percobaan baru setelah batas ini
 * @returns {Promise<{ tableType: string, bulan: string|null, rows: Array }>}
 */
export async function extractSingleTable(singlePagePdf, tableType, startKeyIndex, deadline) {
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
  let succeeded = false;
  let lastError = null;
  const keys = getKeys();
  let keyIndex = Number.isInteger(startKeyIndex) ? startKeyIndex % keys.length : currentKeyIndex;
  let attempts = 0;
  const maxAttempts = Math.max(keys.length * 2, 4); // Allow more attempts for 503 retries

  while (attempts < maxAttempts) {
    // Hormati batas waktu total (mis. batas durasi fungsi Vercel)
    const remaining = deadline ? deadline - Date.now() : Infinity;
    if (remaining < MIN_ATTEMPT_MS) {
      console.warn(`[GeminiVision] ${tableType}: sisa waktu ${Math.max(0, Math.round(remaining / 1000))}s, berhenti mencoba (batas waktu pemrosesan).`);
      if (!lastError) lastError = new Error('Batas waktu pemrosesan tercapai');
      break;
    }
    const attemptTimeout = Math.min(CALL_TIMEOUT_MS, remaining - 2000);

    // Setelah separuh percobaan gagal, pakai model cadangan (jika diatur)
    const modelName = (FALLBACK_MODEL && attempts >= Math.ceil(maxAttempts / 2)) ? FALLBACK_MODEL : PRIMARY_MODEL;
    const attemptStartedAt = Date.now();
    try {
      const client = new GoogleGenerativeAI(keys[keyIndex]);
      const model = client.getGenerativeModel({ model: modelName }, { timeout: attemptTimeout });

      const result = await model.generateContent(parts);
      const response = await result.response;
      responseText = response.text();
      currentKeyIndex = keyIndex;
      succeeded = true;
      console.log(`[GeminiVision] ${tableType}: berhasil pada key #${keyIndex} dalam ${Math.round((Date.now() - attemptStartedAt) / 1000)}s`);
      break; // Berhasil, keluar dari loop
    } catch (err) {
      lastError = err;
      const msg = (err && err.message) || String(err);
      const lower = msg.toLowerCase();
      const isRateLimit = msg.includes('429') || lower.includes('quota') || lower.includes('limit');
      const isServerError = msg.includes('503') || msg.includes('500') || msg.includes('502') || msg.includes('504') || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('high demand');
      const isTimeout = (err && err.name === 'AbortError') || lower.includes('abort') || lower.includes('timeout') || lower.includes('fetch failed');

      if (isRateLimit || isServerError || isTimeout) {
        const kind = isRateLimit ? 'Rate limit' : isTimeout ? `Timeout/network (${Math.round((Date.now() - attemptStartedAt) / 1000)}s)` : 'Server error (5xx)';
        let delay = isRateLimit ? 500 : Math.min(2000 * (attempts + 1), 8000);
        if (deadline) delay = Math.max(0, Math.min(delay, deadline - Date.now() - MIN_ATTEMPT_MS));
        console.warn(`[GeminiVision] ${tableType}: ${kind} on key #${keyIndex} (model ${modelName}): ${msg.substring(0, 200)}. Switching key, retry in ${delay}ms...`);
        // Pindah ke key berikutnya — 503 "high demand" sering hanya terjadi pada sebagian key/project
        keyIndex = (keyIndex + 1) % keys.length;
        attempts++;
        if (delay > 0) await sleep(delay);
      } else {
        throw err; // Lempar error jika bukan karena limit atau server error
      }
    }
  }

  if (!succeeded) {
    console.error(`[GeminiVision] ${tableType}: semua percobaan gagal. Error terakhir: ${lastError?.message}`);
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
 * @param {{ deadline?: number }} [options] — deadline (epoch ms) untuk seluruh ekstraksi
 * @returns {Promise<Object.<string, {tableType: string, bulan: string|null, rows: Array}>>}
 */
export async function extractAllTables(pagePdfs, options = {}) {
  const results = {};
  const keys = getKeys();
  const entries = Object.entries(pagePdfs);
  const { deadline } = options;

  // Diproses paralel (masing-masing mulai dari key berbeda) agar total waktu
  // tetap di bawah batas durasi fungsi serverless.
  await Promise.all(entries.map(async ([tableType, pdfBuffer], i) => {
    if (!pdfBuffer) {
      console.log(`[GeminiVision] Skipping ${tableType} — no page provided`);
      return;
    }

    try {
      results[tableType] = await extractSingleTable(pdfBuffer, tableType, (currentKeyIndex + i) % keys.length, deadline);
    } catch (err) {
      console.error(`[GeminiVision] Failed ${tableType}: ${err.message}`);
      results[tableType] = { tableType, bulan: null, rows: [] };
    }
  }));

  // Kembalikan dengan urutan kunci yang sama seperti input
  const ordered = {};
  for (const [tableType] of entries) if (results[tableType]) ordered[tableType] = results[tableType];
  return ordered;
}
