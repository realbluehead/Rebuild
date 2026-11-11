// Update check for the APK distributed through GitHub Releases (not needed on the web: the service
// worker updates itself). The GitHub API allows CORS and needs no token.
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
