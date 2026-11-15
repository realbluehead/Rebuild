// Phase I's hand-over to phase II: what the expedition achieved, as phase II's `Legacy` (all phase II ever sees of it).
import type { Legacy } from '../phase2/core/legacy';
import { explored, itemsCollected, loreFound, metalCollected } from './core/game';
import type { GameState } from './core/state';
import type { World } from './core/world';

export function legacyOf(s: GameState, w: World, now: number): Legacy {
  return {
    seed: s.seed,
    version: __APP_VERSION__,
    at: now,
    playTime: s.playTime,
    ...(s.doneAt !== undefined ? { doneAt: s.doneAt } : {}),
    bluetreri: s.gold.toString(),
    totalBluetreri: s.totalGold.toString(),
    metal: s.detectFrom >= 0 ? metalCollected(s, w) : 0,
    items: { ...s.items },
    collected: { ...itemsCollected(s, w) },
    works: { ...s.works },
    sheets: s.pages,
    lore: loreFound(s, w).length,
    cells: explored(s, w),
    rovers: s.bots.map((b) => b.kind),
  };
}
