// Run with `node tools/icon.mjs` (macOS).
// Draws the app icon (public/icon.svg): pixel art on a 32×32 grid, a neon city under a night sky with a pink "R",
// full bleed (maskable: what matters stays in the middle 80%). It also writes the PNGs from it.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const N = 32;
const grid = Array.from({ length: N }, () => Array(N).fill(''));
const put = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) grid[y][x] = c; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Sky in bands, darkest at the top.
const sky = ['#0e0a1e', '#140e2a', '#1c1236', '#261642', '#321a4c'];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, sky[Math.min(sky.length - 1, Math.floor(y / 6))]);
for (let k = 0; k < 18; k++) put(Math.floor(rnd() * N), Math.floor(rnd() * 14), rnd() < 0.3 ? '#ffd23a' : '#c8c8f0');
// Towers with lit windows.
const lights = ['#ff4fa0', '#4ff0ff', '#ffd23a', '#a070ff'];
let x = 0;
while (x < N) {
  const w = 3 + Math.floor(rnd() * 4), h = 8 + Math.floor(rnd() * 12);
  for (let i = x; i < Math.min(N, x + w); i++) for (let y = N - h; y < N; y++) {
    const lit = i > x && i < x + w - 1 && y > N - h && (y - (N - h)) % 2 === 1 && rnd() < 0.45;
    put(i, y, lit ? lights[Math.floor(rnd() * lights.length)] : '#0a0814');
  }
  x += w + (rnd() < 0.4 ? 1 : 0);
}
put(0, N - 1, '#0a0814');
// The street line, neon.
for (let i = 0; i < N; i++) put(i, N - 2, '#ff4fa0');
// A pink "R" with a dark outline, in the middle.
const R = ['11110', '10001', '10001', '11110', '10100', '10010', '10001'];
const S = 2, ox = 11, oy = 8;
const on = (x, y) => R[Math.floor((y - oy) / S)]?.[Math.floor((x - ox) / S)] === '1' && x >= ox && y >= oy;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (on(x, y)) put(x, y, on(x, y - 1) ? '#ff4fa0' : '#ffb0e0'); // (lit along its top edges)
  else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]].some(([dx, dy]) => on(x + dx, y + dy))) put(x, y, '#0a0814');
}
// One rect per run of a colour along a row (the sky's base colour as the background).
const px = [];
grid.forEach((row, y) => {
  for (let x = 0; x < N;) {
    let e = x;
    while (e < N && row[e] === row[x]) e++;
    if (row[x] !== sky[Math.min(sky.length - 1, Math.floor(y / 6))]) px.push(`<path d="M${x} ${y}h${e - x}v1h-${e - x}z" fill="${row[x]}"/>`);
    x = e;
  }
});
const bands = sky.map((c, k) => `<path d="M0 ${k * 6}h${N}v${k === sky.length - 1 ? N - k * 6 : 6}h-${N}z" fill="${c}"/>`);
writeFileSync(new URL('../public/icon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${bands.join('')}${px.join('')}</svg>\n`);

// The PNGs (manifest, home screen on iOS), with macOS's sips (it renders the SVG exactly, crisp pixels).
const pub = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]])
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), pub('icon.svg'), '--out', pub(file)], { stdio: 'ignore' });
