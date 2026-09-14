import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { getDocumentById } from '../services/documentTrackingService.js';
import { streamPdfFromDrive } from '../services/pdfProxyService.js';

const router = Router();

/**
 * GET /api/documents/:id/view-pdf
 * Role: ADMIN, KEUANGAN, USER
 * 
 * Streams the PDF directly from Google Drive without exposing the actual link.
 */
router.get(
  '/:id/view-pdf',
  requireAuth,
  requireRole('ADMIN', 'KEUANGAN', 'USER'),
  async (req, res) => {
    try {
      const doc = await getDocumentById(req.params.id);
      
      if (!doc || !doc.file_id) {
        return res.status(404).json({ error: 'Dokumen atau file PDF tidak ditemukan.' });
      }

      await streamPdfFromDrive(doc.file_id, res);
    } catch (err) {
      console.error('[PdfProxyRoutes] GET /:id/view-pdf error:', err.message);
      
      // If headers haven't been sent, we can send a JSON error
      if (!res.headersSent) {
        return res.status(500).json({ error: err.message });
      } else {
        res.end();
      }
    }
  }
);

export default router;
