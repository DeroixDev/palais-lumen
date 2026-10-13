// "Mondflug": a sky lantern rises towards the full moon while the multiplier climbs.
// Collect before the night wind catches it.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, banner, floatText, glowTexture, reducedMotion, rewardLevel, shake, sparkTexture } from '../../core/fx';
import { animate, ease, tween } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import {
  PLAQUE,
  barTexture,
  candleTexture,
  cloudTexture,
  flameTexture,
  flyerTexture,
  frameTexture,
  gustTexture,
  moonTexture,
  plaqueTexture,
  skyTexture,
  skylineTexture,
  starTexture,
} from './paint';
import { MAX_MULT, RTP, SHIELD_BELOW, SHIELD_RTP, drawWindPoint, shielded } from './rules';
import { OddsWatch, itemMoment, itemName, itemRtpText } from '../itemKit';
import { RulesKnob } from '../rulesKnob';
import { luckDraw, luckBias } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
// ---- Rules -------------------------------------------------------------

export { drawWindPoint };

/** Growth speed: multiplier = e^(K·seconds). 2× after ~5 s, 10× after ~16 s. */
const K = 0.14;

const fmt = (m: number) => m.toFixed(2).replace('.', ',');
const BETS = [10, 20, 50, 100, 250];
const AUTO = [0, 1.5, 2, 3, 5, 10, 25];
const MILESTONES = [2, 3, 5, 10, 25, 50, 100, 250, 500];

// ---- Look ---------------------------------------------------------------

const CREAM = 0xfff3dc;
const GOLD = 0xffcf7a;
const HOT = 0xffa04a;
const COLD = 0x9fc0ff;
const FLYER = 76; // sky lantern size in sky units

type Phase = 'idle' | 'warmup' | 'flying' | 'done';

interface Star {
  s: Sprite;
  depth: number;
  tw: number;
}

interface Spark {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
}

/** Digits with a fixed advance, so the climbing number never jitters (tabular figures). */
class Digits extends Container {
  private glyphs: Text[] = [];
  private fill: number = CREAM;
  constructor(private size: number) {
    super();
  }
  set(str: string, fill: number) {
    const adv = (ch: string) => (ch === ',' ? 0.34 : ch === '×' ? 0.62 : 0.72) * this.size;
    while (this.glyphs.length < str.length) {
      const t = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: this.size, fill: this.fill, stroke: { color: 0x0a0610, width: Math.round(this.size * 0.08) } } });
      t.anchor.set(0.5);
      this.addChild(t);
      this.glyphs.push(t);
    }
    let total = 0;
    for (const ch of str) total += adv(ch);
    let x = -total / 2;
    this.glyphs.forEach((g, i) => {
      const ch = str[i];
      g.visible = ch !== undefined;
      if (!ch) return;
      if (g.text !== ch) g.text = ch;
      if (fill !== this.fill) g.style.fill = fill;
      const a = adv(ch);
      g.x = x + a / 2;
      g.y = ch === ',' ? this.size * 0.12 : 0;
      x += a;
    });
    this.fill = fill;
  }
}

class CrashGame implements GameInstance {
  view = new Container();
  /** Everything that shakes on a jackpot. */
  private board = new Container();
  private frame = new Sprite();
  private frameTex: Texture | null = null;
  private sky = new Container();
  private skyMask = new Graphics();
  private skyBg = new Sprite();
  private skyTex: Texture | null = null;
  private skyline = new Sprite();
  private skylineTex: Texture | null = null;
  private stars: Star[] = [];
  private clouds: Sprite[] = [];
  private moon = new Container();
  private moonHalo = new Sprite(glowTexture());
  private grid = new Graphics();
  private gridLabels: Text[] = [];
  private trail = new Graphics();
  private sparkLayer = new Container();
  private sparks: Spark[] = [];
  private sparkClock = 0;
  private flash = new Graphics();
  private moth = new Container();
  private mothWings = new Sprite(flyerTexture());
  private emblemGlow = new Sprite(glowTexture());
  private candle = new Container();
  private flame = new Sprite(flameTexture());
  private flameGlow = new Sprite(glowTexture());

  private plaque = new Container();
  private plaqueGlow = new Sprite(glowTexture());
  private plaqueTint = new Graphics();
  private caption!: Text;
  private digits = new Digits(64);
  private subText!: Text;

  private controls = new Container();
  private barTex: Texture | null = null;
  private actionBtn!: Button;
  private betText!: Text;
  private autoBtn!: Button;
  private minus!: Button;
  private plus!: Button;
  private historyLayer = new Container();
  private history: { won: boolean; m: number }[] = [];

  private skyW = 900;
  private skyH = 500;
  private layoutKey = '';
  private tall = false;
  private cold = false;
  private moonMax = 2.1;

  private phase: Phase = 'idle';
  private betIndex = 1;
  private autoIndex = 0;
  private stake = 0;
  private windAt = 1;
  /** Odds item: the Mondschirm catches gusts below 1,10× (stake back). On for this flight? */
  private odds!: OddsWatch;
  private shield = false;
  private rtpText: Text | null = null;
  /** "So geht's" with the payout share, top left in the sky. */
  private rules = new RulesKnob(this.view, () => [
    'Die Himmelslaterne steigt zum Mond, der Multiplikator wächst mit ihr. Sammelst du ein, bevor der Nachtwind sie erwischt, zahlt dein Einsatz × Multiplikator. Erwischt er sie vorher, ist der Einsatz weg.',
    '• Auto-Einsammeln sammelt beim gewählten Multiplikator von selbst ein.',
    '• Wie weit sie kommt, steht schon beim Abflug fest.',
    '',
    `Auszahlungsquote ${Math.round(RTP * 100)} % · Hausvorteil ${Math.round((1 - RTP) * 100)} %, egal wann du einsammelst.`,
    ...(this.odds?.id ? [itemRtpText(SHIELD_RTP, 'mondschirm', `einsammeln ab ${fmt(SHIELD_BELOW)}×`)] : []),
  ]);
  private rtpMaxW = 0;
  private t = 0;
  private mult = 1;
  private nextMilestone = 0;
  private time = 0;
  private stopHum: () => void = () => {};
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.action();
    }
  };

  /** Today's ladder: the day-1 bets scaled to today's stakes. */
  private bets: number[];

  private stakeWatch: StakeWatch;

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'crash', ['mondschirm']);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get skylineBase() {
    return this.skyH - 150 * Math.min(1, this.skyH / 420);
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  private get auto() {
    return AUTO[this.autoIndex];
  }

  // ---- Build --------------------------------------------------------------

  private build() {
    this.view.addChild(this.board);
    const b = this.board;
    b.addChild(this.frame, this.sky);

    const sky = this.sky;
    sky.addChild(this.skyBg);
    for (let i = 0; i < 70; i++) {
      const depth = 0.25 + Math.random() * 0.75;
      const s = new Sprite(starTexture());
      s.anchor.set(0.5);
      s.scale.set(0.25 + depth * 0.45);
      s.alpha = 0.4 + depth * 0.5;
      sky.addChild(s);
      this.stars.push({ s, depth, tw: Math.random() * 10 });
    }
    // Moon in the top right; it grows as the moth gets closer.
    this.moonHalo.anchor.set(0.5);
    this.moonHalo.width = this.moonHalo.height = 340;
    this.moonHalo.tint = 0xfff1c4;
    this.moonHalo.alpha = 0.4;
    this.moonHalo.blendMode = 'add';
    const disc = new Sprite(moonTexture());
    disc.anchor.set(0.5);
    this.moon.addChild(this.moonHalo, disc);
    sky.addChild(this.moon);
    for (let i = 0; i < 5; i++) {
      const c = new Sprite(cloudTexture(i % 3));
      c.anchor.set(0.5);
      c.scale.set(0.8 + Math.random() * 0.7);
      c.alpha = 0.75;
      sky.addChild(c);
      this.clouds.push(c);
    }
    sky.addChild(this.skyline, this.grid);
    for (let i = 0; i < 6; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '600', fill: 0xc9bce6 } });
      t.anchor.set(0, 1);
      t.alpha = 0.75;
      sky.addChild(t);
      this.gridLabels.push(t);
    }
    sky.addChild(this.trail, this.sparkLayer);

    // The candle where every flight starts, standing on the sill.
    this.flameGlow.anchor.set(0.5);
    this.flameGlow.width = this.flameGlow.height = 120;
    this.flameGlow.tint = 0xffa94a;
    this.flameGlow.blendMode = 'add';
    this.flameGlow.position.set(0, -60);
    const cs = new Sprite(candleTexture());
    cs.anchor.set(0.5, 74 / 80);
    this.flame.anchor.set(0.5, 38 / 44);
    this.flame.position.set(0, -50);
    this.candle.addChild(this.flameGlow, cs, this.flame);
    sky.addChild(this.candle);

    this.emblemGlow.anchor.set(0.5);
    this.emblemGlow.width = this.emblemGlow.height = 130;
    this.emblemGlow.tint = GOLD;
    this.emblemGlow.blendMode = 'add';
    this.mothWings.anchor.set(0.5);
    const wingBox = new Container();
    wingBox.scale.set(FLYER / 96);
    wingBox.addChild(this.mothWings);
    this.moth.addChild(this.emblemGlow, wingBox);
    sky.addChild(this.moth);
    this.flash.eventMode = 'none';
    sky.addChild(this.flash);
    sky.addChild(this.skyMask);
    sky.mask = this.skyMask;

    // Brass multiplier display.
    const ps = new Sprite(plaqueTexture());
    ps.anchor.set((PLAQUE.w / 2 + 20) / (PLAQUE.w + 40), 30 / (PLAQUE.h + 50));
    this.plaqueGlow.anchor.set(0.5);
    this.plaqueGlow.width = PLAQUE.w * 1.6;
    this.plaqueGlow.height = PLAQUE.h * 1.8;
    this.plaqueGlow.position.set(0, PLAQUE.h / 2);
    this.plaqueGlow.tint = GOLD;
    this.plaqueGlow.blendMode = 'add';
    this.plaqueGlow.alpha = 0;
    this.plaqueTint.roundRect(-PLAQUE.w / 2 + 16, 14, PLAQUE.w - 32, PLAQUE.h - 28, 10).fill(0xffffff);
    this.plaqueTint.alpha = 0;
    this.caption = new Text({ text: 'MULTIPLIKATOR', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: 0xd8b878, letterSpacing: 3 } });
    this.caption.anchor.set(0.5);
    this.caption.position.set(0, 32);
    this.digits.position.set(0, 76);
    this.plaque.addChild(this.plaqueGlow, ps, this.plaqueTint, this.caption, this.digits);
    b.addChild(this.plaque);

    this.subText = new Text({
      text: '',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 21,
        fontWeight: '700',
        fill: 0xeee2ff,
        align: 'center',
        stroke: { color: 0x0a0610, width: 5 },
        lineHeight: 26,
        wordWrap: true,
        wordWrapWidth: 600,
      },
    });
    this.subText.anchor.set(0.5, 0);
    b.addChild(this.subText, this.historyLayer, this.controls);

    this.resetFlight();
    this.subText.text = 'Die Himmelslaterne steigt zum Mond. Je höher, desto mehr.\nSammle ein, bevor der Nachtwind sie erwischt.';
  }

  /** (Re)builds the sky, frame and controls for a new size. */
  private layoutSky(w: number, h: number) {
    w = Math.round(w);
    h = Math.round(h);
    this.skyW = w;
    this.skyH = h;
    this.skyTex?.destroy(true);
    this.skyTex = skyTexture(w, h);
    this.skyBg.texture = this.skyTex;
    this.skylineTex?.destroy(true);
    this.skylineTex = skylineTexture(w);
    this.skyline.texture = this.skylineTex;
    this.skyline.scale.y = Math.min(1, h / 420);
    this.skyline.position.set(0, this.skylineBase);
    this.frameTex?.destroy(true);
    this.frameTex = frameTexture(w, h);
    this.frame.texture = this.frameTex;
    this.frame.position.set(-26, -26);
    this.skyMask.clear().roundRect(0, 0, w, h, 20).fill(0xffffff);
    this.flash.clear().rect(0, 0, w, h).fill(0xdfe8ff);
    this.flash.alpha = 0;
    for (const s of this.stars) s.s.position.set(Math.random() * w, Math.random() * h);
    for (const c of this.clouds) c.position.set(Math.random() * w, 140 + Math.random() * Math.max(40, h - 300));
    // On narrow skies the moon sits below the display and grows less.
    this.moonMax = Math.max(1, Math.min(2.1, (w * (this.tall ? 0.34 : 0.4)) / 108));
    if (this.tall) this.moon.position.set(w - 60, Math.min(250, h * 0.36));
    else this.moon.position.set(w - Math.min(120, w * 0.12), Math.min(110, h * 0.22));
    const starCount = Math.min(this.stars.length, Math.round((w * h) / 6000));
    this.stars.forEach((st, i) => (st.s.visible = i < starCount));
    this.candle.position.set(46, h - 6);
    this.subText.style.wordWrapWidth = Math.min(620, w - 40);
    if (this.phase === 'flying' || this.phase === 'done') this.advance(this.mult, false);
    else this.resetFlight();
  }

  private buildControls(tall: boolean, width: number) {
    const c = this.controls;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    this.barTex?.destroy(true);
    const H = tall ? 176 : 118;
    this.barTex = barTexture(width, H);
    c.addChild(new Sprite(this.barTex));
    const small = (t: string) => label(t, tall ? 14 : 15, 0xd8b878);
    const betLabel = small('EINSATZ');
    const autoLabel = small('AUTO-EINSAMMELN');
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 52, height: 52, fontSize: 26, onClick: () => this.changeBet(-1) });
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 52, height: 52, fontSize: 26, onClick: () => this.changeBet(1) });
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 24, fill: CREAM } });
    this.betText.anchor.set(0.5);
    const autoBtn = (aw: number) => button({ label: '', ariaLabel: (t) => `Auto-Einsammeln: ${t}`, width: aw, height: 52, color: 0x3a2040, textColor: CREAM, fontSize: 19, display: false, onClick: () => this.cycleAuto() });
    const rtp = new Text({
      text: '',
      // (filled by refreshRtp() while the Mondschirm works)
      style: { fontFamily: FONT_BODY, fontSize: tall ? 14 : 15, fontWeight: '600', fill: 0xbfa98a },
    });
    if (tall) {
      const row = 54;
      betLabel.position.set(18, 14);
      this.minus.position.set(18 + 26, row);
      this.betText.position.set(18 + 52 + 44, row);
      this.plus.position.set(18 + 52 + 88 + 26, row);
      const ax = 18 + 52 + 88 + 52 + 14;
      const aw = width - ax - 18;
      this.autoBtn = autoBtn(aw);
      this.autoBtn.position.set(ax + aw / 2, row);
      autoLabel.position.set(ax, 14);
      this.actionBtn = button({ label: 'ABFLUG', width: width - 36, height: 64, color: COLORS.brass, fontSize: 24, onClick: () => this.action() });
      this.actionBtn.position.set(width / 2, 122);
      rtp.anchor.set(0.5);
      rtp.position.set(width / 2, H - 16);
    } else {
      const row = 66;
      betLabel.position.set(24, 16);
      this.minus.position.set(24 + 26, row);
      this.betText.position.set(24 + 52 + 50, row);
      this.plus.position.set(24 + 52 + 100 + 26, row);
      const ax = 24 + 52 + 100 + 52 + 24;
      this.autoBtn = autoBtn(170);
      this.autoBtn.position.set(ax + 85, row);
      autoLabel.position.set(ax, 16);
      const aw = Math.min(360, width - (ax + 170) - 48);
      this.actionBtn = button({ label: 'ABFLUG', width: aw, height: 74, color: COLORS.brass, fontSize: 26, onClick: () => this.action() });
      this.actionBtn.position.set(width - 24 - aw / 2, row - 6);
      rtp.anchor.set(0, 0.5);
      rtp.position.set(ax, H - 16);
      rtp.visible = ax + rtp.width < width - 24 - aw - 10;
      this.rtpMaxW = width - 24 - aw - 10 - ax;
    }
    this.rtpText = rtp;
    if (tall) this.rtpMaxW = width - 24;
    this.refreshRtp();
    c.addChild(betLabel, autoLabel, this.minus, this.plus, this.betText, this.autoBtn, this.actionBtn, rtp);
    this.changeBet(0, true);
    this.cycleAuto(0, true);
    this.updateActionLabel();
  }

  // ---- Controls -------------------------------------------------------------

  private changeBet(d: number, force = false) {
    if (!force && (this.phase === 'flying' || this.phase === 'warmup')) return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    const free = this.phase !== 'flying' && this.phase !== 'warmup';
    this.minus.setEnabled(free && this.betIndex > 0);
    this.plus.setEnabled(free && this.betIndex < this.bets.length - 1);
    this.updateActionLabel();
  }

  private cycleAuto(step = 1, force = false) {
    if (!force && (this.phase === 'flying' || this.phase === 'warmup')) return;
    this.autoIndex = (this.autoIndex + step) % AUTO.length;
    this.autoBtn.setLabel(this.auto ? `bei ${fmt(this.auto)}×` : 'aus');
  }

  private setControlsLocked(locked: boolean) {
    this.minus.setEnabled(!locked && this.betIndex > 0);
    this.plus.setEnabled(!locked && this.betIndex < this.bets.length - 1);
    this.autoBtn.setEnabled(!locked);
  }

  private action() {
    if (this.phase === 'flying') this.collect(this.mult);
    else if (this.phase === 'idle' || this.phase === 'done') this.launch();
  }

  private updateActionLabel() {
    if (!this.actionBtn) return;
    if (this.phase === 'flying') this.actionBtn.setLabel(`EINSAMMELN ${formatChips(Math.floor(this.stake * this.mult))}`);
    else if (this.phase === 'warmup') this.actionBtn.setLabel('START …');
    else this.actionBtn.setLabel(`${this.phase === 'done' ? 'NOCHMAL' : 'ABFLUG'} · ${formatChips(this.bet)}`);
  }

  // ---- Round ----------------------------------------------------------------

  private setDisplay(m: number, fill: number, caption?: string) {
    this.digits.set(`${fmt(m)}×`, fill);
    if (caption !== undefined) this.caption.text = caption;
  }

  private resetFlight() {
    this.t = 0;
    this.mult = 1;
    this.nextMilestone = 0;
    this.cold = false;
    this.trail.clear();
    this.trail.alpha = 1;
    this.moth.alpha = 1;
    this.moth.rotation = 0;
    this.moth.scale.set(1);
    this.emblemGlow.alpha = 0.7;
    this.moth.position.set(this.candle.x + 20, this.candle.y - 100);
    this.moon.scale.set(0.8);
    this.skyline.y = this.skylineBase;
    this.plaqueTint.alpha = 0;
    this.digits.scale.set(1);
    this.setDisplay(1, CREAM, 'MULTIPLIKATOR');
    this.drawGrid(2);
  }

  private launch() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    this.stake = bet;
    // The result exists before anything moves.
    // Mod-Menü Gewinnchance: a win is a flight that reaches the auto cash-out (without one: 2×),
    // a loss one that ends before it (without auto cash-out: right at the start).
    const auto = this.auto;
    this.windAt = luckDraw(
      () => drawWindPoint(),
      (w) => (auto ? (w >= auto ? 1 : -1) : luckBias() > 0 ? (w >= 2 ? 1 : -1) : w <= 1 ? -1 : 1),
    );
    this.shield = this.odds.on('mondschirm');
    this.resetFlight();
    this.phase = 'warmup';
    this.setControlsLocked(true);
    this.actionBtn.setEnabled(false);
    this.updateActionLabel();
    this.subText.text = 'Die Laterne wird an der Kerze entzündet …';
    this.ctx.sfx.spinStart();
    // Short warm-up: the moth circles the flame once, then takes off.
    const cx = this.candle.x;
    const cy = this.candle.y - 80;
    void animate(
      900,
      (k) => {
        if (this.moth.destroyed) return;
        const a = k * Math.PI * 2 - Math.PI / 2;
        this.moth.position.set(cx + Math.cos(a) * 30, cy + Math.sin(a) * 16 - 20 * k);
        this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
      },
      ease.inOutCubic,
    ).then(() => {
      if (this.phase !== 'warmup' || this.view.destroyed) return;
      this.subText.text = '';
      if (this.windAt <= 1) {
        this.wind();
        return;
      }
      this.phase = 'flying';
      this.stopHum = this.ctx.sfx.flight();
      this.actionBtn.setEnabled(true);
      this.updateActionLabel();
    });
  }

  private collect(m: number) {
    if (this.phase !== 'flying') return;
    this.phase = 'done';
    this.stopHum();
    const win = Math.floor(this.stake * m);
    this.ctx.state.payout(win);
    const tags = ['crash', 'cashout'];
    if (m >= 2) tags.push('cashout2');
    if (m >= 5) tags.push('cashout5');
    this.ctx.state.report({ game: 'crash', stake: this.stake, win, rtp: this.shield ? SHIELD_RTP : RTP, tags });
    this.mult = m;
    this.setDisplay(m, GOLD, 'EINGESAMMELT');
    this.setControlsLocked(false);
    this.updateActionLabel();
    this.subText.text = `Eingesammelt bei ${fmt(m)}×  ·  +${formatChips(win)} ${CURRENCY_PLURAL}`;
    const calm = reducedMotion();
    if (!calm) void tween(this.digits.scale, { x: 1.22, y: 1.22 }, 140, ease.outCubic).then(() => tween(this.digits.scale, { x: 1, y: 1 }, 380, ease.outBack));
    this.plaqueGlow.alpha = 0.85;
    void tween(this.plaqueGlow, { alpha: 0.25 }, 900, ease.outCubic);
    this.plaqueTint.tint = GOLD;
    this.plaqueTint.alpha = 0.3;
    void tween(this.plaqueTint, { alpha: 0 }, 500);
    this.addHistory(m, true);

    // The moth reaches the moon's light: it glides up into it and the moon flares.
    const p = this.sky.toGlobal(this.moth.position);
    const local = this.view.toLocal(p);
    floatText(this.view, local.x, local.y - 30, `+${formatChips(win)}`, COLORS.lamp, 34);
    const sx = this.moth.x;
    const sy = this.moth.y;
    const mx = this.moon.x;
    const my = this.moon.y;
    void animate(
      900,
      (k) => {
        // The player may leave right after collecting: the game is gone, the glide stops.
        if (this.moth.destroyed) return;
        this.moth.position.set(sx + (mx - sx) * k, sy + (my - sy) * k - Math.sin(k * Math.PI) * 30);
        this.moth.scale.set(1 - 0.6 * k);
        this.moth.alpha = 1 - k * 0.85;
        this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
      },
      ease.inOutCubic,
    ).then(() => {
      if (this.moonHalo.destroyed) return;
      this.moonHalo.alpha = 1;
      void tween(this.moonHalo, { alpha: 0.4 }, 900);
    });
    const level = rewardLevel(m);
    const moonG = this.sky.toGlobal(this.moon.position);
    if (m > 1) this.ctx.celebrate(m, p.x, p.y, { x: moonG.x, y: moonG.y, r: 120 * this.board.scale.x });
    else this.ctx.sfx.partial();
    if (level >= 2) this.ctx.particles.lightWave(moonG.x, moonG.y, 0xfff1c4, 220 * this.board.scale.x);
    if (level >= 3) {
      const bp = this.view.toLocal(this.sky.toGlobal({ x: this.skyW / 2, y: this.skyH * 0.5 }));
      void banner(this.view, level >= 4 ? 'MONDLANDUNG!' : 'GROSSER FLUG', level >= 4 ? COLORS.lamp : COLORS.neon, bp.x, bp.y, this.skyW * this.board.scale.x * 0.95);
    }
    if (level >= 4) void shake(this.board, 8, 300);
  }

  /** The night wind catches the moth: it tumbles down and the round is over. Calm, no shake. */
  private wind() {
    if (this.shield && shielded(this.windAt)) return this.parachute();
    this.phase = 'done';
    this.stopHum();
    // 'crash' is the game tag (every round); 'bust' marks a lost flight.
    this.ctx.state.report({ game: 'crash', stake: this.stake, win: 0, rtp: this.shield ? SHIELD_RTP : RTP, tags: ['crash', 'bust'] });
    this.ctx.sfx.fizzle();
    this.cold = true;
    this.setDisplay(this.windAt, COLD, 'WINDSTOSS');
    this.plaqueTint.tint = 0x6a86d8;
    this.plaqueTint.alpha = 0.45;
    void tween(this.plaqueTint, { alpha: 0.12 }, 600);
    this.subText.text = this.windAt <= 1 ? 'Windstoß gleich beim Start – der Einsatz ist weg.' : `Windstoß bei ${fmt(this.windAt)}× – der Einsatz ist weg.`;
    this.setControlsLocked(false);
    this.actionBtn.setEnabled(true);
    this.updateActionLabel();
    this.addHistory(this.windAt, false);
    if (this.mult > 1) this.redrawTrail(this.mult);
    const calm = reducedMotion();
    // A cold flash and gusts across the sky.
    this.flash.alpha = calm ? 0.12 : 0.3;
    void tween(this.flash, { alpha: 0 }, 450, ease.outCubic);
    for (let i = 0; i < (calm ? 2 : 7); i++) {
      const g = new Sprite(gustTexture());
      g.anchor.set(0.5);
      g.scale.set(0.8 + Math.random() * 0.8);
      g.alpha = 0.9;
      g.position.set(-200, this.moth.y - 100 + Math.random() * 200);
      this.sky.addChild(g);
      void tween(g, { x: this.skyW + 200 }, 520 + Math.random() * 300, ease.inOutCubic, i * 60).then(() => g.destroy());
    }
    void tween(this.trail, { alpha: 0.45 }, 800);
    this.emblemGlow.alpha = 0;
    const sx = this.moth.x;
    const sy = this.moth.y;
    void animate(
      1400,
      (k) => {
        if (this.moth.destroyed) return;
        this.moth.x = sx + 160 * k + (calm ? 0 : Math.sin(k * 14) * 18);
        this.moth.y = sy + (this.skyH + 60 - sy) * k * k;
        this.moth.rotation = calm ? 0.6 * k : k * 7;
        this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
        this.moth.alpha = 1 - k * 0.6;
      },
      ease.linear,
    );
  }

  /** Mondschirm: the gust came below 1,10×; the parachute opens and the stake comes back. */
  private parachute() {
    this.phase = 'done';
    this.stopHum();
    const win = this.stake;
    this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'crash', stake: this.stake, win, rtp: SHIELD_RTP, tags: ['crash', 'bust', 'mondschirm'] });
    this.ctx.sfx.partial();
    this.setDisplay(this.windAt, 0xbfd8ff, 'MONDSCHIRM');
    this.plaqueTint.tint = 0xbfd8ff;
    this.plaqueTint.alpha = 0.3;
    void tween(this.plaqueTint, { alpha: 0 }, 700);
    this.subText.text = `Windstoß bei ${fmt(this.windAt)}× – der Mondschirm fängt die Laterne: ${formatChips(win)} ${CURRENCY_PLURAL} zurück.`;
    this.setControlsLocked(false);
    this.actionBtn.setEnabled(true);
    this.updateActionLabel();
    this.addHistory(this.windAt, false);
    const calm = reducedMotion();
    const p = this.view.toLocal(this.sky.toGlobal({ x: this.moth.x, y: this.moth.y - 70 }));
    void itemMoment(this.view, p.x, p.y, 'mondschirm', 'MONDSCHIRM!', Math.max(0.7, this.board.scale.x));
    floatText(this.view, p.x, p.y + 90, `${formatChips(win)} zurück`, 0xbfd8ff, 28);
    // The moth sails down gently, swaying under the canopy.
    const sx = this.moth.x;
    const sy = this.moth.y;
    void animate(
      calm ? 900 : 2200,
      (k) => {
        if (this.moth.destroyed) return;
        this.moth.x = sx + (calm ? 0 : Math.sin(k * 7) * 26);
        this.moth.y = sy + (this.skyH - 70 - sy) * k;
        this.moth.rotation = calm ? 0 : Math.sin(k * 7) * 0.25;
        this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
      },
      ease.outCubic,
    );
  }

  /** The line under the controls: only the Mondschirm while it works (the payout share is in the rules card). */
  private refreshRtp() {
    const t = this.rtpText;
    if (!t) return;
    t.text = this.odds?.id ? `${itemName('mondschirm')}: Einsatz zurück bei Wind unter ${fmt(SHIELD_BELOW)}×` : '';
    t.style.fill = this.odds?.id ? 0xc8dcff : 0xbfa98a;
    t.scale.set(1);
    if (this.rtpMaxW > 0 && t.width > this.rtpMaxW) t.scale.set(Math.max(0.6, this.rtpMaxW / t.width));
    t.visible = this.rtpMaxW > 0 && t.width <= this.rtpMaxW + 1;
  }

  private addHistory(m: number, won: boolean) {
    this.history.unshift({ won, m });
    if (this.history.length > 8) this.history.pop();
    this.drawHistory(true);
  }

  private drawHistory(pop = false) {
    this.historyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const tw = 78;
    const max = Math.max(3, Math.floor((this.skyW + 20) / (tw + 8)));
    this.history.slice(0, max).forEach((h, i) => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-tw / 2, -15, tw, 30, 15).fill(h.won ? 0xe0b25a : 0x24224a).stroke({ color: h.won ? 0x7a5214 : 0x6a78b0, width: 2 });
      if (h.won) g.roundRect(-tw / 2 + 3, -12, tw - 6, 10, 6).fill({ color: 0xffffff, alpha: 0.25 });
      const t = new Text({
        text: `${h.won ? '▲' : '▼'} ${fmt(h.m)}×`,
        style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: h.won ? 0x2a1406 : 0xcfdcff },
      });
      t.anchor.set(0.5);
      c.addChild(g, t);
      c.x = i * (tw + 8) + tw / 2;
      c.alpha = i === 0 ? 1 : 0.8;
      this.historyLayer.addChild(c);
      if (pop && i === 0) {
        c.scale.set(0.3);
        void tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack);
      }
    });
  }

  // ---- Flight drawing ---------------------------------------------------------

  /** Horizontal guide lines for the multiplier; they stretch as the flight goes on. */
  private drawGrid(mMax: number) {
    const g = this.grid.clear();
    const steps = mMax <= 3 ? 0.5 : mMax <= 6 ? 1 : mMax <= 15 ? 2 : mMax <= 40 ? 5 : mMax <= 120 ? 20 : mMax <= 400 ? 50 : 200;
    let i = 0;
    for (let m = steps < 1 ? 1 + steps : Math.max(2, steps); m < mMax && i < this.gridLabels.length; m += steps, i++) {
      const y = this.my(m, mMax);
      for (let x = 60; x < this.skyW - 10; x += 14) g.moveTo(x, y).lineTo(x + 6, y);
      const t = this.gridLabels[i];
      t.text = `${fmt(m).replace(',00', '')}×`;
      t.position.set(12, y + 8);
      t.visible = true;
    }
    g.stroke({ color: 0xc9bce6, width: 1.5, alpha: 0.22 });
    for (; i < this.gridLabels.length; i++) this.gridLabels[i].visible = false;
  }

  private mx(t: number, tMax: number) {
    return 80 + (t / tMax) * (this.skyW - 200);
  }

  private my(m: number, mMax: number) {
    const top = Math.min(this.tall ? 150 : 160, this.skyH * 0.32);
    const bottom = Math.min(100, this.skyH * 0.22);
    return this.skyH - bottom - ((m - 1) / (mMax - 1)) * (this.skyH - bottom - top);
  }

  private flightPoints(m: number) {
    const t = Math.log(m) / K;
    const tMax = Math.max(8, t * 1.15);
    const mMax = Math.max(2, m * 1.25);
    const pts: number[] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const ti = (t * i) / n;
      pts.push(this.mx(ti, tMax), this.my(Math.exp(K * ti), mMax));
    }
    return { pts, mMax };
  }

  private redrawTrail(m: number) {
    const { pts } = this.flightPoints(m);
    const col = this.cold ? COLD : GOLD;
    const tr = this.trail.clear();
    const line = (width: number, color: number, alpha: number) => {
      tr.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) tr.lineTo(pts[i], pts[i + 1]);
      tr.stroke({ color, width, alpha, cap: 'round', join: 'round' });
    };
    line(18, col, 0.1);
    line(8, col, 0.28);
    line(3, this.cold ? 0xe6eeff : 0xfff3d0, 0.95);
    return pts;
  }

  /** Moves the flight to multiplier m and redraws the trail. */
  private advance(m: number, effects = true) {
    this.mult = m;
    const { mMax } = this.flightPoints(m);
    this.drawGrid(mMax);
    const pts = this.redrawTrail(m);
    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];
    const px = pts[pts.length - 4];
    const py = pts[pts.length - 3];
    if (this.phase === 'flying' || !effects) {
      this.moth.position.set(hx, hy);
      this.moth.rotation = (Math.atan2(hy - py, hx - px) + Math.PI / 2) * 0.3;
    }
    this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
    this.emblemGlow.alpha = 0.55 + 0.35 * Math.sin(this.time * 6);
    this.moon.scale.set(Math.min(this.moonMax, 0.8 + Math.log(m) * 0.32));
    // The garden sinks away below as the moth climbs.
    this.skyline.y = this.skylineBase + Math.min(170, Math.log(m) * 110);
    if (!effects) return;

    this.setDisplay(m, m >= 10 ? HOT : m >= 2 ? GOLD : CREAM);
    this.updateActionLabel();
    // Milestones: a little pulse, a ring and a rising note.
    if (MILESTONES[this.nextMilestone] !== undefined && m >= MILESTONES[this.nextMilestone]) {
      this.ctx.sfx.lineHit(this.nextMilestone);
      this.nextMilestone++;
      this.digits.scale.set(1.14);
      void tween(this.digits.scale, { x: 1, y: 1 }, 380, ease.outBack);
      const ring = new Graphics().circle(0, 0, 22).stroke({ color: GOLD, width: 3 });
      ring.position.set(hx, hy);
      this.sky.addChild(ring);
      void tween(ring.scale, { x: 4, y: 4 }, 600, ease.outCubic);
      void tween(ring, { alpha: 0 }, 600).then(() => ring.destroy());
    }
  }

  private emitSpark(dt: number) {
    this.sparkClock -= dt;
    if (this.sparkClock > 0) return;
    this.sparkClock = reducedMotion() ? 0.12 : 0.04;
    if (this.sparks.length >= 40) return;
    const s = new Sprite(sparkTexture());
    s.anchor.set(0.5);
    s.tint = GOLD;
    s.blendMode = 'add';
    s.scale.set(0.35 + Math.random() * 0.4);
    s.position.set(this.moth.x + (Math.random() - 0.5) * 14, this.moth.y + 10);
    this.sparkLayer.addChild(s);
    this.sparks.push({ s, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 40, life: 0.9 });
  }

  // ---- Frame -----------------------------------------------------------------

  resize(w: number, h: number) {
    const tall = w / h < 0.9;
    this.tall = tall;
    let s: number;
    let W: number;
    let H: number;
    if (tall) {
      s = Math.min(1, w / 390);
      W = w / s;
      H = h / s;
    } else {
      s = Math.min(1.25, Math.max(0.55, Math.min(w / 1000, h / 700)));
      W = w / s;
      H = h / s;
    }
    const margin = tall ? 10 : 24;
    const ctrlH = tall ? 176 : 118;
    const histH = 40;
    const plaqueOver = tall ? 46 : 54; // plaque sits above the window's top edge
    const frameW = 26;
    const contentW = tall ? W - margin * 2 : Math.min(W - margin * 2, 1120);
    const skyW = contentW - frameW * 2 + 20;
    const skyH = Math.max(220, H - margin - plaqueOver - frameW - 30 - histH - ctrlH - margin);
    const key = `${tall}-${Math.round(skyW)}-${Math.round(skyH)}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.layoutSky(skyW, skyH);
      this.buildControls(tall, contentW);
      this.drawHistory();
    }
    this.board.scale.set(s);
    const x0 = (W - contentW) / 2;
    const skyX = x0 + frameW - 10;
    const skyY = margin + plaqueOver + 8;
    this.sky.position.set(skyX, skyY);
    this.frame.position.set(skyX - 26, skyY - 26);
    const ps = tall ? Math.min(0.78, (skyW - 40) / PLAQUE.w) : 1;
    this.plaque.scale.set(ps);
    this.plaque.position.set(skyX + skyW / 2, skyY - plaqueOver);
    this.subText.position.set(skyX + skyW / 2, skyY + (PLAQUE.h - 4) * ps - plaqueOver + 14);
    this.subText.style.fontSize = tall ? 18 : 21;
    this.historyLayer.position.set(skyX - 4, skyY + skyH + 30 + histH / 2 - 4);
    this.board.addChild(this.rules.button);
    this.rules.button.position.set(skyX + 38, skyY + 38);
    this.rules.resize(w, h);
    this.controls.position.set(x0, H - margin - ctrlH);
    this.board.position.set(0, 0);
  }

  /** Today's stakes changed (boss phase, event): same rung of the ladder, new amounts. */
  private refreshStakes() {
    this.bets = this.ctx.state.stakes(BETS);
    this.changeBet(0, true);
    this.ctx.toast(this.stakeWatch.note);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) this.refreshStakes();
    if (this.odds.poll()) this.refreshRtp();
    const dt = dtMs / 1000;
    this.time += dt;
    // Candle flicker.
    this.flame.scale.set(1 + Math.sin(this.time * 17) * 0.06, 1 + Math.sin(this.time * 11) * 0.1);
    this.flameGlow.alpha = 0.6 + Math.sin(this.time * 9) * 0.15;

    let speed = 6;
    if (this.phase === 'flying') {
      this.t += dt;
      const m = Math.min(MAX_MULT, Math.exp(K * this.t));
      // Auto cash-out pays exactly the chosen value if it comes before the wind.
      if (this.auto && this.auto <= this.windAt && m >= this.auto) {
        this.advance(this.auto);
        this.collect(this.auto);
        return;
      }
      if (m >= this.windAt) {
        this.advance(this.windAt);
        this.wind();
        return;
      }
      this.advance(m);
      speed = 30 + Math.log(m) * 70;
      this.emitSpark(dt);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      p.s.x += p.vx * dt;
      p.s.y += (p.vy + speed * 0.5) * dt;
      p.s.alpha = Math.max(0, p.life / 0.9);
      if (p.life <= 0) {
        p.s.destroy();
        this.sparks.splice(i, 1);
      }
    }
    // Stars and clouds drift down: the moth is climbing.
    for (const st of this.stars) {
      st.s.y += speed * st.depth * dt;
      if (st.s.y > this.skyH) {
        st.s.y -= this.skyH;
        st.s.x = Math.random() * this.skyW;
      }
      st.s.alpha = (0.4 + st.depth * 0.5) * (0.75 + 0.25 * Math.sin(this.time * 2 + st.tw));
    }
    for (const c of this.clouds) {
      c.y += speed * 0.6 * dt;
      c.x += 8 * dt;
      if (c.y > this.skyH + 60) {
        c.y = -60;
        c.x = Math.random() * this.skyW;
      }
      if (c.x > this.skyW + 180) c.x = -180;
    }
    if (this.phase === 'done') {
      // After the round the garden rises back into view and the moon settles.
      const k = Math.min(1, dt * 1.2);
      this.skyline.y += (this.skylineBase - this.skyline.y) * k;
      const ms = this.moon.scale.x + (0.8 - this.moon.scale.x) * k * 0.5;
      this.moon.scale.set(ms);
    }
    if (this.phase === 'idle' || this.phase === 'done') {
      // Idle moth hovers by the candle.
      if (this.phase === 'idle') this.moth.position.set(this.candle.x + 26 + Math.sin(this.time * 1.7) * 16, this.candle.y - 110 + Math.sin(this.time * 2.3) * 9);
      this.mothWings.scale.set(0.97 + 0.03 * Math.sin(this.time * 9));
    }
  }

  busy() {
    return this.phase === 'flying' || this.phase === 'warmup';
  }

  destroy() {
    this.stopHum();
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
    this.skyTex?.destroy(true);
    this.skylineTex?.destroy(true);
    this.frameTex?.destroy(true);
    this.barTex?.destroy(true);
  }
}

function drawStation() {
  const c = new Container();
  const g = new Graphics();
  // A round observatory table with a moon dome and a flight curve inlaid in brass.
  g.roundRect(4, 8, 120, 84, 18).fill({ color: 0x000000, alpha: 0.4 });
  g.roundRect(0, 0, 120, 84, 18).fill(0x141a3a).stroke({ color: COLORS.brass, width: 2 });
  for (let i = 0; i < 14; i++) g.circle(8 + ((i * 37) % 104), 8 + ((i * 23) % 68), 1.2).fill({ color: 0xfff6e6, alpha: 0.7 });
  g.moveTo(14, 70).bezierCurveTo(50, 68, 74, 50, 92, 20).stroke({ color: COLORS.lamp, width: 3 });
  g.circle(98, 18, 11).fill(0xf6e4b0);
  for (let i = 0; i < 3; i++) g.circle(28 + i * 32, 98, 9).fill(0x3a2230).stroke({ color: COLORS.brassDark, width: 2 });
  c.addChild(g);
  const lamp = new Graphics().circle(98, 18, 6).fill(0xfff1c4);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const crash: GameDefinition = {
  id: 'crash',
  name: 'Mondflug',
  houseEdge: 1 - RTP,
  footprint: { w: 120, h: 84 },
  size: 'table',
  drawStation,
  create: (ctx) => new CrashGame(ctx),
};
