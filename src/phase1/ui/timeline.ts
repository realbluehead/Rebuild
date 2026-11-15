// The spiral of ages, in the Library: the discoveries (the old world's great inventions, pieced together from photos)
// on a spiral that starts in the fire at its heart and winds outwards through the ages, its open end pointing at the
// stars (phase II). Each invention is a medallion on the curve: made ones in gold with their icon (a tap picks it, for
// the caption), the next ones dark with a ?. The curve is lit as far as the last one made. Drawn in SVG; only redrawn
// when what it shows changes.

const VB_W = 320;
const SERIF = "Georgia, 'Times New Roman', serif";
/** Spiral shape: angle step per invention, radius at the first and growth per invention, and the x/y stretch (wide and
 *  flat, so it takes little height; medallions stay at least ~14 units apart). */
const START = 1.14, STEP = 0.76, R0 = 20, DR = 2.2, AX = 3.6, BY = 0.65;
/** Medallion radius and icon scale. */
const MR = 6.5, IS = 0.85;
const GOLD = '#d9a441', GOLD_HI = '#f2c870', DARK = '#17120c', DIM = '#4a3a28';

const f = (n: number) => n.toFixed(1);

/** A point on the spiral at invention `k` (fractional; from -2 up to 0 it runs in from the fire at the centre). */
function at(k: number): [number, number] {
  const t = START + k * STEP, r = k < 0 ? R0 * (k + 2) / 2 : R0 + k * DR;
  return [Math.cos(t) * r * AX, Math.sin(t) * r * BY];
}

/** Tiny line icons, one per invention in order, in a 10×10 box. */
const ICONS = [
  'M5,9 C2,8 2,5 4,3 C4,5 5,5 5,5 C5,3 6,2 6,1 C8,3 9,6 7,8 C6.5,9 5.5,9 5,9Z', // fire
  'M5,1A4,4 0 1 1 4.99,1ZM5,1V9M1,5H9M2.2,2.2L7.8,7.8M7.8,2.2L2.2,7.8', // wheel
  'M2,1H7L8,2V9H2ZM3.5,3.5H6.5M3.5,5.5H6.5M3.5,7.5H5.5', // writing
  'M4.5,3A3,3 0 1 1 4.49,3ZM6.5,3.8L8,2M8,2L9,1.5M8,2L8.6,1', // gunpowder
  'M5,1A4,4 0 1 1 4.99,1ZM5,1.8L6.2,5H3.8ZM3.8,5L5,8.2L6.2,5', // compass
  'M1,9H9M2,9V4H8V9M1,4H9M5,1V4M3,2H7', // printing press
  'M1.5,7.5L7.5,2.5M7,1.5L9,4M3,6.5L4.5,9M4,7.5L2.5,9', // telescope
  'M1,8H7V4H1ZM7,6H9M3,4V2H5V4M2.5,8.4V9.6M5.5,8.4V9.6', // steam engine
  'M6,1L2.5,5.5H5L4,9L7.5,4.5H5Z', // electricity
  'M2,3C2,2 3,1 4,1L5,3L4,4C4.5,5.5 5,6 6,6.5L7,5.5L9,6.5C9,7.5 8,9 7,9C4,9 1,6 2,3Z', // telephone
  'M5,1C2.5,1 1.5,4 3.5,6V7.5H6.5V6C8.5,4 7.5,1 5,1ZM3.5,8.5H6.5', // light bulb
  'M1,5.5L9,4.5M5,5L3.5,1.5M5,5L4,8.5M8,4.6L8.5,3', // flight
  'M1.5,1.5H8.5V6.5H1.5ZM3.5,9H6.5M5,6.5V9', // computer
  'M5,1A4,4 0 1 1 4.99,1ZM1,5H9M5,1C3,3 3,7 5,9M5,1C7,3 7,7 5,9', // internet
  'M4,4H6V6H4ZM1,3H3.5V7H1ZM6.5,3H9V7H6.5ZM5,4V1.5M5,6V8.5', // space station
];

function icon(k: number, x: number, y: number, col: string): string {
  return `<path transform="translate(${f(x - 5 * IS)} ${f(y - 5 * IS)}) scale(${IS})" d="${ICONS[k % ICONS.length]}" fill="none" stroke="${col}" `
    + 'stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>';
}

export interface Timeline {
  el: HTMLElement;
  /** Shows `made` of `total` inventions; `picked` (or -1) is the one picked, drawn brighter. */
  update(made: number, total: number, picked: number): void;
}

/** `onPick(k)` is called when a made invention is tapped. */
export function createTimeline(onPick: (k: number) => void): Timeline {
  const el = document.createElement('div');
  el.className = 'timeline';
  let key = '';
  el.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('[data-k]');
    if (g) onPick(Number(g.getAttribute('data-k')));
  });
  function update(made: number, total: number, picked: number) {
    const k = `${made}/${total}/${picked}`;
    if (k === key) return;
    key = k;
    const P = Array.from({ length: total }, (_, k) => at(k));
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const cx = VB_W / 2 - (Math.max(...xs) + Math.min(...xs)) / 2;
    const top = Math.min(...ys) - MR - 3, h = Math.max(...ys) - Math.min(...ys) + 2 * MR + 6;
    const pts = P.map(([x, y]) => [x + cx, y] as [number, number]);
    // The curve from the fire through every invention, sampled finely so it reads as a smooth spiral.
    const path = (to: number) => {
      let d = '';
      for (let k = -2; k <= to + 1e-6; k += 0.1) { const [x, y] = at(k); d += `${d ? 'L' : 'M'}${f(x + cx)},${f(y)}`; }
      return d;
    };
    let s = '<defs><radialGradient id="tl-fire"><stop offset="0" stop-color="#ffb04a" stop-opacity=".55"/>'
      + '<stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient></defs>';
    // A few stars past the open end, up and to the right.
    let seed = 11;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 18; i++) {
      s += `<circle cx="${f(VB_W - 90 + rnd() * 86)}" cy="${f(top + rnd() * h * 0.45)}" r="${f(0.3 + rnd() * 0.5)}" fill="#fff" opacity="${f(0.25 + rnd() * 0.4)}"/>`;
    }
    s += `<circle class="tl-fire" cx="${f(cx)}" cy="0" r="14" fill="url(#tl-fire)"/>`;
    s += `<path d="${path(total - 1)}" fill="none" stroke="${DIM}" stroke-width="1" stroke-dasharray="2 1.5"/>`;
    if (made > 0) s += `<path d="${path(made - 1)}" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity=".8"/>`;
    pts.forEach(([x, y], i) => {
      if (i < made) {
        const on = i === picked;
        s += `<g class="tl-made" data-k="${i}"><circle cx="${f(x)}" cy="${f(y)}" r="${MR}" fill="${on ? '#4a3418' : '#2a1c10'}" `
          + `stroke="${on ? GOLD_HI : GOLD}" stroke-width="${on ? 1.4 : 0.9}"/>${icon(i, x, y, on ? '#fff0c0' : GOLD_HI)}</g>`;
      } else {
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="${MR}" fill="${DARK}" stroke="${i === made ? '#7a6040' : DIM}" stroke-width=".8"/>`
          + `<text x="${f(x)}" y="${f(y + 2.4)}" text-anchor="middle" fill="#5a4a36" style="font:6.5px ${SERIF}">?</text>`;
      }
    });
    el.innerHTML = `<svg viewBox="0 ${f(top)} ${VB_W} ${f(h)}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }
  return { el, update };
}
