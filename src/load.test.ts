import { describe, expect, it } from 'vitest';
import { loadWorld, worldBuffers } from './load';
import { newGame } from './core/state';
import { serialize } from './save/save';

describe('start-up load', () => {
  it('builds the world, replays the routes and simulates the time away, all as plain data', () => {
    const s = newGame(5);
    s.plan = [[1, 'random', 0]];
    const progress: number[] = [];
    const out = loadWorld(serialize(s, 0), 3_600_000, (p) => progress.push(p));
    expect(out.fresh).toBe(false);
    expect(out.report?.seconds).toBe(3600);
    expect(typeof out.report?.gold).toBe('string');
    expect(out.save.playTime).toBeCloseTo(3600);
    expect(out.save.savedAt).toBe(3_600_000);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    // Every typed array of the world is handed over once.
    const bufs = worldBuffers(out.world);
    expect(new Set(bufs).size).toBe(bufs.length);
    expect(bufs).toContain(out.world.order.buffer);
    expect(structuredClone(out).world.order).toEqual(out.world.order);
  });

  it('starts a new game without a save', () => {
    const out = loadWorld(null, 0);
    expect(out.fresh).toBe(true);
    expect(out.report).toBeNull();
    expect(out.save.ring).toBe(0);
  });

  it('reuses the stored map and applies only the routes taken since', () => {
    const s = newGame(5);
    s.ring = 8;
    s.plan = [[1, 'random', 0]];
    const first = loadWorld(serialize(s, 0), 0, undefined, undefined, 'b1');
    expect(first.cacheHit).toBe(false);
    const stored = structuredClone(first.cache!);
    expect(stored).toMatchObject({ build: 'b1', seed: 5, plan: ['[1,"random",0]'] });
    // Same plan: the stored map is used as it is, and there is nothing new to store.
    const same = loadWorld(serialize(s, 0), 0, undefined, structuredClone(stored), 'b1');
    expect(same.cacheHit).toBe(true);
    expect(same.cache).toBeUndefined();
    expect(same.world.order).toEqual(first.world.order);
    // One more route since: only that one is applied, and the result is the same as building everything again (as in
    // live play, where each switch re-sorts everything: ties in a ring are broken by cell, see `reorder`).
    s.routes.push('circular');
    s.plan = [[1, 'random', 0], [6, 'circular', 0]];
    const more = loadWorld(serialize(s, 0), 0, undefined, structuredClone(stored), 'b1');
    const scratch = loadWorld(serialize(s, 0), 0);
    expect(more.cacheHit).toBe(true);
    expect(more.world.order).toEqual(scratch.world.order);
    expect(more.world.goldPrefix).toEqual(scratch.world.goldPrefix);
    expect(more.cache?.plan).toEqual(['[1,"random",0]', '[6,"circular",0]']);
    // Another game, or a plan that does not start with the stored one: built from scratch.
    expect(loadWorld(serialize(newGame(6), 0), 0, undefined, structuredClone(stored)).cacheHit).toBe(false);
    s.plan = [[2, 'random', 0]];
    expect(loadWorld(serialize(s, 0), 0, undefined, structuredClone(stored)).cacheHit).toBe(false);
  }, 30_000);
});
