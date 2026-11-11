// Simulador d'equilibri: juga sol amb una estratègia golosa i mostra quan arriba a cada fita.
// Ús: npm run sim [-- hores [seed]]
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
console.log(`Món generat en ${Math.round(performance.now() - t0)} ms`);
const counts = new Array(TERRAINS.length).fill(0);
let specials = 0;
for (let i = 0; i < w.terrain.length; i++) { counts[w.terrain[i]]++; specials += w.special[i]; }
console.log('Terrenys:', TERRAINS.map((t, i) => `${t.name} ${(100 * counts[i] / w.terrain.length).toFixed(1)}%`).join(', '));
console.log(`Llocs especials: ${specials}. Terreny inicial: ${TERRAINS[w.terrain[w.cy * w.size + w.cx]].name}${w.terrain[w.cy * w.size + w.cx] < T.Rubble ? ' (!)' : ''}\n`);

const s = newGame(seed);
const n = totalCells(w);
const pctMilestones = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
let nextPct = 0;
const DT = 1; // segons per pas: prou fi per a compres
let zoom = 1;

// Valor d'una millora: quant augmenta l'or/s que arriba al campament (i, una mica, la velocitat
// d'exploració, que és el que obre el mapa) per unitat d'or gastada.
function value(): number {
  const robots = s.ringRobots;
  s.ringRobots = stats(s).explorers; // els robots nous treballaran a l'anell següent
  const v = goldPerSec(s, w) * Math.sqrt(stats(s).stepsPerSec);
  s.ringRobots = robots;
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
    buy(s, best);
  }
  for (let k = 0; k < DT / TICK_SEC; k++) {
    const ev = tick(s, w, TICK_SEC);
    if (ev.zoomUnlocked && ev.zoomUnlocked > zoom) {
      zoom = ev.zoomUnlocked;
      console.log(`${fmtTime(t).padStart(12)}  ZOOM ${zoom} (${ZOOMS[zoom - 1].name}) desbloquejat`);
    }
  }
  while (nextPct < pctMilestones.length && explored(s, w) >= n * pctMilestones[nextPct]) {
    const st = stats(s);
    console.log(`${fmtTime(t).padStart(12)}  ${(pctMilestones[nextPct] * 100).toString().padStart(3)}% del mapa · ${st.stepsPerSec.toFixed(1)} passos/s · bodega ${fmt(stats(s).cargo)} · or ${fmt(s.totalGold)} · millores ${JSON.stringify(s.upgrades)} · obres ${JSON.stringify(s.works)}`);
    nextPct++;
  }
  if (isComplete(s, w)) break;
}

console.log(`\nFinal (${fmtTime(s.playTime)}): ${(100 * explored(s, w) / n).toFixed(2)}% · ${JSON.stringify(s.upgrades)} · obres ${JSON.stringify(s.works)} · objectes ${JSON.stringify(s.items)}`);
