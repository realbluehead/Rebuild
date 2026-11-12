// Exploration routes: the pattern rovers follow when they push into the dark. Circular is the starting one; the
// rest are unlocked with bluetreri plus collected items. A new route takes over when the next ring starts.
import type { ItemId } from './collection';

export type RouteId = 'circular' | 'north' | 'south' | 'east' | 'west' | 'random';

export interface RouteDef {
  id: RouteId;
  name: string;
  /** Short line for the card. */
  short: string;
  desc: string;
  /** Unlock price: bluetreri plus items. */
  gold: number;
  items: Partial<Record<ItemId, number>>;
}

export const ROUTES: readonly RouteDef[] = [
  { id: 'circular', name: 'Circular', short: 'rings around camp', desc: 'Rings around camp, the nearest ground first.', gold: 0, items: {} },
  { id: 'north', name: 'North', short: 'push north', desc: 'Pushes north first; the rest of the map comes later.', gold: 300, items: { page: 8 } },
  { id: 'east', name: 'East', short: 'push east', desc: 'Pushes east first; the rest of the map comes later.', gold: 1500, items: { note: 4 } },
  { id: 'south', name: 'South', short: 'push south', desc: 'Pushes south first; the rest of the map comes later.', gold: 6000, items: { photo: 12 } },
  { id: 'west', name: 'West', short: 'push west', desc: 'Pushes west first; the rest of the map comes later.', gold: 25000, items: { page: 20 } },
  { id: 'random', name: 'Random', short: 'wandering fingers', desc: 'Wanders along easy valleys in long, unpredictable fingers.', gold: 100000, items: { note: 10, photo: 10 } },
];

export const routeById = (id: string): RouteDef | undefined => ROUTES.find((r) => r.id === id);
