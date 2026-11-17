// Research at the base's lab: one at a time, paid in data (from the probes) and in the pages, notes and photos brought
// over from phase I, each a share of what was brought (so a phase I that kept few still gets through). Each makes one
// thing better for good. Tiers open as research is done.
import type { LegacyItem } from './legacy';

/** What a piece of research multiplies. `cost` divides metal costs, `build` and `research` speed up the crew and the
 *  lab; the rest multiply the matching rate. */
export type Effect = 'metal' | 'fuel' | 'power' | 'data' | 'reach' | 'speed' | 'build' | 'research' | 'capacity' | 'launch' | 'cost';

export interface Tech {
  id: string;
  name: string;
  note: string;
  tier: number;
  effect: Effect;
  mult: number;
  /** Which kind of item it takes (a share of what was brought: TIER_ITEM_SHARE). */
  item: LegacyItem;
}

export const TECHS: Tech[] = [
  { id: 'sweepers', name: 'Magnet sweepers', note: 'metal ×1.4', tier: 1, effect: 'metal', mult: 1.4, item: 'page' },
  { id: 'heatpipes', name: 'Heat pipes', note: 'fuel ×1.4', tier: 1, effect: 'fuel', mult: 1.4, item: 'note' },
  { id: 'polish', name: 'Mirror polish', note: 'power ×1.3', tier: 1, effect: 'power', mult: 1.3, item: 'note' },
  { id: 'compress', name: 'Data compression', note: 'data ×1.5', tier: 1, effect: 'data', mult: 1.5, item: 'photo' },
  { id: 'smelter', name: 'Scrap smelter', note: 'metal ×1.5', tier: 2, effect: 'metal', mult: 1.5, item: 'page' },
  { id: 'alloys', name: 'Light alloys', note: 'probe reach ×1.3', tier: 2, effect: 'reach', mult: 1.3, item: 'photo' },
  { id: 'prefab', name: 'Prefab frames', note: 'crew ×1.4 faster', tier: 2, effect: 'build', mult: 1.4, item: 'page' },
  { id: 'cracking', name: 'Catalytic cracking', note: 'fuel ×1.5', tier: 2, effect: 'fuel', mult: 1.5, item: 'note' },
  { id: 'deepsalvage', name: 'Deep salvage', note: 'metal ×1.6', tier: 3, effect: 'metal', mult: 1.6, item: 'page' },
  { id: 'ionthrust', name: 'Ion thrust', note: 'probes ×1.4 faster', tier: 3, effect: 'speed', mult: 1.4, item: 'photo' },
  { id: 'batch', name: 'Batch launching', note: 'launches ×1.4', tier: 3, effect: 'launch', mult: 1.4, item: 'note' },
  { id: 'linings', name: 'Tank linings', note: 'tanks hold ×1.5', tier: 3, effect: 'capacity', mult: 1.5, item: 'note' },
  { id: 'autorovers', name: 'Autonomous rovers', note: 'metal ×1.8', tier: 4, effect: 'metal', mult: 1.8, item: 'page' },
  { id: 'ecc', name: 'Error correction', note: 'data ×2', tier: 4, effect: 'data', mult: 2, item: 'photo' },
  { id: 'supercond', name: 'Superconductors', note: 'power ×1.6', tier: 4, effect: 'power', mult: 1.6, item: 'note' },
  { id: 'labauto', name: 'Lab automation', note: 'research ×1.5 faster', tier: 4, effect: 'research', mult: 1.5, item: 'photo' },
  { id: 'orbital', name: 'Orbital salvage', note: 'metal ×2', tier: 5, effect: 'metal', mult: 2, item: 'page' },
  { id: 'fusion', name: 'Fusion lining', note: 'fuel ×2', tier: 5, effect: 'fuel', mult: 2, item: 'note' },
  { id: 'sails', name: 'Light sails', note: 'probes ×1.5 faster', tier: 5, effect: 'speed', mult: 1.5, item: 'photo' },
  { id: 'modular', name: 'Modular hulls', note: 'metal costs ÷1.3', tier: 5, effect: 'cost', mult: 1.3, item: 'page' },
];

export const TIERS = 5;
/** Research done to open tier t (4 per tier before it). */
export const tierOpensAt = (tier: number): number => (tier - 1) * 4;
/** Data for a piece of research of each tier. */
export const TIER_DATA = [6, 900, 9000, 90000, 600000];
/** Lab time, seconds, before Intelligence and research. */
export const TIER_SECONDS = [1200, 3600, 9600, 21600, 43200];
/** Share of the items brought over of its kind (all research of a kind takes under half of them). */
export const TIER_ITEM_SHARE = [0.01, 0.02, 0.03, 0.04, 0.05];

export const techById = (id: string): Tech | undefined => TECHS.find((t) => t.id === id);
