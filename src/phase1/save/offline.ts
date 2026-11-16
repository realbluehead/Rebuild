import { D, Decimal } from '../../shared/decimal';
import { explored, tick } from '../core/game';
import type { GameState } from '../core/state';
import type { World } from '../core/world';

/** Longest offline time that counts (seconds). */
export const OFFLINE_CAP_SEC = 24 * 3600;
/** Size of each offline simulation chunk: small enough for the non-linear mechanics to stay correct. */
const CHUNK_SEC = 60;

export interface OfflineReport {
  seconds: number;
  gold: Decimal;
  cells: number;
  specials: number;
  /** Pages, notes and photos collected. */
  items: number;
  zoomUnlocked?: number;
}

/** Simulates the time the player was away. Returns null if it is too little to be worth showing. */
export function applyOffline(s: GameState, w: World, savedAt: number, now: number): OfflineReport | null {
  const away = (now - savedAt) / 1000; // (a clock set back, or a broken save time: nothing to simulate)
  const seconds = Number.isFinite(away) ? Math.min(Math.max(0, away), OFFLINE_CAP_SEC) : 0;
  if (seconds < 10) {
    tick(s, w, seconds);
    return null;
  }
  const gold0 = D(s.totalGold);
  const cells0 = explored(s, w);
  const report: OfflineReport = { seconds, gold: D(0), cells: 0, specials: 0, items: 0 };
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(CHUNK_SEC, left);
    const ev = tick(s, w, dt);
    report.specials += ev.specials.length;
    report.items += ev.items.length;
    if (ev.zoomUnlocked) report.zoomUnlocked = ev.zoomUnlocked;
    left -= dt;
  }
  report.gold = s.totalGold.sub(gold0);
  report.cells = explored(s, w) - cells0;
  return report;
}
