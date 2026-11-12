// Versioned save format. Whenever the GameState structure changes:
//   1. bump SAVE_VERSION
//   2. add the migration (vN -> vN+1) to MIGRATIONS
//   3. add a test with a real old save to save.test.ts
// v1: first published version. v2: rovers carry the bluetreri and bring it to camp (hold).
// v3: items (pages, notes, photos), works (books, records, albums) and the radar that sends rovers on detours.
// v4: independent rovers (each with cargo, trip and arc); `walked` becomes `legacyWalked` and is converted
//     when the world is loaded (`fromLegacy`).
// v5: radar detours reveal the cells on their path (`scouted`, `Bot.from`).
// v6: each rover's radar works around it (`fetched` replaces `radarNext`), weather, `Bot.found`, Tyres and Body.
// v7: exploration routes (`routes` unlocked, `route` chosen, `plan` applied: the order is rebuilt from it).
// v8: discovery algorithms with levels (`routeLevels`, plan entries [ring, route, level]); the north/south/east/west
//     routes are withdrawn and refunded; `doneAt` (play time when the map was finished).
// v9: works got cheaper and capped (the library must be completable): items are recounted once the world loads.
// v10: work prices are set per map (seeds differ in how many pages they hide): items are recounted again.
import { D } from '../core/decimal';
import { newBot, newGame, type Bot, type GameState, type Storm, type Trip } from '../core/state';
import { STORMS } from '../content/weather';
import { WORKS_MAX } from '../content/collection';
import { LEGACY_ROUTES, ROUTE_MAX_LEVEL, ROUTES, type RouteId } from '../content/routes';
import { ZOOMS } from '../content/world';

export const SAVE_VERSION = 10;

/** What the v7 routes cost, refunded when they are withdrawn (random stays unlocked, but its old price is refunded too). */
const V7_PRICES: Record<string, [number, Record<string, number>]> = {
  north: [300, { page: 8 }],
  east: [1500, { note: 4 }],
  south: [6000, { photo: 12 }],
  west: [25000, { page: 20 }],
  random: [100000, { note: 10, photo: 10 }],
};

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
  fetched: number[];
  routes: RouteId[];
  route: RouteId;
  routeLevels: Partial<Record<RouteId, number>>;
  plan: ([number, RouteId] | [number, RouteId, number])[];
  weather: { epoch: number; storms: Storm[]; nextId: number };
  scouted: number[];
  zoomUnlocked: number;
  zoom: number;
  playTime: number;
  doneAt?: number;
  recount?: boolean;
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
  // v5 -> v6: the radar works per rover. Items already claimed are only known for rovers on a detour; the sky
  // starts clear and changes at the next epoch.
  5: (s) => {
    const rest = { ...s };
    delete rest.radarNext;
    const bots = Array.isArray(s.bots) ? (s.bots as Bot[]) : [];
    const fetched = bots.filter((b) => b?.trip === 'detour' && Number.isInteger(b.target) && b.target >= 0).map((b) => b.target);
    return { ...rest, v: 6, fetched, weather: { epoch: 0, storms: [] } };
  },
  // v6 -> v7: only the circular route, never changed.
  // v6 -> v7: also drifting storms (the sky starts clear again).
  6: (s) => ({ ...s, v: 7, routes: ['circular'], route: 'circular', plan: [], weather: { epoch: 0, storms: [], nextId: 0 } }),
  // v7 -> v8: the four directions are withdrawn and their price refunded (and the old, dearer random's); a rover
  // fleet following one goes back to circular at the next ring. The plan keeps its legacy [ring, route] entries.
  7: (s) => {
    const owned = Array.isArray(s.routes) ? (s.routes as string[]) : [];
    let gold = D(typeof s.gold === 'string' || typeof s.gold === 'number' ? s.gold : 0);
    const items = { ...((s.items ?? {}) as Record<string, number>) };
    for (const id of owned) {
      const price = V7_PRICES[id];
      if (!price) continue;
      gold = gold.add(price[0]);
      for (const [k, n] of Object.entries(price[1])) items[k] = (Number(items[k]) || 0) + n;
    }
    const routes = owned.filter((id) => !(LEGACY_ROUTES as string[]).includes(id));
    const route = typeof s.route === 'string' && routes.includes(s.route) ? s.route : 'circular';
    return { ...s, v: 8, gold: gold.toString(), items, routes, route, routeLevels: {} };
  },
  // v8 -> v9: recount the items at today's prices (`recountItems`, needs the world).
  8: (s) => ({ ...s, v: 9, recount: true }),
  // v9 -> v10: prices now follow each map; recount again.
  9: (s) => ({ ...s, v: 10, recount: true }),
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
    fetched: [...s.fetched],
    routes: [...s.routes],
    route: s.route,
    routeLevels: { ...s.routeLevels },
    plan: s.plan.map((p) => [...p] as [number, RouteId] | [number, RouteId, number]),
    weather: { epoch: s.weather.epoch, storms: s.weather.storms.map((st) => ({ ...st })), nextId: s.weather.nextId },
    scouted: [...s.scouted],
    zoomUnlocked: s.zoomUnlocked,
    zoom: s.zoom,
    playTime: s.playTime,
    ...(s.doneAt !== undefined ? { doneAt: s.doneAt } : {}),
    ...(s.recount ? { recount: true } : {}),
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
  state.fetched = Array.isArray(data.fetched) ? [...new Set(data.fetched.map((x) => Math.floor(num(x))))] : [];
  if (data.doneAt !== undefined) state.doneAt = num(data.doneAt);
  if (data.recount) state.recount = true;
  const routeIds = ROUTES.map((d) => d.id) as string[];
  const isRoute = (x: unknown): x is RouteId => typeof x === 'string' && routeIds.includes(x);
  // Plans may still name withdrawn routes (they rebuild the map as it was).
  const isPlanned = (x: unknown): x is RouteId => isRoute(x) || (LEGACY_ROUTES as unknown[]).includes(x);
  // Random is the free starting route (saves from before it was, own circular instead: it used to be the free one).
  state.routes = [...new Set<RouteId>(['random', ...(Array.isArray(data.routes) ? data.routes : []).filter(isRoute)])];
  state.route = isRoute(data.route) && state.routes.includes(data.route) ? data.route : state.routes.includes('circular') ? 'circular' : 'random';
  state.routeLevels = {};
  for (const id of state.routes) {
    const lv = Math.min(ROUTES.find((d) => d.id === id)!.maxLevel, Math.floor(num(data.routeLevels?.[id])));
    if (lv > 0) state.routeLevels[id] = lv;
  }
  state.plan = [];
  for (const p of Array.isArray(data.plan) ? data.plan : []) {
    const ring = Math.floor(num(p?.[0]));
    if (!isPlanned(p?.[1]) || ring <= (state.plan.at(-1)?.[0] ?? -1)) continue;
    state.plan.push(p.length > 2 ? [ring, p[1], Math.min(ROUTE_MAX_LEVEL, Math.floor(num(p[2])))] : [ring, p[1]]);
  }
  const kinds = STORMS.map((d) => d.id) as string[];
  state.weather = {
    epoch: Math.floor(num(data.weather?.epoch)),
    storms: (Array.isArray(data.weather?.storms) ? data.weather.storms : [])
      .filter((st) => kinds.includes(st?.kind))
      .map((st) => {
        const fin = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
        return {
          id: Math.floor(num(st.id)), kind: st.kind, x: fin(st.x), y: fin(st.y), vx: fin(st.vx), vy: fin(st.vy),
          r: num(st.r), size: num(st.size), age: Math.floor(num(st.age)), life: Math.floor(num(st.life)), severe: !!st.severe,
        };
      }),
    nextId: Math.floor(num(data.weather?.nextId)),
  };
  state.bots = (Array.isArray(data.bots) && data.bots.length ? data.bots : [newBot()]).map((b) => {
    const bot = newBot(TRIPS.includes(b?.trip) ? b.trip : 'explore', num(b?.travelLen));
    bot.prog = num(b?.prog);
    bot.cargo = num(b?.cargo);
    bot.travel = Math.min(bot.travelLen, num(b?.travel));
    bot.target = Number.isInteger(b?.target) ? b.target : -1;
    bot.from = bot.trip === 'detour' && Number.isInteger(b?.from) ? b.from : -1;
    bot.found = Math.floor(num(b?.found));
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
  for (const id of Object.keys(state.works) as (keyof GameState['works'])[]) state.works[id] = Math.min(WORKS_MAX, Math.floor(num(data.works?.[id])));
  return { state, savedAt: data.savedAt };
}

/** Text for manual export/import (copy and paste). */
export const exportSave = (d: SaveData): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const importSave = (text: string): RawSave => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
