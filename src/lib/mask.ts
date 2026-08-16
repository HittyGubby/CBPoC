import type { Pt } from './geometry';

/** Binary mask rasterized from a point list (points in absolute device px). */
export interface Mask {
  data: Uint8Array; // 0/1 per pixel
  w: number;
  h: number;
  /** bbox top-left in device px (same space as the input points). */
  origin: Pt;
}

/** Rasterize a closed point list into a binary mask via an offscreen canvas fill. */
export function rasterizeMask(pts: Pt[]): Mask | null {
  if (pts.length < 3) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const x0 = Math.floor(minX);
  const y0 = Math.floor(minY);
  const x1 = Math.ceil(maxX);
  const y1 = Math.ceil(maxY);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return null;

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cctx = cv.getContext('2d');
  if (!cctx) return null;
  const path = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    if (i === 0) path.moveTo(q.x - x0, q.y - y0);
    else path.lineTo(q.x - x0, q.y - y0);
  }
  path.closePath();
  cctx.fillStyle = '#fff';
  cctx.fill(path);
  const md = cctx.getImageData(0, 0, w, h).data;
  // 0/255 so the value maps directly to an ALPHA texture (1.0 alpha in the shader).
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = md[i * 4] > 127 ? 255 : 0;
  return { data, w, h, origin: { x: x0, y: y0 } };
}

/** A stroke ring derived from a mask: pixels within `radius` px of the boundary. */
export interface Ring {
  data: Uint8Array; // 0/255 per pixel
  w: number;
  h: number;
  /** Extra border added around the original mask (px). */
  margin: number;
}

/**
 * Build a "centered stroke ring" texture from a binary mask:
 * every pixel whose chamfer distance to the mask boundary is ≤ radius
 * becomes opaque. The output canvas is padded by `margin = ceil(radius)`
 * so the outer half of the stroke has room outside the mask bbox.
 */
export function buildRing(mask: Mask, radius: number): Ring {
  const m = Math.max(1, Math.ceil(radius));
  const w2 = mask.w + 2 * m;
  const h2 = mask.h + 2 * m;
  const ext = new Uint8Array(w2 * h2);
  for (let j = 0; j < mask.h; j++) {
    const src = j * mask.w;
    const dst = (j + m) * w2 + m;
    ext.set(mask.data.subarray(src, src + mask.w), dst);
  }

  // Chamfer distance transform (3-4 weights) on the extended binary field.
  const INF = 1e9;
  const dist = new Float32Array(w2 * h2).fill(INF);
  for (let j = 0; j < h2; j++) {
    for (let i = 0; i < w2; i++) {
      const idx = j * w2 + i;
      const v = ext[idx];
      const boundary =
        (i > 0 && ext[idx - 1] !== v) ||
        (i < w2 - 1 && ext[idx + 1] !== v) ||
        (j > 0 && ext[idx - w2] !== v) ||
        (j < h2 - 1 && ext[idx + w2] !== v);
      if (boundary) dist[idx] = 0;
    }
  }
  for (let j = 1; j < h2; j++) {
    for (let i = 1; i < w2; i++) {
      const idx = j * w2 + i;
      const a = dist[idx - 1] + 1;
      const b = dist[idx - w2] + 1;
      const c = dist[idx - w2 - 1] + 1.4142;
      const d = dist[idx - w2 + 1] + 1.4142;
      dist[idx] = Math.min(dist[idx], a, b, c, d);
    }
  }
  for (let j = h2 - 2; j >= 0; j--) {
    for (let i = w2 - 2; i >= 0; i--) {
      const idx = j * w2 + i;
      const a = dist[idx + 1] + 1;
      const b = dist[idx + w2] + 1;
      const c = dist[idx + w2 + 1] + 1.4142;
      const d = dist[idx + w2 - 1] + 1.4142;
      dist[idx] = Math.min(dist[idx], a, b, c, d);
    }
  }

  const data = new Uint8Array(w2 * h2);
  for (let i = 0; i < w2 * h2; i++) data[i] = dist[i] <= radius ? 255 : 0;
  return { data, w: w2, h: h2, margin: m };
}
