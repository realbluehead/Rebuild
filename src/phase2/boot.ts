// Phase II, the game proper: loaded by main.ts when a phase II save exists, or started by phase I's boot when the player
// enters it from "The voyage" splash. Phase II never imports phase I: it starts from the `Legacy` phase I hands over.
import type { TitleScreen } from '../shared/ui/title';
import { confirmModal, h, modal, textModal } from '../shared/ui/dom';
import { encodeSave } from '../shared/codec';
import { offerUpdates } from '../shared/updates';
import { onBackground } from '../platform';
import { WORLD_CACHE_DB } from '../shared/keys';
import type { Legacy } from './core/legacy';
import { newPhase2, type P2State } from './core/state';
import { loadPhase2, savePhase2, serializeP2 } from './save';
import { showPhase2 } from './ui/phase2';

const AUTOSAVE_MS = 30_000;

/** Phase I's built map is no use any more: frees its storage (a reload of phase I, after an import, builds it again). */
function dropPhase1Map(): void {
  try { indexedDB.deleteDatabase(WORLD_CACHE_DB); } catch { /* no IndexedDB */ }
}
/** A longer frame (a frozen tab) is not counted as play time. */
const MAX_FRAME_SEC = 5;

/** Boots straight into phase II (main.ts, a phase II save exists). Returns false if no save could be read, so main.ts
 *  falls back to phase I (its save is still there). */
export async function boot(app: HTMLElement, title: TitleScreen): Promise<boolean> {
  const loaded = await loadPhase2();
  if (!loaded) return false;
  title.progress(1);
  dropPhase1Map();
  // New versions: after the title tap and whenever the game comes back to the foreground (entered from phase I, its
  // boot keeps doing this).
  const checkWeb = offerUpdates(title.ready(), () => savePhase2(loaded.state));
  run(app, loaded.state, true, checkWeb);
  app.append(title.el); // the screen went in under it: keep the title on top until the player taps
  return true;
}

/** Phase I's player enters phase II (from "The voyage"): it starts from `legacy`. `persist` false is a preview
 *  (`?phase2`): nothing is saved and the menu cannot import or restart. */
export function startPhase2(root: HTMLElement, legacy: Legacy, persist: boolean): void {
  const state = newPhase2(legacy);
  if (persist) { void savePhase2(state); dropPhase1Map(); }
  run(root, state, persist);
}

function run(root: HTMLElement, state: P2State, persist: boolean, onForeground: () => void = () => {}): void {
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
        void import('../saves').then(({ importAny }) => importAny(text)).then(
          () => reloadAfter(Promise.resolve()),
          () => { const e = modal(); e.box.append(h('div', '', 'That text is not a valid game.')); e.addClose('OK'); },
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

  const screen = showPhase2(root, state, openMenu);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (dt < MAX_FRAME_SEC) state.playTime += dt;
    screen.render(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setInterval(() => void save(), AUTOSAVE_MS);
  onBackground((hidden) => { if (hidden) void save(); else onForeground(); });
}
