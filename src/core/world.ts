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
import type { RouteId } from '../content/routes';

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
  /** Bluetreri of each cell (before multipliers) and its crossing cost (for the exploration order). */
  value: Float32Array;
  cost: Float32Array;
  /** Path distance from camp along the roads (the circular route's field): how far a rover drives home. */
  road: Float32Array;
  /** Distance fields of the other exploration routes, computed when first needed. */
  fields: Map<RouteId, Float32Array>;
  /** Bumped whenever the order changes (a new route), so views can refresh what they derived from it. */
  version: number;
  /** When the rovers follow different routes: how many slices the map is split into (1 = one route for all), from ring
   *  `slicesFrom` on. Each ring's arcs are then cut at the slice boundaries (see `arcStarts`). */
  slices: number;
  slicesFrom: number;
  /** order[r] = cell revealed at position r. */
  order: Uint32Array;
  /** rank[i] = position at which cell i is revealed. */
  rank: Uint32Array;
  /** goldPrefix[r] = bluetreri of the first r cells (before multipliers). */
  goldPrefix: Float64Array;
  /** rings[k] = first rank of ring k; the last element is the total cell count. */
  rings: Uint32Array;
  /** Steps needed to have the first r cells revealed are `stepBase[r] + grip * stepRough[r]` (n + 1 values):
   *  the base is the walking distance, the rough part the terrain's extra roughness, which tyres reduce
   *  (`grip` = 1 without tyres). See `stepsAt`. */
  stepBase: Float64Array;
  stepRough: Float64Array;
  /** ringSteps[k] = steps (grip 1) at which ring k starts. Only for converting old saves. */
  ringSteps: Float64Array;
  /** Items by area: buckets of ITEM_BUCKET x ITEM_BUCKET cells, `itemCells[itemStart[b]..itemStart[b+1])` holds the
   *  item indices (into `itemRanks`) of bucket b. For the per-rover radar. */
  itemStart: Uint32Array;
  itemCells: Uint32Array;
  /** Per zoom level: sorted ranks of the cells in its square (to know how much of it is revealed). */
  zoomRanks: Uint32Array[];
}

/** Side of the item buckets (see `World.itemStart`). */
export const ITEM_BUCKET = 16;

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

  if (order[0] !== cy * size + cx) throw new Error('The camp must be the first cell');

  const w: World = {
    seed, size, cx, cy, terrain, special, item, order,
    rank: new Uint32Array(n), goldPrefix: new Float64Array(n + 1), rings: count,
    stepBase: new Float64Array(n + 1), stepRough: new Float64Array(n + 1), ringSteps: new Float64Array(0),
    itemRanks: new Uint32Array(0), itemStart: new Uint32Array(0), itemCells: new Uint32Array(0), zoomRanks: [],
    value, cost, road: Float32Array.from(D), fields: new Map(), version: 0, slices: 1, slicesFrom: 0,
  };
  derive(w, 0);
  return w;
}

/** Recomputes everything that depends on the order from rank `a` on (ranks, bluetreri and step prefix sums), plus
 *  the item and zoom indexes. */
function derive(w: World, a: number): void {
  const { order, rank, goldPrefix, stepBase, stepRough, value, terrain, item, size, cx, cy } = w;
  const n = size * size;
  for (let r = a; r < n; r++) {
    rank[order[r]] = r;
    goldPrefix[r + 1] = goldPrefix[r] + value[order[r]];
  }
  // Steps: reaching cell r means coming from cell r - 1 (king distance: 1 if adjacent), times the extra
  // roughness of the cell (streets are fast, jungle and rubble slow; tyres soften it).
  if (a === 0) stepBase[1] = 1; // the camp itself
  for (let r = Math.max(1, a); r < n; r++) {
    const p = order[r - 1];
    const q = order[r];
    const d = Math.max(Math.abs((p % size) - (q % size)), Math.abs(Math.floor(p / size) - Math.floor(q / size)));
    stepBase[r + 1] = stepBase[r] + d;
    stepRough[r + 1] = stepRough[r] + d * (TERRAINS[terrain[q]].rough - 1);
  }
  w.ringSteps = Float64Array.from(w.rings, (r) => stepBase[r] + stepRough[r]);

  const itemList: number[] = [];
  for (let r = 0; r < n; r++) if (item[order[r]]) itemList.push(r);
  const itemRanks = Uint32Array.from(itemList);
  const nb = Math.ceil(size / ITEM_BUCKET);
  const itemStart = new Uint32Array(nb * nb + 1);
  const bucketOf = (k: number) => {
    const i = order[itemRanks[k]];
    return Math.floor(Math.floor(i / size) / ITEM_BUCKET) * nb + Math.floor((i % size) / ITEM_BUCKET);
  };
  for (let k = 0; k < itemRanks.length; k++) itemStart[bucketOf(k) + 1]++;
  for (let b = 1; b <= nb * nb; b++) itemStart[b] += itemStart[b - 1];
  const itemCells = new Uint32Array(itemRanks.length);
  const put = itemStart.slice();
  for (let k = 0; k < itemRanks.length; k++) itemCells[put[bucketOf(k)]++] = k;
  w.itemRanks = itemRanks;
  w.itemStart = itemStart;
  w.itemCells = itemCells;

  w.zoomRanks = ZOOMS.map(({ view }) => {
    const x0 = Math.max(0, cx - (view >> 1));
    const y0 = Math.max(0, cy - (view >> 1));
    const x1 = Math.min(size, cx + (view >> 1));
    const y1 = Math.min(size, cy + (view >> 1));
    const out = new Uint32Array((x1 - x0) * (y1 - y0));
    let k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[k++] = rank[y * size + x];
    return out.sort();
  });
  w.version++;
}


/** One rover's slice of a mixed route: [route, entropy level]. */
export type Sector = readonly [RouteId, number];
/** One applied route: from ring `ring` on, the map is ordered by `route` at entropy level `level`, or, when the rovers
 *  follow different routes, by one [route, level] per rover: rover j's slice of the map around camp (see `sectorAt`)
 *  follows sector j. Entries saved before levels existed have no level and use the old (legacy) fields. */
export type PlanEntry = readonly [number, RouteId] | readonly [number, RouteId, number] | readonly [number, readonly Sector[]];

/** The [route, level] per slice of a plan entry (one for a single route), or null for a legacy entry. */
export function planSectors(e: PlanEntry): readonly Sector[] | null {
  if (typeof e[1] !== 'string') return e[1];
  return e.length > 2 ? [[e[1], (e as readonly [number, RouteId, number])[2]]] : null;
}

/** The plan entry for ring `ring` with these slices: a single [ring, route, level] when every rover follows the same. */
export function planEntry(ring: number, sectors: readonly Sector[]): PlanEntry {
  const [r, l] = sectors[0];
  return sectors.every(([r2, l2]) => r2 === r && l2 === l) ? [ring, r, l] : [ring, sectors.map(([r2, l2]) => [r2, l2] as Sector)];
}

/** Rebuilds a world's order from a game's route history (see `GameState.plan`); `onEntry(k, n)` after each entry. */
export function applyPlan(w: World, plan: readonly PlanEntry[], onEntry?: (k: number, n: number) => void): void {
  let from = Infinity;
  plan.forEach((e, k) => {
    const ring = e[0];
    if (ring >= w.rings.length - 1) return;
    from = Math.min(from, w.rings[ring]);
    // Only the rings up to the next entry matter: that one re-sorts everything after them. The derived tables are
    // rebuilt once at the end.
    const upto = plan[k + 1]?.[0];
    const lazy = k < plan.length - 1;
    const sectors = planSectors(e);
    if (sectors) reorder(w, ring, sectors, undefined, upto, lazy);
    else reorder(w, ring, e[1] as RouteId, undefined, upto, lazy);
    onEntry?.(k, plan.length);
  });
  if (from < Infinity) derive(w, from);
}

/** Which of `n` slices around camp cell `i` falls in, by angle from the west going anticlockwise on screen (the order
 *  rings are walked in on even rings): rover j works about slice j of every ring. */
export function sectorAt(w: World, i: number, n: number): number {
  if (n <= 1) return 0;
  const x = i % w.size;
  const a = Math.atan2((i - x) / w.size - w.cy, x - w.cx);
  return Math.min(n - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * n));
}

/** How each discovery algorithm decides what to explore next: a per-cell cost (cheap cells are explored first) and how
 *  much entropy (noise in the costs, jitter in the walking order) it has at level 0. Each level multiplies the entropy by
 *  its `decay`: the rovers stray less and waste fewer steps. */
interface Algo {
  cost: (w: World, i: number, ctx: AlgoCtx) => number;
  noise: number;
  jitter: number;
  /** Chance that a rover leaves the patch it is sweeping for the next one along the ring (wasted walking). */
  stray: number;
  /** Entropy left after each level. */
  decay: number;
}
interface AlgoCtx { meanValue: number; frontier: number }
/** Every COST_SAMPLE-th cell is used to normalise an algorithm's costs. */
const COST_SAMPLE = 61;
const meanValues = new WeakMap<World, number>();
/** Mean bluetreri value of a cell (it does not depend on the order). */
function meanValue(w: World): number {
  let v = meanValues.get(w);
  if (v === undefined) {
    v = 0;
    for (let i = 0; i < w.value.length; i++) v += w.value[i];
    v /= w.value.length;
    meanValues.set(w, v);
  }
  return v;
}

const ALGOS: Partial<Record<RouteId, Algo>> = {
  // Random: every direction equally likely; lots of noise, so the frontier frays, rovers zig-zag and leave patches half done.
  random: { cost: () => 1, noise: 1.4, jitter: 0.8, stray: 0.3, decay: 0.6 },
  // Rings: the nearest ground first, by terrain crossing cost.
  circular: { cost: (w, i) => TERRAINS[w.terrain[i]].cost, noise: 2.2, jitter: 0, stray: 0, decay: 0.85 },
  // Trail: easy ground that still pays (a mild bluetreri-per-step pull on top of the crossing cost).
  trail: { cost: (w, i, c) => TERRAINS[w.terrain[i]].cost * (TERRAINS[w.terrain[i]].rough / Math.max(0.05, w.value[i] / c.meanValue)) ** 0.4, noise: 0.45, jitter: 0.2, stray: 0, decay: 0.6 },
  // Prospector: the most bluetreri per step first (deposits pull hard).
  prospect: { cost: (w, i, c) => (TERRAINS[w.terrain[i]].rough / Math.max(0.05, w.value[i] / c.meanValue)) ** 0.9, noise: 0.7, jitter: 0.3, stray: 0, decay: 0.6 },
  // Survey: like the prospector, but keeps the explored area compact so trips home stay short.
  survey: {
    cost: (w, i, c) => (TERRAINS[w.terrain[i]].rough / Math.max(0.05, w.value[i] / c.meanValue)) ** 1.1 * (1 + Math.max(0, w.road[i] - c.frontier) / 8),
    noise: 0.3,
    jitter: 0.1,
    stray: 0,
    decay: 0.6,
  },
};

/** Entropy of `route` at `level`: [cost noise, angle jitter, stray chance]. */
export function algoEntropy(route: RouteId, level: number): [number, number, number] {
  const a = ALGOS[route];
  const k = a ? a.decay ** level : 0;
  return a ? [a.noise * k, a.jitter * k, a.stray * k] : [0, 0, 0];
}

/** Distance field of an algorithm (one per rover slice), grown from every explored cell (the first `a` cells). Any field
 *  grown with positive costs from sources inside the explored area keeps it connected (each cell's predecessor is
 *  explored or earlier). */
function algoField(w: World, sectors: readonly Sector[], a: number, ring: number, bands = Infinity): { field: Float32Array; cut: number } {
  const { size, order } = w;
  const n = size * size;
  const dice = w.seed + 401 + ring * 7919;
  const ctx: AlgoCtx = { meanValue: meanValue(w), frontier: w.road[order[Math.max(0, a - 1)]] };
  const raws = sectors.map(([route, level]) => {
    const algo = ALGOS[route]!;
    const [noise] = algoEntropy(route, level);
    return (i: number) => {
      const x = i % size;
      const y = (i - x) / size;
      const wobble = 0.6 * (fbm(x, y, dice, 18, 3) - 0.5) + 0.4 * (rand2(x, y, dice + 1) - 0.5);
      return algo.cost(w, i, ctx) * Math.exp(2 * noise * wobble);
    };
  });
  // Normalise so a typical cell costs about 1 (rings stay about one cell thick, in every slice alike); the mean comes
  // from a fixed sample.
  const means = raws.map((raw) => {
    let mean = 0;
    let m = 0;
    for (let i = 0; i < n; i += COST_SAMPLE, m++) mean += raw(i);
    return mean / m;
  });
  const one = sectors.length === 1;
  const raw = (i: number) => {
    const k = one ? 0 : sectorAt(w, i, sectors.length);
    return raws[k](i) / means[k];
  };
  // Costs are worked out only for the cells the field reaches (a replayed route stops early, see below).
  const costs = new Float32Array(n).fill(NaN);
  const fill = (i: number) => { if (costs[i] !== costs[i]) costs[i] = Math.max(0.02, raw(i)); };
  // With a band limit, stop growing the field once that many bands of unexplored cells are settled: every cell at or
  // beyond band `cut` gets a provisional distance and is left unsorted (a later reorder takes it from there).
  let cut = Infinity;
  let seen = 0;
  let last = -1;
  const explored = bands === Infinity ? null : new Uint8Array(n);
  if (explored) for (let r = 0; r < a; r++) explored[order[r]] = 1;
  const stop = !explored ? undefined : (d: number, i: number) => {
    if (explored[i]) return false;
    const b = Math.floor(d);
    if (b !== last) { last = b; if (++seen > bands) { cut = b; return true; } }
    return false;
  };
  const field = Float32Array.from(pathDistance(size, w.cx, w.cy, costs, DIAG, order.subarray(0, Math.max(1, a)), stop, fill));
  return { field, cut };
}

/** Legacy routes (saves from before levels): the four directions grown from camp, and the first random route. */
const LEGACY_PULL = 0.7;
const LEGACY_DIR: Partial<Record<RouteId, [number, number]>> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
function legacyField(w: World, route: RouteId, a: number, ring: number): { field: Float32Array; scale: number } {
  if (route === 'circular') return { field: w.road, scale: 1 };
  if (route === 'random') return { field: legacyRandomField(w, a, ring), scale: 1 };
  const dir = LEGACY_DIR[route]!;
  const mult = DX.map((dx, k) => 1 - (LEGACY_PULL * (dx * dir[0] + DY[k] * dir[1])) / Math.hypot(dx, DY[k]));
  return { field: Float32Array.from(pathDistance(w.size, w.cx, w.cy, w.cost, mult)), scale: 1.5 };
}
function legacyRandomField(w: World, a: number, ring: number): Float32Array {
  const { size, cost, seed, order } = w;
  const n = size * size;
  const dice = seed + 401 + ring * 7919;
  const noisy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    noisy[i] = cost[i] * Math.exp(4.4 * (fbm(x, y, dice, 22, 3) - 0.5)) * (0.6 + 0.8 * rand2(x, y, dice + 1));
  }
  return Float32Array.from(pathDistance(size, w.cx, w.cy, noisy, DIAG, order.subarray(0, Math.max(1, a))));
}

/** Re-orders the unexplored part of the map (from the start of ring `ring` on) by `route` at entropy `level` (no level:
 *  a legacy route), or by one [route, level] per rover slice. Explored cells keep their ranks and rings; the rest get
 *  new rings counted on from `ring`. */
export function reorder(w: World, ring: number, route: RouteId | readonly Sector[], level?: number, upto?: number, lazy = false): void {
  const n = totalCells(w);
  const a = w.rings[ring];
  if (a >= n) return;
  const sectors: readonly Sector[] | null = typeof route !== 'string' ? route : level === undefined || !ALGOS[route] ? null : [[route, level]];
  const legacy = !sectors;
  const { field, scale, cut } = !sectors
    ? { ...legacyField(w, route as RouteId, a, ring), cut: Infinity }
    : { ...algoField(w, sectors, a, ring, upto === undefined ? Infinity : upto - ring), scale: 1 };
  w.slices = sectors?.length ?? 1;
  w.slicesFrom = ring;
  const ents = (sectors ?? []).map(([r, l]) => algoEntropy(r, l));
  const slice = (i: number) => (ents.length === 1 ? 0 : sectorAt(w, i, ents.length));
  const jitterAt = (i: number) => (legacy ? 0 : ents[slice(i)][1]);
  const strayAt = (i: number) => (legacy ? 0 : ents[slice(i)][2]);
  const dice = w.seed + 733 + ring * 104729;
  const { order, size, cx, cy } = w;
  const rest = order.slice(a);
  const band = new Int32Array(rest.length);
  let lo = Infinity;
  let hi = -Infinity;
  rest.forEach((i, q) => {
    band[q] = Math.min(cut, Math.floor(field[i] * scale));
    lo = Math.min(lo, band[q]);
    hi = Math.max(hi, band[q]);
  });
  // Counting sort by band, then each band by angle around camp, alternating direction so the rovers keep walking.
  const count = new Uint32Array(hi - lo + 2);
  for (const b of band) count[b - lo + 1]++;
  for (let b = 1; b < count.length; b++) count[b] += count[b - 1];
  const fill = count.slice();
  const sorted = new Uint32Array(rest.length);
  rest.forEach((i, q) => { sorted[fill[band[q] - lo]++] = i; });
  // Angle around camp, plus the algorithm's jitter: the more entropy, the more the rovers zig-zag along a ring.
  const angle = (i: number) => { const jitter = jitterAt(i); return Math.atan2(Math.floor(i / size) - cy, (i % size) - cx) + (jitter ? jitter * (rand2(i % size, Math.floor(i / size), dice) - 0.5) : 0); };
  // Bands of an irregular field are scattered patches: walk each one cell to an adjacent cell where possible (the
  // next by angle among the neighbours), and only jump to another patch when stuck (or when the rover strays). A cell
  // is only placed once a neighbour is explored or placed, so the explored area stays one connected patch.
  const mark = legacy ? null : new Int32Array(n);
  const pos = legacy ? null : new Int32Array(n);
  const placed = legacy ? null : new Uint8Array(n);
  const queued = legacy ? null : new Int32Array(n); // band token of cells already in the ready heap
  if (placed) for (let r = 0; r < a; r++) placed[order[r]] = 1;
  const near = (i: number, f: (j: number) => void) => {
    const x = i % size;
    const y = (i - x) / size;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) f(ny * size + nx);
    }
  };
  const chain = (cells: number[], out: Uint32Array, at: number, token: number) => {
    cells.forEach((i, q) => { mark![i] = token; pos![i] = q; });
    // Cells of this band next to the placed area, by their angle order.
    const ready = new MinHeap(cells.length);
    const offer = (j: number) => { if (mark![j] === token && queued![j] !== token) { queued![j] = token; ready.push(pos![j], j); } };
    for (const i of cells) near(i, (j) => { if (placed![j] && queued![i] !== token) { queued![i] = token; ready.push(pos![i], i); } });
    let k = at;
    let cur = -1;
    while (k < at + cells.length) {
      let best = -1;
      const stray = cur >= 0 ? strayAt(cur) : 0;
      if (cur >= 0 && !(stray && rand2(cur % size, Math.floor(cur / size), dice + 5) < stray)) {
        near(cur, (j) => { if (mark![j] === token && (best < 0 || pos![j] < pos![best])) best = j; });
      }
      if (best < 0) {
        do best = ready.pop(); while (mark![best] !== token);
      }
      mark![best] = -token;
      placed![best] = 1;
      out[k++] = best;
      near(best, offer);
      cur = best;
    }
  };
  const rings = Array.from(w.rings.subarray(0, ring + 1));
  let idx = ring - 1; // ring index of the band being placed
  for (let b = 0; b < count.length - 1; b++) {
    const s0 = count[b];
    const s1 = count[b + 1];
    if (s1 === s0) continue;
    if (++idx > ring) rings.push(a + s0);
    if (lo + b >= cut) break; // the unsorted rest (see `algoField`): left as it is
    const dirn = idx % 2 ? -1 : 1;
    // Ties (cells on the same ray) go by cell index: the order must not depend on how the cells came in, or a replayed
    // plan (`applyPlan`, which sorts each entry only as far as the next one) would differ from the one played live.
    const part = Array.from(sorted.subarray(s0, s1), (i) => [i, angle(i)] as const).sort((p, q) => dirn * (p[1] - q[1]) || p[0] - q[0]);
    if (legacy) part.forEach(([i], q) => { sorted[s0 + q] = i; });
    else chain(part.map(([i]) => i), sorted, s0, b + 1);
  }
  rings.push(n);
  order.set(sorted, a);
  w.rings = Uint32Array.from(rings);
  if (!lazy) derive(w, a);
}

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DIAG = [1, 1, 1, 1, 1, 1, 1, 1];

/** Path distance (Dijkstra, 8 neighbours) from (cx, cy); moving between two cells costs the mean of their costs. */
function pathDistance(size: number, cx: number, cy: number, cost: Float32Array, mult: readonly number[] = DIAG,
  sources?: ArrayLike<number>, stop?: (d: number, i: number) => boolean, fill?: (i: number) => void): Float64Array {
  const n = size * size;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap(n);
  for (let q = 0; sources && q < sources.length; q++) { dist[sources[q]] = 0; heap.push(0, sources[q]); }
  const start = cy * size + cx;
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size) {
    const d = heap.topKey();
    const i = heap.pop();
    if (d > dist[i]) continue; // stale entry
    if (stop?.(d, i)) break; // cells not settled yet keep a distance >= d
    fill?.(i);
    const x = i % size;
    const y = (i - x) / size;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      fill?.(j);
      const nd = d + ((cost[i] + cost[j]) / 2) * (k < 4 ? 1 : SQRT2) * mult[k];
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
/** Steps needed to have the first r cells revealed, with tyre grip `grip` (1 = no tyres). */
export const stepsAt = (w: World, grip: number, r: number): number => w.stepBase[r] + grip * w.stepRough[r];

/** Steps needed to explore the whole map. */
export const totalSteps = (w: World, grip = 1): number => stepsAt(w, grip, totalCells(w));

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

/** Cells (with fraction) covered inside the arc [lo, hi) when the rover is at `t` total steps (tyre grip `grip`). */
export function cellsReached(w: World, grip: number, lo: number, hi: number, t: number): number {
  // Largest m with steps(m) <= t: cells < m are already revealed.
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = (a + b + 1) >> 1;
    if (stepsAt(w, grip, mid) <= t) a = mid;
    else b = mid - 1;
  }
  if (a >= hi) return hi - lo;
  const s0 = stepsAt(w, grip, a);
  return a - lo + Math.max(0, (t - s0) / (stepsAt(w, grip, a + 1) - s0));
}

/** Steps along the arc [lo, hi) needed to cover `reach` cells (the inverse of `cellsReached`). */
export function stepsForReach(w: World, grip: number, lo: number, hi: number, reach: number): number {
  if (reach >= hi - lo) return stepsAt(w, grip, hi) - stepsAt(w, grip, lo);
  const m = lo + Math.floor(reach);
  const s0 = stepsAt(w, grip, m);
  return s0 + (reach - Math.floor(reach)) * (stepsAt(w, grip, m + 1) - s0) - stepsAt(w, grip, lo);
}

/** Calls `fn(k, d2)` for every item (index into `itemRanks`) within `radius` cells (Euclidean) of map cell `cell`,
 *  where d2 is the squared distance. */
export function forItemsNear(w: World, cell: number, radius: number, fn: (k: number, d2: number) => void): void {
  const { size, itemStart, itemCells, itemRanks, order } = w;
  const nb = Math.ceil(size / ITEM_BUCKET);
  const x = cell % size;
  const y = Math.floor(cell / size);
  const bx0 = Math.max(0, Math.floor((x - radius) / ITEM_BUCKET));
  const bx1 = Math.min(nb - 1, Math.floor((x + radius) / ITEM_BUCKET));
  const by0 = Math.max(0, Math.floor((y - radius) / ITEM_BUCKET));
  const by1 = Math.min(nb - 1, Math.floor((y + radius) / ITEM_BUCKET));
  const r2 = radius * radius;
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const b = by * nb + bx;
      for (let q = itemStart[b]; q < itemStart[b + 1]; q++) {
        const k = itemCells[q];
        const i = order[itemRanks[k]];
        const d2 = ((i % size) - x) ** 2 + (Math.floor(i / size) - y) ** 2;
        if (d2 <= r2) fn(k, d2);
      }
    }
  }
}

/** Nearest item within `radius` of `cell` that `accept` lets through (ties: lowest index); -1 if none. */
export function nearestItem(w: World, cell: number, radius: number, accept: (k: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  forItemsNear(w, cell, radius, (k, d2) => {
    if ((d2 < bestD || (d2 === bestD && k < best)) && accept(k)) { best = k; bestD = d2; }
  });
  return best;
}

/** King (8-neighbour) distance between two map cells. */
export function kingDistance(w: World, a: number, b: number): number {
  const { size } = w;
  return Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
}

/** Number of rings (the last valid index is ringCount - 1). */
export const ringCount = (w: World): number => w.rings.length - 1;

/** First rank of each arc of ring `ring` split between `robots` (n + 1 values: the last is the ring's end). With one
 *  route per rover, each arc is as long as that rover's slice of the ring (see `sectorAt`); otherwise they are even. */
export function arcStarts(w: World, ring: number, robots: number): number[] {
  if (w.slices > 1 && robots === w.slices && ring >= w.slicesFrom) return sliceStarts(w, ring);
  const a = w.rings[ring];
  const len = w.rings[ring + 1] - a;
  const arcs = Math.max(1, Math.min(robots, len));
  const starts: number[] = [];
  for (let k = 0; k <= arcs; k++) starts.push(a + Math.floor((k * len) / arcs));
  return starts;
}

const sliceCache = new WeakMap<World, { version: number; ring: number; starts: number[] }>();
/** Arcs of a ring cut by slice: on even rings (walked by rising angle) arc k is slice k, on odd ones slice n - 1 - k. */
function sliceStarts(w: World, ring: number): number[] {
  const hit = sliceCache.get(w);
  if (hit && hit.version === w.version && hit.ring === ring) return hit.starts;
  const n = w.slices;
  const a = w.rings[ring];
  const count = new Array<number>(n).fill(0);
  for (let r = a; r < w.rings[ring + 1]; r++) count[sectorAt(w, w.order[r], n)]++;
  const starts = [a];
  for (let k = 0; k < n; k++) starts.push(starts[k] + count[arcOf(ring, k, n)]);
  sliceCache.set(w, { version: w.version, ring, starts });
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
