// El món es genera a partir del seed i no es desa mai. L'exploració està precalculada com un ordre:
// la casella de rang r es descobreix després de les r anteriors. L'estat de la partida és un sol número
// (`walked`, passos fets pels robots) i el progrés offline és exacte i instantani.
//
// L'ordre surt d'una expansió des del campament (Dijkstra): cada casella té un cost segons el terreny i una
// mica de soroll, i la "distància de camí" D creix des del centre. Es recorre per franges de D (anells) i,
// dins de cada franja, per angle, en sentit alternat perquè els robots caminin. Com que travessar una casella
// costa ≥ 1, el predecessor de qualsevol casella és d'una franja anterior: la zona explorada sempre és
// una sola taca connectada, sense illes ni forats negres.
//
// Amb diversos robots, cada anell es reparteix en arcs (un per robot) i tots avancen alhora pel seu arc.
// Un robot només pot descobrir la casella del costat: si la següent de l'ordre no és contigua, primer hi
// camina per terra ja coneguda (passos sense descobrir res). El temps es compta en passos, i una casella
// compta com a descoberta quan el robot hi ha arribat (no quan hi comença a anar).
import { DIST_VALUE_SCALE, MAP_SIZE, SPECIAL_CHANCE, SPECIAL_MULT, T, TERRAINS, ZOOMS, ZOOM_UNLOCK_FRACTION } from '../content/world';
import { fbm, rand2 } from './rng';

export interface World {
  seed: number;
  size: number;
  /** Casella inicial (centre del mapa). */
  cx: number;
  cy: number;
  /** Terreny de cada casella (índex a TERRAINS), per files: i = y * size + x. */
  terrain: Uint8Array;
  /** 1 si la casella té un lloc especial. */
  special: Uint8Array;
  /** order[r] = casella que es descobreix en la posició r. */
  order: Uint32Array;
  /** rank[i] = posició en què es descobreix la casella i. */
  rank: Uint32Array;
  /** goldPrefix[r] = or de les r primeres caselles (sense multiplicadors). */
  goldPrefix: Float64Array;
  /** rings[k] = primer rang de l'anell k; l'últim element és el total de caselles. */
  rings: Uint32Array;
  /** steps[r] = passos necessaris per tenir descobertes les r primeres caselles (n + 1 valors). */
  steps: Float64Array;
  /** ringSteps[k] = steps[rings[k]]: passos on comença cada anell. */
  ringSteps: Float64Array;
  /** Per a cada zoom: rangs ordenats de les caselles del seu quadrat (per saber-ne el % descobert). */
  zoomRanks: Uint32Array[];
}

/** Quant varia el cost de travessar (soroll), perquè el contorn sigui orgànic. */
const COST_NOISE = 0.7;

export function createWorld(seed: number, size = MAP_SIZE): World {
  const n = size * size;
  const cx = size >> 1;
  const cy = size >> 1;
  const half = size / 2;
  const terrain = new Uint8Array(n);
  const special = new Uint8Array(n);
  const value = new Float32Array(n);
  const cost = new Float32Array(n);
  const angle = new Float32Array(n);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);

      // Terreny: alçada amb un continent al mig (terra a l'inici, mar a les vores).
      let h = fbm(x, y, seed, 160, 5);
      // Al voltant de l'inici s'estira l'alçada cap a prat, perquè es comenci en terra amable.
      const home = Math.max(0, 1 - d / 36);
      h += (0.47 - h) * home * home;
      h -= 0.9 * Math.max(0, d / half - 0.72);
      const wet = fbm(x, y, seed + 99, 90, 3);
      const t =
        h < 0.31 ? T.Deep :
        h < 0.385 ? T.Water :
        h < 0.41 ? T.Sand :
        h < 0.55 ? (wet > 0.53 ? T.Forest : T.Grass) :
        h < 0.61 ? (wet > 0.6 ? T.Forest : T.Hill) :
        h < 0.67 ? T.Mountain : T.Snow;
      terrain[i] = t;
      const sp = t >= T.Sand && rand2(x, y, seed + 7) < SPECIAL_CHANCE && d > 3;
      special[i] = sp ? 1 : 0;
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

  // Ordenació per comptatge d'anells i, dins de cada anell, per angle. L'anell es recorre en sentit
  // alternat perquè el final d'un quedi a prop del començament del següent (l'explorador camina).
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

  if (order[0] !== cy * size + cx) throw new Error('El campament ha de ser la primera casella');

  // Passos: per arribar a la casella r cal anar des de la r - 1 (distància de rei: 1 si és contigua).
  const steps = new Float64Array(n + 1);
  steps[1] = 1; // el campament mateix
  for (let r = 1; r < n; r++) {
    const p = order[r - 1];
    const q = order[r];
    const d = Math.max(Math.abs((p % size) - (q % size)), Math.abs(Math.floor(p / size) - Math.floor(q / size)));
    steps[r + 1] = steps[r] + d;
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

  return { seed, size, cx, cy, terrain, special, order, rank, goldPrefix, rings: count, steps, ringSteps, zoomRanks };
}

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Distància de camí (Dijkstra, 8 veïns) des de (cx, cy); travessar entre dues caselles costa la mitjana dels seus costos. */
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
    if (d > dist[i]) continue; // entrada antiga
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

/** Cua de prioritat binària amb arrays tipats (creix si cal). */
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
/** Passos que calen per explorar tot el mapa. */
export const totalSteps = (w: World): number => w.steps[totalCells(w)];

/** Or (sense multiplicadors) de les caselles entre les posicions a i b (fraccions incloses). */
export function goldBetween(w: World, a: number, b: number): number {
  return prefixAt(w, b) - prefixAt(w, a);
}

/** Anell on són els robots després de `walked` passos (el darrer si ja s'ha acabat). */
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

/** Caselles (amb fracció) recorregudes dins de l'arc [lo, hi) quan el robot porta `t` passos del total. */
function cellsReached(w: World, lo: number, hi: number, t: number): number {
  const st = w.steps;
  // m més gran amb steps[m] <= t: les caselles < m ja estan descobertes.
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

/** Com va l'anell actual: on comença i acaba, i fins on ha arribat cada arc (un per robot). */
export interface RingProgress {
  ring: number;
  a: number;
  b: number;
  /** starts[k] = primer rang de l'arc k (n + 1 valors: l'últim és b). */
  starts: number[];
  /** reach[k] = caselles recorregudes (amb fracció) dins de l'arc k. */
  reach: number[];
}

export function ringProgress(w: World, walked: number, robots: number): RingProgress {
  const ring = ringAt(w, walked);
  const a = w.rings[ring];
  const b = w.rings[ring + 1];
  const len = b - a;
  const arcs = Math.max(1, Math.min(robots, len));
  // Tots els robots fan la mateixa fracció dels passos del seu arc.
  const A = w.ringSteps[ring];
  const B = w.ringSteps[ring + 1];
  const frac = B > A ? Math.min(1, Math.max(0, (walked - A) / (B - A))) : 1;
  const starts: number[] = [];
  for (let k = 0; k <= arcs; k++) starts.push(a + Math.floor((k * len) / arcs));
  const reach = starts.slice(0, -1).map((st, k) => {
    const s0 = w.steps[st];
    return cellsReached(w, st, starts[k + 1], s0 + frac * (w.steps[starts[k + 1]] - s0));
  });
  return { ring, a, b, starts, reach };
}

/** Caselles descobertes (amb fracció) després de `walked` passos. */
export function cellsExplored(w: World, walked: number, robots: number): number {
  const p = ringProgress(w, walked, robots);
  return p.a + p.reach.reduce((x, y) => x + y, 0);
}

/** Or (sense multiplicadors) de tot el que s'ha recorregut: anells sencers + el tros de cada arc. */
export function revealedGold(w: World, walked: number, robots: number): number {
  const p = ringProgress(w, walked, robots);
  let g = w.goldPrefix[p.a];
  for (let k = 0; k < p.reach.length; k++) g += prefixAt(w, p.starts[k] + p.reach[k]) - w.goldPrefix[p.starts[k]];
  return g;
}

/** Llocs especials als quals un robot ha arribat entre dos moments (robots0 a l'anell inicial, robots1 al final). */
export function revealedSpecials(w: World, e0: number, e1: number, robots0: number, robots1: number): number[] {
  const p0 = ringProgress(w, e0, robots0);
  const p1 = ringProgress(w, e1, robots1);
  const out: number[] = [];
  const arcs = (p: RingProgress, from: (k: number) => number, to: (k: number) => number) => {
    for (let k = 0; k < p.reach.length; k++) out.push(...specialsBetween(w, p.starts[k] + from(k), p.starts[k] + to(k)));
  };
  if (p0.ring === p1.ring) {
    arcs(p1, (k) => Math.floor(p0.reach[k] ?? 0), (k) => Math.floor(p1.reach[k]));
  } else {
    arcs(p0, (k) => Math.floor(p0.reach[k]), (k) => p0.starts[k + 1] - p0.starts[k]);
    out.push(...specialsBetween(w, p0.b, p1.a));
    arcs(p1, () => 0, (k) => Math.floor(p1.reach[k]));
  }
  return out;
}

function prefixAt(w: World, r: number): number {
  const n = totalCells(w);
  if (r <= 0) return 0;
  if (r >= n) return w.goldPrefix[n];
  const i = Math.floor(r);
  return w.goldPrefix[i] + (w.goldPrefix[i + 1] - w.goldPrefix[i]) * (r - i);
}

/** Fracció descoberta del quadrat del zoom `z` (0-based) quan s'han explorat `explored` caselles. */
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

/** Caselles explorades necessàries per desbloquejar el zoom z + 1. */
export function unlockAt(w: World, z: number): number {
  const ranks = w.zoomRanks[z];
  return ranks[Math.max(0, Math.ceil(ranks.length * ZOOM_UNLOCK_FRACTION) - 1)] + 1;
}

/** Posicions (rangs) de llocs especials entre a (inclòs) i b (exclòs). */
export function specialsBetween(w: World, a: number, b: number): number[] {
  const out: number[] = [];
  const end = Math.min(Math.floor(b), totalCells(w));
  for (let r = Math.max(0, Math.floor(a)); r < end; r++) if (w.special[w.order[r]]) out.push(r);
  return out;
}
