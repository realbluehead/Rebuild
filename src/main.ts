import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './ui/style.css';
import { buy, craft, fromLegacy, goldPerSec, setZoom, stats, TICK_SEC, tick } from './core/game';
import { newGame, type GameState } from './core/state';
import { createWorld, goldBetween, type World } from './core/world';
import { fmt } from './core/format';
import { ZOOMS } from './content/world';
import { applyOffline } from './save/offline';
import { loadGame, saveGame, wipeGame } from './save/persist';
import { deserialize, exportSave, importSave, serialize } from './save/save';
import { cancelReminders, onBackground, scheduleReminder } from './platform';
import { checkForUpdate } from './platform/update';
import { createView } from './ui/view';

const AUTOSAVE_MS = 30_000;
/** Si la pestanya ha estat parada més d'això, es tracta com a temps offline. */
const MAX_FRAME_SEC = 5;

const app = document.getElementById('app')!;

async function boot() {
  app.innerHTML = '<div class="splash">Building the world…</div>';
  await new Promise((r) => setTimeout(r, 30)); // que es pinti el missatge abans de la feina

  const loaded = await loadGame();
  const state: GameState = loaded?.state ?? newGame();
  const world: World = createWorld(state.seed);
  fromLegacy(state, world); // partides d'abans dels robots independents
  /** Quan es reinicia o s'importa, la partida actual ja no s'ha de desar (el pagehide la tornaria a escriure). */
  let locked = false;
  const save = () => (locked ? Promise.resolve() : saveGame(state));

  const view = createView(app, world, state, {
    buy: (id) => { if (buy(state, id)) void save(); },
    craft: (id) => { if (craft(state, id)) { view.crafted(id, state.works[id]); void save(); } },
    zoom: (d) => { setZoom(state, state.zoom + d); },
    exportText: () => exportSave(serialize(state, Date.now())),
    importText: (text) => {
      try {
        // Es desa i es recarrega: la partida importada pot tenir un altre mapa (seed).
        const imported = deserialize(importSave(text)).state;
        locked = true;
        void saveGame(imported).then(() => location.reload());
      } catch {
        alert('That text is not a valid game.');
      }
    },
    reset: () => { locked = true; void wipeGame().then(() => location.reload()); },
  });

  if (!loaded) setTimeout(() => view.openHelp(), 300); // quan ja s'ha dibuixat un cop (l'ajuda llegeix l'estat)
  if (loaded) {
    const report = applyOffline(state, world, loaded.savedAt, Date.now());
    if (report) view.showOffline(report);
  }
  await cancelReminders();

  const handle = (ev: ReturnType<typeof tick>, now: number) => {
    const loot = stats(state).loot;
    for (const r of ev.specials) view.specialFound(r, fmt(goldBetween(world, r, r + 1) * loot), now);
    for (const r of ev.items) view.itemFound(r, now);
    if (ev.deposited > 0) { view.deposited(fmt(ev.deposited), now); void save(); }
    if (ev.zoomUnlocked) {
      view.toast(`New zoom: ${ZOOMS[ev.zoomUnlocked - 1].name}!`);
      setZoom(state, ev.zoomUnlocked - 1); // ensenyem de seguida la vista nova
      void save();
    }
  };

  // Bucle de pas fix: la simulació avança a TICK_RATE independentment dels fps.
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME_SEC) {
      // La pestanya ha estat congelada: ho simulem per trams com l'offline.
      applyOffline(state, world, Date.now() - dt * 1000, Date.now());
    } else {
      // Multiplicador de prova: el temps de joc corre més de pressa (amb ticks més llargs si cal, perquè
      // la simulació és exacta per trams i no cal fer-ne milers per frame).
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
    // Obrir la URL de l'APK fora del WebView fa que Android el descarregui i ofereixi instal·lar-lo.
    if (u) view.showUpdate(u.version, u.notes, () => { location.href = u.apkUrl; });
  });
  setInterval(() => void save(), AUTOSAVE_MS);

  onBackground((hidden) => {
    if (hidden) {
      void save();
      // Avís local d'aquí a una hora: s'anul·la si el jugador torna abans.
      if (goldPerSec(state, world) > 0) void scheduleReminder('Your rovers keep going', 'Come back and see what they have uncovered!', 3600);
    } else {
      void cancelReminders();
    }
  });
}

void boot();
