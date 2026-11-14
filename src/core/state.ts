import { D, Decimal } from './decimal';
import { ROVER_STATS, UPGRADES, type RoverStat, type StatId } from '../content/upgrades';
import { ITEMS, WORKS, type ItemId, type WorkId } from '../content/collection';
import { randomSeed } from './rng';
import type { StormId } from '../content/weather';
import type { RouteId } from '../content/routes';
import type { DigOrder, HaulPick, RoverKind } from '../content/upgrades';
import { GOALS, type GoalId } from '../content/goals';
import type { PlanEntry } from './world';

/** What a rover is doing: working (the Scout exploring, the Miner digging), returning to camp to unload, heading back
 *  out (the Hauler: to the rover it picks up from), fetching an item the radar spotted (Scout), or parked at camp
 *  (the Hauler between runs; everyone once the map is done). */
export type Trip = 'explore' | 'home' | 'out' | 'detour' | 'idle';

/** Each rover works on its own: it has its own cargo and its own trip. */
export interface Bot {
  kind: RoverKind;
  trip: Trip;
  /** Steps made along its arc of the current ring. */
  prog: number;
  /** Bluetreri it carries and has not unloaded yet. */
  cargo: number;
  /** Steps made on the current trip (return, departure or detour) and its total length. A detour walks to the item
   *  at exploring pace (each cell costs what exploring it costs) and back the same way (see `detourPlan`). */
  travel: number;
  travelLen: number;
  /** Item (index into `world.itemRanks`) it is fetching, on a detour; for the Hauler on its way out, the rover (index
   *  into `bots`) it is driving to; otherwise -1. */
  target: number;
  /** Rank of the cell the detour started from (its path is revealed on the way); for the Hauler, the rank where it
   *  meets the rover it drives to; otherwise -1. */
  from: number;
  /** Pages, notes and photos it has picked up since it last left camp. */
  found: number;
  /** Those items by kind (index into ITEMS): they are the player's only once the rover unloads at camp. */
  bag: number[];
  /** On a detour: cells of its path reached so far (each one mined on arrival). */
  walked: number;
  /** Its record since it joined (for the fleet screen). */
  log: BotLog;
  /** Levels bought for this rover alone, on top of the fleet's base levels (`GameState.upgrades`). */
  up: Record<RoverStat, number>;
  /** Exploration route it follows in its slice of the map, from the next ring (one of `GameState.routes`). */
  route: RouteId;
}

/** A rover's lifetime record. Saves from before it existed start at 0, with `since` -1 (unknown). */
export interface BotLog {
  /** Play time when it left camp for the first time (-1: before records were kept). */
  since: number;
  /** Cells it explored or mined on detours. */
  cells: number;
  /** Steps it walked (exploring, detours and trips). */
  steps: number;
  /** Bluetreri it brought to camp, and its biggest single load. */
  gold: number;
  best: number;
  /** Pages, notes and photos it picked up. */
  items: number;
  /** Trips to camp to unload. */
  trips: number;
  /** Radar detours finished, and given up because the hold filled. */
  detours: number;
  gaveUp: number;
}

export const newLog = (since = 0): BotLog => ({ since, cells: 0, steps: 0, gold: 0, best: 0, items: 0, trips: 0, detours: 0, gaveUp: 0 });

export const newBot = (trip: Trip = 'explore', travelLen = 0, since = 0, kind: RoverKind = 'scout'): Bot =>
  ({ kind, trip, prog: 0, cargo: 0, travel: 0, travelLen, target: -1, from: -1, found: 0, bag: [0, 0, 0], walked: 0, log: newLog(since), up: newUp(), route: 'random' });

export const newUp = (): Record<RoverStat, number> => Object.fromEntries(ROVER_STATS.map((id) => [id, 0])) as Record<RoverStat, number>;

/** A storm drifting over the map: an irregular blob of about `r` cells around (x, y). */
export interface Storm {
  id: number;
  kind: StormId;
  x: number;
  y: number;
  /** Its own drift per weather step (the shared wind is added on top). */
  vx: number;
  vy: number;
  /** Current radius, and the full one it grows to. */
  r: number;
  size: number;
  /** Weather steps lived, and how many it will last. */
  age: number;
  life: number;
  severe: boolean;
}

/** The sky at one weather step (see content/weather.ts). */
export interface Weather {
  epoch: number;
  storms: Storm[];
  /** Id for the next storm that forms. */
  nextId: number;
}

export interface GameState {
  /** Map seed: the world is regenerated from it. */
  seed: number;
  /** Ring being explored now (all earlier ones are fully revealed). */
  ring: number;
  /** How many arcs the current ring is split into (1: only the Scout explores; older saves had one per rover). */
  ringRobots: number;
  /** The Scout first, then the Miner and the Hauler once built. */
  bots: Bot[];
  /** Rank up to which the Miner has dug out every cell (with fraction): cells revealed beyond it still hold what the
   *  Scout left. */
  dug: number;
  /** Dig order of the ring the Miner is on, and the one picked (it takes over at the next ring the Miner starts). */
  digOrder: DigOrder;
  digPick: DigOrder;
  /** Hauler policy: how full a hold must be before it drives out, and which rover it goes to first. */
  haulAt: number;
  haulPick: HaulPick;
  gold: Decimal;
  /** Total bluetreri earned since the start. */
  totalGold: Decimal;
  /** The fleet's base level of every upgrade (levels bought before they were per rover, save v14; each rover adds its
   *  own `Bot.up`). */
  upgrades: Record<StatId, number>;
  /** Items found and not spent yet. */
  items: Record<ItemId, number>;
  /** Works made of each kind. */
  works: Record<WorkId, number>;
  /** Tiers claimed of each goal (0..GOAL_TIERS): each one multiplies its stat. */
  goals: Record<GoalId, number>;
  /** Items (index into `world.itemRanks`) that a rover fetched, or is fetching, with the radar ahead of normal
   *  exploration, so exploring does not collect them again. Dropped once exploring has passed them. */
  fetched: number[];
  weather: Weather;
  /** Exploration routes unlocked, and the one last picked (new rovers follow it; each rover has its own `Bot.route`). */
  routes: RouteId[];
  route: RouteId;
  /** Entropy level bought for each route (missing = 0): higher levels stray less. */
  routeLevels: Partial<Record<RouteId, number>>;
  /** Routes applied so far (the map's order is rebuilt from them, since the world itself is never saved): [ring, route,
   *  level] entries, or [ring, [route, level] per rover] when the rovers follow different routes; saves from before
   *  levels have [ring, route] (legacy fields, see `applyPlan`). */
  plan: PlanEntry[];
  /** Cells (map indices) mined on radar detours ahead of normal exploration: exploring gets no bluetreri from them.
   *  Dropped once exploring has passed them. */
  mined: number[];
  /** Paths walked on radar detours, ahead of normal exploration: flat triples [fromRank, toRank, maxRank]. Their
   *  cells show as revealed (no bluetreri: that still comes when exploring reaches them). Dropped once explored. */
  scouted: number[];
  /** Number of zoom levels unlocked (1..ZOOMS.length). */
  zoomUnlocked: number;
  /** Zoom being viewed (0 = the closest). */
  zoom: number;
  /** Accumulated play time, in seconds. */
  playTime: number;
  /** Scraps of lore (index into `world.loreCells`) run through the Library's machine and printed (readable). */
  printed: number[];
  /** The Decoder's switch: while on, it takes the next scrap found as soon as it is free (it turns off when none is left). */
  decodeOn: boolean;
  /** The scrap in the Decoder (index into `world.loreCells`), or -1, and the seconds it still needs. */
  decoding: number;
  decodeLeft: number;
  /** The Metal detector (I+D): -1 until bought; then the rank from which the Scout picks up the scraps it reveals (cells
   *  revealed before it are picked up by the Miner as it digs them). */
  detectFrom: number;
  /** Metal scraps that were already revealed and dug when the detector was bought (not counted as collected). */
  metalBase: number;
  /** Play time when the whole map was explored and every bluetreri was back at camp (unset until then). */
  doneAt?: number;
  /** Saves from before v9: items are recounted at today's prices once the world exists (`recountItems`). */
  recount?: boolean;
  /** Saves from before rover kinds (v15): the current ring restarts for the Scout alone once the world exists
   *  (`toKinds`). */
  kinds?: boolean;
  /** Old saves (v3 or earlier): total steps, converted once the world exists (`fromLegacy`). */
  legacyWalked?: number;
}

export function newGame(seed = randomSeed()): GameState {
  return {
    seed,
    ring: 0,
    ringRobots: 1,
    bots: [newBot()],
    dug: 0,
    digOrder: 'follow',
    digPick: 'follow',
    haulAt: 0.5,
    haulPick: 'fullest',
    gold: D(0),
    totalGold: D(0),
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<StatId, number>,
    items: Object.fromEntries(ITEMS.map((i) => [i.id, 0])) as Record<ItemId, number>,
    works: Object.fromEntries(WORKS.map((x) => [x.id, 0])) as Record<WorkId, number>,
    goals: Object.fromEntries(GOALS.map((g) => [g.id, 0])) as Record<GoalId, number>,
    fetched: [],
    printed: [],
    decodeOn: false,
    decoding: -1,
    decodeLeft: 0,
    detectFrom: -1,
    metalBase: 0,
    weather: { epoch: 0, storms: [], nextId: 0 },
    routes: ['random'],
    route: 'random', // the starting route: it takes over when the first ring after camp starts
    routeLevels: {},
    plan: [],
    scouted: [],
    mined: [],
    zoomUnlocked: 1,
    zoom: 0,
    playTime: 0,
  };
}
