import React, { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { formatCompact, formatFull } from '../../lib/bi/calculations.js';
import { TypeIcon, Sparkline } from './TypeKpiStrip.jsx';

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function renderFmtStatic(str) {
  if (typeof str !== 'string') return str;
  const match = str.match(/^(.*?)(Rb|Jt|M|T)$/);
  if (match) return <>{match[1]}<span className="text-[0.8em]">{match[2]}</span></>;
  return str;
}

/* ═══════════════════════════════════════════════════════════════════
   Mini Donut Chart (SVG)
   ═══════════════════════════════════════════════════════════════════ */

function MiniDonut({ segments, size = 48, strokeWidth = 5, centerLabel, centerSub, variant = 'normal' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  const isHighlight = variant === 'highlight';

  let accumulated = 0;
  const arcs = segments.map((seg, i) => {
    const pct = Math.max(0, Math.min(seg.percent, 100));
    const dashLen = (pct / 100) * circumference;
    const gap = circumference - dashLen;
    const offset = -((accumulated / 100) * circumference) + circumference * 0.25;
    accumulated += pct;
    return { ...seg, dashLen, gap, offset, idx: i };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none"
          stroke={isHighlight ? 'rgba(255,255,255,0.15)' : '#F3F4F6'}
          strokeWidth={strokeWidth} />
        {arcs.map(arc => (
          <circle key={arc.idx} cx={cx} cy={cy} r={radius} fill="none"
            stroke={arc.color} strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dashLen} ${arc.gap}`}
            strokeDashoffset={arc.offset} strokeLinecap="round"
            style={{ animation: `donutGrow 0.8s ease-out ${arc.idx * 0.12}s both` }} />
        ))}
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[8px] font-bold leading-none ${isHighlight ? 'text-white' : 'text-gray-700'}`}>{centerLabel}</span>
          {centerSub && <span className={`text-[6px] mt-0.5 ${isHighlight ? 'text-white/50' : 'text-gray-400'}`}>{centerSub}</span>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Composition Bar (stacked horizontal)
   ═══════════════════════════════════════════════════════════════════ */

function CompositionBar({ items, isHighlight = false }) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((s, it) => s + Math.abs(it.value ?? 0), 0);
  if (total === 0) return null;

  return (
    <div className="w-full">
      <div className={`flex w-full h-2 rounded-full overflow-hidden ${isHighlight ? 'bg-white/15' : 'bg-gray-100'}`}>
        {items.map((it, i) => {
          const pct = (Math.abs(it.value ?? 0) / total) * 100;
          return (
            <div key={i} style={{ width: `${pct}%`, backgroundColor: it.color || 'rgba(255,255,255,0.4)' }}
              className="h-full transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full" />
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KPICard — Individual card (default export)
   ═══════════════════════════════════════════════════════════════════ */

export default function KPICard({
  label,
  value,
  rkap,
  prevYearLabel,
  trend,
  subItems,
  donutSegments,
  compositionItems,
  isHighlight = false,
  prefix = '',
  color = 'green',
  animDelay = 0,
  _isDrillable = false,
  accentColor,
  typeKey,
  sparkPoints,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50 + animDelay);
    return () => clearTimeout(t);
  }, [animDelay]);

  const fmt = (v) => typeof v === 'number' ? formatCompact(v, { prefix }) : (v ?? '-');
  const fmtFull = (v) => typeof v === 'number' ? `${prefix}${formatFull(v)}` : '';

  const renderFmt = (str) => {
    if (typeof str !== 'string') return str;
    const match = str.match(/^(.*?)(Rb|Jt|M|T)$/);
    if (match) return <>{match[1]}<span className="text-[0.8em]">{match[2]}</span></>;
    return str;
  };

  let achievement = null;
  if (typeof value === 'number' && typeof rkap === 'number' && rkap !== 0) {
    achievement = (Math.abs(value) / Math.abs(rkap)) * 100;
  }

  const gradMap = {
    green: 'from-emerald-600 to-green-800',
    blue: 'from-blue-600 to-cyan-800',
    gold: 'from-amber-500 to-yellow-700',
    red: 'from-red-500 to-rose-700',
  };

  const entryClass = mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4';

  /* ─── HIGHLIGHT Card ─── */
  if (isHighlight) {
    return (
      <div
        className={`px-3.5 py-3 rounded-xl relative overflow-hidden bg-gradient-to-br ${gradMap[color] || gradMap.green} text-white
          flex flex-col h-full
          transition-[transform,box-shadow] duration-200 ease-out ${entryClass} shadow-md hover:-translate-y-0.5 hover:shadow-xl`}
        title={fmtFull(value)}
      >
        <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
          {typeKey && <TypeIcon typeKey={typeKey} className="w-4 h-4 flex-shrink-0" />}
          <p className="text-[13px] font-semibold truncate text-white/90">{label}</p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex flex-col min-w-0 justify-center">
            <p className="text-[32px] font-bold tabular-nums leading-none truncate">{renderFmt(fmt(value))}</p>
            {typeof rkap === 'number' && (
              <p className="text-[13px] mt-1 tabular-nums truncate text-white/90">
                RKAP <span className="font-bold text-[14px] text-white">{renderFmt(fmt(rkap))}</span>
                {achievement !== null ? ` · ${achievement.toFixed(1)}%` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {sparkPoints && sparkPoints.length > 0 ? (
              <Sparkline points={sparkPoints} width={90} height={32} />
            ) : donutSegments && donutSegments.length > 0 ? (
              <MiniDonut segments={donutSegments} size={52} strokeWidth={4} variant="highlight"
                centerLabel={achievement != null ? `${achievement.toFixed(0)}%` : undefined} />
            ) : null}
            {trend != null && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${trend >= 0 ? 'bg-white/20' : 'bg-black/20'}`}>
                {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%{prevYearLabel ? ` vs ${prevYearLabel}` : ' YoY'}
              </span>
            )}
          </div>
        </div>

        {compositionItems && compositionItems.length > 0 && (
          <div className="mt-2.5">
            <CompositionBar items={compositionItems} isHighlight />
          </div>
        )}

      </div>
    );
  }

  /* ─── COMPACT (Secondary) Card ─── */
  return (
    <div
      className={`px-3 py-2.5 rounded-xl relative overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200
        transition-shadow duration-300 ${entryClass} flex flex-col min-w-0 h-full
        ${_isDrillable ? 'cursor-pointer group/drill' : ''}`}
      style={{
        background: accentColor ? `linear-gradient(${accentColor}0F, ${accentColor}0F), #fff` : '#fff',
      }}
      title={fmtFull(value)}
    >
      {accentColor && (
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />
      )}
      <div className="flex items-start justify-between gap-2 min-h-[2.5em]">
        <p className="text-[10px] font-medium text-gray-500 leading-snug line-clamp-2">{label}</p>
        {_isDrillable && (
          <svg className="w-3 h-3 text-gray-300 group-hover/drill:text-emerald-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        {donutSegments && donutSegments.length > 0 && (
          <MiniDonut segments={donutSegments} size={42} strokeWidth={4}
            centerLabel={achievement != null ? `${achievement.toFixed(0)}%` : undefined} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-lg font-bold tabular-nums truncate leading-tight"
            style={{ color: accentColor || '#111827' }}
          >
            {renderFmt(fmt(value))}
          </p>
          {typeof rkap === 'number' && (
            <div className="text-[9px] mt-0.5 text-gray-400">
              RKAP <span className="font-semibold text-gray-500">{renderFmt(fmt(rkap))}</span>
            </div>
          )}
        </div>
      </div>

      {trend != null && (
        <div className="mt-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${trend >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
        </div>
      )}

      {subItems && subItems.length > 0 && (
        <div className="mt-auto pt-2 space-y-0.5">
          {subItems.map((item, idx) => {
            const isStr = typeof item.value === 'string';
            const display = item.value == null ? '-' : (isStr ? item.value : fmt(item.value));
            return (
              <div key={idx} className="flex items-center justify-between text-[9px]">
                <span className="text-gray-400 truncate mr-2 flex items-center gap-1.5">
                  {item.color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                  {item.label}
                </span>
                <span className="text-gray-600 font-semibold tabular-nums flex-shrink-0">{renderFmt(display)}</span>
              </div>
            );
          })}
        </div>
      )}

      {compositionItems && compositionItems.length > 0 && (
        <div className="mt-auto pt-2">
          <CompositionBar items={compositionItems} isHighlight={false} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KPICardGroup — Simple 1-row layout for Revenue (no drill-down)
   ═══════════════════════════════════════════════════════════════════ */

export function KPICardGroup({ children }) {
  const [expanded, setExpanded] = useState(true);
  const childArray = React.Children.toArray(children);
  const highlight = childArray.find(c => c.props?.isHighlight);
  const secondaries = childArray.filter(c => !c.props?.isHighlight);

  return (
    <div className="flex gap-[var(--card-gap)] items-stretch transition-all duration-500 ease-out">
      <div
        className={`flex-shrink-0 transition-all duration-500 ease-out cursor-pointer ${expanded ? 'w-[280px] min-w-[280px]' : 'flex-1'}`}
        onClick={() => setExpanded(prev => !prev)}
      >
        {highlight && React.cloneElement(highlight, { _collapsed: !expanded })}
      </div>
      <div className={`flex gap-[var(--card-gap)] items-stretch transition-all duration-500 ease-out overflow-hidden ${expanded ? 'flex-1 opacity-100' : 'w-0 opacity-0'}`}>
        {secondaries.map((card, i) => (
          <div key={i} className="flex-1 min-w-0">{card}</div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KPICardDrilldown — Hierarchical drill-down with animations
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Auto-flatten: if a node has fewer than 3 children, expand grandchildren
 * to achieve 3-5 display cards.
 */
function getDisplayChildren(node) {
  const children = node.children || [];
  if (children.length === 0) return [];
  if (children.length >= 3) return children;

  const result = [];
  for (const child of children) {
    result.push(child);
    if (child.children?.length > 0 && result.length < 5) {
      for (const gc of child.children) {
        result.push(gc);
        if (result.length >= 5) break;
      }
    }
    if (result.length >= 5) break;
  }
  return result;
}

/**
 * Find the path (array of keys) from a root node down to targetKey.
 * Returns null if not found.
 */
function findRelativePath(node, targetKey) {
  for (const child of (node.children || [])) {
    if (child.key === targetKey) return [child.key];
    const deeper = findRelativePath(child, targetKey);
    if (deeper) return [child.key, ...deeper];
  }
  return null;
}

/**
 * Traverse tree by a path of keys and return the node at that path.
 */
function getNodeAtPath(root, keys) {
  let node = root;
  for (const key of keys) {
    const child = node.children?.find(c => c.key === key);
    if (!child) break;
    node = child;
  }
  return node;
}

export function KPICardDrilldown({ tree, getVal, getRkap, calcTrend, colors = {}, selectedYear }) {
  const [path, setPath] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const [animCounter, setAnimCounter] = useState(0);
  const animDirRef = useRef('right');

  const currentNode = useMemo(() => getNodeAtPath(tree, path), [tree, path]);
  const displayChildren = useMemo(() => getDisplayChildren(currentNode), [currentNode]);

  // For composition bar, use DISPLAY children (secondary cards)
  const compositionItems = useMemo(() =>
    displayChildren.map(c => ({
      label: c.label,
      value: getVal(c.key),
      color: colors[c.key] || '#94A3B8',
    })),
    [displayChildren, getVal, colors]
  );

  // Achievement %
  const achPct = useCallback((key) => {
    const v = Math.abs(getVal(key) ?? 0);
    const r = Math.abs(getRkap(key) ?? 1);
    return Math.min((v / r) * 100, 100);
  }, [getVal, getRkap]);

  // Drill into a child (or flattened grandchild)
  const drillInto = useCallback((childKey) => {
    // Find path from current node to the target key
    const relPath = findRelativePath(currentNode, childKey);
    if (!relPath) return;

    // Check that the target node has children (is drillable)
    const targetNode = getNodeAtPath(currentNode, relPath);
    if (!targetNode.children?.length) return;

    const doUpdate = () => {
      setPath(prev => [...prev, ...relPath]);
      setExpanded(true);
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(doUpdate);
      });
    } else {
      animDirRef.current = 'right';
      setAnimCounter(prev => prev + 1);
      doUpdate();
    }
  }, [currentNode]);

  // Navigate back
  const goBack = useCallback(() => {
    if (path.length === 0) return;

    const doUpdate = () => {
      setPath(prev => prev.slice(0, -1));
      setExpanded(true);
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(doUpdate);
      });
    } else {
      animDirRef.current = 'left';
      setAnimCounter(prev => prev + 1);
      doUpdate();
    }
  }, [path]);

  // Handle click on highlight card
  const handleHighlightClick = useCallback(() => {
    if (path.length > 0) {
      goBack();
    } else {
      const doUpdate = () => setExpanded(prev => !prev);
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          flushSync(doUpdate);
        });
      } else {
        doUpdate();
      }
    }
  }, [path.length, goBack]);

  // Determine animation class
  const animClass = animCounter > 0
    ? (animDirRef.current === 'right' ? 'kpi-drill-right' : 'kpi-drill-left')
    : '';

  // Is this the multi-row layout? (>5 children, e.g. Aset Lancar)
  const isMultiRow = displayChildren.length > 5;

  const sanitizeKey = (k) => `kpi-${k.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <div className="space-y-1">
      {/* Main content — animated on path change */}
      <div key={animCounter} className={document.startViewTransition ? '' : animClass}>
        <div className={`flex gap-2 ${isMultiRow ? 'items-start' : 'items-stretch'}`}>
          {/* Highlight card */}
          <div
            className={`flex-shrink-0 transition-all duration-500 ease-out cursor-pointer ${
              expanded ? 'w-[280px] min-w-[280px]' : 'flex-1'
            } ${isMultiRow ? 'self-start sticky top-[56px]' : ''}`}
            onClick={handleHighlightClick}
            style={{ viewTransitionName: sanitizeKey(currentNode.key) }}
          >
            <KPICard
              label={currentNode.label}
              value={getVal(currentNode.key)}
              rkap={getRkap(currentNode.key)}
              trend={calcTrend(currentNode.key)}
              prevYearLabel={`${selectedYear - 1}`}
              isHighlight
              color="green"
              animDelay={0}
              compositionItems={compositionItems}
              donutSegments={[{ percent: achPct(currentNode.key), color: 'rgba(255,255,255,0.8)' }]}
            />
          </div>

          {/* Secondary cards */}
          <div className={`transition-all duration-500 ease-out overflow-hidden ${
            expanded ? 'flex-1 opacity-100' : 'w-0 opacity-0'
          }`}>
            {isMultiRow ? (
              /* Grid layout for many children (e.g. Aset Lancar with 9 items) */
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {displayChildren.map((child, i) => {
                  const isDrillable = !!(child.children?.length);
                  const childDisplay = isDrillable ? getDisplayChildren(child) : [];
                  const childCompItems = isDrillable ? childDisplay.map(c => ({
                    label: c.label,
                    value: getVal(c.key),
                    color: colors[c.key] || '#2FA84A',
                  })) : undefined;
                  return (
                    <div
                      key={child.key}
                      onClick={(e) => { e.stopPropagation(); if (isDrillable) drillInto(child.key); }}
                      style={{ viewTransitionName: sanitizeKey(child.key) }}
                    >
                      <KPICard
                        label={child.label}
                        value={getVal(child.key)}
                        rkap={getRkap(child.key)}
                        trend={calcTrend(child.key)}
                        animDelay={60 + i * 40}
                        _isDrillable={isDrillable}
                        compositionItems={childCompItems}
                        donutSegments={[{
                          percent: achPct(child.key),
                          color: colors[child.key] || '#94A3B8',
                        }]}
                        accentColor={colors[child.key]}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flex layout for 2-5 children */
              <div className="flex gap-2 items-stretch h-full">
                {displayChildren.map((child, i) => {
                  const isDrillable = !!(child.children?.length);
                  const childDisplay = isDrillable ? getDisplayChildren(child) : [];
                  const childCompItems = isDrillable ? childDisplay.map(c => ({
                    label: c.label,
                    value: getVal(c.key),
                    color: colors[c.key] || '#2FA84A',
                  })) : undefined;
                  // Show sub-items for leaf nodes that have no further children
                  const subItems = !isDrillable && child.children?.length
                    ? child.children.map(gc => ({ label: gc.label, value: getVal(gc.key), color: colors[gc.key] || '#94A3B8' }))
                    : undefined;
                  return (
                    <div
                      key={child.key}
                      className="flex-1 min-w-0"
                      onClick={(e) => { e.stopPropagation(); if (isDrillable) drillInto(child.key); }}
                      style={{ viewTransitionName: sanitizeKey(child.key) }}
                    >
                      <KPICard
                        label={child.label}
                        value={getVal(child.key)}
                        rkap={getRkap(child.key)}
                        trend={calcTrend(child.key)}
                        animDelay={60 + i * 40}
                        _isDrillable={isDrillable}
                        compositionItems={childCompItems}
                        subItems={subItems}
                        donutSegments={[{
                          percent: achPct(child.key),
                          color: colors[child.key] || '#94A3B8',
                        }]}
                        accentColor={colors[child.key]}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
