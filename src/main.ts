// Entry point: put the title screen up first, then load the game code (a separate chunk) and the world behind it.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import '@fontsource/monoton/400.css';
import './ui/style.css';
import { createTitle } from './ui/title';

// After a hard reload for a new version (platform/update.ts): tidy the address.
if (new URLSearchParams(location.search).has('v')) history.replaceState(null, '', location.pathname + location.hash);

const app = document.getElementById('app')!;
const title = createTitle();
app.replaceChildren(title.el);
title.progress(0.02);
void import('./boot').then(({ boot }) => boot(app, title));
