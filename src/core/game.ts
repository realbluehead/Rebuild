// Pure simulation: no DOM, clock or storage access. Everything is testable.
//
// Each rover works on its own. When a ring starts it is split into arcs (one per rover) and each rover explores
// its arc at its own pace (terrain roughness and storms slow it down). When its hold is full, or it finishes its
// arc with cargo, it drives back to camp (slower the more it carries) to unload and heads out again. The next ring
// starts once every arc is done. Each rover's radar spots items around it; that rover leaves its arc to fetch them.
// `tick` processes events (hold full, arc done, trip done, arriving at a cell where the weather changes or the
// radar spots something, the sky changing) in time order, so one long step (offline) gives the same result as
// many short ones.
import { D, Decimal } from './decimal';
import { newBot, type Bot, type GameState } from './state';
import { ARMOUR_MULT, BASE_CARGO, BASE_SPEED, CARGO_MULT, GRIP_MULT, LOAD_DRAG, radarRange, SPEED_MULT, TRAVEL_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { WEATHER_EPOCH } from '../content/weather';
import { workById, ITEMS, LIBRARY_SHARE, WORKS, WORKS_MAX, type ItemId, type WorkId } from '../content/collection';
import { ROUTE_LEVEL_GROWTH, ROUTES, routeById, type RouteId } from '../content/routes';
import { arcOf, arcStarts, cellsReached, itemsBetween, nearestItem, pathCells, prefixAt, reorder, ringAt, ringCount, specialsBetween, stepsAt, stepsForReach, totalCells, unlockAt, type World } from './world';
import { evolveWeather, weatherFactor } from './weather';

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
  explorers: number;
  /** Exploring steps per second of all rovers together (clear sky). */
  stepsPerSec: number;
}

export function stats(s: GameState): Stats {
  const u = s.upgrades;
  const wk = (id: WorkId) => workById(id).bonus ** s.works[id];
  const speed = BASE_SPEED * SPEED_MULT ** u.speed * wk('book');
  const loot = wk('cd');
  const cargo = BASE_CARGO * CARGO_MULT ** u.cargo * wk('album');
  const explorers = 1 + u.explorers;
  return {
    speed, travelSpeed: speed * TRAVEL_MULT, loot, radar: radarRange(u.radar), cargo,
    grip: GRIP_MULT ** u.tyres, armour: ARMOUR_MULT ** u.body, explorers, stepsPerSec: speed * explorers,
  };
}

/** Bluetreri all rovers can carry together. */
export const capacity = (s: GameState): number => stats(s).cargo * s.bots.length;

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
  const grip = stats(s).grip;
  const starts = arcStarts(w, s.ring, s.ringRobots);
  const arcs = starts.length - 1;
  const robotOf: number[] = [];
  const reach: number[] = [];
  for (let k = 0; k < arcs; k++) {
    const j = arcOf(s.ring, k, arcs);
    robotOf.push(j);
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

export const isComplete = (s: GameState, w: World): boolean =>
  s.ring >= ringCount(w) && s.bots.every((b) => b.trip === 'explore' && b.cargo <= 0);

/** Average bluetreri per second reaching camp (per rover: explore until the hold is full + the round trip). */
export function goldPerSec(s: GameState, w: World): number {
  if (s.ring >= ringCount(w)) return 0;
  const st = stats(s);
  const a = w.rings[s.ring];
  const b = w.rings[s.ring + 1];
  const g = ((w.goldPrefix[b] - w.goldPrefix[a]) / Math.max(EPS, stepsAt(w, st.grip, b) - stepsAt(w, st.grip, a))) * st.loot; // per step
  if (!(g > 0)) return 0;
  const d = homeDistance(s, w);
  const perBot = st.cargo / (st.cargo / (g * st.speed) + d / homeSpeed(st, st.cargo) + d / st.travelSpeed);
  return perBot * s.bots.length;
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

/** Starts the next ring: it is split between all rovers, and new rovers leave camp. */
function nextRing(s: GameState, w: World, explorers: number): void {
  s.ring++;
  while (s.ring < ringCount(w) && w.rings[s.ring + 1] === w.rings[s.ring]) s.ring++;
  if (s.ring < ringCount(w) && (s.route !== activeRoute(s) || routeLevel(s, s.route) !== activeLevel(s))) switchRoute(s, w);
  while (s.bots.length < explorers) s.bots.push(newBot('out', homeDistance(s, w)));
  s.ringRobots = s.bots.length;
  for (const b of s.bots) b.prog = 0;
  // Detour paths and fetched items that exploring has caught up with are no longer needed.
  const a = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w);
  const kept: number[] = [];
  for (let i = 0; i < s.scouted.length; i += 3) if (s.scouted[i + 2] >= a) kept.push(s.scouted[i], s.scouted[i + 1], s.scouted[i + 2]);
  s.scouted = kept;
  s.mined = s.mined.filter((c) => w.rank[c] >= a);
  s.fetched = s.fetched.filter((k) => w.itemRanks[k] >= a || s.bots.some((b) => b.target === k));
}

/** The route the map is ordered by right now. */
export const activeRoute = (s: GameState): RouteId => (s.plan.length ? s.plan[s.plan.length - 1][1] : 'circular');
/** The entropy level of the active route (the starting circular order, and legacy entries, count as level 0). */
export const activeLevel = (s: GameState): number => (s.plan.length ? (s.plan[s.plan.length - 1][2] ?? 0) : 0);
/** Level bought for route `id`. */
export const routeLevel = (s: GameState, id: RouteId): number => s.routeLevels[id] ?? 0;

/** At the start of ring `s.ring`: re-orders the dark part of the map by the chosen route. Items and paths that are
 *  remembered by rank or item index are carried over by cell. */
function switchRoute(s: GameState, w: World): void {
  const itemCell = (k: number) => w.order[w.itemRanks[k]];
  const fetchedCells = s.fetched.map(itemCell);
  const targetCells = s.bots.map((b) => (b.target >= 0 ? itemCell(b.target) : -1));
  const scoutCells = s.scouted.map((r) => w.order[r]);
  const level = routeLevel(s, s.route);
  reorder(w, s.ring, s.route, level);
  s.plan.push([s.ring, s.route, level]);
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
  for (let guard = 0; left > EPS && guard < 500000; guard++) {
    const st = stats(s);
    const live = s.ring < ringCount(w);
    const key = `${s.ring}/${s.weather.epoch}`;
    if (key !== clearKey) { clearKey = key; clearTo.length = 0; }

    // The sky changes.
    const nextSky = (s.weather.epoch + 1) * WEATHER_EPOCH;
    if (s.playTime >= nextSky - 1e-7) { s.weather = evolveWeather(s, w, Math.floor((s.playTime + 1e-7) / WEATHER_EPOCH)); continue; }

    const starts = live ? arcStarts(w, s.ring, s.ringRobots) : [totalCells(w)];
    const arcs = s.bots.map((_, j) => arcOfBot(s, w, j, starts, st.grip));

    // Ring done (every arc finished): on to the next.
    if (live && arcs.every((a, j) => !a || s.bots[j].prog >= a.len - EPS)) {
      nextRing(s, w, st.explorers);
      fetched = new Set(s.fetched); // a new route renumbers the items
      mined = null;
      continue;
    }

    // Instant decisions: hold full, or arc done with cargo -> head to camp.
    let changed = false;
    s.bots.forEach((b, j) => {
      if (b.trip !== 'explore') return;
      const a = arcs[j];
      const done = !a || b.prog >= a.len - EPS;
      if (b.cargo >= st.cargo * (1 - EPS) || (done && b.cargo > 0)) {
        goHome(s, w, b, a ? cellOf(w, st.grip, a, b.prog) : undefined);
        changed = true;
      }
    });
    if (changed) continue;

    // Detours: each cell reached on the way out is mined (its bluetreri, deposit and item, unless exploring got there
    // first). A full hold ends the detour: the item is left for later and the rover heads to camp from where it is.
    const plans: (DetourPlan | null)[] = s.bots.map((b) => (b.trip === 'detour' ? detourPlan(w, st.grip, b.from, b.target) : null));
    s.bots.forEach((b, j) => {
      const plan = plans[j];
      if (!plan) return;
      if (b.travelLen <= 0) b.travelLen = plan.total; // a detour loaded from an older save
      const last = plan.path.length - 1;
      let pr: Progress | null = null;
      while (b.walked < last && b.travel >= plan.cum[b.walked + 1] - EPS * Math.max(1, plan.cum[b.walked + 1])) {
        b.walked++;
        const cell = plan.path[b.walked];
        const r = w.rank[cell];
        pr ??= progress(s, w);
        if (!revealed(s, w, r, pr) && !minedSet.has(cell)) {
          b.cargo = Math.min(st.cargo, b.cargo + w.value[cell] * st.loot);
          if (st.cargo - b.cargo < st.cargo * EPS * 10) b.cargo = st.cargo;
          s.mined.push(cell);
          minedSet.add(cell);
          if (w.special[cell]) ev.specials.push(cell);
          const k = b.walked === last ? b.target : itemAt(w, r);
          if (k >= 0 && (k === b.target || !fetched.has(k))) {
            if (k !== b.target) { fetched.add(k); s.fetched.push(k); }
            collect(s, w, k, ev, b);
          }
        } else if (b.walked === last) collect(s, w, b.target, ev, b);
        changed = true;
        if (b.cargo >= st.cargo * (1 - EPS)) {
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
          goHome(s, w, b, to);
          return;
        }
      }
    });
    if (changed) { mined = null; continue; }

    // Radar: a rover that spots an item around it leaves its arc to fetch it.
    const p = live && st.radar > 0 ? progress(s, w) : null;
    const spot = (cell: number, own: number) => nearestItem(w, w.order[cell], st.radar, (k) => {
      const r = w.itemRanks[k];
      return !fetched.has(k) && r !== own && !revealed(s, w, r, p!);
    });
    if (p) {
      for (let j = 0; j < s.bots.length; j++) {
        const b = s.bots[j];
        const a = arcs[j];
        if (b.trip !== 'explore' || !a || b.prog >= a.len - EPS) continue;
        const c = cellOf(w, st.grip, a, b.prog);
        const k = spot(c, c);
        if (k < 0) continue;
        fetched.add(k);
        s.fetched.push(k);
        b.trip = 'detour';
        b.target = k;
        b.from = c;
        b.travel = 0;
        b.walked = 0;
        b.travelLen = detourPlan(w, st.grip, c, k).total;
        changed = true;
      }
    }
    if (changed) continue;

    // Each rover's speed right now: storms slow exploring and detours, a full hold slows the drive home.
    const exploreCell: number[] = [];
    const speedOf = s.bots.map((b, j) => {
      const a = arcs[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return 0;
        exploreCell[j] = cellOf(w, st.grip, a, b.prog);
        return st.speed * weatherFactor(s.weather.storms, w.size, w.order[exploreCell[j]], st.armour);
      }
      if (b.trip === 'detour') return st.speed * weatherFactor(s.weather.storms, w.size, w.order[b.from], st.armour);
      if (b.trip === 'home') return homeSpeed(st, b.cargo);
      return st.travelSpeed;
    });

    // When each rover's next event happens.
    let step = Math.min(left, nextSky - s.playTime);
    const stopAt: (number | undefined)[] = [];
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      const v = speedOf[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return; // waits for the others to finish
        let target = a.len;
        // Where the hold fills up: find the exact point (bluetreri grows continuously with the steps).
        const room = st.cargo - b.cargo;
        mined ??= minedIndex(s, w);
        const m = mined;
        const g0 = arcGold(w, st.grip, a, b.prog, m);
        if ((arcGold(w, st.grip, a, a.len, m) - g0) * st.loot >= room) {
          let lo = b.prog;
          let hi = a.len;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if ((arcGold(w, st.grip, a, mid, m) - g0) * st.loot >= room) hi = mid;
            else lo = mid;
          }
          target = hi;
        }
        // The first cell ahead (within reach in this step) where the weather changes or the radar spots something.
        const c = exploreCell[j];
        const f = v;
        const horizon = Math.min(cellOf(w, st.grip, a, Math.min(target, b.prog + v * step)), a.hi - 1);
        for (let m = Math.max(c + 1, clearTo[j] ?? 0); m <= horizon; m++) {
          const fm = st.speed * weatherFactor(s.weather.storms, w.size, w.order[m], st.armour);
          if (fm !== f || (p && spot(m, m) >= 0)) {
            target = Math.min(target, stepsAt(w, st.grip, m) - stepsAt(w, st.grip, a.lo));
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
    if (!live && s.bots.every((b) => b.trip === 'explore')) break; // map done and everyone unloaded
    step = Math.max(0, step);

    // Everyone advances `step` seconds.
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      const v = speedOf[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return;
        const from = b.prog;
        const stop = stopAt[j]!;
        let to = Math.min(stop, from + v * step);
        if (to >= stop - EPS * Math.max(1, stop)) to = stop;
        mined ??= minedIndex(s, w);
        const g = (arcGold(w, st.grip, a, to, mined) - arcGold(w, st.grip, a, from, mined)) * st.loot;
        b.prog = to;
        b.cargo = Math.min(st.cargo, b.cargo + g);
        if (st.cargo - b.cargo < st.cargo * EPS * 10) b.cargo = st.cargo;
        // Cells it has reached: deposits and items.
        const r0 = a.lo + Math.floor(arcReach(w, st.grip, a, from));
        const r1 = a.lo + Math.floor(arcReach(w, st.grip, a, to));
        if (r1 > r0) {
          for (const r of specialsBetween(w, r0, r1)) if (!minedSet.has(w.order[r])) ev.specials.push(w.order[r]);
          for (const k of itemsBetween(w, r0, r1)) if (!fetched.has(k)) collect(s, w, k, ev, b);
        }
      } else {
        if (b.trip === 'detour') {
          const stop = stopAt[j]!;
          b.travel = Math.min(stop, b.travel + v * step);
          if (b.travel >= stop - EPS * Math.max(1, stop)) b.travel = stop;
        } else b.travel = Math.min(b.travelLen, b.travel + v * step);
        if (b.travel < b.travelLen - EPS) return;
        if (b.trip === 'home') {
          const g = D(b.cargo);
          s.gold = s.gold.add(g);
          s.totalGold = s.totalGold.add(g);
          ev.deposited += b.cargo;
          b.cargo = 0;
          b.found = 0;
          b.trip = 'out';
          b.travel = 0;
          if (s.ring >= ringCount(w)) b.trip = 'explore';
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
          b.trip = 'explore';
        } else {
          b.trip = 'explore';
        }
        b.travel = 0;
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
  s.bots = Array.from({ length: stats(s).explorers }, () => newBot());
  s.ringRobots = s.bots.length;
  delete s.legacyWalked;
}

function collect(s: GameState, w: World, k: number, ev: TickEvents, b: Bot): void {
  const r = w.itemRanks[k];
  s.items[ITEMS[w.item[w.order[r]] - 1].id]++;
  b.found++;
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
  s.works[id] < WORKS_MAX && s.items[workById(id).item] >= nextWorkCost(s, w, id);

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

export function canBuy(s: GameState, id: StatId, qty = 1): boolean {
  const def = upgradeById(id);
  return !!def && s.gold.gte(costOf(def, s.upgrades[id], qty));
}

export function buy(s: GameState, w: World, id: StatId, qty = 1): boolean {
  const def = upgradeById(id);
  if (!def) return false;
  const cost = costOf(def, s.upgrades[id], qty);
  if (s.gold.lt(cost)) return false;
  s.gold = s.gold.sub(cost);
  // Tyres change how many steps each cell costs: keep every rover on the same cell of its arc.
  const before = id === 'tyres' ? progress(s, w) : null;
  const oldGrip = stats(s).grip;
  s.upgrades[id] += qty;
  if (before) {
    const grip = stats(s).grip;
    // Detours keep the same share of their way.
    for (const b of s.bots) {
      if (b.trip !== 'detour' || b.travelLen <= 0) continue;
      const total = detourPlan(w, grip, b.from, b.target).total;
      b.travel *= total / detourPlan(w, oldGrip, b.from, b.target).total;
      b.travelLen = total;
    }
    before.robotOf.forEach((j, k) => {
      const b = s.bots[j];
      if (b) b.prog = stepsForReach(w, grip, before.starts[k], before.starts[k + 1], before.reach[k]);
    });
  }
  return true;
}

/** Whether route `id` can be unlocked now (bluetreri and items). */
export function canUnlockRoute(s: GameState, id: RouteId): boolean {
  const def = routeById(id);
  if (!def || s.routes.includes(id) || s.gold.lt(def.gold)) return false;
  return Object.entries(def.items).every(([k, n]) => s.items[k as keyof GameState['items']] >= (n ?? 0));
}

/** Pays for route `id` and unlocks it. */
export function unlockRoute(s: GameState, id: RouteId): boolean {
  if (!canUnlockRoute(s, id)) return false;
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
export function canUpgradeRoute(s: GameState, id: RouteId): boolean {
  const c = routeUpgradeCost(s, id);
  return !!c && s.gold.gte(c.gold) && Object.entries(c.items).every(([k, n]) => s.items[k as ItemId] >= (n ?? 0));
}
/** Pays for the next level of route `id`; it takes effect at the next ring if that route is in use. */
export function upgradeRoute(s: GameState, id: RouteId): boolean {
  if (!canUpgradeRoute(s, id)) return false;
  const c = routeUpgradeCost(s, id)!;
  s.gold = s.gold.sub(c.gold);
  for (const [k, n] of Object.entries(c.items)) s.items[k as ItemId] -= n ?? 0;
  s.routeLevels[id] = routeLevel(s, id) + 1;
  return true;
}

/** Picks the route the rovers follow from the next ring on. */
export function chooseRoute(s: GameState, id: RouteId): boolean {
  if (!s.routes.includes(id)) return false;
  s.route = id;
  return true;
}

export function setZoom(s: GameState, z: number): void {
  s.zoom = Math.max(0, Math.min(s.zoomUnlocked - 1, z));
}
