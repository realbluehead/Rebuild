// Objectes que els robots troben pel mapa (pàgines, notes, fotos) i les obres que se'n fan (llibres, discos, àlbums).
// Cada obra costa més que l'anterior i dona un bonus permanent.

export type ItemId = 'page' | 'note' | 'photo';
export type WorkId = 'book' | 'cd' | 'album';

export interface ItemDef {
  id: ItemId;
  name: string;
  plural: string;
  /** Pes relatiu a l'hora de repartir objectes pel mapa. */
  weight: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'page', name: 'pàgina', plural: 'pàgines', weight: 0.45 },
  { id: 'note', name: 'nota', plural: 'notes', weight: 0.2 },
  { id: 'photo', name: 'foto', plural: 'fotos', weight: 0.35 },
];
/** Probabilitat que una casella (que no sigui el campament ni un cofre) amagui un objecte. */
export const ITEM_CHANCE = 1 / 90;

export interface WorkDef {
  id: WorkId;
  /** Nom de la col·lecció. */
  name: string;
  /** Què es fa servir per crear-ne. */
  item: ItemId;
  /** Objectes per a la primera obra; cada obra següent en demana `costGrowth` vegades més. */
  baseCost: number;
  costGrowth: number;
  /** Bonus de cada obra (multiplicador) i a què s'aplica. */
  bonus: number;
  effect: string;
  titles: readonly string[];
}

export const WORKS: readonly WorkDef[] = [
  {
    id: 'book', name: 'Llibres', item: 'page', baseCost: 10, costGrowth: 1.9, bonus: 1.1, effect: 'velocitat',
    titles: [
      'The Old Man and the Sea', 'Robinson Crusoe', 'Treasure Island', 'Moby Dick', 'Around the World in Eighty Days',
      'Twenty Thousand Leagues Under the Seas', 'The Little Prince', 'Tirant lo Blanc', 'Don Quixote', 'The Odyssey',
      'Gulliver\'s Travels', 'Journey to the Centre of the Earth', 'The Call of the Wild', 'Heart of Darkness', 'Into the Wild',
    ],
  },
  {
    id: 'cd', name: 'Discos', item: 'note', baseCost: 5, costGrowth: 1.9, bonus: 1.1, effect: 'bluetreri',
    titles: [
      'Abbey Road', 'Kind of Blue', 'Revolver', 'The Dark Side of the Moon', 'Rumours', 'Thriller', 'Blue Train',
      'Pet Sounds', 'London Calling', 'Nevermind', 'OK Computer', 'Back in Black', 'Purple Rain', 'Graceland', 'Blue',
    ],
  },
  {
    id: 'album', name: 'Àlbums', item: 'photo', baseCost: 8, costGrowth: 1.9, bonus: 1.1, effect: 'bodega',
    titles: [
      'Postes de sol', 'Boscos', 'Platges', 'Muntanyes', 'Rius', 'Nevades', 'Fars', 'Ponts', 'Ruïnes', 'Estels',
      'Deserts', 'Volcans', 'Aurores', 'Illes', 'Horitzons',
    ],
  },
];

export const workById = (id: WorkId): WorkDef => WORKS.find((w) => w.id === id)!;

/** Objectes que costa la obra número `made` (0 = la primera). */
export const workCost = (def: WorkDef, made: number): number => Math.round(def.baseCost * def.costGrowth ** made);

/** Títol de l'obra número `made`; quan s'acaben els noms, es numeren. */
export const workTitle = (def: WorkDef, made: number): string =>
  def.titles[made] ?? `${def.titles[made % def.titles.length]} (vol. ${Math.floor(made / def.titles.length) + 1})`;
