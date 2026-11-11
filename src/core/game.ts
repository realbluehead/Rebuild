// Pure simulation: no DOM, clock or storage access. Everything is testable.
//
// Each rover works on its own. When a ring starts it is split into arcs (one per rover) and each rover explores
// its arc at its own pace (terrain roughness slows it down). When its hold is full, or it finishes its arc with
// cargo, it returns to camp to unload and heads out again. The next ring starts once every arc is done. That is
// why rovers leave and return at different times. `tick` processes events (hold full, arc done, trip done...)
// in time order, so one long step (offline) gives the same result as many short ones.
import { D, Decimal } from './decimal';
import { newBot, type Bot, type GameState } from './state';
import { BASE_CARGO, BASE_SPEED, CARGO_MULT, radarRange, SPEED_MULT, TRAVEL_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { workById, workCost, ITEMS, type WorkId } from '../content/collection';
import { arcOf, arcStarts, cellsReached, itemsBetween, pathCells, prefixAt, ringAt, ringCount, ringOfRank, specialsBetween, totalCells, unlockAt, type World } from './world';

export const TICK_RATE = 10; // ticks per second
export const TICK_SEC = 1 / TICK_RATE;
const EPS = 1e-9;

export interface Stats {
  /** Steps per second of each rover while exploring. */
  speed: number;
  /** Steps per second of each rover over known ground (going to or from camp). */
  travelSpeed: number;
  /** Bluetreri multiplier (records). */
  loot: number;
  /** Radar range in rings (0 = no radar). */
  radar: number;
  /** Bluetreri each rover can carry. */
  cargo: number;
  explorers: number;
  /** Exploring steps per second of all rovers together. */
  stepsPerSec: number;
}

export function stats(s: GameState): Stats {
  const u = s.upgrades;
  const wk = (id: WorkId) => workById(id).bonus ** s.works[id];
  const speed = BASE_SPEED * SPEED_MULT ** u.speed * wk('book');
  const loot = wk('cd');
  const cargo = BASE_CARGO * CARGO_MULT ** u.cargo * wk('album');
  const explorers = 1 + u.explorers;
  return { speed, travelSpeed: speed * TRAVEL_MULT, loot, radar: radarRange(u.radar), cargo, explorers, stepsPerSec: speed * explorers };
}

/** Bluetreri all rovers can carry together. */
export const capacity = (s: GameState): number => stats(s).cargo * s.bots.length;

/** Bluetreri all rovers are carrying right now. */
export const carried = (s: GameState): number => s.bots.reduce((a, b) => a + b.cargo, 0);

/** Steps from camp to the frontier (the ring's path distance). */
export const homeDistance = (s: GameState): number => s.ring + 1;

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
    const arc = { lo: starts[k], hi: starts[k + 1], len: w.steps[starts[k + 1]] - w.steps[starts[k]] };
    reach.push(arcReach(w, arc, s.bots[j]?.prog ?? 0));
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

export const isComplete = (s: GameState, w: World): boolean =>
  s.ring >= ringCount(w) && s.bots.every((b) => b.trip === 'explore' && b.cargo <= 0);

/** Average bluetreri per second reaching camp (per rover: explore until the hold is full + the round trip). */
export function goldPerSec(s: GameState, w: World): number {
  if (s.ring >= ringCount(w)) return 0;
  const st = stats(s);
  const a = w.rings[s.ring];
  const b = w.rings[s.ring + 1];
  const g = ((w.goldPrefix[b] - w.goldPrefix[a]) / Math.max(EPS, w.steps[b] - w.steps[a])) * st.loot; // per step
  if (!(g > 0)) return 0;
  const perBot = st.cargo / (st.cargo / (g * st.speed) + (2 * homeDistance(s)) / st.travelSpeed);
  return perBot * s.bots.length;
}

/** Cost of buying `qty` levels when `owned` are already owned (geometric sum). */
export function costOf(def: UpgradeDef, owned: number, qty = 1): Decimal {
  const r = D(def.costGrowth);
  const first = D(def.baseCost).mul(r.pow(owned));
  return first.mul(r.pow(qty).sub(1)).div(r.sub(1));
}

export interface TickEvents {
  /** Ranks of the deposits revealed in this step. */
  specials: number[];
  /** Ranks of the cells whose items were collected in this step. */
  items: number[];
  /** Bluetreri unloaded at camp in this step (0 if none). */
  deposited: number;
  /** Zoom unlocked in this step (number of levels), if any. */
  zoomUnlocked?: number;
}

/** Arc rover j works on the current ring: [start, end) and its length in steps; null if it has none. */
function arcOfBot(s: GameState, w: World, j: number, starts: number[]): { lo: number; hi: number; len: number } | null {
  const arcs = starts.length - 1;
  if (s.ring >= ringCount(w) || j >= arcs) return null;
  const k = arcOf(s.ring, j, arcs);
  const lo = starts[k];
  const hi = starts[k + 1];
  return { lo, hi, len: w.steps[hi] - w.steps[lo] };
}

/** Cells (with fraction) covered inside an arc after `prog` steps. If the arc is done, all of them
 *  (without depending on rounding when adding steps). */
const arcReach = (w: World, a: { lo: number; hi: number; len: number }, prog: number): number =>
  prog >= a.len - EPS ? a.hi - a.lo : cellsReached(w, a.lo, a.hi, w.steps[a.lo] + prog);

/** Bluetreri (before multipliers) collected inside an arc after `prog` steps. */
const arcGold = (w: World, arc: { lo: number; hi: number }, prog: number): number =>
  prefixAt(w, arc.lo + cellsReached(w, arc.lo, arc.hi, w.steps[arc.lo] + prog)) - w.goldPrefix[arc.lo];

/** Starts the next ring: it is split between all rovers, and new rovers leave camp. */
function nextRing(s: GameState, w: World, explorers: number): void {
  s.ring++;
  while (s.ring < ringCount(w) && w.rings[s.ring + 1] === w.rings[s.ring]) s.ring++;
  while (s.bots.length < explorers) s.bots.push(newBot('out', homeDistance(s)));
  s.ringRobots = s.bots.length;
  for (const b of s.bots) b.prog = 0;
  // Detour paths that exploring has caught up with are no longer needed.
  const a = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w);
  const kept: number[] = [];
  for (let i = 0; i < s.scouted.length; i += 3) if (s.scouted[i + 2] >= a) kept.push(s.scouted[i], s.scouted[i + 1], s.scouted[i + 2]);
  s.scouted = kept;
}

function goHome(s: GameState, b: Bot): void {
  b.trip = 'home';
  b.travel = 0;
  b.travelLen = homeDistance(s);
}

/** Advances the simulation by `dt` seconds. */
export function tick(s: GameState, w: World, dt: number): TickEvents {
  const ev: TickEvents = { specials: [], items: [], deposited: 0 };
  if (dt <= 0) return ev;
  s.playTime += dt;
  let left = dt;
  for (let guard = 0; left > EPS && guard < 500000; guard++) {
    const st = stats(s);
    const live = s.ring < ringCount(w);
    const starts = live ? arcStarts(w, s.ring, s.ringRobots) : [totalCells(w)];
    const arcs = s.bots.map((_, j) => arcOfBot(s, w, j, starts));

    // Ring done (every arc finished): on to the next.
    if (live && arcs.every((a, j) => !a || s.bots[j].prog >= a.len - EPS)) { nextRing(s, w, st.explorers); continue; }

    // Instant decisions: hold full, or arc done with cargo -> head to camp.
    let changed = false;
    s.bots.forEach((b, j) => {
      if (b.trip !== 'explore') return;
      const a = arcs[j];
      const done = !a || b.prog >= a.len - EPS;
      if (b.cargo >= st.cargo * (1 - EPS) || (done && b.cargo > 0)) { goHome(s, b); changed = true; }
    });
    if (changed) continue;

    // Radar: if the first pending item is already in range, an exploring rover goes to fetch it.
    if (live && st.radar > 0) {
      const p = progress(s, w);
      while (s.radarNext < w.itemRanks.length && revealed(s, w, w.itemRanks[s.radarNext], p)) s.radarNext++;
      if (s.radarNext < w.itemRanks.length) {
        const itemRing = ringOfRank(w, w.itemRanks[s.radarNext]);
        const j = s.bots.findIndex((b, i) => b.trip === 'explore' && arcs[i] && b.prog < arcs[i]!.len - EPS);
        if (itemRing <= s.ring + st.radar && j >= 0) {
          const b = s.bots[j];
          b.trip = 'detour';
          b.target = s.radarNext++;
          const arc = arcs[j]!;
          b.from = Math.min(arc.hi - 1, arc.lo + Math.floor(arcReach(w, arc, b.prog)));
          b.travel = 0;
          b.travelLen = 2 * (itemRing - s.ring + 1);
          continue;
        }
      }
    }

    // When each rover's next event happens.
    let step = left;
    const fullAt: (number | undefined)[] = [];
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return; // waits for the others to finish
        let t = (a.len - b.prog) / st.speed;
        const room = st.cargo - b.cargo;
        const g0 = arcGold(w, a, b.prog);
        if ((arcGold(w, a, a.len) - g0) * st.loot >= room) {
          // Where the hold fills up: find the exact point (bluetreri grows continuously with the steps).
          let lo = b.prog;
          let hi = a.len;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if ((arcGold(w, a, mid) - g0) * st.loot >= room) hi = mid;
            else lo = mid;
          }
          fullAt[j] = hi;
          t = Math.min(t, (hi - b.prog) / st.speed);
        }
        step = Math.min(step, t);
      } else {
        const v = b.trip === 'detour' ? st.speed : st.travelSpeed;
        step = Math.min(step, (b.travelLen - b.travel) / v);
      }
    });
    if (!live && s.bots.every((b) => b.trip === 'explore')) break; // map done and everyone unloaded
    step = Math.max(0, step);

    // Everyone advances `step` seconds.
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return;
        const from = b.prog;
        const full = fullAt[j];
        let to = Math.min(a.len, from + st.speed * step);
        if (full !== undefined && to >= full - EPS * Math.max(1, full)) to = full;
        const g = (arcGold(w, a, to) - arcGold(w, a, from)) * st.loot;
        b.prog = to;
        b.cargo = full !== undefined && to === full ? st.cargo : Math.min(st.cargo, b.cargo + g);
        // Cells it has reached: deposits and items.
        const r0 = a.lo + Math.floor(arcReach(w, a, from));
        const r1 = a.lo + Math.floor(arcReach(w, a, to));
        if (r1 > r0) {
          ev.specials.push(...specialsBetween(w, r0, r1));
          for (const k of itemsBetween(w, r0, r1)) if (k >= s.radarNext) collect(s, w, k, ev);
        }
      } else {
        const v = b.trip === 'detour' ? st.speed : st.travelSpeed;
        b.travel = Math.min(b.travelLen, b.travel + v * step);
        if (b.travel < b.travelLen - EPS) return;
        if (b.trip === 'home') {
          const g = D(b.cargo);
          s.gold = s.gold.add(g);
          s.totalGold = s.totalGold.add(g);
          ev.deposited += b.cargo;
          b.cargo = 0;
          b.trip = 'out';
          b.travel = 0;
          if (s.ring >= ringCount(w)) b.trip = 'explore';
        } else if (b.trip === 'detour') {
          collect(s, w, b.target, ev);
          if (b.from >= 0) {
            const to = w.itemRanks[b.target];
            let max = 0;
            for (const i of pathCells(w, b.from, to)) max = Math.max(max, w.rank[i]);
            s.scouted.push(b.from, to, max);
          }
          b.target = -1;
          b.from = -1;
          b.trip = 'explore';
        } else {
          b.trip = 'explore';
        }
        b.travel = 0;
      }
    });
    left -= step;
  }
  const cells = explored(s, w);
  while (s.zoomUnlocked < ZOOMS.length && cells >= unlockAt(w, s.zoomUnlocked - 1)) {
    s.zoomUnlocked++;
    ev.zoomUnlocked = s.zoomUnlocked;
  }
  return ev;
}

/** Converts an old save (total fleet steps) to the independent-rover model. */
export function fromLegacy(s: GameState, w: World): void {
  if (s.legacyWalked === undefined) return;
  s.ring = Math.min(ringCount(w), ringAt(w, s.legacyWalked));
  s.bots = Array.from({ length: stats(s).explorers }, () => newBot());
  s.ringRobots = s.bots.length;
  delete s.legacyWalked;
}

function collect(s: GameState, w: World, k: number, ev: TickEvents): void {
  const r = w.itemRanks[k];
  s.items[ITEMS[w.item[w.order[r]] - 1].id]++;
  ev.items.push(r);
}

/** Items the next work of this kind costs. */
export const nextWorkCost = (s: GameState, id: WorkId): number => workCost(workById(id), s.works[id]);

export const canCraft = (s: GameState, id: WorkId): boolean => s.items[workById(id).item] >= nextWorkCost(s, id);

/** Crafts the next work (book, record or album) from the collected items. */
export function craft(s: GameState, id: WorkId): boolean {
  if (!canCraft(s, id)) return false;
  s.items[workById(id).item] -= nextWorkCost(s, id);
  s.works[id]++;
  return true;
}

export function canBuy(s: GameState, id: StatId, qty = 1): boolean {
  const def = upgradeById(id);
  return !!def && s.gold.gte(costOf(def, s.upgrades[id], qty));
}

export function buy(s: GameState, id: StatId, qty = 1): boolean {
  const def = upgradeById(id);
  if (!def) return false;
  const cost = costOf(def, s.upgrades[id], qty);
  if (s.gold.lt(cost)) return false;
  s.gold = s.gold.sub(cost);
  s.upgrades[id] += qty;
  return true;
}

export function setZoom(s: GameState, z: number): void {
  s.zoom = Math.max(0, Math.min(s.zoomUnlocked - 1, z));
}
