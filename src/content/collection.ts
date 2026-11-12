// Items rovers find on the map (pages, notes, photos) and the works made from them (books, records, albums).
// Each work costs more than the last and gives a permanent bonus. Every collection has WORKS_MAX works. Prices are set per
// map (`workCost` in core/game.ts): a whole collection costs LIBRARY_SHARE of that kind's items on the map, after what
// every route and level costs, so the library can always be finished (seeds differ a lot in how many pages they hide).

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
  /** Each work asks for `costGrowth` times more than the last (up to WORKS_MAX works). */
  costGrowth: number;
  /** Bonus of each work (multiplier) and what it applies to. */
  bonus: number;
  effect: string;
  titles: readonly string[];
}

export const WORKS: readonly WorkDef[] = [
  {
    id: 'book', name: 'Books', item: 'page', costGrowth: 1.35, bonus: 1.1, effect: 'speed',
    titles: [
      'The Old Man and the Sea', 'Robinson Crusoe', 'Treasure Island', 'Moby Dick', 'Around the World in Eighty Days',
      'Twenty Thousand Leagues Under the Seas', 'The Little Prince', 'Tirant lo Blanc', 'Don Quixote', 'The Odyssey',
      'Gulliver\'s Travels', 'Journey to the Centre of the Earth', 'The Call of the Wild', 'Heart of Darkness', 'Into the Wild',
    ],
  },
  {
    id: 'cd', name: 'Records', item: 'note', costGrowth: 1.35, bonus: 1.1, effect: 'bluetreri',
    titles: [
      'Abbey Road', 'Kind of Blue', 'Revolver', 'The Dark Side of the Moon', 'Rumours', 'Thriller', 'Blue Train',
      'Pet Sounds', 'London Calling', 'Nevermind', 'OK Computer', 'Back in Black', 'Purple Rain', 'Graceland', 'Blue',
    ],
  },
  {
    id: 'album', name: 'Albums', item: 'photo', costGrowth: 1.35, bonus: 1.1, effect: 'hold',
    titles: [
      'Sunsets', 'Forests', 'Beaches', 'Mountains', 'Rivers', 'Snowfall', 'Lighthouses', 'Bridges', 'Ruins', 'Stars',
      'Deserts', 'Volcanoes', 'Auroras', 'Islands', 'Horizons',
    ],
  },
];

/** Works in each collection (one per title): the library is complete with all of them. */
export const WORKS_MAX = 15;

export const workById = (id: WorkId): WorkDef => WORKS.find((w) => w.id === id)!;

/** Share of a kind's items on the map that its whole collection costs (the rest is slack: some are left behind). */
export const LIBRARY_SHARE = 0.8;

/** Title of work number `made`. */
export const workTitle = (def: WorkDef, made: number): string => def.titles[Math.min(made, def.titles.length - 1)];

