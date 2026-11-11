// Millores que es compren amb or. Afegir-ne una = una entrada aquí i el seu efecte a core/game.ts `stats()`.
export type StatId = 'speed' | 'radar' | 'cargo' | 'explorers';

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Engine', desc: 'Rovers travel and explore faster', baseCost: 6, costGrowth: 1.9 },
  { id: 'radar', name: 'Radar', desc: 'Detects pages, notes and photos in the dark; rovers go and fetch them', baseCost: 40, costGrowth: 3 },
  { id: 'cargo', name: 'Hold', desc: 'Each rover carries more bluetreri before returning to camp', baseCost: 25, costGrowth: 2.2 },
  { id: 'explorers', name: 'Rovers', desc: 'One more rover leaves camp', baseCost: 1000, costGrowth: 9 },
];

/** Efecte de cada nivell. */
export const BASE_SPEED = 0.18; // passos per segon de cada robot (un carrer cada ~5,5 s; la rugositat del terreny frena)
export const SPEED_MULT = 1.25;
/** Abast del radar, en anells més enllà d'on són els robots (nivell 0 = sense radar). */
export const radarRange = (level: number): number => (level > 0 ? 1 + 2 * level : 0);
/** Pel terreny ja descobert (anar i tornar del campament) els robots caminen aquestes vegades més de pressa. */
export const TRAVEL_MULT = 5;
/** Or que pot carregar cada robot abans d'haver de tornar al campament a descarregar. */
export const BASE_CARGO = 5;
export const CARGO_MULT = 1.7;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
