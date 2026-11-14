// "The arrival" splash: phase I (explore the ruined planet and gather what is left), shown when a new game starts,
// right after the title. Pixel art like the title screen: the planet seen from space (the "Smog giant": ochre ground
// under drifting bands of yellow smog, a dithered day side and a hazy rim) turns slowly on a small canvas (96 pixels
// wide) scaled up with crisp pixels. A tap closes it.

/** Width of the scene in canvas pixels (its height follows the screen). */
const SCENE_W = 96;
/** The scene redraws this often (a low rate keeps the pixel-art feel and costs little). */
const FRAME_MS = 100;
/** Taps are ignored this long after the splash appears, so the tap that closed the title does not close it too. */
const TAP_DELAY_MS = 1000;

/** Ground, dark to light; smog; the hazy rim. */
const GROUND = ['#2e2a1e', '#3d3526', '#4f4630', '#5e5233', '#70623f'].map(rgb);
const SMOG = rgb('#a08a52');
const RIM = rgb('#e0c070');
const SPACE = rgb('#07060a');
const STAR = rgb('#ffffff');
/** Light comes from the upper left, towards the viewer. */
const LIGHT = norm([-0.55, -0.45, 0.7]);
/** Turn rates of the ground and the smog (radians per second). */
const SPIN = 0.12;
const SMOG_SPIN = 0.2;

/** 4×4 ordered dither. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
/** Light steps after dithering. */
const SHADES = [0.1, 0.33, 0.62, 1];

function rgb(h: string): number[] { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function norm(v: number[]): number[] { const l = Math.hypot(...v); return v.map((x) => x / l); }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const face = (k: number) => lerp(lerp(hash(xi, yi, k), hash(xi + 1, yi, k), u), lerp(hash(xi, yi + 1, k), hash(xi + 1, yi + 1, k), u), v);
  return lerp(face(zi), face(zi + 1), w);
}
const fbm = (x: number, y: number, z: number) => (noise(x, y, z) * 4 + noise(x * 2.1, y * 2.1, z * 2.1) * 2 + noise(x * 4.3, y * 4.3, z * 4.3)) / 7;

/** Draws one frame at time `t` (seconds) into `img` (W×H). */
function draw(img: ImageData, W: number, H: number, stars: number[][], t: number) {
  const d = img.data;
  const set = (x: number, y: number, c: number[], k = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = c[0] * k; d[i + 1] = c[1] * k; d[i + 2] = c[2] * k; d[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, SPACE);
  for (const [x, y, b, ph] of stars) set(x, y, STAR, b > 0.85 ? (Math.sin(t * 3 + ph * 20) > 0 ? 1 : 0.35) : 0.35 + b * 0.5);

  // The planet sits a little below the middle, under the title.
  const r = Math.round(W * 0.36), cx = W / 2, cy = Math.round(H * 0.55), pad = 3;
  const a = t * SPIN, ca = Math.cos(a), sa = Math.sin(a);
  const b2 = t * SMOG_SPIN, cb = Math.cos(b2), sb = Math.sin(b2);
  const [Lx, Ly, Lz] = LIGHT;
  for (let y = Math.floor(cy - r - pad); y <= cy + r + pad; y++) for (let x = Math.floor(cx - r - pad); x <= cx + r + pad; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d2 = dx * dx + dy * dy, dither = BAYER[(y & 3) * 4 + (x & 3)];
    if (d2 > 1) {
      // Hazy rim, thicker on the lit side.
      const dist = Math.sqrt(d2), edge = (dist - 1) * r;
      if (edge > pad) continue;
      const lit = (dx * Lx + dy * Ly) / dist;
      if (lit * 0.8 + 0.45 - (edge / pad) * 0.7 > dither) set(x, y, RIM, edge < 1 ? 1 : 0.6);
      continue;
    }
    // A point on the sphere, turned about the vertical axis (the smog turns faster than the ground).
    const nz = Math.sqrt(1 - d2), X = dx * ca + nz * sa, Z = -dx * sa + nz * ca;
    const light = dx * Lx + dy * Ly + nz * Lz;
    const shade = SHADES[Math.floor(clamp(light * 1.5 + 0.25 + (dither - 0.5) * 0.45, 0, 0.999) * SHADES.length)];
    const n = fbm(X * 2.6 + 9, dy * 2.6 + 3, Z * 2.6);
    let col = GROUND[clamp(Math.floor(((n - 0.28) / 0.44) * GROUND.length), 0, GROUND.length - 1)];
    const X2 = dx * cb + nz * sb, Z2 = -dx * sb + nz * cb;
    if (fbm(X2 * 2.4 + 70, dy * 7, Z2 * 2.4) > 0.5 + (dither - 0.5) * 0.06) col = SMOG; // bands of smog
    set(x, y, col, shade);
  }
}

/** Shows the splash over `root` (the phone) until a tap; resolves once it has faded out. */
export function showArrival(root: HTMLElement): Promise<void> {
  const el = document.createElement('div');
  el.className = 'arrival';
  const canvas = document.createElement('canvas');
  const caption = document.createElement('div');
  caption.className = 'arrival-title';
  const name = document.createElement('b');
  name.textContent = 'THE ARRIVAL';
  const phase = document.createElement('i');
  phase.textContent = 'PHASE I';
  caption.append(name, phase);
  const hint = document.createElement('span');
  hint.className = 'arrival-hint';
  hint.textContent = 'tap to begin';
  el.append(canvas, caption, hint);
  root.append(el);

  const W = SCENE_W;
  const H = Math.max(120, Math.round((W * (el.clientHeight || 640)) / (el.clientWidth || 360)));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const stars = [...Array(Math.round((W * H) / 250))].map(() => [Math.floor(rnd() * W), Math.floor(rnd() * H), rnd(), rnd()]);
  const frame = () => { draw(img, W, H, stars, performance.now() / 1000); ctx.putImageData(img, 0, 0); };
  frame();
  const timer = setInterval(frame, FRAME_MS);
  requestAnimationFrame(() => el.classList.add('in'));

  const shown = performance.now();
  return new Promise((done) => {
    el.addEventListener('click', () => {
      if (performance.now() - shown < TAP_DELAY_MS || el.classList.contains('out')) return;
      el.classList.add('out');
      setTimeout(() => { clearInterval(timer); el.remove(); done(); }, 600);
    });
  });
}
