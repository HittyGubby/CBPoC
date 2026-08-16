<script lang="ts">
  import { onMount } from 'svelte';
  import { Renderer } from './lib/gl/renderer';
  import { PhysicsWorld } from './lib/physics/world';
  import { Polandball } from './lib/ball/polandball';
  import { Input } from './lib/input';
  import {
    ballRadiusFraction,
    buildBallConfig,
    createDefaultScene,
    type SceneState,
  } from './lib/types';
  import { loadScene, saveScene } from './lib/storage';
  import Sidebar from './lib/ui/Sidebar.svelte';
  import { Body } from 'matter-js';

  let canvasEl: HTMLCanvasElement;

  // ---- reactive scene state (the single source of truth) ----
  let scene = $state<SceneState>(loadScene() ?? createDefaultScene());

  // ---- imperative world (created on mount) ----
  let renderer: Renderer | null = null;
  let world: PhysicsWorld | null = null;
  let input: Input | null = null;
  let detachInput: (() => void) | null = null;
  let instances = new Map<string, Polandball>();
  let view = { W: 1, H: 1, dpr: 1 };
  let initialized = false;
  let raf = 0;
  let disposed = false;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  /** Keep exactly one controlled ball (idempotent). */
  function ensureSingleControlled(): void {
    const controlled = scene.balls.filter((b) => b.controlled);
    if (controlled.length > 1) {
      for (const b of controlled.slice(1)) b.controlled = false;
    } else if (controlled.length === 0 && scene.balls.length > 0) {
      scene.balls[0].controlled = true;
    }
  }

  function defaultSpawn(R: number): { x: number; y: number } {
    const x = view.W / 2 + (Math.random() * 2 - 1) * view.W * 0.25;
    const y = R + 20 + Math.random() * view.H * 0.35;
    return { x, y };
  }

  /** Radius in device px for a ball definition at the current viewport. */
  function ballRadiusPx(def: import('./lib/types').BallDef): number {
    const minDim = Math.min(view.W, view.H);
    return clamp(ballRadiusFraction(def, scene.world) * minDim, 8, minDim * 0.45);
  }

  /**
   * Reconcile the reactive scene state with the imperative renderer/physics:
   * create/destroy Polandball instances, hot-apply config/radius/control,
   * and push world-level settings into the renderer + physics engine.
   */
  function syncScene(): void {
    if (!renderer || !world) return;
    ensureSingleControlled();

    // cap balls at maxBalls (never drop the controlled one first)
    while (scene.balls.length > scene.world.maxBalls) {
      const victim = scene.balls.find((b) => !b.controlled) ?? scene.balls[scene.balls.length - 1];
      const i = scene.balls.indexOf(victim);
      scene.balls.splice(i, 1);
      if (scene.selectedBallId === victim.id) scene.selectedBallId = scene.balls[0]?.id ?? null;
    }

    // destroy removed
    for (const [id, inst] of instances) {
      if (!scene.balls.some((b) => b.id === id)) {
        inst.destroy();
        instances.delete(id);
      }
    }

    // create missing + hot-update existing
    for (const def of scene.balls) {
      let inst = instances.get(def.id);
      if (!inst) {
        const R = ballRadiusPx(def);
        const pos = def.pos ?? defaultSpawn(R);
        inst = new Polandball({
          id: def.id,
          config: buildBallConfig(def),
          world,
          renderer,
          radius: R,
          x: pos.x,
          y: pos.y,
          controlled: def.controlled,
        });
        instances.set(def.id, inst);
        if (!def.pos) def.pos = { x: pos.x, y: pos.y };
      }
      inst.setConfig(buildBallConfig(def));
      inst.setRadius(ballRadiusPx(def));
      inst.controlled = def.controlled;
    }

    // world-level settings
    renderer.setBackground(scene.world.background);
    world.setFixedStepMs(scene.world.fixedStepMs);
    world.setSleeping(scene.world.enableSleeping);
    const controlled = [...instances.values()].find((i) => i.controlled);
    world.setGravity(scene.world.gravity, controlled?.getRadius() ?? view.W * 0.1);
  }

  // Any scene mutation (UI edits, add/remove, control switch) hot-syncs + persists.
  $effect(() => {
    JSON.stringify(scene); // track deep changes
    if (!initialized) return;
    syncScene();
    saveScene(scene);
  });

  onMount(() => {
    const gl = canvasEl.getContext('webgl', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      console.error('WebGL not available — this PoC requires a WebGL-capable browser.');
      return;
    }

    const measure = () => {
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.W = Math.round(window.innerWidth * view.dpr);
      view.H = Math.round(window.innerHeight * view.dpr);
    };
    measure();

    renderer = new Renderer(gl);
    world = new PhysicsWorld(view.W, view.H, view.W * 0.1, {
      gravityRadiiPerS2: scene.world.gravity,
      fixedStepMs: scene.world.fixedStepMs,
      enableSleeping: scene.world.enableSleeping,
    });
    input = new Input();
    detachInput = input.attach();

    const resize = () => {
      measure();
      canvasEl.width = view.W;
      canvasEl.height = view.H;
      renderer!.resize(view.W, view.H);
      world!.resize(view.W, view.H, view.W * 0.1);
      syncScene();
    };
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // ---- mouse drag: grab a ball, move it, release to throw ----
    const hitTest = (x: number, y: number): string | null => {
      let best: { id: string; d: number } | null = null;
      for (const [id, inst] of instances) {
        const d = Math.hypot(inst.x - x, inst.y - y);
        if (d <= inst.getRadius() * 1.1 && (!best || d < best.d)) best = { id, d };
      }
      return best?.id ?? null;
    };

    let draggedId: string | null = null;
    let drag = { offsetX: 0, offsetY: 0, lastX: 0, lastY: 0, lastT: 0, prevX: 0, prevY: 0, prevT: 0, moved: false };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || disposed) return;
      const x = e.clientX * view.dpr;
      const y = e.clientY * view.dpr;
      const id = hitTest(x, y);
      if (!id) return;
      const inst = instances.get(id);
      if (!inst) return;
      draggedId = id;
      drag = {
        offsetX: x - inst.x,
        offsetY: y - inst.y,
        lastX: x, lastY: y, lastT: performance.now(),
        prevX: x, prevY: y, prevT: performance.now(),
        moved: false,
      };
      inst.dragging = true;
      Body.set(inst.body, 'isSensor', true); // pass through other balls while held
      Body.setVelocity(inst.body, { x: 0, y: 0 });
      world!.wake(inst.body);
      scene.selectedBallId = id; // grabbing a ball also selects it for editing
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!draggedId) return;
      const x = e.clientX * view.dpr;
      const y = e.clientY * view.dpr;
      const now = performance.now();
      if (Math.hypot(x - drag.lastX, y - drag.lastY) > 1.5 * view.dpr) drag.moved = true;
      // keep a rolling 2-sample history for the release velocity
      if (now - drag.lastT > 16) {
        drag.prevX = drag.lastX; drag.prevY = drag.lastY; drag.prevT = drag.lastT;
        drag.lastX = x; drag.lastY = y; drag.lastT = now;
      }
      const inst = instances.get(draggedId);
      if (!inst) return;
      const R = inst.getRadius();
      const nx = clamp(x - drag.offsetX, R, view.W - R);
      const ny = clamp(y - drag.offsetY, R, view.H - R);
      Body.setPosition(inst.body, { x: nx, y: ny });
      Body.setVelocity(inst.body, { x: 0, y: 0 });
      world!.wake(inst.body);
    };

    const onWindowMouseUp = () => {
      if (!draggedId) return;
      const inst = instances.get(draggedId);
      if (inst) {
        inst.dragging = false;
        Body.set(inst.body, 'isSensor', false);
        // throw: velocity from the last two drag samples (px/s), clamped
        const dtS = Math.max(1 / 240, (drag.lastT - drag.prevT) / 1000);
        let vx = (drag.lastX - drag.prevX) / dtS;
        let vy = (drag.lastY - drag.prevY) / dtS;
        const sp = Math.hypot(vx, vy);
        const MAX = 2500;
        if (sp > MAX) { vx *= MAX / sp; vy *= MAX / sp; }
        Body.setVelocity(inst.body, { x: vx / 60, y: vy / 60 });
        world!.wake(inst.body);
      }
      draggedId = null;
    };

    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    resize();
    initialized = true;
    syncScene();

    let lastNow = performance.now();
    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.15, (now - lastNow) / 1000);
      lastNow = now;
      world!.advance(dt);
      const viewportCss = { w: window.innerWidth, h: window.innerHeight };
      for (const inst of instances.values()) inst.update(dt, input!, viewportCss, view.dpr, scene.world);
      renderer!.draw([...instances.values()], draggedId ? new Set([draggedId]) : undefined);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // DEBUG hooks (kept for headless testing; safe to remove)
    (window as unknown as Record<string, unknown>).__balls = instances;
    (window as unknown as Record<string, unknown>).__world = world;
    (window as unknown as Record<string, unknown>).__scene = scene;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvasEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      detachInput?.();
    };
  });
</script>

<div class="relative w-screen h-screen overflow-hidden">
  <canvas bind:this={canvasEl} class="absolute inset-0" style="cursor: crosshair;"></canvas>

  {#if scene.sidebarCollapsed}
    <!-- expand button, floating at the top-right of the stage -->
    <button
      class="btn btn-circle btn-sm btn-primary absolute top-2 right-2 z-20 shadow-lg"
      title="展开管理侧栏"
      aria-label="展开管理侧栏"
      onclick={() => (scene.sidebarCollapsed = false)}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  {/if}

  <aside
    class="absolute top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-base-100/90 backdrop-blur-sm border-l border-base-300 shadow-xl z-10 transition-transform duration-200 ease-out"
    class:translate-x-full={scene.sidebarCollapsed}
    aria-hidden={scene.sidebarCollapsed}
  >
    <Sidebar {scene} />
  </aside>
</div>
