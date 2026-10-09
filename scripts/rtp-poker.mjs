// Exact optimal-play payout of Falter-Poker. Imports the real rules (src/games/poker/rules.ts,
// compiled with esbuild), then for every one of the 2.598.960 deals finds the best of the 32
// holds by counting every possible draw exactly:
//  1. For every card subset S of size 0..5, count how many 5-card hands of each category
//     contain S (one pass over all hands, each adds to its 32 subsets).
//  2. For a deal with hold H and discards D, the draws are the 5-card hands ⊇ H that avoid D
//     (and the held cards are in the hand already): inclusion–exclusion over D, i.e.
//     Σ_{H ⊆ S ⊆ deal} (-1)^{|S|-|H|} count[S].
// Run: node scripts/rtp-poker.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const ts = readFileSync(new URL('../src/games/poker/rules.ts', import.meta.url), 'utf8');
const js = transformSync(ts, { loader: 'ts', format: 'esm' }).code;
const R = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const { HANDS, PAY, evaluate, RTP, GAMBLE_RTP } = R;
const NC = HANDS.length;
const catIndex = Object.fromEntries(HANDS.map((h, i) => [h, i]));

// Binomials and combinatorial index of a sorted subset (per size).
const C = Array.from({ length: 53 }, () => new Float64Array(7));
for (let n = 0; n <= 52; n++) {
  C[n][0] = 1;
  for (let k = 1; k <= 6; k++) C[n][k] = n === 0 ? 0 : C[n - 1][k - 1] + C[n - 1][k];
}
const offset = [0];
for (let k = 0; k <= 5; k++) offset.push(offset[k] + C[52][k]);
const idx = (cards) => {
  // cards sorted ascending
  let i = 0;
  for (let j = 0; j < cards.length; j++) i += C[cards[j]][j + 1];
  return offset[cards.length] + i;
};
const TOTAL = offset[6];
const counts = new Int32Array(TOTAL * NC);

console.time('count');
const hand = [0, 0, 0, 0, 0];
const handCat = new Int8Array(C[52][5]);
const sub = [];
let h = 0;
for (let a = 0; a < 52; a++)
  for (let b = a + 1; b < 52; b++)
    for (let c = b + 1; c < 52; c++)
      for (let d = c + 1; d < 52; d++)
        for (let e = d + 1; e < 52; e++) {
          hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
          const cat = catIndex[evaluate(hand)];
          handCat[h++] = cat;
          for (let m = 0; m < 32; m++) {
            sub.length = 0;
            for (let k = 0; k < 5; k++) if (m & (1 << k)) sub.push(hand[k]);
            counts[idx(sub) * NC + cat]++;
          }
        }
console.timeEnd('count');

// Scalar value of every subset: Σ count × pay.
const value = new Float64Array(TOTAL);
const pay = HANDS.map((x) => PAY[x]);
for (let s = 0; s < TOTAL; s++) {
  let v = 0;
  for (let k = 0; k < NC; k++) v += counts[s * NC + k] * pay[k];
  value[s] = v;
}

console.time('best holds');
const popc = (m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1));
const subIdx = new Int32Array(32);
const v = new Float64Array(32);
let totalEV = 0;
const freq = new Float64Array(NC);
let deals = 0;
const holdCount = new Float64Array(6);
for (let a = 0; a < 52; a++)
  for (let b = a + 1; b < 52; b++)
    for (let c = b + 1; c < 52; c++)
      for (let d = c + 1; d < 52; d++)
        for (let e = d + 1; e < 52; e++) {
          hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
          for (let m = 0; m < 32; m++) {
            sub.length = 0;
            for (let k = 0; k < 5; k++) if (m & (1 << k)) sub.push(hand[k]);
            subIdx[m] = idx(sub);
            v[m] = value[subIdx[m]];
          }
          // Möbius over supersets: v[H] = Σ_{S ⊇ H} (-1)^{|S|-|H|} value[S].
          for (let k = 0; k < 5; k++) for (let m = 0; m < 32; m++) if (!(m & (1 << k))) v[m] -= v[m | (1 << k)];
          let best = -1, bestM = 0;
          for (let m = 0; m < 32; m++) {
            const ev = v[m] / C[47][5 - popc(m)];
            if (ev > best + 1e-12) { best = ev; bestM = m; }
          }
          totalEV += best;
          deals++;
          holdCount[popc(bestM)]++;
          // Category frequencies of the chosen hold.
          const draws = C[47][5 - popc(bestM)];
          for (let s = 0; s < 32; s++) {
            if ((s & bestM) !== bestM) continue;
            const sign = (popc(s) - popc(bestM)) & 1 ? -1 : 1;
            const base = subIdx[s] * NC;
            for (let k = 0; k < NC; k++) freq[k] += (sign * counts[base + k]) / draws;
          }
        }
console.timeEnd('best holds');

const rtp = totalEV / deals;
console.log(`Deals: ${deals}`);
console.log('Hand            pays   probability     return');
HANDS.forEach((x, k) => {
  const p = freq[k] / deals;
  console.log(`${x.padEnd(15)} ${String(PAY[x]).padStart(4)}   ${p.toExponential(6)}   ${(p * PAY[x] * 100).toFixed(4)} %`);
});
console.log('Cards held (optimal):', [...holdCount].map((n, k) => `${k}:${((n / deals) * 100).toFixed(2)}%`).join(' '));
console.log(`Optimal-play RTP: ${(rtp * 100).toFixed(4)} %  (house edge ${((1 - rtp) * 100).toFixed(4)} %)`);
console.log(`Doppeln (1,9×, tie = push): ${(GAMBLE_RTP * 100).toFixed(4)} % on the gambled amount`);
const ok = Math.abs(rtp - RTP) < 5e-6 && rtp >= 0.93 && rtp <= 0.97 && GAMBLE_RTP <= 0.97;
console.log(ok ? `OK: matches RTP constant ${RTP}` : `MISMATCH: rules.ts says ${RTP}`);
process.exit(ok ? 0 : 1);
