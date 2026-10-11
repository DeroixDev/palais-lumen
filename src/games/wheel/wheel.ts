// "Großes Rad": a money wheel on a little velvet stage. Bet on one or more fields (×1 … ×20),
// the wheel turns, a leather clicker snaps over the pegs and wobbles, and the bulbs round the
// rim chase. Three Bonus segments start the small wheel, which picks a field and pays its
// bonus rate. The segment is drawn first, then the wheel is turned to stop on it.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, banner, coinTexture, floatText, glowTexture, reducedMotion, rewardLevel, shake } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { light } from '../../world/painted/brush';
import { SceneShell, type Layout } from '../sceneShell';
import { barSize, layoutBar } from '../barLayout';
import { lightWave, winStage } from '../slots/stage';
import { BONUS_PAY, BONUS_WHEEL, BRAKE_MAX, BRAKE_MIN, COUNT, FIELDS, FIELD_RTP, PAY, SEGMENTS, brakeRtp, brakeSpin, payout, spin, type BrakeResult, type Field, type SpinResult } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import {
  BR,
  BULB_R,
  FIELD_COLOR,
  FIELD_LABEL,
  R,
  bonusWheelTexture,
  clickerTexture,
  drawWheelStation,
  plaqueTexture,
  stageTexture,
  wedgeTexture,
  wheelTexture,
  type StageLayout,
} from './paint';
import { luckDraw } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const CHIPS = [10, 20, 50, 100, 200, 500];
const SEG = (Math.PI * 2) / SEGMENTS;
const CREAM = 0xfff3dc;
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

const RULES = [
  'Setze auf ein oder mehrere Felder und dreh das Rad. Hält der Zeiger auf deinem Feld, zahlt es seine Zahl zu 1: ×1 zahlt 1:1, ×20 zahlt 20:1 – der Einsatz kommt dazu zurück.',
  '',
  `Auf dem Rad: ${FIELDS.map((f) => `${COUNT[f]}× ${FIELD_LABEL[f]}`).join(', ')} und ${COUNT.bonus}× Bonus – ${SEGMENTS} gleich große Felder.`,
  '',
  `Bonus: Das kleine Rad dreht sich und wählt ein Feld. Wer darauf gesetzt hat, bekommt den Bonus-Satz: ${FIELDS.map((f) => `${FIELD_LABEL[f]} ${BONUS_PAY[f]}:1`).join(', ')}.`,
  '',
  `Auszahlungsquote je Feld: ${FIELDS.map((f) => `${FIELD_LABEL[f]} ${pct(FIELD_RTP[f])}\u00a0%`).join(' · ')}. Wo das Rad hält, entscheidet allein der Zufall.`,
].join('\n');

interface Tile {
  f: Field;
  c: Container;
  bg: Sprite;
  glow: Sprite;
  chips: Container;
  w: number;
  h: number;
  focus: FocusHandle;
}

class WheelGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  private stageTex: Texture | null = null;
  private stage = new Sprite();
  private layer = new Container();
  // Main wheel (wheel units, scaled into the scene).
  private wheel = new Container();
  private rotor = new Container();
  private halo = new Sprite(glowTexture());
  private wedge = new Sprite();
  private bulbs: Sprite[] = [];
  private clicker = new Sprite(clickerTexture());
  private clickAngle = 0;
  private clickVel = 0;
  private lastCross = 0;
  private lastClickSound = 0;
  // Bonus wheel.
  private bonus = new Container();
  private bonusRotor = new Container();
  private bonusWedge = new Sprite();
  private bonusPointer = new Graphics();
  private bonusCaption!: Text;
  private bonusHalo = new Sprite(glowTexture());
  private dim = new Graphics();
  private bonusHome = { x: 0, y: 0, s: 1, hidden: false };
  private wr = 100;
  private tiles: Tile[] = [];
  private tileLayer = new Container();

  private bets = new Map<Field, number>();
  private lastBets = new Map<Field, number>();
  private chips: number[];
  private chipIndex = 0;
  private spinning = false;
  private winColor = 0;
  private time = 0;
  private calm = reducedMotion();
  private stakeWatch: StakeWatch;
  private sceneW = 600;
  private sceneH = 400;
  private odds: OddsWatch;
  private rtpText!: Text;
  /** Widest the payout line may get in the bar (from its layout). */
  private rtpMaxW = 0;

  private minus!: Button;
  private plus!: Button;
  private chipText!: Text;
  private clearBtn!: Button;
  private spinBtn!: Button;

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.spinRound();
    }
  };

  constructor(private ctx: GameContext) {
    this.chips = ctx.state.stakes(CHIPS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'wheel', ['radbremse']);
    this.shell = new SceneShell({
      title: 'GROSSES RAD',
      accent: 0xff5fa2,
      rules: RULES,
      odds: () => (this.odds.id ? this.brakeLine : ''),
      ctrlSize: barSize,
      buildControls: (c, w, h, layout, fs) => this.buildControls(c, w, h, layout, fs),
      layoutScene: (w, h, layout) => this.layoutScene(w, h, layout === 'tall'),
    });
    this.view.addChild(this.shell.board);
    this.shell.scene.addChild(this.layer);
    this.buildWheel();
    this.buildBonus();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Build -----------------------------------------------------------------------------------------

  private buildWheel() {
    this.halo.anchor.set(0.5);
    this.halo.width = this.halo.height = R * 3;
    this.halo.tint = COLORS.lamp;
    this.halo.alpha = 0.25;
    this.halo.blendMode = 'add';
    const face = new Sprite(wheelTexture());
    face.anchor.set(0.5);
    this.wedge.texture = wedgeTexture(SEGMENTS, 70, R - 30);
    this.wedge.anchor.set(0.5);
    this.wedge.blendMode = 'add';
    this.wedge.alpha = 0;
    this.rotor.addChild(face, this.wedge);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = -Math.PI / 2 + (i + 0.5) * SEG;
      const b = new Sprite(glowTexture());
      b.anchor.set(0.5);
      b.position.set(Math.cos(a) * BULB_R, Math.sin(a) * BULB_R);
      b.width = b.height = 46;
      b.tint = 0xffe2a0;
      b.blendMode = 'add';
      this.rotor.addChild(b);
      this.bulbs.push(b);
    }
    // Clicker hangs from above the rim, its tip between the pegs.
    this.clicker.anchor.set(30 / 60, 20 / 84);
    this.clicker.position.set(0, -R - 14);
    this.clicker.scale.set(1.7);
    this.wheel.addChild(this.halo, this.rotor, this.clicker);
  }

  private buildBonus() {
    const face = new Sprite(bonusWheelTexture());
    face.anchor.set(0.5);
    this.bonusWedge.texture = wedgeTexture(BONUS_WHEEL.length, 26, BR - 12);
    this.bonusWedge.anchor.set(0.5);
    this.bonusWedge.blendMode = 'add';
    this.bonusWedge.alpha = 0;
    this.bonusRotor.addChild(face, this.bonusWedge);
    this.bonusHalo.anchor.set(0.5);
    this.bonusHalo.width = this.bonusHalo.height = BR * 3.2;
    this.bonusHalo.tint = 0xe0b25a;
    this.bonusHalo.blendMode = 'add';
    this.bonusHalo.alpha = 0.15;
    this.bonusPointer.moveTo(-12, -BR - 14).lineTo(12, -BR - 14).lineTo(0, -BR + 10).closePath().fill(0xa8321e).stroke({ color: 0x160a10, width: 3 });
    this.bonusPointer.circle(0, -BR - 14, 7).fill(COLORS.brass).stroke({ color: 0x160a10, width: 2 });
    this.bonusCaption = new Text({ text: 'BONUSRAD', style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xffcf7a, stroke: { color: 0x14080f, width: 5 }, letterSpacing: 2 } });
    this.bonusCaption.anchor.set(0.5, 1);
    this.bonusCaption.position.set(0, -BR - 26);
    this.bonus.addChild(this.bonusHalo, this.bonusRotor, this.bonusPointer, this.bonusCaption);
    this.bonusRotor.rotation = -0.5 * ((Math.PI * 2) / BONUS_WHEEL.length);
  }

  // ---- Layout ----------------------------------------------------------------------------------------

  private layoutScene(sw: number, sh: number, tall: boolean) {
    this.sceneW = sw;
    this.sceneH = sh;
    let L: StageLayout;
    let tileRect: { x: number; y: number; w: number; h: number };
    let bonusPos: { x: number; y: number; r: number; hidden: boolean };
    if (tall) {
      const wr = Math.min(sw * 0.42, sh * 0.3);
      const wy = wr + Math.max(34, sh * 0.07) + 14;
      const floorY = Math.min(sh - 120, wy + wr + 26);
      L = { wx: sw / 2, wy, wr, floorY };
      tileRect = { x: 8, y: floorY + 12, w: sw - 16, h: Math.min(130, sh - floorY - 20) };
      bonusPos = { x: sw / 2, y: wy, r: wr * 0.86, hidden: true };
    } else {
      const floorY = sh - Math.max(36, sh * 0.1);
      // Room above for the clicker, below for the stand.
      const wr = Math.min(sw * 0.24, (floorY - 30 - 30) / 2);
      const wy = floorY - wr - 30;
      const wx = Math.max(wr + 70, sw * 0.27);
      L = { wx, wy, wr, floorY };
      const rx0 = wx + wr + 40;
      const rx1 = sw - 70;
      const th = Math.min(150, sh * 0.34);
      tileRect = { x: rx0, y: floorY - th - 10, w: rx1 - rx0, h: th };
      const space = tileRect.y - 40;
      const r = Math.max(50, Math.min(space / 2 - 16, (rx1 - rx0) * 0.22));
      bonusPos = { x: (rx0 + rx1) / 2, y: 44 + space / 2 + 10, r, hidden: false };
    }
    this.wr = L.wr;
    this.stageTex?.destroy(true);
    this.stageTex = stageTexture(sw, sh, L, Math.min(2, Math.max(1.25, window.devicePixelRatio || 1)));
    this.stage.texture = this.stageTex;
    this.wheel.position.set(L.wx, L.wy);
    this.wheel.scale.set(L.wr / R);
    this.bonusHome = { x: bonusPos.x, y: bonusPos.y, s: bonusPos.r / BR, hidden: bonusPos.hidden };
    this.bonus.position.set(bonusPos.x, bonusPos.y);
    this.bonus.scale.set(bonusPos.r / BR);
    this.bonus.visible = !bonusPos.hidden;
    this.bonusCaption.style.fontSize = Math.round(Math.max(22, this.shell.fs(15) / this.bonus.scale.x));
    this.dim.clear().rect(0, 0, sw, sh).fill({ color: 0x0a0410, alpha: 0.6 });
    this.dim.alpha = 0;
    this.dim.eventMode = 'none';
    this.layer.removeChildren();
    this.layer.addChild(this.stage, this.wheel, this.tileLayer, this.dim, this.bonus);
    this.buildTiles(tileRect, tall);
  }

  private buildTiles(r: { x: number; y: number; w: number; h: number }, tall: boolean) {
    this.tileLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.tiles = [];
    const gap = tall ? 6 : 12;
    const w = Math.floor(Math.min(150, (r.w - gap * 4) / 5));
    const h = Math.floor(r.h);
    const x0 = r.x + (r.w - (w * 5 + gap * 4)) / 2;
    const fs = this.shell.fs;
    FIELDS.forEach((f, i) => {
      const c = new Container();
      c.position.set(x0 + i * (w + gap), r.y);
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(w / 2, h / 2);
      glow.width = w * 2;
      glow.height = h * 1.6;
      glow.tint = FIELD_COLOR[f];
      glow.blendMode = 'add';
      glow.alpha = 0;
      const bg = new Sprite(plaqueTexture(f, w, h));
      bg.position.set(-8, -8);
      const big = new Text({ text: FIELD_LABEL[f], style: { fontFamily: FONT_DISPLAY, fontSize: fs(Math.min(30, w * 0.36)), fill: CREAM, stroke: { color: 0x14080f, width: 5 } } });
      big.anchor.set(0.5);
      big.position.set(w / 2, h * 0.2);
      if (big.width > w - 10) big.scale.set((w - 10) / big.width);
      const sub = new Text({
        text: tall ? `${PAY[f]}:1\nBonus ${BONUS_PAY[f]}:1` : `zahlt ${PAY[f]}:1\nBonus ${BONUS_PAY[f]}:1`,
        style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '700', fill: 0xfff0d8, align: 'center', lineHeight: fs(16) },
      });
      sub.anchor.set(0.5, 0);
      sub.position.set(w / 2, h * 0.36);
      if (sub.width > w - 8) sub.scale.set((w - 8) / sub.width);
      const chips = new Container();
      chips.position.set(w / 2, h * 0.82);
      c.addChild(glow, bg, big, sub, chips);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= w && y >= 0 && y <= h };
      c.on('pointertap', () => this.addBet(f));
      const focus = focusable(c, {
        label: () => `Setzen auf ${FIELD_LABEL[f]}, zahlt ${PAY[f]} zu 1${this.bets.get(f) ? `, gesetzt ${formatChips(this.bets.get(f)!)}` : ''}`,
        rect: { x: 0, y: 0, w, h },
        radius: 14,
      });
      this.tileLayer.addChild(c);
      this.tiles.push({ f, c, bg, glow, chips, w, h, focus });
    });
    this.refreshBets();
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    const tall = layout === 'tall';
    const rtp = new Text({
      text: '',
      style: { fontFamily: FONT_BODY, fontSize: fs(tall ? 13 : 15), fontWeight: '600', fill: 0xbfa98a, lineHeight: fs(18) },
    });
    this.rtpText = rtp;
    this.rtpMaxW = 0;
    this.refreshRtp();
    const bar = layoutBar(c, width, height, layout, fs, {
      stepCaption: 'CHIP',
      onStep: (d) => this.changeChip(d),
      secCaption: 'EINSÄTZE',
      secondary: (w) => button({ label: 'Leeren', width: w, height: 52, color: 0x3a2030, textColor: CREAM, fontSize: fs(19), display: false, onClick: () => this.clearBets() }),
      main: (w, h, f) => button({ label: 'DREHEN', width: w, height: h, color: COLORS.brass, fontSize: f, onClick: () => void this.spinRound() }),
      rtp,
    });
    this.minus = bar.minus;
    this.plus = bar.plus;
    this.chipText = bar.text;
    this.clearBtn = bar.secondary;
    this.spinBtn = bar.main;
    this.rtpMaxW = rtp.width;
    this.changeChip(0);
  }

  /** Payout of the Radbremse for the bets on the table, for the rules card. */
  private brakeLine = '';

  /** The line under the controls (only with the Radbremse; the payout shares are in the rules card). */
  private refreshRtp() {
    const t = this.rtpText;
    if (!t || t.destroyed) return;
    const tall = this.shell.layout === 'tall';
    const sep = tall ? ' · ' : '\n';
    if (this.odds.id) {
      const bets = this.total > 0 ? this.bets : this.lastBets;
      const b = Object.fromEntries(bets) as Partial<Record<Field, number>>;
      const has = bets.size > 0;
      if (has) setItemRtp('wheel', 'radbremse', brakeRtp(b));
      // The exact share goes to the rules card (see `odds`), not on the table.
      this.brakeLine = has
        ? itemRtpText(brakeRtp(b), 'radbremse', 'deine Einsätze')
        : `Mit Radbremse: ein Feld allein ${pct(BRAKE_MIN)}–${pct(BRAKE_MAX)}\u00a0%, mehrere Felder: weniger (Bremse greift seltener)`;
      t.text = `Mit Radbremse${sep}am stärksten auf einem Feld allein`;
      t.style.fill = 0xffb8d8;
    } else {
      t.text = '';
      t.style.fill = 0xbfa98a;
    }
    // Keep inside the room the bar gave the line.
    if (this.rtpMaxW > 0) {
      const base = t.scale.x;
      const w = t.width / base;
      t.scale.set(Math.min(base, this.rtpMaxW / Math.max(1, w)) || base);
    }
  }


  // ---- Bets ------------------------------------------------------------------------------------------

  private get chip() {
    return this.chips[this.chipIndex];
  }

  private get total() {
    let s = 0;
    for (const v of this.bets.values()) s += v;
    return s;
  }

  private changeChip(d: number) {
    this.chipIndex = Math.max(0, Math.min(this.chips.length - 1, this.chipIndex + d));
    this.chipText.text = formatChips(this.chip);
    this.chipText.scale.set(Math.min(1, 84 / Math.max(1, this.chipText.width / this.chipText.scale.x)));
    this.minus.setEnabled(this.chipIndex > 0);
    this.plus.setEnabled(this.chipIndex < this.chips.length - 1);
    if (d) this.ctx.sfx.chip();
  }

  private addBet(f: Field) {
    if (this.spinning || this.shell.rulesOpen) return;
    if (this.total + this.chip > this.ctx.state.balance) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Chip.`);
      return;
    }
    this.bets.set(f, (this.bets.get(f) ?? 0) + this.chip);
    this.ctx.sfx.chip();
    this.refreshBets(f);
  }

  private clearBets() {
    if (this.spinning) return;
    this.bets.clear();
    this.refreshBets();
  }

  private refreshBets(pop?: Field) {
    for (const t of this.tiles) {
      t.chips.removeChildren().forEach((c) => c.destroy({ children: true }));
      const v = this.bets.get(t.f);
      t.focus.refresh();
      if (!v) continue;
      const size = Math.min(34, t.w * 0.42);
      const n = Math.max(1, Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, v / this.chips[0])))));
      for (let i = 0; i < n; i++) {
        const s = new Sprite(coinTexture());
        s.anchor.set(0.5);
        s.width = size;
        s.height = size * 0.62;
        s.position.set(-t.w * 0.18, -i * size * 0.13);
        t.chips.addChild(s);
      }
      const txt = new Text({ text: formatChips(v), style: { fontFamily: FONT_BODY, fontSize: this.shell.fs(17), fontWeight: '700', fill: CREAM, stroke: { color: 0x14080f, width: 4 } } });
      txt.anchor.set(0, 0.5);
      txt.position.set(-t.w * 0.18 + size * 0.55, -n * size * 0.06);
      if (txt.x + txt.width > t.w / 2 - 4) txt.scale.set(Math.max(0.6, (t.w / 2 - 4 - txt.x) / txt.width));
      t.chips.addChild(txt);
      if (pop === t.f && !this.calm) {
        t.chips.scale.set(1.3);
        void tween(t.chips.scale, { x: 1, y: 1 }, 240, ease.outBack);
      }
    }
    this.refreshButtons();
  }

  private refreshButtons() {
    if (!this.spinBtn) return;
    const total = this.total;
    let last = 0;
    for (const v of this.lastBets.values()) last += v;
    if (total > 0) this.spinBtn.setLabel(`DREHEN · ${formatChips(total)}`);
    else if (last > 0) this.spinBtn.setLabel(`NOCHMAL · ${formatChips(last)}`);
    else this.spinBtn.setLabel('FELD WÄHLEN');
    this.spinBtn.setEnabled(!this.spinning && (total > 0 || last > 0));
    this.clearBtn.setEnabled(!this.spinning && total > 0);
    if (!this.spinning) this.refreshRtp();
  }

  // ---- Round -----------------------------------------------------------------------------------------

  async spinRound() {
    if (this.spinning || this.shell.rulesOpen) return;
    if (this.total === 0 && this.lastBets.size > 0) {
      this.bets = new Map(this.lastBets);
      this.refreshBets();
    }
    const total = this.total;
    if (total === 0) {
      this.ctx.toast('Setz zuerst auf ein Feld.');
      return;
    }
    if (!this.ctx.state.placeBet(total)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL}.`);
      return;
    }
    this.spinning = true;
    this.lastBets = new Map(this.bets);
    this.refreshButtons();
    this.winColor = 0;
    this.wedge.alpha = 0;
    this.bonusWedge.alpha = 0;
    for (const t of this.tiles) t.glow.alpha = 0;

    // Result first, then the wheel is turned to stop on it. With the Radbremse the stop point
    // in the segment is part of the draw: just past the peg on a field without chips, it springs back.
    const bets = Object.fromEntries(this.bets) as Partial<Record<Field, number>>;
    const brake = this.odds.on('radbremse');
    const staked = FIELDS.reduce((a, f) => a + (bets[f] ?? 0), 0);
    const drawn = luckDraw(
      () => (brake ? brakeSpin(bets) : spin()),
      (x) => payout(bets, x) - staked,
    );
    const br: BrakeResult | null = brake ? (drawn as BrakeResult) : null;
    const r: SpinResult = drawn;
    this.brakeRound = brake ? brakeRtp(bets) : null;
    this.ctx.sfx.spinStart();
    if (br) {
      const at = Math.min(0.94, Math.max(0.06, br.u));
      await this.turnMain(br.first, at);
      if (br.sprang) await this.springBack(at);
    } else await this.turnMain(r.index);
    const seg = r.segment;
    this.showWedge(this.wedge, r.index, SEGMENTS, FIELD_COLOR[seg]);
    this.ctx.sfx.thud();
    this.shell.addHistory(seg === 'bonus' ? 'BONUS' : FIELD_LABEL[seg], FIELD_COLOR[seg], seg === 'bonus' ? 0x2a1406 : 0xfff3dc);
    if (seg === 'bonus') {
      this.ctx.sfx.medal();
      const b = this.view.toLocal(this.shell.scene.toGlobal({ x: this.sceneW / 2, y: this.sceneH * 0.3 }));
      void banner(this.view, 'BONUS!', 0xe0b25a, b.x, b.y, Math.min(520, this.sceneW * this.shell.s * 0.9));
      await wait(this.calm ? 300 : 700);
      await this.turnBonus(r);
    }
    await this.settle(r, total);
    this.spinning = false;
    this.bets.clear();
    this.refreshBets();
  }

  private brakeRound: number | null = null;

  /** Radbremse: the wheel stood just past the peg on a field without chips and springs back one. */
  private async springBack(at: number) {
    const from = this.rotor.rotation;
    const to = from - (1.12 - at) * SEG;
    const p = this.view.toLocal(this.clicker.getGlobalPosition());
    await wait(this.calm ? 150 : 350);
    void itemMoment(this.view, p.x, p.y + 70 * this.shell.s, 'radbremse', 'ZURÜCK!', Math.max(0.55, this.shell.s * 0.8));
    this.ctx.sfx.thud();
    await animate(this.calm ? 200 : 520, (k) => (this.rotor.rotation = from + (to - from) * k), ease.outBack);
    this.rotor.rotation = to;
  }

  private async turnMain(index: number, at?: number) {
    const u = at ?? 0.3 + Math.random() * 0.4;
    const now = this.rotor.rotation;
    let target = -(index + u) * SEG;
    const turns = this.calm ? 1 : 4 + Math.floor(Math.random() * 2);
    while (target < now + turns * Math.PI * 2) target += Math.PI * 2;
    const T = this.calm ? 1200 : 5200 + Math.random() * 900;
    const over = this.calm ? 0 : 0.14 * SEG;
    await animate(T, (k) => {
      this.rotor.rotation = now + (target + over - now) * (1 - Math.pow(1 - k, 3.4));
    });
    if (over) await animate(420, (k) => (this.rotor.rotation = target + over * (1 - ease.inOutCubic(k))));
    this.rotor.rotation = target;
  }

  private async turnBonus(r: SpinResult) {
    const n = BONUS_WHEEL.length;
    const seg = (Math.PI * 2) / n;
    // On phones the small wheel comes forward over the dimmed stage.
    if (this.bonusHome.hidden) {
      this.bonus.visible = true;
      this.bonus.alpha = 0;
      this.bonus.scale.set(this.bonusHome.s * 0.85);
      void tween(this.dim, { alpha: 1 }, 260);
      void tween(this.bonus, { alpha: 1 }, 220);
      await tween(this.bonus.scale, { x: this.bonusHome.s, y: this.bonusHome.s }, 320, ease.outBack);
    }
    this.bonusHalo.alpha = 0.6;
    const now = this.bonusRotor.rotation;
    let target = -(r.bonusIndex + 0.3 + Math.random() * 0.4) * seg;
    while (target < now + (this.calm ? 1 : 3) * Math.PI * 2) target += Math.PI * 2;
    let lastTick = Math.floor(now / seg);
    this.ctx.sfx.whoosh();
    await animate(this.calm ? 900 : 3200, (k) => {
      this.bonusRotor.rotation = now + (target - now) * (1 - Math.pow(1 - k, 3));
      const tick = Math.floor(this.bonusRotor.rotation / seg);
      if (tick !== lastTick) {
        lastTick = tick;
        this.ctx.sfx.tick();
      }
    });
    this.showWedge(this.bonusWedge, r.bonusIndex, n, FIELD_COLOR[r.field!]);
    this.ctx.sfx.thud();
    const p = this.view.toLocal(this.bonus.getGlobalPosition());
    floatText(this.view, p.x, p.y - 20, `${FIELD_LABEL[r.field!]} zahlt ${r.rate}:1`, 0xffcf7a, Math.round(26 * Math.max(0.8, this.shell.s)));
    await wait(this.calm ? 500 : 1300);
    if (this.bonusHome.hidden) {
      void tween(this.dim, { alpha: 0 }, 220);
      await tween(this.bonus, { alpha: 0 }, 220);
      this.bonus.visible = false;
    }
    this.bonusHalo.alpha = 0.15;
  }

  /** Lights segment `i` of a wheel: the wedge turns with the rotor. */
  private showWedge(w: Sprite, i: number, n: number, color: number) {
    w.rotation = (i + 0.5) * ((Math.PI * 2) / n);
    w.tint = light(color, 0.55);
    w.alpha = 1;
  }

  private async settle(r: SpinResult, total: number) {
    const bets = Object.fromEntries(this.bets) as Partial<Record<Field, number>>;
    const win = payout(bets, r);
    const rtp = this.brakeRound ?? FIELDS.reduce((s, f) => s + (bets[f] ?? 0) * FIELD_RTP[f], 0) / total;
    // Tags: wheel; x20 = the wheel stopped on ×20; bonus = the bonus wheel turned.
    const tags = ['wheel'];
    if (r.segment === 'x20') tags.push('x20');
    if (r.segment === 'bonus') tags.push('bonus');
    const tile = r.field ? this.tiles.find((t) => t.f === r.field) : undefined;
    if (tile) {
      tile.glow.alpha = 0.9;
      this.winColor = FIELD_COLOR[tile.f];
    }
    // Chips on losing fields are swept off the stage.
    for (const t of this.tiles) if (t.f !== r.field && t.chips.children.length) void tween(t.chips, { alpha: 0, y: t.chips.y + 30 }, 380, ease.inCubic, 150);
    if (win > 0) this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'wheel', stake: total, win, rtp, tags });
    if (win > 0 && tile) {
      const mult = win / total;
      const g = tile.c.getGlobalPosition();
      const gx = g.x + (tile.w / 2) * this.shell.s;
      const gy = g.y + (tile.h * 0.4) * this.shell.s;
      const local = this.view.toLocal({ x: gx, y: gy });
      const wc = this.wheel.getGlobalPosition();
      this.ctx.celebrate(mult, gx, gy, { x: wc.x, y: wc.y, r: (this.wr + 16) * this.shell.s });
      for (let i = 0; i < Math.min(12, 3 + Math.round(mult)); i++) this.ctx.sfx.coin(i * 0.06);
      const level = rewardLevel(mult);
      if (level >= 3) {
        this.ctx.sfx.bigWin();
        if (level >= 4 && !this.calm) void shake(this.shell.board, 8, 300);
        await winStage(this.shell.over, {
          x: 0,
          y: 0,
          w: this.sceneW,
          h: this.sceneH,
          title: level >= 4 ? 'JACKPOT' : 'GROSSER GEWINN',
          sub: `${r.segment === 'bonus' ? 'Bonus · ' : ''}${FIELD_LABEL[r.field!]} zahlt ${r.rate}:1`,
          amount: win,
          accent: level >= 4 ? COLORS.lamp : COLORS.neon,
          durationMs: level >= 4 ? 2500 : 2000,
          onTick: () => this.ctx.sfx.tick(),
        });
      } else {
        if (mult > 1) this.ctx.sfx.win();
        else this.ctx.sfx.partial();
        floatText(this.view, local.x, local.y - 20, `+${formatChips(win)}`, COLORS.lamp, Math.round(30 * Math.max(0.8, this.shell.s)));
        if (level === 2) void lightWave(this.shell.over, 0, 0, this.sceneW, this.sceneH, FIELD_COLOR[tile.f]);
      }
      await wait(this.calm ? 500 : 1000);
    } else {
      this.ctx.sfx.lose();
      await wait(this.calm ? 400 : 900);
    }
    for (const t of this.tiles) {
      t.glow.alpha = 0;
      t.chips.alpha = 1;
      t.chips.y = t.h * 0.82;
    }
  }

  // ---- Frame -----------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
    this.refreshButtons();
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.chips = this.ctx.state.stakes(CHIPS);
      this.changeChip(0);
      this.refreshBets();
      this.ctx.toast(this.stakeWatch.note);
    }
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    if (this.odds.poll()) this.refreshRtp();
    this.updateClicker(dt);
    // Bulb chase: slow when idle, racing while spinning, flashing the winner's colour.
    const t = this.time;
    const n = this.bulbs.length;
    for (let i = 0; i < n; i++) {
      const b = this.bulbs[i];
      let a: number;
      if (this.winColor) {
        a = 0.45 + 0.45 * (Math.sin(t * 9) > 0 ? 1 : 0.2);
        b.tint = this.winColor;
      } else if (this.spinning) {
        a = 0.25 + 0.7 * Math.pow(Math.max(0, Math.cos(t * 9 - i * 0.55)), 6);
        b.tint = 0xffe2a0;
      } else {
        a = this.calm ? 0.5 : 0.3 + 0.55 * Math.pow(Math.max(0, Math.cos(t * 2.2 - i * 0.26)), 8);
        b.tint = 0xffe2a0;
      }
      b.alpha = a;
    }
    if (this.wedge.alpha > 0) this.wedge.alpha = 0.75 + 0.25 * Math.sin(t * 6);
    if (this.bonusWedge.alpha > 0) this.bonusWedge.alpha = 0.75 + 0.25 * Math.sin(t * 6);
    for (const tl of this.tiles) if (tl.glow.alpha > 0) tl.glow.alpha = 0.55 + 0.35 * Math.sin(t * 6);
  }

  /** The leather tongue: pushed aside by each peg, then it snaps back and wobbles (damped spring). */
  private updateClicker(dt: number) {
    const q = this.rotor.rotation / SEG;
    const cross = Math.floor(q);
    const p = q - cross;
    const w = 0.45;
    const max = 0.55;
    const contact = p > 1 - w ? -max * ((p - (1 - w)) / w) : 0;
    if (cross !== this.lastCross) {
      this.lastCross = cross;
      if (this.spinning && this.time - this.lastClickSound > 0.03) {
        this.lastClickSound = this.time;
        this.ctx.sfx.clicker();
      }
    }
    const k = 520;
    const damp = 11;
    this.clickVel += (-k * this.clickAngle - damp * this.clickVel) * dt;
    this.clickAngle += this.clickVel * dt;
    if (this.clickAngle > contact && contact < 0) {
      this.clickAngle = contact;
      this.clickVel = Math.min(this.clickVel, 0);
    }
    this.clicker.rotation = this.clickAngle;
  }

  busy() {
    return this.spinning;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.shell.destroy();
    this.stageTex?.destroy(true);
    this.view.destroy({ children: true });
  }
}

export const wheel: GameDefinition = {
  id: 'wheel',
  name: 'Großes Rad',
  houseEdge: 1 - FIELD_RTP.x2,
  footprint: { w: 112, h: 72 },
  size: 'table',
  blurb: 'Das große Rad mit Klapper: ×1 bis ×20 und ein Bonusrad.',
  drawStation: () => drawWheelStation(),
  create: (ctx) => new WheelGame(ctx),
};
