import { describe, expect, it } from 'vitest';
import { newGame } from './core/state';
import { createWorld } from './core/world';
import { explored, itemsCollected, loreFound, tick } from './core/game';
import { D } from '../shared/decimal';
import { legacyOf } from './legacy';
import { newPhase2 } from '../phase2/core/state';

describe('hand-over to phase II', () => {
  const world = createWorld(42, 64);

  it('takes what phase I achieved, and phase II starts from its resources at hand', () => {
    const s = newGame(42);
    for (let k = 0; k < 3000; k++) tick(s, world, 1);
    s.gold = D(1234.5);
    s.items = { page: 3, note: 1, photo: 2 };
    s.works.book = 2;
    s.pages = 4;
    const l = legacyOf(s, world, 1000);
    expect(l).toMatchObject({
      seed: 42, at: 1000, playTime: s.playTime, bluetreri: '1234.5', metal: 0,
      items: { page: 3, note: 1, photo: 2 }, works: { book: 2, cd: 0, album: 0 }, sheets: 4,
      cells: explored(s, world), lore: loreFound(s, world).length, rovers: ['scout'],
    });
    expect(l.collected).toEqual(itemsCollected(s, world));
    expect(l.doneAt).toBeUndefined();
    // A copy: phase I's state can change without touching it.
    s.items.page = 99;
    expect(l.items.page).toBe(3);

    const p2 = newPhase2(l);
    expect(p2.bluetreri.toString()).toBe('1234.5');
    expect(p2.metal.toNumber()).toBe(0);
    expect(p2.items).toEqual({ page: 3, note: 1, photo: 2 });
    expect(p2.playTime).toBe(0);
  });
});
