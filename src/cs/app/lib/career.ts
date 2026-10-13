// Career: levels from XP, titles, level rewards, the daily case, missions, achievements.

import type { CaseDef, Rarity, SkinDef } from '../../contract';
import { CASES, SKINS, caseById, skinById } from './assets';
import { casePrice, rarityIndex } from './economy';
import { addCoins, commit, invValue, onGame, save, type GameEvent } from './state';
import { sfx } from './sound';
import { toast } from '../ui/toast';
import { hash01 } from './util';
import * as M from './mods';

export const MAX_LEVEL = 50;
export const xpToNext = (lvl: number) => Math.round(100 + 40 * Math.pow(lvl, 1.5));

export function levelInfo(xp = save.xp) {
  let lvl = 1, left = xp;
  while (lvl < MAX_LEVEL && left >= xpToNext(lvl)) { left -= xpToNext(lvl); lvl++; }
  const need = lvl >= MAX_LEVEL ? 0 : xpToNext(lvl);
  return { level: lvl, into: left, need, frac: need ? left / need : 1 };
}
export const level = () => levelInfo().level;

export const TITLES = [
  { from: 1, name: 'Neuling', blurb: 'Alter Rechner, kleines Zimmer, große Träume.' },
  { from: 10, name: 'Sammler', blurb: 'Die erste Skin-Wand hängt. Verträge lohnen sich jetzt.' },
  { from: 20, name: 'Händler', blurb: 'Du kennst die Preise besser als der Markt.' },
  { from: 30, name: 'Streamer', blurb: 'Der Chat flippt aus, wenn du Gold ziehst.' },
  { from: 40, name: 'Veranstalter', blurb: 'Deine eigenen Battles, deine eigene Halle.' },
];
export function titleOf(lvl = level()) {
  let t = TITLES[0];
  for (const x of TITLES) if (lvl >= x.from) t = x;
  return t;
}
export const titleIndex = (lvl = level()) => TITLES.indexOf(titleOf(lvl));

// ---------- daily case (synthetic) ----------

export const DAILY_ID = 'tageskiste';
export const DAY_MS = 24 * 3600 * 1000;
const dailyCache = new Map<number, CaseDef>();
/** The free daily case; its contents get better with each career title. */
export function dailyCase(tier = titleIndex()): CaseDef {
  const hit = dailyCache.get(tier);
  if (hit) return hit;
  const contents: Partial<Record<Rarity, string[]>> = {};
  const tiers: Rarity[] = ['milspec', 'restricted', 'classified', 'covert', 'gold'];
  for (const r of tiers) {
    const list = SKINS.filter((s) => s.rarity === r).sort((a, b) => a.basePrice - b.basePrice);
    if (!list.length) continue;
    const n = Math.min(list.length, r === 'gold' ? 4 : 7);
    const start = Math.floor((list.length - n) * (tier / 4) * 0.8);
    contents[r] = list.slice(start, start + n).map((s) => s.id);
  }
  const c: CaseDef = {
    id: DAILY_ID,
    name: `Tageskiste ${['I', 'II', 'III', 'IV', 'V'][tier]}`,
    price: 0,
    contents,
    look: { a: '#ff8a1f', b: '#3a1a04', emblem: 'sun' },
    category: 'event',
    level: 0,
  };
  dailyCache.set(tier, c);
  return c;
}
export const dailyReadyIn = () => Math.max(0, save.daily.caseAt + DAY_MS - Date.now());

/** Any case by id, including the daily case. */
export function getCase(id: string): CaseDef | undefined {
  return id === DAILY_ID ? dailyCase() : caseById(id);
}
export const priceOf = (c: CaseDef) => (c.id === DAILY_ID ? 0 : casePrice(c));

// ---------- XP + level rewards ----------

export function addXP(n: number) {
  const before = level();
  save.xp += Math.round(n * M.num('eco.xp'));
  const after = level();
  for (let l = Math.max(before, save.rewardedLevel) + 1; l <= after; l++) levelReward(l);
  if (after > save.rewardedLevel) save.rewardedLevel = after;
}

/** XP for spending/playing `coins` worth. */
export const xpFor = (coins: number) => 10 + coins * 10;

/** The case a level-up hands out for free. */
export function levelCaseFor(lvl: number): CaseDef | undefined {
  const budget = 2 + lvl * 1.6;
  const open = CASES.filter((c) => c.level <= lvl);
  const fit = open.filter((c) => casePrice(c) <= budget).sort((a, b) => casePrice(b) - casePrice(a));
  return fit[0] ?? open.sort((a, b) => casePrice(a) - casePrice(b))[0];
}

function levelReward(lvl: number) {
  const c = levelCaseFor(lvl);
  if (c) save.freeOpens[c.id] = (save.freeOpens[c.id] ?? 0) + 1;
  let coins = 0;
  if (lvl % 5 === 0) { coins = lvl * 4; addCoins(coins); save.stats.bonus += coins; }
  const t = TITLES.find((x) => x.from === lvl);
  sfx.levelUp();
  toast(`Stufe ${lvl} erreicht!`, `${c ? `Gratis: ${c.name}` : ''}${coins ? ` · +${coins} Coins` : ''}${t ? ` · Neuer Titel: ${t.name}` : ''}`, 'level', '▲');
  newlyUnlocked(lvl);
}
function newlyUnlocked(lvl: number) {
  const fresh = CASES.filter((c) => c.level === lvl);
  if (fresh.length) setTimeout(() => toast('Neue Kisten freigeschaltet', fresh.map((c) => c.name).join(', '), 'info', '◆'), 600);
}

// ---------- daily bonus / rescue ----------

export const bonusAmount = () => M.ov('eco.bonus', 10 + level() * 2);
export const bonusReadyIn = () => Math.max(0, save.daily.bonusAt + DAY_MS - Date.now());
export function claimBonus(): number {
  if (bonusReadyIn() > 0) return 0;
  const n = bonusAmount();
  addCoins(n); save.stats.bonus += n; save.daily.bonusAt = Date.now();
  commit();
  return n;
}
const RESCUE_MS = 30 * 60 * 1000;
export const cheapestCase = () => Math.min(...CASES.filter((c) => c.level <= level()).map(casePrice));
export const isBroke = () => save.balance < cheapestCase() && invValue() < cheapestCase();
export const rescueReadyIn = () => Math.max(0, save.daily.rescueAt + RESCUE_MS - Date.now());
export function claimRescue(): number {
  if (!isBroke() || rescueReadyIn() > 0) return 0;
  const n = M.ov('eco.rescue', Math.max(15, Math.ceil(cheapestCase() * 3)));
  addCoins(n); save.stats.bonus += n; save.daily.rescueAt = Date.now();
  commit();
  return n;
}

// ---------- missions ----------

export interface MissionDef { id: string; text: string; target: number; xp: number; coins: number; on: (e: GameEvent) => number }
const atLeast = (r: Rarity, item: SkinDef | undefined) => !!item && rarityIndex(item.rarity) >= rarityIndex(r);
export const MISSIONS: MissionDef[] = [
  { id: 'open5', text: 'Öffne 5 Kisten', target: 5, xp: 120, coins: 3, on: (e) => (e.t === 'open' ? 1 : 0) },
  { id: 'open15', text: 'Öffne 15 Kisten', target: 15, xp: 300, coins: 8, on: (e) => (e.t === 'open' ? 1 : 0) },
  { id: 'purple', text: 'Ziehe ein Lila (Eingeschränkt oder besser)', target: 1, xp: 150, coins: 4, on: (e) => (e.t === 'open' && atLeast('restricted', skinById(e.item.skin)) ? 1 : 0) },
  { id: 'pink', text: 'Ziehe ein Pink (Klassifiziert oder besser)', target: 1, xp: 400, coins: 10, on: (e) => (e.t === 'open' && atLeast('classified', skinById(e.item.skin)) ? 1 : 0) },
  { id: 'battle', text: 'Gewinne ein Battle', target: 1, xp: 250, coins: 6, on: (e) => (e.t === 'battle' && e.won ? 1 : 0) },
  { id: 'battle2', text: 'Spiele 2 Battles', target: 2, xp: 180, coins: 4, on: (e) => (e.t === 'battle' ? 1 : 0) },
  { id: 'upgrade', text: 'Versuche 2 Upgrades', target: 2, xp: 150, coins: 3, on: (e) => (e.t === 'upgrade' ? 1 : 0) },
  { id: 'upwin', text: 'Gewinne ein Upgrade', target: 1, xp: 250, coins: 6, on: (e) => (e.t === 'upgrade' && e.won ? 1 : 0) },
  { id: 'contract', text: 'Schließe einen Vertrag ab', target: 1, xp: 200, coins: 5, on: (e) => (e.t === 'contract' ? 1 : 0) },
  { id: 'flip', text: 'Spiele 3 Coinflips', target: 3, xp: 150, coins: 3, on: (e) => (e.t === 'flip' ? 1 : 0) },
  { id: 'crash2', text: 'Steige beim Crash ab 2,00× aus', target: 1, xp: 220, coins: 5, on: (e) => (e.t === 'crash' && e.won && e.mult >= 2 ? 1 : 0) },
  { id: 'spend25', text: 'Öffne Kisten für 25 Coins', target: 25, xp: 260, coins: 5, on: (e) => (e.t === 'open' ? e.price : 0) },
  { id: 'sell10', text: 'Verkaufe Skins im Wert von 10 Coins', target: 10, xp: 140, coins: 2, on: (e) => (e.t === 'sell' ? e.value : 0) },
];
export const missionDef = (id: string) => MISSIONS.find((m) => m.id === id);
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export function ensureMissions() {
  const k = dayKey();
  if (save.missions.day === k && save.missions.list.length === 3) return;
  const pool = [...MISSIONS].sort((a, b) => hash01(k + a.id) - hash01(k + b.id));
  // Always one opening mission so the day starts easy.
  const first = pool.find((m) => m.id === 'open5' || m.id === 'purple')!;
  const rest = pool.filter((m) => m !== first).slice(0, 2);
  save.missions = { day: k, list: [first, ...rest].map((m) => ({ id: m.id, progress: 0, claimed: false })) };
}
export const msToMidnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime() - Date.now(); };
export function claimMission(id: string): boolean {
  const m = save.missions.list.find((x) => x.id === id);
  const d = missionDef(id);
  if (!m || !d || m.claimed || m.progress < d.target) return false;
  m.claimed = true;
  addCoins(d.coins); save.stats.bonus += d.coins;
  addXP(d.xp);
  sfx.coin();
  commit();
  return true;
}

// ---------- achievements ----------

export interface AchDef { id: string; name: string; text: string; icon: string; test: () => boolean }
export const ACHIEVEMENTS: AchDef[] = [
  { id: 'first', name: 'Erster Klick', text: 'Öffne deine erste Kiste', icon: '📦', test: () => save.stats.opened >= 1 },
  { id: 'open100', name: 'Dauerbrenner', text: 'Öffne 100 Kisten', icon: '🔥', test: () => save.stats.opened >= 100 },
  { id: 'open1000', name: 'Lagerhalle', text: 'Öffne 1.000 Kisten', icon: '🏭', test: () => save.stats.opened >= 1000 },
  { id: 'covert', name: 'Rote Linie', text: 'Ziehe einen verdeckten Skin', icon: '🟥', test: () => save.stats.coverts >= 1 },
  { id: 'gold', name: 'Goldjunge', text: 'Ziehe ein ★ Messer oder Handschuhe', icon: '★', test: () => save.stats.golds >= 1 },
  { id: 'gold5', name: 'Messersammlung', text: 'Ziehe 5 ★ Gegenstände', icon: '🔪', test: () => save.stats.golds >= 5 },
  { id: 'battle1', name: 'Arena', text: 'Gewinne ein Battle', icon: '⚔', test: () => save.stats.battlesWon >= 1 },
  { id: 'battle10', name: 'Champion', text: 'Gewinne 10 Battles', icon: '🏆', test: () => save.stats.battlesWon >= 10 },
  { id: 'up1', name: 'Höher hinaus', text: 'Gewinne ein Upgrade', icon: '⬆', test: () => save.stats.upgradesWon >= 1 },
  { id: 'contract1', name: 'Unterschrieben', text: 'Schließe einen Vertrag ab', icon: '✍', test: () => save.stats.contracts >= 1 },
  { id: 'crash10', name: 'Raketenstart', text: 'Steige beim Crash ab 10× aus', icon: '🚀', test: () => save.stats.crashBest >= 10 },
  { id: 'flip10', name: 'Kopf oder Zahl', text: 'Gewinne 10 Coinflips', icon: '🪙', test: () => save.stats.flipsWon >= 10 },
  { id: 'lvl10', name: 'Sammler', text: 'Erreiche Stufe 10', icon: 'Ⅱ', test: () => level() >= 10 },
  { id: 'lvl25', name: 'Halbzeit', text: 'Erreiche Stufe 25', icon: 'Ⅲ', test: () => level() >= 25 },
  { id: 'lvl50', name: 'Legende', text: 'Erreiche Stufe 50', icon: 'Ⅴ', test: () => level() >= 50 },
  { id: 'rich', name: 'Tausender', text: 'Habe 1.000 Coins auf dem Konto', icon: '💰', test: () => save.balance >= 1000 },
  { id: 'vault', name: 'Tresor', text: 'Inventar im Wert von 500 Coins', icon: '🗄', test: () => invValue() >= 500 },
  { id: 'best100', name: 'Volltreffer', text: 'Ein einzelner Drop über 100 Coins', icon: '💎', test: () => (save.stats.best?.value ?? 0) >= 100 },
];
export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id] || !a.test()) continue;
    save.achievements[a.id] = Date.now();
    addXP(150);
    setTimeout(() => toast(`Erfolg: ${a.name}`, a.text, 'gold', a.icon), 300);
  }
}

onGame((e) => {
  ensureMissions();
  for (const m of save.missions.list) {
    const d = missionDef(m.id);
    if (!d || m.claimed) continue;
    const before = m.progress;
    m.progress = Math.min(d.target, m.progress + d.on(e));
    if (before < d.target && m.progress >= d.target) setTimeout(() => toast('Mission erfüllt', d.text, 'good', '✓'), 200);
  }
  checkAchievements();
});
