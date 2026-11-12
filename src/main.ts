import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './ui/style.css';
import { buy, chooseRoute, craft, fromLegacy, routeLevel, unlockRoute, upgradeRoute, goldPerSec, setZoom, stats, TICK_SEC, tick } from './core/game';
import { newGame, type GameState } from './core/state';
import { applyPlan, createWorld, type World } from './core/world';
import { fmt } from './core/format';
import { ZOOMS } from './content/world';
import { routeById } from './content/routes';
import { applyOffline } from './save/offline';
import { loadGame, saveGame, wipeGame } from './save/persist';
import { deserialize, exportSave, importSave, serialize } from './save/save';
import { cancelReminders, onBackground, scheduleReminder } from './platform';
import { checkForUpdate } from './platform/update';
import { createView } from './ui/view';

const AUTOSAVE_MS = 30_000;
/** If the tab was frozen for longer than this, it is treated as offline time. */
const MAX_FRAME_SEC = 5;

const app = document.getElementById('app')!;

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

async function boot() {
  app.innerHTML = '<div class="splash">Building the world…</div>';
  await new Promise((r) => setTimeout(r, 30)); // let the message paint before the work

  const loaded = await loadGame();
  const state: GameState = loaded?.state ?? newGame();
  const world: World = createWorld(state.seed);
  applyPlan(world, state.plan); // the routes the rovers have followed so far
  fromLegacy(state, world); // saves from before independent rovers
  /** On restart or import the current game must not be saved any more (pagehide would write it back). */
  let locked = false;
  const save = () => (locked ? Promise.resolve() : saveGame(state));

  const view = createView(app, world, state, {
    buy: (id) => {
      const before = stats(state);
      if (!buy(state, world, id)) return;
      view.bought(id, state.upgrades[id], before, stats(state));
      void save();
    },
    unlockRoute: (id) => {
      if (!unlockRoute(state, id)) return;
      view.toast(`Route unlocked: ${routeById(id)!.name}`);
      void save();
    },
    upgradeRoute: (id) => {
      if (!upgradeRoute(state, id)) return;
      const lv = routeLevel(state, id);
      view.toast(`${routeById(id)!.name} lv${lv}: less entropy${state.route === id ? '\nfrom the next ring' : ''}`);
      void save();
    },
    chooseRoute: (id) => {
      if (!chooseRoute(state, id)) return;
      view.toast(`Route: ${routeById(id)!.name}\nfrom the next ring`);
      void save();
    },
    craft: (id) => {
      const before = stats(state);
      if (!craft(state, id)) return;
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

  if (!loaded) setTimeout(() => view.openHelp(), 300); // once it has been drawn once (the notes read the state)
  if (loaded) {
    const report = applyOffline(state, world, loaded.savedAt, Date.now());
    if (report) view.showOffline(report);
    // Finished while away (or a save that was finished before the message existed): the tick that ends the map
    // sets `doneAt` without anyone to tell.
    if (finishedUnseen(state)) view.showComplete(state);
  }
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
  setInterval(() => void save(), AUTOSAVE_MS);

  onBackground((hidden) => {
    if (hidden) {
      void save();
      // Local notification in an hour: cancelled if the player comes back sooner.
      if (goldPerSec(state, world) > 0) void scheduleReminder('Your rovers keep going', 'Come back and see what they have uncovered!', 3600);
    } else {
      void cancelReminders();
    }
  });
}

void boot();
