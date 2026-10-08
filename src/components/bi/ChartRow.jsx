import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ChartRow — the (sticky) chart row shared by every BI section.
 *
 * Renders ONE card (one border / radius / shadow) with two panes at a fixed
 * 6 : 4 ratio — line chart on the left, bar chart on the right — separated by
 * a thin vertical divider (see .bi-chart-card in index.css).
 *
 * Spacing: the row owns the --card-gap strips above and below the card
 * (.bi-chart-row = padding-block + negative margin-block), so the visible gap
 * stays --card-gap. While stuck under the top bar the row gets the opaque page
 * background, covering both strips so scrolling table rows never show through.
 * Its border-box height is measured by BIDashboard (ResizeObserver) and
 * exposed as --chart-row-h for the table header sticky offset.
 *
 * Props:
 *   chartRowRef: callback ref (or ref object) for the measured row element
 *   chartsCollapsed: boolean — show the slim "Charts disembunyikan" bar
 *   onToggleCharts: () => void
 *   chartSticky: boolean — sticky under the top bar (false on short viewports / collapsed)
 *   isShortViewport: boolean — hides the collapse / expand controls
 *   left: ReactNode — line chart pane content
 *   right: ReactNode — bar chart pane content
 */
export default function ChartRow({ chartRowRef, chartsCollapsed, onToggleCharts, chartSticky, isShortViewport, left, right }) {
  const elRef = useRef(null);
  const [stuck, setStuck] = useState(false);

  const setRefs = useCallback((el) => {
    elRef.current = el;
    if (typeof chartRowRef === 'function') chartRowRef(el);
    else if (chartRowRef) chartRowRef.current = el;
  }, [chartRowRef]);

  // Opaque background only while actually stuck: at its natural position the
  // top strip stays transparent, so the KPI cards' shadow is not cut off.
  useEffect(() => {
    if (!chartSticky) { setStuck(false); return undefined; }
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = elRef.current;
      if (!el) return;
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= stickyTop + 0.5);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [chartSticky]);

  return (
    <div
      ref={setRefs}
      className={`bi-chart-row ${chartSticky ? 'sticky z-[45]' : ''} ${chartSticky && stuck ? 'bg-gray-50' : ''}`}
      style={chartSticky ? { top: 'var(--topbar-h)' } : undefined}
    >
      {chartsCollapsed ? (
        <div className="flex items-center justify-between px-4 py-2 bg-white border border-[#E5E7EB] rounded-xl">
          <span className="text-xs font-semibold text-gray-500">Charts disembunyikan</span>
          {!isShortViewport && (
            <button id="chart-row-expand" onClick={onToggleCharts} className="text-xs font-semibold text-[#2FA84A] hover:underline">Tampilkan</button>
          )}
        </div>
      ) : (
        <div className="bi-chart-card relative bg-white rounded-2xl border border-[#E5E7EB] shadow-sm">
          <div className="bi-chart-pane">{left}</div>
          <div className="bi-chart-pane">{right}</div>
          {!isShortViewport && (
            // Collapse handle sits on the card's bottom edge (inside the row's
            // bottom gap strip) so it adds no height to the row.
            <button
              id="chart-row-collapse"
              type="button"
              onClick={onToggleCharts}
              title="Ringkas chart"
              className="absolute left-1/2 -translate-x-1/2 -bottom-2.5 z-10 flex items-center gap-1 h-5 px-2.5 rounded-full bg-white border border-[#E5E7EB] shadow-sm text-[10px] font-semibold text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              Ringkas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
