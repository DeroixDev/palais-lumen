// Drei Laternen rules as a pure function (no Pixi), so scripts/rtp-shells.mjs can check it.
// The moth sits under the picked lantern with chance 1/3, drawn when the pick is made; the
// shuffle before it is only a show. A hit pays 2.85 × the stake back: 2.85 / 3 = 95 %.

export const PAY = 2.85;
export const RTP = PAY / 3;

/** Where the moth turns out to be, given the player's pick (0–2). */
export function mothUnder(pick: number, rand = Math.random) {
  if (rand() < 1 / 3) return pick;
  const others = [0, 1, 2].filter((i) => i !== pick);
  return others[rand() < 0.5 ? 0 : 1];
}

/**
 * What a hit pays for a stake: stake × 2.85 in whole Falter. A half Falter (odd stakes) is
 * rounded up or down by chance in proportion, so every stake gets exactly 95 % on average.
 */
export function hitPays(stake: number, rand = Math.random) {
  const v = stake * PAY;
  const f = Math.floor(v + 1e-9);
  return f + (rand() < v - f - 1e-9 ? 1 : 0);
}

// ---- Leuchtkäfer (odds item) -----------------------------------------------------------------
// After the dance a firefly settles on one lantern. It likes the dark: only 1 time in 5 is the
// moth under its lantern; under each of the other two it sits 2 times in 5. The firefly's
// lantern and the moth's place are drawn together, before the pick.

export const FLY_ON = 1 / 5;
/** Return of a pick away from the firefly: 2.85 × 2/5. */
export const FLY_RTP = (PAY * (1 - FLY_ON)) / 2;
/** Return of picking the firefly's own lantern: 2.85 × 1/5. */
export const FLY_SELF_RTP = PAY * FLY_ON;

/** Where the firefly sits and where the moth is (lantern slots 0–2). */
export function flyRound(rand = Math.random) {
  const fly = Math.floor(rand() * 3);
  const r = rand();
  const others = [0, 1, 2].filter((i) => i !== fly);
  const moth = r < FLY_ON ? fly : others[r < FLY_ON + (1 - FLY_ON) / 2 ? 0 : 1];
  return { fly, moth };
}
