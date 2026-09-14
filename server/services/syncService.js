/**
 * syncService.js — Synchronises Google Drive folders → Master sheet.
 *
 * Flow:
 * 1. Read "Link Folder" sheet → list of { tahun, folderId }
 * 2. For each folder, list PDF files via Drive API
 * 3. Read existing "Master" sheet
 * 4. For each Drive file:
 *    a. Extract file ID (anti-duplicate key)
 *    b. If already in Master → skip
 *    c. Parse filename → get bulan + tahun
 *    d. If placeholder exists (tanggal set but nama/link empty) → fill it
 *    e. Otherwise → insert at chronological position
 * 5. Return summary { added, updated, skipped }
 */
import { readFolderLinks, readMaster, updateMasterRow, insertMasterRow } from './googleSheets.js';
import { listFilesInFolder } from './googleDrive.js';
import { parseLMName, sortKey } from '../utils/dateParser.js';

export async function runSync() {
  const summary = { added: 0, updated: 0, skipped: 0, errors: [] };

  // 1. Read folder links
  const folders = await readFolderLinks();
  if (folders.length === 0) {
    summary.errors.push('No folders found in "Link Folder" sheet.');
    return summary;
  }

  // 2. Read current Master data
  const masterRows = await readMaster();
  const existingFileIds = new Set(
    masterRows.filter((r) => r.fileId).map((r) => r.fileId)
  );

  // Collect all new files from all folders
  const newFiles = [];

  for (const folder of folders) {
    try {
      const files = await listFilesInFolder(folder.folderId);
      for (const file of files) {
        if (existingFileIds.has(file.id)) {
          summary.skipped++;
          continue;
        }
        existingFileIds.add(file.id); // Add it here to prevent duplicates across folders/API responses
        newFiles.push({
          fileId: file.id,
          fileName: file.name,
          link: `https://drive.google.com/file/d/${file.id}/view`,
        });
      }
    } catch (err) {
      summary.errors.push(`Error scanning folder ${folder.tahun}: ${err.message}`);
    }
  }

  // 3. Process new files
  for (const nf of newFiles) {
    const parsed = parseLMName(nf.fileName);
    const tanggal = parsed ? parsed.tanggal : '';
    const nama = parsed ? parsed.namaStandar : nf.fileName;
    const newSortKey = sortKey(parsed);

    // Check for placeholder: row that has tanggal but empty nama and link
    // and matches the same month+year
    const placeholder = masterRows.find((r) => {
      if (r.nama || r.link) return false; // not empty
      if (!r.tanggal) return false;
      const rParsed = parseLMName(r.tanggal);
      if (!rParsed || !parsed) return false;
      return rParsed.bulan === parsed.bulan && rParsed.tahun === parsed.tahun;
    });

    if (placeholder) {
      // Fill the placeholder
      await updateMasterRow(placeholder.rowIndex, [tanggal, nama, nf.link]);
      summary.updated++;
    } else {
      // Find insertion position for chronological order
      let insertIdx = masterRows.length + 2; // default: append at end (after header)
      for (let i = 0; i < masterRows.length; i++) {
        const rowParsed = parseLMName(masterRows[i].nama || masterRows[i].tanggal);
        const rowSK = sortKey(rowParsed);
        if (newSortKey < rowSK) {
          insertIdx = masterRows[i].rowIndex;
          break;
        }
      }

      await insertMasterRow(insertIdx - 1, [tanggal, nama, nf.link]);
      summary.added++;

      // After inserting, all subsequent row indices shift by 1
      // Update in-memory data to keep indices correct
      for (const r of masterRows) {
        if (r.rowIndex >= insertIdx) r.rowIndex++;
      }
      masterRows.push({
        rowIndex: insertIdx,
        tanggal,
        nama,
        link: nf.link,
        fileId: nf.fileId,
      });
    }

    existingFileIds.add(nf.fileId);
  }

  return summary;
}
