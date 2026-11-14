// "The voyage" splash: shown once, when the explorer reaches the top level (the whole map explored), as the start of
// phase II. A robot jellyfish ship (the Black siphon: an obsidian armoured bell with red lights and a dozen jointed
// tentacles ending in probes) floats over a starfield. Drawn in SVG; the tentacles are redrawn every frame so each
// joint follows the one above it. It stays up for good: phase II is not playable yet.

const SVGNS = 'http://www.w3.org/2000/svg';
const W = 240;
const H = 400;

/** Obsidian plating, darkest edge to highlight (horizontal sheen across the bell and the rim). */
const PLATE = ['#030304', '#23262c', '#5a606b', '#2a2d34', '#050507'];
const DARK = PLATE[0];
const MID = PLATE[3];
const LIGHT = PLATE[2];
const RED = '#ff2a3a';
const WINDOW = '#ff4a5a';
const STEEL = '#5a606b';

/** Bell half-width and height, and its curve (control points of the left half, as shares of width and height). */
const BW = 58;
const BH = 74;
const CURVE = [1.05, 1, 0.45];
const BANDS = [0.4, 0.75];
const SEAMS = 5;
const WINDOW_BAND = 0.6;

/** Tentacles: count, joints, joint length, thickness, sway and how far the outer ones fan out. */
const TENTS = 12;
const SEGS = 16;
const SEG_LEN = 9;
const THICK = 2.2;
const SWAY = 1.3;
const SPREAD = 0.4;

const f = (n: number) => n.toFixed(1);

/** A point on the left half of the bell outline (u = 0 at the rim, 1 at the top). */
function bell(u: number): [number, number] {
  const [a, b, c] = CURVE;
  const P = [[-BW, 0], [-BW * a, -BH * b], [-BW * c, -BH], [0, -BH]];
  const m = 1 - u;
  const k = [m * m * m, 3 * m * m * u, 3 * m * u * u, u * u * u];
  return [0, 1].map((j) => k.reduce((s, kk, i) => s + kk * P[i][j], 0)) as [number, number];
}

/** A point along a band that runs from the left of the bell to the right, sagging by `sag` at the middle. */
function band(left: [number, number], sag: number, t: number): [number, number] {
  const m = 1 - t;
  return [m * m * left[0] + t * t * -left[0], m * m * left[1] + 2 * m * t * sag + t * t * left[1]];
}

function starfield(n: number): string {
  let r = 41;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  let out = '';
  for (let i = 0; i < n; i++) {
    const z = rnd();
    const blink = z > 0.75 ? ` class="vy-blink" style="animation-delay:${f(z * 3)}s"` : '';
    out += `<circle cx="${f(rnd() * W)}" cy="${f(rnd() * H)}" r="${(z * 1.1 + 0.3).toFixed(2)}" fill="#fff" opacity="${(0.3 + z * 0.7).toFixed(2)}"${blink}/>`;
  }
  return out;
}

/** Everything but the tentacles, which `tentacles` draws into `#vy-tents` each frame. */
function scene(): string {
  const [a, b, c] = CURVE;
  const dome = `M${-BW},0 C${f(-BW * a)},${f(-BH * b)} ${f(-BW * c)},${-BH} 0,${-BH} C${f(BW * c)},${-BH} ${f(BW * a)},${f(-BH * b)} ${BW},0Z`;
  let o = `<defs><linearGradient id="vy-plate" x1="0" x2="1">${[0, 0.28, 0.42, 0.7, 1].map((at, i) => `<stop offset="${at}" stop-color="${PLATE[i]}"/>`).join('')}</linearGradient>`
    + `<clipPath id="vy-hull"><path d="${dome}"/></clipPath></defs>`;
  o += `<rect width="${W}" height="${H}" fill="#030305"/>${starfield(70)}`;
  o += `<text x="120" y="44" text-anchor="middle" class="vy-title">THE VOYAGE</text>`
    + `<line x1="42" y1="60" x2="68" y2="60" class="vy-rule"/><line x1="172" y1="60" x2="198" y2="60" class="vy-rule"/>`
    + `<text x="120" y="63" text-anchor="middle" class="vy-sub">PHASE II</text>`;
  o += `<g transform="translate(120,205)"><g class="vy-bob"><g id="vy-tents"></g>`;
  // Mast with a blinking beacon.
  o += `<line x1="0" y1="${-BH}" x2="0" y2="${-BH - 22}" stroke="${MID}" stroke-width="1.6"/>`
    + `<path d="M-7,${-BH - 14} Q0,${-BH - 8} 7,${-BH - 14}" fill="none" stroke="${LIGHT}" stroke-width="1.4"/>`
    + `<circle cx="0" cy="${-BH - 23}" r="2.2" fill="${RED}" class="vy-beacon"/>`;
  // Hull, with shade under the rim and a sheen up on the left.
  o += `<path d="${dome}" fill="url(#vy-plate)" stroke="${DARK}" stroke-width="1.2"/><g clip-path="url(#vy-hull)">`
    + `<rect x="${-BW}" y="${f(-BH * 0.22)}" width="${2 * BW}" height="${f(BH * 0.22)}" fill="#000" opacity=".28"/>`
    + `<ellipse cx="${f(-BW * 0.38)}" cy="${f(-BH * 0.62)}" rx="${f(BW * 0.2)}" ry="${f(BH * 0.3)}" fill="#fff" opacity=".14" transform="rotate(-25 ${f(-BW * 0.38)} ${f(-BH * 0.62)})"/>`;
  // Seams from the top down to the rim, riveted.
  for (let k = 1; k <= SEAMS; k++) for (const side of [-1, 1]) {
    const x0 = (side * k * BW) / (SEAMS + 0.6);
    o += `<path d="M0,${-BH} Q${f(x0 * 1.08)},${f(-BH * 0.4)} ${f(x0)},0" fill="none" stroke="${DARK}" stroke-width="1"/>`;
    for (let r = 1; r < 6; r++) {
      const t = r / 6, m = 1 - t;
      o += `<circle cx="${f(2 * m * t * x0 * 1.08 + t * t * x0 + 1.8)}" cy="${f(m * m * -BH + 2 * m * t * -BH * 0.4)}" r=".9" fill="${STEEL}" opacity=".8"/>`;
    }
  }
  // Plate bands across the bell, riveted.
  for (const u of BANDS) {
    const L = bell(u), sag = L[1] + BH * 0.13;
    o += `<path d="M${f(L[0])},${f(L[1])} Q0,${f(sag)} ${f(-L[0])},${f(L[1])}" fill="none" stroke="${DARK}" stroke-width="1.6"/>`
      + `<path d="M${f(L[0])},${f(L[1] + 1.5)} Q0,${f(sag + 1.5)} ${f(-L[0])},${f(L[1] + 1.5)}" fill="none" stroke="${LIGHT}" stroke-opacity=".35" stroke-width=".8"/>`;
    for (let r = 1; r < 14; r++) { const p = band(L, sag, r / 14); o += `<circle cx="${f(p[0])}" cy="${f(p[1] - 2)}" r="1" fill="${STEEL}"/>`; }
  }
  // A row of red windows.
  {
    const L = bell(WINDOW_BAND), sag = L[1] + BH * 0.13, n = Math.floor((-L[0] * 2) / 8);
    for (let r = 1; r < n; r++) {
      const p = band(L, sag, r / n);
      o += `<rect x="${f(p[0] - 2)}" y="${f(p[1] - 5)}" width="4" height="3" rx=".6" fill="${WINDOW}" opacity="${r % 4 ? 1 : 0.45}"${r % 3 ? '' : ` class="vy-pulse" style="animation-delay:${f(r * 0.37)}s"`}/>`;
    }
  }
  o += `</g>`;
  // Rim: a ribbed ring with engine ports between the tentacles.
  o += `<rect x="${-BW - 6}" y="-4" width="${2 * BW + 12}" height="12" rx="3" fill="url(#vy-plate)" stroke="${DARK}" stroke-width="1.2"/>`;
  for (let x = -BW - 2; x < BW + 4; x += 7) o += `<line x1="${x}" y1="-3" x2="${x}" y2="7" stroke="${DARK}" stroke-width=".8"/>`;
  for (let k = 0; k < TENTS - 1; k++) {
    const x = -BW * 0.85 + ((k + 0.5) * 1.7 * BW) / (TENTS - 1);
    o += `<ellipse cx="${f(x)}" cy="2" rx="2.6" ry="1.6" fill="${RED}" class="vy-pulse" style="animation-delay:${f(k * 0.21)}s"/>`;
  }
  return o + `</g></g>`;
}

/** The tentacles at time `t` (seconds): each joint turns a little from the one above, in a wave running down. */
function tentacles(t: number): string {
  let o = '';
  for (let i = 0; i < TENTS; i++) {
    const ax = -BW * 0.85 + (i * 1.7 * BW) / (TENTS - 1);
    let ang = Math.PI / 2 + SPREAD * (ax / BW) * 0.9;
    let p: [number, number] = [ax, 7];
    const pts = [p];
    for (let k = 0; k < SEGS; k++) {
      ang += SWAY * 0.17 * Math.sin(t * 1.5 + i * 1.1 - k * 0.55) + (Math.PI / 2 - ang) * 0.05;
      p = [p[0] + SEG_LEN * Math.cos(ang), p[1] + SEG_LEN * Math.sin(ang)];
      pts.push(p);
    }
    for (let k = 1; k < pts.length; k++) {
      const [a, b] = [pts[k - 1], pts[k]];
      const L = `x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"`;
      o += `<line ${L} stroke="${DARK}" stroke-width="${THICK + 2}" stroke-linecap="round"/><line ${L} stroke="${MID}" stroke-width="${THICK}" stroke-linecap="round"/><line ${L} stroke="${LIGHT}" stroke-width="${f(THICK * 0.3)}" opacity=".7"/>`;
    }
    pts.slice(0, -1).forEach((q, k) => { o += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(THICK * 0.62)}" fill="${k % 2 ? MID : STEEL}" stroke="${DARK}" stroke-width=".7"/>`; });
    // A probe at the tip, glowing on its own beat.
    const e = pts[pts.length - 1];
    const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + i));
    o += `<circle cx="${f(e[0])}" cy="${f(e[1])}" r="${f(THICK * 1.1)}" fill="${DARK}"/><circle cx="${f(e[0])}" cy="${f(e[1])}" r="${f(THICK * 0.6)}" fill="${RED}" opacity="${glow.toFixed(2)}"/>`;
  }
  return o;
}

/** Shows the splash over `root` (the phone). It cannot be closed: the game waits here for phase II. */
export function showVoyage(root: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'voyage';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The voyage');
  svg.innerHTML = scene();
  const hint = document.createElement('span');
  hint.className = 'voyage-hint';
  hint.textContent = 'phase II is on its way';
  el.append(svg, hint);
  root.append(el);
  const tents = svg.querySelector('#vy-tents')!;
  const frame = (ms: number) => { tents.innerHTML = tentacles(ms / 1000); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  requestAnimationFrame(() => el.classList.add('in'));
}
