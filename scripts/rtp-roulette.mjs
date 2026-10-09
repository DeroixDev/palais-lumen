// Roulette with the Magnetkugel item: enumerates every pair of random draws through the
// game's own magnetSpin() (src/games/roulette/rules.ts), gets the exact chance of every final
// pocket, then the exact return of typical bets; plus 2,000,000 simulated spins.
// Without the item every pocket has 1/37 (36/37 = 97.297 % for every bet). Run: node scripts/rtp-roulette.mjs
import { loadTs } from './_load-ts.mjs';

const R = await loadTs('src/games/roulette/rules.ts');
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const pct = (x) => (x * 100).toFixed(4) + ' %';

// Exact: every rand() answer is one of 37 equally likely cells; at most two draws per spin.
const P = new Array(37).fill(0);
for (let a = 0; a < 37; a++)
  for (let b = 0; b < 37; b++) {
    const seq = [(a + 0.5) / 37, (b + 0.5) / 37];
    let i = 0;
    const { final } = R.magnetSpin(() => seq[i++]);
    P[final] += 1 / 37 / 37;
  }
const bets = {
  'Zahl 17 (35:1)': (n) => (n === 17 ? 36 : 0),
  'Null (35:1)': (n) => (n === 0 ? 36 : 0),
  'Rot (1:1)': (n) => (REDS.has(n) ? 2 : 0),
  'Gerade (1:1)': (n) => (n !== 0 && n % 2 === 0 ? 2 : 0),
  '2. Dutzend (2:1)': (n) => (n >= 13 && n <= 24 ? 3 : 0),
};
const N = 2_000_000;
const hits = new Array(37).fill(0);
for (let i = 0; i < N; i++) hits[R.magnetSpin().final]++;
let ok = Math.abs(P[0] - 1 / 1369) < 1e-12 && Math.abs(P[17] - 38 / 1369) < 1e-12;
console.log(`Magnetkugel: P(Null) = ${pct(P[0])} (1/1369), P(jede Zahl 1–36) = ${pct(P[17])} (38/1369)`);
for (const [name, f] of Object.entries(bets)) {
  const exact = P.reduce((s, p, n) => s + p * f(n), 0);
  const sim = hits.reduce((s, h, n) => s + h * f(n), 0) / N;
  const want = name.startsWith('Null') ? R.MAGNET_ZERO_RTP : R.MAGNET_RTP;
  ok &&= Math.abs(exact - want) < 1e-12;
  console.log(`${name.padEnd(17)} ohne Magnet 97,2973 % · mit Magnet exakt ${pct(exact)} · simuliert ${pct(sim)}`);
}
ok &&= Math.abs(R.magnetRtp([['red', 10], ['n:0', 10]]) - (R.MAGNET_RTP + R.MAGNET_ZERO_RTP) / 2) < 1e-12;
console.log(ok ? `OK: jede Wette ohne Null ${pct(R.MAGNET_RTP)} mit Magnetkugel.` : 'FEHLER');
process.exit(ok ? 0 : 1);
