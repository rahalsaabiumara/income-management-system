import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

let authClient = null;

// SCOPES for Drive and Sheets
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

// Helper to get robust paths regardless of where the app is launched from
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Initialise and return the GoogleAuth client for Service Account.
 * (Name kept as getOAuth2Client for backwards compatibility with other files)
 */
export function getOAuth2Client() {
  if (authClient) return authClient;

  // 1. Try reading from Vercel Environment Variable first
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      if (credentials.private_key) {
        // Fix for Vercel sometimes escaping newlines in environment variables
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      authClient = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });
      console.log(`[GoogleAuth] Initialised Service Account using environment variable (GOOGLE_CREDENTIALS_JSON)`);
      return authClient;
    } catch (error) {
      console.error('[GoogleAuth] Failed to parse GOOGLE_CREDENTIALS_JSON from environment:', error.message);
    }
  }

  // 2. Fallback to physical file (for local development)
  const possiblePaths = [
    process.env.GOOGLE_CREDENTIALS_PATH,
    path.join(__dirname, '..', 'service-account.json'), // Inside server/
    path.join(__dirname, '..', '..', 'service-account.json'), // Root level
    path.join(__dirname, '..', 'credentials.json'),
    path.join(__dirname, '..', '..', 'credentials.json')
  ].filter(Boolean);

  let absPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      absPath = p;
      break;
    }
  }

  if (!absPath) {
    console.warn(`[GoogleAuth] Service Account credentials file not found. Please set GOOGLE_CREDENTIALS_JSON in Vercel or put service-account.json locally.`);
    return null;
  }

  try {
    authClient = new google.auth.GoogleAuth({
      keyFile: absPath,
      scopes: SCOPES,
    });
    console.log(`[GoogleAuth] Initialised Service Account using ${path.basename(absPath)}`);
  } catch (error) {
    console.error('[GoogleAuth] Failed to initialise Service Account:', error.message);
    return null;
  }

  return authClient;
}

/**
 * Check if the application has a valid token.
 * With a Service Account, if the file exists and is loaded, it is always ready.
 */
export function isAuthReady() {
  return getOAuth2Client() !== null;
}

/**
 * Generate Google Auth URL for the user to login.
 * Service accounts don't need user login, so we return null.
 */
export function generateAuthUrl() {
  return null;
}

/**
 * Handle the OAuth callback code and get tokens.
 * Service accounts don't need this, so we mock it.
 */
export async function handleCallback(code) {
  console.log('[GoogleAuth] Service Account is active. Ignoring OAuth callback.');
  return {};
}
