// Weather: storms drift over the city with the wind and slow down the rovers caught in them (the Body upgrade
// softens it). Storms form and die out one at a time; a few are severe.

export type StormId = 'acid' | 'snow' | 'electric';

export interface StormDef {
  id: StormId;
  name: string;
  /** Speed multiplier for a rover inside the storm (without armour). */
  factor: number;
  /** What the storm does, for the field notes. */
  desc: string;
}

export const STORMS: readonly StormDef[] = [
  { id: 'acid', name: 'Acid storm', factor: 0.55, desc: 'Corrosive rain eats at the plating: rovers crawl through it.' },
  { id: 'snow', name: 'Snowfall', factor: 0.65, desc: 'Ash-grey snow clogs the tracks.' },
  { id: 'electric', name: 'Electric storm', factor: 0.45, desc: 'Lightning fries the circuits; rovers move with care.' },
];

/** Seconds of play per weather step: storms move, grow or fade, and new ones may form. */
export const WEATHER_EPOCH = 12;
/** No storms until the explored area is this many rings wide. */
export const WEATHER_FROM_RING = 6;
/** At most this many storms at once. */
export const STORMS_MAX = 5;
/** Chance per step that a new storm forms (while there is room). */
export const SPAWN_CHANCE = 0.05;
/** Life of a storm, in steps (it grows during the first GROW_STEPS and fades during the last ones). */
export const LIFE_MIN = 60;
export const LIFE_MAX = 240;
export const GROW_STEPS = 12;
/** Drift per step, in cells: the shared wind plus each storm's own push. */
export const WIND_SPEED = 0.25;
export const OWN_SPEED = 0.2;
/** Share of new storms that are severe, and how much harder they hit. */
export const SEVERE_CHANCE = 0.2;
export const SEVERE_MULT = 1.6;
