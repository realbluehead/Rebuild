// Dades del món: mida del mapa, terrenys i nivells de zoom.

/** Costat del mapa en caselles. El zoom més llunyà el veu sencer. */
export const MAP_SIZE = 1024;

/** Índexs de terreny (a `TERRAINS`). El món és una ciutat postapocalíptica. */
export const T = { Abyss: 0, Toxic: 1, Rubble: 2, Street: 3, Jungle: 4, Ruins: 5, Towers: 6, Dump: 7 } as const;

export interface TerrainDef {
  name: string;
  /** Or base per casella descoberta. */
  value: number;
  /** Com costa travessar-lo (≥ 1) per decidir l'ordre d'exploració (els terrenys fàcils primer). */
  cost: number;
  /** Rugositat: quants passos costa explorar-ne una casella (1 = carrer net). */
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
  { name: 'Street', view: 16 },
  { name: 'District', view: 64 },
  { name: 'City', view: 256 },
  { name: 'Metropolis', view: 1024 },
];

/** Fracció del quadrat d'un zoom que cal descobrir per desbloquejar el següent. */
export const ZOOM_UNLOCK_FRACTION = 0.8;
