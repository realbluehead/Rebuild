// Format de partida amb versió. Quan canviï l'estructura de GameState:
//   1. puja SAVE_VERSION
//   2. afegeix la migració (vN → vN+1) a MIGRATIONS
//   3. afegeix un test amb una partida antiga real a save.test.ts
// v1: primera versió publicada. v2: els robots carreguen el bluetreri i el porten al campament (bodega).
// v3: objectes (pàgines, notes, fotos), obres (llibres, discos, àlbums) i el radar que desvia els robots.
// v4: robots independents (cadascun amb càrrega, viatge i arc); `walked` passa a `legacyWalked` i es converteix
//     en carregar el món (`fromLegacy`).
import { D } from '../core/decimal';
import { newBot, newGame, type Bot, type GameState, type Trip } from '../core/state';
import { ZOOMS } from '../content/world';

export const SAVE_VERSION = 4;

/** Forma JSON de la partida: els Decimal es guarden com a text. */
export interface SaveData {
  v: number;
  /** Moment del desat (ms epoch), per calcular el progrés offline. */
  savedAt: number;
  seed: number;
  ring: number;
  ringRobots: number;
  bots: Bot[];
  /** Només en partides migrades de v3 o abans: passos totals antics. */
  legacyWalked?: number;
  gold: string;
  totalGold: string;
  upgrades: Record<string, number>;
  items: Record<string, number>;
  works: Record<string, number>;
  radarNext: number;
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
  // v3 → v4: robots independents. La càrrega que duia la flota es dona al primer robot; els passos totals es guarden
  // per convertir-los en anell quan hi hagi el món.
  3: (s) => {
    const rest = { ...s };
    const { walked, cargo } = rest;
    delete rest.walked; delete rest.cargo; delete rest.trip; delete rest.travel; delete rest.travelLen;
    const first = newBot();
    first.cargo = Number(cargo ?? 0) || 0;
    return { ...rest, v: 4, ring: 0, bots: [first], legacyWalked: Number(walked ?? 0) || 0 };
  },
};

export function serialize(s: GameState, now: number): SaveData {
  return {
    v: SAVE_VERSION,
    savedAt: now,
    seed: s.seed,
    ring: s.ring,
    ringRobots: s.ringRobots,
    bots: s.bots.map((b) => ({ ...b })),
    ...(s.legacyWalked !== undefined ? { legacyWalked: s.legacyWalked } : {}),
    gold: s.gold.toString(),
    totalGold: s.totalGold.toString(),
    upgrades: { ...s.upgrades },
    items: { ...s.items },
    works: { ...s.works },
    radarNext: s.radarNext,
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

const TRIPS: Trip[] = ['explore', 'home', 'out', 'detour'];
const num = (x: unknown, min = 0): number => Math.max(min, Number(x) || 0);

export function deserialize(raw: RawSave): { state: GameState; savedAt: number } {
  const data = migrate(raw);
  if (typeof data.seed !== 'number') throw new Error('Partida sense seed');
  const state = newGame(data.seed);
  state.ring = Math.floor(num(data.ring));
  state.gold = D(data.gold ?? 0);
  state.totalGold = D(data.totalGold ?? 0);
  state.playTime = num(data.playTime);
  state.radarNext = Math.floor(num(data.radarNext));
  state.bots = (Array.isArray(data.bots) && data.bots.length ? data.bots : [newBot()]).map((b) => {
    const bot = newBot(TRIPS.includes(b?.trip) ? b.trip : 'explore', num(b?.travelLen));
    bot.prog = num(b?.prog);
    bot.cargo = num(b?.cargo);
    bot.travel = Math.min(bot.travelLen, num(b?.travel));
    bot.target = Number.isInteger(b?.target) ? b.target : -1;
    if (bot.trip === 'detour' && bot.target < 0) bot.trip = 'explore';
    return bot;
  });
  state.ringRobots = Math.max(1, Math.floor(num(data.ringRobots, 1)));
  if (data.legacyWalked !== undefined) state.legacyWalked = num(data.legacyWalked);
  state.zoomUnlocked = Math.min(ZOOMS.length, Math.max(1, data.zoomUnlocked ?? 1));
  state.zoom = Math.min(state.zoomUnlocked - 1, Math.max(0, data.zoom ?? 0));
  // Només les millores que encara existeixen; les noves queden a 0.
  for (const id of Object.keys(state.upgrades) as (keyof GameState['upgrades'])[]) state.upgrades[id] = num(data.upgrades?.[id]);
  for (const id of Object.keys(state.items) as (keyof GameState['items'])[]) state.items[id] = num(data.items?.[id]);
  for (const id of Object.keys(state.works) as (keyof GameState['works'])[]) state.works[id] = num(data.works?.[id]);
  return { state, savedAt: data.savedAt };
}

/** Text per exportar/importar a mà (copiar i enganxar). */
export const exportSave = (d: SaveData): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const importSave = (text: string): RawSave => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
