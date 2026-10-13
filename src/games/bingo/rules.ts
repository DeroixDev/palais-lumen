// Glühwürmchen-Bingo rules, free of Pixi so scripts/rtp-bingo.mjs can import them.
// A card of size×size distinct numbers from 1..pool; `draws` fireflies (distinct numbers)
// fly out of the jar. Complete rows, columns and both diagonals count as lines. The prize
// depends on the number of lines; a fully lit card pays the top prize instead.

export type CardSize = 3 | 4;

export interface BingoMode {
  size: CardSize;
  pool: number;
  draws: number;
  /** linePay[i]: multiplier for i complete lines (the last entry covers "i or more"). */
  linePay: number[];
  fullPay: number;
  /** Names of the prize tiers for the paytable (same indices as linePay). */
  tierNames: string[];
}

export const MODES: Record<CardSize, BingoMode> = {
  3: { size: 3, pool: 36, draws: 15, linePay: [0, 2, 3, 7], fullPay: 200, tierNames: ['', '1 Linie', '2 Linien', '3+ Linien'] },
  4: { size: 4, pool: 36, draws: 20, linePay: [0, 1, 2, 4, 12], fullPay: 5000, tierNames: ['', '1 Linie', '2 Linien', '3 Linien', '4+ Linien'] },
};

/** All lines of a card as lists of cell indices (row-major): rows, columns, two diagonals. */
export function cardLines(size: number): number[][] {
  const L: number[][] = [];
  for (let r = 0; r < size; r++) L.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) L.push(Array.from({ length: size }, (_, r) => r * size + c));
  L.push(Array.from({ length: size }, (_, i) => i * size + i));
  L.push(Array.from({ length: size }, (_, i) => i * size + size - 1 - i));
  return L;
}

export function bingoMultiplier(mode: BingoMode, lines: number, full: boolean) {
  if (full) return mode.fullPay;
  return mode.linePay[Math.min(lines, mode.linePay.length - 1)];
}

function shuffled(n: number, take: number, rand: () => number) {
  const all = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, take);
}

/** A fresh card: size² distinct numbers, each column sorted top to bottom like a real card. */
export function newCard(mode: BingoMode, rand: () => number = Math.random): number[] {
  const s = mode.size;
  const nums = shuffled(mode.pool, s * s, rand);
  const card = new Array<number>(s * s);
  for (let c = 0; c < s; c++) {
    const col = nums.slice(c * s, c * s + s).sort((a, b) => a - b);
    for (let r = 0; r < s; r++) card[r * s + c] = col[r];
  }
  return card;
}

/** The fireflies of one round, in flying order. */
export function drawFireflies(mode: BingoMode, rand: () => number = Math.random): number[] {
  return shuffled(mode.pool, mode.draws, rand);
}

export interface BingoResult {
  /** Marked cells. */
  marked: boolean[];
  /** Completed lines (cell indices). */
  lines: number[][];
  full: boolean;
  mult: number;
}

export function scoreCard(mode: BingoMode, card: number[], drawn: number[]): BingoResult {
  const set = new Set(drawn);
  const marked = card.map((n) => set.has(n));
  const lines = cardLines(mode.size).filter((l) => l.every((i) => marked[i]));
  const full = marked.every(Boolean);
  return { marked, lines, full, mult: bingoMultiplier(mode, lines.length, full) };
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Exact chances per outcome: the marked cells are a uniformly random subset whose size is
 * hypergeometric, so every subset of the card is enumerated once with its weight.
 * Returns [P(0 lines), P(1 line) ...] (without full cards) and P(full).
 */
export function outcomeChances(mode: BingoMode) {
  const m = mode.size * mode.size;
  const lineMasks = cardLines(mode.size).map((l) => l.reduce((a, i) => a | (1 << i), 0));
  const byLines = new Array<number>(lineMasks.length + 1).fill(0);
  let full = 0;
  const total = choose(mode.pool, mode.draws);
  for (let mask = 0; mask < 1 << m; mask++) {
    let j = 0;
    for (let x = mask; x; x &= x - 1) j++;
    const p = choose(mode.pool - m, mode.draws - j) / total;
    if (!p) continue;
    if (j === m) {
      full += p;
      continue;
    }
    let n = 0;
    for (const l of lineMasks) if ((mask & l) === l) n++;
    byLines[n] += p;
  }
  return { byLines, full };
}

const rtpCache = new Map<number, number>();
/** Exact long-run payout share of a card size. */
export function returnToPlayer(mode: BingoMode) {
  let r = rtpCache.get(mode.size);
  if (r === undefined) {
    const { byLines, full } = outcomeChances(mode);
    r = byLines.reduce((s, p, n) => s + p * bingoMultiplier(mode, n, false), 0) + full * mode.fullPay;
    rtpCache.set(mode.size, r);
  }
  return r;
}

// ---- Sternschnuppe (odds item) ----------------------------------------------------------------
// One more firefly flies out of the jar (draws + 1), the prizes stay. Exact by the same count.

export function extraMode(mode: BingoMode): BingoMode {
  return { ...mode, draws: mode.draws + 1 };
}

const starCache = new Map<number, number>();
/** Exact long-run payout share of a card size with one extra firefly. */
export function starRtp(mode: BingoMode) {
  let r = starCache.get(mode.size);
  if (r === undefined) {
    const { byLines, full } = outcomeChances(extraMode(mode));
    r = byLines.reduce((s, p, n) => s + p * bingoMultiplier(mode, n, false), 0) + full * mode.fullPay;
    starCache.set(mode.size, r);
  }
  return r;
}
