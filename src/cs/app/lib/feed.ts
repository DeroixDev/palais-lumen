// The live drop feed under the header: your drops plus simulated players.

import type { ItemInstance } from '../../contract';
import { CASES, skinById } from './assets';
import { casePrice, itemValue, rarityIndex, rollCase } from './economy';
import { botPlayer, BOT_NAMES } from './bots';
import { save } from './state';
import { botLevel, level } from './career';
import * as M from './mods';

export interface FeedEntry { item: ItemInstance; value: number; who: string; avatar: number; lvl: number; you: boolean; caseId?: string; via: string; ts: number }

type L = (e: FeedEntry) => void;
const listeners = new Set<L>();
export const feed: FeedEntry[] = [];
export function onFeed(fn: L) { listeners.add(fn); return () => listeners.delete(fn); }

export function pushFeed(e: FeedEntry) {
  feed.unshift(e);
  if (feed.length > 40) feed.pop();
  listeners.forEach((fn) => fn(e));
}

export function pushMine(item: ItemInstance, via: string, caseId?: string) {
  pushFeed({ item, value: itemValue(item), who: save.name, avatar: save.avatar, lvl: level(), you: true, caseId, via, ts: Date.now() });
}

/** One simulated drop: bots favour cheaper cases, and the feed mostly shows the exciting ones. */
function botDrop(): FeedEntry {
  const cases = CASES.slice().sort((a, b) => casePrice(a) - casePrice(b));
  const c = cases[Math.floor(Math.pow(Math.random(), 1.6) * cases.length)];
  let item = rollCase(c);
  // Re-roll most blues so the strip stays colourful (a feed only lists the notable drops).
  for (let i = 0; i < 3 && rarityIndex(skinById(item.skin)!.rarity) <= rarityIndex('milspec') && Math.random() < 0.75; i++) item = rollCase(c, 1.6);
  const p = botPlayer(Math.floor(Math.random() * BOT_NAMES.length));
  return { item, value: itemValue(item), who: p.name, avatar: p.avatar, lvl: botLevel(p.name), you: false, caseId: c.id, via: c.name, ts: Date.now() };
}

let timer = 0;
export function startFeed() {
  for (let i = 0; i < 18; i++) { const e = botDrop(); e.ts -= (18 - i) * 9000; feed.unshift(e); }
  const next = () => {
    if (document.visibilityState === 'visible' && !M.on('feed.pause')) pushFeed(botDrop());
    timer = window.setTimeout(next, (1800 + Math.random() * 3800) / Math.max(0.05, M.num('feed.speed')));
  };
  timer = window.setTimeout(next, 2000);
}
export const stopFeed = () => clearTimeout(timer);
