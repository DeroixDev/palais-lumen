// Small shared pieces of the card tables: the stake ladder control, the "So geht's" rules card,
// chip piles on the felt, a speech bubble and the win presentation (coins, light wave, stage).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, reducedMotion, rewardLevel } from '../../core/fx';
import { animate, ease, tween } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { markModal } from '../../core/focus';
import { formatChips } from '../../core/state';
import { panelTexture, PANEL_PAD, bodyText, CREAM } from '../../ui/kit';
import { StakeWatch } from '../stakeWatch';
import { CHIP_ANCHOR, CHIP_EDGE, chipTexture } from '../roulette/paint';
import { lightWave, winStage } from '../slots/stage';

/** "96,0 %" */
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace('.', ',')} %`;

/** The usual line under every game: "Auszahlungsquote 96,0 % · Hausvorteil 4,0 %". */
export const rtpLine = (rtp: number, digits = 1) => `Auszahlungsquote ${pct(rtp, digits)} · Hausvorteil ${pct(1 - rtp, digits)}`;

// ---- Stake ladder ---------------------------------------------------------------------------------

/** Minus / amount / plus, on today's ladder; rebuilds itself when today's stakes change. */
export class StakeControl {
  readonly view = new Container();
  private bets: number[];
  private index: number;
  private minus: Button;
  private plus: Button;
  private text: Text;
  private watch: StakeWatch;
  private enabled = true;

  constructor(
    private ctx: GameContext,
    private base: readonly number[],
    start = 0,
    private width = 236,
  ) {
    this.bets = ctx.state.stakes(base);
    this.index = start;
    this.watch = new StakeWatch(ctx.state);
    const half = width / 2 - 28;
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 56, height: 56, fontSize: 28, onClick: () => this.change(-1) });
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 56, height: 56, fontSize: 28, onClick: () => this.change(1) });
    this.minus.x = -half;
    this.plus.x = half;
    const cap = label('EINSATZ', 16, 0xd9c6a0);
    cap.anchor.set(0.5);
    cap.y = -18;
    this.text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 27, fill: 0xfff6e6 } });
    this.text.anchor.set(0.5);
    this.text.y = 9;
    this.view.addChild(this.minus, this.plus, cap, this.text);
    this.change(0);
  }

  get bet() {
    return this.bets[this.index];
  }

  /** Smallest stake of today's ladder (chip colours are relative to it). */
  get unit() {
    return this.bets[0];
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.change(0);
  }

  private change(d: number) {
    this.index = Math.max(0, Math.min(this.bets.length - 1, this.index + d));
    this.text.text = formatChips(this.bet);
    const room = this.width - 130;
    this.text.scale.set(1);
    if (this.text.width > room) this.text.scale.set(room / this.text.width);
    this.minus.setEnabled(this.enabled && this.index > 0);
    this.plus.setEnabled(this.enabled && this.index < this.bets.length - 1);
    if (d) this.ctx.sfx.chip();
  }

  /** Call every frame: between rounds, today's new stakes replace the ladder. */
  update(busy: boolean) {
    if (!this.watch.changed(busy)) return;
    this.bets = this.ctx.state.stakes(this.base);
    this.change(0);
    this.ctx.toast(this.watch.note);
  }
}

// ---- Rules card -------------------------------------------------------------------------------------

/** The "So geht's" card: velvet panel over the table, tap or × closes it. */
export class RulesCard {
  readonly view = new Container();
  private panel = new Container();

  constructor(title: string, lines: string[], private W = 560) {
    markModal(this.view);
    const veil = new Graphics().rect(-4000, -4000, 8000, 8000).fill({ color: 0x0a0410, alpha: 0.6 });
    veil.eventMode = 'static';
    veil.on('pointertap', () => this.hide());
    const body = bodyText(lines.join('\n'), 21, CREAM, { wrap: W - 80, align: 'left' });
    const H = Math.round(body.height + 150);
    const bg = new Sprite(panelTexture(W, H));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    bg.eventMode = 'static';
    const head = new Text({ text: title, style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: COLORS.lamp, letterSpacing: 2 } });
    head.anchor.set(0.5, 0);
    head.position.set(W / 2, 34);
    body.position.set(40, 90);
    const close = button({ label: '×', ariaLabel: 'Regeln schließen', width: 52, height: 52, fontSize: 32, onClick: () => this.hide() });
    close.position.set(W - 40, 40);
    this.panel.addChild(bg, head, body, close);
    this.view.addChild(veil, this.panel);
    this.view.visible = false;
    (this.panel as Container & { h: number }).h = H;
  }

  /** Centres the card in a w×h area of the parent, scaled to fit. */
  layout(w: number, h: number) {
    const H = (this.panel as Container & { h: number }).h;
    const k = Math.min(1, (w - 24) / this.W, (h - 24) / H);
    this.panel.scale.set(k);
    this.panel.position.set((w - this.W * k) / 2, (h - H * k) / 2);
  }

  get open() {
    return this.view.visible;
  }

  show() {
    this.view.visible = true;
    this.view.alpha = 0;
    void tween(this.view, { alpha: 1 }, 160);
  }

  hide() {
    this.view.visible = false;
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }
}

/** Round brass "?" button that opens the rules card. */
export function infoButton(onClick: () => void) {
  return button({ label: '?', ariaLabel: "So geht's: Regeln anzeigen", width: 52, height: 52, fontSize: 28, onClick });
}

// ---- Chips on the felt --------------------------------------------------------------------------

const CHIP_BASES = [10, 50, 100, 250, 500, 1000];

/** A little stack of painted chips for `amount`, colour by its size relative to today's `unit`. */
export function chipPile(amount: number, unit: number) {
  const c = new Container();
  const r = (amount / Math.max(1, unit)) * 10;
  let base = CHIP_BASES[0];
  for (const b of CHIP_BASES) if (r >= b) base = b;
  const n = Math.max(1, Math.min(5, Math.round(r / base)));
  for (let i = 0; i < n; i++) {
    const s = new Sprite(chipTexture(base));
    s.anchor.set(CHIP_ANCHOR.x, CHIP_ANCHOR.y);
    s.y = -i * CHIP_EDGE;
    c.addChild(s);
  }
  return c;
}

/** Slides a chip pile from one point to another (stake placed, winnings paid). */
export function slide(t: Container, x: number, y: number, ms = 320) {
  if (reducedMotion()) {
    t.position.set(x, y);
    return Promise.resolve();
  }
  return tween(t, { x, y }, ms, ease.outCubic);
}

// ---- Speech bubble ------------------------------------------------------------------------------

/** A cream speech bubble with a tail pointing down-left; `say()` pops it up for a while. */
export class Bubble {
  readonly view = new Container();
  private bg = new Graphics();
  private text: Text;
  private hideAt = 0;
  private t = 0;

  constructor(private maxW = 260) {
    this.text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0x2a1406, wordWrap: true, wordWrapWidth: maxW - 28, align: 'center' } });
    this.text.anchor.set(0.5);
    this.view.addChild(this.bg, this.text);
    this.view.visible = false;
  }

  say(s: string, ms = 1800) {
    this.text.text = s;
    const w = Math.min(this.maxW, this.text.width + 30);
    const h = this.text.height + 20;
    this.bg.clear();
    this.bg.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 14).fill({ color: 0x0a0410, alpha: 0.35 });
    this.bg.roundRect(-w / 2, -h / 2, w, h, 14).fill(0xfff4dc).stroke({ color: 0x2a1406, width: 2.5 });
    this.bg.poly([-w / 2 + 18, h / 2 - 2, -w / 2 + 8, h / 2 + 16, -w / 2 + 34, h / 2 - 2]).fill(0xfff4dc).stroke({ color: 0x2a1406, width: 2.5 });
    this.bg.rect(-w / 2 + 17, h / 2 - 4, 18, 4).fill(0xfff4dc);
    this.view.visible = true;
    this.hideAt = this.t + ms;
    if (!reducedMotion()) {
      this.view.scale.set(0.6);
      void tween(this.view.scale, { x: 1, y: 1 }, 260, ease.outBack);
    }
  }

  update(dt: number) {
    this.t += dt;
    if (this.view.visible && this.t > this.hideAt) this.view.visible = false;
  }
}

// ---- Wins ---------------------------------------------------------------------------------------

/**
 * Presents a settled round the casino way: under the stake nothing, small wins float the amount
 * and fly coins to the purse, from 10× a light wave, from 20× the skippable stage over `area`
 * (in `layer` coordinates); from 50× main.ts shakes only the game view. Returns when done.
 */
export async function presentWin(
  ctx: GameContext,
  layer: Container,
  o: { stake: number; win: number; at: { x: number; y: number }; area: { x: number; y: number; w: number; h: number }; fontScale?: number },
) {
  const mult = o.stake > 0 ? o.win / o.stake : 0;
  const g = layer.toGlobal(o.at);
  if (mult > 1) {
    ctx.celebrate(mult, g.x, g.y);
    const level = rewardLevel(mult);
    if (level >= 3) {
      await winStage(layer, {
        ...o.area,
        title: level === 4 ? 'MONDREGEN' : 'GROSSER GEWINN',
        sub: `×${(Math.round(mult * 100) / 100).toString().replace('.', ',')} Einsatz`,
        amount: o.win,
        accent: level === 4 ? COLORS.lamp : COLORS.neon,
        durationMs: level === 4 ? 2500 : 2000,
        onTick: () => ctx.sfx.tick(),
      });
      return;
    }
    floatText(layer, o.at.x, o.at.y - 30, `+${formatChips(o.win)}`, COLORS.lamp, Math.round(36 * (o.fontScale ?? 1)));
    if (level === 2) void lightWave(layer, o.area.x, o.area.y, o.area.w, o.area.h, COLORS.lamp);
  } else if (o.win > 0) {
    ctx.sfx.partial();
    floatText(layer, o.at.x, o.at.y - 30, `${formatChips(o.win)} zurück`, 0xd9c6a0, Math.round(28 * (o.fontScale ?? 1)));
  }
}

/** A pulsing brass-and-velvet badge with a number (hand totals). */
export class TotalBadge {
  readonly view = new Container();
  private bg = new Graphics();
  private text: Text;

  constructor(size = 26) {
    this.text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: size, fill: 0xfff6e6 } });
    this.text.anchor.set(0.5);
    this.view.addChild(this.bg, this.text);
    this.view.visible = false;
  }

  set(s: string, tone: 'plain' | 'good' | 'bad' | 'gold' = 'plain') {
    this.text.text = s;
    const w = Math.max(this.text.height * 1.5, this.text.width + 26);
    const h = this.text.height + 10;
    const fill = tone === 'good' ? 0x1d6a4a : tone === 'bad' ? 0x6a1a2a : tone === 'gold' ? 0x8a5a14 : 0x2a1436;
    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2 + 3, w, h, h / 2).fill({ color: 0x0a0410, alpha: 0.45 });
    this.bg.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(fill).stroke({ color: tone === 'gold' ? 0xffe7a8 : COLORS.brass, width: 3 });
    this.text.style.fill = tone === 'gold' ? 0xfff1c4 : 0xfff6e6;
    if (!this.view.visible && !reducedMotion()) {
      this.view.scale.set(0.5);
      void tween(this.view.scale, { x: 1, y: 1 }, 240, ease.outBack);
    }
    this.view.visible = true;
  }

  hide() {
    this.view.visible = false;
  }

  /** A quick pop (new card added). */
  pop() {
    if (reducedMotion()) return;
    void animate(200, (k) => !this.view.destroyed && this.view.scale.set(1 + 0.18 * Math.sin(k * Math.PI)));
  }
}

/**
 * Keeps a small info line readable (about 13 css px) when the table is drawn small, e.g. on a
 * phone held sideways: the font grows by the inverse of the table's scale, but never wider
 * than `maxW` design pixels.
 */
export function readable(t: Text, base: number, scale: number, maxW = Infinity) {
  t.style.fontSize = Math.max(base, Math.ceil(13.5 / Math.max(0.1, scale)));
  t.style.lineHeight = Math.round(Number(t.style.fontSize) * 1.18);
  t.scale.set(1);
  if (t.width > maxW) t.scale.set(maxW / t.width);
}
