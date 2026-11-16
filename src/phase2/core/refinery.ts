// The bluetreri refinery (fuel, AREA 6): phase I's bluetreri crushed, filtered and cooked in vats into ship fuel;
// later distilled in columns and pressed in a pressure core. 20 levels, one upgrade each (core/facility.ts).
import { refineryLpm, upgradeMetal } from './curves';
import { specAt, type Facility, type Upgrade } from './facility';

export interface Refinery {
  level: number;
  /** Ore hoppers (each with its crusher once there is one). */
  hoppers: number;
  conveyor: boolean;
  crusher: boolean;
  vats: number;
  /** Bigger vats. */
  bigVats: boolean;
  /** Burners under the vats. */
  burners: boolean;
  /** Fuel purity, %. */
  purity: number;
  centrifuge: boolean;
  /** Distillation columns. */
  columns: number;
  /** Pipe rack out to the tank farm. */
  pipes: boolean;
  /** The pressure core (2: overdriven). */
  core: number;
}

export const REFINERY_UPGRADES: Upgrade<Refinery>[] = [
  { part: 'Base', name: 'Scrap still', note: 'one vat, fed by hand', apply: () => {} },
  { part: 'Ore', name: 'Ore hopper', note: 'bluetreri in bulk', apply: (r) => { r.hoppers = 1; } },
  { part: 'Ore', name: 'Conveyor belt', note: 'hopper to the vats', apply: (r) => { r.conveyor = true; } },
  { part: 'Vats', name: 'Second vat', note: '2 vats', apply: (r) => { r.vats = 2; } },
  { part: 'Purity', name: 'Sand filters', note: 'purity 55%', apply: (r) => { r.purity = 55; } },
  { part: 'Ore', name: 'Jaw crusher', note: 'finer ore', apply: (r) => { r.crusher = true; } },
  { part: 'Vats', name: 'Third vat', note: '3 vats', apply: (r) => { r.vats = 3; } },
  { part: 'Heat', name: 'Burners', note: 'cooks twice as fast', apply: (r) => { r.burners = true; } },
  { part: 'Purity', name: 'Centrifuge', note: 'purity 70%', apply: (r) => { r.centrifuge = true; r.purity = 70; } },
  { part: 'Vats', name: 'Big vats', note: 'vats ×2', apply: (r) => { r.bigVats = true; } },
  { part: 'Pipes', name: 'Pipe rack', note: 'fuel to the tanks', apply: (r) => { r.pipes = true; } },
  { part: 'Vats', name: 'Fourth vat', note: '4 vats', apply: (r) => { r.vats = 4; } },
  { part: 'Column', name: 'Distillation column', note: 'lighter fuel', apply: (r) => { r.columns = 1; } },
  { part: 'Purity', name: 'Catalyst', note: 'purity 85%', apply: (r) => { r.purity = 85; } },
  { part: 'Vats', name: 'Fifth vat', note: '5 vats', apply: (r) => { r.vats = 5; } },
  { part: 'Ore', name: 'Second ore line', note: '2 hoppers', apply: (r) => { r.hoppers = 2; } },
  { part: 'Column', name: 'Second column', note: '2 columns', apply: (r) => { r.columns = 2; } },
  { part: 'Purity', name: 'Vacuum still', note: 'purity 95%', apply: (r) => { r.purity = 95; } },
  { part: 'Core', name: 'Pressure core', note: 'presses more fuel', apply: (r) => { r.core = 1; } },
  { part: 'Core', name: 'Core overdrive', note: 'purity 99%', apply: (r) => { r.core = 2; r.purity = 99; } },
];

/** Fuel made, in litres per minute. */
export const refineryOutput = (r: Refinery): number => Math.round(refineryLpm(r.level));

export const REFINERY: Facility<Refinery> = {
  upgrades: REFINERY_UPGRADES,
  base: () => ({ level: 0, hoppers: 0, conveyor: false, crusher: false, vats: 1, bigVats: false, burners: false, purity: 40, centrifuge: false, columns: 0, pipes: false, core: 0 }),
  stats: (r) => [`Makes ${refineryOutput(r)} L/min`, `${r.vats} vats · purity ${r.purity}%`, `${r.columns} columns${r.core ? ' · pressure core' : ''}`],
  gauge: (r) => refineryOutput(r) / refineryOutput(specAt(REFINERY, 20)),
};

export const refineryCost = (level: number): number => Math.round(upgradeMetal('refinery', level));
