// Straßenwürfel rules as pure functions (no Pixi), so scripts/rtp-craps.mjs can check them.
//
// Linie (the line bet), decided over one or more throws:
//   first throw ("Anwurf") 7 or 11 wins 1:1, 2, 3 or 12 loses, any other number becomes the
//   Punkt; then the Punkt again before a 7 wins 9:10, a 7 first loses.
// Feld (optional side bet, first throw only): 3, 4, 9, 10, 11 pay 1:1, 2 and 12 pay 2:1,
//   5, 6, 7, 8 lose.
// Real street craps pays the point 1:1 (98.6 %); the 9:10 point pay keeps the casino in its range.

export const LINE_NATURAL_PAY = 1;
export const LINE_POINT_PAY = 0.9;
export const POINTS = [4, 5, 6, 8, 9, 10] as const;

export type ComeOut = 'natural' | 'craps' | 'point';

export function comeOut(sum: number): ComeOut {
  if (sum === 7 || sum === 11) return 'natural';
  if (sum === 2 || sum === 3 || sum === 12) return 'craps';
  return 'point';
}

/** Total return of the field bet per unit stake for a throw (0 = lost). */
export function fieldReturn(sum: number) {
  if (sum === 2 || sum === 12) return 3;
  if (sum === 3 || sum === 4 || sum === 9 || sum === 10 || sum === 11) return 2;
  return 0;
}

/** Ways to throw each sum with two dice (index = sum). */
export const WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

/** Exact long-run return of the line bet. */
export function lineRtp() {
  let r = 0;
  for (let s = 2; s <= 12; s++) {
    const p = WAYS[s] / 36;
    const k = comeOut(s);
    if (k === 'natural') r += p * (1 + LINE_NATURAL_PAY);
    else if (k === 'point') r += p * (WAYS[s] / (WAYS[s] + 6)) * (1 + LINE_POINT_PAY);
  }
  return r;
}

/** Exact long-run return of the field bet. */
export function fieldRtp() {
  let r = 0;
  for (let s = 2; s <= 12; s++) r += (WAYS[s] / 36) * fieldReturn(s);
  return r;
}

export const LINE_RTP = lineRtp();
export const FIELD_RTP = fieldRtp();

/**
 * Whole Lumen paid back for a point win: stake × 1.9. A fraction (odd stakes) is rounded up
 * or down by chance in proportion, so the average stays exactly at 1.9 × stake.
 */
export function pointPays(stake: number, rand = Math.random) {
  const v = stake * (1 + LINE_POINT_PAY);
  const f = Math.floor(v + 1e-9);
  return f + (rand() < v - f - 1e-9 ? 1 : 0);
}

export function rollDie(rand = Math.random) {
  return 1 + Math.floor(rand() * 6);
}

/** Plays a whole round with the given stakes; returns the total paid back (for the RTP script). */
export function playRound(line: number, field: number, rand = Math.random) {
  let a = rollDie(rand) + rollDie(rand);
  const win = field > 0 ? field * fieldReturn(a) : 0;
  const k = comeOut(a);
  if (k === 'natural') return win + line * (1 + LINE_NATURAL_PAY);
  if (k === 'craps') return win;
  const point = a;
  for (;;) {
    a = rollDie(rand) + rollDie(rand);
    if (a === point) return win + pointPays(line, rand);
    if (a === 7) return win;
  }
}

// ---- Gezinkte Würfel (odds item) ---------------------------------------------------------------
// A 2, 3 or 12 on the first throw ("Anwurf") does not lose the line: the loaded dice are thrown
// once more and that throw counts as the Anwurf (it can still be 2, 3 or 12 and lose). The
// field bet stays decided by the first throw.

/** Exact long-run return of the line bet with the loaded dice. */
export function loadedLineRtp() {
  const once = (s: number) => {
    const k = comeOut(s);
    if (k === 'natural') return 1 + LINE_NATURAL_PAY;
    if (k === 'point') return (WAYS[s] / (WAYS[s] + 6)) * (1 + LINE_POINT_PAY);
    return 0;
  };
  let r = 0;
  for (let s = 2; s <= 12; s++) {
    const p = WAYS[s] / 36;
    if (comeOut(s) === 'craps') for (let t = 2; t <= 12; t++) r += p * (WAYS[t] / 36) * once(t);
    else r += p * once(s);
  }
  return r;
}

export const LOADED_LINE_RTP = loadedLineRtp();

/** A whole round with the loaded dice (for the RTP script). */
export function playRoundLoaded(line: number, field: number, rand = Math.random) {
  let a = rollDie(rand) + rollDie(rand);
  const win = field > 0 ? field * fieldReturn(a) : 0;
  if (comeOut(a) === 'craps') a = rollDie(rand) + rollDie(rand);
  const k = comeOut(a);
  if (k === 'natural') return win + line * (1 + LINE_NATURAL_PAY);
  if (k === 'craps') return win;
  const point = a;
  for (;;) {
    a = rollDie(rand) + rollDie(rand);
    if (a === point) return win + pointPays(line, rand);
    if (a === 7) return win;
  }
}
