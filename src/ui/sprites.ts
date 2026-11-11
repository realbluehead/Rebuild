// Pixel art generat per codi: paleta pròpia, rajoles de 16×16 per terreny i sprites dibuixats amb text.
// Tot es guarda com a Uint32 en l'ordre d'ImageData (0xAABBGGRR en màquines little-endian, és a dir totes).
import { T, TERRAINS } from '../content/world';
import { hash2 } from '../core/rng';

export const TILE = 16;
export const VARIANTS = 8;
export const FRAMES = 2;

/** '#rrggbb' → píxel d'ImageData. */
export function px(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

export const PAL = {
  void: px('#0c0a12'),
  void2: px('#120f1c'),
  // Aigües fosques i aigua tòxica
  abyss: px('#141d20'), abyss2: px('#1b2a2b'), oil: px('#3a3550'),
  toxic: px('#355f33'), toxic2: px('#41743a'), glow: px('#9cff57'),
  // Runa
  rubble: px('#7d746a'), rubble2: px('#655d55'), rubble3: px('#a39888'), rust: px('#8a4a2a'),
  // Carrers
  asphalt: px('#4a4a54'), asphalt2: px('#3e3e47'), crack: px('#25252b'),
  weed: px('#5d8c3a'), weed2: px('#7cb14a'),
  // Selva urbana
  jungle: px('#355e27'), jungle2: px('#2a4c1f'), leaf: px('#2e6d2a'), leaf2: px('#1f4f1c'), leaf3: px('#5e9c3c'), trunk: px('#5a3a22'),
  // Edificis i gratacels
  concrete: px('#9a958c'), concrete2: px('#77726b'), shade: px('#4f4b49'), window: px('#23212a'),
  tower: px('#7c7888'), tower2: px('#5f5b6b'), glass: px('#5f8696'), glass2: px('#88b4c2'),
  // Abocador
  dirt: px('#5b4a30'), dirt2: px('#4a3c26'), barrel: px('#c9a227'), barrel2: px('#8c6f16'), sludge: px('#6fd23a'),
  // Cotxes rovellats
  car: px('#8c5a3a'), car2: px('#6a3f28'),
  gold: px('#f2c14e'), gold2: px('#b37a2a'), wood: px('#7a4a22'), wood2: px('#552f15'),
  stone: px('#9a8f84'), stone2: px('#665c55'),
  ink: px('#1b1420'),
  metal: px('#a9b4c2'), metalHi: px('#dde4ee'), hull: px('#6c7a8c'), hullHi: px('#93a2b6'),
  eye: px('#5ff0ff'), lamp: px('#ff5a4a'), lampOff: px('#6a2a2a'), tread: px('#3a3440'), tread2: px('#6a6474'),
};

/** Color pla de cada terreny, per als zooms llunyans (dos tons per variar). */
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

/** Sprite a partir de files de text; cada caràcter és una clau de `keys` ('.' = transparent). */
function sprite(rows: string[], keys: Record<string, number>): Sprite {
  const h = rows.length;
  const w = rows[0].length;
  const out = new Uint32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => { out[y * w + x] = keys[c] ?? 0; }));
  return { w, h, px: out };
}

/** Arbre salvatge (selva urbana). */
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

/** Cotxe rovellat abandonat. */
const CAR = sprite([
  '..kkkk..',
  '.kwwwwk.',
  'kCCCCCCk',
  'kcCCCCck',
  '.k.kk.k.',
], { k: PAL.ink, w: PAL.window, C: PAL.car, c: PAL.car2 });

/** El mateix cotxe, menjat per la vegetació. */
const CAR_OVERGROWN = sprite([
  '..lkkL..',
  '.kwLlwk.',
  'kCClCLCk',
  'LcCCLCcl',
  '.l.kk.L.',
], { k: PAL.ink, w: PAL.window, C: PAL.car, c: PAL.car2, l: PAL.leaf, L: PAL.leaf3 });

/** Edifici baix en ruïnes: façana amb finestres buides i el terrat esbotzat. */
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

/** El mateix, amb heures enfiladisses. */
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

/** Gratacels esberlat: finestres de vidre (algunes rebentades) i el capdamunt trencat. */
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

/** Bidó de residus tòxics. */
const BARREL = sprite([
  'kbbk',
  'bBBb',
  'kkkk',
  'bBBb',
  'bBBb',
  'kbbk',
], { k: PAL.ink, b: PAL.barrel2, B: PAL.barrel });

/** Bidó bolcat. */
const BARREL_SIDE = sprite([
  'kbkbbk',
  'bBkBBg',
  'kbkbbk',
], { k: PAL.ink, b: PAL.barrel2, B: PAL.barrel, g: PAL.sludge });

/** Tros de runa gros amb ferros rovellats. */
const SLAB = sprite([
  '..x...',
  '.RRx..',
  'RRrRR.',
  'rRRrRr',
], { R: PAL.rubble3, r: PAL.rubble2, x: PAL.rust });

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
      const q = r(x, y);
      let c: number;
      switch (t) {
        case T.Abyss:
          // Aigua negra amb taques d'oli que es mouen.
          c = q < 0.08 ? PAL.abyss2 : PAL.abyss;
          if ((y + v * 5) % 8 === frame * 4 && (x + y + v) % 9 < 2) c = PAL.oil;
          break;
        case T.Toxic:
          // Aigua verdosa amb bombolles que brillen (i canvien de lloc a cada fotograma).
          c = q < 0.14 ? PAL.toxic2 : PAL.toxic;
          if (r(x, y, 3 + frame) < 0.025) c = PAL.glow;
          break;
        case T.Rubble:
          c = q < 0.2 ? PAL.rubble2 : q < 0.3 ? PAL.rubble3 : PAL.rubble;
          if (q > 0.985) c = PAL.rust;
          break;
        case T.Street:
          // Asfalt amb esquerdes, línies de carril gastades i males herbes.
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
        default: { // abocador
          c = q < 0.2 ? PAL.dirt2 : PAL.dirt;
          if (q > 0.96) c = PAL.rust;
        }
      }
      tile[y * TILE + x] = c;
    }
  }
  if (t === T.Street && v % 2 === 1) {
    // Una esquerda que travessa la rajola, amb herba que hi creix.
    let x = Math.floor(r(0, 0, 5) * 12) + 2;
    for (let y = 0; y < TILE; y++) {
      tile[y * TILE + x] = PAL.crack;
      if (r(x, y, 6) < 0.18) tile[y * TILE + Math.min(TILE - 1, x + 1)] = r(x, y, 7) < 0.5 ? PAL.weed : PAL.weed2;
      x = Math.max(1, Math.min(TILE - 2, x + Math.floor(r(y, x, 8) * 3) - 1));
    }
  }
  if (t === T.Dump) {
    // Bassal de fang tòxic que bateja.
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
      if (v === 7) { stamp(tile, SLAB, 3, 5); stamp(tile, SLAB, 9, 10); break; } // ja tot a terra
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
      if (t >= T.Ruins) stamp(tile, RUINS, 3, 6);
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

/** Objectes que es troben pel mapa: pàgina, nota musical i foto (mateix ordre que ITEMS). */
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
