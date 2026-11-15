// Phase I, the game proper: loaded by main.ts once the title screen is up (unless a phase II save exists). Once the map
// is done, "The voyage" splash leads into phase II, which starts from what phase I hands over (`legacyOf`).
import { buildSection, buildSections, buyDetector, buyDetectorUp, decode, setDecoder, carried, chooseDig, claimGoal, goalBonus, build, buy, levelOn, chooseRoute, craft, routeLevel, unlockRoute, upgradeRoute, goldPerSec, setZoom, stats, TICK_SEC, tick } from './core/game';
import type { GameState } from './core/state';
import type { World } from './core/world';
import { D } from '../shared/decimal';
import { fmt } from '../shared/format';
import { ZOOMS } from './content/world';
import { routeById } from './content/routes';
import { DETECTOR_UPS } from './content/collection';
import { sectionById } from './content/library';
import { kindById } from './content/upgrades';
import { goalById } from './content/goals';
import { applyOffline, type OfflineReport } from './save/offline';
import { RateMeter } from './core/rate';
import { loadGame, saveGame } from './save/persist';
import { deserialize, exportSave, serialize, type SaveData } from './save/save';
import { cancelReminders, onBackground, scheduleReminder } from '../platform';
import { offerUpdates } from '../shared/updates';
import { importAny, wipeAll } from '../saves';
import { showVoyage } from '../phase2/ui/voyage';
import { startPhase2 } from '../phase2/boot';
import { legacyOf } from './legacy';
import { createView } from './ui/view';
import type { TitleScreen } from '../shared/ui/title';
import { showArrival } from './ui/arrival';
import { loadWorld, type Loaded } from './load';

const AUTOSAVE_MS = 30_000;
/** If the tab was frozen for longer than this, it is treated as offline time. */
const MAX_FRAME_SEC = 5;

/** Whether the end-of-game message is still owed (and marks it as shown). Kept per device, not in the save. */
function finishedUnseen(s: GameState): boolean {
  if (s.doneAt === undefined) return false;
  const key = `rebuild:done:${s.seed}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
  } catch { /* no storage: show it once per session */ }
  return true;
}

/** Runs `loadWorld` in a worker, so the title keeps animating (falls back to this thread if workers fail). */
function loadInWorker(save: SaveData | null, now: number, progress: (p: number) => void): Promise<Loaded> {
  return new Promise((resolve) => {
    const inline = () => resolve(loadWorld(save, now, progress));
    let worker: Worker;
    try {
      worker = new Worker(new URL('./load.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      inline();
      return;
    }
    worker.onmessage = (e: MessageEvent<{ progress?: number; done?: Loaded }>) => {
      if (e.data.progress !== undefined) progress(e.data.progress);
      if (e.data.done) resolve(e.data.done); // the worker closes itself once the map is stored
    };
    worker.onerror = (e) => { e.preventDefault(); worker.terminate(); inline(); };
    worker.postMessage({ save, now });
  });
}

export async function boot(app: HTMLElement, title: TitleScreen) {
  const saved = await loadGame();
  const loaded = await loadInWorker(saved ? serialize(saved.state, saved.savedAt) : null, Date.now(), (p) => title.progress(p));
  const state: GameState = deserialize(loaded.save as unknown as { v: number } & Record<string, unknown>).state;
  const world: World = loaded.world;
  const report: OfflineReport | null = loaded.report && { ...loaded.report, gold: D(loaded.report.gold) };
  /** On restart or import the current game must not be saved any more (pagehide would write it back). */
  let locked = false;
  const save = () => (locked ? Promise.resolve() : saveGame(state));
  /** Phase II has begun: phase I stops (its save stays as it was, for good). */
  let over = false;
  let voyageShown = false;
  /** Phase I is over: "The voyage" splash; a tap on it enters phase II, from what phase I achieved. */
  function voyage() {
    if (voyageShown) return;
    voyageShown = true;
    showVoyage(app, view.openMenu, () => {
      void save();
      over = true;
      locked = true;
      startPhase2(app, legacyOf(state, world, Date.now()), true);
    });
  }

  const view = createView(app, world, state, {
    buy: (id, rover) => {
      const bot = state.bots[rover];
      if (!bot) return;
      const before = stats(state, bot);
      if (!buy(state, world, id, 1, rover)) return;
      view.bought(id, levelOn(state, id, bot), before, stats(state, bot), bot.kind);
      void save();
    },
    claimGoal: (id) => {
      if (!claimGoal(state, world, id)) return;
      const g = goalById(id);
      view.toast(`${g.name} tier ${state.goals[id]}\n${g.rewardText} ×${fmt(goalBonus(state, g.reward))}`);
      void save();
    },
    digOrder: (order) => {
      if (state.digPick === order) return;
      chooseDig(state, world, order);
      view.toast(`Miner · ${order === 'rich' ? 'richest first' : 'behind the Scout'}${state.digOrder === order ? '' : '\nfrom the next ring'}`);
      void save();
    },
    build: (kind) => {
      if (!build(state, world, kind)) return;
      view.toast(`${kindById(kind).name} built!\nIt leaves camp now`);
      void save();
    },
    unlockRoute: (id) => {
      if (!unlockRoute(state, world, id)) return;
      view.toast(`Route unlocked: ${routeById(id)!.name}`);
      void save();
    },
    upgradeRoute: (id) => {
      if (!upgradeRoute(state, world, id)) return;
      const lv = routeLevel(state, id);
      view.toast(`${routeById(id)!.name} lv${lv}: less entropy${state.bots.some((b) => b.route === id) ? '\nfrom the next ring' : ''}`);
      void save();
    },
    chooseRoute: (id) => {
      if (!chooseRoute(state, id)) return;
      view.toast(`Scout · ${routeById(id)!.name}\nfrom the next ring`);
      void save();
    },
    craft: (id) => {
      const before = stats(state);
      if (!craft(state, world, id)) return;
      view.crafted(id, state.works[id], before, stats(state));
      void save();
    },
    buyDetector: () => {
      if (!buyDetector(state, world)) return;
      view.toast('Metal detector fitted\nthe rovers pick up metal scraps');
      void save();
    },
    buyDetectorUp: (id) => {
      if (!buyDetectorUp(state, id)) return;
      view.toast(`${DETECTOR_UPS.find((d) => d.id === id)!.name} Lv ${state.detUps[id]}\nmore metal scraps`);
      void save();
    },
    buildSection: (id) => {
      if (!buildSection(state, world, id)) return;
      view.toast(`${sectionById(id).name}\nbuilding…`);
      void save();
    },
    decoder: (on) => { if (setDecoder(state, world, on)) void save(); },
    zoom: (d) => { setZoom(state, state.zoom + d); },
    exportText: () => exportSave(serialize(state, Date.now())),
    importText: (text) => {
      // Save and reload: the imported game may have a different map (seed), or be a phase II game.
      importAny(text).then(() => { locked = true; location.reload(); }, () => view.toast('That text is not a valid game.'));
    },
    reset: () => { locked = true; void wipeAll().then(() => location.reload()); },
  });
  app.append(title.el); // the view replaced the page: keep the title on top until the player taps

  title.progress(1);
  // The game starts on the player's tap: on the title, and for a new game also on phase I's splash. Until then the
  // simulation waits (the time away was already simulated while loading).
  const started = title.ready().then(() => (loaded.fresh ? showArrival(app) : undefined));
  void started.then(() => {
    if (loaded.fresh) setTimeout(() => view.openHelp(), 300); // a new game, then the field notes
    // (once the game is over there is nothing to report, unless it ended while away)
    if (report && (state.doneAt === undefined || report.cells > 0)) view.showOffline(report);
    // Finished while away (or a save that was finished before the message existed): the tick that ends the map
    // sets `doneAt` without anyone to tell.
    // (then, or straight away if it was seen before, "The voyage" covers the game: phase I is over)
    if (new URLSearchParams(location.search).has('phase2')) startPhase2(app, legacyOf(state, world, Date.now()), false); // (a preview)
    else if (!loaded.fresh && state.doneAt !== undefined) { if (finishedUnseen(state)) view.showComplete(state, voyage); else voyage(); }
  });
  await cancelReminders();

  // The rate at the top is measured as the rovers produce. Until there is something to measure it starts from the
  // average while away (long enough to cover a few unloads) or, failing that, from the estimate.
  const meter = new RateMeter(report && report.seconds >= 600 ? report.gold.toNumber() / report.seconds : goldPerSec(state, world), carried(state));
  view.setRate(() => (state.doneAt === undefined ? meter.rate : 0)); // (nothing more to produce once the game is over)
  const handle = (ev: ReturnType<typeof tick>, now: number) => {
    const loot = stats(state).loot;
    for (const i of ev.specials) view.specialFound(i, fmt(world.value[i] * loot), now);
    for (const i of ev.items) view.itemFound(i, now);
    if (ev.deposited > 0) { view.deposited(fmt(ev.deposited), now); void save(); }
    for (const id of ev.built ?? []) { view.toast(`${sectionById(id).name} built!\nin the Library`); void save(); }
    if (ev.completed) { finishedUnseen(state); view.showComplete(state, voyage); void save(); }
    if (ev.zoomUnlocked) {
      view.toast(`New zoom: ${ZOOMS[ev.zoomUnlocked - 1].name}!`);
      setZoom(state, ev.zoomUnlocked - 1); // show the new view right away
      void save();
    }
  };

  // Fixed-step loop: the simulation advances at TICK_RATE regardless of the fps.
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    if (over) return;
    const dt = (now - last) / 1000;
    last = now;
    if (state.doneAt !== undefined) {
      // The game is over (the whole map explored and everything at camp): the simulation stops; only the view runs,
      // and the Library's Decoder, which may still have scraps to print.
      acc = 0;
      if (state.decoding >= 0 || state.decodeOn) decode(state, world, Math.min(dt, 3600) * view.gameSpeed());
      for (const id of buildSections(state, Math.min(dt, 3600) * view.gameSpeed())) { view.toast(`${sectionById(id).name} built!\nin the Library`); void save(); }
    } else if (dt > MAX_FRAME_SEC) {
      // The tab was frozen: simulate it in chunks, like offline time.
      const r = applyOffline(state, world, Date.now() - dt * 1000, Date.now());
      meter.reset(r && r.seconds >= 600 ? r.gold.toNumber() / r.seconds : meter.rate, carried(state));
    } else {
      // Test multiplier: game time runs faster (with longer ticks if needed, since the simulation is exact
      // per chunk and there is no need for thousands of ticks per frame).
      acc += dt * view.gameSpeed();
      const step = Math.max(TICK_SEC, acc / 20);
      while (acc >= step) {
        const ev = tick(state, world, step);
        meter.feed(step, ev.deposited, carried(state));
        handle(ev, now);
        acc -= step;
      }
    }
    view.render(state, now);
    requestAnimationFrame(frame);
  };
  void started.then(() => {
    last = performance.now();
    requestAnimationFrame(frame);
  });

  // New versions (each phase II session offers them on its own: this one is phase I's).
  const checkWeb = offerUpdates(title.ready(), () => { locked = true; return over ? Promise.resolve() : saveGame(state); });
  setInterval(() => void save(), AUTOSAVE_MS);

  onBackground((hidden) => {
    if (hidden) {
      void save();
      // Local notification in an hour: cancelled if the player comes back sooner.
      if (!over && goldPerSec(state, world) > 0) void scheduleReminder('Your rovers keep going', 'Come back and see what they have uncovered!', 3600);
    } else {
      void cancelReminders();
      checkWeb();
    }
  });
}

