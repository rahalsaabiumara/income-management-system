import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { google } from 'googleapis';
import { getOAuth2Client } from './services/googleAuth.js';

async function fix() {
  const auth = getOAuth2Client();
  const sheetsClient = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Find sheet ID for "Master"
  const spreadsheet = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const sheetId = spreadsheet.data.sheets.find(s => s.properties.title === 'Master').properties.sheetId;

  // Delete row 60 (0-indexed => 59)
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: 59,
              endIndex: 60
            }
          }
        }
      ]
    }
  });
  console.log('Deleted row 60');
}

fix().catch(console.error);
