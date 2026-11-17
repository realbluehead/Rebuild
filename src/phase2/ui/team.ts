// The Team tab: the expedition's level and XP, the points it earned, and the six attributes. Each point is spent with
// one of phase I's works of the kind the attribute takes (books, records, discoveries), for good; the works show as
// pips: used, ready, or locked (padlock) until a level gives another point.
import { h } from '../../shared/ui/dom';
import { ATTRS, attrFactor, expeditionLevel } from '../core/attributes';
import { canSpendPoint, pointsFree, pointsUseful, spendPoint, worksLeft } from '../core/economy';
import type { LegacyWork } from '../core/legacy';
import { bar, enable, fill, flag, num, set, type Ctx, type Tab } from './panel';

const WORK_NAME: Record<LegacyWork, string> = { book: 'books', cd: 'records', album: 'discoveries' };

export function teamTab(ctx: Ctx): Tab {
  const list = h('div', 'list tele');
  const card = h('div', 'px-box p2-card');
  const lv = h('div', 'p2-name');
  const xp = bar();
  const points = h('div', 'p2-note');
  card.append(lv, xp.el, points);
  const table = h('div', 'part-table px-box p2-table p2-team');
  const rows = ATTRS.map((a) => {
    const row = h('div', 'part-row');
    const name = h('span', 'name', a.name);
    const eff = h('span', 'eff');
    const pips = h('span', 'p2-pips');
    const go = h('button', 'px-btn buy', '+1');
    go.addEventListener('click', () => { if (spendPoint(ctx.s, a.id)) ctx.changed(); });
    const text = h('span', 'p2-attr');
    text.append(name, eff, pips);
    row.append(h('span', 'lvl'), text, go);
    return { a, row, eff, pips, go, lvl: row.firstChild as HTMLElement };
  });
  table.append(...rows.map((r) => r.row));
  list.append(card, table);

  return {
    label: 'Team',
    list,
    update(s) {
      const e = expeditionLevel(s.xp);
      const useful = pointsUseful(s);
      set(lv, useful ? `Expedition Lv ${e.level} · ${num(e.into)}/${num(e.need)} XP` : 'Expedition · every work used');
      fill(xp.fill, useful ? e.into / e.need : 1);
      const free = useful ? pointsFree(s) : 0;
      set(points, !useful ? 'Every work brought from phase I is used: more levels give nothing.' : free > 0
        ? `${free} point${free > 1 ? 's' : ''} to spend: pick an attribute (for good)`
        : 'Each level gives a point to spend on an attribute, with one of phase I\'s works.');
      for (const { a, row, eff, pips, go, lvl } of rows) {
        const n = s.attrs[a.id];
        set(lvl, String(n));
        const left = worksLeft(s, a.id);
        set(eff, `${a.note} · ×${attrFactor(n, a.id).toFixed(2)} · ${left} ${WORK_NAME[a.work]} left`);
        // The kind's works: used by this attribute, by its pair, ready (a point to spend), locked.
        const key = `${n}|${left}|${free}`;
        if (pips.dataset.k !== key) {
          pips.dataset.k = key;
          const total = s.legacy.works[a.work];
          const other = total - left - n;
          pips.replaceChildren(...Array.from({ length: total }, (_, k) =>
            h('i', k < n ? 'used' : k < n + other ? 'other' : free > 0 ? 'ready' : 'locked')));
        }
        enable(go, canSpendPoint(s, a.id));
        flag(row, 'can', canSpendPoint(s, a.id));
      }
    },
  };
}
