// Exact odds of "Kristall-Baccarat": enumerates every card sequence of a fresh 8-deck shoe
// (without replacement), runs the game's own tableau (src/games/baccarat/rules.ts) on it and
// sums the probabilities. Then the payout per bet. Run: node scripts/rtp-baccarat.mjs
import { loadTs } from './_load-ts.mjs';

const { playCoup, returnFor, PAYS, RTP, DECKS } = await loadTs('src/games/baccarat/rules.ts');

// Card points 0..9 with their counts in the shoe (0 = 10, B, D, K).
const counts = Array.from({ length: 10 }, (_, v) => (v === 0 ? 16 : 4) * DECKS);
const N = 52 * DECKS;
// Rank that has this point (any one will do for the tableau).
const rankFor = (v) => (v === 0 ? 10 : v);
const prob = { player: 0, banker: 0, tie: 0 };
let naturals = 0;

// Depth-first over sequences: the coup asks for cards one by one; each prefix branches 10 ways.
function walk(prefix, p, left) {
  let i = 0;
  let need = -1;
  let coup = null;
  try {
    coup = playCoup(() => {
      if (i < prefix.length) return { rank: rankFor(prefix[i++]), suit: 0 };
      throw 'more';
    });
  } catch (e) {
    if (e !== 'more') throw e;
    need = i;
  }
  if (coup && i === prefix.length) {
    prob[coup.winner] += p;
    if (coup.natural) naturals += p;
    return;
  }
  for (let v = 0; v < 10; v++) {
    if (!counts[v]) continue;
    const q = counts[v] / left;
    counts[v]--;
    walk([...prefix, v], p * q, left - 1);
    counts[v]++;
  }
  void need;
}
walk([], 1, N);

console.log(`Spieler gewinnt ${(prob.player * 100).toFixed(4)} %, Bank ${(prob.banker * 100).toFixed(4)} %, Unentschieden ${(prob.tie * 100).toFixed(4)} % (Summe ${((prob.player + prob.banker + prob.tie) * 100).toFixed(6)} %), Natural ${(naturals * 100).toFixed(3)} %`);
let ok = true;
for (const side of ['player', 'banker', 'tie']) {
  const rtp = ['player', 'banker', 'tie'].reduce((s, w) => s + prob[w] * returnFor(side, w), 0);
  const inBand = rtp >= 0.93 && rtp <= 0.97;
  const match = Math.abs(rtp - RTP[side]) < 1e-4;
  ok &&= inBand && match;
  console.log(`${side.padEnd(7)} zahlt ${PAYS[side]}:1 → RTP ${(rtp * 100).toFixed(3)} %  ${inBand ? 'in 93–97 %' : 'AUSSERHALB'}  ${match ? '(= RTP in rules.ts)' : `(rules.ts sagt ${RTP[side]})`}`);
}
console.log(ok ? 'OK' : 'FAIL');
if (!ok) process.exitCode = 1;
