// Duell im Lichtkegel rules, kept free of Pixi so scripts/rtp-queen.mjs can import them.
//
// The Queen draws one defence card from a fresh deck of 20 (1 to 20, all equally likely).
// Your attack breaks every defence up to its strength: Flügelschlag up to 10 (10 of 20 cards),
// Mondklinge up to 5, Kronenstoß up to 2, Sternenfeuer only the 1. A hit pays the attack's
// multiple (stake included), chosen so chance × multiple is exactly 0.95 for every attack.

export const QUEEN_RTP = 0.95;
export const DECK = 20;

export interface Attack {
  id: 'wing' | 'blade' | 'crown' | 'star';
  name: string;
  /** Breaks defence cards 1..beats. */
  beats: number;
  /** Paid on a hit, stake included. */
  mult: number;
  /** Colour of the attack's light. */
  color: number;
}

export const ATTACKS: Attack[] = [
  { id: 'wing', name: 'Lichtschlag', beats: 10, mult: 1.9, color: 0xffcf7a },
  { id: 'blade', name: 'Mondklinge', beats: 5, mult: 3.8, color: 0x9fe8ff },
  { id: 'crown', name: 'Kronenstoß', beats: 2, mult: 9.5, color: 0xff8ac0 },
  { id: 'star', name: 'Sternenfeuer', beats: 1, mult: 19, color: 0xfff1c4 },
];

/** Chance that an attack breaks the defence. */
export const hitChance = (a: Attack) => a.beats / DECK;

/** The Queen's defence card, 1..20. */
export function drawDefence(rand: () => number = Math.random) {
  return 1 + Math.min(DECK - 1, Math.floor(rand() * DECK));
}

export const breaks = (a: Attack, defence: number) => defence <= a.beats;

/** The amount shown for a hit: the exact value, rounded down. */
export function payoutShown(stake: number, a: Attack) {
  return Math.floor(clean(stake * a.mult));
}

/**
 * Lumen paid for a hit: the shown amount, plus one more with a chance equal to the cut-off
 * fraction, so whole-Lumen payouts keep exactly stake × multiple on average.
 */
export function payout(stake: number, a: Attack, rand: () => number = Math.random) {
  const x = clean(stake * a.mult);
  const whole = Math.floor(x);
  return whole + (rand() < x - whole ? 1 : 0);
}

/** Drops floating-point dust (28.4999999 is 28.5). */
function clean(x: number) {
  return Math.round(x * 1e6) / 1e6;
}
