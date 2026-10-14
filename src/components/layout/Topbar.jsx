import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { MobileMenuButton } from './Sidebar.jsx';
import { resolveDashboardSection } from '../../lib/bi/constants.js';
import { useReviewNotifications } from '../../hooks/useReviewNotifications.js';

const MODE_OPTIONS = [
  { key: 'annual', label: 'Annual' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'ytd', label: 'YTD' },
  { key: 'monthly', label: 'Monthly' },
];

const MONTH_SHORT = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Agu' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Okt' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Des' },
];

function AdminNotificationBell() {
  const { items, count, loading, error, refetch } = useReviewNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [prevCount, setPrevCount] = useState(count);
  const [announcement, setAnnouncement] = useState('');

  // Announce for screen readers when count changes
  useEffect(() => {
    if (count !== prevCount) {
      setAnnouncement(`Ada ${count} revisi menunggu`);
      setPrevCount(count);
    }
  }, [count, prevCount]);

  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHrs < 24) return `${diffHrs} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;
    return date.toLocaleDateString('id-ID');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Notifikasi, ${count} revisi menunggu`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full ring-2 ring-gray-50">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-[360px] sm:w-[380px] max-w-[calc(100vw-24px)] bg-white rounded-xl shadow-xl ring-1 ring-gray-200 z-[100] flex flex-col"
          role="menu"
        >
          <div className="px-4 py-3 border-b bg-gray-50/50 flex justify-between items-center rounded-t-xl shrink-0">
            <span className="text-sm font-bold text-gray-800">Notifikasi</span>
            {count > 0 && (
              <span className="text-[10px] font-semibold bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{count}</span>
            )}
          </div>
          
          <div className="overflow-y-auto max-h-[420px] flex flex-col">
            {loading && count === 0 ? (
              <div className="p-4 space-y-3">
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse w-full"></div>
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse w-full"></div>
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-red-500 font-medium mb-2">{error}</p>
                <button onClick={refetch} className="text-xs text-brand-600 hover:underline">Coba lagi</button>
              </div>
            ) : count === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center justify-center text-gray-400">
                <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">Tidak ada revisi yang menunggu</p>
              </div>
            ) : (
              items.slice(0, 5).map(item => {
                let linkTarget = `/keuangan?file=${item.fileId}`;
                if (item.sheets?.length > 0) linkTarget += `&sheet=${encodeURIComponent(item.sheets[0])}`;
                if (item.firstCommentId) linkTarget += `&comment=${item.firstCommentId}`;

                return (
                  <Link
                    key={item.fileId}
                    to={linkTarget}
                    onClick={() => setIsOpen(false)}
                    className="group relative px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-3 transition-colors block outline-none focus:bg-gray-50"
                    role="menuitem"
                  >
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          Revisi diperlukan
                        </span>
                      </div>
                      
                      <div className="font-semibold text-sm text-gray-900 truncate" title={item.fileName}>
                        {item.fileName}
                      </div>

                      {(item.commentCount > 0 || item.sheets?.length > 0) && (
                        <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1.5 truncate">
                          {item.commentCount > 0 && <span>{item.commentCount} komentar terbuka</span>}
                          {item.commentCount > 0 && item.sheets?.length > 0 && <span>·</span>}
                          {item.sheets?.length > 0 && <span className="truncate">{item.sheets.join(', ')}</span>}
                        </div>
                      )}

                      <div className="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold">{item.lastCommentBy}</span>
                        <span>·</span>
                        <span title={new Date(item.lastCommentAt).toLocaleString('id-ID')}>
                          {formatRelativeTime(item.lastCommentAt)}
                        </span>
                      </div>

                      {item.snippet && (
                        <div className="text-[11px] text-gray-600 mt-1 truncate italic">
                          "{item.snippet}"
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-2 text-gray-300 group-hover:text-brand-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          
          {count > 5 && (
            <div className="p-2 bg-gray-50 rounded-b-xl border-t shrink-0">
              <Link 
                to="/keuangan?status=REVISION_REQUESTED" 
                onClick={() => setIsOpen(false)}
                className="block text-center text-xs font-bold text-brand-600 hover:text-brand-700 py-2 rounded-lg hover:bg-brand-50 transition-colors"
                role="menuitem"
              >
                Lihat semua ({count})
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Topbar — sticky top bar inside the main content area.
 * Height matches --topbar-h (56px).
 *
 * Props:
 *   searchTerm: string
 *   onSearch: (val: string) => void
 *   onMobileMenuToggle: () => void
 *   biFilters: { year, mode, month, setYear, setMode, setMonth, availableYears } | null
 */
export default function Topbar({ searchTerm, onSearch, onMobileMenuToggle, biFilters }) {
  const { role } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isBIDashboard = location.pathname === '/bi-dashboard';

  // Build breadcrumb
  let breadcrumbs = [];
  if (isBIDashboard) {
    breadcrumbs = ['Dashboard', resolveDashboardSection(searchParams.get('section')).label];
  } else if (location.pathname === '/dashboard') {
    breadcrumbs = ['Dokumen'];
  } else if (location.pathname === '/keuangan') {
    breadcrumbs = ['Review'];
  }

  // ── Responsive: measure topbar width with ResizeObserver ──
  const topbarRef = useRef(null);
  const [topbarWidth, setTopbarWidth] = useState(1200);

  useEffect(() => {
    if (!topbarRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect?.width ?? entry.borderBoxSize?.[0]?.inlineSize ?? 1200;
        setTopbarWidth(Math.round(w));
      }
    });
    observer.observe(topbarRef.current);
    return () => observer.disconnect();
  }, []);

  // Responsive breakpoints (based on topbar width, not window)
  const isCompact = topbarWidth < 900;     // controls collapse into "Periode" popover
  const isNarrowSearch = topbarWidth < 1100; // search becomes icon
  const isNarrowBreadcrumb = topbarWidth < 700; // breadcrumb truncates

  // ── Search expand state (icon mode) ──
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);

  const handleSearchIconClick = useCallback(() => {
    setSearchExpanded(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const handleSearchBlur = useCallback(() => {
    // Delay to allow click events to register
    setTimeout(() => setSearchExpanded(false), 200);
  }, []);

  // ── Periode popover state (compact mode) ──
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef(null);
  const popoverBtnRef = useRef(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          popoverBtnRef.current && !popoverBtnRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') setPopoverOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [popoverOpen]);

  // ── Mode toggle keyboard navigation ──
  const handleModeKeyDown = useCallback((e) => {
    if (!biFilters) return;
    const idx = MODE_OPTIONS.findIndex(m => m.key === biFilters.mode);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = MODE_OPTIONS[(idx + 1) % MODE_OPTIONS.length];
      biFilters.setMode(next.key);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = MODE_OPTIONS[(idx - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length];
      biFilters.setMode(prev.key);
    }
  }, [biFilters]);

  // ── Build "Periode" button label ──
  const periodeLabel = biFilters ? (() => {
    const parts = [String(biFilters.year)];
    const modeLabels = { annual: 'Annual', quarterly: 'Quarterly', ytd: 'YTD', monthly: 'Monthly' };
    parts.push(modeLabels[biFilters.mode] || 'Annual');
    if (biFilters.mode === 'ytd') {
      const m = MONTH_SHORT.find(ms => ms.value === biFilters.month);
      if (m) parts.push(m.label);
    }
    return parts.join(' · ');
  })() : '';

  const showBIControls = isBIDashboard && biFilters;
  const isYTD = biFilters?.mode === 'ytd';

  return (
    <header
      ref={topbarRef}
      className="topbar sticky top-0 z-[55] flex items-center px-4 sm:px-6 border-b bg-gray-50"
      style={{ height: 'var(--topbar-h)', borderColor: '#E5E7EB' }}
    >
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <MobileMenuButton onClick={() => onMobileMenuToggle?.()} />
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-300">/</span>}
              <span
                className={`${i === breadcrumbs.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'} truncate`}
                style={isNarrowBreadcrumb && i === breadcrumbs.length - 1 ? { maxWidth: '100px' } : undefined}
              >
                {isNarrowBreadcrumb && i < breadcrumbs.length - 1 ? null : crumb}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* BI Controls — only on /bi-dashboard */}
      {showBIControls && (
        <>
          {/* Separator */}
          <div className="w-px h-6 bg-gray-200 mx-3 flex-shrink-0" />

          {isCompact ? (
            /* ── Compact: single "Periode" popover button ── */
            <div className="relative flex-shrink-0">
              <button
                ref={popoverBtnRef}
                onClick={() => setPopoverOpen(p => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                style={{ height: '32px' }}
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {periodeLabel}
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${popoverOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {popoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 p-4 min-w-[240px] z-[100] animate-fade-in"
                >
                  {/* Year */}
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tahun</label>
                  <select
                    value={biFilters.year}
                    onChange={(e) => biFilters.setYear(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/40 focus:border-[#2FA84A] mb-3"
                  >
                    {biFilters.availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>

                  {/* Mode */}
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Mode</label>
                  <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden mb-3">
                    {MODE_OPTIONS.map(m => (
                      <button
                        key={m.key}
                        onClick={() => biFilters.setMode(m.key)}
                        className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${biFilters.mode === m.key
                          ? 'bg-[#2FA84A] text-white'
                          : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Month — only for YTD */}
                  {biFilters.mode === 'ytd' && (
                    <>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Bulan YTD</label>
                      <select
                        value={biFilters.month}
                        onChange={(e) => biFilters.setMonth(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/40 focus:border-[#2FA84A]"
                      >
                        {MONTH_SHORT.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Full controls ── */
            <>
              {/* Year select */}
              <select
                id="topbar-year-select"
                value={biFilters.year}
                onChange={(e) => biFilters.setYear(Number(e.target.value))}
                className="flex-shrink-0 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/40 focus:border-[#2FA84A] transition-all"
                style={{ height: '32px' }}
              >
                {biFilters.availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              {/* Mode segmented control */}
              <div
                className="flex items-center rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 ml-2"
                role="radiogroup"
                aria-label="Mode periode"
                onKeyDown={handleModeKeyDown}
                style={{ height: '32px' }}
              >
                {MODE_OPTIONS.map(m => (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={biFilters.mode === m.key}
                    tabIndex={biFilters.mode === m.key ? 0 : -1}
                    onClick={() => biFilters.setMode(m.key)}
                    className={`px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#2FA84A]/50 focus-visible:ring-inset ${biFilters.mode === m.key
                      ? 'bg-[#2FA84A] text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* YTD month filter — animated slide-out */}
              <div
                className="topbar-ytd-month-wrapper flex-shrink-0"
                style={{
                  overflow: 'hidden',
                  maxWidth: isYTD ? '84px' : '0px',
                  opacity: isYTD ? 1 : 0,
                  marginLeft: isYTD ? '8px' : '-8px',
                  transition: 'max-width 250ms ease-out, opacity 250ms ease-out, margin-left 250ms ease-out',
                }}
                aria-hidden={!isYTD}
              >
                <select
                  id="topbar-ytd-month"
                  value={biFilters.month}
                  onChange={(e) => biFilters.setMonth(Number(e.target.value))}
                  tabIndex={isYTD ? 0 : -1}
                  className="px-2 py-1 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/40 transition-transform"
                  style={{
                    height: '32px',
                    borderColor: '#2FA84A',
                    color: '#2FA84A',
                    backgroundColor: 'white',
                    transform: isYTD ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 250ms ease-out',
                    minWidth: '68px',
                  }}
                >
                  {MONTH_SHORT.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </>
      )}

      {/* Flex spacer */}
      <div style={{ flex: '1 1 0', minWidth: 0 }} />

      {/* Right: search + notification bell */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Search */}
        {onSearch && (
          <>
            {isNarrowSearch && !searchExpanded ? (
              /* Icon-only search */
              <button
                onClick={handleSearchIconClick}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Cari"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            ) : (
              /* Expanded search input */
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari Uraian..."
                  value={searchTerm ?? ''}
                  onChange={(e) => onSearch(e.target.value)}
                  onBlur={isNarrowSearch ? handleSearchBlur : undefined}
                  className="w-56 lg:w-72 pl-9 pr-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/40 focus:border-[#2FA84A] transition-all"
                />
              </div>
            )}
          </>
        )}

        {/* Admin Notification Bell */}
        {role === 'ADMIN' && <AdminNotificationBell />}
      </div>
    </header>
  );
}
