// Phase II's state. It starts from phase I's `Legacy` (kept as it was, for reference) and the resources it hands over.
// Times are countdowns in seconds (nothing depends on the clock): core/advance.ts moves them on.
import { D, Decimal } from '../../shared/decimal';
import { noAttrs, type Attr } from './attributes';
import { BUILDING_IDS, tanksL, type BuildingId } from './curves';
import type { Legacy, LegacyItem } from './legacy';
import { PER_RING, RINGS, SAMPLE_KINDS, type SampleKind } from './starmap';

/** What the crew is building: a building's next level or a ship module. */
export type Job = { kind: 'building'; id: BuildingId; left: number } | { kind: 'module'; id: string; left: number };
/** A job waiting in the crew's queue (paid for when it starts). */
export type QueuedJob = { kind: 'building'; id: BuildingId } | { kind: 'module'; id: string };

export interface Probe {
  /** The system it went to, and seconds until it is back. */
  system: number;
  left: number;
}

export interface P2State {
  /** What phase I achieved, as it was when phase II began (never changed). */
  legacy: Legacy;
  /** Metal scraps: phase II's currency. */
  metal: Decimal;
  /** Bluetreri in the siphon's sump: all phase I brought up, refined into fuel. */
  bluetreri: Decimal;
  /** Pages, notes and photos brought over from phase I, spent on research. */
  items: Record<LegacyItem, number>;
  /** Play time in phase II, in seconds. */
  playTime: number;
  /** Each building's level (1..its top). */
  levels: Record<BuildingId, number>;
  /** The crew's job (one at a time), `left` in seconds of work. */
  crew: Job | null;
  /** What the crew builds next, in order (each started, and paid for, as soon as the crew is free and it is affordable). */
  queue: QueuedJob[];
  /** Research under way (one at a time), `left` in seconds of work, and research done. */
  lab: { id: string; left: number } | null;
  /** Research to start next, in order (like `queue`). */
  labQueue: string[];
  researched: string[];
  /** Ship modules built. */
  modules: string[];
  /** Fuel in the tanks, litres; data gathered; samples brought back by the probes. */
  fuel: number;
  data: number;
  samples: Record<SampleKind, number>;
  /** Studies of each star system (0..STUDIES), by its id. */
  studies: number[];
  /** Where the hangar sends its probes (a system id) or null; seconds until the launcher is ready again. */
  target: number | null;
  launchWait: number;
  /** Probes out in space. */
  probes: Probe[];
  /** Expedition XP and the points spent on each attribute. */
  xp: number;
  attrs: Record<Attr, number>;
  /** When the ship was launched (play time, seconds): the end of phase II. */
  launchedAt: number | null;
}

export const noSamples = (): Record<SampleKind, number> => Object.fromEntries(SAMPLE_KINDS.map((k) => [k, 0])) as Record<SampleKind, number>;
export const startLevels = (): Record<BuildingId, number> => Object.fromEntries(BUILDING_IDS.map((id) => [id, 1])) as Record<BuildingId, number>;
export const SYSTEMS = RINGS.length * PER_RING;

/** Phase II's start: phase I's resources at hand, every building at level 1, the barrels full. */
export function newPhase2(legacy: Legacy): P2State {
  const sump = Decimal.max(D(legacy.bluetreri), D(legacy.totalBluetreri));
  return {
    legacy,
    metal: D(legacy.metal),
    bluetreri: sump,
    items: { ...legacy.items },
    playTime: 0,
    levels: startLevels(),
    crew: null,
    queue: [],
    lab: null,
    labQueue: [],
    researched: [],
    modules: [],
    fuel: tanksL(1), // (the last barrels from phase I: the first probes can fly at once)
    data: 0,
    samples: noSamples(),
    studies: new Array(SYSTEMS).fill(0),
    target: null,
    launchWait: 0,
    probes: [],
    xp: 0,
    attrs: noAttrs(),
    launchedAt: null,
  };
}
