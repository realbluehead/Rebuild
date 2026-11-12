// Interface: the map (canvas) and a DOM HUD. Built once; render() only updates texts.
import { UPGRADES, type StatId } from '../content/upgrades';
import { ITEMS, WORKS, workCost, workTitle, type WorkId } from '../content/collection';
import { TERRAINS, ZOOMS } from '../content/world';
import { STORMS } from '../content/weather';
import { ROUTES, type RouteId } from '../content/routes';
import { activeRoute, canUnlockRoute, canBuy, canCraft, capacity, carried, costOf, nextWorkCost, explored as exploredCells, goldPerSec, isComplete, progress, revealed, stats, type Stats } from '../core/game';
import { stormAt, stormFactor, stormName } from '../core/weather';
import { fmt, fmtTime } from '../core/format';
import type { GameState } from '../core/state';
import { totalCells, type World } from '../core/world';
import type { OfflineReport } from '../save/offline';
import { MapView, type TripView } from './map';
import { COIN, FLAT, ITEM_SPRITES, robotFrames, spriteCanvas } from './sprites';

export interface ViewActions {
  unlockRoute(id: RouteId): void;
  chooseRoute(id: RouteId): void;
  buy(id: StatId): void;
  craft(id: WorkId): void;
  zoom(delta: number): void;
  exportText(): string;
  importText(text: string): void;
  reset(): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

/** Sets text only if it changed (saves the browser work on every frame). */
const set = (el: HTMLElement, text: string) => { if (el.textContent !== text) el.textContent = text; };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Short effect text (now -> next level), so it fits the narrow mobile cards. */
export function effectText(id: StatId, a: Stats, b: Stats): string {
  switch (id) {
    case 'speed': return `${fmt(a.speed)}→${fmt(b.speed)}/s`;
    case 'tyres': return `rough −${Math.round(100 * (1 - a.grip))}→${pct(1 - b.grip)}`;
    case 'body': return `storms −${Math.round(100 * (1 - a.armour))}→${pct(1 - b.armour)}`;
    case 'cargo': return `hold ${fmt(a.cargo)}→${fmt(b.cargo)}`;
    case 'radar': return `range ${a.radar}→${b.radar}`;
    case 'explorers': return `rovers ${a.explorers}→${b.explorers}`;
  }
}

/** What a work's bonus changed (before -> after), in words. */
function workEffect(effect: string, a: Stats, b: Stats): string {
  switch (effect) {
    case 'speed': return `Rover speed ${fmt(a.speed)}→${fmt(b.speed)} steps/s`;
    case 'hold': return `Hold ${fmt(a.cargo)}→${fmt(b.cargo)} bluetreri`;
    default: return `Bluetreri ×${fmt(a.loot)}→×${fmt(b.loot)}`;
  }
}

export function createView(root: HTMLElement, world: World, initial: GameState, actions: ViewActions) {
  document.documentElement.style.setProperty('--coin', `url(${spriteCanvas(COIN).toDataURL()})`);
  document.documentElement.style.setProperty('--robot', `url(${robotFrames()[0].toDataURL()})`);
  root.replaceChildren();

  // Top bar: bluetreri and rate on the left, menu on the right.
  const topbar = h('header', 'topbar');
  const gold = h('span', 'gold');
  const rate = h('span', 'rate');
  const explored = h('div', 'explored');
  const stats0 = h('div', 'stats');
  const goldLine = h('div', 'gold-line');
  goldLine.append(h('i', 'coin'), gold, rate);
  // Rovers' load: the bluetreri is not yours until they bring it to camp.
  const cargoLine = h('div', 'cargo-line');
  const cargoBar = h('div', 'bar cargo-bar');
  const cargoFill = h('i');
  cargoBar.append(cargoFill);
  const cargoText = h('span', 'cargo-text');
  cargoLine.append(cargoBar, cargoText);
  stats0.append(goldLine, cargoLine, explored);
  const menuBtn = h('button', 'px-btn menu-btn');
  menuBtn.title = 'Menu';
  menuBtn.append(h('i'), h('i'), h('i'));
  menuBtn.addEventListener('click', () => openMenu());
  const helpBtn = h('button', 'px-btn menu-btn help-btn', '?');
  helpBtn.title = 'Field notes';
  helpBtn.addEventListener('click', () => openHelp());
  topbar.append(stats0, helpBtn, menuBtn);

  const mapWrap = h('section', 'map-wrap');
  const canvas = h('canvas', 'map');

  const zoomCtl = h('div', 'zoom-ctl');
  const zin = h('button', 'px-btn', '+');
  const zout = h('button', 'px-btn', '−');
  const pips = h('div', 'pips');
  const pipEls = ZOOMS.map(() => pips.appendChild(h('i')));
  const home = h('button', 'px-btn home');
  home.title = 'Go to rover (space)';
  home.append(h('i', 'robot-icon'));
  zoomCtl.append(zin, pips, zout, home);
  zin.addEventListener('click', () => actions.zoom(-1));
  zout.addEventListener('click', () => actions.zoom(1));
  home.addEventListener('click', () => map.goToRobot());

  // Bottom left: what the tapped cell holds or, with nothing tapped, what the rovers are hauling.
  const cellBox = h('div', 'cell-info px-box');
  const cellTitle = h('div', 'cell-title');
  const cellLine = h('div', 'cell-line');
  const cellSky = h('div', 'cell-line sky');
  cellBox.append(cellTitle, cellLine, cellSky);
  /** Cell (map index) the player tapped, or -1. */
  let selected = -1;
  cellBox.addEventListener('click', () => { selected = -1; });

  const toast = h('div', 'toast px-box');

  // Game speed multiplier, for testing (remembered in this browser).
  const SPEEDS = [1, 2, 5, 10, 50, 100];
  let speed = 1;
  try { speed = SPEEDS.includes(Number(localStorage.getItem('rebuild:speed'))) ? Number(localStorage.getItem('rebuild:speed')) : 1; } catch { /* no storage */ }
  const speedBtn = h('button', 'px-btn speed-ctl');
  speedBtn.title = 'Game speed (for testing)';
  const showSpeed = () => { speedBtn.textContent = `Speed ×${speed}`; speedBtn.classList.toggle('can', speed > 1); };
  showSpeed();
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    try { localStorage.setItem('rebuild:speed', String(speed)); } catch { /* no storage */ }
    showSpeed();
  });
  mapWrap.append(canvas, zoomCtl, cellBox, speedBtn, toast);

  // View controls: drag (mouse or finger) to move, wheel or pinch to zoom.
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (Math.abs(e.deltaY) > 4) actions.zoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  let tap: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    tap = pointers.size === 0 ? { x: e.clientX, y: e.clientY } : null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch0 = dist();
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      map.panPixels(e.clientX - prev.x, e.clientY - prev.y);
    } else if (pointers.size === 2 && pinch0 > 0) {
      const ratio = dist() / pinch0;
      if (ratio > 1.5 || ratio < 1 / 1.5) { actions.zoom(ratio > 1 ? -1 : 1); pinch0 = dist(); }
    }
  });
  const up = (e: PointerEvent) => {
    // A tap without dragging: what is on this cell.
    if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) cellInfo(e.clientX, e.clientY);
    tap = null;
    pointers.delete(e.pointerId);
    pinch0 = 0;
    if (!pointers.size) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // Keyboard: arrows or WASD to move, +/- to zoom, space to go to the rover.
  const keys = new Set<string>();
  const typing = (e: KeyboardEvent) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
      // A short press also nudges the view; held down, the render loop keeps moving it.
      if (!keys.has(k)) { keys.add(k); map.nudge(...keyDir(), 0.15); }
    }
    else if (k === '+' || k === '=') actions.zoom(-1);
    else if (k === '-' || k === '_') actions.zoom(1);
    else if (k === ' ' || k === 'c') { map.goToRobot(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const keyDir = (): [number, number] => {
    const x = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    const y = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return [x / len, y / len];
  };

  function cellInfo(cx: number, cy: number) {
    if (map.hitsPointer(cx, cy)) { map.goToRobot(); return; }
    const i = map.cellAt(cx, cy);
    selected = i === selected ? -1 : i;
  }

  /** Fills the bottom-left box: the tapped cell's resources, or the rovers' haul. */
  function showCell(s: GameState, st: Stats) {
    if (selected < 0) {
      const found = s.bots.reduce((a, b) => a + b.found, 0);
      set(cellTitle, 'Rovers\' haul');
      set(cellLine, `${fmt(carried(s))} bluetreri · ${found} ${found === 1 ? 'item' : 'items'}`);
      const n = s.weather.storms.length;
      set(cellSky, n ? `Sky: ${n} ${n === 1 ? 'storm' : 'storms'}` : 'Sky: clear');
      return;
    }
    const i = selected;
    const r = world.rank[i];
    const mined = revealed(s, world, r);
    const value = (world.goldPrefix[r + 1] - world.goldPrefix[r]) * st.loot;
    const it = world.item[i] ? ITEMS[world.item[i] - 1] : null;
    const gone = it && (mined || s.fetched.includes(world.itemRanks.indexOf(r)));
    set(cellTitle, `${TERRAINS[world.terrain[i]].name}${world.special[i] ? ' · deposit' : ''}`);
    if (mined) set(cellLine, `Mined out (gave ${fmt(value)})${gone ? ` · ${it!.name} taken` : ''}`);
    else set(cellLine, `${fmt(value)} bluetreri${gone ? ` · ${it!.name} taken` : ' · ???'}`);
    const storm = stormAt(s.weather.storms, world.size, i);
    set(cellSky, storm ? `${stormName(storm)}: −${pct((1 - stormFactor(storm)) * st.armour)} speed` : 'Sky: clear');
  }

  const panel = h('aside', 'panel');
  // Tabs: upgrades (bought with bluetreri) and works (made from pages, notes and photos).
  const tabs = h('div', 'tabs');
  const tabUpg = h('button', 'px-btn tab on', 'Rover');
  const tabRoutes = h('button', 'px-btn tab', 'Routes');
  const tabWorks = h('button', 'px-btn tab', 'Works');
  tabs.append(tabUpg, tabRoutes, tabWorks);
  const showTab = (k: number) => {
    [tabUpg, tabRoutes, tabWorks].forEach((t, q) => t.classList.toggle('on', q === k));
    [list, routesList, worksList].forEach((l, q) => { l.hidden = q !== k; });
  };
  tabUpg.addEventListener('click', () => showTab(0));
  tabRoutes.addEventListener('click', () => showTab(1));
  tabWorks.addEventListener('click', () => showTab(2));
  const list = h('div', 'list rover');
  // Rover parts in a 3x2 grid: everything within thumb reach, no scrolling.
  const rows = UPGRADES.map((u) => {
    const card = h('div', 'upg px-box');
    const head = h('div', 'head');
    const name = h('span', 'name', u.name);
    const lvl = h('span', 'lvl');
    head.append(name, lvl);
    const eff = h('div', 'eff');
    const btn = h('button', 'px-btn buy');
    const cost = h('span');
    btn.append(h('i', 'coin'), cost);
    btn.addEventListener('click', () => actions.buy(u.id));
    card.title = u.desc;
    card.append(head, eff, btn);
    list.append(card);
    return { def: u, lvl, eff, btn, cost };
  });
  // Exploration routes: unlock with bluetreri + items, then pick the one the rovers follow from the next ring.
  const routesList = h('div', 'list rover');
  routesList.hidden = true;
  const routeCards = ROUTES.map((rd) => {
    const card = h('div', 'upg px-box');
    const head = h('div', 'head');
    const state = h('span', 'lvl');
    head.append(h('span', 'name', rd.name), state);
    const eff = h('div', 'eff');
    const btn = h('button', 'px-btn buy');
    const label = h('span');
    const coin = h('i', 'coin');
    btn.append(coin, label);
    btn.addEventListener('click', () => {
      const s = current;
      if (!s) return;
      if (s.routes.includes(rd.id)) actions.chooseRoute(rd.id);
      else actions.unlockRoute(rd.id);
    });
    card.title = rd.desc;
    card.append(head, eff, btn);
    routesList.append(card);
    return { rd, state, eff, btn, label, coin };
  });
  const worksList = h('div', 'list');
  worksList.hidden = true;
  const itemIcon = (k: number) => { const c = spriteCanvas(ITEM_SPRITES[k]); c.className = 'item-icon'; return c; };
  const works = WORKS.map((wd) => {
    const card = h('div', 'upg px-box');
    const head = h('div', 'head');
    const lvl = h('span', 'lvl');
    head.append(h('span', 'name', wd.name), lvl);
    const next = h('div', 'eff');
    const btn = h('button', 'px-btn buy');
    const cost = h('span');
    btn.append(itemIcon(ITEMS.findIndex((it) => it.id === wd.item)), cost);
    btn.addEventListener('click', () => actions.craft(wd.id));
    card.title = `Each one: ${wd.effect} ×${wd.bonus}`;
    card.append(head, next, btn);
    worksList.append(card);
    return { wd, lvl, next, btn, cost };
  });
  const shelfCard = h('div', 'upg px-box shelf');
  const shelfInfo = h('div', 'eff');
  const shelfBtn = h('button', 'px-btn buy', 'Shelf');
  shelfBtn.addEventListener('click', () => openShelf());
  shelfCard.append(h('div', 'head'), shelfInfo, shelfBtn);
  shelfCard.firstElementChild!.append(h('span', 'name', 'Collection'));
  worksList.append(shelfCard);
  panel.append(tabs, list, routesList, worksList);

  /** Shelf: every work made and the bonus it gives. */
  function openShelf() {
    const s = current;
    if (!s) return;
    const m = modal('help');
    m.box.append(h('div', 'name', 'Shelf'));
    const body = h('div', 'help-body');
    for (const wd of WORKS) {
      const n = s.works[wd.id];
      body.append(h('h3', '', `${wd.name}: ${wd.effect} ×${fmt(wd.bonus ** n)}`));
      if (!n) body.append(h('p', 'info', 'None yet.'));
      for (let k = 0; k < n; k++) body.append(h('p', '', `${k + 1}. ${workTitle(wd, k)}`));
      body.append(h('p', 'info', `Next: ${workTitle(wd, n)} (${workCost(wd, n)} ${ITEMS.find((it) => it.id === wd.item)!.plural})`));
    }
    m.box.append(body);
    m.addClose('Close');
  }

  // What the player has discovered (to fill in the field notes). New cells are scanned a few per frame.
  const seenTerrain = new Set<number>();
  let seenSpecial = false;
  let scanned = 0;
  function scanDiscoveries(s: GameState) {
    const upto = Math.min(totalCells(world), Math.floor(exploredCells(s, world)));
    for (; scanned < upto; scanned++) {
      const i = world.order[scanned];
      seenTerrain.add(world.terrain[i]);
      if (world.special[i]) seenSpecial = true;
    }
  }

  /** Field-note entries: each appears once the player has found what it explains. */
  function helpEntries(s: GameState) {
    const u = s.upgrades;
    const itemsFound = s.items.page + s.items.note + s.items.photo + s.works.book + s.works.cd + s.works.album > 0;
    const crafted = s.works.book + s.works.cd + s.works.album > 0;
    const deposited = s.totalGold.gt(0);
    const entries: { on: boolean; title: string; lines: string[]; legend?: boolean }[] = [
      { on: true, title: 'The goal', lines: [
        'The map starts dark. Rovers leave the base camp and uncover it on their own, one cell at a time, even while you are away.',
        'A rover can only explore the cell next to it. While it works, the cell slowly gains colour; when it is done, the cell is revealed.'] },
      { on: true, title: 'The map', lines: [
        'Drag the map with a finger or the mouse, or move with the arrow keys or WASD.',
        'The rover button (or space) takes the view to a rover. If a rover leaves the screen, an arrow at the edge points to it: tap it to go there.',
        'Tap a cell to see what it holds in the box at the bottom left (tap the box to clear it). With nothing tapped, the box shows what the rovers are hauling.',
        'Mined-out cells look drained: their bluetreri is gone, and so are their crystals.'] },
      { on: deposited, title: 'Bluetreri and the hold', lines: [
        'Bluetreri is a blue mineral that has grown among the ruins. It is what you spend on upgrades.',
        'Rovers carry the bluetreri they find, but each hold is limited. When a hold is full, that rover returns to camp to unload and then goes back to where it left off. Each rover goes on its own schedule. Nothing can be spent until it reaches camp.',
        'At the top: the blue number is what you have at camp, and next to it what arrives per second on average. The bar below is the rovers\' total load; when every hold is full it shows hazard stripes.'] },
      { on: seenTerrain.size > 0 && deposited, title: 'Terrain', legend: true, lines: [
        'Each cell yields bluetreri by terrain (and the farther from camp, the more). Rough terrain is slower to explore: streets are fast, jungle and rubble are slow. Found so far:'] },
      { on: seenSpecial, title: 'Deposits', lines: ['Cells with blue crystals are bluetreri deposits: they yield far more than the rest.'] },
      { on: u.speed > 0, title: 'Engine', lines: ['Rovers explore and travel faster. Every upgrade costs more at each level; the button lights up when you can afford it.'] },
      { on: u.cargo > 0, title: 'Hold', lines: ['Each rover can carry more bluetreri, so it returns to camp less often. A loaded rover drives home slowly: the fuller, the slower.'] },
      { on: u.tyres > 0, title: 'Tyres', lines: ['Better grip on rough ground: rubble, jungle, ruins and towers slow the rovers down less.'] },
      { on: s.weather.storms.length > 0 || u.body > 0, title: 'Weather', lines: [
        'Storms drift over the city with the wind and slow down any rover working under them. They form and die out one at a time; now and then a severe one hits much harder.',
        ...STORMS.map((d) => `${d.name}: ${d.desc}`),
        'The Body upgrade armours the rovers, so storms slow them down less.'] },
      { on: s.zoomUnlocked > 1, title: 'Zoom', lines: [
        'The + and − buttons, the mouse wheel or a pinch. There are 4 zoom levels; the next opens when you have explored 80% of what it shows (the bar at the bottom left).'] },
      { on: itemsFound, title: 'Pages, notes and photos', lines: [
        'Some cells hide a page, a musical note or a photo. Rovers pick them up when they reach them.',
        'On the Works tab you turn them into books (pages), records (notes) and albums (photos). Each work costs more than the last.'] },
      { on: crafted, title: 'Works', lines: [
        'Every work gives a permanent bonus: books, speed; records, more bluetreri; albums, bigger holds. The Shelf lists everything you have made.'] },
      { on: u.radar > 0, title: 'Radar', lines: [
        'A submarine-style radar sweeps around each rover, reaching as many cells as its range. It detects pages, notes and photos in the dark around that rover: they light up as the needle passes.',
        'The rover that spots an item leaves its exploring, fetches it (the one it is after is framed) and returns to where it was. You lose a little exploring, but the items arrive sooner.'] },
      { on: s.routes.length > 1, title: 'Routes', lines: [
        'The Routes tab sets how the rovers push into the dark: rings around camp, a push north, east, south or west, or random wandering fingers.',
        'New routes cost bluetreri plus pages, notes or photos. The one you pick takes over when the next ring starts; what is already explored stays as it is.'] },
      { on: u.explorers > 0, title: 'Rovers', lines: ['One more rover leaves camp. It joins when the others start a new ring around camp; each ring is split between all of them, and each works at its own pace.'] },
      { on: true, title: 'Other', lines: [
        'If you close the game, the rovers keep going (up to 24 hours) and you see what they found when you return.',
        'Menu ≡: export and import your game (to move it to another device) or restart with a new map. Speed ×N speeds up time for testing.'] },
    ];
    return entries;
  }
  const HELP_SEEN_KEY = 'rebuild:help-seen';
  let helpSeen = 0;
  try { helpSeen = Number(localStorage.getItem(HELP_SEEN_KEY)) || 0; } catch { /* no storage */ }

  /** Field notes: only what you have already discovered; the rest stays to be discovered. */
  function openHelp() {
    const s = current;
    const m = modal('help');
    m.box.append(h('div', 'name', 'Field notes'));
    const body = h('div', 'help-body');
    const entries = s ? helpEntries(s) : [];
    const css = (c: number) => `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
    let unlocked = 0;
    for (const e of entries) {
      if (!e.on) continue;
      unlocked++;
      body.append(h('h3', '', e.title));
      for (const l of e.lines) body.append(h('p', '', l));
      if (e.legend) {
        const legend = h('div', 'legend');
        TERRAINS.map((t, i) => ({ t, i })).filter(({ i }) => seenTerrain.has(i)).sort((a, b) => b.t.value - a.t.value).forEach(({ t, i }) => {
          const row = h('div', 'legend-row');
          const sw = h('i', 'swatch');
          sw.style.background = css(FLAT[i][0]);
          row.append(sw, h('span', '', t.name), h('span', 'legend-val', `${t.value}`));
          legend.append(row);
        });
        body.append(legend);
      }
    }
    const locked = entries.length - unlocked + (TERRAINS.length - seenTerrain.size > 0 ? 1 : 0);
    if (locked > 0) body.append(h('p', 'locked', `??? ${locked} more ${locked === 1 ? 'thing' : 'things'} to discover. Keep exploring.`));
    helpSeen = unlocked + seenTerrain.size;
    try { localStorage.setItem(HELP_SEEN_KEY, String(helpSeen)); } catch { /* no storage */ }
    helpBtn.classList.remove('alert');
    m.box.append(body);
    m.addClose('Got it');
  }

  function openMenu() {
    const m = modal();
    m.box.append(h('div', 'name', 'Menu'));
    const item = (label: string, cls: string, fn: () => void) => {
      const b = h('button', `px-btn ${cls}`, label);
      b.addEventListener('click', () => { m.close(); fn(); });
      m.box.append(b);
    };
    item('Field notes', '', () => openHelp());
    item('Export game', '', () => textModal('Copy this text to save your game:', actions.exportText(), true));
    item('Import game', '', () => textModal('Paste an exported game:', '', false, actions.importText));
    item('Restart (new map)', 'danger', () => confirmModal('Erase this game and start a new map?', 'Erase and restart', () => {
      try { localStorage.removeItem(HELP_SEEN_KEY); } catch { /* no storage */ }
      actions.reset();
    }));
    m.box.append(h('div', 'info', `Version ${__APP_VERSION__}`));
    m.addClose('Close');
  }

  root.append(topbar, mapWrap, panel);

  const map = new MapView(canvas, world, initial.zoom);
  new ResizeObserver(() => map.resize()).observe(canvas);

  const n = totalCells(world);
  let toastTimer = 0;
  let lastFrame = performance.now();
  /** Last state drawn (for map taps and the shelf). */
  let current: GameState | null = null;
  let lastHelpCheck = 0;

  function showToast(text: string, ms = 2600) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), ms);
  }

  return {
    render(s: GameState, now: number) {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const st = stats(s);
      map.nudge(...keyDir(), dt);
      current = s;
      scanDiscoveries(s);
      if (now - lastHelpCheck > 1000) {
        lastHelpCheck = now;
        const count = helpEntries(s).filter((e) => e.on).length + seenTerrain.size;
        helpBtn.classList.toggle('alert', count > helpSeen);
      }
      const prog = progress(s, world);
      const trips: TripView[] = s.bots.map((b) => ({
        kind: b.trip,
        f: b.travelLen > 0 ? b.travel / b.travelLen : 1,
        target: b.target >= 0 ? world.itemRanks[b.target] : undefined,
        from: b.from >= 0 ? b.from : undefined,
      }));
      if (selected >= 0 && selected >= totalCells(world)) selected = -1;
      map.render(prog, s.zoom, now, dt, trips, { range: st.radar, fetched: s.fetched }, s.scouted, s.weather.storms, selected);
      showCell(s, st);
      const cells = prog.a + prog.reach.reduce((x, y) => x + y, 0);

      set(gold, fmt(s.gold));
      set(rate, `+${fmt(goldPerSec(s, world))}/s`);
      const cap = capacity(s);
      const load = carried(s);
      cargoFill.style.width = `${Math.min(100, (100 * load) / cap)}%`;
      cargoBar.classList.toggle('full', load >= cap - 1e-6);
      const home = s.bots.filter((b) => b.trip === 'home').length;
      const out = s.bots.filter((b) => b.trip === 'out').length;
      const fetching = s.bots.filter((b) => b.trip === 'detour').length;
      const doing = home ? `· ${home} returning` : out ? `· ${out} heading out` : fetching ? `· ${fetching} fetching` : load >= cap - 1e-6 ? '· full!' : '';
      set(cargoText, `${fmt(load)}/${fmt(cap)} ${doing}`);
      const pct = (100 * cells) / n;
      set(explored, `${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}% explored · ${fmt(st.stepsPerSec)} steps/s · ${s.bots.length}R`);

      pipEls.forEach((p, i) => { p.className = i === s.zoom ? 'on' : i < s.zoomUnlocked ? '' : 'locked'; });
      zin.disabled = s.zoom <= 0;
      zout.disabled = s.zoom >= s.zoomUnlocked - 1;
      if (isComplete(s, world)) set(cellSky, 'Map complete!');

      for (const r of rows) {
        const lvl = s.upgrades[r.def.id];
        set(r.lvl, `lv${lvl}`);
        s.upgrades[r.def.id]++;
        const next = stats(s);
        s.upgrades[r.def.id]--;
        set(r.eff, effectText(r.def.id, st, next));
        set(r.cost, fmt(costOf(r.def, lvl)));
        r.btn.classList.toggle('can', canBuy(s, r.def.id));
      }
      for (const x of works) {
        const n = s.works[x.wd.id];
        set(x.lvl, `${n}`);
        set(x.next, workTitle(x.wd, n));
        set(x.cost, `${s.items[x.wd.item]}/${nextWorkCost(s, x.wd.id)}`);
        x.btn.classList.toggle('can', canCraft(s, x.wd.id));
      }
      const ready = WORKS.some((wd) => canCraft(s, wd.id));
      tabWorks.classList.toggle('alert', ready);
      const active = activeRoute(s);
      for (const c of routeCards) {
        const id = c.rd.id;
        const owned = s.routes.includes(id);
        c.coin.style.display = owned ? 'none' : '';
        if (!owned) {
          const items = Object.entries(c.rd.items).map(([k, n]) => `${n} ${ITEMS.find((it) => it.id === k)!.plural}`).join(' + ');
          set(c.state, '');
          set(c.eff, `+ ${items}`);
          set(c.label, fmt(c.rd.gold));
          c.btn.classList.toggle('can', canUnlockRoute(s, id));
        } else {
          const pending = s.route === id && active !== id;
          set(c.state, active === id ? 'on' : pending ? 'next' : '');
          set(c.eff, pending ? 'from next ring' : c.rd.short);
          set(c.label, active === id && s.route === id ? 'Active' : pending ? 'Queued' : 'Use');
          c.btn.classList.toggle('can', s.route !== id);
        }
      }
      tabRoutes.classList.toggle('alert', ROUTES.some((rd) => canUnlockRoute(s, rd.id)));
      set(shelfInfo, `${s.works.book + s.works.cd + s.works.album} works`);
    },
    /** Bluetreri from a revealed deposit, floating over the map. */
    specialFound(cell: number, amount: string, now: number) {
      map.popup(cell, `+${amount}`, now);
    },
    /** Collected item (page, note or photo), floating over its cell. */
    itemFound(cell: number, now: number) {
      const it = ITEMS[world.item[cell] - 1];
      map.popup(cell, `+1 ${it.name}`, now);
    },
    /** Bluetreri unloaded at camp. */
    deposited(amount: string, now: number) {
      map.popup(world.cy * world.size + world.cx, `+${amount}`, now);
    },
    /** Field notes on the first game. */
    openHelp: () => openHelp(),
    toast: (text: string) => showToast(text),
    /** A new work was made: what it is and what its bonus changed. */
    crafted(id: WorkId, n: number, before: Stats, after: Stats) {
      const wd = WORKS.find((x) => x.id === id)!;
      showToast(`New: ${workTitle(wd, n - 1)}\n${workEffect(wd.effect, before, after)}`, 4200);
    },
    /** An upgrade was bought: what it changed. */
    bought(id: StatId, level: number, before: Stats, after: Stats) {
      const u = UPGRADES.find((x) => x.id === id)!;
      showToast(`${u.name} lv${level}\n${effectText(id, before, after)}`, 2600);
    },
    /** Chosen speed multiplier (1 = normal). */
    gameSpeed: () => speed,
    showUpdate(version: string, notes: string, onInstall: () => void) {
      const m = modal();
      m.box.append(h('div', 'name', `New version: ${version}`), h('div', 'info', notes));
      m.addClose('Download', onInstall);
      m.addClose('Later');
    },
    showOffline(r: OfflineReport) {
      const m = modal();
      m.box.append(
        h('div', '', `While you were away (${fmtTime(r.seconds)}) the rovers explored`),
        h('div', 'gain', `${fmt(r.cells)} cells`),
        h('div', 'gain gold-text', `+${fmt(r.gold)} bluetreri`),
      );
      if (r.specials) m.box.append(h('div', 'info', `${r.specials} deposits found`));
      if (r.items) m.box.append(h('div', 'info', `${r.items} pages, notes and photos collected`));
      if (r.zoomUnlocked) m.box.append(h('div', 'info', `New zoom: ${ZOOMS[r.zoomUnlocked - 1].name}!`));
      m.addClose('Let\'s go');
    },
  };
}

function modal(cls = '') {
  const wrap = h('div', `modal ${cls}`);
  const box = h('div', 'box px-box');
  wrap.append(box);
  // Inside the "phone", not the whole window.
  (document.getElementById('app') ?? document.body).append(wrap);
  return {
    box,
    close: () => wrap.remove(),
    addClose(label: string, onClose?: () => void) {
      const b = h('button', 'px-btn can', label);
      b.addEventListener('click', () => { wrap.remove(); onClose?.(); });
      box.append(b);
    },
  };
}

/** In-game yes/no dialog (the browser's own confirm() is blocked in some embedded browsers). */
function confirmModal(question: string, yes: string, onYes: () => void) {
  const m = modal();
  m.box.append(h('div', '', question));
  const b = h('button', 'px-btn danger', yes);
  b.addEventListener('click', () => { m.close(); onYes(); });
  m.box.append(b);
  m.addClose('Cancel');
}

function textModal(title: string, value: string, readOnly: boolean, onOk?: (t: string) => void) {
  const m = modal();
  const ta = h('textarea');
  ta.value = value;
  ta.readOnly = readOnly;
  m.box.append(h('div', '', title), ta);
  m.addClose(readOnly ? 'Close' : 'Load', () => onOk?.(ta.value));
  if (readOnly) ta.select();
}
