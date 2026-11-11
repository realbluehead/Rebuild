// Upgrades bought with bluetreri. Adding one = an entry here plus its effect in core/game.ts `stats()`.
export type StatId = 'speed' | 'radar' | 'cargo' | 'explorers';

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Engine', desc: 'Rovers travel and explore faster', baseCost: 6, costGrowth: 1.9 },
  { id: 'radar', name: 'Radar', desc: 'Detects pages, notes and photos in the dark; rovers go and fetch them', baseCost: 40, costGrowth: 3 },
  { id: 'cargo', name: 'Hold', desc: 'Each rover carries more bluetreri before returning to camp', baseCost: 25, costGrowth: 2.2 },
  { id: 'explorers', name: 'Rovers', desc: 'One more rover leaves camp', baseCost: 1000, costGrowth: 9 },
];

/** Effect of each level. */
export const BASE_SPEED = 0.18; // steps per second of each rover (a street cell every ~5.5 s; terrain roughness slows it)
export const SPEED_MULT = 1.25;
/** Radar range, in rings beyond where the rovers are (level 0 = no radar). */
export const radarRange = (level: number): number => (level > 0 ? 1 + 2 * level : 0);
/** Over known ground (to and from camp) rovers travel this many times faster. */
export const TRAVEL_MULT = 5;
/** Bluetreri each rover can carry before it has to return to camp to unload. */
export const BASE_CARGO = 5;
export const CARGO_MULT = 1.7;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
