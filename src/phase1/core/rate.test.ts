import { describe, expect, it } from 'vitest';
import { RATE_TAU, RateMeter } from './rate';

describe('rate meter', () => {
  it('measures what is produced, and an unload changes nothing', () => {
    const m = new RateMeter(0, 0);
    let carried = 0;
    // 5 bluetreri/s dug for a long while, unloaded every 100 s.
    for (let t = 1; t <= 20 * RATE_TAU; t++) {
      carried += 5;
      let deposited = 0;
      if (t % 100 === 0) { deposited = carried; carried = 0; }
      m.feed(1, deposited, carried);
    }
    expect(m.rate).toBeCloseTo(5, 6);
  });

  it('starts from the value given and follows a change within a few RATE_TAU', () => {
    const m = new RateMeter(100, 0);
    expect(m.rate).toBe(100);
    let carried = 0;
    for (let t = 0; t < 5 * RATE_TAU; t++) { carried += 10; m.feed(1, 0, carried); }
    expect(m.rate).toBeGreaterThan(9);
    expect(m.rate).toBeLessThan(11);
    m.reset(3, carried);
    expect(m.rate).toBe(3);
    m.feed(0, 0, carried + 50); // no time passed: ignored
    expect(m.rate).toBe(3);
  });
});
