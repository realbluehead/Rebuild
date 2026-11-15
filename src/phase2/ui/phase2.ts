// Phase II screen (still mostly a mock-up): the same layout as phase I — a top bar with the currency and the ≡ menu,
// the scene in the middle and a panel of tabs at the bottom — re-themed in the voyage splash's palette (obsidian
// plates, steel rivets, red lights) with yellow for what you can press. The currency and the Cargo tab's "Have" column
// come from the state (what phase I handed over); the other tabs and rows are placeholders, to see how the screen looks.
import './phase2.css';
import { fmt } from '../../shared/format';
import { h } from '../../shared/ui/dom';
import type { P2State } from '../core/state';
import { shipScene } from './voyage';

interface Row { name: string; lvl: string; eff: string; cost: string; can: boolean }

/** Placeholder content per tab: a sub-tab picker (optional) and a table. */
const TABS: { name: string; picks?: string[]; heads: string[]; rows: Row[] }[] = [
  {
    name: 'Shipyard',
    picks: ['Black siphon', 'Ship 2', 'Ship 3'],
    heads: ['Part', 'Lv', 'Effect', 'Cost'],
    rows: [
      { name: 'Hull', lvl: '3', eff: 'armour ×1.6', cost: '1.2k', can: true },
      { name: 'Engines', lvl: '2', eff: 'speed ×1.4', cost: '860', can: true },
      { name: 'Cargo bay', lvl: '1', eff: 'hold 40 t', cost: '2.4k', can: false },
      { name: 'Tentacles', lvl: '0', eff: 'grab ×1', cost: '5k', can: false },
      { name: 'Shield', lvl: '0', eff: 'storms −0%', cost: '12k', can: false },
    ],
  },
  {
    name: 'Fleet',
    heads: ['Ship', 'Lv', 'State', ''],
    rows: [
      { name: 'Black siphon', lvl: '6', eff: 'in dock', cost: 'Crew', can: true },
      { name: 'Ship 2', lvl: '—', eff: 'blueprint 40%', cost: '30k', can: false },
      { name: 'Ship 3', lvl: '—', eff: '???', cost: '—', can: false },
    ],
  },
  {
    name: 'Cargo',
    heads: ['Load', 'Have', 'Aboard', ''],
    rows: [], // (from the state: `cargoRows`)
  },
  {
    name: 'Launch',
    picks: ['Routes', 'Beacons'],
    heads: ['Destination', 'Ly', 'Odds', ''],
    rows: [
      { name: 'Kepler drift', lvl: '4', eff: '62% safe', cost: '3k', can: true },
      { name: 'Ash belt', lvl: '9', eff: '35% safe', cost: '18k', can: false },
      { name: 'New home', lvl: '27', eff: '???', cost: '—', can: false },
    ],
  },
];

/** The Cargo tab: what phase I handed over, ready to load. */
const cargoRows = (s: P2State): Row[] => [
  { name: 'Bluetreri', lvl: fmt(s.bluetreri), eff: '0 / 40 t', cost: 'Load', can: true },
  { name: 'Pages', lvl: fmt(s.items.page), eff: '0 / 200', cost: 'Load', can: true },
  { name: 'Notes', lvl: fmt(s.items.note), eff: '0 / 120', cost: 'Load', can: true },
  { name: 'Photos', lvl: fmt(s.items.photo), eff: '0 / 120', cost: 'Load', can: true },
];

export interface Phase2Screen {
  /** Updates the texts from the state (every frame; only what changed is written). */
  render(s: P2State): void;
}

/** Puts the phase II screen over `root` (the phone), fading in. `openMenu` opens the ≡ menu. */
export function showPhase2(root: HTMLElement, s: P2State, openMenu: () => void): Phase2Screen {
  const el = h('div', 'p2');

  // Top bar: metal scraps (the currency of phase II), rate, the fleet line and a progress bar; menu on the right.
  const top = h('header', 'topbar');
  const stats = h('div', 'stats');
  const line = h('div', 'gold-line');
  const metal = h('span', 'gold', fmt(s.metal));
  line.append(h('i', 'nut'), metal, h('span', 'rate', '+0/min'));
  const fleet = h('div', 'cargo-line');
  const bar = h('div', 'bar cargo-bar');
  const fill = h('i');
  fill.style.width = '35%';
  bar.append(fill);
  fleet.append(bar, h('span', 'cargo-text', 'Fleet 1/6 · cargo 0%'));
  const lvl = h('div', 'explored', 'Shipyard Lv 1/12 · 35%');
  const track = h('div', 'bar slim');
  const tfill = h('i');
  tfill.style.width = '35%';
  track.append(tfill);
  stats.append(line, fleet, lvl, track);
  const menu = h('button', 'px-btn menu-btn');
  menu.title = 'Menu';
  menu.append(h('i'), h('i'), h('i'));
  menu.addEventListener('click', openMenu);
  top.append(stats, menu);

  // Middle: the Black siphon in its dock, over the stars.
  const scene = h('section', 'p2-scene');
  scene.append(shipScene('The Black siphon in dock', false).svg, h('div', 'p2-dock px-box', 'DRY DOCK 1 · Black siphon'));

  // Bottom panel: four tabs, each a placeholder table.
  const panel = h('aside', 'panel');
  const tabs = h('div', 'tabs');
  const lists = TABS.map((t, k) => {
    const list = h('div', 'list');
    list.hidden = k !== 0;
    if (t.picks) {
      const pick = h('div', 'rover-pick');
      t.picks.forEach((p, q) => {
        const b = h('button', `px-btn pick${q === 0 ? ' on' : ''}${q === 2 ? ' locked' : ''}`, p);
        b.addEventListener('click', () => pick.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b)));
        pick.append(b);
      });
      list.append(pick);
    }
    const table = h('div', 'part-table px-box p2-table');
    const head = h('div', 'part-row head');
    for (const x of t.heads) head.append(h('span', '', x));
    table.append(head);
    for (const r of t.name === 'Cargo' ? cargoRows(s) : t.rows) {
      const row = h('div', 'part-row');
      row.append(h('span', 'name', r.name), h('span', 'lvl', r.lvl), h('span', 'eff', r.eff));
      const buy = h('button', `px-btn buy${r.can ? ' can' : ''}`);
      if (/^[\d.]+k?$/.test(r.cost)) buy.append(h('i', 'nut'));
      buy.append(r.cost);
      buy.disabled = !r.can;
      row.append(buy);
      table.append(row);
    }
    list.append(table);
    return list;
  });
  const tabBtns = TABS.map((t, k) => {
    const b = h('button', `px-btn tab${k === 0 ? ' on' : ''}${k === 1 ? ' alert' : ''}`, t.name);
    b.addEventListener('click', () => {
      tabBtns.forEach((x, q) => x.classList.toggle('on', q === k));
      lists.forEach((l, q) => (l.hidden = q !== k));
      b.classList.remove('alert');
    });
    tabs.append(b);
    return b;
  });
  panel.append(tabs, ...lists);

  el.append(top, scene, panel);
  root.append(el);
  void el.offsetWidth; // (styles applied at opacity 0 first, so the change below fades)
  el.classList.add('in'); // fades in (over the voyage splash)
  // One panel height for every tab (the tallest), so the scene never jumps (as in phase I).
  let tallest = 0;
  lists.forEach((_, k) => {
    lists.forEach((x, q) => (x.hidden = q !== k));
    tallest = Math.max(tallest, panel.offsetHeight);
  });
  lists.forEach((x, q) => (x.hidden = q !== 0));
  panel.style.height = `${tallest}px`;

  return {
    render(st) {
      const m = fmt(st.metal);
      if (metal.textContent !== m) metal.textContent = m;
    },
  };
}
