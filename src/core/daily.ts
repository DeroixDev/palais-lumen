// Tagesherausforderung: one special run per real calendar day. Everyone who plays on the same
// date gets the same start: the same daily rotation, events, guest tasks, perk drafts and moon
// level. Only the setup is seeded from the date; every game round stays truly random.
// The run lives in its own save key ('daily'), so the normal run is never touched.

import { newSave, type GameState, type SaveData } from './state';
import { MOON_LEVELS } from './moon';

/** Local date of today as 'YYYY-MM-DD'. */
export function todayKey(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** '2026-10-10' → '10.10.2026' (or '10.10.' short). */
export function dateLabel(key: string, short = false) {
  const [y, m, d] = key.split('-');
  return short ? `${d}.${m}.` : `${d}.${m}.${y}`;
}

/** The date `n` days before `key`, as a key. */
export function daysBefore(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - n, 12));
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small seeded generator (mulberry32), same as the rotation's. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random source for setup picks of a day (event, tasks, draft, …). In a normal run it is plain
 * Math.random; in the daily challenge it is seeded by date + day + `key`, so every player gets
 * the same picks. Never use it for a game round.
 */
export function dailyRandom(d: SaveData, key: string): () => number {
  if (!d.dailySeed) return Math.random;
  return mulberry(hashStr(`${d.dailySeed}:${d.evening.number}:${key}`));
}

/** Moon level of a date's challenge: Neumond, Sichel or Halbmond, the same for everyone. */
export function dailyHeat(key: string) {
  return hashStr(`${key}:moon`) % 3;
}

export const dailyMoonName = (key: string) => MOON_LEVELS[dailyHeat(key)]?.name ?? 'Neumond';

/** True while this save is a daily run that is still going. */
export const isDailyRun = (d: SaveData) => !!d.dailySeed && !d.counters.dailyOver;
/** The counted attempt of the day (not a practice replay). */
export const isPractice = (d: SaveData) => (d.counters.dailyPractice ?? 0) > 0;

/**
 * A fresh daily run for `key`. Name and look come from the normal run; the leaderboard and
 * today's practice best are carried over from the previous daily save.
 */
export function newDailySave(key: string, normal: SaveData, prev: SaveData | null, practice: boolean): SaveData {
  const d = newSave();
  d.dailySeed = key;
  d.players = JSON.parse(JSON.stringify(normal.players));
  d.owned = [...normal.owned];
  d.dailyBest = { ...prev?.dailyBest };
  // Same rotation for everyone: season 1, day n, and a salt from the date.
  d.counters.rotSalt = (hashStr(key) % 99991) + 1;
  // Fixed moon level, settled at once (no dial).
  d.heat = dailyHeat(key);
  d.heatUnlocked = d.heat;
  d.counters.heatPick = d.season.number;
  if (practice) d.counters.dailyPractice = 1;
  if (prev?.dailySeed === key) {
    d.counters.dailyPDay = prev.counters.dailyPDay ?? 0;
    d.counters.dailyPBal = prev.counters.dailyPBal ?? 0;
  }
  // So the board can say the run of `key` was started (one attempt counts).
  d.counters.dailyStarted = 1;
  return d;
}

export interface DailyEntry {
  key: string;
  day: number;
  balance: number;
  at: number;
}

/** Day reached from days cleared: 13 cleared means the season was won. */
export const reachedDay = (cleared: number) => Math.min(13, cleared + 1);

/** Records the end of a daily run. Only the first (counted) run of a date goes to dailyBest. */
export function recordDaily(d: SaveData, cleared: number, balance: number) {
  const key = d.dailySeed;
  if (!key) return;
  if (isPractice(d)) {
    const better = cleared > (d.counters.dailyPDay ?? 0) || (cleared === (d.counters.dailyPDay ?? 0) && balance > (d.counters.dailyPBal ?? 0));
    if (better) {
      d.counters.dailyPDay = cleared;
      d.counters.dailyPBal = balance;
    }
  } else if (!d.dailyBest[key]) {
    d.dailyBest[key] = { day: cleared, balance, at: Date.now() };
  }
  d.counters.dailyOver = 1;
  d.counters.dailyEndDay = cleared;
  d.counters.dailyEndBal = balance;
}

/** Ends an unfinished counted run of an earlier date with what it reached so far. */
export function closeStaleRun(d: SaveData) {
  if (!d.dailySeed || d.counters.dailyOver) return;
  recordDaily(d, d.evening.number - 1, d.balance);
}

/** The last `n` dates up to `today`, with their results where there are any. */
export function lastDays(best: SaveData['dailyBest'], today: string, n = 14): (DailyEntry | { key: string; day: -1; balance: 0; at: 0 })[] {
  const out: (DailyEntry | { key: string; day: -1; balance: 0; at: 0 })[] = [];
  for (let i = 0; i < n; i++) {
    const key = daysBefore(today, i);
    const e = best[key];
    out.push(e ? { key, ...e } : { key, day: -1, balance: 0, at: 0 });
  }
  return out;
}

/**
 * Hooks the challenge into the state: when a daily run ends (a day missed, or the season won)
 * the result is recorded and the run is marked over. The wrapped endEvening keeps its signature.
 */
export function installDaily(state: GameState) {
  const end = state.endEvening.bind(state);
  state.endEvening = () => {
    const daily = !!state.data.dailySeed && !state.data.counters.dailyOver;
    const r = end();
    if (daily && (r.seasonWon || (!r.passed && !r.rescued))) {
      recordDaily(state.data, r.seasonWon ? 13 : r.cleared, r.endBalance);
      state.emit();
    }
    return r;
  };
}
