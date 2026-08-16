import { Body } from 'matter-js';
import type { PolandballConfig } from '../config';
import { buildOutline, mirrorX, samplePath, bbox, type Pt } from '../geometry';
import { rasterizeMask, buildRing, type Mask, type Ring } from '../mask';
import type { PhysicsWorld } from '../physics/world';
import type { Renderer } from '../gl/renderer';
import type { FlagEntry } from '../gl/texture';
import { uploadMaskTexture, FLAG_NOMINAL_R } from '../gl/texture';
import type { Input } from '../input';
import type { WorldConfig } from '../types';

/** Shared GPU resources for one shape: mask + stroke-ring textures and a quad VBO. */
interface ShapeGpu {
  maskTex: WebGLTexture;
  ringTex: WebGLTexture;
  maskSize: { x: number; y: number }; // device px (mask bbox)
  ringSize: { x: number; y: number }; // device px (ring texture, includes margin)
  margin: number; // ring padding in device px
  quad: { vbo: WebGLBuffer };
}

export interface PolandballInit {
  /** Stable scene id (BallDef.id). */
  id: string;
  config: PolandballConfig;
  world: PhysicsWorld;
  renderer: Renderer;
  radius: number; // initial body radius in device px
  x: number;
  y: number;
  controlled: boolean;
}

// Sample-path caches: outline points are a pure function of the path string.
const outlineCache = new Map<string, Pt[]>();
const sampleCache = new Map<string, Pt[]>();

function cachedOutline(d: string): Pt[] {
  let o = outlineCache.get(d);
  if (!o) {
    o = buildOutline(d);
    outlineCache.set(d, o);
  }
  return o;
}

function cachedSample(d: string, n: number): Pt[] {
  const key = d + '#' + n;
  let s = sampleCache.get(key);
  if (!s) {
    s = samplePath(d, n);
    sampleCache.set(key, s);
  }
  return s;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Polandball — a complete, self-contained country ball.
 *
 * The constructor creates the physics body, rasterizes the SVG outline into
 * mask/ring textures, uploads them to the GPU, subscribes to the shared flag
 * texture and prepares the eye quads. After construction the instance needs
 * `update()` (physics sync + visual state) and `render()` (3 draw calls).
 *
 * Config and radius are hot-editable: `setConfig` swaps visual parameters
 * (rebuilding only what changed), `setRadius` recreates the physics body at a
 * new size (the collision box follows the visual size).
 */
export class Polandball {
  /** Stable scene id (matches BallDef.id). */
  readonly id: string;
  readonly config: PolandballConfig;
  /** True when this ball receives keyboard + mouse (eye) control. */
  controlled: boolean;
  /** True while the ball is held by the mouse (keyboard control suspended). */
  dragging = false;
  body: Body;
  /** True once the flag texture is usable (async load). */
  ready = false;

  /** Physics state (device px), synced from the body after each step. */
  x = 0;
  y = 0;

  // ---- visual state ------------------------------------------------------
  squashW = 1;
  squashH = 1;
  onGround = false;

  /** Ground-shadow draw state (consumed by the renderer). */
  shadow = { center: { x: 0, y: 0 }, radii: { x: 0, y: 0 }, strength: 0, visible: false };

  private world: PhysicsWorld;
  private flagEntry: FlagEntry | null = null;
  private flagReadyCb: (() => void) | null = null;
  private flagScx = 0;
  private flagScy = 0;
  private rNorm = 1;

  private walkPhase = 0;
  private prevVy = 0;
  private accelBuf: number[] = [];

  // eye tracking (R units, y-up) + aim rotation
  private eyeX = 0;
  private eyeY = 0;
  private aimAngle = 0;

  private bodyShape: ShapeGpu | null = null;
  private eyes: (ShapeGpu | null)[] = [null, null];
  private gl: WebGLRenderingContext | null = null;
  private rendererRef: Renderer | null = null;
  private radius: number;
  /** Radius at which the GPU shape was last rasterized (throttled rebuilds). */
  private shapeRadius = 0;

  constructor(init: PolandballInit) {
    this.id = init.id;
    this.config = init.config;
    this.controlled = init.controlled;
    this.world = init.world;
    this.rendererRef = init.renderer;
    this.gl = init.renderer.gl;
    this.radius = init.radius;
    this.x = init.x;
    this.y = init.y;

    this.body = init.world.addCircle(init.x, init.y, this.radius, this.bodyOpts());
    this.world.addBody(this.body);

    this.subscribeFlag(this.config.flag, this.config.flagRepeat);
    this.buildShape();
  }

  getRadius(): number {
    return this.radius;
  }

  private bodyOpts(): { density?: number; friction?: number; frictionStatic?: number; restitution?: number } {
    return {
      density: this.config.density,
      friction: this.config.friction,
      frictionStatic: this.config.frictionStatic,
      restitution: this.config.restitution,
    };
  }

  private subscribeFlag(url: string, repeat: number): void {
    if (this.flagEntry && this.flagReadyCb) {
      this.flagEntry.listeners.delete(this.flagReadyCb);
    }
    const entry = this.rendererRef!.flags.get(url, repeat);
    const cb = () => {
      if (this.flagEntry === entry) this.ready = true;
    };
    this.flagEntry = entry;
    this.flagReadyCb = cb;
    if (entry.ready) cb();
    else entry.listeners.add(cb);
    this.ready = entry.ready;
  }

  /**
   * Hot-swap the visual/physical configuration. Only the resources that depend
   * on changed fields are rebuilt; plain uniform params take effect next frame.
   */
  setConfig(cfg: PolandballConfig): void {
    const old = this.config;
    const shapeChanged =
      cfg.ballPath !== old.ballPath ||
      cfg.ballStroke !== old.ballStroke ||
      cfg.eyePathL !== old.eyePathL ||
      cfg.eyePathR !== old.eyePathR ||
      cfg.eyeScale !== old.eyeScale ||
      cfg.eyeStroke !== old.eyeStroke;
    const flagChanged = cfg.flag !== old.flag || cfg.flagRepeat !== old.flagRepeat;
    const bodyChanged =
      cfg.density !== old.density ||
      cfg.friction !== old.friction ||
      cfg.frictionStatic !== old.frictionStatic ||
      cfg.restitution !== old.restitution;
    // Mutate in place so render() picks up uniform params immediately.
    Object.assign(this.config, cfg);
    if (flagChanged) this.subscribeFlag(this.config.flag, this.config.flagRepeat);
    if (shapeChanged) this.buildShape();
    if (bodyChanged) {
      const pos = this.body.position;
      const vel = { x: this.body.velocity.x, y: this.body.velocity.y };
      this.world.removeBody(this.body);
      this.body = this.world.addCircle(pos.x, pos.y, this.radius, this.bodyOpts());
      this.world.addBody(this.body);
      Body.setVelocity(this.body, vel);
    }
  }

  /**
   * Change the ball's size: the Matter collision box AND the rendered shape
   * are rebuilt at the new radius (w/s growth, size edits, viewport resizes).
   */
  setRadius(r: number): void {
    r = clamp(r, 8, 4000);
    const moved = Math.abs(r - this.radius) > 0.5;
    if (moved) {
      const pos = this.body.position;
      const vel = { x: this.body.velocity.x, y: this.body.velocity.y };
      this.world.removeBody(this.body);
      this.body = this.world.addCircle(pos.x, pos.y, r, this.bodyOpts());
      this.world.addBody(this.body);
      Body.setVelocity(this.body, vel);
      this.radius = r;
    }
    // Throttle the GPU shape rebuild: only re-rasterize when the radius
    // drifted by more than 1.5% (continuous w/s growth recreates bodies cheaply).
    if (Math.abs(r - this.shapeRadius) > Math.max(1.5, 0.015 * r)) this.buildShape();
  }

  destroy(): void {
    this.world.removeBody(this.body);
    const gl = this.gl;
    if (gl) {
      for (const tex of this.allTextures()) gl.deleteTexture(tex);
      for (const buf of this.allBuffers()) gl.deleteBuffer(buf);
    }
  }

  // -------------------------------------------------------------------------
  // Construction helpers
  // -------------------------------------------------------------------------

  private buildShape(): void {
    const cfg = this.config;
    const R = this.radius;
    this.shapeRadius = R;
    const outline = cachedOutline(cfg.ballPath);
    const { minX, maxX, minY, maxY } = bbox(outline);
    const scale = (2 * R) / Math.max(maxX - minX, maxY - minY);
    const ox = (minX + maxX) / 2;
    const oy = (minY + maxY) / 2;
    const dev: Pt[] = outline.map((p) => ({ x: (p.x - ox) * scale, y: (p.y - oy) * scale }));

    const strokePx = cfg.ballStroke * R;
    const gl = this.gl;
    if (gl && this.bodyShape) {
      gl.deleteTexture(this.bodyShape.maskTex);
      gl.deleteTexture(this.bodyShape.ringTex);
      gl.deleteBuffer(this.bodyShape.quad.vbo);
    }
    this.bodyShape = this.buildShapeGpu(dev, strokePx);
    this.rNorm = Math.sqrt(this.bodyShape.maskSize.x ** 2 + this.bodyShape.maskSize.y ** 2) / 2;

    this.buildEyes();
  }

  /** Rasterize points (relative to the shape origin) into mask + ring + quad. */
  private buildShapeGpu(dev: Pt[], strokePx: number): ShapeGpu {
    const R = this.radius;
    const mask = rasterizeMask(dev);
    if (!mask) throw new Error('Polandball: outline rasterization failed');
    const ring = buildRing(mask, strokePx / 2);
    const { maskTex, ringTex, maskSize, ringSize, margin } = this.uploadShape(mask, ring);
    // Quad corners in ball-local R units (relative to the shape origin).
    const m = ring.margin;
    const lx0 = (mask.origin.x - m) / R;
    const ly0 = (mask.origin.y - m) / R;
    const lx1 = (mask.origin.x + mask.w + m) / R;
    const ly1 = (mask.origin.y + mask.h + m) / R;
    const data = new Float32Array([
      lx0, ly0, 0, 0,
      lx1, ly0, 1, 0,
      lx0, ly1, 0, 1,
      lx1, ly1, 1, 1,
    ]);
    return { maskTex, ringTex, maskSize, ringSize, margin, quad: { vbo: this.makeQuadVbo(data) } };
  }

  private uploadShape(mask: Mask, ring: Ring): Omit<ShapeGpu, 'quad'> {
    const gl = this.gl!;
    return {
      maskTex: uploadMaskTexture(gl, mask.data, mask.w, mask.h),
      ringTex: uploadMaskTexture(gl, ring.data, ring.w, ring.h),
      maskSize: { x: mask.w, y: mask.h },
      ringSize: { x: ring.w, y: ring.h },
      margin: ring.margin,
    };
  }

  private buildEyes(): void {
    const cfg = this.config;
    const rawL = cfg.eyePathL ? cachedSample(cfg.eyePathL, 120) : [];
    const rawR = cfg.eyePathR ? cachedSample(cfg.eyePathR, 120) : [];
    const outlineL = rawL.length ? rawL : mirrorX(rawR);
    const outlineR = rawR.length ? rawR : mirrorX(rawL);
    const gl = this.gl;
    if (gl) {
      for (const e of this.eyes) {
        if (e) {
          gl.deleteTexture(e.maskTex);
          gl.deleteTexture(e.ringTex);
          gl.deleteBuffer(e.quad.vbo);
        }
      }
    }
    this.eyes = [this.buildEye(outlineL), this.buildEye(outlineR)];
  }

  private buildEye(outline: Pt[]): ShapeGpu | null {
    if (!outline.length) return null;
    const R = this.radius;
    const cfg = this.config;
    const { minX, maxX, minY, maxY } = bbox(outline);
    const eyeSize = Math.max(maxX - minX, maxY - minY);
    if (eyeSize === 0) return null;
    const s = (cfg.eyeScale * R) / eyeSize;
    const ecx = (minX + maxX) / 2;
    const ecy = (minY + maxY) / 2;
    const dev: Pt[] = outline.map((p) => ({ x: (p.x - ecx) * s, y: (p.y - ecy) * s }));
    const strokePx = cfg.eyeStroke * R;
    return this.buildShapeGpu(dev, strokePx);
  }

  private makeQuadVbo(data: Float32Array): WebGLBuffer {
    return this.rendererRef!.makeQuadVbo(data);
  }

  private allTextures(): WebGLTexture[] {
    const out: WebGLTexture[] = [];
    if (this.bodyShape) out.push(this.bodyShape.maskTex, this.bodyShape.ringTex);
    for (const e of this.eyes) if (e) out.push(e.maskTex, e.ringTex);
    return out;
  }

  private allBuffers(): WebGLBuffer[] {
    const out: WebGLBuffer[] = [];
    if (this.bodyShape) out.push(this.bodyShape.quad.vbo);
    for (const e of this.eyes) if (e) out.push(e.quad.vbo);
    return out;
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  /** Sync physics -> visual state; applies control when `controlled`. */
  update(dt: number, input: Input, viewportCss: { w: number; h: number }, dpr: number, worldCfg: WorldConfig): void {
    const cfg = this.config;
    const R = this.radius;
    this.x = this.body.position.x;
    this.y = this.body.position.y;

    // Safety clamp: damp absurd impulses (rare Matter solver glitches).
    const sp = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    const MAX_STEP_V = 100; // px per step ≈ 6000 px/s
    if (sp > MAX_STEP_V) {
      const s = MAX_STEP_V / sp;
      Body.setVelocity(this.body, { x: this.body.velocity.x * s, y: this.body.velocity.y * s });
    }

    // Matter integrates Verlet-style: velocity is px per (1/60 s) step.
    // Convert to px/s for the arcade math below.
    const vx = this.body.velocity.x * 60;
    const vy = this.body.velocity.y * 60;
    this.onGround = this.world.onGround(this.body);

    if (this.controlled && !this.dragging) {
      // Matter's setVelocity does not wake a sleeping body — the controlled
      // ball must always react to input, so force-wake it every frame.
      this.world.wake(this.body);

      const maxV = worldCfg.ballSpeed * R;
      const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let nx = vx;
      if (target > 0) nx = Math.min(nx + worldCfg.ballAccel * R * dt, maxV);
      else if (target < 0) nx = Math.max(nx - worldCfg.ballAccel * R * dt, -maxV);
      else if (this.onGround && nx > 0) nx = Math.max(0, nx - worldCfg.ballDecel * R * dt);
      else if (this.onGround) nx = Math.min(0, nx + worldCfg.ballDecel * R * dt);
      Body.setVelocity(this.body, { x: nx / 60, y: vy / 60 });

      if (input.consumeSpace() && this.onGround) {
        Body.setVelocity(this.body, { x: nx / 60, y: (-worldCfg.jumpVel * R) / 60 });
      }
    }

    // ---- squash & stretch (area preserving) ----
    const moving = Math.abs(vx) > R * 0.01;
    if (moving) {
      this.walkPhase += cfg.squashHorizLambda * (vx / R) * dt;
    } else {
      this.walkPhase = 0;
    }
    const hHoriz = 1 - cfg.squashHorizAmp * Math.sin(this.walkPhase);
    const instAy = dt > 0 ? (vy - this.prevVy) / dt / R : 0;
    this.prevVy = vy;
    this.accelBuf.push(instAy);
    if (this.accelBuf.length > cfg.squashAccelWindow) this.accelBuf.shift();
    let sum = 0;
    for (const a of this.accelBuf) sum += a;
    const ay = this.accelBuf.length ? sum / this.accelBuf.length : 0;
    const hVert = ay < 0 ? 1 - cfg.squashVertEps * -ay : 1 + cfg.squashVertEps * ay;
    this.squashH = clamp(hHoriz + hVert - 1, 0.55, 1.5);
    this.squashW = 1 / this.squashH;

    // ---- eye tracking (only the controlled ball aims at the cursor) ----
    if (this.controlled) {
      const cyVis = this.y;
      const refX = this.x / dpr;
      const refY = cyVis / dpr;
      const dx = input.mouseX - refX;
      const dy = -(input.mouseY - refY); // y up
      const d = Math.hypot(dx, dy);
      let cosA = 0, sinA = 1, cosS = 0, sinS = 0;
      if (d > 1e-3) {
        cosA = dx / d;
        sinA = dy / d;
        cosS = dx / d;
        sinS = -(dy / d);
      }
      let L = Infinity;
      if (cosS > 0) L = Math.min(L, (viewportCss.w - refX) / cosS);
      else if (cosS < 0) L = Math.min(L, (0 - refX) / cosS);
      if (sinS > 0) L = Math.min(L, (viewportCss.h - refY) / sinS);
      else if (sinS < 0) L = Math.min(L, (0 - refY) / sinS);
      const rho = d > 1e-3 ? Math.min(cfg.eyeTrackR, cfg.eyeTrackR * (d / L)) : 0;
      const xd = rho * cosA;
      const yd = rho * sinA;
      this.eyeY =
        yd >= 0
          ? cfg.eyeDy + (cfg.eyeTrackR - cfg.eyeDy) * (yd / cfg.eyeTrackR)
          : cfg.eyeDy + (cfg.eyeTrackR + cfg.eyeDy) * (yd / cfg.eyeTrackR);
      this.eyeX = xd;
      this.aimAngle = cfg.eyeAim
        ? Math.atan2(viewportCss.h, viewportCss.w) * Math.sin(2 * Math.atan2(-dy, dx))
        : 0;
    } else {
      this.eyeX = 0;
      this.eyeY = 0;
      this.aimAngle = 0;
    }

    // ---- flag sampling center ----
    // The eye shift is normalized against FLAG_NOMINAL_R (the tile size the
    // flag texture was built at), keeping the on-ball flag view size-constant.
    const entry = this.flagEntry;
    if (entry && entry.ready) {
      const centerTile = Math.floor(cfg.flagRepeat / 2);
      this.flagScx = (centerTile + 0.5) * entry.fw - this.eyeX * FLAG_NOMINAL_R + cfg.flagXOffset * entry.fw;
      this.flagScy = entry.sH / 2;
    }

    // ---- ground shadow ----
    const groundY = viewportCss.h * dpr;
    const height = Math.max(0, groundY - R - this.y);
    const strength = cfg.groundShadowStrength / (1 + height / (cfg.groundShadowFadeout * R));
    const sh = this.shadow;
    sh.visible = cfg.groundShadowStrength > 0 && strength > 0.01;
    sh.strength = strength;
    sh.center.x = this.x;
    sh.center.y = groundY + cfg.groundShadowY * R;
    sh.radii.x = cfg.groundShadowRx * R;
    sh.radii.y = cfg.groundShadowRy * R;
  }

  /** One body draw call + two eye draw calls. */
  render(r: Renderer): void {
    this.rendererRef = r;
    if (!this.ready || !this.bodyShape || !this.flagEntry?.ready) return;
    this.gl = r.gl;
    const gl = r.gl;
    const { w: vw, h: vh } = r.viewport;
    const R = this.radius;
    const cfg = this.config;

    // ---- body ----
    const p = r.ballProgram;
    p.use();
    gl.uniform2f(p.uniform('uViewport'), vw, vh);
    gl.uniform2f(p.uniform('uBallBottom'), this.x, this.y + R);
    gl.uniform2f(p.uniform('uScale'), this.squashW, this.squashH);
    gl.uniform1f(p.uniform('uR'), R);
    gl.uniform2f(p.uniform('uMaskSizePx'), this.bodyShape.maskSize.x, this.bodyShape.maskSize.y);
    gl.uniform2f(p.uniform('uRingSizePx'), this.bodyShape.ringSize.x, this.bodyShape.ringSize.y);
    gl.uniform1f(p.uniform('uMarginPx'), this.bodyShape.margin);
    gl.uniform2f(p.uniform('uSampling'), this.flagScx, this.flagScy);
    gl.uniform2f(p.uniform('uFlagSize'), this.flagEntry.sW, this.flagEntry.sH);
    gl.uniform1f(p.uniform('uRNorm'), this.rNorm);
    gl.uniform1f(p.uniform('uFit'), cfg.flagFit);
    gl.uniform3f(p.uniform('uGauss'), cfg.gaussAmp, cfg.gaussSigma, cfg.distort);
    gl.uniform2f(p.uniform('uShadowRC'), cfg.ballShadowHeight, cfg.ballShadowRadius);
    gl.uniform1f(p.uniform('uShadowStrength'), cfg.ballShadowStrength);
    gl.uniform1f(p.uniform('uSampleR'), FLAG_NOMINAL_R);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bodyShape.maskTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bodyShape.ringTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.flagEntry.tex!);
    gl.uniform1i(p.uniform('uMask'), 0);
    gl.uniform1i(p.uniform('uRing'), 1);
    gl.uniform1i(p.uniform('uFlag'), 2);

    r.bindQuadVbo(this.bodyShape.quad.vbo, p.attrib('aLocal'), p.attrib('aUV'));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ---- eyes ----
    const ep = r.maskedProgram;
    ep.use();
    const cosA = Math.cos(this.aimAngle);
    const sinA = Math.sin(this.aimAngle);
    for (let i = 0; i < 2; i++) {
      const eye = this.eyes[i];
      if (!eye) continue;
      gl.uniform2f(ep.uniform('uViewport'), vw, vh);
      gl.uniform2f(ep.uniform('uBallBottom'), this.x, this.y + R);
      gl.uniform2f(ep.uniform('uScale'), this.squashW, this.squashH);
      gl.uniform1f(ep.uniform('uR'), R);
      gl.uniform2f(ep.uniform('uPivot'), this.eyeX, -this.eyeY);
      gl.uniform2f(ep.uniform('uCosSin'), cosA, sinA);
      gl.uniform2f(ep.uniform('uOffset'), i === 0 ? -cfg.eyeDx : cfg.eyeDx, 0);
      gl.uniform2f(ep.uniform('uMaskSizePx'), eye.maskSize.x, eye.maskSize.y);
      gl.uniform2f(ep.uniform('uRingSizePx'), eye.ringSize.x, eye.ringSize.y);
      gl.uniform1f(ep.uniform('uMarginPx'), eye.margin);
      gl.uniform3f(ep.uniform('uFillColor'), 1, 1, 1);
      gl.uniform3f(ep.uniform('uStrokeColor'), 0, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, eye.maskTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, eye.ringTex);
      gl.uniform1i(ep.uniform('uMask'), 0);
      gl.uniform1i(ep.uniform('uRing'), 1);

      r.bindQuadVbo(eye.quad.vbo, ep.attrib('aLocal'), ep.attrib('aUV'));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}
