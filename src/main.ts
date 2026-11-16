// Entry point: put the title screen up first, then load the game code (a separate chunk per phase) behind it. A phase
// II save means phase I is over: phase II boots on its own and phase I's code and world are never loaded.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import '@fontsource/monoton/400.css';
import './shared/ui/style.css';
import { createTitle } from './shared/ui/title';
import { PHASE2_BACKUP_KEY, PHASE2_KEY } from './shared/keys';

// After a hard reload for a new version (platform/update.ts): tidy the address.
if (new URLSearchParams(location.search).has('v')) history.replaceState(null, '', location.pathname + location.hash);

const app = document.getElementById('app')!;
const title = createTitle();
app.replaceChildren(title.el);
title.progress(0.02);
const phase1 = () => import('./phase1/boot').then(({ boot }) => boot(app, title));
/** Loading failed (a chunk that will not download, storage that will not answer): say so; a tap tries again. */
const failed = (e: unknown) => {
  console.error('Loading failed', e);
  const note = document.createElement('div');
  note.className = 'load-failed';
  note.textContent = 'Loading failed. Tap to try again.';
  note.addEventListener('click', () => location.reload());
  title.el.append(note);
};
// `/phase2` at the end of the address: phase II from a sample game (a preview; no save is read or written).
if (/\/phase2\/?$/.test(location.pathname)) void import('./phase2/boot').then(({ bootSample }) => bootSample(app, title)).catch(failed);
// Phase II if either of its saves is there (main or backup); if it cannot boot, phase I (its save is untouched).
else void import('./platform')
  .then(async ({ store }) => (await store.get(PHASE2_KEY)) ?? (await store.get(PHASE2_BACKUP_KEY)))
  .then((p2) => (p2 ? import('./phase2/boot').then(({ boot }) => boot(app, title)) : false))
  .catch((e: unknown) => { console.error('Phase II could not boot', e); return false; })
  .then((inPhase2) => (inPhase2 ? undefined : phase1()))
  .catch(failed);
