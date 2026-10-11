// Funkenfall rules as pure functions (no Pixi), so scripts/rtp-plinko.mjs can check them.
// 12 rows of pegs; at each peg the moth falls left or right with chance 1/2, so cup k
// (0 … 12, counted from the left) is reached with C(12, k) / 2^12.
//
// Lichtfächer (odds item): at the second peg the wing pushes the moth outwards, away from the
// middle, i.e. the same way it fell at the first peg. Then ten free bounces follow, so cup k
// is reached with (C(10, k) + C(10, k − 2)) / 2^11.

export const ROWS = 12;
export type Risk = 'low' | 'mid' | 'high';
export const RISK_LABEL: Record<Risk, string> = { low: 'Ruhig', mid: 'Mittel', high: 'Wild' };
export const HALF: Record<Risk, number[]> = {
  low: [8, 3, 1.5, 1.2, 1.1, 0.9, 0.6],
  mid: [30, 10, 4, 2, 1.1, 0.5, 0.3],
  high: [150, 24, 7, 2, 0.7, 0.2, 0.2],
};
export const TABLE: Record<Risk, number[]> = {
  low: [...HALF.low, ...HALF.low.slice(0, 6).reverse()],
  mid: [...HALF.mid, ...HALF.mid.slice(0, 6).reverse()],
  high: [...HALF.high, ...HALF.high.slice(0, 6).reverse()],
};

export function binom(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
export const PROB = Array.from({ length: ROWS + 1 }, (_, k) => binom(ROWS, k) / 2 ** ROWS);

export function returnToPlayer(risk: Risk) {
  return TABLE[risk].reduce((s, m, i) => s + m * PROB[i], 0);
}

/** With the wing: the second bounce goes the same way as the first (outwards). Returns a new path. */
export function wingPath(path: number[]) {
  const out = path.slice();
  out[1] = out[0];
  return out;
}

/** Chance of each cup with the Lichtfächer: two steps the same way, then ten free ones. */
export const WING_PROB = Array.from({ length: ROWS + 1 }, (_, k) => (binom(ROWS - 2, k) + binom(ROWS - 2, k - 2)) / 2 ** (ROWS - 1));

export function wingRtp(risk: Risk) {
  return TABLE[risk].reduce((s, m, i) => s + m * WING_PROB[i], 0);
}
