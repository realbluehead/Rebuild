// Route efficiency bench: plays a greedy game up to a mid-game point, then from that same state runs every discovery
// algorithm at level 0 and at its top level for a while (no purchases) and prints the bluetreri unloaded and cells explored.
// Usage: npx vite-node tools/routes.ts [-- warmHours runHours seed]
import { UPGRADES } from '../src/content/upgrades';
import { ROUTE_MAX_LEVEL, ROUTES, type RouteId } from '../src/content/routes';
import { buy, canBuy, costOf, explored, goldPerSec, stats, TICK_SEC, tick } from '../src/core/game';
import { newGame } from '../src/core/state';
import { applyPlan, createWorld } from '../src/core/world';
import { deserialize, serialize } from '../src/save/save';

const warm = Number(process.argv[2] ?? 3);
const run = Number(process.argv[3] ?? 1);
const seed = Number(process.argv[4] ?? 12345);

const w0 = createWorld(seed);
const s0 = newGame(seed);
const value = () => goldPerSec(s0, w0) * Math.sqrt(stats(s0).stepsPerSec);
for (let t = 0; t < warm * 3600; t++) {
  for (;;) {
    let best = UPGRADES[0].id;
    let bestScore = -1;
    for (const u of UPGRADES) {
      if (u.id === 'radar') continue;
      const before = value();
      s0.upgrades[u.id]++;
      const sc = (value() / before - 1) / costOf(u, s0.upgrades[u.id] - 1).toNumber();
      s0.upgrades[u.id]--;
      if (sc > bestScore) { bestScore = sc; best = u.id; }
    }
    if (!canBuy(s0, best)) break;
    buy(s0, w0, best);
  }
  for (let k = 0; k < 1 / TICK_SEC; k++) tick(s0, w0, TICK_SEC);
}
const snap = serialize(s0, 0);
console.log(`Start: ring ${s0.ring}, ${explored(s0, w0)} cells, rovers ${stats(s0).explorers}, ${s0.gold.toNumber().toFixed(0)} bluetreri\n`);

function trial(route: RouteId, level: number): [number, number] {
  const { state: s } = deserialize(JSON.parse(JSON.stringify(snap)));
  const w = createWorld(seed);
  applyPlan(w, s.plan);
  s.routes = ROUTES.map((r) => r.id);
  s.route = route;
  s.routeLevels = { [route]: level };
  const g0 = s.totalGold.toNumber();
  const c0 = explored(s, w);
  for (let t = 0; t < run * 3600; t += 1) tick(s, w, 1);
  return [s.totalGold.toNumber() - g0, explored(s, w) - c0];
}

const base = trial('circular', 0); // circular level 0 with an empty plan keeps the starting order
console.log(`legacy circular   gold ${base[0].toFixed(0).padStart(10)}  cells ${base[1]}`);
for (const r of ROUTES) {
  for (const lv of [0, 1, ROUTE_MAX_LEVEL]) {
    const [g, c] = trial(r.id, lv);
    console.log(`${r.id.padEnd(9)} lv${lv}  gold ${g.toFixed(0).padStart(10)} (${((g / base[0]) * 100).toFixed(0).padStart(3)}%)  cells ${c} (${((c / base[1]) * 100).toFixed(0)}%)`);
  }
}
