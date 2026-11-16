// The giant telescope (built in AREA 1 of the desert): it starts as a scrap spyglass on a tripod and grows, one upgrade
// per level, into an observatory. Each level adds one upgrade (size, lenses, sharpness, mount, dome, mirror, laser) and
// `telescopeAt(level)` folds them into the telescope as it stands, which the 3D scene draws and the Telescope tab lists.
// For now this is a simulation: levels are stepped freely, nothing is spent or saved (its rules are still to be decided).

import { telescopeLy, upgradeMetal } from './curves';
import { FACILITY_MAX, specAt, type Facility } from './facility';

export const TELESCOPE_MAX = FACILITY_MAX;

export type TelescopePart = 'Base' | 'Size' | 'Lenses' | 'Sharpness' | 'Mount' | 'Dome' | 'Mirror' | 'Laser';

/** The telescope as it stands at some level. */
export interface Telescope {
  level: number;
  /** Aperture of the main lens or mirror, in metres. */
  aperture: number;
  /** Lens elements in the light path. */
  lenses: number;
  /** How sharp the image is, 0..100. */
  sharpness: number;
  mount: 'tripod' | 'pier' | 'fork';
  tube: 'refractor' | 'reflector' | 'truss';
  finder: boolean;
  platform: boolean;
  wall: boolean;
  dome: boolean;
  /** Hexagonal mirror segments (0: a single mirror or lens). */
  segments: number;
  /** Laser guide stars. */
  lasers: number;
}

export interface TelescopeUpgrade {
  part: TelescopePart;
  name: string;
  /** What it does, shown in the tab. */
  note: string;
  apply(t: Telescope): void;
}

/** One upgrade per level: UPGRADES[k] is what level k+1 adds (the first is the telescope you start with). */
export const UPGRADES: TelescopeUpgrade[] = [
  { part: 'Base', name: 'Scrap spyglass', note: 'a pipe, a lens, a tripod', apply: () => {} },
  { part: 'Size', name: 'Longer tube', note: 'aperture 0.2 m', apply: (t) => { t.aperture = 0.2; } },
  { part: 'Lenses', name: 'Second lens', note: '2 lenses', apply: (t) => { t.lenses = 2; } },
  { part: 'Sharpness', name: 'Ground glass', note: 'sharpness 25%', apply: (t) => { t.sharpness = 25; } },
  { part: 'Mount', name: 'Steel pier', note: 'no more wobble', apply: (t) => { t.mount = 'pier'; } },
  { part: 'Size', name: 'Wide reflector', note: 'mirror 0.5 m', apply: (t) => { t.tube = 'reflector'; t.aperture = 0.5; } },
  { part: 'Lenses', name: 'Finder scope', note: '3 lenses', apply: (t) => { t.lenses = 3; t.finder = true; } },
  { part: 'Mount', name: 'Concrete platform', note: 'a level base', apply: (t) => { t.platform = true; } },
  { part: 'Sharpness', name: 'Collimation', note: 'sharpness 40%', apply: (t) => { t.sharpness = 40; } },
  { part: 'Mount', name: 'Fork mount', note: 'tracks the sky', apply: (t) => { t.mount = 'fork'; } },
  { part: 'Size', name: 'Truss tube', note: 'mirror 1.5 m', apply: (t) => { t.tube = 'truss'; t.aperture = 1.5; } },
  { part: 'Dome', name: 'Wind wall', note: 'sand stays out', apply: (t) => { t.wall = true; } },
  { part: 'Lenses', name: 'Corrector plate', note: '4 lenses', apply: (t) => { t.lenses = 4; } },
  { part: 'Dome', name: 'Rotating dome', note: 'shelter by day', apply: (t) => { t.dome = true; } },
  { part: 'Sharpness', name: 'Cooled sensor', note: 'sharpness 60%', apply: (t) => { t.sharpness = 60; } },
  { part: 'Mirror', name: 'Segmented mirror', note: '7 segments, 4 m', apply: (t) => { t.segments = 7; t.aperture = 4; } },
  { part: 'Lenses', name: 'Adaptive optics', note: '5 lenses, 75%', apply: (t) => { t.lenses = 5; t.sharpness = 75; } },
  { part: 'Size', name: 'Giant truss', note: '19 segments, 8 m', apply: (t) => { t.segments = 19; t.aperture = 8; } },
  { part: 'Laser', name: 'Laser guide star', note: 'sharpness 88%', apply: (t) => { t.lasers = 1; t.sharpness = 88; } },
  { part: 'Laser', name: 'Star array', note: '3 lasers, 12 m, 99%', apply: (t) => { t.lasers = 3; t.lenses = 6; t.sharpness = 99; t.aperture = 12; } },
];

/** The telescope as a facility (core/facility.ts). */
export const TELESCOPE: Facility<Telescope> = {
  upgrades: UPGRADES,
  base: () => ({
    level: 0, aperture: 0.1, lenses: 1, sharpness: 10, mount: 'tripod', tube: 'refractor',
    finder: false, platform: false, wall: false, dome: false, segments: 0, lasers: 0,
  }),
  stats: (t) => [`Aperture ${t.aperture} m`, `Lenses ${t.lenses} · sharp ${t.sharpness}%`, `Sees ${telescopeRange(t)} ly`],
  gauge: (t) => telescopeRange(t) / telescopeRange(telescopeAt(TELESCOPE_MAX)),
};

/** The telescope at `level` (1..TELESCOPE_MAX, clamped). */
export const telescopeAt = (level: number): Telescope => specAt(TELESCOPE, level);

/** How far it sees, in light years (core/curves.ts). */
export const telescopeRange = (t: Telescope): number => Math.round(telescopeLy(t.level) * 10) / 10;

/** Metal scraps for the upgrade that reaches `level` (2..TELESCOPE_MAX): a suggestion for the simulation. */
export const upgradeCost = (level: number): number => Math.round(upgradeMetal('telescope', level));
