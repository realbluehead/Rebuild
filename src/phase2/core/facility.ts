// What every building of the base shares: levels, one upgrade each (20 for most, 15 for the antenna and the probes), folded into the building as it stands. The
// telescope, the mirror tower (power), the bluetreri refinery (fuel) and the tank farm (fuel storage) are facilities.
// For now they are a simulation: levels are stepped freely, nothing is spent or saved (their rules are still to be
// decided with the user).

/** Levels of the first buildings (telescope, mirror tower, refinery, tank farm); a facility has as many levels as upgrades. */
export const FACILITY_MAX = 20;

export interface Upgrade<S> {
  /** What kind of upgrade it is (Size, Lenses, Mirrors…), shown in the tab. */
  part: string;
  name: string;
  /** What it does, shown in the tab. */
  note: string;
  apply(s: S): void;
}

export interface Facility<S extends { level: number }> {
  /** One upgrade per level: `upgrades[k]` is what level k+1 adds (the first is what you start with). */
  upgrades: Upgrade<S>[];
  /** The building before any upgrade (level 0). */
  base(): S;
  /** The numbers the tab shows, one line each. */
  stats(s: S): string[];
  /** Its main number as a share of its best (0..1), for the tab's bar. */
  gauge(s: S): number;
}

/** Its top level (one per upgrade). */
export const maxLevel = (f: Facility<{ level: number }>): number => f.upgrades.length;

/** The building at `level` (1..its top level, clamped). */
export function specAt<S extends { level: number }>(f: Facility<S>, level: number): S {
  const lv = Math.max(1, Math.min(f.upgrades.length, Math.floor(level)));
  const s = f.base();
  for (let k = 0; k < lv; k++) f.upgrades[k].apply(s);
  s.level = lv;
  return s;
}

/** Metal scraps for the upgrade that reaches `level` (2..its top level): a suggestion for the simulation; `scale` sets
 *  how dear a building is. */
export const facilityCost = (level: number, scale = 1): number => Math.round(40 * scale * Math.pow(1.8, level - 2));
