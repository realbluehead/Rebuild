// Balance simulator: plays on its own with a greedy strategy and prints when it reaches each milestone.
// Usage: npm run sim [-- hours [seed]]
import { UPGRADES } from '../src/content/upgrades';
import { T, TERRAINS, ZOOMS } from '../src/content/world';
import { buy, canBuy, craft, costOf, explored, goldPerSec, isComplete, stats, TICK_SEC, tick } from '../src/core/game';
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
  const bots = s.bots;
  s.bots = Array.from({ length: stats(s).explorers }, (_, j) => bots[j] ?? bots[0]);
  // Storms: roughly a tenth of the exploring happens under one, at about half speed (the body softens it).
  const sky = 1 - 0.1 * 0.5 * stats(s).armour;
  const v = goldPerSec(s, w) * sky * Math.sqrt(stats(s).stepsPerSec * sky);
  s.bots = bots;
  return v;
}
function score(id: (typeof UPGRADES)[number]['id']): number {
  const before = value();
  s.upgrades[id]++;
  const after = value();
  s.upgrades[id]--;
  return (after / before - 1) / costOf(UPGRADES.find((u) => u.id === id)!, s.upgrades[id]).toNumber();
}

for (let t = 0; t < hours * 3600; t += DT) {
  for (const id of ['book', 'cd', 'album'] as const) while (craft(s, id));
  for (;;) {
    let best = UPGRADES[0].id;
    for (const u of UPGRADES) if (score(u.id) > score(best)) best = u.id;
    if (!canBuy(s, best)) break;
    buy(s, w, best);
  }
  for (let k = 0; k < DT / TICK_SEC; k++) {
    const ev = tick(s, w, TICK_SEC);
    if (ev.zoomUnlocked && ev.zoomUnlocked > zoom) {
      zoom = ev.zoomUnlocked;
      console.log(`${fmtTime(t).padStart(12)}  ZOOM ${zoom} (${ZOOMS[zoom - 1].name}) unlocked`);
    }
  }
  while (nextPct < pctMilestones.length && explored(s, w) >= n * pctMilestones[nextPct]) {
    const st = stats(s);
    console.log(`${fmtTime(t).padStart(12)}  ${(pctMilestones[nextPct] * 100).toString().padStart(3)}% of the map · ${st.stepsPerSec.toFixed(1)} steps/s · hold ${fmt(stats(s).cargo)} · bluetreri ${fmt(s.totalGold)} · upgrades ${JSON.stringify(s.upgrades)} · works ${JSON.stringify(s.works)}`);
    nextPct++;
  }
  if (isComplete(s, w)) break;
}

console.log(`\nEnd (${fmtTime(s.playTime)}): ${(100 * explored(s, w) / n).toFixed(2)}% · ${JSON.stringify(s.upgrades)} · works ${JSON.stringify(s.works)} · items ${JSON.stringify(s.items)}`);
