// Weather: storms drift with a slowly turning wind, grow when they form and fade before they die out. One step
// per WEATHER_EPOCH seconds of play, deterministic from the seed, the step and the previous sky.
import {
  GROW_STEPS, LIFE_MAX, LIFE_MIN, OWN_SPEED, SEVERE_CHANCE, SEVERE_MULT, SPAWN_CHANCE, STORMS, STORMS_MAX, WEATHER_FROM_RING,
  WIND_SPEED, type StormId,
} from '../content/weather';
import { hash2, rand2, valueNoise } from './rng';
import type { GameState, Storm, Weather } from './state';
import { ringCount, totalCells, type World } from './world';

const STORM_BY_ID = new Map(STORMS.map((d) => [d.id, d]));
export const stormDef = (id: StormId) => STORM_BY_ID.get(id)!;

/** Speed multiplier inside storm `st` (without armour). */
export const stormFactor = (st: Storm): number => {
  const f = stormDef(st.kind).factor;
  return st.severe ? Math.max(0.1, 1 - (1 - f) * SEVERE_MULT) : f;
};

/** Display name ("Severe acid storm"). */
export const stormName = (st: Storm): string => (st.severe ? `Severe ${stormDef(st.kind).name.toLowerCase()}` : stormDef(st.kind).name);

/** The shared wind at step `epoch`: a direction that turns slowly. */
export function wind(seed: number, epoch: number): [number, number] {
  const a = valueNoise(epoch / 400, 0.5, seed + 913) * Math.PI * 4;
  return [Math.cos(a) * WIND_SPEED, Math.sin(a) * WIND_SPEED];
}

/** The sky at step `epoch`, grown from the previous one (or from a clear sky if steps were skipped). */
export function evolveWeather(s: GameState, w: World, epoch: number): Weather {
  const prev = s.weather;
  const seed = s.seed + 977;
  const rnd = (i: number, j: number) => rand2(epoch, i * 16 + j, seed);
  const [wx, wy] = wind(seed, epoch);
  const carry = epoch === prev.epoch + 1;
  const margin = 40;
  const storms: Storm[] = [];
  for (const st of carry ? prev.storms : []) {
    const age = st.age + 1;
    if (age >= st.life) continue;
    const x = st.x + st.vx + wx;
    const y = st.y + st.vy + wy;
    if (x < -margin || y < -margin || x > w.size + margin || y > w.size + margin) continue;
    storms.push({ ...st, age, x, y, r: st.size * ramp(age, st.life) });
  }
  // Now and then a new storm forms near the explored frontier.
  if (s.ring >= WEATHER_FROM_RING && storms.length < STORMS_MAX && rnd(0, 0) < SPAWN_CHANCE) {
    const explored = s.ring < ringCount(w) ? w.rings[s.ring] : totalCells(w);
    const frontier = Math.sqrt(explored / Math.PI);
    const angle = rnd(0, 1) * Math.PI * 2;
    const dist = frontier * (0.5 + 0.8 * rnd(0, 2));
    const own = rnd(0, 3) * Math.PI * 2;
    const severe = rnd(0, 4) < SEVERE_CHANCE;
    const size = (3 + rnd(0, 5) * (3 + frontier * 0.22)) * (severe ? 1.2 : 1);
    const life = LIFE_MIN + Math.floor(rnd(0, 6) * (LIFE_MAX - LIFE_MIN));
    storms.push({
      id: prev.nextId,
      kind: STORMS[Math.floor(rnd(0, 7) * STORMS.length)].id,
      x: w.cx + Math.cos(angle) * dist,
      y: w.cy + Math.sin(angle) * dist,
      vx: Math.cos(own) * OWN_SPEED * rnd(0, 8),
      vy: Math.sin(own) * OWN_SPEED * rnd(0, 8),
      size, r: size * ramp(0, life), age: 0, life, severe,
    });
    return { epoch, storms, nextId: prev.nextId + 1 };
  }
  return { epoch, storms, nextId: prev.nextId };
}

/** Share of its full size a storm has at `age`: it grows at first and fades at the end. */
function ramp(age: number, life: number): number {
  return Math.min(1, (age + 1) / GROW_STEPS, (life - age) / GROW_STEPS);
}

/** Lobes that make each storm's outline irregular: [harmonic, amplitude, extra amplitude], seeded by the storm. */
const LOBES: readonly (readonly [number, number, number])[] = [[2, 0.18, 0.12], [3, 0.1, 0.12], [5, 0.05, 0.08], [7, 0.02, 0.05]];
const MAX_REACH = 1 + LOBES.reduce((a, [, base, extra]) => a + base + extra, 0);

/** Distance (cells) from a storm's centre to its edge in direction `angle` (radians). */
export function stormReach(st: Storm, angle: number): number {
  const seed = st.id * 73856093 + 19349663;
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
    if (!worst || stormFactor(st) < stormFactor(worst)) worst = st;
  }
  return worst;
}

/** Speed multiplier for a rover on map cell `cell` (1 = clear sky). `armour` = share of the slowdown still felt. */
export function weatherFactor(storms: readonly Storm[], size: number, cell: number, armour: number): number {
  const st = stormAt(storms, size, cell);
  return st ? 1 - (1 - stormFactor(st)) * armour : 1;
}
