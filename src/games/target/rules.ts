// Zielscheibe rules, free of imports so scripts/rtp-target.mjs can load them as they are.
//
// Each throwing style has its own ring table (bullseye first, outermost last) and a chance to
// miss the target. The hit is drawn before the dart leaves the hand; the ring's share of the
// target's area equals its share of the hits, so the ring sizes show the odds honestly.

export type Style = 'safe' | 'normal' | 'risky';
export const STYLE_ORDER: Style[] = ['safe', 'normal', 'risky'];

export interface Ring {
  mult: number;
  p: number;
}

export const STYLES: Record<Style, { label: string; rings: Ring[] }> = {
  safe: {
    label: 'Sicher',
    rings: [
      { mult: 5, p: 0.02 },
      { mult: 2, p: 0.1 },
      { mult: 1.5, p: 0.18 },
      { mult: 1, p: 0.2 },
      { mult: 0.5, p: 0.36 },
    ],
  },
  normal: {
    label: 'Normal',
    rings: [
      { mult: 20, p: 0.01 },
      { mult: 5, p: 0.05 },
      { mult: 2, p: 0.12 },
      { mult: 1, p: 0.16 },
      { mult: 0.5, p: 0.2 },
    ],
  },
  risky: {
    label: 'Riskant',
    rings: [
      { mult: 100, p: 0.004 },
      { mult: 10, p: 0.02 },
      { mult: 4, p: 0.05 },
      { mult: 1.5, p: 0.1 },
    ],
  },
};

/** Chance that the dart misses the target altogether. */
export function missChance(style: Style) {
  return 1 - STYLES[style].rings.reduce((s, r) => s + r.p, 0);
}

export function returnToPlayer(style: Style) {
  return STYLES[style].rings.reduce((s, r) => s + r.p * r.mult, 0);
}

/** Ring index hit (0 = bullseye), or -1 for a miss. Drawn before the throw. */
export function drawHit(style: Style, rand = Math.random) {
  let r = rand();
  const rings = STYLES[style].rings;
  for (let i = 0; i < rings.length; i++) {
    r -= rings[i].p;
    if (r < 0) return i;
  }
  return -1;
}

/** Outer radius of each ring as a share of the target radius (area ∝ chance). */
export function ringRadii(style: Style) {
  const rings = STYLES[style].rings;
  const hit = 1 - missChance(style);
  let cum = 0;
  return rings.map((r) => {
    cum += r.p;
    return Math.sqrt(cum / hit);
  });
}

export function multFor(style: Style, ring: number) {
  return ring < 0 ? 0 : STYLES[style].rings[ring].mult;
}
