// Items rovers find on the map (pages, notes, photos) and the works made from them (books, records, discoveries).
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

// Lore: scraps of the old world (shop receipts, concert tickets, propaganda leaflets). They tell the story of the city;
// their texts come later (for now each one reads "Lore"). A scrap is found as soon as the Scout reveals its cell (no
// detour, nothing to carry), so what has been found follows from the exploration and is not saved.
export type LoreId = 'receipt' | 'ticket' | 'leaflet';
export interface LoreDef { id: LoreId; name: string; plural: string; weight: number }
export const LORE: readonly LoreDef[] = [
  { id: 'receipt', name: 'Receipt', plural: 'receipts', weight: 0.4 },
  { id: 'ticket', name: 'Concert ticket', plural: 'concert tickets', weight: 0.25 },
  { id: 'leaflet', name: 'Leaflet', plural: 'leaflets', weight: 0.35 },
];
/** Chance that a cell with nothing else hides a scrap of lore (its own random draw: items and the map do not change). */
export const LORE_CHANCE = 1 / 1500;
/** Metal scraps: one cell in METAL_CHANCE of solid ground (away from camp) hides one. They are only picked up once the
 *  Metal detector (I+D) is bought, from explorer level DETECTOR_LEVEL, for DETECTOR_GOLD bluetreri. */
export const METAL_CHANCE = 1 / 150;
export const DETECTOR_LEVEL = 35;
export const DETECTOR_GOLD = 400000;
/** Seconds the Library's Decoder takes on the first scrap of the map and on the last one; in between each scrap takes a
 *  little longer than the one before (the same ratio all along: about 1 min by the 140th of 316; ~12.7 h for a whole map). */
export const DECODE_SEC = 10;
export const DECODE_MAX_SEC = 600;
/** Texts of the scraps, by kind and scrap number (`k`: its index in the world's `loreCells`). To be written: a scrap
 *  without its own text reads "Lore". */
const LORE_TEXTS: Partial<Record<LoreId, Record<number, string>>> = {};
/** Placeholder until a scrap has its own text (paragraphs split by a blank line). */
const LORE_PLACEHOLDER = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
].join('\n\n');
export const loreText = (kind: LoreId, k: number): string => LORE_TEXTS[kind]?.[k] ?? LORE_PLACEHOLDER;

/** Explorer level needed for the k-th work (0-based) of any collection: from WORK_LEVEL_FIRST to WORK_LEVEL_LAST, evenly.
 * The last one stays below the top level so the library can be finished before the map. */
export const WORK_LEVEL_FIRST = 18;
export const WORK_LEVEL_LAST = 42;

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
  /** When each work was first made in the old world (discoveries only: the library's timeline shows them). */
  years?: readonly string[];
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
    // Discoveries: the photos pieced together show the old world's great inventions, from fire to the space station, in
    // the order they were made; the rovers learn to stow more (bigger holds). The last points at phase II (leaving the
    // planet). Its id stays 'album' (saves).
    id: 'album', name: 'Discoveries', item: 'photo', costGrowth: 1.35, bonus: 1.1, effect: 'hold',
    titles: [
      'Fire', 'The Wheel', 'Writing', 'Gunpowder', 'The Compass', 'The Printing Press', 'The Telescope',
      'The Steam Engine', 'Electricity', 'The Telephone', 'The Light Bulb', 'Flight', 'The Computer', 'The Internet',
      'The Space Station',
    ],
    years: ['400,000 BC', '3500 BC', '3200 BC', '850', '1040', '1440', '1608', '1712', '1752', '1876', '1879', '1903', '1945',
      '1969', '1998'],
  },
];

/** Works in each collection (one per title): the library is complete with all of them. */
export const WORKS_MAX = 15;

export const workById = (id: WorkId): WorkDef => WORKS.find((w) => w.id === id)!;

/** Share of a kind's items on the map that its whole collection costs (the rest is slack: some are left behind). */
export const LIBRARY_SHARE = 0.8;

/** Title of work number `made`. */
export const workTitle = (def: WorkDef, made: number): string => def.titles[Math.min(made, def.titles.length - 1)];

