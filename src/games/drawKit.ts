// Shared frame for the draw games Sternenhimmel (keno), Glühwürmchen-Bingo and Kratzglück:
// a painted scene of SCENE_W×SCENE_H design pixels next to (wide screens) or above (portrait)
// a velvet control deck, a bet stepper fed by today's stake ladder, the payout line and a
// "So geht's" card. Each game paints its own scene and places its own deck controls.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../core/fx';
import type { GameContext } from '../core/registry';
import { button, label, type Button } from '../core/ui';
import { PANEL_PAD, bodyText, enterMotion, leaveMotion, panelTexture } from '../ui/kit';
import { formatChips } from '../core/state';
import { StakeWatch } from './stakeWatch';

export const SCENE_W = 720;
export const SCENE_H = 560;
const GAP = 18;
/** Smallest text in design pixels; at the smallest board scale (≈0.54) that is still 13 css px. */
export const MIN_FONT = 25;

const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

export function rtpLine(rtp: number) {
  return `Auszahlungsquote ${pct(rtp)} % · Hausvorteil ${pct(1 - rtp)} %`;
}

/** "0,5×", "34×", "10.000×". */
export function fmtMult(m: number) {
  if (m >= 1000) return `${formatChips(m)}×`;
  return `${String(m).replace('.', ',')}×`;
}

export interface ShellOptions {
  /** Scene size in design pixels (default SCENE_W × SCENE_H). */
  sceneW?: number;
  sceneH?: number;
  /** Deck width beside the scene on wide screens (height = SCENE_H). */
  deckWide: number;
  /** Deck height below the scene on tall screens (width = SCENE_W). */
  deckTall: number;
  velvet?: number;
  /** Places the deck controls for the layout; the deck is w×h, its (0,0) is the top left. */
  layout(tall: boolean, w: number, h: number): void;
}

/** Scene + deck, scaled to the screen; flips between side-by-side and stacked. */
export class DrawShell {
  readonly view = new Container();
  readonly board = new Container();
  readonly scene = new Container();
  readonly deck = new Container();
  /** Above the scene: big-win stage, rules card. */
  readonly over = new Container();
  private deckBg = new Sprite();
  tall: boolean | null = null;
  scale = 1;

  readonly sw: number;
  readonly sh: number;

  constructor(private o: ShellOptions) {
    this.sw = o.sceneW ?? SCENE_W;
    this.sh = o.sceneH ?? SCENE_H;
    this.view.addChild(this.board);
    this.deck.addChild(this.deckBg);
    this.board.addChild(this.scene, this.deck, this.over);
  }

  resize(w: number, h: number) {
    const tall = w / h < 0.95;
    if (tall !== this.tall) {
      this.tall = tall;
      const dw = tall ? this.sw : this.o.deckWide;
      const dh = tall ? this.o.deckTall : this.sh;
      this.deckBg.texture = panelTexture(dw, dh, { velvet: this.o.velvet ?? 0x2e1024, accent: 0x6b1a2e });
      this.deckBg.position.set(-PANEL_PAD, -PANEL_PAD);
      this.deck.position.set(tall ? 0 : this.sw + GAP, tall ? this.sh + GAP : 0);
      this.o.layout(tall, dw, dh);
    }
    const W = tall ? this.sw : this.sw + GAP + this.o.deckWide;
    const H = tall ? this.sh + GAP + this.o.deckTall : this.sh;
    const s = Math.min((w * (tall ? 0.985 : 0.97)) / W, (h * 0.97) / H, 1.3);
    this.scale = s;
    this.board.scale.set(s);
    this.board.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  /** Screen point of a scene point (for celebrate / particles). */
  global(x: number, y: number) {
    return this.scene.toGlobal({ x, y });
  }

  // ---- Rules card ----------------------------------------------------------------------------

  private rules: Container | null = null;
  showRules(text: string) {
    if (this.rules) return this.closeRules();
    const c = new Container();
    const W = this.sw - 60;
    const H = this.sh - 60;
    const veil = new Graphics().roundRect(0, 0, this.sw, this.sh, 26).fill({ color: 0x0a0410, alpha: 0.6 });
    const card = new Container();
    card.position.set(30, 30);
    const bg = new Sprite(panelTexture(W, H, { velvet: 0x2a0e22 }));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    const head = label("SO GEHT'S", 30, COLORS.lamp, true);
    head.anchor.set(0.5, 0);
    head.position.set(W / 2, 24);
    const body = bodyText(text, 25, 0xf2e6c9, { wrap: W - 70, align: 'left' });
    body.position.set(35, 80);
    if (body.height > H - 140) body.scale.set((H - 140) / body.height);
    const foot = bodyText('Tippen zum Schließen', 24, 0xc9b48e);
    foot.anchor.set(0.5, 1);
    foot.position.set(W / 2, H - 18);
    card.addChild(bg, head, body, foot);
    c.addChild(veil, card);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => this.closeRules());
    this.over.addChild(c);
    this.rules = c;
    void enterMotion(card);
  }

  closeRules() {
    const r = this.rules;
    if (!r) return;
    this.rules = null;
    void leaveMotion(r).then(() => r.destroy({ children: true }));
  }
}

/** Minus / amount / plus on today's stake ladder; polls for stake changes between rounds. */
export class BetStepper {
  readonly view = new Container();
  readonly minus: Button;
  readonly plus: Button;
  private text: Text;
  private cap: Text;
  private bets: number[];
  private index = 0;
  private locked = false;
  private watch: StakeWatch;
  onChange: () => void = () => {};

  constructor(private ctx: GameContext, private base: number[], width = 300, caption = 'EINSATZ') {
    this.bets = ctx.state.stakes(base);
    this.watch = new StakeWatch(ctx.state);
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 58, height: 58, onClick: () => this.step(-1) });
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 58, height: 58, onClick: () => this.step(1) });
    this.minus.x = 29;
    this.plus.x = width - 29;
    this.cap = label(caption, MIN_FONT, 0xd9c6a0);
    this.cap.anchor.set(0.5);
    this.cap.position.set(width / 2, -16);
    this.text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xfff6e6 } });
    this.text.anchor.set(0.5);
    this.text.position.set(width / 2, 14);
    this.maxText = width - 140;
    this.view.addChild(this.cap, this.text, this.minus, this.plus);
    this.apply();
  }

  private maxText: number;

  get bet() {
    return this.bets[this.index];
  }

  /** Swaps the ladder (e.g. another scratch card design); keeps the rung. */
  setLadder(base: number[]) {
    this.base = base;
    this.bets = this.ctx.state.stakes(base);
    this.index = Math.min(this.index, this.bets.length - 1);
    this.apply();
  }

  setCaption(t: string) {
    this.cap.text = t;
  }

  step(d: number) {
    if (this.locked) return;
    this.index = Math.max(0, Math.min(this.bets.length - 1, this.index + d));
    this.apply();
    this.onChange();
  }

  lock(on: boolean) {
    this.locked = on;
    this.apply();
  }

  /** Call from update(): today's stakes changed (boss phase, event) → same rung, new amounts. */
  poll(busy: boolean) {
    if (!this.watch.changed(busy)) return;
    this.bets = this.ctx.state.stakes(this.base);
    this.apply();
    this.onChange();
    this.ctx.toast(this.watch.note);
  }

  private apply() {
    this.text.text = formatChips(this.bet);
    this.text.scale.set(1);
    if (this.text.width > this.maxText) this.text.scale.set(this.maxText / this.text.width);
    this.minus.setEnabled(!this.locked && this.index > 0);
    this.plus.setEnabled(!this.locked && this.index < this.bets.length - 1);
  }
}

/** Payout line under the controls. */
export function rtpText(rtp: number, maxWidth: number) {
  const t = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '600', fill: 0xe6d6b4, align: 'center' } });
  t.anchor.set(0.5);
  const set = (r: number, w = maxWidth) => {
    t.text = rtpLine(r);
    t.scale.set(1);
    if (t.width > w) {
      // Two lines rather than shrinking below the readable size.
      t.text = rtpLine(r).replace(' · ', '\n');
    }
  };
  set(rtp);
  return { text: t, set };
}

/** Small round info knob ("?") that opens the rules card. */
export function infoKnob(onClick: () => void) {
  return button({ label: '?', ariaLabel: 'So geht’s', width: 54, height: 54, fontSize: 28, color: 0x4a2a3a, textColor: 0xfff6e6, onClick });
}

/** Wires Space to the main action (focused buttons take Space first, see core/focus.ts). */
export function spaceKey(action: () => void) {
  const fn = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    action();
  };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}
