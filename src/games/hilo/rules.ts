// Rules of the "Kartenleiter" (higher / lower card ladder) as pure functions. Cards come from
// a full 52-card deck that is reshuffled for every draw, so each call has a fixed, known chance.
// Order: 2 lowest … 10, Bube, Dame, König, Ass highest. Equal rank loses "Höher" and "Tiefer".
//
// The house edge is taken once, on the first rung: rung 1 pays RTP / p, every later rung
// multiplies by exactly 1 / p (fair). So whatever the player calls and whenever they cash out,
// the round returns exactly RTP of the stake on average (a fair game stopped at any time stays
// fair). Checked by scripts/rtp-hilo.mjs.

export const RTP = 0.95;
/** The ladder's top: reaching it (or this multiplier) cashes out by itself. */
export const RUNGS = 12;
export const MAX_MULT = 10000;

export type Call = 'higher' | 'lower' | 'same';
export const CALL_LABEL: Record<Call, string> = { higher: 'Höher', lower: 'Tiefer', same: 'Gleich' };

/** 2..14 (Ass = 14) from a card rank 1..13 (Ass = 1). */
export const ladderRank = (rank: number) => (rank === 1 ? 14 : rank);

/** Chance that the next card wins the call, from the current card's rank (1..13). */
export function chance(rank: number, call: Call) {
  const r = ladderRank(rank);
  if (call === 'higher') return (14 - r) / 13;
  if (call === 'lower') return (r - 2) / 13;
  return 1 / 13;
}

export function wins(rank: number, next: number, call: Call) {
  const a = ladderRank(rank);
  const b = ladderRank(next);
  return call === 'higher' ? b > a : call === 'lower' ? b < a : a === b;
}

/** Multiplier after winning `call` from `mult` (1 before the first rung). */
export function nextMult(mult: number, rung: number, rank: number, call: Call) {
  const p = chance(rank, call);
  if (p <= 0) return 0;
  return (rung === 0 ? RTP : 1) * (mult / p);
}

/** Whole Falter paid for a cash-out (rounded down). */
export const cashOut = (stake: number, mult: number) => Math.floor(stake * mult);

// ---- Mondspiegel (odds item) -----------------------------------------------------------------
// Before the first call of a round the mirror shows two ranks that will NOT come next. Drawn as:
// two ranks at random, then the next card from the other eleven (which is the same as drawing
// the card first and then two of the twelve ranks it is not). Later rungs stay untouched and
// fair, so a round returns exactly the first call's return; with the best call for every start
// card and mirror that is MIRROR_BEST_RTP.

/** Ladder ranks 2..14. */
const LADDER = Array.from({ length: 13 }, (_, i) => i + 2);
/** Ladder rank 2..14 back to a card rank 1..13. */
export const cardRank = (l: number) => (l === 14 ? 1 : l);

/** Chance that the next card wins `call` from `rank`, with the ladder ranks in `hidden` ruled out. */
export function mirrorChance(rank: number, call: Call, hidden: readonly number[]) {
  const a = ladderRank(rank);
  const left = LADDER.filter((b) => !hidden.includes(b));
  return left.filter((b) => (call === 'higher' ? b > a : call === 'lower' ? b < a : b === a)).length / left.length;
}

/** Return of a first call with the mirror (pays as always: RTP / chance without the mirror). */
export function mirrorRtp(rank: number, call: Call, hidden: readonly number[]) {
  const p = chance(rank, call);
  return p > 0 ? (mirrorChance(rank, call, hidden) * RTP) / p : 0;
}

export function mirrorBest(rank: number, hidden: readonly number[]): Call {
  const calls: Call[] = ['higher', 'lower', 'same'];
  return calls.reduce((a, b) => (mirrorRtp(rank, b, hidden) > mirrorRtp(rank, a, hidden) ? b : a));
}

/** Two ladder ranks (2..14) shown by the mirror. */
export function mirrorRanks(rand = Math.random): [number, number] {
  const a = LADDER[Math.floor(rand() * 13)];
  const rest = LADDER.filter((b) => b !== a);
  const b = rest[Math.floor(rand() * 12)];
  return a < b ? [a, b] : [b, a];
}

/** The next card's ladder rank, from the eleven the mirror left. */
export function mirrorNext(hidden: readonly number[], rand = Math.random) {
  const left = LADDER.filter((b) => !hidden.includes(b));
  return left[Math.floor(rand() * left.length)];
}

/** Long-run return with the mirror when the best first call is made every time (exact). */
export const MIRROR_BEST_RTP = (() => {
  let s = 0;
  let n = 0;
  for (let r = 1; r <= 13; r++)
    for (let i = 0; i < 13; i++)
      for (let j = i + 1; j < 13; j++) {
        const h = [LADDER[i], LADDER[j]];
        s += mirrorRtp(r, mirrorBest(r, h), h);
        n++;
      }
  return s / n;
})();
