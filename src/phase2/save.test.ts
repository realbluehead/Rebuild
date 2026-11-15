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
