// The souvenir shop in the foyer: a glass display case. Every article sits on velvet in its
// own lit compartment, with a brass price plate that is also the buy button. Everything
// costs Mondsteine, which are only earned by playing; charms never touch the odds.

import { Container, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_DISPLAY, mothTexture, glowTexture } from '../core/fx';
import { tween, ease } from '../core/tween';
import { button } from '../core/ui';
import { sfx } from '../core/audio';
import { CHARMS, COMPANION_COLOR, WARDROBE, type Charm, type WardrobeOption } from '../core/items';
import { formatChips, type GameState } from '../core/state';
import type { Particles } from '../core/fx';
import { Chibi } from '../world/painted/chibi';
import { fillInk, paint } from '../world/painted/brush';
import { brass } from '../core/ui';
import { Panel } from './panel';
import { drawStone } from './stone';
import { CREAM, MUTED, caseTexture, plateTexture } from './kit';
import { ITEMS_TAB, ItemShelf } from './shopItems';

const TABS: { label: string; items: () => (WardrobeOption | Charm)[] }[] = [
  { label: 'Farben', items: () => WARDROBE.filter((o) => o.slot === 'jacket' && o.price > 0) },
  { label: 'Haare', items: () => WARDROBE.filter((o) => (o.slot === 'hair' || o.slot === 'hairStyle') && o.price > 0) },
  { label: 'Hüte', items: () => WARDROBE.filter((o) => o.slot === 'hat' && o.price > 0) },
  { label: 'Begleiter', items: () => WARDROBE.filter((o) => o.slot === 'companion' && o.price > 0) },
  { label: 'Glücksbringer', items: () => CHARMS },
  { label: 'Glücksgriffe', items: () => [] },
];

const CHARM_SIGN: Record<Charm['id'], string> = { startgeld: '+150', zinsen: '%', rabatt: '−10%', zweiteChance: '♥', bossbann: '♛' };
const CHARM_VELVET: Record<Charm['id'], number> = { startgeld: 0x1f5a44, zinsen: 0x5a1630, rabatt: 0x2f3a7a, zweiteChance: 0x6b1a3e, bossbann: 0x4a2a6a };

const isCharm = (x: WardrobeOption | Charm): x is Charm => !('slot' in x);

/** A brass medallion for a charm, painted once per sign. */
const medalCache = new Map<string, ReturnType<typeof paint>>();
function charmMedal(id: Charm['id']) {
  let t = medalCache.get(id);
  if (!t) {
    t = paint(84, 84, (c) => {
      c.beginPath();
      c.arc(43, 45, 36, 0, Math.PI * 2);
      c.fillStyle = 'rgba(8,4,16,0.4)';
      c.fill();
      c.beginPath();
      c.arc(42, 42, 36, 0, Math.PI * 2);
      fillInk(c, brass(c, 6, 6, 70, 80), 2.4);
      c.beginPath();
      c.arc(42, 42, 28, 0, Math.PI * 2);
      const g = c.createRadialGradient(34, 32, 2, 42, 42, 30);
      g.addColorStop(0, '#ffe9a8');
      g.addColorStop(1, '#b07a2a');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(90,52,12,0.7)';
      c.lineWidth = 1.5;
      c.stroke();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        c.beginPath();
        c.arc(42 + Math.cos(a) * 32, 42 + Math.sin(a) * 32, 1.2, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,244,200,0.7)';
        c.fill();
      }
      // Hanging loop.
      c.beginPath();
      c.arc(42, 4, 5, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(22,10,20,0.85)';
      c.lineWidth = 4;
      c.stroke();
      c.strokeStyle = '#e6b85a';
      c.lineWidth = 2;
      c.stroke();
    }, 2);
    medalCache.set(id, t);
  }
  return t;
}

export class ShopPanel extends Panel {
  private tab = 0;
  private fresh = true;

  constructor(
    private state: GameState,
    private particles: Particles,
    private toast: (t: string) => void,
    private onClose: () => void,
  ) {
    super();
  }

  /** The Glücksgriffe tab: modifier items for the bag (src/ui/shopItems.ts). */
  private shelf = new ItemShelf();

  protected build() {
    if (this.tab === ITEMS_TAB) return this.buildItems();
    const n = this.narrow;
    const items = TABS[this.tab].items();
    const charms = this.tab === 4;
    const gap = n ? 10 : 16;
    const cols = charms ? (n ? 1 : 2) : 3;
    const cw = charms ? (n ? 376 : 470) : n ? 120 : 236;
    const ch = charms ? (n ? 118 : 132) : n ? 206 : 262;
    const side = n ? 14 : 34;
    this.W = n ? 404 : cols * cw + (cols - 1) * gap + side * 2 + 20;
    const tabRows = n ? 2 : 1;
    const tabsY = n ? 112 : 124;
    const top = tabsY + tabRows * 56 + (n ? 6 : 16);
    const rows = Math.ceil(items.length / cols) || 1;
    const minRows = charms ? (n ? 5 : 3) : 2;
    const footer = n ? 112 : 112;
    this.H = top + Math.max(rows, minRows) * (ch + gap) + footer;
    this.frame('ANDENKENLADEN', COLORS.cyan, this.onClose);
    this.stones(this.state.data.moonstones, this.W / 2, n ? 64 : 70, n ? 20 : 22);
    const tabBtns = this.tabs(TABS.map((t) => t.label), this.tab, tabsY, (i) => {
      this.tab = i;
      this.fresh = true;
      sfx.rustle();
      this.rebuild();
    }, n ? 3 : 6, n ? 120 : 128);

    const x0 = (this.W - (cols * cw + (cols - 1) * gap)) / 2;
    const cards: Container[] = [];
    items.forEach((it, i) => {
      const card = charms ? this.charmRow(it as Charm, cw, ch) : this.card(it as WardrobeOption, cw, ch);
      card.position.set(x0 + (i % cols) * (cw + gap) + cw / 2, top + Math.floor(i / cols) * (ch + gap) + ch / 2);
      card.pivot.set(cw / 2, ch / 2);
      this.panel.addChild(card);
      cards.push(card);
    });
    if (this.fresh) this.popIn(cards);
    this.fresh = false;
    void tabBtns;

    const note = this.text(
      charms
        ? n
          ? 'Gilt bis Saisonende. Ändert nie die Gewinnchancen.'
          : 'Glücksbringer gelten bis zum Ende der Saison. Sie ändern nie die Gewinnchancen der Spiele.'
        : n
          ? 'Anziehen kannst du es in der Umkleide.'
          : 'Gekaufte Sachen ziehst du in der Umkleide an. Mondsteine gibt es nur fürs Spielen, nie für Geld.',
      n ? 15 : 16,
      MUTED,
      false,
      this.W - 60,
    );
    note.anchor.set(0.5, 0);
    note.position.set(this.W / 2, this.H - footer + 4);
    this.panel.addChild(note);
    const close = button({ label: 'FERTIG', width: n ? 200 : 220, height: 52, color: 0x3a1428, textColor: CREAM, fontSize: 20, onClick: this.onClose });
    close.position.set(this.W / 2, this.H - 46);
    this.panel.addChild(close);
  }

  private buildItems() {
    this.shelf.build({
      panel: this.panel,
      narrow: this.narrow,
      state: this.state,
      fresh: this.fresh,
      setSize: (w, h) => {
        this.W = w;
        this.H = h;
      },
      frame: () => this.frame('ANDENKENLADEN', COLORS.cyan, this.onClose),
      stones: (x, y, size) => this.stones(this.state.data.moonstones, x, y, size),
      tabs: (y) =>
        this.tabs(TABS.map((t) => t.label), this.tab, y, (i) => {
          this.tab = i;
          this.fresh = true;
          sfx.rustle();
          this.rebuild();
        }, this.narrow ? 3 : 6, this.narrow ? 120 : 128),
      text: (t, size, color, bold, wrap) => this.text(t, size, color, bold, wrap),
      popIn: (cards) => this.popIn(cards),
      tickers: this.tickers,
      toast: this.toast,
      particles: this.particles,
      rebuild: () => this.rebuild(),
      close: this.onClose,
    });
    this.fresh = false;
  }

  /** The buy plate: price with a stone; locked (with the reason) when it can't be paid. */
  private buyButton(it: WardrobeOption | Charm, card: Container, w: number) {
    const afford = this.state.data.moonstones >= it.price;
    const n = this.narrow;
    const b = button({
      label: w < 150 ? `${it.price}` : `${it.price} KAUFEN`,
      width: w,
      height: 48,
      color: COLORS.brass,
      fontSize: n ? 20 : 19,
      onClick: () => this.buy(it, card),
      icon: drawStone(11, false),
      iconWidth: 25,
    });
    if (!afford) {
      const need = it.price - this.state.data.moonstones;
      b.setLocked(`Dir fehlen noch ${need} ${need === 1 ? 'Mondstein' : 'Mondsteine'}.`);
      b.onLocked = (r) => this.toast(r);
    }
    return b;
  }

  private ownedPlate(text: string, w: number) {
    const c = new Container();
    const s = new Sprite(plateTexture(w, 40, 'green'));
    s.anchor.set(0.5);
    s.y = 1;
    const t = this.text(text, 18, 0xe6ffe6, true);
    t.anchor.set(0.5);
    c.addChild(s, t);
    return c;
  }

  private card(it: WardrobeOption, w: number, h: number) {
    const c = new Container();
    const n = this.narrow;
    const owned = this.state.isOwned(it.id);
    const caseH = n ? 124 : 172;
    const velvet = it.slot === 'companion' ? 0x24204a : it.slot === 'hat' ? 0x1f4038 : 0x5a1630;
    const box = new Sprite(caseTexture(w, caseH, velvet, owned));
    box.position.set(-6, -4);
    c.addChild(box);
    // The article on the cushion.
    const floorY = caseH * 0.64;
    const pv = new Container();
    pv.position.set(w / 2, floorY);
    c.addChild(pv);
    if (it.slot === 'companion') {
      const col = COMPANION_COLOR[it.set.companion as keyof typeof COMPANION_COLOR];
      const halo = new Sprite(glowTexture());
      halo.anchor.set(0.5);
      halo.width = halo.height = n ? 90 : 130;
      halo.tint = col;
      halo.alpha = 0.55;
      halo.blendMode = 'add';
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.width = m.height = n ? 38 : 54;
      m.tint = col;
      pv.addChild(halo, m);
      const base = m.scale.x;
      const y0 = -(n ? 34 : 50);
      this.tickers.push((time) => {
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(time * 9 + w)));
        m.y = y0 + Math.sin(time * 2 + w) * 5;
        halo.y = m.y;
      });
    } else {
      const host = this.state.data.players.host;
      const p = new Chibi(host?.color ?? COLORS.lamp, { ...this.state.look, ...it.set, skin: host?.skin });
      const sc = (floorY - 14) / (it.slot === 'hat' ? 100 : 82);
      p.view.scale.set(sc);
      pv.addChild(p.view);
      const phase = w * 0.37 + c.x;
      this.tickers.push((time, dt) => {
        p.faceTowards(Math.PI / 2 + (Math.sin(time * 0.5 + phase) > 0.92 ? 1.6 : 0));
        p.update(dt, null);
      });
    }
    const name = this.text(it.name, n ? 16 : 20, CREAM, true);
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, caseH + (n ? 8 : 12));
    if (name.width > w - 6) name.scale.set((w - 6) / name.width);
    c.addChild(name);
    const py = h - 26;
    const bw = n ? w - 4 : w - 28;
    const slot = owned ? this.ownedPlate(n ? '✓ DEINS' : '✓ GEKAUFT', bw) : this.buyButton(it, c, bw);
    slot.position.set(w / 2, py);
    c.addChild(slot);
    return c;
  }

  /** Charms: a row with the medallion in its case, name, exact effect and the buy plate. */
  private charmRow(it: Charm, w: number, h: number) {
    const c = new Container();
    const n = this.narrow;
    const owned = this.state.hasCharm(it.id);
    const cw = n ? 96 : 116;
    const box = new Sprite(caseTexture(cw, h, CHARM_VELVET[it.id], owned));
    box.position.set(-6, -4);
    c.addChild(box);
    const m = new Container();
    const ms = new Sprite(charmMedal(it.id));
    ms.anchor.set(0.5);
    const sign = new Text({ text: CHARM_SIGN[it.id], style: { fontFamily: FONT_DISPLAY, fontSize: it.id === 'rabatt' || it.id === 'startgeld' ? 15 : 22, fill: 0x4a2a08, dropShadow: { color: 0xfff4d0, alpha: 0.6, blur: 0, distance: 1, angle: Math.PI / 2 } } });
    sign.anchor.set(0.5);
    sign.y = 1;
    m.addChild(ms, sign);
    m.scale.set(n ? 0.82 : 0.95);
    m.position.set(cw / 2, h * 0.5);
    c.addChild(m);
    this.tickers.push((time) => (m.rotation = Math.sin(time * 1.4 + w + h + it.price) * 0.1));
    // Text block.
    const tx = cw + 14;
    const btnW = n ? 98 : 150;
    const tw = w - tx - btnW - 10;
    const name = this.text(it.name, n ? 18 : 20, CREAM, true);
    name.position.set(tx, n ? 8 : 12);
    c.addChild(name);
    const d = this.text(it.desc.replace(/ %/g, '\u00a0%'), n ? 15 : 16, 0xd9c6a0, false, tw);
    d.style.align = 'left';
    d.position.set(tx, name.y + name.height + 2);
    if (d.height > h - d.y - 4) d.scale.set((h - d.y - 4) / d.height);
    c.addChild(d);
    // Hairline under the row.
    const slot = owned ? this.ownedPlate('✓ AKTIV', btnW) : this.buyButton(it, c, btnW);
    // Mondstufe 2 and up: no "Zweite Chance" this season.
    if (!owned && it.id === 'zweiteChance' && this.state.data.heat >= 2) {
      const b = slot as ReturnType<typeof this.buyButton>;
      b.setLocked('Auf Mondstufe 2 und höher gibt es keine Zweite Chance.');
      b.onLocked = (r) => this.toast(r);
    }
    slot.position.set(w - btnW / 2, h / 2);
    c.addChild(slot);
    return c;
  }

  private buy(it: WardrobeOption | Charm, card: Container) {
    const goalBefore = this.state.data.evening.quota;
    const ok = isCharm(it) ? this.state.buyCharm(it.id) : this.state.buyItem(it.id);
    if (!ok) {
      sfx.lose();
      const need = it.price - this.state.data.moonstones;
      this.toast(`Dir fehlen noch ${need} ${need === 1 ? 'Mondstein' : 'Mondsteine'}.`);
      void tween(card, { x: card.x + 8 }, 60).then(() => tween(card, { x: card.x - 8 }, 60));
      return;
    }
    sfx.till();
    sfx.shimmer();
    const gp = card.toGlobal({ x: card.pivot.x, y: card.pivot.y * 0.7 });
    this.particles.sparkle(gp.x, gp.y, 30, 0x9fe8ff, 200);
    this.toast(isCharm(it) ? `${it.name} ist aktiv, bis die Saison endet.` : `${it.name} gekauft. Zieh es in der Umkleide an.`);
    if (this.state.data.evening.quota < goalBefore) this.toast(`Tagesziel gesenkt: jetzt ${formatChips(this.state.goalBalance)} Falter.`);
    void tween(card.scale, { x: 1.05, y: 1.05 }, 140, ease.outCubic).then(() => this.rebuild());
  }
}
