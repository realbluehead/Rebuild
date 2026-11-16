import { store } from '../../platform';
import type { GameState } from '../core/state';
import { deserialize, serialize } from './save';

const KEY = 'rebuild:save';
const BACKUP_KEY = 'rebuild:save:backup';

/** Writes run one after another, in the order asked (an autosave and a background save at once used to interleave
 *  their reads and writes; a wipe could land before a save still on its way and be undone by it). */
let queue: Promise<unknown> = Promise.resolve();
const queued = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
};

/** Saves the game as it is now (serialised at once, written in turn), keeping the previous save as the backup. */
export function saveGame(s: GameState, now = Date.now()): Promise<void> {
  const text = JSON.stringify(serialize(s, now));
  return queued(async () => {
    const prev = await store.get(KEY);
    if (prev) await store.set(BACKUP_KEY, prev);
    await store.set(KEY, text);
  });
}

/** Loads the game; if the main copy is corrupt, tries the backup. */
export async function loadGame(): Promise<{ state: GameState; savedAt: number } | null> {
  for (const key of [KEY, BACKUP_KEY]) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      return deserialize(JSON.parse(raw));
    } catch (e) {
      console.error(`Unreadable save ${key}`, e);
    }
  }
  return null;
}

export function wipeGame(): Promise<void> {
  return queued(async () => {
    await store.remove(KEY);
    await store.remove(BACKUP_KEY);
  });
}
