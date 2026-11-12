// Exploration routes (discovery algorithms): the pattern rovers follow when they push into the dark. Circular is the
// starting one; the rest are unlocked with bluetreri plus collected items, and each can be levelled up (less entropy).
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
}

/** Levels lower an algorithm's entropy (noise, jitter and straying, see `ALGOS` in core/world.ts). */
export const ROUTE_MAX_LEVEL = 4;
export const ROUTE_LEVEL_GROWTH = 4;

/** Offered routes, from the least to the most efficient (measured with tools/routes.ts). */
export const ROUTES: readonly RouteDef[] = [
  { id: 'random', name: 'Random', short: 'wander from the edge', desc: 'Rovers wander off the explored edge in any direction. Cheap, but they zig-zag and waste steps.', gold: 300, items: { page: 3 }, levelGold: 400, levelItems: { page: 2 } },
  { id: 'circular', name: 'Circular', short: 'rings around camp', desc: 'Rings around camp: the nearest, easiest ground first. Levels follow the explored edge more closely.', gold: 0, items: {}, levelGold: 2000, levelItems: { page: 3 } },
  { id: 'trail', name: 'Trail', short: 'easy ground that pays', desc: 'Easy ground that still pays: streets and rich blocks before ruins, towers and water.', gold: 8000, items: { page: 10, note: 4 }, levelGold: 6000, levelItems: { note: 2 } },
  { id: 'prospect', name: 'Prospector', short: 'richest ground first', desc: 'Heads for the most bluetreri per step: deposits and rich blocks pull the rovers.', gold: 40000, items: { note: 8, photo: 8 }, levelGold: 30000, levelItems: { photo: 3 } },
  { id: 'survey', name: 'Survey', short: 'rich and compact', desc: 'Rich ground first, but without straying far from the explored edge: the best of both.', gold: 200000, items: { page: 20, note: 12, photo: 12 }, levelGold: 120000, levelItems: { note: 3, photo: 3 } },
];

/** Every route a save may name (the four directions were offered before; old maps still replay them). */
export const LEGACY_ROUTES: readonly RouteId[] = ['north', 'south', 'east', 'west'];

export const routeById = (id: string): RouteDef | undefined => ROUTES.find((r) => r.id === id);
