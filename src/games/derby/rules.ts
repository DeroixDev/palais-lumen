// Teich-Derby rules, kept free of imports so scripts/rtp-derby.mjs can load them as they are.
//
// Every race gets a race card: one of the FORMS (win probabilities) dealt to the six ducks in a
// random order. The finishing order is drawn from those probabilities (Harville model: the
// winner by p, second by p among the rest, ...). Odds are the fair odds times KEEP, rounded
// down to 0.05, so each single bet returns 93–97 % in the long run (shown before betting).

export const KEEP = 0.965;

/** Win-probability shapes of a race card (each sums to 1); dealt to the ducks shuffled. */
export const FORMS: readonly (readonly number[])[] = [
  [0.34, 0.22, 0.15, 0.12, 0.1, 0.07],
  [0.27, 0.21, 0.17, 0.14, 0.12, 0.09],
  [0.42, 0.17, 0.13, 0.11, 0.1, 0.07],
  [0.22, 0.2, 0.18, 0.16, 0.13, 0.11],
  [0.3, 0.26, 0.15, 0.12, 0.1, 0.07],
  [0.36, 0.2, 0.15, 0.13, 0.115, 0.045],
];

export type BetKind = 'win' | 'place';

export interface RaceCard {
  /** Win probability per duck (index = duck). */
  p: number[];
  /** Probability to finish first or second. */
  top2: number[];
  win: number[];
  place: number[];
}

/** Odds for a hit probability: KEEP / p rounded down to 0.05 (never below 1.05). */
export function oddsFor(prob: number) {
  return Math.max(1.05, Math.floor((KEEP / prob) * 20 + 1e-9) / 20);
}

/** P(duck finishes in the top two) under the Harville model. */
export function top2Probs(p: readonly number[]) {
  return p.map((pi, i) => pi + p.reduce((s, pj, j) => (j === i ? s : s + (pj * pi) / (1 - pj)), 0));
}

export function makeCard(p: readonly number[]): RaceCard {
  const top2 = top2Probs(p);
  return { p: [...p], top2, win: p.map(oddsFor), place: top2.map(oddsFor) };
}

/** A new race card: a random form dealt to the ducks in a random order. */
export function randomCard(rand = Math.random): RaceCard {
  const form = FORMS[Math.floor(rand() * FORMS.length)];
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return makeCard(order.map((k) => form[k]));
}

/** The full finishing order (duck indices, winner first), drawn before the race starts. */
export function drawOrder(p: readonly number[], rand = Math.random) {
  const left = p.map((_, i) => i);
  const out: number[] = [];
  while (left.length) {
    const total = left.reduce((s, i) => s + p[i], 0);
    let r = rand() * total;
    let k = 0;
    for (; k < left.length - 1; k++) {
      r -= p[left[k]];
      if (r < 0) break;
    }
    out.push(left[k]);
    left.splice(k, 1);
  }
  return out;
}

/** Payout multiple of the stake for a bet, given the finishing order. */
export function settle(card: RaceCard, duck: number, kind: BetKind, order: readonly number[]) {
  const pos = order.indexOf(duck);
  if (kind === 'win') return pos === 0 ? card.win[duck] : 0;
  return pos <= 1 ? card.place[duck] : 0;
}

/** Long-run return of one bet on this card. */
export function betRtp(card: RaceCard, duck: number, kind: BetKind) {
  return kind === 'win' ? card.win[duck] * card.p[duck] : card.place[duck] * card.top2[duck];
}
