// Base for the foyer menus (shop, wardrobe, piano): a velvet panel in a brass frame with
// moth corner ornaments. It lays itself out again when the screen switches between wide
// and narrow (phones), flies in (280 ms, slight overshoot) and out (180 ms).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS } from '../core/fx';
import { animate } from '../core/tween';
import { button, type Button } from '../core/ui';
import { paint, rrect, fillInk } from '../world/painted/brush';
import { drawStone } from './stone';
import { CREAM, PANEL_PAD, bodyText, closeKnob, enterMotion, leaveMotion, panelTexture, plaque, staggerIn } from './kit';

/** Narrow layouts are drawn for this width, so phones show them at ~95 % size. */
export const NARROW_W = 404;

export abstract class Panel {
  readonly view = new Container();
  protected bg = new Graphics();
  /** Scaled and animated as a whole around the screen centre. */
  private stage = new Container();
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
  /** How dark the world behind gets (the guide: 60 %). */
  protected bgAlpha = 0.6;
  private closing = false;

  constructor() {
    this.stage.addChild(this.panel);
    this.view.addChild(this.bg, this.stage);
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
      const first = !this.built;
      this.narrow = n;
      this.built = true;
      this.rebuild();
      if (first) void enterMotion(this.stage);
    } else this.fit();
  }

  private fit() {
    const { sw: w, sh: h } = this;
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: this.bgAlpha });
    // The title plaque sticks out above the frame.
    const top = 26;
    const s = Math.min((w * 0.97) / this.W, (h * 0.97 - top) / this.H, 1.1);
    this.stage.scale.set(s);
    this.stage.position.set(w / 2, h / 2 + (top * s) / 2);
    this.panel.position.set(-this.W / 2, -this.H / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    for (const t of this.tickers) t(this.time, dtMs);
  }

  /** Flies out (180 ms), then frees everything. Safe to call more than once. */
  destroy() {
    if (this.closing) return;
    this.closing = true;
    this.view.eventMode = 'none';
    this.view.interactiveChildren = false;
    const b = this.bg;
    void animate(180, (k) => !b.destroyed && (b.alpha = 1 - k));
    void leaveMotion(this.stage).then(() => !this.view.destroyed && this.view.destroy({ children: true }));
  }

  // ---- Shared pieces --------------------------------------------------------

  /** Velvet panel with the brass frame, a title plaque on the top edge and the close knob. */
  protected frame(title: string, accent: number, onClose: () => void) {
    const p = this.panel;
    const bg = new Sprite(panelTexture(this.W, this.H, { accent: accentVelvet(accent) }));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    p.addChild(bg);
    const pl = plaque(title, { size: this.narrow ? 24 : 28, minW: this.narrow ? 220 : 300 });
    pl.position.set(this.W / 2, 4);
    p.addChild(pl);
    const x = closeKnob(onClose);
    x.position.set(this.W - 40, 40);
    p.addChild(x);
  }

  /** Moonstone purse: a recessed velvet counter with the stone and the number. */
  protected stones(n: number, x: number, y: number, size = 22) {
    const c = new Container();
    const t = bodyText(`${n}`, size + 4, 0xdff6ff, { bold: true });
    const u = bodyText(n === 1 ? 'Mondstein' : 'Mondsteine', size - 4, 0xb9d6e6);
    const w = Math.round(size * 2.2 + t.width + u.width + 18);
    const h = Math.round(size * 1.9);
    const plate = new Sprite(
      paint(w + 6, h + 6, (cx) => {
        cx.translate(3, 3);
        rrect(cx, 0, 0, w, h, h / 2);
        const g = cx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#0c0610');
        g.addColorStop(1, '#2a1424');
        fillInk(cx, g, 1.5);
        rrect(cx, 0, 0, w, h, h / 2);
        cx.strokeStyle = 'rgba(224,178,90,0.75)';
        cx.lineWidth = 1.5;
        cx.stroke();
        cx.save();
        rrect(cx, 0, 0, w, h, h / 2);
        cx.clip();
        cx.strokeStyle = 'rgba(0,0,0,0.6)';
        cx.lineWidth = 6;
        rrect(cx, 0, 2.5, w, h, h / 2);
        cx.stroke();
        cx.restore();
      }, 2),
    );
    plate.position.set(-3, -h / 2 - 3);
    c.addChild(plate);
    const s = drawStone(size * 0.62);
    s.position.set(h / 2 + 2, 0);
    c.addChild(s);
    t.anchor.set(0, 0.5);
    t.position.set(h / 2 + size * 0.85, 0);
    u.anchor.set(0, 0.5);
    u.position.set(t.x + t.width + 6, 2);
    c.addChild(t, u);
    c.position.set(x - w / 2, y);
    this.panel.addChild(c);
    return c;
  }

  protected text(t: string, size: number, color: number, bold = false, wrap = 0) {
    const x: Text = bodyText(t, size, color === 0xfff6e6 ? CREAM : color, { bold, wrap: wrap || undefined });
    return x;
  }

  /** Row(s) of tabs: velvet buttons, the chosen one in brass. Returns the buttons. */
  protected tabs(labels: string[], active: number, y: number, onPick: (i: number) => void, perRow = labels.length, w = 160, x0?: number, areaW?: number) {
    const out: Button[] = [];
    const cx = x0 !== undefined && areaW !== undefined ? x0 + areaW / 2 : this.W / 2;
    const h = 48;
    labels.forEach((l, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, labels.length - row * perRow);
      const col = i % perRow;
      const x = cx + (col - (inRow - 1) / 2) * (w + 8);
      const on = i === active;
      const b = button({
        label: l,
        width: w,
        height: h,
        color: on ? COLORS.brass : 0x3a1428,
        textColor: on ? 0x2a1406 : 0xf2e6c9,
        fontSize: 18,
        display: false,
        onClick: () => {
          if (!on) onPick(i);
        },
      });
      b.position.set(x, y + row * (h + 8));
      this.panel.addChild(b);
      out.push(b);
    });
    return out;
  }

  /** Lets freshly built items pop in one after another. */
  protected popIn(items: Container[]) {
    staggerIn(items);
  }
}

/** Corner inlay colour from a panel's accent (kept dark so it stays an ornament). */
function accentVelvet(c: number) {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const k = 0.42;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
}
