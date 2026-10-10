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

// Radbremse (odds item): exact by walking every first segment, with the spring-back quarter,
// for single fields and a few mixed sets; then the game's own brakeSpin() simulated.
let okBrake = true;
const BET_SETS = [...R.FIELDS.map((f) => ({ [f]: 1 })), { x1: 1, x20: 1 }, { x2: 2, x5: 1, x10: 1 }, { x1: 1, x2: 1, x5: 1, x10: 1, x20: 1 }];
for (const bets of BET_SETS) {
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const val = (s) => (s === 'bonus' ? R.BONUS_WHEEL.reduce((a, f) => a + (bets[f] ?? 0) * (R.BONUS_PAY[f] + 1), 0) / R.BONUS_WHEEL.length : (bets[s] ?? 0) * (R.PAY[s] + 1));
  let e = 0;
  for (let i = 0; i < R.SEGMENTS; i++) {
    const s = R.WHEEL[i];
    const mine = s === 'bonus' || (bets[s] ?? 0) > 0;
    e += mine ? val(s) : 0.75 * 0 + 0.25 * val(R.WHEEL[(i + 1) % R.SEGMENTS]);
  }
  e /= R.SEGMENTS * total;
  const M = 1_000_000;
  let got = 0;
  for (let i = 0; i < M; i++) got += R.payout(bets, R.brakeSpin(bets));
  const match = Math.abs(e - R.brakeRtp(bets)) < 1e-12;
  // Single fields must land in 100–125 %; spread bets cover more segments, so the brake helps less.
  okBrake &&= match && e <= 1.25 && (total > 1 || e >= 1);
  console.log(`Radbremse ${JSON.stringify(bets)}: exakt ${pct(e)} ${match ? '(= brakeRtp)' : `(rules.ts: ${pct(R.brakeRtp(bets))})`} · simuliert ${pct(got / M / total)}`);
}
console.log(okBrake ? 'OK: Radbremse exakt, einzelne Felder 100–125 %.' : 'FEHLER Radbremse');
ok &&= okBrake;
process.exit(ok ? 0 : 1);
