// Roulette with the Magnetkugel item, as pure functions (no Pixi) so scripts/rtp-roulette.mjs
// can check them. Without the item the ball falls into one of 37 pockets with chance 1/37
// each (roulette.ts). With the item, a ball that falls into the zero is pulled out once and
// rolls on to a fresh, uniformly random pocket (which may be the zero again; then it stays).
//
// Every number 1–36 then comes up with 1/37 + 1/37² = 38/1369, the zero with 1/1369. Every
// bet that does not include the zero pays 36 units per 37 covered … exactly 36 × 38/1369:
// a straight up 36 × 38/1369, red 2 × 18 × 38/1369, a dozen 3 × 12 × 38/1369, all 1368/1369.

/** Payout share of every bet without the zero while the magnet works. */
export const MAGNET_RTP = (36 * 38) / (37 * 37);
/** Payout share of a straight bet on the zero while the magnet works. */
export const MAGNET_ZERO_RTP = 36 / (37 * 37);

/** One spin with the magnet: the first pocket, and where the ball finally stays. */
export function magnetSpin(rand = Math.random) {
  const first = Math.floor(rand() * 37);
  const final = first === 0 ? Math.floor(rand() * 37) : first;
  return { first, final };
}

/** True payout share of a whole table of bets (keys as in roulette.ts) with the magnet on. */
export function magnetRtp(bets: Iterable<[string, number]>) {
  let s = 0;
  let t = 0;
  for (const [k, v] of bets) {
    s += v * (k === 'n:0' ? MAGNET_ZERO_RTP : MAGNET_RTP);
    t += v;
  }
  return t > 0 ? s / t : MAGNET_RTP;
}
