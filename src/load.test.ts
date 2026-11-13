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
});
