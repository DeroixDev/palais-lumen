// Rules of "Kristall-Baccarat" as pure functions (no Pixi): the drawing rules (tableau), the
// payouts and the exact odds. scripts/rtp-baccarat.mjs enumerates every card sequence of a
// fresh 8-deck shoe with this code; the game shuffles a fresh shoe for every coup, so the
// exact odds hold for every round.

import type { Card } from '../cards/cards';

export type Side = 'player' | 'banker' | 'tie';
export const SIDE_LABEL: Record<Side, string> = { player: 'Spieler', banker: 'Bank', tie: 'Unentschieden' };
export const DECKS = 8;

/**
 * Winnings on top of the stake. Classic tables (Bank minus 5 %, tie 8:1) return 98.9 % /
 * 98.8 % / 85.6 %, outside this casino's 93–97 % band; these payouts keep every bet inside it.
 * A tie returns Spieler and Bank stakes.
 */
export const PAYS: Record<Side, number> = { player: 0.95, banker: 0.9, tie: 9 };

/** Exact long-run payout share per bet, from scripts/rtp-baccarat.mjs (8 decks). */
export const RTP: Record<Side, number> = { player: 0.96534, banker: 0.96649, tie: 0.95156 };
/** Probability of each result (8 decks), same source. */
export const ODDS: Record<Side, number> = { player: 0.446247, banker: 0.458597, tie: 0.095156 };

export const pointOf = (rank: number) => (rank >= 10 ? 0 : rank);
export const total = (cards: readonly Card[]) => cards.reduce((s, c) => s + pointOf(c.rank), 0) % 10;

/** Does the bank draw a third card, given its total and the player's third card (null: player stood)? */
export function bankerDraws(b: number, third: number | null) {
  if (third === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return third !== 8;
  if (b === 4) return third >= 2 && third <= 7;
  if (b === 5) return third >= 4 && third <= 7;
  if (b === 6) return third === 6 || third === 7;
  return false;
}

export interface Coup {
  player: Card[];
  banker: Card[];
  winner: Side;
  natural: boolean;
}

/** Plays one coup from `draw` in the real order: P, B, P, B, then third cards by the tableau. */
export function playCoup(draw: () => Card): Coup {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  const p2 = total(player);
  const b2 = total(banker);
  const natural = p2 >= 8 || b2 >= 8;
  if (!natural) {
    let third: number | null = null;
    if (p2 <= 5) {
      const c = draw();
      player.push(c);
      third = pointOf(c.rank);
    }
    if (bankerDraws(b2, third)) banker.push(draw());
  }
  const p = total(player);
  const b = total(banker);
  return { player, banker, winner: p > b ? 'player' : b > p ? 'banker' : 'tie', natural };
}

/** What a bet returns (stake included) for a result, before rounding down to whole Falter. */
export function returnFor(side: Side, winner: Side) {
  if (side === winner) return 1 + PAYS[side];
  if (winner === 'tie') return 1;
  return 0;
}
