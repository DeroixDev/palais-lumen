// Krempels Kramladen: the full-screen shop. A layered 2.5D interior (striped wall, neon sign,
// shelves with jars), Krempel behind the counter with idle animation and speech bubble, the
// goods on pedestals with hanging price tags. Browsing shows name, text and price; buying flies
// the coins to the counter and hops the item into the bag. Watching somebody else shop, a
// highlight wanders over the goods and the real pick comes from the engine's 'shop' event.

import type { Answer, Ask, GameEvent, ShopOffer } from '../../engine/state';
import { ITEMS, MAX_ITEMS, type ItemId } from '../../engine/tables';
import { sfx } from '../../sfx';
import { esc, pickR } from '../../util';
import { coinSVG } from '../avatars';
import { itemSVG, keeperSVG } from './art';
import { Scene, type Verdict } from './base';
import { anim, fly, ghost, h, pick, type Host } from './core';

const GREET = ['Willkommen bei Krempel! Alles frisch abgestaubt.', 'Na, klimpert die Tasche? Dann rein mit dir!', 'Psst … heute glänzt alles doppelt!'];
const PASSING = ['Im Vorbeigehen? Ich halt dich nicht lang auf!', 'Schnell rein, schnell raus. Was darf’s sein?'];
const BUY = ['Ausgezeichnete Wahl!', 'Das hätte ich auch genommen!', 'Ein Schnäppchen, ehrlich!'];
const THANKS = ['Danke! Klimper, klimper!', 'Münzen klingen wie Musik!', 'Ab in die Kasse damit!'];
const BYE_BUY = ['Viel Spaß damit! Kein Umtausch!', 'Beehre mich bald wieder!', 'Und nicht verlieren, gell?'];
const BYE_NONE = ['Nur gucken, nichts kaufen? Ich hab’s gesehen!', 'Komm wieder, wenn die Taschen klimpern!', 'Tschüss! Und nichts anfassen auf dem Weg raus!'];

export class ShopScene extends Scene {
  offer: ShopOffer[];
  goods: HTMLButtonElement[] = [];
  info = h('div', 'shop-info');
  bag = h('div', 'shop-bag');
  leaveBtn = h('button', 'btn ghost shop-leave', 'Gehen') as HTMLButtonElement;
  buyBtn = h('button', 'btn go shop-buy', 'Kaufen') as HTMLButtonElement;
  keeper = h('div', 'keeper-wrap talk-on', keeperSVG());

  constructor(hst: Host, actor: number, a: Extract<Ask, { q: 'shop' }>) {
    super(hst, actor, 'shop', a.passing ? 'Laden · im Vorbeigehen' : 'Laden', 'Krempels Kramladen');
    this.offer = a.offer;
  }

  private base(i: ItemId) { return ITEMS[i].price + (this.h.st.finale ? 2 : 0); }
  /** Why each good can't be bought, fixed when the shop opens (the state moves on while buying). */
  reason: (string | null)[] = [];
  private why(o: ShopOffer): string | null {
    const k = this.offer.indexOf(o);
    if (this.reason[k] !== undefined) return this.reason[k];
    const P = this.h.st.players[this.actor];
    if (P.items.length >= MAX_ITEMS) return 'Tasche voll';
    if (P.coins < o.price) return `Fehlen ${o.price - P.coins}`;
    return null;
  }

  build() {
    this.reason = this.offer.map((o) => this.why(o));
    this.art.classList.add('shop');
    this.art.insertAdjacentHTML('afterbegin', `
      <div class="shop-wall"><div class="shop-sign"><span>Krempels</span><b>Kramladen</b></div>
        <div class="shelf sh1"><i class="jar j1"></i><i class="jar j2"></i><i class="box b1"></i><i class="jar j3"></i></div>
        <div class="shelf sh2"><i class="box b2"></i><i class="jar j4"></i><i class="jar j1"></i><i class="box b3"></i></div>
        <div class="lamp l1"></div><div class="lamp l2"></div></div>`);
    this.art.appendChild(this.keeper);
    const counter = h('div', 'shop-counter');
    const row = h('div', 'goods');
    this.offer.forEach((o, k) => {
      const why = this.why(o);
      const sale = o.price < this.base(o.item);
      const g = h('button', `good${why ? ' no' : ''}`, `<span class="g-ped"></span><span class="g-art">${itemSVG(o.item)}</span>
        <span class="g-tag${why ? ' red' : ''}">${sale ? `<s>${this.base(o.item)}</s>` : ''}${coinSVG}<b>${o.price}</b></span>
        ${o.item === 'tuete' ? '<span class="g-rib">Nur im Finale</span>' : ''}<span class="g-key">${k + 1}</span>`) as HTMLButtonElement;
      g.type = 'button';
      g.dataset.item = o.item;
      g.setAttribute('aria-label', `${ITEMS[o.item].name}, ${o.price} Münzen`);
      g.style.setProperty('--d', `${k * 0.35}s`);
      row.appendChild(g);
      this.goods.push(g);
    });
    counter.appendChild(row);
    counter.insertAdjacentHTML('beforeend', '<div class="counter-top"></div><div class="counter-front"><i class="bell"></i><i class="till"></i></div>');
    this.art.appendChild(counter);
    // info + bag
    this.renderBag();
    this.buyBtn.type = this.leaveBtn.type = 'button';
    this.cards.classList.add('shop-panel');
    this.cards.append(this.info, this.bag);
    this.foot.append(this.leaveBtn, this.buyBtn);
    if (!this.mine) { this.leaveBtn.disabled = this.buyBtn.disabled = true; }
    this.showInfo(Math.max(0, this.offer.findIndex((o) => !this.why(o))));
  }

  renderBag() {
    const P = this.h.st.players[this.actor];
    this.bag.innerHTML = `<span class="bag-l">Tasche ${P.items.length}/${MAX_ITEMS}</span>` + Array.from({ length: MAX_ITEMS }, (_, k) => `<span class="slot${P.items[k] ? ' full' : ''}" data-slot="${k}">${P.items[k] ? itemSVG(P.items[k]) : ''}</span>`).join('');
  }

  showInfo(i: number) {
    const o = this.offer[i];
    if (!o) return;
    const why = this.why(o), it = ITEMS[o.item];
    const P = this.h.st.players[this.actor];
    const notes: string[] = [];
    if (o.item === 'tuete') notes.push(this.h.st.finale ? 'Finale läuft: jetzt wirksam!' : `Wirkt nur im Finale (ab Runde ${Math.max(1, this.h.st.rules.rounds - 2)}).`);
    if (o.price < this.base(o.item)) notes.push('Funz-Rabatt: halber Preis!');
    if (this.h.st.finale && o.price >= this.base(o.item)) notes.push('Finale: alles 2 Münzen teurer.');
    this.info.innerHTML = `<b class="si-n">${esc(it.name)}</b><p class="si-t">${esc(it.text)}</p>
      <div class="si-p"><span class="si-price${why ? ' red' : ''}">${coinSVG}<b>${o.price}</b> Münzen</span>${why ? `<span class="si-why">${why === 'Tasche voll' ? 'Tasche voll (3/3)' : `Zu wenig Münzen: du hast ${P.coins}`}</span>` : ''}</div>
      ${notes.map((n) => `<small class="si-note">${esc(n)}</small>`).join('')}`;
    this.buyBtn.textContent = why === 'Tasche voll' ? 'Tasche voll' : why ? 'Zu wenig Münzen' : `Kaufen · ${o.price}`;
    if (this.mine) this.buyBtn.disabled = !!why;
  }

  async enter() {
    await super.enter();
    sfx.buy();
    const P = this.h.st.players[this.actor];
    const line = P.items.length >= MAX_ITEMS ? 'Deine Tasche ist voll! Erst was benutzen, dann shoppen.'
      : !this.offer.some((o) => o.ok) ? 'Heute nur Schaufensterbummel? Na gut, gucken kostet nix.'
      : pickR(this.offer.length && this.title.includes('Vorbei') ? PASSING : GREET);
    void this.say(this.kicker.includes('Vorbei') ? pickR(PASSING) : line, 900);
  }

  accepts(a: Ask, p: number) { return a.q === 'shop' && p === this.actor; }

  ask(): Promise<Answer> {
    return new Promise<Answer>((res) => {
      let finish: ((v: ItemId | null) => void) | null = null, choose: ((i: number) => void) | null = null;
      this.leaveBtn.onclick = () => finish?.(null);
      this.buyBtn.onclick = () => choose?.(-1);
      const items = this.offer.map((o, k) => ({ el: this.goods[k], value: o.item as ItemId | null, ok: !this.why(o) }));
      let lastNo = -1;
      void pick<ItemId | null>(items, {
        back: null, tapFocus: true,
        start: Math.max(0, items.findIndex((x) => x.ok)),
        onFocus: (i) => {
          this.showInfo(i);
          const o = this.offer[i], why = this.why(o);
          if (why && lastNo !== i) { lastNo = i; void this.say(why === 'Tasche voll' ? 'Deine Tasche ist voll! Erst was benutzen.' : `Da fehlen dir noch ${o.price - this.h.st.players[this.actor].coins} Münzen. Ich schreib nicht an!`, 600); }
          else if (o.item === 'tuete' && !this.h.st.finale && lastNo !== i) { lastNo = i; void this.say('Die Goldene Tüte wirkt nur im Finale. Nur so als Tipp!', 600); }
        },
        bind: (f, c) => { finish = f; choose = c; },
      }).then((item) => {
        this.leaveBtn.disabled = this.buyBtn.disabled = true;
        res({ item });
      });
    });
  }

  watch() {
    this.showWho(`${this.name(this.actor)} stöbert …`);
    const ok = this.goods.filter((_, k) => !this.why(this.offer[k]));
    const list = ok.length ? ok : this.goods;
    this.gh = ghost(list, (i) => this.showInfo(this.goods.indexOf(list[i])));
  }

  async on(ev: GameEvent): Promise<Verdict> {
    if (ev.k === 'shop' && ev.p === this.actor) {
      const k = ev.item ? this.offer.findIndex((o) => o.item === ev.item) : -1;
      this.gh?.stop(k >= 0 ? (this.goods.filter((_, i) => !this.why(this.offer[i])).indexOf(this.goods[k])) : undefined);
      this.who.hidden = true;
      if (k >= 0) await this.buy(k, ev.price);
      else { await this.say(pickR(BYE_NONE), 1100); }
      return 'end';
    }
    return super.on(ev);
  }

  private async buy(k: number, price: number) {
    const g = this.goods[k];
    this.goods.forEach((x, i) => x.classList.toggle('hl', i === k));
    this.showInfo(k);
    void this.say(pickR(BUY), 700);
    await anim(g, [{ transform: 'none' }, { transform: 'translateY(-14px) scale(1.12)' }, { transform: 'none' }], 380);
    // coins: purse → counter
    const purse = this.chips.querySelector(`[data-chip="${this.actor}"] [data-coins]`) ?? this.chips;
    const till = this.art.querySelector('.till') ?? this.keeper;
    sfx.buy();
    await fly(this.fx, coinSVG, purse, till, { n: Math.min(8, Math.max(3, price)), size: 26, arc: 110, ms: 640, gap: 55 });
    sfx.coin();
    this.refresh();
    void anim(this.keeper, [{ transform: 'none' }, { transform: 'translateY(-16px) scale(1.05,.95)' }, { transform: 'none' }], 420);
    void this.say(pickR(THANKS), 700);
    // item: pedestal → bag
    const P = this.h.st.players[this.actor];
    const slot = this.bag.querySelector(`[data-slot="${Math.min(MAX_ITEMS - 1, Math.max(0, P.items.length - 1))}"]`) ?? this.bag;
    const art = g.querySelector('.g-art');
    if (art) (art as HTMLElement).style.opacity = '0';
    await fly(this.fx, itemSVG(this.offer[k].item), g, slot, { size: 64, arc: 150, ms: 760 });
    g.classList.add('sold');
    this.renderBag();
    void anim(this.bag.querySelector(`[data-slot="${Math.max(0, P.items.length - 1)}"]`), [{ transform: 'scale(1.5)' }, { transform: 'none' }], 420, { easing: 'cubic-bezier(.3,1.45,.45,1)' });
    sfx.pop();
    await this.say(pickR(BYE_BUY), 1000);
  }

  async leave(quick = false) {
    if (!quick && !this.closed) await anim(this.keeper, [{ transform: 'none' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'none' }], 360);
    await super.leave(quick);
  }
}
