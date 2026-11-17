// Phase II, the game proper: loaded by main.ts when a phase II save exists, or started by phase I's boot when the player
// enters it from "The voyage" splash. Phase II never imports phase I: it starts from the `Legacy` phase I hands over.
import type { TitleScreen } from '../shared/ui/title';
import { confirmModal, h, modal, textModal } from '../shared/ui/dom';
import { encodeSave } from '../shared/codec';
import { offerUpdates } from '../shared/updates';
import { onBackground } from '../platform';
import { WORLD_CACHE_DB } from '../shared/keys';
import type { Legacy } from './core/legacy';
import { advance } from './core/advance';
import { awaySummary, AWAY_MIN_SEC, snap } from './core/away';
import { aimFirst } from './core/economy';
import { newPhase2, type P2State } from './core/state';
import { loadPhase2, savePhase2, serializeP2 } from './save';
import { showAway } from './ui/away';
import { showPhase2 } from './ui/phase2';

const AUTOSAVE_MS = 30_000;

/** Phase I's built map is no use any more: frees its storage (a reload of phase I, after an import, builds it again). */
function dropPhase1Map(): void {
  try { indexedDB.deleteDatabase(WORLD_CACHE_DB); } catch { /* no IndexedDB */ }
}

/** Boots straight into phase II (main.ts, a phase II save exists). Returns false if no save could be read, so main.ts
 *  falls back to phase I (its save is still there). */
export async function boot(app: HTMLElement, title: TitleScreen): Promise<boolean> {
  const loaded = await loadPhase2();
  if (!loaded) return false;
  // Time away runs exactly (core/advance.ts); after a while away, a report once the title is tapped.
  const away = Math.max(0, (Date.now() - loaded.savedAt) / 1000);
  const before = snap(loaded.state);
  advance(loaded.state, away);
  if (away >= AWAY_MIN_SEC) {
    const summary = awaySummary(before, loaded.state);
    void title.ready().then(() => showAway(away, summary, loaded.state));
  }
  title.progress(1);
  dropPhase1Map();
  // New versions: after the title tap and whenever the game comes back to the foreground (entered from phase I, its
  // boot keeps doing this).
  const checkWeb = offerUpdates(title.ready(), () => savePhase2(loaded.state));
  run(app, loaded.state, true, checkWeb);
  app.append(title.el); // the screen went in under it: keep the title on top until the player taps
  return true;
}

/** `/phase2` in the address (main.ts): phase II straight away from a sample legacy (`dev/sample-legacy.json`, the end
 *  of a whole simulated game: `LEGACY=… npm run sim`), to try it without playing phase I. A preview: nothing is saved
 *  and no save is read or touched (phase I's map cache included). */
export async function bootSample(app: HTMLElement, title: TitleScreen): Promise<void> {
  const { default: sample } = await import('./dev/sample-legacy.json');
  title.progress(1);
  // New versions too (nothing to save first: a preview).
  const checkWeb = offerUpdates(title.ready(), () => Promise.resolve());
  run(app, newPhase2({ ...(sample as Legacy), at: Date.now() }), false, checkWeb);
  app.append(title.el); // (on top until the player taps)
}

/** Phase I's player enters phase II (from "The voyage"): it starts from `legacy`. `persist` false is a preview
 *  (`?phase2`): nothing is saved and the menu cannot import or restart. */
export function startPhase2(root: HTMLElement, legacy: Legacy, persist: boolean): void {
  const state = newPhase2(legacy);
  if (persist) { void savePhase2(state); dropPhase1Map(); }
  run(root, state, persist);
}

function run(root: HTMLElement, state: P2State, persist: boolean, onForeground: () => void = () => {}): void {
  aimFirst(state); // (the probes start at once on a new expedition, or one that never aimed them)
  if (import.meta.env.DEV && !persist) (window as unknown as { __p2: P2State }).__p2 = state; // (the preview's state, to poke in the console)
  /** On restart or import this game must not be saved any more (pagehide would write it back). */
  let locked = !persist;
  const save = () => (locked ? Promise.resolve() : savePhase2(state));

  const reloadAfter = (p: Promise<void>) => { locked = true; void p.then(() => location.reload()); };
  const openMenu = () => {
    const m = modal();
    m.box.append(h('div', 'name', 'Menu'));
    const item = (label: string, cls: string, fn: () => void) => {
      const b = h('button', `px-btn ${cls}`, label);
      b.addEventListener('click', () => { m.close(); fn(); });
      m.box.append(b);
    };
    item('Export game', '', () => textModal('Copy this text to save your game:', encodeSave(serializeP2(state, Date.now())), true));
    if (persist) {
      item('Import game', '', () => textModal('Paste an exported game:', '', false, (text) => {
        locked = true; // (no autosave may land on top of the imported game)
        void import('../saves').then(({ importAny }) => importAny(text)).then(
          () => location.reload(),
          () => { locked = false; const e = modal(); e.box.append(h('div', '', 'That text is not a valid game.')); e.addClose('OK'); },
        );
      }));
      item('Restart (new map)', 'danger', () => confirmModal('Erase this game (both phases) and start a new map?', 'Erase and restart', () => {
        try { localStorage.removeItem('rebuild:help-seen'); } catch { /* no storage */ }
        reloadAfter(import('../saves').then(({ wipeAll }) => wipeAll()));
      }));
    } else {
      m.box.append(h('div', 'info', 'Preview: nothing is saved.'));
    }
    m.box.append(h('div', 'info', `Version ${__APP_VERSION__} · build ${__APP_BUILD__}`));
    m.addClose('Close');
  };

  const screen = showPhase2(root, state, openMenu, () => void save());
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    // (a frozen or hidden tab catches up on the next frame, with the report if it was long)
    const long = dt >= AWAY_MIN_SEC ? snap(state) : null;
    advance(state, dt * screen.speed());
    if (long) showAway(dt, awaySummary(long, state), state);
    screen.render(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setInterval(() => void save(), AUTOSAVE_MS);
  onBackground((hidden) => { if (hidden) void save(); else onForeground(); });
}
