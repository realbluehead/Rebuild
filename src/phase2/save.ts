// Phase II's save, separate from phase I's (own key, own versions). Whenever `P2State` changes: bump P2_SAVE_VERSION,
// add the migration (vN -> vN+1) to MIGRATIONS and a test with a real old save.
// v1: the legacy and the resources brought over (metal, bluetreri, items), phase II's play time.
import { D } from '../shared/decimal';
import { PHASE2_BACKUP_KEY, PHASE2_KEY } from '../shared/keys';
import { store } from '../platform';
import type { Legacy, LegacyItem } from './core/legacy';
import type { P2State } from './core/state';

export const P2_SAVE_VERSION = 1;

/** JSON shape: Decimals as text. `phase` tells it apart from a phase I save (exported texts can be either). */
export interface P2SaveData {
  phase: 2;
  v: number;
  /** Save time (ms epoch). */
  savedAt: number;
  legacy: Legacy;
  metal: string;
  bluetreri: string;
  items: Record<LegacyItem, number>;
  playTime: number;
}

type RawP2 = { phase: 2; v: number } & Record<string, unknown>;

const MIGRATIONS: Record<number, (d: RawP2) => RawP2> = {};

export const isPhase2Save = (raw: unknown): raw is RawP2 =>
  typeof raw === 'object' && raw !== null && (raw as { phase?: unknown }).phase === 2;

export function serializeP2(s: P2State, now: number): P2SaveData {
  return {
    phase: 2,
    v: P2_SAVE_VERSION,
    savedAt: now,
    legacy: s.legacy,
    metal: s.metal.toString(),
    bluetreri: s.bluetreri.toString(),
    items: { ...s.items },
    playTime: s.playTime,
  };
}

/** Reads a phase II save (migrating it); throws if it is not one. */
export function deserializeP2(raw: unknown): { state: P2State; savedAt: number } {
  if (!isPhase2Save(raw)) throw new Error('Not a phase II save');
  let d = raw;
  if (d.v > P2_SAVE_VERSION) throw new Error(`Phase II save from a newer version (v${d.v})`);
  while (d.v < P2_SAVE_VERSION) d = { ...MIGRATIONS[d.v](d), v: d.v + 1 };
  const data = d as unknown as P2SaveData;
  if (!data.legacy || typeof data.legacy.seed !== 'number') throw new Error('Phase II save without its legacy');
  return {
    state: {
      legacy: data.legacy,
      metal: D(data.metal),
      bluetreri: D(data.bluetreri),
      items: { ...data.items },
      playTime: data.playTime ?? 0,
    },
    savedAt: data.savedAt,
  };
}

export async function savePhase2(s: P2State, now = Date.now()): Promise<void> {
  const prev = await store.get(PHASE2_KEY);
  if (prev) await store.set(PHASE2_BACKUP_KEY, prev);
  await store.set(PHASE2_KEY, JSON.stringify(serializeP2(s, now)));
}

/** Loads phase II; if the main copy is unreadable, tries the backup. */
export async function loadPhase2(): Promise<{ state: P2State; savedAt: number } | null> {
  for (const key of [PHASE2_KEY, PHASE2_BACKUP_KEY]) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      return deserializeP2(JSON.parse(raw));
    } catch (e) {
      console.error(`Unreadable phase II save ${key}`, e);
    }
  }
  return null;
}

export async function wipePhase2(): Promise<void> {
  await store.remove(PHASE2_KEY);
  await store.remove(PHASE2_BACKUP_KEY);
}
