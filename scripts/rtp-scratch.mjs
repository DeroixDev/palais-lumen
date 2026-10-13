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

// Mottenstaub (odds item): exact chance that a losing field shows two moons and two moths, by
// enumerating every 9-of-12 choice of the losing layout; then tickets through drawTicket + dusted().
let okDust = true;
{
  let hit = 0, all = 0;
  for (let m = 0; m < 1 << 12; m++) {
    let bits = 0;
    for (let k = 0; k < 12; k++) bits += (m >> k) & 1;
    if (bits !== 9) continue;
    all++;
    // Cells 8, 9 are the moons, 10, 11 the moths (symbols 0..5 twice each, in order).
    if ([8, 9, 10, 11].every((k) => (m >> k) & 1)) hit++;
  }
  okDust &&= Math.abs(hit / all - S.DUST_CHANCE) < 1e-12;
  console.log(`Mottenstaub: Verlierfeld mit 2 Monden und 2 Motten ${hit}/${all} = ${((hit / all) * 100).toFixed(3)} % (rules.ts 14/55)`);
}
for (const d of S.DESIGNS) {
  const exact = S.returnToPlayer(d) * (1 + (1 - S.winChance(d)) * (14 / 55));
  const R = 1_000_000;
  let paid = 0;
  for (let i = 0; i < R; i++) {
    let t = S.drawTicket(d);
    if (S.dusted(t.cells)) t = S.drawTicket(d);
    paid += t.mult;
  }
  okDust &&= Math.abs(exact - S.dustRtp(d)) < 1e-12 && exact >= 1 && exact <= 1.25;
  console.log(`  ${d.name.padEnd(13)} exact ${(exact * 100).toFixed(3)} %, simulated ${((paid / R) * 100).toFixed(2)} %`);
}
console.log(okDust ? 'OK: Mottenstaub' : 'FAIL: Mottenstaub');
process.exit(ok && okDust ? 0 : 1);
