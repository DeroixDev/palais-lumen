// What this browser keeps: profile, settings, the saved evening and small stats.
// Namespace `partyunser.*` (the launcher reads `partyunser.stats`).

import { COLORS, DEFAULT_RULES, FEATS, type BotLevel, type Feat, type Quality, type Rules } from './types';
import { newId } from './util';

const K = { profile: 'partyunser.profile', settings: 'partyunser.settings', save: 'partyunser.save', stats: 'partyunser.stats' };

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: lasts for this visit */ }
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export const cleanName = (s: string) => s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);

export interface Profile { id: string; name: string; feat: Feat; color: string }
export function loadProfile(): Profile {
  const p = read(K.profile);
  const feat = FEATS.find((f) => f.id === p?.feat)?.id ?? 'cap';
  const color = (COLORS as readonly string[]).includes(p?.color as string) ? (p!.color as string) : COLORS[0];
  const prof = { id: typeof p?.id === 'string' && p.id ? p.id : newId(), name: typeof p?.name === 'string' ? cleanName(p.name) : '', feat, color };
  if (!p) write(K.profile, prof);
  return prof;
}
export const saveProfile = (p: Profile) => write(K.profile, p);

export interface Settings {
  sound: number;
  music: number;
  quality: Quality;
  bots: number;
  botLevel: BotLevel;
  rules: Rules;
}
export function loadSettings(): Settings {
  const s = read(K.settings);
  const r = (s?.rules ?? {}) as Partial<Rules>;
  const rules: Rules = {
    rounds: ([10, 15, 20] as const).find((n) => n === r.rounds) ?? DEFAULT_RULES.rounds,
    board: typeof r.board === 'string' ? r.board : DEFAULT_RULES.board,
    profi: r.profi === true,
    types: { ...DEFAULT_RULES.types, ...(r.types && typeof r.types === 'object' ? r.types : {}) },
  };
  return {
    sound: Math.max(0, Math.min(1, num(s?.sound, 0.8))),
    music: Math.max(0, Math.min(1, num(s?.music, 0.45))),
    quality: (['auto', 'hoch', 'mittel', 'niedrig'] as const).find((q) => q === s?.quality) ?? 'auto',
    bots: Math.max(1, Math.min(3, Math.floor(num(s?.bots, 3)))),
    botLevel: (['leicht', 'normal', 'stark'] as const).find((q) => q === s?.botLevel) ?? 'normal',
    rules,
  };
}
export const saveSettings = (s: Settings) => write(K.settings, s);

/** The saved evening (solo): the engine state between two turns. */
export function loadSave<T>(): { savedAt: number; data: T } | null {
  const s = read(K.save);
  if (!s || s.v !== 1 || !s.data) return null;
  return { savedAt: num(s.savedAt, 0), data: s.data as T };
}
export const writeSave = (data: unknown) => write(K.save, { v: 1, savedAt: Date.now(), data });
export const clearSave = () => { try { localStorage.removeItem(K.save); } catch { /* ignore */ } };

export interface Stats { evenings: number; wins: number; stars: number; lastAt: number }
export function loadStats(): Stats {
  const s = read(K.stats);
  return { evenings: num(s?.evenings, 0), wins: num(s?.wins, 0), stars: num(s?.stars, 0), lastAt: num(s?.lastAt, 0) };
}
export const saveStats = (s: Stats) => write(K.stats, { ...s, lastAt: Date.now() });
