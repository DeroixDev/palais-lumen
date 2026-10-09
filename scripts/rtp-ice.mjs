// Eisstraße: exact return of every cash-out point on every level, plus 2,000,000 simulated
// rounds through the game's own drawBreak/multAt/payout (src/games/ice/rules.ts).
// Run: node scripts/rtp-ice.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const ts = readFileSync(new URL('../src/games/ice/rules.ts', import.meta.url), 'utf8');
const R = await import('data:text/javascript,' + encodeURIComponent(transformSync(ts, { loader: 'ts', format: 'esm' }).code));

let ok = true;
for (const lv of R.LEVEL_ORDER) {
  const { q, steps, label } = R.LEVELS[lv];
  const rtps = [];
  for (let k = 1; k <= steps; k++) rtps.push(Math.pow(1 - q, k) * R.multAt(lv, k));
  const lo = Math.min(...rtps), hi = Math.max(...rtps);
  if (Math.abs(lo - R.RTP) > 1e-12 || Math.abs(hi - R.RTP) > 1e-12) ok = false;
  console.log(`${label.padEnd(7)} q=${q}  floe 1: ${R.multAt(lv, 1).toFixed(4)}×  floe ${steps}: ${R.multAt(lv, steps).toFixed(2)}×  exact return at every cash-out point: ${(lo * 100).toFixed(4)}–${(hi * 100).toFixed(4)} %`);
}

// Simulation: a player who picks a random target floe each round, with real Falter payouts (stake 10).
const N = 2_000_000;
for (const lv of R.LEVEL_ORDER) {
  const { steps } = R.LEVELS[lv];
  let staked = 0, paid = 0;
  for (let i = 0; i < N / 4; i++) {
    const target = 1 + Math.floor(Math.random() * steps);
    const br = R.drawBreak(lv);
    staked += 10;
    if (br > target) paid += R.payout(10, lv, target);
  }
  console.log(`${R.LEVELS[lv].label.padEnd(7)} simulated ${(N / 4).toLocaleString('en')} rounds (stake 10, random cash-out floe): ${((paid / staked) * 100).toFixed(2)} % (rounded to whole Falter)`);
}
// Exact effect of whole-Falter rounding at the smallest stake (10), per cash-out point.
for (const lv of R.LEVEL_ORDER) {
  const { q, steps } = R.LEVELS[lv];
  let lo = 9, hi = 0;
  for (let k = 1; k <= steps; k++) {
    // Expected payout with the random extra Falter: floor + fraction.
    const x = 10 * R.multAt(lv, k);
    const r = (Math.pow(1 - q, k) * x) / 10;
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  console.log(`${R.LEVELS[lv].label.padEnd(7)} stake 10 with fair rounding: ${(lo * 100).toFixed(2)}–${(hi * 100).toFixed(2)} % depending on the cash-out floe`);
}
console.log(ok ? `OK: exactly ${R.RTP * 100} % at every cash-out point` : 'FAIL');
process.exit(ok ? 0 : 1);
