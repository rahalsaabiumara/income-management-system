/**
 * authMiddleware.js — Express middleware for Supabase JWT verification.
 *
 * Verifies the Bearer token from the Authorization header against
 * Supabase Auth. Attaches `req.user = { id, email }` on success.
 *
 * Uses a DEDICATED Supabase client (service role) that is completely
 * separate from the existing `supabaseClient.js` used by the sync
 * pipeline. This avoids any cross-dependency with Protected Core.
 *
 * IMPORTANT: This file is part of the NEW auth layer (Phase 1).
 * It does NOT interfere with the existing Google OAuth flow in
 * `googleAuth.js`, which remains the mechanism for Drive/Sheets access.
 */
import { createClient } from '@supabase/supabase-js';

let _authClient = null;

/**
 * Get or create the dedicated Supabase client for auth verification.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
function getAuthSupabaseClient() {
  if (_authClient) return _authClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      '[AuthMiddleware] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.'
    );
  }

  _authClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _authClient;
}

/**
 * Express middleware: requireAuth
 *
 * Extracts Bearer token from Authorization header, verifies it with
 * Supabase, and attaches `req.user = { id, email }`.
 *
 * Returns 401 if token is missing or invalid.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const supabase = getAuthSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Attach minimal user info to request
    req.user = {
      id: data.user.id,
      email: data.user.email,
    };

    next();
  } catch (err) {
    console.error('[AuthMiddleware] Error verifying token:', err.message);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}
