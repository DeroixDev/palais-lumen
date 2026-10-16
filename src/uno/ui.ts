// The table on screen. Gets a View from the table (local or over the network), draws it, and
// turns what changed into motion.
//
// Motion system (all of it transform + opacity on the compositor):
// - Every card in my hand is one persistent element keyed by card id. The hand is never rebuilt:
//   new cards get an element, gone cards lose theirs, and the fan positions are computed from
//   cached geometry and written as transforms (a CSS transition with a spring curve re-fans).
// - Geometry (deck, pile, hand, seats) is measured once and cached; it is measured again only on
//   a resize or when the seats change. An update reads layout first and then only writes.
// - Everything that happens in one update is laid out on one timeline: each event gets a start
//   time after the previous one (a play, a draw, the next play ...), flights are Web Animations
//   with exact delays, and the side effects (sounds, the landing on the pile, counters, the turn
//   marker) run from a single rAF-driven queue at their times. No setTimeout chains.
// - Flights are FLIP: an element is put where it ends up and animated from where it starts.
//   Cards that land in my hand fly as the hand element itself (a draw flips it over in 3D);
//   cards that land on the pile fly in a fixed layer and are swapped for the pile card.

import { CARD_COLORS, SPRITE, backEl, cardEl, prepareCards } from './cards';
import { COLOR_NAME, hintDelay, type Action, type Card, type Color, type GameEvent } from './engine';
import { glitterBurst } from './fx';
import { PLAYER_COLORS } from './profile';
import { isMusicOn, setMuted, setMusicOn, sfx, unlock } from './sfx';
import type { TableClock, TableView } from './table';

export interface Client {
  send(a: Action): void;
  /** May start the next round (solo, or the host online). */
  owner: boolean;
  online: boolean;
  /** Name of whoever starts the next round (shown to friends). */
  ownerName: string;
}

export interface UIOpts {
  muted: boolean;
  onMute(m: boolean): void;
  onLeave(): void;
  /** After a match: back to the lobby (online: the room). */
  onLobby(): void;
  onEvent?(e: GameEvent, v: TableView): void;
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ORDER: Record<string, number> = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const KORD: Record<string, number> = { num: 0, skip: 10, rev: 11, d2: 12, wild: 13, d4: 14 };
const sortKey = (c: Card) => ORDER[c.c] * 100 + (c.k === 'num' ? c.n! : KORD[c.k]);
const COLOR_KEYS: Color[] = ['r', 'y', 'g', 'b'];
const pcol = (i: number) => PLAYER_COLORS[i] ?? PLAYER_COLORS[0];
const initial = (n: string) => esc([...n.trim()][0]?.toUpperCase() ?? '?');
/** Most backs drawn per draw flight, and most cards shown in an opponent's hand. */
const FAN_MAX = 8;
const HAND_MAX = 30;

function avatar(name: string, color: number, cls = '') {
  return `<span class="ava ${cls}" style="--pc:${pcol(color)}" aria-hidden="true">${initial(name)}</span>`;
}

/** Positions of opponents around the table, clockwise from my left. */
function seatPositions(n: number): string[] {
  if (n === 1) return ['top'];
  if (n === 2) return ['left', 'right'];
  return ['left', 'top', 'right'];
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (x: number) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};

// ---------------- easing ----------------

/** cubic-bezier(x1, y1, x2, y2) as a function (for sampling flight paths). */
function bez(x1: number, y1: number, x2: number, y2: number) {
  const X = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const Y = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  const dX = (t: number) => 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - (X(t) - x) / d));
    }
    return Y(t);
  };
}
const easeFlight = bez(0.3, 0.6, 0.25, 1);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A damped spring as a CSS linear() easing (falls back to an overshooting bezier). */
function spring(zeta: number): string {
  const fallback = zeta < 0.7 ? 'cubic-bezier(.3,1.4,.45,1)' : 'cubic-bezier(.25,1.2,.4,1)';
  if (!CSS.supports?.('transition-timing-function', 'linear(0, 1)')) return fallback;
  const wd = Math.sqrt(1 - zeta * zeta);
  const T = 7 / zeta;
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (T * i) / 40;
    const x = i === 40 ? 1 : 1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + (zeta / wd) * Math.sin(wd * t));
    pts.push(x.toFixed(4));
  }
  return `linear(${pts.join(', ')})`;
}

// ---------------- geometry ----------------

interface Box { x: number; y: number; w: number; h: number }
interface Pose { x: number; y: number; r: number; s: number }
interface Fan { x: number; y: number; a: number; z: number }
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

interface Geo {
  deck: Box;
  disc: Box;
  hand: Box;
  ring: Box;
  seats: Map<number, Box>;
  /** Width of a card in my hand. */
  cw: number;
}

interface Sample { off: number; x: number; y: number; r: number; sx: number; sy: number; ry: number; o: number }
interface PathOpts { arc?: number; flip?: boolean; squash?: boolean; spin?: number; fade?: boolean; pop?: number }

/** A curved flight between two poses (global coordinates of the card centre), as keyframe samples. */
function flightPath(a: Pose, b: Pose, o: PathOpts): Sample[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // control point: off the straight line, on the upper side
  let nx = -dy / len, ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  const k = (o.arc ?? 0.22) * len;
  const c = { x: (a.x + b.x) / 2 + nx * k, y: (a.y + b.y) / 2 + ny * k };
  const end = o.squash ? 0.8 : 1;
  const N = 14;
  const out: Sample[] = [];
  const pop = o.pop ?? 0.1;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const t = easeFlight(u);
    const m = 1 - t;
    const x = m * m * a.x + 2 * m * t * c.x + t * t * b.x;
    const y = m * m * a.y + 2 * m * t * c.y + t * t * b.y;
    const s = a.s + (b.s - a.s) * t + pop * Math.sin(Math.PI * t) * b.s;
    const r = a.r + (b.r - a.r) * t + (o.spin ?? 0) * Math.sin(Math.PI * t);
    out.push({ off: u * end, x, y, r, sx: s, sy: s, ry: o.flip ? 180 * (1 - smooth(0.12, 0.72, t)) : 0, o: o.fade ? 1 - smooth(0.75, 1, u) : 1 });
  }
  if (o.squash) {
    // land: a tiny squash, then settle
    const tilt = b.r + (b.r >= 0 ? 2.5 : -2.5);
    out.push({ off: 0.9, x: b.x, y: b.y + b.s * 2, r: tilt, sx: b.s * 1.07, sy: b.s * 0.93, ry: 0, o: 1 });
    out.push({ off: 1, x: b.x, y: b.y, r: b.r, sx: b.s, sy: b.s, ry: 0, o: 1 });
  }
  return out;
}

const tf = (s: Sample, x: number, y: number, r: number, flip: boolean) =>
  `${flip ? 'perspective(1100px) ' : ''}translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)${flip ? ` rotateY(${s.ry.toFixed(1)}deg)` : ''} scale(${s.sx.toFixed(4)}, ${s.sy.toFixed(4)})`;

/** Tempo of all table animations (1 = the original timings). */
const PACE = 1.3;
const fanTf = (f: Fan) => `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) rotate(${f.a.toFixed(2)}deg)`;

// ---------------- the table ----------------

export class TableUI {
  v: TableView | null = null;
  private el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector<T>(s)!;
  private slots = new Map<number, HTMLButtonElement>();
  private opps = new Map<number, HTMLElement>();
  /** Cards each seat shows right now (lags the game state while cards are in the air). */
  private shown = new Map<number, number>();
  private pileEls: HTMLElement[] = [];
  private inAir = new Set<number>();
  private focusIdx = 0;
  private hoverId = -1;
  private mid = 0;
  private modal: 'color' | 'target' | 'result' | 'leave' | null = null;
  private pickFor: Card | null = null;
  private geo: Geo | null = null;
  private geoDirty = true;
  private rows = 1;
  private cursor = 0;
  private queue: { at: number; fn: () => void; fx: boolean }[] = [];
  private qRaf = 0;
  private turnShown = -1;
  private wasMyTurn = false;
  private ptrAngle = 90;
  private dir: 1 | -1 = 1;
  private spin: Animation | null = null;
  private ro: ResizeObserver;
  private clockBase = { round: 0, match: 0, at: 0, running: false, moves: 0, matchMoves: 0 };
  private clockTimer = 0;
  private resultClock: TableClock | null = null;

  constructor(root: HTMLElement, private client: Client, private opts: UIOpts) {
    prepareCards();
    this.el = document.createElement('div');
    this.el.className = 'tbl';
    this.el.style.setProperty('--spring', spring(0.6));
    this.el.style.setProperty('--spring-soft', spring(0.8));
    this.el.innerHTML = `${SPRITE}
<header class="tbar">
  <a class="back" href="./index.html"><span aria-hidden="true">←</span> <span class="back-t">Alle Spiele</span></a>
  <div class="tmid"><h1 class="ttitle"><span class="tt1">Unser</span><span class="tt2">Uno</span><span class="tt3">Spiel</span></h1><div class="tinfo"><b class="t-round">Runde 1</b><span class="t-target"></span></div></div>
  <div class="tbtns">
    <button class="ib b-music" type="button" aria-pressed="true" title="Musik an/aus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path class="x" d="M3 3l18 18"/></svg><span class="sr">Musik</span></button>
    <button class="ib b-mute" type="button" aria-pressed="false" title="Ton an/aus (M)"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="wav" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M16 9l6 6M22 9l-6 6"/></svg><span class="sr">Ton</span></button>
    <button class="ib b-leave" type="button">Verlassen</button>
  </div>
</header>
<div class="felt">
  <div class="felt-deco" aria-hidden="true"></div>
  <div class="ringwrap" aria-hidden="true"><div class="ringpulse"><div class="ringspin"><svg class="ring" viewBox="0 0 200 200"><circle class="ring-band" cx="100" cy="100" r="90" fill="none" stroke="currentColor" stroke-width="9"/><circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" stroke-width="2.6" stroke-dasharray="5 11" opacity=".9"/><g class="cw">${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 100 100)" d="M92 2l17 8-17 8z" fill="currentColor"/>`).join('')}</g><g class="ccw">${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 100 100)" d="M108 2l-17 8 17 8z" fill="currentColor"/>`).join('')}</g></svg></div></div>
    <div class="pointer"><div class="ptr"><svg viewBox="0 0 40 40"><path d="M2 6l36 14L2 34l9-14z"/></svg></div></div>
  </div>
  <div class="opps"></div>
  <div class="mid">
    <p class="turnlbl" aria-hidden="true"><span class="tl-dot"></span><b class="tl-name"></b></p>
    <button class="pile draw" type="button" aria-label="Karte ziehen (Z)">
      <span class="halo" aria-hidden="true"></span>
      <span class="stack"><span class="card back s3"></span><span class="card back s2"></span><span class="card back s1"></span></span>
      <span class="draw-lbl">Ziehen</span><span class="draw-n"></span>
    </button>
    <div class="pile disc" aria-live="polite"><div class="cur" aria-hidden="true"><i class="cur-ring"></i><i class="cur-pulse"></i></div><div class="disc-cards"></div><span class="cur-lbl"></span></div>
    <div class="pend" aria-hidden="true"></div>
  </div>
  <p class="status" aria-live="polite"></p>
  <div class="toast" aria-live="polite"></div>
  <aside class="tclock" aria-label="Rundenstatistik">
    <div class="tc-row"><span class="tc-l">Rundenzeit</span><b class="tc-v tc-time">00:00</b></div>
    <div class="tc-row"><span class="tc-l">Züge gesamt</span><b class="tc-v tc-moves">0</b></div>
    <div class="tc-row tc-sub"><span class="tc-l">Spiel</span><b class="tc-v tc-mtime">00:00</b><span class="tc-l tc-dot">·</span><b class="tc-v tc-mmoves">0</b><span class="tc-l">Züge</span></div>
  </aside>
</div>
<div class="mebar">
  <div class="me-id"></div>
  <div class="acts">
    <button class="act b-catch" type="button" hidden></button>
    <button class="act b-pass" type="button" hidden>Behalten</button>
    <button class="act b-uno" type="button" disabled><span>UNO!</span></button>
  </div>
</div>
<div class="hand" role="group" aria-label="Deine Hand"><span class="hand-glow" aria-hidden="true"></span><span class="slot-probe" aria-hidden="true"></span></div>
<div class="fly" aria-hidden="true"></div>
<div class="callout" aria-hidden="true"><div class="co-band"></div><div class="co-big"></div><div class="co-sub"></div></div>
<div class="modal" hidden><div class="sheet" role="dialog" aria-modal="true"></div></div>`;
    root.appendChild(this.el);

    this.q('.b-mute').addEventListener('click', () => this.toggleMute());
    const mb = this.q('.b-music');
    const syncMusic = () => { mb.classList.toggle('off', !isMusicOn()); mb.setAttribute('aria-pressed', String(isMusicOn())); };
    syncMusic();
    mb.addEventListener('click', () => { unlock(); setMusicOn(!isMusicOn()); syncMusic(); });
    this.q('.b-leave').addEventListener('click', () => this.openLeave());
    this.q('.pile.draw').addEventListener('click', () => this.draw());
    this.q('.b-pass').addEventListener('click', () => this.send({ t: 'pass' }));
    this.q('.b-uno').addEventListener('click', () => this.send({ t: 'uno' }));
    this.q('.b-catch').addEventListener('click', () => { if (this.v?.open != null) this.send({ t: 'catch', target: this.v.open }); });
    const hand = this.q('.hand');
    hand.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLButtonElement>('.slot');
      if (slot) this.tryPlay(Number(slot.dataset.id));
    });
    hand.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const slot = (e.target as HTMLElement).closest<HTMLButtonElement>('.slot');
      const id = slot ? Number(slot.dataset.id) : -1;
      if (id !== this.hoverId) { this.hoverId = id; this.layoutHand(); }
    });
    hand.addEventListener('pointerleave', () => { if (this.hoverId !== -1) { this.hoverId = -1; this.layoutHand(); } });
    hand.addEventListener('keydown', (e) => this.handKey(e));
    this.q('.modal').addEventListener('keydown', (e) => this.modalKey(e));
    this.keyFn = (e: KeyboardEvent) => this.globalKey(e);
    addEventListener('keydown', this.keyFn);
    this.ro = new ResizeObserver(() => {
      // ResizeObserver runs right after layout: measuring here costs nothing extra
      this.geoDirty = true;
      this.measure();
      this.layoutHand(true);
      this.pointTo(this.turnShown, true);
    });
    this.ro.observe(this.el);
    this.ro.observe(this.q('.felt'));
    this.setMuteBtn();
    this.startSpin();
    this.clockTimer = window.setInterval(() => this.tickClock(), 1000);
  }

  private keyFn: (e: KeyboardEvent) => void;

  destroy() {
    removeEventListener('keydown', this.keyFn);
    this.ro.disconnect();
    cancelAnimationFrame(this.qRaf);
    clearTimeout(this.qTimer);
    clearInterval(this.clockTimer);
    this.queue = [];
    this.el.remove();
  }

  private send(a: Action) {
    unlock();
    this.client.send(a);
  }

  // ---------------- input ----------------

  private myTurn() {
    const v = this.v;
    return !!v && v.turn === v.me && (v.phase === 'play' || v.phase === 'drawn');
  }

  private draw() {
    unlock();
    if (!this.myTurn() || this.v!.phase !== 'play') { this.shake(this.q('.pile.draw .stack')); return; }
    this.send({ t: 'draw' });
  }

  private tryPlay(id: number) {
    unlock();
    const v = this.v;
    if (!v) return;
    const c = v.hand.find((h) => h.id === id);
    if (!c) return;
    if (!v.can.includes(id)) {
      const slot = this.slots.get(id);
      if (slot) this.shake(slot.querySelector<HTMLElement>('.card'));
      sfx.nope();
      return;
    }
    if (c.c === 'w') return this.openColor(c);
    if (v.rules.sevenZero && c.k === 'num' && c.n === 7 && v.hand.length > 1) return this.openTarget(c);
    this.send({ t: 'play', id });
  }

  private shake(el: HTMLElement | null, strong = false) {
    if (!el || reduced.matches) return;
    const a = strong ? 14 : 6;
    const r = strong ? 3 : 0;
    el.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${-a}px, ${r}px) rotate(${-r}deg)` },
        { transform: `translate(${a}px, ${-r}px) rotate(${r}deg)` },
        { transform: `translate(${-a / 2}px, 0) rotate(${-r / 2}deg)` },
        { transform: `translate(${a / 3}px, 0) rotate(0deg)` },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration: strong ? 420 : 260, easing: 'ease-out', composite: 'add' },
    );
  }

  private sortedHand() {
    return [...(this.v?.hand ?? [])].sort((a, b) => sortKey(a) - sortKey(b));
  }

  private handKey(e: KeyboardEvent) {
    const hand = this.sortedHand();
    if (!hand.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      this.focusIdx = Math.max(0, Math.min(hand.length - 1, this.focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      this.slots.get(hand[this.focusIdx].id)?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.focusIdx = e.key === 'Home' ? 0 : hand.length - 1;
      this.slots.get(hand[this.focusIdx].id)?.focus();
    }
  }

  private globalKey(e: KeyboardEvent) {
    if (this.modal || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'd') { e.preventDefault(); this.draw(); }
    else if (k === 'u') { e.preventDefault(); if (this.v?.canUno) this.send({ t: 'uno' }); }
    else if (k === 'e') { e.preventDefault(); if (this.v?.open != null && this.v.open !== this.v.me) this.send({ t: 'catch', target: this.v.open }); }
    else if (k === 'b' && this.v?.phase === 'drawn' && this.myTurn()) { e.preventDefault(); this.send({ t: 'pass' }); }
    else if (k === 'm') { e.preventDefault(); this.toggleMute(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement).closest('.hand, .sheet')) {
      const hand = this.sortedHand();
      if (!hand.length) return;
      e.preventDefault();
      const first = hand.findIndex((c) => this.v!.can.includes(c.id));
      this.focusIdx = first >= 0 ? first : 0;
      this.slots.get(hand[this.focusIdx].id)?.focus();
    }
  }

  private toggleMute() {
    this.opts.muted = !this.opts.muted;
    setMuted(this.opts.muted);
    this.opts.onMute(this.opts.muted);
    this.setMuteBtn();
    if (!this.opts.muted) { unlock(); sfx.flick(); }
  }

  private setMuteBtn() {
    const b = this.q('.b-mute');
    b.classList.toggle('off', this.opts.muted);
    b.setAttribute('aria-pressed', String(this.opts.muted));
    b.title = this.opts.muted ? 'Ton an (M)' : 'Ton aus (M)';
  }

  // ---------------- modals ----------------

  private openModal(kind: NonNullable<TableUI['modal']>, html: string, focus = 'button') {
    this.modal = kind;
    const m = this.q('.modal');
    const sheet = this.q('.sheet');
    sheet.className = 'sheet sh-' + kind;
    sheet.innerHTML = html;
    m.hidden = false;
    if (!reduced.matches) sheet.animate([{ opacity: 0, transform: 'translateY(24px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.25,1)' });
    sheet.querySelector<HTMLElement>(focus)?.focus();
  }

  private closeModal() {
    this.modal = null;
    this.pickFor = null;
    this.q('.modal').hidden = true;
    const hand = this.sortedHand();
    const c = hand[Math.min(this.focusIdx, hand.length - 1)];
    if (c && document.activeElement === document.body) this.slots.get(c.id)?.focus({ preventScroll: true });
  }

  private modalKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && (this.modal === 'color' || this.modal === 'target' || this.modal === 'leave')) { e.preventDefault(); this.closeModal(); return; }
    const btns = [...this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick')];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      btns[(i + d + btns.length) % btns.length].focus();
    } else if (/^[1-4]$/.test(e.key) && this.modal === 'color') {
      btns[Number(e.key) - 1]?.click();
    }
  }

  private openColor(c: Card) {
    this.pickFor = c;
    const v = this.v!;
    const counts: Record<Color, number> = { r: 0, y: 0, g: 0, b: 0 };
    for (const h of v.hand) if (h.c !== 'w') counts[h.c]++;
    this.openModal('color', `
      <h2 class="sh-title">Welche Farbe?</h2>
      <div class="picks">${COLOR_KEYS.map((k, i) => `<button class="pick pc-${k}" type="button" data-c="${k}" style="--cc:${CARD_COLORS[k]}"><span class="pk-n">${i + 1}</span><b>${COLOR_NAME[k]}</b><small>${counts[k]} auf der Hand</small></button>`).join('')}</div>
      <button class="ghost cancel" type="button">Abbrechen</button>`, '.pick');
    this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.addEventListener('click', () => {
      const card = this.pickFor;
      this.closeModal();
      if (!card) return;
      this.send({ t: 'play', id: card.id, color: b.dataset.c as Color });
    }));
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openTarget(c: Card) {
    this.pickFor = c;
    const v = this.v!;
    const others = v.seats.map((s, i) => ({ s, i })).filter((x) => x.i !== v.me);
    this.openModal('target', `
      <h2 class="sh-title">Mit wem tauschen?</h2>
      <p class="sh-sub">Die 7: Du gibst deine Hand ab und bekommst die andere.</p>
      <div class="picks tg">${others.map(({ s, i }) => `<button class="pick" type="button" data-i="${i}">${avatar(s.name, s.color)}<b>${esc(s.name)}</b><small>${s.count} ${s.count === 1 ? 'Karte' : 'Karten'}</small></button>`).join('')}</div>
      <button class="ghost cancel" type="button">Abbrechen</button>`, '.pick');
    this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.addEventListener('click', () => {
      const card = this.pickFor;
      this.closeModal();
      if (card) this.send({ t: 'play', id: card.id, target: Number(b.dataset.i) });
    }));
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openLeave() {
    this.openModal('leave', `
      <h2 class="sh-title">Tisch verlassen?</h2>
      <p class="sh-sub">${this.client.online ? (this.client.owner ? 'Du bist Gastgeber: Für alle endet das Spiel.' : 'Ein Bot übernimmt deinen Platz.') : 'Die laufende Partie wird nicht gewertet.'}</p>
      <div class="row"><button class="btn-main yes" type="button">Verlassen</button><button class="ghost cancel" type="button">Weiterspielen</button></div>`, '.cancel');
    this.q('.sheet .yes').addEventListener('click', () => { this.closeModal(); this.opts.onLeave(); });
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openResult(v: TableView) {
    const r = v.result;
    if (!r) return;
    const w = v.seats[r.winner];
    const meWon = r.winner === v.me;
    const final = r.final;
    const order = v.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.score - a.s.score);
    const target = v.rules.target;
    const title = final ? (meWon ? 'Du gewinnst das Spiel' : `${esc(w.name)} gewinnt das Spiel`) : meWon ? 'Runde an dich' : `Runde an ${esc(w.name)}`;
    const ck = this.resultClock ?? v.clock;
    const btn = this.client.owner
      ? final
        ? `<button class="btn-main go" type="button">Revanche</button><button class="ghost to-lobby" type="button">${this.client.online ? 'Zurück in den Raum' : 'Zur Lobby'}</button>`
        : `<button class="btn-main go" type="button">Nächste Runde</button>`
      : `<p class="wait">${final ? 'Gleich geht es weiter: ' : ''}${esc(this.client.ownerName)} startet die nächste ${final ? 'Partie' : 'Runde'}.</p>`;
    this.openModal('result', `
      <p class="sh-brand" aria-hidden="true"><span>Unser</span><b>Uno</b><span>Spiel</span></p>
      <p class="sh-kick">${final ? 'Spielende' : `Runde ${v.round}`}</p>
      <h2 class="sh-title big">${title}</h2>
      <p class="sh-pts"><b>+${r.points}</b> Punkte${final ? '' : ` · Ziel ${target}`}</p>
      ${ck ? `<div class="sh-clock"><span><small>Rundenzeit</small><b>${mmss(ck.roundMs)}</b></span><span><small>Züge in der Runde</small><b>${ck.moves}</b></span>${final ? `<span><small>Spielzeit</small><b>${mmss(ck.matchMs)}</b></span><span><small>Züge im Spiel</small><b>${ck.matchMoves}</b></span>` : ''}</div>` : ''}
      <ol class="score">${order.map(({ s, i }) => `<li class="${i === r.winner ? 'won' : ''}${i === v.me ? ' me' : ''}">
        ${avatar(s.name, s.color)}<span class="sc-name">${esc(s.name)}${i === v.me ? ' <small>(du)</small>' : ''}</span>
        <span class="sc-hand">${i === r.winner ? 'leer' : `${r.hands[i]} in der Hand`}</span>
        <span class="sc-bar"><i style="transform:scaleX(${Math.min(1, s.score / target).toFixed(3)})"></i></span>
        <b class="sc-tot">${s.score}</b></li>`).join('')}</ol>
      <div class="row">${btn}</div>`, '.go');
    this.q('.sheet').querySelector('.go')?.addEventListener('click', () => { this.closeModal(); this.send({ t: 'next' }); });
    this.q('.sheet').querySelector('.to-lobby')?.addEventListener('click', () => { this.closeModal(); this.opts.onLobby(); });
  }

  // ---------------- the timeline queue ----------------

  /** Runs fn at time t (performance.now ms) from the queue. fx: may be dropped when very late (hidden tab). */
  private at(t: number, fn: () => void, fx = false) {
    this.queue.push({ at: t, fn, fx });
    this.wake();
  }

  /**
   * One timer for the whole queue, aimed at the next due item, which then runs in a rAF (so its DOM
   * writes land in the frame being drawn). No rAF loop polling every frame: main-thread frames only
   * happen when something is actually due, the compositor runs the animations in between.
   */
  private qTimer = 0;
  private qAt = Infinity;
  private wake() {
    if (this.qRaf || !this.queue.length) return;
    let next = Infinity;
    for (const x of this.queue) next = Math.min(next, x.at);
    if (next >= this.qAt && this.qTimer) return;
    clearTimeout(this.qTimer);
    this.qAt = next;
    const wait = next - performance.now() - 10;
    const go = () => { this.qTimer = 0; this.qAt = Infinity; if (!this.qRaf) this.qRaf = requestAnimationFrame(this.pump); };
    if (wait <= 0) go();
    else this.qTimer = window.setTimeout(go, wait);
  }

  private pump = () => {
    this.qRaf = 0;
    const now = performance.now();
    const due = this.queue.filter((x) => x.at <= now + 8).sort((a, b) => a.at - b.at);
    if (due.length) this.queue = this.queue.filter((x) => x.at > now + 8);
    for (const d of due) {
      if (d.fx && now - d.at > 1500) continue;
      try { d.fn(); } catch (e) { console.error(e); }
    }
    this.wake();
  };

  // ---------------- geometry ----------------

  private measure(): Geo {
    if (!this.geoDirty && this.geo) return this.geo;
    const seats = new Map<number, Box>();
    for (const [i, el] of this.opps) seats.set(i, boxOf(el.querySelector('.o-fan')!));
    this.geo = {
      deck: boxOf(this.q('.pile.draw .stack')),
      disc: boxOf(this.q('.disc-cards')),
      hand: boxOf(this.q('.hand')),
      ring: boxOf(this.q('.ringwrap')),
      seats,
      cw: this.q('.slot-probe').offsetWidth || 80,
    };
    this.geoDirty = false;
    return this.geo;
  }

  private seatCenter(i: number) {
    const g = this.geo!;
    if (i === this.v?.me) { const h = g.hand; return { x: h.x + h.w / 2, y: h.y + h.h - g.cw * 0.9 }; }
    const b = g.seats.get(i);
    return b ? center(b) : { x: g.ring.x + g.ring.w / 2, y: g.ring.y };
  }

  /** Fan positions of my hand: one arc, or two rows when it gets long; neighbours of the hovered card make room. */
  private fanLayout(): Map<number, Fan> {
    const out = new Map<number, Fan>();
    const g = this.geo;
    const hand = this.sortedHand();
    const n = hand.length;
    if (!g || !n) return out;
    const W = g.hand.w;
    const cw = g.cw;
    // narrow screens go to two rows sooner, so every card keeps a readable corner
    const minStep = cw * (W < 560 ? 0.5 : 0.36);
    const perRow = Math.max(1, Math.floor((W - cw) / minStep) + 1);
    const rows = Math.ceil(n / perRow);
    const per = Math.ceil(n / rows);
    const hov = hand.findIndex((c) => c.id === this.hoverId);
    hand.forEach((c, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const j = i - row * per;
      // a single arc tilts its outer cards outwards, so keep a margin for their corners
      const room = W - cw - (rows > 1 ? cw * 0.12 : cw * 0.9);
      const step = inRow > 1 ? Math.min(cw * 0.72, room / (inRow - 1)) : 0;
      const mid = (inRow - 1) / 2;
      const off = j - mid;
      const ang = rows > 1 ? off * 1.2 : off * Math.min(4, 36 / Math.max(inRow, 1));
      let x = off * step;
      if (hov >= 0 && Math.floor(hov / per) === row && i !== hov && step < cw * 0.7) {
        const d = i - hov;
        x += Math.sign(d) * (cw * 0.7 - step) * 0.8 * Math.exp(-(Math.abs(d) - 1) * 0.55);
      }
      const k = Math.min(2.2, 40 / Math.max(inRow * inRow, 1)) * (cw / 100);
      const y = (rows > 1 ? 0 : (Math.abs(off) ** 2 - mid * mid) * k) - (rows - 1 - row) * cw * 0.62;
      out.set(c.id, { x, y, a: ang, z: i + 1 });
    });
    if (rows !== this.rows) {
      this.rows = rows;
      this.q('.hand').style.setProperty('--rows', String(rows));
      // the hand got taller: the table above moved, measure again next time
      this.geoDirty = true;
    }
    return out;
  }

  /** Box of a slot before its transform (left 50%, bottom 8px of the hand). */
  private slotBox(): Box {
    const g = this.geo!;
    return { x: g.hand.x + g.hand.w / 2 - g.cw / 2, y: g.hand.y + g.hand.h - 8 - g.cw * 1.5, w: g.cw, h: g.cw * 1.5 };
  }

  /** Writes the fan transforms (a spring transition does the easing). instant: no transition (resize). */
  private layoutHand(instant = false) {
    const pos = this.fanLayout();
    for (const [id, f] of pos) {
      const s = this.slots.get(id);
      if (!s) continue;
      const t = fanTf(f);
      if (instant) s.classList.add('snap');
      if (s.style.transform !== t) s.style.transform = t;
      if (!s.classList.contains('air')) s.style.zIndex = String(f.z);
    }
    if (instant) requestAnimationFrame(() => { for (const s of this.slots.values()) s.classList.remove('snap'); });
  }

  /** Converts a global pose into the local frame of a slot's inner .lift element at fan position f. */
  private toSlotLocal(f: Fan, p: { x: number; y: number; r: number }) {
    const b = this.slotBox();
    const cw = this.geo!.cw;
    const O = { x: cw / 2, y: cw * 1.95 };
    const a = (-f.a * Math.PI) / 180;
    const qx = p.x - b.x - O.x - f.x, qy = p.y - b.y - O.y - f.y;
    const lx = O.x + Math.cos(a) * qx - Math.sin(a) * qy;
    const ly = O.y + Math.sin(a) * qx + Math.cos(a) * qy;
    return { x: lx - cw / 2, y: ly - cw * 0.75, r: p.r - f.a };
  }

  /** Global centre of a slot's card at fan position f. */
  private slotCenter(f: Fan) {
    const b = this.slotBox();
    const cw = this.geo!.cw;
    const a = (f.a * Math.PI) / 180;
    return { x: b.x + cw / 2 + f.x + 1.2 * cw * Math.sin(a), y: b.y + cw * 1.95 + f.y - 1.2 * cw * Math.cos(a) };
  }

  // ---------------- flights ----------------

  /** A card flying in the fixed layer, placed on box (where it ends), from pose a to pose b (global centres). */
  private flyLayer(make: () => HTMLElement, box: Box, a: Pose, b: Pose, at: number, dur: number, o: PathOpts, onLand?: () => void) {
    if (reduced.matches || dur <= 0) { if (onLand) this.at(at, onLand); return; }
    const el = document.createElement('div');
    el.className = 'fl' + (o.flip ? ' flip' : '');
    el.style.cssText = `left:${box.x.toFixed(1)}px;top:${box.y.toFixed(1)}px;width:${box.w.toFixed(1)}px;height:${box.h.toFixed(1)}px;--cw:${box.w.toFixed(1)}px`;
    el.appendChild(make());
    if (o.flip) el.appendChild(backEl('bf'));
    const c = center(box);
    // opacity only when it fades: an opacity below 1 would flatten the 3D flip
    const kf = flightPath(a, b, o).map((s) => (o.fade ? { offset: s.off, opacity: s.o, transform: tf(s, s.x - c.x, s.y - c.y, s.r, !!o.flip) } : { offset: s.off, transform: tf(s, s.x - c.x, s.y - c.y, s.r, !!o.flip) }));
    const anim = el.animate(kf, { duration: dur, delay: Math.max(0, at - performance.now()), easing: 'linear', fill: 'both' });
    this.q('.fly').appendChild(el);
    let done = false;
    const land = () => { if (done) return; done = true; onLand?.(); el.remove(); };
    anim.onfinish = land;
    anim.oncancel = land;
  }

  /** A card arriving in my hand: the slot's inner element flies in from a global pose, flipping face up. */
  private flySlot(id: number, f: Fan, from: Pose, at: number, dur: number, flip: boolean) {
    const s = this.slots.get(id);
    if (!s || reduced.matches || dur <= 0) return;
    const lift = s.querySelector<HTMLElement>('.lift')!;
    let bf: HTMLElement | null = null;
    if (flip) { bf = backEl('bf'); lift.appendChild(bf); }
    s.classList.add('air');
    if (flip) s.classList.add('flip');
    s.style.zIndex = String(200 + f.z);
    const end = this.slotCenter(f);
    const samples = flightPath(from, { x: end.x, y: end.y, r: f.a, s: 1 }, { arc: 0.18, flip, spin: -8, pop: 0.08 });
    const kf = samples.map((sm) => {
      const l = this.toSlotLocal(f, sm);
      return { offset: sm.off, transform: tf(sm, l.x, l.y, l.r, flip) };
    });
    const anim = lift.animate(kf, { duration: dur, delay: Math.max(0, at - performance.now()), easing: 'linear', fill: 'backwards' });
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      bf?.remove();
      s.classList.remove('air', 'flip');
      const z = this.fanLayout().get(id)?.z;
      if (z) s.style.zIndex = String(z);
    };
    anim.onfinish = land;
    anim.oncancel = land;
  }

  // ---------------- update ----------------

  update(v: TableView) {
    const prev = this.v;
    // the table sends a fresh seat no history: a round that has only just been dealt still gets dealt on screen
    if (!prev && !v.events.length && v.clock?.moves === 0 && v.pile.length === 1 && v.phase === 'play') {
      v = { ...v, events: [{ k: 'deal', round: v.round, dealer: v.dealer }, { k: 'flip', card: v.pile[0] }] };
    }
    const newMatch = v.mid !== this.mid;
    // read phase: geometry (cached), where my hand's cards are right now
    const g = this.measure();
    const oldFan = this.fanLayout();
    const myPlays = new Map<number, Pose>();
    for (const e of v.events) {
      if (e.k === 'play' && e.p === v.me) {
        // where the card is, from the fan maths (no layout read): its fan place plus the hover/playable lift
        const f = oldFan.get(e.card.id);
        const s = this.slots.get(e.card.id);
        if (f && s) {
          const c = this.slotCenter(f);
          const lift = (s.matches(':hover') && matchMedia('(hover: hover)').matches ? 0.26 : s.classList.contains('can') && this.el.classList.contains('hints') ? 0.09 : 0) * g.cw * 1.5;
          const a = (f.a * Math.PI) / 180;
          myPlays.set(e.card.id, { x: c.x + Math.sin(a) * lift, y: c.y - Math.cos(a) * lift, r: f.a, s: g.cw / g.disc.w });
        }
      }
    }
    // write phase
    this.mid = v.mid;
    this.v = v;
    if (newMatch && this.modal === 'result') this.closeModal();
    if (this.modal === 'result' && (v.phase === 'play' || v.phase === 'drawn')) this.closeModal();
    if ((this.modal === 'color' || this.modal === 'target') && (!this.pickFor || !v.can.includes(this.pickFor.id))) this.closeModal();
    this.syncClock(v);

    this.q('.t-round').textContent = `Runde ${v.round}`;
    this.q('.t-target').textContent = `bis ${v.rules.target} Punkte`;
    if (this.renderOpps(v)) { this.geoDirty = true; this.measure(); }
    this.renderMidNow(v);
    this.renderMe(v);
    this.animate(v, prev, myPlays, oldFan);
  }

  /** Opponent panels (persistent). Returns true when panels were added, removed or moved. */
  private renderOpps(v: TableView) {
    const n = v.seats.length;
    const others: number[] = [];
    for (let k = 1; k < n; k++) others.push((v.me + k) % n);
    const pos = seatPositions(others.length);
    const box = this.q('.opps');
    box.dataset.n = String(others.length);
    let changed = false;
    for (const [i, el] of this.opps) if (!others.includes(i)) { el.remove(); this.opps.delete(i); changed = true; }
    others.forEach((i, k) => {
      const s = v.seats[i];
      let el = this.opps.get(i);
      if (!el) {
        el = document.createElement('div');
        el.className = 'opp';
        el.dataset.seat = String(i);
        el.innerHTML = `<span class="o-spot" aria-hidden="true"></span><div class="o-in"><div class="o-head"><span class="o-ava"></span><span class="o-txt"><b class="o-name"></b><span class="o-sub"></span></span></div><span class="o-count"></span><span class="o-tag">Am Zug</span><span class="o-flash"></span></div><div class="o-fan" aria-hidden="true"></div>`;
        box.appendChild(el);
        this.opps.set(i, el);
        changed = true;
      }
      if (el.dataset.pos !== pos[k]) { el.dataset.pos = pos[k]; changed = true; }
      if (el.style.getPropertyValue('--pc') !== pcol(s.color)) el.style.setProperty('--pc', pcol(s.color));
      const ava = el.querySelector('.o-ava')!;
      const key = `${s.name}|${s.color}`;
      if (ava.getAttribute('data-k') !== key) { ava.setAttribute('data-k', key); ava.innerHTML = avatar(s.name, s.color); el.querySelector('.o-name')!.textContent = s.name; }
      const sub = `${s.score} Pkt${s.away ? ' · weg, Bot spielt' : s.bot ? ' · Bot' : ''}`;
      const subEl = el.querySelector('.o-sub')!;
      if (subEl.textContent !== sub) subEl.textContent = sub;
      el.classList.toggle('open', v.open === i);
      el.setAttribute('aria-label', `${s.name}: ${s.count} ${s.count === 1 ? 'Karte' : 'Karten'}, ${s.score} Punkte${v.turn === i ? ', ist dran' : ''}`);
    });
    return changed;
  }

  /** The little fan of backs on an opponent's panel (persistent minis, re-fanned by transforms). */
  private setFan(i: number, count: number) {
    const el = this.opps.get(i);
    if (!el) return;
    count = Math.max(0, count);
    this.shown.set(i, count);
    const fan = el.querySelector<HTMLElement>('.o-fan')!;
    // their hand as they hold it, seen from across the table: every card a back, fanned like mine
    // (spacing, tilt and arc come from CSS vars, so a resize needs no JS)
    const show = Math.min(count, HAND_MAX);
    while (fan.childElementCount < show) fan.appendChild(backEl('mini'));
    while (fan.childElementCount > show) fan.lastElementChild!.remove();
    const mid = (show - 1) / 2;
    fan.style.setProperty('--n', String(Math.max(1, show)));
    fan.style.setProperty('--ang', `${Math.min(7, 64 / Math.max(show, 1)).toFixed(2)}deg`);
    fan.style.setProperty('--arcf', (0.22 / Math.max(1, mid * mid)).toFixed(4));
    [...fan.children].forEach((m, j) => {
      const off = j - mid;
      const me = m as HTMLElement;
      me.style.setProperty('--o', off.toFixed(1));
      me.style.setProperty('--o2', (off * off - mid * mid).toFixed(2));
    });
    const ct = el.querySelector('.o-count')!;
    if (ct.textContent !== String(count)) ct.textContent = String(count);
    el.classList.toggle('uno', count === 1);
  }

  private renderMidNow(v: TableView) {
    this.q('.draw-n').textContent = String(v.drawCount);
    const drawBtn = this.q('.pile.draw');
    const my = this.myTurn();
    drawBtn.classList.toggle('hint', my && v.phase === 'play' && (v.can.length === 0 || v.pending > 0));
    drawBtn.classList.toggle('empty', v.drawCount === 0);
    this.q('.draw-lbl').textContent = v.pending > 0 && my ? `+${v.pending} ziehen` : 'Ziehen';
    const pend = this.q('.pend');
    pend.textContent = v.pending ? `+${v.pending}` : '';
    pend.classList.toggle('show', v.pending > 0);
  }

  private renderMe(v: TableView) {
    const me = v.seats[v.me];
    const box = this.q('.me-id');
    const key = `${me.name}|${me.color}|${me.score}|${v.hand.length}`;
    if (box.dataset.k !== key) {
      box.dataset.k = key;
      if (box.style.getPropertyValue('--pc') !== pcol(me.color)) box.style.setProperty('--pc', pcol(me.color));
      box.innerHTML = `${avatar(me.name, me.color)}<span class="me-txt"><b>${esc(me.name)}</b><span>${me.score} Pkt · ${v.hand.length} ${v.hand.length === 1 ? 'Karte' : 'Karten'}</span></span><span class="o-flash"></span>`;
    }
    const uno = this.q<HTMLButtonElement>('.b-uno');
    uno.disabled = !v.canUno;
    uno.classList.toggle('hot', v.canUno && (v.open === v.me || v.turn === v.me));
    const pass = this.q<HTMLButtonElement>('.b-pass');
    pass.hidden = !(v.phase === 'drawn' && this.myTurn());
    const ca = this.q<HTMLButtonElement>('.b-catch');
    const open = v.open !== null && v.open !== v.me ? v.open : null;
    ca.hidden = open === null;
    if (open !== null) ca.innerHTML = `Erwischt! <small>${esc(v.seats[open].name)} hat nicht UNO gesagt</small>`;
  }

  /** Playable cards only light up after a while on my turn (Alex: hints only after some thinking time). */
  private hintTimer = 0;
  private armHints(sec: number | null) {
    clearTimeout(this.hintTimer);
    this.el.classList.remove('hints');
    if (sec === null || sec < 0) return;
    if (sec === 0) { this.el.classList.add('hints'); return; }
    this.hintTimer = window.setTimeout(() => { if (this.myTurn()) { this.el.classList.add('hints'); this.renderStatus(); } }, sec * 1000);
  }

  /** Classes on my cards: playable, the card just drawn (they only show once hints are on). */
  private markHand(v: TableView) {
    const hand = this.sortedHand();
    hand.forEach((c, i) => {
      const s = this.slots.get(c.id);
      if (!s) return;
      const can = v.can.includes(c.id);
      s.classList.toggle('can', can);
      s.classList.toggle('drawn', v.drawnId === c.id);
      s.tabIndex = i === Math.min(this.focusIdx, hand.length - 1) ? 0 : -1;
      const label = `${cardLabel(c)}${can ? ', spielbar' : ''}`;
      if (s.getAttribute('aria-label') !== label) s.setAttribute('aria-label', label);
    });
  }

  private makeSlot(c: Card, f: Fan | undefined) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'slot';
    s.dataset.id = String(c.id);
    s.setAttribute('aria-label', cardLabel(c));
    s.tabIndex = -1;
    const lift = document.createElement('span');
    lift.className = 'lift';
    lift.innerHTML = '<span class="glow" aria-hidden="true"></span>';
    lift.appendChild(cardEl(c, 'span'));
    s.appendChild(lift);
    // placed before it enters the DOM: no transition from anywhere
    if (f) { s.style.transform = fanTf(f); s.style.zIndex = String(f.z); }
    this.q('.hand').appendChild(s);
    this.slots.set(c.id, s);
    return s;
  }

  private pileTilt(c: Card) {
    return { x: ((c.id * 13) % 9) - 4, y: ((c.id * 7) % 7) - 3, r: ((c.id * 37) % 23) - 11 };
  }

  private addPile(c: Card) {
    const el = cardEl(c);
    el.dataset.id = String(c.id);
    const t = this.pileTilt(c);
    el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg)`;
    this.q('.disc-cards').appendChild(el);
    this.pileEls.push(el);
    while (this.pileEls.length > 5) this.pileEls.shift()!.remove();
  }

  private landPile(c: Card) {
    this.inAir.delete(c.id);
    if (this.pileEls.some((e) => e.dataset.id === String(c.id))) return;
    this.addPile(c);
  }

  private setColor(c: Color | null, topWild: boolean) {
    const col = c ? CARD_COLORS[c] : '#f7f2ff';
    // only on the two small subtrees that use it: a custom property on the table root would restyle everything
    this.q('.mid').style.setProperty('--cur', col);
    this.q('.ringwrap').style.setProperty('--cur', col);
    // the coloured ring around the piles is the one colour signal (no word, no extra glow)
    this.q('.ringwrap').classList.toggle('free', !c);
    void topWild;
  }

  private startSpin() {
    // the slow ring spin costs Firefox a full repaint each frame: there the ring stands still
    if (reduced.matches || document.documentElement.classList.contains('ff')) return;
    this.spin = this.q('.ringspin').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 36000, iterations: Infinity });
  }

  private setDir(d: 1 | -1, burst: boolean) {
    this.q('.ringwrap').classList.toggle('ccw', d === -1);
    if (d === this.dir && !burst) return;
    this.dir = d;
    this.spin?.updatePlaybackRate(d);
    if (burst && !reduced.matches) {
      this.q('.ringpulse').animate(
        [{ transform: 'rotate(0deg) scale(1)' }, { transform: `rotate(${d * 200}deg) scale(1.1)`, offset: 0.55 }, { transform: `rotate(${d * 360}deg) scale(1)` }],
        { duration: 760, easing: 'cubic-bezier(.3,.6,.25,1)' },
      );
    }
  }

  /** Rotates the pointer on the ring towards seat i (shortest way round). */
  private pointTo(i: number, instant = false) {
    if (i < 0 || !this.geo || !this.v) return;
    const c = center(this.geo.ring);
    const p = this.seatCenter(i);
    let ang = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
    while (ang - this.ptrAngle > 180) ang -= 360;
    while (ang - this.ptrAngle < -180) ang += 360;
    this.ptrAngle = ang;
    const ptr = this.q('.pointer');
    if (instant) ptr.classList.add('snap');
    ptr.style.transform = `rotate(${ang.toFixed(1)}deg)`;
    this.q('.ringwrap').style.setProperty('--pc', pcol(this.v.seats[i].color));
    if (instant) requestAnimationFrame(() => ptr.classList.remove('snap'));
  }

  /** Whose turn it is: seat spotlight, pointer, label, status, my hand's glow. Runs when the motion of the move is done. */
  private applyTurn(v: TableView) {
    const live = v.phase === 'play' || v.phase === 'drawn';
    const turn = live ? v.turn : -1;
    const mine = turn === v.me;
    for (const [i, el] of this.opps) {
      el.classList.toggle('turn', i === turn);
      el.classList.toggle('idle', turn >= 0 && i !== turn);
    }
    this.q('.hand').classList.toggle('mine', mine);
    this.q('.me-id').classList.toggle('turn', mine);
    const lbl = this.q('.turnlbl');
    lbl.classList.toggle('show', turn >= 0);
    this.q('.ringwrap').classList.toggle('show-ptr', turn >= 0);
    if (turn >= 0) {
      lbl.style.setProperty('--pc', mine ? 'var(--acid)' : pcol(v.seats[turn].color));
      lbl.classList.toggle('me', mine);
      const name = mine ? 'Du bist dran!' : `${v.seats[turn].name} ist dran`;
      const nameEl = this.q('.tl-name');
      if (nameEl.textContent !== name) nameEl.textContent = name;
      if (turn !== this.turnShown) {
        this.pointTo(turn);
        if (!reduced.matches) lbl.animate([{ transform: 'translateX(-50%) scale(.8)', opacity: 0.3 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 420, easing: this.el.style.getPropertyValue('--spring') || 'ease-out' });
      }
    }
    if (mine && !this.wasMyTurn) {
      this.callout('Du bist dran', '', 'turn', performance.now());
      sfx.turn();
      this.armHints(hintDelay(v.rules));
    } else if (!mine && this.wasMyTurn) this.armHints(null);
    this.wasMyTurn = mine;
    this.turnShown = turn;
    this.markHand(v);

    this.renderStatus();
  }

  private renderStatus() {
    const v = this.v;
    if (!v) return;
    const s = this.q('.status');
    const my = this.myTurn();
    const hints = this.el.classList.contains('hints');
    let txt = '';
    if (v.phase === 'roundEnd' || v.phase === 'matchEnd') txt = v.result ? (v.result.winner === v.me ? 'Du hast keine Karten mehr!' : `${v.seats[v.result.winner].name} ist raus!`) : '';
    else if (my) {
      if (v.pending > 0) txt = `+${v.pending} kommt auf dich zu: drauflegen oder ziehen`;
      else if (v.phase === 'drawn') txt = 'Gezogene Karte spielen oder behalten?';
      else if (!hints) txt = 'Leg eine Karte oder zieh eine';
      else txt = v.can.length ? 'Tipp: die leuchtenden Karten passen' : 'Nichts passt: zieh eine Karte';
    }
    if (s.textContent !== txt) s.textContent = txt;
    s.classList.toggle('mine', my);
  }

  // ---------------- motion ----------------

  private animate(v: TableView, prev: TableView | null, myPlays: Map<number, Pose>, oldFan: Map<number, Fan>) {
    const g = this.geo!;
    const now = performance.now();
    // one timeline: continue after what is still playing, but never lag far behind the game
    let t = Math.max(now, this.cursor);
    if (t > now + 900) t = now + 900;
    // the very first view also has to build and paint the whole table: give that a moment before cards fly
    if (!prev) t = Math.max(t, now + 220);
    const motion = !reduced.matches;
    // everything runs a touch slower than it was, so each move can be followed (Alex 2026-10-16)
    const D = (ms: number) => (motion ? ms * PACE : 0);
    const n = v.seats.length;
    const deck = center(g.deck);
    const discC = center(g.disc);
    const deckS = g.deck.w / g.disc.w;
    const handIds = new Set(v.hand.map((c) => c.id));
    const myDrawn = new Set<number>();
    for (const e of v.events) if (e.k === 'draw' && e.p === v.me) for (const c of e.cards) myDrawn.add(c.id);

    // seat counts before this batch (walk the events backwards), shown forwards at the right moments
    const cnt = v.seats.map((s) => s.count);
    const dealt = v.events.some((e) => e.k === 'deal');
    for (let k = v.events.length - 1; k >= 0; k--) {
      const e = v.events[k];
      if (e.k === 'play') cnt[e.p]++;
      else if (e.k === 'draw') cnt[e.p] -= e.n;
      else if (e.k === 'swap') [cnt[e.a], cnt[e.b]] = [cnt[e.b], cnt[e.a]];
      else if (e.k === 'rotate') { const c2 = [...cnt]; for (let i = 0; i < n; i++) cnt[i] = c2[(i + e.dir + n) % n]; }
      else if (e.k === 'deal') for (let i = 0; i < n; i++) cnt[i] = 0;
    }
    for (const i of this.opps.keys()) if (!this.shown.has(i)) this.setFan(i, cnt[i]);
    const fanAt = (i: number, at: number, c: number) => { if (i !== v.me) this.at(at, () => this.setFan(i, c)); };

    // my hand: which elements go, which come and from where
    const arrive = new Map<number, { from: 'deck' | number; at: number; dur: number }>();
    const leaving: { id: number; to: number | 'pile' }[] = [];
    for (const id of this.slots.keys()) if (!handIds.has(id)) leaving.push({ id, to: 'pile' });

    const sounds: [number, () => void][] = [];
    for (const e of v.events) {
      this.opts.onEvent?.(e, v);
      switch (e.k) {
        case 'deal': {
          if (this.modal === 'result') this.closeModal();
          this.resultClock = null;
          // a fresh round: clear the pile and the fans, then deal round-robin from the dealer's left
          this.inAir.clear();
          for (const el of this.pileEls) el.remove();
          this.pileEls = [];
          for (const i of this.opps.keys()) this.setFan(i, 0);
          this.setDir(1, false);
          sounds.push([t, () => sfx.shuffle()]);
          const order: number[] = [];
          for (let k = 1; k <= n; k++) order.push((e.dealer + k) % n);
          const mine = this.sortedHand().filter((c) => !myDrawn.has(c.id));
          let k = 0;
          const step = D(42);
          for (let r = 0; r < 7; r++) {
            for (const p of order) {
              const at = t + D(150) + k * step;
              k++;
              if (p === v.me) {
                const c = mine[r];
                if (c) arrive.set(c.id, { from: 'deck', at, dur: 380 });
              } else {
                cnt[p] = r + 1;
                const c = r + 1;
                this.flyLayer(() => backEl(), g.deck, { ...deck, r: 0, s: 1 }, { ...this.seatCenter(p), r: 0, s: 0.42 }, at, D(380), { arc: 0.12, fade: true, pop: 0.05 }, () => this.setFan(p, c));
              }
            }
          }
          t += D(150) + k * step + D(260);
          break;
        }
        case 'flip': {
          const c = e.card;
          const tl = this.pileTilt(c);
          this.inAir.add(c.id);
          sounds.push([t, () => sfx.flick()]);
          this.flyLayer(() => cardEl(c), g.disc, { ...deck, r: 0, s: deckS }, { x: discC.x + tl.x, y: discC.y + tl.y, r: tl.r, s: 1 }, t, D(480), { arc: 0.35, flip: true, squash: true, spin: 8 }, () => { this.landPile(c); this.setColor(c.c === 'w' ? null : c.c, c.c === 'w'); });
          t += D(400);
          break;
        }
        case 'play': {
          const c = e.card;
          const tl = this.pileTilt(c);
          const to = { x: discC.x + tl.x, y: discC.y + tl.y, r: tl.r, s: 1 };
          this.inAir.add(c.id);
          const col = e.color ?? (c.c === 'w' ? null : c.c);
          const land = () => { this.landPile(c); this.setColor(col, c.c === 'w'); };
          sounds.push([t, () => sfx.flick()]);
          if (e.p === v.me) {
            const from = myPlays.get(c.id) ?? { ...this.seatCenter(v.me), r: 0, s: g.cw / g.disc.w };
            this.flyLayer(() => cardEl(c), g.disc, from, to, t, D(420), { arc: 0.16, squash: true, spin: -6, pop: 0.12 }, land);
          } else {
            const sc = this.seatCenter(e.p);
            cnt[e.p]--;
            fanAt(e.p, t, cnt[e.p]);
            this.flyLayer(() => cardEl(c), g.disc, { ...sc, r: -20, s: 0.4 }, to, t, D(520), { arc: 0.28, flip: true, squash: true, spin: 14, pop: 0.12 }, land);
          }
          if (e.jump) this.callout('Reingeworfen!', v.seats[e.p].name, 'jump', t);
          t += D(e.p === v.me ? 320 : 400);
          break;
        }
        case 'draw': {
          const shownN = Math.min(e.n, FAN_MAX);
          const step = D(e.n > 4 ? 80 : 110);
          if (e.p === v.me) {
            e.cards.forEach((c, k) => {
              arrive.set(c.id, { from: 'deck', at: t + k * step, dur: 420 * PACE });
              sounds.push([t + k * step, () => sfx.draw()]);
            });
          } else {
            const base = cnt[e.p];
            for (let k = 0; k < shownN; k++) {
              const c = k === shownN - 1 ? base + e.n : base + k + 1;
              const at = t + k * step;
              const p = e.p;
              sounds.push([at, () => sfx.draw()]);
              this.flyLayer(() => backEl(), g.deck, { ...deck, r: 0, s: 1 }, { ...this.seatCenter(p), r: 0, s: 0.42 }, at, D(380), { arc: 0.14, fade: true, pop: 0.06 }, () => this.setFan(p, c));
            }
            cnt[e.p] = base + e.n;
          }
          if (e.penalty && e.n) {
            const who = e.p;
            const strong = e.n >= 4;
            const txt = `+${e.n}`;
            this.at(t + D(260), () => { this.flash(who, txt); this.hit(who, strong); sfx.plus(strong); }, true);
          }
          t += step * shownN + D(180);
          break;
        }
        case 'uno':
          this.callout('UNO!', v.seats[e.p].name, 'uno', t);
          sounds.push([t, () => sfx.uno()]);
          break;
        case 'caught':
          this.callout('Erwischt!', `${v.seats[e.p].name} zieht 2`, 'caught', t);
          sounds.push([t, () => sfx.caught()]);
          t += D(200);
          break;
        case 'skip': {
          const who = e.p;
          this.at(t + D(120), () => { this.flash(who, 'Aussetzen'); this.hit(who, false); sfx.skip(); }, true);
          break;
        }
        case 'rev': {
          const d = e.dir;
          this.at(t, () => { this.setDir(d, true); sfx.rev(); });
          break;
        }
        case 'swap': {
          const { a, b } = e;
          const partner = a === v.me ? b : b === v.me ? a : -1;
          const txt = `${v.seats[a].name} tauscht mit ${v.seats[b].name}`;
          this.at(t, () => this.toast(txt), true);
          sounds.push([t, () => sfx.shuffle()]);
          [cnt[a], cnt[b]] = [cnt[b], cnt[a]];
          fanAt(a, t + D(320), cnt[a]);
          fanAt(b, t + D(320), cnt[b]);
          if (partner >= 0) {
            for (const l of leaving) l.to = partner;
            this.sortedHand().forEach((c, k) => { if (!this.slots.has(c.id)) arrive.set(c.id, { from: partner, at: t + D(200) + k * D(40), dur: 440 * PACE }); });
          }
          t += D(520);
          break;
        }
        case 'rotate': {
          this.at(t, () => this.toast('Alle Hände wandern weiter'), true);
          sounds.push([t, () => sfx.shuffle()]);
          const c2 = [...cnt];
          for (let i = 0; i < n; i++) cnt[(i + e.dir + n) % n] = c2[i];
          for (let i = 0; i < n; i++) fanAt(i, t + D(320), cnt[i]);
          const fromSeat = (v.me - e.dir + n) % n;
          const toSeat = (v.me + e.dir + n) % n;
          for (const l of leaving) l.to = toSeat;
          this.sortedHand().forEach((c, k) => { if (!this.slots.has(c.id)) arrive.set(c.id, { from: fromSeat, at: t + D(200) + k * D(40), dur: 440 * PACE }); });
          t += D(520);
          break;
        }
        case 'reshuffle':
          this.at(t, () => this.toast('Ablage neu gemischt'), true);
          sounds.push([t, () => sfx.shuffle()]);
          if (motion) this.at(t, () => { this.q('.pile.draw .stack').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-6deg) scale(1.05)' }, { transform: 'rotate(5deg) scale(1)' }, { transform: 'rotate(0deg)' }], { duration: 420, easing: 'ease-out' }); }, true);
          break;
        case 'round': {
          const won = e.winner === v.me;
          const fin = v.events.some((x) => x.k === 'match');
          const winner = e.winner;
          this.resultClock = v.clock ?? null;
          // the last card lands, then a moment to see who went out, then the result
          this.callout(won ? 'Gewonnen!' : 'Raus!', won ? 'Du hast keine Karten mehr' : `${v.seats[winner].name} hat keine Karten mehr`, 'round', t + D(500));
          this.at(t + D(2300), () => {
            if (won || fin) {
              const c = this.seatCenter(winner);
              glitterBurst(c.x, c.y, fin);
              if (won) sfx.win();
            }
            if (!won) sfx.lose();
            if (this.v?.result) this.openResult(this.v);
          });
          break;
        }
        default:
          break;
      }
    }
    for (const [at, fn] of sounds) this.at(at, fn, true);

    // hand: drop what left (played cards already fly from where they were; given-away cards fly to their new owner)
    for (const l of leaving) {
      const s = this.slots.get(l.id);
      if (!s) continue;
      const f = oldFan.get(l.id);
      if (l.to !== 'pile' && motion && f) {
        const from = this.slotCenter(f);
        const to = this.seatCenter(l.to);
        this.flyLayer(() => backEl(), { x: from.x - g.cw / 2, y: from.y - g.cw * 0.75, w: g.cw, h: g.cw * 1.5 }, { ...from, r: f.a, s: 1 }, { ...to, r: 10, s: 0.4 }, now, 420, { arc: 0.2, fade: true });
      }
      s.remove();
      this.slots.delete(l.id);
    }
    // new cards: elements go straight to their place (so the fan is right), then they fly in
    const fanNow = this.fanLayout();
    for (const c of this.sortedHand()) if (!this.slots.has(c.id)) this.makeSlot(c, fanNow.get(c.id));
    this.layoutHand();
    for (const [id, a] of arrive) {
      const f = fanNow.get(id);
      if (!f) continue;
      const from: Pose = a.from === 'deck' ? { ...deck, r: 0, s: g.deck.w / g.cw } : { ...this.seatCenter(a.from), r: -10, s: 0.4 };
      this.flySlot(id, f, from, a.at, D(a.dur), true);
    }
    // what the events didn't explain (joining late, reconnecting): put it there directly
    if (!dealt) {
      const want = v.pile.slice(-5);
      const wantIds = new Set(want.map((c) => c.id));
      this.pileEls = this.pileEls.filter((e) => { const id = Number(e.dataset.id); if (wantIds.has(id) || this.inAir.has(id)) return true; e.remove(); return false; });
      const have = new Set(this.pileEls.map((e) => Number(e.dataset.id)));
      for (const c of want) if (!have.has(c.id) && !this.inAir.has(c.id)) this.addPile(c);
      if (!prev) { this.setColor(v.color, v.pile[v.pile.length - 1]?.c === 'w'); this.setDir(v.dir, false); }
    }

    // the turn marker moves when the motion of this batch is done; counts are final then whatever happened
    const vt = v;
    this.at(t, () => {
      if (this.v !== vt) return;
      this.applyTurn(vt);
      for (const i of this.opps.keys()) if (this.shown.get(i) !== vt.seats[i].count) this.setFan(i, vt.seats[i].count);
      if (vt.dir !== this.dir) this.setDir(vt.dir, true);
    });
    if (!this.v || this.turnShown === -1) this.markHand(v);
    this.cursor = t;
  }

  /** The target of a +2/+4 or a skip gets hit: a punchy shake. */
  private hit(seat: number, strong: boolean) {
    const v = this.v!;
    if (seat === v.me) { this.shake(this.q('.hand'), strong); this.shake(this.q('.me-id'), strong); }
    else this.shake(this.opps.get(seat)?.querySelector<HTMLElement>('.o-in') ?? null, strong);
  }

  private flash(seat: number, text: string) {
    const v = this.v!;
    const el = seat === v.me ? this.q('.me-id') : this.opps.get(seat);
    const f = el?.querySelector<HTMLElement>('.o-flash');
    if (!f) return;
    f.textContent = text;
    if (reduced.matches) { f.style.opacity = '1'; this.at(performance.now() + 1100, () => (f.style.opacity = '')); return; }
    f.animate([{ opacity: 0, transform: 'translate(-50%, 6px) rotate(-6deg) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, -4px) rotate(-6deg) scale(1.12)', offset: 0.16 }, { opacity: 1, transform: 'translate(-50%, -8px) rotate(-6deg) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%, -20px) rotate(-6deg) scale(1)' }], { duration: 1300 });
  }

  private toastTimer = 0;
  toast(text: string, color?: Color) {
    const t = this.q('.toast');
    t.textContent = text;
    t.style.setProperty('--tc', color ? CARD_COLORS[color] : 'var(--acid)');
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
  }

  /** The big punchy callout across the table, at time `at`. */
  callout(big: string, sub: string, kind: string, at = performance.now()) {
    this.at(at, () => {
      const co = this.q('.callout');
      const cls = 'callout show k-' + kind;
      co.className = cls;
      co.querySelector('.co-big')!.textContent = big;
      const subEl = co.querySelector<HTMLElement>('.co-sub')!;
      subEl.textContent = sub;
      const dur = (kind === 'turn' ? 1000 : kind === 'round' ? 1700 : 1250) * PACE;
      if (reduced.matches) { this.at(performance.now() + 1100, () => { if (co.className === cls) co.className = 'callout'; }); return; }
      const bigEl = co.querySelector<HTMLElement>('.co-big')!;
      const band = co.querySelector<HTMLElement>('.co-band')!;
      for (const el of [bigEl, band, subEl]) el.getAnimations().forEach((a) => a.cancel());
      band.animate([{ transform: 'rotate(-4deg) scaleX(0)', opacity: 1 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 1, offset: 0.15 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 1, offset: 0.8 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.2,.9,.25,1)' });
      bigEl.animate([{ transform: 'rotate(-7deg) scale(2.2)', opacity: 0 }, { transform: 'rotate(-7deg) scale(.94)', opacity: 1, offset: 0.14 }, { transform: 'rotate(-7deg) scale(1)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-7deg) scale(1.03)', opacity: 1, offset: 0.8 }, { transform: 'rotate(-7deg) translateY(-40px) scale(1.08)', opacity: 0 }], { duration: dur, easing: 'ease-out' });
      if (sub) subEl.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none', offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: dur });
      this.at(performance.now() + dur + 10, () => { if (co.className === cls) co.className = 'callout'; });
    }, true);
  }

  // ---------------- clock ----------------

  private syncClock(v: TableView) {
    const c = v.clock;
    if (!c) return;
    // host numbers are authoritative: we only count on locally from the last view
    this.clockBase = { round: c.roundMs, match: c.matchMs, at: performance.now(), running: c.running, moves: c.moves, matchMoves: c.matchMoves };
    this.tickClock();
  }

  private clockText: string[] = [];
  private tickClock() {
    const b = this.clockBase;
    if (!b.at) return;
    const dt = b.running ? performance.now() - b.at : 0;
    const vals = [mmss(b.round + dt), String(b.moves), mmss(b.match + dt), String(b.matchMoves)];
    const sel = ['.tc-time', '.tc-moves', '.tc-mtime', '.tc-mmoves'];
    vals.forEach((x, i) => { if (this.clockText[i] !== x) { this.clockText[i] = x; this.q(sel[i]).textContent = x; } });
  }
}

export function cardLabel(c: Card) {
  const col = c.c === 'w' ? '' : COLOR_NAME[c.c] + ' ';
  switch (c.k) {
    case 'num': return `${col}${c.n}`;
    case 'skip': return `${col}Aussetzen`;
    case 'rev': return `${col}Richtungswechsel`;
    case 'd2': return `${col}plus 2`;
    case 'wild': return 'Farbwahl';
    case 'd4': return 'Plus 4 Farbwahl';
  }
}
