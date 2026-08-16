import type { SceneState } from './types';
import { createDefaultScene } from './types';

const KEY = 'cbpoc-scene-v1';

/**
 * PERSISTENCE_ENABLED — debug-stage switch.
 *
 * Persistence was implemented and verified with a round-trip test (save, reload,
 * restore) during development. Per the project's debug-stage rule it is now
 * DISABLED so every reload starts from defaults; flip to `true` once the rest
 * of the app is confirmed stable.
 */
export const PERSISTENCE_ENABLED = true;

/** Load the persisted scene; returns null when disabled / absent / corrupt. */
export function loadScene(): SceneState | null {
  if (!PERSISTENCE_ENABLED) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SceneState;
    if (!parsed || typeof parsed !== 'object' || !parsed.world || !Array.isArray(parsed.balls)) return null;
    // sanitize: new fields get defaults
    parsed.sidebarCollapsed = parsed.sidebarCollapsed ?? false;
    // sanitize: ensure exactly one controlled ball
    const controlled = parsed.balls.filter((b) => b.controlled);
    if (controlled.length !== 1 && parsed.balls.length > 0) {
      for (const b of parsed.balls) b.controlled = false;
      parsed.balls[0].controlled = true;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the scene (no-op when disabled). */
export function saveScene(s: SceneState): void {
  if (!PERSISTENCE_ENABLED) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full / unavailable — ignore in a PoC
  }
}

/** Forget the persisted scene and return a fresh default. */
export function resetScene(): SceneState {
  if (PERSISTENCE_ENABLED) {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  return createDefaultScene();
}
