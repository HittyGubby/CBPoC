import type { PolandballConfig } from './config';
import { createDefaultConfig, defaultFlag } from './config';
import { findCountry, countrySizeFraction } from './data/countries';

/**
 * WorldConfig — everything that is NOT per-ball: stage, physics, overall
 * scaling, and the arcade control parameters of the currently controlled ball.
 * All of it lives in one struct and is persisted (debug-stage gated).
 */
export interface WorldConfig {
  /** Bump when the shape of persisted scenes changes. */
  version: 1;
  /** Canvas clear color (hex). */
  background: string;
  /** Gravity in ball-radii per second² (feel unit from the original PoC). */
  gravity: number;
  /** Country-size divisor: radiusFraction = (ln(area) + OFFSET) / overallScale. */
  overallScale: number;
  /** Maximum number of live balls. */
  maxBalls: number;
  /** Fixed physics step in ms (Matter's solver is unstable above ~16.7ms). */
  fixedStepMs: number;
  /** Let Matter sleep idle bodies. */
  enableSleeping: boolean;
  // ---- arcade control (applies to the controlled ball only) ----
  /** Max horizontal speed (radii/second). */
  ballSpeed: number;
  /** Horizontal acceleration (radii/second²). */
  ballAccel: number;
  /** Horizontal deceleration when no key is held (radii/second²). */
  ballDecel: number;
  /** Jump impulse (radii/second, up). */
  jumpVel: number;
}

/**
 * BallDef — the persisted, editable description of one country ball.
 * Only non-default parameters live in `params`; everything else is derived
 * from the defaults + country/size/flag fields.
 */
export interface BallDef {
  id: string;
  /** Display name (defaults to the country's common name). */
  name: string;
  /** ISO 3166-1 alpha-2 code, or null for a custom (non-country) ball. */
  country: string | null;
  /** Custom flag URL/dataURL; overrides the country flag when set. */
  flag: string | null;
  /** 'country': radius from land area; 'manual': radiusFraction. */
  sizeMode: 'country' | 'manual';
  /** Manual radius as a fraction of min(viewport W,H) (0.02–0.5). */
  radiusFraction: number;
  /** True when this ball receives keyboard + mouse (eyes) control. */
  controlled: boolean;
  /** Non-default PolandballConfig overrides, keyed by field. */
  params: Partial<PolandballConfig>;
  /** Optional spawn position (device px); assigned by the app when missing. */
  pos?: { x: number; y: number };
}

export interface SceneState {
  world: WorldConfig;
  balls: BallDef[];
  /** Which ball the sidebar editor is showing. */
  selectedBallId: string | null;
  /** UI preference: sidebar collapsed so it does not cover the stage. */
  sidebarCollapsed: boolean;
}

export function createDefaultWorld(): WorldConfig {
  return {
    version: 1,
    background: '#ffffff',
    gravity: 26,
    overallScale: 200,
    maxBalls: 48,
    fixedStepMs: 1000 / 60,
    enableSleeping: true,
    ballSpeed: 6,
    ballAccel: 42,
    ballDecel: 20,
    jumpVel: 9,
  };
}

let nameCounter = 0;
/**
 * Create a fresh ball definition. `country` defaults to the United States
 * so new balls come with a real flag + inferred size out of the box.
 */
export function createBallDef(country: string | null = 'US', controlled = false): BallDef {
  const info = findCountry(country);
  nameCounter += 1;
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'ball-' + Date.now() + '-' + nameCounter,
    name: info?.name ?? 'Ball ' + nameCounter,
    country,
    flag: null,
    sizeMode: 'country',
    radiusFraction: 0.2,
    controlled,
    params: {},
  };
}

/** Radius fraction of min(W,H) for a ball definition (country or manual). */
export function ballRadiusFraction(def: BallDef, world: WorldConfig): number {
  if (def.sizeMode === 'manual') return def.radiusFraction;
  const c = findCountry(def.country);
  if (!c) return def.radiusFraction;
  return countrySizeFraction(c.areaKm2, world.overallScale);
}

/** Flag source for a ball: custom upload > country flag > bundled default. */
export function resolveBallFlag(def: BallDef): string {
  if (def.flag) return def.flag;
  const c = findCountry(def.country);
  if (c) return c.flagUrl;
  return defaultFlag();
}

/** Full PolandballConfig for a ball: defaults + non-default overrides. */
export function buildBallConfig(def: BallDef): PolandballConfig {
  const cfg = createDefaultConfig();
  cfg.flag = resolveBallFlag(def);
  return Object.assign(cfg, def.params);
}

export function createDefaultScene(): SceneState {
  const player = createBallDef('US', true);
  return {
    world: createDefaultWorld(),
    balls: [player],
    selectedBallId: player.id,
    sidebarCollapsed: false,
  };
}
