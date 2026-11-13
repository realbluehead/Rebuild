import { describe, expect, it } from 'vitest';
import { newBot, newGame } from '../core/state';
import { D } from '../core/decimal';
import { costOf, explored, fromLegacy, stats, toKinds } from '../core/game';
import { UPGRADES } from '../content/upgrades';
import { createWorld } from '../core/world';
import { deserialize, exportSave, importSave, migrate, serialize } from './save';
import { applyOffline, OFFLINE_CAP_SEC } from './offline';

const world = createWorld(7, 128);

describe('save', () => {
  it('serialises and deserialises without losing anything', () => {
    const s = newGame(7);
    s.gold = D('1.5e300');
    s.ring = 12;
    s.dug = 1234.5;
    s.bots = [newBot('detour', 13), newBot('explore', 0, 5, 'miner'), newBot('out', 20, 9, 'hauler')];
    s.bots[0].cargo = 3.5;
    s.bots[0].travel = 1.5;
    s.bots[0].prog = 7.25;
    s.bots[0].target = 4;
    s.bots[2].target = 1;
    s.bots[2].from = 333;
    s.bots[1].up.drill = 4;
    s.upgrades.speed = 7;
    s.items.page = 7;
    s.works.cd = 2;
    s.fetched = [11, 3];
    s.weather = { epoch: 4, storms: [{ id: 3, kind: 'acid', x: 10.5, y: 12.25, vx: 0.1, vy: -0.2, r: 4.5, size: 6, age: 7, life: 90, severe: true }], nextId: 4 };
    s.bots[0].bag = [1, 0, 2];
    s.bots[0].found = 3;
    s.bots[0].up.tyres = 2;
    s.routes = ['random', 'circular'];
    s.bots[0].route = 'circular';
    s.plan = [[1, 'random', 0], [9, [['circular', 1], ['random', 0]]]];
    s.zoomUnlocked = 3;
    s.zoom = 2;
    Object.assign(s, { digOrder: 'rich', digPick: 'follow', haulAt: 0.8, haulPick: 'miner' });
    const { state, savedAt } = deserialize(JSON.parse(JSON.stringify(serialize(s, 1234))));
    expect(savedAt).toBe(1234);
    expect(state.gold.eq(s.gold)).toBe(true);
    expect(state).toMatchObject({ seed: 7, ring: 12, ringRobots: 1, dug: 1234.5, digOrder: 'rich', digPick: 'follow', haulAt: 0.8, haulPick: 'miner', zoomUnlocked: 3, zoom: 2, fetched: [11, 3] });
    expect(state.weather).toEqual(s.weather);
    expect(state.bots).toEqual(s.bots);
    expect(state.upgrades.speed).toBe(7);
    expect(state.plan).toEqual(s.plan);
    expect(state.items.page).toBe(7);
    expect(state.works.cd).toBe(2);
    expect(state.legacyWalked).toBeUndefined();
  });

  it('export/import as text', () => {
    const data = serialize(newGame(), 5);
    expect(importSave(exportSave(data))).toEqual(data);
  });

  it('migrates a v1 save (before the hold) and converts it into rovers when the world loads', () => {
    const v1 = { v: 1, savedAt: 9, seed: 3, walked: 50, gold: '12', totalGold: '40', upgrades: { speed: 4, radius: 2, loot: 3, explorers: 1 }, ringRobots: 2, zoomUnlocked: 2, zoom: 1, playTime: 99 };
    const { state } = deserialize(v1);
    expect(state.upgrades).toEqual({ speed: 4, tyres: 0, body: 0, radar: 3, cargo: 0, drill: 0 });
    expect(state.gold.toNumber()).toBe(12 + 1000); // v15 -> v16: the second rover is refunded
    expect(state.items).toEqual({ page: 0, note: 0, photo: 0 });
    expect(state.fetched).toEqual([]);
    expect(state.legacyWalked).toBe(50);
    expect(state).toMatchObject({ ringRobots: 1, zoomUnlocked: 2 });
    fromLegacy(state, world);
    expect(state.legacyWalked).toBeUndefined();
    expect(state.bots.length).toBe(1);
    expect(state.ring).toBeGreaterThan(0);
  });

  it('migrates a v3 save (fleet with a single cargo)', () => {
    const v3 = { v: 3, savedAt: 9, seed: 3, walked: 500, cargo: '4.5', trip: 'home', travel: 2, travelLen: 9, gold: '12', totalGold: '40', upgrades: { speed: 4, radar: 1, cargo: 2, explorers: 0 }, items: { page: 3 }, works: { book: 1 }, radarNext: 2, ringRobots: 1, zoomUnlocked: 2, zoom: 1, playTime: 99 };
    const { state } = deserialize(v3);
    expect(state.bots.length).toBe(1);
    expect(state.bots[0].cargo).toBe(4.5);
    expect(state.bots[0].trip).toBe('explore');
    expect(state.legacyWalked).toBe(500);
    expect(state.items.page).toBe(3);
    expect(state.works.book).toBe(1);
  });

  it('migrates a v4 save (a rover already on a detour reveals no path)', () => {
    const bots = [{ trip: 'detour', prog: 3, cargo: 1, travel: 1, travelLen: 6, target: 4 }];
    const v4 = { v: 4, savedAt: 9, seed: 3, ring: 5, ringRobots: 1, bots, gold: '1', totalGold: '2', upgrades: { radar: 1 }, items: {}, works: {}, radarNext: 5, zoomUnlocked: 1, zoom: 0, playTime: 9 };
    const { state } = deserialize(v4);
    expect(state.scouted).toEqual([]);
    expect(state.bots[0].trip).toBe('detour');
    expect(state.bots[0].from).toBe(-1);
    // v5 -> v6: the item it is fetching is already claimed, and the sky starts clear.
    expect(state.fetched).toEqual([4]);
    expect(state.weather).toEqual({ epoch: 0, storms: [], nextId: 0 });
    const back = deserialize({ ...serialize({ ...state, scouted: [1, 9, 12, 7] }, 0) }).state;
    expect(back.scouted).toEqual([1, 9, 12]);
  });

  it('migrates a v7 save: the four directions are refunded and withdrawn, the plan still replays', () => {
    const v7 = {
      v: 7, savedAt: 9, seed: 3, ring: 30, ringRobots: 1, bots: [{ trip: 'explore', prog: 0, cargo: 0, travel: 0, travelLen: 0, target: -1 }],
      gold: '100', totalGold: '200', upgrades: {}, items: { page: 1, note: 0, photo: 2 }, works: { book: 3 }, fetched: [],
      routes: ['circular', 'north', 'east', 'random'], route: 'east', plan: [[5, 'north'], [12, 'east']],
      weather: { epoch: 0, storms: [], nextId: 0 }, scouted: [], zoomUnlocked: 1, zoom: 0, playTime: 99,
    };
    const { state } = deserialize(v7);
    // north 300 + 8 pages, east 1500 + 4 notes, random 100000 + 10 notes + 10 photos (random stays unlocked).
    expect(state.gold.toNumber()).toBe(100 + 300 + 1500 + 100000);
    expect(state.items).toEqual({ page: 9, note: 14, photo: 12 });
    expect(state.routes).toEqual(['random', 'circular']);
    expect(state.route).toBe('circular');
    expect(state.routeLevels).toEqual({});
    expect(state.plan).toEqual([[5, 'north'], [12, 'east']]);
    expect(state.doneAt).toBeUndefined();
    expect(state.recount).toBe(true); // v8 -> v9: items recounted once the world loads
    expect(state.mined).toEqual([]); // v10 -> v11
    for (const b of state.bots) { expect(b.bag).toEqual([0, 0, 0]); expect(b.found).toBe(0); } // v12 -> v13: already counted
    for (const b of state.bots) expect(b.route).toBe('circular'); // v14 -> v15: the fleet's route
    const back = deserialize(JSON.parse(JSON.stringify(serialize({ ...state, routeLevels: { circular: 2, random: 3 }, plan: [...state.plan, [40, 'circular', 2]], doneAt: 50 }, 0)))).state;
    expect(back.routeLevels).toEqual({ circular: 2 }); // Random has no levels
    expect(back.plan.at(-1)).toEqual([40, 'circular', 2]);
    expect(back.doneAt).toBe(50);
    expect(back.recount).toBe(true);
  });

  it('migrates a v15 save: rover #1 becomes the Scout, the others are refunded with their parts and load', () => {
    const bot = (up: Record<string, number>, cargo: number, bag: number[], prog: number) =>
      ({ trip: 'explore', prog, cargo, travel: 0, travelLen: 0, target: -1, from: -1, found: bag.reduce((a, b) => a + b, 0), bag, walked: 0, log: { since: 0, cells: 0, steps: 0, gold: 0, best: 0, items: 0, trips: 0, detours: 0, gaveUp: 0 }, up, route: 'random' });
    const v15 = {
      v: 15, savedAt: 9, seed: 7, ring: 20, ringRobots: 3, gold: '100', totalGold: '5000',
      bots: [bot({ speed: 3, cargo: 1 }, 2, [1, 0, 0], 40), bot({ speed: 2 }, 5, [0, 2, 0], 30), bot({ tyres: 1 }, 1.5, [0, 0, 3], 20)],
      upgrades: { speed: 4, tyres: 1, explorers: 2 }, items: { page: 1, note: 1, photo: 1 }, works: {}, fetched: [], routes: ['random'], route: 'random',
      routeLevels: {}, plan: [], weather: { epoch: 0, storms: [], nextId: 0 }, scouted: [], mined: [], zoomUnlocked: 1, zoom: 0, playTime: 99,
    };
    const { state } = deserialize(v15);
    const def = (id: string) => UPGRADES.find((u) => u.id === id)!;
    const refund = 1000 + 10000 // two rovers
      + costOf(def('speed'), 4, 2).toNumber() + costOf(def('tyres'), 1, 1).toNumber() // their parts, on top of the fleet's base
      + 5 + 1.5; // their load
    expect(state.gold.toNumber()).toBeCloseTo(100 + refund, 6);
    expect(state.items).toEqual({ page: 1, note: 3, photo: 4 }); // their items reach camp (the Scout keeps its own)
    expect(state.bots.length).toBe(1);
    expect(state.bots[0].kind).toBe('scout');
    expect(state.bots[0].up).toMatchObject({ speed: 3, cargo: 1, drill: 0 });
    expect(state.bots[0].bag).toEqual([1, 0, 0]);
    expect(state.bots[0].prog).toBe(0); // the split ring starts again for the Scout alone
    expect(state.ringRobots).toBe(1);
    expect('explorers' in state.upgrades).toBe(false);
    expect(state.kinds).toBe(true);
    toKinds(state, world);
    expect(state.kinds).toBeUndefined();
    expect(state.dug).toBe(world.rings[20]); // everything explored before counts as dug out
  });

  it('migrates a v17 save to the old dig order and Hauler policy, and rejects odd values', () => {
    const old: Record<string, unknown> = { ...serialize(newGame(3), 0) };
    for (const k of ['v', 'digOrder', 'digPick', 'haulAt', 'haulPick']) delete old[k];
    const { state } = deserialize({ ...old, v: 17 });
    expect(state).toMatchObject({ digOrder: 'follow', digPick: 'follow', haulAt: 0.5, haulPick: 'fullest' });
    const odd = deserialize({ ...serialize(newGame(3), 0), digOrder: 'deep', haulAt: 0.42, haulPick: 'hauler' }).state;
    expect(odd).toMatchObject({ digOrder: 'follow', haulAt: 0.5, haulPick: 'fullest' });
  });

  it('rejects versions from the future', () => {
    expect(() => migrate({ v: 999 })).toThrow();
  });

  it('ignores upgrades that no longer exist and clamps out-of-range zooms', () => {
    const data = { ...serialize(newGame(1), 0), upgrades: { speed: 2, vella: 9 }, zoomUnlocked: 99, zoom: 99 };
    const { state } = deserialize(data);
    expect(state.upgrades.speed).toBe(2);
    expect('vella' in state.upgrades).toBe(false);
    expect(state.zoomUnlocked).toBe(4);
    expect(state.zoom).toBe(3);
  });
});

describe('offline', () => {
  it('explores for the time away', () => {
    const s = newGame(7);
    const r = applyOffline(s, world, 0, 600_000);
    expect(r?.seconds).toBe(600);
    expect(s.bots[0].prog).toBeGreaterThan(0);
    expect(s.bots[0].prog).toBeLessThanOrEqual(600 * stats(s).speed);
    expect(r?.cells).toBeCloseTo(explored(s, world));
  });

  it('has a cap', () => {
    const s = newGame(7);
    const r = applyOffline(s, world, 0, (OFFLINE_CAP_SEC + 5000) * 1000);
    expect(r?.seconds).toBe(OFFLINE_CAP_SEC);
  });

  it('ignores clocks that went backwards', () => {
    const s = newGame(7);
    expect(applyOffline(s, world, 10_000, 0)).toBeNull();
    expect(s.bots[0].prog).toBe(0);
  });
});
