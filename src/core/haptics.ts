// Small vibrations on phones that support them (navigator.vibrate): a tap for every bet,
// patterns for big wins, the day's goal and the boss phases. Off via the "Vibration" key.

import type { GameState } from './state';
import { BOSS_DAY } from './state';

const can = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let st: GameState | null = null;
let lastTap = 0;

function buzz(pattern: number | number[]) {
  if (!st || !st.data.settings?.haptics || !can()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw without a user gesture */
  }
}

export const haptics = {
  /** True when this device can vibrate at all (the toggle is still shown, for honesty it says so). */
  get supported() {
    return can();
  },
  get on() {
    return !!st?.data.settings?.haptics;
  },
  set(on: boolean) {
    if (!st) return;
    st.data.settings = { ...st.data.settings, haptics: on };
    if (on) buzz(18);
    st.emit();
  },
  /** Bet placed / spin started. Rate-limited so a chip spree isn't a buzz saw. */
  tap() {
    const now = performance.now();
    if (now - lastTap < 90) return;
    lastTap = now;
    buzz(12);
  },
  win10: () => buzz([30, 40, 30]),
  win50: () => buzz([40, 50, 40, 50, 120]),
  goal: () => buzz([20, 60, 20, 60, 60]),
  boss: () => buzz([80, 60, 160]),

  /** Hooks into the game state once: bets, round reports, the goal and the boss phase. */
  bind(state: GameState) {
    st = state;
    if (!state.data.settings) state.data.settings = { haptics: true };
    const place = state.placeBet.bind(state);
    state.placeBet = (amount: number) => {
      const ok = place(amount);
      if (ok) haptics.tap();
      return ok;
    };
    state.onRound((r) => {
      if (r.stake <= 0) return;
      if (r.win >= r.stake * 50) haptics.win50();
      else if (r.win >= r.stake * 10) haptics.win10();
    }, 'view');
    let goal = state.goalReached;
    let phase = state.data.bossPhase;
    let day = state.data.evening.number;
    state.onChange(() => {
      const d = state.data;
      if (d.evening.number !== day) {
        // A new day: nothing to celebrate yet.
        day = d.evening.number;
        goal = state.goalReached;
        phase = d.bossPhase;
        return;
      }
      const reached = state.goalReached;
      if (reached && !goal && d.evening.number < BOSS_DAY) haptics.goal();
      goal = reached;
      if (d.bossPhase > phase) haptics.boss();
      phase = d.bossPhase;
    });
  },
};
