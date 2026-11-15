// Entry point: put the title screen up first, then load the game code (a separate chunk per phase) behind it. A phase
// II save means phase I is over: phase II boots on its own and phase I's code and world are never loaded.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import '@fontsource/monoton/400.css';
import './shared/ui/style.css';
import { createTitle } from './shared/ui/title';
import { PHASE2_KEY } from './shared/keys';

// After a hard reload for a new version (platform/update.ts): tidy the address.
if (new URLSearchParams(location.search).has('v')) history.replaceState(null, '', location.pathname + location.hash);

const app = document.getElementById('app')!;
const title = createTitle();
app.replaceChildren(title.el);
title.progress(0.02);
const phase1 = () => import('./phase1/boot').then(({ boot }) => boot(app, title));
void import('./platform')
  .then(({ store }) => store.get(PHASE2_KEY))
  .then((p2) => (p2 ? import('./phase2/boot').then(({ boot }) => boot(app, title)) : false))
  .then((inPhase2) => { if (!inPhase2) void phase1(); });
