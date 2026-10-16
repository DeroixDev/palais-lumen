// Running an evening. HostSession runs the engine (solo, or as the online host): it plays the
// events here, sends them with the state to the friends, routes questions to this browser's UI,
// to bots or to the friend whose seat it is (a bot answers if they are gone or take too long),
// and runs the minigames. GuestSession is a friend's browser: it plays what the host sends, in
// order, and answers the questions for its own seat.

import { botAnswer } from './engine/bots';
import { Game, type GameIO, type Step } from './engine/engine';
import { ranking, type Answer, type Ask, type GameEvent, type GameState, type MgOutcome, type MgRequest } from './engine/state';
import { hasGuestMinigame, mgFromFriend, mgFromHost, runGuestMinigame, runMinigame, type MgToGuest, type MgToHost } from './minigames/flow';
import type { MgPlayer } from './minigames/types';
import type { PartyGuest, PartyHost } from './net/net';
import { startMusic } from './sfx';
import { writeSave } from './store';
import type { Seat } from './types';
import { $, AUTO, SPEED, rand, wait } from './util';
import { openPodium } from './ui/podium';
import { Presenter, toast } from './ui/presenter';
import { setView } from './view3d/stage';

export type FullState = GameState & { step: Step; seed: number };

/** Messages of a running evening (inside the net layer's `g`). */
export type GameMsg =
  | { k: 'start'; seats: Seat[]; st: FullState; you: number }
  | { k: 'ev'; ev: GameEvent; st: GameState }
  | { k: 'watch'; p: number; a: Ask }
  | { k: 'ask'; id: number; a: Ask }
  | { k: 'askEnd'; id: number }
  | MgToGuest;
export type GameReply = { k: 'answer'; id: number; ans: Answer } | MgToHost;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface SessionEnd { pick: 'again' | 'title'; st: GameState; me: number }

function netNote(text: string) {
  const n = $('#netNote');
  n.textContent = text;
  n.hidden = false;
  window.setTimeout(() => { if (n.textContent === text) n.hidden = true; }, 5000);
}

// =====================================================================
export class HostSession {
  pres: Presenter;
  game: Game;
  private askId = 0;
  private pending = new Map<number, { p: number; a: Ask; done: (x: Answer) => void }>();
  ended: Promise<SessionEnd>;
  private endRes!: (e: SessionEnd) => void;

  constructor(public seats: Seat[], public me: number, st: FullState, public net: PartyHost | null) {
    this.pres = new Presenter(seats, me, st.rules.board);
    this.ended = new Promise((r) => { this.endRes = r; });
    const io: GameIO = {
      emit: (ev) => this.emit(ev),
      ask: (p, a) => this.ask(p, a),
      minigame: (req) => this.minigame(req),
      checkpoint: (s) => { if (!net) writeSave({ seats: this.seats, me, st: s }); },
    };
    this.game = new Game(st, io);
    if (net) {
      net.onGame = (seat, m) => this.fromFriend(seat, m as GameReply);
      net.onPresence = (seat, online) => this.presence(seat, online);
      net.onNote = (t) => netNote(t);
      seats.forEach((_, i) => { if (seats[i].kind === 'remote') net.sendTo(i, { k: 'start', seats: this.seatsFor(), st: clone(st), you: i } satisfies GameMsg); });
    }
  }

  private seatsFor() { return this.seats.map((s) => ({ ...s })); }

  async run() {
    setView(this.pres.view);
    startMusic('board');
    this.pres.sync(this.game.st);
    await this.game.run();
    if (this.game.stopped) return;
    const st = this.game.st;
    const order = ranking(st);
    const pick = await openPodium({ seats: this.seats, st, bonus: this.pres.bonus, order, me: this.me, boardName: this.pres.board.name, canAgain: true });
    this.endRes({ pick, st, me: this.me });
  }

  stop() { this.game.stopped = true; this.pres.cancelAsk(); }

  private async emit(ev: GameEvent) {
    const st = this.game.st;
    this.net?.broadcast({ k: 'ev', ev, st: clone(st) } satisfies GameMsg);
    // a broken animation must never stop the evening
    try { await this.pres.play(ev, st); } catch (e) { console.error(e); this.pres.sync(st); }
  }

  private remoteOnline(p: number) { return !!this.net && this.seats[p].kind === 'remote' && this.net.isOnline(p); }

  private async ask(p: number, a: Ask): Promise<Answer> {
    const s = this.seats[p], st = this.game.st;
    if (s.kind === 'local' && !AUTO) {
      this.net?.broadcast({ k: 'watch', p, a } satisfies GameMsg);
      return this.pres.ask(p, a);
    }
    this.net?.broadcast({ k: 'watch', p, a } satisfies GameMsg);
    this.pres.watch(p, a);
    if (this.remoteOnline(p)) {
      const id = ++this.askId;
      const ans = await new Promise<Answer>((done) => {
        this.pending.set(id, { p, a, done });
        this.net!.sendTo(p, { k: 'ask', id, a } satisfies GameMsg);
        window.setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); this.net?.sendTo(p, { k: 'askEnd', id } satisfies GameMsg); done(botAnswer(st, p, a, 'normal')); } }, 60000 * Math.max(SPEED, 0.2));
      });
      return ans;
    }
    await wait(a.q === 'roll' ? rand(500, 900) : rand(650, 1100));
    return botAnswer(st, p, a, s.kind === 'bot' ? s.bot : 'normal');
  }

  private presence(seat: number, online: boolean) {
    this.seats[seat].away = !online;
    this.pres.seats[seat].away = !online;
    this.pres.renderRank(false);
    if (!online) {
      // a bot answers what was waiting for them
      for (const [id, q] of this.pending) if (q.p === seat) { this.pending.delete(id); q.done(botAnswer(this.game.st, seat, q.a, 'normal')); }
    } else {
      this.net?.sendTo(seat, { k: 'start', seats: this.seatsFor(), st: clone(this.game.st as FullState), you: seat } satisfies GameMsg);
    }
  }

  private fromFriend(seat: number, m: GameReply) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'answer') {
      const q = this.pending.get(m.id);
      if (!q || q.p !== seat) return;
      this.pending.delete(m.id);
      q.done(m.ans ?? {});
    } else if (m.k === 'mgReady' || m.k === 'mgIn') mgFromFriend(seat, m);
  }

  private async minigame(req: MgRequest): Promise<MgOutcome> {
    const players: MgPlayer[] = req.seats.map((s, k) => {
      const seat = this.seats[s];
      return { seat: s, name: seat.name, color: seat.color, acc: seat.acc, feat: seat.feat, team: req.teams[k], bot: seat.kind === 'bot' ? seat.bot : null };
    });
    const who = req.seats.map((s) => (this.seats[s].kind === 'local' ? 'me' : this.seats[s].kind === 'bot' ? 'bot' : 'remote') as 'me' | 'bot' | 'remote');
    const net = this.net;
    const res = await runMinigame({
      id: req.id, players, who, seed: req.seed, kind: req.kind,
      net: net ? { broadcast: (m) => net.broadcast(m), online: (seat) => net.isOnline(seat) } : undefined,
    });
    startMusic('board');
    return {
      coins: req.seats.map((_, k) => res?.rows.find((r) => r.i === k)?.coins ?? 0),
      win: req.seats.map((_, k) => !!res?.rows.find((r) => r.i === k)?.win),
    };
  }
}

// =====================================================================
export class GuestSession {
  pres: Presenter | null = null;
  seats: Seat[] = [];
  me = -1;
  st: GameState | null = null;
  private q: (() => Promise<void>)[] = [];
  private busy = false;
  private asking: number | null = null;
  ended: Promise<SessionEnd>;
  private endRes!: (e: SessionEnd) => void;
  onStart: (() => void) | null = null;

  constructor(public net: PartyGuest) {
    this.ended = new Promise((r) => { this.endRes = r; });
  }

  onMsg(m: GameMsg) {
    if (!m || typeof m !== 'object') return;
    switch (m.k) {
      case 'start': {
        const fresh = !this.pres;
        this.seats = m.seats.map((s, i) => ({ ...s, kind: i === m.you ? 'local' : s.kind === 'local' ? 'remote' : s.kind }));
        this.me = m.you;
        this.st = m.st;
        if (fresh) {
          this.pres = new Presenter(this.seats, this.me, m.st.rules.board);
          this.onStart?.();
          setView(this.pres.view);
          startMusic('board');
        }
        this.q = [];
        this.pres!.sync(m.st);
        if (!fresh) toast('Wieder verbunden.', 'var(--cyan)');
        break;
      }
      case 'ev': {
        const { ev, st } = m;
        this.st = st;
        if (ev.k === 'end') { this.push(async () => { await this.pres!.play(ev, st); await this.podium(st, ev.order); }); break; }
        this.push(() => this.pres!.play(ev, st));
        break;
      }
      case 'watch': if (m.p !== this.me) this.push(async () => { this.pres!.watch(m.p, m.a); }); break;
      case 'ask': this.push(async () => {
        this.asking = m.id;
        const ans = AUTO ? (await wait(300), botAnswer(this.st!, this.me, m.a, 'normal')) : await this.pres!.ask(this.me, m.a);
        if (this.asking === m.id) { this.asking = null; this.net.send({ k: 'answer', id: m.id, ans } satisfies GameReply); }
      }); break;
      case 'askEnd': if (this.asking === m.id) { this.asking = null; this.pres?.cancelAsk(); toast('Zu lange überlegt: Ein Bot hat für dich entschieden.', 'var(--pink)'); this.kick(); } break;
      default:
        if (typeof m.k === 'string' && m.k.startsWith('mg')) {
          mgFromHost(m as MgToGuest);
          if (m.k === 'mgOpen') this.push(async () => {
            if (!hasGuestMinigame()) return;
            await runGuestMinigame(this.me, (r) => this.net.send(r));
            startMusic('board');
          });
        }
    }
  }

  private push(fn: () => Promise<void>) {
    this.q.push(fn);
    void this.pump();
  }
  /** An abandoned ask: the queue must go on. */
  private kick() { this.busy = false; void this.pump(); }
  private async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.q.length) {
      const fn = this.q.shift()!;
      if (this.pres) this.pres.hurry = this.q.length > 3;
      const mine = fn;
      try { await mine(); } catch (e) { console.warn(e); }
      if (!this.busy) return;
    }
    this.busy = false;
  }

  private async podium(st: GameState, order: number[]) {
    const pick = await openPodium({ seats: this.seats, st, bonus: this.pres!.bonus, order, me: this.me, boardName: this.pres!.board.name, canAgain: false });
    this.endRes({ pick, st, me: this.me });
  }
}
