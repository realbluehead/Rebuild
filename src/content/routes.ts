// Exploration routes (discovery algorithms): the pattern the Scout follows when it pushes into the dark (the Miner digs
// behind it, in its own dig order). Random is the
// free starting one (no levels); the rest are upgrades, unlocked with bluetreri once enough items have been collected (they are not spent), and each can be levelled up (less entropy).
// The list goes from the least to the most efficient (measured with tools/routes.ts). A change takes over at the next ring.
import type { ItemId } from './collection';

/** Discovery algorithms. north/south/east/west only remain so old saves can rebuild their map; they are not offered. */
export type RouteId = 'random' | 'circular' | 'trail' | 'scavenge' | 'prospect' | 'survey' | 'north' | 'south' | 'east' | 'west';

export interface RouteDef {
  id: RouteId;
  name: string;
  /** Short line for the card. */
  short: string;
  desc: string;
  /** Unlock price in bluetreri, and the items it asks to have collected in total (not spent). */
  gold: number;
  items: Partial<Record<ItemId, number>>;
  /** First level's price (bluetreri grows by ROUTE_LEVEL_GROWTH per level); level k adds `levelItems × k` to the items needed. */
  levelGold: number;
  levelItems: Partial<Record<ItemId, number>>;
  /** Highest level (0 = no levels). */
  maxLevel: number;
  /** Scout speed multiplier while it follows this route (planned paths): `pace × ROUTE_PACE_LEVEL^level`. */
  pace: number;
  /** Explorer level needed to unlock it; level k of the route needs `minLevel + ROUTE_LEVEL_STEP × k`. */
  minLevel: number;
}

/** Levels lower an algorithm's entropy (noise, jitter and straying, see `ALGOS` in core/world.ts). */
/** Explorer levels between one route level and the next. */
export const ROUTE_LEVEL_STEP = 2;
export const ROUTE_MAX_LEVEL = 4;
export const ROUTE_LEVEL_GROWTH = 3.5;
/** Scout speed per route level (on top of the route's `pace`). */
export const ROUTE_PACE_LEVEL = 1.03;

/** Offered routes, roughly from the least to the most efficient at bluetreri (measured with tools/routes.ts); the Scavenger
 *  trades some of it for pages, notes and photos sooner. */
export const ROUTES: readonly RouteDef[] = [
  { id: 'random', name: 'Random', short: 'wander from the edge', desc: 'The Scout\'s first instinct: wander off the explored edge in any direction. It zig-zags and leaves patches half done, so the Miner has to wait for them.', gold: 0, items: {}, levelGold: 0, levelItems: {}, maxLevel: 0, minLevel: 0, pace: 1 },
  { id: 'circular', name: 'Circular', short: 'rings around camp', desc: 'Rings around camp: the nearest, easiest ground first, so trips home stay short and the Miner digs right behind. Levels follow the explored edge more closely.', gold: 80, items: {}, levelGold: 1500, levelItems: { page: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 6, pace: 1.03 },
  { id: 'trail', name: 'Trail', short: 'most ground per step', desc: 'Easy ground that still pays: streets and rich blocks before ruins, towers and water. The Scout reveals the most cells for its steps.', gold: 6000, items: { page: 8, note: 3 }, levelGold: 12000, levelItems: { note: 2 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 24, pace: 1.12 },
  { id: 'scavenge', name: 'Scavenger', short: 'pages, notes and photos', desc: 'Heads for the ground where pages, notes and photos lie thickest: the Scout finds items (and the works they make) sooner, for a bit less bluetreri.', gold: 30000, items: { page: 12, note: 5 }, levelGold: 50000, levelItems: { page: 4 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 28, pace: 1.06 },
  { id: 'prospect', name: 'Prospector', short: 'richest ground first', desc: 'Heads for the most bluetreri per step: deposits and rich blocks pull the Scout, and the Miner finds them dug open.', gold: 100000, items: { note: 8, photo: 8 }, levelGold: 160000, levelItems: { photo: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 32, pace: 1.24 },
  { id: 'survey', name: 'Survey', short: 'rich and compact', desc: 'Rich ground first, but without straying far from the explored edge: the best of both, for the Scout and the Miner.', gold: 1500000, items: { page: 20, note: 12, photo: 12 }, levelGold: 2500000, levelItems: { note: 3, photo: 3 }, maxLevel: ROUTE_MAX_LEVEL, minLevel: 38, pace: 1.5 },
];

/** Every route a save may name (the four directions were offered before; old maps still replay them). */
export const LEGACY_ROUTES: readonly RouteId[] = ['north', 'south', 'east', 'west'];

export const routeById = (id: string): RouteDef | undefined => ROUTES.find((r) => r.id === id);
