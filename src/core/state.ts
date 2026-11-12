import { D, Decimal } from './decimal';
import { UPGRADES, type StatId } from '../content/upgrades';
import { ITEMS, WORKS, type ItemId, type WorkId } from '../content/collection';
import { randomSeed } from './rng';
import type { StormId } from '../content/weather';
import type { RouteId } from '../content/routes';

/** What a rover is doing: exploring its part of the ring, returning to camp to unload, heading back out to
 *  the frontier, or fetching an item the radar spotted. */
export type Trip = 'explore' | 'home' | 'out' | 'detour';

/** Each rover works on its own: it has its own cargo, its own trip and its own part (arc) of the current ring. */
export interface Bot {
  trip: Trip;
  /** Steps made along its arc of the current ring. */
  prog: number;
  /** Bluetreri it carries and has not unloaded yet. */
  cargo: number;
  /** Steps made on the current trip (return, departure or detour) and its total length. */
  travel: number;
  travelLen: number;
  /** Item (index into `world.itemRanks`) it is fetching, on a detour; otherwise -1. */
  target: number;
  /** Rank of the cell the detour started from (its path is revealed on the way); otherwise -1. */
  from: number;
  /** Pages, notes and photos it has picked up since it last left camp. */
  found: number;
}

export const newBot = (trip: Trip = 'explore', travelLen = 0): Bot => ({ trip, prog: 0, cargo: 0, travel: 0, travelLen, target: -1, from: -1, found: 0 });

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
  /** How many arcs the current ring is split into (one per rover; new rovers join on the next ring). */
  ringRobots: number;
  bots: Bot[];
  gold: Decimal;
  /** Total bluetreri earned since the start. */
  totalGold: Decimal;
  upgrades: Record<StatId, number>;
  /** Items found and not spent yet. */
  items: Record<ItemId, number>;
  /** Works made of each kind. */
  works: Record<WorkId, number>;
  /** Items (index into `world.itemRanks`) that a rover fetched, or is fetching, with the radar ahead of normal
   *  exploration, so exploring does not collect them again. Dropped once exploring has passed them. */
  fetched: number[];
  weather: Weather;
  /** Exploration routes unlocked, the one the player picked, and the ones applied so far: [ring, route] pairs (the
   *  map's order is rebuilt from them, since the world itself is never saved). */
  routes: RouteId[];
  route: RouteId;
  plan: [number, RouteId][];
  /** Paths walked on radar detours, ahead of normal exploration: flat triples [fromRank, toRank, maxRank]. Their
   *  cells show as revealed (no bluetreri: that still comes when exploring reaches them). Dropped once explored. */
  scouted: number[];
  /** Number of zoom levels unlocked (1..ZOOMS.length). */
  zoomUnlocked: number;
  /** Zoom being viewed (0 = the closest). */
  zoom: number;
  /** Accumulated play time, in seconds. */
  playTime: number;
  /** Old saves (v3 or earlier): total steps, converted once the world exists (`fromLegacy`). */
  legacyWalked?: number;
}

export function newGame(seed = randomSeed()): GameState {
  return {
    seed,
    ring: 0,
    ringRobots: 1,
    bots: [newBot()],
    gold: D(0),
    totalGold: D(0),
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<StatId, number>,
    items: Object.fromEntries(ITEMS.map((i) => [i.id, 0])) as Record<ItemId, number>,
    works: Object.fromEntries(WORKS.map((x) => [x.id, 0])) as Record<WorkId, number>,
    fetched: [],
    weather: { epoch: 0, storms: [], nextId: 0 },
    routes: ['circular'],
    route: 'circular',
    plan: [],
    scouted: [],
    zoomUnlocked: 1,
    zoom: 0,
    playTime: 0,
  };
}
