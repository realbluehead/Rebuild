// Phase II's balance simulator: plays phase II on its own from the sample legacy (src/phase2/dev/sample-legacy.json,
// the end of a whole simulated phase I) with a greedy strategy and prints when it reaches each milestone.
// Usage: npm run sim2 [-- hours]   STRAT=balanced|<attribute> (puts every point it can into that one first, the rest
// round-robin; STRAT=all runs every strategy and prints one SUMMARY line each). STEP=<s> the bot's think step (60).
import sample from '../src/phase2/dev/sample-legacy.json';
import { advance } from '../src/phase2/core/advance';
import { ATTRS, type Attr } from '../src/phase2/core/attributes';
import { BUILDING_IDS, TOP_LEVEL } from '../src/phase2/core/curves';
import {
  buildModule, canBuildModule, canLaunchShip, canResearch, canSpendPoint, canTarget, destinationKnown, launchShip, level,
  moduleMetal, pointsFree, probeData, rates, research, setTarget, shipBuilt, spendPoint, systemsOf, upgrade, upgradeCost,
} from '../src/phase2/core/economy';
import type { Legacy } from '../src/phase2/core/legacy';
import { TECHS } from '../src/phase2/core/research';
import { MODULES } from '../src/phase2/core/ship';
import { destinationOf, STUDIES, type SampleKind } from '../src/phase2/core/starmap';
import { newPhase2, type P2State } from '../src/phase2/core/state';
import { fmt, fmtTime } from '../src/shared/format';

const hours = Number(process.argv[2] ?? 120);
const STEP = Number(process.env.STEP ?? 60);

function spendPoints(s: P2State, strat: string): void {
  const order = ATTRS.map((a) => a.id);
  while (pointsFree(s) > 0) {
    let pick: Attr | undefined;
    if (strat !== 'balanced' && canSpendPoint(s, strat as Attr)) pick = strat as Attr;
    else pick = order.filter((a) => canSpendPoint(s, a)).sort((a, b) => s.attrs[a] - s.attrs[b])[0];
    if (!pick) return;
    spendPoint(s, pick);
  }
}

/** The sample kind the next module lacks most, if any. */
function neededKind(s: P2State): SampleKind | null {
  const next = MODULES.filter((m) => !s.modules.includes(m.id) && s.crew?.id !== m.id)[0];
  if (!next) return null;
  let worst: SampleKind | null = null, gap = 0;
  for (const [k, n] of Object.entries(next.samples) as [SampleKind, number][]) {
    if (n - s.samples[k] > gap) { gap = n - s.samples[k]; worst = k; }
  }
  return worst;
}

function aim(s: P2State): void {
  // Ship built and its destination known: the probes stop, so the tanks fill for the launch.
  if (shipBuilt(s) && destinationKnown(s)) { setTarget(s, null); return; }
  const r = rates(s);
  const ok = systemsOf(s).filter((x) => canTarget(s, x.id, r));
  const dest = destinationOf(s.legacy.seed);
  const pick =
    ok.find((x) => x.id === dest.id && s.studies[x.id] < STUDIES) ??
    ok.filter((x) => s.studies[x.id] < STUDIES).sort((a, b) => a.distance - b.distance)[0] ??
    (() => {
      const k = neededKind(s);
      const pool = k ? ok.filter((x) => x.kind === k) : [];
      return (pool.length ? pool : ok).sort((a, b) => probeData(b, r) - probeData(a, r))[0];
    })();
  if (pick && s.target !== pick.id) setTarget(s, pick.id);
}

function act(s: P2State, strat: string, log: (m: string) => void): void {
  spendPoints(s, strat);
  for (const t of TECHS) if (canResearch(s, t.id)) { research(s, t.id); log(`research ${t.name} (tier ${t.tier})`); break; }
  aim(s);
  if (!s.crew) {
    const mod = MODULES.find((m) => canBuildModule(s, m.id));
    if (mod) { buildModule(s, mod.id); log(`module ${mod.name} (${fmt(moduleMetal(s, mod))} metal)`); }
    else {
      const r = rates(s);
      const ids = BUILDING_IDS.filter((id) => upgradeCost(s, id) !== null);
      const pick = r.power < 1 && upgradeCost(s, 'power') !== null ? 'power' : ids.sort((a, b) => upgradeCost(s, a)! - upgradeCost(s, b)!)[0];
      if (pick && upgrade(s, pick)) log(`${pick} → ${s.levels[pick] + 1}`);
    }
  }
  if (canLaunchShip(s)) launchShip(s);
}

function play(strat: string, verbose: boolean): P2State {
  const s = newPhase2({ ...(sample as Legacy), at: 0 });
  const log = (m: string) => { if (verbose) console.log(`${fmtTime(s.playTime).padStart(9)}  ${m}`); };
  let nextReport = 0;
  let lastLevel = 1;
  allPoints = null;
  while (s.playTime < hours * 3600 && s.launchedAt === null) {
    act(s, strat, log);
    if (level(s) > lastLevel && level(s) >= 46 && allPoints === null) allPoints = s.playTime;
    if (level(s) > lastLevel) { lastLevel = level(s); if (lastLevel % 5 === 0) log(`expedition level ${lastLevel}`); }
    if (destinationKnown(s) && !(s as { told?: boolean }).told) { (s as { told?: boolean }).told = true; log('destination fully studied'); }
    if (verbose && s.playTime >= nextReport) {
      const r = rates(s);
      console.log(`--- ${fmtTime(s.playTime)}: metal ${fmt(s.metal)} (+${fmt(r.metal * 3600)}/h) · fuel ${fmt(s.fuel)}/${fmt(r.capacity)} · data ${fmt(s.data)} · power ${Math.round(r.power * 100)}% · lv ${BUILDING_IDS.map((id) => s.levels[id]).join('/')} · research ${s.researched.length} · modules ${s.modules.length} · level ${level(s)} · probes out ${s.probes.length} · studies ${s.studies.join('')}`);
      nextReport += 5 * 3600;
    }
    advance(s, STEP);
  }
  return s;
}

/** When the expedition reached level 46 (all 45 points). */
let allPoints: number | null = null;

const summary = (strat: string, s: P2State) =>
  `SUMMARY ${strat.padEnd(12)} ${s.launchedAt !== null ? `launched at ${fmtTime(s.launchedAt)}` : `not launched in ${hours} h`} · level ${level(s)}${allPoints !== null ? ` (45 points at ${fmtTime(allPoints)})` : ''} · lv ${BUILDING_IDS.map((id) => `${s.levels[id]}/${TOP_LEVEL[id]}`).join(' ')} · research ${s.researched.length}/${TECHS.length} · modules ${s.modules.length}/${MODULES.length} · attrs ${ATTRS.map((a) => s.attrs[a.id]).join('/')}`;

const strat = process.env.STRAT ?? 'balanced';
if (strat === 'all') for (const x of ['balanced', ...ATTRS.map((a) => a.id)]) console.log(summary(x, play(x, false)));
else console.log(summary(strat, play(strat, true)));
