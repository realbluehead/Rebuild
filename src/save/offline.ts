import { D, Decimal } from '../core/decimal';
import { explored, tick } from '../core/game';
import type { GameState } from '../core/state';
import type { World } from '../core/world';

/** Màxim de temps offline que es compta (segons). */
export const OFFLINE_CAP_SEC = 24 * 3600;
/** Mida de cada tram de simulació offline: prou petit perquè les mecàniques no lineals siguin correctes. */
const CHUNK_SEC = 60;

export interface OfflineReport {
  seconds: number;
  gold: Decimal;
  cells: number;
  specials: number;
  /** Pàgines, notes i fotos recollides. */
  items: number;
  zoomUnlocked?: number;
}

/** Simula el temps que el jugador no hi era. Retorna null si és massa poc per ensenyar-ho. */
export function applyOffline(s: GameState, w: World, savedAt: number, now: number): OfflineReport | null {
  const seconds = Math.min(Math.max(0, (now - savedAt) / 1000), OFFLINE_CAP_SEC);
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
