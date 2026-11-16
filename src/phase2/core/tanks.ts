// The tank farm (fuel storage, AREA 9): from a stack of barrels to upright tanks and spheres inside a bund wall, a
// pump house, and filling arms that fuel the ships. 20 levels, one upgrade each (core/facility.ts).
import { tanksL, upgradeMetal } from './curves';
import { specAt, type Facility, type Upgrade } from './facility';

export interface Tanks {
  level: number;
  barrels: boolean;
  /** Upright tanks. */
  uprights: number;
  spheres: number;
  bigSpheres: boolean;
  gauges: boolean;
  /** Concrete bund wall round the tanks. */
  bund: boolean;
  /** Pipe rack from the refinery. */
  pipes: boolean;
  /** Fire hydrants and foam sprinklers. */
  safety: boolean;
  pumpHouse: boolean;
  /** Filling arms for the ships. */
  arms: number;
  /** Pipeline to the dry dock. */
  pipeline: boolean;
  /** White insulated cladding (keeps the fuel cool). */
  cladding: boolean;
  beacon: boolean;
}

export const TANKS_UPGRADES: Upgrade<Tanks>[] = [
  { part: 'Base', name: 'Barrel stack', note: 'eight rusty barrels', apply: () => {} },
  { part: 'Tanks', name: 'Upright tank', note: 'first tank', apply: (t) => { t.uprights = 1; } },
  { part: 'Gauges', name: 'Level gauges', note: 'see what is left', apply: (t) => { t.gauges = true; } },
  { part: 'Tanks', name: 'Second tank', note: '2 tanks', apply: (t) => { t.uprights = 2; } },
  { part: 'Safety', name: 'Bund wall', note: 'spills stay in', apply: (t) => { t.bund = true; } },
  { part: 'Tanks', name: 'Sphere', note: 'pressurised fuel', apply: (t) => { t.spheres = 1; } },
  { part: 'Pipes', name: 'Pipe rack', note: 'from the refinery', apply: (t) => { t.pipes = true; t.barrels = false; } },
  { part: 'Tanks', name: 'Third tank', note: '3 tanks', apply: (t) => { t.uprights = 3; } },
  { part: 'Safety', name: 'Foam hydrants', note: 'no fires', apply: (t) => { t.safety = true; } },
  { part: 'Tanks', name: 'Second sphere', note: '2 spheres', apply: (t) => { t.spheres = 2; } },
  { part: 'Tanks', name: 'Fourth tank', note: '4 tanks', apply: (t) => { t.uprights = 4; } },
  { part: 'Pump', name: 'Pump house', note: 'fills faster', apply: (t) => { t.pumpHouse = true; } },
  { part: 'Tanks', name: 'Big spheres', note: 'bigger spheres', apply: (t) => { t.bigSpheres = true; } },
  { part: 'Tanks', name: 'Tank row', note: '6 tanks', apply: (t) => { t.uprights = 6; } },
  { part: 'Arm', name: 'Filling arm', note: 'fuels a ship', apply: (t) => { t.arms = 1; } },
  { part: 'Tanks', name: 'Third sphere', note: '3 spheres', apply: (t) => { t.spheres = 3; } },
  { part: 'Pipes', name: 'Dock pipeline', note: 'fuel to the dry dock', apply: (t) => { t.pipeline = true; } },
  { part: 'Tanks', name: 'Fourth sphere', note: '4 spheres', apply: (t) => { t.spheres = 4; } },
  { part: 'Safety', name: 'Cryo cladding', note: 'no losses', apply: (t) => { t.cladding = true; } },
  { part: 'Arm', name: 'Fuel station', note: '2 arms, a beacon', apply: (t) => { t.arms = 2; t.beacon = true; } },
];

/** What it holds, in kilolitres. */
export const tanksCapacity = (t: Tanks): number => Math.round(tanksL(t.level) / 100) / 10;

export const TANKS: Facility<Tanks> = {
  upgrades: TANKS_UPGRADES,
  base: () => ({
    level: 0, barrels: true, uprights: 0, spheres: 0, bigSpheres: false, gauges: false, bund: false, pipes: false,
    safety: false, pumpHouse: false, arms: 0, pipeline: false, cladding: false, beacon: false,
  }),
  stats: (t) => [`Holds ${tanksCapacity(t)} kL`, `${t.uprights} tanks · ${t.spheres} spheres`, `${t.arms} filling arms${t.pumpHouse ? ' · pumps' : ''}`],
  gauge: (t) => tanksCapacity(t) / tanksCapacity(specAt(TANKS, 20)),
};

export const tanksCost = (level: number): number => Math.round(upgradeMetal('tanks', level));
