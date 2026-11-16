// What phase I hands over to phase II: everything the expedition achieved, frozen when the player enters phase II. Phase
// II starts from this alone and never reads phase I's state, world or code (phase I builds it: `legacyOf` in
// phase1/legacy.ts).
import { amount } from '../../shared/decimal';

export type LegacyItem = 'page' | 'note' | 'photo';
export type LegacyWork = 'book' | 'cd' | 'album';
export type LegacyRover = 'scout' | 'miner' | 'hauler';

export interface Legacy {
  /** Phase I's map seed and the game version it was played to. */
  seed: number;
  version: string;
  /** When phase II began (ms epoch), and phase I's play time (seconds) and when it ended (play time; unset if phase II
   *  was entered without finishing, e.g. the `?phase2` preview). */
  at: number;
  playTime: number;
  doneAt?: number;
  /** Bluetreri at camp, unspent, and all ever earned (Decimal as text). */
  bluetreri: string;
  totalBluetreri: string;
  /** Metal scraps the detector picked up. */
  metal: number;
  /** Items at hand (not spent on works) and all collected. */
  items: Record<LegacyItem, number>;
  collected: Record<LegacyItem, number>;
  /** Works made (books, records, discoveries). */
  works: Record<LegacyWork, number>;
  /** Sheets of the planet's history the Decoder printed, and scraps of lore found. */
  sheets: number;
  lore: number;
  /** Cells of the planet explored, and the rovers built. */
  cells: number;
  rovers: LegacyRover[];
}

const ITEMS: LegacyItem[] = ['page', 'note', 'photo'];
const WORKS: LegacyWork[] = ['book', 'cd', 'album'];
const ROVERS: LegacyRover[] = ['scout', 'miner', 'hauler'];
/** A count or time read back: finite and not negative (else 0). */
const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
const counts = <K extends string>(keys: K[], raw: unknown): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, Math.floor(count((raw as Record<string, unknown> | null)?.[k]))])) as Record<K, number>;
/** An amount as text (a Decimal), read back: a finite, non-negative one, else "0". */
const decText = (x: unknown): string => {
  if (typeof x !== 'string') return '0';
  const d = amount(x); // (garbage reads as 0)
  return d.gt(0) || /^0*\.?0*$/.test(x) ? x : '0';
};

/** A legacy read back from a save or an import, every field checked (a missing or broken one gets a harmless default).
 *  Throws if it is not a legacy at all (no seed). */
export function cleanLegacy(raw: unknown): Legacy {
  const r = raw as Partial<Record<keyof Legacy, unknown>> | null;
  if (!r || typeof r !== 'object' || typeof r.seed !== 'number' || !Number.isFinite(r.seed)) throw new Error('Not a legacy');
  return {
    seed: r.seed,
    version: typeof r.version === 'string' ? r.version : '?',
    at: count(r.at),
    playTime: count(r.playTime),
    ...(r.doneAt !== undefined ? { doneAt: count(r.doneAt) } : {}),
    bluetreri: decText(r.bluetreri),
    totalBluetreri: decText(r.totalBluetreri),
    metal: Math.floor(count(r.metal)),
    items: counts(ITEMS, r.items),
    collected: counts(ITEMS, r.collected),
    works: counts(WORKS, r.works),
    sheets: Math.floor(count(r.sheets)),
    lore: Math.floor(count(r.lore)),
    cells: Math.floor(count(r.cells)),
    rovers: Array.isArray(r.rovers) ? r.rovers.filter((x): x is LegacyRover => ROVERS.includes(x as LegacyRover)) : [],
  };
}

/** The items brought over, read back (each a whole count, not negative). */
export const cleanItems = (raw: unknown): Record<LegacyItem, number> => counts(ITEMS, raw);
