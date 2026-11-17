// The Ship tab (the dry dock): the ship's modules, each with its cost (metal, data, samples) and a button for the crew,
// and the launch: what it still needs (every module, the destination studied, the fuel in the tanks), then the button
// that ends phase II.
import { fmt } from '../../shared/format';
import { confirmModal, h } from '../../shared/ui/dom';
import { buildModule, canBuildModule, canLaunchShip, destinationKnown, launchShip, moduleMetal, rates } from '../core/economy';
import { LAUNCH_FUEL, MODULES } from '../core/ship';
import { destinationOf, STUDIES, type SampleKind } from '../core/starmap';
import { crewText, hurryButton } from './buildings';
import { DOCK_PLOT } from './desert';
import { enable, flag, num, part, set, time, type Ctx, type Tab } from './panel';

export function shipTab(ctx: Ctx): Tab {
  const list = h('div', 'list tele');
  const card = h('div', 'px-box p2-card');
  const name = h('div', 'p2-name');
  const needs = h('div', 'p2-facts');
  const launch = h('button', 'px-btn buy p2-go', 'Launch the ship');
  card.append(name, needs, launch);
  launch.addEventListener('click', () => confirmModal('Launch the ship? This ends phase II.', 'Launch', () => { if (launchShip(ctx.s)) ctx.changed(); }));
  const crew = h('div', 'p2-note');
  const rush = hurryButton(ctx);
  const act = h('div', 'p2-act');
  act.append(crew, rush.el);
  const table = h('div', 'part-table px-box p2-table p2-ship');
  const rows = MODULES.map((m) => {
    const row = h('div', 'part-row');
    const cost = h('span', 'eff p2-cost');
    const go = h('button', 'px-btn buy');
    go.addEventListener('click', () => { if (buildModule(ctx.s, m.id)) ctx.changed(); });
    const text = h('span', 'p2-attr');
    text.append(h('span', 'name', m.name), h('span', 'eff', m.note), cost);
    row.append(text, go);
    table.append(row);
    return { m, row, cost, go };
  });
  list.append(card, act, table);

  return {
    label: 'Ship',
    list,
    plot: DOCK_PLOT,
    update(s) {
      const r = rates(s);
      const built = s.modules.length;
      set(name, s.launchedAt !== null ? 'The ship is on its way' : `The ship · ${built}/${MODULES.length} modules`);
      const dest = destinationOf(s.legacy.seed);
      const lines = s.launchedAt !== null ? ['Phase III comes next: the new planet.'] : [
        `${built === MODULES.length ? '✓' : '·'} Every module built (${built}/${MODULES.length})`,
        `${destinationKnown(s) ? '✓' : '·'} The habitable system studied (${destinationKnown(s) ? dest.name : 'not found yet'}, ${Math.min(STUDIES, s.studies[dest.id])}/${STUDIES})`,
        `${s.fuel >= LAUNCH_FUEL ? '✓' : '·'} ${fmt(LAUNCH_FUEL)} L of fuel in the tanks (${fmt(Math.floor(s.fuel))}${r.capacity < LAUNCH_FUEL ? `; they hold ${fmt(Math.floor(r.capacity))}: build more tanks` : ''})`,
      ];
      if (needs.dataset.k !== lines.join('|')) { needs.dataset.k = lines.join('|'); needs.replaceChildren(...lines.map((t) => h('div', '', t))); }
      launch.hidden = s.launchedAt !== null;
      enable(launch, canLaunchShip(s));
      const busy = crewText(s);
      set(crew, busy ? `Crew: ${busy}` : 'The crew is free.');
      rush.update(s);
      for (const { m, row, cost, go } of rows) {
        const done = s.modules.includes(m.id);
        const building = s.crew?.kind === 'module' && s.crew.id === m.id;
        flag(row, 'done', done);
        const key = done ? 'done' : `${num(s.metal.toNumber())}|${num(s.data)}|${Object.keys(m.samples).map((k) => Math.floor(s.samples[k as SampleKind])).join(',')}|${r.cost}`;
        if (cost.dataset.k !== key) {
          cost.dataset.k = key;
          cost.replaceChildren(...(done ? [h('span', '', 'Built')] : [
            part(s.metal.toNumber(), moduleMetal(s, m), 'metal'),
            part(s.data, m.data, 'data'),
            ...Object.entries(m.samples).map(([k, n]) => part(s.samples[k as SampleKind], n ?? 0, k)),
            h('span', 'cost-part', time(m.seconds / r.build)),
          ]));
        }
        enable(go, canBuildModule(s, m.id));
        set(go, done ? 'Built' : building ? 'Building' : 'Build');
      }
    },
  };
}
