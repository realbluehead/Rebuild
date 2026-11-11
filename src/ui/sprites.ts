// Pixel art generat per codi: paleta pròpia, rajoles de 16×16 per terreny i sprites dibuixats amb text.
// Tot es guarda com a Uint32 en l'ordre d'ImageData (0xAABBGGRR en màquines little-endian, és a dir totes).
import { T, TERRAINS } from '../content/world';
import { hash2 } from '../core/rng';

export const TILE = 16;
export const VARIANTS = 4;
export const FRAMES = 2;

/** '#rrggbb' → píxel d'ImageData. */
export function px(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

export const PAL = {
  void: px('#0c0a12'),
  void2: px('#120f1c'),
  deep: px('#1d2b5c'), deep2: px('#243670'),
  water: px('#2f62b4'), water2: px('#3f7fd0'), foam: px('#9fd0f4'),
  sand: px('#e3c886'), sand2: px('#c8a960'),
  grass: px('#5aa53c'), grass2: px('#4a8f30'), grass3: px('#7cc450'),
  leaf: px('#2e6d2a'), leaf2: px('#22541f'), leaf3: px('#4b8f3a'), trunk: px('#6b4426'),
  hill: px('#86a04a'), hill2: px('#6c873a'), hill3: px('#a2b85e'),
  rock: px('#7a7280'), rock2: px('#5a5463'), rock3: px('#aaa2b0'),
  snow: px('#eef2f7'), snow2: px('#c5d0de'),
  gold: px('#f2c14e'), gold2: px('#b37a2a'), wood: px('#7a4a22'), wood2: px('#552f15'),
  stone: px('#9a8f84'), stone2: px('#665c55'),
  ink: px('#1b1420'),
  metal: px('#a9b4c2'), metalHi: px('#dde4ee'), hull: px('#6c7a8c'), hullHi: px('#93a2b6'),
  eye: px('#5ff0ff'), lamp: px('#ff5a4a'), lampOff: px('#6a2a2a'), tread: px('#3a3440'), tread2: px('#6a6474'),
};

/** Color pla de cada terreny, per als zooms llunyans (dos tons per variar). */
export const FLAT: readonly [number, number][] = [
  [PAL.deep, PAL.deep2],
  [PAL.water, PAL.water2],
  [PAL.sand, PAL.sand2],
  [PAL.grass, PAL.grass2],
  [PAL.leaf, PAL.leaf2],
  [PAL.hill, PAL.hill2],
  [PAL.rock, PAL.rock2],
  [PAL.snow, PAL.snow2],
];

type Sprite = { w: number; h: number; px: Uint32Array };

/** Sprite a partir de files de text; cada caràcter és una clau de `keys` ('.' = transparent). */
function sprite(rows: string[], keys: Record<string, number>): Sprite {
  const h = rows.length;
  const w = rows[0].length;
  const out = new Uint32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => { out[y * w + x] = keys[c] ?? 0; }));
  return { w, h, px: out };
}

const TREE = sprite([
  '...gGg...',
  '..gGGGg..',
  '.gGGgGGg.',
  'gGGGGGgGg',
  'gGgGGGGGg',
  '.gGGGgGg.',
  '..ggGgg..',
  '....t....',
  '....t....',
], { g: PAL.leaf2, G: PAL.leaf, t: PAL.trunk });

const PEAK = sprite([
  '......r.......',
  '.....rRr......',
  '....rRRrr.....',
  '...rRRRrrr....',
  '..rRRRrrrrr...',
  '.rRRRrrrrrrr..',
  'rRRrrrrrrrrrr.',
], { r: PAL.rock2, R: PAL.rock3 });

const SNOWPEAK = sprite([
  '......s.......',
  '.....sSs......',
  '....sSSss.....',
  '...rSSsrr.....',
  '..rRRrrrrr....',
  '.rRRRrrrrrr...',
  'rRRrrrrrrrrr..',
], { r: PAL.rock2, R: PAL.rock3, s: PAL.snow2, S: PAL.snow });

const BUMP = sprite([
  '..hHHh..',
  '.hHHHhh.',
  'hHHhhhhh',
], { h: PAL.hill2, H: PAL.hill3 });

/** Cofre obert (ja descobert). */
const CHEST = sprite([
  '.kkkkkkkk.',
  'kyyyyyyyyk',
  'kwYYYYYYwk',
  'kkkkkkkkkk',
  'kwwwyywwwk',
  'kwwwkkwwwk',
  'kwwwwwwwwk',
  '.kkkkkkkk.',
], { k: PAL.ink, y: PAL.gold, Y: PAL.gold2, w: PAL.wood });

const RUINS = sprite([
  's.......s.',
  'sS.....sS.',
  'sS..s..sS.',
  'sS.sS..sS.',
  'sSssSsssSs',
  'SSSSSSSSSS',
], { s: PAL.stone, S: PAL.stone2 });

/** Robot explorador amb erugues, mirant a la dreta (es gira en dibuixar-lo). Dos fotogrames: erugues i llum de l'antena. */
const ROBOT_ROWS = [
  [
    '.....a.....',
    '.....k.....',
    '..kkkkkkk..',
    '..kMmmmmk..',
    '..kmmmEEk..',
    '..kmmmmmk..',
    '.kkkkkkkkk.',
    '.kBbbbbbbk.',
    '.kbbbyybbk.',
    '.kkkkkkkkk.',
    '.kTtTtTtTk.',
    '..kkkkkkk..',
  ],
  [
    '.....o.....',
    '.....k.....',
    '..kkkkkkk..',
    '..kMmmmmk..',
    '..kmmmEEk..',
    '..kmmmmmk..',
    '.kkkkkkkkk.',
    '.kBbbbbbbk.',
    '.kbbbyybbk.',
    '.kkkkkkkkk.',
    '.ktTtTtTtk.',
    '..kkkkkkk..',
  ],
];
const ROBOT_KEYS = {
  k: PAL.ink, a: PAL.lamp, o: PAL.lampOff, m: PAL.metal, M: PAL.metalHi, E: PAL.eye,
  b: PAL.hull, B: PAL.hullHi, y: PAL.gold, T: PAL.tread, t: PAL.tread2,
};

function stamp(dst: Uint32Array, sp: Sprite, ox: number, oy: number): void {
  for (let y = 0; y < sp.h; y++) {
    for (let x = 0; x < sp.w; x++) {
      const c = sp.px[y * sp.w + x];
      const tx = ox + x;
      const ty = oy + y;
      if (c && tx >= 0 && ty >= 0 && tx < TILE && ty < TILE) dst[ty * TILE + tx] = c;
    }
  }
}

/** Rajola base d'un terreny (sense objectes a sobre). */
function baseTile(t: number, v: number, frame: number): Uint32Array {
  const tile = new Uint32Array(TILE * TILE);
  const r = (x: number, y: number, k = 0) => hash2(x + v * 31, y + k * 17, 900 + t) / 4294967296;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c: number;
      switch (t) {
        case T.Deep:
          c = r(x, y) < 0.08 ? PAL.deep2 : PAL.deep;
          if ((y + v * 5) % 8 === frame * 4 && (x + y + v) % 7 < 3) c = PAL.deep2;
          break;
        case T.Water:
          c = r(x, y) < 0.1 ? PAL.water2 : PAL.water;
          if ((y + v * 3) % 6 === frame * 3 && (x + v * 2 + frame * 2) % 8 < 3) c = PAL.foam;
          break;
        case T.Sand:
          c = r(x, y) < 0.15 ? PAL.sand2 : PAL.sand;
          break;
        case T.Snow:
          c = r(x, y) < 0.12 ? PAL.snow2 : PAL.snow;
          break;
        case T.Hill:
          c = r(x, y) < 0.12 ? PAL.hill2 : PAL.hill;
          break;
        case T.Mountain:
          c = r(x, y) < 0.15 ? PAL.rock2 : PAL.hill2;
          break;
        default: { // prat i bosc
          const q = r(x, y);
          c = q < 0.1 ? PAL.grass2 : q < 0.16 ? PAL.grass3 : PAL.grass;
          if (t === T.Forest) c = q < 0.2 ? PAL.leaf3 : PAL.grass2;
        }
      }
      tile[y * TILE + x] = c;
    }
  }
  // Brins d'herba o flors al prat.
  if (t === T.Grass && v % 2 === 0) { tile[5 * TILE + 4] = PAL.grass3; tile[4 * TILE + 4] = PAL.grass3; tile[11 * TILE + 10] = PAL.gold; }
  return tile;
}

function decoratedTile(t: number, v: number, frame: number): Uint32Array {
  const tile = baseTile(t, v, frame);
  if (t === T.Forest) {
    stamp(tile, TREE, 0 + (v & 1) * 2, 1);
    stamp(tile, TREE, 7 - (v & 1), 6 + (v >> 1));
  } else if (t === T.Hill) {
    stamp(tile, BUMP, 1 + v, 4);
    stamp(tile, BUMP, 7, 10 - v);
  } else if (t === T.Mountain) {
    stamp(tile, PEAK, 1 + (v & 1), 4 + (v >> 1) * 2);
  } else if (t === T.Snow) {
    stamp(tile, SNOWPEAK, 1 + (v & 1), 4 + (v >> 1) * 2);
  }
  return tile;
}

/**
 * Atles: atlas[frame][index] és una rajola de TILE×TILE.
 * index = t * VARIANTS + v per al terreny, i SPECIAL_BASE + t per al lloc especial sobre el terreny t.
 */
export const SPECIAL_BASE = TERRAINS.length * VARIANTS;

export function buildAtlas(): Uint32Array[][] {
  const frames: Uint32Array[][] = [];
  for (let f = 0; f < FRAMES; f++) {
    const tiles: Uint32Array[] = [];
    for (let t = 0; t < TERRAINS.length; t++) for (let v = 0; v < VARIANTS; v++) tiles.push(decoratedTile(t, v, f));
    for (let t = 0; t < TERRAINS.length; t++) {
      const tile = baseTile(t, 0, f);
      if (t >= T.Hill) stamp(tile, RUINS, 3, 6);
      else stamp(tile, CHEST, 3, 5);
      tiles.push(tile);
    }
    frames.push(tiles);
  }
  return frames;
}

/** Sprite → canvas (per dibuixar amb drawImage). */
export function spriteCanvas(sp: Sprite): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sp.w;
  c.height = sp.h;
  const img = new ImageData(new Uint8ClampedArray(sp.px.slice().buffer), sp.w, sp.h);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Campament base: cúpula amb porta il·luminada i antena (dos fotogrames: el llum de l'antena parpelleja). */
const CAMP_ROWS = (lamp: string) => [
  `..........${lamp}...........`,
  '..........k...........',
  '.......kkkkkkkk.......',
  '.....kkMMmmmmmmkk.....',
  '....kMMmmmmmmmmmmk....',
  '...kMmmmmmmmmmmmmmk...',
  '..kMmmmmmmmmmmmmmmmk..',
  '..kmmmmkkkkkkkkmmmmk..',
  '.kmmmmmkddyddddkmmmmk.',
  '.kmmmmmkdddddddkmmmmk.',
  '.kbbbbbkdddddddkbbbbk.',
  'kkkkkkkkkkkkkkkkkkkkkk',
];
const CAMP_KEYS = { k: PAL.ink, a: PAL.lamp, o: PAL.lampOff, m: PAL.metal, M: PAL.metalHi, b: PAL.hull, d: px('#2a2238'), y: PAL.gold };
export const campFrames = (): HTMLCanvasElement[] => ['a', 'o'].map((l) => spriteCanvas(sprite(CAMP_ROWS(l), CAMP_KEYS)));

export const robotFrames = (): HTMLCanvasElement[] => ROBOT_ROWS.map((rows) => spriteCanvas(sprite(rows, ROBOT_KEYS)));

export const COIN = sprite([
  '..kkkk..',
  '.kyyyyk.',
  'kyYyyyyk',
  'kyYyyYyk',
  'kyYyyYyk',
  'kyyyyYyk',
  '.kyyyyk.',
  '..kkkk..',
], { k: PAL.ink, y: PAL.gold, Y: PAL.gold2 });
