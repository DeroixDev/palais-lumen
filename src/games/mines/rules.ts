// Diamantminen rules, kept free of Pixi so scripts/rtp-mines.mjs can import them.
//
// 25 stones, 1–10 of them hide a soot lantern (a trap), the rest diamonds. After k diamonds
// the multiplier is RTP / P(k safe picks in a row). For ANY cash-out plan the expected
// return is P(reach the cash-out) × RTP / P(reach it) = RTP, so the edge is exactly 5 %.

export const MINES_RTP = 0.95;
export const TILES = 25;
export const MIN_TRAPS = 1;
export const MAX_TRAPS = 10;

/** Chance that the first k picks are all diamonds with `traps` traps on the field. */
export function surviveChance(traps: number, k: number) {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (TILES - traps - i) / (TILES - i);
  return p;
}

/** Multiplier after k diamonds (k = 0: the stake itself, nothing to collect yet). */
export function minesMult(traps: number, k: number) {
  return k === 0 ? 1 : MINES_RTP / surviveChance(traps, k);
}

/** The amount shown on the collect button: the exact value, rounded down. */
export function minesPayoutShown(stake: number, traps: number, k: number) {
  return Math.floor(clean(stake * minesMult(traps, k)));
}

/**
 * Falter actually paid: the shown amount, plus one more coin with a chance equal to the
 * cut-off fraction. Never less than shown, and on average exactly stake × multiplier, so
 * rounding to whole Falter doesn't move the payout ratio even at the smallest stake.
 */
export function minesPayout(stake: number, traps: number, k: number, rand: () => number = Math.random) {
  const x = clean(stake * minesMult(traps, k));
  const whole = Math.floor(x);
  return whole + (rand() < x - whole ? 1 : 0);
}

/** Where the traps lie: decided before the first stone opens. */
export function layTraps(traps: number, rand: () => number = Math.random) {
  const idx = Array.from({ length: TILES }, (_, i) => i);
  for (let i = TILES - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const field = new Array<boolean>(TILES).fill(false);
  for (let i = 0; i < traps; i++) field[idx[i]] = true;
  return field;
}

/** Drops floating-point dust (9.9999999997 is 10). */
function clean(x: number) {
  return Math.round(x * 1e6) / 1e6;
}

// ---- Minensucher (odds item) ------------------------------------------------------------------
// The first stone of a round is always a diamond: if a trap lies under it, the searcher moves
// that trap to a random other diamond stone (the field stays uniformly random among all fields
// with that first stone safe). Payouts stay as shown, so for any cash-out after k ≥ 1 diamonds
// the return is RTP · P(k safe) / P(k safe | first safe)⁻¹ = RTP / P(first safe) = RTP · 25 / (25 − traps).

export function guardRtp(traps: number) {
  return MINES_RTP / surviveChance(traps, 1);
}

/** The searcher's move for the first pick at `i`: returns the field to play with. */
export function guardFirst(field: boolean[], i: number, rand: () => number = Math.random) {
  if (!field[i]) return field;
  const safe = field.map((t, j) => (!t && j !== i ? j : -1)).filter((j) => j >= 0);
  const j = safe[Math.floor(rand() * safe.length)];
  const out = field.slice();
  out[i] = false;
  out[j] = true;
  return out;
}
