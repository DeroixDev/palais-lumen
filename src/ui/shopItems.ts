// "Glücksgriffe": the shop tab for the modifier items. Each item lies in its own lit display
// compartment, the velvet coloured by its tier (klein, mittel, groß, legendär); the brass
// price plate buys one more for the bag. Items stay in the bag across days and seasons.

import { Container, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_DISPLAY, glowTexture, type Particles } from '../core/fx';
import { tween, ease } from '../core/tween';
import { button, type Button } from '../core/ui';
import { sfx } from '../core/audio';
import { allItems, bagCount, type ItemDef } from '../core/modifiers';
import { TIER_LABEL, buyBagItem } from '../core/itemsCore';
import type { GameState } from '../core/state';
import { drawStone } from './stone';
import { CREAM, MUTED, caseTexture } from './kit';
import { itemTexture, tintOf } from './itemArt';

export const ITEMS_TAB = 5;

const TIER_VELVET: Record<ItemDef['tier'], number> = { klein: 0x5a3a1e, mittel: 0x5a1630, gross: 0x1f3a6a, legendaer: 0x4a2a6a };
const TIER_INK: Record<ItemDef['tier'], number> = { klein: 0xe8d8c0, mittel: 0xffcf7a, gross: 0x9fc8ff, legendaer: 0xd8b8ff };
const TIER_ORDER: Record<ItemDef['tier'], number> = { klein: 0, mittel: 1, gross: 2, legendaer: 3 };

export interface ShelfHost {
  panel: Container;
  narrow: boolean;
  state: GameState;
  fresh: boolean;
  setSize(w: number, h: number): void;
  frame(): void;
  stones(x: number, y: number, size: number): void;
  tabs(y: number): Button[];
  text(t: string, size: number, color: number, bold?: boolean, wrap?: number): Text;
  popIn(cards: Container[]): void;
  tickers: ((t: number, dt: number) => void)[];
  toast(t: string): void;
  particles: Particles;
  rebuild(): void;
  close(): void;
}

export class ItemShelf {
  private page = 0;

  build(h: ShelfHost) {
    const n = h.narrow;
    const items = allItems().sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.price - b.price);
    const cols = n ? 1 : 2;
    const per = n ? 4 : 6;
    const pages = Math.max(1, Math.ceil(items.length / per));
    this.page = Math.min(this.page, pages - 1);
    const gap = n ? 10 : 16;
    const cw = n ? 376 : 470;
    const ch = n ? 128 : 140;
    const side = n ? 14 : 34;
    const W = n ? 404 : cols * cw + (cols - 1) * gap + side * 2 + 20;
    const tabsY = n ? 112 : 124;
    const tabRows = n ? 2 : 1;
    const top = tabsY + tabRows * 56 + (n ? 6 : 16);
    const rows = Math.ceil(per / cols);
    const pager = 58;
    const footer = 112;
    const H = top + rows * (ch + gap) + pager + footer;
    h.setSize(W, H);
    h.frame();
    h.stones(W / 2, n ? 64 : 70, n ? 20 : 22);
    h.tabs(tabsY);
    const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2;
    const cards: Container[] = [];
    items.slice(this.page * per, this.page * per + per).forEach((it, i) => {
      const card = this.row(h, it, cw, ch);
      card.position.set(x0 + (i % cols) * (cw + gap) + cw / 2, top + Math.floor(i / cols) * (ch + gap) + ch / 2);
      card.pivot.set(cw / 2, ch / 2);
      h.panel.addChild(card);
      cards.push(card);
    });
    if (h.fresh) h.popIn(cards);

    // Pages.
    const py = top + rows * (ch + gap) + pager / 2 - 6;
    if (pages > 1) {
      const turn = (d: number) => {
        this.page = (this.page + d + pages) % pages;
        sfx.rustle();
        h.rebuild();
      };
      const prev = button({ label: '‹', width: 56, height: 44, color: 0x3a1428, fontSize: 26, ariaLabel: 'Vorige Seite', onClick: () => turn(-1) });
      const next = button({ label: '›', width: 56, height: 44, color: 0x3a1428, fontSize: 26, ariaLabel: 'Nächste Seite', onClick: () => turn(1) });
      const t = h.text(`Seite ${this.page + 1} von ${pages}`, n ? 17 : 18, MUTED, true);
      t.anchor.set(0.5);
      t.position.set(W / 2, py);
      prev.position.set(W / 2 - (n ? 110 : 130), py);
      next.position.set(W / 2 + (n ? 110 : 130), py);
      h.panel.addChild(prev, next, t);
    }

    const note = h.text(
      n
        ? 'Items bleiben im Beutel, auch über Saisons. Benutzen: Beutel oben in der Leiste.'
        : 'Items bleiben im Beutel, über Tage und Saisons. Benutzen kannst du sie jederzeit im Beutel oben in der Leiste, auch am Spieltisch.',
      n ? 15 : 16,
      MUTED,
      false,
      W - 60,
    );
    note.anchor.set(0.5, 0);
    note.position.set(W / 2, H - footer + 4);
    h.panel.addChild(note);
    const close = button({ label: 'FERTIG', width: n ? 200 : 220, height: 52, color: 0x3a1428, textColor: CREAM, fontSize: 20, onClick: h.close });
    close.position.set(W / 2, H - 46);
    h.panel.addChild(close);
  }

  /** One item: medallion in its tier case, name with the tier tag, exact effect, buy plate. */
  private row(h: ShelfHost, it: ItemDef, w: number, ht: number) {
    const c = new Container();
    const n = h.narrow;
    const have = bagCount(h.state.data, it.id);
    const cw = n ? 96 : 112;
    const legend = it.tier === 'legendaer';
    const box = new Sprite(caseTexture(cw, ht, TIER_VELVET[it.tier], legend || have > 0));
    box.position.set(-6, -4);
    c.addChild(box);
    const m = new Container();
    if (legend || it.tier === 'gross') {
      const halo = new Sprite(glowTexture());
      halo.anchor.set(0.5);
      halo.width = halo.height = 150;
      halo.tint = tintOf(it.id);
      halo.alpha = legend ? 0.55 : 0.3;
      halo.blendMode = 'add';
      m.addChild(halo);
      h.tickers.push((t) => (halo.alpha = (legend ? 0.45 : 0.25) + Math.sin(t * 2 + it.price) * 0.12));
    }
    const ms = new Sprite(itemTexture(it.id));
    ms.anchor.set(0.5);
    ms.scale.set((n ? 76 : 88) / 112);
    m.addChild(ms);
    m.position.set(cw / 2, ht * 0.48);
    c.addChild(m);
    h.tickers.push((t) => (ms.rotation = Math.sin(t * 1.3 + it.price) * 0.06));
    if (have > 0) {
      const badge = new Text({ text: `×${have}`, style: { fontFamily: FONT_DISPLAY, fontSize: 18, fill: 0xfff1c4, stroke: { color: 0x14080f, width: 5, join: 'round' } } });
      badge.anchor.set(1, 1);
      badge.position.set(cw - 8, ht - 8);
      c.addChild(badge);
    }
    // Text block.
    const tx = cw + 14;
    const btnW = n ? 98 : 140;
    const tw = w - tx - btnW - 10;
    const name = h.text(it.name, n ? 18 : 20, CREAM, true);
    name.position.set(tx, n ? 6 : 10);
    if (name.width > tw - 70) name.scale.set(Math.max(0.75, (tw - 70) / name.width));
    c.addChild(name);
    const tag = new Text({ text: TIER_LABEL[it.tier].toUpperCase() + (it.odds ? ' · CHANCE' : ''), style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: TIER_INK[it.tier], letterSpacing: 1.5 } });
    tag.position.set(tx + name.width + 8, name.y + (n ? 6 : 7));
    if (tag.x + tag.width > tx + tw) tag.position.set(tx, name.y + name.height);
    c.addChild(tag);
    const descY = Math.max(name.y + name.height + 2, tag.y + tag.height + 2);
    const d = h.text(it.desc.replace(/ %/g, ' %'), n ? 14.5 : 15.5, 0xd9c6a0, false, tw);
    d.style.align = 'left';
    d.position.set(tx, descY);
    const room = ht - d.y - 4;
    if (d.height > room) d.scale.set(room / d.height);
    c.addChild(d);
    const slot = this.buyButton(h, it, c, btnW);
    slot.position.set(w - btnW / 2, ht / 2);
    c.addChild(slot);
    return c;
  }

  private buyButton(h: ShelfHost, it: ItemDef, card: Container, w: number) {
    const afford = h.state.data.moonstones >= it.price;
    const b = button({
      label: w < 120 ? `${it.price}` : `${it.price} KAUFEN`,
      width: w,
      height: 48,
      color: COLORS.brass,
      fontSize: h.narrow ? 20 : 19,
      onClick: () => this.buy(h, it, card),
      icon: drawStone(11, false),
      iconWidth: 25,
      ariaLabel: `${it.name} für ${it.price} Mondsteine kaufen`,
    });
    if (!afford) {
      const need = it.price - h.state.data.moonstones;
      b.setLocked(`Dir fehlen noch ${need} ${need === 1 ? 'Mondstein' : 'Mondsteine'}.`);
      b.onLocked = (r) => h.toast(r);
    }
    return b;
  }

  private buy(h: ShelfHost, it: ItemDef, card: Container) {
    if (!buyBagItem(h.state, it.id)) {
      sfx.lose();
      const need = it.price - h.state.data.moonstones;
      h.toast(`Dir fehlen noch ${need} ${need === 1 ? 'Mondstein' : 'Mondsteine'}.`);
      return;
    }
    sfx.till();
    sfx.shimmer();
    const gp = card.toGlobal({ x: card.pivot.x * 0.3, y: card.pivot.y });
    h.particles.sparkle(gp.x, gp.y, 30, tintOf(it.id), 200);
    h.toast(`${it.name} liegt jetzt in deinem Beutel (${bagCount(h.state.data, it.id)}).`);
    void tween(card.scale, { x: 1.04, y: 1.04 }, 140, ease.outCubic).then(() => h.rebuild());
  }
}
