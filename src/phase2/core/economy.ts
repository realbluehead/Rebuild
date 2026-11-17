// Phase II's rules: what the base makes now (rates, constant until the next event: core/advance.ts) and what the
// player can do (upgrade, research, build a module, aim the probes, spend a point, launch the ship). Pure functions of
// the state; the actions change it and return whether they could.
import { D } from '../../shared/decimal';
import { ATTRS, attrFactor, expeditionLevel, pointsAt, type Attr } from './attributes';
import {
  antennaData, antennaLy, BUILDING_IDS, demandMW, powerMW, probeFuelL, probeReachLy, probesPerHour, probeSpeedLyH,
  refineryLpm, tanksL, telescopeLy, TOP_LEVEL, upgradeMetal, upgradeSeconds, type BuildingId,
} from './curves';
import { LAUNCH_FUEL, MODULES, moduleById, type Module } from './ship';
import { techById, TECHS, tierOpensAt, TIER_DATA, TIER_ITEM_SHARE, TIER_SECONDS, type Effect, type Tech } from './research';
import { destinationOf, starMap, STUDIES, type SampleKind, type StarSystem } from './starmap';
import type { P2State } from './state';

/** Metal the rovers salvage, a minute each (at full power, before research). */
export const METAL_PER_ROVER = 80;
/** Each study of a system tells the salvage crews where to dig: metal +SURVEY_BONUS each. */
export const SURVEY_BONUS = 0.04;
/** Data a probe brings back from each ring (before the antenna and research). */
export const RING_DATA = [3, 8, 25, 80];
/** Each building level past the first adds workshops to the base: metal +LEVEL_BONUS each. */
export const LEVEL_BONUS = 0.02;
/** Litres of fuel from one bluetreri. */
export const FUEL_PER_BLUETRERI = 1;

/** XP for each thing done. */
export const XP = { level: 5, tier: 25, probe: 1, study: 20, module: 150 };

/** The product of the research done for `effect`. */
export function researchMult(s: P2State, effect: Effect): number {
  let m = 1;
  for (const id of s.researched) {
    const t = techById(id);
    if (t?.effect === effect) m *= t.mult;
  }
  return m;
}

export const attr = (s: P2State, a: Attr): number => attrFactor(s.attrs[a], a);

export interface Rates {
  powerSupply: number;
  powerDemand: number;
  /** Share of the demand the tower covers (0..1): it slows everything that runs on power. */
  power: number;
  /** Per second. */
  metal: number;
  /** Litres a second the refinery makes (whether the tanks have room or not). */
  fuel: number;
  capacity: number;
  /** Light years: what the telescope sees, the antenna hears and a probe reaches; probe speed, ly/h. */
  sight: number;
  hear: number;
  reach: number;
  speed: number;
  /** Seconds between launches, and fuel a launch burns. */
  launchEvery: number;
  launchFuel: number;
  /** Data factor of the antenna, research and Endurance (probes that last longer study more). */
  dataMult: number;
  /** Samples a probe brings back once its system's kind is known (Endurance). */
  samples: number;
  /** How fast the crew and the lab work (1 = as listed), and what metal costs are divided by. */
  build: number;
  research: number;
  cost: number;
}

export function rates(s: P2State): Rates {
  const lv = s.levels;
  const strength = attr(s, 'strength');
  const powerSupply = powerMW(lv.power) * researchMult(s, 'power') * strength;
  let powerDemand = 0;
  for (const id of BUILDING_IDS) powerDemand += demandMW(id, lv[id]);
  const power = powerDemand > 0 ? Math.min(1, powerSupply / powerDemand) : 1;
  const studies = s.studies.reduce((a, b) => a + b, 0);
  const rovers = Math.max(1, s.legacy.rovers.length);
  let levels = 0;
  for (const id of BUILDING_IDS) levels += lv[id] - 1;
  return {
    powerSupply,
    powerDemand,
    power,
    metal: ((METAL_PER_ROVER * rovers) / 60) * researchMult(s, 'metal') * strength * (1 + SURVEY_BONUS * studies) * (1 + LEVEL_BONUS * levels) * power,
    fuel: (refineryLpm(lv.refinery) / 60) * researchMult(s, 'fuel') * strength * power,
    capacity: tanksL(lv.tanks) * researchMult(s, 'capacity') * attr(s, 'endurance'),
    sight: telescopeLy(lv.telescope) * attr(s, 'perception'),
    hear: antennaLy(lv.antenna) * attr(s, 'perception'),
    reach: probeReachLy(lv.probes) * researchMult(s, 'reach') * attr(s, 'endurance'),
    speed: probeSpeedLyH(lv.probes) * researchMult(s, 'speed') * attr(s, 'speed'),
    launchEvery: 3600 / (probesPerHour(lv.probes) * researchMult(s, 'launch') * attr(s, 'speed') * power),
    launchFuel: probeFuelL(lv.probes),
    dataMult: antennaData(lv.antenna) * researchMult(s, 'data') * attr(s, 'endurance'),
    samples: attr(s, 'endurance'),
    build: researchMult(s, 'build') * attr(s, 'speed'),
    research: researchMult(s, 'research') * attr(s, 'intelligence'),
    cost: researchMult(s, 'cost') * attr(s, 'ingenuity'),
  };
}

// ---- The star map and probes

export const systemsOf = (s: P2State): StarSystem[] => starMap(s.legacy.seed);
/** Seen (in the telescope's range, or already studied). */
export const isSeen = (s: P2State, sys: StarSystem, r = rates(s)): boolean => s.studies[sys.id] > 0 || sys.distance <= r.sight;
export const inReach = (sys: StarSystem, r: Rates): boolean => sys.distance <= r.reach;
export const canTarget = (s: P2State, id: number, r = rates(s)): boolean => {
  const sys = systemsOf(s)[id];
  return !!sys && isSeen(s, sys, r) && inReach(sys, r);
};
/** Seconds a probe takes out and back. */
export const tripSeconds = (sys: StarSystem, r: Rates): number => ((2 * sys.distance) / r.speed) * 3600;
/** Data a probe brings back from `sys` (part of it if the antenna hears it only partly). */
export const probeData = (sys: StarSystem, r: Rates): number => RING_DATA[sys.ring] * r.dataMult * Math.min(1, r.hear / sys.distance);

export function setTarget(s: P2State, id: number | null): boolean {
  if (id !== null && !canTarget(s, id)) return false;
  s.target = id;
  return true;
}

/** A new expedition's probes start at once: aims them at the nearest system they reach, if they were never aimed (no
 *  target, none out, nothing studied). Returns whether it aimed. */
export function aimFirst(s: P2State): boolean {
  if (s.target !== null || s.probes.length > 0 || s.studies.some((n) => n > 0)) return false;
  const r = rates(s);
  const near = systemsOf(s).filter((x) => canTarget(s, x.id, r)).sort((a, b) => a.distance - b.distance)[0];
  return !!near && setTarget(s, near.id);
}

/** A probe is back: data, the next study (XP), and once the system's kind is known, samples (a share of one more with
 *  each point of Endurance: counts are fractional, shown whole). */
export function probeBack(s: P2State, sys: StarSystem, r: Rates): void {
  s.data += probeData(sys, r);
  s.xp += XP.probe;
  if (s.studies[sys.id] < STUDIES) {
    s.studies[sys.id]++;
    s.xp += XP.study * (sys.ring + 1);
  }
  if (s.studies[sys.id] >= 2) s.samples[sys.kind] += r.samples;
}

// ---- Buildings

/** Metal for `id`'s next level, or null at its top. */
export function upgradeCost(s: P2State, id: BuildingId): number | null {
  const next = s.levels[id] + 1;
  if (next > TOP_LEVEL[id]) return null;
  return Math.ceil(upgradeMetal(id, next) / rates(s).cost);
}
export const crewFree = (s: P2State): boolean => s.crew === null && s.launchedAt === null;
export function canUpgrade(s: P2State, id: BuildingId): boolean {
  const c = upgradeCost(s, id);
  return c !== null && crewFree(s) && s.metal.gte(c);
}
export function upgrade(s: P2State, id: BuildingId): boolean {
  if (!canUpgrade(s, id)) return false;
  s.metal = s.metal.sub(upgradeCost(s, id)!);
  s.crew = { kind: 'building', id, left: upgradeSeconds(id, s.levels[id] + 1) };
  return true;
}

/** Hurrying the crew costs HURRY_RATE seconds of the base's metal for every second of work it saves (so waiting is
 *  always cheaper; hurrying trades metal for time). */
export const HURRY_RATE = 2;
/** Metal to finish the crew's job now (building or module), or null if the crew is free. */
export function hurryCost(s: P2State): number | null {
  if (!s.crew || s.launchedAt !== null) return null;
  const r = rates(s);
  return Math.max(1, Math.ceil((s.crew.left / r.build) * r.metal * HURRY_RATE));
}
export function canHurry(s: P2State): boolean {
  const c = hurryCost(s);
  return c !== null && s.metal.gte(c);
}
export function hurry(s: P2State): boolean {
  if (!canHurry(s)) return false;
  s.metal = s.metal.sub(hurryCost(s)!);
  jobDone(s);
  return true;
}

// ---- Research

export const tierOpen = (s: P2State, tier: number): boolean => s.researched.length >= tierOpensAt(tier);
export function techCost(s: P2State, t: Tech): { data: number; items: number } {
  return { data: TIER_DATA[t.tier - 1], items: Math.ceil(TIER_ITEM_SHARE[t.tier - 1] * s.legacy.items[t.item]) };
}
export function canResearch(s: P2State, id: string): boolean {
  const t = techById(id);
  if (!t || s.lab || s.launchedAt !== null || s.researched.includes(id) || !tierOpen(s, t.tier)) return false;
  const c = techCost(s, t);
  return s.data >= c.data && s.items[t.item] >= c.items;
}
export function research(s: P2State, id: string): boolean {
  if (!canResearch(s, id)) return false;
  const t = techById(id)!;
  const c = techCost(s, t);
  s.data -= c.data;
  s.items[t.item] -= c.items;
  s.lab = { id, left: TIER_SECONDS[t.tier - 1] };
  return true;
}
export const researchLeft = (s: P2State): Tech[] => TECHS.filter((t) => !s.researched.includes(t.id));

// ---- The ship

export const moduleMetal = (s: P2State, m: Module): number => Math.ceil(m.metal / rates(s).cost);
export function canBuildModule(s: P2State, id: string): boolean {
  const m = moduleById(id);
  if (!m || !crewFree(s) || s.modules.includes(id)) return false;
  if (s.metal.lt(moduleMetal(s, m)) || s.data < m.data) return false;
  return Object.entries(m.samples).every(([k, n]) => s.samples[k as SampleKind] >= (n ?? 0));
}
export function buildModule(s: P2State, id: string): boolean {
  if (!canBuildModule(s, id)) return false;
  const m = moduleById(id)!;
  s.metal = s.metal.sub(moduleMetal(s, m));
  s.data -= m.data;
  for (const [k, n] of Object.entries(m.samples)) s.samples[k as SampleKind] -= n ?? 0;
  s.crew = { kind: 'module', id, left: m.seconds };
  return true;
}
export const shipBuilt = (s: P2State): boolean => MODULES.every((m) => s.modules.includes(m.id));
export const destinationKnown = (s: P2State): boolean => s.studies[destinationOf(s.legacy.seed).id] >= STUDIES;
export const canLaunchShip = (s: P2State): boolean =>
  s.launchedAt === null && shipBuilt(s) && destinationKnown(s) && s.fuel >= LAUNCH_FUEL;
export function launchShip(s: P2State): boolean {
  if (!canLaunchShip(s)) return false;
  s.fuel -= LAUNCH_FUEL;
  s.launchedAt = s.playTime;
  return true;
}

// ---- Finished jobs (core/advance.ts calls these when their time is up)

export function jobDone(s: P2State): void {
  const job = s.crew;
  if (!job) return;
  s.crew = null;
  if (job.kind === 'building') {
    s.levels[job.id] = Math.min(TOP_LEVEL[job.id], s.levels[job.id] + 1);
    s.xp += XP.level * s.levels[job.id];
  } else if (!s.modules.includes(job.id)) {
    s.modules.push(job.id);
    s.xp += XP.module;
  }
}
export function researchDone(s: P2State): void {
  const lab = s.lab;
  if (!lab) return;
  s.lab = null;
  const t = techById(lab.id);
  if (t && !s.researched.includes(t.id)) {
    s.researched.push(t.id);
    s.xp += XP.tier * t.tier;
  }
}

// ---- Points

export const level = (s: P2State): number => expeditionLevel(s.xp).level;
export const pointsSpent = (s: P2State): number => Object.values(s.attrs).reduce((a, b) => a + b, 0);
export const pointsFree = (s: P2State): number => pointsAt(level(s)) - pointsSpent(s);
/** Works of the kind `a` takes still unused. */
export function worksLeft(s: P2State, a: Attr): number {
  const work = ATTRS.find((x) => x.id === a)!.work;
  const used = ATTRS.filter((x) => x.work === work).reduce((n, x) => n + s.attrs[x.id], 0);
  return s.legacy.works[work] - used;
}
export const canSpendPoint = (s: P2State, a: Attr): boolean => pointsFree(s) > 0 && worksLeft(s, a) > 0;
export function spendPoint(s: P2State, a: Attr): boolean {
  if (!canSpendPoint(s, a)) return false;
  s.attrs[a]++;
  return true;
}

/** Metal as a number (the economy's sums). */
export const metalNow = (s: P2State): number => s.metal.toNumber();
export const setMetal = (s: P2State, x: number): void => { s.metal = D(Math.max(0, x)); };
