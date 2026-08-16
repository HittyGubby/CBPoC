# CountryBall PoC (WebGL)

A pure-frontend sandbox of Countryballs rendered with **WebGL shaders** and driven by a
**real physics engine (matter-js)** — multi-ball instance interactions, a management UI,
and country-derived sizes/flags.

Live instance (older canvas build): [https://hittygubby.github.io/CBPoC/](https://hittygubby.github.io/CBPoC/)

## Features

- **GPU rendering**: the Gaussian-distorted flag mapping, stroke ring, shadows and eyes all
  run in fragment shaders (one draw call per ball body + two per eye pair), so many balls
  stay cheap.
- **Real physics**: matter-js circles with a fixed-timestep accumulator (stable under frame
  drops); balls stack, roll, bounce and interact. The collision box follows the visual size.
- **Management sidebar** (daisyUI): add / edit / delete balls; each ball exposes only its
  non-default parameters (pick any parameter from the list to override it), with hot refresh.
  The sidebar can be collapsed so it does not cover the stage.
- **Country data**: 249 countries with land area + CORS-enabled flag URLs (flagcdn.com).
  Ball radius is inferred from the area via `radius = (ln(areaKm²) + offset) / overallScale`,
  normalized so the largest (Russia) and smallest (Vatican) differ by exactly 2×.
  Custom flag upload is supported (SVG/PNG/JPG, stored as a data URL).
- **Controlled ball**: exactly one ball receives keyboard + eye-tracking; switch it from the
  sidebar or grab any ball with the mouse (drag to move, release to throw).
- **Stage / physics / global parameters** live in a `WorldConfig` struct (not hardcoded) and
  are edited in the 世界 tab: background, gravity, overall scale, arcade control feel, etc.
- **Persistence**: the whole scene (balls + world + UI prefs) auto-saves to `localStorage` on
  every data-tree change. Debug-stage switch in `src/lib/storage.ts` (`PERSISTENCE_ENABLED`);
  it is currently enabled after round-trip verification.

## Controls

| Key | Action |
| --- | --- |
| A / D | move the controlled ball |
| Space | jump |
| Mouse | drag any ball (throw on release); click selects for editing; eyes track the cursor |

## Architecture

```
src/lib/
  config.ts          PolandballConfig — the per-ball parameter struct (defaults)
  types.ts           BallDef / WorldConfig / SceneState + buildBallConfig()
  storage.ts         localStorage persistence (PERSISTENCE_ENABLED switch)
  paramMeta.ts       UI metadata for the parameter-override picker
  data/countries.ts  generated country table (areas + flag URLs) + size math
  geometry.ts        SVG path sampling / outline building
  mask.ts            binary mask rasterization + chamfer stroke-ring
  ball/polandball.ts the complete Polandball class (physics body + GPU resources)
  gl/                WebGL programs, shaders, flag cache, renderer
  physics/world.ts   matter-js wrapper (ground/walls/contacts/fixed timestep)
  input.ts           keyboard + mouse state
  ui/                daisyUI sidebar components
scripts/gen-countries.mjs  regenerates src/lib/data/countries.ts
```

### Polandball as a struct

Every ball is a `Polandball` instance built by a complete constructor:

```ts
const ball = new Polandball({
  id, config, world, renderer, radius, x, y, controlled,
});
```

The former top-level constants of the original PoC are now fields of `PolandballConfig`
and `WorldConfig`; `ball.setConfig()` hot-swaps parameters (rebuilding only what changed)
and `ball.setRadius()` resizes the physics body + GPU shape together.

## Dev

```bash
bun install
bun run dev        # vite dev server
bun run check      # svelte-check + tsc
bun run build      # production build
bun run preview    # serve dist
```
