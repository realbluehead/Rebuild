// The built map (`World`) kept in IndexedDB, so opening the game does not regenerate it and replay every route: only the
// routes taken since it was stored are applied (see `loadWorld`). It holds one map (tens of MB), and is tied to the build
// that made it, since a new build may generate maps differently.
import type { World } from '../core/world';

export interface CachedWorld {
  build: string;
  seed: number;
  size: number;
  /** The plan entries (as JSON) already applied to `world`. */
  plan: string[];
  world: World;
}

const DB = 'rebuild-world';
const STORE = 'world';
const KEY = 'current';

export interface WorldCache {
  /** The stored map, if it was made by this build. */
  get(): Promise<CachedWorld | undefined>;
  /** Stores `entry`, replacing the previous one. The map is copied before this resolves (so its buffers may be handed
   *  over right after); `committed` settles once the write is done. */
  put(entry: CachedWorld): Promise<{ committed: Promise<void> }>;
}

/** The cache for this build, or null where there is none (dev server: the code changes under the same id; no IndexedDB). */
export function worldCache(build: string): WorldCache | null {
  if (build === 'dev' || typeof indexedDB === 'undefined') return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = () => (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  return {
    async get() {
      const d = await open();
      const entry = await new Promise<CachedWorld | undefined>((resolve, reject) => {
        const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result as CachedWorld | undefined);
        req.onerror = () => reject(req.error);
      });
      return entry?.build === build ? entry : undefined;
    },
    async put(entry) {
      const d = await open();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry, KEY); // the structured clone happens here, synchronously
      const committed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return { committed };
    },
  };
}
