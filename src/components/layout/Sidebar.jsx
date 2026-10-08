import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { DASHBOARD_SECTIONS, resolveDashboardSection } from '../../lib/bi/constants.js';

const LS_KEY = 'sidebar-expanded'; // persisted "pinned" (stay expanded) state
const HOVER_OPEN_DELAY = 120;  // ms before a hover expands the rail
const HOVER_CLOSE_DELAY = 180; // ms before leaving collapses it again

/** Clicks on these do their own action and never toggle the pin. */
const NO_PIN_SELECTOR = 'button, a, input, select, textarea, [role="button"], [data-no-pin]';

/** SVG icon helper — small inline icons */
const Icon = ({ d, className = '' }) => (
  <svg className={`w-5 h-5 flex-shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
  file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  checklist: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 19l-7-7 7-7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
};

export default function Sidebar({ onMobileToggle, mobileOpen }) {
  const { user, role, fullName, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Pinned (stay expanded) — persisted. Unpinned → rail that expands on hover.
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(LS_KEY) !== 'false'; } catch { return true; }
  });
  // Cursor (or keyboard focus) is inside the desktop sidebar
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef(null);
  const expanded = pinned || hovered;
  // Dashboard group open
  const [dashOpen, setDashOpen] = useState(location.pathname === '/bi-dashboard');
  // Flyout for rail mode
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef(null);
  const dashBtnRef = useRef(null);

  // Responsive: below 1280 default to rail (unpinned)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279px)');
    const handler = (e) => { if (e.matches) setPinned(false); };
    handler(mql);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Persist pinned
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(pinned)); } catch {}
  }, [pinned]);

  // Hover expand / collapse (small delays avoid flicker when the cursor just passes by)
  const clearHoverTimer = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  };
  useEffect(() => clearHoverTimer, []);

  const handleMouseEnter = () => {
    clearHoverTimer();
    if (pinned) { setHovered(true); return; }
    hoverTimer.current = setTimeout(() => setHovered(true), HOVER_OPEN_DELAY);
  };
  const handleMouseLeave = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setHovered(false), HOVER_CLOSE_DELAY);
  };
  // One click on an empty sidebar area pins it, another click unpins it
  // (it then collapses as soon as the cursor leaves the sidebar).
  const handleAsideClick = (e) => {
    if (e.target.closest?.(NO_PIN_SELECTOR)) return;
    clearHoverTimer();
    setHovered(true);
    setPinned(prev => !prev);
  };
  // Keyboard: expand while focus is inside the sidebar
  const handleFocus = () => { clearHoverTimer(); setHovered(true); };
  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false);
  };

  // Auto-open dashboard group when on bi-dashboard
  useEffect(() => {
    if (location.pathname === '/bi-dashboard') setDashOpen(true);
  }, [location.pathname]);

  // Close flyout on outside click / Escape
  useEffect(() => {
    if (!flyoutOpen) return;
    const handleClick = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target) && dashBtnRef.current && !dashBtnRef.current.contains(e.target)) {
        setFlyoutOpen(false);
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') setFlyoutOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [flyoutOpen]);

  const isRail = !expanded;
  const isBIDash = location.pathname === '/bi-dashboard';
  const isDokumen = location.pathname === '/dashboard';
  const isReview = location.pathname === '/keuangan';
  const activeSection = resolveDashboardSection(searchParams.get('section')).param;

  const displayName = fullName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  const roleBadgeClass = role === 'ADMIN' ? 'bg-[#ADD3E8] text-[#0B3E1F]'
    : role === 'KEUANGAN' ? 'bg-[#7DC88F] text-[#0B3E1F]'
    : 'bg-gray-400 text-gray-900';

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); } catch (e) { console.error(e); }
  };

  const navTo = useCallback((path) => {
    navigate(path);
    if (mobileOpen && onMobileToggle) onMobileToggle(false);
  }, [navigate, mobileOpen, onMobileToggle]);

  // Sidebar content (shared between desktop and mobile drawer)
  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 flex-shrink-0">
        <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain drop-shadow-sm flex-shrink-0" />
        {!isRail && (
          <div className="min-w-0 overflow-hidden">
            <h1 className="text-sm font-bold text-white leading-tight truncate">Income Statement</h1>
            <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--sidebar-text-secondary)' }}>LPP Agro Nusantara</p>
          </div>
        )}
      </div>

      <div className="h-px mx-3 flex-shrink-0" style={{ backgroundColor: 'var(--sidebar-divider)' }} />

      {/* Nav */}
      <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-2 py-3 space-y-1 min-h-0">

        {/* Dashboard group */}
        <div>
          <button
            ref={dashBtnRef}
            onClick={() => {
              if (isRail && !mobileOpen) {
                setFlyoutOpen(prev => !prev);
              } else {
                navTo('/bi-dashboard');
                setDashOpen(prev => !prev);
              }
            }}
            aria-expanded={dashOpen}
            aria-current={isBIDash && !isRail ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/50 ${
              isBIDash ? 'text-white' : ''
            }`}
            style={{
              backgroundColor: isBIDash ? 'var(--sidebar-parent-active)' : undefined,
              color: isBIDash ? '#fff' : 'var(--sidebar-text)',
            }}
            onMouseEnter={(e) => { if (!isBIDash) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
            onMouseLeave={(e) => { if (!isBIDash) e.currentTarget.style.backgroundColor = ''; }}
            title={isRail ? 'Dashboard' : undefined}
          >
            <Icon d={ICONS.dashboard} />
            {!isRail && (
              <>
                <span className="flex-1 text-left">Dashboard</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${dashOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.chevronRight} />
                </svg>
              </>
            )}
          </button>

          {/* Flyout for rail mode */}
          {isRail && flyoutOpen && !mobileOpen && (
            <div
              ref={flyoutRef}
              data-no-pin
              className="fixed z-[200] ml-1 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[180px] animate-fade-in"
              style={{ left: 'var(--sidebar-w-rail)', top: dashBtnRef.current?.getBoundingClientRect().top ?? 100 }}
            >
              <p className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Dashboard</p>
              {DASHBOARD_SECTIONS.map(s => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('section', s.param);
                const targetUrl = `/bi-dashboard?${nextParams.toString()}`;
                return (
                  <button
                    key={s.param}
                    onClick={() => { navTo(targetUrl); setFlyoutOpen(false); }}
                    aria-current={isBIDash && activeSection === s.param ? 'page' : undefined}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      isBIDash && activeSection === s.param ? 'text-[#2FA84A] font-semibold bg-green-50' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-items (expanded mode) */}
          {!isRail && dashOpen && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-3">
              {DASHBOARD_SECTIONS.map(s => {
                const isActive = isBIDash && activeSection === s.param;
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('section', s.param);
                const targetUrl = `/bi-dashboard?${nextParams.toString()}`;
                return (
                  <button
                    key={s.param}
                    onClick={() => navTo(targetUrl)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/50 ${
                      isActive ? 'text-white font-semibold' : ''
                    }`}
                    style={{
                      backgroundColor: isActive ? 'var(--sidebar-active)' : undefined,
                      color: isActive ? '#fff' : 'var(--sidebar-text-secondary)',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = ''; }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dokumen */}
        <button
          onClick={() => navTo('/dashboard')}
          aria-current={isDokumen ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/50`}
          style={{
            backgroundColor: isDokumen ? 'var(--sidebar-active)' : undefined,
            color: isDokumen ? '#fff' : 'var(--sidebar-text)',
          }}
          onMouseEnter={(e) => { if (!isDokumen) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
          onMouseLeave={(e) => { if (!isDokumen) e.currentTarget.style.backgroundColor = ''; }}
          title={isRail ? 'Dokumen' : undefined}
        >
          <Icon d={ICONS.file} />
          {!isRail && <span className="flex-1 text-left">Dokumen</span>}
        </button>

        {/* Review — Admin & Keuangan only */}
        {role !== 'USER' && (
          <button
            onClick={() => navTo('/keuangan')}
            aria-current={isReview ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/50`}
            style={{
              backgroundColor: isReview ? 'var(--sidebar-active)' : undefined,
              color: isReview ? '#fff' : 'var(--sidebar-text)',
            }}
            onMouseEnter={(e) => { if (!isReview) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
            onMouseLeave={(e) => { if (!isReview) e.currentTarget.style.backgroundColor = ''; }}
            title={isRail ? 'Review' : undefined}
          >
            <Icon d={ICONS.checklist} />
            {!isRail && <span className="flex-1 text-left">Review</span>}
          </button>
        )}
      </nav>

      <div className="flex-shrink-0 px-2 pb-2 space-y-1">
        <div className="h-px mx-1 mb-2" style={{ backgroundColor: 'var(--sidebar-divider)' }} />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-red-300 hover:bg-red-500/15 focus-visible:ring-2 focus-visible:ring-white/50"
          title={isRail ? 'Keluar' : undefined}
        >
          <Icon d={ICONS.logout} className="text-red-300" />
          {!isRail && <span>Keluar</span>}
        </button>

        {/* Profile block */}
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isRail ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-[#2FA84A] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          {!isRail && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{displayName}</p>
              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${roleBadgeClass}`}>
                {role}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Pin / unpin toggle — desktop only (same as clicking an empty sidebar area) */}
      <button
        onClick={() => { clearHoverTimer(); setHovered(true); setPinned(prev => !prev); }}
        className="hidden lg:flex items-center justify-center h-10 w-full border-t transition-colors duration-150 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/50"
        style={{ borderColor: 'var(--sidebar-divider)', color: 'var(--sidebar-text-secondary)' }}
        aria-label={pinned ? 'Lepas sematan sidebar' : 'Sematkan sidebar'}
        aria-pressed={pinned}
        title={pinned ? 'Lepas sematan (sidebar ringkas saat kursor keluar)' : 'Sematkan sidebar agar tetap terbuka'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={pinned ? ICONS.chevronLeft : ICONS.chevronRight} />
        </svg>
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — sits in the AppShell flex row, so its width (hover
          expand or pinned) pushes the topbar + page body, which reflow with it. */}
      <aside
        className="hidden lg:flex flex-col flex-shrink-0 sticky top-0 h-screen z-[60] overflow-hidden"
        style={{
          width: expanded ? 'var(--sidebar-w-expanded)' : 'var(--sidebar-w-rail)',
          backgroundColor: 'var(--sidebar-bg)',
          transition: 'width 200ms ease',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleAsideClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-pinned={pinned ? 'true' : 'false'}
      >
        {sidebarContent}
      </aside>

      {/* Mobile: hamburger button is in Topbar; drawer here */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => onMobileToggle?.(false)} />
          {/* Drawer */}
          <aside
            className="absolute top-0 left-0 bottom-0 flex flex-col overflow-visible"
            style={{ width: 'var(--sidebar-w-expanded)', backgroundColor: 'var(--sidebar-bg)' }}
          >
            {/* Close btn */}
            <button
              onClick={() => onMobileToggle?.(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 z-10"
            >
              <Icon d={ICONS.close} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

/** Export the mobile menu button for Topbar */
export function MobileMenuButton({ onClick }) {
  return (
    <button onClick={onClick} className="lg:hidden p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Buka menu">
      <Icon d={ICONS.menu} />
    </button>
  );
}
