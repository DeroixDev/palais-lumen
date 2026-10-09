// The whole game state lives in one serialisable object (SaveData).
// In coop the host owns this object and the save file; guests only send actions.

import { ACHIEVEMENTS, type Achievement } from './achievements';
import { CHARMS, DEFAULT_OUTFITTING, WARDROBE, type CharmId, type Outfitting } from './items';

export const SAVE_VERSION = 4;
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
  skin?: number;
  /** Clothes, hair, hat and companion picked in the wardrobe. */
  look?: Outfitting;
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
  /** A season is one run of evenings; it ends when an evening's goal is missed. */
  season: { number: number; startedAt: number };
  /** Bests across all seasons; they survive a lost season. */
  records: { bestEvening: number; bestBalance: number; seasonsPlayed: number; seasonsWon: number };
  /** Second currency, earned by playing well and never for sale. Survives lost seasons. */
  moonstones: number;
  /** Ids of wardrobe items bought in the shop (kept forever). */
  owned: string[];
  /** Charms bought for the current season. */
  charms: CharmId[];
  /** "Zweite Chance" already used this season. */
  charmUsed: boolean;
  /** Ids of unlocked achievements with the time they unlocked. */
  achievements: Record<string, number>;
  /** Small counters for achievements: games played, wishes, piano notes, props used. */
  counters: Record<string, number>;
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
  /** Goal reached: the season goes on with the next evening. */
  passed: boolean;
  season: number;
  /** Evenings cleared in this season, including this one if passed. */
  cleared: number;
  /** True if this season reached further than any before. */
  newRecord: boolean;
  /** The boss day was won: the whole season is won. */
  seasonWon: boolean;
  /** Floor that opened with this result (the next day is on a new floor), or 0. */
  newFloor: number;
  /** Mondsteine earned with this day. */
  moonstones: number;
  /** The goal was missed but "Zweite Chance" kept the season going. */
  rescued: boolean;
  /** Bonus Falter from charms at the start of the next day. */
  bonus: number;
}

export const START_BALANCE = 1000;

/** A season: four floors with three days each, then one day on the boss floor. */
export const DAYS_PER_FLOOR = 3;
export const BOSS_DAY = 13;
export const FLOORS = 5;

/** Floor (1–5) the given day belongs to. */
export function floorForDay(day: number) {
  return day >= BOSS_DAY ? FLOORS : Math.min(FLOORS - 1, Math.ceil(day / DAYS_PER_FLOOR));
}

/** Profit goal for a day of the season. It rises every day; the boss day asks for more. */
export function quotaFor(day: number) {
  const base = 250 * Math.pow(1.25, Math.min(day, BOSS_DAY) - 1);
  return Math.round((day >= BOSS_DAY ? base * 1.6 : base) / 50) * 50;
}

export function newSave(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    balance: START_BALANCE,
    evening: { number: 1, startBalance: START_BALANCE, quota: quotaFor(1) },
    roomId: 'foyer',
    position: { x: -1, y: -1 },
    unlockedRooms: ['f1'],
    trophies: [],
    medals: { none: 0, bronze: 0, silver: 0, gold: 0, diamond: 0 },
    stats: { rounds: 0, wagered: 0, won: 0, biggestWin: 0, rescues: 0 },
    players: { host: { name: 'Du', color: 0xffcf7a } },
    season: { number: 1, startedAt: now },
    records: { bestEvening: 0, bestBalance: START_BALANCE, seasonsPlayed: 0, seasonsWon: 0 },
    moonstones: 0,
    owned: [],
    charms: [],
    charmUsed: false,
    achievements: {},
    counters: {},
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

/** Mondsteine for a day's medal. */
export const MOONSTONES_FOR: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3, diamond: 5 };
export const MOONSTONES_BOSS = 10;

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
    this.roundStake += amount;
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
    // Big multiples of the stake count for achievements.
    if (this.roundStake > 0) {
      const mult = amount / this.roundStake;
      if (mult >= 10) this.data.counters.win10 = (this.data.counters.win10 ?? 0) + 1;
      if (mult >= 50) this.data.counters.win50 = (this.data.counters.win50 ?? 0) + 1;
    }
    this.roundStake = 0;
    this.data.records.bestBalance = Math.max(this.data.records.bestBalance, this.data.balance);
    this.emit();
  }

  /** Stake placed since the last payout (one round, roughly). */
  private roundStake = 0;

  // ---- Foyer: Mondsteine, shop, wardrobe, achievements ---------------------

  count(key: string, by = 1) {
    this.data.counters[key] = (this.data.counters[key] ?? 0) + by;
    this.emit();
  }

  get look(): Outfitting {
    return { ...DEFAULT_OUTFITTING, ...this.data.players.host?.look };
  }

  setLook(look: Outfitting) {
    const host = this.data.players.host ?? (this.data.players.host = { name: 'Du', color: 0xffcf7a });
    host.look = look;
    this.count('outfit');
  }

  /** Free items and bought ones. */
  isOwned(id: string) {
    const o = WARDROBE.find((w) => w.id === id);
    return (o && o.price === 0) || this.data.owned.includes(id);
  }

  buyItem(id: string): boolean {
    const o = WARDROBE.find((w) => w.id === id);
    if (!o || this.isOwned(id) || this.data.moonstones < o.price) return false;
    this.data.moonstones -= o.price;
    this.data.owned.push(id);
    this.emit();
    return true;
  }

  hasCharm(id: CharmId) {
    return this.data.charms.includes(id);
  }

  buyCharm(id: CharmId): boolean {
    const c = CHARMS.find((x) => x.id === id);
    if (!c || this.hasCharm(id) || this.data.moonstones < c.price) return false;
    this.data.moonstones -= c.price;
    this.data.charms.push(id);
    // The boss charm lowers today's goal right away if today is the boss day.
    if (id === 'bossbann' && this.data.evening.number >= BOSS_DAY) this.data.evening.quota = this.quotaToday(this.data.evening.number);
    this.count('charms');
    return true;
  }

  /** Goal for a day with this season's charms applied. */
  quotaToday(day: number) {
    let q = quotaFor(day);
    if (this.hasCharm('rabatt')) q *= 0.9;
    if (day >= BOSS_DAY && this.hasCharm('bossbann')) q *= 0.8;
    return Math.max(50, Math.round(q / 50) * 50);
  }

  /** Newly unlocked achievements; pays their Mondsteine. Call after state changes. */
  checkAchievements(): Achievement[] {
    const fresh: Achievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id]) continue;
      const [v, max] = a.progress(this.data);
      if (v >= max) {
        this.data.achievements[a.id] = Date.now();
        this.data.moonstones += a.reward;
        fresh.push(a);
      }
    }
    if (fresh.length) this.emit();
    return fresh;
  }

  get eveningProfit() {
    return this.data.balance - this.data.evening.startBalance;
  }

  /** Highest floor the elevator can go to today. */
  get topFloor() {
    return floorForDay(this.data.evening.number);
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
    const passed = medal !== 'none';
    const rescued = !passed && this.hasCharm('zweiteChance') && !this.data.charmUsed && ev.number < BOSS_DAY && this.data.balance > 0;
    if (rescued) this.data.charmUsed = true;
    if (passed) this.data.medals[medal]++;
    let trophy: Trophy | null = null;
    if (medal === 'silver' || medal === 'gold' || medal === 'diamond') {
      const kind: TrophyKind = medal === 'diamond' ? 'crown' : medal === 'gold' ? 'crystal' : 'cup';
      trophy = this.addTrophy(kind, medal, `Saison ${this.data.season.number}, Tag ${ev.number}: ${MEDAL_LABEL[medal]}`);
    }
    const seasonWon = passed && ev.number >= BOSS_DAY;
    if (seasonWon) trophy = this.addTrophy('crown', 'diamond', `Saison ${this.data.season.number}: Mottenkönigin besiegt`);
    const goesOn = (passed || rescued) && !seasonWon;
    const newFloor = goesOn && floorForDay(ev.number + 1) > floorForDay(ev.number) ? floorForDay(ev.number + 1) : 0;
    const cleared = passed ? ev.number : ev.number - 1;
    const stones = MOONSTONES_FOR[medal] + (seasonWon ? MOONSTONES_BOSS : 0);
    this.data.moonstones += stones;
    const rec = this.data.records;
    const newRecord = cleared > rec.bestEvening;
    rec.bestEvening = Math.max(rec.bestEvening, cleared);
    rec.bestBalance = Math.max(rec.bestBalance, this.data.balance);
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
      passed,
      season: this.data.season.number,
      cleared,
      newRecord,
      seasonWon,
      newFloor,
      moonstones: stones,
      rescued,
      bonus: 0,
    };
    if (goesOn) {
      const n = ev.number + 1;
      // Charms pay out at the start of the new day; that money doesn't count towards its goal.
      let bonus = 0;
      if (this.hasCharm('startgeld')) bonus += 150;
      if (this.hasCharm('zinsen')) bonus += Math.min(300, Math.floor(this.data.balance * 0.05));
      this.data.balance += bonus;
      result.bonus = bonus;
      this.data.evening = { number: n, startBalance: this.data.balance, quota: this.quotaToday(n) };
    } else {
      // Season over: fresh money and evening 1. Trophies, medals, rooms and records stay.
      rec.seasonsPlayed++;
      if (seasonWon) rec.seasonsWon++;
      this.data.unlockedRooms = ['f1'];
      this.data.roomId = 'foyer';
      this.data.season = { number: this.data.season.number + 1, startedAt: Date.now() };
      this.data.balance = START_BALANCE;
      this.data.evening = { number: 1, startBalance: START_BALANCE, quota: quotaFor(1) };
      this.data.charms = [];
      this.data.charmUsed = false;
    }
    this.eveningWagered = 0;
    this.eveningWon = 0;
    this.emit();
    return result;
  }
}

export function formatChips(n: number) {
  return Math.floor(n).toLocaleString('de-DE');
}
