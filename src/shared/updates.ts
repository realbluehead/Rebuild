// New versions, offered the same way in both phases: the APK on Android, a hard reload for a newer web build.
import { checkForUpdate, checkWebUpdate, hardReload } from '../platform/update';
import { h, modal } from './ui/dom';

/** Checks for a new version once `ready` resolves (after the title tap). A newer web build is offered once per build and
 *  session; "Reload now" runs `saveFirst` and then reloads. Returns the web check, to run again whenever the game comes
 *  back to the foreground. */
export function offerUpdates(ready: Promise<unknown>, saveFirst: () => Promise<void>): () => void {
  void checkForUpdate().then((u) => {
    if (!u) return;
    // Opening the APK URL outside the WebView makes Android download it and offer to install it.
    const m = modal();
    m.box.append(h('div', 'name', `New version: ${u.version}`), h('div', 'info', u.notes));
    m.addClose('Download', () => { location.href = u.apkUrl; });
    m.addClose('Later');
  });
  let offered = '';
  const checkWeb = () => void checkWebUpdate().then((u) => {
    if (!u || u.build === offered) return;
    offered = u.build;
    const m = modal();
    m.box.append(
      h('div', 'name', 'New version available'),
      h('div', 'info', `Version ${u.version} · build ${u.build}`),
      h('div', 'info', `(you have ${__APP_VERSION__} · build ${__APP_BUILD__})`),
      h('div', '', 'Reload to get it. Your game is saved first.'),
    );
    m.addClose('Reload now', () => void saveFirst().then(() => hardReload(u.build)));
    m.addClose('Later');
  });
  void ready.then(checkWeb);
  return checkWeb;
}
