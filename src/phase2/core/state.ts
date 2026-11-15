// Phase II's state. It starts from phase I's `Legacy` (kept as it was, for reference) and the resources it hands over.
import { D, type Decimal } from '../../shared/decimal';
import type { Legacy, LegacyItem } from './legacy';

export interface P2State {
  /** What phase I achieved, as it was when phase II began (never changed). */
  legacy: Legacy;
  /** Metal scraps: phase II's currency. */
  metal: Decimal;
  /** Bluetreri and items brought over from phase I, to spend in phase II. */
  bluetreri: Decimal;
  items: Record<LegacyItem, number>;
  /** Play time in phase II, in seconds. */
  playTime: number;
}

/** Phase II's start: phase I's resources at hand. */
export function newPhase2(legacy: Legacy): P2State {
  return {
    legacy,
    metal: D(legacy.metal),
    bluetreri: D(legacy.bluetreri),
    items: { ...legacy.items },
    playTime: 0,
  };
}
