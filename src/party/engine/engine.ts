// The rules of an evening. The engine owns the GameState and runs rounds and turns; it never
// touches the screen. It tells presenters what happens (io.emit, awaited, so the show sets the
// pace), asks seats for decisions (io.ask: this browser's UI, a bot, or a friend online), and
// starts minigames (io.minigame). Solo, the engine runs here; online, it runs on the host.

import { getBoard } from '../boards';
import { forwardDist, forwardPath } from '../boards/graph';
import type { BoardApi, BoardDef, BNode, SpaceType } from '../boards/types';
import { minigamesFor } from '../minigames';
import type { MgType, Rules, Seat } from '../types';
import { mulberry } from '../util';
import {
  newPlayer, pickBonus, ranking,
  type Answer, type Ask, type GameEvent, type GameState, type MgOutcome, type MgRequest, type PathOption, type ShopOffer, type Stake,
} from './state';
import {
  BONUS, BUDDY_IDS, BUDDY_ROUND, BUDDY_TURNS, BUDDIES, FINALE_RULES, ITEMS, ITEM_IDS, MAX_ITEMS, STAR_PRICE,
  type BuddyId, type FinaleRule, type ItemId,
} from './tables';

export interface GameIO {
  emit(ev: GameEvent): Promise<void>;
  ask(p: number, a: Ask): Promise<Answer>;
  minigame(req: MgRequest): Promise<MgOutcome>;
  /** Between two turns: a safe point to save. */
  checkpoint?(st: GameState): void;
}

/** Engine state that is not in GameState but must survive a save: where in the round we are. */
export type Step = 'start' | 'turns' | 'minigame';

export const PLUS_TYPES: SpaceType[] = ['P', 'G', 'E', 'L', 'S', 'B', 'T', 'X'];
export const sideOf = (t: SpaceType) => (PLUS_TYPES.includes(t) ? 'plus' : 'minus') as 'plus' | 'minus';

export function newGame(seats: Seat[], rules: Rules, seed: number): GameState & { step: Step; seed: number } {
  const board = getBoard(rules.board);
  const rng = mulberry(seed);
  const g = board.graph;
  const st: GameState & { step: Step; seed: number } = {
    v: 1, seats, rules, round: 1, turn: 0, phase: 'play',
    players: seats.map(() => newPlayer(g.start)),
    star: 0, bs: board.initState(), buddy: null, shops: {}, traps: {}, finale: false, finaleRule: null,
    bonus: pickBonus(rng), mgHistory: [], turns: 0, step: 'start', seed,
  };
  // the first star: a plus field a good walk away from the start
  const cand = g.nodes.filter((n) => n.type === 'P' && !n.name && forwardDist(g, g.start, n.id) >= 9 && forwardDist(g, g.start, n.id) <= 16);
  st.star = (cand.length ? cand[Math.floor(rng() * cand.length)] : g.nodes[5]).id;
  return st;
}

type St = GameState & { step: Step; seed: number };

export class Game {
  st: St;
  board: BoardDef;
  rng: () => number;
  stopped = false;
  private flags = { magnet: false, tuete: false, key: false, passed: new Set<number>() };

  constructor(st: St, private io: GameIO) {
    this.st = st;
    this.board = getBoard(st.rules.board);
    this.rng = mulberry((st.seed ^ (st.turns * 2654435761)) >>> 0);
  }

  get g() { return this.board.graph; }
  get n() { return this.st.players.length; }
  node(id: number): BNode { return this.g.nodes[id]; }
  private emit(ev: GameEvent) { return this.stopped ? Promise.resolve() : this.io.emit(ev); }
  private async ask<T extends Answer>(p: number, a: Ask): Promise<T> { return (await this.io.ask(p, a)) as T; }
  private toast(text: string, color?: string) { return this.emit({ k: 'toast', text, color }); }
  private name(p: number) { return this.st.seats[p].name; }
  private ri(n: number) { return Math.floor(this.rng() * n); }

  /** The board hooks get this. */
  api(): BoardApi {
    return {
      st: this.st, bs: this.st.bs, rng: this.rng,
      emit: (ev) => this.emit(ev),
      toast: (t, c) => this.toast(t, c),
      addCoins: (p, d, t) => this.addCoins(p, d, t),
      moveStar: () => this.moveStar(),
    };
  }

  // ======================= main loop =======================
  async run() {
    const st = this.st;
    await this.emit({ k: 'sync' });
    while (st.phase === 'play' && !this.stopped) {
      if (st.step === 'start') { await this.roundStart(); st.step = 'turns'; st.turn = 0; this.io.checkpoint?.(st); }
      if (st.step === 'turns') {
        while (st.turn < this.n && !this.stopped) {
          await this.turn(st.turn);
          st.turn++;
          st.turns++;
          this.io.checkpoint?.(st);
        }
        st.step = 'minigame';
      }
      if (this.stopped) return;
      if (st.step === 'minigame') {
        await this.roundMinigame();
        await this.rivalCheck();
        if (st.round >= st.rules.rounds) { await this.endGame(); return; }
        st.round++;
        st.step = 'start';
        this.io.checkpoint?.(st);
      }
    }
  }

  // ======================= rounds =======================
  private async roundStart() {
    const st = this.st, R = st.rules.rounds;
    await this.emit({ k: 'round', round: st.round });
    if (st.round === 1) await this.toast(`${this.board.name}: Stern kostet ${STAR_PRICE} Münzen. Viel Glück!`, '#dcff1f');
    // Bande and Rivale run out
    for (let p = 0; p < this.n; p++) {
      const P = st.players[p];
      if (P.bande && P.bande.until < st.round) {
        const o = P.bande.with;
        P.bande = null;
        if (st.players[o].bande?.with === p) st.players[o].bande = null;
        await this.toast(`Die Bande von ${this.name(p)} und ${this.name(o)} ist vorbei.`, '#2fe6c8');
      }
      if (P.rival && P.rival.until < st.round) {
        const t = P.rival.target;
        P.rival = null;
        await this.toast(`${this.name(p)} hat den Rivalen ${this.name(t)} nicht überholt und zahlt 5 Münzen.`, '#ff3d9a');
        await this.transfer(p, t, 5);
      }
    }
    // shop displays: new every 3 rounds
    if ((st.round - 1) % 3 === 0) this.restock();
    // nobody can reach the star soon (everybody went the other way): it hops closer
    if (st.round > 1 && Math.min(...st.players.map((q) => forwardDist(this.g, q.node, st.star))) > 16) {
      await this.toast('Der Stern ist allen zu weit weg und hüpft näher heran.', '#ffe14a');
      await this.moveStar();
    }
    // finale
    if (!st.finale && R >= 3 && st.round === R - 2) {
      st.finale = true;
      await this.emit({ k: 'banner', text: 'Finale!', color: '#ffe14a' });
      await this.toast('Letzte 3 Runden: Plus und Minus zählen doppelt, Läden kosten 2 mehr.', '#ffe14a');
      const last = ranking(st)[this.n - 1];
      const opts: FinaleRule[] = ['mgDouble', 'cheapStar', 'catchup'];
      const a = await this.ask<{ rule: FinaleRule }>(last, { q: 'finale', options: opts });
      const rule = opts.includes(a.rule) ? a.rule : 'catchup';
      st.finaleRule = rule;
      await this.toast(`${this.name(last)} wählt die Finale-Regel: ${FINALE_RULES[rule].name}. ${FINALE_RULES[rule].text}`, '#ffe14a');
      if (rule === 'catchup') await this.addCoins(last, 10, 'Aufholjagd');
    }
    // the board's gimmick, and the Brettfest every 5 rounds
    if (st.round > 1) await this.board.roundStart(this.api(), st.round);
    if (st.round % 5 === 0) await this.board.fest(this.api());
    // the Kumpel shows up
    if (st.round >= BUDDY_ROUND && !st.buddy) await this.buddyAppear('lumi');
  }

  private restock() {
    const pool = ITEM_IDS.filter((i) => !this.st.rules.profi || ITEMS[i].pro);
    for (const n of this.g.nodes) if (n.type === 'S') {
      const list = [...pool];
      const out: ItemId[] = [];
      while (out.length < 3 && list.length) out.push(list.splice(this.ri(list.length), 1)[0]);
      out.sort((a, b) => ITEMS[a].price - ITEMS[b].price);
      this.st.shops[n.id] = out;
    }
  }

  // ======================= a turn =======================
  private async turn(p: number) {
    const st = this.st, P = st.players[p];
    this.flags = { magnet: false, tuete: false, key: false, passed: new Set() };
    await this.emit({ k: 'turn', p });

    // before the roll: one item
    let dieKind: 'w6' | 'half' | 'joker' = 'w6', count = 1;
    const usable = P.items.filter((i, k) => P.items.indexOf(i) === k && this.canUse(p, i));
    const a = await this.ask<{ use: ItemId | null }>(p, { q: 'roll', items: usable });
    const use = a.use && usable.includes(a.use) ? a.use : null;
    if (use) {
      P.items.splice(P.items.indexOf(use), 1);
      await this.emit({ k: 'item', p, item: use });
      if (use === 'dw') count = 2;
      else if (use === 'tw') count = 3;
      else if (use === 'hw') dieKind = 'half';
      else if (use === 'joker') dieKind = 'joker';
      else await this.useItem(p, use);
    }
    // roll
    let dice: number[];
    if (dieKind === 'joker') {
      const j = await this.ask<{ n: number }>(p, { q: 'joker' });
      dice = [Math.max(1, Math.min(6, Math.floor(Number(j.n)) || 1))];
    } else dice = Array.from({ length: count }, () => 1 + this.ri(dieKind === 'half' ? 3 : 6));
    const bonus = st.buddy?.owner === p && st.buddy.kind === 'pips' ? 1 + this.ri(3) : 0;
    const forced = (globalThis as { __partyForce?: number }).__partyForce;
    if (forced) { dice = [forced]; (globalThis as { __partyForce?: number }).__partyForce = 0; }
    await this.emit({ k: 'roll', p, dice, dieKind, bonus });
    await this.move(p, dice.reduce((s, d) => s + d, 0) + bonus);
    await this.land(p);
    // buddy time
    const b = st.buddy;
    if (b && b.owner === p) {
      P.stats.buddyTurns++;
      b.left--;
      if (b.left <= 0) await this.buddyLeave();
    }
  }

  private canUse(p: number, i: ItemId) {
    const st = this.st;
    if (!ITEMS[i].use) return false;
    if (i === 'tuete') return st.finale;
    if (i === 'pfeife') return !!st.buddy && st.buddy.owner !== p && st.buddy.owner === null;
    if (i === 'tausch') return this.n > 1;
    if (i === 'fahne') return !st.traps[st.players[p].node];
    return true;
  }

  private async useItem(p: number, i: ItemId) {
    const st = this.st, P = st.players[p];
    if (i === 'mag') { this.flags.magnet = true; await this.toast(`${this.name(p)}: Münzmagnet an! Wer überholt wird, gibt 3 Münzen.`, '#ffe14a'); }
    else if (i === 'tuete') { this.flags.tuete = true; await this.toast('Goldene Tüte: Landest du gleich auf Plus, gibt es einen Stern!', '#ffe14a'); }
    else if (i === 'pfeife') { if (st.buddy && st.buddy.owner === null) await this.buddyJoin(p); }
    else if (i === 'fahne') { st.traps[P.node] = p; await this.emit({ k: 'trap', node: P.node, owner: p }); await this.toast(`${this.name(p)} steckt ein Bannerfähnchen: Wer hier landet, zahlt 5.`, '#ff8a2e'); }
    else if (i === 'tausch') {
      const others = st.players.map((_, k) => k).filter((k) => k !== p);
      const a = await this.ask<{ p: number }>(p, { q: 'target', title: 'Tauschkarte', text: 'Mit wem tauschst du den Platz?', options: others });
      const o = others.includes(a.p) ? a.p : others[0];
      const t = P.node;
      P.node = st.players[o].node;
      st.players[o].node = t;
      await this.emit({ k: 'swap', a: p, b: o });
      await this.toast(`${this.name(p)} tauscht den Platz mit ${this.name(o)}!`, '#2fe6ff');
    } else if (i === 'kompass') {
      const path = forwardPath(this.g, P.node, st.star);
      if (path.length > 2) {
        const at = Math.max(2, path.length - 10);
        let target = path[at - 1];
        if (this.node(target).name || st.players.some((q) => q.node === target)) target = path[Math.min(path.length - 1, at)];
        st.star = target;
        await this.emit({ k: 'starMove', to: target });
        await this.toast('Der Sternkompass zieht den Stern heran!', '#ffe14a');
      } else await this.toast('Der Stern ist schon ganz nah.', '#ffe14a');
    }
  }

  // ======================= moving =======================
  private routeBlocked(from: number, first: number): string | null {
    let a = from, b = first;
    for (let guard = 0; guard < 60; guard++) {
      const why = this.board.blocked(this.st.bs, a, b);
      if (why) return why;
      const n = this.node(b);
      if (n.next.length !== 1 || n.name) return null;
      a = b;
      b = n.next[0];
    }
    return null;
  }

  private async move(p: number, steps: number) {
    const st = this.st, P = st.players[p];
    let left = steps;
    while (left > 0 && !this.stopped) {
      const node = this.node(P.node);
      let next = node.next[0];
      if (node.next.length > 1) {
        const hasKey = P.items.includes('key');
        const options: PathOption[] = node.next.map((to) => {
          const r = node.routes?.[to];
          const blocked = this.routeBlocked(node.id, to);
          return { to, name: r?.name ?? 'Weg', len: r?.len ?? 0, blocked, key: !!blocked && hasKey };
        });
        const open = options.filter((o) => !o.blocked || o.key);
        const a = await this.ask<{ to: number }>(p, { q: 'path', node: node.id, options });
        const pick = open.find((o) => o.to === a.to) ?? open.find((o) => !o.blocked) ?? open[0];
        next = pick.to;
        if (pick.blocked) {
          P.items.splice(P.items.indexOf('key'), 1);
          this.flags.key = true;
          await this.toast(`${this.name(p)} schließt mit dem Brückenschlüssel auf!`, '#ffe14a');
        }
        await this.emit({ k: 'path', p, node: node.id, to: next });
      }
      const why = this.board.blocked(st.bs, node.id, next);
      if (why) {
        if (this.flags.key) { /* the key opens this way once */ }
        else if (P.items.includes('key')) {
          P.items.splice(P.items.indexOf('key'), 1);
          this.flags.key = true;
          await this.toast(`${this.name(p)} öffnet mit dem Brückenschlüssel!`, '#ffe14a');
        } else {
          await this.emit({ k: 'blocked', p, text: why });
          break;
        }
      }
      const from = P.node;
      P.node = next;
      left--;
      P.stats.steps++;
      await this.emit({ k: 'hop', p, from, to: next, left });
      if (st.buddy?.owner === p && st.buddy.kind === 'mopp') await this.addCoins(p, 1);
      // overtaking
      for (let o = 0; o < this.n; o++) {
        if (o === p || st.players[o].node !== next || this.flags.passed.has(o)) continue;
        this.flags.passed.add(o);
        const steal = (this.flags.magnet ? 3 : 0) + (st.buddy?.owner === p && st.buddy.kind === 'klecks' ? 2 : 0);
        if (steal) {
          await this.toast(`${this.name(p)} überholt ${this.name(o)} und schnappt sich Münzen!`, '#b46bff');
          await this.transfer(o, p, steal);
        }
      }
      if (next === st.star) await this.starStop(p);
      else if (this.node(next).type === 'S' && left > 0) await this.shop(p, true);
    }
  }

  private async starStop(p: number) {
    const st = this.st, P = st.players[p];
    const price = st.finaleRule === 'cheapStar' ? 15 : STAR_PRICE;
    if (P.coins < price) { await this.emit({ k: 'starMiss', p, price }); return; }
    const a = await this.ask<{ yes: boolean }>(p, { q: 'buyStar', price });
    if (!a.yes) return;
    P.coins -= price;
    P.stars++;
    P.stats.starsBought++;
    await this.emit({ k: 'starBuy', p });
    await this.moveStar();
  }

  async moveStar() {
    const st = this.st, old = this.node(st.star);
    const taken = new Set(st.players.map((q) => q.node));
    // a plus field away from the old spot that somebody can reach in two or three turns
    const free = this.g.nodes.filter((n) => !taken.has(n.id) && !n.name && n.type === 'P' && n.id !== old.id && Math.hypot(n.x - old.x, n.z - old.z) > 12);
    const near = (n: BNode) => Math.min(...st.players.map((q) => forwardDist(this.g, q.node, n.id)));
    const cand = free.filter((n) => { const d = near(n); return d >= 5 && d <= 12; });
    const pool = cand.length ? cand : free.length ? free : this.g.nodes.filter((m) => !m.name && m.id !== old.id);
    st.star = pool[this.ri(pool.length)].id;
    await this.emit({ k: 'starMove', to: st.star });
  }

  // ======================= landing =======================
  private async land(p: number) {
    const st = this.st, P = st.players[p], node = this.node(P.node), t = node.type;
    P.side = sideOf(t);
    await this.emit({ k: 'land', p, type: t });
    const mul = st.buddy?.owner === p ? 2 : 1;
    const fin = st.finale ? 2 : 1;
    // Bannerfähnchen of someone else
    const trap = st.traps[P.node];
    if (trap !== undefined && trap !== p) {
      delete st.traps[P.node];
      await this.emit({ k: 'trap', node: P.node, owner: null });
      await this.toast(`Bannerfähnchen! ${this.name(p)} zahlt ${this.name(trap)} 5 Münzen.`, '#ff8a2e');
      await this.transfer(p, trap, 5);
    }
    // landing next to the Bande partner: give 2
    if (P.bande && st.players[P.bande.with].node === P.node) {
      const o = P.bande.with;
      await this.toast(`${this.name(p)} trifft die Bande: 2 Münzen für ${this.name(o)}.`, '#2fe6c8');
      st.players[o].stats.bandeCoins += Math.min(2, P.coins);
      await this.transfer(p, o, 2);
    }
    if (t === 'P' || t === 'G') {
      const k = 3 * mul * fin * this.board.plusFactor(st.bs);
      await this.addCoins(p, k, `Plus-Feld${mul > 1 ? ' · Kumpel ×2' : ''}${fin > 1 ? ' · Finale ×2' : ''}`);
      if (this.flags.tuete && st.finale) {
        P.stars++;
        await this.emit({ k: 'starBuy', p });
        await this.toast(`Goldene Tüte: ${this.name(p)} bekommt einen Stern!`, '#ffe14a');
      }
    } else if (t === 'M') {
      P.stats.minus++;
      if (st.buddy?.owner === p && st.buddy.kind === 'bolle') await this.toast('Bolle schützt dich: Das Minusfeld prallt ab.', '#7dff8a');
      else if (P.items.includes('sh')) { P.items.splice(P.items.indexOf('sh'), 1); await this.toast('Glitzerschild! Das Minusfeld prallt ab.', '#7dff8a'); }
      else await this.addCoins(p, -3 * mul * fin, 'Minus-Feld');
    } else if (t === 'E') {
      P.stats.events++;
      await this.event(p);
    } else if (t === 'L') await this.luck(p, mul);
    else if (t === 'S') await this.shop(p, false);
    else if (t === 'D') await this.duelField(p);
    else if (t === 'B') await this.kumpelField(p);
    else if (t === 'T') await this.bandeField(p);
    else if (t === 'R') await this.rivalField(p);
    else if (t === 'X') await this.board.onSpace(this.api(), p);
  }

  async addCoins(p: number, d: number, text?: string) {
    const P = this.st.players[p];
    const before = P.coins;
    P.coins = Math.max(0, P.coins + d);
    const real = P.coins - before;
    if (real > 0) P.stats.coinsGot += real;
    await this.emit({ k: 'coins', p, d: real, text });
  }

  private async transfer(from: number, to: number, n: number) {
    const g = Math.min(n, this.st.players[from].coins);
    if (g <= 0) return;
    await this.addCoins(from, -g);
    await this.addCoins(to, g);
  }

  private async event(p: number) {
    const st = this.st;
    const generic: { text: string; luck?: boolean; run: (p: number) => Promise<void> }[] = [
      { text: 'Neonsturm: Der Stern zieht um!', luck: true, run: () => this.moveStar() },
      { text: 'Glitzerregen: Alle bekommen 2 Münzen.', run: async () => { for (let q = 0; q < this.n; q++) await this.addCoins(q, 2); } },
      {
        text: 'Taschentaube: 4 Münzen gehen an den Letzten.', run: async (pp) => {
          const last = ranking(st)[this.n - 1];
          if (last === pp) await this.addCoins(pp, 4); else await this.transfer(pp, last, 4);
        },
      },
      { text: 'Münzbrunnen: Du bekommst 5 Münzen.', run: (pp) => this.addCoins(pp, 5) },
    ];
    const pool = [...generic, ...this.board.events.map((e) => ({ text: e.text, luck: e.luck, run: (pp: number) => e.run(this.api(), pp) }))]
      .filter((e) => !st.rules.profi || !e.luck);
    const ev = pool[this.ri(pool.length)];
    await this.toast(`Ereignis! ${ev.text}`, '#ffd23f');
    await ev.run(p);
  }

  private async luck(p: number, mul: number) {
    const st = this.st, P = st.players[p];
    const coins = (3 + this.ri(6)) * mul;
    const item = ITEM_IDS.filter((i) => !st.rules.profi || ITEMS[i].pro)[this.ri(st.rules.profi ? 4 : ITEM_IDS.length)];
    const options = [`${coins} Münzen`, ITEMS[item].name];
    const canSwap = !st.rules.profi && this.n > 1;
    if (canSwap) options.push('Platztausch');
    let pick = this.ri(options.length);
    if (pick === 1 && P.items.length >= MAX_ITEMS) pick = 0;
    await this.emit({ k: 'wheel', p, options, pick });
    if (pick === 0) await this.addCoins(p, coins, 'Glücksrad');
    else if (pick === 1) { P.items.push(item); await this.toast(`Glücksrad: ${this.name(p)} bekommt ${ITEMS[item].name}!`, '#3fdc7a'); }
    else {
      const o = (p + 1 + this.ri(this.n - 1)) % this.n;
      const t = P.node;
      P.node = st.players[o].node;
      st.players[o].node = t;
      await this.emit({ k: 'swap', a: p, b: o });
      await this.toast(`Glücksrad: ${this.name(p)} tauscht mit ${this.name(o)}!`, '#3fdc7a');
    }
  }

  private shopPrice(p: number, i: ItemId) {
    let price = ITEMS[i].price + (this.st.finale ? 2 : 0);
    if (this.st.buddy?.owner === p && this.st.buddy.kind === 'funz') price = Math.ceil(price / 2);
    return price;
  }

  private async shop(p: number, passing: boolean) {
    const st = this.st, P = st.players[p];
    const display = st.shops[P.node] ?? [];
    const offer: ShopOffer[] = display.map((item) => { const price = this.shopPrice(p, item); return { item, price, ok: P.coins >= price && P.items.length < MAX_ITEMS }; });
    if (passing && !offer.some((o) => o.ok)) return;
    if (!offer.length) return;
    const a = await this.ask<{ item: ItemId | null }>(p, { q: 'shop', offer, passing });
    const o = offer.find((x) => x.item === a.item && x.ok);
    if (!o) { await this.emit({ k: 'shop', p, item: null, price: 0 }); return; }
    P.coins -= o.price;
    P.stats.spent += o.price;
    P.items.push(o.item);
    await this.emit({ k: 'shop', p, item: o.item, price: o.price });
  }

  // ======================= duels =======================
  private async duelField(p: number) {
    const st = this.st, P = st.players[p];
    const opponents = st.players.map((_, k) => k).filter((k) => k !== p);
    if (!opponents.length) return;
    const stakes: Stake[] = [{ coins: 5 }, { coins: 10 }];
    if (!st.rules.profi && P.stars > 0) stakes.push({ star: true });
    const a = await this.ask<{ p: number; stake: number }>(p, { q: 'duel', opponents, stakes });
    const o = opponents.includes(a.p) ? a.p : opponents[0];
    let stake = stakes[a.stake] ?? stakes[0];
    if ('star' in stake && st.players[o].stars < 1) stake = { coins: 10 };
    await this.emit({ k: 'banner', text: 'Duell!', color: '#ff8a2e' });
    await this.toast(`${this.name(p)} fordert ${this.name(o)} heraus! Einsatz: ${'star' in stake ? '1 Stern' : stake.coins + ' Münzen'}.`, '#ff8a2e');
    const res = await this.duelGame([p, o], 'duel');
    if (res < 0) { await this.toast('Unentschieden! Niemand zahlt.', '#ff8a2e'); return; }
    const win = res, lose = win === p ? o : p;
    st.players[win].stats.duelsWon++;
    if (st.buddy?.owner === lose && st.buddy.kind === 'bolle') { await this.toast(`Bolle schützt ${this.name(lose)} vor dem Duell-Verlust!`, '#7dff8a'); return; }
    if ('star' in stake) {
      st.players[lose].stars--;
      st.players[win].stars++;
      await this.emit({ k: 'starBuy', p: win });
      await this.toast(`${this.name(win)} gewinnt das Duell und bekommt einen Stern von ${this.name(lose)}!`, '#ffe14a');
    } else {
      await this.toast(`${this.name(win)} gewinnt das Duell!`, '#ff8a2e');
      await this.transfer(lose, win, stake.coins);
    }
  }

  /** Runs a 1-gegen-1 minigame; returns the winner seat or -1 for a draw. */
  private async duelGame(seats: [number, number], kind: 'duel' | 'buddy'): Promise<number> {
    const id = this.pickMinigame('duell', 2);
    const out = await this.io.minigame({ kind, id, seats, teams: [0, 1], seed: (this.rng() * 2 ** 31) | 0 });
    const w = out.win.findIndex((x) => x);
    if (w < 0 || out.win.every((x) => x)) return -1;
    return seats[w];
  }

  // ======================= Kumpel =======================
  private buddyNodes() { return this.g.nodes.filter((n) => n.type === 'B'); }

  private async buddyAppear(kind?: BuddyId) {
    const st = this.st;
    const nodes = this.buddyNodes();
    if (!nodes.length) return;
    const k: BuddyId = st.rules.profi ? 'lumi' : kind ?? BUDDY_IDS[this.ri(BUDDY_IDS.length)];
    const at = nodes[this.ri(nodes.length)].id;
    st.buddy = { kind: k, at, owner: null, left: 0 };
    await this.emit({ k: 'buddy', what: 'appear', node: at, kind: k });
    await this.toast(`Kumpel ${BUDDIES[k].name} wartet auf einem Kumpelfeld: ${BUDDIES[k].text}`, '#ff7ad9');
  }

  private async buddyJoin(p: number) {
    const b = this.st.buddy!;
    b.owner = p;
    b.at = null;
    b.left = BUDDY_TURNS;
    await this.emit({ k: 'buddy', what: 'join', p, kind: b.kind });
    await this.toast(`Kumpel ${BUDDIES[b.kind].name} hilft ${this.name(p)} 3 Züge lang: Felder zählen doppelt. ${BUDDIES[b.kind].text}`, '#ff7ad9');
  }

  private async buddyLeave() {
    const st = this.st, b = st.buddy!;
    const p = b.owner!;
    await this.emit({ k: 'buddy', what: 'leave', p, kind: b.kind });
    await this.toast(`Kumpel ${BUDDIES[b.kind].name} verabschiedet sich von ${this.name(p)}.`, '#ff7ad9');
    st.buddy = null;
    await this.buddyAppear();
  }

  private async kumpelField(p: number) {
    const st = this.st, b = st.buddy;
    if (!b) { await this.addCoins(p, 3, 'Der Kumpel schläft noch'); return; }
    if (b.owner === null) { await this.buddyJoin(p); return; }
    if (b.owner === p) { b.left = BUDDY_TURNS; await this.toast(`Kumpel ${BUDDIES[b.kind].name} bleibt 3 weitere Züge!`, '#ff7ad9'); return; }
    if (st.rules.profi) { await this.addCoins(p, 3, 'Kumpel bleibt (Profi)'); return; }
    const o = b.owner;
    await this.emit({ k: 'banner', text: 'Kumpel-Duell!', color: '#ff7ad9' });
    await this.toast(`${this.name(p)} will ${BUDDIES[b.kind].name} von ${this.name(o)} weglocken. Wer das Duell gewinnt, behält den Kumpel.`, '#ff7ad9');
    const w = await this.duelGame([p, o], 'buddy');
    if (w === p) {
      b.owner = p;
      b.left = BUDDY_TURNS;
      await this.emit({ k: 'buddy', what: 'lure', p, from: o, kind: b.kind });
      await this.toast(`${this.name(p)} lockt ${BUDDIES[b.kind].name} weg!`, '#ff7ad9');
    } else await this.toast(`${BUDDIES[b.kind].name} bleibt bei ${this.name(o)}.`, '#ff7ad9');
  }

  // ======================= Bande & Rivale =======================
  private async bandeField(p: number) {
    const st = this.st, P = st.players[p];
    const options = st.players.map((_, k) => k).filter((k) => k !== p && !st.players[k].bande);
    if (P.bande || !options.length) { await this.addCoins(p, 3, 'Bandenfeld'); return; }
    const a = await this.ask<{ p: number }>(p, { q: 'target', title: 'Bande', text: 'Wem bietest du eine Bande für 2 Runden an? Ihr teilt alle Minispiel-Münzen.', options: [...options, -1] });
    if (!options.includes(a.p)) { await this.toast(`${this.name(p)} bleibt lieber allein.`, '#2fe6c8'); return; }
    const o = a.p;
    const yes = await this.ask<{ yes: boolean }>(o, { q: 'bandeOffer', from: p });
    if (!yes.yes) { await this.toast(`${this.name(o)} lehnt die Bande ab.`, '#2fe6c8'); return; }
    P.bande = { with: o, until: st.round + 1 };
    st.players[o].bande = { with: p, until: st.round + 1 };
    await this.toast(`Bande! ${this.name(p)} und ${this.name(o)} teilen 2 Runden lang ihre Minispiel-Münzen.`, '#2fe6c8');
  }

  private async rivalField(p: number) {
    const st = this.st, P = st.players[p];
    const order = ranking(st);
    const ahead = order.slice(0, order.indexOf(p));
    if (P.rival || !ahead.length) { await this.addCoins(p, -3 * (st.finale ? 2 : 1), ahead.length ? 'Rivalenfeld' : 'Niemand vor dir'); return; }
    const a = await this.ask<{ p: number }>(p, { q: 'target', title: 'Rivale', text: 'Wen erklärst du zum Rivalen? Überholst du ihn in 3 Runden, zahlt er dir 10. Sonst zahlst du 5.', options: ahead });
    const o = ahead.includes(a.p) ? a.p : ahead[ahead.length - 1];
    P.rival = { target: o, until: st.round + 2 };
    await this.toast(`${this.name(p)} erklärt ${this.name(o)} zum Rivalen!`, '#ff3d9a');
  }

  private async rivalCheck() {
    const st = this.st;
    const order = ranking(st);
    for (let p = 0; p < this.n; p++) {
      const r = st.players[p].rival;
      if (!r) continue;
      if (order.indexOf(p) < order.indexOf(r.target)) {
        st.players[p].rival = null;
        await this.toast(`${this.name(p)} überholt den Rivalen ${this.name(r.target)}: 10 Münzen!`, '#ff3d9a');
        await this.transfer(r.target, p, 10);
      }
    }
  }

  // ======================= minigames =======================
  pickMinigame(type: MgType, n: number): string {
    const st = this.st;
    const recent = new Set(st.mgHistory.slice(-8));
    const allowed = (t: MgType) => st.rules.types[t] !== false;
    const base = minigamesFor(n).filter((m) => (!st.rules.profi || m.pro) && (st.rules.types.muenz !== false || !m.coin));
    let pool = base.filter((m) => m.type === type && allowed(m.type));
    if (type === 'ffa' && n === 2) pool = base.filter((m) => (m.type === 'ffa' || m.type === 'duell') && allowed(m.type));
    if (!pool.length && type === 'duell') pool = minigamesFor(2).filter((m) => m.type === 'duell');
    if (!pool.length && type === 'duell') pool = minigamesFor(2).filter((m) => m.type === 'ffa');
    if (!pool.length) pool = base.filter((m) => m.type === 'ffa');
    if (!pool.length) pool = minigamesFor(n);
    const fresh = pool.filter((m) => !recent.has(m.id));
    const list = fresh.length ? fresh : pool;
    return list[this.ri(list.length)].id;
  }

  private async roundMinigame() {
    const st = this.st, n = this.n;
    if (n < 2) return;
    const all = st.players.map((_, i) => i);
    const minus = all.filter((i) => st.players[i].side === 'minus');
    const plus = all.filter((i) => st.players[i].side === 'plus');
    let type: MgType = 'ffa', seats = all, teams = all.map((_, i) => i);
    const allow = st.rules.types;
    if (n >= 3 && (minus.length === 1 || plus.length === 1) && allow['1v3'] !== false) {
      const solo = minus.length === 1 ? minus[0] : plus[0];
      type = '1v3';
      seats = [solo, ...all.filter((i) => i !== solo)];
      teams = seats.map((_, k) => (k === 0 ? 0 : 1));
    } else if (n === 4 && minus.length === 2 && allow['2v2'] !== false) {
      type = '2v2';
      let A = [...plus], B = [...minus];
      // a Bande plays in the same team when it can
      for (const p of all) {
        const w = st.players[p].bande?.with;
        if (w === undefined) continue;
        const inA = A.includes(p), wInA = A.includes(w);
        if (inA !== wInA) {
          const [mine, other] = inA ? [A, B] : [B, A];
          const swapOut = mine.find((x) => x !== p)!;
          mine.splice(mine.indexOf(swapOut), 1, w);
          other.splice(other.indexOf(w), 1, swapOut);
          A = inA ? mine : other;
          B = inA ? other : mine;
        }
        break;
      }
      seats = [...A, ...B];
      teams = [0, 0, 1, 1];
    }
    // Koop-Boss: now and then an all-against-all round becomes everybody against a boss
    if (type === 'ffa' && allow.koop !== false && minigamesFor(n).some((m) => m.type === 'koop' && (!st.rules.profi || m.pro)) && this.ri(6) === 0) type = 'koop';
    const id = this.pickMinigame(type, n);
    st.mgHistory.push(id);
    const text = type === '1v3' ? `1 gegen ${n - 1}: ${this.name(seats[0])} allein` : type === '2v2' ? `2 gegen 2: ${this.name(seats[0])} & ${this.name(seats[1])} gegen ${this.name(seats[2])} & ${this.name(seats[3])}` : type === 'koop' ? 'Alle zusammen: Koop-Boss!' : 'Felder gemischt: Jeder gegen jeden';
    await this.emit({ k: 'mgAnnounce', text });
    const out = await this.io.minigame({ kind: 'round', id, seats, teams, seed: (this.rng() * 2 ** 31) | 0 });
    // coins: finale rule, Bande shares 50:50
    const gain = new Array(n).fill(0);
    seats.forEach((s, k) => { gain[s] = Math.max(0, Math.round(out.coins[k] || 0)) * (st.finaleRule === 'mgDouble' ? 2 : 1); if (out.win[k]) st.players[s].stats.mgWins++; });
    const final = [...gain];
    const done = new Set<number>();
    for (let p = 0; p < n; p++) {
      const b = st.players[p].bande;
      if (!b || done.has(p) || st.players[b.with].bande?.with !== p) continue;
      done.add(p); done.add(b.with);
      const sum = gain[p] + gain[b.with];
      final[p] = Math.ceil(sum / 2);
      final[b.with] = Math.floor(sum / 2);
      for (const q of [p, b.with]) if (final[q] > gain[q]) st.players[q].stats.bandeCoins += final[q] - gain[q];
    }
    for (let p = 0; p < n; p++) if (final[p]) await this.addCoins(p, final[p], 'Minispiel');
  }

  // ======================= the end =======================
  private async endGame() {
    const st = this.st;
    const list = st.bonus.map((id) => {
      const key = BONUS[id].stat;
      const max = Math.max(...st.players.map((q) => q.stats[key]));
      const winners = max > 0 ? st.players.map((_, i) => i).filter((i) => st.players[i].stats[key] === max) : [];
      for (const w of winners) st.players[w].stars++;
      return { id, winners };
    });
    st.phase = 'end';
    await this.emit({ k: 'bonus', list });
    await this.emit({ k: 'end', order: ranking(st) });
  }
}
