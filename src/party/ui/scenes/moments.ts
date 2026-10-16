// The short full-screen moments of every other space and event: Plus/Minus coin shower and
// drain, the Ereignis slot, the Glücksrad, Duell (versus + stake), Kumpel, Bande and Rivale,
// the star host, item use, the board fields (Jetonfeld, Lastenaufzug, Drehbühne), Brettfest,
// Finale, the bonus stars and a generic choice for any other question.

import type { Answer, Ask, GameEvent, Stake } from '../../engine/state';
import { BONUS, BUDDIES, FINALE_RULES, ITEMS, type BuddyId, type FinaleRule, type ItemId } from '../../engine/tables';
import { POCKETS, RED } from '../../boards/palais/data';
import { SP } from '../../spaces';
import { sfx } from '../../sfx';
import { esc, pickR } from '../../util';
import { coinSVG, starSVG } from '../avatars';
import { bigStarSVG, boltSVG, buddySVG, crateSVG, handshakeSVG, itemSVG, kometSVG, rouletteSVG, turntableSVG, vsSVG } from './art';
import { Scene, type Verdict } from './base';
import { anim, fly, ghost, h, pause, pick, T, type Host, type Pick } from './core';

const ITEM_BY_NAME = new Map(Object.values(ITEMS).map((d) => [d.name, d.id] as const));
const itemIn = (text: string): ItemId | null => { for (const [n, id] of ITEM_BY_NAME) if (text.includes(n)) return id; return null; };

/** Clears the art (keeps the bubble). */
function clearArt(s: Scene) { [...s.art.children].forEach((c) => { if (c !== s.bubble) c.remove(); }); }

/** Versus splash: both figures slide in, VS slams down, the stake below. */
async function versus(s: Scene, a: number, b: number, label: string, mid = '') {
  clearArt(s);
  s.cards.innerHTML = '';
  s.who.hidden = true;
  s.art.classList.add('vsart');
  const w = h('div', 'vs-wrap', `<div class="vs-side l" data-fig="${a}">${s.fig(a)}<b style="--pc:${s.seat(a).color}">${esc(s.name(a))}</b></div>
    <div class="vs-mid"><div class="vs-svg">${vsSVG}</div>${mid}</div>
    <div class="vs-side r" data-fig="${b}">${s.fig(b, 'flip')}<b style="--pc:${s.seat(b).color}">${esc(s.name(b))}</b></div>
    <div class="vs-stake">${esc(label)}</div>`);
  s.art.prepend(w);
  s.addChip(b);
  sfx.whoosh();
  await Promise.all([
    anim(w.querySelector('.vs-side.l'), [{ transform: 'translateX(-120%)' }, { transform: 'none' }], 420),
    anim(w.querySelector('.vs-side.r'), [{ transform: 'translateX(120%)' }, { transform: 'none' }], 420),
  ]);
  sfx.hit();
  await anim(w.querySelector('.vs-svg'), [{ transform: 'scale(3) rotate(-20deg)', opacity: 0 }, { transform: 'scale(.9) rotate(-6deg)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-6deg)', opacity: 1 }], 360);
  void anim(s.art, [{ transform: 'translate(6px,3px)' }, { transform: 'translate(-5px,-2px)' }, { transform: 'none' }], 220, { fill: 'none' });
  await anim(w.querySelector('.vs-stake'), [{ transform: 'translateY(20px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300);
  await pause(900);
}

/** A big stamp over the art ("Bande!", "Abgelehnt", …). */
async function stamp(s: Scene, text: string, col: string) {
  const e = h('div', 'stamp2', esc(text));
  e.style.setProperty('--sc', col);
  s.art.appendChild(e);
  sfx.hit();
  await anim(e, [{ transform: 'translate(-50%,-50%) scale(2.6) rotate(-14deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.95) rotate(-8deg)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) rotate(-8deg)', opacity: 1 }], 320);
}

function stakeText(st: Stake) { return 'star' in st ? '1 Stern' : `${st.coins} Münzen`; }

// =====================================================================
/** Plus, Minus and Start: a coin shower on the figure, or coins draining out of it. */
export class SpaceScene extends Scene {
  f = h('div', 'sp-fig');
  num = h('div', 'sp-num');
  constructor(hst: Host, p: number, public type: string) {
    super(hst, p, type === 'M' ? 'minus' : 'plus', hst.name(p), type === 'M' ? 'Minus-Feld' : type === 'G' ? 'Startfeld' : 'Plus-Feld');
  }
  build() {
    const sp = SP[this.type as keyof typeof SP] ?? SP.P;
    this.art.classList.add('sp');
    this.f.dataset.fig = String(this.actor);
    this.f.innerHTML = `<div class="sp-disc" style="--sc:${sp.c};--sd:${sp.d}"><i>${this.type === 'M' ? '−' : '+'}</i></div>${this.fig(this.actor)}`;
    this.art.append(this.num, this.f);
    this.num.hidden = true;
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'coins' && ev.p === this.actor && ev.d) { await this.money(ev.d, ev.text); return 'eat'; }
    if (ev.k === 'toast' && /Glitzerschild|Bolle schützt/.test(ev.text)) {
      const sh = h('div', /Bolle/.test(ev.text) ? 'sp-shield bolle' : 'sp-shield', /Bolle/.test(ev.text) ? buddySVG('bolle') : '');
      this.f.appendChild(sh);
      sfx.whistle();
      void anim(sh, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 380);
      await this.say(ev.text, 1100, '#7dff8a');
      return 'eat';
    }
    if (ev.k === 'starBuy' && ev.p === this.actor) { await starDrop(this, this.f); return 'eat'; }
    return super.on(ev);
  }
  async money(d: number, text?: string) {
    const up = d > 0, n = Math.min(14, Math.abs(d) * 2);
    this.num.hidden = false;
    this.num.className = `sp-num ${up ? 'up' : 'down'}`;
    this.num.innerHTML = `${up ? '+' : '−'}${Math.abs(d)}<small>${esc(text ?? '')}</small>`;
    void anim(this.num, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 360, { easing: 'cubic-bezier(.3,1.45,.45,1)' });
    const fr = this.f.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    const cx = fr.left - rr.left + fr.width / 2, cy = fr.top - rr.top + fr.height * 0.35;
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      const c = h('i', 'fly', coinSVG);
      const sx = cx + (Math.random() - 0.5) * fr.width * 1.4;
      c.style.cssText = `left:${sx - 14}px;top:${cy - 14}px;width:28px;height:28px`;
      this.fx.appendChild(c);
      const delay = i * 55;
      if (up) jobs.push(anim(c, [{ transform: `translateY(${-cy - 40}px) rotate(0)`, opacity: 1 }, { transform: `translate(${cx - sx}px, 0) rotate(${360 + i * 40}deg) scale(.9)`, opacity: 1, offset: 0.85 }, { transform: `translate(${cx - sx}px, 10px) scale(.2)`, opacity: 0 }], 620, { delay, easing: 'cubic-bezier(.5,0,.8,.6)' }).then(() => c.remove()));
      else jobs.push(anim(c, [{ transform: `translate(${cx - sx}px, 0) scale(.3)`, opacity: 0 }, { transform: `translate(${(cx - sx) * 0.2}px, -90px) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate(${(sx - cx) * 0.4}px, ${rr.height - cy}px) rotate(${200 + i * 30}deg)`, opacity: 0.2 }], 820, { delay, easing: 'cubic-bezier(.3,0,.7,1)' }).then(() => c.remove()));
    }
    if (up) { sfx.coin(); void anim(this.f, [{ transform: 'none' }, { transform: 'translateY(-26px) scale(.95,1.08)', offset: 0.4 }, { transform: 'scale(1.1,.9)', offset: 0.75 }, { transform: 'none' }], 520, { delay: 300 }); }
    else { sfx.lose(); void anim(this.f, [{ transform: 'none' }, { transform: 'translateX(-10px) rotate(-4deg)' }, { transform: 'translateX(10px) rotate(4deg)' }, { transform: 'translateX(-6px)' }, { transform: 'scale(1.05,.9)' }], 560); this.f.classList.add('sad'); }
    await Promise.all(jobs);
    this.refresh();
    await pause(260);
  }
}

async function starDrop(s: Scene, to: Element) {
  const src = h('div', 'star-src', bigStarSVG());
  s.art.appendChild(src);
  sfx.star();
  await anim(src, [{ transform: 'translate(-50%,-160%) scale(.4) rotate(-40deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(8deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], 520);
  await pause(300);
  src.style.visibility = 'hidden';
  await fly(s.fx, bigStarSVG(), src, to, { size: 90, arc: 60, ms: 560 });
  src.remove();
  s.refresh();
  void anim(to, [{ transform: 'scale(1.2)' }, { transform: 'none' }], 420);
}

// =====================================================================
/** Ereignis: the event slot machine spins and stops on what happens. */
export class EventScene extends Scene {
  reel = h('div', 'reel');
  win = h('div', 'reel-win');
  labels: string[];
  revealed = false;
  constructor(hst: Host, p: number) {
    super(hst, p, 'event', hst.name(p), 'Ereignis!');
    const generic = ['Neonsturm', 'Glitzerregen', 'Taschentaube', 'Münzbrunnen'];
    this.labels = [...generic, ...hst.board.events.map((e) => EventScene.short(e.text))];
  }
  static short(t: string) { const i = t.indexOf(':'); return (i > 0 ? t.slice(0, i) : t.split(' ').slice(0, 3).join(' ')).replace(/!$/, ''); }
  build() {
    this.art.classList.add('ev');
    const m = h('div', 'evm', `<div class="slot-top"><i></i><i></i><i></i><i></i><i></i></div>`);
    this.win.appendChild(this.reel);
    m.appendChild(this.win);
    m.insertAdjacentHTML('beforeend', '<div class="slot-lever"><i></i></div><div class="slot-base">Ereignis-Automat</div>');
    this.art.append(h('div', 'ev-fig', this.fig(this.actor)), m);
    (this.art.querySelector('.ev-fig') as HTMLElement).dataset.fig = String(this.actor);
    const list = [...this.labels, ...this.labels];
    this.reel.innerHTML = list.map((l) => `<span>${esc(l)}</span>`).join('');
    this.reel.classList.add('spin');
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (!this.revealed && ev.k === 'toast' && ev.text.startsWith('Ereignis! ')) {
      this.revealed = true;
      const text = ev.text.slice(10);
      await this.stopAt(EventScene.short(text));
      const i = text.indexOf(':');
      await this.say(i > 0 ? text.slice(i + 1).trim() : text, undefined, '#ffd23f');
      return 'eat';
    }
    if (ev.k === 'coins' && ev.d && ev.p !== this.actor) {
      // everybody gets something: show their chip
      this.addChip(ev.p);
    }
    return super.on(ev);
  }
  async stopAt(label: string) {
    const lever = this.art.querySelector('.slot-lever i');
    void anim(lever, [{ transform: 'none' }, { transform: 'rotate(50deg)' }, { transform: 'none' }], 400, { fill: 'none' });
    const filler = Array.from({ length: 7 }, () => pickR(this.labels));
    this.reel.classList.remove('spin');
    this.reel.innerHTML = [...filler, label].map((l, i) => `<span class="${i === 7 ? 'hit' : ''}">${esc(l)}</span>`).join('');
    const H = (this.reel.firstElementChild as HTMLElement | null)?.offsetHeight || 64;
    let tick = 0;
    const tk = window.setInterval(() => { if (tick++ < 8) sfx.wheel(); }, Math.max(30, T(90)));
    await anim(this.reel, [{ transform: 'translateY(0)' }, { transform: `translateY(${-7 * H - 10}px)`, offset: 0.85 }, { transform: `translateY(${-7 * H}px)` }], 1100, { easing: 'cubic-bezier(.15,.7,.25,1)' });
    clearInterval(tk);
    sfx.pop();
    this.win.classList.add('won');
    await pause(250);
  }
}

// =====================================================================
const WHEEL_COLS = ['#3fdc7a', '#ffe14a', '#2fe6ff', '#ff7ad9'];
function wheelSVG(options: string[]) {
  const n = Math.max(1, options.length), R = 100;
  const segs = options.map((o, k) => {
    const a0 = (k / n) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const large = 1 / n > 0.5 ? 1 : 0;
    const am = ((k + 0.5) / n) * 360;
    const label = o.length > 14 ? o.slice(0, 13) + '…' : o;
    const path = n === 1 ? `<circle r="${R}" fill="${WHEEL_COLS[0]}" stroke="#0b0614" stroke-width="4"/>` : `<path d="M0 0 L${(Math.cos(a0) * R).toFixed(1)} ${(Math.sin(a0) * R).toFixed(1)} A${R} ${R} 0 ${large} 1 ${(Math.cos(a1) * R).toFixed(1)} ${(Math.sin(a1) * R).toFixed(1)} Z" fill="${WHEEL_COLS[k % WHEEL_COLS.length]}" stroke="#0b0614" stroke-width="4" stroke-linejoin="round"/>`;
    return `${path}<text transform="rotate(${am.toFixed(1)}) translate(0 -58) rotate(${n > 2 ? 0 : 0})" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" font-style="italic" font-size="${n > 2 ? 15 : 17}" fill="#0b0614">${esc(label)}</text>`;
  }).join('');
  return `<svg viewBox="-110 -110 220 220" aria-hidden="true"><circle r="108" fill="#0b0614"/>${segs}<circle r="16" fill="#fff" stroke="#0b0614" stroke-width="4"/>${Array.from({ length: 16 }, (_, k) => `<circle cx="${(Math.cos((k / 16) * Math.PI * 2) * 104).toFixed(1)}" cy="${(Math.sin((k / 16) * Math.PI * 2) * 104).toFixed(1)}" r="3" fill="#fff"/>`).join('')}</svg>`;
}

/** Glücksrad: a real wheel that spins onto the prize. */
export class LuckScene extends Scene {
  wheel = h('div', 'lw-wheel');
  spun = false;
  constructor(hst: Host, p: number) { super(hst, p, 'luck', hst.name(p), 'Glücksrad'); }
  build() {
    this.art.classList.add('lw');
    this.wheel.innerHTML = wheelSVG(['?', '?', '?']);
    this.wheel.classList.add('idle');
    const f = h('div', 'lw-fig', this.fig(this.actor));
    f.dataset.fig = String(this.actor);
    this.art.append(h('div', 'lw-box', '<i class="lw-ptr"></i>'), f);
    this.art.querySelector('.lw-box')!.prepend(this.wheel);
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'wheel' && !this.spun) { this.spun = true; await this.spin(ev.options, ev.pick); return 'eat'; }
    if (ev.k === 'toast' && ev.text.startsWith('Glücksrad:')) {
      const it = itemIn(ev.text);
      if (it) await giveItem(this, it, this.art.querySelector('.lw-box')!, this.art.querySelector('.lw-fig')!);
      await this.say(ev.text, 1000, '#3fdc7a');
      return 'eat';
    }
    return super.on(ev);
  }
  async spin(options: string[], k: number) {
    this.wheel.classList.remove('idle');
    this.wheel.innerHTML = wheelSVG(options);
    const n = options.length, seg = 360 / n;
    const end = 360 * 5 + (360 - (k + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.5;
    let tick = 0;
    const tk = window.setInterval(() => { if (tick++ < 22) sfx.wheel(); }, Math.max(25, T(80)));
    await anim(this.wheel, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${end}deg)` }], 2200, { easing: 'cubic-bezier(.12,.75,.2,1)' });
    clearInterval(tk);
    sfx.pop();
    await this.say(options[k], 900, '#3fdc7a');
  }
}

async function giveItem(s: Scene, it: ItemId, from: Element, to: Element) {
  sfx.buy();
  await fly(s.fx, itemSVG(it), from, to, { size: 72, arc: 120, ms: 700 });
  void anim(to, [{ transform: 'scale(1.15)' }, { transform: 'none' }], 380);
}

// =====================================================================
/** Duell: pick the opponent, pick the stake, then the versus splash. */
export class DuelScene extends Scene {
  opp = h('div', 'du-opp', '<div class="du-q">?</div>');
  a: Extract<Ask, { q: 'duel' }> | null = null;
  shown = false;
  constructor(hst: Host, p: number, public buddy = false) { super(hst, p, 'duel', hst.name(p), 'Duell!'); }
  build() {
    this.art.classList.add('du');
    const me = h('div', 'du-me', this.fig(this.actor));
    me.dataset.fig = String(this.actor);
    this.art.append(me, h('div', 'du-vs', vsSVG), this.opp);
  }
  setOpp(p: number) {
    this.opp.innerHTML = this.fig(p, 'flip') + `<b style="--pc:${this.seat(p).color}">${esc(this.name(p))}</b>`;
    void anim(this.opp, [{ transform: 'translateX(30px)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], 220);
  }
  accepts(a: Ask, p: number) { return a.q === 'duel' && p === this.actor; }
  oppCards(a: Extract<Ask, { q: 'duel' }>) {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row';
    return a.opponents.map((q) => { const c = this.playerCard(q); this.cards.appendChild(c); return c; });
  }
  async ask(a: Ask): Promise<Answer> {
    if (a.q !== 'duel') return { p: -1, stake: 0 };
    this.a = a;
    void this.say('Wen forderst du heraus?', 700);
    const els = this.oppCards(a);
    const o = await pick(els.map((el, i) => ({ el, value: a.opponents[i], ok: true })), { onFocus: (i) => this.setOpp(a.opponents[i]) });
    this.setOpp(o);
    void this.say(`Worum spielst du gegen ${this.name(o)}?`, 700);
    this.cards.innerHTML = '';
    const oStars = this.h.st.players[o].stars;
    const els2 = a.stakes.map((s) => {
      const star = 'star' in s;
      const c = this.card(`<span class="sc-ico">${star ? starSVG() : coinSVG}</span><b>${stakeText(s)}</b><small>${star ? (oStars ? 'Der Sieger nimmt dem anderen einen Stern ab.' : `${esc(this.name(o))} hat keinen Stern: dann geht es um 10 Münzen.`) : 'Der Sieger bekommt den Einsatz des anderen.'}</small>`, star ? 'stake star' : 'stake');
      this.cards.appendChild(c);
      return c;
    });
    void anim(this.cards, [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 260);
    const stake = await pick(els2.map((el, i) => ({ el, value: i, ok: true })));
    return { p: o, stake };
  }
  watch(a: Ask) {
    if (a.q !== 'duel') return;
    this.a = a;
    this.showWho(`${this.name(this.actor)} wählt einen Gegner …`);
    const els = this.oppCards(a);
    this.gh = ghost(els, (i) => this.setOpp(a.opponents[i]));
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'banner' && /Duell/.test(ev.text)) { this.gh?.stop(); this.who.hidden = true; return 'eat'; }
    if (ev.k === 'toast' && !this.shown) {
      for (const q of this.h.seats.keys()) {
        const pre = `${this.name(this.actor)} fordert ${this.name(q)} heraus! Einsatz: `;
        if (q !== this.actor && ev.text.startsWith(pre)) {
          this.shown = true;
          await versus(this, this.actor, q, `Einsatz: ${ev.text.slice(pre.length).replace(/\.$/, '')}`);
          return 'eat';
        }
      }
    }
    return super.on(ev);
  }
}

// =====================================================================
/** Kumpel: the buddy flies in and joins, gets lured away, stays, or says goodbye. */
export class BuddyScene extends Scene {
  f = h('div', 'bd-fig');
  bud = h('div', 'bd-bud');
  info = h('div', 'bd-info');
  constructor(hst: Host, p: number) { super(hst, p, 'buddy', hst.name(p), 'Kumpel'); }
  build() {
    this.art.classList.add('bd');
    this.f.innerHTML = this.fig(this.actor);
    this.f.dataset.fig = String(this.actor);
    this.bud.hidden = true;
    this.info.hidden = true;
    this.art.append(this.f, this.bud);
    this.cards.appendChild(this.info);
    const b = this.h.st.buddy;
    if (!b) { this.bud.hidden = false; this.bud.className = 'bd-bud zz'; this.bud.innerHTML = `<span class="zz-egg"></span><i>z</i><i>z</i><i>z</i>`; }
  }
  showInfo(kind: BuddyId, extra: string) {
    const B = BUDDIES[kind];
    this.info.hidden = false;
    this.info.style.setProperty('--bc', B.color);
    this.info.innerHTML = `<span class="bd-ico">${buddySVG(kind)}</span><span><b>${esc(B.name)}</b><small>${esc(B.look)}</small><em>Alle Feldwirkungen zählen doppelt. ${esc(B.text)}</em><small>${esc(extra)}</small></span>`;
    void anim(this.info, [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300);
  }
  async join(kind: BuddyId, text: string) {
    this.setTitle(this.name(this.actor), `${BUDDIES[kind].name} kommt mit!`);
    this.bud.hidden = false;
    this.bud.className = 'bd-bud';
    this.bud.innerHTML = buddySVG(kind);
    this.bud.style.setProperty('--bc', BUDDIES[kind].color);
    sfx.star();
    await anim(this.bud, [
      { transform: 'translate(60vw,-50vh) scale(.4) rotate(-30deg)', opacity: 0 },
      { transform: 'translate(20vw,-30vh) scale(.9) rotate(10deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-12vw,-6vh) scale(1.1) rotate(-8deg)', offset: 0.65 },
      { transform: 'translate(8vw,4vh) scale(1) rotate(6deg)', offset: 0.85 },
      { transform: 'none' },
    ], 1200, { easing: 'ease-in-out' });
    this.bud.classList.add('orbit');
    void anim(this.f, [{ transform: 'none' }, { transform: 'translateY(-24px) scale(.95,1.08)' }, { transform: 'none' }], 460);
    this.showInfo(kind, text);
    await pause(700);
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'buddy') {
      if (ev.what === 'join' && ev.p === this.actor) { await this.join(ev.kind, 'Hilft 3 eigene Züge lang.'); return 'eat'; }
      if (ev.what === 'lure' && ev.p === this.actor) { this.s2(); await this.join(ev.kind, `Von ${ev.from !== undefined ? this.name(ev.from) : '?'} weggelockt!`); return 'eat'; }
      if (ev.what === 'leave' && ev.p === this.actor) {
        this.bud.hidden = false;
        this.bud.className = 'bd-bud';
        this.bud.innerHTML = buddySVG(ev.kind);
        this.setTitle(this.name(this.actor), `Tschüss, ${BUDDIES[ev.kind].name}!`);
        await anim(this.bud, [{ transform: 'none' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'none' }], 700);
        await anim(this.bud, [{ transform: 'none', opacity: 1 }, { transform: 'translate(50vw,-60vh) scale(.3) rotate(40deg)', opacity: 0 }], 800, { easing: 'ease-in' });
        this.done = true;
        return 'eat';
      }
      return 'close';
    }
    if (ev.k === 'banner' && /Kumpel-Duell/.test(ev.text)) return 'eat';
    if (ev.k === 'toast') {
      const b = this.h.st.buddy;
      if (b && b.owner !== null && ev.text.startsWith(`${this.name(this.actor)} will `)) {
        await versus(this, this.actor, b.owner, `Wer gewinnt, behält ${BUDDIES[b.kind].name}`, `<div class="vs-bud">${buddySVG(b.kind)}</div>`);
        return 'eat';
      }
      if (/bleibt 3 weitere Züge/.test(ev.text) && b) {
        this.bud.hidden = false; this.bud.className = 'bd-bud orbit'; this.bud.innerHTML = buddySVG(b.kind);
        this.showInfo(b.kind, 'Bleibt 3 weitere Züge!');
      }
      if (/Kumpel .* hilft/.test(ev.text)) return 'eat';
    }
    return super.on(ev);
  }
  s2() { this.art.classList.remove('vsart'); clearArt(this); this.art.append(this.f, this.bud); }
}

// =====================================================================
/** Bande (offer + answer) and Rivale: choice cards with the figures, then a stamp. */
export class TeamScene extends Scene {
  icon = h('div', 'tm-ico');
  other = h('div', 'tm-other', '<div class="du-q">?</div>');
  target = -1;
  constructor(hst: Host, p: number, public kind: 'Bande' | 'Rivale') {
    super(hst, p, kind === 'Bande' ? 'bande' : 'rival', hst.name(p), kind === 'Bande' ? 'Bande gründen' : 'Rivale!');
  }
  build() {
    this.art.classList.add('tm');
    this.icon.innerHTML = this.kind === 'Bande' ? handshakeSVG : boltSVG;
    const me = h('div', 'tm-me', this.fig(this.actor));
    me.dataset.fig = String(this.actor);
    this.art.append(me, this.icon, this.other);
  }
  setOther(p: number) {
    if (p < 0) { this.other.innerHTML = '<div class="du-q">–</div><b>Niemand</b>'; return; }
    this.other.innerHTML = this.fig(p, 'flip') + `<b style="--pc:${this.seat(p).color}">${esc(this.name(p))}</b>`;
    this.other.dataset.fig = String(p);
    void anim(this.other, [{ transform: 'translateX(30px)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], 220);
  }
  accepts(a: Ask, p: number) {
    return (a.q === 'target' && p === this.actor && (a.title === 'Bande' || a.title === 'Rivale')) || (a.q === 'bandeOffer' && a.from === this.actor);
  }
  cardsFor(opts: number[]) {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row';
    return opts.map((q) => {
      const c = q < 0 ? this.card('<span class="sc-ico none">–</span><b>Niemand</b><small>Lieber allein bleiben.</small>', 'pc') : this.playerCard(q);
      this.cards.appendChild(c);
      return c;
    });
  }
  text(a: Extract<Ask, { q: 'target' }>) { return a.text; }
  async ask(a: Ask, p: number): Promise<Answer> {
    if (a.q === 'bandeOffer') return this.offer(a.from, p, true);
    if (a.q !== 'target') return { p: -1 };
    void this.say(a.text, 900);
    const els = this.cardsFor(a.options);
    const v = await pick(els.map((el, i) => ({ el, value: a.options[i], ok: true })), { onFocus: (i) => this.setOther(a.options[i]) });
    this.setOther(v);
    this.cards.innerHTML = '';
    return { p: v };
  }
  watch(a: Ask, p: number) {
    if (a.q === 'bandeOffer') { void this.offer(a.from, p, false); return; }
    if (a.q !== 'target') return;
    this.showWho(`${this.name(this.actor)} wählt …`);
    void this.say(a.text, 900);
    const els = this.cardsFor(a.options);
    this.gh = ghost(els, (i) => this.setOther(a.options[i]));
  }
  /** The Bande offer, seen by the one who gets it (mine) or by everybody else. */
  offer(from: number, to: number, mine: boolean): Promise<Answer> {
    this.gh?.stop();
    this.target = to;
    this.setOther(to);
    this.setTitle(`${this.name(from)} → ${this.name(to)}`, 'Bande?');
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row two';
    const yes = this.card(`<span class="sc-ico">${handshakeSVG}</span><b>Einschlagen</b><small>2 Runden lang teilt ihr alle Minispiel-Münzen 50:50.</small>`, 'yes');
    const no = this.card('<span class="sc-ico none">✕</span><b>Lieber nicht</b><small>Jeder spielt für sich.</small>', 'no');
    this.cards.append(yes, no);
    void this.say(mine ? `${this.name(from)} bietet dir eine Bande an!` : `${this.name(from)} bietet ${this.name(to)} eine Bande an.`, 800);
    if (mine) {
      this.who.hidden = true;
      return pick([{ el: yes, value: true, ok: true }, { el: no, value: false, ok: true }]).then((y) => ({ yes: y }));
    }
    this.showWho(`${this.name(to)} überlegt …`);
    this.gh = ghost([yes, no]);
    return Promise.resolve({ yes: false });
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'toast') {
      this.gh?.stop();
      this.who.hidden = true;
      if (ev.text.startsWith('Bande! ')) { this.cards.innerHTML = ''; await stamp(this, 'Bande!', '#2fe6c8'); await this.say(ev.text, 1200, '#2fe6c8'); this.done = true; return 'eat'; }
      if (/lehnt die Bande ab|bleibt lieber allein/.test(ev.text)) { this.cards.innerHTML = ''; await stamp(this, /allein/.test(ev.text) ? 'Allein' : 'Abgelehnt', '#ff8fb0'); await this.say(ev.text, 1000); this.done = true; return 'eat'; }
      if (/zum Rivalen!/.test(ev.text)) {
        const q = [...this.h.seats.keys()].find((k) => ev.text === `${this.name(this.actor)} erklärt ${this.name(k)} zum Rivalen!`);
        if (q !== undefined) this.setOther(q);
        this.cards.innerHTML = '';
        await stamp(this, 'Rivale!', '#ff3d9a');
        await this.say('Überholst du ihn in 3 Runden, zahlt er dir 10. Sonst zahlst du 5.', 1300, '#ff3d9a');
        this.done = true;
        return 'eat';
      }
    }
    return super.on(ev);
  }
}

// =====================================================================
const KOMET_HI = ['Ein Stern gefällig, Schätzchen?', 'Frisch vom Himmel gepflückt!', 'Na, funkelt da wer?'];
/** Madame Komet sells the star (or tells you that you are short), and the star flies in. */
export class StarScene extends Scene {
  komet = h('div', 'km-wrap talk-on', kometSVG());
  star = h('div', 'st-star', bigStarSVG());
  f = h('div', 'st-fig');
  bought = false;
  constructor(hst: Host, p: number, public mode: 'buy' | 'miss' | 'gift', public price = 20) {
    super(hst, p, 'star', hst.name(p), mode === 'gift' ? 'Ein Stern!' : 'Stern kaufen?');
  }
  build() {
    this.art.classList.add('st');
    this.f.innerHTML = this.fig(this.actor);
    this.f.dataset.fig = String(this.actor);
    const ped = h('div', 'st-ped', `<div class="st-plate">${coinSVG}<b>${this.price}</b></div>`);
    ped.prepend(this.star);
    this.art.append(this.komet, ped, this.f);
    this.art.insertAdjacentHTML('afterbegin', '<div class="st-sky"><i></i><i></i><i></i><i></i><i></i><i></i></div>');
  }
  accepts(a: Ask, p: number) { return a.q === 'buyStar' && p === this.actor; }
  async ask(a: Ask): Promise<Answer> {
    if (a.q !== 'buyStar') return { yes: false };
    const coins = this.h.st.players[this.actor].coins;
    void this.say(`${pickR(KOMET_HI)} Nur ${a.price} Münzen. Du hast ${coins}.`, 600);
    const c = this.ynCards(a.price);
    const yes = await pick([{ el: c[0], value: true, ok: true }, { el: c[1], value: false, ok: true }], { back: false });
    if (!yes) { this.cards.innerHTML = ''; await this.say('Schade! Vielleicht beim nächsten Mal.', 700); }
    return { yes };
  }
  ynCards(price: number) {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row two';
    const y = this.card(`<span class="sc-ico">${starSVG()}</span><b>Kaufen</b><small>${price} Münzen für 1 Stern</small>`, 'yes');
    const n = this.card('<span class="sc-ico none">✕</span><b>Nicht jetzt</b><small>Die Münzen behalten.</small>', 'no');
    this.cards.append(y, n);
    return [y, n];
  }
  watch(a: Ask) {
    if (a.q !== 'buyStar') return;
    void this.say(`${pickR(KOMET_HI)} Nur ${a.price} Münzen.`, 600);
    this.showWho(`${this.name(this.actor)} überlegt …`);
    this.gh = ghost(this.ynCards(a.price));
  }
  async enter() {
    await super.enter();
    if (this.mode === 'miss') {
      void anim(this.komet, [{ transform: 'none' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(8deg)' }, { transform: 'none' }], 600);
      await this.say(`Der Stern kostet ${this.price} Münzen. ${this.name(this.actor)} hat nur ${this.h.st.players[this.actor].coins}. Spar noch ein bisschen!`, 1600, '#ff8fb0');
      this.done = true;
    }
  }
  async give() {
    this.gh?.stop(0);
    this.who.hidden = true;
    this.cards.innerHTML = '';
    sfx.star();
    void this.say(this.mode === 'gift' ? 'Ein Stern für dich!' : 'Glückwunsch! Der Stern gehört dir!', 900, '#ffe14a');
    await anim(this.star, [{ transform: 'none' }, { transform: 'translateY(-30px) scale(1.25) rotate(20deg)' }], 360);
    this.star.style.visibility = 'hidden';
    await fly(this.fx, bigStarSVG(), this.star, this.f, { size: 120, arc: 140, ms: 700 });
    this.refresh();
    void anim(this.f, [{ transform: 'none' }, { transform: 'translateY(-30px) scale(.95,1.1)' }, { transform: 'none' }], 520);
    for (let i = 0; i < 10; i++) {
      const s = h('i', 'spark');
      this.f.appendChild(s);
      const a = (i / 10) * Math.PI * 2;
      void anim(s, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * 90}px, ${Math.sin(a) * 90}px) scale(.2)`, opacity: 0 }], 700).then(() => s.remove());
    }
    await pause(900);
    this.bought = true;
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'starBuy' && ev.p === this.actor && !this.bought) { await this.give(); return this.mode === 'gift' ? 'end' : 'eat'; }
    return super.on(ev);
  }
}

// =====================================================================
/** Using an item: it zooms in with rays; the Joker and the Tauschkarte ask right here. */
export class ItemScene extends Scene {
  big = h('div', 'it-big');
  f = h('div', 'it-fig');
  constructor(hst: Host, p: number, public item: ItemId) { super(hst, p, 'item', hst.name(p), ITEMS[item].name); }
  build() {
    this.art.classList.add('it');
    this.big.innerHTML = `<i class="rays"></i>${itemSVG(this.item)}`;
    this.f.innerHTML = this.fig(this.actor);
    this.f.dataset.fig = String(this.actor);
    this.art.append(this.f, this.big);
    this.cards.innerHTML = `<p class="it-txt">${esc(ITEMS[this.item].text)}</p>`;
  }
  async enter() {
    await super.enter();
    sfx.buy();
    await anim(this.big, [{ transform: 'scale(.1) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.25) rotate(8deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 520);
    void anim(this.f, [{ transform: 'none' }, { transform: 'translateY(-20px)' }, { transform: 'none' }], 420);
    await pause(this.item === 'joker' || this.item === 'tausch' ? 200 : 650);
  }
  accepts(a: Ask, p: number) { return p === this.actor && (a.q === 'joker' || (a.q === 'target' && a.title === 'Tauschkarte')); }
  async ask(a: Ask): Promise<Answer> {
    if (a.q === 'joker') {
      void this.say('Welche Zahl soll es sein?', 600);
      const els = this.dice();
      return { n: await pick(els.map((el, i) => ({ el, value: i + 1, ok: true }))) };
    }
    if (a.q === 'target') {
      void this.say(a.text, 600);
      const els = this.players(a.options);
      return { p: await pick(els.map((el, i) => ({ el, value: a.options[i], ok: true }))) };
    }
    return { yes: false };
  }
  dice() {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards dice';
    return [1, 2, 3, 4, 5, 6].map((n) => { const c = this.card(`<b class="dn">${n}</b>`, 'die'); this.cards.appendChild(c); return c; });
  }
  players(opts: number[]) {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row';
    return opts.map((q) => { const c = this.playerCard(q); this.cards.appendChild(c); return c; });
  }
  watch(a: Ask) {
    this.showWho(`${this.name(this.actor)} wählt …`);
    if (a.q === 'joker') this.gh = ghost(this.dice());
    else if (a.q === 'target') this.gh = ghost(this.players(a.options));
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'roll' && this.gh) { this.gh.stop(ev.dice[0] - 1); await pause(350); return 'close'; }
    if (ev.k === 'toast') { this.gh?.stop(); this.who.hidden = true; }
    return super.on(ev);
  }
}

// =====================================================================
/** Palais Lumen, Jetonfeld: Rot or Schwarz, the wheel spins, the ball drops. */
export class JetonScene extends Scene {
  wheel = h('div', 'jt-wheel');
  ball = h('i', 'jt-ball');
  res = h('div', 'jt-res');
  pot = h('div', 'jt-pot');
  bet = h('div', 'jt-bet');
  constructor(hst: Host, p: number) { super(hst, p, 'palais', hst.name(p), 'Jetonfeld'); }
  build() {
    this.art.classList.add('jt');
    this.wheel.innerHTML = rouletteSVG(POCKETS, RED);
    const box = h('div', 'jt-box');
    box.append(this.wheel, this.ball, this.res);
    const f = h('div', 'jt-fig', this.fig(this.actor));
    f.dataset.fig = String(this.actor);
    this.res.hidden = true;
    this.pot.innerHTML = `<small>Jackpot</small><b>${Number((this.h.st.bs as { jackpot?: number }).jackpot ?? 0)}</b>`;
    this.bet.hidden = true;
    this.art.append(box, f, this.pot, this.bet);
  }
  accepts(a: Ask, p: number) { return a.q === 'yesno' && a.title === 'Jetonfeld' && p === this.actor; }
  rb() {
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row two';
    const r = this.card('<span class="chip-j red"></span><b>Rot</b><small>Treffer zahlt doppelt</small>', 'jr');
    const s = this.card('<span class="chip-j blk"></span><b>Schwarz</b><small>Treffer zahlt doppelt</small>', 'js');
    this.cards.append(r, s);
    return [r, s];
  }
  async ask(a: Ask): Promise<Answer> {
    if (a.q !== 'yesno') return { yes: true };
    void this.say(a.text, 700);
    const [r, s] = this.rb();
    return { yes: await pick([{ el: r, value: true, ok: true }, { el: s, value: false, ok: true }]) };
  }
  watch(a: Ask) {
    if (a.q !== 'yesno') return;
    void this.say(a.text, 700);
    this.showWho(`${this.name(this.actor)} setzt …`);
    this.gh = ghost(this.rb());
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'toast' && / setzt \d+ Münzen auf /.test(ev.text)) {
      const red = /auf Rot/.test(ev.text);
      this.gh?.stop(red ? 0 : 1);
      this.who.hidden = true;
      this.bet.hidden = false;
      this.bet.innerHTML = `<span class="chip-j ${red ? 'red' : 'blk'}"></span><b>${red ? 'Rot' : 'Schwarz'}</b>`;
      sfx.pop();
      await anim(this.bet, [{ transform: 'translateY(-60px) scale(1.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, { easing: 'cubic-bezier(.3,1.45,.45,1)' });
      await this.say(ev.text, 900, '#f2cf74');
      this.cards.innerHTML = '';
      return 'eat';
    }
    if (ev.k === 'gimmick' && ev.name === 'jeton') { await this.spin(Number(ev.data?.n) || 0); return 'eat'; }
    if (ev.k === 'gimmick' && ev.name === 'jackpot') {
      this.pot.innerHTML = `<small>Jackpot</small><b>${Number(ev.data?.jackpot) || 0}</b>`;
      void anim(this.pot, [{ transform: 'scale(1.3)' }, { transform: 'none' }], 360);
      await pause(500);
      this.done = true;
      return 'eat';
    }
    return super.on(ev);
  }
  async spin(n: number) {
    const k = Math.max(0, POCKETS.indexOf(n));
    const end = -(k / POCKETS.length) * 360 - 360 * 4;
    const S = this.wheel.getBoundingClientRect().width || 300;
    const rOut = -S * 0.47, rIn = -S * 0.37;
    this.ball.style.opacity = '1';
    let tick = 0;
    const tk = window.setInterval(() => { if (tick++ < 26) sfx.wheel(); }, Math.max(25, T(95)));
    await Promise.all([
      anim(this.wheel, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${end}deg)` }], 2600, { easing: 'cubic-bezier(.15,.7,.2,1)' }),
      anim(this.ball, [{ transform: `rotate(0deg) translateY(${rOut}px)` }, { transform: `rotate(1080deg) translateY(${rOut}px)`, offset: 0.7 }, { transform: `rotate(1440deg) translateY(${rIn}px)` }], 2600, { easing: 'cubic-bezier(.2,.6,.3,1)' }),
    ]);
    clearInterval(tk);
    sfx.pop();
    const col = n === 0 ? 'Grün' : RED.has(n) ? 'Rot' : 'Schwarz';
    this.res.hidden = false;
    this.res.className = `jt-res ${n === 0 ? 'g' : RED.has(n) ? 'r' : 'b'}`;
    this.res.innerHTML = `<b>${n}</b><small>${col}</small>`;
    await anim(this.res, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], 380);
  }
}

/** CS-Bunker, Lastenaufzug: the cabin rides between the floors (with the figure, or empty). */
export class LiftScene extends Scene {
  cab = h('div', 'lf-cab');
  f = h('div', 'lf-fig');
  constructor(hst: Host, p: number) { super(hst, p, 'bunker', hst.name(p), 'Lastenaufzug'); }
  build() {
    this.art.classList.add('lf');
    const lift = (this.h.st.bs as { lift?: string }).lift === 'oben' ? 'oben' : 'unten';
    const shaft = h('div', 'lf-shaft', '<div class="lf-floor top"><span>Kontrollgang · oben</span></div><div class="lf-floor bot"><span>Schienenweg · unten</span></div><i class="lf-cable"></i>');
    this.cab.innerHTML = '<i class="lf-door"></i><i class="lf-lamp"></i>';
    this.cab.classList.add(lift);
    this.f.innerHTML = this.fig(this.actor);
    this.f.dataset.fig = String(this.actor);
    this.f.classList.add('out', lift === 'oben' ? 'bot' : 'top');
    shaft.append(this.cab, this.f);
    this.art.appendChild(shaft);
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'gimmick' && ev.name === 'lift') {
      const from = String(ev.data?.from) === 'oben' ? 'oben' : 'unten', to = String(ev.data?.to) === 'oben' ? 'oben' : 'unten', ride = !!ev.data?.ride;
      const shaft = this.art.querySelector('.lf-shaft') as HTMLElement;
      const H = shaft.clientHeight;
      const cy = (w: string) => (w === 'oben' ? 0.06 : 0.62) * H;
      this.cab.className = `lf-cab ${from}`;
      if (ride) {
        this.f.className = `lf-fig out ${from === 'oben' ? 'top' : 'bot'}`;
        const dx = this.cab.offsetLeft + this.cab.offsetWidth / 2 - (this.f.offsetLeft + this.f.offsetWidth / 2);
        sfx.hop(2);
        await anim(this.f, [{ transform: 'none' }, { transform: `translate(${dx * 0.5}px, -20px)` }, { transform: `translateX(${dx}px)` }], 520);
        this.f.getAnimations().forEach((a) => a.cancel());
        this.f.className = 'lf-fig';
        this.cab.appendChild(this.f);
      } else this.f.className = `lf-fig out ${to === 'oben' ? 'top' : 'bot'}`;
      sfx.creak();
      const dy = cy(to) - cy(from);
      await anim(this.cab, [{ transform: 'translateY(0)' }, { transform: `translateY(${dy}px)` }], 1300, { easing: 'cubic-bezier(.45,0,.3,1)' });
      this.cab.className = `lf-cab ${to}`;
      this.cab.getAnimations().forEach((a) => a.cancel());
      sfx.land();
      void anim(this.cab, [{ transform: 'none' }, { transform: 'translateY(6px)' }, { transform: 'none' }], 200, { fill: 'none' });
      await pause(300);
      return 'eat';
    }
    return super.on(ev);
  }
}

/** Neonstadt, Drehbühne: the plaza turns and opens or closes the short cut. */
export class StageScene extends Scene {
  disc = h('div', 'tt-disc', turntableSVG());
  st2 = h('div', 'tt-state');
  constructor(hst: Host, p: number) { super(hst, p, 'neon', hst.name(p), 'Drehbühne'); }
  build() {
    this.art.classList.add('tt');
    const open = !!(this.h.st.bs as { plazaOpen?: boolean }).plazaOpen;
    this.disc.style.transform = `rotate(${open ? 90 : 0}deg)`;
    const box = h('div', 'tt-box', '<span class="tt-n">Nord</span><span class="tt-o">Ost</span>');
    box.prepend(this.disc);
    const f = h('div', 'tt-fig', this.fig(this.actor));
    f.dataset.fig = String(this.actor);
    this.setState(open);
    this.art.append(box, f, this.st2);
  }
  setState(open: boolean) { this.st2.className = `tt-state ${open ? 'on' : 'off'}`; this.st2.innerHTML = `Plaza-Abkürzung<b>${open ? 'offen' : 'zu'}</b>`; }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'gimmick' && ev.name === 'plaza') {
      const open = !!ev.data?.open;
      sfx.creak();
      const a = open ? 90 : 0, b = open ? 0 : 90;
      this.disc.style.transform = '';
      await anim(this.disc, [{ transform: `rotate(${b}deg)` }, { transform: `rotate(${a + (open ? 360 : -360)}deg)` }], 1300, { easing: 'cubic-bezier(.4,0,.2,1)' });
      this.disc.style.transform = `rotate(${a}deg)`;
      this.disc.getAnimations().forEach((x) => x.cancel());
      this.setState(open);
      sfx.pop();
      return 'eat';
    }
    return super.on(ev);
  }
}

/** Any other board field. */
export class XScene extends Scene {
  constructor(hst: Host, p: number) { super(hst, p, 'x', hst.name(p), hst.board.xName); }
  build() {
    const f = h('div', 'x-fig', `<div class="sp-disc" style="--sc:${SP.X.c};--sd:${SP.X.d}"><i>★</i></div>${this.fig(this.actor)}`);
    f.dataset.fig = String(this.actor);
    this.art.classList.add('sp');
    this.art.appendChild(f);
  }
}

// =====================================================================
const FEST: Record<string, { theme: string; deco: string }> = {
  neonstadt: { theme: 'fest-neon', deco: '<i class="moon"></i>' + '<i class="lan"></i>'.repeat(6) },
  palais: { theme: 'fest-gala', deco: '<i class="chand"></i>' + '<i class="conf"></i>'.repeat(14) },
  bunker: { theme: 'fest-crates', deco: `<i class="crate-f">${crateSVG()}</i>`.repeat(6) },
};
/** Brettfest: the board's party for everybody (Neonnacht, Jackpot-Gala, Kistenregen …). */
export class FestScene extends Scene {
  row = h('div', 'fe-row');
  constructor(hst: Host, title: string) { super(hst, hst.st.turn < hst.seats.length ? hst.st.turn : 0, FEST[hst.board.id]?.theme ?? 'fest', 'Brettfest', title.replace(/!$/, '')); }
  build() {
    this.art.classList.add('fe');
    this.art.insertAdjacentHTML('afterbegin', `<div class="fe-deco">${FEST[this.h.board.id]?.deco ?? '<i class="conf"></i>'.repeat(14)}</div>`);
    this.h.seats.forEach((_, p) => {
      const f = h('div', 'fe-fig', `${this.fig(p)}<span class="fe-box"></span><b style="--pc:${this.seat(p).color}">${esc(this.name(p))}</b>`);
      f.dataset.fig = String(p);
      this.row.appendChild(f);
      this.addChip(p);
    });
    this.art.appendChild(this.row);
  }
  async enter() { await super.enter(); sfx.fanfare(); }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'gimmick') return 'eat';
    if (ev.k === 'banner') return 'eat';
    if (ev.k === 'wheel') { await this.crate(ev.p, ev.options, ev.pick); return 'eat'; }
    if (ev.k === 'toast') {
      const it = itemIn(ev.text);
      const p = [...this.h.seats.keys()].find((k) => ev.text.startsWith(this.name(k) + ' '));
      if (it && p !== undefined) { const f = this.row.querySelector(`[data-fig="${p}"]`); if (f) await giveItem(this, it, f.querySelector('.fe-box') ?? f, f); }
    }
    return super.on(ev);
  }
  async crate(p: number, options: string[], k: number) {
    const f = this.row.querySelector(`[data-fig="${p}"]`);
    const box = f?.querySelector('.fe-box') as HTMLElement | null;
    if (!box) return;
    box.innerHTML = `<i class="cr">${crateSVG()}</i><span class="cr-t"></span>`;
    const cr = box.querySelector('.cr'), t = box.querySelector('.cr-t') as HTMLElement;
    sfx.bonk();
    await anim(cr, [{ transform: 'translateY(-60vh) rotate(-30deg)' }, { transform: 'translateY(0) rotate(4deg)', offset: 0.8 }, { transform: 'translateY(-14px)', offset: 0.9 }, { transform: 'none' }], 560, { easing: 'ease-in' });
    for (let i = 0; i < 6; i++) { t.textContent = options[(k + i + 1) % options.length]; sfx.wheel(); await pause(70); }
    if (cr) cr.innerHTML = crateSVG(true);
    t.textContent = options[k];
    t.classList.add('on');
    sfx.pop();
    await anim(t, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 320);
    await pause(250);
  }
}

// =====================================================================
/** Finale: the splash, then the last-placed picks one of three rules. */
export class FinaleScene extends Scene {
  ruleEls: HTMLButtonElement[] = [];
  opts: FinaleRule[] = [];
  constructor(hst: Host) { super(hst, hst.st.turn < hst.seats.length ? hst.st.turn : 0, 'finale', `Letzte 3 Runden`, 'Finale!'); }
  build() {
    this.art.classList.add('fi');
    this.art.insertAdjacentHTML('afterbegin', `<div class="fi-burst"></div><div class="fi-word">Finale!</div><div class="fi-row">${this.h.seats.map((_, p) => `<div data-fig="${p}">${this.fig(p)}</div>`).join('')}</div>`);
  }
  async enter() { await super.enter(); sfx.fanfare(); await anim(this.art.querySelector('.fi-word'), [{ transform: 'scale(3) rotate(-12deg)', opacity: 0 }, { transform: 'scale(.95) rotate(-5deg)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-5deg)', opacity: 1 }], 520); }
  accepts(a: Ask) { return a.q === 'finale'; }
  ruleCards(opts: FinaleRule[], p: number) {
    this.opts = opts;
    this.actor = p;
    this.addChip(p);
    this.cards.innerHTML = '';
    this.cards.className = 'scn-cards sc-row three';
    this.ruleEls = opts.map((r) => { const c = this.card(`<b>${esc(FINALE_RULES[r].name)}</b><small>${esc(FINALE_RULES[r].text)}</small>`, 'rule'); this.cards.appendChild(c); return c; });
    void anim(this.cards, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320);
    return this.ruleEls;
  }
  async ask(a: Ask, p: number): Promise<Answer> {
    if (a.q !== 'finale') return { rule: 'catchup' };
    void this.say('Du liegst hinten und wählst die Regel für die letzten 3 Runden!', 900);
    const els = this.ruleCards(a.options, p);
    return { rule: await pick(els.map((el, i) => ({ el, value: a.options[i], ok: true }))) };
  }
  watch(a: Ask, p: number) {
    if (a.q !== 'finale') return;
    this.showWho(`${this.name(p)} liegt hinten und wählt die Finale-Regel …`);
    this.gh = ghost(this.ruleCards(a.options, p));
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'toast' && / wählt die Finale-Regel: /.test(ev.text)) {
      const k = this.opts.findIndex((r) => ev.text.includes(`: ${FINALE_RULES[r].name}.`));
      this.gh?.stop(k);
      this.who.hidden = true;
      if (k >= 0) { this.ruleEls.forEach((e, i) => e.classList.toggle('dim', i !== k)); void anim(this.ruleEls[k], [{ transform: 'none' }, { transform: 'scale(1.1) rotate(-2deg)' }, { transform: 'none' }], 420); }
      await this.say(ev.text, 1500, '#ffe14a');
      this.done = true;
      return 'eat';
    }
    return super.on(ev);
  }
}

// =====================================================================
/** Before the podium: the three bonus stars are turned over one by one. */
export class BonusScene extends Scene {
  row = h('div', 'bo-row');
  figs = h('div', 'bo-figs');
  constructor(hst: Host) { super(hst, 0, 'bonus', 'Ende des Abends', 'Bonus-Sterne'); }
  build() {
    this.art.classList.add('bo');
    this.art.append(this.row, this.figs);
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'bonus') { await this.reveal(ev.list); return 'eat'; }
    return super.on(ev);
  }
  async reveal(list: { id: keyof typeof BONUS; winners: number[] }[]) {
    const won = this.h.seats.map((_, p) => list.filter((b) => b.winners.includes(p)).length);
    const stars = this.h.seats.map((_, p) => this.h.st.players[p].stars - won[p]);
    this.figs.innerHTML = this.h.seats.map((s, p) => `<div class="bo-fig" data-fig="${p}">${this.fig(p)}<b style="--pc:${s.color}">${esc(s.name)}</b><span class="bo-st"><i class="s-star">★</i><em>${stars[p]}</em></span></div>`).join('');
    this.row.innerHTML = list.map(() => `<div class="bo-card"><div class="bo-back">${bigStarSVG('#ffe14a')}<b>?</b></div><div class="bo-front"></div></div>`).join('');
    await pause(700);
    for (let i = 0; i < list.length; i++) {
      const b = list[i], c = this.row.children[i] as HTMLElement, d = BONUS[b.id];
      (c.querySelector('.bo-front') as HTMLElement).innerHTML = `<b>${esc(d.name)}</b><small>${esc(d.text)}</small><em>${b.winners.length ? b.winners.map((w) => esc(this.name(w))).join(' & ') : 'Niemand'}</em>`;
      sfx.whoosh();
      await anim(c, [{ transform: 'rotateY(0deg) scale(1)' }, { transform: 'rotateY(90deg) scale(1.1)' }], 260, { easing: 'ease-in' });
      c.classList.add('open');
      await anim(c, [{ transform: 'rotateY(-90deg) scale(1.1)' }, { transform: 'rotateY(0deg) scale(1)' }], 300, { easing: 'ease-out' });
      for (const w of b.winners) {
        const f = this.figs.querySelector(`[data-fig="${w}"]`);
        if (!f) continue;
        sfx.star();
        await fly(this.fx, starSVG(), c, f, { size: 60, arc: 100, ms: 620 });
        stars[w]++;
        const em = f.querySelector('.bo-st em');
        if (em) em.textContent = String(stars[w]);
        f.classList.add('win');
        void anim(f, [{ transform: 'none' }, { transform: 'translateY(-22px) scale(1.06)' }, { transform: 'none' }], 460);
      }
      await pause(900);
    }
    await pause(900);
  }
}

// =====================================================================
/** Any other question: big cards with a title. */
export class ChoiceScene extends Scene {
  constructor(hst: Host, p: number, title: string) { super(hst, p, 'choice', hst.name(p), title); }
  build() {
    const f = h('div', 'ch-fig', this.fig(this.actor));
    f.dataset.fig = String(this.actor);
    this.art.classList.add('ch');
    this.art.appendChild(f);
  }
  opts(a: Ask): { label: string; sub: string; value: unknown; html?: string }[] {
    switch (a.q) {
      case 'yesno': return [{ label: a.yes, sub: '', value: true }, { label: a.no, sub: '', value: false }];
      case 'target': return a.options.map((o) => ({ label: o < 0 ? 'Niemand' : this.name(o), sub: o < 0 ? '' : `${this.h.st.players[o].stars} Sterne · ${this.h.st.players[o].coins} Münzen`, value: o }));
      case 'joker': return [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), sub: '', value: n }));
      case 'finale': return a.options.map((r) => ({ label: FINALE_RULES[r].name, sub: FINALE_RULES[r].text, value: r }));
      case 'bandeOffer': return [{ label: 'Einschlagen', sub: 'Ihr teilt 2 Runden lang die Minispiel-Münzen.', value: true }, { label: 'Lieber nicht', sub: '', value: false }];
      case 'buyStar': return [{ label: `Kaufen (${a.price})`, sub: '', value: true }, { label: 'Nicht jetzt', sub: '', value: false }];
      default: return [];
    }
  }
  text(a: Ask) {
    if (a.q === 'yesno' || a.q === 'target') return a.text;
    if (a.q === 'bandeOffer') return `${this.name(a.from)} bietet dir eine Bande an.`;
    return '';
  }
  build2(a: Ask) {
    const o = this.opts(a);
    this.cards.innerHTML = '';
    this.cards.className = `scn-cards sc-row${o.length === 2 ? ' two' : ''}`;
    return o.map((x) => {
      const c = typeof x.value === 'number' && a.q === 'target' && x.value >= 0 ? this.playerCard(x.value) : this.card(`<b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}`);
      this.cards.appendChild(c);
      return { el: c, value: x.value, ok: true } as Pick<unknown>;
    });
  }
  accepts() { return false; }
  async ask(a: Ask): Promise<Answer> {
    const t = this.text(a);
    if (t) void this.say(t, 700);
    const v = await pick(this.build2(a));
    switch (a.q) {
      case 'yesno': case 'bandeOffer': case 'buyStar': return { yes: !!v };
      case 'target': return { p: v as number };
      case 'joker': return { n: v as number };
      case 'finale': return { rule: v as FinaleRule };
      default: return { yes: !!v };
    }
  }
  watch(a: Ask) {
    const t = this.text(a);
    if (t) void this.say(t, 700);
    this.showWho(`${this.name(this.actor)} wählt …`);
    this.gh = ghost(this.build2(a).map((x) => x.el));
  }
  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'toast') { this.gh?.stop(); this.who.hidden = true; this.cards.innerHTML = ''; }
    return super.on(ev);
  }
}
