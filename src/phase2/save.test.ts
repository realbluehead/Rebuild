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
    const data = serializeP2(s, 5000);
    expect(data).toMatchObject({ phase: 2, v: P2_SAVE_VERSION, savedAt: 5000, metal: '35000', bluetreri: '25000000' });
    const back = deserializeP2(decodeSave(encodeSave(data)));
    expect(back.savedAt).toBe(5000);
    expect(back.state.legacy).toEqual(legacy);
    expect(back.state.metal.toNumber()).toBe(35000);
    expect(back.state.bluetreri.toNumber()).toBe(2.5e7);
    expect(back.state.items).toEqual(legacy.items);
    expect(back.state.playTime).toBe(12.5);
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
});
