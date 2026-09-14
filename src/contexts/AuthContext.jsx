/**
 * AuthContext.jsx — Supabase Auth context provider for LM Manager V2.
 *
 * Provides: { user, role, loading, login, signup, logout }
 *
 * This is the NEW user authentication layer (email/password via Supabase Auth).
 * It is completely separate from the Google OAuth flow used for Drive/Sheets
 * access (which remains in googleAuth.js on the backend).
 *
 * Role is fetched from the `profiles` table after login.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch user role from profiles table.
   */
  const fetchRole = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[AuthContext] Could not fetch profile:', error.message);
        setRole('USER'); // Fallback
        return;
      }

      const fetchedRole = data.role ? data.role.toUpperCase() : 'USER';
      setRole(fetchedRole);
    } catch (err) {
      console.error('[AuthContext] fetchRole error:', err);
      setRole('USER');
    }
  }, []);

  /**
   * Initialise: check existing session & listen for auth changes.
   */
  useEffect(() => {
    // 1. Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await fetchRole(session.user.id);
      }
      setLoading(false);
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchRole(session.user.id);
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  /**
   * Login with email & password.
   */
  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  /**
   * Signup with email & password.
   */
  const signup = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  /**
   * Logout.
   */
  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setRole(null);
  }, []);

  const value = {
    user,
    role,
    loading,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
