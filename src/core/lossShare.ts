// What a game's round costs when it is lost, for the honest payout share with items.
//
// For a stake s and a payout w, X = w / s. Every game knows its RTP = E[X]. Items that soften
// losses or add to wins need one more number per game: the expected loss share
//   L = E[max(0, 1 − X)]   (per Falter staked).
// With it the payout share including an item is exact and linear:
//   insurance k:          RTP + k·L
//   profit bonus p:       RTP + p·E[max(0, X − 1)] = RTP + p·(RTP − 1 + L)
//   no loss at all:       RTP + L
//   stake paid by house:  RTP + 1
// Games where the player chooses how to play (which bet, when to collect) have a different L
// for every choice; there the table uses the stated typical way to play and the value is
// shown with "ca.". Every number is checked by scripts/rtp-items.mjs against the games' own
// rules code (exact sums where possible, simulation for blackjack).

export interface LossShare {
  /** Payout share for the typical way of playing below. */
  rtp: number;
  /** Expected loss share L = E[max(0, 1 − payout/stake)]. */
  L: number;
  /** True when L does not depend on any choice of the player (then it is shown without "ca."). */
  exact: boolean;
  /** The way of playing the numbers are for (German, shown in the bag). */
  how: string;
}

export const LOSS_SHARE: Record<string, LossShare> = {
  slots: { rtp: 0.9488697, L: 0.7028788, exact: true, how: 'alle Einsätze gleich' },
  shells: { rtp: 0.95, L: 2 / 3, exact: true, how: 'jede Laterne gleich' },
  roulette: { rtp: 36 / 37, L: 19 / 37, exact: false, how: 'Annahme: Rot oder Schwarz' },
  plinko: { rtp: 0.9438965, L: 0.3512695, exact: false, how: 'Annahme: Risiko Mittel' },
  crash: { rtp: 0.96, L: 0.52, exact: false, how: 'Annahme: bei 2× auszahlen' },
  bingo: { rtp: 0.9639455, L: 0.6292722, exact: false, how: 'Annahme: 3×3-Karte' },
  blackjack: { rtp: 0.9648, L: 0.4834, exact: false, how: 'Annahme: Grundstrategie' },
  baccarat: { rtp: 0.96649, L: 0.446247, exact: false, how: 'Annahme: auf die Bank' },
  hilo: { rtp: 0.95, L: 0.2899408, exact: false, how: 'Annahme: ein Tipp auf die wahrscheinlichere Seite, dann auszahlen' },
  craps: { rtp: 0.9587879, L: 0.5070707, exact: false, how: 'Annahme: nur Linie' },
  wheel: { rtp: 0.95, L: 0.7166667, exact: false, how: 'Annahme: Feld 2' },
  keno: { rtp: 0.949229, L: 0.633056, exact: false, how: 'Annahme: 5 Sterne' },
  scratch: { rtp: 0.945, L: 0.5886, exact: false, how: 'Annahme: Mottenflügel-Los' },
  derby: { rtp: 0.958181, L: 0.75, exact: false, how: 'Annahme: beliebige Ente, Sieg oder Platz' },
  ice: { rtp: 0.95, L: 0.2944, exact: false, how: 'Annahme: Mittel, nach 2 Schollen auszahlen' },
  target: { rtp: 0.95, L: 0.56, exact: false, how: 'Annahme: Wurf Normal' },
  coin: { rtp: 0.95, L: 0.5, exact: false, how: 'Annahme: nach 1 Wurf auszahlen' },
  mines: { rtp: 0.95, L: 0.3304348, exact: false, how: 'Annahme: 3 Laternen, 3 Diamanten' },
  tower: { rtp: 0.95, L: 5 / 9, exact: false, how: 'Annahme: Mittel, 2 Stockwerke' },
  poker: { rtp: 0.961472, L: 0.5450323, exact: false, how: 'Annahme: beste Haltestrategie' },
  queen: { rtp: 0.95, L: 0.5, exact: false, how: 'Annahme: Flügelschlag' },
};

export function lossShare(game: string): LossShare | undefined {
  return LOSS_SHARE[game];
}
