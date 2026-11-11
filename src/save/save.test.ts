import { describe, expect, it } from 'vitest';
import { newBot, newGame } from '../core/state';
import { D } from '../core/decimal';
import { explored, fromLegacy, stats } from '../core/game';
import { createWorld } from '../core/world';
import { deserialize, exportSave, importSave, migrate, serialize } from './save';
import { applyOffline, OFFLINE_CAP_SEC } from './offline';

const world = createWorld(7, 128);

describe('save', () => {
  it('serialitza i deserialitza sense perdre res', () => {
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
    s.radarNext = 11;
    s.zoomUnlocked = 3;
    s.zoom = 2;
    const { state, savedAt } = deserialize(JSON.parse(JSON.stringify(serialize(s, 1234))));
    expect(savedAt).toBe(1234);
    expect(state.gold.eq(s.gold)).toBe(true);
    expect(state).toMatchObject({ seed: 7, ring: 12, ringRobots: 2, zoomUnlocked: 3, zoom: 2, radarNext: 11 });
    expect(state.bots).toEqual(s.bots);
    expect(state.upgrades.speed).toBe(7);
    expect(state.items.page).toBe(7);
    expect(state.works.cd).toBe(2);
    expect(state.legacyWalked).toBeUndefined();
  });

  it('export/import en text', () => {
    const data = serialize(newGame(), 5);
    expect(importSave(exportSave(data))).toEqual(data);
  });

  it('migra una partida v1 (abans de la bodega) i la converteix en robots en carregar el món', () => {
    const v1 = { v: 1, savedAt: 9, seed: 3, walked: 50, gold: '12', totalGold: '40', upgrades: { speed: 4, radius: 2, loot: 3, explorers: 1 }, ringRobots: 2, zoomUnlocked: 2, zoom: 1, playTime: 99 };
    const { state } = deserialize(v1);
    expect(state.upgrades).toEqual({ speed: 4, radar: 3, cargo: 0, explorers: 1 });
    expect(state.items).toEqual({ page: 0, note: 0, photo: 0 });
    expect(state.radarNext).toBe(0);
    expect(state.legacyWalked).toBe(50);
    expect(state).toMatchObject({ ringRobots: 2, zoomUnlocked: 2 });
    fromLegacy(state, world);
    expect(state.legacyWalked).toBeUndefined();
    expect(state.bots.length).toBe(2);
    expect(state.ring).toBeGreaterThan(0);
  });

  it('migra una partida v3 (flota amb una sola càrrega)', () => {
    const v3 = { v: 3, savedAt: 9, seed: 3, walked: 500, cargo: '4.5', trip: 'home', travel: 2, travelLen: 9, gold: '12', totalGold: '40', upgrades: { speed: 4, radar: 1, cargo: 2, explorers: 0 }, items: { page: 3 }, works: { book: 1 }, radarNext: 2, ringRobots: 1, zoomUnlocked: 2, zoom: 1, playTime: 99 };
    const { state } = deserialize(v3);
    expect(state.bots.length).toBe(1);
    expect(state.bots[0].cargo).toBe(4.5);
    expect(state.bots[0].trip).toBe('explore');
    expect(state.legacyWalked).toBe(500);
    expect(state.items.page).toBe(3);
    expect(state.works.book).toBe(1);
  });

  it('rebutja versions del futur', () => {
    expect(() => migrate({ v: 999 })).toThrow();
  });

  it('ignora millores que ja no existeixen i corregeix zooms fora de rang', () => {
    const data = { ...serialize(newGame(1), 0), upgrades: { speed: 2, vella: 9 }, zoomUnlocked: 99, zoom: 99 };
    const { state } = deserialize(data);
    expect(state.upgrades.speed).toBe(2);
    expect('vella' in state.upgrades).toBe(false);
    expect(state.zoomUnlocked).toBe(4);
    expect(state.zoom).toBe(3);
  });
});

describe('offline', () => {
  it('explora pel temps absent', () => {
    const s = newGame(7);
    const r = applyOffline(s, world, 0, 600_000);
    expect(r?.seconds).toBe(600);
    expect(s.bots[0].prog).toBeGreaterThan(0);
    expect(s.bots[0].prog).toBeLessThanOrEqual(600 * stats(s).stepsPerSec);
    expect(r?.cells).toBeCloseTo(explored(s, world));
  });

  it('té un límit', () => {
    const s = newGame(7);
    const r = applyOffline(s, world, 0, (OFFLINE_CAP_SEC + 5000) * 1000);
    expect(r?.seconds).toBe(OFFLINE_CAP_SEC);
  });

  it('ignora rellotges endarrerits', () => {
    const s = newGame(7);
    expect(applyOffline(s, world, 10_000, 0)).toBeNull();
    expect(s.bots[0].prog).toBe(0);
  });
});
