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

// Brotkrumen (odds item): exact by enumerating every finishing order of the two first places with
// the crumbed weights, for every form, duck and bet; then races through drawOrder(crumbProbs()).
let okCrumb = true;
let lo = Infinity, hi = 0;
R.FORMS.forEach((form) => {
  const card = R.makeCard(form);
  for (let d = 0; d < 6; d++) {
    const q = R.crumbProbs(card.p, d);
    let w = 0, pl = 0;
    for (let a = 0; a < 6; a++)
      for (let b = 0; b < 6; b++) {
        if (a === b) continue;
        const pr = q[a] * (q[b] / (1 - q[a]));
        if (a === d) w += pr;
        if (a === d || b === d) pl += pr;
      }
    for (const [kind, r] of [['win', card.win[d] * w], ['place', card.place[d] * pl]]) {
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
      if (Math.abs(r - R.crumbRtp(card, d, kind)) > 1e-12) okCrumb = false;
    }
  }
});
okCrumb &&= Math.abs(lo - R.CRUMB_RANGE.lo) < 1e-12 && Math.abs(hi - R.CRUMB_RANGE.hi) < 1e-12 && lo >= 1 && hi <= 1.25;
let cPaid = 0, cExp = 0;
for (let k = 0; k < N / 2; k++) {
  const card = R.randomCard();
  const duck = Math.floor(Math.random() * 6);
  const kind = Math.random() < 0.5 ? 'win' : 'place';
  cPaid += R.settle(card, duck, kind, R.drawOrder(R.crumbProbs(card.p, duck)));
  cExp += R.crumbRtp(card, duck, kind);
}
okCrumb &&= Math.abs(cPaid - cExp) / (N / 2) < 0.01;
console.log(`Brotkrumen: every bet exact ${(lo * 100).toFixed(2)} % … ${(hi * 100).toFixed(2)} % (mean ${(R.CRUMB_RANGE.mean * 100).toFixed(2)} %), simulated ${((cPaid / (N / 2)) * 100).toFixed(2)} % (expected ${((cExp / (N / 2)) * 100).toFixed(2)} %)`);
console.log(okCrumb ? 'OK: Brotkrumen' : 'FAIL: Brotkrumen');
process.exit(ok && okCrumb ? 0 : 1);
