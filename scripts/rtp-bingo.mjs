// Glühwürmchen-Bingo: exact RTP per card size by enumerating every subset of marked cells
// (hypergeometric weights), plus a 2,000,000-round simulation of the real card/draw/score code.
// Run: node scripts/rtp-bingo.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const load = async (p) => import('data:text/javascript;base64,' + Buffer.from(transformSync(readFileSync(new URL(p, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'));
const B = await load('../src/games/bingo/rules.ts');

let ok = true;
for (const size of [3, 4]) {
  const mode = B.MODES[size];
  const exact = B.returnToPlayer(mode);
  const { byLines, full } = B.outcomeChances(mode);
  let paid = 0;
  const R = 2_000_000;
  for (let i = 0; i < R; i++) paid += B.scoreCard(mode, B.newCard(mode), B.drawFireflies(mode)).mult;
  const inRange = exact >= 0.93 && exact <= 0.97;
  ok &&= inRange;
  console.log(`${size}×${size} (1–${mode.pool}, ${mode.draws} Glühwürmchen): exact ${(exact * 100).toFixed(3)} %, simulated ${((paid / R) * 100).toFixed(2)} %${inRange ? '' : '  <-- outside 93–97 %'}`);
  console.log('  P(lines): ' + byLines.map((p, n) => `${n}:${p.toExponential(3)}`).join(' ') + `  full:${full.toExponential(3)}`);
}
console.log(ok ? 'OK: both card sizes are within 93–97 %.' : 'FAIL');
process.exit(ok ? 0 : 1);
