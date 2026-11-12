import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buy, canCraft, canUnlockRoute, carried, chooseRoute, costOf, craft, explored, fromLegacy, homeSpeed, isComplete, libraryShare, nextWorkCost, progress, routeLevel, routeUpgradeCost, setZoom, stats, tick, unlockRoute, upgradeRoute } from './game';
import { evolveWeather, stormFactor, weatherFactor } from './weather';
import { UPGRADES } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { D } from './decimal';
import { fmt } from './format';
import { applyPlan, createWorld, goldBetween, kingDistance, pathCells, stepsAt, totalCells, totalSteps, unlockAt, zoomFraction, type PlanEntry, type World } from './world';
import { ROUTE_MAX_LEVEL, ROUTES, type RouteId } from '../content/routes';
import { collectionCost, ITEMS, WORKS, WORKS_MAX } from '../content/collection';

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
    expect(stepsAt(world, 1, 1)).toBe(1);
    let far = 0;
    for (let r = 1; r < totalCells(world); r++) {
      const a = world.order[r - 1];
      const b = world.order[r];
      const king = Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)));
      // An adjacent cell costs one step times its roughness; a farther one, one per cell of the way.
      expect(stepsAt(world, 1, r + 1) - stepsAt(world, 1, r)).toBeCloseTo(king * TERRAINS[world.terrain[b]].rough, 9);
      // With perfect tyres only the distance counts.
      expect(stepsAt(world, 0, r + 1) - stepsAt(world, 0, r)).toBeCloseTo(king, 9);
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
    for (const s of [a, b]) Object.assign(s.upgrades, { speed: 12, explorers: 1, radar: 2, tyres: 2, body: 1 });
    tick(a, world, 900);
    for (let k = 0; k < 9000; k++) tick(b, world, 0.1);
    expect(a.weather.epoch).toBeGreaterThan(0); // the sky changed on the way
    expect(a.fetched).toEqual(b.fetched);
    expect(a.items).toEqual(b.items);
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
    const radius = stats(s).radar;
    for (let k = 0; k < 20000 && early < 5; k++) {
      // Every rover that sets off on a detour goes for an item inside its own radar circle.
      const before = s.bots.map((b) => b.trip);
      const ev = tick(s, world, 0.2);
      s.bots.forEach((b, j) => {
        if (b.trip === 'detour' && before[j] !== 'detour') {
          expect(kingDistance(world, world.order[b.from], world.order[world.itemRanks[b.target]])).toBeLessThanOrEqual(radius);
        }
      });
      for (const i of ev.items) if (world.rank[i] >= explored(s, world)) early++;
    }
    expect(early).toBe(5);
  });

  it('a loaded rover drives home slower than an empty one heads out', () => {
    const st = stats(newGame(1));
    expect(homeSpeed(st, 0)).toBe(st.travelSpeed);
    expect(homeSpeed(st, st.cargo)).toBeLessThan(st.travelSpeed / 2);
  });

  it('tyres make rough cells cheaper and keep every rover on its cell', () => {
    const s = newGame(42);
    s.upgrades.speed = 10;
    s.upgrades.cargo = 30;
    s.gold = D(1e9);
    while (s.ring < 8) tick(s, world, 0.3);
    const before = progress(s, world);
    expect(buy(s, world, 'tyres', 3)).toBe(true);
    const after = progress(s, world);
    after.reach.forEach((x, k) => expect(x).toBeCloseTo(before.reach[k], 9));
    expect(stats(s).grip).toBeLessThan(1);
  });

  it('storms drift, form and fade one at a time', () => {
    const s = newGame(42);
    s.ring = 40;
    let born = 0;
    let died = 0;
    let severe = 0;
    const seen = new Map<number, { x: number; y: number }>();
    for (let e = 1; e < 3000; e++) {
      const before = new Set(s.weather.storms.map((st) => st.id));
      s.weather = evolveWeather(s, world, e);
      const now = new Set(s.weather.storms.map((st) => st.id));
      const added = [...now].filter((id) => !before.has(id)).length;
      expect(added).toBeLessThanOrEqual(1); // never a whole new sky at once
      born += added;
      died += [...before].filter((id) => !now.has(id)).length;
      for (const st of s.weather.storms) {
        const p = seen.get(st.id);
        if (p) expect(Math.hypot(st.x - p.x, st.y - p.y)).toBeLessThan(1); // drifts, never jumps
        seen.set(st.id, { x: st.x, y: st.y });
        if (st.severe && st.age === 0) severe++;
      }
    }
    expect(born).toBeGreaterThan(20);
    expect(died).toBeGreaterThan(10);
    expect(severe).toBeGreaterThan(0);
    expect(severe).toBeLessThan(born / 2);
  });

  it('storms slow rovers down and the body softens it', () => {
    const s = newGame(42);
    s.ring = 40;
    for (let e = 1; !s.weather.storms.some((st) => st.r > 2); e++) s.weather = evolveWeather(s, world, e);
    const storms = s.weather.storms;
    const st = storms.find((x) => x.r > 2)!;
    const cell = Math.round(st.y) * SIZE + Math.round(st.x);
    const bare = weatherFactor(storms, SIZE, cell, 1);
    expect(bare).toBeLessThan(1);
    expect(bare).toBeGreaterThanOrEqual(Math.min(...storms.map(stormFactor)) - 1e-12);
    expect(bare).toBeGreaterThanOrEqual(0.1);
    expect(weatherFactor(storms, SIZE, cell, 0.5)).toBeGreaterThan(bare);
    expect(weatherFactor([], SIZE, cell, 1)).toBe(1);
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
    s.items.page = 15;
    const speed = stats(s).speed;
    expect(craft(s, 'book')).toBe(true);
    expect(s.items.page).toBe(0);
    expect(s.works.book).toBe(1);
    expect(stats(s).speed).toBeGreaterThan(speed);
    expect(nextWorkCost(s, 'book')).toBeGreaterThan(15);
  });

  it('each collection ends at WORKS_MAX works, and the library share reaches 100%', () => {
    const s = newGame(42);
    s.items = { page: 1e9, note: 1e9, photo: 1e9 };
    for (const wd of WORKS) while (craft(s, wd.id));
    for (const wd of WORKS) expect(s.works[wd.id]).toBe(WORKS_MAX);
    expect(libraryShare(s)).toBe(1);
    expect(libraryShare(s, 'book')).toBe(1);
  });

  it('the map holds enough items to finish the whole library and every route and level', () => {
    const need: Record<string, number> = { page: 0, note: 0, photo: 0 };
    for (const wd of WORKS) need[wd.item] += collectionCost(wd);
    for (const rd of ROUTES) {
      for (const [k, n] of Object.entries(rd.items)) need[k] += n ?? 0;
      for (let lv = 0; lv < ROUTE_MAX_LEVEL; lv++) for (const [k, n] of Object.entries(rd.levelItems)) need[k] += (n ?? 0) * (lv + 1);
    }
    for (const seed of [7, 99999]) {
      const w = createWorld(seed);
      const have = [0, 0, 0, 0];
      for (let i = 0; i < w.item.length; i++) have[w.item[i]]++;
      ITEMS.forEach((it, k) => expect(need[it.id]).toBeLessThan(0.85 * have[k + 1]));
    }
  });

  it('cannot buy without bluetreri', () => {
    const s = newGame(42);
    expect(buy(s, world, 'speed')).toBe(false);
    expect(s.upgrades.speed).toBe(0);
  });

  it('buying subtracts the cost and raises the speed', () => {
    const s = newGame(42);
    s.gold = D(botes.baseCost);
    const before = stats(s).stepsPerSec;
    expect(buy(s, world, 'speed')).toBe(true);
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

describe('routes', () => {
  /** BFS from camp over the first `k` cells of the order: they must all be reachable (one connected patch). */
  const connected = (w: World, k: number) => {
    const n = totalCells(w);
    const seen = new Uint8Array(n);
    const queue = [w.order[0]];
    seen[w.order[0]] = 1;
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
        if (!seen[j] && w.rank[j] < k) { seen[j] = 1; queue.push(j); }
      }
    }
    return found === k;
  };
  /** Plays until the map is done, switching route (and level) at the given rings. Returns cells of items and deposits seen. */
  const play = (w: World, switches: [number, RouteId, number][], dt = 0.1) => {
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 30, cargo: 20, radar: 2, explorers: 2 });
    s.routes = ROUTES.map((r) => r.id);
    const items = new Set<number>();
    let specials = 0;
    let completed = 0;
    for (let t = 0; t < 100000 && !isComplete(s, w); t += dt) {
      const next = switches.find(([ring]) => s.ring >= ring && s.plan.every(([r]) => r < ring));
      if (next) { chooseRoute(s, next[1]); s.routeLevels[next[1]] = next[2]; }
      const e = tick(s, w, dt);
      if (e.completed) completed++;
      specials += e.specials.length;
      for (const i of e.items) { expect(items.has(i)).toBe(false); items.add(i); }
    }
    tick(s, w, 1);
    return { s, items, specials, completed };
  };

  it('every route keeps the explored area connected, and keeps what was already explored', () => {
    const plans: PlanEntry[] = [
      ...ROUTES.flatMap((r) => [[10, r.id, 0], [10, r.id, ROUTE_MAX_LEVEL]] as PlanEntry[]),
      ...(['north', 'south', 'east', 'west', 'random'] as RouteId[]).map((id) => [10, id] as PlanEntry), // legacy
    ];
    for (const entry of plans) {
      const w = createWorld(42, SIZE);
      const before = w.order.slice(0, w.rings[10]);
      applyPlan(w, [entry]);
      expect(w.order.slice(0, w.rings[10])).toEqual(before);
      for (const k of [w.rings[10] + 50, w.rings[10] + 900, 6000, 12000]) expect(connected(w, k)).toBe(true);
    }
  });

  it('a legacy directional route (old saves) still pushes that way first', () => {
    const w = createWorld(42, SIZE);
    applyPlan(w, [[3, 'north']]);
    let dy = 0;
    for (let r = w.rings[3]; r < w.rings[3] + 1500; r++) dy += Math.floor(w.order[r] / SIZE) - w.cy;
    expect(dy).toBeLessThan(0); // north is up (smaller y)
  });

  it('the random route grows from the edge of what is explored, differently at each switch', () => {
    const w = createWorld(42, SIZE);
    const a = w.rings[20];
    applyPlan(w, [[20, 'random', 0]]);
    const near = (i: number) => {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const j = (y + dy) * SIZE + x + dx;
        if (j >= 0 && j < SIZE * SIZE && w.rank[j] < a) return true;
      }
      return false;
    };
    for (let r = w.rings[20]; r < w.rings[21]; r++) expect(near(w.order[r])).toBe(true);
    // Another switch at a different ring rolls new dice.
    const other = createWorld(42, SIZE);
    applyPlan(other, [[21, 'random', 0]]);
    const b = other.rings[22];
    expect(Array.from(other.order.subarray(b, b + 300))).not.toEqual(Array.from(w.order.subarray(b, b + 300)));
  });

  it('switching routes mid-game still collects every item, deposit and bluetreri exactly once', () => {
    const w = createWorld(42, SIZE);
    const { s, items, specials, completed } = play(w, [[10, 'trail', 0], [25, 'random', 1], [40, 'random', 3], [55, 'survey', 4]]);
    expect(isComplete(s, w)).toBe(true);
    // Each pick takes over at the start of the next ring.
    expect(s.plan).toEqual([[11, 'trail', 0], [26, 'random', 1], [41, 'random', 3], [56, 'survey', 4]]);
    expect(completed).toBe(1);
    expect(s.doneAt).toBeGreaterThan(0);
    expect(items.size).toBe(w.itemRanks.length);
    expect(specials).toBe(w.special.reduce((a, b) => a + b, 0));
    expect(s.totalGold.toNumber() / w.goldPrefix[totalCells(w)]).toBeCloseTo(1, 6);
    // Loading the game rebuilds the same order from the plan.
    const again = createWorld(42, SIZE);
    applyPlan(again, s.plan);
    expect(again.order).toEqual(w.order);
  });

  it('with a route switch, one long tick still gives the same as many short ones', () => {
    const wa = createWorld(42, SIZE);
    const wb = createWorld(42, SIZE);
    const a = newGame(42);
    const b = newGame(42);
    for (const s of [a, b]) {
      Object.assign(s.upgrades, { speed: 12, explorers: 1, radar: 2 });
      s.routes.push('prospect');
      s.route = 'prospect';
      s.routeLevels.prospect = 2;
    }
    tick(a, wa, 600);
    for (let k = 0; k < 6000; k++) tick(b, wb, 0.1);
    expect(a.plan).toEqual(b.plan);
    expect(wa.order).toEqual(wb.order);
    expect(a.ring).toBe(b.ring);
    expect(a.items).toEqual(b.items);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 3);
  });

  it('routes are unlocked with bluetreri and items, and levelled up', () => {
    const s = newGame(1);
    expect(canUnlockRoute(s, 'random')).toBe(false);
    expect(chooseRoute(s, 'random')).toBe(false);
    expect(unlockRoute(s, 'north')).toBe(false); // withdrawn
    s.gold = D(1000);
    s.items.page = 8;
    expect(unlockRoute(s, 'random')).toBe(true);
    expect(s.items.page).toBe(5);
    expect(s.gold.toNumber()).toBe(700);
    expect(chooseRoute(s, 'random')).toBe(true);
    expect(s.route).toBe('random');
    expect(unlockRoute(s, 'random')).toBe(false);
    // Levels: bluetreri x ROUTE_LEVEL_GROWTH and items x level each time, up to ROUTE_MAX_LEVEL.
    expect(routeUpgradeCost(s, 'random')).toEqual({ gold: 400, items: { page: 2 } });
    expect(upgradeRoute(s, 'random')).toBe(true);
    expect(routeLevel(s, 'random')).toBe(1);
    expect(s.gold.toNumber()).toBe(300);
    expect(routeUpgradeCost(s, 'random')).toEqual({ gold: 1600, items: { page: 4 } });
    expect(upgradeRoute(s, 'random')).toBe(false);
    s.gold = D(1e9);
    s.items.page = 1000;
    while (upgradeRoute(s, 'random'));
    expect(routeLevel(s, 'random')).toBe(ROUTE_MAX_LEVEL);
    expect(routeUpgradeCost(s, 'random')).toBeNull();
    expect(upgradeRoute(s, 'trail')).toBe(false); // locked
  });

  it('better routes cost more to unlock and to level up', () => {
    for (let k = 1; k < ROUTES.length; k++) {
      if (ROUTES[k].id === 'circular') continue; // the free starting one
      const prev = ROUTES[k - 1].id === 'circular' ? ROUTES[k - 2] : ROUTES[k - 1];
      expect(ROUTES[k].gold).toBeGreaterThan(prev.gold);
    }
    for (let k = 1; k < ROUTES.length; k++) expect(ROUTES[k].levelGold).toBeGreaterThan(ROUTES[k - 1].levelGold);
  });

  it('a new level of the route in use takes over at the next ring', () => {
    const w = createWorld(42, SIZE);
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 20, explorers: 1 });
    s.gold = D(1e6);
    s.items.page = 100;
    expect(upgradeRoute(s, 'circular')).toBe(true);
    const ring = s.ring;
    while (s.ring === ring) tick(s, w, 0.5);
    expect(s.plan).toEqual([[s.ring, 'circular', 1]]);
  });
});
