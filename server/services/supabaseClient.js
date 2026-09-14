/**
 * supabaseClient.js — Singleton Supabase admin client for backend use.
 *
 * Uses SUPABASE_URL + SUPABASE_SECRET_KEY (service role key).
 * This client bypasses RLS and should NEVER be exposed to the frontend.
 *
 * SECURITY:
 * - SUPABASE_SECRET_KEY is BACKEND ONLY
 * - Never send to frontend
 * - Never use VITE_ prefix for secret key
 * - Never log credentials
 *
 * NOTE: Environment variables are read lazily (inside functions, not at
 * module top-level) to ensure dotenv has already loaded by the time
 * they are accessed. This is required because ESM hoists imports above
 * all other statements, including dotenv.config().
 */
import { createClient } from '@supabase/supabase-js';

let supabaseAdmin = null;

/**
 * Returns the Supabase admin client singleton.
 * Lazily initialised so the server can start even if env vars are missing
 * (Supabase sync will simply be skipped).
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 * @throws {Error} If SUPABASE_URL or SUPABASE_SECRET_KEY is not configured.
 */
export function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      'SUPABASE_URL atau SUPABASE_SECRET_KEY belum dikonfigurasi di .env'
    );
  }

  supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('[SupabaseClient] Admin client initialised.');
  return supabaseAdmin;
}

/**
 * Check if Supabase backend configuration is available.
 * Does NOT throw — safe to call for conditional checks.
 *
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
