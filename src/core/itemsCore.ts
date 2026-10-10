// The economy items of the bag (Engelsrolle, Versicherung, Zeitmaschine …) and the Mondstein
// income: stones for won rounds, a surplus reward at the settlement and item achievements.
//
// Economy items never touch a game's draw. They pay around a round, through state.payout, so
// the money, the stats and the day curve stay right: a refund after a lost round, extra
// profit after a won one, a stake the house pays. Because those payments are linear in the
// round's outcome, the payout share with items is exact once the game's loss share L is known
// (src/core/lossShare.ts, proven by scripts/rtp-items.mjs): see itemRtp below.
//
// Rounds of active items are used up here, from every finished round (state.onRound), for the
// odds items of the games too. Day items end when the next day begins.

import { ACHIEVEMENTS } from './achievements';
import { activeItems, allItems, bagCount, getItemRtp, itemDef, registerItem, type ItemDef } from './modifiers';
import { LOSS_SHARE } from './lossShare';
import { MOONSTONES_FOR, roundNice, type GameState, type Medal, type RoundReport, type SaveData } from './state';

// ---- Numbers ----------------------------------------------------------------------------------

export const ITEM_K = {
  /** Engelsrolle: chance that the loss comes back. */
  engel: 0.5,
  /** Teufelsrolle: chance to triple the profit (else it is gone). 1/3 × 3 = 1: fair. */
  teufel: 1 / 3,
  /** Goldjeton: stake paid by the house, up to this many stake units. */
  goldCap: 10,
  /** Mondschein-Drink: extra share of the profit, for this many rounds. */
  drink: 0.5,
  drinkRounds: 5,
  /** Spielerzuversicht: extra share of the profit, all day. */
  zuversicht: 0.1,
  /** Versicherung: share of every loss that comes back, all day. */
  versicherung: 0.15,
  /** Glücksverstärker: factor on the other items. */
  amp: 1.5,
  /** Bonusziehung: extra stones per won round, at most this many a day. */
  bonusCap: 30,
  /** Kamera: share of a big win (≥ kameraMult × stake) paid for a photo right after it. */
  kamera: 0.25,
  kameraMult: 10,
  /** Heilige Motte: rounds without loss, covered up to this many stake units per round. */
  statueRounds: 5,
  statueCap: 25,
};

/** Mondsteine for a won round by its multiple (payout ÷ stake). Small ones count towards a daily cap. */
export const ROUND_STONES: [mult: number, stones: number][] = [
  [200, 25],
  [50, 10],
  [10, 3],
  [5, 2],
  [2, 1],
];
/** Stones from wins below 10× per day (wins from 10× always pay). */
export const SMALL_STONE_CAP = 25;
/** Settlement: one stone per this share of the goal earned on top of it, at most SURPLUS_CAP. */
export const SURPLUS_STEP = 0.1;
export const SURPLUS_CAP = 20;

export function stonesForMultiple(x: number) {
  for (const [m, s] of ROUND_STONES) if (x >= m) return s;
  return 0;
}

/** Surplus stones for a day's profit against its goal (0 when the goal was missed). */
export function surplusStones(profit: number, quota: number) {
  if (quota <= 0 || profit < quota) return 0;
  return Math.min(SURPLUS_CAP, Math.floor((profit - quota) / quota / SURPLUS_STEP + 1e-9));
}

// ---- The items ----------------------------------------------------------------------------------

export const CORE_ITEMS: ItemDef[] = [
  { id: 'engel', name: 'Engelsrolle', tier: 'klein', price: 30, duration: 'once', desc: 'Nach einer verlorenen Runde dreht die Rolle: mit 50 % Chance bekommst du den ganzen Verlust zurück.' },
  { id: 'teufel', name: 'Teufelsrolle', tier: 'klein', price: 20, duration: 'once', desc: 'Nach einer gewonnenen Runde: mit 1 zu 3 verdreifacht sich dein Reingewinn, sonst ist er weg. Im Schnitt genau fair (100 %).' },
  { id: 'wundertuete', name: 'Wundertüte', tier: 'klein', price: 25, duration: 'once', desc: 'Ein zufälliges Item. Meist etwas Kleines, manchmal etwas Großes, ganz selten die Zeitmaschine.' },
  { id: 'bonusziehung', name: 'Bonusziehung', tier: 'klein', price: 20, duration: 'day', desc: 'Heute bringt jede gewonnene Runde 1 Mondstein extra, bis zu 30.' },
  { id: 'kamera', name: 'Kamera', tier: 'klein', price: 30, duration: 'day', desc: 'Heute: Ein Foto im Fotomodus gleich nach einem Gewinn ab 10× (vor der nächsten Runde) zahlt 25 % dieses Gewinns dazu.' },
  { id: 'drink', name: 'Mondschein-Drink', tier: 'mittel', price: 40, duration: { rounds: ITEM_K.drinkRounds }, desc: '5 Runden lang zahlt jeder Gewinn 50 % mehr Reingewinn.' },
  { id: 'goldjeton', name: 'Goldjeton', tier: 'mittel', price: 50, duration: { rounds: 1 }, desc: 'Den Einsatz deiner nächsten Runde zahlt das Haus (bis 10 Mindesteinsätze). Gewinne gehören ganz dir.' },
  { id: 'dietrich', name: 'Dietrich', tier: 'mittel', price: 60, duration: 'day', desc: 'Am Spiel, an dem du ihn benutzt, heute höhere Einsätze: die kleinste Stufe fällt weg, oben kommt der doppelte Höchsteinsatz dazu.' },
  { id: 'zuversicht', name: 'Spielerzuversicht', tier: 'mittel', price: 80, duration: 'day', desc: 'Den ganzen Tag zahlt jeder Gewinn 10 % mehr Reingewinn.' },
  { id: 'versicherung', name: 'Versicherung', tier: 'gross', price: 130, duration: 'day', desc: 'Den ganzen Tag kosten Verluste 15 % weniger: 15 % jedes Verlusts kommen zurück.' },
  { id: 'verstaerker', name: 'Glücksverstärker', tier: 'gross', price: 150, duration: 'day', desc: 'Heute wirken deine anderen Wirtschafts-Items 1,5-mal so stark (Prozente, Chancen, Grenzen). Teufelsrolle, Zeitmaschine und Dietrich bleiben gleich.' },
  { id: 'statue', name: 'Heilige Motte', tier: 'gross', price: 220, duration: { rounds: ITEM_K.statueRounds }, desc: '5 Runden lang kein Verlust: was du verlierst, kommt zurück (je Runde bis 25 Mindesteinsätze).' },
  { id: 'zeitmaschine', name: 'Zeitmaschine', tier: 'legendaer', price: 350, duration: 'once', desc: 'Macht deine letzte verlorene Runde von heute ganz ungeschehen: der volle Verlust kommt zurück.' },
];
for (const def of CORE_ITEMS) registerItem(def);

export const CORE_IDS = CORE_ITEMS.map((d) => d.id);
/** Items that are used right after a round result (offered then, or from the bag). */
export const REACTION_IDS = ['engel', 'teufel', 'zeitmaschine'];

export const TIER_LABEL: Record<ItemDef['tier'], string> = { klein: 'Klein', mittel: 'Mittel', gross: 'Groß', legendaer: 'Legendär' };

// ---- Events for the UI ----------------------------------------------------------------------------

/** A reaction item can be used on the round that just ended. */
export interface Offer {
  kind: 'loss' | 'win';
  /** Round number it belongs to; a newer round ends it. */
  seq: number;
  game: string;
  /** Net loss (after other items) or the profit. */
  amount: number;
  /** Reaction items in the bag that fit. */
  ids: string[];
}

export type ItemEvent =
  | { type: 'note'; text: string }
  | { type: 'stones'; n: number; why: string }
  | { type: 'offer'; offer: Offer | null }
  | { type: 'change' };

const listeners = new Set<(e: ItemEvent) => void>();
export function onItemEvent(fn: (e: ItemEvent) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (e: ItemEvent) => listeners.forEach((l) => l(e));

// ---- Session state (not saved) ----------------------------------------------------------------

let seq = 0;
let pending: Offer | null = null;
let current: string | null = null;
let epoch = 0;
let lastSettle: { surplus: number; medal: number; rounds: number; bonus: number } | null = null;
/** The last round if it was a big win, for the Kamera. */
let bigWin: { seq: number; profit: number; paid: boolean } | null = null;
let rand: () => number = Math.random;

/** Tests swap the dice. */
export function setItemRandom(r: () => number) {
  rand = r;
}

/** The game that is open right now (null in the rooms). Dietrich and game-bound items need it. */
export function setCurrentGame(id: string | null) {
  current = id;
  emit({ type: 'change' });
}
export const currentGame = () => current;

/** Bumped when a game's bet ladder changes (Dietrich); StakeWatch rebuilds the ladder. */
export const stakeEpoch = () => epoch;

export const pendingOffer = () => pending;

/** What the last settlement paid besides the medal (for the recap). */
export const lastSettlement = () => lastSettle;

// ---- Helpers ------------------------------------------------------------------------------------

const ctr = (d: SaveData, k: string) => d.counters[k] ?? 0;
const setCtr = (d: SaveData, k: string, v: number) => (d.counters[k] = v);

/** Active entry of `id` that works in `game`. */
function activeIn(d: SaveData, id: string, game: string | null) {
  return d.active.find((a) => a.id === id && (!a.game || !game || a.game === game));
}

const ampOf = (d: SaveData) => (d.active.some((a) => a.id === 'verstaerker') ? ITEM_K.amp : 1);

/** Whole Falter with the cut fraction paid by chance, so expectations stay exact. */
function whole(x: number) {
  const w = Math.floor(x + 1e-9);
  return w + (rand() < x - w ? 1 : 0);
}

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

/** Pays from an item: a normal payout, and the day curve's last point follows. */
function pay(state: GameState, n: number) {
  if (n <= 0) return;
  state.payout(n);
  const h = state.data.history;
  if (h.length) h[h.length - 1] = state.data.balance;
}

function grantStones(state: GameState, n: number, why: string) {
  if (n <= 0) return;
  state.data.moonstones += n;
  emit({ type: 'stones', n, why });
}

// ---- Honest payout share with items ---------------------------------------------------------

export interface ItemRtp {
  /** Payout share without economy items (an odds item's exact share when one is on). */
  base: number;
  /** Payout share with everything that is on. */
  rtp: number;
  /** True when the value depends on how one plays (shown with "ca."). */
  approx: boolean;
  /** The assumption behind "ca.". */
  how: string;
  /** The game's own share without any item (for "statt X %"). */
  plain: number;
  /** Names of the items in the number. */
  items: string[];
  /** Stake up to which the capped items (Goldjeton, Heilige Motte) count fully, in Falter. */
  cap: number;
}

/**
 * The payout share of `game` right now, with every active item, or null when nothing is on.
 * `base` is the game's own share for the current setting (the last round's report), if known.
 */
export function itemRtp(state: GameState, game: string, base?: number): ItemRtp | null {
  const d = state.data;
  const ls = LOSS_SHARE[game];
  let b = base ?? ls?.rtp ?? 0.95;
  const plain = ls?.rtp ?? b;
  let approx = !ls?.exact;
  const items: string[] = [];
  // An odds item of this game sets the base (exact, from its rtp script).
  const odds = d.active.find((a) => itemDef(a.id)?.odds && (!a.game || a.game === game) && getItemRtp(game, a.id) !== undefined);
  if (odds) {
    b = getItemRtp(game, odds.id)!;
    items.push(itemDef(odds.id)!.name);
  }
  const amp = ampOf(d);
  const L = ls?.L ?? 0.5;
  let r = b;
  let econ = false;
  const unit = state.stakeUnit;
  let cap = Infinity;
  // With the Goldjeton the stake is the house's: there is no own loss to cover.
  const gold = !!activeIn(d, 'goldjeton', game);
  if (!gold && activeIn(d, 'statue', game)) {
    r += L;
    econ = true;
    items.push('Heilige Motte');
    cap = Math.min(cap, ITEM_K.statueCap * amp * unit);
  } else if (!gold && activeIn(d, 'versicherung', game)) {
    r += Math.min(1, ITEM_K.versicherung * amp) * L;
    econ = true;
    items.push('Versicherung');
  }
  const profit = (activeIn(d, 'drink', game) ? ITEM_K.drink : 0) + (activeIn(d, 'zuversicht', game) ? ITEM_K.zuversicht : 0);
  if (profit > 0) {
    r += profit * amp * (b - 1 + L);
    econ = true;
    if (activeIn(d, 'drink', game)) items.push('Mondschein-Drink');
    if (activeIn(d, 'zuversicht', game)) items.push('Spielerzuversicht');
  }
  if (gold) {
    r += 1;
    econ = true;
    items.push('Goldjeton');
    cap = Math.min(cap, ITEM_K.goldCap * amp * unit);
  }
  if (!econ && !odds) return null;
  if (econ && amp > 1) items.push('Glücksverstärker');
  // With an odds item on, L of the changed game is not in the table.
  if (econ && odds) approx = true;
  if (!econ) approx = false;
  return { base: b, plain, rtp: r, approx, how: ls?.how ?? '', items, cap: Number.isFinite(cap) ? Math.floor(cap) : 0 };
}

/** "Mit Items: ca. 103,4 %" */
export function itemRtpLabel(x: ItemRtp) {
  return `Mit Items: ${x.approx ? 'ca. ' : ''}${pct(x.rtp)} %`;
}

// ---- Buying and using ---------------------------------------------------------------------------

export function buyBagItem(state: GameState, id: string): boolean {
  const def = itemDef(id);
  const d = state.data;
  if (!def || d.moonstones < def.price) return false;
  d.moonstones -= def.price;
  d.bag[id] = bagCount(d, id) + 1;
  setCtr(d, 'it:bought', ctr(d, 'it:bought') + 1);
  state.emit();
  emit({ type: 'change' });
  return true;
}

/** Why `id` can't be used right now, or null when it can. `busy`: a round is running. */
export function useBlocked(state: GameState, id: string, busy = false): string | null {
  const d = state.data;
  const def = itemDef(id);
  if (!def) return 'Unbekanntes Item.';
  if (bagCount(d, id) <= 0) return 'Nicht mehr im Beutel.';
  if (id === 'engel') return pending?.kind === 'loss' ? null : 'Wirkt gleich nach einer verlorenen Runde.';
  if (id === 'teufel') return pending?.kind === 'win' ? null : 'Wirkt gleich nach einer gewonnenen Runde.';
  if (id === 'zeitmaschine') return ctr(d, 'it:lastLoss') > 0 ? null : 'Heute gibt es noch keine verlorene Runde, die sie ungeschehen machen könnte.';
  if (busy) return 'Warte, bis die Runde vorbei ist.';
  if (def.games?.length && (!current || !def.games.includes(current))) return `Wirkt nur an: ${def.games.map(gameLabel).join(', ')}. Öffne das Spiel und benutze es dort.`;
  if (id === 'dietrich') {
    if (!current) return 'Benutze den Dietrich an dem Spiel, an dem du höher setzen willst.';
    if (activeIn(d, 'dietrich', current)) return 'An diesem Spiel steckt heute schon ein Dietrich.';
  } else if (def.duration === 'day' && d.active.some((a) => a.id === id)) return 'Wirkt heute schon.';
  return null;
}

let gameLabel = (id: string) => id;
/** Lets the UI name games ("Roulette" instead of "roulette"). */
export function setGameLabel(fn: (id: string) => string) {
  gameLabel = fn;
}

export interface UseResult {
  ok: boolean;
  text: string;
  /** Reaction items: did the reel hit? Wundertüte: the item it held. */
  hit?: boolean;
  got?: string;
  amount?: number;
}

/**
 * Uses an item from the bag. Reaction items resolve at once; the UI may roll their reel first
 * (with the same chance, reactionChance) and pass the outcome as `hit`.
 */
export function useBagItem(state: GameState, id: string, busy = false, hit?: boolean): UseResult {
  const why = useBlocked(state, id, busy);
  if (why) return { ok: false, text: why };
  const d = state.data;
  const def = itemDef(id)!;
  d.bag[id] = bagCount(d, id) - 1;
  if (d.bag[id] <= 0) delete d.bag[id];
  setCtr(d, 'it:used', ctr(d, 'it:used') + 1);
  let res: UseResult;
  if (id === 'engel' || id === 'teufel' || id === 'zeitmaschine') res = react(state, id, hit);
  else if (id === 'wundertuete') {
    const got = mysteryPick();
    d.bag[got] = bagCount(d, got) + 1;
    res = { ok: true, got, text: `In der Wundertüte: ${itemDef(got)?.name ?? got}!` };
  } else {
    const left = def.duration === 'day' ? -1 : def.duration === 'once' ? 1 : def.duration.rounds;
    const game = id === 'dietrich' || def.games?.length ? (current ?? '') : '';
    const same = d.active.find((a) => a.id === id && a.game === game);
    if (same && left > 0 && same.left > 0) same.left += left;
    else d.active.push({ id, left, game });
    if (id === 'dietrich') epoch++;
    const n = d.active.length;
    setCtr(d, 'it:maxActive', Math.max(ctr(d, 'it:maxActive'), n));
    res = { ok: true, text: `${def.name} wirkt${left === -1 ? ' heute' : left === 1 ? ' in der nächsten Runde' : ` ${left} Runden lang`}.` };
  }
  state.emit();
  emit({ type: 'change' });
  return res;
}

/** Weighted by 1 / price: cheap items often, the Zeitmaschine rarely. */
function mysteryPick() {
  const pool = allItems().filter((x) => x.id !== 'wundertuete' && x.price > 0);
  const w = pool.map((x) => 1 / x.price);
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) return pool[i].id;
  return pool[pool.length - 1].id;
}

/** Chance shown on a reaction item's reel. */
export function reactionChance(state: GameState, id: string) {
  if (id === 'engel') return Math.min(1, ITEM_K.engel * ampOf(state.data));
  if (id === 'teufel') return ITEM_K.teufel;
  return 1;
}

function react(state: GameState, id: string, forced?: boolean): UseResult {
  const d = state.data;
  if (id === 'zeitmaschine') {
    const loss = ctr(d, 'it:lastLoss');
    setCtr(d, 'it:lastLoss', 0);
    setCtr(d, 'it:zeit', ctr(d, 'it:zeit') + 1);
    pay(state, loss);
    if (pending?.kind === 'loss') endOffer();
    return { ok: true, hit: true, amount: loss, text: `Zeitmaschine: Die Runde ist ungeschehen. +${fmt(loss)} Falter zurück.` };
  }
  const o = pending!;
  endOffer();
  if (id === 'engel') {
    const hit = forced ?? rand() < reactionChance(state, 'engel');
    if (hit) {
      pay(state, o.amount);
      setCtr(d, 'it:engelWon', ctr(d, 'it:engelWon') + 1);
      if (ctr(d, 'it:lastLoss') === o.amount) setCtr(d, 'it:lastLoss', 0);
      return { ok: true, hit, amount: o.amount, text: `Engelsrolle: Treffer! +${fmt(o.amount)} Falter zurück.` };
    }
    return { ok: true, hit, amount: 0, text: 'Engelsrolle: Diesmal kein Engel. Der Verlust bleibt.' };
  }
  // Teufelsrolle: the profit is staked once more on a 1-in-3 reel that pays 3×.
  const p = Math.min(o.amount, d.balance);
  const hit = forced ?? rand() < ITEM_K.teufel;
  if (p <= 0 || !state.placeBet(p)) return { ok: true, hit: false, amount: 0, text: 'Teufelsrolle: Der Gewinn ist schon ausgegeben.' };
  d.stats.rounds--; // a bet, but not a game round
  if (hit) {
    pay(state, p * 3);
    setCtr(d, 'it:teufelWon', ctr(d, 'it:teufelWon') + 1);
    return { ok: true, hit, amount: p * 2, text: `Teufelsrolle: Verdreifacht! +${fmt(p * 2)} Falter.` };
  }
  const h = d.history;
  if (h.length) h[h.length - 1] = d.balance;
  state.emit();
  return { ok: true, hit, amount: -p, text: `Teufelsrolle: Der Teufel nimmt den Gewinn. −${fmt(p)} Falter.` };
}

function endOffer() {
  if (!pending) return;
  pending = null;
  emit({ type: 'offer', offer: null });
}

/** The player waved the offer away. */
export function dismissOffer() {
  endOffer();
}

// ---- Wiring into the state ----------------------------------------------------------------------

const installed = new WeakSet<GameState>();

/** Hooks the items into a game state (once per state). */
export function installItems(state: GameState) {
  if (installed.has(state)) return;
  installed.add(state);

  // Dietrich: the bet ladder of its game moves up one step and gets the double top stake.
  const plain = state.stakes.bind(state);
  state.stakes = (base: readonly number[]) => {
    const r = plain(base);
    if (r.length < 3 || !current || !state.data.active.some((a) => a.id === 'dietrich' && a.game === current)) return r;
    return [...r.slice(1), roundNice(r[r.length - 1] * 2)];
  };

  state.onRound((r) => onRound(state, r));

  state.onDayStart((d) => {
    d.active = d.active.filter((a) => a.left !== -1);
    for (const k of ['it:smallStones', 'it:bonusStones', 'it:lastLoss', 'it:streak', 'it:bonusFrac', 'it:roundStones']) delete d.counters[k];
    pending = null;
    bigWin = null;
    epoch++;
    emit({ type: 'offer', offer: null });
    emit({ type: 'change' });
  });

  // Settlement: a separate reward for the money above the goal.
  state.moonstoneBonus.push((d, medal: Medal) => {
    const profit = d.balance - d.evening.startBalance;
    const s = medal === 'none' ? 0 : surplusStones(profit, d.evening.quota);
    lastSettle = { surplus: s, medal: MOONSTONES_FOR[medal], rounds: ctr(d, 'it:roundStones'), bonus: ctr(d, 'it:bonusStones') };
    setCtr(d, 'it:surplusBest', Math.max(ctr(d, 'it:surplusBest'), s));
    delete d.counters['it:roundStones'];
    return s;
  });

  // Kamera: a photo (counted when photo mode closes) right after a big win.
  let photos = state.data.counters.photo ?? 0;
  state.onChange(() => {
    const d = state.data;
    const now = d.counters.photo ?? 0;
    if (now === photos) return;
    const fresh = now > photos;
    photos = now;
    if (!fresh || !bigWin || bigWin.paid || bigWin.seq !== seq || !activeIn(d, 'kamera', null)) return;
    bigWin.paid = true;
    const bonus = whole(bigWin.profit * Math.min(1, ITEM_K.kamera * ampOf(d)));
    setCtr(d, 'it:kamera', ctr(d, 'it:kamera') + 1);
    pay(state, bonus);
    emit({ type: 'note', text: `Kamera: Das Foto vom großen Gewinn bringt +${fmt(bonus)} Falter.` });
  });
}

function onRound(state: GameState, r: RoundReport) {
  const d = state.data;
  seq++;
  if (pending) endOffer();
  if (r.stake <= 0) return;
  const game = r.game;
  const amp = ampOf(d);
  const unit = state.stakeUnit;
  const x = r.win / r.stake;
  const loss = Math.max(0, r.stake - r.win);
  const profit = Math.max(0, r.win - r.stake);
  let back = 0;
  const why: string[] = [];

  // Economy items on this round.
  const gold = !!activeIn(d, 'goldjeton', game);
  if (gold) {
    back += Math.min(r.stake, ITEM_K.goldCap * amp * unit);
    why.push('Goldjeton');
  } else if (loss > 0 && activeIn(d, 'statue', game)) {
    const cover = Math.min(loss, ITEM_K.statueCap * amp * unit);
    back += cover;
    why.push('Heilige Motte');
  } else if (loss > 0 && activeIn(d, 'versicherung', game)) {
    back += loss * Math.min(1, ITEM_K.versicherung * amp);
    why.push('Versicherung');
  }
  if (back > 0 && !gold) setCtr(d, 'it:saved', ctr(d, 'it:saved') + 1);
  const rate = (activeIn(d, 'drink', game) ? ITEM_K.drink : 0) + (activeIn(d, 'zuversicht', game) ? ITEM_K.zuversicht : 0);
  if (profit > 0 && rate > 0) {
    back += profit * rate * amp;
    why.push(activeIn(d, 'drink', game) ? 'Mondschein-Drink' : 'Spielerzuversicht');
  }
  // What the house keeps on average moves with the items (same formula as the display).
  const shown = itemRtp(state, game, r.rtp);
  if (shown) d.houseExpected = Math.max(0, d.houseExpected - r.stake * (shown.rtp - shown.base));
  const paid = whole(back);
  if (paid > 0) {
    pay(state, paid);
    emit({ type: 'note', text: `${why.join(' + ')}: +${fmt(paid)} Falter` });
  }

  // Rounds of active items are used up (game-bound ones only in their game).
  d.active = d.active.filter((a) => {
    if (a.left < 0 || (a.game && a.game !== game)) return true;
    a.left--;
    return a.left > 0;
  });

  // Mondsteine for a won round, by its multiple.
  const net = r.win + paid - r.stake;
  if (x >= 2) {
    let n = stonesForMultiple(x);
    if (x < 10) {
      const room = Math.max(0, SMALL_STONE_CAP - ctr(d, 'it:smallStones'));
      n = Math.min(n, room);
      setCtr(d, 'it:smallStones', ctr(d, 'it:smallStones') + n);
    }
    setCtr(d, 'it:roundStones', ctr(d, 'it:roundStones') + n);
    grantStones(state, n, `${x >= 100 ? Math.round(x) : x.toFixed(1).replace('.', ',').replace(',0', '')}× Gewinn`);
  }
  if (r.win > r.stake && activeIn(d, 'bonusziehung', null)) {
    // ×1.5 with the Verstärker: the half stones add up.
    const frac = ctr(d, 'it:bonusFrac') + amp;
    const n = Math.min(Math.floor(frac), Math.max(0, Math.floor(ITEM_K.bonusCap * amp) - ctr(d, 'it:bonusStones')));
    setCtr(d, 'it:bonusFrac', frac - Math.floor(frac));
    if (n > 0) {
      setCtr(d, 'it:bonusStones', ctr(d, 'it:bonusStones') + n);
      grantStones(state, n, 'Bonusziehung');
    }
  }

  // Counters for the item achievements.
  if (x >= 100) setCtr(d, 'win100', ctr(d, 'win100') + 1);
  const streak = x >= 2 ? ctr(d, 'it:streak') + 1 : 0;
  setCtr(d, 'it:streak', streak);
  setCtr(d, 'it:streakBest', Math.max(ctr(d, 'it:streakBest'), streak));
  bigWin = x >= ITEM_K.kameraMult ? { seq, profit, paid: false } : null;

  // Reaction items: offered right after the result.
  if (net < 0) setCtr(d, 'it:lastLoss', -net);
  const ids = net < 0 ? ['engel', 'zeitmaschine'] : net > 0 && profit > 0 ? ['teufel'] : [];
  const have = ids.filter((id) => bagCount(d, id) > 0);
  if (have.length) {
    pending = { kind: net < 0 ? 'loss' : 'win', seq, game, amount: net < 0 ? -net : profit, ids: have };
    emit({ type: 'offer', offer: pending });
  } else if (ids.length) pending = { kind: net < 0 ? 'loss' : 'win', seq, game, amount: net < 0 ? -net : profit, ids: [] };
  emit({ type: 'change' });
}

/** Debug: one of every item into the bag. */
export function debugFillBag(state: GameState) {
  for (const def of allItems()) state.data.bag[def.id] = bagCount(state.data, def.id) + 1;
  state.emit();
  emit({ type: 'change' });
}

/** Debug: ends every active item. */
export function debugClearActive(state: GameState) {
  state.data.active = [];
  epoch++;
  state.emit();
  emit({ type: 'change' });
}

/** Active items with their names, for the UI. */
export function activeList(state: GameState) {
  return activeItems(state.data)
    .map((a) => ({ ...a, def: itemDef(a.id) }))
    .filter((a): a is typeof a & { def: ItemDef } => !!a.def);
}

export const fmtPct = pct;

// ---- Achievements around items and big wins ----------------------------------------------------

const c = (d: SaveData, k: string) => d.counters[k] ?? 0;
ACHIEVEMENTS.push(
  { id: 'itFirst', name: 'Erster Griff', desc: 'Kauf dein erstes Item bei den Glücksgriffen.', icon: 'bag', reward: 3, progress: (d) => [c(d, 'it:bought'), 1] },
  { id: 'itTen', name: 'Sammelleidenschaft', desc: 'Kauf 10 Items.', icon: 'bag', reward: 8, progress: (d) => [c(d, 'it:bought'), 10] },
  { id: 'itEngel', name: 'Schutzengel', desc: 'Hol dir einen Verlust mit der Engelsrolle zurück.', icon: 'heart', reward: 5, progress: (d) => [c(d, 'it:engelWon'), 1] },
  { id: 'itTeufel', name: 'Teufelskerl', desc: 'Gewinn eine Teufelsrolle.', icon: 'star', reward: 6, progress: (d) => [c(d, 'it:teufelWon'), 1] },
  { id: 'itZeit', name: 'Zeitreisender', desc: 'Mach eine Runde mit der Zeitmaschine ungeschehen.', icon: 'moth', reward: 10, progress: (d) => [c(d, 'it:zeit'), 1] },
  { id: 'itSaved', name: 'Gut versichert', desc: 'Lass dir 25 Verluste von Items abfedern.', icon: 'heart', reward: 6, progress: (d) => [c(d, 'it:saved'), 25] },
  { id: 'itStack', name: 'Volle Ausrüstung', desc: 'Hab 3 Items gleichzeitig aktiv.', icon: 'star', reward: 5, progress: (d) => [Math.min(3, c(d, 'it:maxActive')), 3] },
  { id: 'itKamera', name: 'Paparazzo', desc: 'Kassier den Kamera-Bonus für ein Foto nach einem großen Gewinn.', icon: 'camera', reward: 5, progress: (d) => [c(d, 'it:kamera'), 1] },
  { id: 'win100', name: 'Hundertfach', desc: 'Gewinn in einer Runde das 100-Fache deines Einsatzes.', icon: 'coin', reward: 15, progress: (d) => [c(d, 'win100'), 1] },
  { id: 'win10x10', name: 'Dauerbrenner', desc: 'Gewinn 10-mal mindestens das 10-Fache deines Einsatzes.', icon: 'coin', reward: 10, progress: (d) => [Math.min(10, c(d, 'win10')), 10] },
  { id: 'streak5', name: 'Glückssträhne', desc: 'Gewinn 5 Runden hintereinander mindestens das Doppelte.', icon: 'star', reward: 6, progress: (d) => [Math.min(5, c(d, 'it:streakBest')), 5] },
  { id: 'surplus', name: 'Überflieger', desc: 'Hol bei einer Abrechnung die vollen 20 Überschuss-Mondsteine.', icon: 'medal', reward: 10, progress: (d) => [c(d, 'it:surplusBest'), SURPLUS_CAP] },
);

/** The recap's breakdown of the day's Mondsteine: "Medaille 3 + Überschuss 10 · aus Runden schon 24". */
export function settlementNote(total: number): string | null {
  const s = lastSettle;
  if (!s) return null;
  const parts: string[] = [];
  if (s.medal) parts.push(`Medaille ${s.medal}`);
  if (s.surplus) parts.push(`Überschuss ${s.surplus}`);
  const other = total - s.medal - s.surplus;
  if (other > 0 && parts.length) parts.push(`Boni ${other}`);
  let line = parts.length > 1 || s.surplus ? parts.join(' + ') : '';
  const rounds = s.rounds + s.bonus;
  if (rounds) line += `${line ? ' · ' : ''}aus Runden heute schon ${rounds}`;
  return line || null;
}
