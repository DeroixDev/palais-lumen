// The bots: they hold on to colours they are strong in, save their +4 for when it hurts,
// throw action cards at whoever is about to go out, and catch a forgotten UNO.

import { COLORS, canJump, playable, type Action, type Card, type Color, type Match } from './engine';

function colorCounts(hand: Card[], without?: number) {
  const n: Record<Color, number> = { r: 0, y: 0, g: 0, b: 0 };
  for (const c of hand) if (c.c !== 'w' && c.id !== without) n[c.c]++;
  return n;
}

/** The colour a bot (or the auto-pick) calls after a Farbwahl: its strongest one. */
export function bestColor(hand: Card[], without?: number, rnd = Math.random): Color {
  const n = colorCounts(hand, without);
  // weight action cards a little: they're worth keeping playable
  for (const c of hand) if (c.c !== 'w' && c.id !== without && c.k !== 'num') n[c.c] += 0.5;
  let best: Color[] = [];
  let max = -1;
  for (const c of COLORS) {
    if (n[c] > max) { max = n[c]; best = [c]; } else if (n[c] === max) best.push(c);
  }
  return best[Math.floor(rnd() * best.length)];
}

const nextOf = (m: Match, p: number, steps = 1) => {
  const n = m.players.length;
  return (((p + m.dir * steps) % n) + n) % n;
};

function swapTarget(m: Match, p: number) {
  let best = -1;
  for (let i = 0; i < m.players.length; i++) {
    if (i === p) continue;
    if (best < 0 || m.players[i].hand.length < m.players[best].hand.length) best = i;
  }
  return best;
}

function score(m: Match, p: number, c: Card, hand: Card[]) {
  const counts = colorCounts(hand, c.id);
  const nextP = m.players[nextOf(m, p)];
  const threat = nextP.hand.length <= 2;
  const minOther = Math.min(...m.players.filter((_, i) => i !== p).map((x) => x.hand.length));
  const small = hand.length <= 3;
  let s = 0;
  switch (c.k) {
    case 'num':
      s = 10 + c.n! * 0.6; // dump high numbers first
      if (m.rules.sevenZero && c.n === 7) {
        const t = swapTarget(m, p);
        s += m.players[t].hand.length < hand.length - 1 ? 30 : -12;
      }
      if (m.rules.sevenZero && c.n === 0) {
        // hands move along: good if the one passing to me has fewer cards
        const from = m.players[nextOf(m, p, -1)];
        s += from.hand.length < hand.length - 1 ? 18 : -6;
      }
      break;
    case 'skip':
    case 'rev':
      s = 13 + (threat ? 22 : 0);
      if (c.k === 'rev' && m.players.length > 2) {
        const prev = m.players[nextOf(m, p, -1)];
        if (prev.hand.length <= 2 && !threat) s -= 10; // don't hand the turn to someone about to win
      }
      break;
    case 'd2':
      s = 14 + (threat ? 30 : 0);
      break;
    case 'wild':
      s = small ? -6 : 3;
      if (minOther <= 2) s += 6;
      break;
    case 'd4':
      // saved for when it hurts, or as a way out
      s = threat ? 40 : minOther <= 2 ? 14 : -20;
      break;
  }
  if (c.c !== 'w') {
    // keep colours: prefer cards whose colour we hold more of (we stay in control)
    s += counts[c.c] * 3;
    if (m.color && c.c === m.color) s += 2;
  }
  return s;
}

function playAction(m: Match, p: number, c: Card, rnd: () => number): Action {
  const hand = m.players[p].hand;
  const a: Action = { t: 'play', id: c.id };
  if (c.c === 'w') a.color = bestColor(hand, c.id, rnd);
  if (m.rules.sevenZero && c.k === 'num' && c.n === 7 && hand.length > 1) a.target = swapTarget(m, p);
  return a;
}

/** The bot's move when it's on turn. Returns 'uno' first when about to go down to one card. */
export function botMove(m: Match, p: number, rnd = Math.random): Action {
  const pl = m.players[p];
  const opts = playable(m, p);
  if (m.phase === 'drawn') {
    const c = opts[0];
    if (!c) return { t: 'pass' };
    const minOther = Math.min(...m.players.filter((_, i) => i !== p).map((x) => x.hand.length));
    if (c.k === 'd4' && minOther > 3 && pl.hand.length > 3) return { t: 'pass' };
    if (pl.hand.length === 2 && !pl.said && rnd() < 0.9) return { t: 'uno' };
    return playAction(m, p, c, rnd);
  }
  if (!opts.length) return { t: 'draw' };
  let best = opts[0];
  let bs = -Infinity;
  for (const c of opts) {
    const s = score(m, p, c, pl.hand) + rnd() * 2;
    if (s > bs) { bs = s; best = c; }
  }
  // a +4 with nothing at stake: drawing is fine early in the round
  if (best.k === 'd4' && bs < -5 && pl.hand.length > 4 && m.pending === 0) return { t: 'draw' };
  // say it before the second-to-last card goes down (now and then a bot forgets)
  if (pl.hand.length === 2 && !pl.said && rnd() < 0.9) return { t: 'uno' };
  return playAction(m, p, best, rnd);
}

/** A card the bot could throw in out of turn (Reinwerfen), or null. */
export function botJump(m: Match, p: number): Action | null {
  const pl = m.players[p];
  if (pl.hand.length <= 1) return null;
  const c = pl.hand.find((h) => canJump(m, p, h));
  return c ? { t: 'play', id: c.id } : null;
}
