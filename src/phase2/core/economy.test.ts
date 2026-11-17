import { describe, expect, it } from 'vitest';
import sample from '../dev/sample-legacy.json';
import { advance } from './advance';
import { ATTRS, attrFactor, expeditionLevel, xpToNext } from './attributes';
import {
  aimFirst, bluetreriOffer, canQueue, canQueueResearch, plannedLevel, QUEUE_MAX, queueWaits, BLUETRERI_METAL, buildModule, buyBluetreri, canHurry, hurry, hurryCost, canLaunchShip, canSpendPoint, canTarget, launchShip, pointsFree, rates, research, setTarget, spendPoint,
  systemsOf, tripSeconds, upgrade, upgradeCost, worksLeft,
} from './economy';
import type { Legacy } from './legacy';
import { LAUNCH_FUEL, MODULES } from './ship';
import { destinationOf, PER_RING, RINGS, SAMPLE_KINDS, starMap, STUDIES } from './starmap';
import { newPhase2, type P2State } from './state';
import { D } from '../../shared/decimal';

const legacy = sample as Legacy;
const fresh = (): P2State => newPhase2({ ...legacy });
/** A state with no Decimals, to compare two runs. */
const plain = (s: P2State) => ({ ...s, metal: s.metal.toNumber(), bluetreri: s.bluetreri.toNumber(), legacy: undefined });

describe('star map', () => {
  it('is the same for the same seed, and differs between seeds', () => {
    expect(starMap(1)).toEqual(starMap(1));
    expect(starMap(1).map((x) => x.name)).not.toEqual(starMap(2).map((x) => x.name));
  });

  it('has 4 rings of 4, one habitable far system, every kind of sample within the first three rings', () => {
    for (const seed of [1, 2, 3, 12345, 99999]) {
      const map = starMap(seed);
      expect(map).toHaveLength(RINGS.length * PER_RING);
      for (const x of map) expect(x.distance).toBeGreaterThanOrEqual(RINGS[x.ring][0]);
      expect(map.filter((x) => x.habitable)).toEqual([destinationOf(seed)]);
      expect(destinationOf(seed).ring).toBe(3);
      const near = new Set(map.filter((x) => x.ring < 3).map((x) => x.kind));
      expect([...near].sort()).toEqual([...SAMPLE_KINDS].sort());
      expect(new Set(map.map((x) => x.name)).size).toBe(map.length);
    }
  });

  it('the first probe can reach the nearest system', () => {
    const s = fresh();
    expect(canTarget(s, 0)).toBe(true);
    expect(canTarget(s, 15)).toBe(false);
  });
});

describe('attributes and levels', () => {
  it('each point is worth less than the one before; 15 points are worth ×1.5 to ×3', () => {
    for (const a of ATTRS.map((x) => x.id)) {
      for (let n = 1; n < 15; n++) expect(attrFactor(n + 1, a) - attrFactor(n, a)).toBeLessThan(attrFactor(n, a) - attrFactor(n - 1, a));
      expect(attrFactor(0, a)).toBe(1);
      expect(attrFactor(15, a)).toBeGreaterThan(1.5);
      expect(attrFactor(15, a)).toBeLessThan(3);
    }
  });

  it('levels come from XP, each dearer', () => {
    expect(expeditionLevel(0).level).toBe(1);
    expect(expeditionLevel(xpToNext(1)).level).toBe(2);
    expect(xpToNext(2)).toBeCloseTo(xpToNext(1) * 1.1);
  });

  it('a point needs a level and a work of its kind left, and is for good', () => {
    const s = fresh();
    expect(canSpendPoint(s, 'speed')).toBe(false);
    s.xp = 1e9;
    expect(pointsFree(s)).toBeGreaterThan(45);
    for (let k = 0; k < 15; k++) expect(spendPoint(s, k % 2 ? 'speed' : 'ingenuity')).toBe(true);
    expect(worksLeft(s, 'speed')).toBe(0);
    expect(spendPoint(s, 'speed')).toBe(false);
    expect(spendPoint(s, 'strength')).toBe(true);
  });
});

describe('the economy', () => {
  it('an upgrade costs metal and takes the crew a while; the level goes up when done', () => {
    const s = fresh();
    const cost = upgradeCost(s, 'refinery')!;
    expect(upgrade(s, 'refinery')).toBe(true);
    expect(s.metal.toNumber()).toBe(legacy.metal - cost);
    expect(s.levels.refinery).toBe(1);
    advance(s, 1000);
    expect(s.levels.refinery).toBe(2);
    expect(s.crew).toBeNull();
    expect(s.xp).toBeGreaterThan(0);
  });

  it("hurrying finishes the crew's job now for metal, dearer than waiting for it", () => {
    const s = fresh();
    expect(hurryCost(s)).toBeNull();
    expect(upgrade(s, 'telescope')).toBe(true);
    const cost = hurryCost(s)!;
    const wait = (s.crew!.left / rates(s).build) * rates(s).metal;
    expect(cost).toBeGreaterThan(wait);
    const before = s.metal.toNumber();
    expect(hurry(s)).toBe(true);
    expect(s.crew).toBeNull();
    expect(s.levels.telescope).toBe(2);
    expect(s.metal.toNumber()).toBeCloseTo(before - cost);
    s.metal = D(0);
    upgrade(s, 'power'); // (no metal: the crew stays free)
    expect(canHurry(s)).toBe(false);
  });

  it('once the sump runs dry, metal buys bluetreri: a tank farm at a time, and the refinery goes on', () => {
    const s = fresh();
    s.bluetreri = D(0);
    s.fuel = 0;
    advance(s, 3600);
    expect(s.fuel).toBe(0); // (nothing to refine)
    s.metal = D(1e6);
    const n = bluetreriOffer(s);
    expect(n).toBe(Math.floor(rates(s).capacity));
    expect(buyBluetreri(s)).toBe(true);
    expect(s.bluetreri.toNumber()).toBe(n);
    expect(s.metal.toNumber()).toBe(1e6 - n * BLUETRERI_METAL);
    advance(s, 60);
    expect(s.fuel).toBeGreaterThan(0);
    s.metal = D(10);
    expect(bluetreriOffer(s)).toBe(0);
    expect(buyBluetreri(s)).toBe(false);
  });

  it('a new expedition aims its probes at the nearest system at once, but never re-aims one already aimed', () => {
    const s = fresh();
    expect(aimFirst(s)).toBe(true);
    const near = [...systemsOf(s)].sort((a, b) => a.distance - b.distance)[0];
    expect(s.target).toBe(near.id);
    advance(s, 1);
    expect(s.probes).toHaveLength(1);
    setTarget(s, null);
    expect(aimFirst(s)).toBe(false);
  });

  it('the refinery fills the tanks up to their capacity, burning the sump', () => {
    const s = fresh();
    s.fuel = 0;
    const r = rates(s);
    advance(s, 60);
    expect(s.fuel).toBeCloseTo(r.fuel * 60);
    expect(s.bluetreri.toNumber()).toBeCloseTo(D(legacy.totalBluetreri).toNumber() - r.fuel * 60, 3);
    advance(s, 1e6);
    expect(s.fuel).toBe(r.capacity);
  });

  it('probes go to the target, come back with data and study it three times', () => {
    const s = fresh();
    s.fuel = 1e9; // (clamped to the tanks on the first step)
    expect(setTarget(s, 0)).toBe(true);
    const sys = systemsOf(s)[0];
    const trip = tripSeconds(sys, rates(s));
    advance(s, trip / 2);
    expect(s.probes).toHaveLength(1);
    advance(s, 4 * 3600);
    expect(s.studies[0]).toBe(STUDIES);
    expect(s.data).toBeGreaterThan(0);
    expect(s.samples[sys.kind]).toBeGreaterThan(0);
  });

  it("the crew's queue: jobs start in order as the crew comes free, each paid for when it starts", () => {
    const s = fresh();
    expect(upgrade(s, 'refinery')).toBe(true);
    const before = s.metal.toNumber();
    expect(upgrade(s, 'power')).toBe(true); // (queued: nothing paid yet)
    expect(upgrade(s, 'power')).toBe(true);
    expect(s.metal.toNumber()).toBe(before);
    expect(s.queue).toEqual([{ kind: 'building', id: 'power' }, { kind: 'building', id: 'power' }]);
    expect(plannedLevel(s, 'power')).toBe(3);
    advance(s, 3600);
    expect(s.levels).toMatchObject({ refinery: 2, power: 3 });
    expect(s.queue).toEqual([]);
    expect(s.crew).toBeNull();
  });

  it('the queue holds QUEUE_MAX jobs, never past the top level, a module once', () => {
    const s = fresh();
    expect(canQueue(s, { kind: 'building', id: 'power' })).toBe(false); // (the crew is free: build it now)
    upgrade(s, 'antenna');
    s.levels.power = 19;
    expect(upgrade(s, 'power')).toBe(true);
    expect(canQueue(s, { kind: 'building', id: 'power' })).toBe(false); // (20 is the top)
    expect(buildModule(s, MODULES[0].id)).toBe(true);
    expect(canQueue(s, { kind: 'module', id: MODULES[0].id })).toBe(false);
    while (s.queue.length < QUEUE_MAX) upgrade(s, 'telescope');
    expect(upgrade(s, 'refinery')).toBe(false);
  });

  it('a queued job waits for its metal and starts the moment there is enough, the same in one step or many', () => {
    const make = () => {
      const s = fresh();
      upgrade(s, 'refinery');
      upgrade(s, 'telescope');
      s.metal = D(0);
      return s;
    };
    const a = make(), b = make();
    advance(a, 2000);
    expect(queueWaits(a)).toBeNull();
    for (let k = 0; k < 2000; k++) advance(b, 1);
    expect(b.levels).toEqual(a.levels);
    expect(b.crew?.left ?? 0).toBeCloseTo(a.crew?.left ?? 0, 3);
    expect(b.metal.toNumber()).toBeCloseTo(a.metal.toNumber(), 3);
    const s = make();
    advance(s, s.crew!.left / rates(s).build + 1);
    expect(s.crew).toBeNull(); // (done, and the telescope's metal not there yet)
    expect(queueWaits(s)).toBe('metal');
    advance(s, 3600);
    expect(s.levels.telescope).toBe(2);
  });

  it("the lab's queue starts the next research once the lab is free and the data is in", () => {
    const s = fresh();
    s.data = 6;
    expect(research(s, 'sweepers')).toBe(true);
    expect(canQueueResearch(s, 'sweepers')).toBe(false);
    expect(research(s, 'heatpipes')).toBe(true); // (queued)
    expect(s.labQueue).toEqual(['heatpipes']);
    advance(s, 3600);
    expect(s.researched).toContain('sweepers');
    expect(s.labQueue).toEqual(['heatpipes']); // (no data for it yet)
    s.data = 6;
    advance(s, 3600);
    expect(s.researched).toContain('heatpipes');
    expect(s.labQueue).toEqual([]);
  });

  it('is exact: one long step ends where many short ones do', () => {
    const make = () => {
      const s = fresh();
      setTarget(s, 0);
      upgrade(s, 'refinery');
      s.data = 100;
      research(s, 'sweepers');
      return s;
    };
    const a = make(), b = make();
    advance(a, 6 * 3600);
    for (let k = 0; k < 6 * 360; k++) advance(b, 10);
    for (let k = 0; k < 3; k++) { advance(b, 0.001); advance(a, 0.001); }
    const pa = plain(a), pb = plain(b);
    expect(pb.levels).toEqual(pa.levels);
    expect(pb.researched).toEqual(pa.researched);
    expect(pb.studies).toEqual(pa.studies);
    expect(pb.samples).toEqual(pa.samples);
    expect(pb.probes.length).toBe(pa.probes.length);
    expect(pb.metal).toBeCloseTo(pa.metal, 3);
    expect(pb.fuel).toBeCloseTo(pa.fuel, 3);
    expect(pb.data).toBeCloseTo(pa.data, 3);
    expect(pb.playTime).toBeCloseTo(pa.playTime, 3);
  });

  it('the ship launches only once built, its destination known and its fuel in the tanks', () => {
    const s = fresh();
    expect(canLaunchShip(s)).toBe(false);
    s.metal = D(1e12);
    s.data = 1e12;
    for (const k of SAMPLE_KINDS) s.samples[k] = 1e6;
    for (const m of MODULES) { expect(buildModule(s, m.id)).toBe(true); advance(s, 1e5); }
    s.studies[destinationOf(legacy.seed).id] = STUDIES;
    s.levels.tanks = 20;
    s.fuel = LAUNCH_FUEL;
    expect(launchShip(s)).toBe(true);
    expect(s.launchedAt).toBe(s.playTime);
    const before = plain(s);
    advance(s, 3600);
    expect(plain(s)).toEqual(before);
  });
});

describe('the report on coming back', () => {
  it('sums up what changed while away: levels, research, studies, samples', async () => {
    const { snap, awaySummary } = await import('./away');
    const s = fresh();
    setTarget(s, 0);
    upgrade(s, 'refinery');
    upgrade(s, 'power');
    s.data = 6;
    research(s, 'sweepers');
    const before = snap(s);
    advance(s, 4 * 3600);
    const a = awaySummary(before, s);
    expect(a.levels).toEqual(expect.arrayContaining([['refinery', 1, 2], ['power', 1, 2]]));
    expect(a.researched).toEqual(['sweepers']);
    expect(a.studies).toBeGreaterThan(0);
    expect(a.metal).toBeGreaterThan(0);
  });
});
