// Phase II screen: the same layout as phase I — a top bar with the currency and the ≡ menu, the scene in the middle and
// a panel of tabs at the bottom — re-themed in the voyage splash's palette (obsidian plates, steel rivets, red lights)
// with yellow for what you can press. The currency comes from the state (what phase I handed over). One tab so far, the
// Telescope: a simulation of its 20 levels (stepped freely, nothing spent or saved) that rebuilds it in the desert.
import './phase2.css';
import { fmt } from '../../shared/format';
import { h } from '../../shared/ui/dom';
import type { P2State } from '../core/state';
import { TELESCOPE_MAX, telescopeAt, telescopeRange, UPGRADES, upgradeCost, type Telescope } from '../core/telescope';
import { createDesert, DOCK_PLOT, TELESCOPE_PLOT } from './desert';

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

export interface Phase2Screen {
  /** Updates the texts from the state (every frame; only what changed is written). */
  render(s: P2State): void;
}

/** Puts the phase II screen over `root` (the phone), fading in. `openMenu` opens the ≡ menu. */
export function showPhase2(root: HTMLElement, s: P2State, openMenu: () => void): Phase2Screen {
  const el = h('div', 'p2');
  /** The telescope's level in the simulation (view state: not saved). */
  let level = 1;

  // Top bar: metal scraps (the currency of phase II), the telescope's level and its bar; menu on the right.
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

  // Middle: the night desert (3D, isometric), starting on the telescope's plot.
  const scene = h('section', 'p2-scene');
  const plate = h('div', 'p2-dock px-box');
  let shownPlot = TELESCOPE_PLOT;
  const name = (k: number) =>
    k === TELESCOPE_PLOT ? `AREA ${k + 1} · TELESCOPE · Lv ${level}`
      : k === DOCK_PLOT ? `AREA ${k + 1} · DRY DOCK · Black siphon` : `AREA ${k + 1} · empty`;
  const desert = createDesert((k) => { shownPlot = k; plate.textContent = name(k); }, TELESCOPE_PLOT);
  scene.append(desert.el, plate);

  // Bottom panel: the Telescope tab — what it sees, its numbers, the level stepper and the 20 upgrades.
  const panel = h('aside', 'panel');
  const tabs = h('div', 'tabs');
  tabs.append(h('button', 'px-btn tab on', 'Telescope'));
  const list = h('div', 'list tele');
  const card = h('div', 'px-box tele-card');
  const view = document.createElement('canvas');
  view.className = 'tele-view';
  const specs = h('div', 'tele-specs');
  const step = h('div', 'tele-step');
  const down = h('button', 'px-btn', 'Lv −'), up = h('button', 'px-btn can', 'Lv +');
  step.append(down, up);
  card.append(view, specs);
  const sim = h('div', 'tele-sim');
  sim.append(h('span', '', 'Simulation: free levels, not saved'), step);
  const table = h('div', 'part-table px-box p2-table tele-table');
  const head = h('div', 'part-row head');
  for (const x of ['Lv', 'Upgrade', 'Does', '']) head.append(h('span', '', x));
  table.append(head);
  const rows = UPGRADES.map((u, k) => {
    const row = h('div', 'part-row');
    const buy = h('button', 'px-btn buy');
    buy.addEventListener('click', () => setLevel(k + 1));
    row.append(h('span', 'lvl', String(k + 1)), h('span', 'name', u.name), h('span', 'eff', `${u.part} · ${u.note}`), buy);
    table.append(row);
    return { row, buy };
  });
  list.append(card, sim, table);
  panel.append(tabs, list);

  const setLevel = (lv: number) => {
    level = Math.max(1, Math.min(TELESCOPE_MAX, lv));
    const t = telescopeAt(level);
    desert.setTelescope(t);
    desert.select(TELESCOPE_PLOT);
    shownPlot = TELESCOPE_PLOT;
    plate.textContent = name(shownPlot);
    lvl.textContent = `Telescope Lv ${level}/${TELESCOPE_MAX}`;
    tfill.style.width = `${(level / TELESCOPE_MAX) * 100}%`;
    drawView(view, t);
    specs.replaceChildren(
      h('div', 'tele-name', `Lv ${level} · ${UPGRADES[level - 1].name}`),
      h('div', '', `Aperture ${t.aperture} m`),
      h('div', '', `Lenses ${t.lenses} · sharp ${t.sharpness}%`),
      h('div', '', `Sees ${fmt(telescopeRange(t))} ly`),
    );
    down.disabled = level <= 1;
    up.disabled = level >= TELESCOPE_MAX;
    up.classList.toggle('can', level < TELESCOPE_MAX);
    rows.forEach(({ row, buy }, k) => {
      const lv = k + 1;
      row.classList.toggle('done', lv <= level);
      buy.classList.toggle('can', lv === level + 1);
      buy.disabled = lv > level + 1;
      buy.replaceChildren();
      if (lv <= level) buy.append(lv === 1 ? 'Start' : 'Built');
      else { buy.append(h('i', 'nut'), fmt(upgradeCost(lv))); }
    });
  };
  down.addEventListener('click', () => setLevel(level - 1));
  up.addEventListener('click', () => setLevel(level + 1));
  setLevel(1);

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
