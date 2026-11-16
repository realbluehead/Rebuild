// Phase II screen: the same layout as phase I — a top bar with the currency and the ≡ menu, the scene in the middle and
// a panel of tabs at the bottom — re-themed in the voyage splash's palette (obsidian plates, steel rivets, red lights)
// with yellow for what you can press. The currency comes from the state (what phase I handed over). One tab per
// building of the base (Telescope, Power, Fuel, Tanks): a simulation of its 20 levels (stepped freely, nothing spent or
// saved) that rebuilds it on its plot in the desert.
import './phase2.css';
import { fmt } from '../../shared/format';
import { h } from '../../shared/ui/dom';
import type { P2State } from '../core/state';
import type { Group } from 'three';
import { FACILITY_MAX, specAt, type Facility } from '../core/facility';
import { POWER, powerCost } from '../core/power';
import { REFINERY, refineryCost } from '../core/refinery';
import { TANKS, tanksCost } from '../core/tanks';
import { TELESCOPE, TELESCOPE_MAX, upgradeCost, type Telescope } from '../core/telescope';
import { createDesert, DOCK_PLOT, POWER_PLOT, REFINERY_PLOT, TANKS_PLOT, TELESCOPE_PLOT } from './desert';
import { buildPower } from './power3d';
import { buildRefinery } from './refinery3d';
import { buildTanks } from './tanks3d';
import { buildTelescope } from './telescope3d';

/** What the telescope sees (a ringed planet among stars), drawn at a resolution and with noise that improve with it. */
function drawView(c: HTMLCanvasElement, t: Telescope): void {
  const n = 8 + Math.round(((t.level - 1) / (TELESCOPE_MAX - 1)) * 56);
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#04050c'; g.fillRect(0, 0, n, n);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = 8 + t.level * 6;
  for (let i = 0; i < stars; i++) {
    const x = rnd(), y = rnd(), b = 0.3 + rnd() * 0.7;
    g.fillStyle = `rgba(255,255,255,${b})`;
    g.fillRect(Math.floor(x * n), Math.floor(y * n), 1, 1);
  }
  const cx = n * 0.5, cy = n * 0.52, R = n * 0.22;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#c87a4a'; g.fillRect(0, 0, n, n);
  if (t.sharpness >= 25) for (let k = -3; k <= 3; k++) { // bands
    g.fillStyle = k % 2 ? '#a85a3a' : '#e8a870';
    g.fillRect(cx - R, cy + (k / 3.5) * R - R * 0.07, R * 2, R * 0.14);
  }
  if (t.sharpness >= 60) { g.fillStyle = '#ff6a4a'; g.beginPath(); g.ellipse(cx + R * 0.35, cy + R * 0.3, R * 0.18, R * 0.1, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(cx + R * 0.45, cy - R * 0.2, R, 0, 7); g.fill(); // night side
  g.restore();
  if (t.aperture >= 0.5) { // the rings
    g.strokeStyle = '#e8d8a8'; g.lineWidth = Math.max(1, n / 40);
    g.beginPath(); g.ellipse(cx, cy, R * 1.7, R * 0.42, -0.25, 0.08 * Math.PI, 0.92 * Math.PI); g.stroke();
  }
  if (t.level >= 10) { g.fillStyle = '#9aa8c8'; g.beginPath(); g.arc(cx + R * 2.2, cy - R * 1.4, Math.max(1, R * 0.18), 0, 7); g.fill(); }
  // Noise, less the sharper it gets.
  const img = g.getImageData(0, 0, n, n), noise = (100 - t.sharpness) * 0.9;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() - 0.5) * noise;
    img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
}

/** A building of the base as the screen shows it: its tab, its plot and plate, its levels, and how it looks in 3D. */
interface Building<S extends { level: number }> {
  tab: string;
  /** Its name on the plot's plate. */
  plate: string;
  plot: number;
  facility: Facility<S>;
  cost(level: number): number;
  build(s: S): Group;
  /** A small picture for the tab's card (the telescope's view), drawn at each level. */
  view?(c: HTMLCanvasElement, s: S): void;
}
const building = <S extends { level: number }>(b: Building<S>) => b as unknown as Building<{ level: number }>;

const BUILDINGS = [
  building<Telescope>({ tab: 'Telescope', plate: 'TELESCOPE', plot: TELESCOPE_PLOT, facility: TELESCOPE, cost: upgradeCost, build: buildTelescope, view: drawView }),
  building({ tab: 'Power', plate: 'MIRROR TOWER', plot: POWER_PLOT, facility: POWER, cost: powerCost, build: buildPower }),
  building({ tab: 'Fuel', plate: 'BLUETRERI REFINERY', plot: REFINERY_PLOT, facility: REFINERY, cost: refineryCost, build: buildRefinery }),
  building({ tab: 'Tanks', plate: 'TANK FARM', plot: TANKS_PLOT, facility: TANKS, cost: tanksCost, build: buildTanks }),
];

export interface Phase2Screen {
  /** Updates the texts from the state (every frame; only what changed is written). */
  render(s: P2State): void;
}

/** Puts the phase II screen over `root` (the phone), fading in. `openMenu` opens the ≡ menu. */
export function showPhase2(root: HTMLElement, s: P2State, openMenu: () => void): Phase2Screen {
  const el = h('div', 'p2');
  /** Each building's level in the simulation, and the tab shown (view state: not saved). */
  const levels = BUILDINGS.map(() => 1);
  let tab = 0;

  // Top bar: metal scraps (the currency of phase II), the shown building's level and its bar; menu on the right.
  const top = h('header', 'topbar');
  const stats = h('div', 'stats');
  const line = h('div', 'gold-line');
  const metal = h('span', 'gold', fmt(s.metal));
  line.append(h('i', 'nut'), metal);
  const lvl = h('div', 'explored');
  const track = h('div', 'bar slim');
  const tfill = h('i');
  track.append(tfill);
  stats.append(line, lvl, track);
  const menu = h('button', 'px-btn menu-btn');
  menu.title = 'Menu';
  menu.append(h('i'), h('i'), h('i'));
  menu.addEventListener('click', openMenu);
  top.append(stats, menu);

  // Middle: the night desert (3D, isometric), starting on the telescope's plot. A tap on a building's plot opens its tab.
  const scene = h('section', 'p2-scene');
  const plate = h('div', 'p2-dock px-box');
  const name = (k: number) => {
    const b = BUILDINGS.findIndex((x) => x.plot === k);
    if (b >= 0) return `AREA ${k + 1} · ${BUILDINGS[b].plate} · Lv ${levels[b]}`;
    return k === DOCK_PLOT ? `AREA ${k + 1} · DRY DOCK · Black siphon` : `AREA ${k + 1} · empty`;
  };
  let shownPlot = TELESCOPE_PLOT;
  const desert = createDesert((k) => {
    shownPlot = k;
    plate.textContent = name(k);
    const b = BUILDINGS.findIndex((x) => x.plot === k);
    if (b >= 0 && b !== tab) showTab(b, false);
  }, TELESCOPE_PLOT);
  scene.append(desert.el, plate);

  // Bottom panel: a tab per building — its card (picture, numbers, bar), the level stepper and its 20 upgrades.
  const panel = h('aside', 'panel');
  const tabs = h('div', 'tabs');
  const lists = BUILDINGS.map((b, bi) => {
    const list = h('div', 'list tele');
    list.hidden = bi !== 0;
    const card = h('div', 'px-box tele-card');
    const view = document.createElement('canvas');
    view.className = 'tele-view';
    const specs = h('div', 'tele-specs');
    const gauge = h('div', 'bar slim tele-gauge');
    const gfill = h('i');
    gauge.append(gfill);
    if (b.view) card.append(view);
    card.append(specs);
    const step = h('div', 'tele-step');
    const down = h('button', 'px-btn', 'Lv −'), up = h('button', 'px-btn can', 'Lv +');
    step.append(down, up);
    const sim = h('div', 'tele-sim');
    sim.append(h('span', '', 'Simulation: free levels, not saved'), step);
    const table = h('div', 'part-table px-box p2-table tele-table');
    const head = h('div', 'part-row head');
    for (const x of ['Lv', 'Upgrade', 'Does', '']) head.append(h('span', '', x));
    table.append(head);
    const rows = b.facility.upgrades.map((u, k) => {
      const row = h('div', 'part-row');
      const buy = h('button', 'px-btn buy');
      buy.addEventListener('click', () => setLevel(k + 1));
      row.append(h('span', 'lvl', String(k + 1)), h('span', 'name', u.name), h('span', 'eff', `${u.part} · ${u.note}`), buy);
      table.append(row);
      return { row, buy };
    });
    list.append(card, sim, table);

    const setLevel = (lv: number) => {
      const level = Math.max(1, Math.min(FACILITY_MAX, lv));
      levels[bi] = level;
      const spec = specAt(b.facility, level);
      desert.setBuilding(b.plot, b.build(spec));
      desert.select(b.plot);
      shownPlot = b.plot;
      plate.textContent = name(shownPlot);
      if (b.view) b.view(view, spec);
      specs.replaceChildren(h('div', 'tele-name', `Lv ${level} · ${b.facility.upgrades[level - 1].name}`), ...b.facility.stats(spec).map((x) => h('div', '', x)), gauge);
      gfill.style.width = `${Math.round(b.facility.gauge(spec) * 100)}%`;
      down.disabled = level <= 1;
      up.disabled = level >= FACILITY_MAX;
      up.classList.toggle('can', level < FACILITY_MAX);
      rows.forEach(({ row, buy }, k) => {
        const n = k + 1;
        row.classList.toggle('done', n <= level);
        buy.classList.toggle('can', n === level + 1);
        buy.disabled = n > level + 1;
        buy.replaceChildren();
        if (n <= level) buy.append(n === 1 ? 'Start' : 'Built');
        else buy.append(h('i', 'nut'), fmt(b.cost(n)));
      });
      topLine();
    };
    down.addEventListener('click', () => setLevel(levels[bi] - 1));
    up.addEventListener('click', () => setLevel(levels[bi] + 1));
    // Built at level 1 without moving the view (the telescope's plot is where it starts).
    const spec = specAt(b.facility, 1);
    desert.setBuilding(b.plot, b.build(spec));
    return { list, setLevel };
  });
  const tabBtns = BUILDINGS.map((b, k) => {
    const btn = h('button', `px-btn tab${k === 0 ? ' on' : ''}`, b.tab);
    btn.addEventListener('click', () => showTab(k, true));
    tabs.append(btn);
    return btn;
  });
  function topLine(): void {
    lvl.textContent = `${BUILDINGS[tab].tab} Lv ${levels[tab]}/${TELESCOPE_MAX}`;
    tfill.style.width = `${(levels[tab] / FACILITY_MAX) * 100}%`;
  }
  /** Shows tab `k`; `go` glides the view to its building (not when the player just tapped that plot). */
  function showTab(k: number, go: boolean): void {
    tab = k;
    tabBtns.forEach((x, q) => x.classList.toggle('on', q === k));
    lists.forEach((l, q) => (l.list.hidden = q !== k));
    if (go) { desert.select(BUILDINGS[k].plot); shownPlot = BUILDINGS[k].plot; plate.textContent = name(shownPlot); }
    topLine();
  }
  panel.append(tabs, ...lists.map((l) => l.list));
  lists.forEach((l, k) => { if (k === 0) l.setLevel(1); });

  el.append(top, scene, panel);
  root.append(el);
  void el.offsetWidth; // (styles applied at opacity 0 first, so the change below fades)
  el.classList.add('in'); // fades in (over the voyage splash)

  return {
    render(st) {
      const m = fmt(st.metal);
      if (metal.textContent !== m) metal.textContent = m;
    },
  };
}
