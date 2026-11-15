// What phase I hands over to phase II: everything the expedition achieved, frozen when the player enters phase II. Phase
// II starts from this alone and never reads phase I's state, world or code (phase I builds it: `legacyOf` in
// phase1/legacy.ts).

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
