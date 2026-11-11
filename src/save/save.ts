// Format de partida amb versió. Quan canviï l'estructura de GameState:
//   1. puja SAVE_VERSION
//   2. afegeix la migració (vN → vN+1) a MIGRATIONS
//   3. afegeix un test amb una partida antiga real a save.test.ts
// (La v1 és la primera del joc d'exploració; encara no s'ha publicat cap versió anterior.)
import { D } from '../core/decimal';
import { newGame, type GameState } from '../core/state';
import { ZOOMS } from '../content/world';

export const SAVE_VERSION = 1;

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
  /** Afegit després de la v1 inicial; si falta, 1. */
  ringRobots?: number;
  zoomUnlocked: number;
  zoom: number;
  playTime: number;
}

type RawSave = { v: number } & Record<string, unknown>;

/** MIGRATIONS[n] converteix una partida de versió n a versió n+1. */
const MIGRATIONS: Record<number, (s: RawSave) => RawSave> = {
  // 1: (s) => ({ ...s, v: 2, gems: '0' }),
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
