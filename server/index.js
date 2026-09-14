/**
 * LM Manager — Backend Server
 *
 * Express REST API for:
 *   GET  /api/master                — list all Master data
 *   POST /api/sync                  — trigger Drive → Master sync
 *   POST /api/import-csv            — upload CSV to import/merge
 *   POST /api/lampiran/download-all — download all lampiran as ZIP
 *   GET  /api/lampiran/:id          — download extracted lampiran PDF
 *   GET  /api/lampiran/:id/info     — get lampiran detection info
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initDrive, copyFileToFolder, uploadFileToFolder } from './services/googleDrive.js';
import { initSheets, readMaster } from './services/googleSheets.js';
import { isAuthReady, generateAuthUrl, handleCallback } from './services/googleAuth.js';
import { runSync } from './services/syncService.js';
import { detectLampiran, extractLampiranPdf, findTabelLMPages, extractSinglePagePdf } from './services/lampiranService.js';
import { extractAllTables } from './services/geminiVisionExtractor.js';
import { validateAllTables } from './services/validationService.js';
import { writeExcel, writeExcelFromTemplate } from './services/excelWriter.js';
import { parseLMName, sortKey } from './utils/dateParser.js';
import { ZipArchive } from 'archiver';
import { processAndSendReport, getProcessingStatus } from './services/processingService.js';

const app = express();
const PORT = process.env.PORT || 3001;

const EXCEL_CACHE_DIR = path.join(__dirname, 'data', 'excel-cache');
if (!fs.existsSync(EXCEL_CACHE_DIR)) {
  fs.mkdirSync(EXCEL_CACHE_DIR, { recursive: true });
}

// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Multer for CSV upload (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// ── Initialise Google services ──────────────────────────────────
try {
  initDrive();
  initSheets();
} catch (err) {
  console.warn('[Server] Google services not available:', err.message);
}

// ── Auth Routes ────────────────────────────────────────────────

app.get('/api/auth/status', (req, res) => {
  res.json({ ready: isAuthReady() });
});

app.get('/api/auth/url', (req, res) => {
  try {
    const url = generateAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) throw new Error('No code provided');
    await handleCallback(code);
    // Redirect back to frontend
    res.redirect('http://localhost:5173');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed: ' + err.message);
  }
});

// ── In-memory data store (for CSV import mode) ─────────────────
let localMasterData = null; // Set when CSV is imported

// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /api/master — Return all Master data.
 * Sources: Google Sheets (if available) → local (from CSV import) → empty
 */
app.get('/api/master', async (req, res) => {
  try {
    // If local data is set (from CSV import), use that
    if (localMasterData) {
      return res.json(localMasterData);
    }

    // Try Google Sheets
    if (isAuthReady()) {
      const rows = await readMaster();
      const data = rows.map((r) => {
        const parsed = parseLMName(r.nama || r.tanggal);
        return {
          tanggal: r.tanggal || parsed?.tanggal || '',
          nama: r.nama,
          namaStandar: parsed?.namaStandar || r.nama,
          link: r.link,
          fileId: r.fileId,
        };
      });

      // Sort chronologically
      data.sort((a, b) => {
        const pa = parseLMName(a.nama);
        const pb = parseLMName(b.nama);
        return sortKey(pa) - sortKey(pb);
      });

      return res.json(data);
    }

    // No data source available
    return res.json([]);
  } catch (err) {
    console.error('[/api/master] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

let isSyncing = false;
/**
 * POST /api/sync — Trigger Drive → Master synchronisation.
 */
app.post('/api/sync', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google services not configured. Set GOOGLE_SPREADSHEET_ID and credentials.',
    });
  }

  if (isSyncing) {
    return res.status(409).json({ error: 'Sinkronisasi sedang berjalan. Harap tunggu.' });
  }

  isSyncing = true;
  try {
    const result = await runSync();
    return res.json(result);
  } catch (err) {
    console.error('[/api/sync] Error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    isSyncing = false;
  }
});

/**
 * POST /api/import-csv — Upload a CSV file to replace local Master data.
 *
 * Expected CSV columns: Tanggal, Nama, File [, Nama Standar (ignored)]
 */
app.post('/api/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV is empty or has no data rows' });
    }

    // Simple CSV parse (for robustness, could use a proper parser)
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const namaIdx = headers.findIndex((h) => /^nama$/i.test(h));
    const fileIdx = headers.findIndex((h) => /^file$/i.test(h) || /^link/i.test(h));

    if (namaIdx === -1) {
      return res.status(400).json({ error: 'Column "Nama" not found in CSV' });
    }

    const importedRows = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const nama = (cols[namaIdx] || '').trim();
      const link = fileIdx >= 0 ? (cols[fileIdx] || '').trim() : '';

      if (!nama && !link) {
        skipped++;
        continue;
      }

      // IMPORTANT: Always re-generate standard name, ignore CSV's Nama Standar
      const parsed = parseLMName(nama);

      importedRows.push({
        tanggal: parsed?.tanggal || '',
        nama,
        namaStandar: parsed?.namaStandar || nama,
        link,
        fileId: extractFileIdSafe(link),
      });
    }

    // Sort chronologically
    importedRows.sort((a, b) => {
      const pa = parseLMName(a.nama);
      const pb = parseLMName(b.nama);
      return sortKey(pa) - sortKey(pb);
    });

    // Store locally
    localMasterData = importedRows;

    return res.json({
      imported: importedRows.length,
      skipped,
    });
  } catch (err) {
    console.error('[/api/import-csv] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lampiran/download-all — Download all lampiran as a single ZIP.
 * Body: { files: [{ fileId, nama, namaStandar }, ...] }
 *
 * IMPORTANT: This route MUST be defined BEFORE the parameterized routes
 * (GET /api/lampiran/:fileId) to avoid Express matching "download-all" as a fileId.
 */
app.post('/api/lampiran/download-all', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot access PDF files.',
    });
  }

  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files specified.' });
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const zipFilename = `Lampiran-LM-${today}.zip`;

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFilename}"`,
  });

  const archive = new ZipArchive({ zlib: { level: 5 } });

  archive.on('error', (err) => {
    console.error('[/api/lampiran/download-all] Archiver error:', err);
  });

  archive.pipe(res);

  let processed = 0;
  const skipped = [];

  for (const file of files) {
    const { fileId, nama, namaStandar } = file;
    if (!fileId) {
      skipped.push({ fileId: null, nama, reason: 'No fileId' });
      continue;
    }

    try {
      // Detect lampiran
      const info = await detectLampiran(fileId);

      if (!info.detected) {
        skipped.push({ fileId, nama, reason: 'Lampiran not detected' });
        continue;
      }

      // Extract lampiran PDF
      const pdfBuffer = await extractLampiranPdf(fileId, info.startPage, info.endPage);
      const entryName = buildLampiranFilename(nama, namaStandar);

      archive.append(pdfBuffer, { name: entryName });
      processed++;
    } catch (err) {
      console.warn(`[download-all] Skipping ${fileId}: ${err.message}`);
      skipped.push({ fileId, nama, reason: err.message });
    }
  }

  // Add a summary text file if any were skipped
  if (skipped.length > 0) {
    const summaryLines = skipped.map(
      (s, i) => `${i + 1}. ${s.nama || s.fileId || 'unknown'} — ${s.reason}`
    );
    const summaryText = `File yang dilewati (${skipped.length} file):\n\n${summaryLines.join('\n')}\n`;
    archive.append(summaryText, { name: '_file-dilewati.txt' });
  }

  console.log(`[download-all] Done: ${processed} processed, ${skipped.length} skipped`);
  await archive.finalize();
});

/**
 * POST /api/convert-excel/zip — Create a ZIP of multiple cached Excel files
 * Body: { tokens: ["fileId1", "fileId2", ...], year: "2026" }
 */
app.post('/api/convert-excel/zip', (req, res) => {
  const { tokens, year } = req.body;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' });
  }

  const zipFilename = `Tabel-LM-Batch-${year || 'Batch'}.zip`;

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFilename}"`,
  });

  const archive = new ZipArchive({ zlib: { level: 5 } });

  archive.on('error', (err) => {
    console.error('[/api/convert-excel/zip] Archiver error:', err);
  });

  archive.pipe(res);

  let addedCount = 0;
  for (const fileId of tokens) {
    const excelPath = path.join(EXCEL_CACHE_DIR, `${fileId}.xlsx`);
    const metaPath = path.join(EXCEL_CACHE_DIR, `${fileId}.json`);

    if (fs.existsSync(excelPath)) {
      let filename = `Excel-${fileId}.xlsx`;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.filename) filename = meta.filename;
        } catch (e) { }
      }
      archive.append(fs.createReadStream(excelPath), { name: filename });
      addedCount++;
    }
  }

  if (addedCount === 0) {
    archive.append('Tidak ada file Excel yang berhasil dikonversi.', { name: 'error.txt' });
  }

  archive.finalize();
});

/**
 * POST /api/convert-excel/upload-batch — Upload cached Excel files to GDrive
 * Body: { tokens: ["fileId1", "fileId2", ...], folderId: "1bEoOIwlp6zqzfYgQMmNzyC_eq9D7jagw" }
 */
app.post('/api/convert-excel/upload-batch', async (req, res) => {
  const { tokens, folderId = '1bEoOIwlp6zqzfYgQMmNzyC_eq9D7jagw' } = req.body;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' });
  }
  if (!isAuthReady()) {
    return res.status(503).json({ error: 'Google Drive not configured.' });
  }

  const results = [];
  const errors = [];

  for (const fileId of tokens) {
    const excelPath = path.join(EXCEL_CACHE_DIR, `${fileId}.xlsx`);
    const metaPath = path.join(EXCEL_CACHE_DIR, `${fileId}.json`);

    if (fs.existsSync(excelPath)) {
      let filename = `Excel-${fileId}.xlsx`;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.filename) filename = meta.filename;
        } catch (e) { }
      }

      try {
        const buffer = fs.readFileSync(excelPath);
        const uploaded = await uploadFileToFolder(buffer, filename, folderId, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        results.push({ fileId, filename, uploadedId: uploaded.id });
      } catch (err) {
        errors.push({ fileId, filename, error: err.message });
      }
    } else {
      errors.push({ fileId, error: 'File not found in cache' });
    }
  }

  return res.json({ success: errors.length === 0, results, errors });
});

/**
 * GET /api/tabel-lm/:fileId/info — Get detected target pages (PDPT, LR, NERACA, ARUS_KAS)
 */
app.get('/api/tabel-lm/:fileId/info', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({ error: 'Google Drive not configured.' });
  }

  try {
    const info = await findTabelLMPages(req.params.fileId);
    return res.json(info);
  } catch (err) {
    console.error('[/api/tabel-lm/:fileId/info] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tabel-lm/:fileId/page/:pageNum — Download a single target page PDF
 */
app.get('/api/tabel-lm/:fileId/page/:pageNum', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({ error: 'Google Drive not configured.' });
  }

  try {
    const pageNum = parseInt(req.params.pageNum, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    const pdfBuffer = await extractSinglePagePdf(req.params.fileId, pageNum);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Page_${pageNum}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[/api/tabel-lm/:fileId/page/:pageNum] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lampiran/:fileId/info — Get detected lampiran page range (Legacy)
 */
app.get('/api/lampiran/:fileId/info', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot access PDF files.',
    });
  }

  try {
    const info = await detectLampiran(req.params.fileId);
    return res.json(info);
  } catch (err) {
    console.error('[/api/lampiran/info] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/lampiran/:fileId — Download extracted lampiran PDF.
 * Query params: ?start=N&end=N (optional override for page range)
 *               &nama=...&namaStandar=... (for proper filename)
 */
app.get('/api/lampiran/:fileId', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot access PDF files.',
    });
  }

  try {
    const startPage = req.query.start ? parseInt(req.query.start, 10) : undefined;
    const endPage = req.query.end ? parseInt(req.query.end, 10) : undefined;

    const pdfBuffer = await extractLampiranPdf(req.params.fileId, startPage, endPage);

    // Build proper filename from query params
    const nama = req.query.nama || null;
    const namaStandar = req.query.namaStandar || null;
    const filename = buildLampiranFilename(nama, namaStandar, req.params.fileId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[/api/lampiran] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Send to Drive endpoints ────────────────────────────────────

const DEFAULT_TARGET_FOLDER_ID = '1sLR2NSLCCSrlS1nBcxaMp2ko7B9YwOze';

/**
 * POST /api/send-to-drive — Copy a single file to the target Drive folder.
 * Body: { fileId, nama?, targetFolderId? }
 */
app.post('/api/send-to-drive', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot copy files.',
    });
  }

  const { fileId, nama, targetFolderId } = req.body;
  if (!fileId) {
    return res.status(400).json({ error: 'fileId is required.' });
  }

  const folderId = targetFolderId || DEFAULT_TARGET_FOLDER_ID;

  try {
    // 1. Deteksi Lampiran
    const info = await detectLampiran(fileId);
    if (!info.detected) {
      return res.status(404).json({ error: 'Lampiran tidak terdeteksi pada file tersebut.' });
    }

    // 2. Ekstrak halaman PDF
    const pdfBuffer = await extractLampiranPdf(fileId, info.startPage, info.endPage);
    const filename = buildLampiranFilename(nama, null, fileId);

    // 3. Upload file hasil crop ke Drive tujuan
    const result = await uploadFileToFolder(pdfBuffer, filename, folderId);

    return res.json({
      success: true,
      copied: result,
    });
  } catch (err) {
    console.error('[/api/send-to-drive] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/send-all-to-drive — Copy multiple files to the target Drive folder.
 * Body: { files: [{ fileId, nama }], targetFolderId? }
 */
app.post('/api/send-all-to-drive', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot copy files.',
    });
  }

  const { files, targetFolderId } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files specified.' });
  }

  const folderId = targetFolderId || DEFAULT_TARGET_FOLDER_ID;
  const results = [];
  const errors = [];

  // Process sequentially to avoid rate-limiting
  for (const file of files) {
    if (!file.fileId) {
      errors.push({ fileId: null, nama: file.nama, reason: 'No fileId' });
      continue;
    }

    try {
      // 1. Deteksi Lampiran
      const info = await detectLampiran(file.fileId);
      if (!info.detected) {
        throw new Error('Lampiran tidak terdeteksi');
      }

      // 2. Ekstrak halaman PDF
      const pdfBuffer = await extractLampiranPdf(file.fileId, info.startPage, info.endPage);
      const filename = buildLampiranFilename(file.nama, null, file.fileId);

      // 3. Upload file hasil crop ke Drive tujuan
      const result = await uploadFileToFolder(pdfBuffer, filename, folderId);

      results.push({ fileId: file.fileId, nama: file.nama, copiedId: result.id });
    } catch (err) {
      console.warn(`[send-all-to-drive] Failed for ${file.fileId}: ${err.message}`);
      errors.push({ fileId: file.fileId, nama: file.nama, reason: err.message });
    }
  }

  return res.json({
    success: errors.length === 0,
    sent: results.length,
    failed: errors.length,
    results,
    errors,
  });
});

// ── Tabular Processing endpoints ─────────────────────────────────

/**
 * POST /api/process-report — Orchestrate the full PDF -> Excel -> Tabular -> Google Sheets pipeline
 * Body: { report: { fileId, nama, namaStandar, tanggal, ... } }
 */
app.post('/api/process-report', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({ error: 'Google Drive not configured.' });
  }

  const { report } = req.body;
  if (!report || !report.fileId) {
    return res.status(400).json({ error: 'Report object with fileId is required.' });
  }

  // We don't await this so the request returns immediately and processing happens in background.
  // Wait, no. The frontend might want to await it if it's polling, but the route could just return started.
  // Actually, we'll await it but wrap it, or let the frontend await it.
  // The prompt says "Kirim" initiates a process and shows status. The frontend can await the POST and poll the GET.
  // Let's do it asynchronously so the request doesn't timeout for large files.
  processAndSendReport(report).catch(err => {
    console.error(`[ProcessReport Error ${report.fileId}]`, err);
  });

  return res.json({ success: true, message: 'Processing started', fileId: report.fileId });
});

/**
 * GET /api/process-report/:fileId/status — Get current pipeline status
 */
app.get('/api/process-report/:fileId/status', (req, res) => {
  const status = getProcessingStatus(req.params.fileId);
  return res.json(status);
});

// ── Convert to Excel ────────────────────────────────────────────

/**
 * POST /api/convert-excel/:fileId — Convert lampiran PDF to Excel.
 * Returns validation results + download token.
 */
app.post('/api/convert-excel/:fileId', async (req, res) => {
  if (!isAuthReady()) {
    return res.status(503).json({
      error: 'Google Drive not configured. Cannot access PDF files.',
    });
  }

  const { fileId } = req.params;
  const nama = req.body.nama || req.query.nama || null;
  const namaStandar = req.body.namaStandar || req.query.namaStandar || null;
  const filename = buildExcelFilename(nama, namaStandar, fileId);

  const excelPath = path.join(EXCEL_CACHE_DIR, `${fileId}.xlsx`);
  const metaPath = path.join(EXCEL_CACHE_DIR, `${fileId}.json`);
  const force = req.query.force === 'true';

  try {
    // IDEMPOTENCY CHECK: If already converted, return cached data
    if (fs.existsSync(excelPath) && fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      if (force && meta.tables) {
        console.log(`[convert-excel] Re-generating Excel from cached tables for ${fileId}`);
        const metadata = {
          nama: namaStandar || nama || '',
          companyName: 'PT LPP AGRO NUSANTARA',
          period: namaStandar || nama || '',
        };
        const excelBuffer = writeExcelFromTemplate(meta.tables, meta.validation, metadata);
        fs.writeFileSync(excelPath, excelBuffer);

        return res.json({
          success: true,
          cached: true,
          regenerated: true,
          token: fileId,
          validation: meta.validation,
          extractionMethod: meta.extractionMethod || 'vision-api',
          rowsExtracted: meta.rowsExtracted,
          filename: meta.filename || filename,
        });
      } else if (!force) {
        console.log(`[convert-excel] Returning cached file for ${fileId}`);
        return res.json({
          success: true,
          cached: true,
          token: fileId,
          validation: meta.validation,
          extractionMethod: meta.extractionMethod || 'vision-api',
          rowsExtracted: meta.rowsExtracted,
          filename: meta.filename || filename,
        });
      }
      // If force is true but tables are not cached (old cache), proceed to Gemini
      console.log(`[convert-excel] Force requested, bypassing cache for ${fileId}`);
    }

    // Step 1: Detect exactly 4 target pages
    console.log(`[convert-excel] Starting conversion for ${fileId}`);
    const info = await findTabelLMPages(fileId);

    if (!info.detected) {
      return res.status(404).json({
        error: 'Tidak ditemukan halaman target Tabel LM. Pastikan PDF berisi tabel Laporan Manajemen yang valid.',
        detected: false,
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY belum diatur. Tidak bisa melakukan ekstraksi.',
      });
    }

    // Step 2: Extract single pages for detected tables
    const pagePdfs = {};
    for (const [tableType, pageNum] of Object.entries(info.pages)) {
      if (pageNum) {
        pagePdfs[tableType] = await extractSinglePagePdf(fileId, pageNum);
      }
    }

    if (Object.keys(pagePdfs).length === 0) {
      return res.status(422).json({
        error: 'Gagal mengekstrak halaman PDF target.',
      });
    }

    // Step 3: Send single pages to Gemini Vision API with targeted prompts
    console.log(`[convert-excel] Extracting data using Gemini Vision API...`);
    let tables = await extractAllTables(pagePdfs);

    // Filter out empty tables
    for (const key of Object.keys(tables)) {
      if (!tables[key] || !tables[key].rows || tables[key].rows.length === 0) {
        delete tables[key];
      }
    }

    if (Object.keys(tables).length === 0) {
      return res.status(422).json({
        error: 'Tidak ada tabel yang berhasil diekstrak. Pastikan kualitas teks/gambar PDF cukup jelas.',
      });
    }

    // Step 4: Validate
    const validation = validateAllTables(tables);

    // Step 5: Generate Excel from template
    const metadata = {
      nama: namaStandar || nama || '',
      companyName: 'PT LPP AGRO NUSANTARA',
      period: namaStandar || nama || '',
    };

    const excelBuffer = writeExcelFromTemplate(tables, validation, metadata);

    // Row counts
    const rowsExtracted = {};
    for (const [key, data] of Object.entries(tables)) {
      rowsExtracted[key] = data.rows ? data.rows.length : 0;
    }

    // Step 6: Save result to persistent disk cache
    const finalFilename = buildExcelFilename(nama, namaStandar, fileId);
    fs.writeFileSync(excelPath, excelBuffer);
    fs.writeFileSync(metaPath, JSON.stringify({
      validation,
      rowsExtracted,
      tables,
      filename: finalFilename,
      extractionMethod: 'vision-api',
      createdAt: Date.now()
    }, null, 2));

    console.log(`[convert-excel] Conversion complete. Saved to cache. Tables: ${Object.keys(tables).join(', ')}`);

    return res.json({
      success: true,
      cached: false,
      token: fileId, // We use fileId as token now
      validation,
      extractionMethod: 'vision-api',
      rowsExtracted,
      filename: finalFilename,
    });
  } catch (err) {
    console.error(`[convert-excel] Error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/convert-excel/download/:token — Download the generated Excel file.
 */
app.get('/api/convert-excel/download/:token', (req, res) => {
  const fileId = req.params.token; // token is now fileId
  const excelPath = path.join(EXCEL_CACHE_DIR, `${fileId}.xlsx`);
  const metaPath = path.join(EXCEL_CACHE_DIR, `${fileId}.json`);

  if (!fs.existsSync(excelPath)) {
    return res.status(404).json({
      error: 'File Excel tidak ditemukan. Silakan convert ulang.',
    });
  }

  let filename = `Excel-${fileId}.xlsx`;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.filename) filename = meta.filename;
    } catch (e) { }
  }

  res.download(excelPath, filename);
});

/**
 * Build a filename for the Excel output.
 */
function buildExcelFilename(nama, namaStandar, fallbackId = 'dokumen') {
  let baseName = namaStandar || nama || fallbackId;
  baseName = baseName.replace(/\.pdf$/i, '').replace(/\.xlsx$/i, '');
  return sanitizeFilename(`${baseName}.xlsx`);
}

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    googleReady: isAuthReady(),
    timestamp: new Date().toISOString(),
  });
});

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function extractFileIdSafe(url) {
  if (!url) return null;
  const m = (url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/));
  return m ? m[1] : null;
}

/**
 * Sanitise a string for use as a filename.
 * Replaces invalid characters (/ \ : * ? " < > |) with '-'.
 */
function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim();
}

/**
 * Build a standardised lampiran filename.
 *
 * @param {string|null} nama — original file name (from Master "Nama" column)
 * @param {string|null} namaStandar — standardised name (e.g. "7. LM Juli 2026")
 * @param {string} [fallbackId] — fallback file ID if no name available
 * @returns {string} e.g. "Lampiran-7. LM Juli 2026.pdf"
 */
function buildLampiranFilename(nama, namaStandar, fallbackId = 'dokumen') {
  let baseName;

  if (namaStandar) {
    // Use standardised name: "Lampiran-7. LM Juli 2026.pdf"
    baseName = namaStandar;
  } else if (nama) {
    // Fallback to original name: "Lampiran-LPPAN LM Tahun 2022 Audited.pdf"
    baseName = nama;
  } else {
    // Last resort: use file ID
    baseName = fallbackId;
  }

  // Remove .pdf extension if already present in the name
  baseName = baseName.replace(/\.pdf$/i, '');

  return sanitizeFilename(`Lampiran-${baseName}.pdf`);
}

// ── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 LM Manager API running on http://localhost:${PORT}`);
  console.log(`   Google services: ${isAuthReady() ? '✅ Ready' : '❌ Not Authenticated (Please login)'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/master`);
  console.log(`     POST /api/sync`);
  console.log(`     POST /api/import-csv`);
  console.log(`     POST /api/lampiran/download-all`);
  console.log(`     GET  /api/lampiran/:fileId`);
  console.log(`     POST /api/send-to-drive`);
  console.log(`     POST /api/send-all-to-drive`);
  console.log(`     POST /api/convert-excel/:fileId`);
  console.log(`     GET  /api/convert-excel/download/:token`);
  console.log(`     GET  /api/health\n`);
});
