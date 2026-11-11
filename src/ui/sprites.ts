// Code-generated pixel art: own palette, 16x16 tiles per terrain and sprites drawn as text.
// Everything is stored as Uint32 in ImageData order (0xAABBGGRR on little-endian machines, i.e. all of them).
import { T, TERRAINS } from '../content/world';
import { hash2 } from '../core/rng';

export const TILE = 16;
export const VARIANTS = 8;
export const FRAMES = 2;

/** '#rrggbb' -> ImageData pixel. */
export function px(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

export const PAL = {
  void: px('#0c0a12'),
  void2: px('#120f1c'),
  // Dark water and toxic water
  abyss: px('#141d20'), abyss2: px('#1b2a2b'), oil: px('#3a3550'),
  toxic: px('#355f33'), toxic2: px('#41743a'), glow: px('#9cff57'),
  // Rubble
  rubble: px('#7d746a'), rubble2: px('#655d55'), rubble3: px('#a39888'), rust: px('#8a4a2a'),
  // Streets
  asphalt: px('#4a4a54'), asphalt2: px('#3e3e47'), crack: px('#25252b'),
  weed: px('#5d8c3a'), weed2: px('#7cb14a'),
  // Urban jungle
  jungle: px('#355e27'), jungle2: px('#2a4c1f'), leaf: px('#2e6d2a'), leaf2: px('#1f4f1c'), leaf3: px('#5e9c3c'), trunk: px('#5a3a22'),
  // Blocks and towers
  concrete: px('#9a958c'), concrete2: px('#77726b'), shade: px('#4f4b49'), window: px('#23212a'),
  tower: px('#7c7888'), tower2: px('#5f5b6b'), glass: px('#5f8696'), glass2: px('#88b4c2'),
  // Dump
  dirt: px('#5b4a30'), dirt2: px('#4a3c26'), barrel: px('#c9a227'), barrel2: px('#8c6f16'), sludge: px('#6fd23a'),
  // Rusted cars
  car: px('#8c5a3a'), car2: px('#6a3f28'),
  gold: px('#f2c14e'), gold2: px('#b37a2a'),
  // Bluetreri: the invented blue mineral (the game's currency)
  blu: px('#5fd0ff'), blu2: px('#2f7fd8'), bluHi: px('#d8f6ff'), wood: px('#7a4a22'), wood2: px('#552f15'),
  stone: px('#9a8f84'), stone2: px('#665c55'),
  ink: px('#1b1420'),
  metal: px('#a9b4c2'), metalHi: px('#dde4ee'), hull: px('#6c7a8c'), hullHi: px('#93a2b6'),
  eye: px('#5ff0ff'), lamp: px('#ff5a4a'), lampOff: px('#6a2a2a'), tread: px('#3a3440'), tread2: px('#6a6474'),
};

/** Flat colour of each terrain, for the far zooms (two shades for variety). */
export const FLAT: readonly [number, number][] = [
  [PAL.abyss, PAL.abyss2],
  [PAL.toxic, PAL.toxic2],
  [PAL.rubble, PAL.rubble2],
  [PAL.asphalt, PAL.asphalt2],
  [PAL.jungle, PAL.leaf2],
  [PAL.concrete2, PAL.shade],
  [PAL.tower, PAL.tower2],
  [PAL.dirt, px('#6f8a2a')],
];

type Sprite = { w: number; h: number; px: Uint32Array };

/** Sprite from text rows; each character is a key of `keys` ('.' = transparent). */
function sprite(rows: string[], keys: Record<string, number>): Sprite {
  const h = rows.length;
  const w = rows[0].length;
  const out = new Uint32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => { out[y * w + x] = keys[c] ?? 0; }));
  return { w, h, px: out };
}

/** Wild tree (urban jungle). */
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

/** Abandoned rusted car. */
const CAR = sprite([
  '..kkkk..',
  '.kwwwwk.',
  'kCCCCCCk',
  'kcCCCCck',
  '.k.kk.k.',
], { k: PAL.ink, w: PAL.window, C: PAL.car, c: PAL.car2 });

/** The same car, swallowed by vegetation. */
const CAR_OVERGROWN = sprite([
  '..lkkL..',
  '.kwLlwk.',
  'kCClCLCk',
  'LcCCLCcl',
  '.l.kk.L.',
], { k: PAL.ink, w: PAL.window, C: PAL.car, c: PAL.car2, l: PAL.leaf, L: PAL.leaf3 });

/** Low ruined building: a facade with empty windows and a caved-in roof. */
const BUILDING = sprite([
  '.L.....L..',
  '.LL...LLL.',
  'LLLL.LLLLd',
  'LkkLLkkLLd',
  'LkkLLkkLLd',
  'LLLLLLLLLd',
  'LkkLLkLLLd',
  'LkkLLkkLLd',
  'LLLLLLLLLd',
  'rrLLkkLrrd',
  '.rrrrrrrr.',
], { L: PAL.concrete, k: PAL.window, d: PAL.shade, r: PAL.rubble3 });

/** The same, with climbing ivy. */
const BUILDING_VINES = sprite([
  '.L.....l..',
  '.LL...LlL.',
  'LLLL.LLlLd',
  'LkkLLkklld',
  'lkkLLkkLLd',
  'lLLLLLLLld',
  'LlkLLkLLLd',
  'LlkLLkkLLd',
  'LlLLLLLLld',
  'rlLLkkLrld',
  '.rrrrrrrr.',
], { L: PAL.concrete, k: PAL.window, d: PAL.shade, r: PAL.rubble3, l: PAL.leaf3 });

/** Cracked tower: glass windows (some blown out) and a broken top. */
const TOWER = sprite([
  '..T......',
  '..TT..T..',
  '.TTTT.TT.',
  '.TgTgTkTd',
  '.TTTTTTTd',
  '.TgTkTgTd',
  '.TTTTTTTd',
  '.TkTgTGTd',
  '.TTTTTTTd',
  '.TgTgTkTd',
  '.TTTTTTTd',
  '.TGTkTgTd',
  '.TTTTTTTd',
  'rrTTkTTrd',
  'rrrrrrrr.',
], { T: PAL.tower, g: PAL.glass, G: PAL.glass2, k: PAL.window, d: PAL.tower2, r: PAL.rubble2 });

/** Toxic waste barrel. */
const BARREL = sprite([
  'kbbk',
  'bBBb',
  'kkkk',
  'bBBb',
  'bBBb',
  'kbbk',
], { k: PAL.ink, b: PAL.barrel2, B: PAL.barrel });

/** Tipped-over barrel. */
const BARREL_SIDE = sprite([
  'kbkbbk',
  'bBkBBg',
  'kbkbbk',
], { k: PAL.ink, b: PAL.barrel2, B: PAL.barrel, g: PAL.sludge });

/** Big slab of rubble with rusted rebar. */
const SLAB = sprite([
  '..x...',
  '.RRx..',
  'RRrRR.',
  'rRRrRr',
], { R: PAL.rubble3, r: PAL.rubble2, x: PAL.rust });

/** Bluetreri deposit: blue crystals growing out of the ground. */
const CHEST = sprite([
  '....kk....',
  '...kHbk...',
  '.k.kbBk.k.',
  'kHkkbBkkbk',
  'kbBkbBkHBk',
  'kbBkBBkbBk',
  '.kkkkkkkk.',
], { k: PAL.ink, b: PAL.blu, B: PAL.blu2, H: PAL.bluHi });

const RUINS = sprite([
  's.......s.',
  'sS.....sS.',
  'sS..s..sS.',
  'sS.sS..sS.',
  'sSssSsssSs',
  'SSSSSSSSSS',
], { s: PAL.stone, S: PAL.stone2 });

/** Tracked explorer rover, facing right (flipped when drawn). Two frames: tracks and antenna light. */
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

/** Base tile of a terrain (nothing stamped on it). */
function baseTile(t: number, v: number, frame: number): Uint32Array {
  const tile = new Uint32Array(TILE * TILE);
  const r = (x: number, y: number, k = 0) => hash2(x + v * 31, y + k * 17, 900 + t) / 4294967296;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const q = r(x, y);
      let c: number;
      switch (t) {
        case T.Abyss:
          // Black water with drifting oil slicks.
          c = q < 0.08 ? PAL.abyss2 : PAL.abyss;
          if ((y + v * 5) % 8 === frame * 4 && (x + y + v) % 9 < 2) c = PAL.oil;
          break;
        case T.Toxic:
          // Greenish water with glowing bubbles (that move between frames).
          c = q < 0.14 ? PAL.toxic2 : PAL.toxic;
          if (r(x, y, 3 + frame) < 0.025) c = PAL.glow;
          break;
        case T.Rubble:
          c = q < 0.2 ? PAL.rubble2 : q < 0.3 ? PAL.rubble3 : PAL.rubble;
          if (q > 0.985) c = PAL.rust;
          break;
        case T.Street:
          // Cracked asphalt with weeds.
          c = q < 0.12 ? PAL.asphalt2 : PAL.asphalt;
                    break;
        case T.Jungle:
          c = q < 0.18 ? PAL.leaf3 : q < 0.4 ? PAL.jungle2 : PAL.jungle;
          break;
        case T.Ruins:
          c = q < 0.25 ? PAL.rubble2 : q < 0.35 ? PAL.rubble3 : PAL.concrete2;
          if (q > 0.97) c = PAL.weed;
          break;
        case T.Towers:
          c = q < 0.2 ? PAL.rubble2 : q < 0.28 ? PAL.glass : PAL.shade;
          break;
        default: { // dump
          c = q < 0.2 ? PAL.dirt2 : PAL.dirt;
          if (q > 0.96) c = PAL.rust;
        }
      }
      tile[y * TILE + x] = c;
    }
  }
  if (t === T.Street && v % 2 === 1) {
    // A crack running across the tile, with grass growing in it.
    let x = Math.floor(r(0, 0, 5) * 12) + 2;
    for (let y = 0; y < TILE; y++) {
      tile[y * TILE + x] = PAL.crack;
      if (r(x, y, 6) < 0.18) tile[y * TILE + Math.min(TILE - 1, x + 1)] = r(x, y, 7) < 0.5 ? PAL.weed : PAL.weed2;
      x = Math.max(1, Math.min(TILE - 2, x + Math.floor(r(y, x, 8) * 3) - 1));
    }
  }
  if (t === T.Dump) {
    // Pulsing puddle of toxic sludge.
    const cx = 4 + (v & 1) * 6;
    const cy = 11 - ((v >> 1) & 3);
    for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) {
      if (x * x / 9 + y * y / 4 > 1) continue;
      const inner = x * x / 4 + y * y / 1.5 < 1;
      tile[(cy + y) * TILE + cx + x] = inner && frame ? PAL.glow : PAL.sludge;
    }
  }
  return tile;
}

function decoratedTile(t: number, v: number, frame: number): Uint32Array {
  const tile = baseTile(t, v, frame);
  switch (t) {
    case T.Rubble:
      stamp(tile, SLAB, 2 + (v & 3) * 2, 3 + (v & 1) * 6);
      if (v & 2) stamp(tile, SLAB, 9, 10);
      break;
    case T.Street:
      if (v === 5) stamp(tile, CAR, 4, 9);
      if (v === 2) { tile[5 * TILE + 3] = PAL.weed2; tile[6 * TILE + 3] = PAL.weed; tile[12 * TILE + 11] = PAL.weed; }
      break;
    case T.Jungle:
      stamp(tile, TREE, (v & 1) * 2, (v >> 2));
      if (v === 3) stamp(tile, CAR_OVERGROWN, 7, 10);
      else if (v !== 6) stamp(tile, TREE, 7 - (v & 1), 6 + ((v >> 1) & 1));
      break;
    case T.Ruins:
      if (v === 7) { stamp(tile, SLAB, 3, 5); stamp(tile, SLAB, 9, 10); break; } // already flattened
      stamp(tile, v % 2 ? BUILDING_VINES : BUILDING, 2 + (v & 1) * 3, 3 + ((v >> 1) & 1));
      break;
    case T.Towers:
      stamp(tile, TOWER, 3 + (v & 3), 1);
      break;
    case T.Dump:
      stamp(tile, BARREL, 1 + (v & 3) * 2, 1);
      if (v < 6) stamp(tile, v % 2 ? BARREL_SIDE : BARREL, 9, 3 + (v & 3));
      break;
  }
  return tile;
}

/**
 * Atlas: atlas[frame][index] is a TILE x TILE tile.
 * index = t * VARIANTS + v for terrain, and SPECIAL_BASE + t for a deposit on terrain t.
 */
export const SPECIAL_BASE = TERRAINS.length * VARIANTS;

export function buildAtlas(): Uint32Array[][] {
  const frames: Uint32Array[][] = [];
  for (let f = 0; f < FRAMES; f++) {
    const tiles: Uint32Array[] = [];
    for (let t = 0; t < TERRAINS.length; t++) for (let v = 0; v < VARIANTS; v++) tiles.push(decoratedTile(t, v, f));
    for (let t = 0; t < TERRAINS.length; t++) {
      const tile = baseTile(t, 0, f);
      if (t >= T.Ruins) { stamp(tile, RUINS, 3, 8); stamp(tile, CHEST, 3, 2); }
      else stamp(tile, CHEST, 3, 5);
      tiles.push(tile);
    }
    frames.push(tiles);
  }
  return frames;
}

/** Sprite -> canvas (to draw with drawImage). */
export function spriteCanvas(sp: Sprite): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sp.w;
  c.height = sp.h;
  const img = new ImageData(new Uint8ClampedArray(sp.px.slice().buffer), sp.w, sp.h);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Base camp: a dome with a lit door and an antenna (two frames: the antenna light blinks). */
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

/** Bluetreri icon (currency): a faceted blue crystal. */
export const COIN = sprite([
  '...kk...',
  '..kHbk..',
  '.kHbbBk.',
  'kHbbbBBk',
  'kbbbBBBk',
  '.kbbBBk.',
  '..kbBk..',
  '...kk...',
], { k: PAL.ink, b: PAL.blu, B: PAL.blu2, H: PAL.bluHi });

/** Items found on the map: page, musical note and photo (same order as ITEMS). */
export const ITEM_SPRITES = [
  sprite([
    '.kkkkk..',
    '.kwwwkk.',
    '.kwgggk.',
    '.kwwwwk.',
    '.kwgggk.',
    '.kwwwwk.',
    '.kwgggk.',
    '.kkkkkk.',
  ], { k: PAL.ink, w: px('#f4ecd6'), g: px('#a99c80') }),
  sprite([
    '....kkk.',
    '....kmmk',
    '....kk.k',
    '....k...',
    '.kkkk...',
    'kmmmk...',
    'kmmmk...',
    '.kkk....',
  ], { k: PAL.ink, m: px('#ff7ad9') }),
  sprite([
    'kkkkkkkk',
    'kwwwwwwk',
    'kwbbbbwk',
    'kwbsbbwk',
    'kwgggbwk',
    'kwggggwk',
    'kwwwwwwk',
    'kkkkkkkk',
  ], { k: PAL.ink, w: px('#f4ecd6'), b: px('#7fc4ff'), s: px('#ffe27a'), g: px('#5aa53c') }),
];
