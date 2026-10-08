import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { formatCompact, formatFull } from '../../lib/bi/calculations.js';

/**
 * TypeKpiStrip — two-level, type-based KPI strip (Profit Loss, Cash Flow,
 * Balance Sheet). Level 1 = one gradient card per type; level 2 = the type's
 * leaf ("sub uraian") cards next to the opened type card.
 *
 * Animation re-uses the existing KPI mechanism (KPICardDrilldown):
 * View Transitions API (document.startViewTransition + flushSync) with a
 * view-transition-name per card. The primary card's move to the left is the
 * native FLIP of the transition group; the shrink of the other primaries and
 * the slide of the secondary cards out from behind the opened card are driven
 * on the transition pseudo-elements (Web Animations). Browsers without View
 * Transitions fall back to a CSS keyframe slide-in (like the old kpi-drill-*).
 */

const DURATION = 420;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // ease-out
const STAGGER = 40;

/* ─── Helpers ─────────────────────────────────────────────────── */

function renderFmt(str) {
  if (typeof str !== 'string') return str;
  const match = str.match(/^(.*?)(Rb|Jt|M|T)$/);
  if (match) return <>{match[1]}<span className="text-[0.75em] ml-[1px]">{match[2]}</span></>;
  return str;
}
const fmt = (v) => (typeof v === 'number' ? formatCompact(v) : '-');
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** White sparkline; last point = solid dot without border. */
export function Sparkline({ points, width = 90, height = 36 }) {
  const valid = (points || []).filter(p => p.value !== null && p.value !== undefined);
  if (valid.length === 0) return <div style={{ width, height }} />;
  const n = points.length;
  const max = Math.max(...valid.map(p => p.value));
  const min = Math.min(...valid.map(p => p.value));
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => (n === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1));
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);

  // Connect the line flexibly even on missing months
  let seg = [];
  points.forEach((p, i) => {
    if (p.value !== null && p.value !== undefined) {
      seg.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    }
  });

  const lastIdx = points.map((p, i) => (p.value !== null && p.value !== undefined ? i : -1)).filter(i => i >= 0).pop();
  return (
    <svg width={width} height={height} className="flex-shrink-0 overflow-visible" aria-hidden="true">
      {seg.length > 0 && (
        <polyline points={seg.join(' ')} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {lastIdx >= 0 && (
        <circle cx={x(lastIdx)} cy={y(points[lastIdx].value)} r={2.8} fill="currentColor" />
      )}
    </svg>
  );
}

/** YoY badge on the gradient: white pill, dark green / dark red text. */
function YoyPill({ value, isInverted, color }) {
  if (value === null || value === undefined) {
    return <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${isInverted ? 'bg-gray-100 text-gray-500' : 'bg-white/[0.92] text-gray-600'}`}>-</span>;
  }
  const up = value >= 0;
  
  // When inverted, use lighter backgrounds with strong text, otherwise use standard pill
  let bgClass = 'bg-white/[0.92]';
  let textClass = up ? 'text-[#14532D]' : 'text-[#8A1C1C]';
  
  if (isInverted) {
    bgClass = up ? 'bg-emerald-100' : 'bg-red-100';
    textClass = up ? 'text-emerald-700' : 'text-red-700';
  }

  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums whitespace-nowrap ${bgClass} ${textClass}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** Small YoY badge for secondary cards (existing secondary style). */
function YoyBadge({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-[8px] font-bold px-1 py-0.5 rounded tabular-nums text-gray-500 bg-gray-50">-</span>;
  }
  return (
    <span className={`text-[8px] font-bold px-1 py-0.5 rounded tabular-nums ${value >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
      {value >= 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** Achievement ring (type color) with stroke-dashoffset draw animation. */
function ProgressRing({ percent, color, size = 46, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const has = percent !== null && percent !== undefined;
  const p = has ? Math.max(0, Math.min(percent, 100)) : 0;
  const offset = c * (1 - p / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
        {p > 0 && (
          <circle
            className="kpi-ring-arc"
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            style={{ '--ring-from': c }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-700 tabular-nums">
        {has ? `${percent.toFixed(0)}%` : '-'}
      </span>
    </div>
  );
}

/* ─── Icons ───────────────────────────────────────────────────── */

export function TypeIcon({ typeKey, className = "" }) {
  // Common sizes and stroke
  const props = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2,
    "aria-hidden": "true",
  };

  switch (typeKey) {
    case 'pendapatan':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'pengeluaran':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'bunga':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
        </svg>
      );
    case 'pajak':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case 'aset':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'liabilitas':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case 'ekuitas':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

/* ─── Level 1: type card ──────────────────────────────────────── */

function TypeCard({ type, pace, isOpen, regionId, onToggle, cardRef, vtName, hidden }) {
  const { from, to } = type.gradient;
  const hasRkap = type.rkap !== 0;
  const isInverted = type.key === 'bunga' || type.key === 'pajak';
  
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
  };
  
  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={hidden ? -1 : 0}
      aria-expanded={isOpen}
      aria-controls={regionId}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      title={typeof type.value === 'number' ? formatFull(type.value) : undefined}
      className={`kpi-type-card relative overflow-hidden rounded-xl px-3.5 py-3 flex flex-col cursor-pointer select-none
        transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${isInverted ? 'border border-gray-200 shadow-sm focus-visible:ring-gray-300' : 'text-white shadow-md focus-visible:ring-white focus-visible:ring-inset'}`}
      style={{
        display: hidden ? 'none' : undefined,
        order: isOpen ? -1 : undefined,
        flex: isOpen ? '0 0 clamp(250px, 24%, 300px)' : undefined,
        background: isInverted 
          ? '#ffffff' 
          : `radial-gradient(circle at 100% 0%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%), linear-gradient(135deg, ${from}, ${to})`,
        color: isInverted ? type.color : '#ffffff',
        viewTransitionName: vtName,
        viewTransitionClass: 'kpi-primary',
      }}
    >
      {/* a. header */}
      <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
        <TypeIcon typeKey={type.key} className="w-4 h-4 flex-shrink-0" />
        <span className="text-[13px] font-semibold truncate">{type.label}</span>
        <span className="text-[12px] whitespace-nowrap" style={{ color: isInverted ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)' }}>· {type.leaves.length} sub uraian</span>
        <svg
          className={`w-4 h-4 ml-auto flex-shrink-0 transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* b. main value + RKAP on left, sparkline + YoY on right */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex flex-col min-w-0 justify-center">
          <p className="text-[32px] font-bold tabular-nums leading-none truncate">{renderFmt(fmt(type.value))}</p>
          <p className="text-[13px] mt-1 tabular-nums truncate" style={{ color: isInverted ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }}>
            RKAP <span className="font-bold text-[14px]" style={{ color: isInverted ? type.color : '#ffffff' }}>{hasRkap ? renderFmt(fmt(type.rkap)) : '-'}</span> {type.achievement !== null ? ` · ${type.achievement.toFixed(1)}%` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Sparkline points={type.spark} width={76} height={28} />
          <YoyPill value={type.yoy} isInverted={isInverted} color={type.color} />
        </div>
      </div>

      {/* c. achievement bar + pace marker */}
      {type.achievement !== null && (
        <div className="relative h-1.5 mt-2 rounded-full" style={{ backgroundColor: isInverted ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.25)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(type.achievement, 100)}%`, backgroundColor: isInverted ? type.color : '#ffffff' }} />
          {pace !== null && (
            <div className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded" style={{ left: `calc(${pace}% - 1px)`, backgroundColor: isInverted ? type.color : 'rgba(255,255,255,0.7)' }} title={`Pace ${pace.toFixed(1)}%`} />
          )}
        </div>
      )}

      {/* d. insight */}
      {type.insight && (
        <p className="text-[12px] leading-snug mt-auto pt-1.5 line-clamp-2" style={{ color: isInverted ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)' }}>{type.insight}</p>
      )}
    </div>
  );
}

/* ─── Level 2: leaf card (existing secondary style) ───────────── */

function LeafCard({ leaf, color, enterClass, enterDelay }) {
  return (
    <div
      data-kpi-sec
      className={`px-3 py-2.5 rounded-xl relative overflow-hidden border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200
        transition-shadow duration-300 flex flex-col min-w-0 ${enterClass || ''}`}
      style={{
        flex: '1 0 156px',
        maxWidth: 260,
        scrollSnapAlign: 'start',
        background: `linear-gradient(${color}0F, ${color}0F), #fff`,
        animationDelay: enterClass ? `${enterDelay}ms` : undefined,
      }}
      title={typeof leaf.value === 'number' ? formatFull(leaf.value) : undefined}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} />
      <p className="text-[10px] font-medium text-gray-500 leading-snug line-clamp-2 min-h-[2.5em]">{leaf.name}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <ProgressRing percent={leaf.achievement} color={color} />
        <div className="min-w-0">
          <p className="text-lg font-bold tabular-nums text-gray-900 truncate leading-tight">{renderFmt(fmt(leaf.value))}</p>
          <p className="text-[9px] text-gray-400 truncate">RKAP <span className="text-gray-500 font-semibold">{renderFmt(fmt(leaf.rkap))}</span></p>
        </div>
      </div>
      <div className="mt-auto pt-1.5">
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(leaf.share ?? 0, 100)}%`, backgroundColor: color }} />
        </div>
        <div className="flex items-center justify-between mt-1 gap-1">
          <span className="text-[9px] text-gray-500 tabular-nums">porsi {leaf.share !== null ? `${leaf.share.toFixed(1)}%` : '-'}</span>
          <YoyBadge value={leaf.yoy} />
        </div>
      </div>
    </div>
  );
}

/* ─── Strip ───────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {{ pace: number|null, types: Array }} props.data - result of buildTypeKpis()
 * @param {string} props.sectionId - short id, used for unique view-transition names
 */
export default function TypeKpiStrip({ data, sectionId }) {
  const [openKey, setOpenKey] = useState(null);
  const [fallbackEnter, setFallbackEnter] = useState(false);
  const cardRefs = useRef({});
  const regionRef = useRef(null);
  const vtRef = useRef(null);

  const types = data?.types || [];
  const pace = data?.pace ?? null;
  const open = types.find(t => t.key === openKey) || null;
  const regionId = `kpi-sec-region-${sectionId}`;
  const vtNameOf = (key) => `kpi-${sectionId}-${key}`;

  /** Give visible secondary cards a transition name; returns their rects. */
  const nameVisibleSecondaries = useCallback(() => {
    const region = regionRef.current;
    if (!region) return [];
    const rr = region.getBoundingClientRect();
    const out = [];
    region.querySelectorAll('[data-kpi-sec]').forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.right <= rr.left || rect.left >= rr.right) return; // off-screen in the scroller
      const name = `kpi-${sectionId}-sec-${i}`;
      el.style.viewTransitionName = name;
      el.style.viewTransitionClass = 'kpi-secondary';
      out.push({ name, rect });
    });
    return out;
  }, [sectionId]);

  const clearSecondaryNames = () => {
    regionRef.current?.querySelectorAll('[data-kpi-sec]').forEach(el => {
      el.style.viewTransitionName = '';
      el.style.viewTransitionClass = '';
    });
  };

  const runTransition = useCallback((nextKey) => {
    const expanding = nextKey !== null;
    const pivotKey = expanding ? nextKey : openKey;
    if (!pivotKey) return;

    // Fallback: no View Transitions → CSS keyframe slide-in
    if (!document.startViewTransition) {
      setFallbackEnter(expanding);
      setOpenKey(nextKey);
      return;
    }

    vtRef.current?.skipTransition?.();
    const reduce = prefersReducedMotion();
    const root = document.documentElement;
    root.classList.add('kpi-vt');
    if (reduce) root.classList.add('kpi-vt-reduced');

    const others = types.map(t => t.key).filter(k => k !== pivotKey);
    const oldPivotRect = cardRefs.current[pivotKey]?.getBoundingClientRect();
    const leaving = expanding ? [] : nameVisibleSecondaries();
    let entering = [];

    const vt = document.startViewTransition(() => {
      flushSync(() => {
        setFallbackEnter(false);
        setOpenKey(nextKey);
      });
      if (expanding) entering = nameVisibleSecondaries();
    });
    vtRef.current = vt;

    vt.ready.then(() => {
      if (reduce) return;
      const anim = (pseudo, keyframes, opts) =>
        root.animate(keyframes, { pseudoElement: pseudo, easing: EASE, fill: 'both', ...opts });

      if (expanding) {
        // 1. other primaries shrink horizontally + fade
        others.forEach(k => anim(`::view-transition-old(${vtNameOf(k)})`,
          [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 0 }],
          { duration: 240 }));
        // 3. secondaries slide out from behind the opened card, staggered
        const newPivotRect = cardRefs.current[pivotKey]?.getBoundingClientRect();
        entering.forEach((s, i) => {
          const dx = (newPivotRect?.left ?? s.rect.left) - s.rect.left;
          anim(`::view-transition-new(${s.name})`,
            [{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
            { duration: 300, delay: Math.min(60 + i * STAGGER, DURATION - 300) });
        });
      } else {
        // reverse: secondaries slide back behind the card (last first)
        leaving.forEach((s, i) => {
          const dx = (oldPivotRect?.left ?? s.rect.left) - s.rect.left;
          anim(`::view-transition-old(${s.name})`,
            [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${dx}px)`, opacity: 0 }],
            { duration: 260, delay: Math.min((leaving.length - 1 - i) * STAGGER, 120) });
        });
        // other primaries grow back in
        others.forEach(k => anim(`::view-transition-new(${vtNameOf(k)})`,
          [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }],
          { duration: 240, delay: DURATION - 240 }));
      }
    }).catch(() => { });

    vt.finished.finally(() => {
      if (vtRef.current === vt) vtRef.current = null;
      root.classList.remove('kpi-vt', 'kpi-vt-reduced');
      clearSecondaryNames();
    });
  }, [openKey, types, nameVisibleSecondaries, sectionId]);

  const toggle = useCallback((key) => {
    if (vtRef.current) return; // Prevent spam clicking during transition to avoid STATUS_BREAKPOINT crash
    runTransition(openKey === key ? null : key);
  }, [openKey, runTransition]);

  // Escape closes; focus stays on the primary card
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const el = cardRefs.current[openKey];
      runTransition(null);
      el?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openKey, runTransition]);

  // Cleanup on unmount (e.g. switching section mid-transition)
  useEffect(() => () => {
    vtRef.current?.skipTransition?.();
    document.documentElement.classList.remove('kpi-vt', 'kpi-vt-reduced');
  }, []);

  if (types.length === 0) return null;

  const isOpen = !!open;
  return (
    <div className="kpi-type-strip -mx-1 px-1 pt-1 pb-2 -mb-2 overflow-x-auto overflow-y-hidden">
      <div
        style={{
          gap: 'var(--card-gap)',
          height: 'var(--kpi-row-h)',
          display: isOpen ? 'flex' : 'grid',
          gridTemplateColumns: isOpen ? undefined : `repeat(${types.length}, minmax(200px, 1fr))`,
          minWidth: isOpen ? undefined : `calc(${types.length * 200}px + ${types.length - 1} * var(--card-gap))`,
        }}
      >
        {types.map(type => (
          <TypeCard
            key={type.key}
            type={type}
            pace={pace}
            isOpen={openKey === type.key}
            hidden={isOpen && openKey !== type.key}
            regionId={regionId}
            vtName={vtNameOf(type.key)}
            cardRef={el => { cardRefs.current[type.key] = el; }}
            onToggle={() => toggle(type.key)}
          />
        ))}
        <div
          id={regionId}
          ref={regionRef}
          role="region"
          aria-label={open ? `Sub uraian ${open.label}` : 'Sub uraian'}
          hidden={!isOpen}
          className="kpi-sec-scroller overflow-x-auto overflow-y-hidden"
          style={{
            gap: 'var(--card-gap)',
            display: isOpen ? 'flex' : 'none',
            flex: '1 1 0',
            minWidth: 0,
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'thin',
          }}
        >
          {open && open.leaves.map((leaf, i) => (
            <LeafCard
              key={leaf.id}
              leaf={leaf}
              color={open.color}
              enterClass={fallbackEnter ? 'kpi-sec-enter' : ''}
              enterDelay={Math.min(i * STAGGER, 160)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
