// "Falter-Poker": Jacks-or-Better video poker. Five cards, hold what you like, draw once.
// Wins pay from a pair of Buben; after a win you may take it or "Doppeln" (beat the bank's card).
// Twist: real perspective card flips (PerspectiveMesh) and a lit brass paytable that follows
// your hand; a Royal Flush gets its own moth-and-moon stage.
//
// Report tags: 'poker' (every round), 'pair' (won with Buben-Paar or zwei Paare), 'flush'
// (flush, straight flush or royal), 'royal' (royal flush), 'gamble' (Doppeln played),
// 'gambleWin' (at least one Doppeln won).

import { Container, Graphics, PerspectiveMesh, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowText, glowTexture, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { lightWave, reducedMotion, winStage } from '../slots/stage';
import { fillInk, glowAt, gold, grain, paint, rim, rrect, vgrad } from '../../world/painted/brush';
import { button, label, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { CH, CW, RANK_LABEL, SUIT_NAME, backTexture, cardShadowTexture, cardTexture, holdFrameTexture } from './cards';
import { GAMBLE_PAY, GAMBLE_RTP, HANDS, HAND_NAME, PAY, RTP, evaluate, gambleResult, rankOf, shuffledDeck, suitOf, type Hand } from './rules';
import { PANEL_PAD, closeKnob, panelTexture } from '../../ui/kit';
import { STATION_H, STATION_W, pokerStation } from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const MAX_GAMBLES = 5;
const PAY_ROWS = HANDS.filter((h) => h !== 'none');
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

type Phase = 'idle' | 'dealing' | 'hold' | 'drawing' | 'won' | 'gamble' | 'busy';

/** Which of the five cards make the hand (for the glow). */
function scoringCards(cards: number[], hand: Hand) {
  if (hand === 'none') return [];
  if (['royal', 'straightFlush', 'fullHouse', 'flush', 'straight'].includes(hand)) return [0, 1, 2, 3, 4];
  const n = new Map<number, number>();
  for (const c of cards) n.set(rankOf(c), (n.get(rankOf(c)) ?? 0) + 1);
  return cards.map((c, i) => (n.get(rankOf(c))! >= 2 && (hand !== 'jacks' || rankOf(c) >= 9) ? i : -1)).filter((i) => i >= 0);
}

const cardName = (c: number) => `${SUIT_NAME[suitOf(c)]} ${({ B: 'Bube', D: 'Dame', K: 'König', A: 'Ass' } as Record<string, string>)[RANK_LABEL[rankOf(c)]] ?? RANK_LABEL[rankOf(c)]}`;

// ---- Layouts ---------------------------------------------------------------------------------

interface Spec {
  key: 'wide' | 'tall' | 'short';
  W: number;
  H: number;
  pay: { x: number; y: number; w: number; row: number; font: number };
  rtpY: number;
  rtpX: number;
  msgX: number;
  msgY: number;
  cardY: number;
  cardX: (i: number) => number;
  cardScale: number;
  /** Bet group (and the Doppeln button in its place), the big button, the recess behind them. */
  bet: { x: number; y: number };
  deal: { x: number; y: number };
  deck: { x: number; y: number; w: number; h: number };
  msgW: number;
  info: { x: number; y: number };
}

const WIDE: Spec = {
  key: 'wide',
  W: 1120,
  H: 590,
  pay: { x: 34, y: 82, w: 380, row: 40, font: 24 },
  rtpX: 224,
  rtpY: 530,
  msgX: 770,
  msgY: 112,
  cardY: 290,
  cardX: (i) => 770 + (i - 2) * 134,
  cardScale: 1,
  bet: { x: 560, y: 506 },
  deal: { x: 975, y: 506 },
  deck: { x: 440, y: 454, w: 650, h: 104 },
  msgW: 660,
  info: { x: 1072, y: 44 },
};

const TALL: Spec = {
  key: 'tall',
  W: 640,
  H: 990,
  pay: { x: 30, y: 80, w: 580, row: 37, font: 25 },
  rtpX: 320,
  rtpY: 930,
  msgX: 320,
  msgY: 462,
  cardY: 616,
  cardX: (i) => 320 + (i - 2) * 119,
  cardScale: 0.92,
  bet: { x: 175, y: 820 },
  deal: { x: 462, y: 820 },
  deck: { x: 26, y: 768, w: 588, h: 104 },
  msgW: 590,
  info: { x: 592, y: 42 },
};

/** Landscape phones: controls in a column on the right, so everything can be drawn bigger. */
const SHORT: Spec = {
  key: 'short',
  W: 1290,
  H: 486,
  pay: { x: 26, y: 76, w: 366, row: 38, font: 24 },
  rtpX: 720,
  rtpY: 436,
  msgX: 720,
  msgY: 82,
  cardY: 250,
  cardX: (i) => 720 + (i - 2) * 124,
  cardScale: 0.9,
  bet: { x: 1160, y: 200 },
  deal: { x: 1160, y: 330 },
  deck: { x: 1040, y: 140, w: 240, h: 250 },
  info: { x: 1242, y: 42 },
  msgW: 600,
};

// ---- Painted machine -------------------------------------------------------------------------

const machineTex = new Map<string, Texture>();
function machineTexture(sp: Spec) {
  let t = machineTex.get(sp.key);
  if (t) return t;
  const { W, H } = sp;
  const P = 24;
  t = paint(W + P * 2, H + P * 2, (c) => {
    c.translate(P, P);
    // Cabinet body: midnight teal lacquer framed in brass.
    rrect(c, 0, 0, W, H, 34);
    fillInk(c, gold(c, 0, 0, W * 0.5, H), 5);
    rim(c, 0.7, 2.5);
    rrect(c, 12, 12, W - 24, H - 24, 26);
    fillInk(c, vgrad(c, 12, H - 12, 0x123a44, 0.15, 0.6), 3);
    grain(c, 16, 16, W - 32, H - 32, 220, 11, 0.05);
    c.save();
    rrect(c, 12, 12, W - 24, H - 24, 26);
    c.clip();
    glowAt(c, W / 2, 30, W * 0.5, 80, 0xffcf7a, 0.22, 'lighter');
    glowAt(c, sp.msgX, sp.cardY, 380, 200, 0x5fe3ff, 0.1, 'lighter');
    c.restore();
    // Paytable glass.
    const p = sp.pay;
    const ph = p.row * PAY_ROWS.length + 24;
    rrect(c, p.x - 8, p.y - 8, p.w + 16, ph + 16, 18);
    fillInk(c, gold(c, p.x, p.y, p.x + p.w, p.y + ph), 3);
    rrect(c, p.x, p.y, p.w, ph, 12);
    const pg = c.createLinearGradient(0, p.y, 0, p.y + ph);
    pg.addColorStop(0, '#20102a');
    pg.addColorStop(1, '#0c0614');
    fillInk(c, pg, 2);
    // Felt bed for the cards.
    const cw = sp.cardX(4) - sp.cardX(0) + (CW + 18) * sp.cardScale;
    const fy = sp.cardY - (CH / 2 + 24) * sp.cardScale;
    const ch = (CH + 24 + 70) * sp.cardScale;
    const fx = sp.msgX - cw / 2;
    rrect(c, fx - 8, fy - 8, cw + 16, ch + 16, 22);
    fillInk(c, gold(c, fx, fy, fx + cw, fy + ch), 3);
    rrect(c, fx, fy, cw, ch, 16);
    const fg = c.createRadialGradient(sp.msgX, sp.cardY - 20, 10, sp.msgX, sp.cardY, cw * 0.6);
    fg.addColorStop(0, '#1d6a5a');
    fg.addColorStop(1, '#0a2a26');
    fillInk(c, fg, 2);
    grain(c, fx, fy, cw, ch, 300, 5, 0.06);
    c.strokeStyle = 'rgba(224,178,90,0.35)';
    c.lineWidth = 1.4;
    rrect(c, fx + 8, fy + 8, cw - 16, ch - 16, 11);
    c.stroke();
    // Control deck recess.
    const d = sp.deck;
    rrect(c, d.x, d.y, d.w, d.h, 26);
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fill();
    c.strokeStyle = 'rgba(255,240,210,0.12)';
    c.lineWidth = 2;
    c.stroke();
  });
  machineTex.set(sp.key, t);
  return t;
}

let rowLitTex: Texture | null = null;
function rowLitTexture() {
  rowLitTex ??= paint(400, 44, (c) => {
    rrect(c, 3, 3, 394, 38, 10);
    const g = c.createLinearGradient(0, 3, 0, 41);
    g.addColorStop(0, 'rgba(255,214,140,0.95)');
    g.addColorStop(0.5, 'rgba(240,170,70,0.95)');
    g.addColorStop(1, 'rgba(170,100,30,0.95)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255,248,226,0.8)';
    c.lineWidth = 1.5;
    c.stroke();
    glowAt(c, 120, 12, 120, 10, 0xffffff, 0.25, 'lighter');
  }, 2);
  return rowLitTex;
}

let tagTex: Texture | null = null;
function tagTexture() {
  tagTex ??= paint(112, 38, (c) => {
    rrect(c, 3, 3, 106, 32, 10);
    fillInk(c, gold(c, 0, 0, 60, 40), 2);
    rim(c, 0.6, 1.4);
    rrect(c, 8, 8, 96, 22, 7);
    c.fillStyle = 'rgba(42,14,34,0.92)';
    c.fill();
  }, 2);
  return tagTex;
}

// ---- One card on the felt --------------------------------------------------------------------

class CardView {
  readonly root = new Container();
  private holdLift = new Container();
  private flipLift = new Container();
  private shadow = new Sprite(cardShadowTexture());
  private frame = new Sprite(holdFrameTexture());
  private glow = new Sprite(glowTexture());
  private mesh: PerspectiveMesh;
  private tag = new Container();
  private tagText: Text;
  private a11y: FocusHandle;
  card = -1;
  faceUp = false;
  held = false;
  onTap: () => void = () => {};
  canTap: () => boolean = () => false;

  constructor(private calm: boolean, private index: number) {
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.8;
    this.shadow.position.set(4, 8);
    this.frame.anchor.set(0.5);
    this.frame.alpha = 0;
    this.glow.anchor.set(0.5);
    this.glow.width = CW * 2.1;
    this.glow.height = CH * 1.7;
    this.glow.tint = COLORS.lamp;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.mesh = new PerspectiveMesh({ texture: backTexture(), verticesX: 8, verticesY: 8 });
    this.setPerspective(0, 1);
    this.flipLift.addChild(this.mesh);
    this.holdLift.addChild(this.glow, this.shadow, this.frame, this.flipLift);
    const tagBg = new Sprite(tagTexture());
    tagBg.anchor.set(0.5);
    this.tagText = new Text({ text: 'HALTEN', style: { fontFamily: FONT_DISPLAY, fontSize: 19, fill: COLORS.lamp, letterSpacing: 2 } });
    this.tagText.anchor.set(0.5);
    this.tag.addChild(tagBg, this.tagText);
    this.tag.y = CH / 2 + 30;
    this.tag.visible = false;
    this.root.addChild(this.holdLift, this.tag);
    this.root.eventMode = 'static';
    this.root.cursor = 'pointer';
    this.root.hitArea = new Rectangle(-CW / 2 - 6, -CH / 2 - 20, CW + 12, CH + 70);
    this.root.on('pointertap', () => this.canTap() && this.onTap());
    this.a11y = focusable(this.root, {
      label: () => (this.faceUp ? `Karte ${this.index + 1}: ${cardName(this.card)}${this.held ? ', gehalten' : ''}` : `Karte ${this.index + 1}, verdeckt`),
      rect: { w: CW, h: CH },
      radius: 12,
      enabled: () => this.canTap(),
      activate: () => this.canTap() && this.onTap(),
    });
  }

  refresh() {
    this.a11y.refresh();
  }

  /** Corners of the card turned by `phi` (0 flat, π/2 edge-on) about its vertical axis, in perspective. */
  private setPerspective(phi: number, dir: number) {
    const a = CW / 2;
    const b = CH / 2;
    const D = CW * 2.4;
    const cx = Math.max(0.6, a * Math.cos(phi));
    const z = a * Math.sin(phi) * dir;
    const pl = D / (D - z);
    const pr = D / (D + z);
    this.mesh.setCorners(-cx * pl, -b * pl, cx * pr, -b * pr, cx * pr, b * pr, -cx * pl, b * pl);
    this.shadow.scale.x = Math.max(0.02, Math.cos(phi));
  }

  /** Turns the card over to `tex` (a face or the back). */
  async flip(tex: Texture, ms = 300) {
    if (this.calm) {
      this.mesh.texture = tex;
      this.flipLift.alpha = 0.4;
      await tween(this.flipLift, { alpha: 1 }, 120);
      return;
    }
    let swapped = false;
    const dir = Math.random() < 0.5 ? 1 : -1;
    await animate(ms, (k) => {
      if (this.root.destroyed) return;
      const ang = k * Math.PI;
      const first = ang < Math.PI / 2;
      if (!first && !swapped) {
        swapped = true;
        this.mesh.texture = tex;
      }
      this.setPerspective(first ? ang : Math.PI - ang, first ? dir : -dir);
      const lift = Math.sin(k * Math.PI);
      this.flipLift.y = -lift * 16;
      this.flipLift.scale.set(1 + lift * 0.05);
      this.shadow.position.set(4 + lift * 6, 8 + lift * 14);
      this.shadow.alpha = 0.8 - lift * 0.35;
    }, ease.inOutCubic);
    if (this.root.destroyed) return;
    this.setPerspective(0, 1);
    this.flipLift.y = 0;
    this.flipLift.scale.set(1);
  }

  async show(card: number, ms = 300) {
    this.card = card;
    this.faceUp = true;
    await this.flip(cardTexture(card), ms);
    this.refresh();
  }

  async hide(ms = 220) {
    if (!this.faceUp) return;
    this.faceUp = false;
    await this.flip(backTexture(), ms);
    this.refresh();
  }

  setHeld(on: boolean, label = 'HALTEN') {
    this.held = on;
    this.tagText.text = label;
    this.tag.visible = on;
    const calm = this.calm;
    if (on) {
      this.tag.scale.set(calm ? 1 : 0.4);
      if (!calm) void tween(this.tag.scale, { x: 1, y: 1 }, 260, ease.outBack);
    }
    const y = on && label === 'HALTEN' ? -12 : 0;
    if (calm) this.holdLift.y = y;
    else void tween(this.holdLift, { y }, on ? 220 : 160, on ? ease.outBack : ease.outCubic);
    void tween(this.frame, { alpha: on ? 1 : 0 }, 160);
    this.refresh();
  }

  setGlow(on: boolean) {
    void tween(this.glow, { alpha: on ? 0.55 : 0 }, on ? 240 : 200);
    if (on && !this.calm) {
      this.holdLift.scale.set(1.08);
      void tween(this.holdLift.scale, { x: 1, y: 1 }, 380, ease.outBack);
    }
  }

  dim(on: boolean) {
    void tween(this.flipLift, { alpha: on ? 0.45 : 1 }, 200);
  }

  pulse(t: number) {
    if (this.glow.alpha > 0.2) this.glow.alpha = 0.45 + 0.15 * Math.sin(t * 5 + this.index);
  }
}

// ---- The game --------------------------------------------------------------------------------

interface PayRow {
  hand: Hand;
  c: Container;
  lit: Sprite;
  name: Text;
  mult: Text;
  amount: Text;
}

class PokerGame implements GameInstance {
  view = new Container();
  private root = new Container();
  private bg = new Sprite();
  private title: Container;
  private payLayer = new Container();
  private rows: PayRow[] = [];
  private cards: CardView[] = [];
  private msg: Text;
  private sub: Text;
  private rtpText: Text;
  private betLabel: Text;
  private betText: Text;
  private minus: Button;
  private plus: Button;
  private dealBtn: Button;
  private gambleBtn: Button;
  private infoBtn: Button;
  private stageLayer = new Container();
  private infoLayer: Container | null = null;
  private spec: Spec = WIDE;
  private applied: Spec | null = null;
  private phase: Phase = 'idle';
  private bets: number[];
  private betIndex = 0;
  private stakeWatch: StakeWatch;
  private calm = reducedMotion();
  private time = 0;
  private litHand: Hand | null = null;
  private blink = false;

  // The running round.
  private deck: number[] = [];
  private hand: number[] = [];
  private stake = 0;
  private amount = 0;
  private finalHand: Hand = 'none';
  private gambles = 0;
  private gambleWon = false;
  private gambleDeck: number[] = [];

  private keyHandler = (e: KeyboardEvent) => {
    if (this.infoLayer) {
      if (e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault();
        this.closeInfo();
      }
      return;
    }
    if (document.activeElement instanceof HTMLButtonElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.main();
    } else if (/^Digit[1-5]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (this.cards[i]?.canTap()) this.cards[i].onTap();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.view.addChild(this.root);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.tint = COLORS.cyan;
    halo.alpha = 0.12;
    halo.blendMode = 'add';
    halo.label = 'halo';
    this.root.addChild(halo, this.bg, this.payLayer);
    this.title = glowText('FALTER-POKER', { fontFamily: FONT_DISPLAY, fontSize: 40, fill: 0xfff6e6, letterSpacing: 4 }, { color: COLORS.cyan, distance: 14, outerStrength: 2 });
    this.root.addChild(this.title);

    for (const hand of PAY_ROWS) {
      const c = new Container();
      const lit = new Sprite(rowLitTexture());
      lit.alpha = 0;
      const royal = hand === 'royal';
      const style = (align: 'left' | 'right') => ({ fontFamily: FONT_BODY, fontWeight: '700' as const, fontSize: 24, fill: royal ? 0xff8ab8 : 0xf2e6c9, align });
      const name = new Text({ text: HAND_NAME[hand].toUpperCase(), style: style('left') });
      const mult = new Text({ text: `${PAY[hand]}×`, style: style('right') });
      const amount = new Text({ text: '', style: style('right') });
      name.anchor.set(0, 0.5);
      mult.anchor.set(1, 0.5);
      amount.anchor.set(1, 0.5);
      c.addChild(lit, name, mult, amount);
      this.payLayer.addChild(c);
      this.rows.push({ hand, c, lit, name, mult, amount });
    }

    this.msg = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 32, fill: COLORS.lamp, letterSpacing: 2, align: 'center' } });
    this.msg.anchor.set(0.5);
    this.sub = new Text({ text: '', style: { fontFamily: FONT_BODY, fontWeight: '600', fontSize: 24, fill: 0xe6d6b4, align: 'center' } });
    this.sub.anchor.set(0.5);
    this.root.addChild(this.msg, this.sub);

    for (let i = 0; i < 5; i++) {
      const cv = new CardView(this.calm, i);
      cv.onTap = () => this.tapCard(i);
      cv.canTap = () => this.phase === 'hold' || (this.phase === 'gamble' && i > 0);
      this.cards.push(cv);
      this.root.addChild(cv.root);
    }

    this.rtpText = new Text({ text: `Auszahlungsquote ${pct(RTP)} % · Hausvorteil ${pct(1 - RTP)} %\nbei bester Spielweise`, style: { fontFamily: FONT_BODY, fontSize: 23, fontWeight: '600', fill: 0xe6d6b4, align: 'center' } });
    this.rtpText.anchor.set(0.5);
    this.betLabel = label('EINSATZ', 19, 0xd9c6a0);
    this.betLabel.anchor.set(0.5);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 56, height: 56, onClick: () => this.changeBet(-1) });
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 56, height: 56, onClick: () => this.changeBet(1) });
    this.dealBtn = button({ label: 'GEBEN', width: 230, height: 86, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 30, onClick: () => this.main() });
    this.gambleBtn = button({ label: 'DOPPELN', width: 200, height: 70, color: 0x6b1a4a, textColor: 0xfff1c4, fontSize: 24, onClick: () => void this.startGamble() });
    this.infoBtn = button({ label: '?', ariaLabel: "So geht's", width: 52, height: 52, color: 0x2a4a50, textColor: 0xfff1c4, fontSize: 28, onClick: () => this.openInfo() });
    this.root.addChild(this.rtpText, this.betLabel, this.betText, this.minus, this.plus, this.gambleBtn, this.dealBtn, this.infoBtn, this.stageLayer);
    this.gambleBtn.visible = false;

    this.changeBet(0);
    this.setMessage('FALTER-POKER', 'Gewinn ab einem Paar Buben · tippe GEBEN');
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Layout ----------------------------------------------------------------------------

  private applySpec(sp: Spec) {
    this.spec = sp;
    this.bg.texture = machineTexture(sp);
    this.bg.position.set(-24, -24);
    const halo = this.root.getChildByLabel('halo') as Sprite;
    halo.position.set(sp.W / 2, sp.H / 2);
    halo.width = sp.W * 1.6;
    halo.height = sp.H * 1.4;
    this.title.position.set(sp.key === 'tall' ? sp.W / 2 - 20 : sp.W / 2, sp.key === 'short' ? 40 : 44);
    const p = sp.pay;
    this.rows.forEach((r, i) => {
      r.c.position.set(p.x, p.y + 12 + i * p.row);
      r.lit.width = p.w - 12;
      r.lit.height = p.row - 2;
      r.lit.position.set(6, 1);
      for (const t of [r.name, r.mult, r.amount]) {
        t.style.fontSize = p.font;
        t.y = p.row / 2 + 1;
      }
      r.name.x = 18;
      r.mult.x = p.w * 0.66;
      r.amount.x = p.w - 18;
      const maxName = r.mult.x - 70 - 18;
      r.name.scale.set(1);
      if (r.name.width > maxName) r.name.scale.set(maxName / r.name.width);
    });
    this.msg.position.set(sp.msgX, sp.msgY);
    this.sub.position.set(sp.msgX, sp.msgY + 38);
    this.cards.forEach((cv, i) => {
      cv.root.position.set(sp.cardX(i), sp.cardY);
      cv.root.scale.set(sp.cardScale);
    });
    this.rtpText.position.set(sp.rtpX, sp.rtpY);
    const b = sp.bet;
    const spread = sp.key === 'short' ? 76 : 92;
    this.minus.position.set(b.x - spread, b.y);
    this.plus.position.set(b.x + spread, b.y);
    this.betLabel.position.set(b.x, b.y - 18);
    this.betText.position.set(b.x, b.y + 10);
    this.gambleBtn.position.set(b.x, b.y);
    this.dealBtn.position.set(sp.deal.x, sp.deal.y);
    this.infoBtn.position.set(sp.info.x, sp.info.y);
    this.fitMessage();
  }

  resize(w: number, h: number) {
    const sp = w / h < 0.95 ? TALL : w / h > 1.8 ? SHORT : WIDE;
    if (sp !== this.applied) {
      this.applied = sp;
      this.applySpec(sp);
    }
    const s = Math.min((w * 0.97) / (sp.W + 20), (h * 0.96) / (sp.H + 20), 1.25);
    this.root.scale.set(s);
    this.root.position.set((w - sp.W * s) / 2, (h - sp.H * s) / 2);
    if (this.infoLayer) this.layoutInfo();
  }

  // ---- Bets and messages -----------------------------------------------------------------

  private changeBet(d: number) {
    if (this.phase !== 'idle') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.betText.scale.set(Math.min(1, 110 / Math.max(1, this.betText.width / this.betText.scale.x)));
    this.minus.setEnabled(this.betIndex > 0);
    this.plus.setEnabled(this.betIndex < this.bets.length - 1);
    this.updateAmounts();
  }

  private updateAmounts() {
    const b = this.phase === 'idle' ? this.bet : this.stake;
    for (const r of this.rows) r.amount.text = formatChips(b * PAY[r.hand]);
  }

  private setMessage(msg: string, sub = '') {
    this.msg.text = msg;
    this.sub.text = sub;
    this.fitMessage();
    if (!this.calm && msg) {
      this.msg.scale.set(this.msg.scale.x * 0.85);
      const s = this.msg.scale.x / 0.85;
      void tween(this.msg.scale, { x: s, y: s }, 240, ease.outBack);
    }
  }

  private fitMessage() {
    const max = this.spec.msgW;
    for (const t of [this.msg, this.sub]) {
      t.scale.set(1);
      if (t.width > max) t.scale.set(max / t.width);
    }
  }

  private light(hand: Hand | null, blink = false) {
    this.litHand = hand;
    this.blink = blink;
    for (const r of this.rows) {
      const on = r.hand === hand;
      void tween(r.lit, { alpha: on ? 1 : 0 }, 160);
      const col = on ? 0x1a0610 : r.hand === 'royal' ? 0xff8ab8 : 0xf2e6c9;
      for (const t of [r.name, r.mult, r.amount]) t.style.fill = col;
    }
  }

  private setControls() {
    const p = this.phase;
    const betting = p === 'idle';
    this.minus.visible = this.plus.visible = this.betText.visible = this.betLabel.visible = p !== 'won' && p !== 'gamble';
    this.minus.setEnabled(betting && this.betIndex > 0);
    this.plus.setEnabled(betting && this.betIndex < this.bets.length - 1);
    this.gambleBtn.visible = p === 'won';
    this.gambleBtn.setEnabled(p === 'won' && this.gambles < MAX_GAMBLES);
    this.dealBtn.setLabel(p === 'hold' || p === 'drawing' ? 'ZIEHEN' : p !== 'idle' && this.amount > 0 ? 'NEHMEN' : 'GEBEN');
    this.dealBtn.setEnabled(p === 'idle' || p === 'hold' || p === 'won');
    for (const c of this.cards) c.refresh();
  }

  // ---- Round -----------------------------------------------------------------------------

  /** The big button / Space: deal, draw or take the win. */
  private main() {
    if (this.phase === 'idle') void this.deal();
    else if (this.phase === 'hold') void this.draw();
    else if (this.phase === 'won') void this.collect();
  }

  private async deal() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    // The whole round is decided here: one shuffled deck, the first five dealt, the draws next.
    this.deck = shuffledDeck();
    this.hand = this.deck.slice(0, 5);
    this.stake = bet;
    this.gambles = 0;
    this.gambleWon = false;
    this.phase = 'dealing';
    this.setControls();
    this.updateAmounts();
    this.light(null);
    this.setMessage('', '');
    this.ctx.sfx.whoosh();
    await Promise.all(this.cards.map((c) => {
      c.setGlow(false);
      c.dim(false);
      if (c.held) c.setHeld(false);
      return c.hide(180);
    }));
    await Promise.all(this.hand.map((card, i) => wait(i * 85).then(() => {
      this.ctx.sfx.pokerCard(i);
      return this.cards[i].show(card, 300);
    })));
    if (this.view.destroyed) return;
    const now = evaluate(this.hand);
    this.phase = 'hold';
    this.light(now === 'none' ? null : now);
    this.setMessage(now === 'none' ? 'KARTEN HALTEN' : HAND_NAME[now].toUpperCase(), now === 'none' ? 'Tippe die Karten, die bleiben sollen – dann ZIEHEN' : 'Schon auf der Hand – halten und ZIEHEN');
    this.setControls();
  }

  private tapCard(i: number) {
    if (this.phase === 'gamble') {
      void this.pickGamble(i);
      return;
    }
    if (this.phase !== 'hold') return;
    const cv = this.cards[i];
    cv.setHeld(!cv.held);
    this.ctx.sfx.pokerHold(cv.held);
  }

  private async draw() {
    this.phase = 'drawing';
    this.setControls();
    let next = 5;
    const swaps: [number, number][] = [];
    this.cards.forEach((c, i) => {
      if (!c.held) swaps.push([i, this.deck[next++]]);
    });
    for (const [i, card] of swaps) this.hand[i] = card;
    if (swaps.length) this.ctx.sfx.whoosh();
    await Promise.all(swaps.map(([i], k) => wait(k * 60).then(() => this.cards[i].hide(170))));
    await Promise.all(swaps.map(([i, card], k) => wait(k * 95).then(() => {
      this.ctx.sfx.pokerCard(k);
      return this.cards[i].show(card, 300);
    })));
    if (this.view.destroyed) return;
    for (const c of this.cards) if (c.held) c.setHeld(false);
    const hand = evaluate(this.hand);
    this.finalHand = hand;
    const mult = PAY[hand];
    this.amount = this.stake * mult;
    if (mult === 0) {
      this.light(null);
      this.setMessage('KEIN GEWINN', 'Nächste Runde: GEBEN');
      this.ctx.sfx.lose();
      this.settle(0);
      return;
    }
    this.light(hand, true);
    const scoring = scoringCards(this.hand, hand);
    this.cards.forEach((c, i) => {
      c.setGlow(scoring.includes(i));
      c.dim(!scoring.includes(i));
    });
    this.setMessage(HAND_NAME[hand].toUpperCase(), `Gewinn ${formatChips(this.amount)} Falter · NEHMEN oder DOPPELN`);
    const mid = this.root.toGlobal({ x: this.spec.msgX, y: this.spec.cardY });
    if (mult > 1) this.ctx.celebrate(mult, mid.x, mid.y, { x: mid.x, y: mid.y, r: 260 * this.root.scale.x });
    else this.ctx.sfx.partial();
    const level = rewardLevel(mult);
    if (level === 2) void lightWave(this.stageLayer, this.spec.msgX - 340, this.spec.cardY - 120, 680, 240, COLORS.lamp);
    if (level >= 3) {
      this.phase = 'busy';
      this.setControls();
      if (hand === 'royal') await this.royalMoment();
      const sp = this.spec;
      await winStage(this.stageLayer, {
        x: 20,
        y: 20,
        w: sp.W - 40,
        h: sp.H - 40,
        title: hand === 'royal' ? 'ROYAL FLUSH' : HAND_NAME[hand].toUpperCase(),
        sub: `×${mult} Einsatz`,
        amount: this.amount,
        accent: hand === 'royal' ? COLORS.neon : level === 4 ? COLORS.lamp : COLORS.cyan,
        durationMs: hand === 'royal' ? 3200 : level === 4 ? 2500 : 2000,
        onTick: () => this.ctx.sfx.tick(),
      });
      if (this.view.destroyed) return;
    }
    this.phase = 'won';
    this.setControls();
  }

  /** Royal Flush: the five cards rise one by one into a fan under a full moon of light. */
  private async royalMoment() {
    if (this.calm) return;
    const sp = this.spec;
    const moon = new Sprite(glowTexture());
    moon.anchor.set(0.5);
    moon.position.set(sp.msgX, sp.cardY);
    moon.tint = 0xfff1c4;
    moon.blendMode = 'add';
    moon.width = moon.height = 40;
    moon.alpha = 0;
    this.root.addChildAt(moon, this.root.getChildIndex(this.cards[0].root));
    void tween(moon, { width: 900, height: 700, alpha: 0.9 }, 900, ease.outCubic);
    const base = this.cards.map((c) => ({ x: c.root.x, y: c.root.y, r: c.root.rotation }));
    for (let i = 0; i < 5; i++) {
      const c = this.cards[i].root;
      this.ctx.sfx.pokerCard(i + 3);
      void tween(c, { y: base[i].y - 26, rotation: (i - 2) * 0.09 }, 260, ease.outBack);
      void tween(c, { x: sp.msgX + (i - 2) * (sp.cardX(1) - sp.cardX(0)) * 0.8 }, 260, ease.outCubic);
      await wait(150);
    }
    await wait(700);
    await Promise.all(this.cards.map((cv, i) => tween(cv.root, { x: base[i].x, y: base[i].y, rotation: 0 }, 320, ease.inOutCubic)));
    void tween(moon, { alpha: 0 }, 600).then(() => moon.destroy());
  }

  private async collect() {
    if (this.phase !== 'won') return;
    const win = this.amount;
    const mult = win / this.stake;
    this.phase = 'busy';
    // A gambled-up win gets its own celebration; a plain one already had it at the draw.
    const mid = this.root.toGlobal(this.spec.deal);
    if (this.gambleWon && mult > 1) this.ctx.celebrate(mult, mid.x, mid.y);
    else for (let i = 0; i < Math.min(6, 2 + Math.round(mult)); i++) this.ctx.sfx.coin(i * 0.06);
    const local = this.view.toLocal(mid);
    floatText(this.view, local.x, local.y - 70 * this.root.scale.x, `+${formatChips(win)}`, COLORS.lamp, Math.round(34 * Math.max(0.7, this.root.scale.x)));
    this.setMessage(this.gambleWon ? 'GEDOPPELT!' : HAND_NAME[this.finalHand].toUpperCase(), `${formatChips(win)} Falter eingestrichen`);
    this.settle(win);
  }

  /** Ends the round: pays, reports once, back to betting. */
  private settle(win: number) {
    if (win > 0) this.ctx.state.payout(win);
    const tags = ['poker'];
    const h = this.finalHand;
    if (h === 'jacks' || h === 'twoPair') tags.push('pair');
    if (h === 'flush' || h === 'straightFlush' || h === 'royal') tags.push('flush');
    if (h === 'royal') tags.push('royal');
    if (this.gambles > 0) tags.push('gamble');
    if (this.gambleWon) tags.push('gambleWin');
    this.ctx.state.report({ game: 'poker', stake: this.stake, win, rtp: RTP, tags });
    this.phase = 'idle';
    this.amount = 0;
    this.light(win > 0 ? this.litHand : null);
    this.blink = false;
    this.cards.forEach((c) => c.setGlow(false));
    this.setControls();
    this.updateAmounts();
  }

  // ---- Doppeln ---------------------------------------------------------------------------

  private async startGamble() {
    if (this.phase !== 'won' || this.gambles >= MAX_GAMBLES) return;
    this.phase = 'busy';
    this.setControls();
    this.gambleDeck = shuffledDeck();
    const bank = this.gambleDeck[0];
    this.light(null);
    this.cards.forEach((c) => {
      c.setGlow(false);
      c.dim(false);
    });
    await Promise.all(this.cards.map((c, i) => wait(i * 50).then(() => c.hide(200))));
    if (this.view.destroyed) return;
    this.ctx.sfx.pokerCard(0);
    await this.cards[0].show(bank, 320);
    this.cards[0].setHeld(true, 'BANK');
    this.phase = 'gamble';
    this.setMessage('DOPPELN', `${formatChips(this.amount)} → ${formatChips(Math.floor(this.amount * GAMBLE_PAY))}: wähle eine Karte, höher als die Bank`);
    this.setControls();
  }

  private async pickGamble(i: number) {
    if (this.phase !== 'gamble' || i === 0) return;
    this.phase = 'busy';
    this.setControls();
    this.gambles++;
    const bank = this.gambleDeck[0];
    // The picked slot gets the next card of the shuffled deck, the others show what lay there.
    const order = [0, 1, 2, 3, 4].filter((k) => k > 0 && k !== i);
    const mine = this.gambleDeck[1];
    const result = gambleResult(bank, mine);
    this.cards[i].setHeld(true, 'DEINE');
    this.ctx.sfx.pokerHold(true);
    await wait(120);
    await this.cards[i].show(mine, 420);
    if (this.view.destroyed) return;
    void Promise.all(order.map((k, n) => wait(250 + n * 80).then(() => {
      this.cards[k].dim(true);
      return this.cards[k].show(this.gambleDeck[2 + n], 260);
    })));
    const mid = this.root.toGlobal({ x: this.spec.cardX(i), y: this.spec.cardY });
    if (result > 0) {
      this.amount = Math.floor(this.amount * GAMBLE_PAY);
      this.gambleWon = true;
      this.cards[i].setGlow(true);
      this.ctx.sfx.win();
      this.ctx.particles.sparkle(mid.x, mid.y, 14, COLORS.lamp, 160);
      this.setMessage('HÖHER – GEWONNEN!', `Jetzt ${formatChips(this.amount)} Falter · NEHMEN oder nochmal DOPPELN`);
    } else if (result === 0) {
      this.ctx.sfx.partial();
      this.setMessage('GLEICH – UNENTSCHIEDEN', `Es bleiben ${formatChips(this.amount)} Falter`);
    } else {
      this.ctx.sfx.lose();
      this.ctx.particles.sparkle(mid.x, mid.y, 6, 0xb69a6a, 60);
      this.setMessage('TIEFER – VERLOREN', 'Der Gewinn bleibt bei der Bank. Nächste Runde: GEBEN');
      await wait(500);
      this.amount = 0;
      this.cards[0].setHeld(false);
      this.cards[i].setHeld(false);
      this.settle(0);
      return;
    }
    await wait(600);
    if (this.view.destroyed) return;
    this.cards[0].setHeld(false);
    this.cards[i].setHeld(false);
    this.phase = 'won';
    this.setControls();
    if (this.gambles >= MAX_GAMBLES) this.sub.text = `${formatChips(this.amount)} Falter · genug gedoppelt – NEHMEN`;
  }

  // ---- Rules panel -----------------------------------------------------------------------

  private openInfo() {
    if (this.infoLayer) return;
    const layer = new Container();
    const veil = new Graphics();
    veil.eventMode = 'static';
    veil.on('pointertap', () => this.closeInfo());
    layer.addChild(veil);
    const box = new Container();
    const lines = [
      "SO GEHT'S",
      '',
      '1. Einsatz wählen, GEBEN: du bekommst fünf Karten.',
      '2. Tippe die Karten an, die du HALTEN willst (oder Tasten 1–5).',
      '3. ZIEHEN: alle anderen werden einmal ersetzt.',
      '4. Gewertet wird die Hand nach der Tabelle – ab einem Paar Buben.',
      '',
      'Nach einem Gewinn: NEHMEN oder DOPPELN. Beim Doppeln zieht die Bank',
      'eine Karte, du wählst eine verdeckte: höher zahlt 1,9×, gleich bleibt,',
      `tiefer verliert (Auszahlungsquote dort ${pct(GAMBLE_RTP)} %, höchstens ${MAX_GAMBLES}× in Folge).`,
      '',
      `Auszahlungsquote ${pct(RTP)} % bei bester Spielweise, Hausvorteil ${pct(1 - RTP)} %.`,
      'Buben, Damen, Könige: B, D, K. Ass zählt hoch und in A-2-3-4-5.',
    ];
    const head = new Text({ text: lines[0], style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: COLORS.lamp, letterSpacing: 2 } });
    const text = new Text({ text: lines.slice(2).join('\n'), style: { fontFamily: FONT_BODY, fontSize: 23, fontWeight: '600', fill: 0xf2e6c9, lineHeight: 30 } });
    head.position.set(44, 36);
    text.position.set(44, 86);
    const bw = Math.round(text.width + 88);
    const bh = Math.round(text.height + 128);
    const panel = new Sprite(panelTexture(bw, bh));
    panel.position.set(-PANEL_PAD, -PANEL_PAD);
    box.addChild(panel, head, text);
    const close = closeKnob(() => this.closeInfo(), 48);
    close.position.set(bw - 34, 34);
    box.addChild(close);
    box.eventMode = 'static';
    layer.addChild(box);
    this.infoLayer = layer;
    this.view.addChild(layer);
    this.layoutInfo();
    layer.alpha = 0;
    void tween(layer, { alpha: 1 }, 180);
  }

  private layoutInfo() {
    const layer = this.infoLayer!;
    const veil = layer.children[0] as Graphics;
    const box = layer.children[1] as Container;
    const s = this.root.scale.x;
    const w = this.spec.W * s + this.root.x * 2;
    const h = this.spec.H * s + this.root.y * 2;
    veil.clear().rect(0, 0, w, h).fill({ color: 0x05020a, alpha: 0.6 });
    box.scale.set(1);
    const k = Math.min(1.1, (w * 0.94) / box.width, (h * 0.94) / box.height);
    box.scale.set(k);
    box.position.set((w - box.width) / 2, (h - box.height) / 2);
  }

  private closeInfo() {
    const l = this.infoLayer;
    if (!l) return;
    this.infoLayer = null;
    void tween(l, { alpha: 0 }, 140).then(() => l.destroy({ children: true }));
  }

  // ---- Frame -----------------------------------------------------------------------------

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    this.time += dtMs / 1000;
    if (this.blink && this.litHand) {
      const r = this.rows.find((x) => x.hand === this.litHand);
      if (r) r.lit.alpha = this.calm ? 1 : 0.7 + 0.3 * Math.sin(this.time * 9);
    }
    for (const c of this.cards) c.pulse(this.time);
  }

  busy() {
    return this.phase !== 'idle';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

export const poker: GameDefinition = {
  id: 'poker',
  name: 'Falter-Poker',
  houseEdge: 1 - RTP,
  footprint: { w: STATION_W, h: STATION_H },
  size: 'cabinet',
  blurb: 'Fünf Karten, halten, einmal ziehen – ab Buben-Paar zahlt der Automat.',
  drawStation: () => pokerStation(),
  create: (ctx) => new PokerGame(ctx),
};
