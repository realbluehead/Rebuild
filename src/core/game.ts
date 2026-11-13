// Pure simulation: no DOM, clock or storage access. Everything is testable.
//
// Three kinds of rover, at most one of each. The Scout explores the current ring at its own pace (terrain roughness and
// storms slow it down), taking a share of each cell's bluetreri as it goes; its radar spots items around it and it
// leaves its way to fetch them. The Miner follows behind over the revealed cells, in the same order, digging out what
// the Scout left (`GameState.dug`); it waits when it catches up. When a hold is full, the rover drives back to camp
// (slower the more it carries) to unload and heads out again, unless the Hauler is already on its way to pick the load
// up there. The Hauler waits at camp until a rover's hold is half full, drives out to it, takes its load and brings it
// to camp. `tick` processes events (hold full, ring done, trip done, arriving at a cell where the weather changes or
// the radar spots something, the Scout getting far enough ahead of a waiting Miner, the sky changing) in time order,
// so one long step (offline) gives the same result as many short ones.
import { D, Decimal } from './decimal';
import { newBot, type Bot, type GameState } from './state';
import { ROVER_STATS, ARMOUR_MULT, BASE_CARGO, BASE_DRILL, BASE_SPEED, CARGO_MULT, DRILL_MULT, GRIP_MULT, HAUL_AT, kindById, LOAD_DRAG, MINER_GAP, radarRange, ROVER_KINDS, SCOUT_SHARE, SPEED_MULT, TRAVEL_MULT, upgradeById, type RoverKind, type StatId, type UpgradeDef } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { WEATHER_EPOCH, WEATHER_FROM_RING } from '../content/weather';
import { workById, ITEMS, LIBRARY_SHARE, WORK_LEVEL_FIRST, WORK_LEVEL_LAST, WORKS, WORKS_MAX, type ItemId, type WorkId } from '../content/collection';
import { ROUTE_LEVEL_GROWTH, ROUTE_LEVEL_STEP, ROUTES, routeById, type RouteId } from '../content/routes';
import { arcOf, arcStarts, goldBetween, planEntry, planSectors, type Sector, cellsReached, itemsBetween, nearestItem, pathCells, prefixAt, reorder, ringAt, ringCount, specialsBetween, stepsAt, stepsForReach, totalCells, unlockAt, type World } from './world';
import { evolveWeather, weatherFactor } from './weather';
import { GOAL_TIERS, GOALS, goalById, type GoalId, type GoalReward } from '../content/goals';

export const TICK_RATE = 10; // ticks per second
export const TICK_SEC = 1 / TICK_RATE;
const EPS = 1e-9;

export interface Stats {
  /** Steps per second of each rover while exploring (clear sky). */
  speed: number;
  /** Steps per second of each rover over known ground (going to or from camp, empty). */
  travelSpeed: number;
  /** Bluetreri multiplier (records). */
  loot: number;
  /** Radar range in cells around each rover (0 = no radar). */
  radar: number;
  /** Bluetreri each rover can carry. */
  cargo: number;
  /** Share of each terrain's extra roughness still felt (tyres; 1 = none). */
  grip: number;
  /** Share of a storm's slowdown still felt (body; 1 = none). */
  armour: number;
  /** Share of each cell's bluetreri it takes on its pass (Scout: a scratch; Miner: what is left; Hauler: none). */
  share: number;
  /** Miner: bluetreri (before multipliers) it digs out per step of work (0 for the others). */
  drill: number;
}

/** Stats of rover `b` (the fleet's base levels plus its own, by its kind; by default the Scout). */
export function stats(s: GameState, b: Bot | undefined = s.bots[0]): Stats {
  const u = { ...s.upgrades };
  if (b) for (const id of ROVER_STATS) u[id] += b.up[id];
  const kind = b?.kind ?? 'scout';
  const kd = kindById(kind);
  const wk = (id: WorkId) => workById(id).bonus ** s.works[id];
  const gb = (r: GoalReward) => goalBonus(s, r);
  const speed = BASE_SPEED * SPEED_MULT ** u.speed * wk('book') * kd.speed * gb('speed');
  const loot = wk('cd') * gb('loot');
  const cargo = BASE_CARGO * CARGO_MULT ** u.cargo * wk('album') * kd.cargo * gb('cargo');
  return {
    speed, travelSpeed: speed * TRAVEL_MULT * gb('travel'), loot, radar: kind === 'scout' ? radarRange(u.radar) : 0, cargo,
    grip: GRIP_MULT ** u.tyres, armour: ARMOUR_MULT ** u.body,
    share: kind === 'scout' ? SCOUT_SHARE : kind === 'miner' ? 1 - SCOUT_SHARE : 0,
    drill: kind === 'miner' ? BASE_DRILL * DRILL_MULT ** u.drill * gb('drill') : 0,
  };
}

/** Multiplier from the claimed tiers of the goals that reward `r`. */
export function goalBonus(s: GameState, r: GoalReward): number {
  let m = 1;
  for (const g of GOALS) if (g.reward === r) m *= g.mult ** (s.goals[g.id] ?? 0);
  return m;
}

/** What goal `id` counts right now. */
export function goalValue(s: GameState, w: World, id: GoalId): number {
  switch (id) {
    case 'cartographer': return explored(s, w);
    case 'tycoon': return s.totalGold.toNumber();
    case 'collector': return Object.values(itemsCollected(s, w)).reduce((a, b) => a + b, 0);
    case 'excavator': return s.dug;
    case 'engineer': return s.bots.reduce((a, b) => a + ROVER_STATS.reduce((x, k) => x + levelOn(s, k, b), 0), 0);
  }
}

/** Threshold of tier `k` (0-based) of goal `id` on this map. */
export function goalTarget(w: World, id: GoalId, k: number): number {
  const g = goalById(id);
  const t = g.tiers[Math.min(k, GOAL_TIERS - 1)];
  if (g.per === 'cells') return Math.max(1, Math.ceil(t * totalCells(w)));
  if (g.per === 'items') return Math.max(1, Math.ceil(t * w.itemRanks.length));
  return t;
}

/** Tiers of goal `id` reached (claimed or not). */
export function goalReached(s: GameState, w: World, id: GoalId): number {
  const v = goalValue(s, w, id);
  let k = 0;
  while (k < GOAL_TIERS && v >= goalTarget(w, id, k) - 1e-6) k++;
  return k;
}

export const canClaim = (s: GameState, w: World, id: GoalId): boolean => s.goals[id] < goalReached(s, w, id);

/** Claims the next tier of goal `id`: its multiplier takes effect now. */
export function claimGoal(s: GameState, w: World, id: GoalId): boolean {
  if (!canClaim(s, w, id)) return false;
  s.goals[id]++;
  return true;
}

/** Level of upgrade `id` on rover `b` (the fleet's base plus its own). */
export const levelOn = (s: GameState, id: StatId, b?: Bot): number => s.upgrades[id] + (b ? b.up[id] : 0);

/** The rover of kind `k` (index into `bots`), or -1 while it is not built. */
export const roverIndex = (s: GameState, k: RoverKind): number => s.bots.findIndex((b) => b.kind === k);

/** Bluetreri all rovers can carry together. */
export const capacity = (s: GameState): number => s.bots.reduce((a, b) => a + stats(s, b).cargo, 0);

/** Exploring steps per second (the Scout's, clear sky). */
export const fleetSpeed = (s: GameState): number => stats(s).speed;

/** Bluetreri all rovers are carrying right now. */
export const carried = (s: GameState): number => s.bots.reduce((a, b) => a + b.cargo, 0);

/** Steps from camp to the cell of rank `r` along the roads (by default the start of the current ring). */
export function homeDistance(s: GameState, w: World, r = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w) - 1): number {
  return Math.floor(w.road[w.order[Math.min(r, totalCells(w) - 1)]]) + 1;
}

/** Speed of a rover driving home with `cargo` on board (`st.cargo` = full hold). */
export const homeSpeed = (st: Stats, cargo: number): number => st.travelSpeed / (1 + LOAD_DRAG * Math.min(1, cargo / st.cargo));

interface Arc { lo: number; hi: number; len: number }

/** Progress of the current ring: where it starts and ends, where each arc starts and how far its rover has got. */
export interface Progress {
  ring: number;
  a: number;
  b: number;
  /** starts[k] = first rank of arc k (one extra value: the ring's end). */
  starts: number[];
  /** reach[k] = cells covered (with fraction) inside arc k. */
  reach: number[];
  /** robotOf[k] = index (into `bots`) of the rover working arc k. */
  robotOf: number[];
}

export function progress(s: GameState, w: World): Progress {
  if (s.ring >= ringCount(w)) {
    const n = totalCells(w);
    return { ring: s.ring, a: n, b: n, starts: [n], reach: [], robotOf: [] };
  }
  const starts = arcStarts(w, s.ring, s.ringRobots);
  const arcs = starts.length - 1;
  const robotOf: number[] = [];
  const reach: number[] = [];
  for (let k = 0; k < arcs; k++) {
    const j = arcOf(s.ring, k, arcs);
    robotOf.push(j);
    const grip = stats(s, s.bots[j]).grip;
    const arc = { lo: starts[k], hi: starts[k + 1], len: stepsAt(w, grip, starts[k + 1]) - stepsAt(w, grip, starts[k]) };
    reach.push(arcReach(w, grip, arc, s.bots[j]?.prog ?? 0));
  }
  return { ring: s.ring, a: w.rings[s.ring], b: w.rings[s.ring + 1], starts, reach, robotOf };
}

/** Cells revealed (with fraction). */
export function explored(s: GameState, w: World): number {
  const p = progress(s, w);
  return p.a + p.reach.reduce((x, y) => x + y, 0);
}

/** Explorer level: XP = cells explored, each level needs `LEVEL_GROWTH`× the cells of the one before (level 1 at
 * `LEVEL_FIRST` cells). The whole map is the top level, `max`, so early levels come fast and later ones far apart. */
export const LEVEL_FIRST = 10;
export const LEVEL_GROWTH = 1.3;
export interface ExplorerLevel { level: number; max: number; from: number; to: number; frac: number }
export function explorerLevel(cells: number, total: number): ExplorerLevel {
  const at = (L: number) => (L <= 0 ? 0 : L >= max ? total : LEVEL_FIRST * LEVEL_GROWTH ** (L - 1));
  const max = Math.floor(Math.log(total / LEVEL_FIRST) / Math.log(LEVEL_GROWTH)) + 1;
  let level = cells < LEVEL_FIRST ? 0 : Math.min(max - 1, Math.floor(Math.log(cells / LEVEL_FIRST) / Math.log(LEVEL_GROWTH)) + 1);
  if (cells >= total) level = max;
  const from = at(level);
  const to = level >= max ? total : at(level + 1);
  return { level, max, from, to, frac: level >= max ? 1 : Math.min(1, Math.max(0, (cells - from) / (to - from))) };
}

/** Whether some rover has already stepped on the cell of rank r. */
export function revealed(s: GameState, w: World, r: number, p = progress(s, w)): boolean {
  if (r < p.a) return true;
  if (r >= p.b) return false;
  let k = p.reach.length - 1;
  while (k > 0 && p.starts[k] > r) k--;
  return r < p.starts[k] + Math.floor(p.reach[k]);
}

/** Rank of the cell each rover is on (exploring: its arc position; otherwise where it left its arc), or -1. */
export function botCells(s: GameState, w: World): number[] {
  const p = progress(s, w);
  return s.bots.map((_, j) => {
    const k = p.robotOf.indexOf(j);
    return k < 0 ? -1 : Math.min(p.starts[k + 1] - 1, p.starts[k] + Math.floor(p.reach[k] + 1e-7));
  });
}

/** Map explored, every load at camp and, if there is a Miner, every cell dug out. */
export const isComplete = (s: GameState, w: World): boolean =>
  s.ring >= ringCount(w) && (roverIndex(s, 'miner') < 0 || s.dug >= totalCells(w) - EPS)
  && s.bots.every((b) => (b.kind === 'scout' ? b.trip === 'explore' : b.trip === 'idle') && b.cargo <= 0 && b.found <= 0);

/** First rank the Scout has not revealed yet (everything before it is revealed, detours aside). */
export function frontier(s: GameState, w: World, p = progress(s, w)): number {
  if (s.ring >= ringCount(w)) return totalCells(w);
  return p.a + Math.floor((p.reach[0] ?? 0) + 1e-7);
}

/** Steps to cover the cells before (fractional) rank x. */
function stepsX(w: World, grip: number, x: number): number {
  const n = totalCells(w);
  if (x >= n) return stepsAt(w, grip, n);
  const i = Math.floor(x);
  const a = stepsAt(w, grip, i);
  return a + (x - i) * (stepsAt(w, grip, i + 1) - a);
}
/** Seconds the Miner takes to dig from rank x to rank y: it crosses the cells and digs out what the Scout left. */
export const digTime = (w: World, st: Stats, x: number, y: number): number =>
  (stepsX(w, st.grip, y) - stepsX(w, st.grip, x) + (st.share * goldBetween(w, x, y)) / st.drill) / st.speed;
/** Bluetreri the Miner digs out between ranks x and y. */
const digGold = (w: World, st: Stats, x: number, y: number): number => st.share * goldBetween(w, x, y) * st.loot;
/** Rank (≤ hi) reached from x when `f(x, y)` reaches `v` (f grows with y). */
function rankWhere(x: number, hi: number, v: number, f: (x: number, y: number) => number): number {
  if (f(x, hi) <= v) return hi;
  let lo = x;
  let up = hi;
  for (let i = 0; i < 60 && up - lo > 1e-9; i++) {
    const mid = (lo + up) / 2;
    if (f(x, mid) <= v) lo = mid;
    else up = mid;
  }
  return lo;
}

/** Ring (index) the cell of rank r belongs to. */
function ringOfRank(w: World, r: number): number {
  let lo = 0;
  let hi = ringCount(w) - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (w.rings[mid] <= r) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Average bluetreri per second reaching camp: the Scout explores until its hold is full and drives to camp and back,
 *  the Miner digs until its hold is full and does the same (but never faster than the Scout reveals new ground once it
 *  has caught up). With a Hauler nobody drives back: they keep working. */
export function goldPerSec(s: GameState, w: World): number {
  const hauled = roverIndex(s, 'hauler') >= 0;
  const trip = (st: Stats, perSec: number, d: number) => (hauled ? perSec : st.cargo / (st.cargo / perSec + d / homeSpeed(st, st.cargo) + d / st.travelSpeed));
  /** Raw bluetreri per step of ring `k`, with that rover's grip. */
  const perStep = (k: number, grip: number) => {
    const a = w.rings[k];
    const b = w.rings[k + 1];
    return (w.goldPrefix[b] - w.goldPrefix[a]) / Math.max(EPS, stepsAt(w, grip, b) - stepsAt(w, grip, a));
  };
  let scout = 0;
  if (s.ring < ringCount(w)) {
    const st = stats(s);
    const g = perStep(s.ring, st.grip);
    if (!(g > 0)) return 0;
    scout = trip(st, st.share * g * st.loot * st.speed, homeDistance(s, w));
  }
  let sum = scout;
  const j = roverIndex(s, 'miner');
  const n = totalCells(w);
  if (j >= 0 && s.dug < n - EPS) {
    const st = stats(s, s.bots[j]);
    const r = Math.min(n - 1, Math.floor(s.dug));
    const g = perStep(ringOfRank(w, r), st.grip);
    if (g > 0) {
      const dig = (st.share * g * st.loot * st.speed) / (1 + (st.share * g) / st.drill);
      // Once it has caught up, it digs only what the Scout leaves behind.
      const caughtUp = s.ring < ringCount(w) && frontier(s, w) - s.dug < 4 * MINER_GAP;
      sum += Math.min(trip(st, dig, homeDistance(s, w, r)), caughtUp ? ((1 - SCOUT_SHARE) / SCOUT_SHARE) * scout : Infinity);
    }
  }
  return sum;
}

/** Rough share of exploring done inside a storm, and how much a storm slows it before Body (for estimates only). */
const STORM_SHARE = 0.1;
const STORM_SLOW = 0.5;

/** Estimated bluetreri per second at camp for the planning cards: `goldPerSec` with an average storm slowdown on the
 *  Scout (none before storms start). */
export function plannedRate(s: GameState, w: World): number {
  return goldPerSec(s, w) * (s.ring >= WEATHER_FROM_RING ? 1 - STORM_SHARE * STORM_SLOW * stats(s).armour : 1);
}

/** How much one more level of upgrade `id` on rover `j` would raise the bluetreri per second (0.25 = +25%), or null when
 *  it does not bring bluetreri (the Radar finds items; the Hauler saves trips the estimate does not see) or nothing is
 *  left to explore. */
export function upgradeGain(s: GameState, w: World, id: StatId, j = 0): number | null {
  const b = s.bots[j];
  if (id === 'radar' || !b || b.kind === 'hauler') return null;
  const before = plannedRate(s, w);
  if (!(before > 0)) return null;
  b.up[id]++;
  const after = plannedRate(s, w);
  b.up[id]--;
  return after / before - 1;
}

/** Cost of buying `qty` levels when `owned` are already owned (geometric sum). */
export function costOf(def: UpgradeDef, owned: number, qty = 1): Decimal {
  const r = D(def.costGrowth);
  const first = D(def.baseCost).mul(r.pow(owned));
  return first.mul(r.pow(qty).sub(1)).div(r.sub(1));
}

export interface TickEvents {
  /** Map cells of the deposits revealed in this step (cells, not ranks: a new route renumbers ranks). */
  specials: number[];
  /** Map cells whose items were collected in this step. */
  items: number[];
  /** Bluetreri unloaded at camp in this step (0 if none). */
  deposited: number;
  /** Zoom unlocked in this step (number of levels), if any. */
  zoomUnlocked?: number;
  /** The whole map was explored and everything unloaded in this step. */
  completed?: boolean;
}

/** Arc rover j works on the current ring: [start, end) and its length in steps; null if it has none. */
function arcOfBot(s: GameState, w: World, j: number, starts: number[], grip: number): Arc | null {
  const arcs = starts.length - 1;
  if (s.ring >= ringCount(w) || j >= arcs) return null;
  const k = arcOf(s.ring, j, arcs);
  const lo = starts[k];
  const hi = starts[k + 1];
  return { lo, hi, len: stepsAt(w, grip, hi) - stepsAt(w, grip, lo) };
}

/** Cells (with fraction) covered inside an arc after `prog` steps. If the arc is done, all of them
 *  (without depending on rounding when adding steps). */
const arcReach = (w: World, grip: number, a: Arc, prog: number): number =>
  prog >= a.len - EPS ? a.hi - a.lo : cellsReached(w, grip, a.lo, a.hi, stepsAt(w, grip, a.lo) + prog);

/** Cells mined on detours ahead of exploring, by rank, with the running sum of their bluetreri (exploring them later
 *  gives nothing). */
interface Mined { ranks: number[]; pref: number[] }
function minedIndex(s: GameState, w: World): Mined {
  const ranks = s.mined.map((c) => w.rank[c]).sort((x, y) => x - y);
  const pref = [0];
  for (const r of ranks) pref.push(pref[pref.length - 1] + w.value[w.order[r]]);
  return { ranks, pref };
}
/** Bluetreri of the mined cells below (fractional) rank `x`: a cell being explored counts in proportion. */
function minedBelow(w: World, m: Mined, x: number): number {
  if (!m.ranks.length) return 0;
  const fl = Math.floor(x);
  let lo = 0;
  let hi = m.ranks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (m.ranks[mid] < fl) lo = mid + 1; else hi = mid; }
  let v = m.pref[lo];
  if (m.ranks[lo] === fl) v += (x - fl) * w.value[w.order[fl]];
  return v;
}

/** Bluetreri (before multipliers) collected inside an arc after `prog` steps (cells mined on detours give none). */
const arcGold = (w: World, grip: number, a: Arc, prog: number, m?: Mined): number => {
  const x = a.lo + cellsReached(w, grip, a.lo, a.hi, stepsAt(w, grip, a.lo) + prog);
  return prefixAt(w, x) - w.goldPrefix[a.lo] - (m ? minedBelow(w, m, x) - minedBelow(w, m, a.lo) : 0);
};

/** A detour's path (map cells, from the rover's cell to the item) and its steps: each cell it enters costs what
 *  exploring it costs (terrain roughness, softened by Tyres), out to the item and back the same way. `cum[i]` is the
 *  steps to reach `path[i]` on the way out. */
export interface DetourPlan { path: number[]; cum: number[]; out: number; total: number }
export function detourPlan(w: World, grip: number, from: number, target: number): DetourPlan {
  const path = pathCells(w, from, w.itemRanks[target]);
  const cost = (i: number) => 1 + grip * (TERRAINS[w.terrain[i]].rough - 1);
  const cum = [0];
  for (let q = 1; q < path.length; q++) cum.push(cum[q - 1] + cost(path[q]));
  const out = cum[cum.length - 1];
  let back = 0;
  for (let q = path.length - 2; q >= 0; q--) back += cost(path[q]);
  return { path, cum, out, total: out + back };
}

/** Index (into `world.itemRanks`) of the item on the cell of rank `r`, or -1. */
function itemAt(w: World, r: number): number {
  let lo = 0;
  let hi = w.itemRanks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (w.itemRanks[mid] < r) lo = mid + 1; else hi = mid; }
  return w.itemRanks[lo] === r ? lo : -1;
}

/** Rank of the cell a rover is on inside its arc after `prog` steps. */
const cellOf = (w: World, grip: number, a: Arc, prog: number): number =>
  Math.min(a.hi - 1, a.lo + Math.floor(arcReach(w, grip, a, prog + 1e-7)));

/** Starts the next ring (the Scout explores all of it). */
function nextRing(s: GameState, w: World): void {
  s.ring++;
  while (s.ring < ringCount(w) && w.rings[s.ring + 1] === w.rings[s.ring]) s.ring++;
  if (s.ring < ringCount(w) && sectorsKey(roverSectors(s)) !== sectorsKey(activeSectors(s))) switchRoute(s, w);
  s.ringRobots = 1;
  for (const b of s.bots) b.prog = 0;
  // Detour paths and fetched items that exploring has caught up with are no longer needed.
  const a = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w);
  const kept: number[] = [];
  for (let i = 0; i < s.scouted.length; i += 3) if (s.scouted[i + 2] >= a) kept.push(s.scouted[i], s.scouted[i + 1], s.scouted[i + 2]);
  s.scouted = kept;
  s.mined = s.mined.filter((c) => w.rank[c] >= a);
  s.fetched = s.fetched.filter((k) => w.itemRanks[k] >= a || s.bots.some((b) => b.target === k));
}

/** [route, level] per slice of the map the rovers explore right now (a single one when they all follow the same). */
export function activeSectors(s: GameState): readonly Sector[] {
  const e = s.plan.at(-1);
  if (!e) return [['circular', 0]]; // the starting order
  return planSectors(e) ?? [[e[1] as RouteId, 0]]; // legacy entries count as level 0
}
/** [route, level] rover j explores its slice with right now. */
export function activeSector(s: GameState, j: number): Sector {
  const a = activeSectors(s);
  return a.length === 1 ? a[0] : a[j] ?? a[0];
}
/** [route, level] the Scout picked (it takes over at the next ring). */
export const roverSectors = (s: GameState): Sector[] => s.bots.filter((b) => b.kind === 'scout').map((b) => [b.route, routeLevel(s, b.route)]);
/** Same key for the same order: one route for all compares equal whatever the rover count. */
const sectorsKey = (x: readonly Sector[]): string => {
  const keys = x.map(([r, l]) => `${r}:${l}`);
  return keys.every((k) => k === keys[0]) ? keys[0] : keys.join(',');
};
/** Level bought for route `id`. */
export const routeLevel = (s: GameState, id: RouteId): number => s.routeLevels[id] ?? 0;

/** At the start of ring `s.ring`: re-orders the dark part of the map by the routes the rovers picked (each one its slice). Items and paths that are
 *  remembered by rank or item index are carried over by cell. */
function switchRoute(s: GameState, w: World): void {
  const itemCell = (k: number) => w.order[w.itemRanks[k]];
  const fetchedCells = s.fetched.map(itemCell);
  const targetCells = s.bots.map((b) => (b.target >= 0 ? itemCell(b.target) : -1));
  const scoutCells = s.scouted.map((r) => w.order[r]);
  const entry = planEntry(s.ring, roverSectors(s));
  reorder(w, s.ring, planSectors(entry)!);
  s.plan.push(entry);
  const itemIndex = new Map(Array.from(w.itemRanks, (r, k) => [w.order[r], k]));
  s.fetched = fetchedCells.map((i) => itemIndex.get(i)!);
  s.bots.forEach((b, j) => { if (targetCells[j] >= 0) b.target = itemIndex.get(targetCells[j])!; });
  const scouted: number[] = [];
  for (let q = 0; q < scoutCells.length; q += 3) {
    const from = w.rank[scoutCells[q]];
    const to = w.rank[scoutCells[q + 1]];
    let max = 0;
    for (const i of pathCells(w, from, to)) max = Math.max(max, w.rank[i]);
    scouted.push(from, to, max);
  }
  s.scouted = scouted;
}

function goHome(s: GameState, w: World, b: Bot, cell?: number): void {
  b.trip = 'home';
  b.travel = 0;
  b.travelLen = homeDistance(s, w, cell);
}

/** Advances the simulation by `dt` seconds. */
export function tick(s: GameState, w: World, dt: number): TickEvents {
  const ev: TickEvents = { specials: [], items: [], deposited: 0 };
  if (dt <= 0) return ev;
  let left = dt;
  let fetched = new Set(s.fetched);
  const minedSet = new Set(s.mined);
  let mined: Mined | null = null;
  /** Per rover: cells ahead already checked (nothing happens on arriving there) for this ring and sky. */
  const clearTo: number[] = [];
  let clearKey = '';
  const n = totalCells(w);
  const hj = roverIndex(s, 'hauler');
  const mj = roverIndex(s, 'miner');
  /** Whether the Hauler is on its way to rover j (which then waits for it instead of driving to camp). */
  const coming = (j: number) => hj >= 0 && s.bots[hj].trip === 'out' && s.bots[hj].target === j;
  for (let guard = 0; left > EPS && guard < 500000; guard++) {
    const sts = s.bots.map((b) => stats(s, b));
    const live = s.ring < ringCount(w);
    const key = `${s.ring}/${s.weather.epoch}`;
    if (key !== clearKey) { clearKey = key; clearTo.length = 0; }
    const full = (j: number) => s.bots[j].cargo >= sts[j].cargo * (1 - EPS);
    /** Bluetreri the Scout takes from each unit of a cell's value. */
    const take = (j: number) => sts[j].loot * sts[j].share;

    // The sky changes.
    const nextSky = (s.weather.epoch + 1) * WEATHER_EPOCH;
    if (s.playTime >= nextSky - 1e-7) { s.weather = evolveWeather(s, w, Math.floor((s.playTime + 1e-7) / WEATHER_EPOCH)); continue; }

    const starts = live ? arcStarts(w, s.ring, s.ringRobots) : [n];
    const arcs = s.bots.map((b, j) => (b.kind === 'scout' ? arcOfBot(s, w, j, starts, sts[j].grip) : null));

    // Ring done (the Scout finished it): on to the next.
    if (live && arcs.every((a, j) => s.bots[j].kind !== 'scout' || !a || s.bots[j].prog >= a.len - EPS)) {
      nextRing(s, w);
      fetched = new Set(s.fetched); // a new route renumbers the items
      mined = null;
      continue;
    }

    let pr: Progress | null = null;
    const prog = () => (pr ??= progress(s, w));
    /** Rank of the cell rover j is on (where the Hauler meets it). */
    const rankOf = (j: number): number => {
      const b = s.bots[j];
      if (b.kind === 'miner') return Math.min(n - 1, Math.floor(s.dug));
      if (b.trip === 'detour') return b.from;
      const a = arcs[j];
      return a ? cellOf(w, sts[j].grip, a, b.prog) : n - 1;
    };

    // Instant decisions. The Hauler at camp drives out to the fullest rover once one is half full.
    let changed = false;
    if (hj >= 0 && s.bots[hj].trip === 'idle') {
      let best = -1;
      let most = HAUL_AT - 1e-6;
      s.bots.forEach((b, j) => {
        if (j === hj || (b.trip !== 'explore' && b.trip !== 'detour')) return;
        const f = b.cargo / sts[j].cargo;
        if (f > most) { best = j; most = f; }
      });
      if (best >= 0) {
        const h = s.bots[hj];
        h.trip = 'out';
        h.target = best;
        h.from = rankOf(best);
        h.travel = 0;
        h.travelLen = homeDistance(s, w, h.from);
        changed = true;
      }
    }
    // A full hold (or the Scout done with the map and still loaded, or the Miner done digging): to camp, unless the
    // Hauler is on its way.
    s.bots.forEach((b, j) => {
      if (b.trip !== 'explore' || coming(j)) return;
      if (b.kind === 'scout') {
        const a = arcs[j];
        const done = !a || b.prog >= a.len - EPS;
        if (full(j) || (done && (b.cargo > 0 || b.found > 0))) {
          goHome(s, w, b, a ? cellOf(w, sts[j].grip, a, b.prog) : undefined);
          changed = true;
        }
      } else if (b.kind === 'miner' && (full(j) || (!live && s.dug >= n - EPS))) {
        goHome(s, w, b, rankOf(j));
        changed = true;
      }
    });
    if (changed) continue;

    // The Miner digs up to the Scout's frontier. Once it catches up it waits (`walked` = 1) until the Scout is
    // MINER_GAP cells ahead, so it does not stop at every cell.
    let front = n;
    if (mj >= 0 && s.bots[mj].trip === 'explore') {
      const b = s.bots[mj];
      if (live) {
        const p = prog();
        front = frontier(s, w, p);
        if (b.walked === 0 && s.dug >= front - EPS) b.walked = 1;
        else if (b.walked === 1 && p.a + (p.reach[0] ?? 0) >= Math.ceil(s.dug - 1e-9) + MINER_GAP - 1e-6) b.walked = 0;
      } else b.walked = 0;
    }

    // Detours: each cell reached on the way out is mined (its bluetreri, deposit and item, unless exploring got there
    // first). A full hold ends the detour: the item is left for later and the rover heads to camp from where it is.
    const plans: (DetourPlan | null)[] = s.bots.map((b, j) => (b.trip === 'detour' ? detourPlan(w, sts[j].grip, b.from, b.target) : null));
    s.bots.forEach((b, j) => {
      const plan = plans[j];
      if (!plan) return;
      if (b.travelLen <= 0) b.travelLen = plan.total; // a detour loaded from an older save
      const last = plan.path.length - 1;
      let dp: Progress | null = null;
      while (b.walked < last && b.travel >= plan.cum[b.walked + 1] - EPS * Math.max(1, plan.cum[b.walked + 1])) {
        b.walked++;
        const cell = plan.path[b.walked];
        const r = w.rank[cell];
        dp ??= progress(s, w);
        if (!revealed(s, w, r, dp) && !minedSet.has(cell)) {
          b.cargo = Math.min(sts[j].cargo, b.cargo + w.value[cell] * take(j));
          if (sts[j].cargo - b.cargo < sts[j].cargo * EPS * 10) b.cargo = sts[j].cargo;
          s.mined.push(cell);
          minedSet.add(cell);
          b.log.cells++;
          if (w.special[cell]) ev.specials.push(cell);
          const k = b.walked === last ? b.target : itemAt(w, r);
          if (k >= 0 && (k === b.target || !fetched.has(k))) {
            if (k !== b.target) { fetched.add(k); s.fetched.push(k); }
            collect(w, k, ev, b);
          }
        } else if (b.walked === last) collect(w, b.target, ev, b);
        changed = true;
        if (b.cargo >= sts[j].cargo * (1 - EPS)) {
          // Full: give up the rest. An item not reached yet is left for exploring (or another detour).
          if (b.walked < last) {
            fetched.delete(b.target);
            s.fetched = s.fetched.filter((x) => x !== b.target);
          }
          const to = w.rank[cell];
          let max = 0;
          for (const i of pathCells(w, b.from, to)) max = Math.max(max, w.rank[i]);
          s.scouted.push(b.from, to, max);
          b.target = -1;
          b.from = -1;
          b.walked = 0;
          b.log.gaveUp++;
          goHome(s, w, b, to);
          return;
        }
      }
    });
    if (changed) { mined = null; continue; }

    // Radar: the Scout, when it spots an item around it, leaves its way to fetch it.
    const p = live && sts.some((x) => x.radar > 0) ? progress(s, w) : null;
    const spot = (cell: number, own: number, range: number) => range <= 0 ? -1 : nearestItem(w, w.order[cell], range, (k) => {
      const r = w.itemRanks[k];
      return !fetched.has(k) && r !== own && !revealed(s, w, r, p!);
    });
    if (p) {
      for (let j = 0; j < s.bots.length; j++) {
        const b = s.bots[j];
        const a = arcs[j];
        if (b.kind !== 'scout' || b.trip !== 'explore' || !a || b.prog >= a.len - EPS || full(j)) continue;
        const c = cellOf(w, sts[j].grip, a, b.prog);
        const k = spot(c, c, sts[j].radar);
        if (k < 0) continue;
        fetched.add(k);
        s.fetched.push(k);
        b.trip = 'detour';
        b.target = k;
        b.from = c;
        b.travel = 0;
        b.walked = 0;
        b.travelLen = detourPlan(w, sts[j].grip, c, k).total;
        changed = true;
      }
    }
    if (changed) continue;

    // Each rover's speed right now: storms slow exploring and detours, a full hold slows the drive home; a full rover
    // waiting for the Hauler, the Miner waiting for the Scout and the Hauler at camp stand still.
    const exploreCell: number[] = [];
    const speedOf = s.bots.map((b, j) => {
      if (b.trip === 'idle') return 0;
      if (b.trip === 'explore') {
        if (b.kind === 'miner') return b.walked === 0 && !full(j) && s.dug < front - EPS ? sts[j].speed : 0;
        const a = arcs[j];
        if (b.kind !== 'scout' || !a || b.prog >= a.len - EPS || full(j)) return 0;
        exploreCell[j] = cellOf(w, sts[j].grip, a, b.prog);
        return sts[j].speed * weatherFactor(s.weather.storms, w.size, w.order[exploreCell[j]], sts[j].armour);
      }
      if (b.trip === 'detour') return sts[j].speed * weatherFactor(s.weather.storms, w.size, w.order[b.from], sts[j].armour);
      if (b.trip === 'home') return homeSpeed(sts[j], b.cargo);
      return sts[j].travelSpeed;
    });

    // When each rover's next event happens. While the Hauler waits at camp, a working hold getting half full is one.
    let step = Math.min(left, nextSky - s.playTime);
    const stopAt: (number | undefined)[] = [];
    const watch = hj >= 0 && s.bots[hj].trip === 'idle';
    /** Room left before rover j's next cargo event (half full for the Hauler, or full). */
    const roomOf = (j: number) => {
      const cap = sts[j].cargo;
      const b = s.bots[j];
      return watch && b.cargo < HAUL_AT * cap * (1 - 1e-9) ? HAUL_AT * cap - b.cargo : cap - b.cargo;
    };
    let minerHalf = false;
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      const v = speedOf[j];
      if (v <= 0) return;
      if (b.trip === 'explore' && b.kind === 'miner') {
        // Up to the frontier, or where its hold fills.
        const st = sts[j];
        const room = roomOf(j);
        minerHalf = room < st.cargo - b.cargo;
        stopAt[j] = rankWhere(s.dug, front, room, (x, y) => digGold(w, st, x, y));
        step = Math.min(step, digTime(w, st, s.dug, stopAt[j]!));
      } else if (b.trip === 'explore' && a) {
        let target = a.len;
        // Where the hold fills up: find the exact point (bluetreri grows continuously with the steps).
        const room = roomOf(j);
        mined ??= minedIndex(s, w);
        const m = mined;
        const g0 = arcGold(w, sts[j].grip, a, b.prog, m);
        if ((arcGold(w, sts[j].grip, a, a.len, m) - g0) * take(j) >= room) {
          let lo = b.prog;
          let hi = a.len;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if ((arcGold(w, sts[j].grip, a, mid, m) - g0) * take(j) >= room) hi = mid;
            else lo = mid;
          }
          target = hi;
        }
        // The first cell ahead (within reach in this step) where the weather changes or the radar spots something.
        const c = exploreCell[j];
        const f = v;
        const horizon = Math.min(cellOf(w, sts[j].grip, a, Math.min(target, b.prog + v * step)), a.hi - 1);
        for (let m = Math.max(c + 1, clearTo[j] ?? 0); m <= horizon; m++) {
          const fm = sts[j].speed * weatherFactor(s.weather.storms, w.size, w.order[m], sts[j].armour);
          if (fm !== f || (p && spot(m, m, sts[j].radar) >= 0)) {
            target = Math.min(target, stepsAt(w, sts[j].grip, m) - stepsAt(w, sts[j].grip, a.lo));
            break;
          }
          clearTo[j] = m + 1;
        }
        stopAt[j] = target;
        step = Math.min(step, (target - b.prog) / v);
      } else if (b.trip === 'detour') {
        const plan = plans[j]!;
        const next = b.walked < plan.path.length - 1 ? plan.cum[b.walked + 1] : b.travelLen;
        stopAt[j] = next;
        step = Math.min(step, (next - b.travel) / v);
      } else {
        step = Math.min(step, (b.travelLen - b.travel) / v);
      }
    });
    // A Miner waiting for the Scout wakes when the Scout is far enough ahead.
    if (mj >= 0 && live && s.bots[mj].trip === 'explore' && s.bots[mj].walked === 1 && speedOf[0] > 0 && arcs[0] && s.bots[0].trip === 'explore') {
      const a = arcs[0];
      const r = Math.ceil(s.dug - 1e-9) + MINER_GAP;
      if (r > a.lo && r < a.hi) step = Math.min(step, Math.max(0, (stepsAt(w, sts[0].grip, r) - stepsAt(w, sts[0].grip, a.lo) - s.bots[0].prog) / speedOf[0]));
    }
    if (!live && s.bots.every((b, j) => (b.kind === 'scout' ? b.trip === 'explore' && !coming(j) : b.trip === 'idle'))) break; // all done and unloaded
    step = Math.max(0, step);

    // Everyone advances `step` seconds.
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      const v = speedOf[j];
      if (v <= 0) return;
      if (b.trip === 'explore' && b.kind === 'miner') {
        const st = sts[j];
        const from = s.dug;
        const stop = stopAt[j]!;
        const to = step >= digTime(w, st, from, stop) * (1 - 1e-12) ? stop : rankWhere(from, stop, step, (x, y) => digTime(w, st, x, y));
        b.cargo = Math.min(st.cargo, b.cargo + digGold(w, st, from, to));
        if (to === stop && stop < front) b.cargo = minerHalf ? Math.max(b.cargo, HAUL_AT * st.cargo) : st.cargo; // (stopped where it fills)
        if (st.cargo - b.cargo < st.cargo * EPS * 10) b.cargo = st.cargo;
        b.log.cells += Math.floor(to) - Math.floor(from);
        b.log.steps += stepsX(w, st.grip, to) - stepsX(w, st.grip, from);
        s.dug = to;
      } else if (b.trip === 'explore') {
        if (!a) return;
        const from = b.prog;
        const stop = stopAt[j]!;
        let to = Math.min(stop, from + v * step);
        if (to >= stop - EPS * Math.max(1, stop)) to = stop;
        mined ??= minedIndex(s, w);
        const g = (arcGold(w, sts[j].grip, a, to, mined) - arcGold(w, sts[j].grip, a, from, mined)) * take(j);
        b.prog = to;
        b.log.steps += to - from;
        b.cargo = Math.min(sts[j].cargo, b.cargo + g);
        if (sts[j].cargo - b.cargo < sts[j].cargo * EPS * 10) b.cargo = sts[j].cargo;
        // Cells it has reached: deposits and items.
        const r0 = a.lo + Math.floor(arcReach(w, sts[j].grip, a, from));
        const r1 = a.lo + Math.floor(arcReach(w, sts[j].grip, a, to));
        if (r1 > r0) {
          for (let r = r0; r < r1; r++) if (!minedSet.has(w.order[r])) b.log.cells++; // (mined ones were counted on the detour)
          for (const r of specialsBetween(w, r0, r1)) if (!minedSet.has(w.order[r])) ev.specials.push(w.order[r]);
          for (const k of itemsBetween(w, r0, r1)) if (!fetched.has(k)) collect(w, k, ev, b);
        }
      } else {
        const was = b.travel;
        if (b.trip === 'detour') {
          const stop = stopAt[j]!;
          b.travel = Math.min(stop, b.travel + v * step);
          if (b.travel >= stop - EPS * Math.max(1, stop)) b.travel = stop;
        } else b.travel = Math.min(b.travelLen, b.travel + v * step);
        b.log.steps += b.travel - was;
        if (b.travel < b.travelLen - EPS) return;
        b.travel = 0;
        if (b.trip === 'home') {
          const g = D(b.cargo);
          s.gold = s.gold.add(g);
          s.totalGold = s.totalGold.add(g);
          ev.deposited += b.cargo;
          b.log.gold += b.cargo;
          b.log.best = Math.max(b.log.best, b.cargo);
          b.log.trips++;
          b.cargo = 0;
          // Pages, notes and photos count only once at camp, like the bluetreri.
          ITEMS.forEach((it, q) => { s.items[it.id] += b.bag[q] ?? 0; });
          b.bag = ITEMS.map(() => 0);
          b.found = 0;
          // Back out (the same way), unless there is nothing left for it to do.
          b.trip = b.kind === 'hauler' ? 'idle' : 'out';
          if (b.kind === 'hauler') b.from = -1;
          if (s.ring >= ringCount(w) && b.kind === 'scout') b.trip = 'explore';
          if (s.ring >= ringCount(w) && b.kind === 'miner' && s.dug >= n - EPS) b.trip = 'idle';
        } else if (b.trip === 'detour') {
          // Back where it left its arc (the item was picked up on arrival).
          if (b.from >= 0) {
            const to = w.itemRanks[b.target];
            let max = 0;
            for (const i of pathCells(w, b.from, to)) max = Math.max(max, w.rank[i]);
            s.scouted.push(b.from, to, max);
          }
          b.target = -1;
          b.from = -1;
          b.walked = 0;
          b.log.detours++;
          b.trip = 'explore';
        } else if (b.kind === 'hauler') {
          // At the rover: it takes the load (as much as fits) and the items, and drives it to camp.
          const t = s.bots[b.target];
          if (t && (t.trip === 'explore' || t.trip === 'detour')) {
            const load = Math.min(sts[j].cargo - b.cargo, t.cargo);
            b.cargo += load;
            t.cargo = t.cargo - load < EPS ? 0 : t.cargo - load;
            t.bag.forEach((q, k) => { b.bag[k] += q; });
            b.found += t.found;
            t.bag = ITEMS.map(() => 0);
            t.found = 0;
          }
          b.target = -1;
          goHome(s, w, b, b.from); // (it keeps `from`: where it is driving back from)
        } else {
          b.trip = 'explore';
          b.walked = 0;
        }
      }
    });
    left -= step;
    s.playTime += step;
  }
  s.playTime += Math.max(0, left);
  const cells = explored(s, w);
  while (s.zoomUnlocked < ZOOMS.length && cells >= unlockAt(w, s.zoomUnlocked - 1)) {
    s.zoomUnlocked++;
    ev.zoomUnlocked = s.zoomUnlocked;
  }
  if (s.doneAt === undefined && isComplete(s, w)) {
    s.doneAt = s.playTime;
    ev.completed = true;
  }
  return ev;
}

/** Items collected so far (in finished rings, plus radar finds already brought back), by kind. */
export function itemsCollected(s: GameState, w: World): Record<ItemId, number> {
  const out = Object.fromEntries(ITEMS.map((it) => [it.id, 0])) as Record<ItemId, number>;
  const done = s.ring >= ringCount(w) ? totalCells(w) : w.rings[s.ring];
  const fetched = new Set(s.fetched.filter((k) => !s.bots.some((b) => b.trip === 'detour' && b.target === k)));
  w.itemRanks.forEach((r, k) => { if (r < done || fetched.has(k)) out[ITEMS[w.item[w.order[r]] - 1].id]++; });
  return out;
}

/** Items spent at today's prices: works made, routes unlocked and their levels. */
export function itemsSpent(s: GameState, w: World): Record<ItemId, number> {
  const out = Object.fromEntries(ITEMS.map((it) => [it.id, 0])) as Record<ItemId, number>;
  for (const wd of WORKS) for (let k = 0; k < s.works[wd.id]; k++) out[wd.item] += workCost(w, wd.id, k);
  for (const id of s.routes) {
    const def = routeById(id);
    if (!def) continue;
    for (const [k, n] of Object.entries(def.items)) out[k as ItemId] += n ?? 0;
    for (let lv = 0; lv < routeLevel(s, id); lv++) for (const [k, n] of Object.entries(def.levelItems)) out[k as ItemId] += (n ?? 0) * (lv + 1);
  }
  return out;
}

/** Saves that made works or bought routes at older (dearer) prices: give back the difference, so the library can still
 *  be finished. Never takes items away. */
export function recountItems(s: GameState, w: World): void {
  if (!s.recount) return;
  delete s.recount;
  const got = itemsCollected(s, w);
  const spent = itemsSpent(s, w);
  for (const it of ITEMS) s.items[it.id] = Math.max(s.items[it.id], got[it.id] - spent[it.id]);
}

/** Converts an old save (total fleet steps) to the independent-rover model. */
export function fromLegacy(s: GameState, w: World): void {
  if (s.legacyWalked === undefined) return;
  s.ring = Math.min(ringCount(w), ringAt(w, s.legacyWalked));
  s.bots = [newBot()];
  s.ringRobots = 1;
  delete s.legacyWalked;
}

/** Saves from before rover kinds: rover #1 is now the Scout (save.ts restarts the ring under way for it when the ring
 *  was split between several rovers) and everything explored before counts as dug out. */
export function toKinds(s: GameState, w: World): void {
  if (!s.kinds) return;
  delete s.kinds;
  s.dug = s.ring >= ringCount(w) ? totalCells(w) : w.rings[s.ring];
}

function collect(w: World, k: number, ev: TickEvents, b: Bot): void {
  const r = w.itemRanks[k];
  b.bag[w.item[w.order[r]] - 1]++;
  b.found++;
  b.log.items++;
  ev.items.push(w.order[r]);
}

/** Items the next work of this kind costs. */
export const nextWorkCost = (s: GameState, w: World, id: WorkId): number => workCost(w, id, s.works[id]);

/** Items of each kind on the whole map (they do not depend on the order). */
const itemTotals = new WeakMap<World, Record<ItemId, number>>();
export function itemsOnMap(w: World): Record<ItemId, number> {
  let t = itemTotals.get(w);
  if (!t) {
    t = Object.fromEntries(ITEMS.map((it) => [it.id, 0])) as Record<ItemId, number>;
    for (let i = 0; i < w.item.length; i++) if (w.item[i]) t[ITEMS[w.item[i] - 1].id]++;
    itemTotals.set(w, t);
  }
  return t;
}

/** Items every route and level costs, by kind. */
export function routeItems(): Record<ItemId, number> {
  const out = Object.fromEntries(ITEMS.map((it) => [it.id, 0])) as Record<ItemId, number>;
  for (const rd of ROUTES) {
    for (const [k, n] of Object.entries(rd.items)) out[k as ItemId] += n ?? 0;
    for (let lv = 0; lv < rd.maxLevel; lv++) for (const [k, n] of Object.entries(rd.levelItems)) out[k as ItemId] += (n ?? 0) * (lv + 1);
  }
  return out;
}

/** Price of every work of each collection on this map: growing by `costGrowth`, all of them adding up to LIBRARY_SHARE
 *  of that kind's items after the routes' share. */
const workPrices = new WeakMap<World, Record<WorkId, number[]>>();
function pricesFor(w: World): Record<WorkId, number[]> {
  let p = workPrices.get(w);
  if (!p) {
    const have = itemsOnMap(w);
    const routes = routeItems();
    p = Object.fromEntries(WORKS.map((wd) => {
      const budget = Math.max(WORKS_MAX, LIBRARY_SHARE * have[wd.item] - routes[wd.item]);
      const shape = Array.from({ length: WORKS_MAX }, (_, k) => wd.costGrowth ** k);
      const sum = shape.reduce((a, b) => a + b, 0);
      return [wd.id, shape.map((x) => Math.max(1, Math.floor((budget * x) / sum)))];
    })) as Record<WorkId, number[]>;
    workPrices.set(w, p);
  }
  return p;
}
/** Items that work number `made` of collection `id` costs on this map (0 = the first). */
export const workCost = (w: World, id: WorkId, made: number): number => pricesFor(w)[id][Math.min(made, WORKS_MAX - 1)];

export const canCraft = (s: GameState, w: World, id: WorkId): boolean =>
  s.works[id] < WORKS_MAX && levelOf(s, w) >= workLevelNeeded(w, s.works[id]) && s.items[workById(id).item] >= nextWorkCost(s, w, id);

/** The player's explorer level right now. */
export const levelOf = (s: GameState, w: World): number => explorerLevel(explored(s, w), totalCells(w)).level;
/** Never above the world's top level (small test maps have fewer levels). */
const capLevel = (w: World, need: number) => Math.min(need, explorerLevel(0, totalCells(w)).max);
/** Explorer level needed for the k-th work (0-based) of a collection. */
export const workLevelNeeded = (w: World, k: number): number =>
  capLevel(w, Math.round(WORK_LEVEL_FIRST + ((WORK_LEVEL_LAST - WORK_LEVEL_FIRST) * Math.min(k, WORKS_MAX - 1)) / (WORKS_MAX - 1)));
/** Explorer level needed to unlock route `id` (level 0) or to reach its level `k`. */
export const routeLevelNeeded = (w: World, id: RouteId, k = 0): number =>
  capLevel(w, (routeById(id)?.minLevel ?? 0) + ROUTE_LEVEL_STEP * k);

/** Share of the library finished: one collection, or all of them. */
export const libraryShare = (s: GameState, id?: WorkId): number =>
  id ? Math.min(1, s.works[id] / WORKS_MAX) : WORKS.reduce((a, wd) => a + Math.min(WORKS_MAX, s.works[wd.id]), 0) / (WORKS_MAX * WORKS.length);

/** Crafts the next work (book, record or album) from the collected items. */
export function craft(s: GameState, w: World, id: WorkId): boolean {
  if (!canCraft(s, w, id)) return false;
  s.items[workById(id).item] -= nextWorkCost(s, w, id);
  s.works[id]++;
  return true;
}

/** Whether rover `b` has part `id` (each kind only has the parts it uses). */
export const hasPart = (b: Bot | undefined, id: StatId): boolean => !!b && kindById(b.kind).parts.includes(id);

/** Whether the next `qty` levels of `id` for rover `j` are affordable. */
export function canBuy(s: GameState, id: StatId, qty = 1, j = 0): boolean {
  const def = upgradeById(id);
  return !!def && hasPart(s.bots[j], id) && s.gold.gte(costOf(def, levelOn(s, id, s.bots[j]), qty));
}

/** Buys `qty` levels of `id` for rover `j`. */
export function buy(s: GameState, w: World, id: StatId, qty = 1, j = 0): boolean {
  const def = upgradeById(id);
  const bot = s.bots[j];
  if (!def || !hasPart(bot, id)) return false;
  const cost = costOf(def, levelOn(s, id, bot), qty);
  if (s.gold.lt(cost)) return false;
  s.gold = s.gold.sub(cost);
  // Tyres change how many steps each cell costs: keep the Scout on the same cell of its arc.
  const before = id === 'tyres' && bot.kind === 'scout' ? progress(s, w) : null;
  const oldGrip = stats(s, bot).grip;
  bot.up[id] += qty;
  if (before) {
    const grip = stats(s, bot).grip;
    // A detour keeps the same share of its way.
    if (bot.trip === 'detour' && bot.travelLen > 0) {
      const total = detourPlan(w, grip, bot.from, bot.target).total;
      bot.travel *= total / detourPlan(w, oldGrip, bot.from, bot.target).total;
      bot.travelLen = total;
    }
    const k = before.robotOf.indexOf(j);
    if (k >= 0) bot.prog = stepsForReach(w, grip, before.starts[k], before.starts[k + 1], before.reach[k]);
  }
  return true;
}

/** Explorer level needed to build a rover of kind `k`. */
export const roverLevelNeeded = (w: World, k: RoverKind): number => capLevel(w, kindById(k).level);

/** Whether a rover of kind `k` can be built now: one of each, in order (the Miner before the Hauler), with its price
 *  and explorer level. */
export function canBuild(s: GameState, w: World, k: RoverKind): boolean {
  const q = ROVER_KINDS.findIndex((d) => d.id === k);
  if (q <= 0 || roverIndex(s, k) >= 0 || roverIndex(s, ROVER_KINDS[q - 1].id) < 0) return false;
  return levelOf(s, w) >= roverLevelNeeded(w, k) && s.gold.gte(kindById(k).gold);
}

/** Builds a rover of kind `k`, to the Scout's standard (it gets the Scout's levels of the parts they share). The Miner
 *  heads out to where there is digging to do; the Hauler waits at camp. */
export function build(s: GameState, w: World, k: RoverKind): boolean {
  if (!canBuild(s, w, k)) return false;
  s.gold = s.gold.sub(kindById(k).gold);
  const b = newBot(k === 'hauler' ? 'idle' : 'out', k === 'miner' ? homeDistance(s, w, Math.min(totalCells(w) - 1, Math.floor(s.dug))) : 0, s.playTime, k);
  const scout = s.bots[0];
  for (const id of kindById(k).parts) if (hasPart(scout, id)) b.up[id] = scout.up[id];
  b.route = s.route;
  s.bots.push(b);
  return true;
}

/** Whether route `id` can be unlocked now (bluetreri and items). */
export function canUnlockRoute(s: GameState, w: World, id: RouteId): boolean {
  const def = routeById(id);
  if (!def || s.routes.includes(id) || s.gold.lt(def.gold) || levelOf(s, w) < routeLevelNeeded(w, id)) return false;
  return Object.entries(def.items).every(([k, n]) => s.items[k as keyof GameState['items']] >= (n ?? 0));
}

/** Pays for route `id` and unlocks it. */
export function unlockRoute(s: GameState, w: World, id: RouteId): boolean {
  if (!canUnlockRoute(s, w, id)) return false;
  const def = routeById(id)!;
  s.gold = s.gold.sub(def.gold);
  for (const [k, n] of Object.entries(def.items)) s.items[k as keyof GameState['items']] -= n ?? 0;
  s.routes.push(id);
  return true;
}

/** Price of the next level of route `id` (null when it is locked or maxed out). */
export function routeUpgradeCost(s: GameState, id: RouteId): { gold: number; items: Partial<Record<ItemId, number>> } | null {
  const def = routeById(id);
  const lv = routeLevel(s, id);
  if (!def || !s.routes.includes(id) || lv >= def.maxLevel) return null;
  const items: Partial<Record<ItemId, number>> = {};
  for (const [k, n] of Object.entries(def.levelItems)) items[k as ItemId] = (n ?? 0) * (lv + 1);
  return { gold: Math.round(def.levelGold * ROUTE_LEVEL_GROWTH ** lv), items };
}
export function canUpgradeRoute(s: GameState, w: World, id: RouteId): boolean {
  const c = routeUpgradeCost(s, id);
  return !!c && levelOf(s, w) >= routeLevelNeeded(w, id, routeLevel(s, id) + 1) && s.gold.gte(c.gold) && Object.entries(c.items).every(([k, n]) => s.items[k as ItemId] >= (n ?? 0));
}
/** Pays for the next level of route `id`; it takes effect at the next ring if that route is in use. */
export function upgradeRoute(s: GameState, w: World, id: RouteId): boolean {
  if (!canUpgradeRoute(s, w, id)) return false;
  const c = routeUpgradeCost(s, id)!;
  s.gold = s.gold.sub(c.gold);
  for (const [k, n] of Object.entries(c.items)) s.items[k as ItemId] -= n ?? 0;
  s.routeLevels[id] = routeLevel(s, id) + 1;
  return true;
}

/** Picks the route the Scout follows from the next ring on. */
export function chooseRoute(s: GameState, id: RouteId): boolean {
  if (!s.routes.includes(id)) return false;
  s.route = id;
  for (const b of s.bots) b.route = id;
  return true;
}

export function setZoom(s: GameState, z: number): void {
  s.zoom = Math.max(0, Math.min(s.zoomUnlocked - 1, z));
}
