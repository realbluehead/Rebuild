// Phase II screen: phase I's layout — a top bar with the currency and the ≡ menu, the scene in the middle and a panel
// of tabs at the bottom — re-themed in the voyage splash's palette (obsidian plates, steel rivets, red lights) with
// yellow for what you can press. The top bar shows metal (and what it makes an hour), fuel, data, power and the
// expedition's level. Tabs: one per building of the base (ui/buildings.ts), the star map (ui/starmap.ts, in place of
// the desert), the lab (ui/lab.ts), the team's attributes (ui/team.ts) and the ship in the dry dock (ui/ship.ts).
import './phase2.css';
import { fmt } from '../../shared/format';
import { h, modal } from '../../shared/ui/dom';
import { speedControl } from '../../shared/ui/speed';
import { expeditionLevel } from '../core/attributes';
import { bluetreriOffer, canResearch, pointsFree, pointsUseful, rates, systemsOf } from '../core/economy';
import { techById, TECHS } from '../core/research';
import { moduleById, MODULES } from '../core/ship';
import { STUDIES } from '../core/starmap';
import type { P2State } from '../core/state';
import { BUILDINGS, buildingTab, crewText } from './buildings';
import { createDesert, DOCK_PLOT, TELESCOPE_PLOT } from './desert';
import { labTab } from './lab';
import { nextStep } from './next';
import { bar, fill, flag, num, set, type Ctx, type Tab } from './panel';
import { shipTab } from './ship';
import { starMapTab } from './starmap';
import { teamTab } from './team';

/** How often the tabs refresh, ms (the top bar's metal every frame). */
const REFRESH_MS = 250;
/** News lines on the scene (a probe back, a build or research done): how long each stays, ms, and how many at once. */
const NEWS_MS = 5000;
const NEWS_MAX = 3;

/** What the news compares between refreshes. */
const snapshot = (s: P2State) => ({
  data: s.data, studies: [...s.studies], levels: { ...s.levels }, researched: s.researched.length, modules: s.modules.length,
  level: expeditionLevel(s.xp).level, dry: s.bluetreri.lt(1),
});

export interface Phase2Screen {
  /** Updates the screen from the state (every frame; only what changed is written). */
  render(s: P2State): void;
  /** The game speed multiplier picked for testing (1 = normal). */
  speed(): number;
}

/** Puts the phase II screen over `root` (the phone), fading in. `openMenu` opens the ≡ menu; `changed` is called
 *  after the player changed the state (it saves). */
export function showPhase2(root: HTMLElement, s: P2State, openMenu: () => void, changed: () => void = () => {}): Phase2Screen {
  const el = h('div', 'p2');
  let tab = 0;

  // Top bar: metal scraps (the currency) and their rate; fuel, data and power; the expedition's level and XP bar.
  const top = h('header', 'topbar');
  const stats = h('div', 'stats');
  const line = h('div', 'gold-line');
  const metal = h('span', 'gold', fmt(s.metal));
  const rate = h('span', 'p2-rate');
  line.append(h('i', 'nut'), metal, rate);
  const res = h('div', 'explored p2-res');
  const lvl = h('div', 'explored');
  const xp = bar();
  stats.append(line, res, lvl, xp.el);
  const menu = h('button', 'px-btn menu-btn');
  menu.title = 'Menu';
  menu.append(h('i'), h('i'), h('i'));
  menu.addEventListener('click', openMenu);
  top.append(stats, menu);

  // Middle: the night desert (3D, isometric), starting on the telescope's plot. A tap on a plot opens its tab.
  const scene = h('section', 'p2-scene');
  const plate = h('div', 'p2-dock px-box');
  const name = (k: number) => {
    const b = BUILDINGS.find((x) => x.plot === k);
    if (b) return `AREA ${k + 1} · ${b.plate} · Lv ${s.levels[b.id]}`;
    return k === DOCK_PLOT ? `AREA ${k + 1} · DRY DOCK · ${s.modules.length ? `the ship, ${s.modules.length}/${MODULES.length}` : 'Black siphon'}` : `AREA ${k + 1} · empty`;
  };
  let shownPlot = TELESCOPE_PLOT;
  const desert = createDesert((k) => {
    shownPlot = k;
    set(plate, name(k));
    const t = tabs.findIndex((x) => x.plot === k);
    if (t >= 0 && t !== tab) showTab(t, false);
  }, TELESCOPE_PLOT);
  const news = h('div', 'p2-news');
  const speedCtl = speedControl(); // (for testing, like phase I's)
  // "Next:" what most needs the player (ui/next.ts); a tap opens its tab.
  const next = h('button', 'p2-next px-box');
  next.addEventListener('click', () => { const k = tabs.findIndex((t) => t.label === next.dataset.tab); if (k >= 0) showTab(k, true); });
  scene.append(desert.el, plate, next, news, speedCtl.el);
  /** A line on the scene's news (the oldest goes when there are too many). */
  const tell = (text: string) => {
    const line = h('div', 'p2-news-line px-box', text);
    news.append(line);
    while (news.children.length > NEWS_MAX) news.firstElementChild!.remove();
    setTimeout(() => line.classList.add('out'), NEWS_MS);
    setTimeout(() => line.remove(), NEWS_MS + 600);
  };
  let was = snapshot(s);
  /** What happened since the last refresh, as news. */
  function report(): void {
    const now = snapshot(s);
    const got = now.data - was.data;
    const systems = systemsOf(s);
    const studied = now.studies.flatMap((n, k) => (n > was.studies[k] ? [k] : []));
    for (const k of studied) {
      const sys = systems[k];
      tell(`Probe back from ${sys.name}${got > 0 ? ` · +${num(got)} data` : ''} · study ${Math.min(STUDIES, now.studies[k])}/${STUDIES}${now.studies[k] === 1 ? ` · ${sys.kind}` : ''}`);
      if (now.studies[k] >= STUDIES && was.studies[k] < STUDIES && s.target === k) tell(`${sys.name} fully studied: pick the next system on the Map`);
    }
    if (!studied.length && got > 0) tell(`Probe back · +${num(got)} data`);
    for (const b of BUILDINGS) if (now.levels[b.id] > was.levels[b.id]) tell(`${b.tab} Lv ${now.levels[b.id]} built`);
    if (now.researched > was.researched) tell(`Research done: ${techById(s.researched[s.researched.length - 1])?.name ?? '?'}`);
    if (now.modules > was.modules) tell(`Module built: ${moduleById(s.modules[s.modules.length - 1])?.name ?? '?'}`);
    if (now.dry && !was.dry) tell('The sump is empty: buy bluetreri in the Fuel tab');
    if (now.level > was.level && pointsUseful(s)) tell(`Expedition Lv ${now.level} · a point to spend`);
    was = now;
  }

  // Bottom panel: the tabs.
  const ctx: Ctx = { s, changed: () => { changed(); refresh(); } };
  const tabs: Tab[] = [...BUILDINGS.map((b) => buildingTab(ctx, b, desert)), starMapTab(ctx), labTab(ctx), teamTab(ctx), shipTab(ctx)];
  /** Something waits on the player in these tabs (they blink when not open). */
  const alerts: Partial<Record<string, (st: P2State) => boolean>> = {
    Team: (st) => pointsFree(st) > 0 && pointsUseful(st),
    Lab: (st) => !st.lab && TECHS.some((t) => canResearch(st, t.id)),
    Fuel: (st) => st.bluetreri.lt(1) && bluetreriOffer(st) > 0,
  };
  for (const t of tabs) if (t.scene) { t.scene.hidden = true; scene.append(t.scene); }
  const panel = h('aside', 'panel');
  const bar2 = h('div', 'tabs');
  const btns = tabs.map((t, k) => {
    const b = h('button', `px-btn tab${k === 0 ? ' on' : ''}`, t.label);
    b.addEventListener('click', () => showTab(k, true));
    bar2.append(b);
    t.list.hidden = k !== 0;
    return b;
  });
  /** Shows tab `k`; `go` glides the view to its plot (not when the player just tapped that plot). */
  function showTab(k: number, go: boolean): void {
    tab = k;
    btns.forEach((x, q) => x.classList.toggle('on', q === k));
    tabs.forEach((t, q) => { t.list.hidden = q !== k; if (t.scene) t.scene.hidden = q !== k; });
    const t = tabs[k];
    desert.el.hidden = !!t.scene;
    plate.hidden = !!t.scene;
    t.shown?.();
    if (go && t.plot !== undefined) { desert.select(t.plot); shownPlot = t.plot; }
    refresh();
  }
  panel.append(bar2, ...tabs.map((t) => t.list));

  let told = s.launchedAt !== null;
  /** The modules the dock's ship shows (rebuilt when one is added). */
  let shipShown = '';
  function refresh(): void {
    report();
    const shipKey = s.modules.join() || '-';
    if (shipKey !== shipShown) { shipShown = shipKey; desert.setShip([...s.modules]); }
    const r = rates(s);
    set(rate, `+${num(r.metal * 3600)}/h`);
    set(res, `Fuel ${num(s.fuel)}/${num(r.capacity)} L${s.bluetreri.lt(1) ? ' (no bluetreri)' : ''} · Data ${num(s.data)} · Power ${Math.round(r.power * 100)}%`);
    const e = expeditionLevel(s.xp);
    const free = pointsFree(s);
    const busy = crewText(s);
    // Once every work is used, levels give nothing: the level and its bar stop (full).
    const useful = pointsUseful(s);
    set(lvl, `${useful ? `Expedition Lv ${e.level}${free > 0 ? ` · ${free} point${free > 1 ? 's' : ''}!` : ''}` : 'Expedition: all works used'} · ${busy ? `crew: ${busy}` : 'crew free'}`);
    fill(xp.fill, useful ? e.into / e.need : 1);
    flag(res, 'short', r.power < 1 || s.bluetreri.lt(1));
    set(plate, name(shownPlot));
    const step = nextStep(s);
    next.hidden = !step || !!tabs[tab].scene;
    if (step) { set(next, `Next: ${step.text}`); next.dataset.tab = step.tab; }
    tabs.forEach((t, k) => {
      t.update(s);
      const alert = alerts[t.label];
      flag(btns[k], 'alert', k !== tab && !!alert?.(s));
    });
    if (!told && s.launchedAt !== null) {
      told = true;
      const m = modal();
      m.box.append(h('div', 'name', 'The voyage begins'), h('div', '', 'The ship lifts off from the dry dock and leaves the planet behind. Phase III, on the new planet, comes next.'));
      m.addClose('OK');
    }
  }
  refresh();

  el.append(top, scene, panel);
  root.append(el);
  void el.offsetWidth; // (styles applied at opacity 0 first, so the change below fades)
  el.classList.add('in'); // fades in (over the voyage splash)

  let last = 0;
  return {
    render(st) {
      set(metal, fmt(st.metal));
      const now = performance.now();
      if (now - last >= REFRESH_MS) { last = now; refresh(); }
    },
    speed: () => speedCtl.speed(),
  };
}
