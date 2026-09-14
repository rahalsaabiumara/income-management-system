/**
 * Login.jsx — Email/password login page for LM Manager V2.
 *
 * Uses Supabase Auth (NOT Google OAuth — that remains separate for Drive/Sheets).
 * Supports both login and signup modes.
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { user, login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Jika sudah login, langsung alihkan ke rute utama
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (isSignup) {
        await signup(email, password, fullName);
        setSuccess('Akun berhasil dibuat! Silakan cek email untuk konfirmasi, lalu login.');
        setIsSignup(false);
      } else {
        await login(email, password);
        // AuthContext will handle state update & redirect
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600
                          flex items-center justify-center shadow-lg shadow-brand-500/20 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            LM Manager
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            {isSignup ? 'Buat akun baru' : 'Masuk ke akun Anda'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-xl shadow-surface-200/50 dark:shadow-surface-950/50
                        border border-surface-200 dark:border-surface-800 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name (signup only) */}
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-surface-300 dark:border-surface-700
                             bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                             transition-all duration-200"
                  placeholder="Nama Anda"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-surface-300 dark:border-surface-700
                           bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                           transition-all duration-200"
                placeholder="email@contoh.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-xl border border-surface-300 dark:border-surface-700
                           bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                           transition-all duration-200"
                placeholder="Minimal 6 karakter"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800
                              text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="px-4 py-3 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800
                              text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-bold text-white
                         bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-md shadow-brand-500/20 active:scale-[0.98]
                         transition-all duration-200"
            >
              {submitting
                ? (isSignup ? 'Membuat akun...' : 'Masuk...')
                : (isSignup ? 'Daftar' : 'Masuk')
              }
            </button>
          </form>

          {/* Toggle login/signup */}
          <div className="mt-6 text-center">
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {isSignup ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
              <button
                onClick={() => {
                  setIsSignup(!isSignup);
                  setError('');
                  setSuccess('');
                }}
                className="font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700
                           dark:hover:text-brand-300 transition-colors"
              >
                {isSignup ? 'Masuk' : 'Daftar'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-surface-400 dark:text-surface-500 mt-6">
          LM Manager — Sistem Otomasi Laporan Manajemen
        </p>
      </div>
    </div>
  );
}
