// Stakes can change while a game is open (boss phase 2, a debug event switch, a Dietrich used at
// the table). Games poll this in update() and rebuild their bet ladder between rounds, never during one.

import { formatChips, type GameState } from '../core/state';
import { stakeEpoch } from '../core/itemsCore';

export class StakeWatch {
  private unit: number;
  private epoch: number;
  private why: 'unit' | 'item' = 'unit';

  constructor(private state: GameState) {
    this.unit = state.stakeUnit;
    this.epoch = stakeEpoch();
  }

  /** True once when today's stake unit (or an item's ladder) differs from the one the ladder was built for. Skipped while `busy`. */
  changed(busy: boolean) {
    if (busy) return false;
    const u = this.state.stakeUnit;
    const e = stakeEpoch();
    if (u === this.unit && e === this.epoch) return false;
    this.why = u !== this.unit ? 'unit' : 'item';
    this.unit = u;
    this.epoch = e;
    return true;
  }

  /** The line games show when the ladder changed. */
  get note() {
    if (this.why === 'item') return 'Neue Einsatzstufen an diesem Spiel.';
    return `Neue Einsätze: ab ${formatChips(this.unit)} Falter.`;
  }
}
