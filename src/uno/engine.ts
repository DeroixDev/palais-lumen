// Unser Uno Spiel: the rules. Pure game state plus actions; no DOM, no timers, no network.
// The host (solo: this browser; online: the host's browser) owns one Match and is the only
// place that changes it. Everybody else only ever sees a redacted View (see view.ts).

export type Color = 'r' | 'y' | 'g' | 'b';
export type Kind = 'num' | 'skip' | 'rev' | 'd2' | 'wild' | 'd4';
export const COLORS: readonly Color[] = ['r', 'y', 'g', 'b'];
export const COLOR_NAME: Record<Color, string> = { r: 'Rot', y: 'Gelb', g: 'Grün', b: 'Blau' };

export interface Card {
  /** 0..107, unique within one deck. */
  id: number;
  /** 'w' for Farbwahl and +4. */
  c: Color | 'w';
  k: Kind;
  /** Face value for number cards. */
  n?: number;
}

export interface Rules {
  /** Points to win the match. */
  target: number;
  /** Stapeln: +2 on +2, +4 on +4. */
  stack: boolean;
  /** Ziehen bis passt: draw until a card can be played. */
  drawUntil: boolean;
  /** 7-0: a 7 swaps hands with someone, a 0 passes all hands on. */
  sevenZero: boolean;
  /** Reinwerfen: an identical card may be thrown in out of turn. */
  jumpIn: boolean;
  /** Custom-Modus: the settings below apply only while this is on. */
  custom: boolean;
  /** Cards each player gets at the start of a round (custom). */
  hand: number;
  /** More strong cards in the deck (custom): 0 normal, 1 more, 2 chaos. */
  power: number;
  /** Penalty cards doubled (+2 gives 4, +4 gives 8, forgotten UNO gives 4) (custom). */
  double: boolean;
  /** Seconds before playable cards light up (-1 never). A table setting, not part of the match. */
  hint: number;
}

export const DEFAULT_RULES: Rules = { target: 500, stack: false, drawUntil: false, sevenZero: false, jumpIn: false, custom: false, hand: 7, power: 0, double: false, hint: 5 };
export const HAND_SIZES = [3, 5, 7, 10, 15] as const;
export const POWER_NAMES = ['Normal', 'Mehr', 'Chaos'] as const;
export const HINT_DELAYS = [0, 5, 10, -1] as const;

/** Start cards, strong-card level and penalty factor in effect (the custom ones only in custom mode). */
export const handSize = (r: Rules) => (r.custom ? Math.max(1, Math.min(20, r.hand | 0)) : 7);
export const powerLevel = (r: Rules) => (r.custom ? Math.max(0, Math.min(2, r.power | 0)) : 0);
/** Seconds before hints show; 5 unless custom mode sets it. */
export const hintDelay = (r: Rules) => (r.custom ? r.hint : 5);
export const penaltyX = (r: Rules) => (r.custom && r.double ? 2 : 1);
export const TARGETS = [200, 300, 500, 1000] as const;

export interface Player {
  id: string;
  name: string;
  /** Index into PLAYER_COLORS. */
  color: number;
  hand: Card[];
  score: number;
  bot: boolean;
  /** Said "UNO!" for the hand they are about to have (cleared when the hand grows again). */
  said: boolean;
}

export type Phase = 'play' | 'drawn' | 'roundEnd' | 'matchEnd';

export type GameEvent =
  | { k: 'deal'; round: number; dealer: number }
  | { k: 'flip'; card: Card }
  | { k: 'play'; p: number; card: Card; jump?: boolean; color?: Color }
  | { k: 'draw'; p: number; n: number; cards: Card[]; penalty?: boolean }
  | { k: 'pass'; p: number }
  | { k: 'skip'; p: number }
  | { k: 'rev'; dir: 1 | -1 }
  | { k: 'uno'; p: number }
  | { k: 'caught'; p: number; by: number }
  | { k: 'swap'; a: number; b: number }
  | { k: 'rotate'; dir: 1 | -1 }
  | { k: 'reshuffle' }
  | { k: 'round'; winner: number; points: number; hands: number[] }
  | { k: 'match'; winner: number };

export interface RoundResult {
  winner: number;
  points: number;
  /** Points left in each player's hand. */
  hands: number[];
  final: boolean;
}

export interface Match {
  rules: Rules;
  players: Player[];
  round: number;
  dealer: number;
  turn: number;
  dir: 1 | -1;
  drawPile: Card[];
  discard: Card[];
  /** The colour to follow; null right after a Farbwahl was flipped at the start (anything goes). */
  color: Color | null;
  /** Stacked cards to draw (with Stapeln; without it the penalty is applied at once). */
  pending: number;
  phase: Phase;
  /** The card just drawn, the only one that may now be played (phase 'drawn'). */
  drawnId: number | null;
  /** Player who went down to one card without saying UNO, catchable until the next move. */
  open: number | null;
  result: RoundResult | null;
  seed: number;
  /** Event log; seq of events[i] is base + i. */
  events: GameEvent[];
  base: number;
}

export type Action =
  | { t: 'play'; id: number; color?: Color; target?: number }
  | { t: 'draw' }
  | { t: 'pass' }
  | { t: 'uno' }
  | { t: 'catch'; target: number }
  | { t: 'next' };

// ---------------- deck ----------------

/** The 108-card deck; `power` adds strong cards (1: +1 of each action card per colour and +2 of each wild, 2: twice that). */
export function buildDeck(power = 0): Card[] {
  const d: Card[] = [];
  let id = 0;
  for (const c of COLORS) {
    d.push({ id: id++, c, k: 'num', n: 0 });
    for (let n = 1; n <= 9; n++) for (let i = 0; i < 2; i++) d.push({ id: id++, c, k: 'num', n });
    for (const k of ['skip', 'rev', 'd2'] as const) for (let i = 0; i < 2 + power; i++) d.push({ id: id++, c, k });
  }
  for (let i = 0; i < 4 + power * 2; i++) d.push({ id: id++, c: 'w', k: 'wild' });
  for (let i = 0; i < 4 + power * 2; i++) d.push({ id: id++, c: 'w', k: 'd4' });
  return d;
}

export const cardPoints = (c: Card) => (c.k === 'num' ? c.n! : c.k === 'wild' || c.k === 'd4' ? 50 : 20);
export const handPoints = (h: Card[]) => h.reduce((s, c) => s + cardPoints(c), 0);

export function cardName(c: Card) {
  const col = c.c === 'w' ? '' : COLOR_NAME[c.c] + ' ';
  switch (c.k) {
    case 'num': return `${col}${c.n}`;
    case 'skip': return `${col}Aussetzen`;
    case 'rev': return `${col}Richtungswechsel`;
    case 'd2': return `${col}+2`;
    case 'wild': return 'Farbwahl';
    case 'd4': return '+4 Farbwahl';
  }
}

function rand(m: Match) {
  // mulberry32 on the match seed: a host can replay a round, and tests are deterministic
  m.seed = (m.seed + 0x6d2b79f5) >>> 0;
  let t = m.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(m: Match, a: Card[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(m) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const emit = (m: Match, e: GameEvent) => m.events.push(e);
export const lastSeq = (m: Match) => m.base + m.events.length;

/** Drops old events (the host keeps a few hundred for late views). */
export function trimEvents(m: Match, keep = 300) {
  if (m.events.length > keep * 2) {
    const cut = m.events.length - keep;
    m.events.splice(0, cut);
    m.base += cut;
  }
}

// ---------------- setup ----------------

export interface Seat { id: string; name: string; color: number; bot: boolean }

export function newMatch(seats: Seat[], rules: Rules, seed = (Math.random() * 2 ** 32) >>> 0): Match {
  if (seats.length < 2 || seats.length > 4) throw new Error('2 bis 4 Spieler');
  const m: Match = {
    rules: { ...rules },
    players: seats.map((s) => ({ ...s, hand: [], score: 0, said: false })),
    round: 0,
    dealer: 0,
    turn: 0,
    dir: 1,
    drawPile: [],
    discard: [],
    color: null,
    pending: 0,
    phase: 'roundEnd',
    drawnId: null,
    open: null,
    result: null,
    seed: seed >>> 0,
    events: [],
    base: 0,
  };
  m.dealer = Math.floor(rand(m) * seats.length);
  startRound(m);
  return m;
}

const next = (m: Match, from: number, steps = 1) => {
  const n = m.players.length;
  return (((from + m.dir * steps) % n) + n) % n;
};

export function startRound(m: Match) {
  m.round++;
  if (m.round > 1) m.dealer = (m.dealer + 1) % m.players.length;
  m.dir = 1;
  m.pending = 0;
  m.drawnId = null;
  m.open = null;
  m.result = null;
  m.discard = [];
  m.drawPile = shuffle(m, buildDeck(powerLevel(m.rules)));
  for (const p of m.players) { p.hand = []; p.said = false; }
  const deal = Math.min(handSize(m.rules), Math.floor((m.drawPile.length - 10) / m.players.length));
  for (let i = 0; i < deal; i++) for (const p of m.players) p.hand.push(m.drawPile.pop()!);
  emit(m, { k: 'deal', round: m.round, dealer: m.dealer });
  // A +4 can't start the round: back into the deck, shuffle, flip again.
  let top = m.drawPile.pop()!;
  while (top.k === 'd4') {
    m.drawPile.unshift(top);
    shuffle(m, m.drawPile);
    top = m.drawPile.pop()!;
  }
  m.discard.push(top);
  m.color = top.c === 'w' ? null : top.c;
  m.phase = 'play';
  m.turn = next(m, m.dealer);
  emit(m, { k: 'flip', card: top });
  // The first card acts as if the dealer had played it.
  if (top.k === 'skip') {
    emit(m, { k: 'skip', p: m.turn });
    m.turn = next(m, m.turn);
  } else if (top.k === 'rev') {
    m.dir = -1;
    emit(m, { k: 'rev', dir: -1 });
    m.turn = m.players.length === 2 ? next(m, m.dealer, 2) : next(m, m.dealer);
  } else if (top.k === 'd2') {
    giveCards(m, m.turn, 2 * penaltyX(m.rules), true);
    emit(m, { k: 'skip', p: m.turn });
    m.turn = next(m, m.turn);
  }
}

// ---------------- queries ----------------

export const top = (m: Match) => m.discard[m.discard.length - 1];

/** Whether `c` may go on the pile right now for the player on turn. */
export function canPlay(m: Match, c: Card, _hand: Card[]): boolean {
  const t = top(m);
  if (m.pending > 0) {
    // only with Stapeln: same kind of draw card
    return m.rules.stack && c.k === t.k && (c.k === 'd2' || c.k === 'd4');
  }
  if (c.k === 'wild') return true;
  // +4 goes on any colour, like Farbwahl (Alex 2026-10-16; the official bluff/challenge is not played)
  if (c.k === 'd4') return true;
  if (m.color === null) return true;
  if (c.c === m.color) return true;
  if (c.k === 'num') return t.k === 'num' && t.n === c.n;
  return c.k === t.k;
}

export function playable(m: Match, p: number): Card[] {
  if (m.phase === 'drawn') {
    const c = m.players[p].hand.find((h) => h.id === m.drawnId);
    return c && p === m.turn && canPlay(m, c, m.players[p].hand) ? [c] : [];
  }
  if (m.phase !== 'play' || p !== m.turn) return [];
  const h = m.players[p].hand;
  return h.filter((c) => canPlay(m, c, h));
}

/** Reinwerfen: an identical card (same colour and face, no wilds) may be thrown in by anybody. */
export function canJump(m: Match, p: number, c: Card) {
  if (!m.rules.jumpIn || m.pending > 0 || (m.phase !== 'play' && m.phase !== 'drawn')) return false;
  if (p === m.turn) return false;
  const t = top(m);
  if (c.c === 'w' || t.c === 'w') return false;
  return c.c === t.c && c.k === t.k && (c.k !== 'num' || c.n === t.n);
}

/** UNO can be said by the player on turn with two cards and a playable one, or by an open player. */
export function canSayUno(m: Match, p: number) {
  const pl = m.players[p];
  if (m.phase !== 'play' && m.phase !== 'drawn') return false;
  if (m.open === p) return true;
  if (pl.said) return false;
  if (pl.hand.length === 2 && p === m.turn) return true;
  return pl.hand.length === 2 && m.rules.jumpIn;
}

// ---------------- actions ----------------

function reshuffle(m: Match) {
  if (m.discard.length <= 1) return false;
  const t = m.discard.pop()!;
  m.drawPile = shuffle(m, m.discard);
  m.discard = [t];
  emit(m, { k: 'reshuffle' });
  return true;
}

function drawOne(m: Match): Card | null {
  if (!m.drawPile.length && !reshuffle(m)) return null;
  return m.drawPile.pop() ?? null;
}

function giveCards(m: Match, p: number, n: number, penalty = false) {
  const got: Card[] = [];
  for (let i = 0; i < n; i++) {
    const c = drawOne(m);
    if (!c) break;
    got.push(c);
  }
  m.players[p].hand.push(...got);
  if (m.players[p].hand.length > 1) m.players[p].said = false;
  emit(m, { k: 'draw', p, n: got.length, cards: got, penalty });
  return got;
}

/** Ends the turn of `p`, moving on by `steps` players. */
function advance(m: Match, steps = 1) {
  m.turn = next(m, m.turn, steps);
  m.phase = 'play';
  m.drawnId = null;
}

function endRound(m: Match, winner: number) {
  const hands = m.players.map((p) => handPoints(p.hand));
  const points = hands.reduce((s, v) => s + v, 0);
  m.players[winner].score += points;
  const final = m.players[winner].score >= m.rules.target;
  m.result = { winner, points, hands, final };
  m.phase = final ? 'matchEnd' : 'roundEnd';
  m.open = null;
  emit(m, { k: 'round', winner, points, hands });
  if (final) emit(m, { k: 'match', winner });
}

export type ActResult = { ok: true } | { ok: false; why: string };
const no = (why: string): ActResult => ({ ok: false, why });
const OK: ActResult = { ok: true };

/** Applies one action by player `p`. Invalid actions change nothing. */
export function act(m: Match, p: number, a: Action): ActResult {
  if (!m.players[p]) return no('Kein Platz');
  switch (a.t) {
    case 'next': {
      if (m.phase !== 'roundEnd') return no('Runde läuft');
      startRound(m);
      return OK;
    }
    case 'uno': {
      if (!canSayUno(m, p)) return no('Jetzt nicht');
      m.players[p].said = true;
      if (m.open === p) m.open = null;
      emit(m, { k: 'uno', p });
      return OK;
    }
    case 'catch': {
      if (m.phase !== 'play' && m.phase !== 'drawn') return no('Jetzt nicht');
      if (m.open === null || m.open !== a.target || a.target === p) return no('Niemand zu erwischen');
      const t = a.target;
      m.open = null;
      emit(m, { k: 'caught', p: t, by: p });
      giveCards(m, t, 2 * penaltyX(m.rules), true);
      return OK;
    }
    case 'draw': {
      if (m.phase !== 'play' || p !== m.turn) return no('Nicht dran');
      m.open = null;
      if (m.pending > 0) {
        const n = m.pending;
        m.pending = 0;
        giveCards(m, p, n, true);
        advance(m);
        return OK;
      }
      const hand = m.players[p].hand;
      let last: Card | null = null;
      const drawn: Card[] = [];
      for (;;) {
        const c = drawOne(m);
        if (!c) break;
        drawn.push(c);
        hand.push(c);
        last = c;
        if (!m.rules.drawUntil || canPlay(m, c, hand)) break;
      }
      if (hand.length > 1) m.players[p].said = false;
      emit(m, { k: 'draw', p, n: drawn.length, cards: drawn });
      if (last && canPlay(m, last, hand)) {
        m.phase = 'drawn';
        m.drawnId = last.id;
      } else {
        emit(m, { k: 'pass', p });
        advance(m);
      }
      return OK;
    }
    case 'pass': {
      if (m.phase !== 'drawn' || p !== m.turn) return no('Jetzt nicht');
      emit(m, { k: 'pass', p });
      advance(m);
      return OK;
    }
    case 'play':
      return play(m, p, a);
  }
}

function play(m: Match, p: number, a: Extract<Action, { t: 'play' }>): ActResult {
  if (m.phase !== 'play' && m.phase !== 'drawn') return no('Jetzt nicht');
  const pl = m.players[p];
  const idx = pl.hand.findIndex((c) => c.id === a.id);
  if (idx < 0) return no('Karte nicht auf der Hand');
  const card = pl.hand[idx];
  let jump = false;
  if (p !== m.turn) {
    if (!canJump(m, p, card)) return no('Nicht dran');
    jump = true;
  } else if (m.phase === 'drawn') {
    if (card.id !== m.drawnId) return no('Nur die gezogene Karte');
    if (!canPlay(m, card, pl.hand)) return no('Passt nicht');
  } else if (!canPlay(m, card, pl.hand)) {
    return no('Passt nicht');
  }
  if (card.c === 'w' && (!a.color || !COLORS.includes(a.color))) return no('Farbe fehlt');
  const others = m.players.map((_, i) => i).filter((i) => i !== p);
  const sevenSwap = m.rules.sevenZero && card.k === 'num' && card.n === 7 && pl.hand.length > 1;
  if (sevenSwap && (a.target === undefined || !others.includes(a.target))) return no('Mit wem tauschen?');

  // Whoever was open and didn't get caught is safe now that the game moved on.
  if (m.open !== null && m.open !== p) m.open = null;
  pl.hand.splice(idx, 1);
  m.discard.push(card);
  m.drawnId = null;
  if (jump) m.turn = p;
  m.color = card.c === 'w' ? a.color! : card.c;
  emit(m, { k: 'play', p, card, jump: jump || undefined, color: card.c === 'w' ? a.color : undefined });

  // UNO: down to one card without having said it → open to be caught.
  if (pl.hand.length === 1 && !pl.said) m.open = p;
  if (pl.hand.length === 0) {
    // A last +2/+4 still hits the next player (their cards count for the winner).
    if (card.k === 'd2' || card.k === 'd4') {
      const victim = next(m, p);
      giveCards(m, victim, m.pending + (card.k === 'd2' ? 2 : 4) * penaltyX(m.rules), true);
      m.pending = 0;
    }
    endRound(m, p);
    return OK;
  }

  const n = m.players.length;
  switch (card.k) {
    case 'skip':
      emit(m, { k: 'skip', p: next(m, p) });
      advance(m, 2);
      break;
    case 'rev':
      m.dir = m.dir === 1 ? -1 : 1;
      emit(m, { k: 'rev', dir: m.dir });
      if (n === 2) {
        emit(m, { k: 'skip', p: next(m, p) });
        advance(m, 2);
      } else advance(m);
      break;
    case 'd2':
    case 'd4': {
      const add = (card.k === 'd2' ? 2 : 4) * penaltyX(m.rules);
      if (m.rules.stack) {
        m.pending += add;
        advance(m);
      } else {
        const victim = next(m, p);
        giveCards(m, victim, add, true);
        emit(m, { k: 'skip', p: victim });
        advance(m, 2);
      }
      break;
    }
    case 'num':
      if (m.rules.sevenZero && card.n === 7 && a.target !== undefined) {
        const o = m.players[a.target];
        [pl.hand, o.hand] = [o.hand, pl.hand];
        pl.said = false;
        o.said = false;
        if (m.open === p) m.open = null;
        emit(m, { k: 'swap', a: p, b: a.target });
      } else if (m.rules.sevenZero && card.n === 0) {
        const hands = m.players.map((x) => x.hand);
        // everyone passes their hand on in the direction of play
        m.players.forEach((x, i) => {
          x.hand = hands[(((i - m.dir) % n) + n) % n];
          x.said = false;
        });
        if (m.open === p) m.open = null;
        emit(m, { k: 'rotate', dir: m.dir });
      }
      advance(m);
      break;
    default:
      advance(m);
  }
  return OK;
}

/** Sanity check used by tests and the dev hook: every one of the 108 cards is exactly somewhere. */
export function cardCount(m: Match) {
  const ids = new Set<number>();
  let total = 0;
  const add = (cs: Card[]) => { for (const c of cs) { ids.add(c.id); total++; } };
  add(m.drawPile);
  add(m.discard);
  for (const p of m.players) add(p.hand);
  return { total, unique: ids.size };
}
