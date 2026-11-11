// Format de partida amb versió. Quan canviï l'estructura de GameState:
//   1. puja SAVE_VERSION
//   2. afegeix la migració (vN → vN+1) a MIGRATIONS
//   3. afegeix un test amb una partida antiga real a save.test.ts
// v1: primera versió publicada. v2: els robots carreguen l'or i el porten al campament (bodega).
// v3: objectes (pàgines, notes, fotos), obres (llibres, discos, àlbums) i el radar que desvia els robots.
import { D } from '../core/decimal';
import { newGame, type GameState, type Trip } from '../core/state';
import { ZOOMS } from '../content/world';

export const SAVE_VERSION = 3;

/** Forma JSON de la partida: els Decimal es guarden com a text. */
export interface SaveData {
  v: number;
  /** Moment del desat (ms epoch), per calcular el progrés offline. */
  savedAt: number;
  seed: number;
  /** Passos fets pels robots. */
  walked: number;
  gold: string;
  totalGold: string;
  upgrades: Record<string, number>;
  /** v2: or que porten els robots i en quina part del viatge són. */
  cargo: string;
  trip: Trip;
  travel: number;
  travelLen: number;
  /** v3 */
  items: Record<string, number>;
  works: Record<string, number>;
  radarNext: number;
  /** Afegit després de la v1 inicial; si falta, 1. */
  ringRobots?: number;
  zoomUnlocked: number;
  zoom: number;
  playTime: number;
}

type RawSave = { v: number } & Record<string, unknown>;

/** MIGRATIONS[n] converteix una partida de versió n a versió n+1. */
const MIGRATIONS: Record<number, (s: RawSave) => RawSave> = {
  // v1 → v2: neix la bodega. El Radar antic (radi) desapareix i la Bodega antiga (or ×) passa a dir-se Radar,
  // que ja fa això mateix; la Bodega nova (capacitat) comença a 0. Els robots són explorant i sense càrrega.
  1: (s) => {
    const upgrades = { ...((s.upgrades ?? {}) as Record<string, number>) };
    delete upgrades.radius;
    return { ...s, v: 2, upgrades: { ...upgrades, cargo: 0 }, cargo: '0', trip: 'explore', travel: 0, travelLen: 0 };
  },
  // v2 → v3: el Radar deixa de donar or i passa a detectar objectes (es conserven els nivells). Sense objectes encara.
  2: (s) => {
    const { loot, ...rest } = (s.upgrades ?? {}) as Record<string, number>;
    return { ...s, v: 3, upgrades: { ...rest, radar: loot ?? 0 }, items: {}, works: {}, radarNext: 0 };
  },
};

export function serialize(s: GameState, now: number): SaveData {
  return {
    v: SAVE_VERSION,
    savedAt: now,
    seed: s.seed,
    walked: s.walked,
    gold: s.gold.toString(),
    totalGold: s.totalGold.toString(),
    upgrades: { ...s.upgrades },
    cargo: s.cargo.toString(),
    trip: s.trip,
    travel: s.travel,
    travelLen: s.travelLen,
    items: { ...s.items },
    works: { ...s.works },
    radarNext: s.radarNext,
    ringRobots: s.ringRobots,
    zoomUnlocked: s.zoomUnlocked,
    zoom: s.zoom,
    playTime: s.playTime,
  };
}

export function migrate(raw: RawSave): SaveData {
  let s = raw;
  if (typeof s.v !== 'number' || s.v > SAVE_VERSION) throw new Error(`Versió de partida desconeguda: ${s.v}`);
  while (s.v < SAVE_VERSION) {
    const step = MIGRATIONS[s.v];
    if (!step) throw new Error(`Falta la migració des de la v${s.v}`);
    s = step(s);
  }
  return s as unknown as SaveData;
}

export function deserialize(raw: RawSave): { state: GameState; savedAt: number } {
  const data = migrate(raw);
  if (typeof data.seed !== 'number') throw new Error('Partida sense seed');
  const state = newGame(data.seed);
  state.walked = Math.max(0, data.walked ?? 0);
  state.gold = D(data.gold ?? 0);
  state.totalGold = D(data.totalGold ?? 0);
  state.playTime = data.playTime ?? 0;
  state.cargo = D(data.cargo ?? 0);
  state.trip = data.trip === 'home' || data.trip === 'out' || data.trip === 'detour' ? data.trip : 'explore';
  state.radarNext = Math.max(0, Math.floor(data.radarNext ?? 0));
  for (const id of Object.keys(state.items) as (keyof GameState['items'])[]) state.items[id] = Math.max(0, data.items?.[id] ?? 0);
  for (const id of Object.keys(state.works) as (keyof GameState['works'])[]) state.works[id] = Math.max(0, data.works?.[id] ?? 0);
  state.travelLen = Math.max(0, data.travelLen ?? 0);
  state.travel = Math.min(state.travelLen, Math.max(0, data.travel ?? 0));
  state.ringRobots = Math.max(1, Math.floor(data.ringRobots ?? 1));
  state.zoomUnlocked = Math.min(ZOOMS.length, Math.max(1, data.zoomUnlocked ?? 1));
  state.zoom = Math.min(state.zoomUnlocked - 1, Math.max(0, data.zoom ?? 0));
  // Només les millores que encara existeixen; les noves queden a 0.
  for (const id of Object.keys(state.upgrades) as (keyof GameState['upgrades'])[]) state.upgrades[id] = data.upgrades?.[id] ?? 0;
  return { state, savedAt: data.savedAt };
}

/** Text per exportar/importar a mà (copiar i enganxar). */
export const exportSave = (d: SaveData): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const importSave = (text: string): RawSave => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
