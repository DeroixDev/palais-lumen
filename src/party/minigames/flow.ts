// The shared minigame flow, the same for every minigame: intro card (with the game running as
// a demo behind it), "Üben", "Bereit" per player, countdown, play, "Schluss!", results with
// coins, back to the board.
//
// Who simulates: solo and on the host, this browser runs the MinigameDef (fixed 60 Hz steps;
// inputs from the keyboard/touch, the bots and the friends' controllers). Online, the host sends
// snapshots (~20 Hz, host-only `_` fields stripped) and the friends draw them interpolated, so
// any MinigameDef works online without extra code.

import { MG_TYPE_NAME } from '../types';
import { sfx, startMusic } from '../sfx';
import { charSVG, coinSVG } from '../ui/avatars';
import { EdgeTracker, enableInput, readPad, setTouch, type Pad } from '../ui/input';
import { $, $$, AUTO, SPEED, esc, mulberry, reduced, sleep, tween, wait } from '../util';
import { clearLabels, getView, resize, setView, type View } from '../view3d/stage';
import { getMinigame } from './index';
import { NO_INPUT, type MgCtx, type MgFx, type MgInput, type MgPlayer, type MgResult, type MgSetup, type MgView, type MinigameDef } from './types';

const STEP = 1 / 60;
const SNAP_MS = 50;

export type MgKind = 'round' | 'duel' | 'buddy' | 'free';
export type Who = 'me' | 'bot' | 'remote';

export interface MgOpen { k: 'mgOpen'; id: string; players: MgPlayer[]; seed: number; kind: MgKind }
/** Host → friends. */
export type MgToGuest =
  | MgOpen
  | { k: 'mgReady'; ready: boolean[] }
  | { k: 'mgGo' }
  | { k: 'mgSnap'; t: number; s: unknown; fx: MgFx[] }
  | { k: 'mgEnd'; res: MgResult }
  | { k: 'mgClose' };
/** Friend → host. */
export type MgToHost = { k: 'mgReady'; on: boolean } | { k: 'mgIn'; p: Pad };

export interface HostOpts {
  id: string;
  players: MgPlayer[];
  who: Who[];
  seed: number;
  kind: MgKind;
  /** Online: send to all friends; whether a seat's friend is connected. */
  net?: { broadcast(m: MgToGuest): void; online(seat: number): boolean };
}

// ---------------- simulation ----------------
class Sim<S> {
  s: S;
  ctx: MgCtx;
  fxq: MgFx[] = [];
  acc = 0;
  inputs: MgInput[];
  edges = new EdgeTracker();
  constructor(public def: MinigameDef<S>, public setup: MgSetup) {
    const rng = mulberry(setup.seed);
    this.ctx = { setup, rng, time: 0, fx: (e) => { this.fxq.push(e); } };
    this.s = def.init(this.ctx);
    this.inputs = setup.players.map(() => ({ ...NO_INPUT }));
    this.edges.reset(setup.players.length);
  }
  get limit() { return this.setup.mode === 'practice' ? Math.min(20, this.def.seconds) : this.def.seconds; }
  done() { return this.ctx.time >= this.limit - 1e-6 || (this.setup.mode !== 'demo' && !!this.def.over?.(this.s, this.ctx)); }
  /** Advances by real time dt (scaled by the test speed-up); pad(i) null = bot. */
  advance(dt: number, pad: (i: number) => Pad | null) {
    this.acc += dt / SPEED;
    let n = 0;
    while (this.acc >= STEP && n < 240 && !this.done()) {
      this.acc -= STEP;
      n++;
      for (let i = 0; i < this.inputs.length; i++) {
        const p = pad(i);
        if (p) this.edges.input(i, p, this.inputs[i]);
        else this.inputs[i] = this.def.bot(this.s, i, this.ctx);
      }
      this.def.step(this.s, STEP, this.inputs, this.ctx);
      this.ctx.time += STEP;
    }
    if (n >= 240) this.acc = 0;
  }
  takeFx() { const f = this.fxq; this.fxq = []; return f; }
}

const strip = (s: unknown) => JSON.parse(JSON.stringify(s, (k, v) => (k && k[0] === '_' ? undefined : v)));

/** Interpolates two snapshots: numbers lerp, arrays of objects with `id` match by id. */
function interp(a: unknown, b: unknown, k: number): unknown {
  if (typeof b === 'number') return typeof a === 'number' ? a + (b - a) * k : b;
  if (Array.isArray(b)) {
    if (!Array.isArray(a)) return b;
    if (b.length && b[0] && typeof b[0] === 'object' && 'id' in (b[0] as object)) {
      const m = new Map(a.map((x) => [(x as { id: unknown }).id, x]));
      return b.map((x) => { const y = m.get((x as { id: unknown }).id); return y === undefined ? x : interp(y, x, k); });
    }
    return a.length === b.length ? b.map((x, i) => interp(a[i], x, k)) : b;
  }
  if (b && typeof b === 'object') {
    if (!a || typeof a !== 'object') return b;
    const o: Record<string, unknown> = {};
    for (const key of Object.keys(b)) o[key] = interp((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], k);
    return o;
  }
  return b;
}

// ---------------- the run ----------------
type Phase = 'intro' | 'practice' | 'count' | 'play' | 'end' | 'results' | 'closed';

let current: MgRun | null = null;
let guestOpen: MgOpen | null = null;
let guestBuf: MgToGuest[] = [];

class MgRun {
  def: MinigameDef<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  view: MgView<unknown>;
  stageView: View;
  prevView: View | null;
  phase: Phase = 'intro';
  demo: Sim<unknown> | null = null;
  prac: Sim<unknown> | null = null;
  sim: Sim<unknown> | null = null;
  ready: boolean[];
  readyT: number[] = [];
  res: MgResult | null = null;
  lastState: unknown = null;
  snaps: { t: number; s: unknown }[] = [];
  rt = 0;
  lastSnap = 0;
  lastSend = 0;
  sentPad = '';
  remotePads = new Map<number, Pad>();
  doneRes: ((r: MgResult) => void) | null = null;
  closeRes: (() => void) | null = null;
  shownTime = '';
  isSpec: boolean;

  constructor(
    public role: 'host' | 'guest',
    public id: string,
    public players: MgPlayer[],
    public seed: number,
    public kind: MgKind,
    public me: number,
    public who: Who[],
    public net: HostOpts['net'] | null,
    public send: ((m: MgToHost) => void) | null,
  ) {
    this.def = getMinigame(id);
    this.view = this.def.view(this.setup('play'));
    this.ready = players.map(() => false);
    this.isSpec = me < 0;
    this.prevView = getView();
    this.stageView = { scene: this.view.scene, cam: this.view.cam, update: (dt, t) => this.update(dt, t) };
  }

  setup(mode: MgSetup['mode']): MgSetup {
    return { players: this.players, mode, seed: mode === 'play' ? this.seed : (this.seed ^ 0x5f3759df) + (mode === 'demo' ? 1 : 2) * ((Math.random() * 1e6) | 0), type: this.def.type };
  }

  // ---------- frame ----------
  update(dt: number, t: number) {
    const v = this.view;
    if (this.phase === 'intro' || (this.isSpec && this.phase === 'practice')) {
      if (!this.demo || this.demo.done()) this.demo = new Sim(this.def, this.setup('demo'));
      this.demo.advance(dt, () => null);
      this.demo.takeFx();
      v.frame(this.demo.s, dt, t, -1);
      return;
    }
    if (this.phase === 'practice' && this.prac) {
      const P = this.prac;
      P.advance(dt, (i) => (i === this.me && !AUTO ? readPad() : null));
      for (const e of P.takeFx()) v.fx(e, this.me);
      v.frame(P.s, dt, t, this.me);
      this.hud(P.s, P.ctx.time, P.limit);
      if (P.done()) this.endPractice();
      return;
    }
    if (this.role === 'host' && this.sim) {
      const S = this.sim;
      if (this.phase === 'play') {
        S.advance(dt, (i) => this.padOf(i));
        const fx = S.takeFx();
        for (const e of fx) v.fx(e, this.me);
        if (this.net) {
          this.pendingFx.push(...fx);
          const now = performance.now();
          if (now - this.lastSnap >= SNAP_MS || S.done()) { this.lastSnap = now; this.net.broadcast({ k: 'mgSnap', t: S.ctx.time, s: strip(S.s), fx: this.pendingFx }); this.pendingFx = []; }
        }
        this.hud(S.s, S.ctx.time, S.limit);
        if (S.done()) void this.finish();
      }
      v.frame(S.s, dt, t, this.me);
      return;
    }
    if (this.role === 'guest') {
      if (this.phase === 'play') this.sendPad();
      const s = this.guestState(dt);
      if (s) { v.frame(s, dt, t, this.me); if (this.phase === 'play') this.hud(s, this.rt, this.def.seconds); }
    }
  }
  pendingFx: MgFx[] = [];

  private padOf(i: number): Pad | null {
    const w = this.who[i];
    if (w === 'me') return AUTO ? null : readPad();
    if (w === 'remote') {
      const seat = this.players[i].seat;
      if (this.net && !this.net.online(seat)) return null;
      return this.remotePads.get(i) ?? null;
    }
    return null;
  }

  private sendPad() {
    if (this.isSpec || !this.send) return;
    const p = readPad();
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)},${+p.a},${+p.b},${p.ca},${p.cb},${p.cl},${p.cr}`;
    const now = performance.now();
    if (key !== this.sentPad || now - this.lastSend > 250) {
      this.sentPad = key;
      this.lastSend = now;
      this.send({ k: 'mgIn', p: { ...p } });
    }
  }

  private guestState(dt: number): unknown {
    const sn = this.snaps;
    if (!sn.length) return this.lastState;
    const latest = sn[sn.length - 1].t;
    this.rt += dt / SPEED;
    const lag = 0.1 / Math.max(SPEED, 0.25);
    if (this.rt > latest) this.rt = latest;
    if (this.rt < latest - lag * 2.5) this.rt = latest - lag;
    let i = sn.length - 1;
    while (i > 0 && sn[i - 1].t > this.rt) i--;
    const b = sn[i], a = sn[Math.max(0, i - 1)];
    const k = b.t > a.t ? Math.min(1, Math.max(0, (this.rt - a.t) / (b.t - a.t))) : 1;
    this.lastState = a === b ? b.s : interp(a.s, b.s, k);
    return this.lastState;
  }

  private hud(s: unknown, time: number, limit: number) {
    const left = Math.max(0, Math.ceil(limit - time - 1e-6));
    const txt = String(left);
    if (txt !== this.shownTime) {
      this.shownTime = txt;
      const tm = $('#mgTimer');
      tm.textContent = txt;
      tm.classList.toggle('low', left <= 5);
      if (left <= 3 && left > 0 && this.phase === 'play') sfx.beep(false);
    }
    const box = $('#mgScores');
    if (box.childElementCount !== this.players.length) {
      box.innerHTML = this.players.map((p, i) => `<div class="sc${i === this.me ? ' me' : ''}" style="--pc:${p.color}"><i>${esc(p.name[0] ?? '?')}</i>${esc(p.name)}<b></b></div>`).join('');
    }
    this.players.forEach((_, i) => {
      const el = box.children[i] as HTMLElement, sc = this.def.score(s, i), b = el.querySelector('b')!;
      if (b.textContent !== sc.v) b.textContent = sc.v;
      el.classList.toggle('out', !!sc.out);
    });
  }

  // ---------- intro ----------
  open() {
    current = this;
    startMusic('mg');
    clearLabels(this.view.scene);
    setView(this.stageView);
    document.body.classList.add('full', 'in-mg');
    resize();
    $('#mgName').textContent = this.def.name;
    $('#mgTimer').textContent = String(this.def.seconds);
    $('#mgScores').innerHTML = '';
    this.showIntro();
  }

  showIntro() {
    const d = this.def, setup = this.setup('play'), me = this.me;
    this.phase = 'intro';
    this.demo = null;
    this.view.celebrate(null);
    enableInput(false);
    setTouch(null);
    document.body.classList.remove('practice', 'solo', 'mg-live');
    const chips: [string, string][] = [[`${d.seconds} Sekunden`, 'c']];
    if (d.coin) chips.unshift(['Münz-Minispiel', 'y']);
    if (this.kind === 'duel') chips.unshift(['Duell-Feld', 'o']);
    if (this.kind === 'buddy') chips.unshift(['Kumpel-Duell', 'o']);
    if (this.kind === 'free') chips.unshift(['Probe · zählt nicht', 'l']);
    else chips.push([d.online === 'gut' ? 'Online gut' : 'Online ok', 'l']);
    $('#mgHead').innerHTML = `<span class="mg-kind">${MG_TYPE_NAME[d.type]}</span>${chips.map(([t, k]) => `<span class="chip ${k}">${t}</span>`).join('')}`;
    $('#mgTitle').innerHTML = `<span>${esc(d.name)}</span>`;
    $('#mgSub').textContent = d.card.sub;
    $('#mgTeams').innerHTML = this.teamsHTML();
    $('#mgRules').innerHTML = d.card.rules(setup).map((r) => `<li>${r}</li>`).join('');
    const c = d.card.controls(setup, Math.max(0, me));
    $('#mgCtrls').innerHTML = `<div class="ctrl"><b>Tastatur</b><span>${c.keys}</span></div><div class="ctrl"><b>Touch</b><span>${c.touch}</span></div>`;
    const spec = $('#mgSpec');
    spec.hidden = !this.isSpec;
    spec.textContent = this.isSpec ? 'Du spielst diesmal nicht mit und schaust zu.' : '';
    $('#btnLeave').hidden = this.kind !== 'free';
    $('#btnPractice').hidden = this.isSpec;
    const br = $('#btnReady');
    br.hidden = this.isSpec;
    this.renderReady();
    const ov = $('#ovIntro');
    ov.classList.add('open');
    ov.scrollTop = 0;
    sfx.whoosh();
    if (!reduced) $('#mgCard').animate([{ transform: 'translateX(-60px) rotate(-3deg)', opacity: 0 }, { transform: 'translateX(6px) rotate(.5deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1)' });
    if (!this.isSpec) br.focus({ preventScroll: true });
    if (this.role === 'host') this.scheduleReady();
    if (AUTO && me >= 0 && !this.ready[me]) window.setTimeout(() => { if (this.phase === 'intro' && !this.ready[me]) this.toggleReady(); }, 400 * SPEED + 100);
  }

  private teamsHTML() {
    const P = this.players, t = this.def.type;
    const fig = (i: number) => charSVG(P[i]);
    const grp = (lbl: string, idx: number[], col: string) => `<div><span class="team-lbl">${lbl}</span><div class="team" style="--tcol:${col}">${idx.map(fig).join('')}</div></div>`;
    const by = (team: number) => P.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0);
    if (t === '1v3') return `${grp('Allein', by(0), 'var(--acid)')}<span class="vs">VS</span>${grp('Team', P.map((_, i) => i).filter((i) => P[i].team !== 0), 'var(--pink)')}`;
    if (t === '2v2') return `${grp('Team Links', by(0), 'var(--acid)')}<span class="vs">VS</span>${grp('Team Rechts', by(1), 'var(--pink)')}`;
    if (P.length === 2) return `${grp(esc(P[0].name), [0], P[0].color)}<span class="vs">VS</span>${grp(esc(P[1].name), [1], P[1].color)}`;
    return grp('Alle gegen alle', P.map((_, i) => i), 'rgba(255,255,255,.3)');
  }

  renderReady() {
    const rd = $('#ready');
    rd.innerHTML = this.players.map((p, i) => {
      const ok = this.ready[i];
      const txt = ok ? 'bereit' : this.who[i] === 'bot' ? 'liest' : i === this.me ? (this.phase === 'practice' ? 'übt' : 'übt oder drückt Bereit') : 'liest oder übt';
      return `<li class="${ok ? 'ok' : ''}" style="--pc:${p.color}"><i></i>${esc(p.name)} <em>· ${txt}</em></li>`;
    }).join('');
    const br = $('#btnReady');
    const mine = this.me >= 0 && this.ready[this.me];
    br.classList.toggle('on', mine);
    br.textContent = mine ? 'Warte auf alle …' : 'Bereit!';
  }

  private scheduleReady() {
    this.readyT.forEach(clearTimeout);
    this.readyT = [];
    this.players.forEach((_, i) => {
      if (this.ready[i]) return;
      const w = this.who[i];
      const offline = w === 'remote' && this.net && !this.net.online(this.players[i].seat);
      if (w === 'bot' || offline) this.readyT.push(window.setTimeout(() => this.setReady(i, true), (700 + i * 550 + Math.random() * 500) * SPEED));
      else if (w === 'remote') this.readyT.push(window.setTimeout(() => this.setReady(i, true), 25000 * Math.max(SPEED, 0.2)));
    });
  }

  toggleReady() {
    if (this.me < 0 || this.phase !== 'intro') return;
    sfx.pop();
    const on = !this.ready[this.me];
    if (this.role === 'host') this.setReady(this.me, on);
    else { this.ready[this.me] = on; this.renderReady(); this.send?.({ k: 'mgReady', on }); }
  }

  setReady(i: number, on: boolean) {
    if (this.phase !== 'intro' && this.phase !== 'practice') return;
    if (this.ready[i] === on) return;
    this.ready[i] = on;
    if (on && i !== this.me) sfx.pop();
    this.renderReady();
    this.net?.broadcast({ k: 'mgReady', ready: [...this.ready] });
    if (this.role === 'host' && this.ready.every(Boolean) && this.phase === 'intro') void this.go();
  }

  practice() {
    if (this.isSpec || this.phase !== 'intro') return;
    sfx.pop();
    $('#ovIntro').classList.remove('open');
    this.phase = 'practice';
    this.prac = new Sim(this.def, this.setup('practice'));
    this.view.celebrate(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.classList.add('practice', 'mg-live');
    this.liveControls();
    this.shownTime = '';
    this.renderReady();
  }

  endPractice() {
    if (this.phase !== 'practice') return;
    this.prac = null;
    $('#mgScores').innerHTML = '';
    this.showIntro();
  }

  private liveControls() {
    const setup = this.setup('play');
    const me = this.me;
    setTouch(me >= 0 ? this.def.card.touch(setup, me) : null);
    const meter = me >= 0 ? this.def.card.meter?.(setup, me) ?? null : null;
    document.body.classList.toggle('solo', !!meter);
    if (meter) $('#turboLbl').textContent = meter;
    enableInput(me >= 0);
  }

  // ---------- play ----------
  async go() {
    if (this.phase !== 'intro' && this.phase !== 'practice') return;
    this.readyT.forEach(clearTimeout);
    if (this.role === 'host') this.net?.broadcast({ k: 'mgGo' });
    $('#ovIntro').classList.remove('open');
    this.prac = null;
    document.body.classList.remove('practice');
    this.phase = 'count';
    this.view.celebrate(null);
    const S = new Sim(this.def, this.setup('play'));
    if (this.role === 'host') this.sim = S;
    else { this.lastState = strip(S.s); this.snaps = []; this.rt = 0; }
    this.shownTime = '';
    this.hud(S.s, 0, S.limit);
    this.liveControls();
    document.body.classList.add('mg-live');
    (document.activeElement as HTMLElement | null)?.blur?.();
    await wait(250);
    await countdown();
    if (this.phase !== 'count') return;
    this.phase = 'play';
    this.lastSnap = 0;
  }

  async finish(res?: MgResult) {
    if (this.phase === 'end' || this.phase === 'results' || this.phase === 'closed') return;
    this.phase = 'end';
    if (this.role === 'host') {
      res = this.def.result(this.sim!.s, this.sim!.ctx);
      this.net?.broadcast({ k: 'mgEnd', res });
    }
    this.res = res!;
    enableInput(false);
    setTouch(null);
    document.body.classList.remove('mg-live', 'solo');
    sfx.whistle();
    $('#count').innerHTML = '<b class="end">Schluss!</b>';
    await sleep(1200 * Math.max(SPEED, 0.4));
    $('#count').innerHTML = '';
    if (this.phase !== 'end') return;
    const win = this.players.map((_, i) => !!this.res!.rows.find((r) => r.i === i)?.win);
    this.view.celebrate(win);
    this.phase = 'results';
    this.showResults();
  }

  showResults() {
    const res = this.res!, P = this.players, coins = this.kind === 'round' || this.kind === 'free';
    $('#resK').textContent = `${this.def.name} · Ergebnis`;
    $('#resTitle').innerHTML = `<span>${esc(res.title)}</span>`;
    const rows = [...res.rows].sort((a, b) => b.score - a.score || +b.win - +a.win);
    $('#resList').innerHTML = rows.map((r, n) => {
      const p = P[r.i];
      const gain = coins ? `<span class="res-gain">+<b data-v="${r.coins}">0</b>${coinSVG}</span>` : `<span class="res-gain">${r.win ? 'Sieg' : ''}</span>`;
      return `<li class="res-row${r.win ? ' win' : ''}" style="--pc:${p.color}"><span class="r-n">${n + 1}</span><span class="r-ava">${charSVG(p, true)}</span><span class="r-txt"><span class="r-name">${esc(p.name)}</span><em>${esc(r.note)}</em></span>${gain}</li>`;
    }).join('');
    $('#ovRes').classList.add('open');
    const iWon = this.me >= 0 && !!res.rows.find((r) => r.i === this.me)?.win;
    if (iWon) sfx.fanfare(); else sfx.star();
    $$('#resList b[data-v]').forEach((b) => { const v = Number(b.dataset.v); if (v) void tween(0.9, (k) => { b.textContent = String(Math.round(v * k)); }); });
    const rn = $<HTMLButtonElement>('#resNext');
    rn.textContent = this.kind === 'free' ? 'Zurück' : 'Weiter zum Brett';
    rn.disabled = true;
    window.setTimeout(() => { rn.disabled = false; if (this.phase === 'results') rn.focus({ preventScroll: true }); }, 1300 * Math.max(SPEED, 0.3));
    if (this.role === 'host') this.doneRes?.(res);
  }

  /** Results closed here: the host goes on; a friend waits for the host. */
  next() {
    if (this.phase !== 'results') return;
    $('#ovRes').classList.remove('open');
    if (this.role === 'host') this.close();
    else { this.phase = 'closed'; $('#count').innerHTML = ''; this.close(); }
  }

  close() {
    if (current !== this) return;
    current = null;
    this.phase = 'closed';
    this.readyT.forEach(clearTimeout);
    if (this.role === 'host') this.net?.broadcast({ k: 'mgClose' });
    $('#ovRes').classList.remove('open');
    $('#ovIntro').classList.remove('open');
    $('#count').innerHTML = '';
    enableInput(false);
    setTouch(null);
    document.body.classList.remove('full', 'in-mg', 'practice', 'solo', 'mg-live', 'ctl-joy');
    clearLabels(this.view.scene);
    setView(this.prevView);
    resize();
    this.view.dispose?.();
    this.closeRes?.();
  }

  // ---------- messages ----------
  onFriend(seat: number, m: MgToHost) {
    const i = this.players.findIndex((p) => p.seat === seat);
    if (i < 0 || this.who[i] !== 'remote') return;
    if (m.k === 'mgReady') this.setReady(i, !!m.on);
    else if (m.k === 'mgIn' && m.p && typeof m.p === 'object') {
      const p = m.p;
      this.remotePads.set(i, { x: +p.x || 0, y: +p.y || 0, a: !!p.a, b: !!p.b, ca: p.ca | 0, cb: p.cb | 0, cl: p.cl | 0, cr: p.cr | 0 });
    }
  }
  onHost(m: MgToGuest) {
    if (m.k === 'mgReady') { this.ready = m.ready.map(Boolean); if (this.phase === 'intro' || this.phase === 'practice') this.renderReady(); }
    else if (m.k === 'mgGo') void this.go();
    else if (m.k === 'mgSnap') {
      if (this.phase === 'count') this.phase = 'play';
      if (this.snaps.length && m.t < this.snaps[this.snaps.length - 1].t) return;
      if (!this.snaps.length) this.rt = Math.max(0, m.t - 0.1);
      this.snaps.push({ t: m.t, s: m.s });
      if (this.snaps.length > 8) this.snaps.shift();
      for (const e of m.fx ?? []) this.view.fx(e, this.me);
    } else if (m.k === 'mgEnd') {
      const last = this.snaps[this.snaps.length - 1];
      if (last) { this.snaps = [last]; this.rt = last.t; this.lastState = last.s; }
      void this.finish(m.res);
    } else if (m.k === 'mgClose') {
      if (this.phase === 'results' || this.phase === 'end') { this.closeRes?.(); }
      this.close();
    }
  }
}

async function countdown() {
  const box = $('#count');
  for (const s of ['3', '2', '1', 'Los!']) {
    box.innerHTML = `<b>${s}</b>`;
    sfx.beep(s === 'Los!');
    const d = 700 * Math.max(SPEED, 0.4);
    if (!reduced) (box.firstChild as HTMLElement).animate([{ transform: 'scale(2.2) rotate(-8deg)', opacity: 0 }, { transform: 'scale(1) rotate(-4deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1) rotate(-4deg)', opacity: 1, offset: 0.8 }, { transform: 'scale(.8) rotate(-4deg)', opacity: 0 }], { duration: d, fill: 'forwards' });
    await sleep(s === 'Los!' ? 450 * Math.max(SPEED, 0.4) : d);
  }
  box.innerHTML = '';
}

// ---------------- buttons (bound once) ----------------
let bound = false;
function bindButtons() {
  if (bound) return;
  bound = true;
  $('#btnReady').addEventListener('click', () => current?.toggleReady());
  $('#btnPractice').addEventListener('click', () => current?.practice());
  $('#endPractice').addEventListener('click', () => current?.endPractice());
  $('#resNext').addEventListener('click', () => current?.next());
  $('#btnLeave').addEventListener('click', () => { const c = current; if (c && c.kind === 'free') { c.res = null; c.close(); } });
}

// ---------------- public API ----------------
/** Solo or host: runs a minigame and resolves with the result once the results are closed here. */
export function runMinigame(o: HostOpts): Promise<MgResult | null> {
  bindButtons();
  const me = o.who.indexOf('me');
  const run = new MgRun('host', o.id, o.players, o.seed, o.kind, me, o.who, o.net ?? null, null);
  o.net?.broadcast({ k: 'mgOpen', id: o.id, players: o.players, seed: o.seed, kind: o.kind });
  return new Promise((resolve) => {
    let result: MgResult | null = null;
    run.doneRes = (r) => {
      result = r;
      // nobody here to click "Weiter": tests and spectators go on by themselves
      if (AUTO || me < 0) window.setTimeout(() => run.next(), (AUTO ? 1500 : 6000) * Math.max(SPEED, 0.3));
      else window.setTimeout(() => run.next(), 30000);
    };
    run.closeRes = () => resolve(run.res ? result : null);
    run.open();
  });
}

/** Host: a friend's minigame message. */
export function mgFromFriend(seat: number, m: MgToHost) {
  if (current?.role === 'host') current.onFriend(seat, m);
}

/** Friend: a minigame message from the host. mgOpen is kept until runGuestMinigame() picks it up. */
export function mgFromHost(m: MgToGuest) {
  if (m.k === 'mgOpen') { guestOpen = m; guestBuf = []; return; }
  if (current?.role === 'guest') current.onHost(m);
  else if (guestOpen) guestBuf.push(m);
}
export const hasGuestMinigame = () => !!guestOpen;

/** Friend: shows the minigame the host opened (call when the board show has caught up). */
export function runGuestMinigame(mySeat: number, send: (m: MgToHost) => void): Promise<void> {
  bindButtons();
  const o = guestOpen;
  guestOpen = null;
  if (!o) return Promise.resolve();
  const me = o.players.findIndex((p) => p.seat === mySeat);
  const who: Who[] = o.players.map((p, i) => (i === me ? 'me' : p.bot ? 'bot' : 'remote'));
  const run = new MgRun('guest', o.id, o.players, o.seed, o.kind, me, who, null, send);
  return new Promise((resolve) => {
    run.closeRes = () => resolve();
    run.open();
    const buf = guestBuf;
    guestBuf = [];
    for (const m of buf) run.onHost(m);
    if (AUTO) {
      const iv = window.setInterval(() => {
        if (run.phase === 'closed') { clearInterval(iv); return; }
        if (run.phase === 'results' && !($('#resNext') as HTMLButtonElement).disabled) run.next();
      }, 300);
    }
  });
}

/** Practice from the title menu: everything local, nothing counts. */
export function runFreeMinigame(id: string, players: MgPlayer[]): Promise<MgResult | null> {
  return runMinigame({ id, players, who: players.map((p, i) => (i === 0 && !p.bot ? 'me' : 'bot')), seed: (Math.random() * 2 ** 31) | 0, kind: 'free' });
}

export const minigameRunning = () => !!current;
/** Test hook: current phase. */
export const minigamePhase = () => current?.phase ?? 'none';
