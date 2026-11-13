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
// v11: detours go at exploring pace and mine the cells on their way (`mined`, `Bot.walked`).
// v12: each rover keeps a lifetime record (`Bot.log`); older rovers start it at 0 with `since` -1.
// v13: items a rover picks up wait in its `bag` until it unloads at camp (older ones were already counted: empty bags).
// v14: upgrades are bought per rover (`Bot.up`); the levels bought before stay in `upgrades` as every rover's base.
// v15: each rover follows its own route (`Bot.route`; plan entries with one [route, level] per rover).
// v16: rover kinds (`Bot.kind`: Scout, Miner, Hauler, one of each) and the Miner's progress (`dug`). Rover #1 becomes
//      the Scout; the other rovers, their parts and the Rovers upgrade are refunded, and their load goes to camp.
// v17: goals (`goals`: tiers claimed of each).
// v18: Miner dig order (`digOrder`, `digPick`) and Hauler policy (`haulAt`, `haulPick`); missing = the old behaviour.
import { D } from '../core/decimal';
import { newBot, newGame, newLog, type Bot, type GameState, type Storm, type Trip } from '../core/state';
import { STORMS } from '../content/weather';
import { WORKS_MAX } from '../content/collection';
import { LEGACY_ROUTES, ROUTE_MAX_LEVEL, ROUTES, type RouteId } from '../content/routes';
import { ZOOMS } from '../content/world';
import type { PlanEntry } from '../core/world';
import { HAUL_AT, HAUL_LEVELS, ROVER_KINDS, ROVER_STATS, UPGRADES, type DigOrder, type RoverKind } from '../content/upgrades';
import { costOf } from '../core/game';
import { GOAL_TIERS } from '../content/goals';

export const SAVE_VERSION = 18;

/** The Rovers upgrade (one more rover per level) before v16, refunded then. */
const V15_ROVERS = { baseCost: 1000, costGrowth: 10 };

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
  dug: number;
  digOrder?: string;
  digPick?: string;
  haulAt?: number;
  haulPick?: string;
  /** Only in saves migrated from v3 or earlier: the old total steps. */
  legacyWalked?: number;
  gold: string;
  totalGold: string;
  upgrades: Record<string, number>;
  items: Record<string, number>;
  works: Record<string, number>;
  goals: Record<string, number>;
  fetched: number[];
  routes: RouteId[];
  route: RouteId;
  routeLevels: Partial<Record<RouteId, number>>;
  plan: PlanEntry[];
  weather: { epoch: number; storms: Storm[]; nextId: number };
  scouted: number[];
  mined: number[];
  zoomUnlocked: number;
  zoom: number;
  playTime: number;
  doneAt?: number;
  recount?: boolean;
  kinds?: boolean;
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
  // v10 -> v11: nothing mined yet; a rover on a detour starts it again from where it left its arc (its length is
  // worked out again at the next tick).
  10: (s) => ({
    ...s,
    v: 11,
    mined: [],
    bots: (Array.isArray(s.bots) ? (s.bots as Bot[]) : []).map((b) => (b?.trip === 'detour' ? { ...b, travel: 0, travelLen: 0, walked: 0 } : b)),
  }),
  // v11 -> v12: no records yet.
  11: (s) => ({ ...s, v: 12, bots: (Array.isArray(s.bots) ? (s.bots as Bot[]) : []).map((b) => ({ ...b, log: newLog(-1) })) }),
  // v12 -> v13: items found so far were already added to the player's stock.
  12: (s) => ({ ...s, v: 13, bots: (Array.isArray(s.bots) ? (s.bots as Bot[]) : []).map((b) => ({ ...b, found: 0, bag: [0, 0, 0] })) }),
  // v13 -> v14: no rover has levels of its own yet (deserialize fills them with 0).
  13: (s) => ({ ...s, v: 14 }),
  // v14 -> v15: every rover follows the route the fleet had picked.
  14: (s) => ({ ...s, v: 15, bots: (Array.isArray(s.bots) ? (s.bots as Bot[]) : []).map((b) => ({ ...b, route: s.route })) }),
  // v15 -> v16: rover #1 becomes the Scout (it keeps its parts). Every other rover is refunded with its parts, and the
  // Rovers upgrade; what they carry reaches camp. The ring under way restarts for the Scout alone (`toKinds`, needs the
  // world); everything explored before counts as dug out.
  15: (s) => {
    const bots = Array.isArray(s.bots) ? (s.bots as Bot[]) : [];
    const upgrades = { ...((s.upgrades ?? {}) as Record<string, number>) };
    const n = (x: unknown) => Math.max(0, Number(x) || 0);
    let gold = D(typeof s.gold === 'string' || typeof s.gold === 'number' ? s.gold : 0);
    const items = { ...((s.items ?? {}) as Record<string, number>) };
    const rovers = Math.floor(n(upgrades.explorers));
    if (rovers > 0) gold = gold.add(costOf({ id: 'speed', name: '', desc: '', ...V15_ROVERS }, 0, rovers));
    delete upgrades.explorers;
    const kinds = ['page', 'note', 'photo'];
    for (const b of bots.slice(1)) {
      for (const def of UPGRADES) {
        const own = Math.floor(n(b?.up?.[def.id]));
        if (own > 0) gold = gold.add(costOf(def, Math.floor(n(upgrades[def.id])), own));
      }
      gold = gold.add(n(b?.cargo));
      kinds.forEach((k, q) => { items[k] = n(items[k]) + Math.floor(n(Array.isArray(b?.bag) ? b.bag[q] : 0)); });
    }
    // A ring split between several rovers starts again for the Scout alone (the other arcs are gone).
    const split = Number(s.ringRobots) > 1;
    const scout = bots[0] ? { ...bots[0], kind: 'scout', ...(split ? { prog: 0 } : {}) } : undefined;
    return { ...s, v: 16, gold: gold.toString(), items, upgrades, bots: scout ? [scout] : [], ringRobots: 1, kinds: true, dug: 0 };
  },
  // v16 -> v17: no goal claimed yet (they can be claimed at once for what was already done).
  16: (s) => ({ ...s, v: 17, goals: {} }),
  // v17 -> v18: nothing to do (deserialize fills in the defaults).
  17: (s) => ({ ...s, v: 18 }),
};

export function serialize(s: GameState, now: number): SaveData {
  return {
    v: SAVE_VERSION,
    savedAt: now,
    seed: s.seed,
    ring: s.ring,
    ringRobots: s.ringRobots,
    dug: s.dug,
    digOrder: s.digOrder,
    digPick: s.digPick,
    haulAt: s.haulAt,
    haulPick: s.haulPick,
    bots: s.bots.map((b) => ({ ...b, bag: [...b.bag], log: { ...b.log }, up: { ...b.up } })),
    ...(s.legacyWalked !== undefined ? { legacyWalked: s.legacyWalked } : {}),
    gold: s.gold.toString(),
    totalGold: s.totalGold.toString(),
    upgrades: { ...s.upgrades },
    items: { ...s.items },
    works: { ...s.works },
    goals: { ...s.goals },
    fetched: [...s.fetched],
    routes: [...s.routes],
    route: s.route,
    routeLevels: { ...s.routeLevels },
    plan: s.plan.map((p) => (typeof p[1] === 'string' ? [...p] : [p[0], p[1].map((x) => [...x])]) as PlanEntry),
    weather: { epoch: s.weather.epoch, storms: s.weather.storms.map((st) => ({ ...st })), nextId: s.weather.nextId },
    scouted: [...s.scouted],
    mined: [...s.mined],
    zoomUnlocked: s.zoomUnlocked,
    zoom: s.zoom,
    playTime: s.playTime,
    ...(s.doneAt !== undefined ? { doneAt: s.doneAt } : {}),
    ...(s.recount ? { recount: true } : {}),
    ...(s.kinds ? { kinds: true } : {}),
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

const TRIPS: Trip[] = ['explore', 'home', 'out', 'detour', 'idle'];
const KINDS = ROVER_KINDS.map((k) => k.id) as string[];
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
  if (data.kinds) state.kinds = true;
  state.dug = num(data.dug);
  const dig = (x: unknown): DigOrder => (x === 'rich' ? 'rich' : 'follow');
  state.digOrder = dig(data.digOrder);
  state.digPick = dig(data.digPick);
  state.haulAt = HAUL_LEVELS.includes(Number(data.haulAt)) ? Number(data.haulAt) : HAUL_AT;
  state.haulPick = data.haulPick === 'scout' || data.haulPick === 'miner' ? data.haulPick : 'fullest';
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
    if (ring <= (state.plan.at(-1)?.[0] ?? -1)) continue;
    const lv = (x: unknown) => Math.min(ROUTE_MAX_LEVEL, Math.floor(num(x)));
    if (Array.isArray(p?.[1])) {
      // One [route, level] per rover slice.
      const sectors = (p[1] as unknown[]).filter((x): x is [RouteId, number] => Array.isArray(x) && isRoute(x[0])).map(([r, l]) => [r, lv(l)] as const);
      if (sectors.length) state.plan.push(sectors.length === (p[1] as unknown[]).length ? [ring, sectors] : [ring, sectors[0][0], sectors[0][1]]);
      continue;
    }
    if (!isPlanned(p?.[1])) continue;
    state.plan.push(p.length > 2 ? [ring, p[1], lv(p[2])] : [ring, p[1]]);
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
  // One rover of each kind at most, the Scout first.
  const raws = (Array.isArray(data.bots) ? data.bots : []).filter((b, q, all) => KINDS.includes(b?.kind) && all.findIndex((x) => x?.kind === b.kind) === q);
  raws.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  if (raws[0]?.kind !== 'scout') raws.unshift(newBot());
  state.bots = raws.map((b) => {
    const kind = b.kind as RoverKind;
    const bot = newBot(TRIPS.includes(b?.trip) ? b.trip : kind === 'hauler' ? 'idle' : 'explore', num(b?.travelLen), 0, kind);
    bot.prog = num(b?.prog);
    bot.cargo = num(b?.cargo);
    bot.travel = Math.min(bot.travelLen, num(b?.travel));
    bot.target = Number.isInteger(b?.target) ? b.target : -1;
    bot.from = (bot.trip === 'detour' || kind === 'hauler') && Number.isInteger(b?.from) ? b.from : -1;
    bot.bag = [0, 1, 2].map((q) => Math.floor(num(Array.isArray(b?.bag) ? b.bag[q] : 0)));
    bot.found = bot.bag.reduce((x, y) => x + y, 0);
    for (const id of ROVER_STATS) bot.up[id] = Math.floor(num(b?.up?.[id]));
    bot.route = isRoute(b?.route) && state.routes.includes(b.route) ? b.route : state.route;
    bot.walked = bot.trip === 'detour' ? Math.floor(num(b?.walked)) : 0;
    const log = b?.log;
    bot.log = {
      since: Number.isFinite(Number(log?.since)) ? Math.max(-1, Number(log.since)) : -1,
      cells: num(log?.cells), steps: num(log?.steps), gold: num(log?.gold), best: num(log?.best), items: Math.floor(num(log?.items)),
      trips: Math.floor(num(log?.trips)), detours: Math.floor(num(log?.detours)), gaveUp: Math.floor(num(log?.gaveUp)),
    };
    if (bot.trip === 'detour' && (bot.target < 0 || kind !== 'scout')) bot.trip = 'explore';
    if (kind === 'hauler' && bot.trip === 'explore') bot.trip = 'idle';
    if (kind === 'hauler' && bot.trip === 'out' && (bot.target < 1 || bot.target >= raws.length)) { bot.trip = 'idle'; bot.target = -1; }
    return bot;
  });
  const sc = Array.isArray(data.scouted) ? data.scouted.map((x) => Math.floor(num(x))) : [];
  state.scouted = sc.slice(0, sc.length - (sc.length % 3));
  state.mined = Array.isArray(data.mined) ? [...new Set(data.mined.map((x) => Math.floor(num(x))))] : [];
  state.ringRobots = 1; // only the Scout explores (older splits are undone in the v16 migration)
  if (data.legacyWalked !== undefined) state.legacyWalked = num(data.legacyWalked);
  state.zoomUnlocked = Math.min(ZOOMS.length, Math.max(1, data.zoomUnlocked ?? 1));
  state.zoom = Math.min(state.zoomUnlocked - 1, Math.max(0, data.zoom ?? 0));
  // Only the upgrades that still exist; new ones stay at 0.
  for (const id of Object.keys(state.upgrades) as (keyof GameState['upgrades'])[]) state.upgrades[id] = num(data.upgrades?.[id]);
  for (const id of Object.keys(state.items) as (keyof GameState['items'])[]) state.items[id] = num(data.items?.[id]);
  for (const id of Object.keys(state.works) as (keyof GameState['works'])[]) state.works[id] = Math.min(WORKS_MAX, Math.floor(num(data.works?.[id])));
  for (const id of Object.keys(state.goals) as (keyof GameState['goals'])[]) state.goals[id] = Math.min(GOAL_TIERS, Math.floor(num(data.goals?.[id])));
  return { state, savedAt: data.savedAt };
}

/** Text for manual export/import (copy and paste). */
export const exportSave = (d: SaveData): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const importSave = (text: string): RawSave => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
