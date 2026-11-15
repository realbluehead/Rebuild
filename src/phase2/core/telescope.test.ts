import { describe, expect, it } from 'vitest';
import { TELESCOPE_MAX, telescopeAt, telescopeRange, UPGRADES, upgradeCost } from './telescope';

describe('telescope', () => {
  it('has one upgrade per level', () => {
    expect(UPGRADES).toHaveLength(TELESCOPE_MAX);
  });

  it('starts as a scrap spyglass and ends as an observatory', () => {
    const a = telescopeAt(1), z = telescopeAt(TELESCOPE_MAX);
    expect(a).toMatchObject({ level: 1, mount: 'tripod', tube: 'refractor', dome: false, lasers: 0 });
    expect(z).toMatchObject({ level: 20, mount: 'fork', tube: 'truss', dome: true, segments: 19, lasers: 3 });
  });

  it('clamps the level', () => {
    expect(telescopeAt(0).level).toBe(1);
    expect(telescopeAt(99).level).toBe(TELESCOPE_MAX);
  });

  it('never gets worse from one level to the next', () => {
    for (let lv = 2; lv <= TELESCOPE_MAX; lv++) {
      const a = telescopeAt(lv - 1), b = telescopeAt(lv);
      expect(b.aperture).toBeGreaterThanOrEqual(a.aperture);
      expect(b.lenses).toBeGreaterThanOrEqual(a.lenses);
      expect(b.sharpness).toBeGreaterThanOrEqual(a.sharpness);
      expect(telescopeRange(b)).toBeGreaterThanOrEqual(telescopeRange(a));
      if (lv > 2) expect(upgradeCost(lv)).toBeGreaterThan(upgradeCost(lv - 1));
    }
  });
});
