/**
 * Login.jsx — Email/password login page for Income Statement V2.
 *
 * Uses Supabase Auth (NOT Google OAuth — that remains separate for Drive/Sheets).
 * Supports both login and signup modes.
 *
 * Layering (bottom → top):
 *   z-0  : animated green gradient (.dynamic-bg, see index.css)
 *   z-10 : floating "firefly" particles (@tsparticles, pointer-events-none)
 *   z-20 : glassmorphism login card
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useAuth } from '../contexts/AuthContext.jsx';

// TODO: Replace with actual path (background photo shown on the left side of the card)
const CARD_BG_IMAGE = '/bg-login.jpg';
// TODO: Replace with actual path (company logo)
const LOGO_SRC = '/logo.png';

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm ' +
  'placeholder:text-gray-400 transition-all duration-200 ' +
  'focus:ring-2 focus:ring-green-500 focus:outline-none focus:border-transparent focus:bg-white';

const labelClass = 'block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider';

export default function Login() {
  const { user, role, login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);

  // Initialise the tsParticles engine once (slim bundle)
  useEffect(() => {
    let cancelled = false;
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (!cancelled) setParticlesReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Subtle fireflies / light-green dust drifting upwards
  const particlesOptions = useMemo(() => ({
    fullScreen: { enable: false },
    background: { color: { value: 'transparent' } },
    fpsLimit: 60,
    detectRetina: true,
    particles: {
      number: { value: 35, density: { enable: true, width: 1200, height: 800 } },
      color: { value: ['#bbf7d0', '#86efac', '#d9f99d'] },
      shape: { type: 'circle' },
      opacity: {
        value: { min: 0.1, max: 0.45 },
        animation: { enable: true, speed: 0.6, sync: false },
      },
      size: { value: { min: 1, max: 3.5 } },
      move: {
        enable: true,
        direction: 'top',
        speed: { min: 0.2, max: 0.7 },
        straight: false,
        random: true,
        outModes: { default: 'out' },
      },
    },
    interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
  }), []);

  // Jika sudah login dan role sudah tersedia, alihkan ke rute yang sesuai
  if (user && role) {
    return <Navigate to="/bi-dashboard" replace />;
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
    <main className="relative w-screen min-h-screen overflow-hidden">
      {/* z-0: animated gradient */}
      <div className="dynamic-bg absolute inset-0 z-0" aria-hidden="true" />

      {/* z-10: floating particles (never blocks clicks) */}
      {particlesReady && (
        <Particles
          id="login-particles"
          options={particlesOptions}
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* z-20: glass card */}
      <div className="relative z-20 min-h-screen flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl md:flex rounded-3xl overflow-hidden bg-white/85 backdrop-blur-md
                        border border-white/40 shadow-2xl">

          {/* Left column: visual & branding (desktop only) */}
          <section className="hidden md:block w-1/2 relative overflow-hidden">
            <img
              src={CARD_BG_IMAGE}
              alt="Perkebunan teh PT LPP Agro Nusantara"
              className="object-cover w-full h-full absolute inset-0 z-0"
            />
            <div className="absolute inset-0 z-10 bg-green-900/30 mix-blend-multiply" />
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-green-950/60 via-transparent to-green-950/20" />
            <div className="relative z-20 h-full min-h-[560px] flex flex-col items-center justify-center text-center px-8">
              <img
                src={LOGO_SRC}
                alt="Logo LPP Agro Nusantara"
                className="w-24 h-24 mb-4 object-contain drop-shadow-lg"
              />
              <h2 className="text-white font-bold text-2xl tracking-wide drop-shadow-md">
                PT LPP AGRO NUSANTARA
              </h2>
              <p
                className="mt-2 text-s text-white/90 drop-shadow-md tracking-wider"
                style={{ fontFamily: "'Great Vibes', cursive" }}
              >
                Always Become Your Excellent Partner
              </p>
            </div>
          </section>

          {/* Right column: login form */}
          <section className="w-full md:w-1/2 p-10 md:p-12 flex flex-col justify-center bg-transparent">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isSignup ? 'Buat Akun!' : 'Selamat Datang!'}
            </h1>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">
              {isSignup
                ? 'Lengkapi data di bawah ini untuk membuat akun baru.'
                : 'Selamat datang di Income Statement LPP Agro Nusantara, silakan masuk ke akun Anda.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name (signup only) */}
              {isSignup && (
                <div>
                  <label htmlFor="fullName" className={labelClass}>Nama Lengkap</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                    placeholder="Nama Anda"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="email@contoh.com"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Password
                  </label>
                  {!isSignup && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      Lupa Password?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="Minimal 6 karakter"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2.5">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2.5">
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
                className="w-full py-3 rounded-lg text-sm font-bold text-white
                           bg-gradient-to-r from-green-700 to-green-600
                           hover:shadow-lg hover:shadow-green-700/30 hover:scale-[1.02]
                           active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
                           transition-transform duration-200"
              >
                {submitting
                  ? (isSignup ? 'Membuat akun...' : 'Memproses...')
                  : (isSignup ? 'Daftar' : 'Login')}
              </button>
            </form>

            {/* Divider */}
            <div className="mt-8 flex items-center gap-4" role="separator">
              <div className="h-px flex-1 bg-gray-300/70" />
              <span className="text-[11px] font-semibold text-gray-400 tracking-widest">ATAU</span>
              <div className="h-px flex-1 bg-gray-300/70" />
            </div>

            {/* Toggle login/signup */}
            <p className="mt-5 text-center text-sm text-gray-600">
              {isSignup ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignup(!isSignup);
                  setError('');
                  setSuccess('');
                }}
                className="font-bold text-green-700 hover:underline"
              >
                {isSignup ? 'Masuk' : 'Daftar di sini'}
              </button>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
