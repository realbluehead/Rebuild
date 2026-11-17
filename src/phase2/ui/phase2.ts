// Phase II screen: phase I's layout — a top bar with the currency and the ≡ menu, the scene in the middle and a panel
// of tabs at the bottom — re-themed in the voyage splash's palette (obsidian plates, steel rivets, red lights) with
// yellow for what you can press. The top bar shows metal (and what it makes an hour), fuel, data, power and the
// expedition's level. Tabs: one per building of the base (ui/buildings.ts), the star map (ui/starmap.ts, in place of
// the desert), the lab (ui/lab.ts), the team's attributes (ui/team.ts) and the ship in the dry dock (ui/ship.ts).
import './phase2.css';
import { fmt } from '../../shared/format';
import { h, modal } from '../../shared/ui/dom';
import { expeditionLevel } from '../core/attributes';
import { canResearch, pointsFree, rates } from '../core/economy';
import { TECHS } from '../core/research';
import type { P2State } from '../core/state';
import { BUILDINGS, buildingTab, crewText } from './buildings';
import { createDesert, DOCK_PLOT, TELESCOPE_PLOT } from './desert';
import { labTab } from './lab';
import { bar, fill, flag, num, set, type Ctx, type Tab } from './panel';
import { shipTab } from './ship';
import { starMapTab } from './starmap';
import { teamTab } from './team';

/** How often the tabs refresh, ms (the top bar's metal every frame). */
const REFRESH_MS = 250;

export interface Phase2Screen {
  /** Updates the screen from the state (every frame; only what changed is written). */
  render(s: P2State): void;
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
    return k === DOCK_PLOT ? `AREA ${k + 1} · DRY DOCK · ${s.modules.length ? `the ship, ${s.modules.length}/8` : 'Black siphon'}` : `AREA ${k + 1} · empty`;
  };
  let shownPlot = TELESCOPE_PLOT;
  const desert = createDesert((k) => {
    shownPlot = k;
    set(plate, name(k));
    const t = tabs.findIndex((x) => x.plot === k);
    if (t >= 0 && t !== tab) showTab(t, false);
  }, TELESCOPE_PLOT);
  scene.append(desert.el, plate);

  // Bottom panel: the tabs.
  const ctx: Ctx = { s, changed: () => { changed(); refresh(); } };
  const tabs: Tab[] = [...BUILDINGS.map((b) => buildingTab(ctx, b, desert)), starMapTab(ctx), labTab(ctx), teamTab(ctx), shipTab(ctx)];
  /** Something waits on the player in these tabs (they blink when not open). */
  const alerts: Partial<Record<string, (st: P2State) => boolean>> = {
    Team: (st) => pointsFree(st) > 0,
    Lab: (st) => !st.lab && TECHS.some((t) => canResearch(st, t.id)),
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
  function refresh(): void {
    const r = rates(s);
    set(rate, `+${num(r.metal * 3600)}/h`);
    set(res, `Fuel ${num(s.fuel)}/${num(r.capacity)} L · Data ${num(s.data)} · Power ${Math.round(r.power * 100)}%`);
    const e = expeditionLevel(s.xp);
    const free = pointsFree(s);
    const busy = crewText(s);
    set(lvl, `Expedition Lv ${e.level}${free > 0 ? ` · ${free} point${free > 1 ? 's' : ''}!` : ''} · ${busy ? `crew: ${busy}` : 'crew free'}`);
    fill(xp.fill, e.into / e.need);
    flag(res, 'short', r.power < 1);
    set(plate, name(shownPlot));
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
  };
}
