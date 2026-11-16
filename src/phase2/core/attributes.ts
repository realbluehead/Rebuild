// Phase I's works as points: the expedition levels up with XP and each level gives one point, which the player spends
// on one of six attributes with a work of the kind that feeds it (books, records, discoveries). For good: points are
// never moved again. Each point is worth a little less than the one before (spreading pays).
import type { LegacyWork } from './legacy';

export type Attr = 'intelligence' | 'perception' | 'strength' | 'endurance' | 'speed' | 'ingenuity';

export interface AttrDef {
  id: Attr;
  name: string;
  /** The kind of work it takes. */
  work: LegacyWork;
  note: string;
}

export const ATTRS: AttrDef[] = [
  { id: 'intelligence', name: 'Intelligence', work: 'book', note: 'research runs faster' },
  { id: 'perception', name: 'Perception', work: 'book', note: 'the telescope and the antenna reach farther' },
  { id: 'strength', name: 'Strength', work: 'cd', note: 'more power, fuel and metal' },
  { id: 'endurance', name: 'Endurance', work: 'cd', note: 'bigger tanks; probes reach farther and bring back more' },
  { id: 'speed', name: 'Speed', work: 'album', note: 'probes launch and fly, and the crew builds, faster' },
  { id: 'ingenuity', name: 'Ingenuity', work: 'album', note: 'everything costs less metal' },
];

export const noAttrs = (): Record<Attr, number> =>
  ({ intelligence: 0, perception: 0, strength: 0, endurance: 0, speed: 0, ingenuity: 0 });

/** Worth of the first point of each attribute (weighed so that every path ends in a similar time: tools/sim2.ts), and
 *  how much each next point keeps of the one before. */
export const POINT_GAIN: Record<Attr, number> = { intelligence: 0.07, perception: 0.19, strength: 0.08, endurance: 0.12, speed: 0.08, ingenuity: 0.1 };
export const POINT_KEEP = 0.94;
/** The factor `points` of attribute `a` give (1 with none; about ×2 at 15 for a first point worth 0.1). */
export const attrFactor = (points: number, a: Attr = 'intelligence'): number =>
  1 + (POINT_GAIN[a] * (1 - Math.pow(POINT_KEEP, points))) / (1 - POINT_KEEP);

/** XP from expedition level L to L+1. */
export const XP_BASE = 16;
export const XP_GROWTH = 1.1;
export const xpToNext = (level: number): number => XP_BASE * Math.pow(XP_GROWTH, level - 1);

/** The expedition's level for its XP (from 1), and progress into the next one. */
export function expeditionLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  for (;;) {
    const need = xpToNext(level);
    if (left < need) return { level, into: left, need };
    left -= need;
    level++;
  }
}

/** Points earned at `level` (one a level, from level 2). */
export const pointsAt = (level: number): number => level - 1;
