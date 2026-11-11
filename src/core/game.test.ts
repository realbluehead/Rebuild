import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buy, canCraft, carried, costOf, craft, explored, fromLegacy, isComplete, nextWorkCost, setZoom, stats, tick } from './game';
import { UPGRADES } from '../content/upgrades';
import { TERRAINS, ZOOMS } from '../content/world';
import { D } from './decimal';
import { fmt } from './format';
import { createWorld, goldBetween, totalCells, totalSteps, unlockAt, zoomFraction } from './world';

// Mapa petit perquè els tests vagin de pressa (el de veritat és de MAP_SIZE).
const SIZE = 128;
const world = createWorld(42, SIZE);
const botes = UPGRADES.find((u) => u.id === 'speed')!;

describe('món', () => {
  it('reparteix pàgines, notes i fotos segons els pesos', () => {
    const counts = [0, 0, 0];
    for (const r of world.itemRanks) counts[world.item[world.order[r]] - 1]++;
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total / totalCells(world)).toBeGreaterThan(0.005);
    expect(counts[0] / total).toBeCloseTo(0.45, 1);
    expect(counts[1] / total).toBeCloseTo(0.2, 1);
    expect(counts[2] / total).toBeCloseTo(0.35, 1);
  });

  it('és determinista amb el mateix seed', () => {
    const other = createWorld(42, SIZE);
    expect(other.terrain).toEqual(world.terrain);
    expect(other.order).toEqual(world.order);
  });

  it("l'ordre és una permutació i comença al centre", () => {
    const seen = new Uint8Array(totalCells(world));
    for (const i of world.order) seen[i]++;
    expect(seen.every((v) => v === 1)).toBe(true);
    expect(world.order[0]).toBe(world.cy * SIZE + world.cx);
    for (let r = 0; r < 50; r++) expect(world.rank[world.order[r]]).toBe(r);
  });

  it('un robot només descobreix la casella contigua: si la següent és lluny, hi ha de caminar', () => {
    expect(world.steps[1]).toBe(1);
    let far = 0;
    for (let r = 1; r < totalCells(world); r++) {
      const a = world.order[r - 1];
      const b = world.order[r];
      const king = Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)));
      // Una casella contigua costa un pas per la seva rugositat; una de més lluny, un per casella de camí.
      expect(world.steps[r + 1] - world.steps[r]).toBeCloseTo(king * TERRAINS[world.terrain[b]].rough, 9);
      if (king > 1) far++;
    }
    expect(far).toBeGreaterThan(0);
    expect(totalSteps(world)).toBeGreaterThan(totalCells(world));
  });

  it('els terrenys rugosos costen més passos', () => {
    const rough = TERRAINS.map((t) => t.rough);
    expect(Math.min(...rough)).toBe(1);
    expect(Math.max(...rough)).toBeGreaterThan(2);
  });

  it('la zona explorada és sempre una sola taca connectada (sense illes)', () => {
    const n = totalCells(world);
    for (const explored of [2, 10, 77, 500, 1234, 4000, 9999, n - 100]) {
      // BFS des del campament (8 veïns) només per caselles ja explorades: les ha de trobar totes.
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

  it('la fracció de zoom creix fins a 1', () => {
    expect(zoomFraction(world, 0, 0)).toBe(0);
    expect(zoomFraction(world, 0, totalCells(world))).toBe(1);
    const at = unlockAt(world, 0);
    expect(zoomFraction(world, 0, at)).toBeGreaterThanOrEqual(0.8);
    expect(zoomFraction(world, 0, at - 1)).toBeLessThan(0.8);
  });
});

describe('joc', () => {
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

  it('els passos avancen proporcionalment al temps i el campament es descobreix al primer pas', () => {
    const s = newGame(42);
    tick(s, world, 10);
    expect(s.bots[0].prog).toBeCloseTo(stats(s).speed * 10);
    expect(explored(s, world)).toBeGreaterThan(0);
    // El bluetreri el porten els robots fins que el descarreguen al campament.
    expect(s.gold.toNumber() + carried(s)).toBeCloseTo(goldBetween(world, 0, explored(s, world)));
  });

  it('amb la bodega plena el robot torna al campament, descarrega i torna a sortir', () => {
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
    // Mentre va i ve no explora: com a molt, el tros de l'últim tick ja tornat a l'arc.
    expect(s.bots[0].prog).toBeGreaterThanOrEqual(prog - 1e-9);
    expect(s.bots[0].prog - prog).toBeLessThanOrEqual(stats(s).speed * 0.1 + 1e-9);
    expect(deposited).toBeCloseTo(cap, 6);
    expect(s.gold.toNumber()).toBeGreaterThanOrEqual(cap - 1e-6);
  });

  it('amb diversos robots, cadascun va i torna pel seu compte (no sincronitzats)', () => {
    const s = newGame(42);
    s.upgrades.explorers = 2;
    s.upgrades.speed = 12;
    let staggered = 0;
    for (let k = 0; k < 20000 && explored(s, world) < 3000; k++) {
      tick(s, world, 0.2);
      const trips = new Set(s.bots.map((b) => b.trip));
      if (s.bots.length === 3 && trips.size > 1) staggered++;
    }
    expect(s.bots.length).toBe(3);
    expect(staggered).toBeGreaterThan(50);
    // Cada robot té la seva càrrega.
    const cargos = s.bots.map((b) => b.cargo);
    expect(new Set(cargos.map((c) => c.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('un tick llarg dona el mateix que molts de curts (offline exacte)', () => {
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
    it(`amb ${robots} robot(s) i radar ${radar}, tot el bluetreri, els dipòsits i els objectes arriben exactament un cop`, () => {
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

  it('un robot comprat a mig anell comença a treballar a l\'anell següent', () => {
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
    expect(s.bots[1].trip).toBe('out'); // surt del campament
  });

  it('el radar porta els robots a buscar objectes dins la foscor, abans que s\'hi arribi explorant', () => {
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

  it('una partida antiga (passos totals) es converteix en anell i robots', () => {
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

  it('amb prou objectes es crea una obra, i la següent costa més', () => {
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

  it('no es pot comprar sense or', () => {
    const s = newGame(42);
    expect(buy(s, 'speed')).toBe(false);
    expect(s.upgrades.speed).toBe(0);
  });

  it('comprar resta el cost i millora la velocitat', () => {
    const s = newGame(42);
    s.gold = D(botes.baseCost);
    const before = stats(s).stepsPerSec;
    expect(buy(s, 'speed')).toBe(true);
    expect(s.gold.toNumber()).toBe(0);
    expect(stats(s).stepsPerSec).toBeGreaterThan(before);
  });

  it('el cost de N nivells és la suma dels individuals', () => {
    let sum = D(0);
    for (let i = 0; i < 5; i++) sum = sum.add(costOf(botes, 3 + i));
    expect(costOf(botes, 3, 5).toNumber()).toBeCloseTo(sum.toNumber(), 6);
  });

  it('desbloqueja zooms en ordre i no passa del final del mapa', () => {
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

  it('el zoom triat queda dins dels desbloquejats', () => {
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
