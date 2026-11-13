// Everything heavy at start-up, in one pure function so it can run in a worker (load.worker.ts) while the title screen
// animates: build the world from the seed, replay the routes, convert old saves and simulate the time away.
import { fromLegacy, recountItems } from './core/game';
import { newGame } from './core/state';
import { applyPlan, createWorld, type World } from './core/world';
import { applyOffline } from './save/offline';
import { deserialize, serialize, type SaveData } from './save/save';

/** The offline report with its bluetreri as text (a Decimal does not survive the trip from a worker). */
export interface LoadedReport { seconds: number; gold: string; cells: number; specials: number; items: number; zoomUnlocked?: number }

export interface Loaded {
  /** The game as of `now` (offline time already simulated), to deserialize. */
  save: SaveData;
  world: World;
  /** Null for a new game or a short absence. */
  report: LoadedReport | null;
  fresh: boolean;
}

/** Loads `save` (null = a new game) and brings it up to `now`, reporting progress 0..1. */
export function loadWorld(save: SaveData | null, now: number, progress: (p: number) => void = () => {}): Loaded {
  const loaded = save ? deserialize(save as unknown as { v: number } & Record<string, unknown>) : null;
  const state = loaded?.state ?? newGame();
  progress(0.05);
  const world = createWorld(state.seed);
  progress(0.4);
  applyPlan(world, state.plan, (k, n) => progress(0.4 + (0.45 * (k + 1)) / n)); // the routes followed so far
  fromLegacy(state, world); // saves from before independent rovers
  recountItems(state, world); // saves that made works at older prices
  progress(0.88);
  const r = loaded ? applyOffline(state, world, loaded.savedAt, now) : null;
  progress(0.95);
  return {
    save: serialize(state, now),
    world,
    report: r && { seconds: r.seconds, gold: r.gold.toString(), cells: r.cells, specials: r.specials, items: r.items, zoomUnlocked: r.zoomUnlocked },
    fresh: !loaded,
  };
}

/** Buffers of every typed array in the world, to hand them over from a worker without copying. */
export function worldBuffers(w: World): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const add = (v: unknown) => { if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) out.add(v.buffer); };
  for (const v of Object.values(w)) {
    add(v);
    if (Array.isArray(v)) v.forEach(add);
    if (v instanceof Map) v.forEach(add);
  }
  return [...out];
}
