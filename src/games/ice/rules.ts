// Eisstraße rules, free of imports so scripts/rtp-ice.mjs can load them as they are.
//
// Each floe of the crossing breaks with the level's chance q. Before the first hop the game
// draws which floe will break (or none). Standing safely on floe k pays RTP / (1 − q)^k: the
// chance to get there is (1 − q)^k, so every cash-out point returns exactly 95 % on average.

export const RTP = 0.95;

export type Level = 'easy' | 'mid' | 'hard' | 'wild';
export const LEVEL_ORDER: Level[] = ['easy', 'mid', 'hard', 'wild'];

export const LEVELS: Record<Level, { label: string; q: number; steps: number }> = {
  easy: { label: 'Leicht', q: 0.08, steps: 20 },
  mid: { label: 'Mittel', q: 0.16, steps: 18 },
  hard: { label: 'Schwer', q: 0.25, steps: 15 },
  wild: { label: 'Extrem', q: 0.4, steps: 10 },
};

/** Multiplier for standing on floe k (k = 0 is the bank). */
export function multAt(level: Level, k: number) {
  if (k <= 0) return 1;
  return RTP / Math.pow(1 - LEVELS[level].q, k);
}

/** Which floe breaks (1-based), or steps + 1 when the whole crossing holds. Drawn before the first hop. */
export function drawBreak(level: Level, rand = Math.random) {
  const { q, steps } = LEVELS[level];
  for (let k = 1; k <= steps; k++) if (rand() < q) return k;
  return steps + 1;
}

/**
 * Falter paid for cashing out on floe k with this stake. Whole Falter: the shown amount is
 * rounded down, and the cut-off fraction is paid as one extra Falter with that probability,
 * so the expected payout is exact (95 %) even at small stakes.
 */
export function payout(stake: number, level: Level, k: number, rand = Math.random) {
  const x = stake * multAt(level, k);
  const whole = Math.floor(x);
  return whole + (rand() < x - whole ? 1 : 0);
}

// ---- Ruhige Hand (odds item) -------------------------------------------------------------------
// The first floe always holds; floes 2 … steps break with the level's chance q as always.
// Standing on floe k ≥ 1 then has chance (1 − q)^(k − 1), the multipliers stay as shown, so
// every cash-out point returns RTP / (1 − q).

export function steadyRtp(level: Level) {
  return RTP / (1 - LEVELS[level].q);
}

/** drawBreak with the first floe held. */
export function drawBreakSteady(level: Level, rand = Math.random) {
  const { q, steps } = LEVELS[level];
  for (let k = 2; k <= steps; k++) if (rand() < q) return k;
  return steps + 1;
}
