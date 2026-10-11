// Kratzglück rules, free of Pixi so scripts/rtp-scratch.mjs can import them.
// Each card design has a fixed prize table (weights out of 1,000,000 tickets). The prize is
// drawn first; the 3×3 symbol field is then laid out to show it: three equal symbols win that
// symbol's prize, a losing card never shows three of a kind.

/** Symbol tiers, cheapest first (indices into the slot symbol set). */
export const TIER_SYMBOLS = ['firefly', 'candle', 'lantern', 'key', 'moon', 'moth'] as const;
export type TierSymbol = (typeof TIER_SYMBOLS)[number];

export interface ScratchDesign {
  id: string;
  name: string;
  /** Day-1 prices; scaled by state.stakes(). */
  ladder: number[];
  /** Multiplier for three of TIER_SYMBOLS[i]. */
  mult: number[];
  /** Tickets per million that win tier i; the rest lose. */
  weight: number[];
  /** Coating colours (wing base, wing dark, accent). */
  wing: [number, number, number];
  card: number;
}

export const TICKETS = 1_000_000;

export const DESIGNS: ScratchDesign[] = [
  {
    id: 'falter',
    name: 'Kerzenschein',
    ladder: [10, 20, 50],
    mult: [1, 2, 5, 10, 20, 100],
    weight: [220_000, 130_000, 45_000, 12_000, 4_000, 400],
    wing: [0xc89a5a, 0x6a3a1a, 0xff5fa2],
    card: 0x5a1a3a,
  },
  {
    id: 'mond',
    name: 'Mondschein',
    ladder: [50, 100, 200],
    mult: [2, 4, 10, 25, 100, 500],
    weight: [150_000, 50_000, 18_000, 5_000, 1_000, 100],
    wing: [0x8aa8d8, 0x2a3a6a, 0xfff1c4],
    card: 0x1a2a5a,
  },
  {
    id: 'gold',
    name: 'Goldstaub',
    ladder: [200, 500, 1000],
    mult: [2, 5, 20, 50, 200, 1000],
    weight: [110_000, 40_000, 8_000, 3_000, 600, 100],
    wing: [0xe8c060, 0x7a4a10, 0xffffff],
    card: 0x3a2a0a,
  },
];

export function returnToPlayer(d: ScratchDesign) {
  return d.mult.reduce((s, m, i) => s + (m * d.weight[i]) / TICKETS, 0);
}

export function winChance(d: ScratchDesign) {
  return d.weight.reduce((s, w) => s + w, 0) / TICKETS;
}

/** Draws the prize tier: -1 = no win. */
export function drawTier(d: ScratchDesign, rand: () => number = Math.random) {
  let r = Math.floor(rand() * TICKETS);
  for (let i = 0; i < d.weight.length; i++) {
    if (r < d.weight[i]) return i;
    r -= d.weight[i];
  }
  return -1;
}

function shuffle<T>(a: T[], rand: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lays out 9 symbol tiers showing exactly the prize `tier` (or none for -1). */
export function layoutCard(tier: number, rand: () => number = Math.random): number[] {
  const others: number[] = [];
  for (let s = 0; s < TIER_SYMBOLS.length; s++) if (s !== tier) others.push(s, s);
  shuffle(others, rand);
  const cells = tier >= 0 ? [tier, tier, tier, ...others.slice(0, 6)] : others.slice(0, 9);
  return shuffle(cells, rand);
}

/** The tier a laid-out card shows (three of a kind), or -1. */
export function cardTier(cells: number[]) {
  const n = new Array<number>(TIER_SYMBOLS.length).fill(0);
  for (const c of cells) n[c]++;
  return n.findIndex((k) => k >= 3);
}

export interface Ticket {
  tier: number;
  mult: number;
  cells: number[];
}

/** Buys one ticket: prize first, then the field that shows it. */
export function drawTicket(d: ScratchDesign, rand: () => number = Math.random): Ticket {
  const tier = drawTier(d, rand);
  return { tier, mult: tier >= 0 ? d.mult[tier] : 0, cells: layoutCard(tier, rand) };
}

// ---- Funkenstaub (odds item) -----------------------------------------------------------------
// A losing card that shows both moons and both moths (two of each) is dusted over: the moth
// trades it for a fresh ticket of the same design, once. A losing field holds 9 of the 12
// cells (every symbol twice), so that happens with chance C(8,5) / C(12,9) = 14/55, and the
// return is RTP × (1 + P(lose) × 14/55).

const MOON = TIER_SYMBOLS.indexOf('moon');
const MOTH = TIER_SYMBOLS.indexOf('moth');
export const DUST_CHANCE = 14 / 55;

/** Does this (losing) field earn a fresh ticket? */
export function dusted(cells: number[]) {
  return cardTier(cells) < 0 && cells.filter((c) => c === MOON).length === 2 && cells.filter((c) => c === MOTH).length === 2;
}

export function dustRtp(d: ScratchDesign) {
  return returnToPlayer(d) * (1 + (1 - winChance(d)) * DUST_CHANCE);
}
