// Bot decisions on the board: route to the star when they can afford it, sensible shopping,
// items when they help (aim with the Halbwürfel or the Joker, Doppelwürfel for long ways).
// Level: leicht picks more at random, stark plans a bit further.

import { getBoard } from '../boards';
import { forwardDist } from '../boards/graph';
import type { BotLevel } from '../types';
import { ranking, type Answer, type Ask, type GameState } from './state';
import { ITEMS, STAR_PRICE, type ItemId } from './tables';

const PREF: ItemId[] = ['dw', 'joker', 'tw', 'kompass', 'sh', 'hw', 'mag', 'key', 'pfeife', 'tausch', 'fahne', 'tuete'];

export function botAnswer(st: GameState, p: number, a: Ask, level: BotLevel): Answer {
  const g = getBoard(st.rules.board).graph;
  const P = st.players[p];
  const rnd = Math.random;
  const sloppy = level === 'leicht' ? 0.45 : level === 'normal' ? 0.15 : 0.03;
  const price = st.finaleRule === 'cheapStar' ? 15 : STAR_PRICE;
  const dStar = forwardDist(g, P.node, st.star);
  switch (a.q) {
    case 'roll': {
      const has = (i: ItemId) => a.items.includes(i);
      if (rnd() < sloppy) return { use: null };
      const rich = P.coins >= price;
      if (has('tuete')) return { use: 'tuete' };
      if (rich && dStar <= 3 && has('hw')) return { use: 'hw' };
      if (rich && dStar <= 6 && has('joker')) return { use: 'joker' };
      if (rich && dStar >= 7 && dStar <= 12 && has('dw')) return { use: 'dw' };
      if (rich && dStar >= 10 && has('tw')) return { use: 'tw' };
      if (has('kompass') && dStar > 12) return { use: 'kompass' };
      if (has('pfeife')) return { use: 'pfeife' };
      if (has('tausch')) {
        const near = st.players.findIndex((q, i) => i !== p && forwardDist(g, q.node, st.star) <= 3);
        if (near >= 0 && dStar > 8 && rich) return { use: 'tausch' };
      }
      if (has('mag') && st.players.some((q, i) => i !== p && forwardDist(g, P.node, q.node) <= 8)) return { use: 'mag' };
      if (has('fahne') && rnd() < 0.4) return { use: 'fahne' };
      if (has('dw') && rnd() < 0.3) return { use: 'dw' };
      return { use: null };
    }
    case 'joker':
      return { n: dStar >= 1 && dStar <= 6 ? dStar : 6 };
    case 'target': {
      const opts = a.options.filter((o) => o >= 0);
      if (!opts.length) return { p: -1 };
      const order = ranking(st);
      if (a.title === 'Tauschkarte') return { p: opts.slice().sort((x, y) => forwardDist(g, st.players[x].node, st.star) - forwardDist(g, st.players[y].node, st.star))[0] };
      if (a.title === 'Rivale') return { p: opts[opts.length - 1] };
      if (a.title === 'Bande') {
        if (rnd() < 0.2) return { p: -1 };
        const mine = order.indexOf(p);
        return { p: opts.slice().sort((x, y) => Math.abs(order.indexOf(x) - mine) - Math.abs(order.indexOf(y) - mine))[0] };
      }
      return { p: opts[Math.floor(rnd() * opts.length)] };
    }
    case 'path': {
      const open = a.options.filter((o) => !o.blocked || o.key);
      if (!open.length) return { to: a.options[0].to };
      if (rnd() < sloppy) return { to: open[Math.floor(rnd() * open.length)].to };
      // toward the star when we can buy it by the time we get there
      if (P.coins >= price - (level === 'stark' ? 10 : level === 'normal' ? 8 : 4)) {
        const best = open.map((o) => ({ o, d: forwardDist(g, o.to, st.star) })).sort((x, y) => x.d - y.d)[0];
        if (best.d < 40) return { to: best.o.to };
      }
      // otherwise the way with more plus and a shop when we have money
      const score = (to: number) => {
        let s = 0, n = to;
        for (let k = 0; k < 14; k++) {
          const node = g.nodes[n];
          s += node.type === 'P' ? 1 : node.type === 'M' ? -1.4 : node.type === 'S' && P.coins >= 8 ? 1.5 : node.type === 'B' ? 1 : node.type === 'L' ? 0.8 : 0;
          if (node.next.length !== 1) break;
          n = node.next[0];
        }
        return s / (k14(to, g) || 1);
      };
      return { to: open.slice().sort((x, y) => score(y.to) - score(x.to))[0].to };
    }
    case 'buyStar':
      return { yes: true };
    case 'shop': {
      const reserve = dStar <= 18 && P.coins < price + 6 ? price : 4;
      const ok = a.offer.filter((o) => o.ok && P.coins - o.price >= reserve && (o.item !== 'tuete' || st.finale) && P.items.filter((i) => i === o.item).length < (o.item === 'dw' ? 2 : 1));
      if (!ok.length || rnd() < sloppy * 0.5) return { item: null };
      ok.sort((x, y) => PREF.indexOf(x.item) - PREF.indexOf(y.item));
      return { item: ok[0].item };
    }
    case 'duel': {
      const opp = a.opponents.slice().sort((x, y) => st.players[y].coins - st.players[x].coins)[0];
      const starIdx = a.stakes.findIndex((s) => 'star' in s);
      if (starIdx >= 0 && level === 'stark' && st.players[opp].stars > P.stars && rnd() < 0.3) return { p: opp, stake: starIdx };
      return { p: opp, stake: level === 'leicht' || P.coins < 10 ? 0 : 1 };
    }
    case 'bandeOffer': {
      const order = ranking(st);
      return { yes: order.indexOf(p) > order.indexOf(a.from) || rnd() < 0.25 };
    }
    case 'finale':
      return { rule: P.coins < 10 ? 'catchup' : P.coins >= 15 ? 'cheapStar' : 'mgDouble' };
    case 'yesno':
      return { yes: a.title === 'Jetonfeld' ? rnd() < 0.5 : true };
  }
}

function k14(to: number, g: ReturnType<typeof getBoard>['graph']) {
  let k = 0, n = to;
  while (k < 14) { k++; const node = g.nodes[n]; if (node.next.length !== 1) break; n = node.next[0]; }
  return k;
}

export const itemName = (i: ItemId) => ITEMS[i].name;
