// Balance simulator: plays on its own with a greedy strategy and prints when it reaches each milestone.
// Usage: npm run sim [-- hours [seed]]
// Ablations, to see what each option is worth: SKIP=<ids> (comma list) never uses those: parts (speed, tyres, body,
// cargo, drill), rovers (miner, hauler), routes (circular, trail, prospect, survey…), route levels (routelv), works (book,
// cd, album), goals (goals, or a goal id). RADAR=<share> / HOLD=<share>: buys Radar (Scout) / Hold (Scout and Miner) whenever a level
// costs under that share of the bluetreri at hand (the greedy score cannot see items, nor Hold once there is a Hauler). DIG=rich, HAUL=0.3|0.5|0.8, HAULPICK=scout|miner|auto.
// Ends with a SUMMARY line (times of the big milestones, bluetreri earned and where it was spent).
// DUMP=<file> writes the final state as a save (JSON) to try that point of the game in the UI: put it in localStorage
// 'rebuild:save' on a test origin (never the real game's).
import { writeFileSync } from 'node:fs';
import { serialize } from '../src/phase1/save/save';
import { SCOUT_SHARE, ROVER_KINDS, UPGRADES, type StatId } from '../src/phase1/content/upgrades';
import { GOALS } from '../src/phase1/content/goals';
import { T, TERRAINS, ZOOMS } from '../src/phase1/content/world';
import { ROUTES } from '../src/phase1/content/routes';
import { DETECTOR_GOLD, DETECTOR_UPS, WORKS_MAX } from '../src/phase1/content/collection';
import { SECTIONS } from '../src/phase1/content/library';
import { buildSection, canBuildSection, buyDetectorUp, canBuyDetectorUp, detectorUpCost, setDecoder, chooseDig, setHaul, buyDetector, canBuyDetector, metalCollected, carried, rateParts, itemsCollected, canClaim, claimGoal, build, buy, canBuild, canBuy, canUnlockRoute, canUpgradeRoute, chooseRoute, craft, hasPart, levelOf, levelOn, routeLevelNeeded, routeLevel, unlockRoute, upgradeRoute, costOf, explored, isComplete, fleetSpeed, plannedRate, stats, TICK_SEC, tick } from '../src/phase1/core/game';
import { newGame } from '../src/phase1/core/state';
import { fmt, fmtTime } from '../src/shared/format';
import { RateMeter } from '../src/phase1/core/rate';
import { createWorld, totalCells } from '../src/phase1/core/world';

const hours = Number(process.argv[2] ?? 24);
/** PACE=trail:1.4,prospect:2 overrides route paces (to try values without editing content/routes.ts). */
for (const kv of (process.env.PACE ?? '').split(',').filter(Boolean)) {
  const [id, v] = kv.split(':');
  const r = ROUTES.find((x) => x.id === id);
  if (r) (r as { pace: number }).pace = Number(v);
}
/** ENG=<x> sets the Engine's cost growth. */
if (process.env.ENG) (UPGRADES.find((u) => u.id === 'speed') as { costGrowth: number }).costGrowth = Number(process.env.ENG);
/** RGOLD=<x> multiplies every route's unlock and level price (RGOLD=0: free routes). */
if (process.env.RGOLD) for (const r of ROUTES) Object.assign(r, { gold: r.gold * Number(process.env.RGOLD), levelGold: r.levelGold * Number(process.env.RGOLD) });
const SKIP = new Set((process.env.SKIP ?? '').split(',').filter(Boolean));
const RADAR = Number(process.env.RADAR ?? 0);
const HOLD = Number(process.env.HOLD ?? 0);
/** Bluetreri spent, by what it went on. */
const spent: Record<string, number> = {};
const spend = (what: string, gold: number) => { spent[what] = (spent[what] ?? 0) + gold; };
/** When each milestone was reached (seconds of play). */
const at: Record<string, number> = {};
const goldAt: Record<string, number> = {};
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
/** Gain per bluetreri of one more level of `id` on rover `j`. */
function score(id: StatId, j: number): number {
  const b = s.bots[j];
  if (!hasPart(b, id) || SKIP.has(id)) return -1;
  const cost = costOf(UPGRADES.find((u) => u.id === id)!, levelOn(s, id, b)).toNumber();
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
  const lv = levelOf(s, w);
  big.push([t, `${what} (Lv ${lv})`]);
  console.log(`${fmtTime(t).padStart(12)}  * ${what} (Lv ${lv})`);
};

for (let t = 0; t < hours * 3600; t += DT) {
  if (useRoutes) {
    // The Scavenger is for items: the sim does not follow it, and only buys it with spare bluetreri (5× its price).
    const next = ROUTES.find((r) => !s.routes.includes(r.id) && r.id !== 'scavenge' && !SKIP.has(r.id));
    if (next && canUnlockRoute(s, w, next.id)) {
      spend('routes', next.gold);
      unlockRoute(s, w, next.id);
      chooseRoute(s, next.id);
      mark(t, `route ${next.name}`);
    }
    const scav = ROUTES.find((r) => r.id === 'scavenge')!;
    if (!SKIP.has('scavenge') && canUnlockRoute(s, w, 'scavenge') && s.gold.gte(5 * scav.gold)) {
      spend('routes', scav.gold);
      unlockRoute(s, w, 'scavenge');
      mark(t, `route ${scav.name}`);
    }
    if (!SKIP.has('routelv') && canUpgradeRoute(s, w, s.route)) {
      const g0 = s.gold.toNumber();
      upgradeRoute(s, w, s.route);
      spend('route levels', g0 - s.gold.toNumber());
      mark(t, `route ${s.route} lv${routeLevel(s, s.route)}`);
    }
  }
  // Library sections, as soon as they can be built (they hold the works and the Decoder).
  for (const d of SECTIONS) {
    if (!SKIP.has('library') && canBuildSection(s, w, d.id)) { spend('library', d.gold); buildSection(s, w, d.id); mark(t, `${d.name} started`); }
  }
    // The Decoder prints the scraps of lore whenever there are some waiting (it turns itself off when none are left).
  if (!s.decodeOn) setDecoder(s, w, true);
  // The Metal detector: bought with spare bluetreri (twice its price).
  if (!SKIP.has('detector') && canBuyDetector(s, w) && s.gold.gte(2 * DETECTOR_GOLD)) { spend('detector', DETECTOR_GOLD); buyDetector(s, w); mark(t, 'Metal detector'); }
  // Its upgrades, the same way.
  for (const d of DETECTOR_UPS) {
    const cost = detectorUpCost(s, d.id);
    if (!SKIP.has('detector') && cost !== null && canBuyDetectorUp(s, d.id) && s.gold.gte(2 * cost)) { spend('detector', cost); buyDetectorUp(s, d.id); mark(t, `${d.name} lv${s.detUps[d.id]}`); }
  }
  for (const id of ['book', 'cd', 'album'] as const) {
    while (!SKIP.has(id) && craft(s, w, id)) {
      if (process.env.WORKLOG) console.log(`  ${id} #${s.works[id]} at Lv ${levelOf(s, w)}`);
      if (s.works[id] === WORKS_MAX) mark(t, `${id} collection complete`);
    }
  }
  // Goals: every tier as soon as it is reached.
  for (const g of GOALS) while (!SKIP.has('goals') && !SKIP.has(g.id) && canClaim(s, w, g.id)) { claimGoal(s, w, g.id); mark(t, `${g.name} tier ${s.goals[g.id]}`); }
  // New rovers: as soon as they can be built.
  for (const k of ROVER_KINDS) {
    if (!SKIP.has(k.id) && canBuild(s, w, k.id)) {
      spend('rovers', k.gold);
      build(s, w, k.id);
      if (k.id === 'miner' && process.env.DIG === 'rich') chooseDig(s, w, 'rich');
      if (k.id === 'hauler' && (process.env.HAUL || process.env.HAULPICK)) setHaul(s, Number(process.env.HAUL ?? s.haulAt), (process.env.HAULPICK ?? s.haulPick) as typeof s.haulPick);
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
    const nextKind = ROVER_KINDS.find((k) => !s.bots.some((b) => b.kind === k.id) && !SKIP.has(k.id));
    if (nextKind && levelOf(s, w) >= nextKind.level && s.gold.sub(costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, s.bots[bestJ]))).lt(nextKind.gold)) break;
    // Saving up: once the next route is open (explorer level and items) only spend what is above its price.
    const saveFor = useRoutes ? ROUTES.find((r) => !s.routes.includes(r.id) && r.id !== 'scavenge' && !SKIP.has(r.id)) : undefined;
    if (saveFor && levelOf(s, w) >= routeLevelNeeded(w, saveFor.id)
      && Object.entries(saveFor.items).every(([k, q]) => itemsCollected(s, w)[k as keyof typeof s.items] >= (q ?? 0))
      && s.gold.sub(costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, s.bots[bestJ]))).lt(saveFor.gold)) break;
    spend(best, costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, s.bots[bestJ])).toNumber());
    buy(s, w, best, 1, bestJ);
  }
  // On a budget: Radar (RADAR=share; its gain is items, which the greedy score does not see) and Hold on the Scout and
  // Miner (HOLD=share; with a Hauler the estimate assumes nobody drives home, so it scores Hold at about nothing).
  const budget = (id: StatId, share: number, j: number) => {
    while (share > 0 && j >= 0 && j < s.bots.length && !SKIP.has(id)) {
      const c = costOf(UPGRADES.find((u) => u.id === id)!, levelOn(s, id, s.bots[j])).toNumber();
      if (c > share * s.gold.toNumber() || !canBuy(s, id, 1, j)) break;
      spend(id, c);
      buy(s, w, id, 1, j);
    }
  };
  budget('radar', RADAR, 0);
  for (const j of [0, s.bots.findIndex((b) => b.kind === 'miner')]) budget('cargo', HOLD, j);
  for (const h of [2, 6, 12]) if (t === h * 3600) goldAt[`${h}h`] = s.totalGold.toNumber();
  if (at.library === undefined && s.works.book + s.works.cd + s.works.album >= 3 * WORKS_MAX) at.library = t;
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
    at[`map${pctMilestones[nextPct] * 100}`] = t;
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
console.log(`\nEnd (${fmtTime(s.playTime)}): ${(100 * explored(s, w) / n).toFixed(2)}% · rovers ${s.bots.map((b) => JSON.stringify(b.up)).join(' ')} · works ${JSON.stringify(s.works)} · items ${JSON.stringify(s.items)} · metal scraps ${metalCollected(s, w)}/${w.metalCells.length}`);

const total = Object.values(spent).reduce((a, b) => a + b, 0);
const tm = (k: string) => (at[k] === undefined ? '—' : fmtTime(at[k]));
console.log(`SUMMARY ${process.env.SKIP ? `skip ${process.env.SKIP}` : ''}${RADAR ? ` radar ${RADAR}` : ''}${HOLD ? ` hold ${HOLD}` : ''}${process.env.DIG ? ` dig ${process.env.DIG}` : ''}${process.env.HAUL ? ` haul ${process.env.HAUL}` : ''}${process.env.HAULPICK ? ` pick ${process.env.HAULPICK}` : ''}`
  + ` | map50 ${tm('map50')} | map100 ${tm('map100')} | library ${tm('library')} | done ${isComplete(s, w) ? fmtTime(s.playTime) : '—'}`
  + ` | earned@2h ${fmt(goldAt['2h'] ?? 0)} @6h ${fmt(goldAt['6h'] ?? 0)} @12h ${fmt(goldAt['12h'] ?? 0)}`
  + ` | spent ${Object.entries(spent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / total).toFixed(1)}%`).join(', ')}`);

if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(serialize(s, Date.now())));
