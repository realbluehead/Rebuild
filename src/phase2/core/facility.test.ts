import { describe, expect, it } from 'vitest';
import { FACILITY_MAX, facilityCost, specAt, type Facility } from './facility';
import { POWER } from './power';
import { REFINERY } from './refinery';
import { TANKS } from './tanks';
import { TELESCOPE } from './telescope';

const ALL: [string, Facility<{ level: number }>][] = [
  ['telescope', TELESCOPE as unknown as Facility<{ level: number }>],
  ['power', POWER as unknown as Facility<{ level: number }>],
  ['refinery', REFINERY as unknown as Facility<{ level: number }>],
  ['tanks', TANKS as unknown as Facility<{ level: number }>],
];

describe.each(ALL)('%s', (_, f) => {
  it('has one upgrade per level', () => {
    expect(f.upgrades).toHaveLength(FACILITY_MAX);
  });

  it('clamps the level', () => {
    expect(specAt(f, 0).level).toBe(1);
    expect(specAt(f, 99).level).toBe(FACILITY_MAX);
  });

  it('its gauge never drops and fills at the top level', () => {
    for (let lv = 2; lv <= FACILITY_MAX; lv++) expect(f.gauge(specAt(f, lv))).toBeGreaterThanOrEqual(f.gauge(specAt(f, lv - 1)));
    expect(f.gauge(specAt(f, FACILITY_MAX))).toBeCloseTo(1);
  });

  it('shows its numbers', () => {
    expect(f.stats(specAt(f, 10)).length).toBeGreaterThan(0);
  });
});

it('costs grow with the level', () => {
  for (let lv = 3; lv <= FACILITY_MAX; lv++) expect(facilityCost(lv)).toBeGreaterThan(facilityCost(lv - 1));
});
