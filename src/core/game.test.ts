import { describe, expect, it } from 'vitest';
import { newBot, newGame as freshGame, type GameState } from './state';
import { canPrint, printLore, loreFound, routePace, chooseDig, digPath, isDug, setHaul, canClaim, claimGoal, goalReached, goalTarget, goalValue, build, canBuild, frontier, roverLevelNeeded, buy, canCraft, canUnlockRoute, carried, chooseRoute, costOf, craft, explored, explorerLevel, levelOf, routeLevelNeeded, workLevelNeeded, fromLegacy, homeSpeed, detourPlan, isComplete, itemsCollected, itemsOnMap, itemsSpent, libraryShare, routeItems, workCost, recountItems, nextWorkCost, progress, routeLevel, routeUpgradeCost, setZoom, stats, tick, unlockRoute, upgradeRoute } from './game';
import { evolveWeather, stormFactor, weatherFactor } from './weather';
import { SCOUT_SHARE, UPGRADES, type HaulPick, type RoverKind } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { D } from './decimal';
import { fmt } from './format';
import { applyPlan, createWorld, sectorAt, goldBetween, kingDistance, pathCells, ringCount, stepsAt, totalCells, totalSteps, unlockAt, zoomFraction, type PlanEntry, type World } from './world';
import { ROUTE_MAX_LEVEL, ROUTE_PACE_LEVEL, ROUTES, type RouteId } from '../content/routes';
import { WORKS, WORKS_MAX } from '../content/collection';

// Small map so the tests run fast (the real one is MAP_SIZE).
const SIZE = 128;
const world = createWorld(42, SIZE);
const botes = UPGRADES.find((u) => u.id === 'speed')!;

/** A full-size map (the library's prices are set for real maps). */
let big: World | undefined;
const fullWorld = () => (big ??= createWorld(7));

/** Most tests share one world: they play on the starting circular order (a new game's Random would re-sort that world
 *  at its first ring). Route tests use `freshGame` and their own worlds. */
const newGame = (seed?: number) => {
  const s = freshGame(seed);
  s.routes.push('circular');
  chooseRoute(s, 'circular');
  return s;
};

/** Adds rovers of these kinds (free and ready to work, as `build` leaves them once paid for). */
const crew = (s: GameState, ...kinds: RoverKind[]) => {
  for (const k of kinds) s.bots.push(newBot(k === 'hauler' ? 'idle' : 'out', 0, s.playTime, k));
  return s;
};

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

  it('scraps of lore sit in empty cells of their own draw and are found as the Scout reveals them', () => {
    const big = fullWorld();
    expect(big.loreCells.length).toBeGreaterThan(300); // ~1/1500 of the solid ground of a 1024² map
    for (const c of big.loreCells) {
      expect(big.lore[c]).toBeGreaterThan(0);
      expect(big.item[c] + big.special[c]).toBe(0);
    }
    const s = newGame(42);
    expect(loreFound(s, world).length).toBe(0);
    Object.assign(s.upgrades, { speed: 14, cargo: 3 });
    let before = 0;
    for (let k = 0; k < 400; k++) {
      tick(s, world, 1);
      const found = loreFound(s, world);
      expect(found.length).toBeGreaterThanOrEqual(before);
      before = found.length;
    }
    const found = loreFound(s, world);
    expect(found.length).toBeGreaterThan(0);
    const p = progress(s, world);
    // Every scrap behind the ring under way is found; none beyond it.
    world.loreCells.forEach((c, k) => {
      if (world.rank[c] < p.a) expect(found).toContain(k);
      if (world.rank[c] >= p.b) expect(found).not.toContain(k);
    });
    expect(goalValue(s, world, 'archivist')).toBe(found.length);
    // The Library's machine prints each scrap found once; none that is not found yet.
    const unseen = world.loreCells.findIndex((_, k) => !found.includes(k));
    expect(canPrint(s, world, unseen)).toBe(false);
    expect(printLore(s, world, found[0])).toBe(true);
    expect(printLore(s, world, found[0])).toBe(false);
    expect(s.printed).toEqual([found[0]]);
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
    expect(s.gold.toNumber() + carried(s)).toBeCloseTo(goldBetween(world, 0, explored(s, world)) * SCOUT_SHARE); // (the Scout's share)
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

  it('the Miner digs out what the Scout revealed, behind it, and waits when it catches up', () => {
    const s = newGame(42);
    s.upgrades.speed = 12;
    s.upgrades.cargo = 10;
    crew(s, 'miner');
    Object.assign(s.bots[1].up, { drill: 30, speed: 10 }); // fast: it catches up
    let waited = 0;
    let dug = 0;
    for (let k = 0; k < 20000 && explored(s, world) < 3000; k++) {
      tick(s, world, 0.2);
      expect(s.dug).toBeLessThanOrEqual(frontier(s, world) + 1e-9);
      expect(s.dug).toBeGreaterThanOrEqual(dug);
      dug = s.dug;
      if (s.bots[1].trip === 'explore' && s.bots[1].walked === 1) waited++;
    }
    expect(s.dug).toBeGreaterThan(1000);
    expect(waited).toBeGreaterThan(0);
    expect(s.bots[1].log.trips).toBeGreaterThan(0);
  });

  it('one long tick gives the same as many short ones (exact offline)', () => {
    const a = newGame(42);
    const b = newGame(42);
    for (const s of [a, b]) {
      Object.assign(s.upgrades, { speed: 12, radar: 2, tyres: 2, body: 1, cargo: 3 });
      crew(s, 'miner', 'hauler');
    }
    tick(a, world, 900);
    for (let k = 0; k < 9000; k++) tick(b, world, 0.1);
    expect(a.weather.epoch).toBeGreaterThan(0); // the sky changed on the way
    expect(a.fetched).toEqual(b.fetched);
    expect(a.items).toEqual(b.items);
    expect(a.ring).toBe(b.ring);
    expect(a.dug).toBeCloseTo(b.dug, 3);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 3);
    expect(a.bots[2].log.trips).toBeGreaterThan(0); // the Hauler did some runs
    a.bots.forEach((bot, j) => {
      expect(bot.trip).toBe(b.bots[j].trip);
      expect(bot.prog).toBeCloseTo(b.bots[j].prog, 3);
      expect(bot.cargo).toBeCloseTo(b.bots[j].cargo, 3);
    });
  });

  it('with dig order and Hauler policies, one long tick still gives the same as many short ones', () => {
    const a = newGame(42);
    const b = newGame(42);
    for (const s of [a, b]) {
      Object.assign(s.upgrades, { speed: 12, radar: 2, tyres: 2, cargo: 3 });
      Object.assign(s, { digOrder: 'rich', digPick: 'rich', haulAt: 0.3, haulPick: 'miner' });
      crew(s, 'miner', 'hauler');
    }
    tick(a, world, 900);
    for (let k = 0; k < 9000; k++) tick(b, world, 0.1);
    expect(a.dug).toBeGreaterThan(0);
    expect(a.dug).toBeCloseTo(b.dug, 3);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 3);
    expect(a.items).toEqual(b.items);
    a.bots.forEach((bot, j) => {
      expect(bot.trip).toBe(b.bots[j].trip);
      expect(bot.cargo).toBeCloseTo(b.bots[j].cargo, 3);
    });
  });

  it('richest first, the Miner digs finished rings from the best cells down; a new order waits for the next ring', () => {
    const s = newGame(42);
    s.upgrades.speed = 12;
    s.upgrades.cargo = 10;
    crew(s, 'miner');
    Object.assign(s.bots[1].up, { drill: 30, speed: 10 });
    chooseDig(s, world, 'rich');
    expect(s.digOrder).toBe('rich'); // it has not started digging: right away
    let last = Infinity;
    let k0 = -1;
    for (let k = 0; k < 20000 && explored(s, world) < 3000; k++) {
      tick(s, world, 0.2);
      expect(s.dug).toBeLessThanOrEqual(world.rings[s.ring] + 1e-9); // only finished rings
      const d = digPath(s, world);
      if (d.k !== k0) { k0 = d.k; last = Infinity; }
      const done = Math.floor(s.dug - d.lo + 1e-9);
      if (done > 0 && done < d.hi - d.lo) {
        const v = world.value[world.order[d.seq![done - 1]]];
        expect(v).toBeLessThanOrEqual(last);
        last = v;
        expect(isDug(s, world, d.seq![done - 1])).toBe(true);
        expect(isDug(s, world, d.seq![done])).toBe(false);
      }
    }
    expect(s.dug).toBeGreaterThan(500);
    // Mid-ring, a new order is only picked; it takes over when the next ring starts.
    let k = 0;
    while (s.dug <= world.rings[digPath(s, world).k] + 1e-9 && k++ < 1000) tick(s, world, 0.05);
    chooseDig(s, world, 'follow');
    expect(s.digOrder).toBe('rich');
    expect(s.digPick).toBe('follow');
    const ring = digPath(s, world).k;
    while (digPath(s, world).k === ring && k++ < 100000) tick(s, world, 0.2);
    expect(s.digOrder).toBe('follow');
  });

  it('the Hauler goes to the rover the player put first, once it is over the threshold', () => {
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 12, cargo: 2 });
    crew(s, 'miner', 'hauler');
    setHaul(s, 0.3, 'scout');
    expect(s.haulAt).toBe(0.3);
    setHaul(s, 0.42, 'scout');
    expect(s.haulAt).toBe(0.3); // not one of the levels
    // Each time it leaves camp: to a rover over the threshold, and to the one put first whenever that one is over it
    // (a hold can still gain a little in the rest of the tick, hence the margin).
    const runs = (pick: HaulPick) => {
      const t = newGame(42);
      Object.assign(t.upgrades, { speed: 12, cargo: 2 });
      crew(t, 'miner', 'hauler');
      setHaul(t, 0.3, pick);
      const first = pick === 'scout' ? 0 : pick === 'miner' ? 1 : -1;
      const frac = (j: number) => t.bots[j].cargo / stats(t, t.bots[j]).cargo;
      const to = [0, 0];
      for (let k = 0; k < 4000; k++) {
        const was = t.bots[2].trip;
        tick(t, world, 0.2);
        const h = t.bots[2];
        if (was === 'idle' && h.trip === 'out') {
          expect(frac(h.target)).toBeGreaterThanOrEqual(0.3 - 1e-6);
          const working = first >= 0 && (t.bots[first].trip === 'explore' || t.bots[first].trip === 'detour');
          if (working && h.target !== first) expect(frac(first)).toBeLessThan(0.3 + 0.05);
          to[h.target]++;
        }
      }
      return to;
    };
    const scout = runs('scout');
    const miner = runs('miner');
    expect(scout[0]).toBeGreaterThan(2);
    expect(miner[1]).toBeGreaterThan(2);
  });

  it('rovers are built one of each, in order, to the Scout\'s standard; parts are per rover and stay exact', () => {
    const a = newGame(42);
    const b = newGame(42);
    for (const s of [a, b]) {
      Object.assign(s.upgrades, { speed: 12, cargo: 4 });
      Object.assign(s.bots[0].up, { tyres: 3, radar: 2 });
      s.gold = D(1e9);
    }
    expect(canBuild(a, world, 'hauler')).toBe(false); // the Miner comes first
    expect(canBuild(a, world, 'scout')).toBe(false);
    expect(canBuild(a, world, 'miner')).toBe(false); // explorer level
    while (levelOf(a, world) < roverLevelNeeded(world, 'miner')) { tick(a, world, 1); tick(b, world, 1); }
    expect(build(a, world, 'miner')).toBe(true);
    expect(build(b, world, 'miner')).toBe(true);
    expect(build(a, world, 'miner')).toBe(false); // one of each
    expect(a.bots[1].kind).toBe('miner');
    expect(a.bots[1].trip).toBe('out');
    expect(a.bots[1].up.tyres).toBe(3); // the Scout's level
    expect(a.bots[1].up.radar).toBe(0); // a Miner has no radar
    expect(stats(a, a.bots[1]).radar).toBe(0);
    expect(buy(a, world, 'radar', 1, 1)).toBe(false);
    expect(buy(a, world, 'drill', 1, 0)).toBe(false); // nor a Scout a drill
    const g0 = a.gold.toNumber();
    expect(buy(a, world, 'speed', 1, 1)).toBe(true);
    expect(a.gold.toNumber()).toBeCloseTo(g0 - costOf(botes, 12).toNumber(), 3); // its own level: 12 from the fleet + 0
    expect(a.bots[0].up.speed).toBe(0);
    buy(b, world, 'speed', 1, 1);
    for (const s of [a, b]) { buy(s, world, 'drill', 3, 1); buy(s, world, 'tyres', 2, 0); }
    tick(a, world, 600);
    for (let k = 0; k < 6000; k++) tick(b, world, 0.1);
    expect(a.ring).toBe(b.ring);
    expect(a.dug).toBeGreaterThan(0);
    expect(a.dug).toBeCloseTo(b.dug, 2);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 2);
    a.bots.forEach((bot, j) => {
      expect(bot.trip).toBe(b.bots[j].trip);
      expect(bot.prog).toBeCloseTo(b.bots[j].prog, 2);
    });
  });

  type Policy = Partial<Pick<GameState, 'digPick' | 'haulAt' | 'haulPick'>>;
  for (const [kinds, radar, pol] of [[[], 0, {}], [['miner'], 0, {}], [[], 2, {}], [['miner', 'hauler'], 0, {}], [['miner', 'hauler'], 4, {}],
    [['miner'], 0, { digPick: 'rich' }], [['miner', 'hauler'], 2, { digPick: 'rich', haulAt: 0.3, haulPick: 'miner' }], [['miner', 'hauler'], 0, { haulAt: 0.8, haulPick: 'scout' }]] as [RoverKind[], number, Policy][]) {
    it(`Scout${kinds.map((k) => ` + ${k}`).join('')}, radar ${radar}${Object.values(pol).map((v) => `, ${v}`).join('')}: deposits and items arrive exactly once, and all the bluetreri once dug out`, () => {
      const s = newGame(42);
      Object.assign(s.upgrades, { speed: 40, cargo: 20, drill: 10, radar });
      Object.assign(s, pol, pol.digPick ? { digOrder: pol.digPick } : {});
      crew(s, ...kinds);
      const ev = run(s, 40000);
      expect(isComplete(s, world)).toBe(true);
      expect(explored(s, world)).toBeCloseTo(totalCells(world));
      expect(ev.specials).toBe(world.special.reduce((a, b) => a + b, 0));
      expect(ev.items.size).toBe(world.itemRanks.length);
      expect(s.items.page + s.items.note + s.items.photo).toBe(world.itemRanks.length);
      // The Scout scratches its share; the Miner digs out the rest.
      expect(s.totalGold.toNumber() / world.goldPrefix[totalCells(world)]).toBeCloseTo(kinds.includes('miner') ? 1 : SCOUT_SHARE, 6);
      expect(s.bots.every((b) => b.cargo === 0)).toBe(true);
    });
  }

  it('the Hauler picks up loads in the field, so the others keep working', () => {
    const play = (kinds: RoverKind[]) => {
      const s = newGame(42);
      Object.assign(s.upgrades, { speed: 12, cargo: 2 });
      crew(s, ...kinds);
      let waitedFull = 0;
      for (let k = 0; k < 3000; k++) {
        const before = s.bots.map((b) => b.trip);
        const h = s.bots[2];
        const coming = h?.trip === 'out' ? h.target : -1;
        tick(s, world, 0.2);
        // A rover the Hauler is driving to never drives to camp itself.
        if (coming >= 0 && h.trip === 'out') expect(before[coming] !== 'home' && s.bots[coming].trip === 'home').toBe(false);
        if (coming >= 0 && s.bots[coming].trip === 'explore' && s.bots[coming].cargo >= stats(s, s.bots[coming]).cargo * (1 - 1e-9)) waitedFull++;
      }
      return { s, waitedFull };
    };
    const alone = play(['miner']);
    const hauled = play(['miner', 'hauler']);
    const h = hauled.s.bots[2];
    expect(h.log.trips).toBeGreaterThan(3);
    expect(h.log.gold).toBeGreaterThan(0);
    expect(hauled.s.bots[0].log.trips).toBeLessThan(alone.s.bots[0].log.trips);
    expect(explored(hauled.s, world)).toBeGreaterThan(explored(alone.s, world));
    expect(hauled.s.totalGold.toNumber()).toBeGreaterThan(alone.s.totalGold.toNumber());
    expect(hauled.waitedFull).toBeGreaterThan(0);
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

  it('a detour walks at exploring pace and mines its path; a full hold sends the rover home and leaves the item', () => {
    const w = createWorld(42, SIZE);
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 30, radar: 4, drill: 10 });
    crew(s, 'miner');
    const items = new Set<number>();
    let specials = 0;
    let gaveUp = 0;
    let checked = false;
    for (let t = 0; t < 200000 && !isComplete(s, w); t += 0.25) {
      const before = s.bots.map((b) => [b.trip, b.target] as const);
      const e = tick(s, w, 0.25);
      specials += e.specials.length;
      for (const i of e.items) { expect(items.has(i)).toBe(false); items.add(i); }
      s.bots.forEach((b, j) => {
        if (before[j]?.[0] === 'detour' && b.trip === 'home') {
          gaveUp++;
          // The item was picked up just before the hold filled, or it is left for later.
          const cell = w.order[w.itemRanks[before[j][1]]];
          if (!items.has(cell)) expect(s.fetched).not.toContain(before[j][1]);
        }
        // A detour is as long as exploring its cells: one cell of rough ground costs more than one step.
        if (!checked && b.trip === 'detour') {
          const plan = detourPlan(w, stats(s).grip, b.from, b.target);
          expect(b.travelLen).toBeCloseTo(plan.total, 9);
          expect(plan.out).toBeGreaterThanOrEqual(plan.path.length - 1);
          checked = true;
        }
      });
    }
    expect(isComplete(s, w)).toBe(true);
    expect(checked).toBe(true);
    expect(gaveUp).toBeGreaterThan(0);
    expect(s.mined).toEqual([]);
    // Every item and deposit exactly once, mined on detours or explored. Bluetreri is never counted twice; what does
    // not fit in a hold that fills on a detour is lost (the exact count, with no overflow, is in the routes tests).
    expect(items.size).toBe(w.itemRanks.length);
    expect(specials).toBe(w.special.reduce((a, b) => a + b, 0));
    // Each rover's record adds up to the whole game.
    const sum = (f: (b: (typeof s.bots)[number]) => number) => s.bots.reduce((x, b) => x + f(b), 0);
    expect(sum((b) => b.log.gold)).toBeCloseTo(s.totalGold.toNumber(), 6);
    expect(sum((b) => b.log.items)).toBe(items.size);
    expect(s.bots[0].log.cells).toBe(totalCells(w)); // every cell explored exactly once
    expect(s.bots[1].log.cells).toBe(totalCells(w)); // and dug out exactly once
    expect(sum((b) => b.log.gaveUp)).toBeGreaterThanOrEqual(gaveUp); // (several can happen within one tick)
    const share = s.totalGold.toNumber() / w.goldPrefix[totalCells(w)];
    expect(share).toBeLessThanOrEqual(1 + 1e-9);
    expect(share).toBeGreaterThan(0.85);
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
    s.upgrades.speed = 40;
    s.upgrades.cargo = 20;
    s.legacyWalked = 2000;
    fromLegacy(s, world);
    expect(s.legacyWalked).toBeUndefined();
    expect(s.ring).toBeGreaterThan(0);
    expect(s.bots.length).toBe(1);
    expect(explored(s, world)).toBeGreaterThan(0);
    const ev = run(s, 100000);
    expect(isComplete(s, world)).toBe(true);
    expect(ev.deposited).toBeGreaterThan(0);
  });

  it('with enough items a work is made, and the next costs more', () => {
    const s = newGame(42);
    const big = fullWorld();
    expect(canCraft(s, big, 'book')).toBe(false);
    s.ring = ringCount(big); // every explorer level reached
    const first = nextWorkCost(s, big, 'book');
    s.items.page = first;
    const speed = stats(s).speed;
    expect(craft(s, big, 'book')).toBe(true);
    expect(s.items.page).toBe(0);
    expect(s.works.book).toBe(1);
    expect(stats(s).speed).toBeGreaterThan(speed);
    expect(nextWorkCost(s, big, 'book')).toBeGreaterThan(first);
  });

  it('each collection ends at WORKS_MAX works, and the library share reaches 100%', () => {
    const s = newGame(42);
    s.items = { page: 1e9, note: 1e9, photo: 1e9 };
    s.ring = ringCount(world);
    for (const wd of WORKS) while (craft(s, world, wd.id));
    for (const wd of WORKS) expect(s.works[wd.id]).toBe(WORKS_MAX);
    expect(libraryShare(s)).toBe(1);
    expect(libraryShare(s, 'book')).toBe(1);
  });

  it('a save that paid older prices gets its items recounted once (never fewer)', () => {
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 40, cargo: 20 });
    run(s, 100000);
    expect(isComplete(s, world)).toBe(true);
    const got = itemsCollected(s, world);
    expect(got.page + got.note + got.photo).toBe(world.itemRanks.length);
    // As if two books and a record had been made at dearer prices and everything else had gone.
    s.works.book = 2;
    s.works.cd = 1;
    s.items = { page: 0, note: 0, photo: 0 };
    s.recount = true;
    recountItems(s, world);
    expect(s.recount).toBeUndefined();
    const spent = itemsSpent(s, world);
    expect(s.items.page).toBe(got.page - spent.page);
    expect(s.items.note).toBe(got.note - spent.note);
    expect(s.items.photo).toBe(got.photo - spent.photo);
    s.items.page = 1e6;
    s.recount = true;
    recountItems(s, world);
    expect(s.items.page).toBe(1e6);
    recountItems(s, world); // only once
    expect(s.items.page).toBe(1e6);
  });

  it('every map holds enough items to finish the whole library and every route and level', () => {
    // Large seeds (like a new game's) hide far fewer pages than small ones: prices follow each map.
    for (const w of [fullWorld(), createWorld(123456789)]) {
      const have = itemsOnMap(w);
      const routes = routeItems();
      for (const wd of WORKS) {
        let need = routes[wd.item];
        for (let k = 0; k < WORKS_MAX; k++) need += workCost(w, wd.id, k);
        expect(need).toBeLessThanOrEqual(0.85 * have[wd.item]);
        for (let k = 1; k < WORKS_MAX; k++) expect(workCost(w, wd.id, k)).toBeGreaterThanOrEqual(workCost(w, wd.id, k - 1));
      }
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
    const before = stats(s).speed;
    expect(buy(s, world, 'speed')).toBe(true);
    expect(s.gold.toNumber()).toBe(0);
    expect(stats(s).speed).toBeGreaterThan(before);
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
    expect(fmt(4.24e-108)).toBe('0');
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
    Object.assign(s.upgrades, { speed: 30, cargo: 20, radar: 2, drill: 10 });
    crew(s, 'miner', 'hauler');
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
      [10, [['prospect', 2], ['circular', 0], ['random', 0]]], // one route per rover slice
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

  it('a plan from an old save with one route per rover slice still replays; the Scout then follows its own', () => {
    const plan: PlanEntry[] = [[5, 'circular', 0], [12, [['circular', 0], ['prospect', 0], ['random', 0]]]];
    const w = createWorld(42, SIZE);
    applyPlan(w, plan);
    // Loading the game rebuilds the same order from the plan.
    const again = createWorld(42, SIZE);
    applyPlan(again, plan);
    expect(again.order).toEqual(w.order);
    // Each slice follows its route: the Prospector's slice is ordered differently from a plain circular one.
    const plain = createWorld(42, SIZE);
    applyPlan(plain, [[5, 'circular', 0], [12, 'circular', 0]]);
    const from = w.rings[12];
    const slice = (x: World, k: number) => Array.from(x.order.subarray(from)).filter((i) => sectorAt(x, i, 3) === k).slice(0, 400);
    expect(slice(w, 1)).not.toEqual(slice(plain, 1));
    // A game on that plan (ring 12 under way) goes on with one Scout and its own route from the next ring.
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 30, cargo: 20, radar: 2, drill: 10 });
    crew(s, 'miner');
    s.routes = ROUTES.map((r) => r.id);
    s.plan = plan.map((e) => [...e] as PlanEntry);
    s.ring = 12;
    s.dug = from;
    chooseRoute(s, 'trail');
    const items = new Set<number>();
    for (let t = 0; t < 100000 && !isComplete(s, w); t += 0.1) {
      const e = tick(s, w, 0.1);
      for (const i of e.items) { expect(items.has(i)).toBe(false); items.add(i); }
    }
    expect(isComplete(s, w)).toBe(true);
    expect(s.plan.at(-1)).toEqual([13, 'trail', 0]);
    expect(items.size).toBe(w.itemRanks.filter((r) => r >= from).length);
    expect(s.totalGold.toNumber() / (w.goldPrefix[totalCells(w)] - w.goldPrefix[from])).toBeCloseTo(1, 6);
  });

  it('with a route switch, one long tick still gives the same as many short ones', () => {
    const wa = createWorld(42, SIZE);
    const wb = createWorld(42, SIZE);
    const a = newGame(42);
    const b = newGame(42);
    for (const s of [a, b]) {
      Object.assign(s.upgrades, { speed: 12, radar: 2 });
      crew(s, 'miner', 'hauler');
      s.routes.push('prospect');
      chooseRoute(s, 'prospect');
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

  it('a new game starts on Random, with no levels, and the rest are upgrades', () => {
    const s = freshGame(1);
    const rw = createWorld(1, SIZE);
    expect(s.routes).toEqual(['random']);
    expect(s.route).toBe('random');
    expect(routeUpgradeCost(s, 'random')).toBeNull();
    s.gold = D(1e9);
    s.items.page = 1000;
    expect(upgradeRoute(s, rw, 'random')).toBe(false);
    // Its first ring after camp already follows Random.
    const w = createWorld(42, SIZE);
    const g = freshGame(42);
    while (g.ring < 2) tick(g, w, 0.5);
    expect(g.plan).toEqual([[1, 'random', 0]]);
  });

  it('routes are unlocked with bluetreri and items collected (not spent), and levelled up', () => {
    const s = freshGame(1);
    const rw = createWorld(1, SIZE);
    s.ring = ringCount(rw); // the whole map explored: every explorer level reached (and every item collected)
    expect(canUnlockRoute(s, rw, 'circular')).toBe(false);
    expect(chooseRoute(s, 'circular')).toBe(false);
    expect(unlockRoute(s, rw, 'north')).toBe(false); // withdrawn
    s.gold = D(1000);
    s.items.page = 8;
    expect(unlockRoute(s, rw, 'circular')).toBe(true);
    expect(s.items.page).toBe(8);
    expect(s.gold.toNumber()).toBe(920);
    expect(chooseRoute(s, 'circular')).toBe(true);
    expect(s.route).toBe('circular');
    expect(unlockRoute(s, rw, 'circular')).toBe(false);
    // Levels: bluetreri x ROUTE_LEVEL_GROWTH and items x level each time, up to ROUTE_MAX_LEVEL.
    s.gold = D(2000);
    expect(routeUpgradeCost(s, 'circular')).toEqual({ gold: 1500, items: { page: 3 } });
    expect(upgradeRoute(s, rw, 'circular')).toBe(true);
    expect(routeLevel(s, 'circular')).toBe(1);
    expect(s.gold.toNumber()).toBe(500);
    expect(routeUpgradeCost(s, 'circular')).toEqual({ gold: 5250, items: { page: 9 } }); // 3 + 6 collected in all
    expect(upgradeRoute(s, rw, 'circular')).toBe(false);
    s.gold = D(1e9);
    s.items.page = 1000;
    while (upgradeRoute(s, rw, 'circular'));
    expect(routeLevel(s, 'circular')).toBe(ROUTE_MAX_LEVEL);
    expect(s.items.page).toBe(1000); // nothing spent
    expect(routeUpgradeCost(s, 'circular')).toBeNull();
    expect(upgradeRoute(s, rw, 'trail')).toBe(false); // locked
  });

  it('routes and works need an explorer level', () => {
    const w = createWorld(1, SIZE);
    const s = freshGame(1);
    s.gold = D(1e12);
    s.items = { page: 1e6, note: 1e6, photo: 1e6 };
    expect(levelOf(s, w)).toBe(0);
    expect(canUnlockRoute(s, w, 'circular')).toBe(false);
    expect(canCraft(s, w, 'book')).toBe(false);
    // Requirements rise: each route and route level, and each work, asks for more.
    for (let k = 1; k < ROUTES.length; k++) expect(ROUTES[k].minLevel).toBeGreaterThan(ROUTES[k - 1].minLevel);
    const big = fullWorld();
    for (let k = 1; k < WORKS_MAX; k++) expect(workLevelNeeded(big, k)).toBeGreaterThanOrEqual(workLevelNeeded(big, k - 1));
    // The last work is possible before the top level, so the library can be finished before the map.
    expect(workLevelNeeded(big, WORKS_MAX - 1)).toBeLessThan(explorerLevel(0, totalCells(big)).max);
    s.ring = ringCount(w);
    expect(canUnlockRoute(s, w, 'circular')).toBe(true);
    expect(canCraft(s, w, 'book')).toBe(true);
  });

  it('route items are a requirement on what was collected, not on what is left', () => {
    const s = freshGame(1);
    const rw = createWorld(1, SIZE);
    s.gold = D(1e12);
    s.routes.push('circular');
    while (levelOf(s, rw) < routeLevelNeeded(rw, 'trail')) tick(s, rw, 5);
    const trail = ROUTES.find((r) => r.id === 'trail')!;
    s.items = { page: 0, note: 0, photo: 0 }; // all spent on works
    const got = itemsCollected(s, rw);
    const enough = Object.entries(trail.items).every(([k, n]) => got[k as keyof typeof got] >= (n ?? 0));
    expect(canUnlockRoute(s, rw, 'trail')).toBe(enough);
    if (enough) {
      expect(unlockRoute(s, rw, 'trail')).toBe(true);
      expect(s.items).toEqual({ page: 0, note: 0, photo: 0 });
    }
  });

  it('the route under way speeds up the Scout and the Miner (not the Hauler), more the better and the higher its level', () => {
    const s = newGame(42);
    crew(s, 'miner', 'hauler');
    const base = s.bots.map((b) => stats(s, b).speed);
    s.plan = [[1, [['survey', 2]]]];
    const pace = routePace('survey', 2);
    expect(pace).toBeCloseTo(ROUTES.find((r) => r.id === 'survey')!.pace * ROUTE_PACE_LEVEL ** 2);
    expect(stats(s, s.bots[0]).speed).toBeCloseTo(base[0] * pace / routePace('circular', 0));
    expect(stats(s, s.bots[1]).speed).toBeCloseTo(base[1] * pace / routePace('circular', 0));
    expect(stats(s, s.bots[2]).speed).toBeCloseTo(base[2]);
    const main = ROUTES.filter((r) => r.id !== 'scavenge'); // (the item route trades pace for items)
    for (let k = 1; k < main.length; k++) expect(main[k].pace).toBeGreaterThan(main[k - 1].pace);
  });

  it('better routes cost more to unlock and to level up', () => {
    for (let k = 1; k < ROUTES.length; k++) expect(ROUTES[k].gold).toBeGreaterThan(ROUTES[k - 1].gold);
    for (let k = 2; k < ROUTES.length; k++) expect(ROUTES[k].levelGold).toBeGreaterThan(ROUTES[k - 1].levelGold);
  });

  it('a new level of the route in use takes over at the next ring', () => {
    const w = createWorld(42, SIZE);
    const rw = w;
    const s = newGame(42);
    while (levelOf(s, w) < routeLevelNeeded(w, 'circular', 1) || itemsCollected(s, w).page < 3) tick(s, w, 1);
    Object.assign(s.upgrades, { speed: 20 });
    s.gold = D(1e6);
    expect(upgradeRoute(s, rw, 'circular')).toBe(true);
    const ring = s.ring;
    while (s.ring === ring) tick(s, w, 0.5);
    expect(s.plan).toEqual([[s.ring, 'circular', 1]]);
  });
});

describe('goals', () => {
  it('a reached tier is claimed once and multiplies its stat; five tiers at most', () => {
    const s = newGame(42);
    const speed0 = stats(s).speed;
    expect(canClaim(s, world, 'cartographer')).toBe(false);
    expect(claimGoal(s, world, 'cartographer')).toBe(false);
    s.upgrades.speed = 20;
    while (goalValue(s, world, 'cartographer') < goalTarget(world, 'cartographer', 1)) tick(s, world, 1);
    expect(goalReached(s, world, 'cartographer')).toBeGreaterThanOrEqual(2);
    const before = stats(s).speed;
    expect(claimGoal(s, world, 'cartographer')).toBe(true);
    expect(stats(s).speed).toBeCloseTo(before * 1.05, 9);
    expect(claimGoal(s, world, 'cartographer')).toBe(true);
    expect(s.goals.cartographer).toBe(2);
    expect(stats(s).speed / speed0).toBeGreaterThan(1);
    // Tycoon: bluetreri earned; its tiers raise the bluetreri multiplier.
    s.totalGold = D(1e9);
    for (let k = 0; k < 5; k++) expect(claimGoal(s, world, 'tycoon')).toBe(true);
    expect(claimGoal(s, world, 'tycoon')).toBe(false);
    expect(stats(s).loot).toBeCloseTo(1.05 ** 5, 9);
    // Engineer counts the part levels fitted on every rover.
    crew(s, 'miner');
    s.bots[1].up.drill = 7;
    expect(goalValue(s, world, 'engineer')).toBe(20 * 2 + 7);
  });

  it('every tier is reachable on a finished map', () => {
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 40, cargo: 20, drill: 10 });
    crew(s, 'miner');
    for (let t = 0; t < 40000 && !isComplete(s, world); t += 0.5) tick(s, world, 0.5);
    for (const id of ['cartographer', 'collector', 'excavator'] as const) expect(goalReached(s, world, id)).toBe(5);
  });
});

describe('explorer level', () => {
  it('grows exponentially and tops out with the whole map', () => {
    const total = 1024 * 1024;
    const a = explorerLevel(0, total);
    expect(a.level).toBe(0);
    expect(explorerLevel(10, total).level).toBe(1);
    expect(explorerLevel(13, total).level).toBe(2);
    const top = explorerLevel(total, total);
    expect(top.level).toBe(top.max);
    expect(top.frac).toBe(1);
    expect(explorerLevel(total - 1, total).level).toBe(top.max - 1);
    // Each level needs more cells than the one before, and progress stays within [0, 1].
    let prev = 0;
    let gap = 0;
    for (let c = 1; c < total; c = Math.ceil(c * 1.05)) {
      const l = explorerLevel(c, total);
      expect(l.level).toBeGreaterThanOrEqual(prev);
      expect(l.frac).toBeGreaterThanOrEqual(0);
      expect(l.frac).toBeLessThanOrEqual(1);
      if (l.level > prev && l.level < l.max) { expect(l.to - l.from).toBeGreaterThan(gap); gap = l.to - l.from; }
      prev = l.level;
    }
  });
});

describe('items at camp', () => {
  it('pages, notes and photos are the player\'s only once the rover unloads', () => {
    const w = createWorld(42, SIZE);
    const s = newGame(42);
    Object.assign(s.upgrades, { speed: 20 });
    crew(s, 'miner', 'hauler'); // (the Hauler carries the others' items too)
    let waited = false;
    for (let t = 0; t < 4000 && !(waited && s.bots.every((b) => b.found === 0)); t++) {
      tick(s, w, 0.5);
      const stock = s.items.page + s.items.note + s.items.photo;
      const bags = s.bots.reduce((a, b) => a + b.bag.reduce((x, y) => x + y, 0), 0);
      // Nothing is spent here: what is at camp plus what rovers carry is everything found.
      expect(stock + bags).toBe(s.bots.reduce((a, b) => a + b.log.items, 0));
      for (const b of s.bots) expect(b.found).toBe(b.bag.reduce((x, y) => x + y, 0));
      if (bags > 0) waited = true;
    }
    expect(waited).toBe(true);
  });
});
