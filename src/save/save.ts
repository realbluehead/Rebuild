// Versioned save format. Whenever the GameState structure changes:
//   1. bump SAVE_VERSION
//   2. add the migration (vN -> vN+1) to MIGRATIONS
//   3. add a test with a real old save to save.test.ts
// v1: first published version. v2: rovers carry the bluetreri and bring it to camp (hold).
// v3: items (pages, notes, photos), works (books, records, albums) and the radar that sends rovers on detours.
// v4: independent rovers (each with cargo, trip and arc); `walked` becomes `legacyWalked` and is converted
//     when the world is loaded (`fromLegacy`).
// v5: radar detours reveal the cells on their path (`scouted`, `Bot.from`).
import { D } from '../core/decimal';
import { newBot, newGame, type Bot, type GameState, type Trip } from '../core/state';
import { ZOOMS } from '../content/world';

export const SAVE_VERSION = 5;

/** JSON shape of the game: Decimals are stored as text. */
export interface SaveData {
  v: number;
  /** Save time (ms epoch), to compute offline progress. */
  savedAt: number;
  seed: number;
  ring: number;
  ringRobots: number;
  bots: Bot[];
  /** Only in saves migrated from v3 or earlier: the old total steps. */
  legacyWalked?: number;
  gold: string;
  totalGold: string;
  upgrades: Record<string, number>;
  items: Record<string, number>;
  works: Record<string, number>;
  radarNext: number;
  scouted: number[];
  zoomUnlocked: number;
  zoom: number;
  playTime: number;
}

type RawSave = { v: number } & Record<string, unknown>;

/** MIGRATIONS[n] converts a save from version n to version n+1. */
const MIGRATIONS: Record<number, (s: RawSave) => RawSave> = {
  // v1 -> v2: the hold is born. The old Radar (radius) goes away and the old Hold (gold x) becomes Radar,
  // which already does that; the new Hold (capacity) starts at 0. Rovers are exploring with no cargo.
  1: (s) => {
    const upgrades = { ...((s.upgrades ?? {}) as Record<string, number>) };
    delete upgrades.radius;
    return { ...s, v: 2, upgrades: { ...upgrades, cargo: 0 }, cargo: '0', trip: 'explore', travel: 0, travelLen: 0 };
  },
  // v2 -> v3: the Radar stops giving gold and detects items instead (levels are kept). No items yet.
  2: (s) => {
    const { loot, ...rest } = (s.upgrades ?? {}) as Record<string, number>;
    return { ...s, v: 3, upgrades: { ...rest, radar: loot ?? 0 }, items: {}, works: {}, radarNext: 0 };
  },
  // v3 -> v4: independent rovers. The fleet's cargo goes to the first rover; the total steps are kept to be
  // converted into a ring once the world exists.
  3: (s) => {
    const rest = { ...s };
    const { walked, cargo } = rest;
    delete rest.walked; delete rest.cargo; delete rest.trip; delete rest.travel; delete rest.travelLen;
    const first = newBot();
    first.cargo = Number(cargo ?? 0) || 0;
    return { ...rest, v: 4, ring: 0, bots: [first], legacyWalked: Number(walked ?? 0) || 0 };
  },
  // v4 -> v5: detour paths are revealed. Nothing scouted yet; rovers already on a detour reveal no path.
  4: (s) => ({ ...s, v: 5, scouted: [] }),
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
    scouted: [...s.scouted],
    zoomUnlocked: s.zoomUnlocked,
    zoom: s.zoom,
    playTime: s.playTime,
  };
}

export function migrate(raw: RawSave): SaveData {
  let s = raw;
  if (typeof s.v !== 'number' || s.v > SAVE_VERSION) throw new Error(`Unknown save version: ${s.v}`);
  while (s.v < SAVE_VERSION) {
    const step = MIGRATIONS[s.v];
    if (!step) throw new Error(`Missing migration from v${s.v}`);
    s = step(s);
  }
  return s as unknown as SaveData;
}

const TRIPS: Trip[] = ['explore', 'home', 'out', 'detour'];
const num = (x: unknown, min = 0): number => Math.max(min, Number(x) || 0);

export function deserialize(raw: RawSave): { state: GameState; savedAt: number } {
  const data = migrate(raw);
  if (typeof data.seed !== 'number') throw new Error('Save has no seed');
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
    bot.from = bot.trip === 'detour' && Number.isInteger(b?.from) ? b.from : -1;
    if (bot.trip === 'detour' && bot.target < 0) bot.trip = 'explore';
    return bot;
  });
  const sc = Array.isArray(data.scouted) ? data.scouted.map((x) => Math.floor(num(x))) : [];
  state.scouted = sc.slice(0, sc.length - (sc.length % 3));
  state.ringRobots = Math.max(1, Math.floor(num(data.ringRobots, 1)));
  if (data.legacyWalked !== undefined) state.legacyWalked = num(data.legacyWalked);
  state.zoomUnlocked = Math.min(ZOOMS.length, Math.max(1, data.zoomUnlocked ?? 1));
  state.zoom = Math.min(state.zoomUnlocked - 1, Math.max(0, data.zoom ?? 0));
  // Only the upgrades that still exist; new ones stay at 0.
  for (const id of Object.keys(state.upgrades) as (keyof GameState['upgrades'])[]) state.upgrades[id] = num(data.upgrades?.[id]);
  for (const id of Object.keys(state.items) as (keyof GameState['items'])[]) state.items[id] = num(data.items?.[id]);
  for (const id of Object.keys(state.works) as (keyof GameState['works'])[]) state.works[id] = num(data.works?.[id]);
  return { state, savedAt: data.savedAt };
}

/** Text for manual export/import (copy and paste). */
export const exportSave = (d: SaveData): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const importSave = (text: string): RawSave => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
