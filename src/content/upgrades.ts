// Millores que es compren amb or. Afegir-ne una = una entrada aquí i el seu efecte a core/game.ts `stats()`.
export type StatId = 'speed' | 'loot' | 'cargo' | 'explorers';

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Motor', desc: 'Els robots caminen i exploren més de pressa', baseCost: 6, costGrowth: 1.9 },
  { id: 'loot', name: 'Radar', desc: 'Detecta més or a cada casella', baseCost: 40, costGrowth: 3.2 },
  { id: 'cargo', name: 'Bodega', desc: 'Cada robot pot carregar més or abans de tornar a la base', baseCost: 25, costGrowth: 2.2 },
  { id: 'explorers', name: 'Robots', desc: 'Surt un robot més del campament', baseCost: 1000, costGrowth: 9 },
];

/** Efecte de cada nivell. */
export const BASE_SPEED = 0.1; // passos per segon de cada robot (una casella cada 10 s)
export const SPEED_MULT = 1.25;
export const LOOT_MULT = 1.25;
/** Pel terreny ja descobert (anar i tornar del campament) els robots caminen aquestes vegades més de pressa. */
export const TRAVEL_MULT = 5;
/** Or que pot carregar cada robot abans d'haver de tornar al campament a descarregar. */
export const BASE_CARGO = 5;
export const CARGO_MULT = 1.7;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
