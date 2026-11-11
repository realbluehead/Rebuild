// Dibuix del mapa en un canvas de baixa resolució, escalat amb píxels nítids.
// Cada píxel lògic es calcula a mà (ImageData): rajoles a prop, colors plans de lluny i un mipmap 4×4
// per al zoom més llunyà. La boira depèn del rang de cada casella respecte de les caselles explorades.
import { ZOOMS } from '../content/world';
import { hash2 } from '../core/rng';
import type { Progress } from '../core/game';
import { itemIndexAt, ringOfRank, type World } from '../core/world';
import { buildAtlas, campFrames, FLAT, ITEM_SPRITES, PAL, robotFrames, SPECIAL_BASE, spriteCanvas, TILE, VARIANTS } from './sprites';

/** Píxels lògics que fa una casella a cada zoom (el costat curt del canvas fa ~256 px lògics). */
export const ZOOM_PX = ZOOMS.map((_, z) => TILE / 4 ** z);
const LOGICAL_SHORT_SIDE = 256;
/** Per sota d'això es deixen de dibuixar rajoles i es fa servir un color per casella. */
const TILE_MIN_PX = 6;
const MIP = 4;
/** Temps que tarda l'agulla del radar a fer una volta, i llargada de l'estela (radiants). */
const SWEEP_MS = 2600;
const SWEEP_TRAIL = 1.1;

interface Popup { wx: number; wy: number; text: string; t0: number; }

/** Què fa un robot quan no explora: anar o tornar del campament, o anar a buscar un objecte (`target`, rang). */
export interface TripView { kind: 'explore' | 'home' | 'out' | 'detour'; f: number; target?: number; }
/** Objectes que el radar detecta: a partir de l'índex `next` de `itemRanks`, fins a `range` anells més enllà. */
export interface RadarView { next: number; range: number; }

const darken = (c: number) => (((c >>> 2) & 0x3f3f3f) | 0xff000000) >>> 0;
/** Barreja dos colors ABGR (t = 0 → a, t = 1 → b). */
const mix = (a: number, b: number, t: number) => {
  const ch = (sh: number) => Math.round(((a >>> sh) & 0xff) + (((b >>> sh) & 0xff) - ((a >>> sh) & 0xff)) * t) << sh;
  return (0xff000000 | ch(16) | ch(8) | ch(0)) >>> 0;
};

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private img!: ImageData;
  private buf!: Uint32Array;
  private W = 0;
  private H = 0;
  private atlas: Uint32Array[];
  private tileOf: Uint8Array;
  private flat: Uint32Array;
  private mipSize: number;
  private mipColor: Uint32Array;
  private mipMin: Uint32Array;
  private robot = robotFrames();
  private camp = campFrames();
  private itemIcons = ITEM_SPRITES.map(spriteCanvas);
  /** Posició dibuixada de cada robot: segueix la real amb suavitat perquè avanci a poc a poc, sense salts. */
  private bots: { x: number; y: number; face: 1 | -1 }[] = [];
  private popups: Popup[] = [];
  /** Centre de la vista, en caselles. El mou el jugador; el mapa no es mou sol. */
  camX: number;
  camY: number;
  cellPx: number;
  /** Píxels lògics per cada píxel CSS (per convertir arrossegaments del ratolí). */
  private logicalPerCss = 1;
  /** Si s'ha demanat anar al robot: la càmera hi vola fins que el jugador la torna a moure. */
  private flying = false;
  /** On s'ha dibuixat la fletxa que apunta al robot quan és fora de la vista (px lògics), per poder-la tocar. */
  private pointer: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private w: World, zoom: number) {
    this.ctx = canvas.getContext('2d')!;
    const n = w.size * w.size;
    // Atles aplanat: atlas[frame][tile * 256 + y * 16 + x].
    this.atlas = buildAtlas().map((tiles) => {
      const out = new Uint32Array(tiles.length * TILE * TILE);
      tiles.forEach((t, i) => out.set(t, i * TILE * TILE));
      return out;
    });
    this.tileOf = new Uint8Array(n);
    this.flat = new Uint32Array(n);
    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        const i = y * w.size + x;
        const t = w.terrain[i];
        const h = hash2(x, y, w.seed + 5);
        this.tileOf[i] = w.special[i] ? SPECIAL_BASE + t : t * VARIANTS + (h % VARIANTS);
        this.flat[i] = w.special[i] ? PAL.blu : FLAT[t][(h >>> 8) % 5 === 0 ? 1 : 0];
      }
    }
    // Mipmap: color mitjà i rang mínim de cada bloc de 4×4.
    this.mipSize = w.size / MIP;
    const m = this.mipSize;
    this.mipColor = new Uint32Array(m * m);
    this.mipMin = new Uint32Array(m * m);
    for (let by = 0; by < m; by++) {
      for (let bx = 0; bx < m; bx++) {
        let r = 0, g = 0, b = 0, min = 0xffffffff, special = false;
        for (let y = 0; y < MIP; y++) {
          for (let x = 0; x < MIP; x++) {
            const i = (by * MIP + y) * w.size + bx * MIP + x;
            const c = this.flat[i];
            r += c & 0xff; g += (c >>> 8) & 0xff; b += (c >>> 16) & 0xff;
            if (w.rank[i] < min) min = w.rank[i];
            if (w.special[i]) special = true;
          }
        }
        const k = MIP * MIP;
        this.mipColor[by * m + bx] = special ? PAL.blu : (0xff000000 | (Math.round(b / k) << 16) | (Math.round(g / k) << 8) | Math.round(r / k)) >>> 0;
        this.mipMin[by * m + bx] = min;
      }
    }
    this.cellPx = ZOOM_PX[zoom];
    // En obrir el joc es mira el punt d'inici; després, la vista només es mou quan el jugador vol.
    this.camX = w.cx + 0.5;
    this.camY = w.cy + 0.5;
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, this.canvas.clientWidth * dpr);
    const ch = Math.max(1, this.canvas.clientHeight * dpr);
    const scale = Math.max(1, Math.round(Math.min(cw, ch) / LOGICAL_SHORT_SIDE));
    this.logicalPerCss = dpr / scale;
    this.W = Math.ceil(cw / scale);
    this.H = Math.ceil(ch / scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  /** Casella (índex) sota un punt de la pantalla (coordenades de client), o -1 si és fora del mapa. */
  cellAt(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * this.W;
    const ly = ((clientY - rect.top) / rect.height) * this.H;
    const x = Math.floor(this.camX + (lx - this.W / 2) / this.cellPx);
    const y = Math.floor(this.camY + (ly - this.H / 2) / this.cellPx);
    const size = this.w.size;
    return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
  }

  /** Si un toc (coordenades de client) cau sobre la fletxa del robot fora de la vista. */
  hitsPointer(clientX: number, clientY: number): boolean {
    if (!this.pointer) return false;
    const rect = this.canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * this.W;
    const ly = ((clientY - rect.top) / rect.height) * this.H;
    return Math.abs(lx - this.pointer.x) < 20 && Math.abs(ly - this.pointer.y) < 20;
  }

  popup(rank: number, text: string, now: number): void {
    const i = this.w.order[rank];
    this.popups.push({ wx: (i % this.w.size) + 0.5, wy: Math.floor(i / this.w.size), text, t0: now });
    if (this.popups.length > 12) this.popups.shift();
  }

  /** Arrossega la vista: el mapa segueix el dit o el ratolí (dx, dy en píxels CSS). */
  panPixels(dx: number, dy: number): void {
    this.flying = false;
    this.camX -= (dx * this.logicalPerCss) / this.cellPx;
    this.camY -= (dy * this.logicalPerCss) / this.cellPx;
    this.clampCam();
  }

  /** Desplaça la vista en la direcció (dx, dy) ∈ [-1, 1] durant dt segons (teclat): ~una pantalla per segon. */
  nudge(dx: number, dy: number, dt: number): void {
    if (!dx && !dy) return;
    this.flying = false;
    const step = (Math.min(this.W, this.H) / this.cellPx) * dt;
    this.camX += dx * step;
    this.camY += dy * step;
    this.clampCam();
  }

  /** La vista vola fins al robot principal. */
  goToRobot(): void {
    this.flying = true;
  }

  private clampCam(): void {
    const size = this.w.size;
    this.camX = Math.min(size, Math.max(0, this.camX));
    this.camY = Math.min(size, Math.max(0, this.camY));
  }

  /** Posició (en caselles, centre) del robot que va per la posició `r` de l'ordre: durant la primera meitat
   *  del pas camina des de la casella r - 1 fins a la r, i la segona meitat s'hi queda explorant-la. */
  private walkerPos(r: number): [number, number] {
    const { order, size } = this.w;
    const n = order.length;
    const k = Math.min(n - 1, Math.max(0, Math.floor(r)));
    const cur = order[k];
    const x1 = (cur % size) + 0.5;
    const y1 = Math.floor(cur / size) + 0.5;
    if (k === 0) return [x1, y1];
    const prev = order[k - 1];
    const x0 = (prev % size) + 0.5;
    const y0 = Math.floor(prev / size) + 0.5;
    const f = Math.min(1, 2 * (r - Math.floor(r)));
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  }

  /** `prog`: com va l'anell (arcs i fins on ha arribat cada robot); `trips[j]`: què fa el robot j. */
  render(prog: Progress, zoom: number, now: number, dt: number, trips: TripView[], radar: RadarView = { next: 0, range: 0 }): void {
    const { w, W, H, buf } = this;
    const size = w.size;
    const n = size * size;
    // Fins on ha arribat cada robot dins de l'anell actual: només hi ha descobert el que ja ha trepitjat.
    const ringA = prog.a;
    const ringB = prog.b;
    const arcStart = prog.starts;
    const arcEnd = prog.reach.map((x, k) => arcStart[k] + Math.floor(x));
    const arcs = arcEnd.length;
    const explored = ringA + prog.reach.reduce((x, y) => x + y, 0);
    // Casella que explora cada robot ara mateix: va agafant color (0 → 1) mentre el robot hi és.
    const exploring = new Map<number, number>();
    prog.reach.forEach((x, k) => {
      const r = arcStart[k] + Math.floor(x);
      const t = Math.min(1, Math.max(0, (x - Math.floor(x)) * 2 - 1));
      if (r < arcStart[k + 1] && t > 0 && trips[prog.robotOf[k]]?.kind === 'explore') exploring.set(r, t);
    });
    const seen = (r: number): boolean => {
      if (r < ringA) return true;
      if (r >= ringB) return false;
      let k = arcs - 1;
      while (k > 0 && arcStart[k] > r) k--;
      return r < arcEnd[k];
    };

    // Zoom suau (interpolació logarítmica cap al nivell triat).
    const target = ZOOM_PX[zoom];
    const k = 1 - Math.exp(-dt * 7);
    this.cellPx = Math.exp(Math.log(this.cellPx) + (Math.log(target) - Math.log(this.cellPx)) * k);
    if (Math.abs(this.cellPx / target - 1) < 0.002) this.cellPx = target;
    const cp = this.cellPx;

    // On és cada robot: al seu arc (si explora), de camí al campament o tornant-ne, o anant a buscar un objecte.
    const band = 2 * Math.sqrt(Math.PI * Math.max(1, explored)) + 8;
    const hx = w.cx + 0.5;
    const hy = w.cy + 0.5;
    const walkers: [number, number][] = trips.map((t, j) => {
      const k = prog.robotOf.indexOf(j);
      const p: [number, number] = k >= 0 ? this.walkerPos(arcStart[k] + prog.reach[k]) : [hx, hy];
      if (t.kind === 'home' || t.kind === 'out') {
        const f = t.kind === 'home' ? t.f : 1 - t.f;
        p[0] += (hx - p[0]) * f;
        p[1] += (hy - p[1]) * f;
      } else if (t.kind === 'detour' && t.target !== undefined) {
        const ti = w.order[t.target];
        const f = t.f < 0.5 ? t.f * 2 : (1 - t.f) * 2;
        p[0] += ((ti % size) + 0.5 - p[0]) * f;
        p[1] += (Math.floor(ti / size) + 0.5 - p[1]) * f;
      }
      return p;
    });
    if (explored >= n) walkers.length = 0;
    this.bots.length = Math.min(this.bots.length, walkers.length);
    walkers.forEach(([x, y], e) => {
      const b = this.bots[e];
      // Cada robot nou surt del campament i va fins al seu arc.
      if (!b) { this.bots[e] = { x: hx, y: hy, face: x >= w.cx ? 1 : -1 }; return; }
      const dx = x - b.x;
      const dy = y - b.y;
      const d = Math.hypot(dx, dy);
      // A prop, el robot és exactament on toca (així descobreix en arribar); lluny (acaba de sortir del
      // campament), hi va rodant.
      const move = d < 1.5 ? d : Math.max(1.5, Math.min(d, (6 + d * 2) * dt));
      if (d > 0) { b.x += (dx / d) * move; b.y += (dy / d) * move; }
      if (Math.abs(dx) > 0.01) b.face = dx > 0 ? 1 : -1;
    });
    if (this.flying && this.bots[0]) {
      const fly = 1 - Math.exp(-dt * 5);
      this.camX += (this.bots[0].x - this.camX) * fly;
      this.camY += (this.bots[0].y - this.camY) * fly;
    }
    const left = this.camX - W / 2 / cp;
    const top = this.camY - H / 2 / cp;

    const fogEnd = explored + band;
    const frame = Math.floor(now / 700) % 2;
    const atlas = this.atlas[frame];
    const { rank, special } = w;
    const VOID = PAL.void;

    if (cp >= 1) {
      const useTiles = cp >= TILE_MIN_PX;
      for (let py = 0; py < H; py++) {
        const wy = top + (py + 0.5) / cp;
        const cy = Math.floor(wy);
        const row = py * W;
        if (cy < 0 || cy >= size) { buf.fill(VOID, row, row + W); continue; }
        const sy = Math.floor((wy - cy) * TILE);
        for (let pxl = 0; pxl < W; pxl++) {
          const wx = left + (pxl + 0.5) / cp;
          const cx = Math.floor(wx);
          if (cx < 0 || cx >= size) { buf[row + pxl] = VOID; continue; }
          const i = cy * size + cx;
          const r = rank[i];
          if (r >= fogEnd) { buf[row + pxl] = VOID; continue; }
          let c: number;
          if (useTiles) {
            const sx = Math.floor((wx - cx) * TILE);
            c = atlas[this.tileOf[i] * 256 + sy * TILE + sx];
          } else {
            c = this.flat[i];
          }
          if (!seen(r)) {
            const t = exploring.get(r);
            c = t !== undefined ? mix(darken(c), c, t) : ((pxl + py) & 1) === 0 && !special[i] ? darken(c) : VOID;
          }
          buf[row + pxl] = c;
        }
      }
    } else {
      const m = this.mipSize;
      for (let py = 0; py < H; py++) {
        const by = Math.floor((top + (py + 0.5) / cp) / MIP);
        const row = py * W;
        if (by < 0 || by >= m) { buf.fill(VOID, row, row + W); continue; }
        for (let pxl = 0; pxl < W; pxl++) {
          const bx = Math.floor((left + (pxl + 0.5) / cp) / MIP);
          if (bx < 0 || bx >= m) { buf[row + pxl] = VOID; continue; }
          const b = by * m + bx;
          const r = this.mipMin[b];
          buf[row + pxl] = seen(r) ? this.mipColor[b] : r < fogEnd && ((pxl + py) & 1) === 0 ? darken(this.mipColor[b]) : VOID;
        }
      }
    }
    const ctx = this.ctx;
    ctx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Campament base (a la casella inicial).
    {
      const sx = Math.round((w.cx + 0.5 - left) * cp);
      const sy = Math.round((w.cy + 0.5 - top) * cp);
      if (cp >= TILE_MIN_PX) {
        const spr = this.camp[Math.floor(now / 600) % 2];
        ctx.drawImage(spr, sx - (spr.width >> 1), sy - spr.height + 6);
      } else {
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(sx - 3, sy - 3, 7, 7);
        ctx.fillStyle = '#dde4ee';
        ctx.fillRect(sx - 2, sy - 2, 5, 5);
        ctx.fillStyle = '#ff5a4a';
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
    }

    // Objectes que algun robot està anant a buscar: marc fix al voltant, perquè es vegi cap on va.
    const fetching = new Set<number>();
    for (const t of trips) if (t.kind === 'detour' && t.target !== undefined) fetching.add(t.target);
    for (const r of fetching) {
      const i = w.order[r];
      const sx = Math.round(((i % size) + 0.5 - left) * cp);
      const sy = Math.round((Math.floor(i / size) + 0.5 - top) * cp);
      const hs = cp >= TILE_MIN_PX ? 7 : 3;
      ctx.strokeStyle = Math.floor(now / 250) % 2 ? '#f2c14e' : '#ff7ad9';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - hs - 0.5, sy - hs - 0.5, hs * 2 + 1, hs * 2 + 1);
      if (cp >= TILE_MIN_PX) ctx.drawImage(this.itemIcons[w.item[i] - 1], sx - 4, sy - 4);
    }
    // Radar de submarí al voltant de cada robot: radi = abast del radar en caselles, una agulla que gira amb
    // una estela que s'esvaeix, i els objectes detectats s'encenen quan l'agulla hi passa per sobre.
    const sweep = ((now / SWEEP_MS) % 1) * Math.PI * 2;
    if (radar.range > 0) {
      const R = radar.range * cp;
      ctx.save();
      for (const b of this.bots) {
        const bx = (b.x - left) * cp;
        const by = (b.y - top) * cp;
        if (bx < -R || by < -R || bx > W + R || by > H + R) continue;
        ctx.fillStyle = 'rgba(80, 255, 120, 0.05)';
        ctx.beginPath();
        ctx.arc(bx, by, R, 0, Math.PI * 2);
        ctx.fill();
        // Cercles de distància i creu.
        ctx.strokeStyle = 'rgba(110, 255, 140, 0.35)';
        ctx.lineWidth = 1;
        for (const f of [1, 2 / 3, 1 / 3]) {
          ctx.beginPath();
          ctx.arc(bx, by, R * f, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(110, 255, 140, 0.15)';
        ctx.beginPath();
        ctx.moveTo(bx - R, by); ctx.lineTo(bx + R, by);
        ctx.moveTo(bx, by - R); ctx.lineTo(bx, by + R);
        ctx.stroke();
        // Estela: falques cada cop més transparents darrere de l'agulla.
        const steps = 12;
        for (let k = 0; k < steps; k++) {
          ctx.fillStyle = `rgba(90, 255, 130, ${0.28 * (1 - k / steps)})`;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.arc(bx, by, R, sweep - ((k + 1) * SWEEP_TRAIL) / steps, sweep - (k * SWEEP_TRAIL) / steps);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(170, 255, 190, 0.9)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(sweep) * R, by + Math.sin(sweep) * R);
        ctx.stroke();
      }
      ctx.restore();

      // Objectes detectats (els que els robots aniran a buscar): s'encenen quan l'agulla els toca i s'esvaeixen.
      const maxRing = prog.ring + radar.range;
      for (let k = Math.max(radar.next, itemIndexAt(w, ringA)); k < w.itemRanks.length; k++) {
        const r = w.itemRanks[k];
        if (ringOfRank(w, r) > maxRing) break;
        if (seen(r) || fetching.has(r)) continue;
        const i = w.order[r];
        const ix = (i % size) + 0.5;
        const iy = Math.floor(i / size) + 0.5;
        const sx = Math.round((ix - left) * cp);
        const sy = Math.round((iy - top) * cp);
        if (sx < -8 || sy < -8 || sx > W + 8 || sy > H + 8) continue;
        // Robot més proper: el seu radar és el que el veu.
        let near = this.bots[0];
        for (const b of this.bots) if (near && Math.hypot(b.x - ix, b.y - iy) < Math.hypot(near.x - ix, near.y - iy)) near = b;
        const behind = near ? (((sweep - Math.atan2(iy - near.y, ix - near.x)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : 0;
        const glow = 1 - behind / (Math.PI * 2); // 1 just quan hi passa l'agulla, 0 just abans de tornar-hi
        ctx.globalAlpha = 0.25 + 0.75 * glow * glow;
        if (glow > 0.85) {
          ctx.fillStyle = 'rgba(120, 255, 150, 0.5)';
          ctx.fillRect(sx - 6, sy - 6, 12, 12);
        }
        if (cp >= TILE_MIN_PX) {
          ctx.drawImage(this.itemIcons[w.item[i] - 1], sx - 4, sy - 4);
        } else {
          ctx.fillStyle = '#9cff57';
          ctx.fillRect(sx - 1, sy - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Robots.
    const step = Math.floor(now / 220) % 2;
    this.bots.forEach((b, e) => {
      const sx = Math.round((b.x - left) * cp);
      const sy = Math.round((b.y - top) * cp);
      if (cp >= TILE_MIN_PX) {
        const spr = this.robot[(step + e) % 2];
        ctx.save();
        ctx.translate(sx, sy - spr.height + 5);
        if (b.face < 0) ctx.scale(-1, 1);
        ctx.drawImage(spr, -(spr.width >> 1), 0);
        ctx.restore();
      } else if ((Math.floor(now / 300) + e) % 3 !== 0) {
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(sx - 2, sy - 2, 5, 5);
        ctx.fillStyle = e === 0 ? '#5ff0ff' : '#a9b4c2';
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
    });

    // Si el robot surt de la vista, una fletxa a la vora indica cap on és (tocant-la, s'hi va).
    this.pointer = null;
    const lead = this.bots[0];
    if (lead) {
      const rx = (lead.x - left) * cp;
      const ry = (lead.y - top) * cp;
      const m = 4;
      if (rx < m || ry < m || rx > W - m || ry > H - m) {
        // Zona on pot anar la fletxa: lluny dels botons de zoom (dreta) i dels panells de baix.
        const css = this.logicalPerCss;
        const x0 = 18, y0 = 18, x1 = W - Math.max(18, 60 * css), y1 = H - Math.max(18, 60 * css);
        const cx0 = (x0 + x1) / 2;
        const cy0 = (y0 + y1) / 2;
        const dx = rx - cx0;
        const dy = ry - cy0;
        const k = Math.min((x1 - x0) / 2 / Math.max(1e-6, Math.abs(dx)), (y1 - y0) / 2 / Math.max(1e-6, Math.abs(dy)));
        const ax = Math.round(cx0 + dx * k);
        const ay = Math.round(cy0 + dy * k);
        this.pointer = { x: ax, y: ay };
        const ang = Math.atan2(dy, dx);
        const pulse = Math.floor(now / 350) % 2;
        ctx.save();
        ctx.translate(ax, ay);
        // Fons rodó amb el robot petit a dins
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = pulse ? '#f2c14e' : '#b37a2a';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(-8, -8, 16, 16);
        const icon = this.robot[0];
        ctx.drawImage(icon, -(icon.width >> 1), -(icon.height >> 1));
        // Fletxa cap al robot
        ctx.rotate(ang);
        ctx.fillStyle = pulse ? '#f2c14e' : '#b37a2a';
        ctx.beginPath();
        ctx.moveTo(17, 0);
        ctx.lineTo(11, -5);
        ctx.lineTo(11, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Textos flotants (or dels llocs especials).
    ctx.font = '8px "Press Start 2P", monospace'; // font de 8 px: queda nítida al canvas lògic
    ctx.textAlign = 'center';
    this.popups = this.popups.filter((p) => now - p.t0 < 1800);
    for (const p of this.popups) {
      const age = (now - p.t0) / 1800;
      const sx = Math.round((p.wx - left) * cp);
      const sy = Math.round((p.wy - top) * cp - age * 18);
      ctx.globalAlpha = Math.min(1, 2 - age * 2);
      ctx.fillStyle = '#1b1420';
      ctx.fillText(p.text, sx + 1, sy + 1);
      ctx.fillStyle = '#5fd0ff';
      ctx.fillText(p.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}
