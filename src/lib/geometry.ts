/** Simple 2D point. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * Sample points along an SVG path string using the browser's native path
 * API (supports M/L/C/S/Q/T/A commands).
 */
export function samplePath(d: string, n = 400): Pt[] {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'path');
  el.setAttribute('d', d);
  el.style.position = 'absolute';
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const pts: Pt[] = [];
  const len = el.getTotalLength();
  if (len > 0) {
    for (let k = 0; k <= n; k++) {
      const p = el.getPointAtLength((len * k) / n);
      pts.push({ x: p.x, y: p.y });
    }
  }
  el.remove();
  return pts;
}

/** Axis-aligned bounding box of a point list. */
export function bbox(pts: Pt[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Build a closed outline from a half outline: mirror it horizontally around
 * the vertical axis through the midpoint of its start/end points.
 */
export function buildOutline(d: string): Pt[] {
  const half = samplePath(d);
  if (half.length < 2) return [];
  const axis = (half[0].x + half[half.length - 1].x) / 2;
  const mir = half
    .slice()
    .reverse()
    .map((p) => ({ x: 2 * axis - p.x, y: p.y }));
  return half.concat(mir);
}

/** Mirror a point list horizontally around its own bounding-box center. */
export function mirrorX(pts: Pt[]): Pt[] {
  if (!pts.length) return pts;
  const { minX, maxX } = bbox(pts);
  const c = (minX + maxX) / 2;
  return pts.map((p) => ({ x: 2 * c - p.x, y: p.y }));
}
