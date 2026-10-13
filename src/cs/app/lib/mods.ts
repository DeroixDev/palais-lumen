// House tuning store. Every value has a default that equals the normal game, and every hook below
// returns its input untouched while its value sits on the default, so the odds, prices and the
// random number stream stay exactly as without it. Kept apart from the save under its own key.
//
// Keys are flat strings ('luck.global', 'cs.gold', 'case.<id>.gold', ...). A key that is absent
// means "default"; per-case keys default to null = use the global value.

import type { CaseDef, ItemInstance, Rarity, SkinDef } from '../../contract';

export type Val = number | boolean | string | null;
const KEY = 'csgambler.mods';
const RARS: Rarity[] = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'gold'];
export const CATS = ['starter', 'standard', 'premium', 'gold', 'event'] as const;

export const DEFAULTS: Record<string, Val> = {
  // luck, -100..100 (0 = fair)
  'luck.global': 0, 'luck.you': 0, 'luck.bots': 0,
  'up.mult': 1, 'up.force': 'off',
  'ct.chance': null, 'ct.force': 'off',
  'bt.rig': 'off', 'bt.botMods': false,
  'cf.chance': null,
  'cr.force': null, 'cr.forceMode': 'once', 'cr.min': 1, 'cr.max': null, 'cr.edge': 4,
  // cases (global)
  'cs.gold': null, 'cs.st': null, 'cs.wear': 'normal', 'cs.fmin': 0, 'cs.fmax': 1, 'cs.fbias': 0,
  'cs.price': 1, 'cs.unlock': false, 'cs.speed': 1, 'cs.suspense': true,
  // next drop
  'force.mode': 'off', 'force.skin': '', 'force.float': null, 'force.seed': null, 'force.st': false, 'force.case': '',
  // economy
  'eco.sell': 1, 'eco.val': 1, 'eco.bonus': null, 'eco.rescue': null, 'eco.xp': 1,
  // feed
  'feed.speed': 1, 'feed.pause': false, 'feed.bias': 0,
  // feel
  'fx.anim': 1, 'fx.reel': 1, 'fx.particles': 1, 'fx.reduced': false,
};
for (const r of RARS) { DEFAULTS[`cs.w.${r}`] = 1; DEFAULTS[`eco.val.${r}`] = 1; }
for (const c of CATS) DEFAULTS[`eco.rtp.${c}`] = null;

interface ModData { v: Record<string, Val>; botsAdd: string[]; botsDel: string[]; itemVal: Record<string, number> }
const empty = (): ModData => ({ v: {}, botsAdd: [], botsDel: [], itemVal: {} });

function read(): ModData {
  try {
    const t = localStorage.getItem(KEY);
    if (t) return sanitize(JSON.parse(t));
  } catch { /* blocked or broken: defaults */ }
  return empty();
}
function sanitize(raw: unknown): ModData {
  const d = empty();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ModData>;
  if (r.v && typeof r.v === 'object') for (const [k, x] of Object.entries(r.v)) if (x === null || ['number', 'boolean', 'string'].includes(typeof x)) d.v[k] = x as Val;
  if (Array.isArray(r.botsAdd)) d.botsAdd = r.botsAdd.filter((x) => typeof x === 'string').slice(0, 60);
  if (Array.isArray(r.botsDel)) d.botsDel = r.botsDel.filter((x) => typeof x === 'string');
  if (r.itemVal && typeof r.itemVal === 'object') for (const [k, x] of Object.entries(r.itemVal)) if (typeof x === 'number' && isFinite(x)) d.itemVal[k] = x;
  return d;
}

let data = read();
let ver = 0;
let timer = 0;
const listeners = new Set<() => void>();
function write() {
  ver++;
  listeners.forEach((fn) => fn());
  clearTimeout(timer);
  timer = window.setTimeout(flush, 120);
}
export function flush() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked */ } }
addEventListener('pagehide', flush);

export const onMods = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const version = () => ver;

// ---------- raw access ----------

export const def = (k: string): Val => (k in DEFAULTS ? DEFAULTS[k] : null);
export const get = (k: string): Val => (k in data.v ? data.v[k] : def(k));
export const num = (k: string): number => { const v = get(k); return typeof v === 'number' && isFinite(v) ? v : Number(def(k) ?? 0); };
export const opt = (k: string): number | null => { const v = get(k); return typeof v === 'number' && isFinite(v) ? v : null; };
export const on = (k: string): boolean => get(k) === true;
export const str = (k: string): string => String(get(k) ?? '');
export function set(k: string, v: Val) {
  if (v === def(k) || (typeof v === 'number' && !isFinite(v))) delete data.v[k];
  else data.v[k] = v;
  write();
}
export const reset = (k: string) => set(k, def(k));
export const isSet = (k: string) => k in data.v;
/** Base value unless the key holds a number. */
export const ov = (k: string, base: number): number => opt(k) ?? base;
export const changedKeys = () => Object.keys(data.v);
export function resetAll() { data = empty(); write(); }
export const dump = (): ModData => JSON.parse(JSON.stringify(data));
export function load(raw: unknown) { data = sanitize(raw); write(); }

// ---------- luck ----------

const clampL = (x: number) => Math.max(-100, Math.min(100, x));
/** Luck level of a player, -100..100: global + personal (+ all bots for bots). */
export function luckLevel(who: string): number {
  if (who === 'you') return clampL(num('luck.global') + num('luck.you'));
  return clampL(num('luck.global') + num('luck.bots') + num(`luck.bot.${who}`));
}
/** Multiplier on the gold/covert tiers of a case for that player; 1 at level 0. */
export const luckMult = (who: string) => { const l = luckLevel(who); return l ? Math.pow(8, l / 100) : 1; };
/** Steers a win chance like the casino slider: +100 always win, -100 always lose. */
export function steer(p: number, who = 'you'): number {
  const b = luckLevel(who) / 100;
  return b > 0 ? p + b * (1 - p) : b < 0 ? p * (1 + b) : p;
}
/** Extra case luck for the background feed (who = ''). */
export const whoLuck = (who: string) => (who === '' && num('feed.bias') ? Math.pow(8, num('feed.bias') / 100) : 1);

// ---------- cases ----------

const caseKey = (c: CaseDef, k: string) => get(`case.${c.id}.${k}`);
/** Per-case value if set, else the global one. */
export const caseVal = (c: CaseDef, k: string): Val => { const v = caseKey(c, k); return v === null || v === undefined ? get(`cs.${k}`) : v; };
const affects = (who: string) => who === 'you' || (who !== '' && on('bt.botMods'));

export interface Odds { rarity: Rarity; p: number }
/** The odds a roll really uses. Same array back while nothing is set for this case. */
export function odds(c: CaseDef, base: Odds[], who: string): Odds[] {
  if (!affects(who)) return base;
  const gold = caseVal(c, 'gold');
  let touched = typeof gold === 'number';
  const out = base.map((o) => {
    let p = o.p;
    const pc = caseKey(c, `p.${o.rarity}`);
    if (typeof pc === 'number') { p = pc / 100; touched = true; }
    const m = num(`cs.w.${o.rarity}`);
    if (m !== 1) { p *= m; touched = true; }
    return { rarity: o.rarity, p: Math.max(0, p) };
  });
  if (!touched) return base;
  return normalize(out, typeof gold === 'number' ? gold / 100 : null);
}
function normalize(out: Odds[], gold: number | null): Odds[] {
  const g = out.find((o) => o.rarity === 'gold');
  if (g && gold !== null) {
    const rest = out.filter((o) => o !== g);
    const s = rest.reduce((a, o) => a + o.p, 0);
    g.p = Math.max(0, Math.min(1, gold));
    if (s > 0) rest.forEach((o) => (o.p = (o.p / s) * (1 - g.p)));
    else if (rest.length) rest.forEach((o) => (o.p = (1 - g.p) / rest.length));
  }
  const s = out.reduce((a, o) => a + o.p, 0);
  if (s <= 0) return out.map((o, i) => ({ rarity: o.rarity, p: i === 0 ? 1 : 0 }));
  return out.map((o) => ({ rarity: o.rarity, p: o.p / s }));
}

export interface ForceSpec { skin: string; float: number | null; seed: number | null; st: boolean }
/** The forced next drop for this roll, if any ('once' is used up here). */
export function force(c: CaseDef, who: string): ForceSpec | null {
  if (who !== 'you') return null;
  const mode = str('force.mode');
  if (mode === 'off' || !str('force.skin')) return null;
  const only = str('force.case');
  if (only && only !== c.id) return null;
  const f: ForceSpec = { skin: str('force.skin'), float: opt('force.float'), seed: opt('force.seed'), st: on('force.st') };
  if (mode === 'once') set('force.mode', 'off');
  return f;
}

const WEAR_RANGE: Record<string, [number, number]> = { FN: [0, 0.07], MW: [0.07, 0.15], FT: [0.15, 0.38], WW: [0.38, 0.45], BS: [0.45, 1] };
/** Float, StatTrak and forced values on a fresh drop. Untouched while nothing is set. */
export function drop(c: CaseDef, it: ItemInstance, skin: SkinDef, who: string, fs: ForceSpec | null): ItemInstance {
  if (affects(who)) {
    const st = caseVal(c, 'st');
    if (typeof st === 'number' && skin.rarity !== 'gold') it.statTrak = Math.random() < st / 100;
    const wear = String(caseVal(c, 'wear') ?? 'normal');
    const bias = Number(caseVal(c, 'fbias') ?? 0) || 0;
    if (wear !== 'normal' || bias) {
      let [lo, hi] = wear === 'range' ? [Number(caseVal(c, 'fmin') ?? 0), Number(caseVal(c, 'fmax') ?? 1)] : WEAR_RANGE[wear] ?? [0, 1];
      lo = Math.max(skin.floatMin, lo);
      hi = Math.min(skin.floatMax, hi - (hi < 1 ? 1e-6 : 0));
      if (lo > hi) { const e = hi < skin.floatMin + 1e-9 ? skin.floatMin : skin.floatMax; lo = hi = Math.max(skin.floatMin, Math.min(skin.floatMax, e)); }
      let u = Math.random();
      if (bias > 0) u = Math.pow(u, 1 + (bias / 100) * 3);
      else if (bias < 0) u = Math.pow(u, 1 / (1 - (bias / 100) * 3));
      it.float = Math.round((lo + u * (hi - lo)) * 1e9) / 1e9;
    }
  }
  if (fs) {
    if (fs.float !== null) it.float = Math.max(skin.floatMin, Math.min(skin.floatMax, fs.float));
    if (fs.seed !== null) it.seed = Math.max(0, Math.min(999, Math.round(fs.seed)));
    it.statTrak = fs.st && skin.rarity !== 'gold';
  }
  return it;
}

const shop = (p: number) => (p < 10 ? Math.ceil(p * 100) / 100 : Math.ceil(p * 2) / 2 - 0.01);
/** Price after RTP target and price factor. */
export function price(c: CaseDef, base: number, ev: () => number): number {
  let p = base;
  const rtp = opt(`eco.rtp.${c.category}`);
  if (rtp !== null && rtp > 0) { const e = ev(); if (e > 0) p = shop(e / (rtp / 100)); }
  const own = caseKey(c, 'price');
  const m = typeof own === 'number' ? own : num('cs.price');
  if (m !== 1) p = Math.max(0.01, shop(p * m));
  return p;
}

// ---------- values ----------

export function valMult(r: Rarity): number { return num('eco.val') * num(`eco.val.${r}`); }
export function itemVal(it: Partial<Pick<ItemInstance, 'uid'>>, v: number): number {
  const o = it.uid ? data.itemVal[it.uid] : undefined;
  return o !== undefined ? o : v;
}
export const itemOverride = (uid: string): number | undefined => data.itemVal[uid];
export function setItemOverride(uid: string, v: number | null) {
  if (v === null || !isFinite(v)) delete data.itemVal[uid]; else data.itemVal[uid] = Math.max(0, Math.round(v * 100) / 100);
  write();
}
export function sell(v: number): number { const f = num('eco.sell'); return f === 1 ? v : Math.round(v * f * 100) / 100; }

// ---------- games ----------

/** Upgrader: the uniform draw, moved so the shown chance `ch` still matches the hidden outcome. */
export function upgradeRoll(u: number, ch: number): number {
  const f = str('up.force');
  let p = f === 'win' ? 1 : f === 'lose' ? 0 : steer(Math.min(1, ch * num('up.mult')));
  if (p === ch || ch <= 0 || ch >= 1) return u;
  const won = Math.random() < p;
  return won ? Math.random() * ch * 0.999 : ch + Math.random() * (1 - ch) * 0.999 + 1e-6;
}
/** Contracts: does it step up? */
export function contractUp(ch: number): boolean {
  const f = str('ct.force');
  const o = opt('ct.chance');
  const p = f === 'win' ? 1 : f === 'lose' ? 0 : steer(o !== null ? o / 100 : ch);
  return Math.random() < p;
}
/** Coinflip: `drawn` is the fair result; `other` the side that is not yours. */
export function flip<T>(mine: T, drawn: T, other: T): T {
  const o = opt('cf.chance');
  const p = o !== null ? o / 100 : 0.5;
  if (o === null && !luckLevel('you')) return drawn;
  return Math.random() < steer(p) ? mine : other;
}
/** Crash point. `fair(edge, u)` is the normal formula. */
export function crash(fair: (keep: number, u: number) => number): number {
  const f = opt('cr.force');
  if (f !== null && f >= 1) {
    if (str('cr.forceMode') === 'once') set('cr.force', null);
    return Math.round(f * 100) / 100;
  }
  const l = luckLevel('you');
  const u0 = Math.random();
  const u = l ? Math.pow(u0, Math.pow(2, l / 100)) : u0;
  let x = fair(1 - num('cr.edge') / 100, u);
  const lo = num('cr.min'), hi = opt('cr.max');
  if (lo > 1) x = Math.max(x, lo);
  if (hi !== null && hi >= 1) x = Math.min(x, hi);
  return Math.round(x * 100) / 100;
}

/** Battles: hands the round pulls around so the rigged side wins. `you` = your seat or -1. */
export function rigBattle<P extends { seat: number; value: number }>(rounds: P[][], teams: number[], you: number) {
  const mode = str('bt.rig');
  if (mode === 'off' || you < 0) return;
  const mine = teams.map((t, i) => (t === teams[you] ? i : -1)).filter((i) => i >= 0);
  const others = teams.map((_, i) => i).filter((i) => !mine.includes(i));
  let order: number[];
  if (mode === 'you') order = [you, ...mine.filter((i) => i !== you), ...others];
  else if (mode === 'team') order = [...mine.sort(() => Math.random() - 0.5), ...others];
  else order = [...others, ...mine];
  for (const r of rounds) {
    const pulls = r.slice().sort((a, b) => b.value - a.value);
    const fresh = order.map((seat, k) => ({ ...pulls[k], seat }));
    fresh.sort((a, b) => a.seat - b.seat).forEach((p, i) => (r[i] = p));
  }
}

/** Ties after rigging go to the rigged side. */
export function rigLeaders(leaders: number[], myTeam: number | undefined): number[] {
  const mode = str('bt.rig');
  if (mode === 'off' || myTeam === undefined || leaders.length < 2) return leaders;
  if (mode === 'bot') return leaders.filter((t) => t !== myTeam).length ? leaders.filter((t) => t !== myTeam) : leaders;
  return leaders.includes(myTeam) ? [myTeam] : leaders;
}

// ---------- bots ----------

/** Applies added/removed bot names to the shared name list in place. */
export function applyBotNames(list: string[], base: readonly string[]) {
  const del = new Set(data.botsDel);
  let names = [...base.filter((n) => !del.has(n)), ...data.botsAdd.filter((n) => !del.has(n))];
  if (names.length < 4) names = [...base];
  list.splice(0, list.length, ...names);
}
export const botsAdded = () => data.botsAdd.slice();
export const botsRemoved = () => data.botsDel.slice();
export function addBot(name: string) {
  const n = name.trim().slice(0, 20);
  if (!n) return;
  data.botsDel = data.botsDel.filter((x) => x !== n);
  if (!data.botsAdd.includes(n)) data.botsAdd.push(n);
  write();
}
export function removeBot(name: string) {
  data.botsAdd = data.botsAdd.filter((x) => x !== name);
  if (!data.botsDel.includes(name)) data.botsDel.push(name);
  write();
}
export function restoreBots() { data.botsAdd = []; data.botsDel = []; write(); }

// ---------- feel ----------

export const anim = () => Math.max(0.1, num('fx.anim'));
