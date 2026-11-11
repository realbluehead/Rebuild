// Interfície: el mapa (canvas) i un HUD amb DOM. Es construeix un cop; render() només actualitza textos.
import { UPGRADES, type StatId } from '../content/upgrades';
import { ITEMS, WORKS, workCost, workTitle, type WorkId } from '../content/collection';
import { TERRAINS } from '../content/world';
import { ZOOMS, ZOOM_UNLOCK_FRACTION } from '../content/world';
import { canBuy, canCraft, capacity, costOf, nextWorkCost, explored as exploredCells, goldPerSec, isComplete, stats, type Stats } from '../core/game';
import { fmt, fmtTime } from '../core/format';
import type { GameState } from '../core/state';
import { isRevealed, totalCells, zoomFraction, type World } from '../core/world';
import type { OfflineReport } from '../save/offline';
import { MapView } from './map';
import { COIN, FLAT, ITEM_SPRITES, robotFrames, spriteCanvas } from './sprites';

export interface ViewActions {
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

/** Assigna text només si ha canviat (evita feina al navegador a cada frame). */
const set = (el: HTMLElement, text: string) => { if (el.textContent !== text) el.textContent = text; };

/** Efecte curt (ara → següent nivell), perquè càpiga a les targetes estretes del mòbil. */
function effectText(id: StatId, a: Stats, b: Stats): string {
  switch (id) {
    case 'speed': return `${fmt(a.speed)}→${fmt(b.speed)} pas/s`;
    case 'radar': return a.radar ? `abast ${a.radar}→${b.radar}` : `detecta a ${b.radar}`;
    case 'cargo': return `carrega ${fmt(a.cargo)}→${fmt(b.cargo)}`;
    case 'explorers': return `robots ${a.explorers}→${b.explorers}`;
  }
}

export function createView(root: HTMLElement, world: World, initial: GameState, actions: ViewActions) {
  document.documentElement.style.setProperty('--coin', `url(${spriteCanvas(COIN).toDataURL()})`);
  document.documentElement.style.setProperty('--robot', `url(${robotFrames()[0].toDataURL()})`);
  root.replaceChildren();

  // Barra de dalt: or i ritme a l'esquerra, menú a la dreta.
  const topbar = h('header', 'topbar');
  const gold = h('span', 'gold');
  const rate = h('span', 'rate');
  const explored = h('div', 'explored');
  const stats0 = h('div', 'stats');
  const goldLine = h('div', 'gold-line');
  goldLine.append(h('i', 'coin'), gold, rate);
  // Càrrega dels robots: l'or no és teu fins que el porten al campament.
  const cargoLine = h('div', 'cargo-line');
  const cargoBar = h('div', 'bar cargo-bar');
  const cargoFill = h('i');
  cargoBar.append(cargoFill);
  const cargoText = h('span', 'cargo-text');
  cargoLine.append(cargoBar, cargoText);
  stats0.append(goldLine, cargoLine, explored);
  const menuBtn = h('button', 'px-btn menu-btn');
  menuBtn.title = 'Menú';
  menuBtn.append(h('i'), h('i'), h('i'));
  menuBtn.addEventListener('click', () => openMenu());
  const helpBtn = h('button', 'px-btn menu-btn help-btn', '?');
  helpBtn.title = 'Ajuda';
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
  home.title = 'Anar al robot (espai)';
  home.append(h('i', 'robot-icon'));
  zoomCtl.append(zin, pips, zout, home);
  zin.addEventListener('click', () => actions.zoom(-1));
  zout.addEventListener('click', () => actions.zoom(1));
  home.addEventListener('click', () => map.goToRobot());

  const zoomInfo = h('div', 'zoom-info px-box');
  const zoomName = h('div', 'zoom-name');
  const zoomNext = h('div', 'zoom-next');
  const bar = h('div', 'bar');
  const barFill = h('i');
  bar.append(barFill);
  zoomInfo.append(zoomName, zoomNext, bar);

  const toast = h('div', 'toast px-box');

  // Multiplicador de velocitat del joc, per provar (es recorda en aquest navegador).
  const SPEEDS = [1, 2, 5, 10, 50, 100];
  let speed = 1;
  try { speed = SPEEDS.includes(Number(localStorage.getItem('rebuild:speed'))) ? Number(localStorage.getItem('rebuild:speed')) : 1; } catch { /* sense storage */ }
  const speedBtn = h('button', 'px-btn speed-ctl');
  speedBtn.title = 'Velocitat del joc (per provar)';
  const showSpeed = () => { speedBtn.textContent = `Vel ×${speed}`; speedBtn.classList.toggle('can', speed > 1); };
  showSpeed();
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    try { localStorage.setItem('rebuild:speed', String(speed)); } catch { /* sense storage */ }
    showSpeed();
  });
  mapWrap.append(canvas, zoomCtl, zoomInfo, speedBtn, toast);

  // Controls de la vista: arrossegar (ratolí o dit) per moure, roda o pessic per fer zoom.
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
    // Un toc sense arrossegar: què hi ha en aquesta casella.
    if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) cellInfo(e.clientX, e.clientY);
    tap = null;
    pointers.delete(e.pointerId);
    pinch0 = 0;
    if (!pointers.size) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // Teclat: fletxes o WASD per moure, +/− per al zoom, espai per anar al robot.
  const keys = new Set<string>();
  const typing = (e: KeyboardEvent) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
      // Un toc curt també mou una mica la vista; si es manté premuda, el bucle de render continua movent.
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
    const s = current;
    if (i < 0 || !s) return;
    const r = world.rank[i];
    if (!isRevealed(world, s.walked, s.ringRobots, r)) { showToast('Encara per explorar'); return; }
    const value = (world.goldPrefix[r + 1] - world.goldPrefix[r]) * stats(s).loot;
    showToast(`${world.special[i] ? 'Cofre' : TERRAINS[world.terrain[i]].name}: ${fmt(value)} or`);
  }

  const panel = h('aside', 'panel');
  // Pestanyes: millores (amb or) i obres (amb pàgines, notes i fotos).
  const tabs = h('div', 'tabs');
  const tabUpg = h('button', 'px-btn tab on', 'Millores');
  const tabWorks = h('button', 'px-btn tab', 'Obres');
  tabs.append(tabUpg, tabWorks);
  const showTab = (works: boolean) => {
    tabUpg.classList.toggle('on', !works);
    tabWorks.classList.toggle('on', works);
    list.hidden = works;
    worksList.hidden = !works;
  };
  tabUpg.addEventListener('click', () => showTab(false));
  tabWorks.addEventListener('click', () => showTab(true));
  const list = h('div', 'list');
  // Millores en una graella de 2×2: tot a l'abast del polze, sense haver de desplaçar.
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
    card.title = `Cada obra: ${wd.effect} ×${wd.bonus}`;
    card.append(head, next, btn);
    worksList.append(card);
    return { wd, lvl, next, btn, cost };
  });
  const shelfCard = h('div', 'upg px-box shelf');
  const shelfInfo = h('div', 'eff');
  const shelfBtn = h('button', 'px-btn buy', 'Vitrina');
  shelfBtn.addEventListener('click', () => openShelf());
  shelfCard.append(h('div', 'head'), shelfInfo, shelfBtn);
  shelfCard.firstElementChild!.append(h('span', 'name', 'Col·lecció'));
  worksList.append(shelfCard);
  panel.append(tabs, list, worksList);

  /** Vitrina: totes les obres creades i el bonus que donen. */
  function openShelf() {
    const s = current;
    if (!s) return;
    const m = modal('help');
    m.box.append(h('div', 'name', 'Vitrina'));
    const body = h('div', 'help-body');
    for (const wd of WORKS) {
      const n = s.works[wd.id];
      body.append(h('h3', '', `${wd.name}: ${wd.effect} ×${fmt(wd.bonus ** n)}`));
      if (!n) body.append(h('p', 'info', 'Encara cap.'));
      for (let k = 0; k < n; k++) body.append(h('p', '', `${k + 1}. ${workTitle(wd, k)}`));
      body.append(h('p', 'info', `Següent: ${workTitle(wd, n)} (${workCost(wd, n)} ${ITEMS.find((it) => it.id === wd.item)!.plural})`));
    }
    m.box.append(body);
    m.addClose('Tancar');
  }

  /** Pàgina d'ajuda: per a què serveix cada cosa. */
  function openHelp() {
    const m = modal('help');
    m.box.append(h('div', 'name', 'Com es juga'));
    const body = h('div', 'help-body');
    const sec = (title: string, ...lines: string[]) => {
      body.append(h('h3', '', title));
      for (const l of lines) body.append(h('p', '', l));
    };
    sec('L\'objectiu',
      'El mapa comença fosc. Els robots surten del campament i el van descobrint sols, casella a casella, encara que no hi siguis.',
      'Un robot només pot explorar la casella del costat. Mentre hi és, la casella va agafant color; quan l\'acaba, queda descoberta.');
    sec('L\'or i la bodega',
      'Cada casella dona or segons el terreny (i com més lluny del campament, més). Toca una casella del mapa per veure quant val.');
    const legend = h('div', 'legend');
    const css = (c: number) => `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
    TERRAINS.map((t, i) => ({ t, i })).sort((a, b) => b.t.value - a.t.value).forEach(({ t, i }) => {
      const row = h('div', 'legend-row');
      const sw = h('i', 'swatch');
      sw.style.background = css(FLAT[i][0]);
      row.append(sw, h('span', '', t.name), h('span', 'legend-val', `${t.value} or`));
      legend.append(row);
    });
    body.append(legend);
    body.append(
      h('p', '', 'Els cofres i les ruïnes (caselles daurades) en donen molt.'),
      h('p', '', 'Els robots carreguen l\'or que troben, però només en poden dur una quantitat. Quan la bodega és plena, tornen al campament a descarregar-lo i després tornen on ho havien deixat. L\'or no es pot gastar fins que arriba al campament.'),
    );
    sec('Pàgines, notes i fotos',
      'Algunes caselles amaguen una pàgina, una nota musical o una foto. Els robots les recullen quan hi arriben.',
      'A la pestanya Obres les fas servir per crear llibres (amb pàgines), discos (amb notes) i àlbums (amb fotos). Cada obra costa més que l\'anterior.',
      'Cada obra dona un bonus per sempre: els llibres, velocitat; els discos, més or; els àlbums, més bodega. A la Vitrina hi ha totes les que has fet.');
    sec('Les millores',
      'Motor: els robots exploren i caminen més de pressa.',
      'Radar: detecta pàgines, notes i fotos dins la foscor (parpellegen al mapa). Un robot deixa l\'exploració, va a buscar-les d\'una en una (la que va a buscar té un marc) i torna on era. Es perd una mica d\'exploració, però els objectes arriben abans. Com més nivell, més lluny arriba.',
      'Bodega: cada robot pot carregar més or, i torna menys sovint al campament.',
      'Robots: surt un robot més. Comença a treballar quan els altres comencen una volta nova al voltant del campament.',
      'El preu de cada millora puja a cada nivell. El botó es posa groc quan la pots comprar.');
    sec('El mapa',
      'Arrossega el mapa amb el dit o el ratolí, o mou-te amb les fletxes o WASD.',
      'Zoom: botons + i −, la roda del ratolí o pessigant. Hi ha 4 zooms; el següent s\'obre quan has explorat el 80% del que es veu (la barra de baix a l\'esquerra).',
      'El botó del robot (o l\'espai) porta la vista on és el robot. Si el robot surt de la pantalla, una fletxa a la vora indica cap on és: toca-la per anar-hi.');
    sec('Altres',
      'Vel ×N: accelera el temps del joc per provar-lo.',
      'Si tanques el joc, els robots continuen (fins a 24 hores) i en tornar veus què han trobat.',
      'Menú ≡: exportar i importar la partida (per passar-la a un altre aparell) o reiniciar amb un mapa nou.');
    m.box.append(body);
    m.addClose('Entesos');
  }

  function openMenu() {
    const m = modal();
    m.box.append(h('div', 'name', 'Menú'));
    const item = (label: string, cls: string, fn: () => void) => {
      const b = h('button', `px-btn ${cls}`, label);
      b.addEventListener('click', () => { m.close(); fn(); });
      m.box.append(b);
    };
    item('Ajuda', '', () => openHelp());
    item('Exportar partida', '', () => textModal('Copia aquest text per guardar la partida:', actions.exportText(), true));
    item('Importar partida', '', () => textModal('Enganxa una partida exportada:', '', false, actions.importText));
    item('Reiniciar (mapa nou)', 'danger', () => { if (confirm('Segur que vols esborrar la partida i començar un mapa nou?')) actions.reset(); });
    m.box.append(h('div', 'info', `Versió ${__APP_VERSION__}`));
    m.addClose('Tancar');
  }

  root.append(topbar, mapWrap, panel);

  const map = new MapView(canvas, world, initial.zoom);
  new ResizeObserver(() => map.resize()).observe(canvas);

  const n = totalCells(world);
  let toastTimer = 0;
  let lastFrame = performance.now();
  /** Últim estat dibuixat (per als tocs al mapa i la vitrina). */
  let current: GameState | null = null;

  function showToast(text: string) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  return {
    render(s: GameState, now: number) {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const st = stats(s);
      map.nudge(...keyDir(), dt);
      current = s;
      map.render(s.walked, s.ringRobots, s.zoom, now, dt,
        s.trip === 'explore' ? null : { kind: s.trip, f: s.travelLen > 0 ? s.travel / s.travelLen : 1, target: world.itemRanks[s.radarNext] },
        { next: s.radarNext, range: st.radar }); // només els que es van a buscar
      const cells = exploredCells(s, world);

      set(gold, fmt(s.gold));
      set(rate, `+${fmt(goldPerSec(s, world))}/s`);
      const cap = capacity(s);
      const load = s.cargo.toNumber();
      cargoFill.style.width = `${Math.min(100, (100 * load) / cap)}%`;
      cargoBar.classList.toggle('full', load >= cap - 1e-6);
      set(cargoText, `${fmt(load)}/${fmt(cap)} ${s.trip === 'home' ? '· tornant a la base' : s.trip === 'out' ? '· sortint' : load >= cap - 1e-6 ? '· ple!' : ''}`);
      const pct = (100 * cells) / n;
      set(explored, `${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}% explorat · ${fmt(st.stepsPerSec)} pas/s · ${s.ringRobots}R`);

      pipEls.forEach((p, i) => { p.className = i === s.zoom ? 'on' : i < s.zoomUnlocked ? '' : 'locked'; });
      zin.disabled = s.zoom <= 0;
      zout.disabled = s.zoom >= s.zoomUnlocked - 1;
      set(zoomName, `Zoom ${s.zoom + 1}: ${ZOOMS[s.zoom].name}`);
      if (s.zoomUnlocked < ZOOMS.length) {
        const f = Math.min(1, zoomFraction(world, s.zoomUnlocked - 1, cells) / ZOOM_UNLOCK_FRACTION);
        set(zoomNext, `Següent: ${ZOOMS[s.zoomUnlocked].name} ${Math.floor(f * 100)}%`);
        barFill.style.width = `${f * 100}%`;
        bar.hidden = false;
      } else {
        set(zoomNext, isComplete(s, world) ? 'Mapa complet!' : 'Tots els zooms oberts');
        bar.hidden = true;
      }

      for (const r of rows) {
        const lvl = s.upgrades[r.def.id];
        set(r.lvl, `nv${lvl}`);
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
      set(shelfInfo, `${s.works.book + s.works.cd + s.works.album} obres`);
    },
    /** Or d'un lloc especial descobert, flotant sobre el mapa. */
    specialFound(rank: number, amount: string, now: number) {
      map.popup(rank, `+${amount}`, now);
    },
    /** Objecte recollit (pàgina, nota o foto), flotant sobre la seva casella. */
    itemFound(rank: number, now: number) {
      const it = ITEMS[world.item[world.order[rank]] - 1];
      map.popup(rank, `+1 ${it.name}`, now);
    },
    /** Or descarregat al campament. */
    deposited(amount: string, now: number) {
      map.popup(0, `+${amount}`, now);
    },
    /** Ajuda a la primera partida. */
    openHelp: () => openHelp(),
    toast: (text: string) => showToast(text),
    /** Obra nova creada. */
    crafted(id: WorkId, n: number) {
      const wd = WORKS.find((x) => x.id === id)!;
      showToast(`Nou: ${workTitle(wd, n - 1)}`);
    },
    /** Multiplicador de velocitat triat (1 = normal). */
    gameSpeed: () => speed,
    showUpdate(version: string, notes: string, onInstall: () => void) {
      const m = modal();
      m.box.append(h('div', 'name', `Versió nova: ${version}`), h('div', 'info', notes));
      m.addClose('Descarregar', onInstall);
      m.addClose('Més tard');
    },
    showOffline(r: OfflineReport) {
      const m = modal();
      m.box.append(
        h('div', '', `Mentre eres fora (${fmtTime(r.seconds)}) has explorat`),
        h('div', 'gain', `${fmt(r.cells)} caselles`),
        h('div', 'gain gold-text', `+${fmt(r.gold)} or`),
      );
      if (r.specials) m.box.append(h('div', 'info', `${r.specials} llocs especials trobats`));
      if (r.items) m.box.append(h('div', 'info', `${r.items} pàgines, notes i fotos recollides`));
      if (r.zoomUnlocked) m.box.append(h('div', 'info', `Nou zoom: ${ZOOMS[r.zoomUnlocked - 1].name}!`));
      m.addClose('Som-hi');
    },
  };
}

function modal(cls = '') {
  const wrap = h('div', `modal ${cls}`);
  const box = h('div', 'box px-box');
  wrap.append(box);
  // Dins del "telèfon", no a tota la finestra.
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

function textModal(title: string, value: string, readOnly: boolean, onOk?: (t: string) => void) {
  const m = modal();
  const ta = h('textarea');
  ta.value = value;
  ta.readOnly = readOnly;
  m.box.append(h('div', '', title), ta);
  m.addClose(readOnly ? 'Tancar' : 'Carregar', () => onOk?.(ta.value));
  if (readOnly) ta.select();
}
