// Balance simulator: plays on its own with a greedy strategy and prints when it reaches each milestone.
// Usage: npm run sim [-- hours [seed]]
import { UPGRADES, type StatId } from '../src/content/upgrades';
import { T, TERRAINS, ZOOMS } from '../src/content/world';
import { ROUTES } from '../src/content/routes';
import { WORKS_MAX } from '../src/content/collection';
import { buy, canBuy, canUnlockRoute, canUpgradeRoute, chooseRoute, craft, levelOf, levelOn, newRover, routeLevelNeeded, routeLevel, unlockRoute, upgradeRoute, costOf, explored, explorerLevel, goldPerSec, isComplete, fleetSpeed, stats, TICK_SEC, tick } from '../src/core/game';
import { newGame } from '../src/core/state';
import { fmt, fmtTime } from '../src/core/format';
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
let zoom = 1;

// Value of an upgrade: how much it raises the bluetreri/s reaching camp (and, a little, the exploring
// speed, which is what opens the map) per unit of bluetreri spent.
function value(): number {
  // New rovers will work on the next ring: value them as if they were already there.
  // (They join with the weakest rover's levels.)
  const bots = s.bots;
  s.bots = Array.from({ length: stats(s).explorers }, (_, j) => bots[j] ?? newRover({ ...s, bots }));
  // Storms: roughly a tenth of the exploring happens under one, at about half speed (the body softens it).
  let gold = 0;
  let steps = 0;
  for (const b of s.bots) {
    const all = s.bots;
    s.bots = [b];
    const sky = 1 - 0.1 * 0.5 * stats(s, b).armour;
    gold += goldPerSec(s, w) * sky;
    steps += stats(s, b).speed * sky;
    s.bots = all;
  }
  s.bots = bots;
  return gold * Math.sqrt(steps);
}
/** Gain per bluetreri of one more level of `id` on rover `j` (the rover count: for the fleet). */
function score(id: StatId, j: number): number {
  const b = s.bots[j];
  const own = id !== 'explorers';
  const before = value();
  if (own) b.up[id]++; else s.upgrades[id]++;
  const after = value();
  if (own) b.up[id]--; else s.upgrades[id]--;
  return (after / before - 1) / costOf(UPGRADES.find((u) => u.id === id)!, levelOn(s, id, own ? b : undefined)).toNumber();
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
    const next = ROUTES.find((r) => !s.routes.includes(r.id));
    if (next && canUnlockRoute(s, w, next.id)) {
      unlockRoute(s, w, next.id);
      chooseRoute(s, next.id);
      mark(t, `route ${next.name}`);
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
  for (;;) {
    let best: StatId = 'explorers';
    let bestJ = 0;
    let bestScore = score(best, 0);
    for (const u of UPGRADES) {
      if (u.id === 'explorers') continue;
      for (let j = 0; j < s.bots.length; j++) {
        const sc = score(u.id, j);
        if (sc > bestScore) { bestScore = sc; best = u.id; bestJ = j; }
      }
    }
    if (!canBuy(s, best, 1, bestJ)) break;
    // Saving up: once the next route is open (explorer level and items) only spend what is above its price.
    const saveFor = useRoutes ? ROUTES.find((r) => !s.routes.includes(r.id)) : undefined;
    if (saveFor && levelOf(s, w) >= routeLevelNeeded(w, saveFor.id)
      && Object.entries(saveFor.items).every(([k, q]) => s.items[k as keyof typeof s.items] >= (q ?? 0))
      && s.gold.sub(costOf(UPGRADES.find((u) => u.id === best)!, levelOn(s, best, best === 'explorers' ? undefined : s.bots[bestJ]))).lt(saveFor.gold)) break;
    buy(s, w, best, 1, bestJ);
    if (best === 'explorers') mark(t, `rover #${stats(s).explorers}`);
  }
  for (let k = 0; k < DT / TICK_SEC; k++) {
    const ev = tick(s, w, TICK_SEC);
    if (ev.zoomUnlocked && ev.zoomUnlocked > zoom) {
      zoom = ev.zoomUnlocked;
      mark(t, `ZOOM ${zoom} (${ZOOMS[zoom - 1].name})`);
    }
  }
  while (nextPct < pctMilestones.length && explored(s, w) >= n * pctMilestones[nextPct]) {
    console.log(`${fmtTime(t).padStart(12)}  ${(pctMilestones[nextPct] * 100).toString().padStart(3)}% of the map · ${fleetSpeed(s).toFixed(1)} steps/s · hold ${s.bots.map((b) => fmt(stats(s, b).cargo)).join('/')} · bluetreri ${fmt(s.totalGold)} · rovers ${s.bots.map((b) => Object.values(b.up).join(',')).join(' | ')} · works ${JSON.stringify(s.works)}`);
    nextPct++;
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
