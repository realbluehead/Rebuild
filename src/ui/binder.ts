// The archive binder, under the Decoder in the Library: where the printed sheets go. An old ring binder in black crushed
// velvet with a silver clasp and faded silver lettering. It starts shut; once there are sheets a tap opens it on the
// first one, on the right with the cover's inside on the left. Pages go two to a spread like a book (1 | 2-3 | 4-5 …;
// the last spread is n-1 | n when the count is odd, n | blank when even). A tap on the right-hand side turns a leaf
// over the rings to the left (past the last spread it shuts); a tap on the left-hand page turns it back, and on the
// bare inside of the cover (or a blank page) it shuts. Silver arrows beside the book turn the pages (back on the left,
// forward on the right); a tap on a page opens it in the reader, over the whole phone, to read its full text. Drawn in SVG (viewBox 320×180 from y 14); only
// redrawn when what it shows changes, so each page turn plays once.

/** A printed sheet: its heading and its text. */
export interface BinderPage { title: string; text: string }

const VB_W = 320;
/** Crushed black velvet: base, nap highlight, shadow. Silver: main, dark, highlight. */
const BASE = '#17151c';
const HI = '#4a4652';
const LO = '#060508';
const SILVER = ['#9aa0a4', '#45494c', '#e0e4e6'];
const SEPIA = '#6b4a2a';
const SERIF = "Georgia, 'Times New Roman', serif";

/** Cover and page boxes (open: the cover's inside on the left, the rings, the page on the right). */
const X0 = 30, Y0 = 34, W = 260, H = 156;
const LW = 112;
const SX = X0 + LW + 16;
const PX = SX + 14, PW = W - (PX - X0) - 10;
/** The left-hand page (a sheet already turned), mirrored across the rings. */
const LPX = SX - 8 - (PW - 2);
/** How the open binder was reached: a page turned forward or back, or just opened. */
type Turn = 'fwd' | 'back' | '';
/** Shut: the front cover alone, centred. */
const CW = 132, CX = (VB_W - CW) / 2;

const f = (n: number) => n.toFixed(1);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function rand(seed: number): () => number { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

/** Velvet nap, its sheen and the yellowed paper. */
function defs(): string {
  const r = rand(5);
  let dots = '';
  for (let i = 0; i < 26; i++) dots += `<circle cx="${f(r() * 8)}" cy="${f(r() * 8)}" r="${f(0.3 + r() * 0.5)}" fill="${r() > 0.5 ? HI : LO}" opacity="${f(0.25 + r() * 0.35)}"/>`;
  return `<defs><pattern id="bd-nap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(19)"><rect width="8" height="8" fill="${BASE}"/>${dots}</pattern>`
    + `<radialGradient id="bd-sheen" cx=".35" cy=".4" r=".75"><stop offset="0" stop-color="${HI}" stop-opacity=".45"/><stop offset=".55" stop-color="${HI}" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>`
    + `<linearGradient id="bd-paper" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#efe1b8"/><stop offset=".7" stop-color="#e2cf9c"/><stop offset="1" stop-color="#c4a66a"/></linearGradient></defs>`;
}

/** A velvet board: nap, sheen and a rubbed edge. */
function board(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" rx="5" fill="#000" opacity=".5"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#bd-nap)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#bd-sheen)"/>`
    + `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="4" fill="none" stroke="${HI}" stroke-width="2.4" opacity=".35"/>`;
}

/** The faded silver title with its double frame and the helix. */
function title(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  return `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" fill="none" stroke="${SILVER[0]}" stroke-width=".8" opacity=".6"/>`
    + `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" fill="none" stroke="${SILVER[0]}" stroke-width=".4" stroke-dasharray="1 2" opacity=".6"/>`
    + `<g transform="translate(${f(cx)} ${y + 50})" stroke="${SILVER[0]}" stroke-width="1.6" fill="none" opacity=".75"><path d="M-5,-20 C12,-10 -12,10 5,20"/><path d="M5,-20 C-12,-10 12,10 -5,20"/>`
    + [-14, -7, 0, 7, 14].map((v) => `<line x1="-4" y1="${v}" x2="4" y2="${v}" stroke-width=".8"/>`).join('') + `</g>`
    + `<text x="${f(cx)}" y="${y + 96}" text-anchor="middle" fill="${SILVER[0]}" opacity=".5" style="font:13px ${SERIF};letter-spacing:1px">Archive</text>`
    + `<text x="${f(cx)}" y="${y + 110}" text-anchor="middle" fill="${SILVER[0]}" opacity=".4" style="font:italic 9px ${SERIF}">of the lost planet</text>`;
}

/** The leather strap with its silver clasp, at the right edge of the shut cover. */
function clasp(x: number, y: number, ready: boolean): string {
  return `<rect x="${x - 14}" y="${y - 9}" width="24" height="18" rx="2" fill="#3a2214" stroke="#1a0c04"/>`
    + `<rect x="${x - 22}" y="${y - 11}" width="16" height="22" rx="3" fill="${SILVER[0]}" stroke="${SILVER[1]}"${ready ? ' class="bd-ready"' : ''}/>`
    + `<rect x="${x - 20}" y="${y - 9}" width="3" height="18" rx="1" fill="${SILVER[2]}" opacity=".5"/>`
    + `<path d="M${x - 14},${y - 4} a2.5,2.5 0 1 1 0.1,0 l1.2,7 h-2.6z" fill="${SILVER[1]}"/>`;
}

/** Splits `text` into lines of at most `max` characters, at spaces. */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** An aged sheet: yellowed paper, browned edges, foxing, the helix at the head, its heading and text, then faint
 *  hand-written lines down to the page number. */
function sheet(page: BinderPage, at: number, of: number, x: number, cls = ''): string {
  const r = rand(at * 7 + 3);
  const y = Y0 + 8, w = PW - 2, hh = H - 24;
  let s = `<g${cls ? ` class="${cls}"` : ''}><rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#bd-paper)" stroke="#a8884e" stroke-width=".6"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="none" stroke="#8a6a3a" stroke-width="3" opacity=".18"/>`;
  for (let i = 0; i < 7; i++) s += `<circle cx="${f(x + r() * w)}" cy="${f(y + r() * hh)}" r="${f(0.6 + r() * 2.2)}" fill="#9a6a30" opacity="${f(0.12 + r() * 0.2)}"/>`;
  s += `<g transform="translate(${f(x + w / 2)} ${y + 10})" stroke="#6b3a5a" stroke-width=".9" fill="none"><path d="M-8,-3 C-4,3 4,-3 8,3"/><path d="M-8,3 C-4,-3 4,3 8,-3"/></g>`;
  s += `<text x="${f(x + w / 2)}" y="${y + 24}" text-anchor="middle" fill="${SEPIA}" style="font:bold 8px ${SERIF}">${esc(page.title)}</text>`;
  s += `<line x1="${x + 12}" y1="${y + 28}" x2="${x + w - 12}" y2="${y + 28}" stroke="${SEPIA}" stroke-width=".6"/>`;
  let ly = y + 39;
  for (const line of wrap(page.text, 24).slice(0, 8)) {
    s += `<text x="${x + 8}" y="${ly}" fill="${SEPIA}" style="font:italic 7.5px ${SERIF}">${esc(line)}</text>`;
    ly += 9;
  }
  for (ly += 2; ly < y + hh - 14; ly += 4.6) s += `<path d="M${x + 7},${f(ly)} q${f(w * 0.2)},${f((r() - 0.5) * 1.2)} ${f(w - 14 - r() * 16)},0" stroke="${SEPIA}" stroke-width=".5" fill="none" opacity=".45"/>`;
  s += `<text x="${f(x + w / 2)}" y="${y + hh - 5}" text-anchor="middle" fill="${SEPIA}" opacity=".8" style="font:7px ${SERIF}">${at + 1} / ${of}</text>`;
  return s + `</g>`;
}

function shut(count: number): string {
  let s = board(CX, Y0, CW, H);
  // The spine's ring bumps along the left edge.
  for (let k = 0; k < 3; k++) s += `<rect x="${CX - 3}" y="${Y0 + 24 + k * 48}" width="6" height="14" rx="2" fill="${SILVER[1]}"/><rect x="${CX - 2}" y="${Y0 + 26 + k * 48}" width="1.4" height="10" fill="${SILVER[2]}" opacity=".5"/>`;
  s += title(CX + 6, Y0 + 8, CW - 18, H - 16);
  s += clasp(CX + CW + 6, Y0 + H / 2, count > 0);
  s += `<text x="${VB_W / 2}" y="${Y0 - 10}" text-anchor="middle" fill="${SILVER[0]}" style="font:8px var(--font-num)">${count ? `${count} sheet${count > 1 ? 's' : ''} · tap to open` : ''}</text>`;
  return s;
}

/** A silver page-turn arrow centred at `x` on the book's middle, pointing `dir` (-1: back, 1: forward). */
function arrow(x: number, dir: number): string {
  const y = Y0 + H / 2;
  const tip = (dx: number) => f(x + dir * dx);
  return `<g class="bd-arrow"><circle cx="${f(x)}" cy="${y}" r="11" fill="${LO}" stroke="${SILVER[1]}" stroke-width="1.2"/>`
    + `<path d="M${tip(-3)},${y - 6} L${tip(4)},${y} L${tip(-3)},${y + 6}" fill="none" stroke="${SILVER[0]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

/** Layers drawn for a stack of `k` sheets out of `n` (thick when it holds most of them, at least one if any). */
const STACK_LAYERS = 10;
/** A stack of `k` sheets under a page at `x`, its edges showing outwards (`side` -1: left, 1: right) and downwards. */
function stack(x: number, k: number, n: number, side: number): string {
  if (k <= 0) return '';
  const layers = Math.max(1, Math.round((STACK_LAYERS * k) / n));
  const y = Y0 + 8, w = PW - 2, hh = H - 24;
  let s = '';
  for (let j = layers; j >= 1; j--) {
    s += `<rect x="${f(x + side * j * 0.9)}" y="${f(y + j * 0.6)}" width="${w}" height="${hh}" fill="${j % 2 ? '#d8c48e' : '#c4a66a'}" stroke="#8a6a3a" stroke-width=".35"/>`;
  }
  return s;
}

/** Open on the spread whose right-hand page is sheet `at` (even; `at` = n means a blank right page): `at - 1` on the
 *  left (or the cover's inside). A turn draws the leaf that moves: forward, the old right-hand page (`at - 2`) folds onto
 *  the rings and its back (`at - 1`) comes down on the left; back, the old left-hand page (`at + 1`) folds up and its
 *  front (`at`) comes down on the right. */
function open(pages: readonly BinderPage[], at: number, turn: Turn): string {
  const n = pages.length;
  let s = board(X0, Y0, W, H);
  // Inside of the cover, with the title; the spine channel.
  s += `<rect x="${X0 + 8}" y="${Y0 + 8}" width="${LW}" height="${H - 16}" rx="2" fill="${LO}" opacity=".55"/>` + title(X0 + 8, Y0 + 8, LW, H - 16);
  s += `<rect x="${SX - 6}" y="${Y0 + 3}" width="22" height="${H - 6}" fill="${LO}"/><rect x="${SX - 6}" y="${Y0 + 3}" width="22" height="${H - 6}" fill="#000" opacity=".35"/>`;
  // The sheets under each open page, as a stack that grows with them like a real book: those read pile up on the
  // left, those to come on the right (each layer shows a little further out and lower).
  // They count leaves, not pages: a leaf holds two (front on the right, back on the left), so under page 2 (the back of
  // page 1) there is only the cover, and the last page has nothing under it either.
  const leaves = Math.ceil(n / 2);
  s += stack(LPX, at / 2 - 1, leaves, -1) + stack(PX, Math.ceil((n - at) / 2) - 1, leaves, 1);
  // While a leaf turns, the page it is about to cover stays in view underneath (forward: the old left-hand page;
  // back: the old right-hand page), so nothing goes blank before the leaf lands.
  if (turn === 'fwd' && at >= 3) s += sheet(pages[at - 3], at - 3, n, LPX);
  if (turn === 'back' && at + 2 < n) s += sheet(pages[at + 2], at + 2, n, PX);
  // Left: the sheet before (coming down there after a forward turn); right: this one, if any (after a back turn).
  if (at > 0) s += sheet(pages[at - 1], at - 1, n, LPX, turn === 'fwd' ? 'bd-in-l' : '');
  if (at < n) s += sheet(pages[at], at, n, PX, turn === 'back' ? 'bd-in-r' : '');
  // The leaf on its way up: forward, the old right page; back, the old left page.
  if (turn === 'fwd') s += sheet(pages[at - 2], at - 2, n, PX, 'bd-out-r');
  if (turn === 'back') s += sheet(pages[at + 1], at + 1, n, LPX, 'bd-out-l');
  // Silver rings and the bar that holds them.
  for (let k = 0; k < 3; k++) {
    const cy = Y0 + 30 + k * 48;
    s += `<ellipse cx="${SX + 5}" cy="${cy}" rx="11" ry="5.5" fill="none" stroke="${SILVER[1]}" stroke-width="4"/><ellipse cx="${SX + 5}" cy="${cy}" rx="11" ry="5.5" fill="none" stroke="${SILVER[0]}" stroke-width="2.4"/>`
      + `<path d="M${SX - 4},${cy - 3} q9,-6 18,0" fill="none" stroke="${SILVER[2]}" stroke-width=".9"/>`;
  }
  s += `<rect x="${SX - 8}" y="${Y0 + 10}" width="6" height="${H - 20}" rx="2" fill="${SILVER[0]}" stroke="${SILVER[1]}"/><rect x="${SX - 7}" y="${Y0 + 12}" width="1.4" height="${H - 24}" fill="${SILVER[2]}" opacity=".6"/>`;
  // Page-turn arrows beside the book: back on the left (once past the first spread), forward on the right.
  if (at > 0) s += arrow(X0 / 2, -1);
  if (at + 2 <= n - (n % 2)) s += arrow(X0 + W + (VB_W - X0 - W) / 2, 1);
  return s;
}

/** The reader: one sheet over the whole phone (with margins), its full text scrolling; a tap outside it or on × closes. */
function read(page: BinderPage, at: number, of: number): void {
  const el = (tag: string, cls: string, text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const wrapEl = el('div', 'lore-reader');
  const sheetEl = el('div', 'lore-sheet');
  const close = el('button', 'lore-close', '×');
  close.setAttribute('aria-label', 'Close');
  const body = el('div', 'lore-body');
  for (const para of page.text.split(/\n\s*\n/)) body.append(el('p', '', para));
  sheetEl.append(close, el('div', 'lore-helix'), el('div', 'lore-title', page.title), body, el('div', 'lore-num', `${at + 1} / ${of}`));
  wrapEl.append(sheetEl);
  wrapEl.addEventListener('click', (e) => { if (e.target === wrapEl || e.target === close) wrapEl.remove(); });
  (document.getElementById('app') ?? document.body).append(wrapEl);
}

export interface Binder {
  el: HTMLElement;
  /** The sheets printed so far, in order (redraws only if they changed). */
  update(pages: readonly BinderPage[]): void;
}

export function createBinder(): Binder {
  const el = document.createElement('div');
  el.className = 'binder';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 14 ${VB_W} 180`); // only the band in use: the label over the shut cover to the board's foot
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Archive of printed sheets');
  el.append(svg);
  let pages: readonly BinderPage[] = [];
  let isOpen = false;
  /** The sheet on the right-hand page while open, always even (it opens on the first; `pages.length` = blank). */
  let at = 0;
  /** The last spread's right-hand sheet: n when the count is even (blank), n - 1 when odd. */
  const lastAt = () => pages.length - (pages.length % 2);
  let key = '';
  const draw = (turn: Turn = '') => {
    if (isOpen && !pages.length) isOpen = false;
    at = Math.min(at, lastAt());
    const k = `${isOpen}|${at}|${pages.length}`;
    if (k === key) return;
    key = k;
    svg.innerHTML = defs() + (isOpen ? open(pages, at, turn) : shut(pages.length));
  };
  svg.addEventListener('click', (e) => {
    if (!pages.length) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * VB_W;
    if (!isOpen) { isOpen = true; at = 0; draw(); return; }
    const n = pages.length;
    if (x < X0) { if (at > 0) { at -= 2; draw('back'); } return; } // the arrows
    if (x > X0 + W) { if (at + 2 <= lastAt()) { at += 2; draw('fwd'); } return; }
    if (at > 0 && x >= LPX - 4 && x < SX - 6) { read(pages[at - 1], at - 1, n); return; } // a page: read it
    if (at < n && x >= PX - 4) { read(pages[at], at, n); return; }
    isOpen = false; // the bare inside of the cover or a blank page: shut
    draw();
  });
  return {
    el,
    update(next) {
      pages = next;
      draw();
    },
  };
}
