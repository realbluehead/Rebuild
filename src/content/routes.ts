// Exploration routes (discovery algorithms): the pattern rovers follow when they push into the dark. Random is the
// free starting one (no levels); the rest are upgrades, unlocked with bluetreri plus collected items, and each can be levelled up (less entropy).
// The list goes from the least to the most efficient (measured with tools/routes.ts). A change takes over at the next ring.
import type { ItemId } from './collection';

/** Discovery algorithms. north/south/east/west only remain so old saves can rebuild their map; they are not offered. */
export type RouteId = 'random' | 'circular' | 'trail' | 'prospect' | 'survey' | 'north' | 'south' | 'east' | 'west';

export interface RouteDef {
  id: RouteId;
  name: string;
  /** Short line for the card. */
  short: string;
  desc: string;
  /** Unlock price: bluetreri plus items. */
  gold: number;
  items: Partial<Record<ItemId, number>>;
  /** First level's price (bluetreri grows by ROUTE_LEVEL_GROWTH per level, items by the level number). */
  levelGold: number;
  levelItems: Partial<Record<ItemId, number>>;
  /** Highest level (0 = no levels). */
  maxLevel: number;
  /** Explorer level needed to unlock it; level k of the route needs `minLevel + ROUTE_LEVEL_STEP × k`. */
  minLevel: number;
}

/** Levels lower an algorithm's entropy (noise, jitter and straying, see `ALGOS` in core/world.ts). */
/** Explorer levels between one route level and the next. */
export const ROUTE_LEVEL_STEP = 2;
export const ROUTE_MAX_LEVEL = 4;
export const ROUTE_LEVEL_GROWTH = 3.5;

/** Offered routes, from the least to the most efficient (measured with tools/routes.ts). */
export const ROUTES: readonly RouteDef[] = [
  { id: 'random', name: 'Random', short: 'wander from the edge', desc: 'The rovers\' first instinct: wander off the explored edge in any direction. They zig-zag and leave patches half done.', gold: 0, items: {}, levelGold: 0, levelItems: {}, maxLevel: 0, minLevel: 0 },
  { id: 'circular', name: 'Circular', short: 'rings around camp', desc: 'Rings around camp: the nearest, easiest ground first. Levels follow the explored edge more closely.', gold: 80, items: {}, levelGold: 1500, levelItems: { page: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 6 },
  { id: 'trail', name: 'Trail', short: 'easy ground that pays', desc: 'Easy ground that still pays: streets and rich blocks before ruins, towers and water.', gold: 6000, items: { page: 8, note: 3 }, levelGold: 12000, levelItems: { note: 2 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 24 },
  { id: 'prospect', name: 'Prospector', short: 'richest ground first', desc: 'Heads for the most bluetreri per step: deposits and rich blocks pull the rovers.', gold: 100000, items: { note: 8, photo: 8 }, levelGold: 160000, levelItems: { photo: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 32 },
  { id: 'survey', name: 'Survey', short: 'rich and compact', desc: 'Rich ground first, but without straying far from the explored edge: the best of both.', gold: 1500000, items: { page: 20, note: 12, photo: 12 }, levelGold: 2500000, levelItems: { note: 3, photo: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 38 },
];

/** Every route a save may name (the four directions were offered before; old maps still replay them). */
export const LEGACY_ROUTES: readonly RouteId[] = ['north', 'south', 'east', 'west'];

export const routeById = (id: string): RouteDef | undefined => ROUTES.find((r) => r.id === id);
