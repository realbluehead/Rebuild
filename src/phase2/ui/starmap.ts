// The star map (the Map tab): its own screen in place of the desert. Home in the middle, the four rings round it (by
// the square root of the distance, so the near ones are not crowded), what the telescope sees and how far the probes
// reach, the systems seen, the probes out, and the target. A tap picks a system; the panel shows it, sends the probes
// there, and lists every system seen.
import { h } from '../../shared/ui/dom';
import { canTarget, destinationKnown, isSeen, probeData, rates, setTarget, systemsOf, tripSeconds, type Rates } from '../core/economy';
import { RINGS, SAMPLES_FROM, STUDIES, type StarKind, type StarSystem } from '../core/starmap';
import type { P2State } from '../core/state';
import { enable, flag, num, set, time, type Ctx, type Tab } from './panel';

const STAR_COLOUR: Record<StarKind, string> = {
  'red dwarf': '#ff6a4a', 'orange dwarf': '#ffa04a', 'yellow star': '#ffe27a', 'white star': '#e8eeff', 'blue giant': '#7ab0ff',
};
/** Screen pixels per map pixel. */
const SCALE = 3;
/** Farthest distance on the map, ly. */
const FAR = RINGS[RINGS.length - 1][1] + 5;
/** Sheets of the planet's history that point to the habitable system (a faint mark on the map before it is seen). */
export const HINT_SHEETS = 10;

/** What is known of a system after its studies: its samples first (what the ship's modules ask for), then its star
 *  and, once fully studied, whether it can be lived on. */
export function describe(s: P2State, x: StarSystem): string[] {
  const n = s.studies[x.id];
  if (n === 0) return ['Samples: unknown until a probe studies it', 'Star: not studied yet'];
  const have = Math.floor(s.samples[x.kind]);
  const out = [
    n >= SAMPLES_FROM ? `Samples: ${x.kind.toUpperCase()} · one a probe (you have ${have})` : `Samples: ${x.kind.toUpperCase()} · from the next probe on (you have ${have})`,
    `Star: ${x.star}`,
  ];
  if (n >= STUDIES) out.push(x.habitable ? 'HABITABLE: the ship can go there' : 'Not habitable');
  return out;
}

export function starMapTab(ctx: Ctx): Tab {
  const scene = h('div', 'p2-map');
  const canvas = document.createElement('canvas');
  const legend = h('div', 'p2-dock px-box p2-legend');
  legend.append(h('span', 'sight', 'telescope sees'), h('span', 'reach', 'probes reach'), h('span', 'hear', 'antenna hears'));
  scene.append(canvas, legend);
  const g = canvas.getContext('2d');
  let selected: number | null = null;

  const list = h('div', 'list tele');
  const card = h('div', 'px-box p2-card');
  const title = h('div', 'p2-name');
  const facts = h('div', 'p2-facts');
  const send = h('button', 'px-btn buy p2-go', 'Send probes here');
  const why = h('div', 'p2-note');
  card.append(title, facts, send, why);
  const hangar = h('div', 'p2-note p2-hangar');
  const stop = h('button', 'px-btn p2-small', 'Stop launches');
  const hangarRow = h('div', 'p2-act');
  hangarRow.append(hangar, stop);
  const rows = h('div', 'part-table px-box p2-table p2-systems');
  list.append(card, hangarRow, rows);
  send.addEventListener('click', () => { if (selected !== null && setTarget(ctx.s, selected)) ctx.changed(); });
  stop.addEventListener('click', () => { setTarget(ctx.s, null); ctx.changed(); });

  /** Map pixels from the centre for a distance. */
  const radius = (d: number) => Math.sqrt(Math.min(d, FAR) / FAR) * (Math.min(canvas.width, canvas.height) / 2 - 6);
  const where = (x: StarSystem) => {
    const r = radius(x.distance);
    return { x: canvas.width / 2 + Math.cos(x.angle) * r, y: canvas.height / 2 + Math.sin(x.angle) * r };
  };

  function draw(s: P2State, r: Rates): void {
    if (!g) return;
    const w = Math.max(1, Math.floor(scene.clientWidth / SCALE)), ht = Math.max(1, Math.floor(scene.clientHeight / SCALE));
    if (canvas.width !== w || canvas.height !== ht) { canvas.width = w; canvas.height = ht; }
    const cx = w / 2, cy = ht / 2;
    g.fillStyle = '#04050c';
    g.fillRect(0, 0, w, ht);
    // Far stars (fixed).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (w * ht) / 60; i++) { g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.3})`; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * ht), 1, 1); }
    const circle = (rad: number, colour: string, dash: number[] = []) => {
      g.setLineDash(dash); g.strokeStyle = colour; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    };
    for (const [lo, hi] of RINGS) { g.fillStyle = 'rgba(120,130,160,0.06)'; g.beginPath(); g.arc(cx, cy, radius(hi), 0, 7); g.arc(cx, cy, radius(lo), 0, 7, true); g.fill(); }
    circle(radius(r.sight), 'rgba(255,210,58,0.55)', [2, 2]);
    circle(radius(r.reach), 'rgba(255,74,90,0.7)');
    circle(radius(r.hear), 'rgba(120,200,255,0.35)', [1, 3]);
    const systems = systemsOf(s);
    // The target's line and the probes on it (out and back).
    if (s.target !== null) {
      const t = where(systems[s.target]);
      g.strokeStyle = 'rgba(255,74,90,0.4)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(t.x, t.y); g.stroke();
    }
    for (const p of s.probes) {
      const t = where(systems[p.system]);
      const trip = tripSeconds(systems[p.system], r);
      const k = Math.max(0, Math.min(1, 1 - p.left / trip));
      const f = k < 0.5 ? k * 2 : 2 - k * 2;
      g.fillStyle = k < 0.5 ? '#ffd23a' : '#9affc0';
      g.fillRect(Math.round(cx + (t.x - cx) * f), Math.round(cy + (t.y - cy) * f), 1, 1);
    }
    // The planet's history points to the habitable system: a faint mark until it is seen.
    const dest = systems.find((x) => x.habitable)!;
    if (s.legacy.sheets >= HINT_SHEETS && !isSeen(s, dest, r)) {
      const p = where(dest);
      g.strokeStyle = `rgba(158,255,192,${0.25 + 0.2 * Math.sin(performance.now() / 500)})`;
      g.strokeRect(Math.round(p.x) - 3.5, Math.round(p.y) - 3.5, 7, 7);
    }
    for (const x of systems) {
      if (!isSeen(s, x, r)) continue;
      const p = where(x);
      const px = Math.round(p.x), py = Math.round(p.y);
      g.fillStyle = s.studies[x.id] > 0 ? STAR_COLOUR[x.star] : '#9aa0ac';
      g.fillRect(px - 1, py - 1, 3, 3);
      if (s.studies[x.id] >= STUDIES && x.habitable) { g.strokeStyle = '#9affc0'; g.strokeRect(px - 3.5, py - 3.5, 7, 7); }
      if (x.id === selected) { g.strokeStyle = '#ffd23a'; g.strokeRect(px - 4.5, py - 4.5, 9, 9); }
      if (x.id === s.target) { g.fillStyle = '#ff4a5a'; g.fillRect(px - 1, py - 6, 3, 2); }
    }
    // Home.
    g.fillStyle = '#ffe27a'; g.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
    g.fillStyle = '#fff'; g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
  }

  // A tap picks the nearest system seen.
  canvas.addEventListener('pointerup', (e) => {
    const box = canvas.getBoundingClientRect();
    const mx = ((e.clientX - box.left) / box.width) * canvas.width, my = ((e.clientY - box.top) / box.height) * canvas.height;
    const r = rates(ctx.s);
    let best: number | null = null, bd = 10;
    for (const x of systemsOf(ctx.s)) {
      if (!isSeen(ctx.s, x, r)) continue;
      const p = where(x);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bd) { bd = d; best = x.id; }
    }
    if (best !== null) { selected = best; tab.update(ctx.s); }
  });

  let rowsFor = '';
  const tab: Tab = {
    label: 'Map',
    list,
    scene,
    shown() { if (selected === null) selected = ctx.s.target ?? 0; },
    update(s) {
      const r = rates(s);
      if (!scene.hidden) draw(s, r);
      const systems = systemsOf(s);
      const x = selected === null ? null : systems[selected];
      if (x) {
        set(title, `${x.name} · ring ${x.ring + 1} · ${x.distance} ly`);
        const lines = [
          ...describe(s, x),
          `Studied ${s.studies[x.id]}/${STUDIES}`,
          `A probe: ${time(tripSeconds(x, r))} there and back, ${num(probeData(x, r))} data${x.distance > r.hear ? ' (the antenna hears part of it)' : ''}`,
        ];
        if (facts.dataset.k !== lines.join('|')) { facts.dataset.k = lines.join('|'); facts.replaceChildren(...lines.map((t) => h('div', '', t))); }
        const can = canTarget(s, x.id, r) && s.target !== x.id;
        enable(send, can);
        set(send, s.target === x.id ? 'Probes go here' : 'Send probes here');
        set(why, s.target === x.id ? '' : x.distance > r.reach ? `Out of reach: probes reach ${num(r.reach)} ly.` : '');
      }
      const target = s.target === null ? null : systems[s.target];
      set(hangar, target
        ? `Probes to ${target.name} · ${s.probes.length} out · ${s.fuel < r.launchFuel ? `waiting for ${num(r.launchFuel)} L of fuel` : `next launch ${time(s.launchWait)}`}`
        : `${s.probes.length} probes out · no target: the hangar waits`);
      stop.hidden = s.target === null;
      // The systems seen, as rows (rebuilt when what is known changes).
      const seen = systems.filter((y) => isSeen(s, y, r));
      const key = `${seen.map((y) => `${y.id}:${s.studies[y.id]}`).join(',')}|${s.target}|${selected}|${destinationKnown(s)}`;
      if (key !== rowsFor) {
        rowsFor = key;
        rows.replaceChildren(...seen.map((y) => {
          const row = h('button', 'part-row p2-sys');
          row.append(h('span', 'name', `${y.id === s.target ? '▶ ' : ''}${y.name}`), h('span', 'eff', `${y.distance} ly · ${s.studies[y.id] > 0 ? y.kind : '?'}`), h('span', 'lvl', `${s.studies[y.id]}/${STUDIES}`));
          flag(row, 'on', y.id === selected);
          row.addEventListener('click', () => { selected = y.id; tab.update(ctx.s); });
          return row;
        }));
      }
    },
  };
  return tab;
}
