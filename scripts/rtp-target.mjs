// Zielscheibe: exact return of each throwing style from its ring table, plus 2,000,000
// simulated throws through the game's own drawHit/multFor (src/games/target/rules.ts).
// Run: node scripts/rtp-target.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const ts = readFileSync(new URL('../src/games/target/rules.ts', import.meta.url), 'utf8');
const R = await import('data:text/javascript,' + encodeURIComponent(transformSync(ts, { loader: 'ts', format: 'esm' }).code));

let ok = true;
for (const st of R.STYLE_ORDER) {
  const { label, rings } = R.STYLES[st];
  const rtp = R.returnToPlayer(st);
  if (Math.abs(rtp - 0.95) > 1e-9) ok = false;
  const radii = R.ringRadii(st);
  console.log(`${label}: ${rings.map((r, i) => `×${r.mult} ${(r.p * 100).toFixed(1)} % (r=${radii[i].toFixed(3)})`).join(' | ')} | daneben ${(R.missChance(st) * 100).toFixed(1)} %  → exact ${(rtp * 100).toFixed(4)} %`);
  const N = 2_000_000 / 3;
  let paid = 0;
  for (let i = 0; i < N; i++) paid += R.multFor(st, R.drawHit(st));
  console.log(`   simulated ${Math.round(N).toLocaleString('en')} throws: ${((paid / N) * 100).toFixed(2)} %`);
}
console.log(ok ? 'OK: every style returns exactly 95 %' : 'FAIL');
process.exit(ok ? 0 : 1);
