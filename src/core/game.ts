// Simulació pura: cap accés a DOM, rellotge ni emmagatzematge. Tot és testable.
import { D, Decimal } from './decimal';
import type { GameState } from './state';
import { BASE_RADIUS, BASE_SPEED, LOOT_MULT, SPEED_MULT, upgradeById, type StatId, type UpgradeDef } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { cellsExplored, revealedGold, revealedSpecials, ringAt, totalSteps, unlockAt, type World } from './world';

export const TICK_RATE = 10; // ticks per segon
export const TICK_SEC = 1 / TICK_RATE;

export interface Stats {
  /** Passos per segon de cada robot. */
  speed: number;
  /** Radi de visió en caselles: cada pas descobreix una franja d'aquesta amplada. */
  radius: number;
  /** Multiplicador d'or. */
  loot: number;
  explorers: number;
  /** Passos per segon en total (cada pas a una casella contigua nova la descobreix). */
  stepsPerSec: number;
}

export function stats(s: GameState): Stats {
  const u = s.upgrades;
  const speed = BASE_SPEED * SPEED_MULT ** u.speed;
  const radius = BASE_RADIUS + u.radius;
  const loot = LOOT_MULT ** u.loot;
  const explorers = 1 + u.explorers;
  return { speed, radius, loot, explorers, stepsPerSec: speed * radius * explorers };
}

/** Or per segon al ritme actual (aproximat amb les caselles que vénen). */
export function goldPerSec(s: GameState, w: World): number {
  const st = stats(s);
  return (revealedGold(w, s.walked + st.stepsPerSec, s.ringRobots) - revealedGold(w, s.walked, s.ringRobots)) * st.loot;
}

/** Caselles descobertes (amb fracció). */
export const explored = (s: GameState, w: World): number => cellsExplored(w, s.walked, s.ringRobots);

export const isComplete = (s: GameState, w: World): boolean => s.walked >= totalSteps(w);

/** Cost de comprar `qty` nivells tenint-ne ja `owned` (suma geomètrica). */
export function costOf(def: UpgradeDef, owned: number, qty = 1): Decimal {
  const r = D(def.costGrowth);
  const first = D(def.baseCost).mul(r.pow(owned));
  return first.mul(r.pow(qty).sub(1)).div(r.sub(1));
}

export interface TickEvents {
  /** Rangs dels llocs especials descoberts en aquest pas. */
  specials: number[];
  /** Zoom desbloquejat en aquest pas (nombre de nivells), si n'hi ha. */
  zoomUnlocked?: number;
}

/** Avança la simulació `dt` segons. */
export function tick(s: GameState, w: World, dt: number): TickEvents {
  const ev: TickEvents = { specials: [] };
  if (dt <= 0) return ev;
  s.playTime += dt;
  const n = totalSteps(w);
  if (s.walked >= n) return ev;
  const st = stats(s);
  const from = s.walked;
  const to = Math.min(n, from + st.stepsPerSec * dt);
  // Els robots comprats a mig anell s'hi incorporen quan en comença un de nou.
  const r0 = s.ringRobots;
  const r1 = ringAt(w, to) === ringAt(w, from) ? r0 : st.explorers;
  const gold = D(Math.max(0, revealedGold(w, to, r1) - revealedGold(w, from, r0)) * st.loot);
  s.walked = to;
  s.ringRobots = r1;
  s.gold = s.gold.add(gold);
  s.totalGold = s.totalGold.add(gold);
  ev.specials = revealedSpecials(w, from, to, r0, r1);
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
