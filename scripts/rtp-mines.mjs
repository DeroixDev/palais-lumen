// Diamantminen: exact payout ratio for every trap count, every cash-out point and every
// stake of the day-1 ladder, plus 2,000,000 simulated rounds through the game's own rules
// (src/games/mines/rules.ts, bundled with esbuild). Run: node scripts/rtp-mines.mjs
//
// Why it is exact: after k diamonds the multiplier is RTP / P(k safe picks). A player who
// plans to collect after k diamonds gets RTP / P(k) with chance P(k) → RTP. Any adaptive
// plan is a mix of such stopping points (optional stopping of the martingale 1{safe}/P(k)),
// so every strategy returns exactly RTP. Whole-Falter payouts round up with a chance equal
// to the cut fraction, so the expected payout stays exactly stake × multiplier.
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/mines/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { MINES_RTP, TILES, MIN_TRAPS, MAX_TRAPS, surviveChance, minesMult, minesPayout, minesPayoutShown, layTraps } = R;

// Expected Falter of one payout: rand below the fraction pays one more.
function expectedPayout(stake, t, k) {
  const shown = minesPayoutShown(stake, t, k);
  const up = minesPayout(stake, t, k, () => 0) - shown; // 1 if there is a fraction
  const frac = stake * minesMult(t, k) - shown;
  if (minesPayout(stake, t, k, () => 0.999999999) !== shown) throw new Error('never less than shown');
  return shown + up * frac;
}

let lo = Infinity, hi = -Infinity;
for (const stake of [10, 20, 50, 100, 200, 500]) {
  for (let t = MIN_TRAPS; t <= MAX_TRAPS; t++) {
    for (let k = 1; k <= TILES - t; k++) {
      const ev = (surviveChance(t, k) * expectedPayout(stake, t, k)) / stake;
      lo = Math.min(lo, ev);
      hi = Math.max(hi, ev);
    }
  }
}
console.log(`Exact RTP, all stakes × ${MAX_TRAPS - MIN_TRAPS + 1} trap counts × every cash-out point: ${(lo * 100).toFixed(6)} % … ${(hi * 100).toFixed(6)} % (target ${MINES_RTP * 100} %)`);
console.log(`Top multipliers: 1 trap all 24 = ${minesMult(1, 24).toFixed(2)}×, 10 traps all 15 = ${Math.round(minesMult(10, 15))}×`);

// Simulation: random trap count, random target (1–6 diamonds), real trap layout, stake 10.
const N = 2_000_000;
let staked = 0, won = 0, sq = 0;
for (let i = 0; i < N; i++) {
  const t = MIN_TRAPS + Math.floor(Math.random() * (MAX_TRAPS - MIN_TRAPS + 1));
  const target = 1 + Math.floor(Math.random() * 6);
  const field = layTraps(t);
  staked += 10;
  let k = 0;
  let bust = false;
  // Opens stones in a random order (a fresh shuffle of indices).
  const order = [...Array(TILES).keys()];
  for (let j = TILES - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [order[j], order[r]] = [order[r], order[j]]; }
  for (const idx of order) {
    if (field[idx]) { bust = true; break; }
    if (++k === target) break;
  }
  const got = bust ? 0 : minesPayout(10, t, k);
  won += got;
  sq += (got / 10) ** 2;
}
const sim = won / staked;
const se = Math.sqrt((sq / N - sim * sim) / N);
console.log(`Simulated ${N.toLocaleString('de-DE')} rounds (stake 10, 1–6 diamonds): ${(sim * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} (1 SE)`);
const ok = Math.abs(lo - MINES_RTP) < 1e-9 && Math.abs(hi - MINES_RTP) < 1e-9 && Math.abs(sim - MINES_RTP) < 4 * se + 0.001;
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
