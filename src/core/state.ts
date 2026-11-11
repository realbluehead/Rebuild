import { D, Decimal } from './decimal';
import { UPGRADES, type StatId } from '../content/upgrades';
import { ITEMS, WORKS, type ItemId, type WorkId } from '../content/collection';
import { randomSeed } from './rng';

/** Què fa un robot: explorar el seu tros d'anell, tornar al campament a descarregar, tornar a sortir cap a la
 *  frontera, o anar a buscar un objecte que ha vist el radar. */
export type Trip = 'explore' | 'home' | 'out' | 'detour';

/** Cada robot va per lliure: té la seva càrrega, el seu viatge i el seu tros (arc) de l'anell actual. */
export interface Bot {
  trip: Trip;
  /** Passos fets dins del seu arc de l'anell actual. */
  prog: number;
  /** Bluetreri que porta i encara no ha descarregat. */
  cargo: number;
  /** Passos fets del viatge actual (tornada, sortida o desviament) i quants en té. */
  travel: number;
  travelLen: number;
  /** Objecte (índex a `world.itemRanks`) que va a buscar, si és un desviament; si no, -1. */
  target: number;
}

export const newBot = (trip: Trip = 'explore', travelLen = 0): Bot => ({ trip, prog: 0, cargo: 0, travel: 0, travelLen, target: -1 });

export interface GameState {
  /** Seed del mapa: el món es regenera a partir d'aquí. */
  seed: number;
  /** Anell que s'està explorant ara (els anteriors ja són tots descoberts). */
  ring: number;
  /** En quants arcs es reparteix l'anell actual (un per robot; els robots nous s'afegeixen a l'anell següent). */
  ringRobots: number;
  bots: Bot[];
  gold: Decimal;
  /** Bluetreri total guanyat des de l'inici. */
  totalGold: Decimal;
  upgrades: Record<StatId, number>;
  /** Objectes trobats i encara no gastats. */
  items: Record<ItemId, number>;
  /** Obres creades de cada mena. */
  works: Record<WorkId, number>;
  /** Objectes (índex a `world.itemRanks`) que el radar ja ha repassat: els d'abans d'aquest o ja s'han recollit o
   *  algun robot els ha anat (o hi va) a buscar. */
  radarNext: number;
  /** Nombre de nivells de zoom desbloquejats (1..ZOOMS.length). */
  zoomUnlocked: number;
  /** Zoom que s'està mirant (0 = el més proper). */
  zoom: number;
  /** Temps de joc acumulat, en segons. */
  playTime: number;
  /** Partides antigues (v3 o abans): passos totals, per convertir-los quan ja hi ha el món (`fromLegacy`). */
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
    radarNext: 0,
    zoomUnlocked: 1,
    zoom: 0,
    playTime: 0,
  };
}
