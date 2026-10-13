// Mondmünze rules, kept free of Pixi so scripts/rtp-coin.mjs can import them.
//
// A fair brass coin: Mond or Sonne, 50 : 50. The first right call pays 1.9× (95 % for one
// flip); every further right call doubles it, so after k calls the multiplier is 0.95 · 2^k
// and its chance is 2^-k. Whatever the player does, the return is exactly 95 %. (Multiplying
// by 1.9 on every flip would drop to 90 % after two flips, 86 % after three.)

export const COIN_RTP = 0.95;
/** The streak meter has eight moon phases; the eighth call collects by itself (full moon). */
export const MAX_FLIPS = 8;

export type Side = 'mond' | 'falter';

export function coinMult(k: number) {
  return k === 0 ? 1 : COIN_RTP * Math.pow(2, k);
}

/** The amount shown on the collect button: the exact value, rounded down. */
export function coinPayoutShown(stake: number, k: number) {
  return Math.floor(clean(stake * coinMult(k)));
}

/**
 * Lumen actually paid: the shown amount, plus one more coin with a chance equal to the
 * cut-off fraction. Never less than shown, and on average exactly stake × multiplier, so
 * rounding to whole Lumen doesn't move the payout ratio even at the smallest stake.
 */
export function coinPayout(stake: number, k: number, rand: () => number = Math.random) {
  const x = clean(stake * coinMult(k));
  const whole = Math.floor(x);
  return whole + (rand() < x - whole ? 1 : 0);
}

export function flipCoin(rand: () => number = Math.random): Side {
  return rand() < 0.5 ? 'mond' : 'falter';
}

/** Drops floating-point dust (9.9999999997 is 10). */
function clean(x: number) {
  return Math.round(x * 1e6) / 1e6;
}
