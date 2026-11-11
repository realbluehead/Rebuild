import { describe, expect, it } from 'vitest';
import { newGame } from '../core/state';
import { D } from '../core/decimal';
import { explored, stats } from '../core/game';
import { createWorld } from '../core/world';
import { deserialize, exportSave, importSave, migrate, serialize } from './save';
import { applyOffline, OFFLINE_CAP_SEC } from './offline';

const world = createWorld(7, 128);

describe('save', () => {
  it('serialitza i deserialitza sense perdre res', () => {
    const s = newGame(7);
    s.gold = D('1.5e300');
    s.walked = 123.5;
    s.ringRobots = 2;
    s.cargo = D(3.5);
    s.trip = 'home';
    s.travel = 1.5;
    s.travelLen = 4;
    s.items.page = 7;
    s.works.cd = 2;
    s.radarNext = 11;
    s.upgrades.speed = 7;
    s.zoomUnlocked = 3;
    s.zoom = 2;
    const { state, savedAt } = deserialize(JSON.parse(JSON.stringify(serialize(s, 1234))));
    expect(savedAt).toBe(1234);
    expect(state.gold.eq(s.gold)).toBe(true);
    expect(state).toMatchObject({ seed: 7, walked: 123.5, ringRobots: 2, zoomUnlocked: 3, zoom: 2, trip: 'home', travel: 1.5, travelLen: 4 });
    expect(state.cargo.toNumber()).toBe(3.5);
    expect(state.items.page).toBe(7);
    expect(state.works.cd).toBe(2);
    expect(state.radarNext).toBe(11);
    expect(state.upgrades.speed).toBe(7);
  });

  it('export/import en text', () => {
    const data = serialize(newGame(), 5);
    expect(importSave(exportSave(data))).toEqual(data);
  });

  it('migra una partida v1 (abans de la bodega)', () => {
    const v1 = { v: 1, savedAt: 9, seed: 3, walked: 50, gold: '12', totalGold: '40', upgrades: { speed: 4, radius: 2, loot: 3, explorers: 1 }, ringRobots: 2, zoomUnlocked: 2, zoom: 1, playTime: 99 };
    const { state } = deserialize(v1);
    expect(state.upgrades).toEqual({ speed: 4, radar: 3, cargo: 0, explorers: 1 });
    expect(state.items).toEqual({ page: 0, note: 0, photo: 0 });
    expect(state.radarNext).toBe(0);
    expect(state.cargo.toNumber()).toBe(0);
    expect(state.trip).toBe('explore');
    expect(state).toMatchObject({ walked: 50, ringRobots: 2, zoomUnlocked: 2 });
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
    expect(s.walked).toBeGreaterThan(0);
    expect(s.walked).toBeLessThanOrEqual(600 * stats(s).stepsPerSec);
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
    expect(s.walked).toBe(0);
  });
});
