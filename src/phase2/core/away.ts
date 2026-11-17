// What happened while the player was away: a snapshot before the time away runs (`snap`) and what changed after it
// (`awaySummary`), for the report shown on coming back (ui/away.ts).
import { expeditionLevel } from './attributes';
import type { BuildingId } from './curves';
import { SAMPLE_KINDS, type SampleKind } from './starmap';
import type { P2State } from './state';

/** Least time away worth a report (seconds), like phase I's. */
export const AWAY_MIN_SEC = 600;

export interface AwaySnap {
  metal: number;
  data: number;
  levels: Record<BuildingId, number>;
  researched: number;
  modules: number;
  studies: number;
  samples: Record<SampleKind, number>;
  xp: number;
}

export const snap = (s: P2State): AwaySnap => ({
  metal: s.metal.toNumber(), data: s.data, levels: { ...s.levels }, researched: s.researched.length, modules: s.modules.length,
  studies: s.studies.reduce((a, b) => a + b, 0), samples: { ...s.samples }, xp: s.xp,
});

export interface AwaySummary {
  /** Metal and data gained (spending counted: what is at hand now minus before, plus what the builds and research cost
   *  is not tracked, so these are net). */
  metal: number;
  data: number;
  /** Building levels gained: [id, level before, level now]. */
  levels: [BuildingId, number, number][];
  /** Research and modules finished (their ids, in order). */
  researched: string[];
  modules: string[];
  /** Studies of star systems made, and samples gained (whole ones). */
  studies: number;
  samples: [SampleKind, number][];
  /** Expedition levels gained. */
  levelsUp: number;
}

export function awaySummary(a: AwaySnap, s: P2State): AwaySummary {
  return {
    metal: s.metal.toNumber() - a.metal,
    data: s.data - a.data,
    levels: (Object.keys(a.levels) as BuildingId[]).filter((id) => s.levels[id] > a.levels[id]).map((id) => [id, a.levels[id], s.levels[id]]),
    researched: s.researched.slice(a.researched),
    modules: s.modules.slice(a.modules),
    studies: s.studies.reduce((x, y) => x + y, 0) - a.studies,
    samples: SAMPLE_KINDS.map((k) => [k, Math.floor(s.samples[k]) - Math.floor(a.samples[k])] as [SampleKind, number]).filter(([, n]) => n > 0),
    levelsUp: expeditionLevel(s.xp).level - expeditionLevel(a.xp).level,
  };
}
