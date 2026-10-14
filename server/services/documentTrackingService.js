/**
 * documentTrackingService.js — CRUD operations for the `documents` table.
 *
 * This is a NEW service (Phase 2) and is NOT part of the Protected Core.
 * It uses the SAME dedicated Supabase service-role client pattern from
 * the Phase 1 middlewares, completely isolated from `supabaseClient.js`
 * (which is used by the sync pipeline).
 *
 * Phase 3 will import `updateDocumentStatus()` from here into
 * `processingService.js` as an additive call.
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;

/** Valid document_status enum values (must match Supabase enum). */
const VALID_STATUSES = [
  'UNPROCESSED',
  'PROCESSING',
  'DRAFT_READY',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'POSTED',
];

/**
 * Get or create the dedicated Supabase admin client for document tracking.
 */
function getClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      '[DocumentTracking] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.'
    );
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}

/**
 * Create a new document record.
 *
 * @param {{ file_id: string, nama: string, uploaded_by?: string }} params
 * @returns {Promise<object>} The created document row.
 */
export async function createDocument({ file_id, nama, uploaded_by }) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('documents')
    .insert({
      file_id,
      nama,
      uploaded_by: uploaded_by || null,
      status: 'UNPROCESSED',
    })
    .select()
    .single();

  if (error) {
    console.error('[DocumentTracking] createDocument error:', error.message);
    throw new Error(`Failed to create document: ${error.message}`);
  }

  return data;
}

/**
 * List documents, optionally filtered by status.
 *
 * @param {{ status?: string }} [filters={}]
 * @returns {Promise<object[]>} Array of document rows.
 */
export async function listDocuments(filters = {}) {
  const supabase = getClient();

  let query = supabase
    .from('documents')
    .select('*, profiles:uploaded_by(email, full_name)')
    .order('created_at', { ascending: false });

  if (filters.status) {
    if (!VALID_STATUSES.includes(filters.status)) {
      throw new Error(
        `Invalid status filter: "${filters.status}". Must be one of: ${VALID_STATUSES.join(', ')}`
      );
    }
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[DocumentTracking] listDocuments error:', error.message);
    throw new Error(`Failed to list documents: ${error.message}`);
  }

  return data;
}

/**
 * Get a single document by ID.
 *
 * @param {string} id — UUID of the document.
 * @returns {Promise<object|null>} The document row, or null if not found.
 */
export async function getDocumentById(id) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('documents')
    .select('*, profiles:uploaded_by(email, full_name)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[DocumentTracking] getDocumentById error:', error.message);
    throw new Error(`Failed to get document: ${error.message}`);
  }

  return data;
}

/**
 * Get the most recent document for a Drive file_id (lightweight columns only).
 *
 * @param {string} fileId — Google Drive file ID of the uploaded PDF.
 * @returns {Promise<object|null>} The document row, or null if not found.
 */
export async function getDocumentByFileId(fileId) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('documents')
    .select('id, file_id, status, excel_file_id, created_at, updated_at')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Gagal mengambil dokumen berdasarkan file_id: ${error.message}`);
  }

  return (data && data[0]) || null;
}

/**
 * Update the status of a document.
 *
 * @param {string} id — UUID of the document.
 * @param {string} status — New status (must be a valid document_status enum value).
 * @returns {Promise<object>} The updated document row.
 */
export async function updateDocumentStatus(id, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Status tidak valid: ${newStatus}`);
  }

  const supabase = getClient();

  const { data, error } = await supabase
    .from('documents')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal update status dokumen: ${error.message}`);
  }

  return data;
}

/**
 * Update the excel_file_id of a document.
 *
 * @param {string} id — UUID of the document.
 * @param {string} excelFileId — The new Google Drive ID for the Excel file.
 * @returns {Promise<object>} The updated document row.
 */
export async function updateDocumentExcelId(id, excelFileId) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('documents')
    .update({
      excel_file_id: excelFileId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal update excel_file_id dokumen: ${error.message}`);
  }

  return data;
}

/**
 * PHASE 4: Add a comment to a document.
 */
export async function addComment(document_id, user_id, comment, metadata = {}) {
  const supabase = getClient();

  const payload = {
    document_id,
    user_id,
    comment,
    jenis_komentar: metadata.jenis_komentar || 'CATATAN',
    sheet_name: metadata.sheet_name || null,
    target_cell: metadata.target_cell || null,
    target_identifier: metadata.target_identifier || null,
    author_role: metadata.author_role || null,
    status: 'OPEN'
  };

  const { data, error } = await supabase
    .from('comments')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menambah komentar: ${error.message}`);
  }
  return data;
}

/**
 * PHASE 5: Resolve a comment.
 */
export async function resolveComment(comment_id, user_id) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('comments')
    .update({
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
      resolved_by: user_id
    })
    .eq('id', comment_id)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyelesaikan komentar: ${error.message}`);
  }
  return data;
}

/**
 * PHASE 4: List comments for a document.
 */
export async function listComments(document_id) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('comments')
    .select(`
      id,
      comment,
      created_at,
      user_id,
      jenis_komentar,
      sheet_name,
      target_cell,
      target_identifier,
      status,
      resolved_at,
      resolved_by,
      author_role,
      profiles!comments_user_id_fkey (
        full_name,
        role
      )
    `)
    .eq('document_id', document_id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Gagal mengambil komentar: ${error.message}`);
  }
  return data;
}

/** Export the valid statuses for validation in routes. */
export { VALID_STATUSES };
