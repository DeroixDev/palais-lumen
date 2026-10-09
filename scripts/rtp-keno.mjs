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
process.exit(ok ? 0 : 1);
