// Mondflug rules as pure functions (no Pixi), so scripts/rtp-crash.mjs can check them.

/** Share of every bet that comes back on average, whatever the player does. */
export const RTP = 0.96;
export const MAX_MULT = 1000;

/**
 * The wind point is drawn before take-off: P(flight reaches x) = 0.96 / x.
 * So 4 % of flights end right at the start, and any cash-out target pays 96 % on average.
 */
export function drawWindPoint(rand = Math.random()) {
  const x = RTP / (1 - rand);
  if (x < 1) return 1;
  return Math.min(MAX_MULT, Math.floor(x * 100) / 100);
}

// ---- Mondschirm (odds item) -------------------------------------------------------------------
// A wind gust below 1,10× (the start included) is caught by the parachute: the stake comes
// back. That happens with P(wind point < 1.10) = 1 − 0.96 / 1.10, so a player who collects at
// 1,10× or later gets 0.96 + 1 − 0.96 / 1.10 = 108.73 % on average (collecting earlier: less).

export const SHIELD_BELOW = 1.1;
export const SHIELD_CHANCE = 1 - RTP / SHIELD_BELOW;
export const SHIELD_RTP = RTP + SHIELD_CHANCE;

/** Does the Mondschirm catch a gust at this wind point? */
export const shielded = (windAt: number) => windAt < SHIELD_BELOW;
