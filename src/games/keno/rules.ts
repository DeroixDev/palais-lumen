// Sternenhimmel (keno) rules, kept free of Pixi so scripts/rtp-keno.mjs can import them.
// 40 stars, the player picks 1–10, then 10 shooting stars fall (drawn without replacement).
// The pay for k hits out of n picks is PAYTABLE[n][k] × stake; RTP is exact (hypergeometric).

export const POOL = 40;
export const DRAWS = 10;
export const MAX_PICKS = 10;

/** PAYTABLE[n][k]: multiplier for k hits with n picked stars. */
export const PAYTABLE: Record<number, number[]> = {
  1: [0, 3.8],
  2: [0, 1, 10],
  3: [0, 0, 4, 34],
  4: [0, 0, 2, 8, 90],
  5: [0, 0, 1, 4, 25, 300],
  6: [0, 0, 0.5, 2.5, 11, 90, 800],
  7: [0, 0, 0.5, 2, 5, 25, 150, 1500],
  8: [0, 0, 0, 1.5, 4, 15, 80, 800, 3000],
  9: [0, 0, 0, 1, 2.5, 10, 40, 220, 1500, 5000],
  10: [0, 0, 0, 0.5, 2, 6, 25, 120, 800, 4000, 10000],
};

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of exactly k hits with n picks. */
export function hitChance(n: number, k: number) {
  return (choose(n, k) * choose(POOL - n, DRAWS - k)) / choose(POOL, DRAWS);
}

/** Exact long-run payout share for n picks. */
export function returnToPlayer(n: number) {
  const row = PAYTABLE[n];
  if (!row) return 0;
  return row.reduce((s, m, k) => s + m * hitChance(n, k), 0);
}

export function kenoMultiplier(picks: number, hits: number) {
  return PAYTABLE[picks]?.[hits] ?? 0;
}

/** The 10 shooting stars of one round (1..40, distinct, in falling order). */
export function drawStars(rand: () => number = Math.random): number[] {
  const all = Array.from({ length: POOL }, (_, i) => i + 1);
  for (let i = 0; i < DRAWS; i++) {
    const j = i + Math.floor(rand() * (POOL - i));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, DRAWS);
}

/** n distinct random stars for the quick pick. */
export function quickPick(n: number, rand: () => number = Math.random): number[] {
  const all = Array.from({ length: POOL }, (_, i) => i + 1);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (POOL - i));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, n).sort((a, b) => a - b);
}
