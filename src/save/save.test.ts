import { describe, expect, it } from 'vitest';
import { newBot, newGame } from '../core/state';
import { D } from '../core/decimal';
import { explored, fromLegacy, stats } from '../core/game';
import { createWorld } from '../core/world';
import { deserialize, exportSave, importSave, migrate, serialize } from './save';
import { applyOffline, OFFLINE_CAP_SEC } from './offline';

const world = createWorld(7, 128);

describe('save', () => {
  it('serialises and deserialises without losing anything', () => {
    const s = newGame(7);
    s.gold = D('1.5e300');
    s.ring = 12;
    s.ringRobots = 2;
    s.bots = [newBot('home', 13), newBot()];
    s.bots[0].cargo = 3.5;
    s.bots[0].travel = 1.5;
    s.bots[1].prog = 7.25;
    s.bots[1].trip = 'detour';
    s.bots[1].target = 4;
    s.upgrades.speed = 7;
    s.items.page = 7;
    s.works.cd = 2;
    s.fetched = [11, 3];
    s.weather = { epoch: 4, storms: [{ kind: 'acid', x: 10, y: 12, r: 5 }] };
    s.bots[0].found = 2;
    s.zoomUnlocked = 3;
    s.zoom = 2;
    const { state, savedAt } = deserialize(JSON.parse(JSON.stringify(serialize(s, 1234))));
    expect(savedAt).toBe(1234);
    expect(state.gold.eq(s.gold)).toBe(true);
    expect(state).toMatchObject({ seed: 7, ring: 12, ringRobots: 2, zoomUnlocked: 3, zoom: 2, fetched: [11, 3] });
    expect(state.weather).toEqual(s.weather);
    expect(state.bots).toEqual(s.bots);
    expect(state.upgrades.speed).toBe(7);
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
    expect(state.upgrades).toEqual({ speed: 4, tyres: 0, body: 0, radar: 3, cargo: 0, explorers: 1 });
    expect(state.items).toEqual({ page: 0, note: 0, photo: 0 });
    expect(state.fetched).toEqual([]);
    expect(state.legacyWalked).toBe(50);
    expect(state).toMatchObject({ ringRobots: 2, zoomUnlocked: 2 });
    fromLegacy(state, world);
    expect(state.legacyWalked).toBeUndefined();
    expect(state.bots.length).toBe(2);
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
    expect(state.weather).toEqual({ epoch: 0, storms: [] });
    const back = deserialize({ ...serialize({ ...state, scouted: [1, 9, 12, 7] }, 0) }).state;
    expect(back.scouted).toEqual([1, 9, 12]);
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
    expect(s.bots[0].prog).toBeLessThanOrEqual(600 * stats(s).stepsPerSec);
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
