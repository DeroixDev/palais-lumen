// The table on screen. Gets a View from the table (local or over the network), draws it, and
// turns what changed into motion.
//
// Look ("ruhiger Tisch", Alex 2026-11: weniger Dopamin, klar wer dran ist und welche Farbe):
// - One steady turn marker: the seat on turn is drawn solid white (name plate and the label
//   "… ist dran" / "Du bist dran" under the piles). No pulsing, no pointer, nothing that needs motion.
// - One colour state: the table rim, the mat under the discard pile and a labelled colour field
//   (shape + name) all show the colour to follow. After a Farbwahl the field says "Gewählt".
// - The direction of play is a labelled arrow next to it.
// - Motion only where it tells something: a card going from a hand to the pile, a draw, the deal.
//   Short (about 200 ms), transform and opacity only, no squash, no spin, no glitter, no shake.
//
// Motion system (all of it transform + opacity on the compositor):
// - Every card in my hand is one persistent element keyed by card id. The hand is never rebuilt:
//   new cards get an element, gone cards lose theirs, and the row positions are computed from
//   cached geometry and written as transforms (a short CSS transition moves them).
// - Geometry (deck, pile, hand, seats) is measured once and cached; it is measured again only on
//   a resize or when the seats change. An update reads layout first and then only writes.
// - Everything that happens in one update is laid out on one timeline: each event gets a start
//   time after the previous one, flights are Web Animations with exact delays, and the side
//   effects (sounds, the landing on the pile, counters, the turn marker) run from one queue.
// - Flights are FLIP: an element is put where it ends up and animated from where it starts.
//   Cards that land in my hand fly as the hand element itself; cards that land on the pile fly in
//   a fixed layer and are swapped for the pile card.

import { CARD_COLORS, ON_COLOR, SHAPE_NAME, SPRITE, backEl, cardEl, prepareCards, symSVG } from './cards';
import { COLOR_NAME, handSize, hintDelay, type Action, type Card, type Color, type GameEvent } from './engine';
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

/** Clockwise arrow for the direction field (mirrored for anticlockwise). */
const DIR_SVG = `<svg class="d-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M18.6 2.8v4.4h-4.4"/></svg>`;

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
/** A plain ease-out: quick start, soft landing, no overshoot. */
const easeFlight = bez(0.2, 0.7, 0.2, 1);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- geometry ----------------

interface Box { x: number; y: number; w: number; h: number }
interface Pose { x: number; y: number; r: number; s: number }
interface Fan { x: number; y: number; z: number }
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

interface Geo {
  deck: Box;
  disc: Box;
  hand: Box;
  felt: Box;
  seats: Map<number, Box>;
  /** Width of a card in my hand. */
  cw: number;
}

interface Sample { off: number; x: number; y: number; r: number; s: number; o: number }
interface PathOpts { arc?: number; fade?: boolean }

/** A gently curved flight between two poses (global coordinates of the card centre), as keyframe samples. */
function flightPath(a: Pose, b: Pose, o: PathOpts): Sample[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  const k = (o.arc ?? 0.08) * len;
  const c = { x: (a.x + b.x) / 2 + nx * k, y: (a.y + b.y) / 2 + ny * k };
  const N = 10;
  const out: Sample[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const t = easeFlight(u);
    const m = 1 - t;
    out.push({
      off: u,
      x: m * m * a.x + 2 * m * t * c.x + t * t * b.x,
      y: m * m * a.y + 2 * m * t * c.y + t * t * b.y,
      r: a.r + (b.r - a.r) * t,
      s: a.s + (b.s - a.s) * t,
      o: o.fade ? 1 - smooth(0.7, 1, u) : 1,
    });
  }
  return out;
}

const tf = (x: number, y: number, r: number, s: number) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
const fanTf = (f: Fan) => `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px)`;

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
  private dir: 1 | -1 = 1;
  private colorKey = '';
  private ro: ResizeObserver;
  private clockBase = { round: 0, match: 0, at: 0, running: false, moves: 0, matchMoves: 0 };
  private clockTimer = 0;
  private resultClock: TableClock | null = null;

  constructor(root: HTMLElement, private client: Client, private opts: UIOpts) {
    prepareCards();
    this.el = document.createElement('div');
    this.el.className = 'tbl';
    this.el.innerHTML = `${SPRITE}
<header class="tbar">
  <a class="back" href="./index.html"><span aria-hidden="true">←</span> <span class="back-t">Alle Spiele</span></a>
  <div class="tmid"><h1 class="ttitle"><span class="tt1">Unser</span> <span class="tt2">Uno</span> <span class="tt3">Spiel</span></h1><div class="tinfo"><b class="t-round">Runde 1</b><span class="t-target"></span></div></div>
  <div class="tbtns">
    <button class="ib b-music" type="button" aria-pressed="true" title="Musik an/aus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path class="x" d="M3 3l18 18"/></svg><span class="sr">Musik</span></button>
    <button class="ib b-mute" type="button" aria-pressed="false" title="Ton an/aus (M)"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="wav" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M16 9l6 6M22 9l-6 6"/></svg><span class="sr">Ton</span></button>
    <button class="ib b-leave" type="button" aria-label="Tisch verlassen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="lv-t">Verlassen</span></button>
  </div>
</header>
<div class="felt">
  <div class="rim" aria-hidden="true"></div>
  <div class="opps"></div>
  <div class="mid">
    <button class="pile draw" type="button" aria-label="Karte ziehen (Z)">
      <span class="stack"><span class="card back s2"></span><span class="card back s1"></span></span>
      <span class="draw-n"></span>
    </button>
    <div class="pile disc"><span class="disc-mat" aria-hidden="true"></span><div class="disc-cards"></div><span class="pend" aria-hidden="true"></span></div>
    <div class="state">
      <div class="cstate" role="status" aria-live="polite"><span class="cs-sw"></span><span class="cs-txt"><small class="cs-k">Farbe</small><b class="cs-name">–</b></span></div>
      <div class="dstate">${DIR_SVG}<span class="d-txt">Im Uhrzeigersinn</span></div>
    </div>
    <span class="draw-lbl" aria-hidden="true">Ziehen</span>
    <p class="turnlbl" aria-live="polite"><span class="tl-dot" aria-hidden="true"></span><b class="tl-name"></b></p>
    <p class="status" aria-live="polite"></p>
  </div>
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
    <button class="act b-uno" type="button" disabled>UNO!</button>
  </div>
</div>
<div class="hand" role="group" aria-label="Deine Hand"><span class="slot-probe" aria-hidden="true"></span></div>
<div class="fly" aria-hidden="true"></div>
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
    });
    this.ro.observe(this.el);
    this.ro.observe(this.q('.felt'));
    this.setMuteBtn();
    this.setColor(null, false);
    this.clockTimer = window.setInterval(() => this.tickClock(), 1000);
  }

  private keyFn: (e: KeyboardEvent) => void;

  destroy() {
    removeEventListener('keydown', this.keyFn);
    this.ro.disconnect();
    cancelAnimationFrame(this.qRaf);
    clearTimeout(this.qTimer);
    clearTimeout(this.hintTimer);
    clearTimeout(this.toastTimer);
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
    if (!this.myTurn()) { this.toast('Warte, bis du dran bist'); return; }
    if (this.v!.phase !== 'play') return;
    this.send({ t: 'draw' });
  }

  private tryPlay(id: number) {
    unlock();
    const v = this.v;
    if (!v) return;
    const c = v.hand.find((h) => h.id === id);
    if (!c) return;
    if (!v.can.includes(id)) {
      sfx.nope();
      this.toast(this.myTurn() ? 'Die Karte passt gerade nicht' : 'Warte, bis du dran bist');
      return;
    }
    if (c.c === 'w') return this.openColor(c);
    if (v.rules.sevenZero && c.k === 'num' && c.n === 7 && v.hand.length > 1) return this.openTarget(c);
    this.send({ t: 'play', id });
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
    if (!reduced.matches) sheet.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
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
      <p class="sh-sub">${c.k === 'd4' ? '+4: Wer als Nächstes dran ist, zieht vier Karten. ' : ''}Deine Wahl gilt ab sofort für alle.</p>
      <div class="picks">${COLOR_KEYS.map((k, i) => `<button class="pick pc-${k}" type="button" data-c="${k}" style="--cc:${CARD_COLORS[k]};--on:${ON_COLOR[k]}" aria-label="${COLOR_NAME[k]} (${SHAPE_NAME[k]}), ${counts[k]} auf der Hand">${symSVG(k)}<b>${COLOR_NAME[k]}</b><small>${counts[k]} auf der Hand</small><span class="pk-n" aria-hidden="true">${i + 1}</span></button>`).join('')}</div>
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
      <p class="sh-brand" aria-hidden="true">Unser Uno Spiel</p>
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
   * writes land in the frame being drawn). No rAF loop polling every frame.
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
      felt: boxOf(this.q('.felt')),
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
    return b ? center(b) : { x: g.felt.x + g.felt.w / 2, y: g.felt.y };
  }

  /** Row positions of my hand: one straight row, or two when it gets long; neighbours of the hovered card make room. */
  private fanLayout(): Map<number, Fan> {
    const out = new Map<number, Fan>();
    const g = this.geo;
    const hand = this.sortedHand();
    const n = hand.length;
    if (!g || !n) return out;
    const W = g.hand.w;
    const cw = g.cw;
    // narrow screens go to two rows sooner, so every card keeps a readable corner
    const minStep = cw * (W < 560 ? 0.46 : 0.34);
    const perRow = Math.max(1, Math.floor((W - cw) / minStep) + 1);
    const rows = Math.ceil(n / perRow);
    const per = Math.ceil(n / rows);
    const hov = hand.findIndex((c) => c.id === this.hoverId);
    hand.forEach((c, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const j = i - row * per;
      const step = inRow > 1 ? Math.min(cw * 0.8, (W - cw) / (inRow - 1)) : 0;
      let x = (j - (inRow - 1) / 2) * step;
      if (hov >= 0 && Math.floor(hov / per) === row && i !== hov && step < cw * 0.7) {
        const d = i - hov;
        x += Math.sign(d) * (cw * 0.7 - step) * 0.7 * Math.exp(-(Math.abs(d) - 1) * 0.6);
      }
      const y = -(rows - 1 - row) * cw * 0.62;
      out.set(c.id, { x, y, z: i + 1 });
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

  /** Writes the row transforms (a short transition does the easing). instant: no transition (resize). */
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

  /** Global centre of a slot's card at row position f. */
  private slotCenter(f: Fan) {
    const b = this.slotBox();
    return { x: b.x + b.w / 2 + f.x, y: b.y + b.h / 2 + f.y };
  }

  // ---------------- flights ----------------

  /** A card flying in the fixed layer, placed on box (where it ends), from pose a to pose b (global centres). */
  private flyLayer(make: () => HTMLElement, box: Box, a: Pose, b: Pose, at: number, dur: number, o: PathOpts, onLand?: () => void) {
    if (reduced.matches || dur <= 0) { if (onLand) this.at(at, onLand); return; }
    const el = document.createElement('div');
    el.className = 'fl';
    el.style.cssText = `left:${box.x.toFixed(1)}px;top:${box.y.toFixed(1)}px;width:${box.w.toFixed(1)}px;height:${box.h.toFixed(1)}px;--cw:${box.w.toFixed(1)}px`;
    el.appendChild(make());
    const c = center(box);
    const kf = flightPath(a, b, o).map((s) => (o.fade ? { offset: s.off, opacity: s.o, transform: tf(s.x - c.x, s.y - c.y, s.r, s.s) } : { offset: s.off, transform: tf(s.x - c.x, s.y - c.y, s.r, s.s) }));
    const anim = el.animate(kf, { duration: dur, delay: Math.max(0, at - performance.now()), easing: 'linear', fill: 'both' });
    this.q('.fly').appendChild(el);
    let done = false;
    const land = () => { if (done) return; done = true; onLand?.(); el.remove(); };
    anim.onfinish = land;
    anim.oncancel = land;
  }

  /** A card arriving in my hand: the slot's inner element flies in from a global pose. */
  private flySlot(id: number, f: Fan, from: Pose, at: number, dur: number) {
    const s = this.slots.get(id);
    if (!s || reduced.matches || dur <= 0) return;
    const lift = s.querySelector<HTMLElement>('.lift')!;
    s.classList.add('air');
    s.style.zIndex = String(200 + f.z);
    const end = this.slotCenter(f);
    const kf = flightPath(from, { x: end.x, y: end.y, r: 0, s: 1 }, { arc: 0.06 }).map((sm) => ({ offset: sm.off, transform: tf(sm.x - end.x, sm.y - end.y, sm.r, sm.s) }));
    const anim = lift.animate(kf, { duration: dur, delay: Math.max(0, at - performance.now()), easing: 'linear', fill: 'backwards' });
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      s.classList.remove('air');
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
    const lifted = this.q('.hand').matches('.mine.hints, .mine.drawnmode');
    for (const e of v.events) {
      if (e.k === 'play' && e.p === v.me) {
        // where the card is, from the row maths (no layout read): its place plus the hover/playable lift
        const f = oldFan.get(e.card.id);
        const s = this.slots.get(e.card.id);
        if (f && s) {
          const c = this.slotCenter(f);
          const lift = (s.matches(':hover') && matchMedia('(hover: hover)').matches ? 0.08 : s.classList.contains('can') && lifted ? 0.07 : 0) * g.cw * 1.5;
          myPlays.set(e.card.id, { x: c.x, y: c.y - lift, r: 0, s: g.cw / g.disc.w });
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
        el.innerHTML = `<div class="o-in"><span class="o-ava"></span><span class="o-txt"><b class="o-name"></b><span class="o-sub"></span></span><span class="o-count"></span><span class="o-tag">am Zug</span><span class="o-uno"></span><span class="o-flash"></span></div><div class="o-fan" aria-hidden="true"></div>`;
        box.appendChild(el);
        this.opps.set(i, el);
        changed = true;
      }
      if (el.dataset.pos !== pos[k]) { el.dataset.pos = pos[k]; changed = true; }
      const ava = el.querySelector('.o-ava')!;
      const key = `${s.name}|${s.color}`;
      if (ava.getAttribute('data-k') !== key) { ava.setAttribute('data-k', key); ava.innerHTML = avatar(s.name, s.color); el.querySelector('.o-name')!.textContent = s.name; }
      const sub = `${s.score} Pkt${s.away ? ' · weg, Bot spielt' : s.bot ? ' · Bot' : ''}`;
      const subEl = el.querySelector('.o-sub')!;
      if (subEl.textContent !== sub) subEl.textContent = sub;
      el.classList.toggle('open', v.open === i);
      const u = el.querySelector('.o-uno')!;
      const ut = v.open === i ? 'Kein UNO!' : 'UNO';
      if (u.textContent !== ut) u.textContent = ut;
      el.setAttribute('aria-label', `${s.name}: ${s.count} ${s.count === 1 ? 'Karte' : 'Karten'}, ${s.score} Punkte${v.turn === i ? ', ist dran' : ''}`);
    });
    return changed;
  }

  /** The row of backs on an opponent's panel (persistent minis, placed by transforms). */
  private setFan(i: number, count: number) {
    const el = this.opps.get(i);
    if (!el) return;
    count = Math.max(0, count);
    this.shown.set(i, count);
    const fan = el.querySelector<HTMLElement>('.o-fan')!;
    // their hand as they hold it, seen from across the table: every card a back
    const show = Math.min(count, HAND_MAX);
    while (fan.childElementCount < show) fan.appendChild(backEl('mini'));
    while (fan.childElementCount > show) fan.lastElementChild!.remove();
    const mid = (show - 1) / 2;
    fan.style.setProperty('--n', String(Math.max(1, show)));
    [...fan.children].forEach((m, j) => (m as HTMLElement).style.setProperty('--o', (j - mid).toFixed(1)));
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
      box.innerHTML = `${avatar(me.name, me.color)}<span class="me-txt"><b>${esc(me.name)}</b><span>${me.score} Pkt · ${v.hand.length} ${v.hand.length === 1 ? 'Karte' : 'Karten'}</span></span><span class="o-flash"></span>`;
    }
    const uno = this.q<HTMLButtonElement>('.b-uno');
    uno.disabled = !v.canUno;
    const pass = this.q<HTMLButtonElement>('.b-pass');
    pass.hidden = !(v.phase === 'drawn' && this.myTurn());
    const ca = this.q<HTMLButtonElement>('.b-catch');
    const open = v.open !== null && v.open !== v.me ? v.open : null;
    ca.hidden = open === null;
    if (open !== null) ca.innerHTML = `Erwischt! <small>${esc(v.seats[open].name)} hat nicht UNO gesagt</small>`;
  }

  /** Playable cards stand out only after a while on my turn (Alex: tips only after some thinking time; Custom: Tipps nach). */
  private hintTimer = 0;
  private armHints(sec: number | null) {
    clearTimeout(this.hintTimer);
    const hand = this.q('.hand');
    hand.classList.remove('hints');
    if (sec === null || sec < 0) return;
    if (sec === 0) { hand.classList.add('hints'); return; }
    this.hintTimer = window.setTimeout(() => { if (this.myTurn()) { hand.classList.add('hints'); this.renderStatus(); } }, sec * 1000);
  }

  /** Classes on my cards: playable, the card just drawn. */
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
    // after a draw only that card may go: show it right away (it is the answer to "what now?")
    this.q('.hand').classList.toggle('drawnmode', v.drawnId !== null && this.myTurn() && v.phase === 'drawn');
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
    lift.appendChild(cardEl(c, 'span'));
    s.appendChild(lift);
    // placed before it enters the DOM: no transition from anywhere
    if (f) { s.style.transform = fanTf(f); s.style.zIndex = String(f.z); }
    this.q('.hand').appendChild(s);
    this.slots.set(c.id, s);
    return s;
  }

  /** A small, steady offset per card so the pile reads as a pile (no wild tilts). */
  private pileTilt(c: Card) {
    return { x: ((c.id * 13) % 5) - 2, y: ((c.id * 7) % 5) - 2, r: ((c.id * 37) % 9) - 4 };
  }

  private addPile(c: Card) {
    const el = cardEl(c);
    el.dataset.id = String(c.id);
    const t = this.pileTilt(c);
    el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg)`;
    this.q('.disc-cards').appendChild(el);
    this.pileEls.push(el);
    while (this.pileEls.length > 4) this.pileEls.shift()!.remove();
  }

  private landPile(c: Card) {
    this.inAir.delete(c.id);
    if (this.pileEls.some((e) => e.dataset.id === String(c.id))) return;
    this.addPile(c);
  }

  /** The colour to follow: table rim, the mat under the pile and the labelled colour field. */
  private setColor(c: Color | null, chosen: boolean) {
    const key = `${c}|${chosen}`;
    if (key === this.colorKey) return;
    this.colorKey = key;
    const col = c ? CARD_COLORS[c] : '#5b616e';
    // set directly on the few elements that show it (a custom property on the table root would restyle everything)
    this.q('.rim').style.borderColor = col;
    this.q('.disc-mat').style.backgroundColor = col;
    const cs = this.q('.cstate');
    cs.classList.toggle('chosen', chosen && !!c);
    cs.classList.toggle('free', !c);
    const sw = this.q('.cs-sw');
    sw.style.backgroundColor = col;
    sw.style.color = c ? ON_COLOR[c] : '#fff';
    sw.innerHTML = symSVG(c ?? 'w');
    this.q('.cs-k').textContent = c && chosen ? 'Gewählte Farbe' : 'Farbe';
    this.q('.cs-name').textContent = c ? COLOR_NAME[c] : 'Freie Wahl';
  }

  private setDir(d: 1 | -1) {
    this.dir = d;
    this.q('.dstate').classList.toggle('ccw', d === -1);
    this.q('.d-txt').textContent = d === 1 ? 'Im Uhrzeigersinn' : 'Gegen den Uhrzeigersinn';
  }

  /** Whose turn it is: the seat plate turns white, the label under the piles names them. Runs when the motion of the move is done. */
  private applyTurn(v: TableView) {
    const live = v.phase === 'play' || v.phase === 'drawn';
    const turn = live ? v.turn : -1;
    const mine = turn === v.me;
    for (const [i, el] of this.opps) el.classList.toggle('turn', i === turn);
    this.q('.hand').classList.toggle('mine', mine);
    this.q('.me-id').classList.toggle('turn', mine);
    const lbl = this.q('.turnlbl');
    lbl.classList.toggle('show', turn >= 0);
    lbl.classList.toggle('me', mine);
    if (turn >= 0) {
      lbl.style.setProperty('--pc', pcol(v.seats[turn].color));
      const name = mine ? 'Du bist dran' : `${v.seats[turn].name} ist dran`;
      const nameEl = this.q('.tl-name');
      if (nameEl.textContent !== name) nameEl.textContent = name;
    }
    if (mine && !this.wasMyTurn) {
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
    const hints = this.q('.hand').classList.contains('hints');
    let txt = '';
    if (v.phase === 'roundEnd' || v.phase === 'matchEnd') txt = v.result ? (v.result.winner === v.me ? 'Du hast keine Karten mehr' : `${v.seats[v.result.winner].name} hat keine Karten mehr`) : '';
    else if (my) {
      if (v.pending > 0) txt = `+${v.pending} kommt auf dich zu: drauflegen oder ziehen`;
      else if (v.phase === 'drawn') txt = 'Gezogene Karte spielen oder behalten';
      else if (!hints) txt = 'Leg eine passende Karte oder zieh eine';
      else txt = v.can.length ? 'Tipp: Die angehobenen Karten passen' : 'Nichts passt: Zieh eine Karte';
    }
    if (s.textContent !== txt) s.textContent = txt;
    // nothing fits (or a +n is coming): once tips are on, the draw pile gets the same steady ring as playable cards
    this.q('.pile.draw').classList.toggle('hl', my && hints && v.phase === 'play' && (v.can.length === 0 || v.pending > 0));
  }

  // ---------------- motion ----------------

  private animate(v: TableView, prev: TableView | null, myPlays: Map<number, Pose>, oldFan: Map<number, Fan>) {
    const g = this.geo!;
    const now = performance.now();
    // one timeline: continue after what is still playing, but never lag far behind the game
    let t = Math.max(now, this.cursor);
    if (t > now + 700) t = now + 700;
    // the very first view also has to build and paint the whole table: give that a moment before cards fly
    if (!prev) t = Math.max(t, now + 200);
    const motion = !reduced.matches;
    const D = (ms: number) => (motion ? ms : 0);
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
          // a fresh round: clear the pile and the hands, then deal round-robin from the dealer's left
          this.inAir.clear();
          for (const el of this.pileEls) el.remove();
          this.pileEls = [];
          for (const i of this.opps.keys()) this.setFan(i, 0);
          this.setDir(1);
          sounds.push([t, () => sfx.shuffle()]);
          const order: number[] = [];
          for (let k = 1; k <= n; k++) order.push((e.dealer + k) % n);
          const mine = this.sortedHand().filter((c) => !myDrawn.has(c.id));
          const per = handSize(v.rules);
          let k = 0;
          const step = D(per > 9 ? 14 : 24);
          for (let r = 0; r < per; r++) {
            for (const p of order) {
              const at = t + D(80) + k * step;
              k++;
              if (p === v.me) {
                const c = mine[r];
                if (c) arrive.set(c.id, { from: 'deck', at, dur: 220 });
              } else {
                cnt[p] = r + 1;
                const c = r + 1;
                // a long deal flies the first cards and simply counts up the rest
                if (r < FAN_MAX) this.flyLayer(() => backEl(), g.deck, { ...deck, r: 0, s: 1 }, { ...this.seatCenter(p), r: 0, s: 0.45 }, at, D(220), { fade: true }, () => this.setFan(p, c));
                else this.at(at, () => this.setFan(p, c));
              }
            }
          }
          t += D(80) + k * step + D(160);
          break;
        }
        case 'flip': {
          const c = e.card;
          const tl = this.pileTilt(c);
          this.inAir.add(c.id);
          sounds.push([t, () => sfx.flick()]);
          this.flyLayer(() => cardEl(c), g.disc, { ...deck, r: 0, s: deckS }, { x: discC.x + tl.x, y: discC.y + tl.y, r: tl.r, s: 1 }, t, D(240), {}, () => { this.landPile(c); this.setColor(c.c === 'w' ? null : c.c, false); });
          t += D(260);
          break;
        }
        case 'play': {
          const c = e.card;
          const tl = this.pileTilt(c);
          const to = { x: discC.x + tl.x, y: discC.y + tl.y, r: tl.r, s: 1 };
          this.inAir.add(c.id);
          const col = e.color ?? (c.c === 'w' ? null : c.c);
          const chosen = c.c === 'w';
          const who = e.p;
          const land = () => {
            this.landPile(c);
            this.setColor(col, chosen);
            if (chosen && col) this.toast(`${who === v.me ? 'Du wählst' : `${v.seats[who].name} wählt`} ${COLOR_NAME[col]}`, col);
          };
          sounds.push([t, () => sfx.flick()]);
          if (e.p === v.me) {
            const from = myPlays.get(c.id) ?? { ...this.seatCenter(v.me), r: 0, s: g.cw / g.disc.w };
            this.flyLayer(() => cardEl(c), g.disc, from, to, t, D(220), {}, land);
          } else {
            const sc = this.seatCenter(e.p);
            cnt[e.p]--;
            fanAt(e.p, t, cnt[e.p]);
            this.flyLayer(() => cardEl(c), g.disc, { ...sc, r: 0, s: 0.45 }, to, t, D(250), {}, land);
          }
          if (e.jump) { const nm = v.seats[e.p].name; this.at(t, () => this.toast(`${nm} wirft rein`), true); }
          t += D(e.p === v.me ? 220 : 260);
          break;
        }
        case 'draw': {
          const shownN = Math.min(e.n, FAN_MAX);
          const step = D(e.n > 4 ? 45 : 70);
          if (e.p === v.me) {
            e.cards.forEach((c, k) => {
              arrive.set(c.id, { from: 'deck', at: t + k * step, dur: 230 });
              if (k < FAN_MAX) sounds.push([t + k * step, () => sfx.draw()]);
            });
          } else {
            const base = cnt[e.p];
            for (let k = 0; k < shownN; k++) {
              const c = k === shownN - 1 ? base + e.n : base + k + 1;
              const at = t + k * step;
              const p = e.p;
              sounds.push([at, () => sfx.draw()]);
              this.flyLayer(() => backEl(), g.deck, { ...deck, r: 0, s: 1 }, { ...this.seatCenter(p), r: 0, s: 0.45 }, at, D(230), { fade: true }, () => this.setFan(p, c));
            }
            cnt[e.p] = base + e.n;
          }
          if (e.penalty && e.n) {
            const who = e.p;
            const strong = e.n >= 4;
            const txt = `+${e.n}`;
            this.at(t + D(120), () => { this.flash(who, txt); sfx.plus(strong); }, true);
          }
          t += step * (e.p === v.me ? Math.min(e.n, 30) : shownN) + D(120);
          break;
        }
        case 'uno': {
          const nm = e.p === v.me ? 'Du' : v.seats[e.p].name;
          this.at(t, () => this.toast(`${nm}: UNO!`), true);
          sounds.push([t, () => sfx.uno()]);
          break;
        }
        case 'caught': {
          const txt = `Erwischt: ${e.p === v.me ? 'Du ziehst' : `${v.seats[e.p].name} zieht`} Strafkarten`;
          this.at(t, () => this.toast(txt), true);
          sounds.push([t, () => sfx.caught()]);
          t += D(120);
          break;
        }
        case 'skip': {
          const who = e.p;
          this.at(t + D(80), () => { this.flash(who, 'Setzt aus'); sfx.skip(); }, true);
          break;
        }
        case 'rev': {
          const d = e.dir;
          this.at(t, () => { this.setDir(d); this.toast('Richtung gewechselt'); sfx.rev(); });
          break;
        }
        case 'swap': {
          const { a, b } = e;
          const partner = a === v.me ? b : b === v.me ? a : -1;
          const txt = `${v.seats[a].name} tauscht mit ${v.seats[b].name}`;
          this.at(t, () => this.toast(txt), true);
          sounds.push([t, () => sfx.shuffle()]);
          [cnt[a], cnt[b]] = [cnt[b], cnt[a]];
          fanAt(a, t + D(240), cnt[a]);
          fanAt(b, t + D(240), cnt[b]);
          if (partner >= 0) {
            for (const l of leaving) l.to = partner;
            this.sortedHand().forEach((c, k) => { if (!this.slots.has(c.id)) arrive.set(c.id, { from: partner, at: t + D(120) + k * D(20), dur: 240 }); });
          }
          t += D(380);
          break;
        }
        case 'rotate': {
          this.at(t, () => this.toast('Alle Hände wandern weiter'), true);
          sounds.push([t, () => sfx.shuffle()]);
          const c2 = [...cnt];
          for (let i = 0; i < n; i++) cnt[(i + e.dir + n) % n] = c2[i];
          for (let i = 0; i < n; i++) fanAt(i, t + D(240), cnt[i]);
          const fromSeat = (v.me - e.dir + n) % n;
          const toSeat = (v.me + e.dir + n) % n;
          for (const l of leaving) l.to = toSeat;
          this.sortedHand().forEach((c, k) => { if (!this.slots.has(c.id)) arrive.set(c.id, { from: fromSeat, at: t + D(120) + k * D(20), dur: 240 }); });
          t += D(380);
          break;
        }
        case 'reshuffle':
          this.at(t, () => this.toast('Ablage neu gemischt'), true);
          sounds.push([t, () => sfx.shuffle()]);
          break;
        case 'round': {
          const won = e.winner === v.me;
          this.resultClock = v.clock ?? null;
          const txt = won ? 'Du hast keine Karten mehr' : `${v.seats[e.winner].name} hat keine Karten mehr`;
          // the last card lands, a calm moment to see who went out, then the result
          this.at(t + D(200), () => this.toast(txt), true);
          this.at(t + 1300, () => {
            if (won) sfx.win();
            else sfx.lose();
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
        this.flyLayer(() => backEl(), { x: from.x - g.cw / 2, y: from.y - g.cw * 0.75, w: g.cw, h: g.cw * 1.5 }, { ...from, r: 0, s: 1 }, { ...to, r: 0, s: 0.45 }, now, 240, { fade: true });
      }
      s.remove();
      this.slots.delete(l.id);
    }
    // new cards: elements go straight to their place (so the row is right), then they fly in
    const fanNow = this.fanLayout();
    for (const c of this.sortedHand()) if (!this.slots.has(c.id)) this.makeSlot(c, fanNow.get(c.id));
    this.layoutHand();
    for (const [id, a] of arrive) {
      const f = fanNow.get(id);
      if (!f) continue;
      const from: Pose = a.from === 'deck' ? { ...deck, r: 0, s: g.deck.w / g.cw } : { ...this.seatCenter(a.from), r: 0, s: 0.45 };
      this.flySlot(id, f, from, a.at, D(a.dur));
    }
    // what the events didn't explain (joining late, reconnecting): put it there directly
    if (!dealt) {
      const want = v.pile.slice(-4);
      const wantIds = new Set(want.map((c) => c.id));
      this.pileEls = this.pileEls.filter((e) => { const id = Number(e.dataset.id); if (wantIds.has(id) || this.inAir.has(id)) return true; e.remove(); return false; });
      const have = new Set(this.pileEls.map((e) => Number(e.dataset.id)));
      for (const c of want) if (!have.has(c.id) && !this.inAir.has(c.id)) this.addPile(c);
      if (!prev) { this.setColor(v.color, v.pile[v.pile.length - 1]?.c === 'w'); this.setDir(v.dir); }
    }

    // the turn marker moves when the motion of this batch is done; counts are final then whatever happened
    const vt = v;
    this.at(t, () => {
      if (this.v !== vt) return;
      this.applyTurn(vt);
      for (const i of this.opps.keys()) if (this.shown.get(i) !== vt.seats[i].count) this.setFan(i, vt.seats[i].count);
      if (vt.dir !== this.dir) this.setDir(vt.dir);
      // the colour state always ends on the game's colour (also after a reconnect)
      if (!this.inAir.size) this.setColor(vt.color, vt.pile[vt.pile.length - 1]?.c === 'w');
    });
    if (!this.v || this.turnShown === -1) this.markHand(v);
    this.cursor = t;
  }

  /** A short label on a seat (Setzt aus, +2, +4): fades in and out, nothing moves. */
  private flash(seat: number, text: string) {
    const v = this.v!;
    const el = seat === v.me ? this.q('.me-id') : this.opps.get(seat);
    const f = el?.querySelector<HTMLElement>('.o-flash');
    if (!f) return;
    // two things at once (a +4 and the skip that comes with it): show both
    const busy = f.getAnimations().some((a) => a.playState === 'running') || f.style.opacity === '1';
    f.textContent = busy && f.textContent && !f.textContent.includes(text) ? `${f.textContent} · ${text}` : text;
    f.getAnimations().forEach((a) => a.cancel());
    if (reduced.matches) { f.style.opacity = '1'; this.at(performance.now() + 1400, () => (f.style.opacity = '')); return; }
    f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 1600 });
  }

  private toastTimer = 0;
  /** A calm one-line note on the table (who said UNO, which colour was chosen, …). */
  toast(text: string, color?: Color) {
    const t = this.q('.toast');
    t.textContent = '';
    if (color) t.insertAdjacentHTML('beforeend', `<span class="tc-sw" style="background:${CARD_COLORS[color]};color:${ON_COLOR[color]}">${symSVG(color)}</span>`);
    t.append(text);
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2000);
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
