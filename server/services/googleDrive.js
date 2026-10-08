/**
 * googleDrive.js — Google Drive API service.
 *
 * Uses a service account for authentication.
 * Scope: drive.readonly
 */
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getOAuth2Client } from './googleAuth.js';

let driveClient = null;

/**
 * Initialise the Google Drive client with OAuth2 credentials.
 */
export function initDrive() {
  const auth = getOAuth2Client();
  if (!auth) {
    console.warn('[GoogleDrive] OAuth2 client not available. Drive features disabled.');
    return null;
  }

  driveClient = google.drive({ version: 'v3', auth });
  console.log('[GoogleDrive] Initialised successfully.');
  return driveClient;
}

/**
 * List all PDF files in a Google Drive folder.
 * @param {string} folderId
 * @returns {Promise<Array<{id: string, name: string, mimeType: string}>>}
 */
export async function listFilesInFolder(folderId) {
  if (!driveClient) throw new Error('Google Drive not initialised');

  const files = [];
  let pageToken = null;

  do {
    const res = await driveClient.files.list({
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime)',
      pageSize: 100,
      pageToken,
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * Download a file from Google Drive as a Buffer.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
export async function downloadFile(fileId) {
  if (!driveClient) throw new Error('Google Drive not initialised');

  const res = await driveClient.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(res.data);
}

/**
 * Extract a Google Drive folder ID from a URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractFolderIdFromUrl(url) {
  if (!url) return null;
  // https://drive.google.com/drive/folders/FOLDER_ID
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // ?id=FOLDER_ID
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

/**
 * Extract a Google Drive file ID from a URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractFileIdFromUrl(url) {
  if (!url) return null;
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

/**
 * Copy a file to a target Google Drive folder.
 * Creates a copy of the source file inside the destination folder.
 *
 * @param {string} sourceFileId — The file ID to copy
 * @param {string} targetFolderId — The destination folder ID
 * @param {string} [newName] — Optional new name for the copied file
 * @returns {Promise<{id: string, name: string, webViewLink: string}>}
 */
export async function copyFileToFolder(sourceFileId, targetFolderId, newName) {
  if (!driveClient) throw new Error('Google Drive not initialised');

  const requestBody = {
    parents: [targetFolderId],
  };
  if (newName) {
    requestBody.name = newName;
  }

  const res = await driveClient.files.copy({
    fileId: sourceFileId,
    requestBody,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  return res.data;
}

/**
 * Upload a file buffer to a target Google Drive folder.
 *
 * @param {Buffer} buffer — The file content
 * @param {string} filename — The name of the file
 * @param {string} targetFolderId — The destination folder ID
 * @param {string} [mimeType='application/pdf'] — The MIME type
 * @returns {Promise<{id: string, name: string, webViewLink: string}>}
 */
export async function uploadFileToFolder(buffer, filename, targetFolderId, mimeType = 'application/pdf') {
  if (!driveClient) throw new Error('Google Drive not initialised');

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const requestBody = {
    name: filename,
    parents: [targetFolderId],
  };

  const media = {
    mimeType,
    body: stream,
  };

  const res = await driveClient.files.create({
    requestBody,
    media,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  return res.data;
}
