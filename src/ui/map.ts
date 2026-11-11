// Map rendering on a low-resolution canvas, scaled up with crisp pixels.
// Every logical pixel is computed by hand (ImageData): tiles up close, flat colours further out and a 4x4
// mipmap for the farthest zoom. Fog depends on each cell's rank relative to the explored cells.
import { ZOOMS } from '../content/world';
import { hash2 } from '../core/rng';
import type { Progress } from '../core/game';
import { itemIndexAt, pathCells, ringOfRank, type World } from '../core/world';
import { buildAtlas, campFrames, FLAT, ITEM_SPRITES, PAL, robotFrames, SPECIAL_BASE, spriteCanvas, TILE, VARIANTS } from './sprites';

/** Logical pixels per cell at each zoom (the canvas's short side is ~256 logical px). */
export const ZOOM_PX = ZOOMS.map((_, z) => TILE / 4 ** z);
const LOGICAL_SHORT_SIDE = 256;
/** Below this, tiles are no longer drawn and each cell gets one flat colour. */
const TILE_MIN_PX = 6;
const MIP = 4;
/** Time the radar needle takes for one turn, and the length of its trail (radians). */
const SWEEP_MS = 2600;
const SWEEP_TRAIL = 1.1;

interface Popup { wx: number; wy: number; text: string; t0: number; }

/** What a rover does when not exploring: going to or from camp, or fetching an item (`target`, a rank, walking
 *  from the cell of rank `from`). */
export interface TripView { kind: 'explore' | 'home' | 'out' | 'detour'; f: number; target?: number; from?: number; }
/** Items the radar detects: from index `next` of `itemRanks`, up to `range` rings further out. */
export interface RadarView { next: number; range: number; }

const darken = (c: number) => (((c >>> 2) & 0x3f3f3f) | 0xff000000) >>> 0;
/** Mixes two ABGR colours (t = 0 -> a, t = 1 -> b). */
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
  /** Drawn position of each rover: follows the real one smoothly so it creeps forward without jumps. */
  private bots: { x: number; y: number; face: 1 | -1 }[] = [];
  private popups: Popup[] = [];
  /** View centre, in cells. The player moves it; the map never moves on its own. */
  camX: number;
  camY: number;
  cellPx: number;
  /** Logical pixels per CSS pixel (to convert mouse drags). */
  private logicalPerCss = 1;
  /** Whether a fly-to-rover was requested: the camera flies there until the player moves it again. */
  private flying = false;
  /** Where the arrow pointing to an off-screen rover was drawn (logical px), so it can be tapped. */
  private pointer: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private w: World, zoom: number) {
    this.ctx = canvas.getContext('2d')!;
    const n = w.size * w.size;
    // Flattened atlas: atlas[frame][tile * 256 + y * 16 + x].
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
    // Mipmap: mean colour and minimum rank of each 4x4 block.
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
    // The game opens looking at the start; afterwards the view only moves when the player wants.
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

  /** Cell (index) under a screen point (client coordinates), or -1 if outside the map. */
  cellAt(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * this.W;
    const ly = ((clientY - rect.top) / rect.height) * this.H;
    const x = Math.floor(this.camX + (lx - this.W / 2) / this.cellPx);
    const y = Math.floor(this.camY + (ly - this.H / 2) / this.cellPx);
    const size = this.w.size;
    return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
  }

  /** Whether a tap (client coordinates) lands on the off-screen rover arrow. */
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

  /** Drags the view: the map follows the finger or mouse (dx, dy in CSS pixels). */
  panPixels(dx: number, dy: number): void {
    this.flying = false;
    this.camX -= (dx * this.logicalPerCss) / this.cellPx;
    this.camY -= (dy * this.logicalPerCss) / this.cellPx;
    this.clampCam();
  }

  /** Moves the view in direction (dx, dy) in [-1, 1] for dt seconds (keyboard): about one screen per second. */
  nudge(dx: number, dy: number, dt: number): void {
    if (!dx && !dy) return;
    this.flying = false;
    const step = (Math.min(this.W, this.H) / this.cellPx) * dt;
    this.camX += dx * step;
    this.camY += dy * step;
    this.clampCam();
  }

  /** The view flies to the lead rover. */
  goToRobot(): void {
    this.flying = true;
  }

  private clampCam(): void {
    const size = this.w.size;
    this.camX = Math.min(size, Math.max(0, this.camX));
    this.camY = Math.min(size, Math.max(0, this.camY));
  }

  /** Position (in cells, centre) of the rover at position `r` of the order: during the first half of the
   *  step it walks from cell r - 1 to cell r, and during the second half it stays there exploring it. */
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

  /** `prog`: ring progress (arcs and how far each rover has got); `trips[j]`: what rover j is doing. */
  /** Cells revealed by finished detours (rebuilt when `scouted` changes). */
  private scoutKey = '';
  private scoutCells = new Set<number>();

  /** `scouted`: finished detour paths (triples [fromRank, toRank, maxRank], see GameState). */
  render(prog: Progress, zoom: number, now: number, dt: number, trips: TripView[], radar: RadarView = { next: 0, range: 0 }, scouted: number[] = []): void {
    const { w, W, H, buf } = this;
    const size = w.size;
    const n = size * size;
    // How far each rover has got on the current ring: it has only revealed what it has stepped on.
    const ringA = prog.a;
    const ringB = prog.b;
    const arcStart = prog.starts;
    const arcEnd = prog.reach.map((x, k) => arcStart[k] + Math.floor(x));
    const arcs = arcEnd.length;
    const explored = ringA + prog.reach.reduce((x, y) => x + y, 0);
    // Cell each rover is exploring right now: it gains colour (0 -> 1) while the rover is on it.
    const exploring = new Map<number, number>();
    prog.reach.forEach((x, k) => {
      const r = arcStart[k] + Math.floor(x);
      const t = Math.min(1, Math.max(0, (x - Math.floor(x)) * 2 - 1));
      if (r < arcStart[k + 1] && t > 0 && trips[prog.robotOf[k]]?.kind === 'explore') exploring.set(r, t);
    });
    // Cells revealed on radar detours: finished paths, plus the walked part of the ones under way.
    const key = scouted.join(',');
    if (key !== this.scoutKey) {
      this.scoutKey = key;
      this.scoutCells = new Set();
      for (let q = 0; q < scouted.length; q += 3) for (const i of pathCells(w, scouted[q], scouted[q + 1])) this.scoutCells.add(i);
    }
    const scout = new Set(this.scoutCells);
    for (const t of trips) {
      if (t.kind !== 'detour' || t.from === undefined || t.target === undefined) continue;
      const path = pathCells(w, t.from, t.target);
      const upTo = Math.floor(Math.min(1, t.f * 2) * (path.length - 1) + 0.5);
      for (let q = 0; q <= upTo; q++) scout.add(path[q]);
    }
    const seen = (r: number): boolean => {
      if (r < ringA) return true;
      if (r >= ringB) return false;
      let k = arcs - 1;
      while (k > 0 && arcStart[k] > r) k--;
      return r < arcEnd[k];
    };

    // Smooth zoom (logarithmic interpolation towards the chosen level).
    const target = ZOOM_PX[zoom];
    const k = 1 - Math.exp(-dt * 7);
    this.cellPx = Math.exp(Math.log(this.cellPx) + (Math.log(target) - Math.log(this.cellPx)) * k);
    if (Math.abs(this.cellPx / target - 1) < 0.002) this.cellPx = target;
    const cp = this.cellPx;

    // Where each rover is: on its arc (exploring), on the way to or from camp, or fetching an item.
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
      // Every new rover leaves camp and travels to its arc.
      if (!b) { this.bots[e] = { x: hx, y: hy, face: x >= w.cx ? 1 : -1 }; return; }
      const dx = x - b.x;
      const dy = y - b.y;
      const d = Math.hypot(dx, dy);
      // Up close the rover is exactly where it should be (so it reveals on arrival); far away (it has just
      // left camp) it rolls there.
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
          const scouted = scout.has(i);
          if (r >= fogEnd && !scouted) { buf[row + pxl] = VOID; continue; }
          let c: number;
          if (useTiles) {
            const sx = Math.floor((wx - cx) * TILE);
            c = atlas[this.tileOf[i] * 256 + sy * TILE + sx];
          } else {
            c = this.flat[i];
          }
          if (!seen(r) && !scouted) {
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

    // Base camp (on the starting cell).
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

    // Items some rover is fetching: a fixed frame around them, so you can see where it is heading.
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
    // Submarine-style radar around each rover: radius = radar range in cells, a rotating needle with a fading
    // trail, and detected items light up as the needle sweeps over them.
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
        // Range rings and crosshair.
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
        // Trail: wedges that get more transparent behind the needle.
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

      // Detected items (the ones rovers will fetch): they light up when the needle hits them and fade out.
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
        // Nearest rover: its radar is the one that sees it.
        let near = this.bots[0];
        for (const b of this.bots) if (near && Math.hypot(b.x - ix, b.y - iy) < Math.hypot(near.x - ix, near.y - iy)) near = b;
        const behind = near ? (((sweep - Math.atan2(iy - near.y, ix - near.x)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : 0;
        const glow = 1 - behind / (Math.PI * 2); // 1 right as the needle passes, 0 right before it comes back
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

    // Rovers.
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

    // If the rover leaves the view, an arrow at the edge points to it (tapping it goes there).
    this.pointer = null;
    const lead = this.bots[0];
    if (lead) {
      const rx = (lead.x - left) * cp;
      const ry = (lead.y - top) * cp;
      const m = 4;
      if (rx < m || ry < m || rx > W - m || ry > H - m) {
        // Where the arrow may go: away from the zoom buttons (right) and the panels at the bottom.
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
        // Box with the small rover inside
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = pulse ? '#f2c14e' : '#b37a2a';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#1b1420';
        ctx.fillRect(-8, -8, 16, 16);
        const icon = this.robot[0];
        ctx.drawImage(icon, -(icon.width >> 1), -(icon.height >> 1));
        // Arrow towards the rover
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

    // Floating texts (bluetreri from deposits, items, unloads).
    ctx.font = '8px "Press Start 2P", monospace'; // 8 px font: stays crisp on the logical canvas
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
