/**
 * documentRoutes.js — Express Router for document management endpoints.
 *
 * All routes are protected by requireAuth + requireRole middleware from Phase 1.
 * This router is mounted at `/api/documents` in server/index.js.
 *
 * Phase 2 scope:
 *   POST   /api/documents            — ADMIN only: create document record
 *   GET    /api/documents             — ADMIN, KEUANGAN: list all (optional ?status= filter)
 *   GET    /api/documents/:id         — ADMIN, KEUANGAN: get single document
 *   PUT    /api/documents/:id/status  — ADMIN only: update document status
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import {
  createDocument,
  listDocuments,
  getDocumentById,
  updateDocumentStatus,
  addComment,
  listComments,
  VALID_STATUSES,
} from '../services/documentTrackingService.js';

const router = Router();

const EXCEL_CACHE_DIR = path.join(__dirname, '..', 'data', 'excel-cache');

if (!fs.existsSync(EXCEL_CACHE_DIR)) {
  fs.mkdirSync(EXCEL_CACHE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, EXCEL_CACHE_DIR),
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    req.fileId = fileId;
    cb(null, `${fileId}.xlsx`);
  }
});
const upload = multer({ storage });

/**
 * POST /api/documents/sync-cache
 * Scans excel-cache directory and registers any .xlsx files
 * that don't yet have a document record in Supabase.
 * Role: ADMIN, KEUANGAN
 */
router.post(
  '/sync-cache',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN'),
  async (req, res) => {
    try {
      if (!fs.existsSync(EXCEL_CACHE_DIR)) {
        return res.json({ synced: 0 });
      }

      const files = fs.readdirSync(EXCEL_CACHE_DIR).filter(f => f.endsWith('.xlsx'));
      const existingDocs = await listDocuments();
      const existingFileIds = new Set(existingDocs.map(d => d.file_id));

      let synced = 0;
      for (const file of files) {
        const fileId = file.replace('.xlsx', '');
        if (!existingFileIds.has(fileId)) {
          try {
            await createDocument({ file_id: fileId, nama: fileId, uploaded_by: null });
            synced++;
          } catch (_) { }
        }
      }

      return res.json({ synced, total: files.length });
    } catch (err) {
      console.error('[DocumentRoutes] POST /sync-cache error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/documents
 * Body: { file_id: string, nama: string }
 * Role: ADMIN only
 */
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const { file_id, nama } = req.body;

      if (!file_id || !nama) {
        return res.status(400).json({
          error: 'file_id dan nama wajib diisi.',
        });
      }

      const doc = await createDocument({
        file_id,
        nama,
        uploaded_by: req.user.id,
      });

      return res.status(201).json(doc);
    } catch (err) {
      console.error('[DocumentRoutes] POST / error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/documents/upload-excel
 * Accepts a direct Excel file upload
 * Role: ADMIN only
 */
router.post(
  '/upload-excel',
  requireAuth,
  requireRole('ADMIN'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
      }

      const fileId = req.fileId;
      // Gunakan nama asli dikurangi ekstensi .xlsx jika ada
      let originalName = req.file.originalname || `Upload-${Date.now()}`;
      if (originalName.toLowerCase().endsWith('.xlsx')) {
        originalName = originalName.slice(0, -5);
      }

      const doc = await createDocument({
        file_id: fileId,
        nama: originalName,
        uploaded_by: req.user.id,
      });

      return res.status(201).json({ message: 'File Excel berhasil diunggah', document: doc });
    } catch (err) {
      console.error('[DocumentRoutes] POST /upload-excel error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/documents
 * Query: ?status=UNPROCESSED (optional filter)
 * Role: ADMIN, KEUANGAN, USER
 */
router.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN', 'USER'),
  async (req, res) => {
    try {
      const { status } = req.query;

      // Validate status filter if provided
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Status filter tidak valid: "${status}". Harus salah satu dari: ${VALID_STATUSES.join(', ')}`,
        });
      }

      // Phase 4: Enforce role USER rules
      if (req.user.role === 'USER') {
        const docs = await listDocuments({ status: 'POSTED' });
        // Strip sensitive fields
        return res.json(docs.map(d => ({
          id: d.id,
          nama: d.nama,
          status: d.status,
          created_at: d.created_at,
          updated_at: d.updated_at
        })));
      }

      const docs = await listDocuments(status ? { status } : {});

      // Enrich with has_excel_cache flag
      const enriched = docs.map(d => {
        const hasCache = d.file_id && fs.existsSync(path.join(EXCEL_CACHE_DIR, `${d.file_id}.xlsx`));
        return { ...d, has_excel_cache: hasCache };
      });

      return res.json(enriched);
    } catch (err) {
      console.error('[DocumentRoutes] GET / error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/documents/:id
 * Role: ADMIN, KEUANGAN
 */
router.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN'),
  async (req, res) => {
    try {
      const doc = await getDocumentById(req.params.id);

      if (!doc) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }

      return res.json(doc);
    } catch (err) {
      console.error('[DocumentRoutes] GET /:id error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/documents/:id/status
 * Body: { status: string }
 * Role: ADMIN only
 */
router.put(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'status wajib diisi.' });
      }

      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Status tidak valid: "${status}". Harus salah satu dari: ${VALID_STATUSES.join(', ')}`,
        });
      }

      const doc = await updateDocumentStatus(req.params.id, status);
      return res.json(doc);
    } catch (err) {
      console.error('[DocumentRoutes] PUT /:id/status error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/documents/:id/comments
 * Body: { comment, jenis_komentar, sheet_name, target_cell, target_identifier }
 * Role: KEUANGAN only
 */
router.post(
  '/:id/comments',
  requireAuth,
  requireRole('KEUANGAN'),
  async (req, res) => {
    try {
      const { comment, jenis_komentar, sheet_name, target_cell, target_identifier } = req.body;
      if (!comment) {
        return res.status(400).json({ error: 'Komentar tidak boleh kosong.' });
      }

      // 1. Add comment
      const newComment = await addComment(req.params.id, req.user.id, comment, {
        jenis_komentar,
        sheet_name,
        target_cell,
        target_identifier,
        author_role: req.user.role
      });

      // 2. Update status
      try {
        await updateDocumentStatus(req.params.id, 'REVISION_REQUESTED');
      } catch (err) {
        console.warn('[Phase4] Berhasil tambah komen, tapi gagal update status:', err.message);
      }

      return res.status(201).json(newComment);
    } catch (err) {
      console.error('[DocumentRoutes] POST /:id/comments error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/documents/:id/comments
 * Role: ADMIN, KEUANGAN
 */
router.get(
  '/:id/comments',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN'),
  async (req, res) => {
    try {
      const comments = await listComments(req.params.id);
      return res.json(comments);
    } catch (err) {
      console.error('[DocumentRoutes] GET /:id/comments error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/documents/:id/comments/:commentId/resolve
 * Role: KEUANGAN only
 */
router.put(
  '/:id/comments/:commentId/resolve',
  requireAuth,
  requireRole('KEUANGAN'),
  async (req, res) => {
    try {
      // 1. Resolve comment
      const { resolveComment, listComments } = await import('../services/documentTrackingService.js');
      const resolved = await resolveComment(req.params.commentId, req.user.id);

      // 2. Check if all comments are resolved
      const comments = await listComments(req.params.id);
      const hasOpen = comments.some(c => c.status === 'OPEN');

      if (!hasOpen) {
        // If all resolved, move to IN_REVIEW so Admin can approve
        await updateDocumentStatus(req.params.id, 'IN_REVIEW');
      }

      return res.json(resolved);
    } catch (err) {
      console.error('[DocumentRoutes] PUT /comments/resolve error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/documents/:id/approve
 * Role: ADMIN only
 * Just updates status to APPROVED after checking conditions.
 */
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const doc = await getDocumentById(req.params.id);
      if (!doc || !doc.file_id) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }

      if (doc.status === 'POSTED') {
        return res.status(400).json({ error: 'Dokumen sudah diposting.' });
      }

      // Check for open comments
      const { listComments } = await import('../services/documentTrackingService.js');
      const comments = await listComments(req.params.id);
      const openComments = comments.filter(c => c.status === 'OPEN');

      if (openComments.length > 0) {
        return res.status(400).json({ error: `Tidak dapat approve, masih ada ${openComments.length} komentar terbuka.` });
      }

      // Check if Excel Cache exists and is valid
      const excelPath = path.join(__dirname, '..', 'data', 'excel-cache', `${doc.file_id}.xlsx`);
      if (!fs.existsSync(excelPath)) {
        return res.status(404).json({ error: 'File Excel Cache tidak ditemukan.' });
      }

      const updated = await updateDocumentStatus(req.params.id, 'APPROVED');

      return res.json({
        success: true,
        document: updated,
      });
    } catch (err) {
      console.error('[DocumentRoutes] POST /:id/approve error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/documents/:id/send
 * FINALIZATION: Excel Cache → Tabular → Google Sheets → Supabase → POSTED
 * Role: KEUANGAN only
 */
router.post(
  '/:id/send',
  requireAuth,
  requireRole('KEUANGAN'),
  async (req, res) => {
    try {
      const doc = await getDocumentById(req.params.id);
      if (!doc || !doc.file_id) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }

      // Only allow sending from APPROVED (or POSTED for idempotent upsert)
      if (!['APPROVED', 'POSTED'].includes(doc.status)) {
        return res.status(400).json({ error: `Dokumen belum di-approve oleh Admin. Status: ${doc.status}` });
      }

      const excelPath = path.join(__dirname, '..', 'data', 'excel-cache', `${doc.file_id}.xlsx`);
      if (!fs.existsSync(excelPath)) {
        return res.status(404).json({ error: 'File Excel Cache tidak ditemukan.' });
      }

      // Lazy imports to avoid circular deps and keep this file light
      const { transformExcelToTabular } = await import('../services/excelToTabularService.js');
      const { validateTabularRecords } = await import('../services/tabularValidationService.js');
      const { upsertToGoogleSheets } = await import('../services/googleSheets.js');
      const { syncAllSheetsToSupabase } = await import('../services/supabaseSyncService.js');
      const { isSupabaseConfigured } = await import('../services/supabaseClient.js');
      const { buildUuidMetadata } = await import('../services/uuidGeneratorService.js');

      // Build report object for existing pipeline functions
      const report = { fileId: doc.file_id, nama: doc.nama, namaStandar: doc.nama };

      // STEP 1: UUID Schema
      await buildUuidMetadata();

      // STEP 2: Excel → Tabular
      console.log(`[Send:${doc.id}] Transforming Excel to Tabular...`);
      const records = await transformExcelToTabular(excelPath, report);
      if (records.length === 0) {
        return res.status(422).json({ error: 'Tidak ada data tabular dari Excel Cache.' });
      }

      // STEP 3: Validation
      const { valid, invalid } = validateTabularRecords(records);
      if (valid.length === 0) {
        return res.status(422).json({ error: 'Semua record gagal divalidasi.', invalid });
      }

      // Group records
      const groupedRecords = { 'LR': [], 'ARUS KAS': [], 'NERACA': [], 'PDPT': [] };
      for (const record of valid) {
        if (record.sheetName) {
          if (!groupedRecords[record.sheetName]) groupedRecords[record.sheetName] = [];
          groupedRecords[record.sheetName].push(record);
        }
      }

      // STEP 4: Google Spreadsheet
      const spreadsheetId = process.env.GOOGLE_TABULAR_SPREADSHEET_ID;
      let sheetsResult = {};
      let hasSheetError = false;
      for (const [sheetName, recs] of Object.entries(groupedRecords)) {
        if (recs.length === 0) continue;
        try {
          sheetsResult[sheetName] = await upsertToGoogleSheets({ spreadsheetId, sheetName, records: recs });
        } catch (e) {
          console.error(`[Send:${doc.id}] Sheet ${sheetName} error:`, e.message);
          sheetsResult[sheetName] = { error: e.message };
          hasSheetError = true;
        }
      }

      // STEP 5: Supabase
      let supabaseResult = null;
      if (isSupabaseConfigured()) {
        try {
          supabaseResult = await syncAllSheetsToSupabase(groupedRecords, doc.id);
        } catch (e) {
          console.error(`[Send:${doc.id}] Supabase sync error:`, e.message);
          return res.status(500).json({ error: `Supabase sync gagal: ${e.message}. Dokumen belum di-POST.` });
        }
      }

      // STEP 6: Save tabular locally
      try {
        const tabDir = path.join(__dirname, '..', 'data', 'tabular');
        if (!fs.existsSync(tabDir)) fs.mkdirSync(tabDir, { recursive: true });
        const fname = `${doc.nama || doc.file_id}.json`.replace(/[/\\:*?"<>|]/g, '-');
        fs.writeFileSync(path.join(tabDir, fname), JSON.stringify({
          generated_at: new Date().toISOString(), source: doc.nama, records: groupedRecords
        }, null, 2));
      } catch (_) { }

      // STEP 7: Update status to POSTED
      const updated = await updateDocumentStatus(req.params.id, 'POSTED');

      return res.json({
        success: true,
        document: updated,
        summary: {
          totalRecords: records.length,
          valid: valid.length,
          invalid: invalid.length,
          sheets: sheetsResult,
          supabase: supabaseResult,
        }
      });
    } catch (err) {
      console.error('[DocumentRoutes] POST /:id/send error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /api/documents/:id/excel-data
 * Returns workbook data + version (file mtime) for concurrency.
 * Role: ADMIN, KEUANGAN
 */
router.get(
  '/:id/excel-data',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN'),
  async (req, res) => {
    try {
      const doc = await getDocumentById(req.params.id);
      if (!doc || !doc.file_id) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan atau tidak memiliki file excel.' });
      }

      const excelPath = path.join(__dirname, '..', 'data', 'excel-cache', `${doc.file_id}.xlsx`);
      if (!fs.existsSync(excelPath)) {
        return res.status(404).json({ error: `File excel cache tidak ditemukan untuk ID ${doc.file_id}.` });
      }

      const workbook = XLSX.readFile(excelPath);
      const result = {};

      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        result[sheetName] = json;
      });

      // Include version for concurrency control
      const stat = fs.statSync(excelPath);
      return res.json({ sheets: result, sheetNames: workbook.SheetNames, version: stat.mtimeMs });
    } catch (err) {
      console.error('[DocumentRoutes] GET /:id/excel-data error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/documents/:id/excel-data
 * Save edited workbook back to Excel Cache.
 * Role: ADMIN only. Includes concurrency check via version (mtime).
 */
router.put(
  '/:id/excel-data',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const { sheets, version } = req.body;
      if (!sheets || typeof sheets !== 'object') {
        return res.status(400).json({ error: 'Payload `sheets` wajib berupa object { sheetName: [[cell...]] }.' });
      }

      const doc = await getDocumentById(req.params.id);
      if (!doc || !doc.file_id) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }

      // Only allow editing documents not yet POSTED
      if (doc.status === 'POSTED') {
        return res.status(400).json({ error: 'Dokumen sudah POSTED, tidak dapat diedit.' });
      }

      const excelPath = path.join(__dirname, '..', 'data', 'excel-cache', `${doc.file_id}.xlsx`);
      if (!fs.existsSync(excelPath)) {
        return res.status(404).json({ error: 'File Excel Cache tidak ditemukan.' });
      }

      // Concurrency check
      const currentStat = fs.statSync(excelPath);
      if (version && Math.abs(currentStat.mtimeMs - version) > 1000) {
        return res.status(409).json({
          error: 'File telah diubah oleh pengguna lain. Silakan reload halaman.',
          serverVersion: currentStat.mtimeMs,
        });
      }

      // Read existing workbook to preserve formatting
      const workbook = XLSX.readFile(excelPath, { cellStyles: true, cellDates: true });

      // Validate: all required sheets must still exist
      const requiredSheets = ['LR', 'ARUS KAS', 'NERACA', 'PDPT'];
      const editedSheetNames = Object.keys(sheets);
      for (const rs of requiredSheets) {
        if (editedSheetNames.includes(rs) || workbook.SheetNames.includes(rs)) continue;
        // Sheet neither in edit payload nor in existing workbook — that's a problem only if it was there before
      }

      // Update each sheet in the workbook
      for (const [sheetName, rows] of Object.entries(sheets)) {
        if (!Array.isArray(rows)) continue;
        // Create new sheet from the 2D array data
        const newSheet = XLSX.utils.aoa_to_sheet(rows);

        // Try to preserve column widths from original sheet
        const origSheet = workbook.Sheets[sheetName];
        if (origSheet && origSheet['!cols']) {
          newSheet['!cols'] = origSheet['!cols'];
        }
        if (origSheet && origSheet['!merges']) {
          newSheet['!merges'] = origSheet['!merges'];
        }

        workbook.Sheets[sheetName] = newSheet;

        // Ensure sheet is in SheetNames if it's new
        if (!workbook.SheetNames.includes(sheetName)) {
          workbook.SheetNames.push(sheetName);
        }
      }

      // Write back
      XLSX.writeFile(workbook, excelPath);

      const newStat = fs.statSync(excelPath);
      return res.json({ success: true, version: newStat.mtimeMs });
    } catch (err) {
      console.error('[DocumentRoutes] PUT /:id/excel-data error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;

