// Balance simulator: plays on its own with a greedy strategy and prints when it reaches each milestone.
// Usage: npm run sim [-- hours [seed]]
import { SCOUT_SHARE, ROVER_KINDS, UPGRADES, type StatId } from '../src/content/upgrades';
import { GOALS } from '../src/content/goals';
import { T, TERRAINS, ZOOMS } from '../src/content/world';
import { ROUTES } from '../src/content/routes';
import { WORKS_MAX } from '../src/content/collection';
import { carried, rateParts, itemsCollected, canClaim, claimGoal, build, buy, canBuild, canBuy, canUnlockRoute, canUpgradeRoute, chooseRoute, craft, hasPart, levelOf, levelOn, routeLevelNeeded, routeLevel, unlockRoute, upgradeRoute, costOf, explored, explorerLevel, isComplete, fleetSpeed, plannedRate, stats, TICK_SEC, tick } from '../src/core/game';
import { newGame } from '../src/core/state';
import { fmt, fmtTime } from '../src/core/format';
import { RateMeter } from '../src/core/rate';
import { createWorld, totalCells } from '../src/core/world';

const hours = Number(process.argv[2] ?? 24);
const seed = Number(process.argv[3] ?? 12345);

const t0 = performance.now();
const w = createWorld(seed);
console.log(`World generated in ${Math.round(performance.now() - t0)} ms`);
const counts = new Array(TERRAINS.length).fill(0);
let specials = 0;
for (let i = 0; i < w.terrain.length; i++) { counts[w.terrain[i]]++; specials += w.special[i]; }
console.log('Terrain:', TERRAINS.map((t, i) => `${t.name} ${(100 * counts[i] / w.terrain.length).toFixed(1)}%`).join(', '));
console.log(`Deposits: ${specials}. Starting terrain: ${TERRAINS[w.terrain[w.cy * w.size + w.cx]].name}${w.terrain[w.cy * w.size + w.cx] < T.Rubble ? ' (!)' : ''}\n`);

const s = newGame(seed);
const n = totalCells(w);
const pctMilestones = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
let nextPct = 0;
const DT = 1; // seconds per step: fine enough for purchases
/** RATECHECK=1: every RC_WINDOW seconds, compare the rate shown at the top (`goldPerSec`, averaged) with what really
 *  arrived at camp ("arrived") and what the rovers dug, carried or not ("mined"). */
const rateCheck = !!process.env.RATECHECK;
const RC_WINDOW = 1800;
const meter = new RateMeter(0, 0);
const rc = { meter: 0, est: 0, gold0: 0, carried0: 0, estS: 0, estM: 0, ex0: 0, dug0: 0, doing: {} as Record<string, number> };
let zoom = 1;

// Value of an upgrade: how much it raises the bluetreri/s reaching camp (and, a little, the exploring
// speed, which is what opens the map) per unit of bluetreri spent.
const value = (): number => plannedRate(s, w) * Math.sqrt(stats(s).speed);
/** Gain per bluetreri of one more level of `id` on rover `j`. The Hauler's parts are not in the estimate: it gets the
 *  Scout's engine and hold levels at a tenth of the score, so it keeps up. */
function score(id: StatId, j: number): number {
  const b = s.bots[j];
  if (!hasPart(b, id)) return -1;
  const cost = costOf(UPGRADES.find((u) => u.id === id)!, levelOn(s, id, b)).toNumber();
  if (b.kind === 'hauler') return b.up[id] < s.bots[0].up[id] ? 0.1 / cost : -1;
  const before = value();
  b.up[id]++;
  const after = value();
  b.up[id]--;
  return (after / before - 1) / cost;
}

/** Routes: the player unlocks each route as soon as it can (in order, the next one being better), switches to it and
 *  levels the one in use (NOROUTES=1 keeps Random all game). */
const useRoutes = !process.env.NOROUTES;
/** Big advances, for the timeline at the end: route unlocks and levels, new rovers, zooms, finished collections. */
const big: [number, string][] = [];
const mark = (t: number, what: string) => {
  const lv = explorerLevel(explored(s, w), n).level;
  big.push([t, `${what} (Lv ${lv})`]);
  console.log(`${fmtTime(t).padStart(12)}  * ${what} (Lv ${lv})`);
};

for (let t = 0; t < hours * 3600; t += DT) {
  if (useRoutes) {
    // The Scavenger is for items: the sim does not follow it, and only buys it with spare bluetreri (5× its price).
    const next = ROUTES.find((r) => !s.routes.includes(r.id) && r.id !== 'scavenge');
    if (next && canUnlockRoute(s, w, next.id)) {
      unlockRoute(s, w, next.id);
      chooseRoute(s, next.id);
      mark(t, `route ${next.name}`);
    }
    const scav = ROUTES.find((r) => r.id === 'scavenge')!;
    if (canUnlockRoute(s, w, 'scavenge') && s.gold.gte(5 * scav.gold)) {
      unlockRoute(s, w, 'scavenge');
      mark(t, `route ${scav.name}`);
    }
    if (canUpgradeRoute(s, w, s.route)) {
      upgradeRoute(s, w, s.route);
      mark(t, `route ${s.route} lv${routeLevel(s, s.route)}`);
    }
  }
  for (const id of ['book', 'cd', 'album'] as const) {
    while (craft(s, w, id)) {
      if (process.env.WORKLOG) console.log(`  ${id} #${s.works[id]} at Lv ${explorerLevel(explored(s, w), n).level}`);
      if (s.works[id] === WORKS_MAX) mark(t, `${id} collection complete`);
    }
  }
  // Goals: every tier as soon as it is reached.
  for (const g of GOALS) while (canClaim(s, w, g.id)) { claimGoal(s, w, g.id); mark(t, `${g.name} tier ${s.goals[g.id]}`); }
  // New rovers: as soon as they can be built.
  for (const k of ROVER_KINDS) {
    if (canBuild(s, w, k.id)) {
      build(s, w, k.id);
      mark(t, k.name);
    }
  }
  for (;;) {
    let best: StatId = 'speed';
    let bestJ = 0;
    let bestScore = -Infinity;
    for (const u of UPGRADES) {
      for (let j = 0; j < s.bots.length; j++) {
        const sc = score(u.id, j);
        if (sc > bestScore) { bestScore = sc; best = u.id; bestJ = j; }
      }
    }
    if (bestScore < 0 || !canBuy(s, best, 1, bestJ)) break;
    // Saving up for the next rover once its level is reached.
    const nextKind = ROVER_KINDS.find((k) => !s.bots.some((b) => b.kind === k.id));
    if (nextKind && levelOf(s, w) >= nextKind.level && s.gold.sub(costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, s.bots[bestJ]))).lt(nextKind.gold)) break;
    // Saving up: once the next route is open (explorer level and items) only spend what is above its price.
    const saveFor = useRoutes ? ROUTES.find((r) => !s.routes.includes(r.id) && r.id !== 'scavenge') : undefined;
    if (saveFor && levelOf(s, w) >= routeLevelNeeded(w, saveFor.id)
      && Object.entries(saveFor.items).every(([k, q]) => itemsCollected(s, w)[k as keyof typeof s.items] >= (q ?? 0))
      && s.gold.sub(costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, s.bots[bestJ]))).lt(saveFor.gold)) break;
    buy(s, w, best, 1, bestJ);
  }
  if (rateCheck) {
    const p = rateParts(s, w);
    rc.est += (p.scout + p.miner) * DT;
    rc.meter += meter.rate * DT;
    rc.estS += p.scout * DT;
    rc.estM += p.miner * DT;
    // What each rover is doing this second.
    s.bots.forEach((b, j) => {
      const full = b.cargo >= stats(s, b).cargo * (1 - 1e-9);
      const what = b.kind === 'hauler' ? b.trip : b.trip !== 'explore' && b.trip !== 'detour' ? b.trip : full ? 'FULL' : b.kind === 'miner' && b.walked === 1 ? 'wait' : 'work';
      const key = `${b.kind[0]}:${what}`;
      rc.doing[key] = (rc.doing[key] ?? 0) + DT;
      void j;
    });
  }
  for (let k = 0; k < DT / TICK_SEC; k++) {
    const ev = tick(s, w, TICK_SEC);
    if (rateCheck) meter.feed(TICK_SEC, ev.deposited, carried(s));
    if (ev.zoomUnlocked && ev.zoomUnlocked > zoom) {
      zoom = ev.zoomUnlocked;
      mark(t, `ZOOM ${zoom} (${ZOOMS[zoom - 1].name})`);
    }
  }
  while (nextPct < pctMilestones.length && explored(s, w) >= n * pctMilestones[nextPct]) {
    console.log(`${fmtTime(t).padStart(12)}  ${(pctMilestones[nextPct] * 100).toString().padStart(3)}% of the map · ${fleetSpeed(s).toFixed(1)} steps/s · hold ${s.bots.map((b) => fmt(stats(s, b).cargo)).join('/')} · dug ${(100 * s.dug / n).toFixed(1)}% · bluetreri ${fmt(s.totalGold)} · rovers ${s.bots.map((b) => `${b.kind[0]}:${Object.values(b.up).join(',')}`).join(' | ')} · works ${JSON.stringify(s.works)}`);
    nextPct++;
  }
  if (rateCheck && (t + DT) % RC_WINDOW === 0) {
    const got = s.totalGold.toNumber() - rc.gold0;
    const made = got + carried(s) - rc.carried0;
    const est = rc.est / RC_WINDOW;
    const storms = s.weather.storms.length;
    const loot = stats(s).loot;
    const ex = explored(s, w);
    const scoutMade = SCOUT_SHARE * loot * (w.goldPrefix[Math.floor(ex)] - w.goldPrefix[Math.floor(rc.ex0)]) / RC_WINDOW;
    const minerMade = (1 - SCOUT_SHARE) * loot * (w.goldPrefix[Math.floor(s.dug)] - w.goldPrefix[Math.floor(rc.dug0)]) / RC_WINDOW;
    console.log(`  parts  scout model ${fmt(rc.estS / RC_WINDOW)} real ${fmt(scoutMade)} · miner model ${fmt(rc.estM / RC_WINDOW)} real ${fmt(minerMade)} · gap scout-dug ${fmt(ex - s.dug)} cells · ${Object.entries(rc.doing).map(([k, v]) => `${k} ${(100 * v / RC_WINDOW).toFixed(0)}%`).join(' ')}`);
    rc.estS = 0; rc.estM = 0; rc.doing = {}; rc.ex0 = ex; rc.dug0 = s.dug;
    console.log(`RATE ${fmtTime(t + DT).padStart(10)}  meter ${fmt(rc.meter / RC_WINDOW).padStart(8)}/s (${(got / RC_WINDOW / (rc.meter / RC_WINDOW) * 100).toFixed(0).padStart(4)}%)  estimate ${fmt(est).padStart(8)}/s  arrived ${fmt(got / RC_WINDOW).padStart(8)}/s (${(got / RC_WINDOW / est * 100).toFixed(0).padStart(4)}%)  mined ${fmt(made / RC_WINDOW).padStart(8)}/s (${(made / RC_WINDOW / est * 100).toFixed(0).padStart(4)}%)  rovers ${s.bots.map((b) => b.kind[0]).join('')} storms ${storms}`);
    rc.est = 0;
    rc.meter = 0;
    rc.gold0 = s.totalGold.toNumber();
    rc.carried0 = carried(s);
  }
  if (isComplete(s, w)) break;
}

// Gaps between big advances (the goal: something new every couple of hours of play, a bit more each time).
console.log('\nBig advances:');
let prev = 0;
for (const [t, what] of big) {
  console.log(`${fmtTime(t).padStart(12)}  (+${fmtTime(t - prev).padStart(10)})  ${what}`);
  prev = t;
}
console.log(`\nEnd (${fmtTime(s.playTime)}): ${(100 * explored(s, w) / n).toFixed(2)}% · rovers ${s.bots.map((b) => JSON.stringify(b.up)).join(' ')} · works ${JSON.stringify(s.works)} · items ${JSON.stringify(s.items)}`);
