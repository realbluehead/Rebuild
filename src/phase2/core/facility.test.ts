import { describe, expect, it } from 'vitest';
import { ANTENNA } from './antenna';
import { FACILITY_MAX, facilityCost, maxLevel, specAt, type Facility } from './facility';
import { POWER } from './power';
import { PROBES } from './probes';
import { REFINERY } from './refinery';
import { TANKS } from './tanks';
import { TELESCOPE } from './telescope';

const as = (f: unknown) => f as Facility<{ level: number }>;
const ALL: [string, Facility<{ level: number }>, number][] = [
  ['telescope', as(TELESCOPE), FACILITY_MAX],
  ['power', as(POWER), FACILITY_MAX],
  ['refinery', as(REFINERY), FACILITY_MAX],
  ['tanks', as(TANKS), FACILITY_MAX],
  ['antenna', as(ANTENNA), 15],
  ['probes', as(PROBES), 15],
];

describe.each(ALL)('%s', (_, f, levels) => {
  it('has one upgrade per level', () => {
    expect(f.upgrades).toHaveLength(levels);
    expect(maxLevel(f)).toBe(levels);
  });

  it('clamps the level', () => {
    expect(specAt(f, 0).level).toBe(1);
    expect(specAt(f, 99).level).toBe(levels);
  });

  it('its gauge never drops and fills at the top level', () => {
    for (let lv = 2; lv <= levels; lv++) expect(f.gauge(specAt(f, lv))).toBeGreaterThanOrEqual(f.gauge(specAt(f, lv - 1)));
    expect(f.gauge(specAt(f, levels))).toBeCloseTo(1);
  });

  it('shows its numbers', () => {
    expect(f.stats(specAt(f, 10)).length).toBeGreaterThan(0);
  });
});

it('costs grow with the level', () => {
  for (let lv = 3; lv <= FACILITY_MAX; lv++) expect(facilityCost(lv)).toBeGreaterThan(facilityCost(lv - 1));
});
