// Millores que es compren amb or. Afegir-ne una = una entrada aquí i el seu efecte a core/game.ts `stats()`.
export type StatId = 'speed' | 'radius' | 'loot' | 'explorers';

export interface UpgradeDef {
  id: StatId;
  name: string;
  desc: string;
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Motor', desc: 'El robot avança més de pressa', baseCost: 10, costGrowth: 2.5 },
  { id: 'radius', name: 'Radar', desc: 'Escaneja més lluny', baseCost: 60, costGrowth: 4.5 },
  { id: 'loot', name: 'Bodega', desc: 'Més or per casella', baseCost: 40, costGrowth: 3.2 },
  { id: 'explorers', name: 'Robots', desc: 'Surt un robot més del campament', baseCost: 1000, costGrowth: 9 },
];

/** Efecte de cada nivell. */
export const BASE_SPEED = 0.1; // caselles de camí per segon (una casella cada 10 s)
export const SPEED_MULT = 1.15;
export const BASE_RADIUS = 1;
export const LOOT_MULT = 1.25;

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
