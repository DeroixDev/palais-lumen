// The whole game state lives in one serialisable object (SaveData).
// In coop the host owns this object and the save file; guests only send actions.

export const SAVE_VERSION = 1;
const MAX_CHIPS = Number.MAX_SAFE_INTEGER; // chips are whole numbers, never floats

export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
export type TrophyKind = 'cup' | 'crystal' | 'jackpot' | 'crown';

export interface Trophy {
  id: string;
  kind: TrophyKind;
  medal: Medal;
  title: string;
  evening: number;
  earnedAt: number;
}

export interface PlayerProfile {
  name: string;
  color: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  savedAt: number;
  balance: number;
  evening: { number: number; startBalance: number; quota: number };
  roomId: string;
  position: { x: number; y: number };
  unlockedRooms: string[];
  trophies: Trophy[];
  medals: Record<Medal, number>;
  stats: { rounds: number; wagered: number; won: number; biggestWin: number; rescues: number };
  /** Coop players stored in the host's save, keyed by player id. */
  players: Record<string, PlayerProfile>;
}

export interface EveningResult {
  evening: number;
  startBalance: number;
  endBalance: number;
  profit: number;
  quota: number;
  ratio: number;
  medal: Medal;
  trophy: Trophy | null;
  wagered: number;
  won: number;
}

export const START_BALANCE = 1000;
export const RESCUE_AMOUNT = 500;

export function quotaFor(startBalance: number) {
  return Math.max(200, Math.round((startBalance * 0.25) / 50) * 50);
}

export function newSave(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    balance: START_BALANCE,
    evening: { number: 1, startBalance: START_BALANCE, quota: quotaFor(START_BALANCE) },
    roomId: 'lobby',
    position: { x: -1, y: -1 },
    unlockedRooms: ['lobby'],
    trophies: [],
    medals: { none: 0, bronze: 0, silver: 0, gold: 0, diamond: 0 },
    stats: { rounds: 0, wagered: 0, won: 0, biggestWin: 0, rescues: 0 },
    players: { host: { name: 'Du', color: 0xffcf7a } },
  };
}

const clampChips = (n: number) => Math.max(0, Math.min(MAX_CHIPS, Math.floor(n)));

export function medalFor(ratio: number): Medal {
  if (ratio >= 3) return 'diamond';
  if (ratio >= 2) return 'gold';
  if (ratio >= 1.5) return 'silver';
  if (ratio >= 1) return 'bronze';
  return 'none';
}

export const MEDAL_LABEL: Record<Medal, string> = {
  none: 'Keine Medaille',
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
  diamond: 'Diamant',
};

type Listener = () => void;

export class GameState {
  data: SaveData;
  private listeners = new Set<Listener>();
  /** Per-evening counters, kept outside the save so a reload starts the evening's tally fresh. */
  private eveningWagered = 0;
  private eveningWon = 0;

  constructor(data: SaveData) {
    this.data = data;
  }

  replace(data: SaveData) {
    this.data = data;
    this.eveningWagered = 0;
    this.eveningWon = 0;
    this.emit();
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const l of this.listeners) l();
  }

  get balance() {
    return this.data.balance;
  }

  canAfford(amount: number) {
    return amount > 0 && amount <= this.data.balance;
  }

  /** Takes the stake. Returns false if the player cannot afford it. */
  placeBet(amount: number): boolean {
    amount = clampChips(amount);
    if (!this.canAfford(amount)) return false;
    this.data.balance -= amount;
    this.data.stats.wagered = clampChips(this.data.stats.wagered + amount);
    this.eveningWagered += amount;
    this.data.stats.rounds++;
    this.emit();
    return true;
  }

  payout(amount: number) {
    amount = clampChips(amount);
    if (amount <= 0) return;
    this.data.balance = clampChips(this.data.balance + amount);
    this.data.stats.won = clampChips(this.data.stats.won + amount);
    this.data.stats.biggestWin = Math.max(this.data.stats.biggestWin, amount);
    this.eveningWon += amount;
    this.emit();
  }

  get eveningProfit() {
    return this.data.balance - this.data.evening.startBalance;
  }

  /** Player is broke: hand out play money so the save never dead-ends. */
  needsRescue(minBet: number) {
    return this.data.balance < minBet;
  }

  rescue() {
    this.data.balance = clampChips(this.data.balance + RESCUE_AMOUNT);
    this.data.stats.rescues++;
    // The rescue counts as part of the evening's starting money, not as profit.
    this.data.evening.startBalance += RESCUE_AMOUNT;
    this.emit();
  }

  unlockRoom(id: string, cost: number): boolean {
    if (this.data.unlockedRooms.includes(id)) return true;
    if (this.data.balance < cost) return false;
    this.data.balance -= cost;
    // Spending on rooms is an investment, it does not count against tonight's quota.
    this.data.evening.startBalance -= cost;
    this.data.unlockedRooms.push(id);
    this.emit();
    return true;
  }

  addTrophy(kind: TrophyKind, medal: Medal, title: string): Trophy {
    const t: Trophy = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      medal,
      title,
      evening: this.data.evening.number,
      earnedAt: Date.now(),
    };
    this.data.trophies.push(t);
    this.emit();
    return t;
  }

  endEvening(): EveningResult {
    const ev = this.data.evening;
    const profit = this.data.balance - ev.startBalance;
    const ratio = profit / ev.quota;
    const medal = medalFor(ratio);
    this.data.medals[medal]++;
    let trophy: Trophy | null = null;
    if (medal === 'silver' || medal === 'gold' || medal === 'diamond') {
      const kind: TrophyKind = medal === 'diamond' ? 'crown' : medal === 'gold' ? 'crystal' : 'cup';
      trophy = this.addTrophy(kind, medal, `Abend ${ev.number}: ${MEDAL_LABEL[medal]}`);
    }
    const result: EveningResult = {
      evening: ev.number,
      startBalance: ev.startBalance,
      endBalance: this.data.balance,
      profit,
      quota: ev.quota,
      ratio,
      medal,
      trophy,
      wagered: this.eveningWagered,
      won: this.eveningWon,
    };
    if (this.data.balance < 50) this.rescue();
    const start = this.data.balance;
    this.data.evening = { number: ev.number + 1, startBalance: start, quota: quotaFor(start) };
    this.eveningWagered = 0;
    this.eveningWon = 0;
    this.emit();
    return result;
  }
}

export function formatChips(n: number) {
  return Math.floor(n).toLocaleString('de-DE');
}
