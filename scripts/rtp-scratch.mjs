// Kratzglück: exact RTP of each card design from its fixed prize table, plus a 2,000,000-ticket
// simulation of the real drawTicket() that also checks every laid-out card shows its prize.
// Run: node scripts/rtp-scratch.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const load = async (p) => import('data:text/javascript;base64,' + Buffer.from(transformSync(readFileSync(new URL(p, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'));
const S = await load('../src/games/scratch/rules.ts');

let ok = true;
for (const d of S.DESIGNS) {
  const exact = S.returnToPlayer(d);
  let paid = 0;
  let bad = 0;
  const R = 2_000_000;
  for (let i = 0; i < R; i++) {
    const t = S.drawTicket(d);
    paid += t.mult;
    if (S.cardTier(t.cells) !== t.tier || t.cells.length !== 9) bad++;
  }
  const inRange = exact >= 0.93 && exact <= 0.97;
  ok &&= inRange && bad === 0;
  console.log(`${d.name.padEnd(13)} exact ${(exact * 100).toFixed(3)} %, simulated ${((paid / R) * 100).toFixed(2)} %, wins ${(S.winChance(d) * 100).toFixed(1)} %, layout errors ${bad}`);
}
console.log(ok ? 'OK: every design is within 93–97 % and every card shows its prize.' : 'FAIL');
process.exit(ok ? 0 : 1);
