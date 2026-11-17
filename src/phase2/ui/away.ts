// "While you were away": the report shown on coming back to phase II after AWAY_MIN_SEC or more (core/away.ts), like
// phase I's offline report: metal and data, what the crew built, the lab researched and the probes found, and what
// the crew and the lab are doing now (or that they stand idle).
import { h, modal } from '../../shared/ui/dom';
import { fmtTime } from '../../shared/format';
import type { AwaySummary } from '../core/away';
import { techById } from '../core/research';
import { moduleById } from '../core/ship';
import type { P2State } from '../core/state';
import { BUILDINGS, crewText } from './buildings';
import { num } from './panel';

export function showAway(seconds: number, a: AwaySummary, s: P2State): void {
  const lines: string[] = [];
  const sign = (x: number) => (x >= 0 ? `+${num(x)}` : `−${num(-x)}`);
  lines.push(`Metal ${sign(a.metal)} · data ${sign(a.data)} (after what was spent)`);
  if (a.levels.length) lines.push(`Built: ${a.levels.map(([id, , to]) => `${BUILDINGS.find((b) => b.id === id)!.tab} Lv ${to}`).join(', ')}`);
  if (a.modules.length) lines.push(`Ship modules: ${a.modules.map((id) => moduleById(id)?.name ?? '?').join(', ')}`);
  if (a.researched.length) lines.push(`Research done: ${a.researched.map((id) => techById(id)?.name ?? '?').join(', ')}`);
  if (a.studies > 0) lines.push(`Studies of star systems: +${a.studies}`);
  if (a.samples.length) lines.push(`Samples: ${a.samples.map(([k, n]) => `+${n} ${k}`).join(', ')}`);
  if (a.levelsUp > 0) lines.push(`Expedition +${a.levelsUp} level${a.levelsUp > 1 ? 's' : ''}`);
  const busy = crewText(s);
  lines.push(busy ? `The crew: ${busy}${s.queue.length ? ` (+${s.queue.length} queued)` : ''}` : 'The crew stands idle: give it a job (or queue several).');
  lines.push(s.lab ? `The lab: ${techById(s.lab.id)?.name ?? '?'}${s.labQueue.length ? ` (+${s.labQueue.length} queued)` : ''}` : 'The lab stands idle.');
  const m = modal();
  m.box.append(h('div', 'name', `While you were away (${fmtTime(Math.round(seconds))})`), ...lines.map((t) => h('div', 'p2-away-line', t)));
  m.addClose('OK');
}
