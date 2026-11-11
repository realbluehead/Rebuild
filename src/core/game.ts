// Simulació pura: cap accés a DOM, rellotge ni emmagatzematge. Tot és testable.
import { D, Decimal } from './decimal';
import type { GameState } from './state';
import { BASE_CARGO, BASE_SPEED, CARGO_MULT, radarRange, SPEED_MULT, TRAVEL_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { workById, workCost, ITEMS, type WorkId } from '../content/collection';
import { cellsExplored, isRevealed, itemsBetween, revealedGold, revealedRanges, ringAt, ringOfRank, specialsBetween, totalSteps, unlockAt, type World } from './world';

export const TICK_RATE = 10; // ticks per segon
export const TICK_SEC = 1 / TICK_RATE;

export interface Stats {
  /** Passos per segon de cada robot explorant. */
  speed: number;
  /** Passos per segon de cada robot pel terreny ja descobert (anant o tornant del campament). */
  travelSpeed: number;
  /** Multiplicador d'or (discos). */
  loot: number;
  /** Abast del radar en anells (0 = sense radar). */
  radar: number;
  /** Or que pot carregar cada robot. */
  cargo: number;
  explorers: number;
  /** Passos d'exploració per segon de tots els robots junts (cada pas a una casella contigua nova la descobreix). */
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

/** Or que poden carregar entre tots els robots que treballen ara. */
export const capacity = (s: GameState): number => stats(s).cargo * s.ringRobots;

/** Passos del campament fins a la frontera on exploren els robots (distància de camí de l'anell). */
export const homeDistance = (s: GameState, w: World): number => ringAt(w, s.walked) + 1;

/** Or per segon que arriba al campament de mitjana (explorar fins a omplir la bodega + anar i tornar). */
export function goldPerSec(s: GameState, w: World): number {
  const st = stats(s);
  const look = Math.max(1, st.stepsPerSec * 30);
  const g = ((revealedGold(w, s.walked + look, s.ringRobots) - revealedGold(w, s.walked, s.ringRobots)) / look) * st.loot;
  if (!(g > 0)) return 0;
  const cap = capacity(s);
  return cap / (cap / g / st.stepsPerSec + (2 * homeDistance(s, w)) / st.travelSpeed);
}

/** Caselles descobertes (amb fracció). */
export const explored = (s: GameState, w: World): number => cellsExplored(w, s.walked, s.ringRobots);

export const isComplete = (s: GameState, w: World): boolean =>
  s.walked >= totalSteps(w) && s.trip === 'explore' && s.cargo.lte(0);

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
  /** Or descarregat al campament en aquest pas (0 si cap). */
  deposited: number;
  /** Zoom desbloquejat en aquest pas (nombre de nivells), si n'hi ha. */
  zoomUnlocked?: number;
}

/** Robots a l'anell on hi haurà `x` passos fets (els nous s'hi afegeixen quan en comença un de nou). */
const robotsAt = (s: GameState, w: World, x: number, explorers: number): number =>
  ringAt(w, x) === ringAt(w, s.walked) ? s.ringRobots : explorers;

/** Avança la simulació `dt` segons. Exacta per a qualsevol dt: es parteix per fases (explorar, tornar, sortir). */
export function tick(s: GameState, w: World, dt: number): TickEvents {
  const ev: TickEvents = { specials: [], items: [], deposited: 0 };
  if (dt <= 0) return ev;
  s.playTime += dt;
  const n = totalSteps(w);
  let left = dt;
  for (let guard = 0; left > 1e-9 && guard < 200000; guard++) {
    const st = stats(s);
    if (s.trip === 'explore') {
      const cap = capacity(s);
      if (s.cargo.toNumber() >= cap - 1e-9 || (s.walked >= n && s.cargo.gt(0))) {
        // Bodega plena (o mapa acabat): cap al campament.
        s.trip = 'home';
        s.travel = 0;
        s.travelLen = homeDistance(s, w);
        continue;
      }
      if (s.walked >= n) break;
      // Radar: el primer objecte pendent, si ja el detecta, un robot s'hi desvia a buscar-lo.
      let radarStop = Infinity;
      if (st.radar > 0) {
        const ring = ringAt(w, s.walked);
        while (s.radarNext < w.itemRanks.length && isRevealed(w, s.walked, s.ringRobots, w.itemRanks[s.radarNext])) s.radarNext++;
        if (s.radarNext < w.itemRanks.length) {
          const itemRing = ringOfRank(w, w.itemRanks[s.radarNext]);
          if (itemRing <= ring + st.radar) {
            s.trip = 'detour';
            s.travel = 0;
            s.travelLen = 2 * (itemRing - ring + 1);
            continue;
          }
          // No s'explora més enllà d'on el radar el detectarà.
          radarStop = w.ringSteps[itemRing - st.radar];
        }
      }
      const from = s.walked;
      const r0 = s.ringRobots;
      const g0 = revealedGold(w, from, r0);
      const gold = (x: number) => (revealedGold(w, x, robotsAt(s, w, x, st.explorers)) - g0) * st.loot;
      const room = cap - s.cargo.toNumber();
      let to = Math.min(n, from + st.stepsPerSec * left, radarStop);
      let full = false;
      if (gold(to) >= room) {
        // On s'omple la bodega: l'or creix de manera contínua amb els passos, així que es busca el punt exacte.
        let lo = from;
        let hi = to;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          if (gold(mid) >= room) hi = mid;
          else lo = mid;
        }
        to = hi;
        full = true;
      }
      const r1 = robotsAt(s, w, to, st.explorers);
      const got = full ? room : Math.max(0, gold(to));
      for (const [a, b] of revealedRanges(w, from, to, r0, r1)) {
        ev.specials.push(...specialsBetween(w, a, b));
        for (const k of itemsBetween(w, a, b)) if (k >= s.radarNext) collect(s, w, k, ev);
      }
      s.walked = to;
      s.ringRobots = r1;
      s.cargo = s.cargo.add(got);
      left -= (to - from) / st.stepsPerSec;
      if (full) s.cargo = D(cap);
    } else {
      // Pel terreny ja descobert es camina de pressa; per anar a buscar un objecte dins la foscor, al pas d'explorar.
      const v = s.trip === 'detour' ? st.speed : st.travelSpeed;
      const need = (s.travelLen - s.travel) / v;
      if (need > left) {
        s.travel += left * v;
        break;
      }
      left -= need;
      if (s.trip === 'detour') {
        collect(s, w, s.radarNext, ev);
        s.radarNext++;
        s.trip = 'explore';
        s.travel = 0;
        s.travelLen = 0;
      } else if (s.trip === 'home') {
        const g = s.cargo;
        s.gold = s.gold.add(g);
        s.totalGold = s.totalGold.add(g);
        ev.deposited += g.toNumber();
        s.cargo = D(0);
        s.trip = 'out';
        s.travel = 0;
        if (s.walked >= n) { s.trip = 'explore'; break; }
      } else {
        s.trip = 'explore';
        s.travel = 0;
        s.travelLen = 0;
      }
    }
  }
  const cells = explored(s, w);
  while (s.zoomUnlocked < ZOOMS.length && cells >= unlockAt(w, s.zoomUnlocked - 1)) {
    s.zoomUnlocked++;
    ev.zoomUnlocked = s.zoomUnlocked;
  }
  return ev;
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
