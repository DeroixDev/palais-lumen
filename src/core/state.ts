// The whole game state lives in one serialisable object (SaveData).
// In coop the host owns this object and the save file; guests only send actions.

import { ACHIEVEMENTS, type Achievement } from './achievements';
import { CHARMS, DEFAULT_OUTFITTING, WARDROBE, type CharmId, type Outfitting } from './items';

export const SAVE_VERSION = 8;
const MAX_CHIPS = Number.MAX_SAFE_INTEGER; // chips are whole numbers, never floats

export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
export type TrophyKind = 'cup' | 'crystal' | 'jackpot' | 'crown' | 'mb1' | 'mb2' | 'mb3' | 'mb4';

export interface Trophy {
  id: string;
  kind: TrophyKind;
  medal: Medal;
  title: string;
  evening: number;
  earnedAt: number;
  /** Moon level of the season it was won in (moon-tinted variant), 0 or missing for normal. */
  heat?: number;
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
  // ---- v6: making every day different -----------------------------------
  /** Today's event id (src/core/events.ts), '' for a plain day. Rolled at day start. */
  event: string;
  /** Open and finished guest tasks of today (src/core/quests.ts). */
  quests: Quest[];
  /** Stamp card per floor room id: stamps collected, and which rewards are unlocked (kept forever). */
  stamps: Record<string, number>;
  stampRewards: string[];
  /** Perks drafted after each day this season (src/core/perks.ts). Gone when the season ends. */
  perks: string[];
  /** A pending 1-of-3 perk choice, or null. */
  draft: string[] | null;
  /** Moon level of this season: 0 = normal, higher = harder goals, rarer trophies. */
  heat: number;
  /** Highest moon level unlocked (one more per won season). */
  heatUnlocked: number;
  /** Balance after each round today, for the curve in the day recap (capped). */
  history: number[];
  /** What the house keeps on average from today's stakes (sum of stake × house edge). */
  houseExpected: number;
  /** Boss phase today (0 off, 1..3). */
  bossPhase: number;
  settings: { haptics: boolean };
  // ---- v7: modifier items (src/core/modifiers.ts) -------------------------
  /** Items in the bag, by id: how many of each. Bought with Mondsteine; kept across days and seasons. */
  bag: Record<string, number>;
  /** Items working right now (used from the bag). Day items end with the day. */
  active: ActiveItem[];
  // ---- v8: mini bosses, moth album, regulars, daily challenge --------------
  /** Mini bosses beaten, as `s<season>:<id>` (this season) plus plain ids ever beaten. */
  minibosses: string[];
  /** Moth album: moth id -> how many caught (kept forever). */
  album: Record<string, number>;
  /** Story beats and regulars' lines already seen (kept forever). */
  storySeen: string[];
  /** Daily challenge: '' in a normal run, else the date seed 'YYYY-MM-DD' this run belongs to. */
  dailySeed: string;
  /** Daily challenge results by date seed: best day reached and best balance (local only). */
  dailyBest: Record<string, { day: number; balance: number; at: number }>;
  /** Long-run curve for the "Wie das Haus gewinnt" page: sampled cumulative net result and expected result (capped, src/core/longRun.ts). */
  longRun: { net: number[]; exp: number[] };
}

/** A used item that is still working. */
export interface ActiveItem {
  id: string;
  /** Rounds left, or -1 while it lasts the whole day. */
  left: number;
  /** Game it was used in, for items bound to one game; '' for any game. */
  game: string;
}

/** A small task a guest gives you for today. Progress is counted from round reports. */
export interface Quest {
  id: string;
  /** Guest name shown with the task. */
  giver: string;
  text: string;
  /** Which RoundReport tag counts, and how many are needed. */
  tag: string;
  need: number;
  have: number;
  reward: { moonstones?: number; stamps?: number };
  done: boolean;
  /** The player has talked to the guest; only accepted tasks count rounds. */
  accepted?: boolean;
}

/** Sent by every game once per finished round. */
export interface RoundReport {
  game: 'slots' | 'roulette' | 'plinko' | 'crash' | string;
  stake: number;
  win: number;
  /** The game's long-run payout share (0.95 = 5 % house edge). */
  rtp: number;
  /** Things that happened, for quests and quips: 'red', 'black', 'zero', 'lines3', 'moth', 'edge', 'cashout2', 'crash' (every Mondflug round), 'cashout' (collected in time), 'bust' (a lost Mondflug round), 'win10', 'win50' … */
  tags: string[];
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
  /** Balance after each round of the day (first = day start), for the recap curve. */
  history: number[];
  /** What the house keeps on average from the day's stakes. */
  houseExpected: number;
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

/** Rounds to two significant digits (3.456 → 3.500), so goals and stakes read cleanly. */
export function roundNice(n: number) {
  if (n <= 0) return 0;
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.round(n / step) * step;
}

/** Share of the day's starting money that has to be won. It rises every day; the boss day asks for more. */
export function quotaRate(day: number) {
  const r = 0.25 + 0.02 * (Math.min(day, BOSS_DAY) - 1);
  return day >= BOSS_DAY ? r * 1.5 : r;
}

/**
 * Profit goal for a day, fixed when the day starts. It grows with the money the day
 * starts with, so goals, stakes and wins all grow together (day 1 with 1.000 → +250).
 */
export function quotaFor(day: number, startBalance = START_BALANCE, charms: readonly string[] = []) {
  let q = startBalance * quotaRate(day);
  if (charms.includes('rabatt')) q *= 0.9;
  if (day >= BOSS_DAY && charms.includes('bossbann')) q *= 0.8;
  return Math.max(50, roundNice(q));
}

/**
 * Stake unit for a day: 1 % of the money the day started with, at least 10.
 * Every bet ladder in the games is a multiple of it (day 1 with 1.000 → 10, 20, 50 …;
 * a day that starts with 3.000 → 30, 60, 150 …).
 */
export function stakeUnitFor(startBalance: number) {
  const raw = startBalance / 100;
  if (raw <= 10) return 10;
  // Largest "round" value not above 1 %: 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, …
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [8, 6, 5, 4, 3, 2.5, 2, 1.5, 1.2, 1].find((f) => f * mag <= raw + 1e-9) ?? 1;
  return Math.round(step * mag);
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
    event: '',
    quests: [],
    stamps: {},
    stampRewards: [],
    perks: [],
    draft: null,
    heat: 0,
    heatUnlocked: 0,
    history: [START_BALANCE],
    houseExpected: 0,
    bossPhase: 0,
    settings: { haptics: true },
    bag: {},
    active: [],
    minibosses: [],
    album: {},
    storySeen: [],
    dailySeed: '',
    dailyBest: {},
    longRun: { net: [0], exp: [0] },
  };
}

const clampChips = (n: number) => Math.max(0, Math.min(MAX_CHIPS, Math.floor(n)));

/** Medal for a day's profit against its goal. Whole-number comparisons, so exactly the goal counts. */
export function medalFor(profit: number, quota: number): Medal {
  if (profit >= 3 * quota) return 'diamond';
  if (profit >= 2 * quota) return 'gold';
  if (2 * profit >= 3 * quota) return 'silver';
  if (profit >= quota) return 'bronze';
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
  private roundListeners = new Set<(r: RoundReport) => void>();
  private dayStartHooks: ((data: SaveData) => void)[] = [];
  /** Extra factors on today's goal (events, perks, moon level, boss). Multiplied together. */
  quotaFactors: ((data: SaveData) => number)[] = [];
  /** Extra factors on the stake unit (events, boss phase). Multiplied together. */
  stakeFactors: ((data: SaveData) => number)[] = [];
  /** Extra Mondsteine at the end of a day (perks, moon level), from the medal's base amount. */
  moonstoneBonus: ((data: SaveData, medal: Medal, base: number, seasonWon: boolean) => number)[] = [];
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
    // Goal charms (Rabattmarke, Königinnen-Bann on the boss day) count from the moment they are bought.
    this.lowerQuota();
    this.count('charms');
    return true;
  }

  /**
   * Re-applies goal reductions gained mid-day (a charm bought, a perk drafted). Today's goal is
   * recomputed from the day's start money with everything owned now, but mid-day it only ever
   * goes DOWN: nothing gained after the day was fixed may raise the goal. Returns true if it fell.
   */
  lowerQuota() {
    const q = this.quotaToday(this.data.evening.number);
    if (q >= this.data.evening.quota) return false;
    this.data.evening.quota = q;
    this.emit();
    return true;
  }

  /** Goal for a day that starts with this much money, with this season's charms and all goal factors applied. */
  quotaToday(day: number, startBalance = this.data.evening.startBalance) {
    const base = quotaFor(day, startBalance, this.data.charms);
    const k = this.quotaFactors.reduce((m, f) => m * f(this.data), 1);
    return k === 1 ? base : Math.max(50, roundNice(base * k));
  }

  /** Stake unit of today (see stakeUnitFor), times any stake factors (events, boss phase). */
  get stakeUnit() {
    const k = this.stakeFactors.reduce((m, f) => m * f(this.data), 1);
    const u = stakeUnitFor(this.data.evening.startBalance);
    return k === 1 ? u : stakeUnitFor(this.data.evening.startBalance * k);
  }

  /** Games call this once per finished round. Feeds quests, quips, stamps, the recap curve. */
  report(r: RoundReport) {
    this.data.history.push(this.data.balance);
    if (this.data.history.length > 400) this.data.history.splice(1, this.data.history.length - 400);
    this.data.houseExpected += r.stake * Math.max(0, 1 - r.rtp);
    if (r.stake > 0 && r.win >= r.stake * 10 && !r.tags.includes('win10')) r.tags.push('win10');
    if (r.stake > 0 && r.win >= r.stake * 50 && !r.tags.includes('win50')) r.tags.push('win50');
    for (const l of this.roundListeners) l(r);
    this.emit();
  }

  onRound(fn: (r: RoundReport) => void) {
    this.roundListeners.add(fn);
    return () => this.roundListeners.delete(fn);
  }

  /** Runs at the start of every day (after the money is set, before the goal is fixed). */
  onDayStart(fn: (data: SaveData) => void) {
    this.dayStartHooks.push(fn);
  }

  /** Called whenever a new day begins (next day, new season, debug jump): resets the day's bits, runs hooks, fixes the goal. */
  beginDay() {
    const d = this.data;
    d.history = [d.balance];
    d.houseExpected = 0;
    d.bossPhase = 0;
    d.event = '';
    d.quests = [];
    for (const h of this.dayStartHooks) h(d);
    d.evening.quota = this.quotaToday(d.evening.number, d.evening.startBalance);
    this.eveningWagered = 0;
    this.eveningWon = 0;
    this.emit();
  }

  /** A bet ladder written for day 1 (unit 10), scaled to today's stakes. */
  stakes(base: readonly number[]) {
    const k = this.stakeUnit / 10;
    return base.map((b) => Math.round(b * k));
  }

  /** Balance at which today's goal is reached: start money plus the goal. */
  get goalBalance() {
    return this.data.evening.startBalance + this.data.evening.quota;
  }

  /** True as soon as the balance holds the full goal (whole numbers, no rounding). */
  get goalReached() {
    return this.data.balance >= this.goalBalance;
  }

  /** Falter still missing for today's goal. */
  get goalMissing() {
    return Math.max(0, this.goalBalance - this.data.balance);
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
      ...(this.data.heat > 0 ? { heat: this.data.heat } : {}),
    };
    this.data.trophies.push(t);
    this.emit();
    return t;
  }

  endEvening(): EveningResult {
    const ev = this.data.evening;
    const profit = this.data.balance - ev.startBalance;
    const ratio = profit / ev.quota;
    const medal = medalFor(profit, ev.quota);
    const passed = profit >= ev.quota;
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
    const baseStones = MOONSTONES_FOR[medal] + (seasonWon ? MOONSTONES_BOSS : 0);
    const stones = baseStones + this.moonstoneBonus.reduce((s, f) => s + Math.max(0, Math.floor(f(this.data, medal, baseStones, seasonWon))), 0);
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
      history: this.data.history.slice(),
      houseExpected: this.data.houseExpected,
    };
    if (goesOn) {
      const n = ev.number + 1;
      // Charms pay out at the start of the new day; that money doesn't count towards its goal.
      // Both grow with the stakes, like everything else.
      const unit = stakeUnitFor(this.data.balance);
      let bonus = 0;
      if (this.hasCharm('startgeld')) bonus += 15 * unit;
      if (this.hasCharm('zinsen')) bonus += Math.min(30 * unit, Math.floor(this.data.balance * 0.05));
      this.data.balance += bonus;
      result.bonus = bonus;
      this.data.evening = { number: n, startBalance: this.data.balance, quota: 0 };
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
      this.data.perks = [];
      this.data.draft = null;
      if (seasonWon) this.data.heatUnlocked = Math.max(this.data.heatUnlocked, this.data.heat + 1);
    }
    this.beginDay();
    return result;
  }
}

export function formatChips(n: number) {
  return Math.floor(n).toLocaleString('de-DE');
}
