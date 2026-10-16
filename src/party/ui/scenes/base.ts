// The base of every board scene: builds the frame (kicker + title, player chips, art stage,
// speech bubble, cards, footer, "wer wählt", Schneller), plays the entry and exit, and handles
// the events that every scene shows the same way (a toast becomes a speech line, coins pop over
// the figure). Subclasses add their art and their questions.

import type { Answer, Ask, GameEvent } from '../../engine/state';
import { sfx } from '../../sfx';
import { esc } from '../../util';
import { coinSVG } from '../avatars';
import { anim, chipHTML, fastBtn, figHTML, ghost, h, pause, pop, refreshChips, sceneRoot, type Host } from './core';

/** eat: shown here; pass: the board shows it, the scene stays; close: close, then the board;
 *  end: shown here and the scene closes right after. */
export type Verdict = 'eat' | 'pass' | 'close' | 'end';

export abstract class Scene {
  root = sceneRoot();
  box = h('div', 'scn-in');
  head = h('header', 'scn-head');
  chips = h('div', 'scn-chips');
  art = h('div', 'scn-art');
  bubble = h('div', 'scn-bub');
  cards = h('div', 'scn-cards');
  foot = h('div', 'scn-foot');
  who = h('div', 'scn-who');
  fx = h('div', 'scn-fx');
  mine: boolean;
  /** After its story is told, the next event closes the scene. */
  done = false;
  closed = false;
  protected gh: ReturnType<typeof ghost> | null = null;
  /** Lines shown so far (tests read them from the DOM). */
  private chipSet = new Set<number>();

  constructor(public h: Host, public actor: number, public theme: string, public kicker: string, public title: string) {
    this.mine = actor === h.me;
  }

  /** Fill art, cards … (called before the entry). */
  abstract build(): void;

  name(p: number) { return this.h.name(p); }
  seat(p: number) { return this.h.seats[p]; }
  fig(p: number, cls = '') { return figHTML(this.h.seats[p], cls); }

  addChip(p: number) {
    if (p < 0 || this.chipSet.has(p) || !this.h.seats[p]) return;
    this.chipSet.add(p);
    this.chips.insertAdjacentHTML('beforeend', chipHTML(this.h, p));
  }
  refresh() { refreshChips(this.chips, this.h); }

  setTitle(kicker: string, title: string) {
    this.kicker = kicker;
    this.title = title;
    this.head.innerHTML = `<span class="scn-k">${esc(kicker)}</span><h2 class="scn-t"><span>${esc(title)}</span></h2>`;
  }

  async enter() {
    const r = this.root;
    r.innerHTML = '';
    r.className = `scn th-${this.theme}${this.mine ? ' mine' : ' spect'}`;
    r.style.setProperty('--pc', this.h.seats[this.actor]?.color ?? '#ff3d9a');
    this.setTitle(this.kicker, this.title);
    this.addChip(this.actor);
    this.bubble.hidden = true;
    this.who.hidden = true;
    this.box.append(this.head, this.chips, this.art, this.cards, this.foot, this.who, this.fx);
    this.art.appendChild(this.bubble);
    if (!this.mine) this.box.appendChild(fastBtn());
    this.build();
    r.appendChild(this.box);
    r.hidden = false;
    document.body.classList.add('in-scn');
    await Promise.all([
      anim(r, [{ opacity: 0 }, { opacity: 1 }], 220, { easing: 'ease-out' }),
      anim(this.head, [{ transform: 'translateY(-40px) rotate(-3deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 420, { easing: 'cubic-bezier(.3,1.45,.45,1)' }),
      anim(this.art, [{ transform: 'scale(.82) translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 460, { easing: 'cubic-bezier(.3,1.35,.45,1)', delay: 60 }),
    ]);
  }

  async leave(quick = false) {
    if (this.closed) return;
    this.closed = true;
    this.gh?.stop();
    this.onLeave();
    const r = this.root;
    if (!quick) await anim(r, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.04)' }], 240, { easing: 'ease-in' });
    r.getAnimations().forEach((a) => a.cancel());
    r.hidden = true;
    r.innerHTML = '';
    document.body.classList.remove('in-scn');
  }
  /** Stop timers (subclasses). */
  onLeave() { /* nothing */ }

  /** A speech line (the host character's bubble, or the caption). */
  async say(text: string, ms?: number, col?: string) {
    const b = this.bubble;
    b.hidden = false;
    b.textContent = text;
    b.style.setProperty('--bc', col ?? 'var(--paper)');
    this.art.querySelectorAll('.talk-on').forEach((e) => e.classList.add('talking'));
    void anim(b, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], 280, { easing: 'ease-out' });
    await pause(ms ?? Math.min(2600, 750 + text.length * 22));
    this.art.querySelectorAll('.talk-on').forEach((e) => e.classList.remove('talking'));
  }

  /** "Name wählt …" while watching. */
  showWho(text: string) {
    this.who.hidden = false;
    this.who.textContent = text;
  }

  /** Coins for p: a pop over its figure (or chip), the chip counts. */
  async coins(p: number, d: number, text?: string) {
    if (!d) return;
    this.addChip(p);
    const tgt = this.art.querySelector(`[data-fig="${p}"]`) ?? this.chips.querySelector(`[data-chip="${p}"]`);
    if (tgt) pop(this.fx, tgt, `${d > 0 ? '+' : '−'}${Math.abs(d)}${text ? ` · ${text}` : ''}`, d > 0 ? 'var(--yellow)' : '#ff8fb0');
    if (d > 0) sfx.coin(); else sfx.lose();
    this.refresh();
    await pause(520);
  }

  /** Every scene: toasts are spoken, coins pop, the rest ends the scene. */
  async on(ev: GameEvent): Promise<Verdict> {
    if (this.done && ev.k !== 'coins' && ev.k !== 'trap') return 'close';
    switch (ev.k) {
      case 'toast': await this.say(ev.text, undefined, ev.color); return 'eat';
      case 'coins': await this.coins(ev.p, ev.d, ev.text); return 'eat';
      case 'trap': return 'eat';
      default: return 'close';
    }
  }

  accepts(_a: Ask, _p: number) { return false; }
  ask(_a: Ask, _p: number): Promise<Answer> { return Promise.resolve({ yes: false }); }
  watch(_a: Ask, _p: number) { /* subclasses */ }

  /** Shared card markup. */
  card(html: string, cls = '') {
    const b = h('button', `scard ${cls}`, html) as HTMLButtonElement;
    b.type = 'button';
    return b;
  }
  playerCard(p: number, sub = '') {
    const P = this.h.st.players[p];
    const b = this.card(`<span class="sc-fig">${figHTML(this.h.seats[p])}</span><b>${esc(this.name(p))}</b><small><i class="s-star">★</i>${P.stars} · ${coinSVG.replace('<svg', '<svg class="ci"')}${P.coins}${sub ? ` · ${esc(sub)}` : ''}</small>`, 'pc');
    b.style.setProperty('--pc', this.h.seats[p].color);
    b.dataset.p = String(p);
    return b;
  }
}
