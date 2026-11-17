// Phase II's field notes (the ≡ menu, and once on the first visit): how the voyage works, a short entry per system.
import { h, modal } from '../../shared/ui/dom';

const SEEN_KEY = 'rebuild:p2-notes-seen';

const NOTES: [string, string][] = [
  ['The goal', 'Build the Black siphon in the dry dock (10 modules, on the Ship tab), find and study the habitable system, fill the tanks and launch.'],
  ['The crew', 'One crew builds one thing at a time: building levels and ship modules. While it is busy, queue up to 5 jobs: they start in order, each paid for when it starts. Hurry finishes the job under way now, for metal.'],
  ['Metal and power', 'Metal scraps are the currency: the rovers salvage them, faster with more research and studies. The mirror tower powers the base: short of power, everything slows down.'],
  ['Fuel', 'The refinery turns the bluetreri in the sump (what phase I brought) into fuel for the tanks. When the sump runs dry, buy more with metal on the Fuel tab.'],
  ['Probes and the map', 'The hangar launches probes to the target picked on the Map, burning fuel. They come back with data and studies: the 1st tells the star and its sample kind, from the 2nd they bring samples, the 3rd tells whether it can be lived on. The telescope sees farther systems, the antenna hears farther, better probes reach farther.'],
  ['The lab', 'Research spends data and some of the pages, notes and photos from phase I; each one speeds something up for good. Queue up to 5.'],
  ['The team', "Each expedition level gives a point: spend it with one of phase I's works on an attribute. It is for good."],
  ['While you are away', 'Everything goes on: the queues keep the crew and the lab busy, and a report tells what happened when you come back.'],
];

export function showNotes(): void {
  const m = modal('p2-notes');
  m.box.append(h('div', 'name', 'Field notes'));
  for (const [title, text] of NOTES) m.box.append(h('div', 'p2-note-title', title), h('div', 'p2-note-text', text));
  m.addClose('OK');
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* no storage */ }
}

/** Shows the notes if this browser never has (a new expedition). */
export function showNotesOnce(): void {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* no storage */ }
  if (!seen) showNotes();
}
