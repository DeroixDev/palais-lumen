// Base for the foyer menus (shop, wardrobe, piano): a brass-framed panel that lays itself
// out again when the screen switches between wide and narrow (phones).

import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText } from '../core/fx';
import { tween } from '../core/tween';
import { sfx } from '../core/audio';
import { drawStone } from './stone';

export abstract class Panel {
  readonly view = new Container();
  protected bg = new Graphics();
  protected panel = new Container();
  protected narrow = false;
  protected W = 960;
  protected H = 680;
  protected time = 0;
  /** Things in the panel that animate (rebuilt with it). */
  protected tickers: ((t: number, dt: number) => void)[] = [];
  private built = false;
  private sw = 800;
  private sh = 600;
  protected bgAlpha = 0.88;

  constructor() {
    this.view.addChild(this.bg, this.panel);
    this.view.eventMode = 'static';
  }

  /** Fills `this.panel` for the current `narrow` and sets W and H. */
  protected abstract build(): void;

  rebuild() {
    this.tickers = [];
    this.panel.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.build();
    this.fit();
  }

  resize(w: number, h: number) {
    this.sw = w;
    this.sh = h;
    const n = w < 720;
    if (!this.built || n !== this.narrow) {
      this.narrow = n;
      this.built = true;
      this.rebuild();
      this.panel.alpha = 0;
      void tween(this.panel, { alpha: 1 }, 220);
    } else this.fit();
  }

  private fit() {
    const { sw: w, sh: h } = this;
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: this.bgAlpha });
    const s = Math.min((w * 0.97) / this.W, (h * 0.95) / this.H, 1.1);
    this.panel.scale.set(s);
    this.panel.position.set((w - this.W * s) / 2, (h - this.H * s) / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    for (const t of this.tickers) t(this.time, dtMs);
  }

  destroy() {
    this.view.destroy({ children: true });
  }

  // ---- Shared pieces --------------------------------------------------------

  /** Panel background with a brass frame, title and a close cross. */
  protected frame(title: string, glow: number, onClose: () => void) {
    const p = this.panel;
    const g = new Graphics();
    g.roundRect(6, 10, this.W, this.H, 30).fill({ color: 0x000000, alpha: 0.5 });
    g.roundRect(0, 0, this.W, this.H, 30).fill(0x170b14).stroke({ color: COLORS.brass, width: 4 });
    g.roundRect(12, 12, this.W - 24, this.H - 24, 22).stroke({ color: COLORS.brassDark, width: 1.5 });
    for (const [x, y] of [[30, 30], [this.W - 30, 30], [30, this.H - 30], [this.W - 30, this.H - 30]]) g.circle(x, y, 5).fill(COLORS.brass);
    p.addChild(g);
    const t = glowText(title, { fontFamily: FONT_DISPLAY, fontSize: this.narrow ? 30 : 36, fill: 0xfff6e6, letterSpacing: 3 }, { color: glow, distance: 14, outerStrength: 2 });
    t.position.set(this.W / 2, 50);
    p.addChild(t);
    const x = new Container();
    const xg = new Graphics().circle(0, 0, 22).fill(0x2a1608).stroke({ color: COLORS.brass, width: 2.5 });
    xg.moveTo(-8, -8).lineTo(8, 8).moveTo(8, -8).lineTo(-8, 8).stroke({ color: 0xfff1c4, width: 3, cap: 'round' });
    x.addChild(xg);
    x.position.set(this.W - 44, 44);
    x.eventMode = 'static';
    x.cursor = 'pointer';
    x.on('pointertap', () => {
      sfx.click();
      onClose();
    });
    p.addChild(x);
  }

  /** "◆ 12 Mondsteine" */
  protected stones(n: number, x: number, y: number, size = 22) {
    const c = new Container();
    const s = drawStone(size * 0.6);
    c.addChild(s);
    const t = this.text(`${n} Mondsteine`, size, 0xdff6ff, true);
    t.anchor.set(0, 0.5);
    t.position.set(size * 0.9, 0);
    c.addChild(t);
    c.position.set(x, y);
    this.panel.addChild(c);
    return c;
  }

  protected text(t: string, size: number, color: number, bold = false, wrap = 0) {
    const x = new Text({
      text: t,
      style: { fontFamily: FONT_BODY, fontSize: size, fontWeight: bold ? '700' : '600', fill: color, wordWrap: wrap > 0, wordWrapWidth: wrap, align: wrap ? 'center' : 'left', lineHeight: Math.round(size * 1.2) },
    });
    return x;
  }

  /** Row(s) of pill tabs. */
  protected tabs(labels: string[], active: number, y: number, onPick: (i: number) => void, perRow = labels.length, w = 160) {
    labels.forEach((l, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, labels.length - row * perRow);
      const col = i % perRow;
      const x = this.W / 2 + (col - (inRow - 1) / 2) * (w + 10);
      const c = new Container();
      const on = i === active;
      const g = new Graphics().roundRect(-w / 2, -21, w, 42, 21).fill(on ? COLORS.brass : 0x2a1608).stroke({ color: on ? 0xfff1c4 : COLORS.brassDark, width: 2 });
      const t = this.text(l, 18, on ? 0x1b1013 : 0xfff1c4, true);
      t.anchor.set(0.5);
      c.addChild(g, t);
      c.position.set(x, y + row * 52);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (on) return;
        sfx.click();
        onPick(i);
      });
      this.panel.addChild(c);
    });
  }
}
