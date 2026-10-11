// The boss corridor on floor 5: walk right, one machine at a time, exactly one try each, gates
// in between, the Selene's duel at the far end. Only the order and the one-try rule live
// here (no Pixi); the room art is src/world/bossRun.ts, the flow src/ui/bossRun.ts.
//
// Progress is one save counter: how many machines have had their try ('run:spent'). It goes
// up the moment the stake is placed, so a reload mid-round never grants a second try. A new
// day (next day, new season, debug jump) clears it.

import type { GameContext, RoomDefinition, StationPlacement } from './registry';
import type { GameState, SaveData } from './state';

export const RUN_KEY = 'run:spent';

/** Corridor geometry (world pixels), shared by the room file and the room art. */
export const CORRIDOR = {
  width: 4400,
  height: 620,
  /** Centres of the machines, left to right. */
  machines: [920, 1560, 2200, 2840, 3480],
  /** Gate after each machine. */
  gates: [1240, 1880, 2520, 3160, 3800],
  /** The throne at the far right. */
  throne: { x: 4130, y: 380 },
};
export const MACHINES = CORRIDOR.machines.length;

/** Machines whose try is used up (0..MACHINES). */
export const spentCount = (d: SaveData) => Math.max(0, Math.min(MACHINES, d.counters[RUN_KEY] ?? 0));

/** Gate i is open once machine i had its try. */
export const gateOpen = (d: SaveData, i: number) => spentCount(d) > i;

export function markSpent(d: SaveData, i: number) {
  d.counters[RUN_KEY] = Math.max(spentCount(d), Math.min(MACHINES, i + 1));
}

/** Today's machines of the corridor, left to right. */
export function corridorMachines(def: RoomDefinition) {
  return [...def.stations].sort((a, b) => a.x - b.x);
}

/** Position of a station in the corridor (0-based), or -1. */
export function machineIndex(def: RoomDefinition, st: StationPlacement) {
  return corridorMachines(def).findIndex((s) => s === st || (s.x === st.x && s.y === st.y && s.game === st.game));
}

export function installBossRun(state: GameState) {
  state.onDayStart((d) => {
    delete d.counters[RUN_KEY];
  });
}

/**
 * The one try at a corridor machine. Wraps the game's context: the first stake goes through
 * and spends the machine; after that only Selene 21 may add to the same running hand
 * (double, split). Once the round is reported every further stake is refused.
 */
export class OneShot {
  bets = 0;
  reported = false;
  /** When a stake was last refused (to swallow the game's own "not enough Lumen" toast). */
  private refusedAt = -1e9;

  constructor(
    private state: GameState,
    readonly index: number,
    readonly game: string,
    private onRefuse: (text: string) => void,
  ) {}

  private bet(amount: number) {
    const more = this.bets > 0 && this.game === 'blackjack' && !this.reported;
    if (this.reported || (this.bets > 0 && !more)) {
      this.refusedAt = performance.now();
      this.onRefuse('Kein zweiter Versuch: dieser Automat hatte seine Runde.');
      return false;
    }
    if (!this.state.canAfford(Math.floor(amount))) return this.state.placeBet(amount);
    // Spent first, then the stake: both land in the same autosave.
    markSpent(this.state.data, this.index);
    this.bets++;
    return this.state.placeBet(amount);
  }

  wrap(ctx: GameContext): GameContext {
    const target = this.state;
    const state = new Proxy(target, {
      get: (t, p) => {
        if (p === 'placeBet') return (a: number) => this.bet(a);
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set: (t, p, v) => Reflect.set(t, p, v, t),
    });
    return {
      ...ctx,
      state,
      toast: (text) => {
        if (performance.now() - this.refusedAt < 120) return;
        ctx.toast(text);
      },
    };
  }
}
