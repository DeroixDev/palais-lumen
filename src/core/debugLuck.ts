// Mod-Menü runtime cheats (test tool only, removed before a real release): the "Gewinnchance"
// slider, plus the trainer switches that act on the running game (stake and goal factor,
// animation speed, all floors open). Everything lives in the save's counters under 'dbg:*',
// so it survives a reload like normal play, and is absent (= neutral) in a normal save.
//
// Gewinnchance: one central hook every game's outcome draw goes through, `luckDraw(draw, net)`.
// - Neutral (bias 0): calls `draw()` exactly once and returns it, so the game's odds and its
//   random number stream stay byte-for-byte the same as without the hook.
// - Bias b in (0, 1]: with chance b the round is steered: the outcome is drawn again (up to
//   MAX_TRIES times) until it is a win (`net` > 0) and the first win is kept; otherwise the
//   round is drawn normally. So the win chance becomes p + b·(1 − p): +100 = always win.
// - Bias b in [-1, 0): the same towards a loss (`net` < 0): the win chance becomes p·(1 + b),
//   −100 = always lose.
// Games with several draws per round (a card per hit, a flip per call, a tile per click) steer
// each single draw towards the player's (or the house's) side with `luckStep`.
//
// Honesty: while the bias is not neutral `luckOn()` is true, and the items rail at every table
// shows a red "Mod-Menü" chip: the odds are steered, with the payout share measured since the
// slider was last moved (luckStats), since the games' own payout lines don't hold then.

import type { GameState, RoundReport } from './state';
import { setTweenSpeed } from './tween';

export const LUCK_KEY = 'dbg:luck';
/** Stake unit factor ×100 (100 = normal). */
export const STAKE_KEY = 'dbg:stake';
/** Day goal factor ×100 (100 = normal). */
export const GOAL_KEY = 'dbg:goal';
/** Animation speed ×100 (100 = normal). */
export const SPEED_KEY = 'dbg:speed';
/** 1: the elevator goes to every floor (read in GameState.topFloor). */
export const FLOORS_KEY = 'dbg:floors';

const MAX_TRIES = 400;

let bias = 0;
const stats = new Map<string, { rounds: number; stake: number; win: number; wins: number }>();
const listeners = new Set<() => void>();

/** Current bias, −1 (always lose) … 0 (normal) … 1 (always win). */
export function luckBias() {
  return bias;
}

/** True while the slider is not on neutral: the odds are manipulated. */
export function luckOn() {
  return bias !== 0;
}

/** Sets the slider (−100 … 100) and stores it in the save. */
export function setLuck(state: GameState, pct: number) {
  setCheat(state, LUCK_KEY, Math.max(-100, Math.min(100, Math.round(pct))), 0);
}

/** Stores a 'dbg:*' value; the neutral value removes it from the save. */
export function setCheat(state: GameState, key: string, v: number, neutral: number) {
  if (v === neutral || !Number.isFinite(v)) delete state.data.counters[key];
  else state.data.counters[key] = v;
  sync(state);
  state.emit();
}

/** A 'dbg:*' value, or its neutral value. */
export function cheat(state: GameState, key: string, neutral: number) {
  const v = state.data.counters[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : neutral;
}

function sync(state: GameState) {
  const v = cheat(state, LUCK_KEY, 0) / 100;
  const nb = Math.max(-1, Math.min(1, v));
  setTweenSpeed(Math.max(10, Math.min(800, cheat(state, SPEED_KEY, 100))) / 100);
  if (nb !== bias) {
    bias = nb;
    stats.clear();
    for (const l of listeners) l();
  }
}

/** Reads the cheats from the save (and on every later change, e.g. a loaded save), hooks the factors in, measures steered rounds. */
export function installDebugLuck(state: GameState) {
  sync(state);
  state.onChange(() => sync(state));
  state.stakeFactors.push(() => Math.max(1, cheat(state, STAKE_KEY, 100)) / 100);
  state.quotaFactors.push(() => Math.max(1, cheat(state, GOAL_KEY, 100)) / 100);
  state.onRound((r: RoundReport) => {
    if (!bias) return;
    const s = stats.get(r.game) ?? { rounds: 0, stake: 0, win: 0, wins: 0 };
    s.rounds++;
    s.stake += r.stake;
    s.win += r.win;
    if (r.win > r.stake) s.wins++;
    stats.set(r.game, s);
    for (const l of listeners) l();
  });
}

export function onLuckChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Measured rounds of a game since the slider was last moved (null: none yet). */
export function luckStats(game: string) {
  const s = stats.get(game);
  return s && s.rounds ? { rounds: s.rounds, rtp: s.stake > 0 ? s.win / s.stake : 0, winRate: s.wins / s.rounds } : null;
}

/** Every game measured since the slider was last moved. */
export function allLuckStats() {
  return [...stats.keys()].map((g) => ({ game: g, ...luckStats(g)! }));
}

/** "+40 % Richtung Gewinn", "immer verlieren", "normal" */
export function luckLabel(pct = Math.round(bias * 100)) {
  if (!pct) return 'normal';
  if (pct >= 100) return 'immer gewinnen';
  if (pct <= -100) return 'immer verlieren';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % Richtung ${pct > 0 ? 'Gewinn' : 'Verlust'}`;
}

const x = (v: number) => `×${(v / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;

/** Short names of the cheats that are on right now (for the menu's status line). */
export function activeCheats(state: GameState): string[] {
  const out: string[] = [];
  if (bias) out.push(`Gewinnchance ${luckLabel()}`);
  const st = cheat(state, STAKE_KEY, 100);
  if (st !== 100) out.push(`Einsätze ${x(st)}`);
  const g = cheat(state, GOAL_KEY, 100);
  if (g !== 100) out.push(`Tagesziel ${x(g)}`);
  const sp = cheat(state, SPEED_KEY, 100);
  if (sp !== 100) out.push(`Tempo ${x(sp)}`);
  if (cheat(state, FLOORS_KEY, 0)) out.push('Alle Etagen offen');
  return out;
}

/**
 * The hook: draws a round's outcome. `net` says what it pays the player minus the stake
 * (> 0 win, < 0 loss, 0 push). Neutral: exactly one plain draw.
 */
export function luckDraw<T>(draw: () => T, net: (r: T) => number): T {
  if (!bias) return draw();
  const want = bias > 0 ? 1 : -1;
  if (Math.random() >= Math.abs(bias)) return draw();
  let best = draw();
  let score = net(best) * want;
  for (let i = 1; i < MAX_TRIES && !(score > 0); i++) {
    const c = draw();
    const s = net(c) * want;
    if (s > score) {
      best = c;
      score = s;
    }
  }
  return best;
}

/** One draw inside a round: `good` says whether it goes the player's way. */
export function luckStep<T>(draw: () => T, good: (r: T) => boolean): T {
  return luckDraw(draw, (r) => (good(r) ? 1 : -1));
}
