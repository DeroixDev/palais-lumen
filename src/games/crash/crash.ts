// "Mondflug": a moth flies towards the full moon while the multiplier climbs.
// Collect before the night wind catches it.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, floatText, glowTexture, gradientTexture, mothTexture } from '../../core/fx';
import { animate, ease, tween } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';

// ---- Rules -------------------------------------------------------------

/** Share of every bet that comes back on average, whatever the player does. */
const RTP = 0.96;
const MAX_MULT = 1000;
/** Growth speed: multiplier = e^(K·seconds). 2× after ~5 s, 10× after ~16 s. */
const K = 0.14;

/**
 * The wind point is drawn before take-off: P(flight reaches x) = 0.96 / x.
 * So 4 % of flights end right at the start, and any cash-out target pays 96 % on average.
 */
export function drawWindPoint(rand = Math.random()) {
  const x = RTP / (1 - rand);
  if (x < 1) return 1;
  return Math.min(MAX_MULT, Math.floor(x * 100) / 100);
}

const fmt = (m: number) => m.toFixed(2).replace('.', ',');
const BETS = [10, 20, 50, 100, 250];
const AUTO = [0, 1.5, 2, 3, 5, 10, 25];
const MILESTONES = [2, 3, 5, 10, 25, 50, 100, 250, 500];

// ---- Layout -------------------------------------------------------------

const W = 720;
const H = 860;
const SKY = { x: 24, y: 96, w: W - 48, h: 520 };

type Phase = 'idle' | 'warmup' | 'flying' | 'done';

interface Star {
  g: Graphics;
  depth: number;
}

class CrashGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private sky = new Container();
  private stars: Star[] = [];
  private clouds: Sprite[] = [];
  private moon = new Container();
  private moonHalo!: Sprite;
  private grid = new Graphics();
  private gridLabels: Text[] = [];
  private curve = new Graphics();
  private curveGlow = new Graphics();
  private moth = new Container();
  private mothWings!: Sprite;
  private mothGlow!: Sprite;
  private multText!: Text;
  private subText!: Text;
  private actionBtn!: Button;
  private betText!: Text;
  private autoBtn!: Button;
  private minus!: Button;
  private plus!: Button;
  private historyLayer = new Container();
  private history: Container[] = [];
  private candle = new Container();

  private phase: Phase = 'idle';
  private betIndex = 1;
  private autoIndex = 0;
  private stake = 0;
  private windAt = 1;
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

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  private get auto() {
    return AUTO[this.autoIndex];
  }

  private build() {
    const b = this.board;
    this.view.addChild(b);

    b.addChild(new Graphics().roundRect(8, 16, W, H, 36).fill({ color: 0x000000, alpha: 0.5 }));
    b.addChild(new Graphics().roundRect(0, 0, W, H, 36).fill(0x170a1a).stroke({ color: COLORS.brass, width: 6 }));

    const title = glowText('MONDFLUG', { fontFamily: FONT_DISPLAY, fontSize: 44, fill: 0xfff6e6, letterSpacing: 4 }, { color: 0x9fd8ff, distance: 16, outerStrength: 2.5 });
    title.position.set(W / 2, 48);
    b.addChild(title);

    // Sky window.
    const sky = this.sky;
    sky.position.set(SKY.x, SKY.y);
    b.addChild(sky);
    const bg = new Sprite(gradientTexture('crash-sky', SKY.w, SKY.h, [[0, '#0a0f2e'], [0.6, '#24123a'], [1, '#4a1a3a']]));
    const mask = new Graphics().roundRect(0, 0, SKY.w, SKY.h, 22).fill(0xffffff);
    sky.addChild(bg, mask);
    sky.mask = mask;

    for (let i = 0; i < 110; i++) {
      const depth = 0.25 + Math.random() * 0.75;
      const g = new Graphics().circle(0, 0, 0.6 + depth * 1.4).fill({ color: 0xfff6e6, alpha: 0.35 + depth * 0.5 });
      g.position.set(Math.random() * SKY.w, Math.random() * SKY.h);
      sky.addChild(g);
      this.stars.push({ g, depth });
    }

    // Full moon in the top right; it grows as the moth gets closer.
    this.moonHalo = new Sprite(glowTexture());
    this.moonHalo.anchor.set(0.5);
    this.moonHalo.width = this.moonHalo.height = 300;
    this.moonHalo.tint = 0xfff1c4;
    this.moonHalo.alpha = 0.45;
    this.moonHalo.blendMode = 'add';
    const disc = new Graphics().circle(0, 0, 46).fill(0xf6e4b0);
    disc.circle(-14, -10, 9).fill({ color: 0xc9a25a, alpha: 0.4 });
    disc.circle(16, 12, 12).fill({ color: 0xc9a25a, alpha: 0.35 });
    disc.circle(8, -22, 5).fill({ color: 0xc9a25a, alpha: 0.4 });
    this.moon.addChild(this.moonHalo, disc);
    this.moon.position.set(SKY.w - 90, 90);
    sky.addChild(this.moon);

    for (let i = 0; i < 4; i++) {
      const c = new Sprite(glowTexture());
      c.anchor.set(0.5);
      c.width = 260 + Math.random() * 140;
      c.height = 60 + Math.random() * 30;
      c.tint = 0x8a7aa8;
      c.alpha = 0.18;
      c.position.set(Math.random() * SKY.w, 120 + Math.random() * (SKY.h - 200));
      sky.addChild(c);
      this.clouds.push(c);
    }

    sky.addChild(this.grid);
    for (let i = 0; i < 6; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 14, fill: 0x9f8fb8 } });
      t.anchor.set(0, 1);
      sky.addChild(t);
      this.gridLabels.push(t);
    }
    sky.addChild(this.curveGlow, this.curve);

    // The candle where every flight starts.
    const cg = new Graphics();
    cg.rect(-7, -26, 14, 26).fill(0xfff1dc);
    cg.ellipse(0, 0, 18, 5).fill(COLORS.brass);
    const flame = new Graphics().ellipse(0, -36, 5, 10).fill(0xffcf4a);
    const flameGlow = new Sprite(glowTexture());
    flameGlow.anchor.set(0.5);
    flameGlow.position.set(0, -36);
    flameGlow.width = flameGlow.height = 90;
    flameGlow.tint = 0xffa94a;
    flameGlow.blendMode = 'add';
    flame.label = 'flame';
    flameGlow.label = 'flameGlow';
    this.candle.addChild(flameGlow, cg, flame);
    this.candle.position.set(40, SKY.h - 14);
    sky.addChild(this.candle);

    this.mothGlow = new Sprite(glowTexture());
    this.mothGlow.anchor.set(0.5);
    this.mothGlow.width = this.mothGlow.height = 110;
    this.mothGlow.tint = COLORS.lamp;
    this.mothGlow.blendMode = 'add';
    this.mothWings = new Sprite(mothTexture());
    this.mothWings.anchor.set(0.5);
    this.mothWings.width = this.mothWings.height = 46;
    this.mothWings.tint = 0xfff1c4;
    this.moth.addChild(this.mothGlow, this.mothWings);
    sky.addChild(this.moth);

    this.multText = new Text({ text: '1,00×', style: { fontFamily: FONT_DISPLAY, fontSize: 84, fill: 0xfff6e6, stroke: { color: 0x0a0610, width: 8 } } });
    this.multText.anchor.set(0.5);
    this.multText.position.set(SKY.x + SKY.w / 2, SKY.y + 170);
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '700', fill: 0xd9c6ff, align: 'center' } });
    this.subText.anchor.set(0.5);
    this.subText.position.set(SKY.x + SKY.w / 2, SKY.y + 250);
    b.addChild(this.multText, this.subText);
    b.addChild(new Graphics().roundRect(SKY.x, SKY.y, SKY.w, SKY.h, 22).stroke({ color: COLORS.brassDark, width: 3 }));

    this.historyLayer.position.set(W / 2, SKY.y + SKY.h + 28);
    b.addChild(this.historyLayer);

    // Controls.
    const cy = SKY.y + SKY.h + 96;
    const betLabel = label('EINSATZ', 14, 0xb69a6a);
    betLabel.position.set(40, cy - 46);
    b.addChild(betLabel);
    this.minus = button({ label: '–', width: 44, height: 44, onClick: () => this.changeBet(-1) });
    this.minus.position.set(62, cy - 4);
    this.plus = button({ label: '+', width: 44, height: 44, onClick: () => this.changeBet(1) });
    this.plus.position.set(226, cy - 4);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.betText.position.set(144, cy - 4);
    b.addChild(this.minus, this.plus, this.betText);
    const autoLabel = label('AUTO-EINSAMMELN', 14, 0xb69a6a);
    autoLabel.position.set(40, cy + 34);
    b.addChild(autoLabel);
    this.autoBtn = button({ label: '', width: 208, height: 40, color: 0x3a2a30, textColor: 0xfff6e6, fontSize: 18, display: false, onClick: () => this.cycleAuto() });
    this.autoBtn.position.set(144, cy + 76);
    b.addChild(this.autoBtn);

    this.actionBtn = button({ label: 'ABFLUG', width: 300, height: 96, color: 0x9fd8ff, textColor: 0x0a0f2e, fontSize: 30, onClick: () => this.action() });
    this.actionBtn.position.set(W - 190, cy + 20);
    b.addChild(this.actionBtn);
    const rtp = new Text({
      text: `Auszahlungsquote ${Math.round(RTP * 100)} % · Hausvorteil ${Math.round((1 - RTP) * 100)} %`,
      style: { fontFamily: FONT_BODY, fontSize: 16, fill: 0xd9c6a0 },
    });
    rtp.anchor.set(0.5);
    rtp.position.set(W - 190, cy + 88);
    b.addChild(rtp);

    this.changeBet(0);
    this.cycleAuto(0);
    this.resetFlight();
    this.subText.text = 'Die Motte fliegt zum Mond. Je höher, desto mehr.\nSammle ein, bevor der Nachtwind sie erwischt.';
  }

  private changeBet(d: number) {
    if (this.phase === 'flying' || this.phase === 'warmup') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.minus.setEnabled(this.betIndex > 0);
    this.plus.setEnabled(this.betIndex < this.bets.length - 1);
  }

  private cycleAuto(step = 1) {
    if (this.phase === 'flying' || this.phase === 'warmup') return;
    this.autoIndex = (this.autoIndex + step) % AUTO.length;
    this.autoBtn.setLabel(this.auto ? `bei ${fmt(this.auto)}×` : 'aus');
  }

  private action() {
    if (this.phase === 'flying') this.collect(this.mult);
    else if (this.phase === 'idle' || this.phase === 'done') this.launch();
  }

  private resetFlight() {
    this.t = 0;
    this.mult = 1;
    this.nextMilestone = 0;
    this.curve.clear();
    this.curveGlow.clear();
    this.moth.alpha = 1;
    this.moth.rotation = 0;
    this.moth.scale.set(1);
    this.moth.position.set(this.candle.x + 10, this.candle.y - 64);
    this.moon.scale.set(0.8);
    this.multText.text = '1,00×';
    this.multText.style.fill = 0xfff6e6;
    this.multText.scale.set(1);
    this.multText.alpha = 1;
    this.drawGrid(8, 2);
  }

  private launch() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.stake = bet;
    // The result exists before anything moves.
    this.windAt = drawWindPoint();
    this.resetFlight();
    this.phase = 'warmup';
    this.actionBtn.setEnabled(false);
    this.actionBtn.setLabel('…');
    this.subText.text = 'Die Motte wärmt sich an der Kerze …';
    this.ctx.sfx.spinStart();
    // Short warm-up: the moth circles the flame once, then takes off.
    const cx = this.candle.x;
    const cy = this.candle.y - 40;
    void animate(
      900,
      (k) => {
        const a = k * Math.PI * 2 - Math.PI / 2;
        this.moth.position.set(cx + Math.cos(a) * 26, cy + Math.sin(a) * 14 - 20 * k);
        this.mothWings.scale.x = (46 / this.mothWings.texture.width) * (0.4 + 0.6 * Math.abs(Math.cos(k * 30)));
      },
      ease.inOutCubic,
    ).then(() => {
      if (this.phase !== 'warmup') return;
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

  private updateActionLabel() {
    const win = Math.floor(this.stake * this.mult);
    this.actionBtn.setLabel(`EINSAMMELN ${formatChips(win)}`);
  }

  private collect(m: number) {
    if (this.phase !== 'flying') return;
    this.phase = 'done';
    this.stopHum();
    const win = Math.floor(this.stake * m);
    this.ctx.state.payout(win);
    this.mult = m;
    this.multText.text = `${fmt(m)}×`;
    this.multText.style.fill = COLORS.lamp;
    this.actionBtn.setLabel('NOCHMAL');
    this.subText.text = `Eingesammelt bei ${fmt(m)}× · +${formatChips(win)} Falter`;
    void tween(this.multText.scale, { x: 1.25, y: 1.25 }, 160, ease.outCubic).then(() => tween(this.multText.scale, { x: 1, y: 1 }, 400, ease.outBack));
    this.addHistory(m, true);

    // The moth lands safely on the moon's light: it glides up and out.
    const p = this.sky.toGlobal(this.moth.position);
    const local = this.view.toLocal(p);
    floatText(this.view, local.x, local.y - 30, `+${formatChips(win)}`, COLORS.lamp, 32);
    const sx = this.moth.x;
    const sy = this.moth.y;
    const mx = this.moon.x;
    const my = this.moon.y;
    void animate(
      900,
      (k) => {
        this.moth.position.set(sx + (mx - sx) * k, sy + (my - sy) * k);
        this.moth.scale.set(1 - 0.6 * k);
        this.moth.alpha = 1 - k * 0.8;
      },
      ease.inOutCubic,
    ).then(() => {
      this.moonHalo.alpha = 0.9;
      void tween(this.moonHalo, { alpha: 0.45 }, 700);
    });
    if (m > 1) {
      const moonG = this.sky.toGlobal(this.moon.position);
      this.ctx.celebrate(m, p.x, p.y, { x: moonG.x, y: moonG.y, r: 120 * this.board.scale.x });
    } else {
      this.ctx.sfx.partial();
    }
  }

  /** The night wind catches the moth: it tumbles down gently and the round is over. */
  private wind() {
    this.phase = 'done';
    this.stopHum();
    this.ctx.sfx.fizzle();
    this.ctx.shake(5);
    this.multText.text = `${fmt(this.windAt)}×`;
    this.multText.style.fill = 0x9fb8ff;
    this.subText.text = this.windAt <= 1 ? 'Windstoß gleich beim Start.' : `Windstoß bei ${fmt(this.windAt)}×`;
    this.actionBtn.setEnabled(true);
    this.actionBtn.setLabel('NOCHMAL');
    this.addHistory(this.windAt, false);
    // Gust lines across the sky.
    for (let i = 0; i < 7; i++) {
      const y = this.moth.y - 80 + Math.random() * 160;
      const g = new Graphics().moveTo(0, 0).bezierCurveTo(60, -10, 120, 10, 180, 0).stroke({ color: 0xcfe0ff, width: 2, alpha: 0.7 });
      g.position.set(-200, y);
      this.sky.addChild(g);
      void tween(g, { x: SKY.w + 40 }, 500 + Math.random() * 300, ease.inOutCubic, i * 50).then(() => g.destroy());
    }
    const sx = this.moth.x;
    const sy = this.moth.y;
    void animate(
      1400,
      (k) => {
        this.moth.x = sx + 160 * k + Math.sin(k * 14) * 18;
        this.moth.y = sy + (SKY.h + 40 - sy) * k * k;
        this.moth.rotation = k * 7;
        this.moth.alpha = 1 - k * 0.7;
      },
      ease.linear,
    );
  }

  private addHistory(m: number, won: boolean) {
    const c = new Container();
    const w = 64;
    c.addChild(new Graphics().roundRect(-w / 2, -14, w, 28, 9).fill(won ? COLORS.lamp : 0x3a3060));
    const t = new Text({ text: `${fmt(m)}×`, style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: won ? 0x14080f : 0xcfe0ff } });
    t.anchor.set(0.5);
    c.addChild(t);
    this.historyLayer.addChild(c);
    this.history.unshift(c);
    if (this.history.length > 8) this.history.pop()!.destroy({ children: true });
    this.history.forEach((h, i) => {
      h.alpha = i === 0 ? 1 : 0.75;
      void tween(h, { x: (3.5 - i) * (w + 8) }, 220);
    });
    c.x = 4.5 * (w + 8);
    c.scale.set(0.3);
    void tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  /** Axis: time on x, multiplier on y; both stretch as the flight goes on. */
  private drawGrid(tMax: number, mMax: number) {
    const g = this.grid.clear();
    const steps = mMax <= 3 ? 0.5 : mMax <= 6 ? 1 : mMax <= 15 ? 2 : mMax <= 40 ? 5 : mMax <= 120 ? 20 : mMax <= 400 ? 50 : 200;
    let i = 0;
    for (let m = 1 + steps; m < mMax && i < this.gridLabels.length; m += steps, i++) {
      const y = this.my(m, mMax);
      g.moveTo(0, y).lineTo(SKY.w, y).stroke({ color: 0x9f8fb8, width: 1, alpha: 0.18 });
      const t = this.gridLabels[i];
      t.text = `${fmt(m).replace(',00', '')}×`;
      t.position.set(8, y - 2);
      t.visible = true;
    }
    for (; i < this.gridLabels.length; i++) this.gridLabels[i].visible = false;
    void tMax;
  }

  private mx(t: number, tMax: number) {
    return 70 + (t / tMax) * (SKY.w - 170);
  }

  private my(m: number, mMax: number) {
    return SKY.h - 70 - ((m - 1) / (mMax - 1)) * (SKY.h - 190);
  }

  resize(w: number, h: number) {
    const s = Math.min((w * 0.95) / W, (h * 0.94) / H);
    this.board.scale.set(s);
    this.board.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.time += dt;
    // Candle flicker.
    const flame = this.candle.getChildByLabel('flame');
    const fg = this.candle.getChildByLabel('flameGlow');
    if (flame) flame.scale.set(1 + Math.sin(this.time * 17) * 0.06, 1 + Math.sin(this.time * 11) * 0.1);
    if (fg) fg.alpha = 0.6 + Math.sin(this.time * 9) * 0.15;

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
    }
    // Stars and clouds drift down: the moth is climbing.
    for (const s of this.stars) {
      s.g.y += speed * s.depth * dt;
      if (s.g.y > SKY.h) {
        s.g.y -= SKY.h;
        s.g.x = Math.random() * SKY.w;
      }
    }
    for (const c of this.clouds) {
      c.y += speed * 0.6 * dt;
      c.x += 8 * dt;
      if (c.y > SKY.h + 40) {
        c.y = -40;
        c.x = Math.random() * SKY.w;
      }
      if (c.x > SKY.w + 150) c.x = -150;
    }
    if (this.phase === 'idle' || this.phase === 'done') {
      // Idle moth hovers by the candle.
      if (this.phase === 'idle') this.moth.position.set(this.candle.x + 18 + Math.sin(this.time * 1.7) * 14, this.candle.y - 70 + Math.sin(this.time * 2.3) * 8);
      this.mothWings.scale.x = (46 / this.mothWings.texture.width) * (0.4 + 0.6 * Math.abs(Math.cos(this.time * 9)));
    }
  }

  /** Moves the flight to multiplier m and redraws the curve. */
  private advance(m: number) {
    this.mult = m;
    const t = Math.log(m) / K;
    const tMax = Math.max(8, t * 1.15);
    const mMax = Math.max(2, m * 1.25);
    this.drawGrid(tMax, mMax);
    // Rebuild the curve from the formula so rescaling stays smooth.
    const pts: number[] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const ti = (t * i) / n;
      pts.push(this.mx(ti, tMax), this.my(Math.exp(K * ti), mMax));
    }
    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];
    this.curveGlow.clear().poly([...pts, hx, SKY.h, this.mx(0, tMax), SKY.h]).fill({ color: COLORS.lamp, alpha: 0.12 });
    this.curve.clear().moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) this.curve.lineTo(pts[i], pts[i + 1]);
    this.curve.stroke({ color: COLORS.lamp, width: 4, alpha: 0.95 });
    const px = pts[pts.length - 4];
    const py = pts[pts.length - 3];
    this.moth.position.set(hx, hy);
    this.moth.rotation = Math.atan2(hy - py, hx - px) + Math.PI / 2;
    this.mothWings.scale.x = (46 / this.mothWings.texture.width) * (0.35 + 0.65 * Math.abs(Math.cos(this.time * 14)));
    this.mothGlow.alpha = 0.6 + 0.4 * Math.sin(this.time * 6);
    this.moon.scale.set(Math.min(2.2, 0.8 + Math.log(m) * 0.32));

    this.multText.text = `${fmt(m)}×`;
    this.multText.style.fill = m >= 10 ? COLORS.neon : m >= 2 ? COLORS.lamp : 0xfff6e6;
    if (this.phase === 'flying') this.updateActionLabel();
    // Milestones: a little pulse and a rising note.
    if (MILESTONES[this.nextMilestone] !== undefined && m >= MILESTONES[this.nextMilestone]) {
      this.ctx.sfx.lineHit(this.nextMilestone);
      this.nextMilestone++;
      this.multText.scale.set(1.18);
      void tween(this.multText.scale, { x: 1, y: 1 }, 380, ease.outBack);
      const ring = new Graphics().circle(0, 0, 20).stroke({ color: COLORS.lamp, width: 3 });
      ring.position.set(hx, hy);
      this.sky.addChild(ring);
      void tween(ring.scale, { x: 4, y: 4 }, 600, ease.outCubic);
      void tween(ring, { alpha: 0 }, 600).then(() => ring.destroy());
    }
  }

  busy() {
    return this.phase === 'flying' || this.phase === 'warmup';
  }

  destroy() {
    this.stopHum();
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
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
  drawStation,
  create: (ctx) => new CrashGame(ctx),
};
