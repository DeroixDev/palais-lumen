// Großes Rad: exact return of every field from src/games/wheel/rules.ts (counting segments),
// then 2,000,000 simulated spins of the game's own spin() + payout(). Run: node scripts/rtp-wheel.mjs
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/wheel/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));

const pct = (x) => (x * 100).toFixed(3) + ' %';
let ok = true;
console.log(`Rad: ${R.SEGMENTS} Felder: ${R.FIELDS.map((f) => `${f}×${R.WHEEL.filter((s) => s === f).length}`).join(', ')}, Bonus×${R.WHEEL.filter((s) => s === 'bonus').length}`);
// Exact by enumerating every main segment and every bonus segment.
const exact = {};
for (const f of R.FIELDS) {
  let e = 0;
  for (const s of R.WHEEL) {
    if (s === f) e += (R.PAY[f] + 1) / R.SEGMENTS;
    else if (s === 'bonus') for (const b of R.BONUS_WHEEL) if (b === f) e += (R.BONUS_PAY[f] + 1) / R.SEGMENTS / R.BONUS_WHEEL.length;
  }
  exact[f] = e;
  if (Math.abs(e - R.FIELD_RTP[f]) > 1e-12 || e < 0.93 || e > 0.97) ok = false;
}
const N = 2_000_000;
const paid = Object.fromEntries(R.FIELDS.map((f) => [f, 0]));
for (let i = 0; i < N; i++) {
  const r = R.spin();
  for (const f of R.FIELDS) paid[f] += R.payout({ [f]: 1 }, r);
}
for (const f of R.FIELDS) console.log(`${f.padEnd(4)} zahlt ${R.PAY[f]}:1, Bonus ${R.BONUS_PAY[f]}:1 · exakt ${pct(exact[f])} · simuliert ${pct(paid[f] / N)}`);
console.log(ok ? 'OK: jedes Feld zwischen 93 % und 97 %.' : 'FEHLER');
process.exit(ok ? 0 : 1);
