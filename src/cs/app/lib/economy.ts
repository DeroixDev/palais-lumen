// Odds, item values, case prices. Everything that decides money lives here.
//
// Tier odds follow the familiar case ladder (79.92 / 15.98 / 3.2 / 0.64 / 0.26 %). Cases with a
// different tier set keep the 5:1 step between neighbouring tiers. Item value = basePrice x wear
// factor x StatTrak x a small paint-seed bonus. The catalog's case prices are only a starting
// point: the platform prices each case from its expected return so it pays back 85–92 %.

import { RARITIES, type CaseDef, type ItemInstance, type Rarity, type SkinDef } from '../../contract';
import { CASES, skinById } from './assets';
import { hash01, uid } from './util';

export const TIER_ORDER: Rarity[] = RARITIES;
export const rarityIndex = (r: Rarity) => TIER_ORDER.indexOf(r);
export const nextRarity = (r: Rarity): Rarity | null => (r === 'covert' || r === 'gold' ? null : TIER_ORDER[rarityIndex(r) + 1]);

/** Gold share of a standard case with gold (percent), the familiar 0.26. */
const GOLD_SHARE = 0.26;
/** The familiar odds of the three top tiers below gold, highest first. */
const TOP = [0.64, 3.2, 15.98];
const BOTTOM = 79.92;

export interface TierOdds { rarity: Rarity; p: number }

/**
 * Base probabilities per tier of a case (sum 1). Anchored from the top: the best non-gold tier gets
 * 0.64 %, the next 3.2 %, the next 15.98 %, and every lower tier shares the remaining 79.92 % on a
 * 5:1 ladder (lowest most common). Gold cases get a bigger ★ share, solved so the case lands near
 * the catalog's intended price (see goldShareOf).
 */
export function tierOdds(c: CaseDef, luck = 1): TierOdds[] {
  const tiers = TIER_ORDER.filter((r) => (c.contents[r]?.length ?? 0) > 0);
  const normal = tiers.filter((r) => r !== 'gold');
  const hasGold = tiers.includes('gold');
  const out: TierOdds[] = [];
  if (!normal.length) return hasGold ? [{ rarity: 'gold', p: 1 }] : [];
  const w = new Map<Rarity, number>();
  const desc = [...normal].reverse();
  desc.slice(0, 3).forEach((r, i) => w.set(r, TOP[i]));
  const rest = desc.slice(3);
  if (rest.length) {
    const raw = rest.map((_, i) => Math.pow(5, -(rest.length - 1 - i)));
    const sum = raw.reduce((a, b) => a + b, 0);
    rest.forEach((r, i) => w.set(r, (raw[i] / sum) * BOTTOM));
  }
  const sum = [...w.values()].reduce((a, b) => a + b, 0);
  const goldShare = hasGold ? goldShareOf(c) : 0;
  normal.forEach((r) => out.push({ rarity: r, p: (w.get(r)! / sum) * (1 - goldShare) }));
  if (hasGold) out.push({ rarity: 'gold', p: goldShare });
  if (luck !== 1) {
    for (const o of out) if (o.rarity === 'gold' || o.rarity === 'covert') o.p *= luck;
    const s = out.reduce((a, b) => a + b.p, 0);
    for (const o of out) o.p /= s;
  }
  return out;
}

const goldCache = new Map<string, number>();
/** ★ share of a case: 0.26 % normally; gold cases get what puts them near their catalog price. */
export function goldShareOf(c: CaseDef): number {
  if (c.category !== 'gold') return GOLD_SHARE / 100;
  let g = goldCache.get(c.id);
  if (g !== undefined) return g;
  const mean = (ids: string[] | undefined) => {
    const ss = (ids ?? []).map((id) => skinById(id)).filter(Boolean) as SkinDef[];
    return ss.length ? ss.reduce((a, s) => a + skinEV(s), 0) / ss.length : 0;
  };
  // EV without gold, with the top-anchored ladder.
  const tiers = TIER_ORDER.filter((r) => r !== 'gold' && (c.contents[r]?.length ?? 0) > 0).reverse();
  const ws = tiers.map((_, i) => (i < 3 ? TOP[i] : BOTTOM / 2));
  const wsum = ws.reduce((a, b) => a + b, 0);
  const evNormal = tiers.reduce((a, r, i) => a + (ws[i] / wsum) * mean(c.contents[r]), 0);
  const evGold = mean(c.contents.gold);
  const want = c.price * TARGET[c.category];
  g = evGold > evNormal ? (want - evNormal) / (evGold - evNormal) : 0.05;
  g = Math.max(0.01, Math.min(0.25, g));
  goldCache.set(c.id, g);
  return g;
}

// ---------- values ----------

const WEAR_EDGES = [0, 0.07, 0.15, 0.38, 0.45, 1];
const WEAR_MULT = [1.55, 1.22, 1.0, 0.85, 0.72];
function rawWear(f: number): number {
  let i = 0;
  while (i < 4 && f >= WEAR_EDGES[i + 1]) i++;
  const pos = (f - WEAR_EDGES[i]) / (WEAR_EDGES[i + 1] - WEAR_EDGES[i]);
  return WEAR_MULT[i] * (1 + 0.08 * (1 - pos));
}
const WEAR_NORM = rawWear(0.2);
/** Value factor of a float, 1 at 0.20. */
export const wearFactor = (f: number) => rawWear(f) / WEAR_NORM;

const ST_MULT: Record<Rarity, number> = { consumer: 1.6, industrial: 1.6, milspec: 1.6, restricted: 1.7, classified: 1.8, covert: 2, gold: 1 };
export const statTrakMult = (r: Rarity) => ST_MULT[r];

const RARE_SEEDS = new Set([1, 69, 151, 321, 387, 555, 661, 777, 888, 999]);
export const isRareSeed = (seed: number) => RARE_SEEDS.has(seed);
export const seedBonus = (seed: number) => (RARE_SEEDS.has(seed) ? 1.25 : 1 + ((seed * 37) % 101) / 101 * 0.03);
let SEED_MEAN = 0;
for (let s = 0; s < 1000; s++) SEED_MEAN += seedBonus(s) / 1000;

export function valueOf(skin: SkinDef, float: number, seed: number, statTrak: boolean): number {
  const v = skin.basePrice * wearFactor(float) * (statTrak ? ST_MULT[skin.rarity] : 1) * seedBonus(seed);
  return Math.max(0.01, Math.round(v * 100) / 100);
}
export function itemValue(it: Pick<ItemInstance, 'skin' | 'float' | 'seed' | 'statTrak'>): number {
  const s = skinById(it.skin);
  return s ? valueOf(s, it.float, it.seed, it.statTrak) : 0;
}

const evCache = new Map<string, number>();
/** Expected value of one drop of this skin (uniform float, 10 % StatTrak). */
export function skinEV(s: SkinDef): number {
  let v = evCache.get(s.id);
  if (v !== undefined) return v;
  const N = 48;
  let w = 0;
  for (let i = 0; i < N; i++) w += wearFactor(s.floatMin + ((i + 0.5) / N) * (s.floatMax - s.floatMin));
  w /= N;
  const st = s.rarity === 'gold' ? 1 : 0.9 + 0.1 * ST_MULT[s.rarity];
  v = s.basePrice * w * st * SEED_MEAN;
  evCache.set(s.id, v);
  return v;
}
/** Lowest and highest possible value of a skin (for the contents grid). */
export function skinRange(s: SkinDef): [number, number] {
  const lo = s.basePrice * wearFactor(s.floatMax - 1e-6) * seedBonus(0);
  const hi = s.basePrice * wearFactor(s.floatMin) * (s.rarity === 'gold' ? 1 : ST_MULT[s.rarity]) * 1.25;
  return [lo, hi];
}

export function caseEV(c: CaseDef): number {
  let ev = 0;
  for (const t of tierOdds(c)) {
    const ids = c.contents[t.rarity] ?? [];
    const skins = ids.map((id) => skinById(id)).filter(Boolean) as SkinDef[];
    if (!skins.length) continue;
    ev += t.p * (skins.reduce((a, s) => a + skinEV(s), 0) / skins.length);
  }
  return ev;
}

const TARGET: Record<CaseDef['category'], number> = { starter: 0.915, standard: 0.895, premium: 0.88, gold: 0.86, event: 0.9 };
const priceCache = new Map<string, number>();
/** Price the platform charges: EV / target return, rounded to a "shop" price. */
export function casePrice(c: CaseDef): number {
  let p = priceCache.get(c.id);
  if (p !== undefined) return p;
  const target = (TARGET[c.category] ?? 0.89) + (hash01(c.id) - 0.5) * 0.02;
  const ev = caseEV(c);
  p = ev > 0 ? ev / target : c.price;
  // Shop rounding: two decimals below 10, .49/.99 steps above.
  p = p < 10 ? Math.ceil(p * 100) / 100 : Math.ceil(p * 2) / 2 - 0.01;
  priceCache.set(c.id, p);
  return p;
}
export const caseRTP = (c: CaseDef) => caseEV(c) / casePrice(c);
/** Multiplier applied to art's catalog price (for the report). */
export const casePriceMult = (c: CaseDef) => casePrice(c) / (c.price || 1);

// ---------- rolls ----------

function pickTier(odds: TierOdds[]): Rarity {
  let x = Math.random();
  for (const o of odds) { x -= o.p; if (x <= 0) return o.rarity; }
  return odds[odds.length - 1].rarity;
}

export function makeItem(skin: SkinDef, source?: string, float?: number): ItemInstance {
  const f = float ?? skin.floatMin + Math.random() * (skin.floatMax - skin.floatMin);
  return {
    uid: uid(),
    skin: skin.id,
    float: Math.round(f * 1e9) / 1e9,
    seed: Math.floor(Math.random() * 1000),
    statTrak: skin.rarity !== 'gold' && Math.random() < 0.1,
    source,
  };
}

/** One real drop from a case. */
export function rollCase(c: CaseDef, luck = 1, source = c.name): ItemInstance {
  const r = pickTier(tierOdds(c, luck));
  const ids = c.contents[r]!;
  const skin = skinById(ids[Math.floor(Math.random() * ids.length)])!;
  return makeItem(skin, source);
}

/** A tile for the reel around the real drop: shows a bit more colour than the true odds. */
export function rollFiller(c: CaseDef): ItemInstance {
  const odds = tierOdds(c).map((o) => ({ rarity: o.rarity, p: Math.pow(o.p, 0.72) }));
  const s = odds.reduce((a, b) => a + b.p, 0);
  odds.forEach((o) => (o.p /= s));
  const r = pickTier(odds);
  const ids = c.contents[r]!;
  return makeItem(skinById(ids[Math.floor(Math.random() * ids.length)])!);
}

/** Every case a skin can drop from. */
export function casesWithSkin(skinId: string): CaseDef[] {
  return CASES.filter((c) => Object.values(c.contents).some((ids) => ids?.includes(skinId)));
}
