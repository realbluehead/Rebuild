// The world is generated from the seed and never saved. Exploration is precomputed as an order: the cell of
// rank r is revealed after the r cells before it. Game progress is just a ring number plus, per rover, how many
// steps it has made along its arc of that ring, so offline progress is exact.
//
// The order comes from an expansion from the camp (Dijkstra): each cell has a cost by terrain plus a little
// noise, and the "path distance" D grows from the centre. It is walked in bands of D (rings) and, inside each
// band, by angle, alternating direction so the rovers keep walking. Since crossing a cell costs >= 1, every
// cell's predecessor lies in an earlier band: the explored area is always one connected patch, with no islands
// and no black holes.
//
// With several rovers, each ring is split into arcs (one per rover) and each rover works its own arc at its own
// pace. A rover can only reveal the neighbouring cell: if the next cell in the order is not adjacent, it first
// walks there over known ground (steps that reveal nothing). Time is counted in steps, and a cell counts as
// revealed once the rover has reached it (not when it sets off).
import { DIST_VALUE_SCALE, MAP_SIZE, SPECIAL_CHANCE, SPECIAL_MULT, T, TERRAINS, ZOOMS, ZOOM_UNLOCK_FRACTION } from '../content/world';
import { ITEM_CHANCE, ITEMS } from '../content/collection';
import { fbm, rand2 } from './rng';

export interface World {
  seed: number;
  size: number;
  /** Starting cell (map centre). */
  cx: number;
  cy: number;
  /** Terrain of each cell (index into TERRAINS), row-major: i = y * size + x. */
  terrain: Uint8Array;
  /** 1 if the cell holds a deposit. */
  special: Uint8Array;
  /** Item hidden in each cell: 0 = none, k + 1 = ITEMS[k]. */
  item: Uint8Array;
  /** Ranks (sorted) of the cells that hold an item. */
  itemRanks: Uint32Array;
  /** order[r] = cell revealed at position r. */
  order: Uint32Array;
  /** rank[i] = position at which cell i is revealed. */
  rank: Uint32Array;
  /** goldPrefix[r] = bluetreri of the first r cells (before multipliers). */
  goldPrefix: Float64Array;
  /** rings[k] = first rank of ring k; the last element is the total cell count. */
  rings: Uint32Array;
  /** steps[r] = steps needed to have the first r cells revealed (n + 1 values). */
  steps: Float64Array;
  /** ringSteps[k] = steps[rings[k]]: the step count at which each ring starts. */
  ringSteps: Float64Array;
  /** Per zoom level: sorted ranks of the cells in its square (to know how much of it is revealed). */
  zoomRanks: Uint32Array[];
}

/** City block size: there is a street every BLOCK cells. */
const BLOCK = 7;

/** How much the crossing cost varies (noise), so the outline looks organic. */
const COST_NOISE = 0.7;

export function createWorld(seed: number, size = MAP_SIZE): World {
  const n = size * size;
  const cx = size >> 1;
  const cy = size >> 1;
  const half = size / 2;
  const terrain = new Uint8Array(n);
  const special = new Uint8Array(n);
  const item = new Uint8Array(n);
  const itemWeight = ITEMS.reduce((a, it) => a + it.weight, 0);
  const value = new Float32Array(n);
  const cost = new Float32Array(n);
  const angle = new Float32Array(n);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);

      // Terrain: a "height" with a city in the middle (solid ground at the start, dark water at the edges). The
      // higher, the denser: streets, ruined blocks and towers; where it is wet, nature has taken over (urban jungle).
      let h = fbm(x, y, seed, 160, 5);
      // Around the start the height is pulled towards streets, so the game begins on friendly ground.
      const home = Math.max(0, 1 - d / 36);
      h += (0.47 - h) * home * home;
      h -= 0.9 * Math.max(0, d / half - 0.72);
      const wet = fbm(x, y, seed + 99, 90, 3);
      // Street grid (every BLOCK cells, with the camp at a crossing); between streets, city blocks.
      const onGrid = (((dx % BLOCK) + BLOCK) % BLOCK === 0) || (((dy % BLOCK) + BLOCK) % BLOCK === 0);
      const block = rand2(Math.floor((dx + 1000 * BLOCK) / BLOCK), Math.floor((dy + 1000 * BLOCK) / BLOCK), seed + 21);
      let t: number =
        h < 0.31 ? T.Abyss :
        h < 0.385 ? T.Toxic :
        h < 0.41 ? T.Rubble :
        h < 0.55 ? (wet > 0.53 ? T.Jungle : onGrid ? T.Street : block < 0.3 ? T.Rubble : block < 0.4 ? T.Jungle : T.Ruins) :
        h < 0.61 ? (wet > 0.6 ? T.Jungle : onGrid ? T.Street : T.Ruins) :
        onGrid ? T.Street : T.Towers;
      // Toxic dumps: patches scattered over solid ground (not right next to the camp).
      if (t >= T.Rubble && d > 12 && fbm(x, y, seed + 55, 28, 2) > 0.7) t = T.Dump;
      terrain[i] = t;
      const sp = t >= T.Rubble && rand2(x, y, seed + 7) < SPECIAL_CHANCE && d > 3;
      special[i] = sp ? 1 : 0;
      const ir = rand2(x, y, seed + 11);
      if (!sp && d > 2 && ir < ITEM_CHANCE) {
        // The kind comes from the same number (rescaled): two draws of the same hash with neighbouring seeds are not independent.
        let u = (ir / ITEM_CHANCE) * itemWeight;
        let k = 0;
        while (k < ITEMS.length - 1 && u >= ITEMS[k].weight) u -= ITEMS[k++].weight;
        item[i] = k + 1;
      }
      value[i] = TERRAINS[t].value * (1 + d / DIST_VALUE_SCALE) * (sp ? SPECIAL_MULT : 1);

      cost[i] = TERRAINS[t].cost * (1 + COST_NOISE * fbm(x, y, seed + 31, 24, 2));
      angle[i] = Math.atan2(dy, dx);
    }
  }

  const D = pathDistance(size, cx, cy, cost);
  const ringOf = new Uint32Array(n);
  let maxRing = 0;
  for (let i = 0; i < n; i++) {
    const ring = Math.floor(D[i]);
    ringOf[i] = ring;
    if (ring > maxRing) maxRing = ring;
  }

  // Counting sort by ring and, inside each ring, by angle. Rings alternate direction so the end of one
  // lies near the start of the next (the rover walks).
  const count = new Uint32Array(maxRing + 2);
  for (let i = 0; i < n; i++) count[ringOf[i] + 1]++;
  for (let r = 1; r < count.length; r++) count[r] += count[r - 1];
  const order = new Uint32Array(n);
  const fill = count.slice();
  for (let i = 0; i < n; i++) order[fill[ringOf[i]]++] = i;
  for (let r = 0; r <= maxRing; r++) {
    const a = count[r];
    const b = count[r + 1];
    if (b - a < 2) continue;
    const dir = r % 2 ? -1 : 1;
    const part = Array.from(order.subarray(a, b)).sort((p, q) => dir * (angle[p] - angle[q]));
    order.set(part, a);
  }

  const rank = new Uint32Array(n);
  const goldPrefix = new Float64Array(n + 1);
  for (let r = 0; r < n; r++) {
    rank[order[r]] = r;
    goldPrefix[r + 1] = goldPrefix[r] + value[order[r]];
  }

  const itemList: number[] = [];
  for (let r = 0; r < n; r++) if (item[order[r]]) itemList.push(r);
  const itemRanks = Uint32Array.from(itemList);

  if (order[0] !== cy * size + cx) throw new Error('El campament ha de ser la primera casella');

  // Steps: reaching cell r means coming from cell r - 1 (king distance: 1 if adjacent), multiplied by the
  // cell's roughness.
  const steps = new Float64Array(n + 1);
  steps[1] = 1; // the camp itself
  for (let r = 1; r < n; r++) {
    const p = order[r - 1];
    const q = order[r];
    const d = Math.max(Math.abs((p % size) - (q % size)), Math.abs(Math.floor(p / size) - Math.floor(q / size)));
    // Entering and exploring the cell costs by terrain roughness (streets are fast, jungle and rubble slow).
    steps[r + 1] = steps[r] + d * TERRAINS[terrain[q]].rough;
  }
  const ringSteps = new Float64Array(count.length);
  for (let k = 0; k < count.length; k++) ringSteps[k] = steps[count[k]];

  const zoomRanks = ZOOMS.map(({ view }) => {
    const x0 = Math.max(0, cx - (view >> 1));
    const y0 = Math.max(0, cy - (view >> 1));
    const x1 = Math.min(size, cx + (view >> 1));
    const y1 = Math.min(size, cy + (view >> 1));
    const out = new Uint32Array((x1 - x0) * (y1 - y0));
    let k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[k++] = rank[y * size + x];
    return out.sort();
  });

  return { seed, size, cx, cy, terrain, special, item, itemRanks, order, rank, goldPrefix, rings: count, steps, ringSteps, zoomRanks };
}

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Path distance (Dijkstra, 8 neighbours) from (cx, cy); moving between two cells costs the mean of their costs. */
function pathDistance(size: number, cx: number, cy: number, cost: Float32Array): Float64Array {
  const n = size * size;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap(n);
  const start = cy * size + cx;
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size) {
    const d = heap.topKey();
    const i = heap.pop();
    if (d > dist[i]) continue; // stale entry
    const x = i % size;
    const y = (i - x) / size;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      const nd = d + ((cost[i] + cost[j]) / 2) * (k < 4 ? 1 : SQRT2);
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(nd, j);
      }
    }
  }
  return dist;
}

/** Binary priority queue on typed arrays (grows when needed). */
class MinHeap {
  private keys: Float64Array;
  private vals: Uint32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Uint32Array(cap);
  }
  topKey(): number { return this.keys[0]; }
  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2); k.set(this.keys); this.keys = k;
      const v = new Uint32Array(this.size * 2); v.set(this.vals); this.vals = v;
    }
    const { keys, vals } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p]; vals[i] = vals[p]; i = p;
    }
    keys[i] = key; vals[i] = val;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const last = --this.size;
    const key = keys[last];
    const val = vals[last];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= last) break;
      if (c + 1 < last && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      keys[i] = keys[c]; vals[i] = vals[c]; i = c;
    }
    keys[i] = key; vals[i] = val;
    return top;
  }
}

export const totalCells = (w: World): number => w.size * w.size;
/** Steps needed to explore the whole map. */
export const totalSteps = (w: World): number => w.steps[totalCells(w)];

/** Bluetreri (before multipliers) of the cells between positions a and b (fractions included). */
export function goldBetween(w: World, a: number, b: number): number {
  return prefixAt(w, b) - prefixAt(w, a);
}

/** Ring reached after `walked` total steps (the last one if finished). Used to convert old saves. */
export function ringAt(w: World, walked: number): number {
  const rs = w.ringSteps;
  let lo = 0;
  let hi = rs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rs[mid] <= walked) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Cells (with fraction) covered inside the arc [lo, hi) when the rover is at `t` total steps. */
export function cellsReached(w: World, lo: number, hi: number, t: number): number {
  const st = w.steps;
  // Largest m with steps[m] <= t: cells < m are already revealed.
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = (a + b + 1) >> 1;
    if (st[mid] <= t) a = mid;
    else b = mid - 1;
  }
  if (a >= hi) return hi - lo;
  return a - lo + Math.max(0, (t - st[a]) / (st[a + 1] - st[a]));
}

/** Number of rings (the last valid index is ringCount - 1). */
export const ringCount = (w: World): number => w.rings.length - 1;

/** First rank of each arc of ring `ring` split between `robots` (n + 1 values: the last is the ring's end). */
export function arcStarts(w: World, ring: number, robots: number): number[] {
  const a = w.rings[ring];
  const len = w.rings[ring + 1] - a;
  const arcs = Math.max(1, Math.min(robots, len));
  const starts: number[] = [];
  for (let k = 0; k <= arcs; k++) starts.push(a + Math.floor((k * len) / arcs));
  return starts;
}

/** Which arc rover j works. Rings alternate direction: on an odd ring rover j takes the arc from the opposite
 *  side, so it carries on from where it finished. (It is its own inverse: it also gives the rover of an arc.) */
export const arcOf = (ring: number, j: number, arcs: number): number => (ring % 2 === 0 ? j : arcs - 1 - j);

/** Prefix sum of bluetreri up to position r (with fraction), clamped to the map. */
export function prefixAt(w: World, r: number): number {
  const n = totalCells(w);
  if (r <= 0) return 0;
  if (r >= n) return w.goldPrefix[n];
  const i = Math.floor(r);
  return w.goldPrefix[i] + (w.goldPrefix[i + 1] - w.goldPrefix[i]) * (r - i);
}

/** Index (into `itemRanks`) of the first item with rank >= r. */
export function itemIndexAt(w: World, r: number): number {
  const ir = w.itemRanks;
  let lo = 0;
  let hi = ir.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ir[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Indices (into `itemRanks`) of the items with rank in [a, b). */
export function itemsBetween(w: World, a: number, b: number): number[] {
  const out: number[] = [];
  for (let k = itemIndexAt(w, a); k < w.itemRanks.length && w.itemRanks[k] < b; k++) out.push(k);
  return out;
}

/** Cells (map indices) on a straight 8-connected line from the cell of rank `from` to the cell of rank `to`,
 *  both included, in walking order. */
export function pathCells(w: World, from: number, to: number): number[] {
  const { order, size } = w;
  const a = order[from];
  const b = order[to];
  const x0 = a % size;
  const y0 = Math.floor(a / size);
  const dx = (b % size) - x0;
  const dy = Math.floor(b / size) - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push(Math.round(y0 + dy * t) * size + Math.round(x0 + dx * t));
  }
  return out;
}

/** Ring that holds the cell of rank r. */
export function ringOfRank(w: World, r: number): number {
  const rs = w.rings;
  let lo = 0;
  let hi = rs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rs[mid] <= r) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Revealed fraction of zoom `z`'s square (0-based) once `explored` cells are explored. */
export function zoomFraction(w: World, z: number, explored: number): number {
  const ranks = w.zoomRanks[z];
  let lo = 0;
  let hi = ranks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranks[mid] < explored) lo = mid + 1;
    else hi = mid;
  }
  return lo / ranks.length;
}

/** Explored cells needed to unlock zoom z + 1. */
export function unlockAt(w: World, z: number): number {
  const ranks = w.zoomRanks[z];
  return ranks[Math.max(0, Math.ceil(ranks.length * ZOOM_UNLOCK_FRACTION) - 1)] + 1;
}

/** Positions (ranks) of deposits between a (inclusive) and b (exclusive). */
export function specialsBetween(w: World, a: number, b: number): number[] {
  const out: number[] = [];
  const end = Math.min(Math.floor(b), totalCells(w));
  for (let r = Math.max(0, Math.floor(a)); r < end; r++) if (w.special[w.order[r]]) out.push(r);
  return out;
}
