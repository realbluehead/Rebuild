// The base's buildings as the screen shows them: a tab each with its card (numbers, a bar, the telescope's view), the
// crew's upgrade button and its upgrades as rows; the building is rebuilt on its plot in the desert at each new level.
import type { Group } from 'three';
import { h } from '../../shared/ui/dom';
import { fmt } from '../../shared/format';
import { ANTENNA } from '../core/antenna';
import { upgradeSeconds, type BuildingId } from '../core/curves';
import { canUpgrade, rates, upgrade, upgradeCost } from '../core/economy';
import { specAt, type Facility } from '../core/facility';
import { POWER } from '../core/power';
import { PROBES } from '../core/probes';
import { REFINERY } from '../core/refinery';
import { TANKS } from '../core/tanks';
import { TELESCOPE, TELESCOPE_MAX, type Telescope } from '../core/telescope';
import { moduleById } from '../core/ship';
import type { P2State } from '../core/state';
import { buildAntenna } from './antenna3d';
import { ANTENNA_PLOT, POWER_PLOT, PROBES_PLOT, REFINERY_PLOT, TANKS_PLOT, TELESCOPE_PLOT, type Desert } from './desert';
import { bar, enable, fill, flag, set, time, type Ctx, type Tab } from './panel';
import { buildPower } from './power3d';
import { buildProbes } from './probes3d';
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
export interface Building<S extends { level: number }> {
  id: BuildingId;
  tab: string;
  /** Its name on the plot's plate. */
  plate: string;
  plot: number;
  facility: Facility<S>;
  build(s: S): Group;
  /** A small picture for the tab's card (the telescope's view), drawn at each level. */
  view?(c: HTMLCanvasElement, s: S): void;
}
const building = <S extends { level: number }>(b: Building<S>) => b as unknown as Building<{ level: number }>;

export const BUILDINGS = [
  building<Telescope>({ id: 'telescope', tab: 'Telescope', plate: 'TELESCOPE', plot: TELESCOPE_PLOT, facility: TELESCOPE, build: buildTelescope, view: drawView }),
  building({ id: 'power', tab: 'Power', plate: 'MIRROR TOWER', plot: POWER_PLOT, facility: POWER, build: buildPower }),
  building({ id: 'refinery', tab: 'Fuel', plate: 'BLUETRERI REFINERY', plot: REFINERY_PLOT, facility: REFINERY, build: buildRefinery }),
  building({ id: 'tanks', tab: 'Tanks', plate: 'TANK FARM', plot: TANKS_PLOT, facility: TANKS, build: buildTanks }),
  building({ id: 'antenna', tab: 'Antenna', plate: 'ANTENNA', plot: ANTENNA_PLOT, facility: ANTENNA, build: buildAntenna }),
  building({ id: 'probes', tab: 'Probes', plate: 'PROBE HANGAR', plot: PROBES_PLOT, facility: PROBES, build: buildProbes }),
];

/** What the crew is doing, in words ("Antenna Lv 4 · 3 min 10 s"), or null. */
export function crewText(s: P2State): string | null {
  const j = s.crew;
  if (!j) return null;
  const what = j.kind === 'building' ? `${BUILDINGS.find((b) => b.id === j.id)!.tab} Lv ${s.levels[j.id] + 1}` : moduleById(j.id)?.name ?? '?';
  return `${what} · ${time(j.left / rates(s).build)}`;
}

/** The tab of building `b`. */
export function buildingTab(ctx: Ctx, b: Building<{ level: number }>, desert: Desert): Tab {
  const list = h('div', 'list tele');
  const card = h('div', 'px-box tele-card');
  const view = document.createElement('canvas');
  view.className = 'tele-view';
  const specs = h('div', 'tele-specs');
  const gauge = bar();
  if (b.view) card.append(view);
  card.append(specs);
  const act = h('div', 'p2-act');
  const go = h('button', 'px-btn buy p2-go');
  const note = h('div', 'p2-note');
  act.append(go, note);
  go.addEventListener('click', () => { if (upgrade(ctx.s, b.id)) ctx.changed(); });
  const table = h('div', 'part-table px-box p2-table tele-table');
  const head = h('div', 'part-row head');
  for (const x of ['Lv', 'Upgrade', 'Does', '']) head.append(h('span', '', x));
  table.append(head);
  const rows = b.facility.upgrades.map((u, k) => {
    const row = h('div', 'part-row');
    const state = h('span', 'p2-state');
    row.append(h('span', 'lvl', String(k + 1)), h('span', 'name', u.name), h('span', 'eff', `${u.part} · ${u.note}`), state);
    table.append(row);
    return { row, state };
  });
  list.append(card, act, table);

  let shown = 0;
  /** The card, the rows and the 3D building at the level reached. */
  const rebuild = (level: number) => {
    shown = level;
    const spec = specAt(b.facility, level);
    desert.setBuilding(b.plot, b.build(spec));
    if (b.view) b.view(view, spec);
    specs.replaceChildren(h('div', 'tele-name', `Lv ${level} · ${b.facility.upgrades[level - 1].name}`), ...b.facility.stats(spec).map((x) => h('div', '', x)), gauge.el);
    fill(gauge.fill, b.facility.gauge(spec));
  };
  return {
    label: b.tab,
    list,
    plot: b.plot,
    update(s) {
      const level = s.levels[b.id];
      if (level !== shown) rebuild(level);
      const cost = upgradeCost(s, b.id);
      const building = s.crew?.kind === 'building' && s.crew.id === b.id;
      enable(go, canUpgrade(s, b.id));
      const label = cost === null ? 'Top level' : `Build Lv ${level + 1}`;
      if (go.dataset.k !== `${label}|${cost}`) {
        go.dataset.k = `${label}|${cost}`;
        go.replaceChildren(label);
        if (cost !== null) go.append(h('i', 'nut'), fmt(cost), ` · ${time(upgradeSeconds(b.id, level + 1) / rates(s).build)}`);
      }
      const busy = crewText(s);
      set(note, cost === null ? 'Every upgrade is built.' : building ? `Building… ${busy}` : busy ? `Crew busy: ${busy}` : s.metal.lt(cost) ? 'Not enough metal yet.' : 'The crew is free.');
      rows.forEach(({ row, state }, k) => {
        const n = k + 1;
        flag(row, 'done', n <= level);
        flag(row, 'next', n === level + 1);
        set(state, n <= level ? (n === 1 ? 'Start' : 'Built') : n === level + 1 ? (building ? 'Building' : 'Next') : '');
      });
    },
  };
}
