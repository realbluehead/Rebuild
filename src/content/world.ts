// Dades del món: mida del mapa, terrenys i nivells de zoom.

/** Costat del mapa en caselles. El zoom més llunyà el veu sencer. */
export const MAP_SIZE = 1024;

/** Índexs de terreny (a `TERRAINS`). */
export const T = { Deep: 0, Water: 1, Sand: 2, Grass: 3, Forest: 4, Hill: 5, Mountain: 6, Snow: 7 } as const;

export interface TerrainDef {
  name: string;
  /** Or base per casella descoberta. */
  value: number;
  /** Com costa travessar-lo (≥ 1): l'exploració avança més de pressa per terrenys fàcils. */
  cost: number;
}

export const TERRAINS: readonly TerrainDef[] = [
  { name: 'Mar profund', value: 0.2, cost: 1.6 },
  { name: 'Aigua', value: 0.4, cost: 1.3 },
  { name: 'Sorra', value: 1, cost: 1.1 },
  { name: 'Prat', value: 1, cost: 1 },
  { name: 'Bosc', value: 2, cost: 1.3 },
  { name: 'Turons', value: 2, cost: 1.4 },
  { name: 'Muntanya', value: 3, cost: 1.9 },
  { name: 'Neu', value: 2.5, cost: 1.7 },
];

/** Probabilitat que una casella de terra tingui un lloc especial (cofre o ruïnes). */
export const SPECIAL_CHANCE = 1 / 250;
/** Or d'un lloc especial, en múltiples del valor de la casella. */
export const SPECIAL_MULT = 60;
/** Les terres llunyanes valen més: valor × (1 + distància / DIST_VALUE_SCALE). */
export const DIST_VALUE_SCALE = 120;

export interface ZoomDef {
  name: string;
  /** Caselles visibles al costat curt de la pantalla. */
  view: number;
}

/** Del més proper (1) al més llunyà (4). Cada nivell veu 4× més de costat. */
export const ZOOMS: readonly ZoomDef[] = [
  { name: 'Camí', view: 16 },
  { name: 'Comarca', view: 64 },
  { name: 'Regió', view: 256 },
  { name: 'Continent', view: 1024 },
];

/** Fracció del quadrat d'un zoom que cal descobrir per desbloquejar el següent. */
export const ZOOM_UNLOCK_FRACTION = 0.8;
