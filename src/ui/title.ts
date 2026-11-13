// Title screen, shown full screen while the world is built. The story in one picture: a scan line rises from the street
// and, as the expedition's data comes in, turns the ruined wasteland (acid storm, smoke, fog) into a neon city. When loading is done it waits for
// a tap. The scene is pixel art drawn on a small canvas (about 112 pixels wide) and scaled up.

/** Small seeded generator (mulberry32): the scene looks the same on every frame and every launch. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TitleScreen {
  el: HTMLElement;
  /** Loading progress, 0..1 (the scan line chases it, so it never jumps). */
  progress(p: number): void;
  /** Resolves when loading is done and the player has tapped; the screen then fades out and removes itself. */
  ready(): Promise<void>;
}

/** Share of the screen the scan line climbs per second at most (the whole climb takes at least 1 / SCAN_SPEED s). */
const SCAN_SPEED = 0.3;
/** Width of the scene in canvas pixels (its height follows the screen). */
const SCENE_W = 112;
/** The scene redraws this often (a low rate keeps the pixel-art feel and costs little). */
const FRAME_MS = 80;

/** 3x5 pixel glyphs for the status line. */
const GLYPHS: Record<string, string> = {
  A: '010101111101101', C: '111100100100111', D: '110101101101110', E: '111100110100111', G: '111100101101111',
  I: '111010010010111', N: '101111111101101', O: '111101101101111', P: '110101110100100', R: '110101110101101',
  S: '111100111001111', T: '111010010010010', V: '101101101101010', '.': '000000000000010', ' ': '000000000000000',
  '%': '101001010100101', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001111',
};

const NEON = ['#ff3fa4', '#3ff0ff', '#ffd23f', '#b06bff', '#ff6a3f'];
const WASTE_SKY = ['#2a1a20', '#43222a', '#5f2e2c', '#83402f', '#a95634', '#cc7440', '#e0904c'];
const NIGHT_SKY = ['#06031a', '#0c0726', '#140b36', '#1d0f46', '#2a1356', '#3c1864', '#521c6c'];

export function createTitle(): TitleScreen {
  const el = document.createElement('div');
  el.className = 'title-screen';
  const canvas = document.createElement('canvas');
  const name = (cls: string) => { const s = document.createElement('span'); s.className = `title-name ${cls}`; s.textContent = 'REBUILD'; return s; };
  const dull = name('dull');
  const lit = name('lit');
  el.append(canvas, dull, lit);
  const x = canvas.getContext('2d')!;
  let W = SCENE_W;
  let H = 240;
  let HZ = 200;
  let waste: HTMLCanvasElement | null = null;
  /** Burning ruins the smoke rises from: the tallest one in each third of the screen. */
  let fires: [number, number][] = [];

  const R = (c: string, X: number, Y: number, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(X | 0, Y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); };
  const bands = (cols: string[], y0: number, y1: number) => {
    const h = (y1 - y0) / cols.length;
    cols.forEach((c, k) => {
      R(c, 0, y0 + k * h, W, h + 1);
      if (k) for (let i = 0; i < W; i += 2) R(cols[k - 1], i + (k % 2), y0 + k * h); // dithered edge
    });
  };
  const text = (s: string, X: number, Y: number, col: string) => {
    for (const [dx, c] of [[1, '#000'], [0, col]] as const) {
      let cx = X + dx;
      for (const ch of s) {
        const g = GLYPHS[ch] ?? GLYPHS[' '];
        for (let i = 0; i < 15; i++) if (g[i] === '1') R(c, cx + (i % 3), Y + dx + Math.floor(i / 3));
        cx += 4;
      }
    }
  };

  /** The wasteland: dusty sky, a pale sun, broken towers and rubble. It never changes, so it is drawn once per size. */
  function drawWaste(): HTMLCanvasElement {
    const r = rng(7);
    bands(WASTE_SKY, 0, HZ);
    const sx = W * 0.7;
    const sy = HZ - H * 0.3;
    for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) if (i * i + j * j < 44) R(i * i + j * j < 22 ? '#f6cf8a' : '#eaa35e', sx + i, sy + j);
    for (let i = 0; i < W / 2; i++) R('#e9a76b55', r() * W, r() * HZ);
    for (let X = 0; X < W;) { const w = 4 + r() * 6; const h = 6 + r() * 12; R('#7a4434', X, HZ - h, w, h); X += w + r() * 3; }
    const tallest: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let X = -2; X < W;) {
      const w = 7 + r() * 11;
      const h = 16 + r() * H * 0.27;
      const third = Math.min(2, Math.max(0, Math.floor(((X + w / 2) / W) * 3)));
      if (h > tallest[third][2]) tallest[third] = [X + w * 0.3, HZ - h + 4, h];
      for (let i = 0; i < w; i++) {
        const top = HZ - h + (r() < 0.5 ? r() * 7 : r() * 2) + (i > w * 0.55 ? r() * h * 0.45 : 0);
        R('#2e201e', X + i, top, 1, HZ - top);
      }
      for (let wy = HZ - h + 6; wy < HZ - 3; wy += 4) for (let wx = X + 1; wx < X + w - 2; wx += 3) if (r() < 0.45) R('#170f10', wx, wy, 2, 2);
      X += w + 1 + r() * 5;
    }
    fires = tallest.filter((f) => f[2] > 0).map(([fx, fy]) => [fx, fy]);
    R('#3a281f', 0, HZ, W, H - HZ);
    for (let i = 0; i < W * 1.5; i++) R(r() < 0.5 ? '#4e3628' : '#2a1d17', r() * W, HZ + r() * (H - HZ), 1 + r() * 2, 1);
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    out.getContext('2d')!.drawImage(canvas, 0, 0);
    return out;
  }

  /** The wasteland's weather: acid clouds with the odd lightning bolt, smoke from burning ruins, and fog along the ground. */
  function drawStorm(t: number): void {
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    // Acid clouds drifting along the top.
    const rc = rng(5);
    for (let i = 0; i < 14; i++) {
      const w = 20 + rc() * 30;
      const X = wrap(rc() * W * 1.5 + t * 4, W * 1.5) - w;
      const Y = rc() * H * 0.17;
      R('#1e2a14', X, Y, w, 10 + rc() * 10);
      R('#2c3a1a', X + 4, Y + 8, w - 8, 6);
    }
    // Smoke from the burning ruins: puffs grow, drift with the wind and fade.
    fires.forEach(([fx, fy], s) => {
      const r = rng(90 + s);
      for (let i = 0; i < 34; i++) {
        const life = 6 + r() * 3;
        const k = wrap(r() * life + t, life) / life;
        const size = Math.floor(1 + k * 6);
        const X = fx + k * k * 30 + Math.sin(t + i) * 2 * k;
        R(k < 0.2 ? '#4a3a34cc' : `rgba(70,58,52,${(0.55 - k * 0.5).toFixed(2)})`, X - size / 2, fy - k * H * 0.5, size, size);
      }
      R(Math.sin(t * 10 + s) > 0 ? '#ff7a2a' : '#c8401a', fx - 1, fy, 3, 2);
    });
    // Fog: four layers drifting at different speeds along the ground.
    const fog = ['#d8a68a1c', '#c89a8226', '#b88c7a30', '#a07a6c3a'];
    fog.forEach((col, L) => {
      const r = rng(30 + L);
      const sp = (L + 1) * 3 * (L % 2 ? -1 : 1);
      for (let i = 0; i < 9; i++) {
        const w = 30 + r() * 40;
        const X = wrap(r() * W * 2 + t * sp, W * 2) - w;
        const y = HZ - 30 + L * 12 + r() * 10;
        R(col, X, y, w, 5 + r() * 6);
        R(col, X + 6, y - 2, w - 12, 2);
      }
    });
    // Acid lightning every few seconds: a branching bolt and a green flash (twice).
    const cyc = t % 4.2;
    if (cyc < 0.35) {
      const flash = cyc < 0.08 || (cyc > 0.16 && cyc < 0.24);
      if (flash) R('#d8ff8a40', 0, 0, W, H);
      const r = rng(Math.floor(t / 4.2) + 50);
      let X = W * 0.2 + r() * W * 0.6;
      let Y = H * 0.12;
      const end = HZ - r() * H * 0.25;
      while (Y < end) {
        Y += 2;
        X += r() * 4 - 2;
        R(flash ? '#ffffff' : '#c8ff7a', X, Y, 1, 2);
        if (r() < 0.1) {
          let bx = X;
          let by = Y;
          for (let k = 0; k < 8; k++) { by += 2; bx += r() < 0.5 ? -1 : 1; R('#c8ff7aaa', bx, by, 1, 2); }
        }
      }
    }
  }

  /** The rebuilt city at night: tall towers, flickering neon signs, flying cars, rain and wet streets. */
  function drawCity(t: number): void {
    const r = rng(9);
    bands(NIGHT_SKY, 0, HZ);
    for (let i = 0; i < W / 3; i++) R('#c7c3ff', r() * W, r() * H * 0.4);
    const tall = HZ - H * 0.33; // the tallest towers stop below the title
    for (let X = -3; X < W;) {
      const w = 5 + r() * 8;
      const h = tall * (0.3 + r() * 0.7);
      R('#1b1340', X, HZ - h, w, h);
      for (let wy = HZ - h + 2; wy < HZ; wy += 3) for (let wx = X + 1; wx < X + w - 1; wx += 2) if (r() < 0.25) R('#3d2f80', wx, wy);
      X += w + r() * 2;
    }
    const signs: [number, string, boolean][] = [];
    for (let X = -2; X < W;) {
      const w = 7 + r() * 11;
      const h = tall * (0.25 + r() * 0.65);
      R('#0c0918', X, HZ - h, w, h);
      R('#0c0918', X + w / 2, HZ - h - 6 - r() * 8, 1, 10);
      R((t * 2 + X) % 3 < 2 ? '#ff3f6a' : '#40101c', X + w / 2, HZ - h - 8); // aircraft warning light
      for (let wy = HZ - h + 3; wy < HZ - 1; wy += 3) for (let wx = X + 1; wx < X + w - 1; wx += 2) if (r() < 0.35) R(NEON[(r() * 5) | 0] + (r() < 0.5 ? '' : 'aa'), wx, wy);
      if (r() < 0.6) {
        const col = NEON[(r() * 5) | 0];
        const sx = X + r() * w * 0.6;
        const on = Math.sin(t * 6 + sx) > -0.75;
        R(on ? col : '#2a1530', sx, HZ - h + 4 + r() * h * 0.4, 2, 6 + r() * 10);
        signs.push([sx, col, on]);
      }
      X += w + 1 + r() * 3;
    }
    for (let i = 0; i < 5; i++) {
      const fx = (((r() * W + t * (12 + i * 5) * (i % 2 ? 1 : -1)) % W) + W) % W;
      const fy = tall * 0.6 + i * 12;
      R('#ffe9a8', fx, fy, 2, 1);
      R('#ff3f6a', fx + (i % 2 ? -1 : 2), fy);
    }
    R('#0a0614', 0, HZ, W, H - HZ);
    for (const [sx, col, on] of signs) if (on) for (let y = HZ + 1; y < H; y += 2) if (r() < 0.7) R(`${col}88`, sx, y, 2, 1); // reflections
    R('#3ff0ff44', 0, HZ, W, 1);
    for (let i = 0; i < W / 2; i++) R('#8a9ad055', (r() * W + t * 22) % W, (r() * H + t * 80) % H, 1, 2); // rain
  }

  function resize(): void {
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    W = SCENE_W;
    H = Math.max(160, Math.round((W * h) / w));
    HZ = H - 42;
    canvas.width = W;
    canvas.height = H;
    waste = drawWaste();
    // The title fills most of the width.
    for (const s of [dull, lit]) s.style.fontSize = '40px';
    const fit = Math.min(64 * (w / 360), (40 * w * 0.88) / Math.max(1, dull.offsetWidth));
    for (const s of [dull, lit]) s.style.fontSize = `${fit}px`;
  }

  let target = 0;
  let shown = 0;
  let tapped = false;
  let last = performance.now();
  let lastDraw = 0;
  let raf = 0;
  let resolveReady: (() => void) | null = null;
  const loaded = () => target >= 1 && shown >= 1;

  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000); // a long blocking step must not make the line jump
    last = now;
    shown = Math.min(target, shown + dt * SCAN_SPEED);
    if (now - lastDraw >= FRAME_MS && el.clientWidth) {
      lastDraw = now;
      if (!waste || canvas.width !== W) resize();
      const t = now / 1000;
      drawCity(t);
      const ly = Math.round(H - shown * H);
      if (ly > 0) {
        x.drawImage(waste!, 0, 0, W, ly, 0, 0, W, ly);
        x.save();
        x.beginPath();
        x.rect(0, 0, W, ly);
        x.clip();
        drawStorm(t);
        x.restore();
      }
      if (!loaded()) {
        R('#ffffff', 0, ly, W, 1);
        R('#9ff6ffaa', 0, ly - 1, W, 1);
        R('#9ff6ff44', 0, ly - 2, W, 1);
        for (let i = 0; i < 8; i++) R('#ffffffaa', (i * 37 + t * 90) % W, ly + 1, 3, 1);
      }
      for (let y = 0; y < H; y += 2) R('#00000026', 0, y, W, 1); // CRT scanlines
      const by = H - 34;
      R('#000000aa', 10, by, W - 20, 22);
      if (loaded()) {
        if (Math.floor(t * 2) % 2 === 0) { const s = 'TAP TO START'; text(s, (W - s.length * 4 + 1) / 2, by + 8, '#7dff9a'); }
      } else {
        text(`RECEIVING DATA${'.'.repeat(1 + (Math.floor(t * 2) % 3))}`, 14, by + 3, '#7dff9a');
        const pc = `${Math.floor(shown * 100)}%`;
        text(pc, W - 14 - pc.length * 4 + 1, by + 3, '#7dff9a');
        R('#11100e', 14, by + 11, W - 28, 5);
        R('#7dff9a', 15, by + 12, (W - 30) * shown, 3);
      }
      // The title turns neon from where the line has passed.
      const top = lit.offsetTop;
      const cut = Math.max(0, Math.min(lit.offsetHeight, (ly / H) * el.clientHeight - top));
      lit.style.clipPath = `inset(${cut}px 0 0 0)`;
    }
    if (tapped && loaded()) finish();
    else raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    window.removeEventListener('keydown', onKey);
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
    resolveReady?.();
  }

  const start = () => {
    if (target < 1) return; // still loading
    shown = 1; // skip the rest of the scan
    tapped = true;
  };
  el.addEventListener('pointerdown', start);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') start(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { waste = null; });
  void document.fonts?.ready.then(() => { waste = null; }); // refit the title once the font is in
  raf = requestAnimationFrame(frame);

  return {
    el,
    progress(p) { target = Math.max(target, Math.min(1, p)); },
    ready() {
      return new Promise<void>((res) => {
        resolveReady = () => { cancelAnimationFrame(raf); res(); };
      });
    },
  };
}
