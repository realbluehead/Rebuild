// The Library's sections. The Library tab shows up at explorer level LIBRARY_LEVEL with every section locked; each one
// is built for bluetreri once the explorer level and its items (collected, not spent: pages for the Bookshelf, notes
// for the Jukebox, photos for the Spiral of ages, scraps of lore found for the Decoder) are there, and takes a while to
// build (game time: it goes on while you are away). A collection's works can only be made once its section stands.
import type { ItemId, WorkId } from './collection';

export type SectionId = 'shelf' | 'spiral' | 'jukebox' | 'decoder';

export interface SectionDef {
  id: SectionId;
  name: string;
  /** The collection it holds (none for the Decoder). */
  work?: WorkId;
  /** Items it asks to have collected; the Decoder asks for scraps of lore found instead. */
  item?: ItemId;
  need: number;
  level: number;
  gold: number;
  /** Seconds of game time it takes to build. */
  sec: number;
  /** What it does, for the Library's help (shown once it is built). */
  help: string;
}

export const LIBRARY_LEVEL = 16;

export const SECTIONS: readonly SectionDef[] = [
  { id: 'shelf', name: 'Bookshelf', work: 'book', item: 'page', need: 10, level: 17, gold: 300, sec: 120,
    help: 'Books are made from pages on the Goals tab (Works). Each one makes every rover faster, for good. Tap a book to read its title.' },
  { id: 'spiral', name: 'Spiral of ages', work: 'album', item: 'photo', need: 10, level: 20, gold: 800, sec: 240,
    help: 'Discoveries, the old world\'s inventions, are made from photos. Each one makes the holds bigger. They light up the spiral from the fire outwards: tap one for its name and year.' },
  { id: 'jukebox', name: 'Jukebox', work: 'cd', item: 'note', need: 6, level: 21, gold: 1500, sec: 360,
    help: 'Records are made from notes. Each one brings more bluetreri from every cell. Tap a title card to play the record.' },
  { id: 'decoder', name: 'Decoder', need: 3, level: 23, gold: 3000, sec: 480,
    help: 'It reads the DNA left on the scraps of lore found and prints the planet\'s history: 20 sheets in all. Each sheet needs more scraps found than the last (they are not used up; the funnel shows the scraps found towards the next sheet) and takes a little longer to print. Left on, it prints one sheet after another, also while you are away, and switches itself off when it has too few scraps for the next. The sheets go to the binder under it: tap it to open, the arrows turn the pages, tap a page to read it.' },
];

export const sectionById = (id: SectionId): SectionDef => SECTIONS.find((d) => d.id === id)!;
/** The section that holds collection `id`. */
export const sectionOfWork = (id: WorkId): SectionDef => SECTIONS.find((d) => d.work === id)!;
