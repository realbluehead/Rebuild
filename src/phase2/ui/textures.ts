// Small pixel-art textures for the desert scene, drawn once on canvases (nearest filtering, so texels stay crisp
// squares like the rest of the low-resolution render): sand with grain and wind ripples, metal plates with seams,
// rivets and rust streaks, cracked concrete, and a soft round shadow for where things meet the sand. Mostly greys, so
// a material's colour (or the ground's vertex colours) tints them.
import { CanvasTexture, NearestFilter, NearestMipmapNearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** A seeded random number generator (the same texture every time). */
function random(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasTexture(n: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed: number, pixel = true): Texture {
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  if (g) draw(g, random(seed));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  if (pixel) { t.magFilter = NearestFilter; t.minFilter = NearestMipmapNearestFilter; }
  return t;
}

/** Shade of grey `v` (0..255) as a CSS colour. */
const grey = (v: number) => { const k = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${k},${k},${k})`; };

const cache = new Map<string, Texture>();
const once = (key: string, make: () => Texture): Texture => {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
};

/** The sand's colours (moonlit): in the hollows, on the crests, and along the lanes between plots. */
export const SAND_LOW = '#56567e';
export const SAND_HIGH = '#78769a';
export const SAND_LANE = '#46465e';

/** Sand: grain, wind ripples running across, and a few pebbles. One tile is `SAND_TILE` world units. */
export const SAND_TILE = 8;
export const sandTexture = () => once('sand', () => canvasTexture(32, (g, rnd) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const ripple = Math.sin(((x + y * 0.35) / 32) * Math.PI * 2 * 4) > 0.75 ? 22 : 0; // (4 ripples per tile, seamless)
    g.fillStyle = grey(236 + (rnd() - 0.5) * 30 - ripple);
    g.fillRect(x, y, 1, 1);
  }
  for (let k = 0; k < 7; k++) { // pebbles: a dark texel with a lit one above
    const x = Math.floor(rnd() * 32), y = Math.floor(rnd() * 31);
    g.fillStyle = grey(120); g.fillRect(x, y + 1, 1, 1);
    g.fillStyle = grey(255); g.fillRect(x, y, 1, 1);
  }
}, 3));

/** Metal plating: plates with dark seams, rivets along them, scratches and rust streaks running down. */
export const metalTexture = (rust = 0.5) => once(`metal${rust}`, () => canvasTexture(32, (g, rnd) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = grey(205 + (rnd() - 0.5) * 22); g.fillRect(x, y, 1, 1); }
  g.fillStyle = grey(225); g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16); // plates lit a little differently
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (x % 16 === 0 || y % 16 === 0) { g.fillStyle = grey(95); g.fillRect(x, y, 1, 1); }
    else if ((x % 16 === 2 || x % 16 === 14) && y % 4 === 2) { g.fillStyle = grey(255); g.fillRect(x, y, 1, 1); g.fillStyle = grey(130); g.fillRect(x, y + 1, 1, 1); }
  }
  for (let k = 0; k < 6; k++) { // scratches
    const x = Math.floor(rnd() * 32), y = Math.floor(rnd() * 32);
    g.fillStyle = grey(240); g.fillRect(x, y, 2 + Math.floor(rnd() * 3), 1);
  }
  for (let k = 0; k < Math.round(rust * 8); k++) { // rust streaks running down from the seams
    const x = Math.floor(rnd() * 32), y0 = (Math.floor(rnd() * 2) * 16 + 1), len = 3 + Math.floor(rnd() * 9);
    for (let y = 0; y < len; y++) {
      g.fillStyle = `rgba(150,70,30,${0.55 * (1 - y / len)})`;
      g.fillRect(x, y0 + y, 1, 1);
    }
  }
}, 5 + Math.round(rust * 10)));

/** Concrete: speckled, with a couple of cracks and stains. */
export const concreteTexture = () => once('concrete', () => canvasTexture(32, (g, rnd) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = grey(200 + (rnd() - 0.5) * 40); g.fillRect(x, y, 1, 1); }
  for (let k = 0; k < 3; k++) { // stains
    g.fillStyle = 'rgba(60,50,40,0.18)';
    g.beginPath(); g.arc(rnd() * 32, rnd() * 32, 3 + rnd() * 5, 0, 7); g.fill();
  }
  for (let k = 0; k < 2; k++) { // cracks: a wandering line
    let x = rnd() * 32, y = rnd() * 32;
    g.fillStyle = grey(80);
    for (let s = 0; s < 14; s++) { g.fillRect(Math.floor(x) & 31, Math.floor(y) & 31, 1, 1); x += rnd() * 2 - 0.5; y += rnd() * 2 - 1; }
  }
}, 9));

/** A copy of `map` repeated `x` × `y` times over a face (it shares the image; marked so it can be disposed). */
export function repeated(map: Texture, x: number, y: number): Texture {
  const t = map.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  t.userData.copy = true;
  return t;
}

/** A soft round shadow (an alpha map: white in the middle fading to black at the edge). */
export const shadowTexture = () => once('shadow', () => canvasTexture(64, (g) => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.55, '#999'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
}, 1, false));
