// Simulació pura: cap accés a DOM, rellotge ni emmagatzematge. Tot és testable.
//
// Cada robot va per lliure. Quan comença un anell, es reparteix en arcs (un per robot) i cada robot explora el seu
// al seu ritme (la rugositat del terreny el frena). Quan té la bodega plena, o acaba el seu arc amb càrrega, torna
// al campament a descarregar i torna a sortir. L'anell següent comença quan tots els arcs estan fets. Així els
// robots surten i tornen en moments diferents. `tick` processa els esdeveniments (bodega plena, arc acabat, viatge
// acabat…) en ordre de temps, i per això dona el mateix amb un pas llarg (offline) que amb molts de curts.
import { D, Decimal } from './decimal';
import { newBot, type Bot, type GameState } from './state';
import { BASE_CARGO, BASE_SPEED, CARGO_MULT, radarRange, SPEED_MULT, TRAVEL_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { workById, workCost, ITEMS, type WorkId } from '../content/collection';
import { arcOf, arcStarts, cellsReached, itemsBetween, prefixAt, ringAt, ringCount, ringOfRank, specialsBetween, totalCells, unlockAt, type World } from './world';

export const TICK_RATE = 10; // ticks per segon
export const TICK_SEC = 1 / TICK_RATE;
const EPS = 1e-9;

export interface Stats {
  /** Passos per segon de cada robot explorant. */
  speed: number;
  /** Passos per segon de cada robot pel terreny ja descobert (anant o tornant del campament). */
  travelSpeed: number;
  /** Multiplicador de bluetreri (discos). */
  loot: number;
  /** Abast del radar en anells (0 = sense radar). */
  radar: number;
  /** Bluetreri que pot carregar cada robot. */
  cargo: number;
  explorers: number;
  /** Passos d'exploració per segon de tots els robots junts. */
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

/** Bluetreri que poden carregar entre tots els robots. */
export const capacity = (s: GameState): number => stats(s).cargo * s.bots.length;

/** Bluetreri que porten ara entre tots els robots. */
export const carried = (s: GameState): number => s.bots.reduce((a, b) => a + b.cargo, 0);

/** Passos del campament fins a la frontera (distància de camí de l'anell). */
export const homeDistance = (s: GameState): number => s.ring + 1;

/** Com va l'anell actual: on comença i acaba, l'inici de cada arc i fins on ha arribat el robot de cada arc. */
export interface Progress {
  ring: number;
  a: number;
  b: number;
  /** starts[k] = primer rang de l'arc k (un valor més: el final de l'anell). */
  starts: number[];
  /** reach[k] = caselles recorregudes (amb fracció) dins de l'arc k. */
  reach: number[];
  /** robotOf[k] = índex (a `bots`) del robot que fa l'arc k. */
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

/** Caselles descobertes (amb fracció). */
export function explored(s: GameState, w: World): number {
  const p = progress(s, w);
  return p.a + p.reach.reduce((x, y) => x + y, 0);
}

/** Si la casella de rang r ja l'ha trepitjada algun robot. */
export function revealed(s: GameState, w: World, r: number, p = progress(s, w)): boolean {
  if (r < p.a) return true;
  if (r >= p.b) return false;
  let k = p.reach.length - 1;
  while (k > 0 && p.starts[k] > r) k--;
  return r < p.starts[k] + Math.floor(p.reach[k]);
}

export const isComplete = (s: GameState, w: World): boolean =>
  s.ring >= ringCount(w) && s.bots.every((b) => b.trip === 'explore' && b.cargo <= 0);

/** Bluetreri per segon que arriba al campament de mitjana (cada robot: explorar fins a omplir la bodega + anar i tornar). */
export function goldPerSec(s: GameState, w: World): number {
  if (s.ring >= ringCount(w)) return 0;
  const st = stats(s);
  const a = w.rings[s.ring];
  const b = w.rings[s.ring + 1];
  const g = ((w.goldPrefix[b] - w.goldPrefix[a]) / Math.max(EPS, w.steps[b] - w.steps[a])) * st.loot; // per pas
  if (!(g > 0)) return 0;
  const perBot = st.cargo / (st.cargo / (g * st.speed) + (2 * homeDistance(s)) / st.travelSpeed);
  return perBot * s.bots.length;
}

/** Cost de comprar `qty` nivells tenint-ne ja `owned` (suma geomètrica). */
export function costOf(def: UpgradeDef, owned: number, qty = 1): Decimal {
  const r = D(def.costGrowth);
  const first = D(def.baseCost).mul(r.pow(owned));
  return first.mul(r.pow(qty).sub(1)).div(r.sub(1));
}

export interface TickEvents {
  /** Rangs dels llocs especials descoberts en aquest pas. */
  specials: number[];
  /** Rangs de les caselles d'on s'han recollit objectes en aquest pas. */
  items: number[];
  /** Bluetreri descarregat al campament en aquest pas (0 si cap). */
  deposited: number;
  /** Zoom desbloquejat en aquest pas (nombre de nivells), si n'hi ha. */
  zoomUnlocked?: number;
}

/** Arc que fa el robot j a l'anell actual: [inici, final) i quants passos té; null si no en té. */
function arcOfBot(s: GameState, w: World, j: number, starts: number[]): { lo: number; hi: number; len: number } | null {
  const arcs = starts.length - 1;
  if (s.ring >= ringCount(w) || j >= arcs) return null;
  const k = arcOf(s.ring, j, arcs);
  const lo = starts[k];
  const hi = starts[k + 1];
  return { lo, hi, len: w.steps[hi] - w.steps[lo] };
}

/** Caselles (amb fracció) recorregudes dins d'un arc després de `prog` passos. Si l'arc és acabat, totes
 *  (sense dependre d'arrodoniments en sumar passos). */
const arcReach = (w: World, a: { lo: number; hi: number; len: number }, prog: number): number =>
  prog >= a.len - EPS ? a.hi - a.lo : cellsReached(w, a.lo, a.hi, w.steps[a.lo] + prog);

/** Bluetreri (sense multiplicadors) recollit dins d'un arc després de `prog` passos. */
const arcGold = (w: World, arc: { lo: number; hi: number }, prog: number): number =>
  prefixAt(w, arc.lo + cellsReached(w, arc.lo, arc.hi, w.steps[arc.lo] + prog)) - w.goldPrefix[arc.lo];

/** Comença l'anell següent: es reparteix entre tots els robots, i els robots nous surten del campament. */
function nextRing(s: GameState, w: World, explorers: number): void {
  s.ring++;
  while (s.ring < ringCount(w) && w.rings[s.ring + 1] === w.rings[s.ring]) s.ring++;
  while (s.bots.length < explorers) s.bots.push(newBot('out', homeDistance(s)));
  s.ringRobots = s.bots.length;
  for (const b of s.bots) b.prog = 0;
}

function goHome(s: GameState, b: Bot): void {
  b.trip = 'home';
  b.travel = 0;
  b.travelLen = homeDistance(s);
}

/** Avança la simulació `dt` segons. */
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

    // Anell acabat (tots els arcs fets): el següent.
    if (live && arcs.every((a, j) => !a || s.bots[j].prog >= a.len - EPS)) { nextRing(s, w, st.explorers); continue; }

    // Decisions instantànies: bodega plena, o arc acabat amb càrrega → cap al campament.
    let changed = false;
    s.bots.forEach((b, j) => {
      if (b.trip !== 'explore') return;
      const a = arcs[j];
      const done = !a || b.prog >= a.len - EPS;
      if (b.cargo >= st.cargo * (1 - EPS) || (done && b.cargo > 0)) { goHome(s, b); changed = true; }
    });
    if (changed) continue;

    // Radar: el primer objecte pendent, si ja el detecta, el va a buscar un robot que estigui explorant.
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
          b.travel = 0;
          b.travelLen = 2 * (itemRing - s.ring + 1);
          continue;
        }
      }
    }

    // Quan passa el proper esdeveniment de cada robot.
    let step = left;
    const fullAt: (number | undefined)[] = [];
    s.bots.forEach((b, j) => {
      const a = arcs[j];
      if (b.trip === 'explore') {
        if (!a || b.prog >= a.len - EPS) return; // espera que acabin els altres
        let t = (a.len - b.prog) / st.speed;
        const room = st.cargo - b.cargo;
        const g0 = arcGold(w, a, b.prog);
        if ((arcGold(w, a, a.len) - g0) * st.loot >= room) {
          // On s'omple la bodega: es busca el punt exacte (el bluetreri creix de manera contínua amb els passos).
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
    if (!live && s.bots.every((b) => b.trip === 'explore')) break; // mapa acabat i tothom descarregat
    step = Math.max(0, step);

    // Tothom avança `step` segons.
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
        // Caselles a les quals ha arribat: llocs especials i objectes.
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
          b.target = -1;
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

/** Converteix una partida antiga (passos totals de la flota) al model de robots independents. */
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

/** Objectes que costa la propera obra d'aquesta mena. */
export const nextWorkCost = (s: GameState, id: WorkId): number => workCost(workById(id), s.works[id]);

export const canCraft = (s: GameState, id: WorkId): boolean => s.items[workById(id).item] >= nextWorkCost(s, id);

/** Crea la propera obra (llibre, disc o àlbum) amb els objectes recollits. */
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
