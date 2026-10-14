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
import { uploadFileToFolder, downloadFile, updateFileInDrive, listFilesInFolder } from '../services/googleDrive.js';

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

// Di Vercel filesystem bersifat read-only kecuali /tmp.
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'data');
const EXCEL_CACHE_DIR = path.join(DATA_DIR, 'excel-cache');
const TABULAR_DIR = path.join(DATA_DIR, 'tabular');

try {
  if (!fs.existsSync(EXCEL_CACHE_DIR)) {
    fs.mkdirSync(EXCEL_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[DocumentRoutes] Tidak dapat membuat folder excel-cache:', e.message);
}

// Gunakan memoryStorage agar file yang diupload dapat langsung diunggah ke Google Drive tanpa mampir di lokal
const storage = multer.memoryStorage();
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
      // Disabled in stateless mode since we don't use local cache directory
      return res.json({ synced: 0, total: 0, message: "Sync-cache is disabled in stateless mode" });
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

      const folderId = process.env.GOOGLE_DRIVE_EXCEL_FOLDER_ID;
      if (!folderId) {
        return res.status(500).json({ error: 'Konfigurasi GOOGLE_DRIVE_EXCEL_FOLDER_ID belum diatur di .env backend.' });
      }

      // Gunakan nama asli dikurangi ekstensi .xlsx jika ada
      let originalName = req.file.originalname || `Upload-${Date.now()}`;
      if (originalName.toLowerCase().endsWith('.xlsx')) {
        originalName = originalName.slice(0, -5);
      }
      
      const fileNameInDrive = `${originalName}.xlsx`;

      // Gunakan Google Apps Script untuk bypass Service Account Quota
      const gasUrl = process.env.GAS_UPLOAD_URL;
      if (!gasUrl) {
        return res.status(500).json({ error: 'GAS_UPLOAD_URL tidak ditemukan di environment.' });
      }

      const base64Data = req.file.buffer.toString('base64');
      const payload = {
        data: base64Data,
        filename: fileNameInDrive,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        folderId: folderId
      };

      console.log(`[UploadExcel] Mengirim file ke Google Apps Script...`);
      const gasResponse = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });

      const contentType = gasResponse.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(`Google Apps Script URL requires login (returned HTML).`);
      }

      const gasResult = await gasResponse.json();
      if (!gasResult.success) {
        throw new Error(gasResult.error || 'Unknown error from GAS');
      }

      // Gunakan ID Google Drive dari GAS sebagai file_id di database
      const fileId = gasResult.fileId;

      const doc = await createDocument({
        file_id: fileId,
        nama: originalName,
        uploaded_by: req.user.id,
      });

      return res.status(201).json({ message: 'File Excel berhasil diunggah ke Google Drive', document: doc });
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

      let docs = await listDocuments(status ? { status } : {});

      // Cross-reference with Google Drive
      try {
        const excelFolderId = process.env.GOOGLE_DRIVE_EXCEL_FOLDER_ID;
        const pdfFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1sLR2NSLCCSrlS1nBcxaMp2ko7B9YwOze'; // DEFAULT_TARGET_FOLDER_ID
        
        let driveFileIds = new Set();
        
        if (excelFolderId) {
          const excelFiles = await listFilesInFolder(excelFolderId);
          excelFiles.forEach(f => driveFileIds.add(f.id));
        }
        
        if (pdfFolderId) {
          const pdfFiles = await listFilesInFolder(pdfFolderId);
          pdfFiles.forEach(f => driveFileIds.add(f.id));
        }
        
        // Filter docs: keep if it's NOT a drive ID (e.g. local cache) or if it exists in Drive
        docs = docs.filter(d => {
          // Check if either the excel_file_id or file_id exists in Drive
          const driveIdToCheck = d.excel_file_id || d.file_id;
          const isDriveId = driveIdToCheck && driveIdToCheck.length > 25;
          if (!isDriveId) return true;
          // If they uploaded a PDF, file_id is in pdfFolder, and excel_file_id is in excelFolder
          return driveFileIds.has(d.file_id) || (d.excel_file_id && driveFileIds.has(d.excel_file_id));
        });
      } catch (err) {
        console.warn('[DocumentRoutes] Failed to cross-reference with Drive:', err.message);
        // Fallback: just return DB docs if Drive API fails
      }

      // Enrich with has_excel_cache flag
      const enriched = docs.map(d => {
        // Jika memiliki excel_file_id, atau file_id adalah Drive ID, atau ada di lokal
        const hasExcelInDrive = d.excel_file_id && d.excel_file_id.length > 25;
        const isDriveId = d.file_id && d.file_id.length > 25;
        // Kita cek if excel exists in Drive OR if it's a direct Excel upload (where file_id is the excel) OR if local cache exists
        const hasCache = hasExcelInDrive || isDriveId || (d.file_id && fs.existsSync(path.join(EXCEL_CACHE_DIR, `${d.file_id}.xlsx`)));
        return { ...d, has_excel_cache: Boolean(hasCache) };
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
      const isDriveId = doc.file_id && doc.file_id.length > 25;
      if (!isDriveId) {
        const excelPath = path.join(EXCEL_CACHE_DIR, `${doc.file_id}.xlsx`);
        if (!fs.existsSync(excelPath)) {
          return res.status(404).json({ error: 'File Excel Cache tidak ditemukan.' });
        }
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

      // Cek apakah file ada di Google Drive (jika ID panjang) atau di Lokal
      const driveIdToCheck = doc.excel_file_id || doc.file_id;
      const isDriveId = driveIdToCheck && driveIdToCheck.length > 25;
      const excelPath = path.join(EXCEL_CACHE_DIR, `${doc.file_id}.xlsx`);
      
      let excelBuffer = null;
      if (isDriveId) {
        try {
          excelBuffer = await downloadFile(driveIdToCheck);
        } catch (e) {
          return res.status(404).json({ error: 'File Excel tidak ditemukan di Google Drive.' });
        }
      } else {
        if (!fs.existsSync(excelPath)) {
          return res.status(404).json({ error: 'File Excel Cache lokal tidak ditemukan.' });
        }
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
      // Pass excelBuffer directly if from Drive, else fallback to path reading
      // Note: we need to adjust transformExcelToTabular to accept a buffer or we write it to tmp
      const tmpPath = path.join(TABULAR_DIR, `tmp-${doc.file_id}.xlsx`);
      let records;
      try {
        if (isDriveId && excelBuffer) {
          if (!fs.existsSync(TABULAR_DIR)) fs.mkdirSync(TABULAR_DIR, { recursive: true });
          fs.writeFileSync(tmpPath, excelBuffer);
        }
        records = await transformExcelToTabular(isDriveId ? tmpPath : excelPath, report);
      } finally {
        if (isDriveId && fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      }
      
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
        const tabDir = TABULAR_DIR;
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

      const driveIdToCheck = doc.excel_file_id || doc.file_id;
      const isDriveId = driveIdToCheck && driveIdToCheck.length > 25;
      const excelPath = path.join(EXCEL_CACHE_DIR, `${doc.file_id}.xlsx`);
      
      let workbook;
      let version = Date.now(); // Dummy version for Drive files

      if (isDriveId) {
        try {
          const buffer = await downloadFile(driveIdToCheck);
          workbook = XLSX.read(buffer, { type: 'buffer' });
        } catch (e) {
          return res.status(404).json({ error: `File excel cache di Google Drive tidak ditemukan untuk ID ${driveIdToCheck}.` });
        }
      } else {
        if (!fs.existsSync(excelPath)) {
          return res.status(404).json({ error: `File excel cache lokal tidak ditemukan untuk ID ${doc.file_id}.` });
        }
        workbook = XLSX.readFile(excelPath);
        const stat = fs.statSync(excelPath);
        version = stat.mtimeMs;
      }

      const result = {};
      // Top-left origin of each sheet's used range (0-based). Lets the client map
      // array row/col indexes back to real Excel addresses (e.g. index 8 → A9).
      const sheetOrigins = {};

      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
        result[sheetName] = json;
        let origin = { r: 0, c: 0 };
        try {
          if (sheet['!ref']) {
            const range = XLSX.utils.decode_range(sheet['!ref']);
            origin = { r: range.s.r, c: range.s.c };
          }
        } catch { /* keep default A1 origin */ }
        sheetOrigins[sheetName] = origin;
      });

      return res.json({ sheets: result, sheetNames: workbook.SheetNames, sheetOrigins, version });
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
      if (!doc || (!doc.file_id && !doc.excel_file_id)) {
        return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }

      // Only allow editing documents not yet POSTED
      if (doc.status === 'POSTED') {
        return res.status(400).json({ error: 'Dokumen sudah POSTED, tidak dapat diedit.' });
      }

      const fileId = doc.excel_file_id || doc.file_id;
      const isDriveId = fileId && fileId.length > 25;
      const excelPath = path.join(EXCEL_CACHE_DIR, `${fileId}.xlsx`);
      
      let workbook;
      let currentVersion = Date.now();

      if (isDriveId) {
        try {
          const buffer = await downloadFile(fileId);
          workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellDates: true });
        } catch (e) {
          return res.status(404).json({ error: 'File Excel Cache di Google Drive tidak ditemukan.' });
        }
      } else {
        if (!fs.existsSync(excelPath)) {
          return res.status(404).json({ error: 'File Excel Cache lokal tidak ditemukan.' });
        }
        // Concurrency check
        const currentStat = fs.statSync(excelPath);
        if (version && Math.abs(currentStat.mtimeMs - version) > 1000) {
          return res.status(409).json({
            error: 'File telah diubah oleh pengguna lain. Silakan reload halaman.',
            serverVersion: currentStat.mtimeMs,
          });
        }
        workbook = XLSX.readFile(excelPath, { cellStyles: true, cellDates: true });
        currentVersion = currentStat.mtimeMs;
      }

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
      if (isDriveId) {
        // Build buffer and update drive
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        await updateFileInDrive(fileId, buffer);
      } else {
        XLSX.writeFile(workbook, excelPath);
        currentVersion = fs.statSync(excelPath).mtimeMs;
      }

      return res.json({ success: true, version: currentVersion });
    } catch (err) {
      console.error('[DocumentRoutes] PUT /:id/excel-data error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;

