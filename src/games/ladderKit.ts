// Shared frame for the cash-out ladder machines (Diamantminen, Drachenturm, Mondmünze):
// a painted scene of 380×410 design pixels next to (wide screens) or above (portrait) a
// velvet control deck with the bet stepper, the main button, the collect button, the
// payout line and a "So geht's" card. Each game paints its own scene and options row.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, rewardLevel, shake } from '../core/fx';
import type { GameContext } from '../core/registry';
import { winStage } from './slots/stage';
import { button, label, type Button } from '../core/ui';
import { PANEL_PAD, bodyText, enterMotion, leaveMotion, panelTexture } from '../ui/kit';
import { formatChips } from '../core/state';

export const SCENE_W = 380;
export const SCENE_H = 410;
const DECK_WIDE = 320;
const DECK_TALL_H = 268;

/** "1,23×" with two decimals below 100, whole numbers above. */
export function fmtMult(m: number) {
  if (m >= 1000) return `${formatChips(m)}×`;
  if (m >= 100) return `${m.toFixed(1).replace('.', ',')}×`;
  return `${m.toFixed(2).replace('.', ',')}×`;
}

export function rtpLine(rtp: number) {
  const p = (x: number) => (x * 100).toFixed(1).replace('.', ',');
  return `Auszahlungsquote ${p(rtp)} % · Hausvorteil ${p(1 - rtp)} %`;
}

export interface DeckOptions {
  rtp: number;
  accent: number;
  /** Builds the game's own options row (trap count, difficulty, coin side) for the given width. */
  options(tall: boolean, width: number): Container;
  /** Re-applies the game's state to freshly built controls (after a layout switch). */
  refresh(): void;
  onMain(): void;
  onSecond(): void;
  onBet(d: number): void;
  rules: string;
}

/** The control deck. Rebuilt when the layout flips between wide and tall. */
export class LadderDeck {
  readonly view = new Container();
  tall = false;
  main!: Button;
  second!: Button;
  minus!: Button;
  plus!: Button;
  private betText!: Text;
  private mainState = { label: 'SPIELEN', enabled: true, hot: false };
  private secondState = { label: 'KASSIEREN', enabled: false };
  private betState = { text: '', minus: true, plus: true };
  private betLocked = false;
  private rtpText: Text | null = null;
  private rtpInner = 0;
  /** A different payout line (an odds item is on), with its colour; null = the game's own. */
  private rtpOverride: { text: string; fill: number } | null = null;
  w = DECK_WIDE;
  h = SCENE_H;

  constructor(private o: DeckOptions) {}

  build(tall: boolean) {
    this.tall = tall;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    const W = (this.w = tall ? SCENE_W : DECK_WIDE);
    const H = (this.h = tall ? DECK_TALL_H : SCENE_H);
    const bg = new Sprite(panelTexture(W, H, { velvet: 0x2e1024, accent: 0x6b1a2e }));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    this.view.addChild(bg);
    const pad = tall ? 26 : 20;
    const inner = W - pad * 2;
    const opts = this.o.options(tall, inner);
    const betCap = label('EINSATZ', 17, 0xd9c6a0);
    betCap.anchor.set(0.5);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 50, height: 50, onClick: () => this.o.onBet(-1) });
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 50, height: 50, onClick: () => this.o.onBet(1) });
    const rtp = new Text({ text: rtpLine(this.o.rtp), style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
    rtp.anchor.set(0.5);
    const info = button({ label: "So geht's", width: tall ? 140 : 150, height: 42, color: 0x4a2a3a, textColor: 0xfff6e6, fontSize: 19, display: false, onClick: () => this.showRules() });
    let mw: number, sw: number;
    if (tall) {
      mw = sw = (inner - 12) / 2;
    } else {
      mw = sw = inner;
    }
    this.main = button({ label: this.mainState.label, width: mw, height: 64, color: this.o.accent, textColor: 0x1a0610, fontSize: 25, onClick: () => this.o.onMain() });
    this.second = button({ label: this.secondState.label, width: sw, height: tall ? 64 : 52, color: 0x2f7a4a, textColor: 0xfff6e6, fontSize: 22, onClick: () => this.o.onSecond() });
    if (tall) {
      opts.position.set(pad, 22);
      const by = 114;
      this.minus.position.set(pad + 24, by);
      this.plus.position.set(pad + 150, by);
      betCap.position.set(pad + 87, by - 18);
      this.betText.position.set(pad + 87, by + 9);
      info.position.set(W - pad - 70, by);
      this.main.position.set(pad + mw / 2, 186);
      this.second.position.set(W - pad - sw / 2, 186);
      rtp.position.set(W / 2, 242);
    } else {
      opts.position.set(20, 24);
      const by = 150;
      this.minus.position.set(52, by);
      this.plus.position.set(W - 52, by);
      betCap.position.set(W / 2, by - 18);
      this.betText.position.set(W / 2, by + 9);
      this.main.position.set(W / 2, 214);
      this.second.position.set(W / 2, 278);
      rtp.position.set(W / 2, 324);
      info.position.set(W / 2, 364);
    }
    this.rtpText = rtp;
    this.rtpInner = inner;
    this.applyRtp();
    this.view.addChild(opts, betCap, this.betText, this.minus, this.plus, this.main, this.second, rtp, info);
    this.applyMain();
    this.applySecond();
    this.applyBet();
    this.o.refresh();
  }

  /** Shows another payout line (e.g. with an odds item), or the game's own again with null. */
  setRtp(text: string | null, fill = 0xe6d6b4) {
    this.rtpOverride = text === null ? null : { text, fill };
    this.applyRtp();
  }

  private applyRtp() {
    const t = this.rtpText;
    if (!t || t.destroyed) return;
    t.text = this.rtpOverride?.text ?? rtpLine(this.o.rtp);
    t.style.fill = this.rtpOverride?.fill ?? 0xe6d6b4;
    const two = t.text.includes('\n');
    t.style.fontSize = two ? 16 : 18;
    t.style.lineHeight = two ? 18 : 0;
    t.style.align = 'center';
    t.scale.set(1);
    if (t.width > this.rtpInner) t.scale.set(this.rtpInner / t.width);
  }

  setMain(text: string, enabled = true) {
    this.mainState.label = text;
    this.mainState.enabled = enabled;
    this.applyMain();
  }

  setSecond(text: string, enabled: boolean) {
    this.secondState.label = text;
    this.secondState.enabled = enabled;
    this.applySecond();
  }

  setBet(amount: number, canMinus: boolean, canPlus: boolean) {
    this.betState = { text: formatChips(amount), minus: canMinus, plus: canPlus };
    this.applyBet();
  }

  /** Bets can't change during a round. */
  lockBet(on: boolean) {
    this.betLocked = on;
    this.applyBet();
  }

  private applyMain() {
    if (!this.main) return;
    this.main.setLabel(this.mainState.label);
    this.main.setEnabled(this.mainState.enabled);
  }

  private applySecond() {
    if (!this.second) return;
    this.second.setLabel(this.secondState.label);
    this.second.setEnabled(this.secondState.enabled);
  }

  private applyBet() {
    if (!this.betText) return;
    this.betText.text = this.betState.text;
    this.betText.scale.set(Math.min(1, 110 / Math.max(1, this.betText.width / this.betText.scale.x)));
    this.minus.setEnabled(!this.betLocked && this.betState.minus);
    this.plus.setEnabled(!this.betLocked && this.betState.plus);
  }

  /** Rules card over the scene; tap anywhere to close. */
  rulesHost: Container | null = null;
  private rules: Container | null = null;
  showRules() {
    const host = this.rulesHost;
    if (!host) return;
    if (this.rules) return this.closeRules();
    const c = new Container();
    const W = SCENE_W - 30;
    const H = SCENE_H - 40;
    const bg = new Sprite(panelTexture(W, H, { velvet: 0x2a0e22 }));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    const veil = new Graphics().rect(-15, -20, SCENE_W, SCENE_H).fill({ color: 0x0a0410, alpha: 0.55 });
    const head = label("SO GEHT'S", 24, COLORS.lamp, true);
    head.anchor.set(0.5, 0);
    head.position.set(W / 2, 26);
    const body = bodyText(this.o.rules, 18, 0xf2e6c9, { wrap: W - 56, align: 'left' });
    body.position.set(28, 70);
    if (body.height > H - 120) body.scale.set((H - 120) / body.height);
    const foot = bodyText('Tippen zum Schließen', 16, 0xc9b48e);
    foot.anchor.set(0.5, 1);
    foot.position.set(W / 2, H - 18);
    c.addChild(veil, bg, head, body, foot);
    c.position.set(15, 20);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => this.closeRules());
    host.addChild(c);
    this.rules = c;
    void enterMotion(c);
  }

  closeRules() {
    const r = this.rules;
    if (!r) return;
    this.rules = null;
    void leaveMotion(r).then(() => r.destroy({ children: true }));
  }
}

/**
 * Places scene and deck: side by side on wide screens, stacked on portrait ones, scaled so
 * the 17 px design text stays at least ~13 css px on phones.
 */
export function layoutLadder(view: Container, board: Container, scene: Container, deck: LadderDeck, w: number, h: number) {
  const tall = w / h < 1.05;
  if (tall !== deck.tall || deck.view.children.length === 0) deck.build(tall);
  let tw: number, th: number;
  if (tall) {
    tw = SCENE_W + 16;
    th = SCENE_H + 14 + deck.h + 18;
    scene.position.set(8, 6);
    deck.view.position.set(8, 6 + SCENE_H + 14);
  } else {
    tw = SCENE_W + 22 + deck.w + 28;
    th = SCENE_H + 12;
    scene.position.set(14, 6);
    deck.view.position.set(14 + SCENE_W + 22, 6);
  }
  const s = Math.min(w / tw, h / th, 1.6);
  board.scale.set(s);
  board.position.set((w - tw * s) / 2, (h - th * s) / 2);
  if (!board.parent) view.addChild(board);
  return { tall, s };
}

/**
 * Win convention for a collected ladder: the shared celebration at `at` (global point), from
 * 20× the skippable stage over the scene, from 50× a short shake of the game board only.
 */
export async function ladderWin(
  ctx: GameContext,
  board: Container,
  scene: Container,
  mult: number,
  win: number,
  at: { x: number; y: number },
  titles: { big: string; jackpot: string },
) {
  ctx.celebrate(mult, at.x, at.y);
  const level = rewardLevel(mult);
  if (level >= 4) void shake(board, 8, 300);
  if (level >= 3) {
    await winStage(scene, {
      x: 6,
      y: 40,
      w: SCENE_W - 12,
      h: SCENE_H - 60,
      title: level === 4 ? titles.jackpot : titles.big,
      sub: `${fmtMult(mult)} Einsatz`,
      amount: win,
      accent: level === 4 ? COLORS.lamp : COLORS.neon,
      durationMs: level === 4 ? 2500 : 2000,
      onTick: () => ctx.sfx.tick(),
    });
  }
}
