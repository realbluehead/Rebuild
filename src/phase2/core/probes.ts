// The probe hangar (AREA 8): probes are built in a hangar and rolled out to a launcher that sends them off into space
// to study the universe. From a can on a rail to a launch pad sending a fleet of deep-space probes. 15 levels, one
// upgrade each (core/facility.ts).
import { probeFuelL, probeReachLy, probesPerHour as probesPerHourAt, probeSpeedLyH, upgradeMetal } from './curves';
import { specAt, type Facility, type Upgrade } from './facility';

export interface Probes {
  level: number;
  /** The hangar: a frame (open), then roofed, then with big sliding doors. */
  hangar: 'frame' | 'roof' | 'doors';
  /** Probe bays inside (probes built at once). */
  bays: number;
  /** The probe: solar wings, radio dish, ion engine, instruments, a nuclear battery. */
  solar: boolean;
  radio: boolean;
  ionEngine: boolean;
  instruments: number;
  rtg: boolean;
  /** Overhead crane in the hangar. */
  crane: boolean;
  /** Launcher: a rail, then a launch tower, then a pad with a flame trench; a booster stage. */
  launcher: 'rail' | 'tower' | 'pad';
  booster: boolean;
  /** Probes sent per launch. */
  perLaunch: number;
}

export const PROBES_UPGRADES: Upgrade<Probes>[] = [
  { part: 'Base', name: 'Scrap probe', note: 'a can on a launch rail', apply: () => {} },
  { part: 'Hangar', name: 'Workshop frame', note: 'build in the shade', apply: () => {} },
  { part: 'Probe', name: 'Solar wings', note: 'flies for months', apply: (p) => { p.solar = true; } },
  { part: 'Launch', name: 'Launch tower', note: 'aims higher', apply: (p) => { p.launcher = 'tower'; } },
  { part: 'Hangar', name: 'Hangar roof', note: 'no sand inside', apply: (p) => { p.hangar = 'roof'; } },
  { part: 'Probe', name: 'Radio dish', note: 'talks to the antenna', apply: (p) => { p.radio = true; } },
  { part: 'Probe', name: 'Ion engine', note: 'goes much farther', apply: (p) => { p.ionEngine = true; } },
  { part: 'Hangar', name: 'Gantry crane', note: 'lifts whole probes', apply: (p) => { p.crane = true; } },
  { part: 'Hangar', name: 'Second bay', note: '2 probes at once', apply: (p) => { p.bays = 2; } },
  { part: 'Probe', name: 'Camera & spectrometer', note: 'sees what it finds', apply: (p) => { p.instruments = 2; } },
  { part: 'Launch', name: 'Launch pad', note: 'a flame trench', apply: (p) => { p.launcher = 'pad'; } },
  { part: 'Hangar', name: 'Sliding doors', note: 'big probes roll out', apply: (p) => { p.hangar = 'doors'; } },
  { part: 'Probe', name: 'Nuclear battery', note: 'lives for decades', apply: (p) => { p.rtg = true; p.instruments = 4; } },
  { part: 'Launch', name: 'Booster stage', note: 'escapes faster', apply: (p) => { p.booster = true; } },
  { part: 'Launch', name: 'Probe fleet', note: '3 probes a launch', apply: (p) => { p.perLaunch = 3; p.bays = 3; } },
];

/** How far a probe gets, in light years (core/curves.ts). */
export const probeReach = (p: Probes): number => Math.round(probeReachLy(p.level) * 10) / 10;
/** Probes launched an hour (while there is fuel). */
export const probesPerHour = (p: Probes): number => Math.round(probesPerHourAt(p.level) * 10) / 10;

export const PROBES: Facility<Probes> = {
  upgrades: PROBES_UPGRADES,
  base: () => ({
    level: 0, hangar: 'frame', bays: 1, solar: false, radio: false, ionEngine: false, instruments: 0, rtg: false,
    crane: false, launcher: 'rail', booster: false, perLaunch: 1,
  }),
  stats: (p) => [`Reach ${probeReach(p)} ly · ${Math.round(probeSpeedLyH(p.level))} ly/h`, `${probesPerHour(p)} probes an hour`, `${Math.round(probeFuelL(p.level))} L of fuel a launch`],
  gauge: (p) => probeReach(p) / probeReach(specAt(PROBES, PROBES_UPGRADES.length)),
};

export const probesCost = (level: number): number => Math.round(upgradeMetal('probes', level));
