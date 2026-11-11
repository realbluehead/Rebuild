// Dades del món: mida del mapa, terrenys i nivells de zoom.

/** Costat del mapa en caselles. El zoom més llunyà el veu sencer. */
export const MAP_SIZE = 1024;

/** Índexs de terreny (a `TERRAINS`). El món és una ciutat postapocalíptica. */
export const T = { Abyss: 0, Toxic: 1, Rubble: 2, Street: 3, Jungle: 4, Ruins: 5, Towers: 6, Dump: 7 } as const;

export interface TerrainDef {
  name: string;
  /** Or base per casella descoberta. */
  value: number;
  /** Com costa travessar-lo (≥ 1): l'exploració avança més de pressa per terrenys fàcils. */
  cost: number;
}

export const TERRAINS: readonly TerrainDef[] = [
  { name: 'Aigües fosques', value: 0.2, cost: 1.6 },
  { name: 'Aigua tòxica', value: 0.4, cost: 1.3 },
  { name: 'Runa', value: 1, cost: 1.1 },
  { name: 'Carrers', value: 1, cost: 1 },
  { name: 'Selva urbana', value: 2, cost: 1.3 },
  { name: 'Edificis en ruïnes', value: 2, cost: 1.4 },
  { name: 'Gratacels', value: 3, cost: 1.9 },
  { name: 'Abocador tòxic', value: 2.5, cost: 1.7 },
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
  { name: 'Carrer', view: 16 },
  { name: 'Barri', view: 64 },
  { name: 'Ciutat', view: 256 },
  { name: 'Metròpoli', view: 1024 },
];

/** Fracció del quadrat d'un zoom que cal descobrir per desbloquejar el següent. */
export const ZOOM_UNLOCK_FRACTION = 0.8;
