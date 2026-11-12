// Weather: which storms are over the map during each epoch, and how much they slow a rover down.
// Pure and deterministic: the storms of an epoch depend on the seed, the epoch and the explored area.
import { CALM_CHANCE, STORMS, STORMS_MAX, STORMS_MIN, WEATHER_FROM_RING, type StormId } from '../content/weather';
import { hash2, rand2 } from './rng';
import type { GameState, Storm, Weather } from './state';
import { ringCount, totalCells, type World } from './world';

const STORM_BY_ID = new Map(STORMS.map((d) => [d.id, d]));
export const stormDef = (id: StormId) => STORM_BY_ID.get(id)!;

/** Storms for epoch `epoch`, placed around the current exploring frontier. */
export function makeWeather(s: GameState, w: World, epoch: number): Weather {
  const seed = s.seed + 977;
  const rnd = (i: number, j: number) => rand2(epoch, i * 16 + j, seed);
  if (s.ring < WEATHER_FROM_RING || rnd(0, 0) < CALM_CHANCE) return { epoch, storms: [] };
  const explored = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w);
  const frontier = Math.sqrt(explored / Math.PI);
  const count = STORMS_MIN + Math.floor(rnd(0, 1) * (STORMS_MAX - STORMS_MIN + 1));
  const storms: Storm[] = [];
  for (let i = 1; i <= count; i++) {
    const angle = rnd(i, 0) * Math.PI * 2;
    const dist = frontier * (0.45 + 0.8 * rnd(i, 1));
    storms.push({
      kind: STORMS[Math.floor(rnd(i, 2) * STORMS.length)].id,
      x: Math.round(w.cx + Math.cos(angle) * dist),
      y: Math.round(w.cy + Math.sin(angle) * dist),
      r: Math.round(3 + rnd(i, 3) * (3 + frontier * 0.22)),
    });
  }
  return { epoch, storms };
}

/** Lobes that make each storm's outline irregular: [harmonic, amplitude, phase], seeded by the storm itself. */
const LOBES: readonly (readonly [number, number, number])[] = [[2, 0.18, 0.12], [3, 0.1, 0.12], [5, 0.05, 0.08], [7, 0.02, 0.05]];
const MAX_REACH = 1 + LOBES.reduce((a, [, base, extra]) => a + base + extra, 0);

/** Distance (cells) from a storm's centre to its edge in direction `angle` (radians). */
export function stormReach(st: Storm, angle: number): number {
  const seed = (st.x * 73856093) ^ (st.y * 19349663) ^ (st.r * 83492791);
  let f = 1;
  LOBES.forEach(([k, base, extra], q) => {
    const h = hash2(q, k, seed);
    f += (base + extra * ((h & 0xffff) / 0xffff)) * Math.sin(k * angle + ((h >>> 16) / 0xffff) * Math.PI * 2);
  });
  return st.r * f;
}

/** Whether map point (x, y) lies inside storm `st`. */
export function inStorm(st: Storm, x: number, y: number): boolean {
  const dx = x - st.x;
  const dy = y - st.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > (st.r * MAX_REACH) ** 2) return false;
  return d2 <= stormReach(st, Math.atan2(dy, dx)) ** 2;
}

/** The storm over map cell `cell` (the worst one if several overlap), or null under clear sky. */
export function stormAt(storms: readonly Storm[], size: number, cell: number): Storm | null {
  const x = cell % size;
  const y = Math.floor(cell / size);
  let worst: Storm | null = null;
  for (const st of storms) {
    if (!inStorm(st, x, y)) continue;
    if (!worst || stormDef(st.kind).factor < stormDef(worst.kind).factor) worst = st;
  }
  return worst;
}

/** Speed multiplier for a rover on map cell `cell` (1 = clear sky). `armour` = share of the slowdown still felt. */
export function weatherFactor(storms: readonly Storm[], size: number, cell: number, armour: number): number {
  const st = stormAt(storms, size, cell);
  return st ? 1 - (1 - stormDef(st.kind).factor) * armour : 1;
}
