import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * BIHeader — Shared header for all pages.
 */
export default function BIHeader({ activePage, searchTerm = '', onSearch, user, fullName, role, onLogout }) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayName = fullName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  // Role Badge Color
  let roleBadgeColor = 'bg-gray-400 text-white'; // default User
  if (role === 'ADMIN') roleBadgeColor = 'bg-[#ADD3E8] text-[#0B3E1F]';
  if (role === 'KEUANGAN') roleBadgeColor = 'bg-[#7DC88F] text-[#0B3E1F]';

  return (
    <header className="sticky top-0 z-50 bg-[#0B3E1F] w-full shadow-md">
      <div className="w-full flex items-center justify-between h-14 px-4 sm:px-6">
        {/* Left: Logo + Title + Role Badge */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain drop-shadow-sm" />
          <div className="hidden sm:flex items-center gap-2">
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Income Statement</h1>
              <p className="text-[10px] text-slate-300 leading-tight uppercase tracking-wider">LPP AGRO NUSANTARA</p>
            </div>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ml-1 ${roleBadgeColor}`}>
              {role}
            </span>
          </div>
        </div>

        {/* Center: Navigation Pills */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-2 z-10 pointer-events-auto">
          <button
            onClick={() => navigate('/bi-dashboard')}
            className={`px-3 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${activePage === 'dashboard'
              ? 'bg-[#2FA84A] text-white shadow-md shadow-green-900/30'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className={`px-3 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${activePage === 'dokumen'
              ? 'bg-[#2FA84A] text-white shadow-md shadow-green-900/30'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
          >
            Dokumen
          </button>

          {role !== 'USER' && (
            <button
              onClick={() => navigate('/keuangan')}
              className={`px-3 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${activePage === 'review'
                ? 'bg-[#2FA84A] text-white shadow-md shadow-green-900/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              Review
            </button>
          )}
        </div>

        {/* Right: Search + Notification + User */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Search */}
          {onSearch && (
            <div className="relative hidden lg:block">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cari Uraian..."
                value={searchTerm}
                onChange={(e) => onSearch(e.target.value)}
                className="w-56 lg:w-64 pl-9 pr-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-sm text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#2FA84A]/50 focus:bg-white/20 transition-all"
              />
            </div>
          )}

          {/* Admin Notification Bell */}
          {role === 'ADMIN' && (
            <button className="relative p-1.5 text-slate-300 hover:text-white transition-colors rounded-full hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {/* Dummy red badge for admin */}
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#0B3E1F]"></span>
            </button>
          )}

          {/* User Info */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-2 py-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#2FA84A] flex items-center justify-center text-white text-sm font-bold shadow-inner">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[100px]">{displayName.toUpperCase()}</p>
                <p className="text-[10px] text-slate-300 leading-tight uppercase">{role}</p>
              </div>
            </button>

            {/* Dropdown */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fade-in">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-800 truncate">{displayName}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setShowMenu(false); onLogout(); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
