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
      return res.json(docs);
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
 * Body: { comment: string }
 * Role: KEUANGAN only
 */
router.post(
  '/:id/comments',
  requireAuth,
  requireRole('KEUANGAN'),
  async (req, res) => {
    try {
      const { comment } = req.body;
      if (!comment) {
        return res.status(400).json({ error: 'Komentar tidak boleh kosong.' });
      }

      // 1. Add comment
      const newComment = await addComment(req.params.id, req.user.id, comment);

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
 * POST /api/documents/:id/approve
 * Role: KEUANGAN only
 */
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('KEUANGAN'),
  async (req, res) => {
    try {
      const doc = await updateDocumentStatus(req.params.id, 'POSTED');
      return res.json(doc);
    } catch (err) {
      console.error('[DocumentRoutes] POST /:id/approve error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
