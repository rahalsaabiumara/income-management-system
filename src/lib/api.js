/**
 * api.js — Wrapper fetch functions to the backend REST API.
 */

const BASE = '';  // Uses vite proxy in dev, same-origin in production

/**
 * Check if backend is authenticated with Google OAuth.
 * @returns {Promise<{ready: boolean}>}
 */
export async function checkAuthStatus() {
  const res = await fetch(`${BASE}/api/auth/status`);
  if (!res.ok) return { ready: false };
  return res.json();
}

/**
 * Get the Google OAuth login URL from backend.
 * @returns {Promise<{url: string}>}
 */
export async function getAuthUrl() {
  const res = await fetch(`${BASE}/api/auth/url`);
  if (!res.ok) throw new Error('Failed to get auth URL');
  return res.json();
}

/**
 * Fetch the entire Master data list.
 * @returns {Promise<Array<{tanggal: string, nama: string, namaStandar: string, link: string, fileId: string}>>}
 */
export async function fetchMaster() {
  const res = await fetch(`${BASE}/api/master`);
  if (!res.ok) throw new Error(`Failed to fetch master: ${res.statusText}`);
  return res.json();
}

/**
 * Trigger a sync from Google Drive folders → Master sheet.
 * @returns {Promise<{added: number, updated: number, skipped: number}>}
 */
export async function triggerSync() {
  const res = await fetch(`${BASE}/api/sync`, { method: 'POST' });
  if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`);
  return res.json();
}

/**
 * Import a CSV file to replace/merge into Master data.
 * @param {File} file — The CSV file
 * @returns {Promise<{imported: number, skipped: number}>}
 */
export async function importCsv(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/api/import-csv`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`CSV import failed: ${res.statusText}`);
  return res.json();
}

/**
 * Get the URL for a PDF lampiran extraction.
 * @param {string} fileId — Google Drive file ID
 * @param {object} [opts] — optional { nama, namaStandar } for proper filename
 * @returns {string}
 */
export function getLampiranUrl(fileId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.nama) params.set('nama', opts.nama);
  if (opts.namaStandar) params.set('namaStandar', opts.namaStandar);
  const qs = params.toString();
  return `${BASE}/api/lampiran/${encodeURIComponent(fileId)}${qs ? `?${qs}` : ''}`;
}

/**
 * Get lampiran detection info (page range etc.) without downloading the PDF. (Legacy)
 * @param {string} fileId
 * @returns {Promise<{detected: boolean, startPage?: number, endPage?: number, method?: string, message?: string}>}
 */
export async function getLampiranInfo(fileId) {
  const res = await fetch(`${BASE}/api/lampiran/${encodeURIComponent(fileId)}/info`);
  if (!res.ok) throw new Error(`Lampiran info failed: ${res.statusText}`);
  return res.json();
}

/**
 * Get TABEL LM detection info (specific 4 pages).
 * @param {string} fileId
 * @returns {Promise<{detected: boolean, pages: object, foundCount: number, details: Array}>}
 */
export async function getTabelLmInfo(fileId) {
  const res = await fetch(`${BASE}/api/tabel-lm/${encodeURIComponent(fileId)}/info`);
  if (!res.ok) throw new Error(`Tabel LM info failed: ${res.statusText}`);
  return res.json();
}

/**
 * Get URL for a single target page preview.
 * @param {string} fileId
 * @param {number} pageNum
 * @returns {string}
 */
export function getTabelLmPageUrl(fileId, pageNum) {
  return `${BASE}/api/tabel-lm/${encodeURIComponent(fileId)}/page/${pageNum}`;
}

/**
 * Download all lampiran as a ZIP file.
 * @param {Array<{fileId: string, nama: string, namaStandar: string}>} files
 * @returns {Promise<Blob>} — ZIP blob
 */
export async function downloadAllLampiran(files) {
  const res = await fetch(`${BASE}/api/lampiran/download-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Download failed: ${res.statusText}`);
  }

  return res.blob();
}

/**
 * Send (copy) a single file to the target Google Drive folder.
 * @param {string} fileId — Google Drive file ID to copy
 * @param {string} [nama] — Optional file name
 * @returns {Promise<{success: boolean, copied: {id: string, name: string, webViewLink: string}}>}
 */
export async function sendFileToDrive(fileId, nama) {
  const res = await fetch(`${BASE}/api/send-to-drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, nama }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Send failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Send (copy) multiple files to the target Google Drive folder.
 * @param {Array<{fileId: string, nama: string}>} files
 * @returns {Promise<{success: boolean, sent: number, failed: number, results: Array, errors: Array}>}
 */
export async function sendAllFilesToDrive(files) {
  const res = await fetch(`${BASE}/api/send-all-to-drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Send all failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Convert lampiran PDF to structured Excel.
 * @param {string} fileId — Google Drive file ID
 * @param {object} [opts] — { nama, namaStandar }
 * @returns {Promise<{success: boolean, token: string, validation: object, extractionMethod: string, rowsExtracted: object, filename: string}>}
 */
export async function convertToExcel(fileId, opts = {}) {
  const res = await fetch(`${BASE}/api/convert-excel/${encodeURIComponent(fileId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama: opts.nama, namaStandar: opts.namaStandar }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Convert failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Get the download URL for a converted Excel file.
 * @param {string} token — download token from convertToExcel response
 * @returns {string}
 */
export function getExcelDownloadUrl(token) {
  return `${BASE}/api/convert-excel/download/${encodeURIComponent(token)}`;
}

/**
 * Download a ZIP containing multiple converted Excel files.
 * @param {Array<string>} tokens — array of download tokens
 * @param {string} year — year label for the ZIP filename
 * @returns {Promise<Blob>}
 */
export async function downloadExcelZip(tokens, year) {
  const res = await fetch(`${BASE}/api/convert-excel/zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens, year }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `ZIP Download failed: ${res.statusText}`);
  }

  return res.blob();
}

/**
 * Upload a batch of converted Excel files to a Google Drive folder.
 * @param {Array<string>} tokens — array of download tokens (fileIds)
 * @param {string} folderId — Google Drive folder ID to upload to
 * @returns {Promise<Object>} — { success, results, errors }
 */
export async function uploadExcelBatch(tokens, folderId = '1bEoOIwlp6zqzfYgQMmNzyC_eq9D7jagw') {
  const res = await fetch(`${BASE}/api/convert-excel/upload-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens, folderId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload Batch failed: ${res.statusText}`);
  }

  return res.json();
}
/**
 * Start the processing pipeline for Tabular data.
 * @param {object} report 
 * @returns {Promise<{success: boolean, fileId: string}>}
 */
export async function processReport(report) {
  const res = await fetch(`${BASE}/api/process-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Process failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Get the status of an ongoing process.
 * @param {string} fileId 
 * @returns {Promise<object>}
 */
export async function getProcessStatus(fileId) {
  const res = await fetch(`${BASE}/api/process-report/${encodeURIComponent(fileId)}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Status check failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Upload a PDF file to Google Drive and immediately start the processing pipeline.
 * @param {File} file - The PDF file to upload.
 * @returns {Promise<{success: boolean, fileId: string, message: string}>}
 */
export async function uploadAndProcessPdf(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  // We can pass nama from filename if needed
  formData.append('nama', file.name.replace('.pdf', ''));

  const res = await fetch(`${BASE}/api/upload-process-pdf`, {
    method: 'POST',
    // DO NOT set Content-Type, fetch will set it automatically with boundary for FormData
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.statusText}`);
  }

  return res.json();
}
