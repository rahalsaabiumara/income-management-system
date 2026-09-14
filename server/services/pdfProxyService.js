import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';

/**
 * Stream a PDF file from Google Drive directly to an Express response.
 *
 * @param {string} fileId - The Google Drive file ID.
 * @param {import('express').Response} res - The Express response object.
 */
export async function streamPdfFromDrive(fileId, res) {
  const auth = getOAuth2Client();
  if (!auth) {
    throw new Error('Google Drive authentication missing.');
  }

  const drive = google.drive({ version: 'v3', auth });

  try {
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    response.data.pipe(res);
  } catch (err) {
    console.error(`[PdfProxyService] Failed to stream file ${fileId}:`, err.message);
    throw new Error('Gagal memuat PDF dari server.');
  }
}
