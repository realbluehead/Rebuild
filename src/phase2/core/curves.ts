// What each building of the base is worth at each level: smooth curves (every level counts), used by the economy
// (core/economy.ts) and shown in the tabs. The upgrades in each facility file are what the level looks like.

export type BuildingId = 'telescope' | 'power' | 'refinery' | 'tanks' | 'antenna' | 'probes';
export const BUILDING_IDS: BuildingId[] = ['telescope', 'power', 'refinery', 'tanks', 'antenna', 'probes'];
/** Top level of each building (one upgrade per level in its facility file; facility.test.ts checks they agree). */
export const TOP_LEVEL: Record<BuildingId, number> = { telescope: 20, power: 20, refinery: 20, tanks: 20, antenna: 15, probes: 15 };

const curve = (base: number, growth: number) => (level: number): number => base * Math.pow(growth, Math.max(1, level) - 1);

/** Mirror tower output, MW. */
export const powerMW = curve(5, 1.22);
/** Refinery output, litres of fuel a minute. */
export const refineryLpm = curve(6, 1.33);
/** Tank farm capacity, litres. */
export const tanksL = curve(2000, 1.45);
/** How far the telescope sees, light years (a system must be seen to be targeted). */
export const telescopeLy = curve(6, 1.2);
/** How far the antenna hears a probe, light years (farther, it hears part of the data). */
export const antennaLy = curve(3, 1.3);
/** Data the antenna brings in from a probe, as a factor. */
export const antennaData = curve(1, 1.25);
/** How far a probe gets, light years (out and back). */
export const probeReachLy = curve(6, 1.22);
/** Probes launched an hour (while there is fuel). */
export const probesPerHour = curve(4, 1.2);
/** Probe cruise speed, light years an hour. */
export const probeSpeedLyH = curve(60, 1.12);
/** Fuel a launch burns, litres. */
export const probeFuelL = curve(200, 1.18);

/** Power each building draws at its level, MW, as a share of the tower's output at that level (the tower draws none):
 *  a base whose buildings outgrow the tower runs short of power. */
const DEMAND_SHARE: Record<BuildingId, number> = { telescope: 0.15, power: 0, refinery: 0.3, tanks: 0.05, antenna: 0.15, probes: 0.25 };
export const demandMW = (id: BuildingId, level: number): number => DEMAND_SHARE[id] * powerMW(level);

/** Metal for the upgrade that reaches `level` (2..top), before Ingenuity and research. */
const COST_BASE: Record<BuildingId, number> = { telescope: 1200, power: 1400, refinery: 1300, tanks: 1050, antenna: 2100, probes: 2350 };
export const COST_GROWTH = 1.6;
export const upgradeMetal = (id: BuildingId, level: number): number => COST_BASE[id] * Math.pow(COST_GROWTH, level - 2);
/** Crew time for the upgrade that reaches `level`, seconds, before Speed and research. */
export const upgradeSeconds = (_id: BuildingId, level: number): number => 30 * Math.pow(1.45, level - 2);
