/**
 * PolandballConfig — the complete per-ball parameter struct.
 *
 * Every visual / kinematic / physical knob that used to live as a top-level
 * constant in the old canvas PoC is now a field of this struct. Each
 * Polandball instance owns its own config, so two balls can look and feel
 * completely differently while sharing the same rendering path.
 */
export interface PolandballConfig {
  // ---- flag texture -------------------------------------------------------
  /** Flag source: URL (svg/png/jpg). Local paths are resolved against BASE_URL. */
  flag: string;
  /** Sampling-radius fit multiplier (0 = auto tangent fit, >0 = manual). */
  flagFit: number;
  /** How many times the flag is tiled horizontally in the sampling source. */
  flagRepeat: number;
  /** Horizontal sampling offset, in flag widths (moves side details to the ball front). */
  flagXOffset: number;

  // ---- Gaussian (exponential) distortion ----------------------------------
  /** Distortion strength: 0 = none, 1 = full Gaussian peak. */
  distort: number;
  /** Peak width of the Gaussian bump in normalized units (smaller = sharper). */
  gaussSigma: number;
  /** Peak amplitude of the Gaussian bump (center magnification ≈ 1/(1-amp)). */
  gaussAmp: number;

  // ---- ball outline -------------------------------------------------------
  /** Half outline SVG path; mirrored horizontally to close the ball shape. */
  ballPath: string;
  /** Outline stroke width, as a fraction of ball radius (0 = no stroke). */
  ballStroke: number;

  // ---- eyes ---------------------------------------------------------------
  /** Left eye closed outline (SVG path, relative coords). Empty string = mirror of right. */
  eyePathL: string;
  /** Right eye closed outline. Empty string = mirror of left. */
  eyePathR: string;
  /** Eye outline stroke width, as a fraction of ball radius. */
  eyeStroke: number;
  /** Eye size, as a fraction of ball radius (max side of the outline bbox). */
  eyeScale: number;
  /** Horizontal eye spacing (±), in ball radii. */
  eyeDx: number;
  /** Resting vertical eye offset, in ball radii (positive = up). */
  eyeDy: number;
  /** Rotate each eye pair to aim at the cursor. */
  eyeAim: boolean;
  /** Eye-tracking circle radius, in ball radii. */
  eyeTrackR: number;

  // ---- shadows ------------------------------------------------------------
  /** Bottom moon shadow strength (0-1; 0 = off). */
  ballShadowStrength: number;
  /** Moon shadow clip-circle center height above ball center, in radii. */
  ballShadowHeight: number;
  /** Moon shadow clip-circle radius, in ball radii. */
  ballShadowRadius: number;
  /** Ground shadow strength when grounded (0 = off). */
  groundShadowStrength: number;
  /** Ground shadow horizontal radius, in ball radii. */
  groundShadowRx: number;
  /** Ground shadow vertical radius, in ball radii. */
  groundShadowRy: number;
  /** Ground shadow center vertical offset from the ground line (positive = down). */
  groundShadowY: number;
  /** Height (in radii) at which the ground shadow halves in strength. */
  groundShadowFadeout: number;

  // ---- squash & stretch (area preserving) ----------------------------------
  /** Walk sine amplitude. */
  squashHorizAmp: number;
  /** Walk sine wavelength (radians per radius travelled). */
  squashHorizLambda: number;
  /** Vertical acceleration squash coefficient. */
  squashVertEps: number;
  /** Vertical acceleration smoothing window (frames). */
  squashAccelWindow: number;
  /** Grow/shrink bounce sine amplitude. */
  growBounceAmp: number;
  /** Grow/shrink bounce angular speed (radians/second). */
  growBounceLambda: number;

  // ---- physics body (matter-js) -------------------------------------------
  /** Body density (mass per area). */
  density: number;
  /** Body friction. */
  friction: number;
  /** Resting friction. */
  frictionStatic: number;
  /** Bounciness on impact. */
  restitution: number;
}

/** Resolve a flag path against Vite's base URL (GitHub Pages friendly). */
export function resolveFlagPath(p: string): string {
  if (/^(https?:)?\/\//.test(p)) return p; // remote / protocol-relative stays as-is
  return import.meta.env.BASE_URL + p;
}

/** Default flag: the bundled local SVG (avoids CORS pollution of GL textures). */
export function defaultFlag(): string {
  return resolveFlagPath('flag-usa.svg');
}

/** The full default ball configuration (former top-level constants). */
export function createDefaultConfig(): PolandballConfig {
  return {
    flag: defaultFlag(),
    flagFit: 2.3,
    flagRepeat: 3,
    flagXOffset: 0.0,

    distort: 0.4,
    gaussSigma: 1.5,
    gaussAmp: 1.4,

    ballPath:
      'm 136.82324,139.99302 c 27.52313,-0.43053 32.50123,-8.88223 36.34068,-17.60727 6.5267,-14.83176 4.24206,-48.332114 -22.6679,-57.861248 -3.62627,-1.284104 -9.06937,-1.698415 -13.67202,-1.688355',
    ballStroke: 0.08,

    eyePathL:
      'm 250.44413,36.609859 c 0,2.7447 -0.4966,5.81482 -2.10985,7.727873 -1.88287,2.232785 -5.12079,3.090418 -8.32499,3.090417 -3.52077,-10e-7 -7.3709,-1.085393 -9.33664,-3.696712 -1.35606,-1.801404 -1.74965,-4.596865 -1.58076,-7.073322 0.40473,-5.934341 4.96784,-10.770032 10.9174,-10.770033 2.86304,-1e-6 5.26664,0.439965 7.32221,2.117655 2.48945,2.031815 3.11263,5.518343 3.11263,8.604122 z',
    eyePathR: '',
    eyeStroke: 0.05,
    eyeScale: 0.5,
    eyeDx: 0.4,
    eyeDy: 0.14,
    eyeAim: true,
    eyeTrackR: 0.35,

    ballShadowStrength: 0.3,
    ballShadowHeight: 1.16,
    ballShadowRadius: 2.0,
    groundShadowStrength: 0.5,
    groundShadowRx: 1.15,
    groundShadowRy: 0.26,
    groundShadowY: 0.0,
    groundShadowFadeout: 1.5,

    squashHorizAmp: 0.05,
    squashHorizLambda: 3,
    squashVertEps: 0.001,
    squashAccelWindow: 6,
    growBounceAmp: 0.1,
    growBounceLambda: 16,

    density: 0.001,
    friction: 0,
    frictionStatic: 0,
    restitution: 0.0,
  };
}
