// World data: map size, terrains and zoom levels.

/** Map side in cells. The farthest zoom shows all of it. */
export const MAP_SIZE = 1024;

/** Terrain indices (into `TERRAINS`). The world is a post-apocalyptic city. */
export const T = { Abyss: 0, Toxic: 1, Rubble: 2, Street: 3, Jungle: 4, Ruins: 5, Towers: 6, Dump: 7 } as const;

export interface TerrainDef {
  name: string;
  /** Base bluetreri per revealed cell. */
  value: number;
  /** Crossing cost (>= 1) used to decide the exploration order (easy terrain first). */
  cost: number;
  /** Roughness: how many steps exploring one of its cells costs (1 = clear street). */
  rough: number;
}

export const TERRAINS: readonly TerrainDef[] = [
  { name: 'Dark water', value: 0.2, cost: 1.6, rough: 3 },
  { name: 'Toxic water', value: 0.4, cost: 1.3, rough: 2.2 },
  { name: 'Rubble', value: 1, cost: 1.1, rough: 1.6 },
  { name: 'Streets', value: 1, cost: 1, rough: 1 },
  { name: 'Urban jungle', value: 2, cost: 1.3, rough: 1.8 },
  { name: 'Ruined blocks', value: 2, cost: 1.4, rough: 2 },
  { name: 'Towers', value: 3, cost: 1.9, rough: 2.6 },
  { name: 'Toxic dump', value: 2.5, cost: 1.7, rough: 2.2 },
];

/** Chance that a land cell holds a deposit. */
export const SPECIAL_CHANCE = 1 / 250;
/** Bluetreri of a deposit, as a multiple of the cell's value. */
export const SPECIAL_MULT = 60;
/** Far lands are worth more: value x (1 + distance / DIST_VALUE_SCALE). */
export const DIST_VALUE_SCALE = 120;

export interface ZoomDef {
  name: string;
  /** Cells visible along the screen's short side. */
  view: number;
}

/** From the closest (1) to the farthest (4). Each level shows 4x more per side. */
export const ZOOMS: readonly ZoomDef[] = [
  { name: 'Street', view: 16 },
  { name: 'District', view: 64 },
  { name: 'City', view: 256 },
  { name: 'Metropolis', view: 1024 },
];

/** Fraction of a zoom's square that must be revealed to unlock the next. */
export const ZOOM_UNLOCK_FRACTION = 0.8;
