/**
 * googleSheets.js — Google Sheets API service.
 *
 * Uses same service account as Drive.
 * Scope: spreadsheets (read/write limited to Master sheet).
 */
import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';

let sheetsClient = null;
let spreadsheetId = null;

/**
 * Initialise the Google Sheets client with OAuth2 credentials.
 */
export function initSheets() {
  spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.warn('[GoogleSheets] GOOGLE_SPREADSHEET_ID not set. Sheets features disabled.');
    return null;
  }

  const auth = getOAuth2Client();
  if (!auth) {
    console.warn('[GoogleSheets] OAuth2 client not available. Sheets features disabled.');
    return null;
  }

  sheetsClient = google.sheets({ version: 'v4', auth });
  console.log('[GoogleSheets] Initialised successfully.');
  return sheetsClient;
}

/**
 * Read data from a sheet.
 * @param {string} sheetName — e.g. "Master" or "Link Folder"
 * @param {string} [range] — e.g. "A:D" or "A2:D"
 * @returns {Promise<string[][]>}
 */
export async function readSheet(sheetName, range = '') {
  if (!sheetsClient) throw new Error('Google Sheets not initialised');
  const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange,
  });
  return res.data.values || [];
}

/**
 * Read the "Link Folder" sheet → array of { tahun, linkFolder, folderId }.
 * Expected columns: Tahun | Link Folder Drive
 */
export async function readFolderLinks() {
  const rows = await readSheet('Link Folder', 'A2:B');
  return rows
    .filter((r) => r[0] && r[1])
    .map((r) => {
      const tahun = parseInt(r[0], 10);
      const linkFolder = r[1].trim();
      // Extract folder ID from URL
      const m = linkFolder.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
                linkFolder.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      return {
        tahun,
        linkFolder,
        folderId: m ? m[1] : null,
      };
    })
    .filter((r) => r.folderId);
}

/**
 * Read the "Master" sheet → array of { rowIndex, tanggal, nama, link, fileId }.
 * Expected columns: Tanggal | Nama | Link File
 */
export async function readMaster() {
  const rows = await readSheet('Master', 'A2:C');
  return rows.map((r, idx) => ({
    rowIndex: idx + 2, // 1-indexed, skip header
    tanggal: (r[0] || '').trim(),
    nama: (r[1] || '').trim(),
    link: (r[2] || '').trim(),
    fileId: extractFileIdSafe(r[2]),
  }));
}

/**
 * Append rows to the Master sheet.
 * @param {Array<[string, string, string]>} rows — [ [tanggal, nama, link], ... ]
 */
export async function appendToMaster(rows) {
  if (!sheetsClient || !rows.length) return;
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: "'Master'!A:C",
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  });
}

/**
 * Update a specific row in the Master sheet.
 * @param {number} rowIndex — 1-indexed row number
 * @param {[string, string, string]} values — [tanggal, nama, link]
 */
export async function updateMasterRow(rowIndex, values) {
  if (!sheetsClient) return;
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `'Master'!A${rowIndex}:C${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

/**
 * Insert a row at a specific position in the Master sheet.
 * @param {number} rowIndex — 0-indexed position to insert at
 * @param {[string, string, string]} values — [tanggal, nama, link]
 */
export async function insertMasterRow(rowIndex, values) {
  if (!sheetsClient) return;

  // First, get the sheet ID
  const meta = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const masterSheet = meta.data.sheets.find(
    (s) => s.properties.title === 'Master'
  );
  if (!masterSheet) throw new Error('Sheet "Master" not found');
  const sheetId = masterSheet.properties.sheetId;

  // Insert an empty row
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });

  // Write values to the new row
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `'Master'!A${rowIndex + 1}:C${rowIndex + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

// Helper
function extractFileIdSafe(url) {
  if (!url) return null;
  const m = (url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
             url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/));
  return m ? m[1] : null;
}

function getColumnLetter(colIndex) {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Perform a batch Upsert to a Google Spreadsheet for a specific sheet.
 * @param {object} params
 * @param {string} params.spreadsheetId
 * @param {string} params.sheetName
 * @param {Array<object>} params.records
 */
export async function upsertToGoogleSheets({ spreadsheetId, sheetName, records }) {
  if (!sheetsClient) throw new Error('Google Sheets not initialised');
  if (!spreadsheetId) throw new Error('Target spreadsheet ID is missing');
  if (!records || records.length === 0) return { total: 0, inserted: 0, updated: 0, failed: 0 };

  // Read header row
  let headerRow = [];
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!1:1`
    });
    headerRow = res.data.values && res.data.values[0] ? res.data.values[0] : [];
  } catch (err) {
    throw new Error(`Destination sheet "${sheetName}" tidak ditemukan atau gagal dibaca pada spreadsheet tujuan. Detail: ${err.message}`);
  }

  if (!headerRow || headerRow.length === 0) {
     throw new Error(`Destination sheet "${sheetName}" tidak ditemukan atau kosong.`);
  }

  const colMapping = {};
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i]) {
      const h = headerRow[i].toString().toLowerCase().trim();
      colMapping[h] = i;
    }
  }

  if (colMapping['id'] === undefined) {
    throw new Error(`Kolom 'id' tidak ditemukan pada sheet ${sheetName}`);
  }
  const idColIndex = colMapping['id'];
  const idColLetter = getColumnLetter(idColIndex);

  let existingData = [];
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${idColLetter}:${idColLetter}`
    });
    existingData = res.data.values || [];
  } catch (err) {
    throw new Error(`Failed to read IDs from sheet ${sheetName}: ${err.message}`);
  }

  const existingIdMap = new Map();
  for (let i = 0; i < existingData.length; i++) {
    if (existingData[i] && existingData[i][0]) {
      existingIdMap.set(existingData[i][0], i + 1);
    }
  }

  const updates = [];
  const inserts = [];
  const maxColIndex = headerRow.length - 1;
  const maxColLetter = getColumnLetter(maxColIndex);

  for (const record of records) {
    const rowData = new Array(headerRow.length).fill('');
    
    if (colMapping['id'] !== undefined) rowData[colMapping['id']] = record.id;
    if (colMapping['bulan'] !== undefined) rowData[colMapping['bulan']] = record.bulan;
    if (colMapping['uraian'] !== undefined) rowData[colMapping['uraian']] = record.uraian;
    if (colMapping['sub uraian'] !== undefined) rowData[colMapping['sub uraian']] = record.subUraian || '';
    else if (colMapping['suburaian'] !== undefined) rowData[colMapping['suburaian']] = record.subUraian || '';
    if (colMapping['jenis'] !== undefined) rowData[colMapping['jenis']] = record.jenis;
    if (colMapping['value'] !== undefined) rowData[colMapping['value']] = record.value;

    if (existingIdMap.has(record.id)) {
      const rowIndex = existingIdMap.get(record.id);
      updates.push({
        range: `'${sheetName}'!A${rowIndex}:${maxColLetter}${rowIndex}`,
        values: [rowData]
      });
    } else {
      inserts.push(rowData);
    }
  }

  if (updates.length > 0) {
    const data = updates.map(u => ({
      range: u.range,
      values: u.values
    }));
    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: data
      }
    });
  }

  if (inserts.length > 0) {
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:${maxColLetter}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: inserts
      }
    });
  }

  return {
    total: records.length,
    inserted: inserts.length,
    updated: updates.length,
    failed: 0
  };
}
