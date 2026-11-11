import { D, Decimal } from './decimal';
import { UPGRADES, type StatId } from '../content/upgrades';
import { randomSeed } from './rng';

/** Què fan els robots: explorar, tornar al campament a descarregar l'or o tornar a sortir cap a la frontera. */
export type Trip = 'explore' | 'home' | 'out';

export interface GameState {
  /** Seed del mapa: el món es regenera a partir d'aquí. */
  seed: number;
  /** Passos fets pels robots (temps d'exploració). Les caselles descobertes en surten amb `explored()`. */
  walked: number;
  gold: Decimal;
  /** Or total guanyat des de l'inici. */
  totalGold: Decimal;
  upgrades: Record<StatId, number>;
  /** Or que porten els robots i encara no han descarregat al campament. */
  cargo: Decimal;
  trip: Trip;
  /** Passos fets del viatge actual (tornada o sortida) i quants en té. */
  travel: number;
  travelLen: number;
  /** Robots que treballen a l'anell actual (els nous s'hi afegeixen quan comença el següent). */
  ringRobots: number;
  /** Nombre de nivells de zoom desbloquejats (1..ZOOMS.length). */
  zoomUnlocked: number;
  /** Zoom que s'està mirant (0 = el més proper). */
  zoom: number;
  /** Temps de joc acumulat, en segons. */
  playTime: number;
}

export function newGame(seed = randomSeed()): GameState {
  return {
    seed,
    walked: 0,
    gold: D(0),
    totalGold: D(0),
    cargo: D(0),
    trip: 'explore',
    travel: 0,
    travelLen: 0,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<StatId, number>,
    ringRobots: 1,
    zoomUnlocked: 1,
    zoom: 0,
    playTime: 0,
  };
}
