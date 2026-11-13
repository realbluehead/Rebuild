// The game proper, loaded by main.ts once the title screen is up.
import { claimGoal, goalBonus, build, buy, levelOn, chooseRoute, craft, routeLevel, unlockRoute, upgradeRoute, goldPerSec, setZoom, stats, TICK_SEC, tick } from './core/game';
import type { GameState } from './core/state';
import type { World } from './core/world';
import { D } from './core/decimal';
import { fmt } from './core/format';
import { ZOOMS } from './content/world';
import { routeById } from './content/routes';
import { kindById } from './content/upgrades';
import { goalById } from './content/goals';
import { applyOffline, type OfflineReport } from './save/offline';
import { loadGame, saveGame, wipeGame } from './save/persist';
import { deserialize, exportSave, importSave, serialize, type SaveData } from './save/save';
import { cancelReminders, onBackground, scheduleReminder } from './platform';
import { checkForUpdate, checkWebUpdate, hardReload } from './platform/update';
import { createView } from './ui/view';
import type { TitleScreen } from './ui/title';
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
    zoom: (d) => { setZoom(state, state.zoom + d); },
    exportText: () => exportSave(serialize(state, Date.now())),
    importText: (text) => {
      try {
        // Save and reload: the imported game may have a different map (seed).
        const imported = deserialize(importSave(text)).state;
        locked = true;
        void saveGame(imported).then(() => location.reload());
      } catch {
        view.toast('That text is not a valid game.');
      }
    },
    reset: () => { locked = true; void wipeGame().then(() => location.reload()); },
  });
  app.append(title.el); // the view replaced the page: keep the title on top until the player taps

  title.progress(1);
  // Messages wait for the tap (the game already runs behind the title, see below).
  void title.ready().then(() => {
    if (loaded.fresh) setTimeout(() => view.openHelp(), 300);
    if (report) view.showOffline(report);
    // Finished while away (or a save that was finished before the message existed): the tick that ends the map
    // sets `doneAt` without anyone to tell.
    if (!loaded.fresh && finishedUnseen(state)) view.showComplete(state);
  });
  await cancelReminders();

  const handle = (ev: ReturnType<typeof tick>, now: number) => {
    const loot = stats(state).loot;
    for (const i of ev.specials) view.specialFound(i, fmt(world.value[i] * loot), now);
    for (const i of ev.items) view.itemFound(i, now);
    if (ev.deposited > 0) { view.deposited(fmt(ev.deposited), now); void save(); }
    if (ev.completed) { finishedUnseen(state); view.showComplete(state); void save(); }
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
    const dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME_SEC) {
      // The tab was frozen: simulate it in chunks, like offline time.
      applyOffline(state, world, Date.now() - dt * 1000, Date.now());
    } else {
      // Test multiplier: game time runs faster (with longer ticks if needed, since the simulation is exact
      // per chunk and there is no need for thousands of ticks per frame).
      acc += dt * view.gameSpeed();
      const step = Math.max(TICK_SEC, acc / 20);
      while (acc >= step) {
        handle(tick(state, world, step), now);
        acc -= step;
      }
    }
    view.render(state, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  void checkForUpdate().then((u) => {
    // Opening the APK URL outside the WebView makes Android download it and offer to install it.
    if (u) view.showUpdate(u.version, u.notes, () => { location.href = u.apkUrl; });
  });
  // A newer web build: offer a hard reload, on opening (after the tap) and on coming back to the game. Each build is
  // offered once per session.
  let offered = '';
  const checkWeb = () => void checkWebUpdate().then((u) => {
    if (!u || u.build === offered) return;
    offered = u.build;
    view.showReload(u.version, u.build, () => { locked = true; void saveGame(state).then(() => hardReload(u.build)); });
  });
  void title.ready().then(checkWeb);
  setInterval(() => void save(), AUTOSAVE_MS);

  onBackground((hidden) => {
    if (hidden) {
      void save();
      // Local notification in an hour: cancelled if the player comes back sooner.
      if (goldPerSec(state, world) > 0) void scheduleReminder('Your rovers keep going', 'Come back and see what they have uncovered!', 3600);
    } else {
      void cancelReminders();
      checkWeb();
    }
  });
}

