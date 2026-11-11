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

/** Carrega la partida; si la principal és corrupta prova la còpia. */
export async function loadGame(): Promise<{ state: GameState; savedAt: number } | null> {
  for (const key of [KEY, BACKUP_KEY]) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      return deserialize(JSON.parse(raw));
    } catch (e) {
      console.error(`Partida ${key} il·legible`, e);
    }
  }
  return null;
}

export async function wipeGame(): Promise<void> {
  await store.remove(KEY);
  await store.remove(BACKUP_KEY);
}
