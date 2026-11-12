// Upgrades bought with bluetreri. Adding one = an entry here plus its effect in core/game.ts `stats()`.
export type StatId = 'speed' | 'tyres' | 'body' | 'cargo' | 'radar' | 'explorers';

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Engine', desc: 'Rovers travel and explore faster', baseCost: 6, costGrowth: 1.9 },
  { id: 'tyres', name: 'Tyres', desc: 'Grip on rough ground: rubble, jungle, ruins and towers slow rovers down less', baseCost: 30, costGrowth: 2.1 },
  { id: 'body', name: 'Body', desc: 'Armour against acid storms, snow and lightning: storms slow rovers down less', baseCost: 60, costGrowth: 2.3 },
  { id: 'cargo', name: 'Hold', desc: 'Each rover carries more bluetreri before returning to camp', baseCost: 25, costGrowth: 2.2 },
  { id: 'radar', name: 'Radar', desc: 'Each rover detects pages, notes and photos around it in the dark and goes to fetch them', baseCost: 40, costGrowth: 3 },
  { id: 'explorers', name: 'Rovers', desc: 'One more rover leaves camp', baseCost: 1000, costGrowth: 9 },
];

/** Effect of each level. */
export const BASE_SPEED = 0.18; // steps per second of each rover (a street cell every ~5.5 s; terrain roughness slows it)
export const SPEED_MULT = 1.25;
/** Radar range, in cells around each rover (level 0 = no radar). */
export const radarRange = (level: number): number => (level > 0 ? 2 + 3 * level : 0);
/** Over known ground (to and from camp) rovers travel this many times faster. */
export const TRAVEL_MULT = 5;
/** A loaded rover drives home slower: travel speed / (1 + LOAD_DRAG x how full its hold is). */
export const LOAD_DRAG = 2;
/** Tyres: share of each terrain's extra roughness still felt, per level. */
export const GRIP_MULT = 0.85;
/** Body: share of a storm's slowdown still felt, per level. */
export const ARMOUR_MULT = 0.82;
/** Bluetreri each rover can carry before it has to return to camp to unload. */
export const BASE_CARGO = 5;
export const CARGO_MULT = 1.7;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
