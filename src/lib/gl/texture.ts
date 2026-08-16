import { resolveFlagPath } from '../config';

/** Upload a 1-channel (ALPHA) byte texture; LINEAR filtering gives soft edges. */
export function uploadMaskTexture(
  gl: WebGLRenderingContext,
  data: Uint8Array,
  w: number,
  h: number,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, w, h, 0, gl.ALPHA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * The design radius (device px) the flag tile size is derived from. Ball radii
 * vary per country/size, so the FLAG SAMPLING math also normalizes against this
 * nominal radius — the visible portion of the flag is constant across ball sizes.
 */
export const FLAG_NOMINAL_R = 200;

/**
 * A shared, tiled flag texture. Several balls can reference the same entry;
 * the tiled source is rebuilt whenever the world radius R changes.
 */
export interface FlagEntry {
  key: string;
  img: HTMLImageElement | null;
  tex: WebGLTexture | null;
  /** Tile size in device px. */
  fw: number;
  fh: number;
  /** Tiled source size in device px. */
  sW: number;
  sH: number;
  repeat: number;
  ready: boolean;
  listeners: Set<() => void>;
}

/** Tile a flag image horizontally `repeat` times (mirror-free, like the CPU PoC). */
function buildTiledSource(img: HTMLImageElement, fw: number, fh: number, repeat: number): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = fw;
  tile.height = fh;
  const tctx = tile.getContext('2d')!;
  tctx.drawImage(img, 0, 0, fw, fh);

  const canvas = document.createElement('canvas');
  canvas.width = fw * repeat;
  canvas.height = fh;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let col = 0; col < repeat; col++) ctx.drawImage(tile, col * fw, 0);
  return canvas;
}

export class FlagCache {
  private readonly gl: WebGLRenderingContext;
  private entries = new Map<string, FlagEntry>();
  /**
   * Nominal design radius in device px used to size the tiled flag texture.
   * Per-ball radii vary (country-size model), so the tile size is fixed; the
   * texture stays sharp enough for any ball up to a few hundred px radius.
   */
  static readonly NOMINAL_R = 200;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
  }

  /**
   * Get (or lazily create) the tiled texture for a flag URL + repeat count.
   * Loading is async: subscribe with `onReady` to be notified when the
   * texture is usable.
   */
  get(url: string, repeat: number, onReady?: () => void): FlagEntry {
    const key = url + '#' + repeat;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        img: null,
        tex: null,
        fw: 0,
        fh: 0,
        sW: 1,
        sH: 1,
        repeat,
        ready: false,
        listeners: new Set(),
      };
      this.entries.set(key, entry);
      this.load(entry, url);
    }
    if (onReady) {
      if (entry.ready) onReady();
      else entry.listeners.add(onReady);
    }
    return entry;
  }

  private load(entry: FlagEntry, url: string): void {
    const im = new Image();
    if (/^https?:\/\//i.test(url)) im.crossOrigin = 'anonymous';
    const start = (src: string) => {
      im.onload = () => {
        entry.img = im;
        this.buildTiled(entry);
        this.notify(entry);
      };
      im.onerror = () => {
        if (src !== resolveFlagPath('flag-usa.svg')) this.load(entry, resolveFlagPath('flag-usa.svg'));
      };
      im.src = src;
    };
    start(url);
  }

  private buildTiled(entry: FlagEntry): void {
    const img = entry.img!;
    const scale = (FlagCache.NOMINAL_R * 2) / Math.min(img.naturalWidth, img.naturalHeight);
    const fw = Math.max(1, Math.round(img.naturalWidth * scale));
    const fh = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = buildTiledSource(img, fw, fh, entry.repeat);
    const gl = this.gl;
    if (entry.tex) gl.deleteTexture(entry.tex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    entry.tex = tex;
    entry.fw = fw;
    entry.fh = fh;
    entry.sW = cv.width;
    entry.sH = cv.height;
    entry.ready = true;
  }

  private notify(entry: FlagEntry): void {
    const ls = [...entry.listeners];
    entry.listeners.clear();
    for (const cb of ls) cb();
  }
}
