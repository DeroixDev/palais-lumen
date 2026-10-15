// The table: owns the match on the host, runs the bots on timers and pushes a View to every
// seat that listens. Solo and online use exactly this; online only adds listeners that forward
// the views over the network (net.ts).

import { botJump, botMove } from './bot';
import { act, canJump, lastSeq, newMatch, trimEvents, type ActResult, type Action, type Match, type Rules, type Seat } from './engine';
import { makeView, type View } from './view';

export interface TableView extends View {
  /** Changes with every new match (rematch), so clients reset their event cursor. */
  mid: number;
}

type Listener = (v: TableView) => void;

export interface TableOpts {
  /** Multiplies every bot delay (tests use 0.05). */
  speed?: number;
  seed?: number;
  /** Seat allowed to start the next round / rematch (the host). */
  owner?: number;
}

interface Plan { at: number; run: () => void }

export class Table {
  m: Match;
  mid = 1;
  private seats: Seat[];
  private listeners = new Map<number, Listener>();
  private sent = new Map<number, number>();
  private away = new Set<number>();
  private timer = 0;
  private paused = false;
  private speed: number;
  readonly owner: number;
  /** Per "open" UNO incident: which bot catches and when (decided once). */
  private incident: { who: number; seq: number; catcher: number; at: number; window: number } | null = null;
  private jumpPlan: { seq: number; p: number; at: number } | null = null;
  private turnPlan: { key: string; at: number } | null = null;
  /** Called after every change (the dev hook and stats use it). */
  onChange: ((m: Match) => void) | null = null;

  constructor(seats: Seat[], private rules: Rules, opts: TableOpts = {}) {
    this.seats = seats.map((s) => ({ ...s }));
    this.speed = opts.speed ?? 1;
    this.owner = opts.owner ?? 0;
    this.m = newMatch(this.seats, rules, opts.seed);
  }

  /** A seat played by a bot right now (a bot, or a person who left). */
  auto(i: number) {
    return this.m.players[i].bot || this.away.has(i);
  }

  isAway(i: number) {
    return this.away.has(i);
  }

  listen(seat: number, fn: Listener) {
    this.listeners.set(seat, fn);
    // a (re)joining seat starts from now: no replay of old animations
    this.sent.set(seat, lastSeq(this.m));
    fn(this.view(seat));
    this.plan();
  }

  unlisten(seat: number) {
    this.listeners.delete(seat);
  }

  setAway(seat: number, away: boolean) {
    if (away) this.away.add(seat);
    else this.away.delete(seat);
    this.changed();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.plan();
  }

  pause(p: boolean) {
    this.paused = p;
    if (p) clearTimeout(this.timer);
    else this.plan();
  }

  private view(seat: number): TableView {
    const v = makeView(this.m, seat, this.sent.get(seat) ?? lastSeq(this.m), (i) => this.away.has(i)) as TableView;
    v.mid = this.mid;
    this.sent.set(seat, v.seq);
    return v;
  }

  /** An action from a seat (a person: local or over the network). */
  act(seat: number, a: Action): ActResult {
    if (a.t === 'next') {
      if (seat !== this.owner) return { ok: false, why: 'Der Gastgeber startet die nächste Runde' };
      if (this.m.phase === 'matchEnd') {
        this.rematch();
        return { ok: true };
      }
    }
    const r = act(this.m, seat, a);
    if (r.ok) this.changed();
    return r;
  }

  rematch() {
    this.m = newMatch(this.seats, this.rules);
    this.mid++;
    for (const k of this.sent.keys()) this.sent.set(k, 0);
    this.incident = this.jumpPlan = this.turnPlan = null;
    this.changed();
  }

  private changed() {
    trimEvents(this.m);
    for (const k of this.sent.keys()) if ((this.sent.get(k) ?? 0) < this.m.base) this.sent.set(k, this.m.base);
    for (const [seat, fn] of this.listeners) fn(this.view(seat));
    this.onChange?.(this.m);
    this.plan();
  }

  private botAct(seat: number, a: Action, turn = false) {
    const r = act(this.m, seat, a);
    if (r.ok) return this.changed();
    if (turn) {
      // never stall on a bot mistake: fall back to drawing or passing
      const fb = act(this.m, seat, this.m.phase === 'drawn' ? { t: 'pass' } : { t: 'draw' });
      if (fb.ok) return this.changed();
    }
    if (this.incident) this.incident.catcher = -1;
    if (this.jumpPlan) this.jumpPlan.p = -1;
    this.plan();
  }

  /** Decides the next automatic thing (bot move, catch, jump-in) and sets one timer for it. */
  private plan() {
    clearTimeout(this.timer);
    if (this.paused) return;
    const m = this.m;
    if (m.phase !== 'play' && m.phase !== 'drawn') return;
    const now = performance.now();
    const sp = this.speed;
    const seq = lastSeq(m);
    const plans: Plan[] = [];

    // 1. forgotten UNO: maybe a bot catches it (decided once per incident)
    if (m.open === null) this.incident = null;
    else if (!this.incident || this.incident.who !== m.open) {
      const catchers = m.players.map((_, i) => i).filter((i) => i !== m.open && this.auto(i));
      const humans = m.players.some((_, i) => i !== m.open && !this.auto(i));
      const catcher = catchers.length && Math.random() < 0.8 ? catchers[Math.floor(Math.random() * catchers.length)] : -1;
      this.incident = {
        who: m.open,
        seq,
        catcher,
        at: now + (700 + Math.random() * 900) * sp,
        // the game waits a moment so people at the table get a fair chance to catch it too
        window: now + (humans ? 1700 : 600) * sp,
      };
    }
    const inc = this.incident;
    if (inc && inc.catcher >= 0 && m.open === inc.who) {
      const who = inc.who;
      plans.push({ at: inc.at, run: () => this.botAct(inc.catcher, { t: 'catch', target: who }) });
    }

    // 2. Reinwerfen: a bot with an identical card throws it in now and then
    if (m.rules.jumpIn) {
      if (!this.jumpPlan || this.jumpPlan.seq !== seq) {
        this.jumpPlan = { seq, p: -1, at: 0 };
        const cands = m.players.map((_, i) => i).filter((i) => this.auto(i) && i !== m.turn && m.players[i].hand.some((c) => canJump(m, i, c)));
        if (cands.length && Math.random() < 0.55) {
          this.jumpPlan = { seq, p: cands[Math.floor(Math.random() * cands.length)], at: now + (450 + Math.random() * 600) * sp };
        }
      }
      const jp = this.jumpPlan;
      if (jp && jp.seq === seq && jp.p >= 0) {
        plans.push({ at: jp.at, run: () => { const a = botJump(m, jp.p); if (a) this.botAct(jp.p, a); else { jp.p = -1; this.plan(); } } });
      }
    }

    // 3. the bot on turn
    if (this.auto(m.turn)) {
      const key = `${this.mid}:${seq}`;
      if (!this.turnPlan || this.turnPlan.key !== key) {
        const last = m.events[m.events.length - 1];
        const fresh = m.events.slice(-5).some((e) => e.k === 'deal');
        const base = fresh ? 1700 : last?.k === 'uno' ? 500 : 750 + Math.random() * 600;
        this.turnPlan = { key, at: now + base * sp };
      }
      let at = this.turnPlan.at;
      // a forgotten UNO stays open for a moment: people can react, and a bot that noticed gets its catch in
      if (inc && m.open === inc.who) at = Math.max(at, inc.window, inc.catcher >= 0 ? inc.at + 60 * sp : 0);
      const p = m.turn;
      plans.push({ at, run: () => this.botAct(p, botMove(m, p), true) });
    }

    if (!plans.length) return;
    plans.sort((a, b) => a.at - b.at);
    const first = plans[0];
    this.timer = window.setTimeout(first.run, Math.max(0, first.at - now));
  }

  destroy() {
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
