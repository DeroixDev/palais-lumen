// Modifier items, modelled on the item shop of "Gamble With Your Friends": bought with
// Mondsteine in the foyer, carried in the bag, used before or after a round. Some only touch
// the money around a round (insurance, a drink that pays more), some change a game's real
// odds (x-ray glasses, a loaded ball). Whatever is active, the game shows the payout share
// that is true right now, items included (see effectiveRtp).
//
// Contract for the item workers:
// - ITEMS lists every item. `games` limits an item to some games; `odds` marks items that
//   change a game's real chances (their effect lives in that game's code and its rtp script).
// - Games ask `isActive(state, id, game)` before a round. Rounds are used up by the core from
//   every finished round report (state.report), so games never count them down themselves.
// - Game-bound odds items register their exact RTP with `setItemRtp(game, id, rtp)` so the
//   game and the HUD can show it.

import type { ActiveItem, GameState, SaveData } from './state';

export type ItemTier = 'klein' | 'mittel' | 'gross' | 'legendaer';

export interface ItemDef {
  id: string;
  name: string;
  /** Exactly what it does; shown in the shop and the bag. German. */
  desc: string;
  /** Mondsteine. */
  price: number;
  tier: ItemTier;
  /** How long it works once used: rounds, the whole day, or once (instant/reaction). */
  duration: { rounds: number } | 'day' | 'once';
  /** Only usable in these games (ids); omitted = any game. */
  games?: string[];
  /** Changes a game's real chances (not only the money around the round). */
  odds?: boolean;
}

const registry = new Map<string, ItemDef>();

export function registerItem(def: ItemDef) {
  registry.set(def.id, def);
}

export function allItems() {
  return [...registry.values()];
}

export function itemDef(id: string) {
  return registry.get(id);
}

export function bagCount(d: SaveData, id: string) {
  return d.bag[id] ?? 0;
}

/** Is item `id` working right now (in `game`, if it is bound to games)? */
export function isActive(state: GameState, id: string, game?: string) {
  return state.data.active.some((a) => a.id === id && (!a.game || !game || a.game === game));
}

export function activeItems(d: SaveData): ActiveItem[] {
  return d.active;
}

/** Exact payout share of a game with an odds item on, registered by the game or its item file. */
const itemRtp = new Map<string, number>();

export function setItemRtp(game: string, id: string, rtp: number) {
  itemRtp.set(`${game}:${id}`, rtp);
}

export function getItemRtp(game: string, id: string) {
  return itemRtp.get(`${game}:${id}`);
}
