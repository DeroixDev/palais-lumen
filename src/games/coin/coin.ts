// "Mondmünze": call Mond or Sonne, flick the big brass coin. Every right call grows the
// win and lights the next moon phase; keep flipping or collect. A wrong call loses it all.
//
// Report tags: 'coin' (every round), 'streak3' (3+ right calls in the round), 'streak6'
// (6+), 'fullmoon' (all 8), 'cashout' (collected), 'bust' (a wrong call).

import { Container, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, sparkTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { LadderDeck, SCENE_W, fmtMult, ladderWin, layoutLadder } from '../ladderKit';
import { COIN_RTP, MAX_FLIPS, coinMult, coinPayout, coinPayoutShown, flipCoin, type Side } from './rules';
import { COIN_R, MOON, TABLE, bandTexture, capTexture, faceTexture, phaseTexture, sceneTexture } from './paint';
import { luckStep } from '../../core/debugLuck';

import { COIN_FACE, CURRENCY } from '../../core/brand';
const BETS = [10, 20, 50, 100, 200, 500];
const RULES =
  `Tippe auf Mond oder ${COIN_FACE} und wirf die Münze – sie fällt genau 50 : 50.\n\n` +
  'Der erste Treffer zahlt 1,9×, jeder weitere verdoppelt den Gewinn (3,8×, 7,6× … bis 243,2× beim Vollmond nach 8 Treffern). ' +
  'Nach jedem Treffer: weiter werfen oder kassieren. Ein Fehlwurf, und der Einsatz ist weg.\n\n' +
  'So zahlt jede Serie auf Dauer genau 95 %.';
const SIDE_NAME: Record<Side, string> = { mond: 'Mond', falter: COIN_FACE };
/** View tilt: a coin lying flat shows as an ellipse 0.42 as tall as wide. */
const TILT = Math.acos(0.42);
const THICK = 11;
const REST_Y = TABLE.y - 8;
const METER_Y = 126;

type Phase = 'idle' | 'play' | 'anim' | 'done';

class CoinGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private scene = new Container();
  private coin = new Container();
  private face!: Sprite;
  private cap!: Sprite;
  private band!: Sprite;
  private glint!: Sprite;
  private shadow!: Sprite;
  private fxLayer = new Container();
  private phases: { s: Sprite; glow: Sprite; cap: Text }[] = [];
  private historyLayer = new Container();
  private history: Side[] = [];
  private deck: LadderDeck;
  private bigText!: Text;
  private subText!: Text;
  private sideButtons: Button[] = [];
  private sideNote?: Text;

  private phase: Phase = 'idle';
  private call: Side = 'mond';
  private angle = 0;
  private streak = 0;
  private stake = 0;
  private betIndex = 0;
  private bets: number[];
  private stakeWatch: StakeWatch;
  private time = 0;
  private calm = reducedMotion();

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.mainAction();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.deck = new LadderDeck({
      rtp: COIN_RTP,
      accent: COLORS.lamp,
      rules: RULES,
      options: (tall, w) => this.buildOptions(tall, w),
      refresh: () => this.refreshOptions(),
      onMain: () => this.mainAction(),
      onSecond: () => this.collect(),
      onBet: (d) => this.changeBet(d),
    });
    this.deck.rulesHost = this.scene;
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Build ---------------------------------------------------------------------------

  private build() {
    this.board.addChild(this.scene, this.deck.view);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(SCENE_W / 2, 220);
    halo.width = SCENE_W * 1.8;
    halo.height = 600;
    halo.tint = COLORS.lamp;
    halo.alpha = 0.12;
    halo.blendMode = 'add';
    this.scene.addChild(halo, new Sprite(sceneTexture()));
    const title = new Text({ text: 'MONDMÜNZE', style: { fontFamily: FONT_DISPLAY, fontSize: 18, fill: 0x2a1406, letterSpacing: 2, dropShadow: { color: 0xfff4d0, alpha: 0.5, blur: 0, distance: 1.2, angle: Math.PI / 2 } } });
    title.anchor.set(0.5);
    title.position.set(SCENE_W / 2, 26);
    if (title.width > 156) title.scale.set(156 / title.width);
    this.bigText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0xfff6e6 } });
    this.bigText.anchor.set(0.5);
    this.bigText.position.set(SCENE_W / 2, 65);
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
    this.subText.anchor.set(0.5);
    this.subText.position.set(SCENE_W / 2, 85);
    this.scene.addChild(title, this.bigText, this.subText);

    // Streak meter: eight moon phases, each with the win it stands for.
    for (let i = 0; i < MAX_FLIPS; i++) {
      const x = 36 + i * ((SCENE_W - 72) / (MAX_FLIPS - 1));
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(x, METER_Y);
      glow.width = glow.height = 70;
      glow.tint = MOON;
      glow.blendMode = 'add';
      glow.alpha = 0;
      const s = new Sprite(phaseTexture(i, false));
      s.anchor.set(0.5);
      s.position.set(x, METER_Y);
      const m = coinMult(i + 1);
      const cap = new Text({ text: m.toFixed(1).replace('.', ','), style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: 0xb8a684 } });
      cap.anchor.set(0.5, 0);
      cap.position.set(x, METER_Y + 20);
      if (cap.width > 42) cap.scale.set(42 / cap.width);
      this.scene.addChild(glow, s, cap);
      this.phases.push({ s, glow, cap });
    }

    // Shadow on the table, then the coin: underside, milled edge, face, glint.
    this.shadow = new Sprite(glowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x000000;
    this.shadow.position.set(TABLE.x, TABLE.y + 4);
    this.scene.addChild(this.shadow);
    this.cap = new Sprite(capTexture());
    this.cap.anchor.set(0.5);
    this.band = new Sprite(bandTexture());
    this.band.anchor.set(0.5);
    this.face = new Sprite(faceTexture('mond'));
    this.face.anchor.set(0.5);
    this.glint = new Sprite(glowTexture());
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = 0xfff6e0;
    this.glint.width = this.glint.height = COIN_R * 2.4;
    this.glint.alpha = 0;
    this.coin.addChild(this.cap, this.band, this.face, this.glint);
    this.coin.position.set(TABLE.x, REST_Y);
    this.historyLayer.position.set(TABLE.x, TABLE.y + 52);
    this.scene.addChild(this.coin, this.historyLayer, this.fxLayer);
    this.pose(0, 0);
    this.changeBet(0);
    this.refresh();
  }

  private buildOptions(tall: boolean, w: number) {
    const c = new Container();
    this.sideButtons = [];
    const bw = (w - 10) / 2;
    (['mond', 'falter'] as Side[]).forEach((side, i) => {
      const icon = new Sprite(faceTexture(side));
      icon.anchor.set(0.5);
      icon.width = icon.height = 26;
      const b = button({
        label: SIDE_NAME[side],
        ariaLabel: (t) => `Tipp: ${t}`,
        width: bw,
        height: tall ? 46 : 50,
        color: 0x4a2a3a,
        textColor: 0xfff6e6,
        fontSize: 22,
        display: false,
        icon,
        iconWidth: 26,
        onClick: () => this.setCall(side),
      });
      b.position.set(bw / 2 + i * (bw + 10), tall ? 26 : 42);
      this.sideButtons.push(b);
      c.addChild(b);
    });
    if (!tall) {
      const cap = label('DEIN TIPP', 17, 0xd9c6a0);
      cap.anchor.set(0.5);
      cap.position.set(w / 2, 8);
      this.sideNote = new Text({ text: 'Chance je Wurf: 50 %', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
      this.sideNote.anchor.set(0.5);
      this.sideNote.position.set(w / 2, 82);
      c.addChild(cap, this.sideNote);
    } else this.sideNote = undefined;
    return c;
  }

  private refreshOptions() {
    this.sideButtons.forEach((b, i) => {
      const on = (['mond', 'falter'] as Side[])[i] === this.call;
      b.setSelected(on);
      b.alpha = on ? 1 : 0.8;
      b.setEnabled(this.phase !== 'anim' || on);
    });
  }

  // ---- State ---------------------------------------------------------------------------

  private setCall(side: Side) {
    if (this.phase === 'anim') return;
    this.call = side;
    this.ctx.sfx.chip();
    this.refresh();
  }

  private changeBet(d: number) {
    if (this.phase === 'play' || this.phase === 'anim') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.deck.setBet(this.bet, this.betIndex > 0, this.betIndex < this.bets.length - 1);
  }

  private refresh() {
    const p = this.phase;
    if (p === 'idle' || p === 'done') {
      if (p === 'idle') this.status(`TIPP: ${SIDE_NAME[this.call].toUpperCase()}`, 0xfff6e6, '1. Treffer 1,90× · dann ×2 je Treffer');
    } else if (p === 'play') {
      this.status(fmtMult(coinMult(this.streak)), COLORS.lamp, `Serie ${this.streak} · nächster ${fmtMult(coinMult(this.streak + 1))}`);
    }
    this.deck.setMain(p === 'play' ? `WERFEN · ${SIDE_NAME[this.call].toUpperCase()}` : 'WERFEN', p !== 'anim');
    const can = p === 'play' && this.streak > 0;
    this.deck.setSecond(can ? `KASSIEREN ${formatChips(coinPayoutShown(this.stake, this.streak))}` : 'KASSIEREN', can);
    this.deck.lockBet(p === 'play' || p === 'anim');
    this.refreshOptions();
  }

  private status(big: string, col: number, sub: string) {
    this.bigText.text = big;
    this.bigText.style.fill = col;
    this.bigText.scale.set(1);
    if (this.bigText.width > 222) this.bigText.scale.set(222 / this.bigText.width);
    this.subText.text = sub;
    this.subText.scale.set(1);
    if (this.subText.width > 222) this.subText.scale.set(222 / this.subText.width);
  }

  private pop(k = 1.15) {
    if (this.calm) return;
    this.bigText.scale.set(this.bigText.scale.x * k);
    const s = Math.min(1, 222 / (this.bigText.width / this.bigText.scale.x));
    void tween(this.bigText.scale, { x: s, y: s }, 300, ease.outBack);
  }

  private mainAction() {
    if (this.phase === 'anim') return;
    if (this.phase === 'play') {
      void this.flip();
      return;
    }
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY} für diesen Einsatz.`);
      return;
    }
    this.deck.closeRules();
    this.stake = bet;
    this.streak = 0;
    this.phase = 'play';
    this.lightMeter(0);
    void this.flip();
  }

  /** Coin pose for the turn angle `a` (0 = Mond up) at `lift` (0 on the table … 1 at the top). */
  private pose(a: number, lift: number) {
    const q = Math.cos(a - TILT);
    const side: Side = q >= 0 ? 'mond' : 'falter';
    this.face.texture = faceTexture(side);
    const k = 1 + 0.16 * lift;
    const sy = Math.max(0.03, Math.abs(q)) * k;
    this.face.scale.set(k, sy);
    this.cap.scale.set(k, sy);
    const d = (THICK / 2) * Math.sqrt(Math.max(0, 1 - q * q)) * k;
    this.face.y = -d;
    this.cap.y = d;
    this.band.scale.set(k, (2 * d) / 16);
    this.band.visible = d > 0.3;
    this.glint.alpha = Math.max(0, Math.abs(q) - 0.9) * 7;
    this.glint.scale.y = this.glint.scale.x * Math.max(0.3, Math.abs(q));
    this.shadow.width = COIN_R * 2.3 * (1 - 0.5 * lift);
    this.shadow.height = COIN_R * 0.9 * (1 - 0.5 * lift);
    this.shadow.alpha = 0.55 - 0.35 * lift;
  }

  private async flip() {
    if (this.phase !== 'play') return;
    this.phase = 'anim';
    // The result is fixed before the coin leaves the table.
    const call = this.call;
    const result = luckStep(() => flipCoin(), (r) => r === call);
    this.refresh();
    this.status(this.streak ? fmtMult(coinMult(this.streak)) : `TIPP: ${SIDE_NAME[call].toUpperCase()}`, this.streak ? COLORS.lamp : 0xfff6e6, 'Die Münze fliegt …');
    this.ctx.sfx.coinFlip();
    const up: Side = Math.cos(this.angle) > 0 ? 'mond' : 'falter';
    const a0 = up === 'mond' ? 0 : Math.PI;
    const turns = 8 + (result !== up ? 1 : 0);
    const a1 = a0 + Math.PI * turns;
    const H = 150;
    if (this.calm) {
      await animate(350, (t) => {
        if (this.coin.destroyed) return;
        this.coin.y = REST_Y - 40 * Math.sin(t * Math.PI);
        this.pose(a0 + (a1 - a0) * t, 0.2 * Math.sin(t * Math.PI));
      });
    } else {
      await animate(1150, (t) => {
        if (this.coin.destroyed) return;
        const lift = 4 * t * (1 - t);
        this.coin.y = REST_Y - H * lift;
        this.coin.rotation = 0.16 * Math.sin(t * Math.PI * 2);
        this.pose(a0 + (a1 - a0) * (1 - Math.pow(1 - t, 1.5)), lift);
      });
    }
    if (this.view.destroyed) return;
    this.angle = a1;
    this.coin.rotation = 0;
    this.ctx.sfx.coinLand();
    // Landing wobble: it rocks on its rim and settles.
    if (!this.calm) {
      await animate(620, (t) => {
        if (this.coin.destroyed) return;
        const damp = Math.exp(-5 * t);
        this.pose(a1 + 0.4 * damp * Math.sin(t * 26), 0);
        this.coin.y = REST_Y - Math.abs(Math.sin(t * Math.PI * 2.2)) * 8 * damp;
        this.coin.rotation = 0.05 * damp * Math.sin(t * 19);
      });
      if (this.view.destroyed) return;
    }
    this.pose(a1, 0);
    this.coin.y = REST_Y;
    this.coin.rotation = 0;
    this.addHistory(result);
    if (result === call) this.hit();
    else this.miss(result);
  }

  private hit() {
    this.streak++;
    this.ctx.sfx.lineHit(this.streak - 1);
    this.lightMeter(this.streak, true);
    const g = this.scene.toGlobal({ x: this.coin.x, y: this.coin.y });
    this.ctx.particles.sparkle(g.x, g.y, this.calm ? 3 : 10, COLORS.lamp, 100 * this.board.scale.x);
    if (this.streak >= MAX_FLIPS) {
      this.phase = 'play';
      this.collect(true);
      return;
    }
    this.phase = 'play';
    this.refresh();
    this.pop();
  }

  private miss(result: Side) {
    const k = this.streak;
    this.ctx.state.report({ game: 'coin', stake: this.stake, win: 0, rtp: COIN_RTP, tags: this.tags(k, ['bust']) });
    this.ctx.sfx.lose();
    this.status('DANEBEN', 0xff9a7a, `${SIDE_NAME[result]} – der Einsatz ist weg.`);
    this.deck.setMain('WERFEN', false);
    this.deck.setSecond('KASSIEREN', false);
    // The moon phases go dark one after another, the coin dulls for a moment.
    this.coin.alpha = 0.7;
    void tween(this.coin, { alpha: 1 }, 900, ease.inCubic, 300);
    for (let i = k - 1; i >= 0; i--) {
      const p = this.phases[i];
      void wait(this.calm ? 0 : (k - 1 - i) * 70).then(() => {
        if (p.s.destroyed) return;
        p.s.texture = phaseTexture(i, false);
        p.glow.alpha = 0;
        p.cap.style.fill = 0xb8a684;
      });
    }
    void wait(this.calm ? 150 : 400 + k * 70).then(() => this.endRound());
  }

  private collect(auto = false) {
    if (this.phase !== 'play' || this.streak === 0) return;
    this.phase = 'anim';
    const k = this.streak;
    const m = coinMult(k);
    const win = coinPayout(this.stake, k);
    this.ctx.state.payout(win);
    const tags = this.tags(k, ['cashout']);
    this.ctx.state.report({ game: 'coin', stake: this.stake, win, rtp: COIN_RTP, tags });
    this.status(`+${formatChips(win)}`, COLORS.lamp, auto ? `VOLLMOND! ${fmtMult(m)}` : `Kassiert nach ${k} ${k === 1 ? 'Treffer' : 'Treffern'} · ${fmtMult(m)}`);
    this.deck.setMain('WERFEN', false);
    this.deck.setSecond('KASSIEREN', false);
    this.pop(1.25);
    // All lit phases flare together.
    for (let i = 0; i < k; i++) {
      const p = this.phases[i];
      p.glow.alpha = 1;
      void tween(p.glow, { alpha: 0.45 }, 700, ease.outCubic, i * 40);
    }
    if (!this.calm) this.coinSparks();
    const at = this.scene.toGlobal({ x: SCENE_W / 2, y: 70 });
    const local = this.view.toLocal(at);
    floatText(this.view, local.x, local.y - 10, `+${formatChips(win)}`, COLORS.lamp, Math.round(30 * Math.max(0.8, this.board.scale.x)));
    void ladderWin(this.ctx, this.board, this.scene, m, win, at, { big: 'MONDSERIE', jackpot: 'VOLLMOND' }).then(() => this.endRound());
  }

  private coinSparks() {
    for (let i = 0; i < 8; i++) {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      s.tint = i % 2 ? 0xffffff : COLORS.lamp;
      s.blendMode = 'add';
      const a = (i / 8) * Math.PI * 2;
      s.position.set(this.coin.x, this.coin.y);
      s.scale.set(0);
      this.fxLayer.addChild(s);
      void animate(700, (q) => {
        if (s.destroyed) return;
        s.x = this.coin.x + Math.cos(a) * 90 * q;
        s.y = this.coin.y + Math.sin(a) * 40 * q - 20 * q;
        s.scale.set(Math.sin(q * Math.PI) * 0.9);
      }).then(() => s.destroy());
    }
  }

  private tags(k: number, extra: string[]) {
    const t = ['coin', ...extra];
    if (k >= 3) t.push('streak3');
    if (k >= 6) t.push('streak6');
    if (k >= MAX_FLIPS) t.push('fullmoon');
    return t;
  }

  /** Lights phases up to `n`; the newest one pops. */
  private lightMeter(n: number, popLast = false) {
    this.phases.forEach((p, i) => {
      const on = i < n;
      p.s.texture = phaseTexture(i, on);
      p.glow.alpha = on ? 0.45 : 0;
      p.cap.style.fill = on ? 0xfff1c4 : 0xb8a684;
      if (popLast && i === n - 1) {
        p.glow.alpha = 1;
        void tween(p.glow, { alpha: 0.45 }, 600, ease.outCubic);
        if (!this.calm) {
          p.s.scale.set(1.6);
          void tween(p.s.scale, { x: 1, y: 1 }, 380, ease.outBack);
        }
      }
    });
  }

  private addHistory(side: Side) {
    this.history.unshift(side);
    if (this.history.length > 9) this.history.pop();
    this.historyLayer.removeChildren().forEach((c) => c.destroy());
    this.history.forEach((s, i) => {
      const sp = new Sprite(faceTexture(s));
      sp.anchor.set(0.5);
      sp.width = sp.height = 22;
      sp.x = (i - (this.history.length - 1) / 2) * 26;
      sp.alpha = i === 0 ? 1 : 0.6;
      this.historyLayer.addChild(sp);
    });
  }

  private endRound() {
    if (this.view.destroyed) return;
    this.phase = 'done';
    this.streak = 0;
    this.deck.setMain('WERFEN', true);
    this.deck.lockBet(false);
    this.refresh();
  }

  // ---- Frame ---------------------------------------------------------------------------

  resize(w: number, h: number) {
    layoutLadder(this.view, this.board, this.scene, this.deck, w, h);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    this.time += dtMs / 1000;
    if (this.calm || this.phase === 'anim') return;
    // Lit moon phases shimmer softly.
    for (const [i, p] of this.phases.entries()) if (p.glow.alpha > 0 && p.glow.alpha < 0.9) p.glow.alpha = 0.4 + Math.sin(this.time * 2 + i * 0.6) * 0.08;
  }

  busy() {
    return this.phase === 'play' || this.phase === 'anim';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

function drawStation() {
  // The painted coin machine (paint.ts) stands in every room; this is only the flat fallback.
  const c = new Container();
  const s = new Sprite(faceTexture('mond'));
  s.width = 64;
  s.height = 64;
  s.x = 6;
  const lamp = new Container();
  lamp.label = 'lamp';
  c.addChild(s, lamp);
  return c;
}

export const coin: GameDefinition = {
  id: 'coin',
  name: 'Mondmünze',
  houseEdge: 1 - COIN_RTP,
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: `Mond oder ${COIN_FACE}? Jeder Treffer verdoppelt – kassieren oder weiterwerfen.`,
  drawStation,
  create: (ctx) => new CoinGame(ctx),
};
