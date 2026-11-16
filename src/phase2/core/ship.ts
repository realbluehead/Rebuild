// The ship, built module by module in the dry dock (the Black siphon's bell), by the same crew that builds the base.
// Once all are built, the destination is fully studied and the tanks hold the launch fuel, it can be launched: the end
// of phase II.
import type { SampleKind } from './starmap';

export interface Module {
  id: string;
  name: string;
  note: string;
  metal: number;
  data: number;
  samples: Partial<Record<SampleKind, number>>;
  /** Crew time, seconds (before Speed and research). */
  seconds: number;
}

export const MODULES: Module[] = [
  { id: 'hull', name: 'Hull', note: 'the bell becomes a hull', metal: 420000, data: 90000, samples: { iron: 30 }, seconds: 3600 },
  { id: 'tanks', name: 'Fuel tanks', note: 'cryogenic, in the keel', metal: 840000, data: 225000, samples: { ice: 45 }, seconds: 4860 },
  { id: 'life', name: 'Life support', note: 'air, water, greenhouses', metal: 1.12e+06, data: 540000, samples: { carbon: 60 }, seconds: 6060 },
  { id: 'engines', name: 'Engines', note: 'plasma drives', metal: 1.79e+06, data: 1.125e+06, samples: { plasma: 60 }, seconds: 7260 },
  { id: 'nav', name: 'Navigation', note: 'star charts from the probes', metal: 2.69e+06, data: 2.7e+06, samples: { crystal: 75 }, seconds: 7260 },
  { id: 'cryo', name: 'Cryo bay', note: 'sleep through the voyage', metal: 4.03e+06, data: 3e+06, samples: { ice: 60, carbon: 60 }, seconds: 9660 },
  { id: 'shield', name: 'Shield', note: 'against dust at speed', metal: 5.82e+06, data: 4.8e+06, samples: { iron: 90, crystal: 60 }, seconds: 10860 },
  { id: 'core', name: 'Bluetreri core', note: 'the heart of the ship', metal: 8.96e+06, data: 7.5e+06, samples: { plasma: 90, crystal: 90 }, seconds: 14520 },
];

/** Fuel the tanks must hold for the launch, litres. */
export const LAUNCH_FUEL = 1.2e6;

export const moduleById = (id: string): Module | undefined => MODULES.find((m) => m.id === id);
