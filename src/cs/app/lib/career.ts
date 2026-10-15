// Career: levels from XP, titles, level rewards, the daily case, missions, achievements.

import type { CaseDef, Rarity, SkinDef } from '../../contract';
import { CASES, SKINS, caseById, skinById } from './assets';
import { casePrice, rarityIndex } from './economy';
import { addCoins, commit, invValue, onGame, save, setSellBoost, type GameEvent } from './state';
import { sfx } from './sound';
import { toast } from '../ui/toast';
import { hash01 } from './util';
import * as M from './mods';

export const MAX_LEVEL = 250;
/**
 * XP from one level to the next: mildly exponential plus a small linear part.
 * Level 2 needs 550 XP, level 50 about 4.000, level 249 about 30.000 (×55 over the whole road).
 */
const XP_BASE = 550, XP_GROWTH = 1.0135, XP_LIN = 60;
export const xpToNext = (lvl: number) => Math.round((XP_BASE * Math.pow(XP_GROWTH, lvl - 1) + XP_LIN * (lvl - 1)) / 10) * 10;
/** CUM[l] = total XP at the start of level l. */
const CUM: number[] = [0, 0];
for (let l = 1; l < MAX_LEVEL; l++) CUM[l + 1] = CUM[l] + xpToNext(l);
/** Total XP needed to stand at the start of `lvl`. */
export const xpAtLevel = (lvl: number) => CUM[Math.max(1, Math.min(MAX_LEVEL, Math.round(lvl)))];

export function levelInfo(xp = save.xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (CUM[mid] <= xp) lo = mid; else hi = mid - 1; }
  const lvl = lo;
  const need = lvl >= MAX_LEVEL ? 0 : xpToNext(lvl);
  const into = xp - CUM[lvl];
  return { level: lvl, into, need, frac: need ? Math.min(1, into / need) : 1 };
}
export const level = () => levelInfo().level;

// ---------- ranks: 11 stages of 25 levels, each with 5 sub-steps of 5 levels ----------

export interface Stage {
  i: number; from: number; name: string; material: string;
  /** Name colour in the feed and in battles. */
  color: string;
  blurb: string;
}
export const STAGES: Stage[] = [
  { i: 0, from: 1, name: 'Eisen', material: 'Raues Eisen', color: '#aeb6c2', blurb: 'Genietetes Eisen. Jeder fängt hier an.' },
  { i: 1, from: 25, name: 'Bronze', material: 'Gegossene Bronze', color: '#e09a5c', blurb: 'Der erste Guss. Man kennt deinen Namen im Feed.' },
  { i: 2, from: 50, name: 'Silber', material: 'Poliertes Silber', color: '#dfe7f2', blurb: 'Ein Wappen aus Silber, sauber graviert.' },
  { i: 3, from: 75, name: 'Gold', material: 'Schweres Gold', color: '#ffd35a', blurb: 'Gold mit Lorbeer. Ab hier glänzt es von selbst.' },
  { i: 4, from: 100, name: 'Platin', material: 'Platin', color: '#bff3ff', blurb: 'Kühles Platin mit Klingen an den Seiten.' },
  { i: 5, from: 125, name: 'Smaragd', material: 'Geschliffener Smaragd', color: '#4dffa6', blurb: 'Facettierte Steine, gefasst in Grünsilber.' },
  { i: 6, from: 150, name: 'Saphir', material: 'Saphir und Diamant', color: '#6fb6ff', blurb: 'Ein Kristallwappen, das das Licht bricht.' },
  { i: 7, from: 175, name: 'Obsidian', material: 'Obsidian mit Glutadern', color: '#ff7a33', blurb: 'Schwarzes Glas, innen glüht es noch.' },
  { i: 8, from: 200, name: 'Plasma', material: 'Gebundenes Plasma', color: '#ff5cf0', blurb: 'Energie in Form gehalten. Es summt leise.' },
  { i: 9, from: 225, name: 'Prisma', material: 'Holografisches Prisma', color: '#b9a4ff', blurb: 'Alle Farben auf einmal, je nach Blickwinkel.' },
  { i: 10, from: 250, name: 'Ikone', material: 'Krone der Ikone', color: '#fff0b0', blurb: 'Die Krone. Mehr gibt es nicht.' },
];
export const stageOf = (lvl = level()) => STAGES[Math.min(10, Math.floor(Math.max(0, lvl) / 25))];
/** 0..4 within a stage (one step per 5 levels); the crown has none. */
export const subOf = (lvl: number) => (lvl >= MAX_LEVEL ? 0 : Math.floor((Math.max(1, lvl) % 25) / 5));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
export const roman = (n: number) => ROMAN[n - 1] ?? String(n);
/** "Silber III" (the crown is just "Ikone"). */
export const rankName = (lvl = level()) => (lvl >= MAX_LEVEL ? STAGES[10].name : `${stageOf(lvl).name} ${roman(subOf(lvl) + 1)}`);

export const TITLES = [
  { from: 1, name: 'Neuling', blurb: 'Alter Rechner, kleines Zimmer, große Träume.' },
  { from: 25, name: 'Sammler', blurb: 'Die erste Skin-Wand hängt. Verträge lohnen sich jetzt.' },
  { from: 75, name: 'Händler', blurb: 'Du kennst die Preise besser als der Markt.' },
  { from: 125, name: 'Streamer', blurb: 'Der Chat flippt aus, wenn du Gold ziehst.' },
  { from: 175, name: 'Veranstalter', blurb: 'Deine eigenen Battles, deine eigene Halle.' },
  { from: 250, name: 'Legende', blurb: 'Über dich reden sie in jedem Feed.' },
];
export function titleOf(lvl = level()) {
  let t = TITLES[0];
  for (const x of TITLES) if (lvl >= x.from) t = x;
  return t;
}
export const titleIndex = (lvl = level()) => TITLES.indexOf(titleOf(lvl));

// ---------- rank perks ----------

/** Sell bonus: +1 % per stage reached (Bronze +1 % … Ikone +10 %). */
export const sellBonus = (lvl = level()) => stageOf(lvl).i / 100;
setSellBoost(() => 1 + sellBonus());
/** Coins a stage-up hands out once. */
export const stageCoins = (i: number) => 50 * i;
/** Coins on every fifth level (stage-ups pay `stageCoins` instead). */
export const milestoneCoins = (lvl: number) => Math.round(5 + lvl * 0.6);

/** Plausible, stable level for a simulated player: most are low, a few are far up the road. */
export function botLevel(name: string): number {
  const h = hash01(`${name}·rang`);
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(2 + Math.pow(h, 2.1) * 255)));
}

// ---------- daily case (synthetic) ----------

export const DAILY_ID = 'tageskiste';
export const DAY_MS = 24 * 3600 * 1000;
const dailyCache = new Map<number, CaseDef>();
/** The free daily case; its contents get better with each rank stage. */
export function dailyCase(tier = stageOf().i): CaseDef {
  const hit = dailyCache.get(tier);
  if (hit) return hit;
  const contents: Partial<Record<Rarity, string[]>> = {};
  const tiers: Rarity[] = ['milspec', 'restricted', 'classified', 'covert', 'gold'];
  for (const r of tiers) {
    const list = SKINS.filter((s) => s.rarity === r).sort((a, b) => a.basePrice - b.basePrice);
    if (!list.length) continue;
    const n = Math.min(list.length, r === 'gold' ? 4 : 7);
    const start = Math.floor((list.length - n) * (tier / 10) * 0.85);
    contents[r] = list.slice(start, start + n).map((s) => s.id);
  }
  const c: CaseDef = {
    id: DAILY_ID,
    name: `Tageskiste ${STAGES[tier].name}`,
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

export interface LevelUp { from: number; to: number; stage: Stage | null; got: string[] }
type LevelListener = (e: LevelUp) => void;
const levelListeners = new Set<LevelListener>();
/** Fires after XP lifted the player at least one level (not for menu edits). */
export function onLevelUp(fn: LevelListener) { levelListeners.add(fn); return () => levelListeners.delete(fn); }

export function addXP(n: number) {
  const before = level();
  save.xp += Math.round(n * M.num('eco.xp'));
  const after = level();
  if (after <= before) return;
  const got: string[] = [];
  let stage: Stage | null = null;
  for (let l = Math.max(before, save.rewardedLevel) + 1; l <= after; l++) {
    got.push(...levelReward(l));
    if (l % 25 === 0 || l === MAX_LEVEL) stage = stageOf(l);
  }
  if (after > save.rewardedLevel) save.rewardedLevel = after;
  const e: LevelUp = { from: before, to: after, stage, got };
  if (!stage) {
    sfx.levelUp();
    const toGo = nextStage(after);
    toast(`Stufe ${after} · ${rankName(after)}`, got.length ? got.join(' · ') : toGo ? `Noch ${toGo.from - after} ${toGo.from - after === 1 ? 'Stufe' : 'Stufen'} bis ${toGo.name}` : '', 'level', '▲');
  }
  levelListeners.forEach((fn) => fn(e));
}
export const nextStage = (lvl = level()) => STAGES.find((s) => s.from > lvl);

/** XP for spending/playing `coins` worth. */
export const xpFor = (coins: number) => 10 + coins * 10;

/** The case a milestone hands out for free. */
export function levelCaseFor(lvl: number): CaseDef | undefined {
  const budget = 2 + lvl * 1.6;
  const open = CASES.filter((c) => c.level <= lvl);
  const fit = open.filter((c) => casePrice(c) <= budget).sort((a, b) => casePrice(b) - casePrice(a));
  return fit[0] ?? open.sort((a, b) => casePrice(a) - casePrice(b))[0];
}

/** What reaching `lvl` grants, as short German lines (empty on plain levels). */
export function rewardsAt(lvl: number): { coins: number; freeCase?: CaseDef; stage?: Stage; title?: string; cases: CaseDef[] } {
  const stageUp = lvl % 25 === 0;
  const st = stageUp ? stageOf(lvl) : undefined;
  return {
    coins: stageUp ? stageCoins(st!.i) : lvl % 5 === 0 ? milestoneCoins(lvl) : 0,
    freeCase: lvl % 5 === 0 ? levelCaseFor(lvl) : undefined,
    stage: st,
    title: TITLES.find((x) => x.from === lvl && x.from > 1)?.name,
    cases: CASES.filter((c) => c.level === lvl),
  };
}

function levelReward(lvl: number): string[] {
  const r = rewardsAt(lvl);
  const got: string[] = [];
  if (r.freeCase) { save.freeOpens[r.freeCase.id] = (save.freeOpens[r.freeCase.id] ?? 0) + 1; got.push(`Gratis: ${r.freeCase.name}`); }
  if (r.coins) { addCoins(r.coins); save.stats.bonus += r.coins; got.push(`+${r.coins} Coins`); }
  if (r.title) got.push(`Titel: ${r.title}`);
  if (r.cases.length) setTimeout(() => toast('Neue Kisten freigeschaltet', r.cases.map((c) => c.name).join(', '), 'info', '◆'), 600);
  return got;
}

/**
 * Saves from before the 250-level road: the XP stays, the level is recomputed on the new curve,
 * and nothing already granted is taken back. Rewards continue from the new level.
 */
export function migrateCareer(): boolean {
  if ((save.careerV ?? 1) >= 2) return false;
  const was = save.rewardedLevel;
  save.careerV = 2;
  save.rewardedLevel = level();
  commit();
  if (save.xp > 0) setTimeout(() => toast('Karriere überarbeitet', `Deine ${Math.round(save.xp).toLocaleString('de-DE')} XP zählen jetzt auf 250 Stufen: Stufe ${level()} · ${rankName()}${was > 1 ? '. Alles Erhaltene bleibt dir.' : ''}`, 'level', '▲'), 900);
  return true;
}

// ---------- daily bonus / rescue ----------

export const bonusAmount = () => M.ov('eco.bonus', Math.round(10 + level() * 1.2 + stageOf().i * 10));
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
  { id: 'lvl10', name: 'Aufsteiger', text: 'Erreiche Stufe 10', icon: 'Ⅱ', test: () => level() >= 10 },
  { id: 'lvl25', name: 'Bronzeguss', text: 'Erreiche den Rang Bronze (Stufe 25)', icon: 'Ⅲ', test: () => level() >= 25 },
  { id: 'lvl50', name: 'Silberstreif', text: 'Erreiche den Rang Silber (Stufe 50)', icon: 'Ⅴ', test: () => level() >= 50 },
  { id: 'lvl100', name: 'Platinherz', text: 'Erreiche den Rang Platin (Stufe 100)', icon: 'Ⅹ', test: () => level() >= 100 },
  { id: 'lvl175', name: 'Glutkern', text: 'Erreiche den Rang Obsidian (Stufe 175)', icon: '🜂', test: () => level() >= 175 },
  { id: 'lvl250', name: 'Ikone', text: 'Erreiche Stufe 250', icon: '♛', test: () => level() >= 250 },
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
