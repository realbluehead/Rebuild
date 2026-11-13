// Start-up worker: runs `loadWorld` off the main thread so the title screen keeps animating.
import { loadWorld, worldBuffers } from './load';
import type { SaveData } from './save/save';

self.onmessage = (e: MessageEvent<{ save: SaveData | null; now: number }>) => {
  const out = loadWorld(e.data.save, e.data.now, (p) => self.postMessage({ progress: p }));
  (self as unknown as Worker).postMessage({ done: out }, worldBuffers(out.world));
};
