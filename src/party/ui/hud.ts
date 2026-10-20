// The in-game HUD, Jamboree style: one card per player in the screen corners (portrait, rank,
// stars, coins and the three item slots everyone can see), the round banner at the top, the turn
// menu next to your own figure (Würfeln / Items / Karte) with the item bar and the free map, the
// star pointer, the turn-order parade at round start and the board signs (gimmick hints).
// Everything reads the GameState only, so solo, host, bots and online friends see the same.
// Performance: DOM animates only transform and opacity; the cards are touched only when their
// values change; per frame only the turn menu and the star pointer move (transform, no reads).

import './hud.css';
import type { BoardDef, BoardInfoLine } from '../boards/types';
import type { GameState } from '../engine/state';
import { BUDDIES, FINALE_RULES, ITEMS, MAX_ITEMS, STAR_PRICE, type ItemId } from '../engine/tables';
import { sfx } from '../sfx';
import { LEGEND, SP } from '../spaces';
import type { Seat } from '../types';
import { SPEED, TEST, clamp, esc, reduced, sleep } from '../util';
import type { BoardView } from '../view3d/boardview';
import { THREE } from '../view3d/kit';
import { VH, VW, addLabel, removeLabel, type Label } from '../view3d/stage';
import { charSVG, coinSVG, starSVG } from './avatars';
import { buddySVG, itemSVG } from './scenes/art';

/** What the HUD reads from the presenter. */
export interface HudHost {
  seats: Seat[];
  me: number;
  st: GameState;
  hurry: boolean;
  board: BoardDef;
  view: BoardView;
}

const $h = <T extends HTMLElement = HTMLElement>(root: ParentNode, s: string) => root.querySelector<T>(s)!;
const el = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
/** Beat length: follows ?fast and reduced motion. */
const ms = (t: number) => (reduced ? Math.min(t, 120) : t * SPEED);
const animate = (e: Element, kf: Keyframe[], t: number, o: KeyframeAnimationOptions = {}) => {
  try { return (e as HTMLElement).animate(kf, { duration: Math.max(1, ms(t)), easing: 'cubic-bezier(.2,.9,.25,1)', ...o }).finished.then(() => undefined, () => undefined); } catch { return Promise.resolve(); }
};

const DICE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="9" fill="#ffe14a" stroke="#0b0614" stroke-width="3.5"/><circle cx="16" cy="16" r="3.6" fill="#0b0614"/><circle cx="32" cy="32" r="3.6" fill="#0b0614"/><circle cx="24" cy="24" r="3.6" fill="#0b0614"/><circle cx="32" cy="16" r="3.6" fill="#0b0614"/><circle cx="16" cy="32" r="3.6" fill="#0b0614"/></svg>';
const BAG_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 18 h28 l3 24 a3 3 0 0 1 -3 3 h-28 a3 3 0 0 1 -3 -3 z" fill="#ff7ad9" stroke="#0b0614" stroke-width="3.2" stroke-linejoin="round"/><path d="M17 18 c0 -11 14 -11 14 0" stroke="#0b0614" stroke-width="3.2" fill="none"/><path d="M14 24 v14" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/></svg>';
const MAP_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 12 l12 -5 14 5 12 -5 v29 l-12 5 -14 -5 -12 5 z" fill="#2fe6ff" stroke="#0b0614" stroke-width="3.2" stroke-linejoin="round"/><path d="M17 7 v29 M31 12 v29" stroke="#0b0614" stroke-width="2.6"/><path d="M36 15 l1.6 3.4 3.6.4 -2.7 2.4 .8 3.6 -3.3 -1.9 -3.3 1.9 .8 -3.6 -2.7 -2.4 3.6 -.4z" fill="#ffe14a" stroke="#0b0614" stroke-width="1.4"/></svg>';
const ARROW_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 13 h17 v-8 l13 15 -13 15 v-8 h-17 z" fill="#ffe14a" stroke="#0b0614" stroke-width="3.2" stroke-linejoin="round"/></svg>';
const INFO_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
const MAPI_SVG = '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>';
const BACK_SVG = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7M8 12h13"/></svg>';
const GEAR_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
const MUTE_SVG = '<svg viewBox="0 0 24 24"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="wav" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M17 9l5 6M22 9l-5 6"/></svg>';

const kindTag = (s: Seat, me: boolean) => (me ? 'Du' : s.kind === 'bot' ? 'Bot' : s.away ? 'weg' : 'Online');
const DICE_ITEMS: ItemId[] = ['dw', 'tw', 'hw', 'joker'];

interface Card {
  p: number;
  el: HTMLElement;
  inner: HTMLElement;
  rank: HTMLElement;
  stars: HTMLElement;
  starIco: HTMLElement;
  coins: HTMLElement;
  items: HTMLElement;
  tag: HTMLElement;
  badges: HTMLElement;
  slot: number;
  shownStars: number;
  shownCoins: number;
  /** Coin counter animation: from → to over [t0, t0 + dur]. */
  cAnim: { from: number; to: number; t0: number; dur: number } | null;
  sig: { items: string; rank: number; tag: string; badges: string; turn: boolean };
  /** Stars waiting for a star to fly in. */
  starBusy: boolean;
}

/** Steps from a space to the star along the arrows (null: not reachable). */
export function starDistance(board: BoardDef, from: number, star: number): number | null {
  if (from === star) return 0;
  const nodes = board.graph.nodes;
  const seen = new Map<number, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const a = q.shift()!, d = seen.get(a)!;
    for (const b of nodes[a]?.next ?? []) {
      if (seen.has(b)) continue;
      if (b === star) return d + 1;
      seen.set(b, d + 1);
      q.push(b);
    }
  }
  return null;
}

/** "Runde 7" → "in 2 Runden" (relative to the current round), for the board signs. */
function relRounds(text: string, round: number) {
  const rel = (n: number) => (n <= round ? 'diese Runde' : n === round + 1 ? 'in 1 Runde' : `in ${n - round} Runden`);
  return text.replace(/\bin Runde (\d+)/g, (_, n) => rel(Number(n))).replace(/\bRunde (\d+)/g, (_, n) => rel(Number(n)));
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Hud {
  root: HTMLElement;
  private cards: Card[] = [];
  private cardBox: HTMLElement;
  private rb: HTMLElement;
  private rbTxt: HTMLElement;
  private rbSub: HTMLElement;
  private menu: HTMLElement;
  private ibar: HTMLElement;
  private mapui: HTMLElement;
  private ptr: HTMLElement;
  private ptrArr: HTMLElement;
  private ptrN: HTMLElement;
  private sign: HTMLElement;
  private parade: HTMLElement;
  private fx: HTMLElement;
  private raf = 0;
  private lastT = 0;
  private phoneQ = matchMedia('(max-width: 720px)');
  private keyFn: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;
  private held = new Set<string>();
  private gpT = 0;
  private gpLast = { l: false, r: false, u: false, d: false, a: false, b: false, x: false, y: false };
  /** Shown round (banner) and info line titles per index (to show only what changed). */
  private shownRound = 0;
  private shownFinale = false;
  private infoSeen: string[] = [];
  private signT = 0;
  private signPinned = false;
  private dist: number | null = null;
  private distFor = -1;
  private mapLabels: Label[] = [];

  // turn menu state
  private menuP = -1;
  private menuItems: ItemId[] = [];
  private sel: ItemId | null = null;
  private rollDone: ((use: ItemId | null) => void) | null = null;
  private menuW = 220;
  private menuH = 200;
  private menuTx = '';
  private ptrTx = '';
  private ptrRot = '';
  private ptrOn = false;
  mapOn = false;
  /** A junction choice is open (the arrows show the distances; the pointer would cover them). */
  choosing = false;
  private barOn = false;
  private focusI = 0;
  private drag: Map<number, { x: number; y: number }> = new Map();
  private pinch = 0;

  constructor(private h: HudHost) {
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="pcards" id="pcards"></div>
      <div class="htop">
        <a class="hb back" href="./index.html" aria-label="Alle Spiele">${BACK_SVG}</a>
        <div class="rbanner" id="rbanner" role="status"><span class="rb-k" id="rbSub">Runde</span><b id="rbTxt">Runde 1/10</b></div>
        <button class="hb" type="button" id="viewBtn" aria-pressed="false" aria-label="Karte">${MAPI_SVG}</button>
        <button class="hb" type="button" id="infoBtn" aria-pressed="false" aria-label="Brett-Info">${INFO_SVG}</button>
        <button class="hb ib gear" type="button" data-act="settings" aria-label="Einstellungen">${GEAR_SVG}</button>
        <button class="hb ib mute" type="button" data-act="mute" aria-label="Ton aus" aria-pressed="false">${MUTE_SVG}</button>
      </div>
      <div class="bsign" id="bsign" hidden><span class="bs-k"></span><ul></ul></div>
      <div class="sptr" id="starPtr" hidden aria-hidden="true"><i class="sp-arr">${ARROW_SVG}</i><span class="sp-lbl">${starSVG()}<b>0</b><small>Felder</small></span></div>
      <div class="tmenu" id="dock" hidden role="group" aria-label="Dein Zug">
        <span class="tm-head">Du bist dran!</span>
        <button class="tm-b tm-roll" type="button" id="rollBtn" data-i="0"><i>${DICE_SVG}</i><span><b>Würfeln</b><small id="rollSub">Leertaste</small></span></button>
        <button class="tm-b tm-items" type="button" id="itemsBtn" data-i="1"><i>${BAG_SVG}</i><span><b>Items</b><small id="itemsSub">0 von 3</small></span><em id="itemsN">0</em></button>
        <button class="tm-b tm-map" type="button" id="mapBtn" data-i="2"><i>${MAP_SVG}</i><span><b>Karte</b><small>Stern suchen</small></span></button>
      </div>
      <div class="ixbar" id="itembar" hidden role="dialog" aria-label="Deine Items">
        <div class="ix-head"><b>Deine Items</b><span id="ixSub">Benutzen, dann würfeln</span></div>
        <div class="ix-cards" id="ixCards"></div>
        <button class="btn ghost ix-back" type="button" id="ixBack">Zurück</button>
      </div>
      <div class="mapui" id="mapui" hidden>
        <div class="mp-hint"><b>Karte</b><span id="mpTxt">Ziehen zum Verschieben</span></div>
        <button class="btn go mp-back" type="button" id="mapBack">Zurück</button>
      </div>
      <div class="parade" id="parade" hidden aria-hidden="true"><span class="pr-k">Reihenfolge</span><div class="pr-row"></div></div>
      <div class="hfx" id="hfx"></div>`;
    const r = this.root;
    this.cardBox = $h(r, '#pcards');
    this.rb = $h(r, '#rbanner');
    this.rbTxt = $h(r, '#rbTxt');
    this.rbSub = $h(r, '#rbSub');
    this.menu = $h(r, '#dock');
    this.ibar = $h(r, '#itembar');
    this.mapui = $h(r, '#mapui');
    this.ptr = $h(r, '#starPtr');
    this.ptrArr = $h(r, '.sp-arr');
    this.ptrN = $h(r, '.sp-lbl b');
    this.sign = $h(r, '#bsign');
    this.parade = $h(r, '#parade');
    this.fx = $h(r, '#hfx');
    // the mute state of the other buttons
    const muted = document.querySelector('.ib.mute.off');
    if (muted) { const m = $h(r, '.ib.mute'); m.classList.add('off'); m.setAttribute('aria-pressed', 'true'); }
    this.buildCards();

    $h(r, '#rollBtn').onclick = () => this.roll();
    $h(r, '#itemsBtn').onclick = () => this.openBar();
    $h(r, '#mapBtn').onclick = () => { this.setMap(true); };
    $h(r, '#ixBack').onclick = () => this.closeBar();
    $h(r, '#mapBack').onclick = () => this.setMap(false);
    $h(r, '#viewBtn').onclick = () => this.setMap(!this.mapOn);
    $h(r, '#infoBtn').onclick = () => this.toggleSign();
    this.menu.addEventListener('focusin', (e) => { const i = Number((e.target as HTMLElement).dataset.i); if (!Number.isNaN(i)) this.focusI = i; });

    this.keyFn = (e) => this.onKey(e);
    this.keyUp = (e) => { this.held.delete(e.code); };
    addEventListener('keydown', this.keyFn);
    addEventListener('keyup', this.keyUp);
    addEventListener('blur', this.onBlur);
    this.bindMapPointer();
    this.phoneQ.addEventListener('change', this.onPhone);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    if (TEST) (window as unknown as { __hud: unknown }).__hud = this;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.keyFn);
    removeEventListener('keyup', this.keyUp);
    removeEventListener('blur', this.onBlur);
    this.phoneQ.removeEventListener('change', this.onPhone);
    clearInterval(this.gpT);
    clearTimeout(this.signT);
    this.clearMapLabels();
    document.body.classList.remove('mapping', 'has-sign');
    this.root.innerHTML = '';
  }

  private onBlur = () => { this.held.clear(); this.drag.clear(); };
  private onPhone = () => { this.menuTx = ''; this.menu.style.transform = ''; if (!this.menu.hidden) this.measureMenu(); };
  get phone() { return this.phoneQ.matches; }
  private get st() { return this.h.st; }

  // =====================================================================
  // player cards
  // =====================================================================
  private buildCards() {
    this.cardBox.innerHTML = '';
    this.cards = this.h.seats.map((s, p) => {
      const e = el('div', 'pcard', `<div class="pc-in"><span class="pc-glow"></span>
        <span class="pc-ava">${charSVG(s, true)}<em class="pc-rank">1.</em></span>
        <span class="pc-main"><span class="pc-name"><b>${esc(s.name)}</b><small class="pc-tag"></small></span>
          <span class="pc-vals"><span class="pc-s"><i class="pc-si">${starSVG()}</i><b>0</b></span><span class="pc-c">${coinSVG}<b>0</b></span></span>
          <span class="pc-row"><span class="pc-items"></span><span class="pc-badges"></span></span></span></div>`);
      e.style.setProperty('--pc', s.color);
      e.dataset.p = String(p);
      this.cardBox.appendChild(e);
      const c: Card = {
        p, el: e, inner: $h(e, '.pc-in'), rank: $h(e, '.pc-rank'), stars: $h(e, '.pc-s b'), starIco: $h(e, '.pc-si'), coins: $h(e, '.pc-c b'),
        items: $h(e, '.pc-items'), tag: $h(e, '.pc-tag'), badges: $h(e, '.pc-badges'), slot: -1, shownStars: 0, shownCoins: 0, cAnim: null,
        sig: { items: '-', rank: 0, tag: '-', badges: '-', turn: false }, starBusy: false,
      };
      return c;
    });
  }

  /** Display rank: equal stars and coins share a place. */
  private ranks(st: GameState) {
    return st.players.map((P) => 1 + st.players.filter((Q) => Q.stars > P.stars || (Q.stars === P.stars && Q.coins > P.coins)).length);
  }

  /** Cards follow the state; only what changed is touched. animate: count, fly and swap. */
  update(animated = true) {
    const st = this.st;
    if (!st) return;
    const anim = animated && !this.h.hurry && !reduced;
    const rk = this.ranks(st);
    // slots: corners by rank (ties keep seat order)
    const order = st.players.map((_, i) => i).sort((a, b) => rk[a] - rk[b] || a - b);
    const moved = order.some((p, n) => this.cards[p].slot !== n);
    if (moved) {
      const before = anim ? this.cards.map((c) => (c.slot >= 0 ? c.el.getBoundingClientRect() : null)) : [];
      order.forEach((p, n) => { const c = this.cards[p]; c.el.classList.remove(`s${c.slot}`); c.slot = n; c.el.classList.add(`s${n}`); });
      if (anim) {
        this.cards.forEach((c, i) => {
          const b = before[i];
          if (!b) return;
          const a = c.el.getBoundingClientRect();
          const dx = b.left - a.left, dy = b.top - a.top;
          if (Math.abs(dx) + Math.abs(dy) < 2) return;
          void animate(c.el, [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(1.12) rotate(${dx > 0 ? -3 : 3}deg)`, offset: 0.5 },
            { transform: 'none' },
          ], 760, { easing: 'cubic-bezier(.45,0,.2,1)' });
        });
        sfx.whoosh();
      }
    }
    this.cards.forEach((c) => {
      const p = c.p, P = st.players[p], s = this.h.seats[p];
      // rank
      if (c.sig.rank !== rk[p]) {
        const up = c.sig.rank > 0 && rk[p] < c.sig.rank;
        c.sig.rank = rk[p];
        c.rank.textContent = `${rk[p]}.`;
        c.el.dataset.rank = String(rk[p]);
        if (anim && up) void animate(c.rank, [{ transform: 'scale(2) rotate(-12deg)' }, { transform: 'none' }], 520, { easing: 'cubic-bezier(.3,1.45,.45,1)' });
      }
      // turn glow
      const turn = st.phase === 'play' && st.turn === p;
      if (c.sig.turn !== turn) { c.sig.turn = turn; c.el.classList.toggle('turn', turn); }
      // tag (Du / Bot / Online / weg)
      const tag = p === this.h.me && /^du$/i.test(s.name.trim()) ? '' : kindTag(s, p === this.h.me);
      if (c.sig.tag !== tag) { c.sig.tag = tag; c.tag.textContent = tag; c.tag.hidden = !tag; }
      // coins: count up and down visibly
      const target = P.coins;
      const goal = c.cAnim ? c.cAnim.to : c.shownCoins;
      if (goal !== target) {
        const d = target - goal;
        if (anim) {
          const from = c.shownCoins;
          c.cAnim = { from, to: target, t0: performance.now(), dur: ms(clamp(260 + Math.abs(target - from) * 45, 300, 1100)) };
          this.popOn(c, `${d > 0 ? '+' : '−'}${Math.abs(d)}`, d > 0 ? 'var(--yellow)' : '#ff8fb0');
        } else { c.cAnim = null; c.shownCoins = target; c.coins.textContent = String(target); }
      }
      // stars: fly into the card
      if (P.stars !== c.shownStars && !c.starBusy) {
        if (anim && P.stars > c.shownStars) { if (!document.body.classList.contains('in-scn')) void this.starIn(c); /* else: the star flies in once the scene is closed (tick) */ }
        else {
          const lost = P.stars < c.shownStars;
          c.shownStars = P.stars;
          c.stars.textContent = String(P.stars);
          if (anim && lost) { this.popOn(c, '−★', '#ff8fb0'); void animate(c.stars.parentElement!, [{ transform: 'scale(1.6)' }, { transform: 'none' }], 420); }
        }
      }
      // items: up to three icons, visible to everybody
      const items = P.items.join(',');
      if (c.sig.items !== items) {
        const old = c.sig.items === '-' ? [] : c.sig.items.split(',').filter(Boolean);
        c.sig.items = items;
        c.items.innerHTML = Array.from({ length: MAX_ITEMS }, (_, k) => {
          const it = P.items[k];
          return it ? `<i class="pc-it" title="${esc(ITEMS[it].name)}" data-it="${it}">${itemSVG(it)}</i>` : '<i class="pc-it none"></i>';
        }).join('');
        c.el.setAttribute('aria-label', `${s.name}: Platz ${rk[p]}, ${P.stars} Sterne, ${P.coins} Münzen${P.items.length ? `, Items: ${P.items.map((i) => ITEMS[i].name).join(', ')}` : ''}`);
        if (anim) {
          const left = [...old];
          c.items.querySelectorAll<HTMLElement>('.pc-it[data-it]').forEach((ic) => {
            const k = left.indexOf(ic.dataset.it!);
            if (k >= 0) { left.splice(k, 1); return; }
            void animate(ic, [{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 520);
          });
        }
      }
      // badges: Bande, Rivale, Kumpel
      const b: string[] = [];
      if (P.bande) b.push(`<span class="pc-b">Bande ${esc(this.h.seats[P.bande.with]?.name ?? '')}</span>`);
      if (P.rival) b.push(`<span class="pc-b riv">Rivale ${esc(this.h.seats[P.rival.target]?.name ?? '')}</span>`);
      if (st.buddy?.owner === p) b.push(`<span class="pc-bud" title="Kumpel ${esc(BUDDIES[st.buddy.kind].name)}">${buddySVG(st.buddy.kind)}<small>${st.buddy.left}</small></span>`);
      const bs = b.join('');
      if (c.sig.badges !== bs) { c.sig.badges = bs; c.badges.innerHTML = bs; }
    });
  }

  private popOn(c: Card, text: string, col: string) {
    const e = el('span', 'pc-pop', esc(text));
    e.style.setProperty('--fc', col);
    c.el.appendChild(e);
    void animate(e, [{ transform: 'translateY(6px) scale(.5)', opacity: 0 }, { transform: 'translateY(-10px) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translateY(-22px)', opacity: 1, offset: 0.75 }, { transform: 'translateY(-30px)', opacity: 0 }], 1100, { easing: 'ease-out' }).then(() => e.remove());
  }

  /** A star flies from the figure (or the screen centre) into the card. */
  private async starIn(c: Card) {
    c.starBusy = true;
    try {
      const host = this.root.getBoundingClientRect();
      const to = c.starIco.getBoundingClientRect();
      let fx = VW / 2, fy = VH * 0.42;
      const f = this.h.view.figs[c.p];
      if (f && !document.body.classList.contains('in-scn')) {
        _v.copy(f.root.position); _v.y += 2.2; _v.project(this.h.view.cam);
        if (_v.z < 1) { fx = (_v.x * 0.5 + 0.5) * VW; fy = (-_v.y * 0.5 + 0.5) * VH; }
      }
      const tx = to.left - host.left + to.width / 2, ty = to.top - host.top + to.height / 2;
      const s = el('i', 'hfly', starSVG());
      s.style.left = `${fx - 30}px`;
      s.style.top = `${fy - 30}px`;
      this.fx.appendChild(s);
      const dx = tx - fx, dy = ty - fy;
      await animate(s, [
        { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 0 },
        { transform: 'translate(0,-30px) scale(1.5) rotate(-20deg)', opacity: 1, offset: 0.2 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1.2) rotate(160deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.45) rotate(360deg)`, opacity: 1 },
      ], 1100, { easing: 'cubic-bezier(.4,0,.3,1)' });
      s.remove();
    } finally {
      c.starBusy = false;
      const now = this.st.players[c.p].stars;
      c.shownStars = now;
      c.stars.textContent = String(now);
      sfx.star();
      void animate(c.stars.parentElement!, [{ transform: 'scale(2)' }, { transform: 'none' }], 500, { easing: 'cubic-bezier(.3,1.45,.45,1)' });
      void animate(c.inner, [{ transform: 'scale(1.12)' }, { transform: '' }], 500);
    }
  }

  // =====================================================================
  // round banner, parade, board signs
  // =====================================================================
  /** Banner text; drop: the drop-in animation (round change). */
  setRound(drop: boolean) {
    const st = this.st;
    if (!st) return;
    const R = st.rules.rounds, fin = st.finale;
    const txt = `Runde ${st.round}/${R}`;
    const sub = fin ? (st.round === R ? 'Letzte Runde · Finale' : 'Finale') : st.round === R ? 'Letzte Runde' : `Stern: ${st.finaleRule === 'cheapStar' ? 15 : STAR_PRICE} Münzen`;
    if (this.rbTxt.textContent !== txt) this.rbTxt.textContent = txt;
    if (this.rbSub.textContent !== sub) this.rbSub.textContent = sub;
    if (this.rb.classList.contains('fin') !== fin) this.rb.classList.toggle('fin', fin);
    const changed = this.shownRound !== st.round || this.shownFinale !== fin;
    this.shownRound = st.round;
    this.shownFinale = fin;
    if (drop && changed && !this.h.hurry) void animate(this.rb, [{ transform: 'translateY(-160%) rotate(-8deg)', opacity: 0 }, { transform: 'translateY(12%) rotate(2deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 720, { easing: 'cubic-bezier(.3,1.35,.45,1)' });
  }

  /** The figures parade past in turn order. */
  async paradeRun() {
    if (this.h.hurry) return;
    const st = this.st, row = $h(this.parade, '.pr-row');
    row.innerHTML = st.players.map((_, p) => {
      const s = this.h.seats[p];
      return `<div class="pr-f" style="--pc:${s.color};--d:${p * 90}ms"><em>${p + 1}.</em>${charSVG(s)}<b>${esc(s.name)}</b></div>`;
    }).join('');
    $h(this.parade, '.pr-k').textContent = st.round === 1 ? 'Reihenfolge' : `Reihenfolge · Runde ${st.round}`;
    this.parade.hidden = false;
    const W = Math.max(VW, 360);
    await animate(row, [
      { transform: `translateX(${W}px)` },
      { transform: 'translateX(0)', offset: 0.3 },
      { transform: 'translateX(-30px)', offset: 0.7 },
      { transform: `translateX(${-W}px)` },
    ], 2100, { easing: 'cubic-bezier(.3,.7,.7,.3)' });
    this.parade.hidden = true;
    row.innerHTML = '';
  }

  /** The board's info lines (gimmicks, star, finale, Kumpel), relative to this round. */
  private infoLines(): BoardInfoLine[] {
    const st = this.st, R = st.rules.rounds;
    const lines = this.h.board.info(st.bs, st.round, R).map((l) => ({ ...l, title: relRounds(l.title, st.round), text: relRounds(l.text, st.round) }));
    const fr = Math.max(1, R - 2);
    lines.push(st.finale
      ? { color: '#ff2e6a', title: 'Finale läuft.', text: `Plus und Minus zählen doppelt.${st.finaleRule ? ` Regel: ${FINALE_RULES[st.finaleRule].name}.` : ''}` }
      : { color: '#ff2e6a', title: `Finale ${relRounds(`in Runde ${fr}`, st.round)}.`, text: 'Dann zählen Plus- und Minusfelder doppelt.' });
    if (st.buddy && st.buddy.owner === null && st.buddy.at !== null) lines.push({ color: BUDDIES[st.buddy.kind].color, title: `Kumpel ${BUDDIES[st.buddy.kind].name} wartet.`, text: `${BUDDIES[st.buddy.kind].text} Lande auf einem Kumpel-Feld.` });
    return lines;
  }

  /** Shows the lines that changed (or come up next round) as a sign. all: the intro at round 1. */
  boardNews(kind: 'round' | 'gimmick', all = false, silent = false) {
    if (this.h.hurry || silent) { this.infoSeen = this.infoLines().map((l) => l.title); return; }
    const st = this.st;
    const lines = this.infoLines();
    const news = lines.filter((l, i) => {
      if (all) return true;
      const changed = this.infoSeen[i] !== undefined && this.infoSeen[i] !== l.title;
      const soon = kind === 'round' && /in 1 Runde|diese Runde/.test(l.title + ' ' + l.text);
      return changed || soon;
    });
    this.infoSeen = lines.map((l) => l.title);
    if (!news.length || this.signPinned) return;
    this.showSign(all ? `${this.h.board.name} · so läuft’s` : kind === 'round' ? `Runde ${st.round} · Brett-Info` : 'Brett-Info', news.slice(0, 4), false);
    clearTimeout(this.signT);
    this.signT = window.setTimeout(() => this.hideSign(), Math.max(1200, 5200 * Math.max(SPEED, 0.35)));
  }

  private showSign(kicker: string, lines: BoardInfoLine[], legend: boolean) {
    $h(this.sign, '.bs-k').textContent = kicker;
    $h(this.sign, 'ul').innerHTML = lines.map((l) => `<li><i style="--ic:${l.color}"></i><span><b>${esc(l.title)}</b> ${esc(l.text)}</span></li>`).join('')
      + (legend ? `<li class="bs-leg">${LEGEND.map((k) => `<span><i style="--sc:${SP[k].c}"></i>${k === 'X' ? esc(this.h.board.xName) : SP[k].short}</span>`).join('')}</li>` : '');
    const was = !this.sign.hidden;
    this.sign.hidden = false;
    document.body.classList.add('has-sign');
    if (!was) void animate(this.sign, [{ transform: 'translateY(-24px) rotate(-4deg) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], 420, { easing: 'cubic-bezier(.3,1.35,.45,1)' });
  }
  private hideSign() {
    if (this.sign.hidden) return;
    this.signPinned = false;
    $h(this.root, '#infoBtn').setAttribute('aria-pressed', 'false');
    void animate(this.sign, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-12px)' }], 240).then(() => { if (!this.signPinned) { this.sign.hidden = true; document.body.classList.remove('has-sign'); } });
  }
  private toggleSign() {
    sfx.pop();
    if (this.signPinned) { this.hideSign(); return; }
    clearTimeout(this.signT);
    const st = this.st;
    const sn = this.h.board.graph.nodes[st.star];
    const lines = this.infoLines();
    lines.splice(0, 0, { color: '#ffe14a', title: `Stern ${sn ? this.h.board.where(sn) : ''}.`, text: `Kostet ${st.finaleRule === 'cheapStar' ? 15 : STAR_PRICE} Münzen, zieht nach jedem Kauf um.` });
    this.signPinned = true;
    $h(this.root, '#infoBtn').setAttribute('aria-pressed', 'true');
    this.showSign(this.h.board.name, lines, true);
  }

  // =====================================================================
  // star pointer
  // =====================================================================
  /** Recomputes the distance of the active player to the star. */
  refreshStar() {
    const st = this.st;
    if (!st || st.phase !== 'play') { this.dist = null; return; }
    const p = Math.min(st.turn, st.players.length - 1);
    this.distFor = p;
    this.dist = starDistance(this.h.board, this.h.view.nodeOf[p] ?? st.players[p].node, st.star);
    const t = this.dist === null ? '?' : String(this.dist);
    if (this.ptrN.textContent !== t) this.ptrN.textContent = t;
    const sm = this.ptr.querySelector('small')!;
    const u = this.dist === 1 ? 'Feld' : 'Felder';
    if (sm.textContent !== u) sm.textContent = u;
  }
  /** Distance for a junction option (through that way). */
  distVia(to: number) { const d = starDistance(this.h.board, to, this.st.star); return d === null ? null : d + 1; }

  // =====================================================================
  // turn menu
  // =====================================================================
  /** Opens the turn menu for this browser's player; resolves with the item to use (or null). */
  turnMenu(p: number, usable: ItemId[]): Promise<{ use: ItemId | null }> {
    return new Promise((res) => {
      this.menuP = p;
      this.menuItems = usable;
      this.sel = null;
      this.paintMenu();
      this.showDice();
      this.menu.hidden = false;
      this.menuTx = '';
      this.measureMenu();
      this.focusI = 0;
      this.focusMenu(0);
      this.gamepad(true);
      if (!this.h.hurry) this.menu.querySelectorAll('.tm-head, .tm-b').forEach((b, i) => void animate(b, [{ opacity: 0, transform: 'translateX(-24px) scale(.7)' }, { opacity: 1, transform: 'none' }], 300, { delay: ms(50 * i), easing: 'cubic-bezier(.3,1.45,.45,1)', fill: 'backwards' }));
      this.rollDone = (use) => {
        this.rollDone = null;
        this.menu.hidden = true;
        this.closeBar(true);
        if (this.mapOn) this.setMap(false);
        this.menuP = -1;
        this.gamepad(false);
        res({ use });
      };
    });
  }
  get menuOpen() { return !!this.rollDone; }

  /** The question was taken away. */
  cancel() {
    this.rollDone = null;
    this.menu.hidden = true;
    this.closeBar(true);
    this.menuP = -1;
    if (this.mapOn) this.setMap(false);
    this.gamepad(false);
  }

  private roll() {
    if (!this.rollDone || this.barOn) return;
    if (this.mapOn) this.setMap(false);
    this.rollDone(this.sel);
  }

  private paintMenu() {
    const P = this.st.players[this.menuP];
    const n = P?.items.length ?? 0;
    $h(this.menu, '#itemsN').textContent = String(n);
    $h(this.menu, '#itemsSub').textContent = this.sel ? `${ITEMS[this.sel].name} aktiv` : `${n} von ${MAX_ITEMS}`;
    this.menu.classList.toggle('has-sel', !!this.sel);
    $h(this.menu, '#itemsBtn').classList.toggle('empty', n === 0);
    const coarse = document.body.classList.contains('coarse');
    $h(this.menu, '#rollSub').textContent = this.sel ? `mit ${ITEMS[this.sel].name}` : coarse ? 'Tippen' : 'Leertaste';
  }
  private showDice() {
    const s = this.sel;
    this.h.view.diceShow(this.menuP, s === 'dw' ? 2 : s === 'tw' ? 3 : 1, s === 'hw' ? 'half' : 'w6');
  }
  private measureMenu() {
    // one layout read when the menu opens (not per frame)
    this.menuW = this.menu.offsetWidth || 220;
    this.menuH = this.menu.offsetHeight || 200;
  }
  private menuBtns() { return [...this.menu.querySelectorAll<HTMLButtonElement>('.tm-b')]; }
  private focusMenu(i: number) {
    const b = this.menuBtns();
    this.focusI = (i + b.length) % b.length;
    b.forEach((x, k) => x.classList.toggle('hl', k === this.focusI));
    b[this.focusI]?.focus({ preventScroll: true });
  }

  // ---------------- item bar ----------------
  private openBar() {
    if (!this.rollDone || this.barOn) return;
    sfx.pop();
    this.barOn = true;
    const P = this.st.players[this.menuP];
    const box = $h(this.ibar, '#ixCards');
    box.innerHTML = '';
    for (let k = 0; k < MAX_ITEMS; k++) {
      const it = P.items[k];
      if (!it) {
        box.appendChild(el('div', 'ixc none', `<i class="ix-ico"></i><b>Freier Platz</b><p>Items gibt es im Laden und am Glücksrad.</p><button class="ix-use" type="button" disabled>Leer</button>`));
        continue;
      }
      const def = ITEMS[it], ok = this.menuItems.includes(it), on = this.sel === it;
      const why = !def.use ? 'Wirkt von selbst' : 'Gerade nicht';
      const c = el('div', `ixc${on ? ' on' : ''}${ok ? '' : ' off'}`, `<i class="ix-ico">${itemSVG(it)}</i><b>${esc(def.name)}</b><p>${esc(def.text)}</p><button class="ix-use" type="button" data-it="${it}"${ok ? '' : ' disabled'}>${ok ? (on ? 'Aktiv · zurücknehmen' : 'Benutzen') : why}</button>`);
      box.appendChild(c);
    }
    box.querySelectorAll<HTMLButtonElement>('.ix-use[data-it]').forEach((b) => {
      b.onclick = () => {
        const it = b.dataset.it as ItemId;
        this.sel = this.sel === it ? null : it;
        sfx.pop();
        this.paintMenu();
        this.showDice();
        this.closeBar();
        if (this.sel) toastLocal(this.fx, DICE_ITEMS.includes(this.sel) ? `${ITEMS[this.sel].name} bereit · jetzt würfeln` : `${ITEMS[this.sel].name} wird vor dem Wurf eingesetzt`);
      };
    });
    $h(this.ibar, '#ixSub').textContent = this.sel ? `${ITEMS[this.sel].name} ist aktiv` : P.items.length ? 'Benutzen, dann würfeln' : 'Deine Tasche ist leer';
    this.ibar.hidden = false;
    this.menu.classList.add('under');
    void animate(this.ibar, [{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320, { easing: 'cubic-bezier(.3,1.25,.45,1)' });
    box.querySelectorAll<HTMLElement>('.ixc').forEach((c, i) => void animate(c, [{ transform: 'translateY(40px) rotate(-4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, { delay: ms(60 * i), easing: 'cubic-bezier(.3,1.35,.45,1)', fill: 'backwards' }));
    const first = [...box.querySelectorAll<HTMLButtonElement>('.ix-use:not(:disabled)')][0] ?? $h<HTMLButtonElement>(this.ibar, '#ixBack');
    this.barFocus(first);
  }
  private barBtns() { return [...this.ibar.querySelectorAll<HTMLButtonElement>('.ix-use:not(:disabled), #ixBack')]; }
  private barFocus(b: HTMLButtonElement | undefined) {
    if (!b) return;
    this.ibar.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl'));
    b.classList.add('hl');
    b.closest('.ixc')?.classList.add('hl');
    b.focus({ preventScroll: true });
  }
  private barStep(d: number) {
    const bs = this.barBtns();
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    this.barFocus(bs[((i < 0 ? 0 : i + d) + bs.length) % bs.length]);
    sfx.wheel();
  }
  private closeBar(quiet = false) {
    if (!this.barOn) return;
    this.barOn = false;
    this.ibar.hidden = true;
    this.menu.classList.remove('under');
    $h(this.ibar, '#ixCards').innerHTML = '';
    if (!quiet && this.rollDone) this.focusMenu(this.sel ? 0 : 1);
  }

  // ---------------- map (overview with free pan) ----------------
  setMap(on: boolean) {
    if (on === this.mapOn) return;
    const V = this.h.view.view;
    this.mapOn = on;
    V.user = on;
    V.pan.set(0, 0, 0);
    // portrait: the whole island would be tiny, start closer (pan to see the rest)
    V.zoom = on && VW < VH ? 0.62 : 1;
    document.body.classList.toggle('mapping', on);
    $h(this.root, '#viewBtn').setAttribute('aria-pressed', String(on));
    this.mapui.hidden = !on;
    this.clearMapLabels();
    if (on) {
      sfx.whoosh();
      const sn = this.h.board.graph.nodes[this.st.star];
      if (sn) {
        const d = this.dist;
        this.mapLabels.push(addLabel('starmk', `${starSVG()}<b>Stern</b>${d !== null && this.menuP >= 0 ? `<small>${d} ${d === 1 ? 'Feld' : 'Felder'}</small>` : ''}`, (v) => v.set(sn.x, 3.4, sn.z), this.h.view.scene));
      }
      this.h.seats.forEach((s, p) => {
        const f = this.h.view.figs[p];
        if (!f) return;
        const L = addLabel('name3', esc(s.name), (v) => v.copy(f.root.position).setY(f.root.position.y + 2.6), this.h.view.scene);
        L.inner.style.setProperty('--pc', s.color);
        this.mapLabels.push(L);
      });
      $h(this.mapui, '#mpTxt').textContent = document.body.classList.contains('coarse') ? 'Ziehen zum Verschieben · zwei Finger zoomen' : 'Ziehen oder WASD · Mausrad zoomt · Esc zurück';
      this.menu.classList.add('under');
      this.gamepad(true);
      $h<HTMLButtonElement>(this.mapui, '#mapBack').focus({ preventScroll: true });
    } else {
      sfx.pop();
      this.menu.classList.remove('under');
      if (this.rollDone) this.focusMenu(2); else this.gamepad(false);
    }
  }
  private clearMapLabels() { this.mapLabels.forEach(removeLabel); this.mapLabels = []; }

  /** World units per screen pixel at the map's centre. */
  private worldPerPx() {
    const cam = this.h.view.cam, V = this.h.view.view;
    const d = cam.position.distanceTo(V.tgt);
    return (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, VH);
  }
  private panBy(dxPx: number, dyPx: number) {
    const k = this.worldPerPx(), V = this.h.view.view, ov = this.h.view.decor.overview;
    V.pan.x = clamp(V.pan.x - dxPx * k, -ov.w * 0.55, ov.w * 0.55);
    V.pan.z = clamp(V.pan.z - (dyPx * k) / 0.84, -ov.d * 0.55, ov.d * 0.55);
  }
  private zoomBy(f: number) { const V = this.h.view.view; V.zoom = clamp(V.zoom * f, 0.4, 1.25); }

  private bindMapPointer() {
    const cv = document.getElementById('gl');
    if (!cv) return;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.mapOn) return;
      this.drag.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      if (this.drag.size === 2) { const [a, b] = [...this.drag.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.mapOn) return;
      const d = this.drag.get(e.pointerId);
      if (!d) return;
      if (this.drag.size === 1) this.panBy(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX; d.y = e.clientY;
      if (this.drag.size === 2) {
        const [a, b] = [...this.drag.values()];
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch > 0 && nd > 0) this.zoomBy(this.pinch / nd);
        this.pinch = nd;
      }
    });
    const up = (e: PointerEvent) => { this.drag.delete(e.pointerId); if (this.drag.size < 2) this.pinch = 0; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { if (!this.mapOn) return; e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  }

  // ---------------- keyboard + controller ----------------
  private onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const B = document.body.classList;
    if (B.contains('in-mg') || B.contains('in-pod') || B.contains('in-scn')) return;
    const c = e.code;
    this.held.add(c);
    if (this.mapOn) {
      if (c === 'Escape' || c === 'Backspace' || c === 'KeyK' || c === 'KeyM' || c === 'KeyO') { e.preventDefault(); this.setMap(false); }
      else if (c === 'Equal' || c === 'NumpadAdd' || c === 'BracketRight') this.zoomBy(1 / 1.15);
      else if (c === 'Minus' || c === 'NumpadSubtract' || c === 'Slash') this.zoomBy(1.15);
      else if (c.startsWith('Arrow') || c === 'Space') e.preventDefault();
      return;
    }
    if (this.barOn) {
      if (c === 'Escape' || c === 'Backspace' || c === 'KeyI') { e.preventDefault(); this.closeBar(); }
      else if (c === 'ArrowRight' || c === 'ArrowDown' || c === 'KeyD' || c === 'KeyS') { e.preventDefault(); this.barStep(1); }
      else if (c === 'ArrowLeft' || c === 'ArrowUp' || c === 'KeyA' || c === 'KeyW') { e.preventDefault(); this.barStep(-1); }
      else if (/^Digit[1-3]$/.test(c)) { const b = this.ibar.querySelectorAll<HTMLButtonElement>('.ix-use')[Number(c[5]) - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } }
      return;
    }
    if (this.rollDone) {
      if (c === 'ArrowDown' || c === 'ArrowRight' || c === 'KeyS') { e.preventDefault(); this.focusMenu(this.focusI + 1); sfx.wheel(); }
      else if (c === 'ArrowUp' || c === 'ArrowLeft' || c === 'KeyW') { e.preventDefault(); this.focusMenu(this.focusI - 1); sfx.wheel(); }
      else if (c === 'Space' && !e.repeat) { e.preventDefault(); this.roll(); }
      else if ((c === 'Enter' || c === 'NumpadEnter') && !e.repeat) { e.preventDefault(); this.menuBtns()[this.focusI]?.click(); }
      else if (c === 'KeyI') { e.preventDefault(); this.openBar(); }
      else if (c === 'KeyK' || c === 'KeyM' || c === 'KeyO') { e.preventDefault(); this.setMap(true); }
      return;
    }
    if (c === 'KeyO' || c === 'KeyM' || c === 'KeyK') this.setMap(true);
  }

  /** Controller: polled only while the turn menu, the item bar or the map is open. */
  private gamepad(on: boolean) {
    clearInterval(this.gpT);
    this.gpT = 0;
    if (!on || !('getGamepads' in navigator)) return;
    this.gpT = window.setInterval(() => {
      const gp = [...navigator.getGamepads()].find((g) => g);
      if (!gp) return;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0, P = (i: number) => !!gp.buttons[i]?.pressed;
      const now = { l: ax < -0.5 || P(14), r: ax > 0.5 || P(15), u: ay < -0.5 || P(12), d: ay > 0.5 || P(13), a: P(0), b: P(1), x: P(2), y: P(3) };
      const L = this.gpLast, edge = (k: keyof typeof now) => now[k] && !L[k];
      if (this.mapOn) {
        const dz = (v: number) => (Math.abs(v) > 0.18 ? v : 0);
        this.panBy(-dz(ax) * 14 - (P(15) ? 10 : 0) + (P(14) ? 10 : 0), -dz(ay) * 14 - (P(13) ? 10 : 0) + (P(12) ? 10 : 0));
        const rz = gp.axes[3] ?? 0;
        if (Math.abs(rz) > 0.3) this.zoomBy(1 + rz * 0.03);
        if (edge('b') || edge('a') || edge('x')) this.setMap(false);
      } else if (this.barOn) {
        if (edge('l') || edge('u')) this.barStep(-1);
        if (edge('r') || edge('d')) this.barStep(1);
        if (edge('a')) (document.activeElement as HTMLButtonElement | null)?.click?.();
        if (edge('b') || edge('y')) this.closeBar();
      } else if (this.rollDone) {
        if (edge('u') || edge('l')) { this.focusMenu(this.focusI - 1); sfx.wheel(); }
        if (edge('d') || edge('r')) { this.focusMenu(this.focusI + 1); sfx.wheel(); }
        if (edge('a')) this.menuBtns()[this.focusI]?.click();
        if (edge('y')) this.openBar();
        if (edge('x')) this.setMap(true);
      }
      this.gpLast = now;
    }, 70);
  }

  // =====================================================================
  // per frame: turn menu + star pointer (transform only), coin counters, map keys
  // =====================================================================
  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    // coin counters
    for (const c of this.cards) {
      const a = c.cAnim;
      if (!a) continue;
      const k = a.dur > 0 ? clamp((now - a.t0) / a.dur, 0, 1) : 1;
      const v = Math.round(a.from + (a.to - a.from) * k);
      if (v !== c.shownCoins) { c.shownCoins = v; c.coins.textContent = String(v); }
      if (k >= 1) { c.cAnim = null; c.shownCoins = a.to; c.coins.textContent = String(a.to); }
    }
    const view = this.h.view;
    if (view.mode === 'hidden' || document.hidden) return;
    const B = document.body.classList;
    const busy = B.contains('in-mg') || B.contains('in-pod') || B.contains('in-scn');
    // a star won inside a scene flies into the card when the board is back
    if (!busy && !this.h.hurry && this.st) for (const c of this.cards) if (!c.starBusy && (this.st.players[c.p]?.stars ?? 0) > c.shownStars) void this.starIn(c);
    // map: held keys pan
    if (this.mapOn) {
      const H = this.held, sp = 520 * dt;
      const x = (H.has('KeyD') || H.has('ArrowRight') ? 1 : 0) - (H.has('KeyA') || H.has('ArrowLeft') ? 1 : 0);
      const y = (H.has('KeyS') || H.has('ArrowDown') ? 1 : 0) - (H.has('KeyW') || H.has('ArrowUp') ? 1 : 0);
      if (x || y) this.panBy(-x * sp, -y * sp);
    }
    // turn menu next to the own figure
    if (this.rollDone && !this.phone && this.menuP >= 0) {
      const f = view.figs[this.menuP];
      if (f) {
        _v.copy(f.root.position); _v.y += 1.4; _v.project(view.cam);
        const x = (_v.x * 0.5 + 0.5) * VW, y = (-_v.y * 0.5 + 0.5) * VH;
        let left = x + 64;
        if (left + this.menuW > VW - 12) left = x - 64 - this.menuW;
        const top = clamp(y - this.menuH * 0.55, 96, Math.max(96, VH - this.menuH - 16));
        left = clamp(left, 12, Math.max(12, VW - this.menuW - 12));
        const tx = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        if (tx !== this.menuTx) { this.menuTx = tx; this.menu.style.transform = tx; }
      }
    }
    // star pointer around the active figure
    const st = this.st;
    const p = st ? Math.min(st.turn, st.players.length - 1) : -1;
    const show = !!st && st.phase === 'play' && !busy && !this.mapOn && !this.barOn && !this.choosing && view.view.mode === 'follow' && this.dist !== null && this.dist > 0 && p === this.distFor;
    if (show !== this.ptrOn) { this.ptrOn = show; this.ptr.hidden = !show; }
    if (show) {
      const f = view.figs[p], sn = this.h.board.graph.nodes[st.star];
      if (f && sn) {
        _v.copy(f.root.position); _v.y += 1.1;
        _w.set(sn.x - _v.x, 0, sn.z - _v.z);
        const len = _w.length() || 1;
        _w.multiplyScalar(3 / len).add(_v);
        _v.project(view.cam); _w.project(view.cam);
        const x = (_v.x * 0.5 + 0.5) * VW, y = (-_v.y * 0.5 + 0.5) * VH;
        let dx = (_w.x - _v.x) * VW, dy = -(_w.y - _v.y) * VH;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        const R = this.phone ? 62 : 84;
        const tx = `translate3d(${Math.round(x + dx * R)}px, ${Math.round(y + dy * R)}px, 0)`;
        if (tx !== this.ptrTx) { this.ptrTx = tx; this.ptr.style.transform = tx; }
        const rot = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 3) * 3}deg)`;
        if (rot !== this.ptrRot) { this.ptrRot = rot; this.ptrArr.style.transform = rot; }
      }
    }
  };

  /** Waits a little (respects hurry and ?fast). */
  pause(t: number) { return this.h.hurry ? Promise.resolve() : sleep(ms(t)); }
}

/** A small note above the menu (item ready …). */
function toastLocal(layer: HTMLElement, text: string) {
  const e = el('span', 'hnote', esc(text));
  layer.appendChild(e);
  void animate(e, [{ transform: 'translate(-50%, 10px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.15 }, { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.85 }, { transform: 'translate(-50%, -8px)', opacity: 0 }], 2200).then(() => e.remove());
}
