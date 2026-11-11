// Simulació pura: cap accés a DOM, rellotge ni emmagatzematge. Tot és testable.
import { D, Decimal } from './decimal';
import type { GameState } from './state';
import { BASE_CARGO, BASE_SPEED, CARGO_MULT, LOOT_MULT, SPEED_MULT, TRAVEL_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { cellsExplored, revealedGold, revealedSpecials, ringAt, totalSteps, unlockAt, type World } from './world';

export const TICK_RATE = 10; // ticks per segon
export const TICK_SEC = 1 / TICK_RATE;

export interface Stats {
  /** Passos per segon de cada robot explorant. */
  speed: number;
  /** Passos per segon de cada robot pel terreny ja descobert (anant o tornant del campament). */
  travelSpeed: number;
  /** Multiplicador d'or. */
  loot: number;
  /** Or que pot carregar cada robot. */
  cargo: number;
  explorers: number;
  /** Passos d'exploració per segon de tots els robots junts (cada pas a una casella contigua nova la descobreix). */
  stepsPerSec: number;
}

export function stats(s: GameState): Stats {
  const u = s.upgrades;
  const speed = BASE_SPEED * SPEED_MULT ** u.speed;
  const loot = LOOT_MULT ** u.loot;
  const cargo = BASE_CARGO * CARGO_MULT ** u.cargo;
  const explorers = 1 + u.explorers;
  return { speed, travelSpeed: speed * TRAVEL_MULT, loot, cargo, explorers, stepsPerSec: speed * explorers };
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
  const ev: TickEvents = { specials: [], deposited: 0 };
  if (dt <= 0) return ev;
  s.playTime += dt;
  const n = totalSteps(w);
  let left = dt;
  for (let guard = 0; left > 1e-9 && guard < 1000; guard++) {
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
      const from = s.walked;
      const r0 = s.ringRobots;
      const g0 = revealedGold(w, from, r0);
      const gold = (x: number) => (revealedGold(w, x, robotsAt(s, w, x, st.explorers)) - g0) * st.loot;
      const room = cap - s.cargo.toNumber();
      let to = Math.min(n, from + st.stepsPerSec * left);
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
      ev.specials.push(...revealedSpecials(w, from, to, r0, r1));
      s.walked = to;
      s.ringRobots = r1;
      s.cargo = s.cargo.add(got);
      left -= (to - from) / st.stepsPerSec;
      if (full) s.cargo = D(cap);
    } else {
      // Caminant pel terreny ja descobert, d'anada o de tornada.
      const need = (s.travelLen - s.travel) / st.travelSpeed;
      if (need > left) {
        s.travel += left * st.travelSpeed;
        break;
      }
      left -= need;
      if (s.trip === 'home') {
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
