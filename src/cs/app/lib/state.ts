// The player's save: balance, inventory, career, stats. Autosaved to localStorage under 'csgambler.'.

import type { ItemInstance } from '../../contract';
import { itemValue } from './economy';
import * as M from './mods';

export const START_BALANCE = 50;
const KEY = 'csgambler.save';

export interface DropLog { item: ItemInstance; value: number; caseId?: string; ts: number }
export interface BattleLog { id: string; ts: number; mode: string; cases: string[]; won: boolean; total: number; take: number }

export interface Stats {
  opened: number; spent: number; dropValue: number; sold: number;
  golds: number; coverts: number;
  battles: number; battlesWon: number;
  upgrades: number; upgradesWon: number;
  contracts: number;
  flips: number; flipsWon: number;
  crash: number; crashWon: number; crashBest: number;
  bonus: number;
  best?: DropLog;
}

export interface Mission { id: string; progress: number; claimed: boolean }

export interface Save {
  v: 1;
  name: string;
  avatar: number;
  balance: number;
  xp: number;
  inv: ItemInstance[];
  stats: Stats;
  recent: DropLog[];
  freeOpens: Record<string, number>;
  daily: { caseAt: number; bonusAt: number; rescueAt: number };
  missions: { day: string; list: Mission[] };
  achievements: Record<string, number>;
  rewardedLevel: number;
  /** 2 = the 250-level road; older saves are recomputed once (career.migrateCareer). */
  careerV?: number;
  battles: BattleLog[];
  crashHistory: number[];
  settings: { sound: boolean; fast: boolean; volume: number };
  created: number;
}

function fresh(): Save {
  return {
    v: 1,
    name: 'Du',
    avatar: Math.floor(Math.random() * 12),
    balance: START_BALANCE,
    xp: 0,
    inv: [],
    stats: { opened: 0, spent: 0, dropValue: 0, sold: 0, golds: 0, coverts: 0, battles: 0, battlesWon: 0, upgrades: 0, upgradesWon: 0, contracts: 0, flips: 0, flipsWon: 0, crash: 0, crashWon: 0, crashBest: 0, bonus: 0 },
    recent: [],
    freeOpens: {},
    daily: { caseAt: 0, bonusAt: 0, rescueAt: 0 },
    missions: { day: '', list: [] },
    achievements: {},
    rewardedLevel: 1,
    careerV: 2,
    battles: [],
    crashHistory: [],
    settings: { sound: true, fast: false, volume: 0.7 },
    created: Date.now(),
  };
}

/** Fills any field an older save lacks. */
function upgrade(raw: unknown): Save {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Save>;
  const s: Save = { ...base, ...r, stats: { ...base.stats, ...(r.stats ?? {}) }, daily: { ...base.daily, ...(r.daily ?? {}) }, settings: { ...base.settings, ...(r.settings ?? {}) } } as Save;
  if (typeof r.careerV !== 'number') s.careerV = 1;
  if (!Array.isArray(s.inv)) s.inv = [];
  s.inv = s.inv.filter((i) => i && typeof i.skin === 'string' && typeof i.float === 'number');
  if (typeof s.balance !== 'number' || !isFinite(s.balance)) s.balance = START_BALANCE;
  return s;
}

function load(): Save {
  try {
    const t = localStorage.getItem(KEY);
    if (t) return upgrade(JSON.parse(t));
  } catch { /* storage blocked or broken: start fresh */ }
  return fresh();
}

export const save: Save = load();

// ---------- change notification ----------

type Listener = () => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

let saveTimer = 0;
/** Call after every mutation: redraws the shell and schedules a save. */
export function commit() {
  listeners.forEach((fn) => fn());
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 250);
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* full or blocked */ }
}
addEventListener('pagehide', persist);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });

// ---------- game events (missions, achievements listen) ----------

export type GameEvent =
  | { t: 'open'; caseId: string; item: ItemInstance; value: number; price: number }
  | { t: 'sell'; count: number; value: number }
  | { t: 'battle'; won: boolean; take: number }
  | { t: 'upgrade'; won: boolean; value: number }
  | { t: 'contract'; value: number }
  | { t: 'flip'; won: boolean; stake: number }
  | { t: 'crash'; won: boolean; mult: number; stake: number };
type EvListener = (e: GameEvent) => void;
const evListeners = new Set<EvListener>();
export function onGame(fn: EvListener) { evListeners.add(fn); }
export function emit(e: GameEvent) { evListeners.forEach((fn) => fn(e)); }

// ---------- inventory helpers ----------

export function addItem(it: ItemInstance) { save.inv.unshift(it); }
export function removeItems(uids: string[]) {
  const set = new Set(uids);
  save.inv = save.inv.filter((i) => !set.has(i.uid));
}
export function findItem(uid: string) { return save.inv.find((i) => i.uid === uid); }
export const invValue = () => save.inv.reduce((a, i) => a + itemValue(i), 0);

let sellBoost = () => 1;
/** The career's rank perk multiplies every sale (set by career.ts, which sits above this module). */
export function setSellBoost(fn: () => number) { sellBoost = fn; }
/** What selling skins worth `raw` pays out (rank perk and house factor included). */
export const sellValue = (raw: number) => M.sell(Math.round(raw * sellBoost() * 100) / 100);

export function sellItems(uids: string[]): number {
  const set = new Set(uids);
  const items = save.inv.filter((i) => set.has(i.uid));
  const v = sellValue(items.reduce((a, i) => a + itemValue(i), 0));
  removeItems(uids);
  save.balance += v;
  save.stats.sold += v;
  emit({ t: 'sell', count: items.length, value: v });
  commit();
  return v;
}

export function addCoins(n: number) { save.balance = Math.round((save.balance + n) * 100) / 100; }
export function spend(n: number): boolean {
  if (save.balance + 1e-9 < n) return false;
  save.balance = Math.round((save.balance - n) * 100) / 100;
  save.stats.spent += n;
  return true;
}

// ---------- export / import ----------

export function exportCode(): string {
  const json = JSON.stringify(save);
  const b = btoa(unescape(encodeURIComponent(json)));
  let h = 0;
  for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
  return `CSG1.${h.toString(36)}.${b}`;
}
export function importCode(code: string): boolean {
  try {
    const m = code.trim().match(/^CSG1\.([0-9a-z]+)\.(.+)$/s);
    if (!m) return false;
    const b = m[2].replace(/\s+/g, '');
    let h = 0;
    for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
    if (h.toString(36) !== m[1]) return false;
    const data = upgrade(JSON.parse(decodeURIComponent(escape(atob(b)))));
    Object.assign(save, data);
    persist();
    commit();
    return true;
  } catch { return false; }
}
export function resetSave() {
  Object.assign(save, fresh());
  persist();
  commit();
}
