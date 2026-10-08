import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import SectionCashFlow from '../components/bi/SectionCashFlow.jsx';
import SectionProfitLoss from '../components/bi/SectionProfitLoss.jsx';
import SectionBalanceSheet from '../components/bi/SectionBalanceSheet.jsx';
import SectionRevenue from '../components/bi/SectionRevenue.jsx';
import { fetchBothJenis } from '../lib/bi/dataAccess.js';
import { buildDashboardViewModel } from '../lib/bi/viewModel.js';
import { mapAllSections } from '../lib/bi/mapping.js';
import { deduplicateRecords } from '../lib/bi/validation.js';
import useBIFilters from '../hooks/useBIFilters.js';
import { resolveDashboardSection } from '../lib/bi/constants.js';

/**
 * BI Dashboard — Main Page Orchestrator.
 * Section is driven by ?section= query param (controlled by sidebar).
 * Year/mode/month filters are driven by URL query params via useBIFilters hook.
 */
export default function BIDashboard() {
  const { user, role, fullName } = useAuth();
  const [searchParams] = useSearchParams();

  // Section from URL param (missing / invalid → first entry of DASHBOARD_SECTIONS)
  const activeTab = resolveDashboardSection(searchParams.get('section')).tab;

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [realisasiRaw, setRealisasiRaw] = useState(null);
  const [rkapRaw, setRkapRaw] = useState(null);

  // Available years (set from data)
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);

  // Derive latest month from data (for YTD default)
  const [latestMonth, setLatestMonth] = useState(8);

  // Global filters from URL
  const biFilters = useBIFilters({ availableYears, latestMonth });
  const { year: selectedYear, mode, month: ytdMonth, setYear: setSelectedYear, setMode } = biFilters;

  // Search term from AppShell (shared with Topbar)
  const { searchTerm, setBIFilters } = useOutletContext() || {};

  // Register biFilters with AppShell so Topbar can render controls
  useEffect(() => {
    if (setBIFilters) setBIFilters(biFilters);
    return () => { if (setBIFilters) setBIFilters(null); };
  }, [setBIFilters, biFilters]);

  // Derived View Model (from Realisasi data)
  const [viewModel, setViewModel] = useState(null);

  // Mapped & deduped records for multi-year helpers
  const [sectionRecords, setSectionRecords] = useState({ realisasi: {}, rkap: {} });

  // Chart row element (callback ref → the observer re-attaches after loading
  // and on section switch, when the sticky chart row is re-mounted)
  const [chartRowEl, setChartRowEl] = useState(null);
  // Chart collapse state
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  // Viewport height check
  const [isShortViewport, setIsShortViewport] = useState(false);

  // Determine if charts should be sticky (not on short viewports)
  const chartSticky = !isShortViewport && !chartsCollapsed;

  // Measure the sticky chart row (border-box = card + the --card-gap strips above
  // and below it) and expose it as --chart-row-h for the table header offset.
  // Not sticky → 0, so the table header sticks right under the top bar.
  useEffect(() => {
    const root = document.documentElement;
    if (!chartRowEl || !chartSticky) {
      root.style.setProperty('--chart-row-h', '0px');
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        // ceil: never leave a sub-pixel slit between the chart row and the table header
        root.style.setProperty('--chart-row-h', `${Math.ceil(h)}px`);
      }
    });
    observer.observe(chartRowEl);
    return () => { observer.disconnect(); root.style.setProperty('--chart-row-h', '0px'); };
  }, [chartRowEl, chartSticky]);

  // Viewport height check
  useEffect(() => {
    const check = () => setIsShortViewport(window.innerHeight < 800);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch both jenis on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const { realisasi, rkap, years } = await fetchBothJenis();

        setRealisasiRaw(realisasi);
        setRkapRaw(rkap);

        if (years.length > 0) {
          setAvailableYears(years);
          // Derive latest month from data (raw data uses 'bulan' format 'YYYYMM')
          const latestYear = years[0];
          let maxMonth = 1;
          for (const sectionKey of ['LR', 'CF', 'BS', 'REV']) {
            if (Array.isArray(realisasi[sectionKey])) {
              for (const r of realisasi[sectionKey]) {
                if (r.bulan && String(r.bulan).startsWith(String(latestYear))) {
                  const m = parseInt(String(r.bulan).slice(4, 6), 10);
                  if (m >= 1 && m <= 12 && m > maxMonth) {
                    maxMonth = m;
                  }
                }
              }
            }
          }
          setLatestMonth(maxMonth);
        }

        // Map & dedupe both datasets for multi-year helpers
        const mapAndDedupe = (rawData) => {
          const mapped = mapAllSections(rawData);
          const result = {};
          for (const [key, { mapped: m }] of Object.entries(mapped)) {
            const { deduped } = deduplicateRecords(m);
            result[key] = deduped;
          }
          return result;
        };

        setSectionRecords({
          realisasi: mapAndDedupe(realisasi),
          rkap: mapAndDedupe(rkap),
        });

      } catch (err) {
        console.error("Failed to fetch BI data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Rebuild view model when filters or raw data change
  useEffect(() => {
    if (!realisasiRaw) return;
    try {
      const vm = buildDashboardViewModel(realisasiRaw, selectedYear, mode);
      setViewModel(vm);
    } catch (err) {
      console.error("Error building view model:", err);
      setError("Gagal memproses data visualisasi.");
    }
  }, [realisasiRaw, selectedYear, mode]);

  if (loading && !viewModel) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2FA84A] mx-auto"></div>
          <p className="text-gray-500 mt-4 text-sm">Memuat data dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl border border-red-200 text-center max-w-md w-full shadow-sm">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Gagal Memuat Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#2FA84A] text-white rounded-lg hover:bg-[#268F3E] transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // Get the correct records for active section
  const getRecords = (sectionKey) => sectionRecords.realisasi[sectionKey] || [];
  const getRkapRecords = (sectionKey) => sectionRecords.rkap[sectionKey] || [];

  return (
    <main className="flex-1 w-full mx-auto px-4 sm:px-6 pb-12">

      {/* Loading overlay for filter changes */}
      {loading && (
        <div className="fixed top-16 right-6 z-50 bg-white shadow-lg rounded-full px-4 py-2 flex items-center space-x-2 border border-gray-100">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#2FA84A]"></div>
          <span className="text-sm font-medium text-gray-600">Memperbarui...</span>
        </div>
      )}

      {/* Content Area */}
      {viewModel && (
        <div className="animate-fade-in">
          {activeTab === 'CF' && (
            <SectionCashFlow
              data={viewModel.cashFlow}
              allRecords={getRecords('CF')}
              rkapRecords={getRkapRecords('CF')}
              years={availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              searchTerm={searchTerm}
              mode={mode}
              onModeChange={setMode}
              ytdMonth={ytdMonth}
              onYtdMonthChange={biFilters.setMonth}
              chartRowRef={setChartRowEl}
              chartsCollapsed={chartsCollapsed}
              onToggleCharts={() => setChartsCollapsed(c => !c)}
              chartSticky={chartSticky}
              isShortViewport={isShortViewport}
            />
          )}
          {activeTab === 'LR' && (
            <SectionProfitLoss
              data={viewModel.profitLoss}
              allRecords={getRecords('LR')}
              rkapRecords={getRkapRecords('LR')}
              years={availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              searchTerm={searchTerm}
              mode={mode}
              onModeChange={setMode}
              ytdMonth={ytdMonth}
              onYtdMonthChange={biFilters.setMonth}
              chartRowRef={setChartRowEl}
              chartsCollapsed={chartsCollapsed}
              onToggleCharts={() => setChartsCollapsed(c => !c)}
              chartSticky={chartSticky}
              isShortViewport={isShortViewport}
            />
          )}
          {activeTab === 'BS' && (
            <SectionBalanceSheet
              data={viewModel.balanceSheet}
              allRecords={getRecords('BS')}
              rkapRecords={getRkapRecords('BS')}
              years={availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              searchTerm={searchTerm}
              mode={mode}
              onModeChange={setMode}
              ytdMonth={ytdMonth}
              onYtdMonthChange={biFilters.setMonth}
              chartRowRef={setChartRowEl}
              chartsCollapsed={chartsCollapsed}
              onToggleCharts={() => setChartsCollapsed(c => !c)}
              chartSticky={chartSticky}
              isShortViewport={isShortViewport}
            />
          )}
          {activeTab === 'REV' && (
            <SectionRevenue
              data={viewModel.revenue}
              allRecords={getRecords('REV')}
              rkapRecords={getRkapRecords('REV')}
              years={availableYears}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              searchTerm={searchTerm}
              mode={mode}
              onModeChange={setMode}
              ytdMonth={ytdMonth}
              onYtdMonthChange={biFilters.setMonth}
              chartRowRef={setChartRowEl}
              chartsCollapsed={chartsCollapsed}
              onToggleCharts={() => setChartsCollapsed(c => !c)}
              chartSticky={chartSticky}
              isShortViewport={isShortViewport}
            />
          )}

          {/* Debug info in development */}
          {import.meta.env.DEV && viewModel.meta.totalUnmapped > 0 && (
            <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-bold text-yellow-800 mb-2">Development Warning: Unmapped Items</h4>
              <p className="text-xs text-yellow-700">
                Terdapat {viewModel.meta.totalUnmapped} record yang tidak memiliki mapping (lihat console).
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

