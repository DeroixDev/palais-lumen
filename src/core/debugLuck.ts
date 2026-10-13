// House-tablet runtime cheats (for playing with friends): the "Gewinnchance"
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
// Quiet: nothing outside the house tablet (src/ui/tablet.ts) shows that a cheat is on. The
// tablet itself lists the active cheats and the payout share measured since the slider was last
// moved (luckStats).

import type { GameState, RoundReport } from './state';
import { setTweenSpeed } from './tween';

export const LUCK_KEY = 'dbg:luck';
/** Stake unit factor ×100 (100 = normal). */
export const STAKE_KEY = 'dbg:stake';
/** Day goal factor ×100 (100 = normal). */
export const GOAL_KEY = 'dbg:goal';
/** Animation speed ×100 (100 = normal). */
export const SPEED_KEY = 'dbg:speed';
/** Funkenfall: how fast the sparks fall ×100 (100 = normal). */
export const PLINKO_SPEED_KEY = 'dbg:plinkoSpeed';
/** Funkenfall: how many sparks may be on the board at once (8 = normal). */
export const PLINKO_MAX_KEY = 'dbg:plinkoMax';
export const PLINKO_MAX_NORMAL = 8;
/** Room camera: how close it sits ×100 (135 = normal, 100 = the old wide view). */
export const CAM_KEY = 'dbg:cam';
export const CAM_NORMAL = 135;
/** Walking speed in world px per second (210 = normal). */
export const WALK_KEY = 'dbg:walk';
export const WALK_NORMAL = 210;
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

/**
 * "Glück pro Spieler" in a group: a player's own Gewinnchance, stored next to the shared one
 * as 'dbg:luck:<player id>'. It travels to that player's game with the host's save and applies
 * there (every client draws its own rounds); 0 is stored too, so "normal" can override the rest.
 */
export const luckKeyFor = (playerId: string) => `${LUCK_KEY}:${playerId}`;
const isLuckKey = (k: string) => k.startsWith(`${LUCK_KEY}:`);

/** Player ids with their own Gewinnchance right now. */
export function luckTargets(state: GameState) {
  return Object.keys(state.data.counters)
    .filter(isLuckKey)
    .map((k) => k.slice(LUCK_KEY.length + 1));
}

/** The slider value for everyone (`target` empty) or for one player (that player's own value, else the shared one). */
export function luckFor(state: GameState, target = '') {
  const own = target ? state.data.counters[luckKeyFor(target)] : undefined;
  return typeof own === 'number' && Number.isFinite(own) ? own : cheat(state, LUCK_KEY, 0);
}

/**
 * Sets the slider (−100 … 100) and stores it in the save. Without a target it is the value for
 * everyone and replaces every player's own value; with one, only that player's.
 */
export function setLuck(state: GameState, pct: number, target = '') {
  const v = Math.max(-100, Math.min(100, Math.round(pct)));
  if (target) {
    state.data.counters[luckKeyFor(target)] = v;
    sync(state);
    state.emit();
    return;
  }
  for (const k of Object.keys(state.data.counters)) if (isLuckKey(k)) delete state.data.counters[k];
  setCheat(state, LUCK_KEY, v, 0);
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
  // This game's own value in a group (see luckKeyFor), else the shared one.
  const v = luckFor(state, state.selfId) / 100;
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
  }, 'view');
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
  const all = cheat(state, LUCK_KEY, 0);
  if (all) out.push(`Gewinnchance ${luckLabel(all)}`);
  for (const id of luckTargets(state)) out.push(`Gewinnchance ${state.data.players[id]?.name ?? id}: ${luckLabel(luckFor(state, id))}`);
  const st = cheat(state, STAKE_KEY, 100);
  if (st !== 100) out.push(`Einsätze ${x(st)}`);
  const g = cheat(state, GOAL_KEY, 100);
  if (g !== 100) out.push(`Tagesziel ${x(g)}`);
  const sp = cheat(state, SPEED_KEY, 100);
  if (sp !== 100) out.push(`Tempo ${x(sp)}`);
  const ps = cheat(state, PLINKO_SPEED_KEY, 100);
  if (ps !== 100) out.push(`Funkenfall-Tempo ${x(ps)}`);
  const pm = cheat(state, PLINKO_MAX_KEY, PLINKO_MAX_NORMAL);
  if (pm !== PLINKO_MAX_NORMAL) out.push(`Funkenfall: ${pm} Funken gleichzeitig`);
  const cm = cheat(state, CAM_KEY, CAM_NORMAL);
  if (cm !== CAM_NORMAL) out.push(`Kamera ${x(cm)}`);
  const wk = cheat(state, WALK_KEY, WALK_NORMAL);
  if (wk !== WALK_NORMAL) out.push(`Laufen ${wk} px/s`);
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
