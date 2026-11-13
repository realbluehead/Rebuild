// Everything heavy at start-up, in one pure function so it can run in a worker (load.worker.ts) while the title screen
// animates: build the world from the seed (or take it from the cache), replay the routes, convert old saves and simulate
// the time away.
import { fromLegacy, recountItems, toKinds } from './core/game';
import { newGame } from './core/state';
import { applyPlan, createWorld, type World } from './core/world';
import { applyOffline } from './save/offline';
import { MAP_SIZE } from './content/world';
import type { CachedWorld } from './save/worldCache';
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
  /** Whether the stored map was used, and the entry to store when it is missing or behind (undefined: it is current). */
  cacheHit: boolean;
  cache?: CachedWorld;
}

/** Loads `save` (null = a new game) and brings it up to `now`, reporting progress 0..1. `cached` is the stored map (see
 *  save/worldCache.ts): used when it is this game's and its routes are the first ones of the game's plan, so only the
 *  routes taken since are applied. `build` tags the entry to store. */
export function loadWorld(save: SaveData | null, now: number, progress: (p: number) => void = () => {}, cached?: CachedWorld, build = ''): Loaded {
  const loaded = save ? deserialize(save as unknown as { v: number } & Record<string, unknown>) : null;
  const state = loaded?.state ?? newGame();
  progress(0.05);
  const key = (plan: readonly unknown[]) => plan.map((e) => JSON.stringify(e));
  const planKeys = key(state.plan);
  const hit = !!cached && cached.seed === state.seed && cached.size === MAP_SIZE && cached.plan.length <= planKeys.length
    && cached.plan.every((k, i) => k === planKeys[i]);
  const world = hit ? cached.world : createWorld(state.seed);
  const from = hit ? cached.plan.length : 0;
  progress(0.4);
  // The routes followed so far (only those since the stored map, if any).
  applyPlan(world, state.plan.slice(from), (k, n) => progress(0.4 + (0.45 * (k + 1)) / n));
  fromLegacy(state, world); // saves from before independent rovers
  recountItems(state, world); // saves that made works at older prices
  toKinds(state, world); // saves from before rover kinds
  progress(0.88);
  const r = loaded ? applyOffline(state, world, loaded.savedAt, now) : null;
  progress(0.95);
  return {
    save: serialize(state, now),
    world,
    report: r && { seconds: r.seconds, gold: r.gold.toString(), cells: r.cells, specials: r.specials, items: r.items, zoomUnlocked: r.zoomUnlocked },
    fresh: !loaded,
    cacheHit: hit,
    cache: hit && key(state.plan).join('|') === cached.plan.join('|') ? undefined
      : { build, seed: state.seed, size: MAP_SIZE, plan: key(state.plan), world },
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
