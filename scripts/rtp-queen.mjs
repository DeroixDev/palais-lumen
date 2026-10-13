// Duell der Königin: exact payout ratio of every attack at every stake of the day-1 ladder and
// of scaled ladders, plus 2,000,000 simulated rounds through the game's own rules
// (src/games/queen/rules.ts, bundled with esbuild). Run: node scripts/rtp-queen.mjs
//
// Why it is exact: the defence card is uniform on 1..20, an attack hits on cards 1..beats, so
// the chance is beats / 20, and beats / 20 × multiple = 0.95 for each attack. Whole-Falter
// payouts round up with a chance equal to the cut fraction, so expectations stay exact.
import { loadTs } from './_load-ts.mjs';

const { QUEEN_RTP, DECK, ATTACKS, breaks, drawDefence, payout, payoutShown } = await loadTs('src/games/queen/rules.ts');

function expectedPayout(stake, a) {
  const shown = payoutShown(stake, a);
  if (payout(stake, a, () => 0.999999999) !== shown) throw new Error('never less than shown');
  const up = payout(stake, a, () => 0) - shown;
  return shown + up * (stake * a.mult - shown);
}

let lo = Infinity, hi = -Infinity;
// Day-1 ladder and the ladders of bigger days (unit 12, 15, 25, 60 …).
const units = [10, 12, 15, 25, 30, 60, 150, 800];
for (const u of units) {
  for (const base of [10, 20, 50, 100, 200, 500]) {
    const stake = Math.round((base * u) / 10);
    for (const a of ATTACKS) {
      // Enumerate the deck: every defence card exactly once.
      let ev = 0;
      for (let d = 1; d <= DECK; d++) if (breaks(a, d)) ev += expectedPayout(stake, a);
      ev /= DECK * stake;
      lo = Math.min(lo, ev);
      hi = Math.max(hi, ev);
    }
  }
}
for (const a of ATTACKS) console.log(`${a.name.padEnd(13)} bricht 1–${String(a.beats).padStart(2)} · Chance ${((a.beats / DECK) * 100).toFixed(0).padStart(2)} % · zahlt ${a.mult}× → ${((a.beats / DECK) * a.mult * 100).toFixed(4)} %`);
console.log(`Exact RTP, all attacks × ${units.length * 6} stakes: ${(lo * 100).toFixed(6)} % … ${(hi * 100).toFixed(6)} % (target ${QUEEN_RTP * 100} %)`);

const N = 2_000_000;
let staked = 0, won = 0, sq = 0;
const seen = new Array(DECK + 1).fill(0);
for (let i = 0; i < N; i++) {
  const a = ATTACKS[Math.floor(Math.random() * ATTACKS.length)];
  const d = drawDefence();
  seen[d]++;
  staked += 10;
  const got = breaks(a, d) ? payout(10, a) : 0;
  won += got;
  sq += (got / 10) ** 2;
}
const sim = won / staked;
const se = Math.sqrt((sq / N - sim * sim) / N);
const minCard = Math.min(...seen.slice(1)) / N, maxCard = Math.max(...seen.slice(1)) / N;
console.log(`Deck fairness: each card ${(minCard * 100).toFixed(2)} % … ${(maxCard * 100).toFixed(2)} % (ideal 5,00 %)`);
console.log(`Simulated ${N.toLocaleString('de-DE')} rounds (stake 10, random attack): ${(sim * 100).toFixed(2)} % ± ${(se * 100).toFixed(2)} (1 SE)`);
const ok = Math.abs(lo - QUEEN_RTP) < 1e-9 && Math.abs(hi - QUEEN_RTP) < 1e-9 && Math.abs(sim - QUEEN_RTP) < 4 * se + 0.001 && QUEEN_RTP >= 0.93 && QUEEN_RTP <= 0.97;
console.log(ok ? 'OK' : 'FAIL');
process.exit(ok ? 0 : 1);
