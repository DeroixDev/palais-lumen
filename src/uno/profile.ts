// Name, colour and stats, kept in this browser. The launcher reads `unounser.save` too.

export const PLAYER_COLORS = ['#ff3d9a', '#dcff1f', '#2fe6ff', '#ff8a1f', '#b38cff', '#ffe14a', '#5dffb0', '#ff5a5a'] as const;

export interface Profile {
  id: string;
  name: string;
  color: number;
  mute: boolean;
  bots: number;
}

export interface Stats {
  v: 1;
  /** Matches won / played. */
  wins: number;
  matches: number;
  rounds: number;
  roundsWon: number;
  /** Most points from a single round. */
  best: number;
  lastAt: number;
}

const PROFILE_KEY = 'unounser.profile';
const SAVE_KEY = 'unounser.save';
const RULES_KEY = 'unounser.rules';

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
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: lasts for this visit */
  }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function newId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
}

export const cleanName = (s: string) => s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);

export function loadProfile(): Profile {
  const p = read(PROFILE_KEY);
  const prof: Profile = {
    id: typeof p?.id === 'string' && p.id ? p.id : newId(),
    name: typeof p?.name === 'string' ? cleanName(p.name) : '',
    color: Math.max(0, Math.min(PLAYER_COLORS.length - 1, Math.floor(num(p?.color, Math.floor(Math.random() * PLAYER_COLORS.length))))),
    mute: p?.mute === true,
    bots: Math.max(1, Math.min(3, Math.floor(num(p?.bots, 3)))),
  };
  if (!p) write(PROFILE_KEY, prof);
  return prof;
}

export const hasProfile = () => !!read(PROFILE_KEY)?.name;
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);

export function loadStats(): Stats {
  const s = read(SAVE_KEY);
  return {
    v: 1,
    wins: num(s?.wins, 0),
    matches: num(s?.matches, 0),
    rounds: num(s?.rounds, 0),
    roundsWon: num(s?.roundsWon, 0),
    best: num(s?.best, 0),
    lastAt: num(s?.lastAt, 0),
  };
}

export const saveStats = (s: Stats) => write(SAVE_KEY, { ...s, lastAt: Date.now() });

export function loadRules<T extends object>(def: T): T {
  const r = read(RULES_KEY);
  const out = { ...def } as Record<string, unknown>;
  if (r) for (const k of Object.keys(def)) if (typeof r[k] === typeof out[k]) out[k] = r[k];
  return out as T;
}
export const saveRules = (r: object) => write(RULES_KEY, r);

export const BOT_NAMES = ['Kiki', 'Bruno', 'Mira', 'Tobi', 'Nele', 'Ozzy'];
