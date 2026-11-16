// The mirror tower (power for the whole base, AREA 3): rings of mirrors beam the sun onto a receiver at the top of a
// tower; molten salt in tanks keeps the heat for the night. 20 levels, one upgrade each (core/facility.ts).
import { powerMW, upgradeMetal } from './curves';
import { specAt, type Facility, type Upgrade } from './facility';

export interface Power {
  level: number;
  /** Mirrors in the field. */
  mirrors: number;
  /** Share of the light the mirrors send on, %. */
  reflect: number;
  /** Tower height, m. */
  tower: number;
  /** Receiver temperature, °C. */
  heat: number;
  /** Mirrors turn to follow the sun. */
  tracking: boolean;
  /** Molten-salt tanks (heat for the night). */
  saltTanks: number;
  exchanger: boolean;
  /** Power line out to the base. */
  grid: boolean;
  /** A crown of lights on the tower. */
  crown: boolean;
}

export const POWER_UPGRADES: Upgrade<Power>[] = [
  { part: 'Base', name: 'Scrap mirrors', note: '6 mirrors, a 5 m tower', apply: () => {} },
  { part: 'Mirrors', name: 'More mirrors', note: '12 mirrors', apply: (p) => { p.mirrors = 12; } },
  { part: 'Tower', name: 'Taller tower', note: 'tower 7 m', apply: (p) => { p.tower = 7; } },
  { part: 'Mirrors', name: 'Polished glass', note: 'reflects 75%', apply: (p) => { p.reflect = 75; } },
  { part: 'Mirrors', name: 'Second ring', note: '20 mirrors', apply: (p) => { p.mirrors = 20; } },
  { part: 'Receiver', name: 'Ceramic receiver', note: '700 °C', apply: (p) => { p.heat = 700; } },
  { part: 'Storage', name: 'Salt tank', note: 'heat for the night', apply: (p) => { p.saltTanks = 1; } },
  { part: 'Mirrors', name: 'Third ring', note: '30 mirrors', apply: (p) => { p.mirrors = 30; } },
  { part: 'Tower', name: 'Concrete tower', note: 'tower 10 m', apply: (p) => { p.tower = 10; } },
  { part: 'Mirrors', name: 'Tracking motors', note: 'follow the sun', apply: (p) => { p.tracking = true; p.reflect = 82; } },
  { part: 'Mirrors', name: 'Fourth ring', note: '42 mirrors', apply: (p) => { p.mirrors = 42; } },
  { part: 'Storage', name: 'Second salt tank', note: '2 tanks', apply: (p) => { p.saltTanks = 2; } },
  { part: 'Receiver', name: 'Cavity receiver', note: '900 °C', apply: (p) => { p.heat = 900; } },
  { part: 'Tower', name: 'Crowned tower', note: 'tower 13 m', apply: (p) => { p.tower = 13; p.crown = true; } },
  { part: 'Mirrors', name: 'Fifth ring', note: '56 mirrors', apply: (p) => { p.mirrors = 56; } },
  { part: 'Grid', name: 'Power line', note: 'pylons to the base', apply: (p) => { p.grid = true; } },
  { part: 'Storage', name: 'Heat exchanger', note: '3 tanks', apply: (p) => { p.saltTanks = 3; p.exchanger = true; } },
  { part: 'Mirrors', name: 'Sixth ring', note: '72 mirrors, 90%', apply: (p) => { p.mirrors = 72; p.reflect = 90; } },
  { part: 'Tower', name: 'Sky tower', note: 'tower 16 m', apply: (p) => { p.tower = 16; } },
  { part: 'Receiver', name: 'Sun core', note: '1200 °C', apply: (p) => { p.heat = 1200; } },
];

/** Output, in MW (core/curves.ts). */
export const powerOutput = (p: Power): number => Math.round(powerMW(p.level) * 10) / 10;
/** Night storage, in MWh. */
export const powerStorage = (p: Power): number => p.saltTanks * 40 * (p.exchanger ? 1.5 : 1);

export const POWER: Facility<Power> = {
  upgrades: POWER_UPGRADES,
  base: () => ({ level: 0, mirrors: 6, reflect: 60, tower: 5, heat: 500, tracking: false, saltTanks: 0, exchanger: false, grid: false, crown: false }),
  stats: (p) => [`Output ${powerOutput(p)} MW`, `${p.mirrors} mirrors · ${p.reflect}% · ${p.heat} °C`, `Night store ${powerStorage(p)} MWh`],
  gauge: (p) => powerOutput(p) / powerOutput(specAt(POWER, 20)),
};

export const powerCost = (level: number): number => Math.round(upgradeMetal('power', level));
