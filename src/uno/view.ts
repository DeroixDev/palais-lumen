// What one seat gets to see of the match: its own hand, only counts of everyone else's, and the
// event log with other people's drawn cards blanked. The host sends exactly this over the wire,
// so a friend's browser never holds anybody else's cards.

import { canJump, canSayUno, playable, type Card, type Color, type GameEvent, type Match, type Phase, type RoundResult, type Rules } from './engine';

export interface SeatView {
  id: string;
  name: string;
  color: number;
  count: number;
  score: number;
  bot: boolean;
  /** Seat is played by a bot because its person left (online). */
  away: boolean;
  said: boolean;
}

export interface View {
  me: number;
  hand: Card[];
  seats: SeatView[];
  /** Last few cards of the discard pile, top last. */
  pile: Card[];
  drawCount: number;
  color: Color | null;
  dir: 1 | -1;
  turn: number;
  phase: Phase;
  pending: number;
  /** Ids in my hand I may play now (on turn, or as a jump-in). */
  can: number[];
  drawnId: number | null;
  open: number | null;
  canUno: boolean;
  rules: Rules;
  round: number;
  dealer: number;
  result: RoundResult | null;
  /** Events since `from` (seq numbers from+1 .. seq). */
  from: number;
  seq: number;
  events: GameEvent[];
}

export function redact(e: GameEvent, me: number): GameEvent {
  if (e.k === 'draw' && e.p !== me) return { ...e, cards: [] };
  return e;
}

export function makeView(m: Match, me: number, since: number, away: (i: number) => boolean = () => false): View {
  const p = m.players[me];
  const seq = m.base + m.events.length;
  const from = Math.max(since, m.base);
  const events = m.events.slice(from - m.base).map((e) => redact(e, me));
  const can = new Set(playable(m, me).map((c) => c.id));
  if (m.rules.jumpIn) for (const c of p.hand) if (canJump(m, me, c)) can.add(c.id);
  return {
    me,
    hand: p.hand.map((c) => ({ ...c })),
    seats: m.players.map((x, i) => ({ id: x.id, name: x.name, color: x.color, count: x.hand.length, score: x.score, bot: x.bot, away: away(i), said: x.said })),
    pile: m.discard.slice(-5).map((c) => ({ ...c })),
    drawCount: m.drawPile.length,
    color: m.color,
    dir: m.dir,
    turn: m.turn,
    phase: m.phase,
    pending: m.pending,
    can: [...can],
    drawnId: m.turn === me ? m.drawnId : null,
    open: m.open,
    canUno: canSayUno(m, me),
    rules: { ...m.rules },
    round: m.round,
    dealer: m.dealer,
    result: m.result ? { ...m.result, hands: [...m.result.hands] } : null,
    from,
    seq,
    events,
  };
}
