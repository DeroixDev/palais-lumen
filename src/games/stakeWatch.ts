// Stakes can change while a game is open (boss phase 2, a debug event switch). Games poll this
// in update() and rebuild their bet ladder between rounds, never during one.

import { formatChips, type GameState } from '../core/state';

export class StakeWatch {
  private unit: number;

  constructor(private state: GameState) {
    this.unit = state.stakeUnit;
  }

  /** True once when today's stake unit differs from the one the ladder was built for. Skipped while `busy`. */
  changed(busy: boolean) {
    if (busy) return false;
    const u = this.state.stakeUnit;
    if (u === this.unit) return false;
    this.unit = u;
    return true;
  }

  /** The line games show when the ladder changed. */
  get note() {
    return `Neue Einsätze: ab ${formatChips(this.unit)} Falter.`;
  }
}
