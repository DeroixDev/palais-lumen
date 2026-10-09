// Card model shared by the table games (no Pixi here, so the RTP scripts can import it).
// Suits of the Nachtfalter deck: Mond (♥), Laterne (♦), Falter (♠), Schlüssel (♣).

export type Suit = 0 | 1 | 2 | 3;
export interface Card {
  /** 1 = Ass, 11 = Bube, 12 = Dame, 13 = König. */
  rank: number;
  suit: Suit;
}

export const SUIT_NAME = ['Mond', 'Laterne', 'Falter', 'Schlüssel'] as const;
/** Mond and Laterne are the "red" suits (rose ink), Falter and Schlüssel the "black" ones (night ink). */
export const isRedSuit = (s: Suit) => s < 2;
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
export const RANK_NAME = ['', 'Ass', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Bube', 'Dame', 'König'];

export const cardName = (c: Card) => `${SUIT_NAME[c.suit]}-${RANK_NAME[c.rank]}`;

export function freshDecks(n: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < n; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) out.push({ rank: r, suit: s as Suit });
  return out;
}

/** A dealing shoe of `decks` decks; reshuffles when only `cut` of it is left. */
export class Shoe {
  private cards: Card[] = [];
  private pos = 0;
  /** True once after a reshuffle (the table shows it). */
  shuffled = false;

  constructor(
    private decks: number,
    private cut = 0.25,
    private rand: () => number = Math.random,
  ) {
    this.shuffle();
  }

  shuffle() {
    this.cards = freshDecks(this.decks);
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.pos = 0;
    this.shuffled = true;
  }

  /** Reshuffle between rounds when the cut card is reached. */
  checkCut() {
    if (this.left < this.cards.length * this.cut) this.shuffle();
  }

  get left() {
    return this.cards.length - this.pos;
  }

  get size() {
    return this.cards.length;
  }

  draw(): Card {
    if (this.pos >= this.cards.length) this.shuffle();
    return this.cards[this.pos++];
  }
}
