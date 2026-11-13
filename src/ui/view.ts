// Interface: the map (canvas) and a DOM HUD. Built once; render() only updates texts.
import { HAUL_LEVELS, ROVER_KINDS, SCOUT_SHARE, UPGRADES, kindById, type DigOrder, type HaulPick, type RoverKind, type StatId } from '../content/upgrades';
import { ITEMS, LORE, loreText, WORKS, WORKS_MAX, workTitle, type ItemId, type WorkDef, type WorkId } from '../content/collection';
import { TERRAINS, ZOOMS } from '../content/world';
import { STORMS } from '../content/weather';
import { ROUTES, ROUTE_PACE_LEVEL, type RouteId } from '../content/routes';
import { GOAL_TIERS, GOALS, type GoalId, type GoalReward } from '../content/goals';
import { digCell, digPath, dugCells, isDug, canClaim, goalBonus, goalReached, goalTarget, goalValue, activeSector, canBuild, hasPart, roverIndex, roverLevelNeeded, canUnlockRoute, itemsCollected, routePace, canUpgradeRoute, libraryShare, loreFound, routeLevel, routeUpgradeCost, canBuy, canCraft, costOf, detourPlan, explorerLevel, fleetSpeed, levelOn, levelOf, routeLevelNeeded, workLevelNeeded, upgradeGain, nextWorkCost, explored as exploredCells, goldPerSec, isComplete, progress, revealed, stats, type Stats } from '../core/game';
import { stormAt, stormFactor, stormName } from '../core/weather';
import { fmt, fmtTime } from '../core/format';
import type { Bot, GameState } from '../core/state';
import { totalCells, type World } from '../core/world';
import type { OfflineReport } from '../save/offline';
import { MapView, type TripView } from './map';
import { COIN, FLAT, ITEM_SPRITES, LORE_SPRITES, spriteCanvas } from './sprites';

export interface ViewActions {
  unlockRoute(id: RouteId): void;
  /** The Scout follows route `id` from the next ring. */
  chooseRoute(id: RouteId): void;
  upgradeRoute(id: RouteId): void;
  /** Buys a level of `id` for rover `rover` (index into `bots`). */
  buy(id: StatId, rover: number): void;
  /** Picks the Miner's dig order (from the next ring it starts). */
  digOrder(order: DigOrder): void;
  /** Sets the Hauler policy: how full a hold must be, and which rover it drives to first. */
  haul(at: number, pick: HaulPick): void;
  /** Builds the rover of kind `kind`. */
  build(kind: RoverKind): void;
  /** Claims the next tier of goal `id`. */
  claimGoal(id: GoalId): void;
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
/** Percentage rounded down (100% only when really complete). */
const whole = (x: number) => `${Math.floor(x * 100 + 1e-9)}%`;

/** Short effect text (now -> next level), so it fits the narrow mobile cards. */
export function effectText(id: StatId, a: Stats, b: Stats): string {
  switch (id) {
    case 'speed': return `${fmt(a.speed)}→${fmt(b.speed)}/s`;
    case 'tyres': return `rough −${Math.round(100 * (1 - a.grip))}→${pct(1 - b.grip)}`;
    case 'body': return `storms −${Math.round(100 * (1 - a.armour))}→${pct(1 - b.armour)}`;
    case 'cargo': return `hold ${fmt(a.cargo)}→${fmt(b.cargo)}`;
    case 'radar': return `range ${a.radar}→${b.radar}`;
    case 'drill': return `dig ${fmt(a.drill)}→${fmt(b.drill)}/step`;
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

/** A goal's reward in one word, for the narrow Bonus column (the row's tooltip says it in full). */
const REWARD_SHORT: Record<GoalReward, string> = { speed: 'speed', loot: 'loot', cargo: 'hold', drill: 'drill', travel: 'trips' };

export function createView(root: HTMLElement, world: World, initial: GameState, actions: ViewActions) {
  document.documentElement.style.setProperty('--coin', `url(${spriteCanvas(COIN).toDataURL()})`);
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
  // Thin bar under the explorer level text: progress to the next level.
  const levelTrack = h('div', 'bar slim level-bar');
  const levelBar = h('i');
  levelTrack.append(levelBar);
  let shownLevel = -1;
  stats0.append(goldLine, cargoLine, explored, levelTrack);
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
  zoomCtl.append(zin, pips, zout);
  zin.addEventListener('click', () => actions.zoom(-1));
  zout.addEventListener('click', () => actions.zoom(1));

  // Bottom left: what the tapped cell holds or, with nothing tapped, what the rovers are hauling.
  const cellBox = h('div', 'cell-info px-box');
  const cellTitle = h('div', 'cell-title');
  const cellLine = h('div', 'cell-line');
  const cellSky = h('div', 'cell-line sky');
  cellBox.append(cellTitle, cellLine, cellSky);
  /** Cell (map index) the player tapped, or -1. */
  let selected = -1;
  // Tapping the box clears a selection; with nothing selected (the rovers' haul) it opens the fleet screen.
  cellBox.addEventListener('click', () => { if (selected < 0) openFleet(); selected = -1; });

  const toast = h('div', 'toast px-box');
  let rateNow: (() => number) | null = null;

  // Game speed multiplier, for testing (remembered in this browser).
  const SPEEDS = [1, 2, 5, 10, 50, 100, 1000];
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
  // (the library view is added once it exists, below)

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

  /** Fills the bottom-left box: the tapped cell's resources, or the haul of the rover picked in the Rovers tab. */
  function showCell(s: GameState, st: Stats, bot: Bot) {
    if (selected < 0) {
      const found = bot.found;
      set(cellTitle, `${kindById(bot.kind).name}'s haul`);
      set(cellLine, `${fmt(bot.cargo)} bluetreri · ${found} ${found === 1 ? 'item' : 'items'}`);
      const n = s.weather.storms.length;
      set(cellSky, n ? `Sky: ${n} ${n === 1 ? 'storm' : 'storms'}` : 'Sky: clear');
      return;
    }
    const i = selected;
    const r = world.rank[i];
    const seen = revealed(s, world, r) || s.mined.includes(i);
    const dug = isDug(s, world, r);
    const value = (world.goldPrefix[r + 1] - world.goldPrefix[r]) * st.loot;
    const it = world.item[i] ? ITEMS[world.item[i] - 1] : null;
    const gone = it && (seen || s.fetched.includes(world.itemRanks.indexOf(r)));
    const taken = gone ? ` · ${it!.name} taken` : '';
    set(cellTitle, `${TERRAINS[world.terrain[i]].name}${world.special[i] ? ' · deposit' : ''}`);
    if (dug) set(cellLine, `Dug out (gave ${fmt(value)})${taken}`);
    else if (seen) set(cellLine, `${fmt(value * (1 - SCOUT_SHARE))} left to dig${taken}`);
    else set(cellLine, `${fmt(value)} bluetreri${gone ? taken : ' · ???'}`);
    const storm = stormAt(s.weather.storms, world.size, i);
    set(cellSky, storm ? `${stormName(storm)}: −${pct((1 - stormFactor(storm)) * st.armour)} speed` : 'Sky: clear');
  }

  const panel = h('aside', 'panel');
  // Tabs: upgrades (bought with bluetreri), routes, and the library (works made from pages, notes and photos).
  const tabs = h('div', 'tabs');
  const tabUpg = h('button', 'px-btn tab on', 'Rovers');
  const tabRoutes = h('button', 'px-btn tab', 'I+D');
  const tabLibrary = h('button', 'px-btn tab', 'Library');
  const tabGoals = h('button', 'px-btn tab', 'Goals');
  tabs.append(tabUpg, tabRoutes, tabLibrary, tabGoals);
  /** Ends a fold or unfold under way (the panel back to its natural height). */
  let endFold = () => {};
  const showTab = (k: number) => {
    endFold();
    [tabUpg, tabRoutes, tabLibrary, tabGoals].forEach((t, q) => t.classList.toggle('on', q === k));
    const from = panel.offsetHeight;
    const wasOpen = mapWrap.classList.contains('library-open');
    const lists = [list, routesList, null, goalsList];
    // The Library tab swaps the map for the shelves.
    libView.hidden = k !== 2;
    mapWrap.classList.toggle('library-open', k === 2);
    if (k === 2) shelfKey = '';
    if (k === 2 && !wasOpen) {
      // Folding down to the tabs, so the shelves take the whole screen: the old tab stays in view while the panel
      // slides down, and goes once it is folded.
      const to = tabs.offsetHeight + (from - (lists.find((l) => l && !l.hidden)?.offsetHeight ?? 0));
      fold(from, to, () => lists.forEach((l) => { if (l) l.hidden = true; }));
      return;
    }
    lists.forEach((l, q) => { if (l) l.hidden = q !== k; });
    // Unfolding from the library: the panel slides up to its height.
    if (wasOpen && k !== 2) fold(from, panel.offsetHeight, () => {});
  };
  /** Slides the panel's height from `from` to `to` (the map above follows), then calls `done`. */
  function fold(from: number, to: number, done: () => void) {
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    panel.style.overflow = 'hidden';
    panel.style.height = `${from}px`;
    void panel.offsetHeight;
    panel.style.transition = 'height .32s cubic-bezier(.3, 0, .2, 1)';
    panel.style.height = `${to}px`;
    const timer = window.setTimeout(() => endFold(), 400);
    const onEnd = (e: TransitionEvent) => { if (e.target === panel) endFold(); };
    endFold = () => {
      clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
      endFold = () => {};
      panel.style.transition = panel.style.height = panel.style.overflow = '';
      done();
    };
    panel.addEventListener('transitionend', onEnd);
  }
  tabUpg.addEventListener('click', () => showTab(0));
  tabRoutes.addEventListener('click', () => showTab(1));
  tabLibrary.addEventListener('click', () => showTab(2));
  tabGoals.addEventListener('click', () => showTab(3));
  // Goals: 5 tiers each; a reached tier is claimed here and multiplies its stat for good.
  const goalsList = h('div', 'list goals');
  goalsList.hidden = true;
  /** A thin table (like the rover parts): a plate with a header row; rows are appended to it. */
  const table = (cls: string, heads: string[]) => {
    const t = h('div', `part-table px-box ${cls}`);
    const head = h('div', 'part-row head');
    for (const x of heads) head.append(h('span', '', x));
    t.append(head);
    return t;
  };
  const goalsTable = table('goals-table', ['Goal', 'Tier', '%', 'Bonus', '']);
  // Two kinds of goal in sub-tabs (like I+D): milestones to claim, and works made from the items found.
  let goalTab: 'goals' | 'works' = 'goals';
  const goalPicker = h('div', 'rover-pick');
  const goalTabBtns = (['goals', 'works'] as const).map((id) => {
    const btn = h('button', 'px-btn pick', id === 'goals' ? 'Milestones' : 'Works');
    btn.addEventListener('click', () => { goalTab = id; const s = current; if (s) fillGoalTab(s); });
    goalPicker.append(btn);
    return btn;
  });
  goalsList.append(goalPicker, goalsTable);
  const goalCards = GOALS.map((g) => {
    const card = h('div', 'part-row');
    const tier = h('span', 'lvl');
    const pips = h('span', 'goal-pips');
    const pipEls = Array.from({ length: GOAL_TIERS }, () => pips.appendChild(h('i')));
    const eff = h('span', 'eff');
    const gain = h('span', 'gain');
    const btn = h('button', 'px-btn buy');
    btn.addEventListener('click', () => actions.claimGoal(g.id));
    card.title = `${g.name}: ${g.what}. Each tier: ${g.rewardText} ×${g.mult}`;
    card.append(h('span', 'name', g.name), pips, eff, gain, btn);
    goalsTable.append(card);
    return { g, tier, pipEls, eff, gain, btn };
  });
  const list = h('div', 'list rover');
  // One rover of each kind: pick which one the cards are for. A kind not built yet shows what it does and its price.
  let kind: RoverKind = 'scout';
  /** Rovers built and panel width the Rovers tab height was measured for (see `fillRover`). */
  let sizedKey = '';
  const picker = h('div', 'rover-pick');
  const pickBtns = ROVER_KINDS.map((k) => {
    const b = h('button', 'px-btn pick', k.name);
    b.addEventListener('click', () => {
      kind = k.id;
      const s = current;
      const j = s ? roverIndex(s, k.id) : -1;
      if (j >= 0) { map.focus = j; map.goToRobot(); }
    });
    picker.append(b);
    return b;
  });
  list.append(picker);
  /** Whether a kind has something to do: it can be built, or one of its parts can be bought now. */
  const newFor = (s: GameState, k: RoverKind) => {
    const j = roverIndex(s, k);
    return canBuild(s, world, k) || (j >= 0 && UPGRADES.some((u) => canBuy(s, u.id, 1, j)));
  };
  function fillPicker(s: GameState) {
    ROVER_KINDS.forEach((k, q) => {
      const b = pickBtns[q];
      b.classList.toggle('on', k.id === kind);
      b.classList.toggle('locked', roverIndex(s, k.id) < 0);
      b.classList.toggle('alert', newFor(s, k.id));
    });
  }
  // Card for a rover not built yet: what it does, and Build.
  const buildCard = h('div', 'upg px-box build-card');
  const buildHead = h('div', 'head');
  const buildName = h('span', 'name');
  buildHead.append(buildName);
  const buildDesc = h('div', 'eff');
  const buildBtn = h('button', 'px-btn buy');
  buildBtn.addEventListener('click', () => actions.build(kind));
  buildCard.append(buildHead, buildDesc, buildBtn);
  list.append(buildCard);
  const buildKey = { btnKey: '', upKey: '' };
  // Orders for the Miner (dig order) and the Hauler (when it leaves camp, and for whom).
  const orderCard = h('div', 'upg px-box build-card order-card');
  const orderHead = h('div', 'head');
  const orderName = h('span', 'name');
  orderHead.append(orderName);
  const orderDesc = h('div', 'eff');
  orderCard.append(orderHead, orderDesc);
  const choiceRow = (label: string, opts: { text: string; title: string; pick: () => void }[]) => {
    const row = h('div', 'choices');
    row.setAttribute('role', 'radiogroup');
    row.append(h('span', 'what', label));
    const btns = opts.map((o) => {
      const b = h('button', 'radio', o.text);
      b.setAttribute('role', 'radio');
      b.title = o.title;
      b.addEventListener('click', o.pick);
      row.append(b);
      return b;
    });
    orderCard.append(row);
    return { row, btns };
  };
  const haulPolicy = () => current ?? null;
  const digRow = choiceRow('Dig', [
    { text: 'Behind Scout', title: 'Digs every cell in the order the Scout revealed it, right behind it.', pick: () => actions.digOrder('follow') },
    { text: 'Richest first', title: 'Digs each finished ring from its richest cells down (deposits first), hopping between them.', pick: () => actions.digOrder('rich') },
  ]);
  const atRow = choiceRow('Leave at', HAUL_LEVELS.map((at) => ({
    text: `${Math.round(at * 100)}%`,
    title: `Drives out once a hold is ${Math.round(at * 100)}% full.`,
    pick: () => { const s = haulPolicy(); if (s) actions.haul(at, s.haulPick); },
  })));
  const pickRow = choiceRow('First', (['fullest', 'scout', 'miner'] as HaulPick[]).map((p) => ({
    text: p === 'fullest' ? 'Fullest' : kindById(p).name,
    title: p === 'fullest' ? 'Drives to the fullest rover.' : `Drives to the ${kindById(p).name} first whenever it is full enough.`,
    pick: () => { const s = haulPolicy(); if (s) actions.haul(s.haulAt, p); },
  })));
  // Rover parts in a grid: everything within thumb reach, no scrolling. Each kind shows only its own parts.
  // The selected rover's parts as a table: part, level, now → next, gain in bluetreri/s, price.
  const partTable = h('div', 'part-table px-box');
  const partHead = h('div', 'part-row head');
  for (const t of ['Part', 'Lv', 'Now → next', 'Gain', 'Cost']) partHead.append(h('span', '', t));
  partTable.append(partHead);
  list.append(partTable);
  const rows = UPGRADES.map((u) => {
    const card = h('div', 'part-row');
    const name = h('span', 'name', u.name);
    const lvl = h('span', 'lvl');
    const eff = h('span', 'eff');
    // Estimated gain in bluetreri per second from one more level.
    const gain = h('span', 'gain');
    const btn = h('button', 'px-btn buy');
    const cost = h('span');
    btn.append(h('i', 'coin'), cost);
    btn.addEventListener('click', () => { const s = current; if (s) actions.buy(u.id, roverIndex(s, kind)); });
    card.title = u.desc;
    card.append(name, lvl, eff, gain, btn);
    partTable.append(card);
    return { def: u, card, lvl, eff, btn, cost, gain };
  });
  // Exploration routes: unlock with bluetreri once enough items are collected (not spent), then pick the one the Scout follows from the next ring.
  const routesList = h('div', 'list rover routes');
  routesList.hidden = true;
  // I+D: research for every rover, in sub-tabs: the Scout's routes, the Miner's dig order, the Hauler's pick-ups.
  type RdTab = 'routes' | 'dig' | 'pickups';
  let rdTab: RdTab = 'routes';
  const rdPicker = h('div', 'rover-pick');
  const rdTabs: { id: RdTab; kind: RoverKind; btn: HTMLButtonElement }[] = ([['routes', 'scout', 'Routes'], ['dig', 'miner', 'Dig'], ['pickups', 'hauler', 'Pick-ups']] as const)
    .map(([id, k, text]) => {
      const btn = h('button', 'px-btn pick', text);
      btn.addEventListener('click', () => { rdTab = id; const s = current; if (s) fillRD(s); });
      rdPicker.append(btn);
      return { id, kind: k, btn };
    });
  routesList.append(rdPicker);
  const routesTable = table('routes-table', ['Route', 'Lv', 'Pace', 'Use', 'Next']);
  routesList.append(routesTable);
  // One line per route: name, level, pace, a radio square for the route in use, and the next step (unlock or level) for
  // bluetreri. The items that step asks for (collected, not spent) go on a thin line under it.
  const routeCards = ROUTES.map((rd) => {
    const card = h('div', 'part-row');
    const state = h('span', 'lvl');
    const eff = h('span', 'eff');
    const btn = h('button', 'radio');
    btn.setAttribute('role', 'radio');
    btn.addEventListener('click', () => actions.chooseRoute(rd.id));
    const up = h('button', 'px-btn buy up');
    up.addEventListener('click', () => {
      const s = current;
      if (!s) return;
      if (s.routes.includes(rd.id)) actions.upgradeRoute(rd.id);
      else actions.unlockRoute(rd.id);
    });
    const needs = h('div', 'needs');
    card.title = `${rd.name}: ${rd.desc}`;
    card.append(h('span', 'name', rd.name), state, eff, btn, up, needs);
    routesTable.append(card);
    return { rd, card, state, eff, btn, up, needs, btnKey: '', upKey: '', needKey: '' };
  });
  // Only the next locked route is shown; the rest stay a mystery.
  const routesMore = h('p', 'info routes-more');
  routesList.append(routesMore, orderCard);
  /** Icons floating up from the map when something is found (no words). */
  const itemPopIcons = ITEM_SPRITES.map(spriteCanvas);
  const lorePopIcons = LORE_SPRITES.map(spriteCanvas);
  const loreIcon = (k: number) => { const c = spriteCanvas(LORE_SPRITES[k]); c.className = 'item-icon'; return c; };
  const itemIcon = (k: number) => { const c = spriteCanvas(ITEM_SPRITES[k]); c.className = 'item-icon'; return c; };
  /** Collections on show in the library (albums are hidden for now: they may be replaced by another kind of item). */
  const SHOWN = WORKS.filter((wd) => wd.id !== 'album');
  // Works (multipliers) on the Goals tab: a pip per work, the next one fills with the items gathered for it.
  const worksTable = table('works-table', ['Work', 'Made', 'Next', 'Bonus', 'Progress']);
  goalsList.append(worksTable);
  const works = WORKS.map((wd) => {
    const card = h('div', 'part-row');
    const pips = h('span', 'goal-pips works');
    const pipEls = Array.from({ length: WORKS_MAX }, () => pips.appendChild(h('i')));
    const next = h('span', 'eff');
    const gain = h('span', 'gain');
    // Cost: a bar of the items gathered for the next work; hovering it (or a tap while it cannot be made) shows X/Y in
    // a bubble over it, so the numbers are never cut.
    const btn = h('button', 'px-btn buy work-cost');
    const cost = h('span', 'num');
    const bar = h('span', 'wbar');
    btn.append(bar, cost);
    const row = { wd, pipEls, next, gain, btn, cost, bar, tip: '' };
    btn.addEventListener('mouseenter', () => showTip(btn, row.tip));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('click', () => {
      const s = current;
      if (s && canCraft(s, world, wd.id)) actions.craft(wd.id);
      else showTip(btn, row.tip, 2000);
    });
    card.title = `${wd.name}: each one ${wd.effect} ×${wd.bonus}`;
    card.append(h('span', 'name', wd.name), pips, next, gain, btn);
    worksTable.append(card);
    return row;
  });

  // A small bubble over a button (the X/Y of a work's items), outside the table so it is never cut.
  const tipEl = h('div', 'tip-bubble');
  tipEl.hidden = true;
  document.body.append(tipEl);
  let tipTimer = 0;
  /** The button the bubble is over: `render` refreshes its text while it shows. */
  let tipOwner: HTMLElement | null = null;
  function showTip(el: HTMLElement, text: string, ms = 0) {
    if (!text) return;
    tipOwner = el;
    tipEl.textContent = text;
    tipEl.hidden = false;
    const r = el.getBoundingClientRect();
    const half = tipEl.offsetWidth / 2 + 4; // (kept on screen)
    tipEl.style.left = `${Math.max(half, Math.min(window.innerWidth - half, r.left + r.width / 2))}px`;
    tipEl.style.top = `${r.top}px`;
    clearTimeout(tipTimer);
    if (ms) tipTimer = window.setTimeout(hideTip, ms);
  }
  function hideTip() { tipEl.hidden = true; tipOwner = null; }

  // The library view: three shelves (books, records, albums), WORKS_MAX slots each. Tap a volume to read its title.
  const libView = h('div', 'library-view');
  libView.hidden = true;
  const libCaption = h('div', 'lib-caption px-box');
  const shelvesEl = h('div', 'shelves');
  const archiveEl = h('div', 'archive');
  libView.append(shelvesEl, archiveEl);
  // The library is dark: a torch follows the finger (or wanders on its own when left alone), with dust in the beam.
  // The caption sits above the dark.
  const libDark = h('div', 'lib-dark');
  const motes = Array.from({ length: 12 }, (_, i) => {
    const m = h('i', 'mote');
    libDark.append(m);
    return { m, a: i * 0.52, r: 18 + ((i * 37) % 60) };
  });
  const torch = { x: -1, y: -1, last: -1e9 };
  const aim = (e: PointerEvent) => {
    const r = mapWrap.getBoundingClientRect();
    torch.x = e.clientX - r.left;
    torch.y = e.clientY - r.top;
    torch.last = performance.now();
  };
  libView.addEventListener('pointermove', aim);
  libView.addEventListener('pointerdown', aim);
  function lightLibrary(now: number) {
    const r = mapWrap.getBoundingClientRect();
    if (now - torch.last > 2500) {
      torch.x = r.width * (0.5 + 0.38 * Math.sin(now / 1700));
      torch.y = r.height * (0.45 + 0.3 * Math.sin(now / 1100));
    }
    const rad = Math.max(70, Math.min(r.width, r.height) * 0.22);
    libDark.style.setProperty('--x', `${torch.x}px`);
    libDark.style.setProperty('--y', `${torch.y}px`);
    libDark.style.setProperty('--r', `${rad}px`);
    for (const v of libView.querySelectorAll<HTMLElement>('.vol:not(.empty), .scrap, .jb-card:not(.empty)')) {
      const b = v.getBoundingClientRect();
      const d = Math.hypot(b.left + b.width / 2 - r.left - torch.x, b.top + b.height / 2 - r.top - torch.y);
      v.style.setProperty('--lift', Math.max(0, 1 - d / rad).toFixed(2));
    }
    for (const o of motes) {
      o.a += 0.01;
      o.m.style.transform = `translate(${torch.x + Math.cos(o.a * 1.3) * o.r * rad / 80}px, ${torch.y + Math.sin(o.a) * o.r * rad / 80}px)`;
      o.m.style.opacity = (0.25 + 0.5 * Math.sin(o.a * 3) ** 2).toFixed(2);
    }
  }
  /** Scraps of lore already announced on the map (-1: not counted yet, so loading does not announce them all). */
  let loreSeen = -1;
  let shelfKey = '';
  let picked = '';
  /** A colour for each title, from its letters (same title, same colour). */
  const hue = (t: string) => { let x = 7; for (const ch of t) x = (x * 31 + ch.charCodeAt(0)) % 360; return x; };
  /** Old velvet bindings for the books: midnight blue, black, brown, purple. */
  const VELVET = ['#1d2a5c', '#17151c', '#4a2a17', '#3d1d50'];
  /** Records live in a wide, square jukebox of wood and metal: a light bar on top, the record turning under a chrome
   *  window (the picked one spins), a title card per record (A1 to E3) and a speaker grille below. */
  function jukebox(wd: WorkDef, n: number): HTMLElement {
    const box = h('div', 'jukebox');
    const glass = h('div', 'jb-glass');
    const lp = h('i', 'jb-lp');
    const [pid, pk] = picked.split(':');
    if (pid === 'cd') {
      lp.style.setProperty('--c', VELVET[hue(workTitle(wd, Number(pk))) % VELVET.length]);
      lp.classList.add('play');
    }
    glass.append(lp, h('i', 'jb-arm'));
    const cards = h('div', 'jb-cards');
    for (let k = 0; k < WORKS_MAX; k++) {
      const code = `${'ABCDE'[Math.floor(k / 3)]}${(k % 3) + 1}`;
      if (k >= n) {
        cards.append(h('div', `jb-card empty${k === n ? ' next' : ''}`, code));
        continue;
      }
      const t = workTitle(wd, k);
      const c = h('button', 'jb-card', `${code} ${t}`);
      c.style.setProperty('--v', VELVET[hue(t) % VELVET.length]);
      c.title = t;
      c.classList.toggle('on', picked === `cd:${k}`);
      c.addEventListener('click', () => { picked = picked === `cd:${k}` ? '' : `cd:${k}`; shelfKey = ''; });
      cards.append(c);
    }
    const face = h('div', 'jb-face');
    face.append(glass, cards);
    box.append(h('div', 'jb-lights'), face, h('div', 'jb-grille'));
    return box;
  }
  function drawShelves(s: GameState) {
    const lore = loreFound(s, world);
    const key = WORKS.map((wd) => s.works[wd.id]).join(',') + `|${levelOf(s, world)}|${picked}|${lore.length}`;
    if (key === shelfKey) return;
    shelfKey = key;
    shelvesEl.replaceChildren();
    // The books shelf across the top; below, the jukebox across the whole width, and room for more under it.
    const lower = h('div', 'lib-lower');
    for (const wd of SHOWN) {
      const n = s.works[wd.id];
      const row = h('div', `shelf-row ${wd.id}`);
      const label = h('div', 'shelf-label', `${wd.name} ${n}/${WORKS_MAX}`);
      if (wd.id === 'cd') {
        row.append(label, jukebox(wd, n));
        lower.append(row, h('div', 'lib-alcove'));
        continue;
      }
      const plank = h('div', 'plank');
      for (let k = 0; k < WORKS_MAX; k++) {
        const t = workTitle(wd, k);
        if (k < n) {
          const v = h('button', `vol ${wd.id}`);
          v.style.setProperty('--h', String(hue(t)));
          if (wd.id === 'book') v.style.setProperty('--v', VELVET[hue(t) % VELVET.length]);
          v.style.setProperty('--tall', `${wd.id === 'book' ? 70 + ((hue(t) * 7) % 30) : 84}%`);
          v.append(h('span', '', t));
          v.title = t;
          v.classList.toggle('on', picked === `${wd.id}:${k}`);
          v.addEventListener('click', () => { picked = picked === `${wd.id}:${k}` ? '' : `${wd.id}:${k}`; shelfKey = ''; });
          plank.append(v);
        } else {
          const gap = h('div', `vol empty${k === n ? ' next' : ''}`);
          plank.append(gap);
        }
      }
      row.append(label, plank);
      shelvesEl.append(row);
    }
    shelvesEl.append(lower);
    // The archive: a small icon per scrap found, in the order they lie on the map.
    archiveEl.replaceChildren(h('div', 'shelf-label', `Archive ${lore.length}/${world.loreCells.length}`));
    const drawer = h('div', 'drawer');
    for (const k of lore) {
      const kind = world.lore[world.loreCells[k]] - 1;
      const b = h('button', 'scrap');
      b.append(loreIcon(kind));
      b.title = LORE[kind].name;
      b.classList.toggle('on', picked === `lore:${k}`);
      b.addEventListener('click', () => { picked = picked === `lore:${k}` ? '' : `lore:${k}`; shelfKey = ''; });
      drawer.append(b);
    }
    if (!lore.length) drawer.append(h('span', 'info', 'Scraps of the old world turn up as the Scout explores.'));
    archiveEl.append(drawer);
    const [pid, pk] = picked.split(':');
    const wd = WORKS.find((w) => w.id === pid);
    if (pid === 'lore') {
      const kind = world.lore[world.loreCells[Number(pk)]] - 1;
      set(libCaption, `${LORE[kind].name} #${Number(pk) + 1} · ${loreText(LORE[kind].id, Number(pk))}`);
    } else if (wd) set(libCaption, `${workTitle(wd, Number(pk))} · ${wd.name} #${Number(pk) + 1} · ${wd.effect} ×${wd.bonus}`);
    // Nothing picked: no caption.
    libCaption.hidden = !wd && pid !== 'lore';
  }
  /** Button content for a price (bluetreri + item icons), rebuilt only when it changes. */
  type Keyed<K extends string> = Record<K, string>;
  /** With `have`, the items are a requirement (collected so far / needed), not a price. */
  function price<K extends string>(c: Keyed<K>, key: K, btn: HTMLElement, gold: number, items: Partial<Record<ItemId, number>>, prefix = '', have?: Record<ItemId, number>) {
    const k = `${prefix}|${gold}|${JSON.stringify(items)}|${have ? Object.keys(items).map((id) => Math.min(have[id as ItemId], items[id as ItemId] ?? 0)).join(',') : ''}`;
    if (c[key] === k) return;
    c[key] = k;
    btn.replaceChildren();
    // Each part (level, bluetreri, each item) stays in one piece; the button wraps between them when narrow.
    const part = (...kids: Node[]) => { const p = h('span', 'part'); p.append(...kids); btn.append(p); };
    if (prefix) part(document.createTextNode(prefix));
    if (gold > 0) part(h('i', 'coin'), document.createTextNode(fmt(gold)));
    for (const [id, n] of Object.entries(items)) {
      const got = have ? Math.min(have[id as ItemId], n ?? 0) : -1;
      part(itemIcon(ITEMS.findIndex((it) => it.id === id)), document.createTextNode(have ? `${got}/${n}` : `${n}`));
      if (have) btn.lastElementChild!.classList.toggle('short', got < (n ?? 0));
    }
  }
  function label<K extends string>(c: Keyed<K>, key: K, btn: HTMLElement, text: string) {
    if (c[key] === text) return;
    c[key] = text;
    btn.replaceChildren(h('span', '', text));
  }
  panel.append(tabs, list, routesList, goalsList);

  /** Every tab of the bottom panel (and every rover on the Rovers tab) gets the height of the tallest, so the map above
   *  does not jump when switching. Measured in one go (each tab shown in turn, each rover drawn, then back as it was)
   *  whenever the rovers built, the routes on show or the width change. */
  function sizePanel(s: GameState) {
    const PANEL_MAX = 0.42;
    const key = `${s.bots.map((b) => b.kind).join()}|${s.routes.length}|${panel.clientWidth}`;
    if (key === sizedKey) return;
    sizedKey = key;
    const lists = [list, routesList, goalsList];
    const was = lists.map((l) => l.hidden);
    for (const l of lists) l.style.minHeight = '';
    let tallest = 0;
    for (const l of lists) {
      lists.forEach((x) => { x.hidden = x !== l; });
      if (l === routesList) {
        const keepRd = rdTab;
        for (const t of rdTabs) { rdTab = t.id; fillRD(s); tallest = Math.max(tallest, l.offsetHeight); }
        rdTab = keepRd;
        fillRD(s);
        continue;
      }
      if (l === goalsList) {
        const keepGoal = goalTab;
        for (const id of ['goals', 'works'] as const) { goalTab = id; fillGoalTab(s); tallest = Math.max(tallest, l.offsetHeight); }
        goalTab = keepGoal;
        fillGoalTab(s);
        continue;
      }
      if (l !== list) { tallest = Math.max(tallest, l.offsetHeight); continue; }
      const keep = kind;
      for (const k of ROVER_KINDS) {
        kind = k.id;
        fillRover(s);
        tallest = Math.max(tallest, l.offsetHeight);
      }
      kind = keep;
      fillRover(s);
    }
    // Never more than PANEL_MAX of the screen: the map stays big, and a longer tab scrolls.
    tallest = Math.min(tallest, Math.round(PANEL_MAX * (panel.parentElement?.clientHeight ?? Infinity)));
    lists.forEach((l, q) => { l.hidden = was[q]; l.style.minHeight = l.style.maxHeight = `${tallest}px`; });
  }

  /** Shows the picked sub-tab of Goals; the other one blinks when it has something to claim or make. */
  function fillGoalTab(s: GameState) {
    const alert = [GOALS.some((g) => canClaim(s, world, g.id)), WORKS.some((wd) => canCraft(s, world, wd.id))];
    (['goals', 'works'] as const).forEach((id, q) => {
      goalTabBtns[q].classList.toggle('on', id === goalTab);
      goalTabBtns[q].classList.toggle('alert', alert[q]);
    });
    goalsTable.hidden = goalTab !== 'goals';
    worksTable.hidden = goalTab !== 'works';
  }

  /** Fills the I+D tab for the picked sub-tab. A rover not built yet has its orders greyed out with a note. */
  function fillRD(s: GameState) {
    for (const t of rdTabs) {
      t.btn.classList.toggle('on', t.id === rdTab);
      t.btn.classList.toggle('locked', roverIndex(s, t.kind) < 0);
    }
    const routes = rdTab === 'routes';
    routesTable.hidden = !routes;
    const hiddenRoutes = ROUTES.filter((rd) => !s.routes.includes(rd.id)).length - 1;
    set(routesMore, hiddenRoutes > 0 ? `??? ${hiddenRoutes} more ${hiddenRoutes === 1 ? 'route' : 'routes'} to discover` : '');
    routesMore.hidden = !routes || hiddenRoutes <= 0;
    orderCard.hidden = routes;
    if (routes) return;
    const miner = rdTab === 'dig';
    const built = roverIndex(s, miner ? 'miner' : 'hauler') >= 0;
    set(orderName, miner ? 'Dig order' : 'Pick-ups');
    set(orderDesc, !built
      ? `Build the ${miner ? 'Miner' : 'Hauler'} first (Rovers tab).`
      : miner
        ? (s.digOrder === 'rich' ? 'Richest cells of each finished ring first.' : 'Every cell, right behind the Scout.') + (s.digPick !== s.digOrder ? ' Switching at the next ring.' : '')
        : `Leaves camp at ${Math.round(s.haulAt * 100)}% full, for ${s.haulPick === 'fullest' ? 'the fullest rover' : `the ${kindById(s.haulPick).name} first`}.`);
    digRow.row.hidden = !miner;
    atRow.row.hidden = miner;
    pickRow.row.hidden = miner;
    for (const r of [digRow, atRow, pickRow]) r.btns.forEach((b) => { b.disabled = !built; });
    // Radio squares, not brass buttons: brass means something can be bought.
    const mark = (b: HTMLButtonElement, on: boolean) => { b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); };
    digRow.btns.forEach((b, q) => mark(b, (q === 1 ? 'rich' : 'follow') === s.digPick));
    atRow.btns.forEach((b, q) => mark(b, HAUL_LEVELS[q] === s.haulAt));
    pickRow.btns.forEach((b, q) => mark(b, (['fullest', 'scout', 'miner'] as HaulPick[])[q] === s.haulPick));
  }

  /** Fills the Rovers tab for the picked kind. */
  function fillRover(s: GameState) {
    const sel = roverIndex(s, kind);
    const bot = sel >= 0 ? s.bots[sel] : undefined;
    const kd = kindById(kind);
    buildCard.hidden = !!bot;
    partTable.hidden = !bot;
    if (!bot) {
      const need = roverLevelNeeded(world, kind);
      const prevMissing = ROVER_KINDS.slice(0, ROVER_KINDS.indexOf(kd)).find((k) => roverIndex(s, k.id) < 0);
      set(buildName, kd.name);
      set(buildDesc, kd.desc);
      if (prevMissing) label(buildKey, 'btnKey', buildBtn, `Build the ${prevMissing.name} first`);
      else if (levelOf(s, world) < need) label(buildKey, 'btnKey', buildBtn, `needs explorer Lv ${need}`);
      else price(buildKey, 'btnKey', buildBtn, kd.gold, {}, 'Build');
      buildBtn.classList.toggle('can', canBuild(s, world, kind));
    }
    for (const r of rows) {
      const id = r.def.id;
      r.card.hidden = !bot || !hasPart(bot, id);
      if (r.card.hidden || !bot) continue;
      const lvl = levelOn(s, id, bot);
      set(r.lvl, `${lvl}`);
      const cur = stats(s, bot);
      bot.up[id]++;
      const next = stats(s, bot);
      bot.up[id]--;
      set(r.eff, effectText(r.def.id, cur, next));
      set(r.cost, fmt(costOf(r.def, lvl)));
      r.btn.classList.toggle('can', canBuy(s, id, 1, sel));
      const g = upgradeGain(s, world, id, sel);
      set(r.gain, g === null ? (id === 'radar' ? 'items' : bot.kind === 'hauler' ? (id === 'speed' ? 'pick-up' : 'loads') : '') : `+${g < 0.1 ? (g * 100).toFixed(1) : Math.round(g * 100)}%`);
      r.gain.title = g === null ? '' : 'More bluetreri per second from one more level';
    }
  }

  /** Where a rover is on its detour, for the map: 0 -> 0.5 out to the item (by cells walked: rough cells take longer)
   *  and 0.5 -> 1 back. */
  function detourShare(b: Bot): number {
    const s = current;
    if (!s || b.target < 0 || b.from < 0) return 0;
    const plan = detourPlan(world, stats(s, b).grip, b.from, b.target);
    const n = plan.path.length - 1;
    if (n <= 0) return 0.5;
    if (b.travel < plan.out) {
      let q = 0;
      while (q < n && plan.cum[q + 1] <= b.travel) q++;
      const seg = q < n ? (b.travel - plan.cum[q]) / (plan.cum[q + 1] - plan.cum[q]) : 0;
      return ((q + seg) / n) / 2;
    }
    const back = plan.total - plan.out;
    return 0.5 + (back > 0 ? Math.min(1, (b.travel - plan.out) / back) : 1) / 2;
  }

  /** Fleet: every rover, what it is doing and its record so far. Refreshed while open. */
  let fleetBody: HTMLElement | null = null;
  let fleetAt = 0;
  /** What a rover is doing, in words. */
  function doing(s: GameState, b: Bot, j: number): string {
    const h = roverIndex(s, 'hauler');
    if (b.trip === 'explore' && h >= 0 && s.bots[h].trip === 'out' && s.bots[h].target === j && b.cargo >= stats(s, b).cargo * (1 - 1e-9)) return 'Waiting for the Hauler';
    switch (b.trip) {
      case 'explore': return b.kind === 'miner' ? (b.walked ? 'Waiting for the Scout' : 'Digging') : 'Exploring';
      case 'home': return 'Driving to camp';
      case 'out': return b.kind === 'hauler' ? `Driving to the ${s.bots[b.target]?.kind === 'miner' ? 'Miner' : 'Scout'}` : 'Heading out';
      case 'detour': return 'Fetching an item';
      case 'idle': return 'At camp';
    }
  }
  function openFleet() {
    const m = modal('help');
    m.box.append(h('div', 'name', 'Fleet'));
    fleetBody = h('div', 'help-body fleet');
    m.box.append(fleetBody);
    m.addClose('Close', () => { fleetBody = null; });
    fillFleet();
  }
  function fillFleet() {
    const s = current;
    if (!s || !fleetBody) return;
    if (!fleetBody.isConnected) { fleetBody = null; return; }
    const body = fleetBody;
    body.replaceChildren();
    const line = (label: string, value: string) => {
      const p = h('p', 'fleet-line');
      p.append(h('span', '', label), h('span', 'fleet-val', value));
      body.append(p);
    };
    s.bots.forEach((b, j) => {
      body.append(h('h3', '', `${kindById(b.kind).name} · ${doing(s, b, j)}`));
      const bs = stats(s, b);
      line('Hold', `${fmt(b.cargo)} / ${fmt(bs.cargo)} (${whole(Math.min(1, b.cargo / bs.cargo))})`);
      line('Levels', UPGRADES.filter((u) => hasPart(b, u.id)).map((u) => `${u.name} ${levelOn(s, u.id, b)}`).join(' · '));
      line('On the job', b.log.since < 0 ? 'since before records' : fmtTime(Math.max(0, s.playTime - b.log.since)));
      if (b.kind !== 'hauler') line(b.kind === 'miner' ? 'Cells dug out' : 'Cells explored', fmt(b.log.cells));
      line('Distance', `${fmt(b.log.steps)} steps`);
      line('Bluetreri delivered', fmt(b.log.gold));
      line('Biggest load', fmt(b.log.best));
      line('Pages, notes, photos', fmt(b.log.items));
      line('Trips to camp', fmt(b.log.trips));
      if (b.kind === 'scout') line('Detours', `${fmt(b.log.detours)} done · ${fmt(b.log.gaveUp)} given up`);
    });
    if (roverIndex(s, 'miner') >= 0) body.append(h('p', 'info', `Dug out: ${whole(s.dug / n)} of the map.`));
    if (s.bots.some((b) => b.log.since < 0)) body.append(h('p', 'info', 'Records started with this version: older rovers count from now.'));
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
    // An upgrade counts as found once any rover has a level of it.
    const u = Object.fromEntries(UPGRADES.map((x) => [x.id, Math.max(0, ...s.bots.map((b) => levelOn(s, x.id, b)))])) as Record<StatId, number>;
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
        'At the top: the blue number is what you have at camp, and next to it what arrives per second on average. The bar below is the rovers\' total load; when every hold is full it turns orange and blinks.'] },
      { on: seenTerrain.size > 0 && deposited, title: 'Terrain', legend: true, lines: [
        'Each cell yields bluetreri by terrain (and the farther from camp, the more). Rough terrain is slower to explore: streets are fast, jungle and rubble are slow. Found so far:'] },
      { on: seenSpecial, title: 'Deposits', lines: ['Cells with blue crystals are bluetreri deposits: they yield far more than the rest.'] },
      { on: u.speed > 0, title: 'Engine', lines: ['The rover explores and travels faster. Every upgrade costs more at each level; the button lights up when you can afford it.',
        'Upgrades are fitted to one rover at a time: pick which one at the top of the Rovers tab (a green chevron marks it on the map). A new rover is built to the Scout\'s standard. Each card shows how much more bluetreri per second its next level would bring.'] },
      { on: u.cargo > 0, title: 'Hold', lines: ['The rover can carry more bluetreri, so it returns to camp less often. A loaded rover drives home slowly: the fuller, the slower.'] },
      { on: u.tyres > 0, title: 'Tires', lines: ['Better grip on rough ground: rubble, jungle, ruins and towers slow the rovers down less.'] },
      { on: s.weather.storms.length > 0 || u.body > 0, title: 'Weather', lines: [
        'Storms drift over the city with the wind and slow down any rover working under them. They form and die out one at a time; now and then a severe one hits much harder.',
        ...STORMS.map((d) => `${d.name}: ${d.desc}`),
        'The Body upgrade armours the rovers, so storms slow them down less.'] },
      { on: s.zoomUnlocked > 1, title: 'Zoom', lines: [
        'The + and − buttons, the mouse wheel or a pinch. There are 4 zoom levels; the next opens when you have explored 80% of what it shows (the bar at the bottom left).'] },
      { on: itemsFound, title: 'Pages, notes and photos', lines: [
        'Some cells hide a page, a musical note or a photo. Rovers pick them up when they reach them, but like the bluetreri they only count once the rover unloads at camp.',
        'On the Goals tab you turn them into books (pages), records (notes) and albums (photos). Each work costs more than the last.'] },
      { on: loreFound(s, world).length > 0, title: 'Scraps of the old world', lines: [
        'Shop receipts, concert tickets, propaganda leaflets: the city left scraps of its story behind. The Scout picks one up as soon as it reveals its cell, with no detour.',
        'They are kept in the Archive, under the shelves on the Library tab: tap one to read it. The Archivist goal counts them.'] },
      { on: crafted, title: 'Library', lines: [
        'Every work gives a permanent bonus: books, speed; records, more bluetreri; albums, bigger holds. The Library tab swaps the map for your shelves: tap a volume to read its title.',
        `Each collection has ${WORKS_MAX} works and the Library shows how complete it is. The world hides enough pages, notes and photos to finish the whole library.`] },
      { on: u.radar > 0, title: 'Radar', lines: [
        'A submarine-style radar sweeps around the Scout, reaching as many cells as its range. It detects pages, notes and photos in the dark around it: they light up as the needle passes.',
        'When it spots an item the Scout leaves its exploring and goes for it (the one it is after is framed), as slowly as if it were exploring, and mines the bluetreri of every cell on its way. Then it comes back the same way.',
        'If its hold fills before it gets there, bad luck: it leaves the item for later and heads to camp.'] },
      { on: s.routes.length > 1, title: 'Routes', lines: [
        'The I+D tab sets how the rovers push into the dark. They start out wandering at random; each new route is more efficient than the last, and only the next one shows until you unlock it.',
        'Each route is a planned path: the Scout and the Miner drive it faster (the ×N on its card), more the better the route and with every level.',
        'New routes cost bluetreri and ask for pages, notes or photos collected in total (they are not used up); the better ones ask for more. Each of them has levels: a higher level means less entropy, so the rovers stray and zig-zag less and waste fewer steps.',
        'The route you pick (or a new level) shows as Queued and takes over when the rovers finish the ring they are on (the card shows how much of it is done); what is already explored stays as it is.'] },
      { on: levelOf(s, world) >= 2, title: 'Explorer level', lines: [
        'Under the top bar: your explorer level and how far you are to the next. It grows with the cells explored, and each level asks for about a third more ground than the one before, so the first come fast and the last take hours.',
        'New routes, route levels and library works each need an explorer level; until you reach it, they stay hidden behind ???.'] },
      { on: Object.values(s.goals).some((x) => x > 0), title: 'Goals', lines: [
        'Each goal has 5 tiers. When you reach one, its Claim button lights up on the Goals tab; claiming it multiplies a stat for good (rover speed, bluetreri, holds, the Miner\'s drill or the drive to and from camp).'] },
      { on: true, title: 'Rovers', lines: [
        'The Scout explores: it is fast, but its hold is tiny and its drill only scratches each cell (a little of its bluetreri). The rest stays in the ground: revealed cells keep their colour until they are dug out.',
        'The Rovers tab has a card for each kind. Kinds you have not built yet show what they do, their price and the explorer level they need.'] },
      { on: roverIndex(s, 'miner') >= 0, title: 'Miner', lines: [
        'The Miner is slow but digs fast: it follows the Scout over the ground already revealed, in the same order, and digs out what the Scout left. Dug-out cells turn grey.',
        'When it catches up with the Scout it waits until the Scout is a few cells ahead. The Drill makes it dig faster.'] },
      { on: roverIndex(s, 'hauler') >= 0, title: 'Hauler', lines: [
        'The Hauler has a huge hold and no drill. It waits at camp until the Scout or the Miner is half full, drives out to it and brings its load (and its pages, notes and photos) to camp.',
        'A rover that fills up while the Hauler is on its way waits for it instead of driving back, so it loses no time.'] },
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
    item('Fleet', '', () => openFleet());
    item('Export game', '', () => textModal('Copy this text to save your game:', actions.exportText(), true));
    item('Import game', '', () => textModal('Paste an exported game:', '', false, actions.importText));
    item('Restart (new map)', 'danger', () => confirmModal('Erase this game and start a new map?', 'Erase and restart', () => {
      try { localStorage.removeItem(HELP_SEEN_KEY); } catch { /* no storage */ }
      actions.reset();
    }));
    m.box.append(h('div', 'info', `Version ${__APP_VERSION__} · build ${__APP_BUILD__}`));
    m.addClose('Close');
  }

  mapWrap.insertBefore(libView, toast);
  mapWrap.insertBefore(libDark, toast);
  mapWrap.insertBefore(libCaption, toast);
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
    /** Where the measured bluetreri per second comes from (see core/rate.ts); without it, the estimate is shown. */
    setRate(get: () => number) { rateNow = get; },
    render(s: GameState, now: number) {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const st = stats(s);
      map.nudge(...keyDir(), dt);
      current = s;
      scanDiscoveries(s);
      if (fleetBody && now - fleetAt > 500) { fleetAt = now; fillFleet(); }
      if (now - lastHelpCheck > 1000) {
        lastHelpCheck = now;
        const count = helpEntries(s).filter((e) => e.on).length + seenTerrain.size;
        helpBtn.classList.toggle('alert', count > helpSeen);
      }
      const prog = progress(s, world);
      const trips: TripView[] = s.bots.map((b) => ({
        kind: b.trip,
        rover: b.kind,
        f: b.trip === 'detour' ? detourShare(b) : b.travelLen > 0 ? b.travel / b.travelLen : 1,
        target: b.kind === 'scout' && b.target >= 0 ? world.itemRanks[b.target] : undefined,
        from: b.kind === 'scout' && b.from >= 0 ? b.from : undefined,
        at: b.kind === 'miner' ? digCell(world, digPath(s, world), s.dug) + (s.digOrder === 'follow' ? s.dug % 1 : 0.5) : b.kind === 'hauler' && b.from >= 0 ? b.from : undefined,
      }));
      if (selected >= 0 && selected >= totalCells(world)) selected = -1;
      const sel = roverIndex(s, kind);
      map.focus = sel >= 0 ? sel : 0;
      if (libView.hidden) map.render(prog, s.zoom, now, dt, trips, { ranges: s.bots.map((b) => stats(s, b).radar), fetched: s.fetched }, s.scouted, s.mined, s.weather.storms, selected, dugCells(s, world));
      const shown = s.bots[sel >= 0 ? sel : 0];
      showCell(s, st, shown);
      const cells = prog.a + prog.reach.reduce((x, y) => x + y, 0);

      set(gold, fmt(s.gold));
      set(rate, `+${fmt(rateNow ? rateNow() : goldPerSec(s, world))}/s`);
      // The hold bar shows the rover picked in the Rovers tab (the Scout when that kind is not built yet).
      const cap = stats(s, shown).cargo;
      const load = shown.cargo;
      cargoFill.style.width = `${Math.min(100, (100 * load) / cap)}%`;
      cargoBar.classList.toggle('full', load >= cap - 1e-6);
      const t = shown.trip;
      const doing = t === 'home' ? '· returning' : t === 'out' ? '· heading out' : t === 'detour' ? '· fetching' : t === 'idle' ? '· at camp' : load >= cap - 1e-6 ? '· full!' : '';
      set(cargoText, `${kindById(shown.kind).name} ${fmt(load)}/${fmt(cap)} ${doing}`);
      const lv = explorerLevel(cells, n);
      const lvText = lv.level >= lv.max ? `Lv ${lv.level} MAX` : `Lv ${lv.level}/${lv.max} · ${Math.floor(lv.frac * 100)}%`;
      set(explored, `${lvText} · ${fmt(fleetSpeed(s))} steps/s · ${s.bots.length}R`);
      levelBar.style.width = `${(lv.frac * 100).toFixed(1)}%`;
      if (shownLevel >= 0 && lv.level > shownLevel) showToast(lv.level >= lv.max ? `Explorer level ${lv.level}: the top!` : `Explorer level ${lv.level}\nNext at ${fmt(Math.ceil(lv.to))} cells`);
      shownLevel = lv.level;

      pipEls.forEach((p, i) => { p.className = i === s.zoom ? 'on' : i < s.zoomUnlocked ? '' : 'locked'; });
      zin.disabled = s.zoom <= 0;
      zout.disabled = s.zoom >= s.zoomUnlocked - 1;
      if (isComplete(s, world)) set(cellSky, 'Map complete!');

      // How much of the current ring is done: new rovers, and a queued route or level, start with the next ring.
      const ringNow = progress(s, world);
      const ringDone = ringNow.b > ringNow.a ? ringNow.reach.reduce((x, y) => x + y, 0) / (ringNow.b - ringNow.a) : 1;
      fillPicker(s);
      fillRover(s);
      tabUpg.classList.toggle('alert', ROVER_KINDS.some((k) => newFor(s, k.id)));
      const myLevel = levelOf(s, world);
      for (const x of works) {
        const n = s.works[x.wd.id];
        const need = workLevelNeeded(world, n);
        const early = n < WORKS_MAX && myLevel < need;
        const have = s.items[x.wd.item];
        const price = n < WORKS_MAX ? nextWorkCost(s, world, x.wd.id) : 0;
        x.pipEls.forEach((p, k) => {
          p.className = k < n ? 'on' : k === n && !early && have >= price ? 'ready' : k === n ? 'next' : '';
          if (k === n) p.style.setProperty('--p', `${Math.min(100, (100 * have) / Math.max(1, price)).toFixed(0)}%`);
        });
        set(x.next, n >= WORKS_MAX ? 'Complete!' : early ? `??? · Lv ${need}` : workTitle(x.wd, n));
        set(x.gain, `${x.wd.effect === 'bluetreri' ? 'loot' : x.wd.effect} ×${fmt(x.wd.bonus ** n)}`);
        x.next.title = x.next.textContent ?? '';
        const plain = n >= WORKS_MAX || early;
        set(x.cost, n >= WORKS_MAX ? 'done' : early ? `Lv ${need}` : `${have}/${price}`);
        x.tip = plain ? '' : `${x.wd.item}s ${have}/${price}`;
        if (tipOwner === x.btn) { if (x.tip) set(tipEl, x.tip); else hideTip(); }
        x.btn.classList.toggle('plain', plain);
        x.bar.style.setProperty('--p', `${plain ? 0 : Math.min(100, (100 * have) / Math.max(1, price)).toFixed(0)}%`);
        x.btn.classList.toggle('can', canCraft(s, world, x.wd.id));
      }
      const ready = WORKS.some((wd) => canCraft(s, world, wd.id));
      const lore = loreFound(s, world);
      // New scraps float up from their cells as icons.
      if (loreSeen >= 0 && lore.length > loreSeen) {
        for (const k of lore.slice(-Math.min(6, lore.length - loreSeen))) {
          const c = world.loreCells[k];
          map.popup(c, LORE[world.lore[c] - 1].name, now, lorePopIcons[world.lore[c] - 1]);
        }
      }
      loreSeen = lore.length;
      if (!libView.hidden) { drawShelves(s); lightLibrary(now); }
      const got = itemsCollected(s, world); // routes ask for items collected, they do not spend them
      const nextRoute = ROUTES.find((rd) => !s.routes.includes(rd.id));
      fillRD(s);
      for (const c of routeCards) {
        const id = c.rd.id;
        const owned = s.routes.includes(id);
        const lv = routeLevel(s, id);
        c.card.hidden = !owned && c.rd !== nextRoute;
        // The next step: unlock (not owned) or one more level; its items show under the row while any is still short.
        let items: Partial<Record<ItemId, number>> = {};
        let step = '';
        if (!owned) {
          const need = routeLevelNeeded(world, id);
          set(c.state, '');
          set(c.eff, `×${routePace(id, 0).toFixed(2)}`);
          c.btn.style.visibility = 'hidden';
          if (myLevel < need) label(c, 'upKey', c.up, `Lv ${need}`);
          else { price(c, 'upKey', c.up, c.rd.gold, {}); items = c.rd.items; step = 'Unlock'; }
          c.up.title = myLevel < need ? `Unlocks at explorer level ${need}` : `Unlock ${c.rd.name}`;
          c.up.classList.toggle('can', canUnlockRoute(s, world, id));
          c.up.style.visibility = '';
        } else {
          const [ar, al] = activeSector(s, 0);
          const running = ar === id && al === lv;
          const picked = s.bots[0].route === id;
          const pending = picked && !running;
          set(c.state, c.rd.maxLevel ? `${lv}` : '–');
          set(c.eff, `×${routePace(id, lv).toFixed(2)}`);
          c.eff.title = c.rd.short;
          c.btn.style.visibility = '';
          c.btn.classList.toggle('on', picked);
          c.btn.setAttribute('aria-checked', String(picked));
          set(c.btn, pending ? whole(Math.min(0.99, ringDone)) : '');
          c.btn.title = running ? 'In use' : pending ? `Takes over at the next ring (this one ${whole(Math.min(0.99, ringDone))} done)` : `Use ${c.rd.name} from the next ring`;
          const next = routeUpgradeCost(s, id);
          c.up.style.visibility = c.rd.maxLevel ? '' : 'hidden'; // Random has no levels
          const upNeed = routeLevelNeeded(world, id, lv + 1);
          if (next && myLevel < upNeed) label(c, 'upKey', c.up, `Lv ${upNeed}`);
          else if (next) { price(c, 'upKey', c.up, next.gold, {}); items = next.items; step = `lv${lv + 1}`; }
          else label(c, 'upKey', c.up, 'max');
          c.up.title = !next ? 'Top level' : myLevel < upNeed ? `Level ${lv + 1} at explorer level ${upNeed}` : `Level ${lv + 1}: less entropy, ×${ROUTE_PACE_LEVEL} pace`;
          c.up.classList.toggle('can', canUpgradeRoute(s, world, id));
        }
        const short = Object.entries(items).some(([k, q]) => got[k as ItemId] < (q ?? 0));
        c.needs.hidden = !short;
        if (short) price(c, 'needKey', c.needs, 0, items, `${step} needs`, got);
      }
      tabRoutes.classList.toggle('alert', ROUTES.some((rd) => canUnlockRoute(s, world, rd.id) || canUpgradeRoute(s, world, rd.id)));
      for (const c of goalCards) {
        const id = c.g.id;
        const got = s.goals[id];
        const reached = goalReached(s, world, id);
        const v = goalValue(s, world, id);
        const next = Math.min(reached, GOAL_TIERS - 1);
        const target = goalTarget(world, id, next);
        const prev = reached > 0 ? goalTarget(world, id, reached - 1) : 0;
        set(c.tier, `${got}/${GOAL_TIERS}`);
        c.pipEls.forEach((p, k) => {
          p.className = k < got ? 'on' : k < reached ? 'ready' : k === reached ? 'next' : '';
          if (k === reached) p.style.setProperty('--p', `${Math.min(100, (100 * (v - prev)) / Math.max(1e-9, target - prev)).toFixed(0)}%`);
        });
        // Progress to the next tier in %; the exact count is in the tooltip.
        const pct = reached >= GOAL_TIERS ? 100 : Math.min(99, Math.floor((100 * (v - prev)) / Math.max(1e-9, target - prev)));
        set(c.eff, reached > got ? 'ready' : `${pct}%`);
        c.eff.title = reached >= GOAL_TIERS ? `${fmt(v)} ${c.g.what}` : `${fmt(Math.floor(v))}/${fmt(target)} ${c.g.what}`;
        set(c.gain, `${REWARD_SHORT[c.g.reward]} ×${fmt(goalBonus(s, c.g.reward))}`);
        set(c.btn, canClaim(s, world, id) ? 'Claim' : got >= GOAL_TIERS ? 'Done' : `×${c.g.mult}`);
        c.btn.title = `Each tier: ${c.g.rewardText} ×${c.g.mult}`;
        c.btn.classList.toggle('can', canClaim(s, world, id));
      }
      tabGoals.classList.toggle('alert', ready || GOALS.some((g) => canClaim(s, world, g.id)));
      fillGoalTab(s);
      sizePanel(s);
    },
    /** Bluetreri from a revealed deposit, floating over the map. */
    specialFound(cell: number, amount: string, now: number) {
      map.popup(cell, `+${amount}`, now);
    },
    /** Collected item (page, note or photo), floating over its cell. */
    itemFound(cell: number, now: number) {
      const k = world.item[cell] - 1;
      map.popup(cell, ITEMS[k].name, now, itemPopIcons[k]);
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
    bought(id: StatId, level: number, before: Stats, after: Stats, rover: RoverKind) {
      const u = UPGRADES.find((x) => x.id === id)!;
      showToast(`${kindById(rover).name} · ${u.name} lv${level}\n${effectText(id, before, after)}`, 2600);
    },
    /** Chosen speed multiplier (1 = normal). */
    gameSpeed: () => speed,
    showUpdate(version: string, notes: string, onInstall: () => void) {
      const m = modal();
      m.box.append(h('div', 'name', `New version: ${version}`), h('div', 'info', notes));
      m.addClose('Download', onInstall);
      m.addClose('Later');
    },
    /** A newer web build is out: reload now (saving first) or later. */
    showReload(version: string, build: string, onReload: () => void) {
      const m = modal();
      m.box.append(
        h('div', 'name', 'New version available'),
        h('div', 'info', `Version ${version} · build ${build}`),
        h('div', 'info', `(you have ${__APP_VERSION__} · build ${__APP_BUILD__})`),
        h('div', '', 'Reload to get it. Your game is saved first.'),
      );
      m.addClose('Reload now', onReload);
      m.addClose('Later');
    },
    /** The whole map explored and every bluetreri at camp. */
    showComplete(s: GameState) {
      const m = modal();
      m.box.append(
        h('div', 'name', 'Congratulations!'),
        h('div', '', 'The whole world is explored and every resource is back at camp.'),
        h('div', 'gain', fmtTime(s.doneAt ?? s.playTime)),
        h('div', 'info', 'of play to rebuild it all.'),
        h('div', 'gain gold-text', `${fmt(s.totalGold)} bluetreri gathered`),
        h('div', 'info', `Library ${whole(libraryShare(s))} complete`),
      );
      m.addClose('Wonderful');
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
