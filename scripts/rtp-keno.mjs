// Sternenhimmel (keno): exact RTP for every pick count from the hypergeometric distribution,
// plus a 2,000,000-round simulation of the real draw + paytable as a cross-check.
// Run: node scripts/rtp-keno.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const load = async (p) => import('data:text/javascript;base64,' + Buffer.from(transformSync(readFileSync(new URL(p, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'));
const K = await load('../src/games/keno/rules.ts');

let ok = true;
console.log('Picks  exact RTP   simulated (2M)');
for (let n = 1; n <= K.MAX_PICKS; n++) {
  const exact = K.returnToPlayer(n);
  const picks = new Set(K.quickPick(n));
  let paid = 0;
  const R = 2_000_000;
  for (let i = 0; i < R; i++) {
    let hits = 0;
    for (const s of K.drawStars()) if (picks.has(s)) hits++;
    paid += K.kenoMultiplier(n, hits);
  }
  const inRange = exact >= 0.93 && exact <= 0.97;
  ok &&= inRange;
  console.log(`${String(n).padStart(5)}  ${(exact * 100).toFixed(3)} %   ${((paid / R) * 100).toFixed(2)} %${inRange ? '' : '   <-- outside 93–97 %'}`);
}
console.log(ok ? 'OK: every pick count is within 93–97 %.' : 'FAIL');

// Sternschnuppe (odds item): 11 shooting stars instead of 10, same paytable. Exact by the
// hypergeometric count with 11 draws, cross-checked by enumerating the hit counts by hand
// and by 400,000 simulated rounds of the game's own drawStars(rand, 11).
let okStar = true;
const C = (n, k) => (k < 0 || k > n ? 0 : Array.from({ length: k }, (_, i) => (n - k + 1 + i) / (i + 1)).reduce((a, b) => a * b, 1));
for (let n = 1; n <= K.MAX_PICKS; n++) {
  let byHand = 0;
  for (let k = 0; k <= n; k++) byHand += K.kenoMultiplier(n, k) * (C(n, k) * C(K.POOL - n, K.DRAWS + 1 - k)) / C(K.POOL, K.DRAWS + 1);
  const picks = new Set(K.quickPick(n));
  let paid = 0;
  const R = 400_000;
  for (let i = 0; i < R; i++) {
    let hits = 0;
    for (const s of K.drawStars(Math.random, K.DRAWS + 1)) if (picks.has(s)) hits++;
    paid += K.kenoMultiplier(n, hits);
  }
  okStar &&= Math.abs(byHand - K.starRtp(n)) < 1e-9;
  console.log(`Sternschnuppe, ${String(n).padStart(2)} Sterne: exakt ${(K.starRtp(n) * 100).toFixed(3)} % · simuliert ${((paid / R) * 100).toFixed(2)} %`);
}
console.log(okStar ? 'OK: Sternschnuppe' : 'FAIL: Sternschnuppe');
process.exit(ok && okStar ? 0 : 1);
