// The telecommunications antenna (AREA 2): from a salvaged dish on a pole to a deep-space array that talks to the
// probes far out in space. 15 levels, one upgrade each (core/facility.ts).
import { antennaData, antennaLy, upgradeMetal } from './curves';
import { specAt, type Facility, type Upgrade } from './facility';

export interface Antenna {
  level: number;
  /** Dishes, and the main dish's size (m). */
  dishes: number;
  dishSize: number;
  /** Mast height, m (a pole, then a lattice mast). */
  mast: number;
  lattice: boolean;
  guyWires: boolean;
  /** Feed horn on the main dish. */
  feedHorn: boolean;
  /** Microwave relay drums on the mast. */
  relays: number;
  /** Transmitter hut with a generator. */
  hut: boolean;
  /** Dishes turn to follow what they listen to. */
  tracking: boolean;
  /** Red aircraft lights up the mast. */
  beacons: boolean;
  /** Phased-array panels. */
  panels: number;
  /** Laser comms terminal. */
  laser: boolean;
}

export const ANTENNA_UPGRADES: Upgrade<Antenna>[] = [
  { part: 'Base', name: 'Scrap dish', note: 'a 2 m dish on a pole', apply: () => {} },
  { part: 'Mast', name: 'Guy wires', note: 'steady in the wind', apply: (a) => { a.guyWires = true; } },
  { part: 'Dish', name: 'Feed horn', note: 'a cleaner signal', apply: (a) => { a.feedHorn = true; } },
  { part: 'Mast', name: 'Lattice mast', note: 'mast 15 m', apply: (a) => { a.mast = 15; a.lattice = true; } },
  { part: 'Relay', name: 'Microwave relays', note: '2 relay drums', apply: (a) => { a.relays = 2; } },
  { part: 'Dish', name: 'Second dish', note: '2 dishes', apply: (a) => { a.dishes = 2; } },
  { part: 'Base', name: 'Transmitter hut', note: 'its own generator', apply: (a) => { a.hut = true; } },
  { part: 'Dish', name: 'Motorised mount', note: 'tracks the sky', apply: (a) => { a.tracking = true; } },
  { part: 'Mast', name: 'Tall mast', note: 'mast 30 m', apply: (a) => { a.mast = 30; } },
  { part: 'Dish', name: 'Big dish', note: 'dish 12 m', apply: (a) => { a.dishSize = 12; } },
  { part: 'Mast', name: 'Aircraft lights', note: 'seen for miles', apply: (a) => { a.beacons = true; a.relays = 4; } },
  { part: 'Dish', name: 'Third dish', note: '3 dishes', apply: (a) => { a.dishes = 3; } },
  { part: 'Array', name: 'Phased array', note: '4 panels', apply: (a) => { a.panels = 4; } },
  { part: 'Dish', name: 'Deep-space dish', note: 'dish 25 m', apply: (a) => { a.dishSize = 25; } },
  { part: 'Laser', name: 'Laser link', note: 'light-speed data', apply: (a) => { a.laser = true; } },
];

/** How far it hears a probe, in light years (core/curves.ts). */
export const antennaRange = (a: Antenna): number => Math.round(antennaLy(a.level) * 10) / 10;
/** Data it brings in from a probe, as a factor. */
export const antennaRate = (a: Antenna): number => Math.round(antennaData(a.level) * 10) / 10;

export const ANTENNA: Facility<Antenna> = {
  upgrades: ANTENNA_UPGRADES,
  base: () => ({
    level: 0, dishes: 1, dishSize: 2, mast: 6, lattice: false, guyWires: false, feedHorn: false, relays: 0, hut: false,
    tracking: false, beacons: false, panels: 0, laser: false,
  }),
  stats: (a) => [`Hears ${antennaRange(a)} ly`, `Data ×${antennaRate(a)}`, `${a.dishes} dish${a.dishes > 1 ? 'es' : ''} · ${a.dishSize} m · mast ${a.mast} m`],
  gauge: (a) => antennaRange(a) / antennaRange(specAt(ANTENNA, ANTENNA_UPGRADES.length)),
};

export const antennaCost = (level: number): number => Math.round(upgradeMetal('antenna', level));
