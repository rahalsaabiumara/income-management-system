import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

/**
 * AppShell — Wraps all authenticated pages with a sidebar + top bar layout.
 *
 * Uses window scroll only — no internal overflow scroll containers.
 * The Outlet renders the page content inside the main area.
 *
 * Search state is lifted here so both Topbar and BIDashboard share it.
 * BI filter state (year, mode, month) is managed by useBIFilters hook
 * inside BIDashboard and passed up via biFiltersRef for Topbar to consume.
 */
export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [biFilters, setBIFilters] = useState(null);
  const location = useLocation();

  // Only show search on BI Dashboard
  const showSearch = location.pathname === '/bi-dashboard';

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileToggle={setMobileOpen}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Topbar
          searchTerm={showSearch ? searchTerm : undefined}
          onSearch={showSearch ? setSearchTerm : undefined}
          onMobileMenuToggle={() => setMobileOpen(prev => !prev)}
          biFilters={showSearch ? biFilters : null}
        />

        {/* Page content — rendered by React Router's Outlet */}
        <Outlet context={{ searchTerm, onSearch: setSearchTerm, setBIFilters }} />
      </div>
    </div>
  );
}
