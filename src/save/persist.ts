import { store } from '../platform';
import type { GameState } from '../core/state';
import { deserialize, serialize } from './save';

const KEY = 'rebuild:save';
const BACKUP_KEY = 'rebuild:save:backup';

export async function saveGame(s: GameState, now = Date.now()): Promise<void> {
  const prev = await store.get(KEY);
  if (prev) await store.set(BACKUP_KEY, prev);
  await store.set(KEY, JSON.stringify(serialize(s, now)));
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

export async function wipeGame(): Promise<void> {
  await store.remove(KEY);
  await store.remove(BACKUP_KEY);
}
