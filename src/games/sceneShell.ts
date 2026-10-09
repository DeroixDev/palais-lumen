// Shared frame for the table games Teich-Derby, Eisstraße and Zielscheibe: a header with the
// title, the last results and a "So geht's" knob; a brass-framed scene window whose size
// follows the screen (each game paints its scene for that size); a velvet control bar.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, glowTexture } from '../core/fx';
import { button, type Button } from '../core/ui';
import { PANEL_PAD, bodyText, enterMotion, leaveMotion, panelTexture } from '../ui/kit';
import { barTexture, frameTexture } from './crash/paint';
import { tween, ease } from '../core/tween';

/** 'tall': phone portrait, controls below; 'wide': controls below; 'side': short landscape, controls on the right. */
export type Layout = 'tall' | 'wide' | 'side';

export interface ShellHooks {
  title: string;
  accent: number;
  rules: string;
  /** Height of the control bar (tall/wide) or its width (side), in design pixels. */
  ctrlSize(layout: Layout): number;
  /** Builds the controls into `c` (already cleared) for this size. `fs` lifts a font size to ≥ 13.5 css px. */
  buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number): void;
  /** The scene window got a new size (design pixels). */
  layoutScene(w: number, h: number, layout: Layout): void;
}

const HEADER = 50;
const BAND = 18;

/** "1,23×": two decimals below 100, whole numbers above. */
export function fmtX(m: number, digits = 2) {
  if (m >= 100) return `${Math.round(m).toLocaleString('de-DE')}×`;
  return `${m.toFixed(digits).replace('.', ',')}×`;
}

export function rtpText(rtp: number) {
  const p = (x: number) => (x * 100).toFixed(1).replace('.', ',');
  return `Auszahlungsquote ${p(rtp)} % · Hausvorteil ${p(1 - rtp)} %`;
}

export class SceneShell {
  readonly board = new Container();
  /** The game paints here; (0, 0) is the window's top left, size sw × sh. */
  readonly scene = new Container();
  /** Above the scene, same coordinates (stages, banners). */
  readonly over = new Container();
  readonly controls = new Container();
  sw = 600;
  sh = 400;
  tall = false;
  layout: Layout = 'wide';
  s = 1;
  private frame = new Sprite();
  private frameTex: Texture | null = null;
  private barTex: Texture | null = null;
  private bar = new Sprite();
  private mask = new Graphics();
  private header = new Container();
  private titleText: Text;
  private infoBtn: Button | null = null;
  private history: { text: string; color: number; ink: number }[] = [];
  private historyLayer = new Container();
  private rulesPanel: Container | null = null;
  private key = '';
  private contentW = 600;

  constructor(private hooks: ShellHooks) {
    this.titleText = new Text({
      text: hooks.title,
      style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xfff3dc, letterSpacing: 2, stroke: { color: 0x0a0610, width: 5 } },
    });
    this.titleText.anchor.set(0, 0.5);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.tint = hooks.accent;
    halo.alpha = 0.25;
    halo.blendMode = 'add';
    halo.label = 'halo';
    this.header.addChild(halo, this.titleText, this.historyLayer);
    this.scene.addChild(this.mask);
    this.scene.mask = this.mask;
    this.controls.addChild(this.bar);
    this.board.addChild(this.frame, this.scene, this.header, this.controls, this.over);
  }

  /** Font size in design pixels that stays at least 13.5 css px on screen. */
  fs = (px: number) => Math.round(Math.max(px, 13.5 / this.s));

  private ctrlBox: { w: number; h: number } | null = null;

  /** Builds the control bar again at its current size (e.g. its payout line changed with an item). */
  rebuildControls() {
    const inner = this.controls.children.find((c) => c !== this.bar);
    if (!inner || !this.ctrlBox) return;
    inner.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.hooks.buildControls(inner as Container, this.ctrlBox.w, this.ctrlBox.h, this.layout, this.fs);
  }

  resize(w: number, h: number) {
    const tall = w / h < 0.9;
    const layout: Layout = tall ? 'tall' : h < 520 && w / h > 1.5 ? 'side' : 'wide';
    let s: number;
    if (layout === 'tall') s = Math.min(1.15, w / 390);
    else if (layout === 'side') s = Math.min(1.2, Math.max(0.5, Math.min(w / 1100, h / 560)));
    else s = Math.min(1.2, Math.max(0.6, Math.min(w / 1000, h / 620)));
    const W = w / s;
    const H = h / s;
    this.s = s;
    this.tall = tall;
    this.layout = layout;
    const m = tall ? 8 : 18;
    const ctrl = this.hooks.ctrlSize(layout);
    let contentW: number;
    let sw: number;
    let sh: number;
    let x0: number;
    let cx: number;
    let cy: number;
    let cw: number;
    let ch: number;
    if (layout === 'side') {
      contentW = W - m * 2;
      x0 = m;
      sw = Math.round(contentW - ctrl - 14 - BAND * 2);
      sh = Math.round(Math.max(200, H - m - HEADER - BAND * 2 - 10 - m));
      cx = x0 + contentW - ctrl;
      cy = m + HEADER - 4;
      cw = ctrl;
      ch = Math.round(H - m - cy);
    } else {
      contentW = tall ? W - m * 2 : Math.min(W - m * 2, 1180);
      x0 = (W - contentW) / 2;
      sw = Math.round(contentW - BAND * 2);
      sh = Math.round(Math.max(200, H - m - HEADER - BAND * 2 - 10 - ctrl - m));
      cx = x0;
      cy = H - m - ctrl;
      cw = contentW;
      ch = ctrl;
    }
    const key = `${layout}-${sw}-${sh}-${cw}-${ch}-${s.toFixed(3)}`;
    this.board.scale.set(s);
    this.board.position.set(0, 0);
    const sx = x0 + BAND;
    const sy = m + HEADER + BAND;
    this.scene.position.set(sx, sy);
    this.over.position.set(sx, sy);
    this.header.position.set(x0, m);
    this.controls.position.set(cx, cy);
    if (key === this.key) return;
    this.key = key;
    this.sw = sw;
    this.sh = sh;
    this.contentW = contentW;
    this.frameTex?.destroy(true);
    this.frameTex = frameTexture(sw, sh);
    this.frame.texture = this.frameTex;
    this.frame.position.set(sx - 26, sy - 26);
    this.mask.clear().roundRect(0, 0, sw, sh, 20).fill(0xffffff);
    this.barTex?.destroy(true);
    this.barTex = barTexture(cw, ch);
    this.bar.texture = this.barTex;
    // Header: title on the left, results in the middle, the rules knob on the right.
    this.titleText.style.fontSize = this.fs(tall ? 22 : 26);
    this.titleText.position.set(4, HEADER / 2 - 4);
    const halo = this.header.getChildByLabel('halo') as Sprite;
    halo.position.set(this.titleText.width / 2, HEADER / 2 - 4);
    halo.width = this.titleText.width * 1.6;
    halo.height = 90;
    this.infoBtn?.destroy({ children: true });
    this.infoBtn = button({ label: '?', ariaLabel: 'So geht’s', width: 44, height: 40, fontSize: 22, color: 0x3a2040, textColor: 0xfff3dc, onClick: () => this.toggleRules() });
    this.infoBtn.position.set(contentW - 24, HEADER / 2 - 4);
    this.header.addChild(this.infoBtn);
    this.controls.removeChildren().forEach((c) => c !== this.bar && c.destroy({ children: true }));
    this.controls.addChild(this.bar);
    const inner = new Container();
    this.controls.addChild(inner);
    this.ctrlBox = { w: cw, h: ch };
    this.hooks.buildControls(inner, cw, ch, layout, this.fs);
    this.hooks.layoutScene(sw, sh, layout);
    this.drawHistory();
    if (this.rulesPanel) {
      this.rulesPanel.destroy({ children: true });
      this.rulesPanel = null;
    }
  }

  // ---- Results row -------------------------------------------------------------------------------

  addHistory(text: string, color: number, ink = 0x2a1406) {
    this.history.unshift({ text, color, ink });
    if (this.history.length > 8) this.history.pop();
    this.drawHistory(true);
  }

  private drawHistory(pop = false) {
    const L = this.historyLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    const left = this.titleText.x + this.titleText.width + 18;
    const right = this.contentW - 56;
    const fsz = this.fs(17);
    const tw = Math.round(fsz * 4.1);
    const max = Math.max(0, Math.floor((right - left) / (tw + 6)));
    L.position.set(left, HEADER / 2 - 4);
    this.history.slice(0, max).forEach((h, i) => {
      const c = new Container();
      const g = new Graphics();
      const th = Math.round(fsz * 1.65);
      g.roundRect(-tw / 2, -th / 2, tw, th, th / 2).fill(h.color).stroke({ color: 0x1a0c10, width: 2 });
      g.roundRect(-tw / 2 + 3, -th / 2 + 3, tw - 6, th * 0.32, th / 3).fill({ color: 0xffffff, alpha: 0.22 });
      const t = new Text({ text: h.text, style: { fontFamily: FONT_BODY, fontSize: fsz, fontWeight: '700', fill: h.ink } });
      t.anchor.set(0.5);
      if (t.width > tw - 8) t.scale.set((tw - 8) / t.width);
      c.addChild(g, t);
      c.x = i * (tw + 6) + tw / 2;
      c.alpha = i === 0 ? 1 : 0.78;
      L.addChild(c);
      if (pop && i === 0) {
        c.scale.set(0.3);
        void tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack);
      }
    });
  }

  // ---- Rules card --------------------------------------------------------------------------------

  toggleRules() {
    if (this.rulesPanel) {
      const p = this.rulesPanel;
      this.rulesPanel = null;
      void leaveMotion(p).then(() => p.destroy({ children: true }));
      return;
    }
    const pw = Math.min(this.sw - 20, 620);
    const fsz = this.fs(this.tall ? 17 : 20);
    const body = bodyText(this.hooks.rules, fsz, 0xf2e6c9, { wrap: pw - 56, align: 'left' });
    const ph = Math.min(this.sh + 40, body.height + 130);
    const p = new Container();
    const bg = new Sprite(panelTexture(Math.round(pw), Math.round(ph)));
    bg.position.set(-pw / 2 - PANEL_PAD, -ph / 2 - PANEL_PAD);
    const head = new Text({ text: 'SO GEHT’S', style: { fontFamily: FONT_DISPLAY, fontSize: this.fs(22), fill: 0xffcf7a, letterSpacing: 2 } });
    head.anchor.set(0.5, 0);
    head.position.set(0, -ph / 2 + 20);
    body.position.set(-pw / 2 + 28, -ph / 2 + 58);
    if (body.height > ph - 130) body.scale.set((ph - 130) / body.height);
    const ok = button({ label: 'VERSTANDEN', width: 200, height: 50, fontSize: 18, onClick: () => this.toggleRules() });
    ok.position.set(0, ph / 2 - 40);
    p.addChild(bg, head, body, ok);
    p.position.set(this.sw / 2, this.sh / 2);
    p.eventMode = 'static';
    this.over.addChild(p);
    this.rulesPanel = p;
    void enterMotion(p);
  }

  get rulesOpen() {
    return !!this.rulesPanel;
  }

  destroy() {
    this.frameTex?.destroy(true);
    this.barTex?.destroy(true);
  }
}

/** Bet stepper (– amount +) used by all three games. Returns the parts so the game can enable them. */
export function betStepper(fs: (px: number) => number, onChange: (d: number) => void, size = 50) {
  const minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: size, height: size, fontSize: 26, onClick: () => onChange(-1) });
  const plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: size, height: size, fontSize: 26, onClick: () => onChange(1) });
  const text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: fs(24), fill: 0xfff3dc } });
  text.anchor.set(0.5);
  return { minus, plus, text };
}

/** Small engraved caption above a control group. */
export function caption(text: string, size: number) {
  const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: size, fontWeight: '700', fill: 0xd8b878, letterSpacing: 1.5 } });
  return t;
}
