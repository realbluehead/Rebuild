// "Next:" — one line on the scene saying what most needs the player now (the first that applies, in this order), and
// the tab that does it (a tap opens it): points to spend, the crew or the lab idle, the sump dry, no target for the
// probes, the target fully studied, the samples, metal or data the next module waits for, the destination, the fuel,
// the launch.
import { canResearch, canUpgrade, canLaunchShip, crewFree, destinationKnown, moduleMetal, nextUnstudied, pointsFree, pointsUseful, rates, shipBuilt, systemsOf, targetDone, upgradeCost } from '../core/economy';
import { BUILDING_IDS } from '../core/curves';
import { techById, TECHS } from '../core/research';
import { LAUNCH_FUEL, MODULES } from '../core/ship';
import type { SampleKind } from '../core/starmap';
import type { P2State } from '../core/state';
import { BUILDINGS } from './buildings';
import { num } from './panel';

export interface NextStep { text: string; tab: string }

export function nextStep(s: P2State): NextStep | null {
  if (s.launchedAt !== null) return null;
  if (pointsFree(s) > 0 && pointsUseful(s)) return { text: `Spend ${pointsFree(s)} point${pointsFree(s) > 1 ? 's' : ''} on an attribute`, tab: 'Team' };
  if (canLaunchShip(s)) return { text: 'Everything is ready: launch the ship!', tab: 'Ship' };
  if (crewFree(s) && s.queue.length === 0) {
    const mod = MODULES.find((m) => !s.modules.includes(m.id));
    const cheap = BUILDING_IDS.filter((id) => canUpgrade(s, id)).sort((a, b) => upgradeCost(s, a)! - upgradeCost(s, b)!)[0];
    if (cheap) return { text: `The crew is idle: build ${BUILDINGS.find((b) => b.id === cheap)!.tab} Lv ${s.levels[cheap] + 1}`, tab: BUILDINGS.find((b) => b.id === cheap)!.tab };
    if (mod && s.metal.lt(moduleMetal(s, mod))) return { text: `The crew is idle: saving metal for the next build`, tab: 'Ship' };
  }
  if (!s.lab && s.labQueue.length === 0) {
    const t = TECHS.find((x) => canResearch(s, x.id));
    if (t) return { text: `The lab is idle: research ${t.name}`, tab: 'Lab' };
  }
  if (s.bluetreri.lt(1)) return { text: 'The sump is empty: buy bluetreri', tab: 'Fuel' };
  if (s.target === null) return { text: 'Pick a system to send the probes to', tab: 'Map' };
  if (targetDone(s) && nextUnstudied(s) !== null) return { text: `${systemsOf(s)[s.target].name} is fully studied: pick the next system`, tab: 'Map' };
  const mod = MODULES.find((m) => !s.modules.includes(m.id) && !(s.crew?.kind === 'module' && s.crew.id === m.id) && !s.queue.some((j) => j.kind === 'module' && j.id === m.id));
  if (mod) {
    const short = Object.entries(mod.samples).find(([k, n]) => s.samples[k as SampleKind] < (n ?? 0));
    if (short) return { text: `${mod.name} needs ${short[1]} ${short[0]} samples (have ${Math.floor(s.samples[short[0] as SampleKind])})`, tab: 'Ship' };
    if (s.data < mod.data) return { text: `${mod.name} needs ${num(mod.data)} data (have ${num(s.data)})`, tab: 'Ship' };
    return { text: `Next module: ${mod.name}`, tab: 'Ship' };
  }
  if (shipBuilt(s) && !destinationKnown(s)) return { text: 'Find and study the habitable system', tab: 'Map' };
  if (s.fuel < LAUNCH_FUEL) return { text: `Fill the tanks: ${num(s.fuel)}/${num(LAUNCH_FUEL)} L for the launch${rates(s).capacity < LAUNCH_FUEL ? ' (build more tanks)' : ''}`, tab: 'Tanks' };
  const lab = s.lab && techById(s.lab.id);
  return lab ? { text: `Researching ${lab.name}`, tab: 'Lab' } : null;
}
