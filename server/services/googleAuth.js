import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const TOKEN_PATH = path.resolve('./token.json');

let oauth2Client = null;

// SCOPES for Drive and Sheets
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

/**
 * Initialise and return the OAuth2 client.
 * Does not guarantee that the client has valid tokens yet.
 */
export function getOAuth2Client() {
  if (oauth2Client) return oauth2Client;

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const absPath = path.resolve(credPath);

  if (!fs.existsSync(absPath)) {
    console.warn(`[GoogleAuth] Credentials file not found at ${absPath}.`);
    return null;
  }

  const content = fs.readFileSync(absPath, 'utf8');
  let credentials;
  try {
    credentials = JSON.parse(content);
  } catch (err) {
    console.error('[GoogleAuth] Error parsing credentials.json:', err);
    return null;
  }

  // Handle both Web Application and Installed App types
  const keys = credentials.web || credentials.installed;
  if (!keys) {
    console.error('[GoogleAuth] credentials.json is not a valid OAuth 2.0 client format.');
    return null;
  }

  const { client_secret, client_id, redirect_uris } = keys;
  const redirectUri = redirect_uris ? redirect_uris[0] : 'http://localhost:3001/api/auth/callback';

  oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  // Load existing token if available
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2Client.setCredentials(token);
    } catch (err) {
      console.warn('[GoogleAuth] Failed to load existing token.json:', err.message);
    }
  }

  // Handle token refresh automatically saving to file
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      console.log('[GoogleAuth] New refresh token acquired.');
    }
    console.log('[GoogleAuth] Access token updated.');
    
    let existing = {};
    if (fs.existsSync(TOKEN_PATH)) {
      try { existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); } catch (e) {}
    }
    
    // Merge new tokens with existing (to keep refresh_token if not returned)
    const newTokens = { ...existing, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
  });

  return oauth2Client;
}

/**
 * Check if the application has a valid token.
 */
export function isAuthReady() {
  if (!oauth2Client) return false;
  return Object.keys(oauth2Client.credentials).length > 0;
}

/**
 * Generate Google Auth URL for the user to login.
 */
export function generateAuthUrl() {
  const client = getOAuth2Client();
  if (!client) throw new Error('OAuth2 client not initialised (missing credentials.json)');

  return client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Force consent screen to always get refresh token
    scope: SCOPES,
  });
}

/**
 * Handle the OAuth callback code and get tokens.
 */
export async function handleCallback(code) {
  const client = getOAuth2Client();
  if (!client) throw new Error('OAuth2 client not initialised');

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  
  // Save to file immediately
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('[GoogleAuth] Successfully authenticated and saved token.json');
  
  return tokens;
}
