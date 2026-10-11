// Drachenturm rules, kept free of Pixi so scripts/rtp-tower.mjs can import them.
//
// Each floor has 3 or 4 doors; behind some of them a moth-dragon sleeps. The dragons are
// placed when the floor is reached (independently per floor). After k floors the
// multiplier is RTP / p^k with p the chance of a quiet door, so any cash-out plan returns
// exactly RTP on average (5 % house edge).

export const TOWER_RTP = 0.95;
export const FLOORS = 8;

export type Diff = 'easy' | 'mid' | 'hard';
export const DIFFS: Record<Diff, { doors: number; dragons: number; label: string }> = {
  easy: { doors: 4, dragons: 1, label: 'Leicht' },
  mid: { doors: 3, dragons: 1, label: 'Mittel' },
  hard: { doors: 3, dragons: 2, label: 'Schwer' },
};

export function safeChance(d: Diff) {
  const { doors, dragons } = DIFFS[d];
  return (doors - dragons) / doors;
}

/** Multiplier after k floors climbed. */
export function towerMult(d: Diff, k: number) {
  return k === 0 ? 1 : TOWER_RTP / Math.pow(safeChance(d), k);
}

/** The amount shown on the collect button: the exact value, rounded down. */
export function towerPayoutShown(stake: number, d: Diff, k: number) {
  return Math.floor(clean(stake * towerMult(d, k)));
}

/**
 * Lumen actually paid: the shown amount, plus one more coin with a chance equal to the
 * cut-off fraction. Never less than shown, and on average exactly stake × multiplier, so
 * rounding to whole Lumen doesn't move the payout ratio even at the smallest stake.
 */
export function towerPayout(stake: number, d: Diff, k: number, rand: () => number = Math.random) {
  const x = clean(stake * towerMult(d, k));
  const whole = Math.floor(x);
  return whole + (rand() < x - whole ? 1 : 0);
}

/** Which doors of one floor hide a dragon. */
export function placeDragons(d: Diff, rand: () => number = Math.random) {
  const { doors, dragons } = DIFFS[d];
  const idx = Array.from({ length: doors }, (_, i) => i);
  for (let i = doors - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const row = new Array<boolean>(doors).fill(false);
  for (let i = 0; i < dragons; i++) row[idx[i]] = true;
  return row;
}

/** Drops floating-point dust (9.9999999997 is 10). */
function clean(x: number) {
  return Math.round(x * 1e6) / 1e6;
}

// ---- Minensucher (odds item) ------------------------------------------------------------------
// On the first floor the searcher shows one of the dragons (a random one) before the first
// door: that door stays open, so the first pick is among doors − 1 with dragons − 1 dragons.
// Floors 2–8 are as always and the multipliers stay as shown, so every cash-out floor k ≥ 1
// returns RTP · p' / p with p' = (doors − dragons) / (doors − 1): RTP · doors / (doors − 1).

export function scoutRtp(d: Diff) {
  const { doors } = DIFFS[d];
  return (TOWER_RTP * doors) / (doors - 1);
}

/** Which door of a floor the searcher shows: one of its dragons, chosen at random. */
export function scoutDoor(row: boolean[], rand: () => number = Math.random) {
  const dragons = row.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  return dragons[Math.floor(rand() * dragons.length)];
}
