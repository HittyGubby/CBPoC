import { Bodies, Body, Composite, Engine, Events, type IEventCollision } from 'matter-js';

/**
 * PhysicsWorld — a thin wrapper around matter-js providing:
 *  - a fixed ground line + side walls sized to the viewport,
 *  - gravity scaled to ball-radius units (same feel as the old PoC),
 *  - per-body ground contact tracking for jump detection.
 *
 * Units are device pixels; time is seconds (Matter internally uses ms).
 */
export class PhysicsWorld {
  readonly engine: Engine;
  readonly ground: Body;
  readonly wallLeft: Body;
  readonly wallRight: Body;

  private w = 0;
  private h = 0;
  private readonly depth = 400; // static wall thickness (px)
  private gravityRadiiPerS2 = 26;
  private fixedStepMs = 1000 / 60;
  /** bodyId -> number of live contacts with the ground. */
  private readonly groundContacts = new Map<number, number>();
  // Matter's solver is only stable at fixed step sizes; accumulate real time
  // and step in fixed increments (never feed variable RAF deltas).
  private accumulatorMs = 0;

  constructor(width: number, height: number, radius: number, opts?: { gravityRadiiPerS2?: number; fixedStepMs?: number; enableSleeping?: boolean }) {
    this.w = width;
    this.h = height;
    this.gravityRadiiPerS2 = opts?.gravityRadiiPerS2 ?? 26;
    this.fixedStepMs = opts?.fixedStepMs ?? 1000 / 60;
    this.engine = Engine.create();
    this.engine.enableSleeping = opts?.enableSleeping ?? true;
    // Matter: acceleration = gravity.y * gravity.scale (px/ms²); 1000 px/ms² = 1 px/s².
    this.applyGravity(radius);
    this.engine.gravity.x = 0;

    this.ground = Bodies.rectangle(width / 2, height + this.depth / 2, width + this.depth * 2, this.depth, {
      isStatic: true,
      label: 'ground',
      friction: 0.6,
    });
    this.wallLeft = Bodies.rectangle(-this.depth / 2, height / 2, this.depth, height * 2, {
      isStatic: true,
      label: 'wall',
    });
    this.wallRight = Bodies.rectangle(width + this.depth / 2, height / 2, this.depth, height * 2, {
      isStatic: true,
      label: 'wall',
    });
    Composite.add(this.engine.world, [this.ground, this.wallLeft, this.wallRight]);

    Events.on(this.engine, 'collisionStart', (e) => this.adjust(e, +1));
    Events.on(this.engine, 'collisionEnd', (e) => this.adjust(e, -1));
  }

  /** Update static bounds; bodies are pushed back by the solver automatically. */
  resize(width: number, height: number, radius: number): void {
    if (width !== this.w || height !== this.h) {
      this.w = width;
      this.h = height;
      Body.setPosition(this.ground, { x: width / 2, y: height + this.depth / 2 });
      Body.setPosition(this.wallLeft, { x: -this.depth / 2, y: height / 2 });
      Body.setPosition(this.wallRight, { x: width + this.depth / 2, y: height / 2 });
    }
    this.applyGravity(radius);
  }

  /** Gravity for a ball of the given radius: px/s² = radiiPerS² × radius. */
  setGravity(radiiPerS2: number, radius: number): void {
    this.gravityRadiiPerS2 = radiiPerS2;
    this.applyGravity(radius);
  }

  setFixedStepMs(ms: number): void {
    this.fixedStepMs = Math.max(4, Math.min(33.3, ms));
    this.accumulatorMs = 0;
  }

  setSleeping(enabled: boolean): void {
    this.engine.enableSleeping = enabled;
    if (!enabled) {
      for (const body of this.engine.world.bodies) Body.set(body, 'isSleeping', false);
    }
  }

  private applyGravity(radius: number): void {
    // Matter: acceleration = gravity.y * gravity.scale (px/ms²); 1000 px/ms² = 1 px/s².
    this.engine.gravity.y = (this.gravityRadiiPerS2 * radius) / 1000;
  }

  /** Spawn a circle body (device px). */
  addCircle(
    x: number,
    y: number,
    r: number,
    opts: { density?: number; friction?: number; frictionStatic?: number; restitution?: number },
  ): Body {
    return Bodies.circle(x, y, r, {
      density: opts.density,
      friction: opts.friction,
      frictionStatic: opts.frictionStatic,
      restitution: opts.restitution,
      label: 'ball',
    });
  }

  addBody(body: Body): void {
    Composite.add(this.engine.world, body);
  }

  removeBody(body: Body): void {
    Composite.remove(this.engine.world, body);
    this.groundContacts.delete(body.id);
  }

  /** True when the body currently touches the ground. */
  onGround(body: Body): boolean {
    return (this.groundContacts.get(body.id) ?? 0) > 0;
  }

  /**
   * Advance the simulation by `realDt` seconds of wall-clock time, stepping
   * the engine in fixed increments (Matter's solver is unstable for deltas
   * above ~16.7ms, e.g. dropped frames).
   */
  advance(realDt: number): void {
    this.accumulatorMs += Math.min(0.15, Math.max(0, realDt)) * 1000;
    let steps = 0;
    while (this.accumulatorMs >= this.fixedStepMs && steps < 10) {
      Engine.update(this.engine, this.fixedStepMs);
      this.accumulatorMs -= this.fixedStepMs;
      steps++;
    }
    if (this.accumulatorMs >= this.fixedStepMs) this.accumulatorMs = 0; // spiral-of-death guard
  }

  /** Wake a sleeping body (used when the player applies input). */
  wake(body: Body): void {
    Body.set(body, 'isSleeping', false);
  }

  private adjust(e: IEventCollision<Engine>, delta: number): void {
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a.label === 'ground' && b.label === 'ball') this.bump(b.id, delta);
      else if (b.label === 'ground' && a.label === 'ball') this.bump(a.id, delta);
    }
  }

  private bump(id: number, delta: number): void {
    const cur = this.groundContacts.get(id) ?? 0;
    const next = Math.max(0, cur + delta);
    if (next === 0) this.groundContacts.delete(id);
    else this.groundContacts.set(id, next);
  }
}
