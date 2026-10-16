// The state of an evening (plain JSON: saved, sent to friends) and the events and questions the
// engine sends to the presenters (this browser's board view, and every friend's).

import type { Rules, Seat } from '../types';
import { BONUS_IDS, START_COINS, newStats, type BonusId, type BuddyId, type FinaleRule, type ItemId, type PStats } from './tables';

export interface PState {
  coins: number;
  stars: number;
  node: number;
  items: ItemId[];
  /** Colour of the last landing field: decides the teams of the next minigame. */
  side: 'plus' | 'minus';
  bande: { with: number; until: number } | null;
  rival: { target: number; until: number } | null;
  stats: PStats;
}

export interface Buddy { kind: BuddyId; at: number | null; owner: number | null; left: number }

export interface GameState {
  v: 1;
  seats: Seat[];
  rules: Rules;
  round: number;
  /** Whose turn (index into players). */
  turn: number;
  phase: 'play' | 'end';
  players: PState[];
  star: number;
  bs: Record<string, unknown>;
  buddy: Buddy | null;
  /** Shop displays: shop space id → items on offer. */
  shops: Record<number, ItemId[]>;
  traps: Record<number, number>;
  finale: boolean;
  finaleRule: FinaleRule | null;
  bonus: BonusId[];
  mgHistory: string[];
  /** Turn number since the start (for saves). */
  turns: number;
}

export function newPlayer(node: number): PState {
  return { coins: START_COINS, stars: 0, node, items: [], side: 'plus', bande: null, rival: null, stats: newStats() };
}

export function pickBonus(rng: () => number): BonusId[] {
  const ids = [...BONUS_IDS];
  const out: BonusId[] = [];
  while (out.length < 3) out.push(ids.splice(Math.floor(rng() * ids.length), 1)[0]);
  return out;
}

/** Ranking: stars, then coins, then minigame wins (Profi: no luck in ties). */
export function ranking(st: GameState): number[] {
  return st.players.map((_, i) => i).sort((a, b) => {
    const A = st.players[a], B = st.players[b];
    return B.stars - A.stars || B.coins - A.coins || B.stats.mgWins - A.stats.mgWins || a - b;
  });
}

// ---------------- events (engine → presenter) ----------------
export type GameEvent =
  | { k: 'sync' }
  | { k: 'banner'; text: string; color?: string }
  | { k: 'toast'; text: string; color?: string }
  | { k: 'round'; round: number }
  | { k: 'turn'; p: number }
  | { k: 'item'; p: number; item: ItemId }
  | { k: 'roll'; p: number; dice: number[]; dieKind: 'w6' | 'half' | 'joker'; bonus: number }
  | { k: 'hop'; p: number; from: number; to: number; left: number }
  | { k: 'blocked'; p: number; text: string }
  | { k: 'coins'; p: number; d: number; text?: string }
  | { k: 'starBuy'; p: number }
  | { k: 'starMove'; to: number }
  | { k: 'starMiss'; p: number; price: number }
  | { k: 'land'; p: number; type: string }
  | { k: 'buddy'; what: 'appear' | 'join' | 'leave' | 'lure'; p?: number; from?: number; node?: number; kind: BuddyId }
  | { k: 'swap'; a: number; b: number }
  | { k: 'wheel'; p: number; options: string[]; pick: number }
  | { k: 'path'; p: number; node: number; to: number }
  | { k: 'shop'; p: number; item: ItemId | null; price: number }
  | { k: 'trap'; node: number; owner: number | null }
  | { k: 'look'; node: number }
  | { k: 'gimmick'; name: string; data?: Record<string, unknown> }
  | { k: 'mgAnnounce'; text: string }
  | { k: 'bonus'; list: { id: BonusId; winners: number[] }[] }
  | { k: 'end'; order: number[] };

// ---------------- questions (engine → a seat) ----------------
export interface PathOption { to: number; name: string; len: number; blocked: string | null; key: boolean }
export interface ShopOffer { item: ItemId; price: number; ok: boolean }
export type Stake = { coins: number } | { star: true };

export type Ask =
  | { q: 'roll'; items: ItemId[] }
  | { q: 'joker' }
  | { q: 'target'; title: string; text: string; options: number[] }
  | { q: 'path'; node: number; options: PathOption[] }
  | { q: 'buyStar'; price: number }
  | { q: 'shop'; offer: ShopOffer[]; passing: boolean }
  | { q: 'duel'; opponents: number[]; stakes: Stake[] }
  | { q: 'bandeOffer'; from: number }
  | { q: 'finale'; options: FinaleRule[] }
  | { q: 'yesno'; title: string; text: string; yes: string; no: string };

export type Answer =
  | { use: ItemId | null }
  | { n: number }
  | { p: number }
  | { to: number }
  | { yes: boolean }
  | { item: ItemId | null }
  | { p: number; stake: number }
  | { rule: FinaleRule };

// ---------------- minigames (engine → minigame flow) ----------------
export interface MgRequest {
  /** Why: the round-end minigame, a duel from a duel field, or luring the Kumpel. */
  kind: 'round' | 'duel' | 'buddy';
  id: string;
  /** Seats taking part, in order; team number per seat (solo = team 0 in 1v3). */
  seats: number[];
  teams: number[];
  seed: number;
}
export interface MgOutcome {
  /** Coins won per seat in `seats` order, and whether that seat won. */
  coins: number[];
  win: boolean[];
}
