// Long-run log for the "Wie das Haus gewinnt" page: after every round the running net result
// (all wins minus all stakes) and the expected result (minus stake × house edge) grow; every
// `step` rounds one point is kept. When 200 points are full, every other one is dropped and
// the step doubles, so the curve always spans the whole history in a fixed size.

import type { GameState, SaveData } from './state';

export const LONG_RUN_POINTS = 200;

export function installLongRun(state: GameState) {
  state.onRound((r) => {
    const d = state.data;
    const c = d.counters;
    c['lr:net'] = (c['lr:net'] ?? 0) + (r.win - r.stake);
    c['lr:exp'] = (c['lr:exp'] ?? 0) - r.stake * Math.max(0, 1 - r.rtp);
    c['lr:n'] = (c['lr:n'] ?? 0) + 1;
    const step = Math.max(1, c['lr:step'] ?? 1);
    if (c['lr:n'] % step !== 0) return;
    const lr = d.longRun;
    lr.net.push(Math.round(c['lr:net']));
    lr.exp.push(Math.round(c['lr:exp']));
    if (lr.net.length > LONG_RUN_POINTS) {
      lr.net = lr.net.filter((_, i) => i % 2 === 0);
      lr.exp = lr.exp.filter((_, i) => i % 2 === 0);
      c['lr:step'] = step * 2;
    }
  });
}

/** Rounds logged so far, and the rounds between two points. */
export const longRunRounds = (d: SaveData) => d.counters['lr:n'] ?? 0;
export const longRunStep = (d: SaveData) => Math.max(1, d.counters['lr:step'] ?? 1);

/** The curve including the newest, not yet sampled rounds. */
export function longRunCurve(d: SaveData) {
  const net = [...d.longRun.net];
  const exp = [...d.longRun.exp];
  const n = longRunRounds(d);
  if (n % longRunStep(d) !== 0) {
    net.push(Math.round(d.counters['lr:net'] ?? 0));
    exp.push(Math.round(d.counters['lr:exp'] ?? 0));
  }
  return { net, exp, rounds: n };
}
