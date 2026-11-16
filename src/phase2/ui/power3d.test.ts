import { describe, expect, it } from 'vitest';
import { FACILITY_MAX, specAt } from '../core/facility';
import { POWER } from '../core/power';
import { mirrorSpots } from './power3d';

describe('mirrorSpots', () => {
  it('places as many mirrors as the tower has, at every level', () => {
    for (let lv = 1; lv <= FACILITY_MAX; lv++) {
      const n = specAt(POWER, lv).mirrors;
      expect(mirrorSpots(n)).toHaveLength(n);
    }
  });
  it('keeps mirrors on the plot and apart', () => {
    const s = mirrorSpots(specAt(POWER, FACILITY_MAX).mirrors);
    for (const [x, z] of s) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThanOrEqual(18.5);
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1])).toBeGreaterThan(1.5);
  });
});
