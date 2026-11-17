// The star map: 16 systems in 4 rings round the home star, made from phase I's seed (regenerated, never saved). Probes
// study each system three times (first its star and kind, then samples, then whether it can be lived on); one far
// system is habitable: the ship's destination.
import { rng, shuffle } from './rng';

export type SampleKind = 'ice' | 'iron' | 'carbon' | 'crystal' | 'plasma';
export const SAMPLE_KINDS: SampleKind[] = ['ice', 'iron', 'carbon', 'crystal', 'plasma'];
export type StarKind = 'red dwarf' | 'orange dwarf' | 'yellow star' | 'white star' | 'blue giant';
const STARS: StarKind[] = ['red dwarf', 'orange dwarf', 'yellow star', 'white star', 'blue giant'];

export interface StarSystem {
  id: number;
  name: string;
  /** 0 (nearest) .. 3 (farthest). */
  ring: number;
  /** Distance from home, light years, and where it is on the map (radians). */
  distance: number;
  angle: number;
  star: StarKind;
  /** What its samples are. */
  kind: SampleKind;
  habitable: boolean;
}

/** Distances of each ring, light years. */
export const RINGS: [number, number][] = [[4, 7], [10, 20], [25, 45], [50, 90]];
export const PER_RING = 4;
/** A probe brings samples back once its system has this many studies (the first tells its kind). */
export const SAMPLES_FROM = 2;
/** Studies that tell all about a system (1: its star and kind; 2: samples; 3: whether it can be lived on). */
export const STUDIES = 3;

const SYLLABLES = ['ka', 'lo', 'mi', 'ter', 'van', 'sa', 'rii', 'ul', 'zen', 'dor', 'ae', 'bel', 'nox', 'qua', 'tis', 'or', 'el', 'run'];

const cache = new Map<number, StarSystem[]>();

/** The star map for phase I's seed. */
export function starMap(seed: number): StarSystem[] {
  const hit = cache.get(seed);
  if (hit) return hit;
  const r = rng(seed ^ 0x5eed5);
  // Every kind of sample within the first three rings (the ship needs them all), the rest at random.
  const near = shuffle([...SAMPLE_KINDS, ...Array.from({ length: 3 * PER_RING - SAMPLE_KINDS.length }, () => SAMPLE_KINDS[Math.floor(r() * 5)])], r);
  const names = new Set<string>();
  const name = (): string => {
    for (;;) {
      const n = Array.from({ length: 2 + Math.floor(r() * 2) }, () => SYLLABLES[Math.floor(r() * SYLLABLES.length)]).join('');
      const pretty = n[0].toUpperCase() + n.slice(1) + (r() < 0.3 ? ` ${['II', 'IV', 'b', 'Prime'][Math.floor(r() * 4)]}` : '');
      if (!names.has(pretty)) { names.add(pretty); return pretty; }
    }
  };
  const home = Math.floor(r() * PER_RING);
  const out: StarSystem[] = [];
  for (let ring = 0; ring < RINGS.length; ring++) {
    const [lo, hi] = RINGS[ring];
    const turn = r() * Math.PI * 2;
    for (let k = 0; k < PER_RING; k++) {
      const id = out.length;
      // The first system is close enough for the first telescope and probe.
      const distance = ring === 0 && k === 0 ? lo + r() * 0.8 : lo + r() * (hi - lo);
      out.push({
        id,
        name: name(),
        ring,
        distance: Math.round(distance * 10) / 10,
        angle: turn + (k / PER_RING) * Math.PI * 2 + (r() - 0.5) * 0.9,
        star: STARS[Math.floor(r() * STARS.length)],
        kind: ring < 3 ? near[id] : SAMPLE_KINDS[Math.floor(r() * 5)],
        habitable: ring === 3 && k === home,
      });
    }
  }
  const destination = out.find((x) => x.habitable)!;
  destination.star = 'yellow star';
  cache.set(seed, out);
  return out;
}

/** The habitable system. */
export const destinationOf = (seed: number): StarSystem => starMap(seed).find((x) => x.habitable)!;
