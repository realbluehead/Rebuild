// The Lab tab: research under way (a bar and the time left), then every piece of research by tier: what it does, what
// it costs (data and a share of the pages, notes or photos brought over) and a button. A tier opens once enough
// research is done.
import { h } from '../../shared/ui/dom';
import { canResearch, rates, research, techCost, tierOpen } from '../core/economy';
import { techById, TECHS, TIER_SECONDS, TIERS, tierOpensAt } from '../core/research';
import { bar, enable, fill, flag, num, set, time, type Ctx, type Tab } from './panel';

const ITEM_NAME = { page: 'pages', note: 'notes', photo: 'photos' } as const;

export function labTab(ctx: Ctx): Tab {
  const list = h('div', 'list tele');
  const card = h('div', 'px-box p2-card');
  const now = h('div', 'p2-name');
  const progress = bar();
  const left = h('div', 'p2-note');
  card.append(now, progress.el, left);
  const table = h('div', 'part-table px-box p2-table p2-lab');
  const rows = TECHS.map((t) => {
    const row = h('div', 'part-row');
    const cost = h('span', 'eff');
    const go = h('button', 'px-btn buy');
    go.addEventListener('click', () => { if (research(ctx.s, t.id)) ctx.changed(); });
    row.append(h('span', 'lvl', `T${t.tier}`), h('span', 'name', t.name), cost, go);
    return { t, row, cost, go };
  });
  const heads = Array.from({ length: TIERS }, () => h('div', 'part-row head p2-tier'));
  for (let k = 0; k < TIERS; k++) table.append(heads[k], ...rows.filter((r) => r.t.tier === k + 1).map((r) => r.row));
  list.append(card, table);

  /** The research the list was last scrolled to ('' = scroll again: the tab was just opened). */
  let scrolledTo = '';
  return {
    label: 'Lab',
    list,
    shown() { scrolledTo = ''; },
    update(s) {
      const lab = s.lab;
      const r = rates(s);
      if (lab) {
        const t = techById(lab.id)!;
        set(now, `Researching ${t.name} (${t.note})`);
        fill(progress.fill, 1 - lab.left / TIER_SECONDS[t.tier - 1]);
        set(left, `${time(lab.left / r.research)} left`);
      } else {
        set(now, 'The lab is free');
        fill(progress.fill, 0);
        set(left, `${s.researched.length}/${TECHS.length} done · data ${num(s.data)}`);
      }
      for (let k = 0; k < TIERS; k++) {
        const open = tierOpen(s, k + 1);
        set(heads[k], open ? `Tier ${k + 1}` : `Tier ${k + 1} · opens after ${tierOpensAt(k + 1)} research (${s.researched.length} done)`);
      }
      for (const { t, row, cost, go } of rows) {
        const done = s.researched.includes(t.id);
        const open = tierOpen(s, t.tier);
        const c = techCost(s, t);
        flag(row, 'done', done);
        flag(row, 'locked', !open && !done);
        set(cost, done ? t.note : `${t.note} · ${num(c.data)} data${c.items ? ` · ${num(c.items)} ${ITEM_NAME[t.item]}` : ''} · ${time(TIER_SECONDS[t.tier - 1] / r.research)}`);
        enable(go, canResearch(s, t.id));
        set(go, done ? 'Done' : lab?.id === t.id ? 'Running' : !open ? '🔒' : 'Research');
      }
      // Always scrolled to what is next to research (the first not done nor running), with its tier's heading above.
      const next = rows.find((x) => !s.researched.includes(x.t.id) && s.lab?.id !== x.t.id) ?? rows.find((x) => s.lab?.id === x.t.id);
      if (next && !list.hidden && scrolledTo !== next.t.id) {
        scrolledTo = next.t.id;
        const head = heads[next.t.tier - 1];
        const first = rows.find((x) => x.t.tier === next.t.tier)!;
        const anchor = first === next ? head : next.row;
        list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - 4;
      }
    },
  };
}
