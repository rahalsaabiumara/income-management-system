/**
 * colorShades.js — Generate distinguishable shades of a base color.
 *
 * Used by the Annual Performance Breakdown chart: every uraian inside one
 * type (e.g. Pengeluaran) gets its own shade of the type's base color.
 */

function hexToRgb(hex) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToHex({ h, s, l }) {
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Generate `n` shades of `baseHex`, ordered dark → light.
 * n = 1 returns the base color unchanged. The lightness spread grows with n
 * (capped) and is centered on the base color's lightness, clamped so the
 * darkest/lightest shades stay readable on a white background.
 *
 * @param {string} baseHex - e.g. '#2FA84A'
 * @param {number} n - number of shades
 * @returns {string[]} hex colors
 */
export function generateShades(baseHex, n) {
  if (!n || n <= 0) return [];
  if (n === 1) return [String(baseHex).toUpperCase()];

  const { h, s, l } = rgbToHsl(hexToRgb(baseHex));
  const MIN_L = 0.2;
  const MAX_L = 0.82;
  const span = Math.min(MAX_L - MIN_L, 0.14 * (n - 1));

  let start = l - span / 2;
  let end = l + span / 2;
  if (start < MIN_L) { end += MIN_L - start; start = MIN_L; }
  if (end > MAX_L) { start -= end - MAX_L; end = MAX_L; }
  start = Math.max(MIN_L, start);

  return Array.from({ length: n }, (_, i) => {
    const li = start + ((end - start) * i) / (n - 1);
    return hslToHex({ h, s, l: li });
  });
}
