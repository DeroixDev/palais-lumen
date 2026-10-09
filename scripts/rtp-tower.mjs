// Drachenturm: exact payout ratio for every difficulty, every cash-out floor and every stake
// of the day-1 ladder, plus 2,000,000 simulated climbs through the game's own rules
// (src/games/tower/rules.ts, bundled with esbuild). Run: node scripts/rtp-tower.mjs
//
// Why it is exact: after k floors the multiplier is RTP / p^k and the chance to get there is
// p^k, so every planned cash-out floor returns RTP; adaptive plans are mixes of those
// (optional stopping). Whole-Falter payouts round up with a chance equal to the cut
// fraction, so the expected payout stays exactly stake × multiplier.
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/tower/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { TOWER_RTP, FLOORS, DIFFS, safeChance, towerMult, towerPayout, towerPayoutShown, placeDragons } = R;

function expectedPayout(stake, d, k) {
  const shown = towerPayoutShown(stake, d, k);
  const up = towerPayout(stake, d, k, () => 0) - shown;
  if (towerPayout(stake, d, k, () => 0.999999999) !== shown) throw new Error('never less than shown');
  return shown + up * (stake * towerMult(d, k) - shown);
}

let lo = Infinity, hi = -Infinity;
for (const d of Object.keys(DIFFS)) {
  const ladder = [];
  for (let k = 1; k <= FLOORS; k++) ladder.push(towerMult(d, k).toFixed(2));
  console.log(`${DIFFS[d].label.padEnd(7)} (${DIFFS[d].dragons} von ${DIFFS[d].doors}): ${ladder.join(' · ')}`);
  for (const stake of [10, 20, 50, 100, 200, 500]) {
    for (let k = 1; k <= FLOORS; k++) {
      const ev = (Math.pow(safeChance(d), k) * expectedPayout(stake, d, k)) / stake;
      lo = Math.min(lo, ev);
      hi = Math.max(hi, ev);
    }
  }
}
console.log(`Exact RTP, all stakes × difficulties × cash-out floors: ${(lo * 100).toFixed(6)} % … ${(hi * 100).toFixed(6)} % (target ${TOWER_RTP * 100} %)`);

const N = 2_000_000;
const keys = Object.keys(DIFFS);
let staked = 0, won = 0, sq = 0;
for (let i = 0; i < N; i++) {
  const d = keys[i % 3];
  const target = 1 + Math.floor(Math.random() * FLOORS);
  staked += 10;
  let k = 0;
  let bust = false;
  while (k < target) {
    const row = placeDragons(d);
    if (row[Math.floor(Math.random() * row.length)]) { bust = true; break; }
    k++;
  }
  const got = bust ? 0 : towerPayout(10, d, k);
  won += got;
  sq += (got / 10) ** 2;
}
const sim = won / staked;
const se = Math.sqrt((sq / N - sim * sim) / N);
console.log(`Simulated ${N.toLocaleString('de-DE')} climbs (stake 10, random target floor): ${(sim * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} (1 SE)`);
const ok = Math.abs(lo - TOWER_RTP) < 1e-9 && Math.abs(hi - TOWER_RTP) < 1e-9 && Math.abs(sim - TOWER_RTP) < 4 * se + 0.001;
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
