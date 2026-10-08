/**
 * depthColors.js — Single source of truth for hierarchy depth-based coloring.
 *
 * Unified across all BI sections (ProfitLoss, BalanceSheet, CashFlow).
 * Depth assignment is flexible per section — not all sections use all depths.
 */

/**
 * Accent bar colors by depth level.
 * Leaf rows (hasChildren=false AND accent=false) get no accent bar.
 */
export const DEPTH_COLORS = {
  0: '#DC2626',  // depth 0 — root
  1: '#2FA84A',  // depth 1
  2: '#E0A83C',  // depth 2
  3: '#2389C4',  // depth 3
  4: '#8B5CF6',  // depth 4
  5: '#8E9CA3',  // depth 5
};

/**
 * Compute a row-tint background color for accented rows.
 * Uses the depth's base color at ~8% opacity, resulting in a subtle tint
 * that matches Figma reference (depth0≈#F2FBF6, depth1≈#EFF9F1, etc).
 *
 * @param {number} depth - hierarchy depth level
 * @returns {string|null} rgba color string, or null if depth has no color
 */
export function getDepthTint(depth) {
  const color = DEPTH_COLORS[depth];
  if (!color) return null;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}
