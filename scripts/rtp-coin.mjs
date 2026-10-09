// Mondmünze: exact payout ratio for every streak length and every stake of the day-1
// ladder, plus 2,000,000 simulated rounds through the game's own rules
// (src/games/coin/rules.ts, bundled with esbuild). Run: node scripts/rtp-coin.mjs
//
// Why it is exact: after k right calls the multiplier is 0.95 · 2^k and the chance is 2^-k,
// so collecting after any k returns 95 %; adaptive plans are mixes of those. Whole-Falter
// payouts round up with a chance equal to the cut fraction, so expectations stay exact.
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/coin/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { COIN_RTP, MAX_FLIPS, coinMult, coinPayout, coinPayoutShown, flipCoin } = R;

function expectedPayout(stake, k) {
  const shown = coinPayoutShown(stake, k);
  const up = coinPayout(stake, k, () => 0) - shown;
  if (coinPayout(stake, k, () => 0.999999999) !== shown) throw new Error('never less than shown');
  return shown + up * (stake * coinMult(k) - shown);
}

let lo = Infinity, hi = -Infinity;
for (const stake of [10, 20, 50, 100, 200, 500]) {
  for (let k = 1; k <= MAX_FLIPS; k++) {
    const ev = (Math.pow(0.5, k) * expectedPayout(stake, k)) / stake;
    lo = Math.min(lo, ev);
    hi = Math.max(hi, ev);
  }
}
console.log(`Ladder: ${Array.from({ length: MAX_FLIPS }, (_, i) => coinMult(i + 1).toFixed(2)).join(' · ')}`);
console.log(`Exact RTP, all stakes × streak lengths 1–${MAX_FLIPS}: ${(lo * 100).toFixed(6)} % … ${(hi * 100).toFixed(6)} % (target ${COIN_RTP * 100} %)`);

const N = 2_000_000;
let staked = 0, won = 0, sq = 0, heads = 0, flips = 0;
for (let i = 0; i < N; i++) {
  const target = 1 + Math.floor(Math.random() * MAX_FLIPS);
  staked += 10;
  let k = 0;
  let bust = false;
  while (k < target) {
    const call = Math.random() < 0.5 ? 'mond' : 'falter';
    const side = flipCoin();
    flips++;
    if (side === 'mond') heads++;
    if (side !== call) { bust = true; break; }
    k++;
  }
  const got = bust ? 0 : coinPayout(10, k);
  won += got;
  sq += (got / 10) ** 2;
}
const sim = won / staked;
const se = Math.sqrt((sq / N - sim * sim) / N);
console.log(`Coin fairness: ${((heads / flips) * 100).toFixed(2)} % Mond over ${flips.toLocaleString('de-DE')} flips`);
console.log(`Simulated ${N.toLocaleString('de-DE')} rounds (stake 10, random streak target): ${(sim * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} (1 SE)`);
const ok = Math.abs(lo - COIN_RTP) < 1e-9 && Math.abs(hi - COIN_RTP) < 1e-9 && Math.abs(sim - COIN_RTP) < 4 * se + 0.001;
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
