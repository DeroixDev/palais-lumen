// Teich-Derby: exact long-run return of every bet on every race card form, plus a simulation of
// 2,000,000 races through the game's own drawOrder/settle (src/games/derby/rules.ts).
// Run: node scripts/rtp-derby.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const ts = readFileSync(new URL('../src/games/derby/rules.ts', import.meta.url), 'utf8');
const js = transformSync(ts, { loader: 'ts', format: 'esm' }).code;
const R = await import('data:text/javascript,' + encodeURIComponent(js));

let ok = true;
let min = 1, max = 0, sum = 0, n = 0;
R.FORMS.forEach((form, f) => {
  const card = R.makeCard(form);
  const rows = form.map((p, i) => {
    const w = R.betRtp(card, i, 'win');
    const pl = R.betRtp(card, i, 'place');
    for (const r of [w, pl]) {
      min = Math.min(min, r);
      max = Math.max(max, r);
      sum += r;
      n++;
      if (r < 0.93 || r > 0.97) ok = false;
    }
    return `  p=${p.toFixed(3)}  Sieg ${card.win[i].toFixed(2).padStart(6)} → ${(w * 100).toFixed(2)} %   Platz ${card.place[i].toFixed(2).padStart(5)} (p2=${card.top2[i].toFixed(3)}) → ${(pl * 100).toFixed(2)} %`;
  });
  console.log(`Form ${f + 1}:\n${rows.join('\n')}`);
});
console.log(`Exact: every bet between ${(min * 100).toFixed(2)} % and ${(max * 100).toFixed(2)} %, mean ${((sum / n) * 100).toFixed(2)} %`);

// Simulation: random card, random bet, drawn order, settle — the same calls the game makes.
const N = 2_000_000;
let staked = 0, paid = 0, expected = 0;
for (let k = 0; k < N; k++) {
  const card = R.randomCard();
  const duck = Math.floor(Math.random() * 6);
  const kind = Math.random() < 0.5 ? 'win' : 'place';
  const order = R.drawOrder(card.p);
  staked += 1;
  paid += R.settle(card, duck, kind, order);
  expected += R.betRtp(card, duck, kind);
}
console.log(`Simulated ${N.toLocaleString('en')} races: paid ${((paid / staked) * 100).toFixed(2)} % (expected ${((expected / staked) * 100).toFixed(2)} %)`);
console.log(ok ? 'OK: all bets within 93–97 %' : 'FAIL: a bet is outside 93–97 %');
process.exit(ok ? 0 : 1);
