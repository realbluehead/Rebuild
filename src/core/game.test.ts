import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buy, canCraft, carried, costOf, craft, explored, fromLegacy, isComplete, nextWorkCost, setZoom, stats, tick } from './game';
import { UPGRADES } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { D } from './decimal';
import { fmt } from './format';
import { createWorld, goldBetween, pathCells, totalCells, totalSteps, unlockAt, zoomFraction } from './world';

// Small map so the tests run fast (the real one is MAP_SIZE).
const SIZE = 128;
const world = createWorld(42, SIZE);
const botes = UPGRADES.find((u) => u.id === 'speed')!;

describe('world', () => {
  it('scatters pages, notes and photos by weight', () => {
    const counts = [0, 0, 0];
    for (const r of world.itemRanks) counts[world.item[world.order[r]] - 1]++;
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total / totalCells(world)).toBeGreaterThan(0.005);
    expect(counts[0] / total).toBeCloseTo(0.45, 1);
    expect(counts[1] / total).toBeCloseTo(0.2, 1);
    expect(counts[2] / total).toBeCloseTo(0.35, 1);
  });

  it('is deterministic for the same seed', () => {
    const other = createWorld(42, SIZE);
    expect(other.terrain).toEqual(world.terrain);
    expect(other.order).toEqual(world.order);
  });

  it('the order is a permutation and starts at the centre', () => {
    const seen = new Uint8Array(totalCells(world));
    for (const i of world.order) seen[i]++;
    expect(seen.every((v) => v === 1)).toBe(true);
    expect(world.order[0]).toBe(world.cy * SIZE + world.cx);
    for (let r = 0; r < 50; r++) expect(world.rank[world.order[r]]).toBe(r);
  });

  it('a rover only reveals the adjacent cell: if the next one is far, it has to walk', () => {
    expect(world.steps[1]).toBe(1);
    let far = 0;
    for (let r = 1; r < totalCells(world); r++) {
      const a = world.order[r - 1];
      const b = world.order[r];
      const king = Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)));
      // An adjacent cell costs one step times its roughness; a farther one, one per cell of the way.
      expect(world.steps[r + 1] - world.steps[r]).toBeCloseTo(king * TERRAINS[world.terrain[b]].rough, 9);
      if (king > 1) far++;
    }
    expect(far).toBeGreaterThan(0);
    expect(totalSteps(world)).toBeGreaterThan(totalCells(world));
  });

  it('rough terrain costs more steps', () => {
    const rough = TERRAINS.map((t) => t.rough);
    expect(Math.min(...rough)).toBe(1);
    expect(Math.max(...rough)).toBeGreaterThan(2);
  });

  it('the explored area is always one connected patch (no islands)', () => {
    const n = totalCells(world);
    for (const explored of [2, 10, 77, 500, 1234, 4000, 9999, n - 100]) {
      // BFS from camp (8 neighbours) over explored cells only: it must find all of them.
      const seen = new Uint8Array(n);
      const queue = [world.order[0]];
      seen[world.order[0]] = 1;
      let found = 0;
      while (queue.length) {
        const i = queue.pop()!;
        found++;
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const j = ny * SIZE + nx;
          if (!seen[j] && world.rank[j] < explored) { seen[j] = 1; queue.push(j); }
        }
      }
      expect(found).toBe(explored);
    }
  });

  it('the zoom fraction grows up to 1', () => {
    expect(zoomFraction(world, 0, 0)).toBe(0);
    expect(zoomFraction(world, 0, totalCells(world))).toBe(1);
    const at = unlockAt(world, 0);
    expect(zoomFraction(world, 0, at)).toBeGreaterThanOrEqual(0.8);
    expect(zoomFraction(world, 0, at - 1)).toBeLessThan(0.8);
  });
});

describe('game', () => {
  const run = (s: ReturnType<typeof newGame>, seconds: number, dt = 0.5) => {
    const ev = { specials: 0, items: new Set<number>(), deposited: 0 };
    for (let t = 0; t < seconds && !isComplete(s, world); t += dt) {
      const e = tick(s, world, dt);
      ev.specials += e.specials.length;
      for (const r of e.items) { expect(ev.items.has(r)).toBe(false); ev.items.add(r); }
      ev.deposited += e.deposited;
    }
    return ev;
  };

  it('steps advance with time and the camp is revealed on the first step', () => {
    const s = newGame(42);
    // Short enough that the camp ring does not finish (and the return trip does not start).
    const sec = 0.5 / stats(s).speed;
    tick(s, world, sec);
    expect(s.bots[0].prog).toBeCloseTo(0.5);
    expect(s.bots[0].trip).toBe('explore');
    expect(explored(s, world)).toBeGreaterThan(0);
    // Rovers carry the bluetreri until they unload it at camp.
    expect(s.gold.toNumber() + carried(s)).toBeCloseTo(goldBetween(world, 0, explored(s, world)));
  });

  it('with a full hold the rover returns to camp, unloads and heads out again', () => {
    const s = newGame(42);
    s.upgrades.speed = 10;
    const cap = stats(s).cargo;
    let k = 0;
    while (s.bots[0].trip === 'explore' && k++ < 100000) tick(s, world, 0.1);
    expect(s.bots[0].trip).toBe('home');
    expect(s.bots[0].cargo).toBeCloseTo(cap, 9);
    expect(s.gold.toNumber()).toBe(0);
    const prog = s.bots[0].prog;
    let deposited = 0;
    while (s.bots[0].trip !== 'explore' && k++ < 100000) deposited += tick(s, world, 0.1).deposited;
    // While travelling it does not explore: at most the bit of the last tick once back on its arc.
    expect(s.bots[0].prog).toBeGreaterThanOrEqual(prog - 1e-9);
    expect(s.bots[0].prog - prog).toBeLessThanOrEqual(stats(s).speed * 0.1 + 1e-9);
    expect(deposited).toBeCloseTo(cap, 6);
    expect(s.gold.toNumber()).toBeGreaterThanOrEqual(cap - 1e-6);
  });

  it('with several rovers, each goes and returns on its own (not synchronised)', () => {
    const s = newGame(42);
    s.upgrades.explorers = 2;
    s.upgrades.speed = 12;
    let staggered = 0;
    let cargoDiffers = 0;
    for (let k = 0; k < 20000 && explored(s, world) < 3000; k++) {
      tick(s, world, 0.2);
      if (s.bots.length !== 3) continue;
      // Much of the time they are not all doing the same thing, and each carries its own cargo.
      if (new Set(s.bots.map((b) => b.trip)).size > 1) staggered++;
      if (new Set(s.bots.map((b) => b.cargo.toFixed(6))).size > 1) cargoDiffers++;
    }
    expect(s.bots.length).toBe(3);
    expect(staggered).toBeGreaterThan(50);
    expect(cargoDiffers).toBeGreaterThan(50);
  });

  it('one long tick gives the same as many short ones (exact offline)', () => {
    const a = newGame(42);
    const b = newGame(42);
    a.upgrades.speed = b.upgrades.speed = 12;
    a.upgrades.explorers = b.upgrades.explorers = 1;
    tick(a, world, 900);
    for (let k = 0; k < 9000; k++) tick(b, world, 0.1);
    expect(a.ring).toBe(b.ring);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 3);
    a.bots.forEach((bot, j) => {
      expect(bot.trip).toBe(b.bots[j].trip);
      expect(bot.prog).toBeCloseTo(b.bots[j].prog, 3);
      expect(bot.cargo).toBeCloseTo(b.bots[j].cargo, 3);
    });
  });

  for (const [robots, radar] of [[1, 0], [3, 0], [1, 2], [3, 4]]) {
    it(`with ${robots} rover(s) and radar ${radar}, all bluetreri, deposits and items arrive exactly once`, () => {
      const s = newGame(42);
      s.upgrades.explorers = robots - 1;
      s.upgrades.speed = 40;
      s.upgrades.cargo = 20;
      s.upgrades.radar = radar;
      const ev = run(s, 40000);
      expect(isComplete(s, world)).toBe(true);
      expect(explored(s, world)).toBeCloseTo(totalCells(world));
      expect(ev.specials).toBe(world.special.reduce((a, b) => a + b, 0));
      expect(ev.items.size).toBe(world.itemRanks.length);
      expect(s.items.page + s.items.note + s.items.photo).toBe(world.itemRanks.length);
      expect(s.totalGold.toNumber() / world.goldPrefix[totalCells(world)]).toBeCloseTo(1, 6);
    });
  }

  it('a rover bought mid-ring starts working on the next ring', () => {
    const s = newGame(42);
    s.upgrades.speed = 20;
    s.upgrades.cargo = 20;
    while (s.ring < 3) tick(s, world, 0.05);
    s.upgrades.explorers = 2;
    const ring = s.ring;
    tick(s, world, 0.0001);
    expect(s.bots.length).toBe(1);
    while (s.ring === ring) tick(s, world, 0.1);
    expect(s.bots.length).toBe(3);
    expect(s.ringRobots).toBe(3);
    expect(s.bots[1].trip).toBe('out'); // leaves camp
  });

  it('the radar sends rovers to fetch items in the dark, before exploring reaches them', () => {
    const s = newGame(42);
    s.upgrades.speed = 10;
    s.upgrades.cargo = 20;
    s.upgrades.radar = 3;
    let early = 0;
    for (let k = 0; k < 20000 && s.radarNext < 5; k++) {
      const ev = tick(s, world, 0.2);
      for (const r of ev.items) if (r >= explored(s, world)) early++;
    }
    expect(early).toBeGreaterThan(0);
  });

  it('a detour reveals the path it walked, which is dropped once exploring catches up', () => {
    const s = newGame(42);
    s.upgrades.speed = 10;
    s.upgrades.cargo = 20;
    s.upgrades.radar = 3;
    for (let k = 0; k < 20000 && s.scouted.length === 0; k++) tick(s, world, 0.2);
    expect(s.scouted.length).toBe(3);
    const [from, to, max] = s.scouted;
    const path = pathCells(world, from, to);
    expect(path[0]).toBe(world.order[from]);
    expect(path[path.length - 1]).toBe(world.order[to]);
    expect(max).toBe(Math.max(...path.map((i) => world.rank[i])));
    run(s, 100000);
    expect(s.scouted).toEqual([]);
  });

  it('an old save (total steps) is converted into a ring and rovers', () => {
    const s = newGame(42);
    s.upgrades.explorers = 1;
    s.upgrades.speed = 40;
    s.upgrades.cargo = 20;
    s.legacyWalked = 2000;
    fromLegacy(s, world);
    expect(s.legacyWalked).toBeUndefined();
    expect(s.ring).toBeGreaterThan(0);
    expect(s.bots.length).toBe(2);
    expect(explored(s, world)).toBeGreaterThan(0);
    const ev = run(s, 100000);
    expect(isComplete(s, world)).toBe(true);
    expect(ev.deposited).toBeGreaterThan(0);
  });

  it('with enough items a work is made, and the next costs more', () => {
    const s = newGame(42);
    expect(canCraft(s, 'book')).toBe(false);
    s.items.page = 10;
    const speed = stats(s).speed;
    expect(craft(s, 'book')).toBe(true);
    expect(s.items.page).toBe(0);
    expect(s.works.book).toBe(1);
    expect(stats(s).speed).toBeGreaterThan(speed);
    expect(nextWorkCost(s, 'book')).toBeGreaterThan(10);
  });

  it('cannot buy without bluetreri', () => {
    const s = newGame(42);
    expect(buy(s, 'speed')).toBe(false);
    expect(s.upgrades.speed).toBe(0);
  });

  it('buying subtracts the cost and raises the speed', () => {
    const s = newGame(42);
    s.gold = D(botes.baseCost);
    const before = stats(s).stepsPerSec;
    expect(buy(s, 'speed')).toBe(true);
    expect(s.gold.toNumber()).toBe(0);
    expect(stats(s).stepsPerSec).toBeGreaterThan(before);
  });

  it('the cost of N levels is the sum of the individual ones', () => {
    let sum = D(0);
    for (let i = 0; i < 5; i++) sum = sum.add(costOf(botes, 3 + i));
    expect(costOf(botes, 3, 5).toNumber()).toBeCloseTo(sum.toNumber(), 6);
  });

  it('unlocks zooms in order and does not go past the end of the map', () => {
    const s = newGame(42);
    s.upgrades.speed = 60;
    s.upgrades.cargo = 30;
    let unlocked = 1;
    for (let k = 0; k < 4000 && !isComplete(s, world); k++) {
      const ev = tick(s, world, 1);
      if (ev.zoomUnlocked) { expect(ev.zoomUnlocked).toBeGreaterThan(unlocked); unlocked = ev.zoomUnlocked; }
    }
    expect(isComplete(s, world)).toBe(true);
    expect(explored(s, world)).toBe(totalCells(world));
    expect(s.zoomUnlocked).toBe(ZOOMS.length);
  });

  it('the chosen zoom stays within the unlocked ones', () => {
    const s = newGame(42);
    setZoom(s, 3);
    expect(s.zoom).toBe(0);
    s.zoomUnlocked = 3;
    setZoom(s, 5);
    expect(s.zoom).toBe(2);
  });

  it('format', () => {
    expect(fmt(999)).toBe('999');
    expect(fmt(0.115)).toBe('0.12');
    expect(fmt(2.5)).toBe('2.5');
    expect(fmt(1234)).toBe('1.23k');
    expect(fmt('1e40')).toBe('1.00e40');
  });
});
