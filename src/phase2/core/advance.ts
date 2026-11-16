// Time in phase II, exact for any step: between events every rate is constant (core/economy.ts), so the state moves
// on in straight lines from one event to the next (a build or research done, a probe back, a launch, the tanks full,
// the sump empty). Playing, reloading after a day away or stepping a second at a time all end the same.
import { canTarget, jobDone, metalNow, probeBack, rates, researchDone, setMetal, systemsOf, tripSeconds, FUEL_PER_BLUETRERI } from './economy';
import type { P2State } from './state';
import { D } from '../../shared/decimal';

/** Times this close count as now (seconds). */
const EPS = 1e-6;

/** Moves `s` on by `dt` seconds of play (stops at the ship's launch). Returns the events it went through. */
export function advance(s: P2State, dt: number): number {
  let left = Math.max(0, dt);
  let events = 0;
  for (let guard = 0; left > 0 && s.launchedAt === null && guard < 1e7; guard++) {
    const r = rates(s);
    const sump = s.bluetreri.toNumber();
    const filling = s.fuel < r.capacity - EPS && sump > 0 ? r.fuel : 0;
    const aiming = s.target !== null && canTarget(s, s.target, r);
    let t = left;
    if (s.crew) t = Math.min(t, s.crew.left / r.build);
    if (s.lab) t = Math.min(t, s.lab.left / r.research);
    for (const p of s.probes) t = Math.min(t, p.left);
    if (filling > 0) {
      t = Math.min(t, (r.capacity - s.fuel) / filling, (sump * FUEL_PER_BLUETRERI) / filling);
    }
    if (aiming && r.launchFuel <= r.capacity) {
      const fuelIn = s.fuel >= r.launchFuel ? 0 : filling > 0 ? (r.launchFuel - s.fuel) / filling : Infinity;
      t = Math.min(t, Math.max(s.launchWait, fuelIn));
    }
    t = Math.max(0, t);

    // Straight lines up to the event.
    setMetal(s, metalNow(s) + r.metal * t);
    if (filling > 0) {
      s.fuel = Math.min(r.capacity, s.fuel + filling * t);
      s.bluetreri = D(Math.max(0, sump - (filling * t) / FUEL_PER_BLUETRERI));
      if (s.fuel >= r.capacity - EPS) s.fuel = r.capacity;
      if (s.bluetreri.lt(EPS)) s.bluetreri = D(0);
    }
    s.launchWait = Math.max(0, s.launchWait - t);
    if (s.crew) s.crew.left -= t * r.build;
    if (s.lab) s.lab.left -= t * r.research;
    for (const p of s.probes) p.left -= t;
    s.playTime += t;
    left -= t;

    // The events due now.
    if (s.crew && s.crew.left <= EPS) { jobDone(s); events++; }
    if (s.lab && s.lab.left <= EPS) { researchDone(s); events++; }
    const back = s.probes.filter((p) => p.left <= EPS);
    if (back.length) {
      s.probes = s.probes.filter((p) => p.left > EPS);
      const systems = systemsOf(s);
      for (const p of back) { probeBack(s, systems[p.system], r); events++; }
    }
    if (aiming && s.launchWait <= EPS && s.fuel >= r.launchFuel - EPS * Math.max(1, r.fuel)) {
      s.fuel = Math.max(0, s.fuel - r.launchFuel);
      s.launchWait = r.launchEvery;
      s.probes.push({ system: s.target!, left: tripSeconds(systemsOf(s)[s.target!], r) });
      events++;
    }
  }
  return events;
}
