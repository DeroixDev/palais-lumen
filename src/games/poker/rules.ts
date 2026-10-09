// Falter-Poker rules: a Jacks-or-Better video poker with a reduced 7/5 paytable, kept free of
// Pixi so scripts/rtp-poker.mjs can import exactly this code and compute the optimal-play RTP.
// Card = rank * 4 + suit; rank 0..12 is 2..Ass, suit 0..3 is ♠ ♥ ♦ ♣.

export type Hand =
  | 'royal' | 'straightFlush' | 'four' | 'fullHouse' | 'flush' | 'straight' | 'three' | 'twoPair' | 'jacks' | 'none';

/** Best first, as on the paytable. */
export const HANDS: Hand[] = ['royal', 'straightFlush', 'four', 'fullHouse', 'flush', 'straight', 'three', 'twoPair', 'jacks', 'none'];

/** Total return per stake (1 = stake back). 7/5 Jacks or Better with the 800× royal. */
export const PAY: Record<Hand, number> = {
  royal: 800,
  straightFlush: 50,
  four: 25,
  fullHouse: 7,
  flush: 5,
  straight: 4,
  three: 3,
  twoPair: 2,
  jacks: 1,
  none: 0,
};

export const HAND_NAME: Record<Hand, string> = {
  royal: 'Royal Flush',
  straightFlush: 'Straight Flush',
  four: 'Vierling',
  fullHouse: 'Full House',
  flush: 'Flush',
  straight: 'Straße',
  three: 'Drilling',
  twoPair: 'Zwei Paare',
  jacks: 'Buben oder besser',
  none: '',
};

/**
 * Exact long-run payout with optimal holds, from `node scripts/rtp-poker.mjs`
 * (all 2.598.960 deals × 32 holds, every draw counted). The script checks this constant.
 */
export const RTP = 0.961472;

/** Doppeln: a won amount is staked on "my card beats the dealer's"; a win pays 1.9×, a tie is a push. */
export const GAMBLE_PAY = 1.9;
/** P(win) = P(lose) = 24/51, P(tie) = 3/51 → 24/51 × 1,9 + 3/51 = 0,953. */
export const GAMBLE_RTP = (24 / 51) * GAMBLE_PAY + 3 / 51;

export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;

/** The category of five cards. */
export function evaluate(cards: readonly number[]): Hand {
  const counts = new Array<number>(13).fill(0);
  let rankMask = 0;
  const s0 = cards[0] & 3;
  let flush = true;
  for (const c of cards) {
    const r = c >> 2;
    counts[r]++;
    rankMask |= 1 << r;
    if ((c & 3) !== s0) flush = false;
  }
  let pairs = 0;
  let three = false;
  let four = false;
  let highPair = false;
  for (let r = 0; r < 13; r++) {
    const n = counts[r];
    if (n === 4) four = true;
    else if (n === 3) three = true;
    else if (n === 2) {
      pairs++;
      if (r >= 9) highPair = true; // J, Q, K, A
    }
  }
  if (four) return 'four';
  if (three && pairs) return 'fullHouse';
  let straight = false;
  let royal = false;
  if (pairs === 0 && !three) {
    // Five different ranks: a run of five bits, or A-2-3-4-5.
    let m = rankMask;
    while (!(m & 1)) m >>= 1;
    straight = m === 0b11111 || rankMask === 0b1000000001111;
    royal = rankMask === 0b1111100000000;
  }
  if (straight && flush) return royal ? 'royal' : 'straightFlush';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (three) return 'three';
  if (pairs === 2) return 'twoPair';
  if (highPair) return 'jacks';
  return 'none';
}

/** A fresh shuffled deck (Fisher-Yates with Math.random). */
export function shuffledDeck(rand: () => number = Math.random) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Doppeln outcome: +1 player's card higher, 0 same rank, -1 lower. */
export function gambleResult(dealer: number, mine: number) {
  return Math.sign(rankOf(mine) - rankOf(dealer));
}
