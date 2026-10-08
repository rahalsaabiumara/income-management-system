import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { google } from 'googleapis';
import { getOAuth2Client } from './services/googleAuth.js';

async function fix() {
  const auth = getOAuth2Client();
  const sheetsClient = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const spreadsheet = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const sheetId = spreadsheet.data.sheets.find(s => s.properties.title === 'Master').properties.sheetId;

  // Delete rows 60 and 61 (indices 59 and 60)
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
              endIndex: 61
            }
          }
        }
      ]
    }
  });
  console.log('Deleted test rows');
}

fix().catch(console.error);
