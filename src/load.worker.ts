// Start-up worker: runs `loadWorld` off the main thread so the title screen keeps animating, with the map stored in
// IndexedDB (save/worldCache.ts). It stores the map again if it changed, then closes itself.
import { loadWorld, worldBuffers } from './load';
import type { SaveData } from './save/save';
import { worldCache } from './save/worldCache';

self.onmessage = async (e: MessageEvent<{ save: SaveData | null; now: number }>) => {
  const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  const cache = worldCache(__APP_BUILD__);
  const cached = await cache?.get().catch(() => undefined);
  const out = loadWorld(e.data.save, e.data.now, (p) => post({ progress: p }), cached, __APP_BUILD__);
  const entry = out.cache;
  // Copy the map into the cache first: after the hand-over below its buffers belong to the page.
  const written = entry && cache ? await cache.put(entry).catch(() => null) : null;
  post({ done: { ...out, cache: undefined } }, worldBuffers(out.world));
  await written?.committed.catch(() => {});
  self.close();
};
