// Update checks. The APK is distributed through GitHub Releases (the GitHub API allows CORS and needs no token). On the
// web each build publishes version.json: if its build differs from the one running, a newer one is out, and a hard
// reload (no service worker, no caches) picks it up.
import { isNative } from '.';

export const GITHUB_REPO = 'realbluehead/Rebuild';

export interface UpdateInfo {
  version: string;
  apkUrl: string;
  notes: string;
}

/** a > b for simple semver versions (1.2.3). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export async function checkForUpdate(current = __APP_VERSION__): Promise<UpdateInfo | null> {
  if (!isNative) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!res.ok) return null;
    const rel = await res.json();
    const apk = rel.assets?.find((a: { name: string }) => a.name.endsWith('.apk'));
    if (!apk || !isNewer(rel.tag_name, current)) return null;
    return { version: rel.tag_name.replace(/^v/, ''), apkUrl: apk.browser_download_url, notes: rel.body ?? '' };
  } catch {
    return null; // offline: we will check again next time
  }
}

export interface WebBuild { version: string; build: string }

/** The newer web build on the server, or null (same build, native app, dev server or offline). */
export async function checkWebUpdate(current = __APP_BUILD__): Promise<WebBuild | null> {
  if (isNative || current === 'dev') return null;
  try {
    const res = await fetch(`${new URL('version.json', document.baseURI).href}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' && data.build !== current ? { version: String(data.version ?? ''), build: data.build } : null;
  } catch {
    return null;
  }
}

/** Drops the service worker and its caches and loads the page again from the network (the query skips the HTTP cache
 *  of index.html; main.ts removes it). */
export async function hardReload(build: string): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* reload anyway */ }
  const url = new URL(location.href);
  url.searchParams.set('v', build);
  location.replace(url.href);
}
