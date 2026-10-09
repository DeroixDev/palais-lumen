// Rules of "Nachtfalter 21" as pure functions: hand values, the dealer, settling and the basic
// strategy the RTP is stated for. No Pixi here: scripts/rtp-blackjack.mjs runs the same code.

import type { Card } from '../cards/cards';

export interface BjRules {
  decks: number;
  /** Extra paid on a natural, as a share of the stake (6:5 → 1.2, 3:2 → 1.5). */
  bjPays: number;
  /** Dealer draws on soft 17. */
  hitSoft17: boolean;
  /** Double down after a split. */
  das: boolean;
  /** A tie at 17 goes to the dealer. */
  tie17Loses: boolean;
}

/**
 * The house rules on the felt. Classic 3:2 / S17 blackjack returns about 99.5 % with basic
 * strategy, more than this casino's 97 % cap. Here naturals pay 6:5, the dealer hits soft 17,
 * there is no doubling after a split, and a tie at 17 goes to the dealer: about 96 %
 * (scripts/rtp-blackjack.mjs).
 */
export const RULES: BjRules = { decks: 6, bjPays: 1.2, hitSoft17: true, das: false, tie17Loses: true };

/** Blackjack value of a rank: picture cards 10, ace 1 (or 11 when soft). */
export const cardValue = (rank: number) => (rank >= 10 ? 10 : rank);

export function handValue(cards: readonly Card[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export interface Hand {
  cards: Card[];
  /** Stake units on this hand (2 after a double). */
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
}

export const newHand = (cards: Card[] = [], fromSplit = false): Hand => ({ cards, bet: 1, doubled: false, fromSplit, done: false });

export const isNatural = (h: { cards: readonly Card[]; fromSplit?: boolean }) => !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;

export const isPair = (h: Hand) => h.cards.length === 2 && cardValue(h.cards[0].rank) === cardValue(h.cards[1].rank);

export function canDouble(h: Hand, rules: BjRules = RULES) {
  return h.cards.length === 2 && !h.done && (rules.das || !h.fromSplit);
}

/** One split per round. Split aces get one card each. */
export function canSplit(h: Hand, handsInRound: number) {
  return isPair(h) && !h.done && handsInRound === 1;
}

/** Dealer draws to 17 (and on soft 17 when the rules say so). */
export function dealerShouldHit(cards: readonly Card[], rules: BjRules = RULES) {
  const v = handValue(cards);
  return v.total < 17 || (rules.hitSoft17 && v.soft && v.total === 17);
}

/**
 * What a hand returns, in stake units, against the dealer's final cards: 0 lost, `bet` push,
 * 2·bet win, 1 + bjPays for a natural. Natural vs natural is a push.
 */
export function settleHand(h: Hand, dealer: readonly Card[], rules: BjRules = RULES) {
  const p = handValue(h.cards).total;
  const dNat = isNatural({ cards: dealer });
  if (isNatural(h)) return dNat ? h.bet : h.bet * (1 + rules.bjPays);
  if (p > 21) return 0;
  if (dNat) return 0;
  const d = handValue(dealer).total;
  if (d > 21 || p > d) return h.bet * 2;
  if (p === d) return rules.tie17Loses && d === 17 ? 0 : h.bet;
  return 0;
}

export type Move = 'hit' | 'stand' | 'double' | 'split';

/**
 * Basic strategy for 6 decks, dealer hits soft 17, no double after split (the stated RTP is for
 * this play). `up` is the dealer's up card value (2..10, 11 = ace).
 */
export function basicStrategy(h: Hand, upRank: number, handsInRound: number, rules: BjRules = RULES): Move {
  const up = upRank === 1 ? 11 : cardValue(upRank);
  const dbl = canDouble(h, rules);
  if (canSplit(h, handsInRound)) {
    const v = cardValue(h.cards[0].rank);
    const split =
      v === 1 || v === 8 ||
      (v === 9 && up !== 7 && up !== 10 && up !== 11) ||
      (v === 7 && up <= 7) ||
      (v === 6 && up >= 3 && up <= 6) ||
      ((v === 2 || v === 3) && up >= 4 && up <= 7);
    if (split) return 'split';
  }
  const { total, soft } = handValue(h.cards);
  if (soft) {
    const other = total - 11;
    if (other >= 8) return other === 8 && up === 6 && dbl && rules.hitSoft17 ? 'double' : 'stand';
    if (other === 7) {
      if (up <= 6) return dbl && (up >= 3 || rules.hitSoft17) ? 'double' : 'stand';
      if (up <= 8) return 'stand';
      return 'hit';
    }
    const from = other === 6 ? 3 : other >= 4 ? 4 : 5;
    if (up >= from && up <= 6 && dbl) return 'double';
    return 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total === 11) return dbl && (up !== 11 || rules.hitSoft17) ? 'double' : 'hit';
  if (total === 10) return dbl && up <= 9 ? 'double' : 'hit';
  if (total === 9) return dbl && up >= 3 && up <= 6 ? 'double' : 'hit';
  return 'hit';
}

/** One whole round with basic strategy; returns what came back per staked unit and the units staked. */
export function playRound(draw: () => Card, rules: BjRules = RULES) {
  const p = [draw(), draw()];
  const d = [draw(), draw()];
  const hands: Hand[] = [newHand([p[0], p[1]])];
  // The dealer peeks under an ace or ten: a natural ends the round at once.
  if (isNatural({ cards: d }) || isNatural(hands[0])) {
    return { staked: 1, back: settleHand(hands[0], d, rules) };
  }
  for (let i = 0; i < hands.length; i++) {
    const h = hands[i];
    while (!h.done) {
      if (handValue(h.cards).total >= 21) {
        h.done = true;
        break;
      }
      const m = basicStrategy(h, d[0].rank, hands.length, rules);
      if (m === 'split') {
        const second = newHand([h.cards[1], draw()], true);
        h.cards = [h.cards[0], draw()];
        h.fromSplit = true;
        hands.push(second);
        if (h.cards[0].rank === 1) {
          h.done = true;
          second.done = true;
        }
      } else if (m === 'double') {
        h.bet = 2;
        h.doubled = true;
        h.cards.push(draw());
        h.done = true;
      } else if (m === 'hit') h.cards.push(draw());
      else h.done = true;
    }
  }
  if (hands.some((h) => handValue(h.cards).total <= 21)) while (dealerShouldHit(d, rules)) d.push(draw());
  let staked = 0;
  let back = 0;
  for (const h of hands) {
    staked += h.bet;
    back += settleHand(h, d, rules);
  }
  return { staked, back };
}
