import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../shared/codec';
import type { Legacy } from './core/legacy';
import { newPhase2 } from './core/state';
import { deserializeP2, isPhase2Save, P2_SAVE_VERSION, serializeP2 } from './save';

const legacy: Legacy = {
  seed: 7, version: '0.50.0', at: 1, playTime: 70000, doneAt: 68000, bluetreri: '2.5e7', totalBluetreri: '9e9', metal: 35000,
  items: { page: 10, note: 4, photo: 6 }, collected: { page: 1100, note: 500, photo: 900 }, works: { book: 15, cd: 15, album: 15 },
  sheets: 20, lore: 340, cells: 1048576, rovers: ['scout', 'miner', 'hauler'],
};

describe('phase II save', () => {
  it('round-trips through the exported text', () => {
    const s = newPhase2(legacy);
    s.playTime = 12.5;
    s.levels.power = 7;
    s.crew = { kind: 'module', id: 'hull', left: 30 };
    s.lab = { id: 'sweepers', left: 12 };
    s.researched = ['polish'];
    s.modules = ['tanks'];
    s.fuel = 1500.5;
    s.data = 77;
    s.samples.ice = 4;
    s.studies[0] = 2;
    s.target = 0;
    s.launchWait = 9;
    s.probes = [{ system: 0, left: 100 }];
    s.xp = 321;
    s.attrs.speed = 3;
    const data = serializeP2(s, 5000);
    expect(data).toMatchObject({ phase: 2, v: P2_SAVE_VERSION, savedAt: 5000, metal: '35000', bluetreri: '9000000000' });
    const back = deserializeP2(decodeSave(encodeSave(data)));
    expect(back.savedAt).toBe(5000);
    expect(back.state.legacy).toEqual(legacy);
    expect(back.state.metal.toNumber()).toBe(35000);
    expect(back.state.bluetreri.toNumber()).toBe(9e9);
    expect(back.state.items).toEqual(legacy.items);
    expect(back.state.playTime).toBe(12.5);
    const plain = (x: typeof s) => ({ ...x, legacy: null, metal: x.metal.toString(), bluetreri: x.bluetreri.toString() });
    expect(plain(back.state)).toEqual(plain(s));
  });

  it('migrates a v1 save (a real one): everything at level 1, the sump holds all phase I brought up', () => {
    const v1 = {
      phase: 2, v: 1, savedAt: 1763300000000, legacy, metal: '41000', bluetreri: '2.5e7', items: { page: 10, note: 4, photo: 6 },
      playTime: 3600,
    };
    const { state } = deserializeP2(JSON.parse(JSON.stringify(v1)));
    expect(state.metal.toNumber()).toBe(41000);
    expect(state.bluetreri.toNumber()).toBe(9e9);
    expect(state.playTime).toBe(3600);
    expect(state).toMatchObject({ ...newPhase2(legacy), metal: state.metal, bluetreri: state.bluetreri, playTime: 3600 });
  });

  it('tells phase I saves apart and refuses them', () => {
    const phase1 = { v: 25, savedAt: 1, seed: 7 };
    expect(isPhase2Save(phase1)).toBe(false);
    expect(() => deserializeP2(phase1)).toThrow();
    expect(() => deserializeP2({ phase: 2, v: P2_SAVE_VERSION + 1 })).toThrow();
  });
});

describe('phase II save, broken input', () => {
  const good = () => serializeP2(newPhase2(legacy), 5000) as unknown as Record<string, unknown>;

  it('refuses what is not a game', () => {
    for (const raw of [null, 7, 'x', [], { phase: 2 }, { phase: 2, v: 'one' }, { phase: 2, v: 0.5 }, { ...good(), legacy: null }, { ...good(), legacy: { seed: 'x' } }])
      expect(() => deserializeP2(raw)).toThrow();
  });

  it('reads broken fields as harmless defaults', () => {
    const raw = {
      ...good(), savedAt: 'soon', metal: '-5', bluetreri: 'lots', playTime: Infinity, items: { page: -3, note: 'x', photo: 2.7 },
      legacy: { ...legacy, version: 3, at: -1, bluetreri: {}, totalBluetreri: 'NaN', metal: NaN, items: null, works: { book: Infinity }, rovers: ['scout', 'ghost'] },
    };
    const { state, savedAt } = deserializeP2(JSON.parse(JSON.stringify(raw)));
    expect(savedAt).toBe(0);
    expect(state.metal.toNumber()).toBe(0);
    expect(state.bluetreri.toNumber()).toBe(0);
    expect(state.playTime).toBe(0);
    expect(state.items).toEqual({ page: 0, note: 0, photo: 2 });
    expect(state.legacy).toMatchObject({ version: '?', at: 0, bluetreri: '0', totalBluetreri: '0', metal: 0, rovers: ['scout'] });
    expect(state.legacy.items).toEqual({ page: 0, note: 0, photo: 0 });
    expect(state.legacy.works).toEqual({ book: 0, cd: 0, album: 0 });
  });

  it('reads a broken economy as harmless defaults', () => {
    const raw = {
      ...good(), levels: { power: 99, refinery: -2, tanks: 'x' }, crew: { kind: 'building', id: 'castle', left: 5 },
      lab: { id: 'nope', left: 1 }, researched: ['polish', 'polish', 'nope', 3], modules: 'hull', fuel: -1, data: NaN,
      samples: { ice: 2.5, iron: -1 }, studies: [9, -1, 'x'], target: 99, launchWait: Infinity,
      probes: [{ system: 2, left: 5 }, { system: 40, left: 1 }, null], xp: -5, attrs: { speed: 2, luck: 9 }, launchedAt: 'yes',
    };
    const { state } = deserializeP2(JSON.parse(JSON.stringify(raw)));
    expect(state.levels).toMatchObject({ power: 20, refinery: 1, tanks: 1, antenna: 1 });
    expect(state.crew).toBeNull();
    expect(state.lab).toBeNull();
    expect(state.researched).toEqual(['polish']);
    expect(state.modules).toEqual([]);
    expect(state.fuel).toBe(0);
    expect(state.data).toBe(0);
    expect(state.samples).toMatchObject({ ice: 2.5, iron: 0 });
    expect(state.studies.slice(0, 3)).toEqual([3, 0, 0]);
    expect(state.studies).toHaveLength(16);
    expect(state.target).toBeNull();
    expect(state.launchWait).toBe(0);
    expect(state.probes).toEqual([{ system: 2, left: 5 }]);
    expect(state.xp).toBe(0);
    expect(state.attrs).toEqual({ intelligence: 0, perception: 0, strength: 0, endurance: 0, speed: 2, ingenuity: 0 });
    expect(state.launchedAt).toBeNull();
  });
});
