// Everything the foyer shop sells for Mondsteine (moonstones), and the free basics of the
// wardrobe. Mondsteine are earned by playing (day medals, achievements, the boss) and can
// never be bought. Charms change only the economy around the games, never the odds.

import type { Accessory, HairStyle, Hat, Outfit } from '../world/player';

import { CHARM_BOSS, CURRENCY_PLURAL } from './brand';
export type Companion = 'none' | 'lantern' | 'moon' | 'gold';
export type CharmId = 'startgeld' | 'zinsen' | 'rabatt' | 'zweiteChance' | 'bossbann';

/** The full look of the player, saved in the profile. */
export interface Outfitting {
  outfit: Outfit;
  jacket: number;
  hairStyle: HairStyle;
  hair: number;
  hat: Hat;
  hatColor: number;
  accessory: Accessory;
  companion: Companion;
}

export const DEFAULT_OUTFITTING: Outfitting = {
  outfit: 'suit',
  jacket: 0x2a1630,
  hairStyle: 'short',
  hair: 0x2a1a10,
  hat: 'none',
  hatColor: 0x1b1b22,
  accessory: 'bowTie',
  companion: 'none',
};

export type WardrobeSlot = 'outfit' | 'jacket' | 'hairStyle' | 'hair' | 'hat' | 'accessory' | 'companion';

export interface WardrobeOption {
  /** Unique id; options with a price have a shop item of the same id. */
  id: string;
  slot: WardrobeSlot;
  name: string;
  /** What choosing it sets in the outfitting. */
  set: Partial<Outfitting>;
  /** Mondsteine; 0 means free from the start. */
  price: number;
  /** Swatch colour for the menus. */
  swatch?: number;
}

const c = (id: string, name: string, color: number, price = 0): WardrobeOption => ({ id: `jacket-${id}`, slot: 'jacket', name, set: { jacket: color }, price, swatch: color });
const h = (id: string, name: string, color: number, price = 0): WardrobeOption => ({ id: `hair-${id}`, slot: 'hair', name, set: { hair: color }, price, swatch: color });

export const WARDROBE: WardrobeOption[] = [
  { id: 'outfit-suit', slot: 'outfit', name: 'Anzug', set: { outfit: 'suit', accessory: 'bowTie' }, price: 0 },
  { id: 'outfit-dress', slot: 'outfit', name: 'Abendkleid', set: { outfit: 'dress', accessory: 'necklace' }, price: 0 },

  c('plum', 'Pflaume', 0x2a1630),
  c('navy', 'Nachtblau', 0x1d2a4a),
  c('black', 'Schwarz', 0x1b1b22),
  c('wine', 'Weinrot', 0x6b1a2e),
  c('emerald', 'Smaragd', 0x1f5a44, 3),
  c('sapphire', 'Saphir', 0x2f4aa0, 3),
  c('violet', 'Violett', 0x5a2a7a, 3),
  c('coral', 'Koralle', 0xc0504a, 4),
  c('ivory', 'Elfenbein', 0xe8e0d0, 5),
  c('gold', 'Gold', 0xc9962e, 8),

  { id: 'hairStyle-short', slot: 'hairStyle', name: 'Kurz', set: { hairStyle: 'short' }, price: 0 },
  { id: 'hairStyle-sidePart', slot: 'hairStyle', name: 'Seitenscheitel', set: { hairStyle: 'sidePart' }, price: 0 },
  { id: 'hairStyle-long', slot: 'hairStyle', name: 'Lang', set: { hairStyle: 'long' }, price: 0 },
  { id: 'hairStyle-bun', slot: 'hairStyle', name: 'Dutt', set: { hairStyle: 'bun' }, price: 0 },
  { id: 'hairStyle-bald', slot: 'hairStyle', name: 'Glatze', set: { hairStyle: 'bald' }, price: 0 },
  { id: 'hairStyle-curly', slot: 'hairStyle', name: 'Locken', set: { hairStyle: 'curly' }, price: 2 },

  h('dark', 'Dunkelbraun', 0x2a1a10),
  h('brown', 'Braun', 0x6b3a1e),
  h('blond', 'Blond', 0xd9b26a),
  h('black', 'Schwarz', 0x1b1b22),
  h('silver', 'Silber', 0xcfd6e0, 2),
  h('red', 'Kupferrot', 0xb3402a, 2),
  h('rose', 'Rosé', 0xe08aa8, 3),
  h('blue', 'Mitternachtsblau', 0x4a6fd0, 3),

  { id: 'hat-none', slot: 'hat', name: 'Ohne Hut', set: { hat: 'none' }, price: 0 },
  { id: 'hat-fedora', slot: 'hat', name: 'Fedora', set: { hat: 'fedora', hatColor: 0x1b1b22 }, price: 4 },
  { id: 'hat-fedoraCream', slot: 'hat', name: 'Heller Fedora', set: { hat: 'fedora', hatColor: 0xd8c8a8 }, price: 5 },
  { id: 'hat-topHat', slot: 'hat', name: 'Zylinder', set: { hat: 'topHat', hatColor: 0x1b1b22 }, price: 6 },
  { id: 'hat-topHatGold', slot: 'hat', name: 'Goldener Zylinder', set: { hat: 'topHat', hatColor: 0xc9962e }, price: 12 },

  { id: 'acc-bowTie', slot: 'accessory', name: 'Fliege', set: { accessory: 'bowTie' }, price: 0 },
  { id: 'acc-tie', slot: 'accessory', name: 'Krawatte', set: { accessory: 'tie' }, price: 0 },
  { id: 'acc-necklace', slot: 'accessory', name: 'Kette', set: { accessory: 'necklace' }, price: 0 },
  { id: 'acc-none', slot: 'accessory', name: 'Nichts', set: { accessory: 'none' }, price: 0 },

  { id: 'pet-none', slot: 'companion', name: 'Kein Begleiter', set: { companion: 'none' }, price: 0 },
  { id: 'pet-lantern', slot: 'companion', name: 'Laternchen', set: { companion: 'lantern' }, price: 8 },
  { id: 'pet-moon', slot: 'companion', name: 'Mondglas', set: { companion: 'moon' }, price: 8 },
  { id: 'pet-gold', slot: 'companion', name: 'Goldfunke', set: { companion: 'gold' }, price: 15 },
];

/**
 * Mondsteine come in faster since won rounds and the surplus pay them too (v18 items, roughly
 * 20–60 on a good day), so the souvenirs and charms cost three times their old price.
 */
export const PRICE_SCALE = 3;
for (const o of WARDROBE) o.price *= PRICE_SCALE;

export const SLOT_LABEL: Record<WardrobeSlot, string> = {
  outfit: 'Kleidung',
  jacket: 'Farbe',
  hairStyle: 'Frisur',
  hair: 'Haarfarbe',
  hat: 'Hut',
  accessory: 'Accessoire',
  companion: 'Begleiter',
};

export interface Charm {
  id: CharmId;
  name: string;
  /** Exactly what it does; shown in the shop. */
  desc: string;
  price: number;
}

/** Charms last for the current season and are gone when it ends. */
export const CHARMS: Charm[] = [
  { id: 'startgeld', name: 'Startgeld', desc: `Zu Beginn jedes Tages +15 Mindesteinsätze (am ersten Tag 150 ${CURRENCY_PLURAL}).`, price: 6 },
  { id: 'zinsen', name: 'Sparschwein', desc: 'Zu Beginn jedes Tages +5 % von deinem Guthaben, höchstens 30 Mindesteinsätze.', price: 8 },
  { id: 'rabatt', name: 'Rabattmarke', desc: 'Die Tagesziele sind 10 % kleiner, schon ab heute.', price: 10 },
  { id: 'zweiteChance', name: 'Zweite Chance', desc: 'Einmal pro Saison: ein verfehlter Tag beendet die Saison nicht.', price: 12 },
  { id: 'bossbann', name: CHARM_BOSS, desc: 'Das Ziel am Boss-Tag ist 20 % kleiner.', price: 10 },
];

for (const ch of CHARMS) ch.price *= PRICE_SCALE;

export const COMPANION_COLOR: Record<Exclude<Companion, 'none'>, number> = {
  lantern: 0xffcf7a,
  moon: 0x9fe8ff,
  gold: 0xffd75a,
};

export function wardrobeOption(id: string) {
  return WARDROBE.find((o) => o.id === id);
}
