// Items rovers find on the map (pages, notes, photos) and the works made from them (books, records, albums).
// Each work costs more than the last and gives a permanent bonus. Every collection has WORKS_MAX works, and the map holds
// enough items to finish all of them (plus every route and level), with room to spare: there is a test.

export type ItemId = 'page' | 'note' | 'photo';
export type WorkId = 'book' | 'cd' | 'album';

export interface ItemDef {
  id: ItemId;
  name: string;
  plural: string;
  /** Relative weight when scattering items over the map. */
  weight: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'page', name: 'page', plural: 'pages', weight: 0.45 },
  { id: 'note', name: 'note', plural: 'notes', weight: 0.2 },
  { id: 'photo', name: 'photo', plural: 'photos', weight: 0.35 },
];
/** Chance that a cell (other than the camp or a deposit) hides an item. */
export const ITEM_CHANCE = 1 / 90;

export interface WorkDef {
  id: WorkId;
  /** Name of the collection. */
  name: string;
  /** What it is made from. */
  item: ItemId;
  /** Items for the first work; each following work asks for `costGrowth` times more (up to WORKS_MAX works). */
  baseCost: number;
  costGrowth: number;
  /** Bonus of each work (multiplier) and what it applies to. */
  bonus: number;
  effect: string;
  titles: readonly string[];
}

export const WORKS: readonly WorkDef[] = [
  {
    id: 'book', name: 'Books', item: 'page', baseCost: 15, costGrowth: 1.35, bonus: 1.1, effect: 'speed',
    titles: [
      'The Old Man and the Sea', 'Robinson Crusoe', 'Treasure Island', 'Moby Dick', 'Around the World in Eighty Days',
      'Twenty Thousand Leagues Under the Seas', 'The Little Prince', 'Tirant lo Blanc', 'Don Quixote', 'The Odyssey',
      'Gulliver\'s Travels', 'Journey to the Centre of the Earth', 'The Call of the Wild', 'Heart of Darkness', 'Into the Wild',
    ],
  },
  {
    id: 'cd', name: 'Records', item: 'note', baseCost: 6, costGrowth: 1.35, bonus: 1.1, effect: 'bluetreri',
    titles: [
      'Abbey Road', 'Kind of Blue', 'Revolver', 'The Dark Side of the Moon', 'Rumours', 'Thriller', 'Blue Train',
      'Pet Sounds', 'London Calling', 'Nevermind', 'OK Computer', 'Back in Black', 'Purple Rain', 'Graceland', 'Blue',
    ],
  },
  {
    id: 'album', name: 'Albums', item: 'photo', baseCost: 11, costGrowth: 1.35, bonus: 1.1, effect: 'hold',
    titles: [
      'Sunsets', 'Forests', 'Beaches', 'Mountains', 'Rivers', 'Snowfall', 'Lighthouses', 'Bridges', 'Ruins', 'Stars',
      'Deserts', 'Volcanoes', 'Auroras', 'Islands', 'Horizons',
    ],
  },
];

/** Works in each collection (one per title): the library is complete with all of them. */
export const WORKS_MAX = 15;

export const workById = (id: WorkId): WorkDef => WORKS.find((w) => w.id === id)!;

/** Items that work number `made` costs (0 = the first). */
export const workCost = (def: WorkDef, made: number): number => Math.round(def.baseCost * def.costGrowth ** made);

/** Title of work number `made`. */
export const workTitle = (def: WorkDef, made: number): string => def.titles[Math.min(made, def.titles.length - 1)];

/** Items needed to finish a whole collection. */
export const collectionCost = (def: WorkDef): number => Array.from({ length: WORKS_MAX }, (_, k) => workCost(def, k)).reduce((a, b) => a + b, 0);
