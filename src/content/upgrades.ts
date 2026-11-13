// Upgrades bought with bluetreri. Adding one = an entry here plus its effect in core/game.ts `stats()`.
// Every upgrade is bought for one rover; each kind of rover only has the parts it uses (`ROVER_KINDS[k].parts`).
export type StatId = 'speed' | 'tyres' | 'body' | 'cargo' | 'radar' | 'drill';
export type RoverStat = StatId;
export const ROVER_STATS: readonly RoverStat[] = ['speed', 'tyres', 'body', 'cargo', 'radar', 'drill'];

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Engine', desc: 'Rovers travel and explore faster', baseCost: 1.5, costGrowth: 1.9 },
  { id: 'tyres', name: 'Tires', desc: 'Grip on rough ground: rubble, jungle, ruins and towers slow rovers down less', baseCost: 7.5, costGrowth: 2.1 },
  { id: 'body', name: 'Body', desc: 'Armour against acid storms, snow and lightning: storms slow rovers down less', baseCost: 15, costGrowth: 2.3 },
  { id: 'cargo', name: 'Hold', desc: 'Each rover carries more bluetreri before returning to camp', baseCost: 6, costGrowth: 2.2 },
  { id: 'radar', name: 'Radar', desc: 'Each rover detects pages, notes and photos around it in the dark and goes to fetch them', baseCost: 10, costGrowth: 3 },
  { id: 'drill', name: 'Drill', desc: 'The Miner digs the bluetreri out of each cell faster', baseCost: 20, costGrowth: 2.1 },
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

/** Drill: bluetreri (before multipliers) the Miner digs out per step of work at level 0, and the gain per level. */
export const BASE_DRILL = 2;
export const DRILL_MULT = 1.4;

/** The three kinds of rover (at most one of each). The Scout explores: it is the only one that reveals the map, but its
 *  drill only scratches each cell (`share` of its bluetreri). The Miner follows behind and digs out the rest of every
 *  cell the Scout revealed. The Hauler mines nothing: it drives out to the others and brings their load to camp. */
export type RoverKind = 'scout' | 'miner' | 'hauler';
export interface RoverKindDef {
  id: RoverKind;
  name: string;
  desc: string;
  /** Multipliers on the base speed and hold. */
  speed: number;
  cargo: number;
  /** Parts that can be upgraded on it. */
  parts: readonly RoverStat[];
  /** Price and explorer level to build it (the Scout comes with the expedition). */
  gold: number;
  level: number;
}
export const ROVER_KINDS: readonly RoverKindDef[] = [
  { id: 'scout', name: 'Scout', desc: 'Fast, tiny hold. Explores the dark and scratches a little bluetreri from each cell.', speed: 3, cargo: 0.6, parts: ['speed', 'tyres', 'body', 'cargo', 'radar'], gold: 0, level: 0 },
  { id: 'miner', name: 'Miner', desc: 'Slow, medium hold. Digs out the bluetreri the Scout left behind in every cell it revealed.', speed: 2, cargo: 2, parts: ['speed', 'drill', 'tyres', 'cargo'], gold: 1000, level: 14 },
  { id: 'hauler', name: 'Hauler', desc: 'Very slow, huge hold, no drill. Drives out to the other rovers and brings their load to camp, so they keep working.', speed: 0.3, cargo: 12, parts: ['speed', 'cargo'], gold: 20000, level: 26 },
];
export const kindById = (id: RoverKind): RoverKindDef => ROVER_KINDS.find((k) => k.id === id)!;
/** Share of each cell's bluetreri the Scout's drill takes as it explores (the Miner digs out the rest). */
export const SCOUT_SHARE = 0.4;
/** The Hauler leaves camp for a rover whose hold is at least this full (the player picks one; 0.5 by default). */
export const HAUL_AT = 0.5;
export const HAUL_LEVELS: readonly number[] = [0.3, 0.5, 0.8];
/** Which rover the Hauler drives to when several are full enough: the fullest, or one of them first. */
export type HaulPick = 'fullest' | 'scout' | 'miner';
/** How the Miner digs each ring: behind the Scout in its order, or the richest cells (deposits) first. Rich first only
 *  digs rings the Scout has finished, and hops between cells (`RICH_HOP`× the steps). */
export type DigOrder = 'follow' | 'rich';
export const RICH_HOP = 1.4;
/** A Miner that has caught up with the Scout waits until this many revealed cells are ahead of it. */
export const MINER_GAP = 8;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
