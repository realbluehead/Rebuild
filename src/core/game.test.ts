import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buy, capacity, costOf, explored, isComplete, setZoom, stats, tick } from './game';
import { UPGRADES } from '../content/upgrades';
import { ZOOMS } from '../content/world';
import { D } from './decimal';
import { fmt } from './format';
import { createWorld, goldBetween, totalCells, totalSteps, unlockAt, zoomFraction } from './world';

// Mapa petit perquè els tests vagin de pressa (el de veritat és de MAP_SIZE).
const SIZE = 128;
const world = createWorld(42, SIZE);
const botes = UPGRADES.find((u) => u.id === 'speed')!;

describe('món', () => {
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
      // Una casella contigua costa un pas; una de més lluny, un pas per casella de camí.
      expect(world.steps[r + 1] - world.steps[r]).toBe(king);
      if (king > 1) far++;
    }
    expect(far).toBeGreaterThan(0);
    expect(totalSteps(world)).toBeGreaterThan(totalCells(world));
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
  it('els passos avancen proporcionalment al temps i el campament es descobreix al primer pas', () => {
    const s = newGame(42);
    tick(s, world, 10);
    expect(s.walked).toBeCloseTo(stats(s).stepsPerSec * 10);
    expect(explored(s, world)).toBeGreaterThan(0);
    expect(explored(s, world)).toBeLessThanOrEqual(s.walked);
    // L'or el porten els robots fins que el descarreguen al campament.
    expect(s.gold.add(s.cargo).toNumber()).toBeCloseTo(goldBetween(world, 0, explored(s, world)));
  });

  it('amb la bodega plena el robot torna al campament, descarrega i torna a sortir', () => {
    const s = newGame(42);
    s.upgrades.speed = 10;
    const cap = capacity(s);
    let k = 0;
    while (s.trip === 'explore' && k++ < 100000) tick(s, world, 0.1);
    expect(s.trip).toBe('home');
    expect(s.cargo.toNumber()).toBeCloseTo(cap, 9);
    expect(s.gold.toNumber()).toBe(0);
    const walked = s.walked;
    let deposited = 0;
    while (s.trip !== 'explore' && k++ < 100000) deposited += tick(s, world, 0.1).deposited;
    expect(s.walked).toBeCloseTo(walked, 0); // mentre va i ve, no explora
    expect(deposited).toBeCloseTo(cap, 6);
    expect(s.gold.toNumber()).toBeGreaterThanOrEqual(cap - 1e-6);
  });

  it('un tick llarg dona el mateix que molts de curts (offline exacte)', () => {
    const a = newGame(42);
    const b = newGame(42);
    a.upgrades.speed = b.upgrades.speed = 12;
    tick(a, world, 600);
    for (let k = 0; k < 6000; k++) tick(b, world, 0.1);
    expect(a.walked).toBeCloseTo(b.walked, 3);
    expect(a.gold.toNumber()).toBeCloseTo(b.gold.toNumber(), 3);
    expect(a.cargo.toNumber()).toBeCloseTo(b.cargo.toNumber(), 3);
    expect(a.trip).toBe(b.trip);
  });

  for (const robots of [1, 3]) {
    it(`amb ${robots} robot(s), tot l'or i tots els llocs especials arriben exactament un cop`, () => {
      const s = newGame(42);
      s.upgrades.explorers = robots - 1;
      s.upgrades.speed = 40;
      s.upgrades.cargo = 20;
      let specials = 0;
      for (let k = 0; k < 20000 && !isComplete(s, world); k++) specials += tick(s, world, 0.5).specials.length;
      expect(isComplete(s, world)).toBe(true);
      expect(explored(s, world)).toBeCloseTo(totalCells(world));
      expect(specials).toBe(world.special.reduce((a, b) => a + b, 0));
      expect(s.totalGold.toNumber() / world.goldPrefix[totalCells(world)]).toBeCloseTo(1, 6);
    });
  }

  it('un robot comprat a mig anell comença a treballar a l\'anell següent', () => {
    const s = newGame(42);
    s.upgrades.speed = 20;
    s.upgrades.cargo = 20;
    while (s.ringRobots === 1 && explored(s, world) < 300) tick(s, world, 0.05);
    s.upgrades.explorers = 2;
    const ring = s.ringRobots;
    tick(s, world, 0.0001);
    expect(s.ringRobots).toBe(ring);
    for (let k = 0; k < 200; k++) tick(s, world, 0.5);
    expect(s.ringRobots).toBe(3);
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
    for (let k = 0; k < 2000 && !isComplete(s, world); k++) {
      const ev = tick(s, world, 1);
      if (ev.zoomUnlocked) { expect(ev.zoomUnlocked).toBeGreaterThan(unlocked); unlocked = ev.zoomUnlocked; }
    }
    expect(s.walked).toBe(totalSteps(world));
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
