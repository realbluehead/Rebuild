// Atzar determinista: el mateix seed dona sempre el mateix mapa (el mapa no es desa, es regenera).

/** Hash enter de 32 bits per a (x, y, seed). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Nombre a [0, 1) per a (x, y, seed). */
export const rand2 = (x: number, y: number, seed: number): number => hash2(x, y, seed) / 4294967296;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Soroll de valor suau a [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = rand2(x0, y0, seed);
  const b = rand2(x0 + 1, y0, seed);
  const c = rand2(x0, y0 + 1, seed);
  const d = rand2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Soroll fractal (diverses octaves) a [0, 1). `scale` és la mida en caselles de la primera octava. */
export function fbm(x: number, y: number, seed: number, scale: number, octaves = 5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Seed aleatori per a una partida nova. */
export function randomSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}
