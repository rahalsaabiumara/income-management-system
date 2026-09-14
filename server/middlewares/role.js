/**
 * roleMiddleware.js — Express middleware for role-based access control.
 *
 * Must be used AFTER `requireAuth` (needs `req.user.id`).
 * Queries the `profiles` table to fetch the user's role and checks
 * whether it is included in the allowed roles list.
 *
 * Attaches `req.user.role` and `req.user.fullName` on success.
 *
 * IMPORTANT: Uses the same dedicated auth Supabase client from auth.js
 * (service role key) to bypass RLS and read any profile.
 */
import { createClient } from '@supabase/supabase-js';

let _roleClient = null;

/**
 * Get or create the dedicated Supabase client for role queries.
 * Reuses the same SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as auth.js.
 */
function getRoleSupabaseClient() {
  if (_roleClient) return _roleClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      '[RoleMiddleware] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.'
    );
  }

  _roleClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _roleClient;
}

/**
 * Middleware factory: requireRole(...allowedRoles)
 *
 * Usage:
 *   app.get('/api/admin-only', requireAuth, requireRole('ADMIN'), handler);
 *   app.get('/api/finance',    requireAuth, requireRole('ADMIN', 'KEUANGAN'), handler);
 *
 * @param  {...string} allowedRoles — one or more of 'ADMIN' | 'KEUANGAN' | 'USER'
 * @returns {Function} Express middleware
 */
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    // requireAuth must have run first
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required before role check.' });
    }

    try {
      const supabase = getRoleSupabaseClient();

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', req.user.id)
        .single();

      if (error || !profile) {
        console.error('[RoleMiddleware] Profile not found for user:', req.user.id);
        return res.status(403).json({ error: 'User profile not found. Contact admin.' });
      }

      // Attach role info to req.user
      req.user.role = profile.role;
      req.user.fullName = profile.full_name;

      // Check if user's role is in the allowed list
      if (!allowedRoles.includes(profile.role)) {
        return res.status(403).json({
          error: 'Akses ditolak. Role Anda tidak memiliki izin untuk endpoint ini.',
          requiredRoles: allowedRoles,
          yourRole: profile.role,
        });
      }

      next();
    } catch (err) {
      console.error('[RoleMiddleware] Error checking role:', err.message);
      return res.status(500).json({ error: 'Failed to verify user role.' });
    }
  };
}
