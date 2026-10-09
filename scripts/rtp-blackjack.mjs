// Simulates "Nachtfalter 21" with basic strategy, using the game's own rules code
// (src/games/blackjack/rules.ts) and its 6-deck shoe with a cut card at 25 %.
// Run: node scripts/rtp-blackjack.mjs [rounds]   (default 4,000,000)
import { loadTs } from './_load-ts.mjs';

const { RULES, playRound } = await loadTs('src/games/blackjack/rules.ts');
const { Shoe } = await loadTs('src/games/cards/cards.ts');
const N = Number(process.argv[2] ?? 4_000_000);
const rules = { ...RULES, ...JSON.parse(process.argv[3] ?? '{}') };

// Fast seeded generator so runs are repeatable.
let s = 0x9e3779b9;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shoe = new Shoe(rules.decks, 0.25, rand);
let staked = 0, back = 0, sq = 0;
for (let i = 0; i < N; i++) {
  shoe.checkCut();
  const r = playRound(() => shoe.draw(), rules);
  staked += r.staked;
  back += r.back;
  const net = r.back - r.staked;
  sq += net * net;
}
const perInitial = 1 + (back - staked) / N;
const perWagered = back / staked;
const se = Math.sqrt(sq / N - ((back - staked) / N) ** 2) / Math.sqrt(N);
console.log('rules', JSON.stringify(rules), 'rounds', N);
console.log(`RTP per initial stake ${(perInitial * 100).toFixed(3)} % (±${(se * 196).toFixed(3)} % at 95 %)`);
console.log(`RTP per Falter wagered (incl. doubles/splits) ${(perWagered * 100).toFixed(3)} %`);
const ok = perInitial >= 0.93 && perInitial <= 0.97 && perWagered >= 0.93 && perWagered <= 0.97;
console.log(ok ? 'OK: inside 93–97 %' : 'FAIL: outside 93–97 %');
if (!ok) process.exitCode = 1;
