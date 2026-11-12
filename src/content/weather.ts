// Weather: storms sweep over the city and slow down the rovers caught in them (the Body upgrade softens it).
// The sky changes every WEATHER_EPOCH seconds of play; storms stay put during an epoch.

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

/** Seconds of play between weather changes. */
export const WEATHER_EPOCH = 150;
/** No storms until the explored area is this many rings wide. */
export const WEATHER_FROM_RING = 6;
/** Chance that an epoch is calm (no storms at all). */
export const CALM_CHANCE = 0.25;
/** Storms per (stormy) epoch: from MIN to MAX. */
export const STORMS_MIN = 2;
export const STORMS_MAX = 5;
