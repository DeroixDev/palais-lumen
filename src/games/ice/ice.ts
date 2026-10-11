// "Eisstraße": a penguin hops across a night river on drifting ice floes. Every floe it reaches
// raises the multiplier; collect whenever you like. One floe may break – drawn before the
// first hop – and then the penguin goes for a short swim (and pops right back up, unharmed).
//
// Report tags: 'ice' (every round), 'ice5' (collected at 5× or more), 'ice10' (10× or more),
// 'splash' (a floe broke), 'across' (reached the far bank).

import { Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { winStage } from '../slots/stage';
import { StakeWatch } from '../stakeWatch';
import { SceneShell, betStepper, caption, fmtX, rtpText, type Layout } from '../sceneShell';
import { LEVELS, LEVEL_ORDER, RTP, drawBreak, drawBreakSteady, multAt, payout, steadyRtp, type Level } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import {
  PENGUIN,
  bankTexture,
  chunkTexture,
  crackTexture,
  flakeTexture,
  floeTexture,
  halfTexture,
  hutTexture,
  lanternTexture,
  penguinTexture,
  signTexture,
  starTexture,
  swimTexture,
  waterTexture,
} from './paint';
import { luckStep, luckOn } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const BETS = [10, 20, 50, 100, 200, 500];
const ROW = 124;
const CREAM = 0xfff3dc;
const GOLD = 0xffcf7a;
const ICE = 0x9fe8ff;
const FLOE_SCALE = 0.86;
const BANK_DEPTH = 1000;

type Phase = 'idle' | 'hop' | 'stand' | 'fall' | 'reset';

interface Floe {
  k: number;
  c: Container;
  body: Sprite;
  crack: Sprite;
  label: Text;
  ph: number;
  seed: number;
}

interface Chunk {
  s: Sprite;
  v: number;
}

interface Flake {
  s: Sprite;
  v: number;
  sway: number;
}

class IceGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  private rig = new Container();
  private world = new Container();
  private water!: TilingSprite;
  private chunkLayer = new Container();
  private floeLayer = new Container();
  private fxLayer = new Container();
  private upright = new Container();
  private penguin = new Container();
  private penguinBody = new Sprite(penguinTexture());
  private penguinShadow = new Sprite(glowTexture());
  private swim = new Sprite(swimTexture());
  private hud = new Container();
  private multText!: Text;
  private hudPlate = new Graphics();
  private subText!: Text;
  private talk!: Text;
  private flakeLayer = new Container();
  private texes: Texture[] = [];

  private floes: Floe[] = [];
  private chunks: Chunk[] = [];
  private flakes: Flake[] = [];
  private stars: Sprite[] = [];

  private rotated = false;
  private ws = 1;
  private viewLen = 600;
  private lateral = 400;
  private camY = 0;
  private camTarget = 0;
  private built = false;

  private phase: Phase = 'idle';
  private level: Level = 'mid';
  private betIndex = 1;
  private stake = 0;
  private breakAt = 0;
  private k = 0;
  private time = 0;
  private calm = reducedMotion();

  private levelBtns: Button[] = [];
  private minus!: Button;
  private plus!: Button;
  private betText!: Text;
  private mainBtn!: Button;
  private collectBtn!: Button;
  private rtpLine!: Text;

  private bets: number[];
  private stakeWatch: StakeWatch;
  /** Odds item: with the Ruhige Hand the first floe holds. On this round? */
  private odds: OddsWatch;
  private steady = false;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.main();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'ice', ['ruhigehand']);
    this.shell = new SceneShell({
      title: 'EISSTRASSE',
      accent: ICE,
      rules:
        'Der Pinguin will über den Fluss. Jede Scholle, die er erreicht, erhöht den Multiplikator.\n' +
        '• HÜPFEN: eine Scholle weiter.  • EINSAMMELN: Einsatz × Multiplikator auszahlen.\n' +
        'Jede Scholle bricht mit dem Risiko der Stufe (Leicht 8 %, Mittel 16 %, Schwer 25 %, Extrem 40 %). Bricht sie, geht der Pinguin baden und der Einsatz ist weg. Am anderen Ufer wird automatisch eingesammelt.\n' +
        'Der Multiplikator ist die faire Quote × 0,95: Auf jeder Scholle, auf jeder Stufe, kommen im Schnitt genau 95 % zurück. Welche Scholle bricht, steht vor dem ersten Sprung fest.\n' +
        'Leertaste: Start und Hüpfen.',
      ctrlSize: (l) => (l === 'tall' ? 304 : l === 'side' ? 420 : 186),
      buildControls: (c, w, h, l, fs) => this.buildControls(c, w, h, l, fs),
      layoutScene: (w, h) => this.layoutScene(w, h),
    });
    this.view.addChild(this.shell.board);
    this.shell.scene.addChild(this.rig, this.flakeLayer, this.hud);
    this.rig.addChild(this.world);
    this.world.addChild(this.chunkLayer, this.floeLayer, this.fxLayer, this.upright);
    this.penguinShadow.anchor.set(0.5);
    this.penguinShadow.tint = 0x020814;
    this.penguinShadow.alpha = 0.55;
    this.penguinShadow.width = 60;
    this.penguinShadow.height = 22;
    this.penguinBody.anchor.set(PENGUIN.ax / PENGUIN.w, PENGUIN.ay / PENGUIN.h);
    this.penguin.addChild(this.penguinShadow, this.penguinBody);
    this.swim.anchor.set(0.5, 50 / 70);
    this.swim.visible = false;
    this.multText = new Text({ text: '1,00×', style: { fontFamily: FONT_DISPLAY, fontSize: 40, fill: CREAM, stroke: { color: 0x0a0610, width: 7 } } });
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: 0xd9e8ff, stroke: { color: 0x0a0610, width: 4 } } });
    this.talk = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: CREAM, align: 'center', stroke: { color: 0x0a0610, width: 5 } } });
    this.talk.anchor.set(0.5, 1);
    this.hud.addChild(this.hudPlate, this.multText, this.subText, this.talk);
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  private get steps() {
    return LEVELS[this.level].steps;
  }

  // ---- Build ---------------------------------------------------------------------------------------

  private layoutScene(w: number, h: number) {
    for (const t of this.texes) t.destroy(true);
    this.texes = [];
    this.rotated = w > h * 1.1;
    this.viewLen = this.rotated ? w : h;
    this.lateral = this.rotated ? h : w;
    this.ws = Math.max(0.55, Math.min(1.15, this.lateral / 470));
    this.rig.position.set(w / 2, h / 2);
    this.rig.rotation = this.rotated ? Math.PI / 2 : 0;
    this.world.scale.set(this.ws);
    // HUD in screen space: the multiplier plaque at the top left, the talk line at the bottom.
    const fs = this.shell.fs;
    this.multText.style.fontSize = fs(this.shell.tall ? 34 : 40);
    this.multText.position.set(16, 10);
    this.subText.style.fontSize = fs(this.shell.tall ? 16 : 18);
    this.subText.position.set(18, this.multText.y + this.multText.height + 2);
    this.talk.style.fontSize = fs(this.shell.tall ? 19 : 22);
    this.talk.style.wordWrap = true;
    this.talk.style.wordWrapWidth = w - 40;
    this.talk.position.set(w / 2, h - 12);
    // Snow.
    this.flakeLayer.removeChildren().forEach((c) => c.destroy());
    this.flakes = [];
    const n = this.calm ? 10 : 34;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(flakeTexture());
      s.anchor.set(0.5);
      s.scale.set(0.4 + Math.random() * 0.7);
      s.alpha = 0.35 + Math.random() * 0.4;
      s.position.set(Math.random() * w, Math.random() * h);
      this.flakeLayer.addChild(s);
      this.flakes.push({ s, v: 14 + Math.random() * 22, sway: Math.random() * 10 });
    }
    this.buildRiver();
  }

  /** Water, banks, floes and the penguin for the current level (also between rounds). */
  private buildRiver() {
    const N = this.steps;
    const latW = Math.round(this.lateral / this.ws + 120);
    const farY = -(N + 1) * ROW;
    this.water?.destroy();
    this.water = new TilingSprite({ texture: waterTexture(), width: latW, height: (N + 2) * ROW + BANK_DEPTH * 2 });
    this.water.position.set(-latW / 2, farY - BANK_DEPTH);
    this.world.addChildAt(this.water, 0);
    // Banks: snow at both ends, lanterns, the sign and the hut stand upright on them.
    for (const t of this.texes) t.destroy(true);
    this.texes = [];
    this.chunkLayer.removeChildren().forEach((c) => c.destroy());
    this.floeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.upright.removeChildren();
    this.fxLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const bankT = bankTexture(latW, BANK_DEPTH);
    this.texes.push(bankT);
    const near = new Sprite(bankT);
    near.position.set(-latW / 2, ROW * 0.42);
    const far = new Sprite(bankT);
    far.anchor.set(0, 0);
    far.scale.y = -1;
    far.position.set(-latW / 2, farY + ROW * 0.6);
    this.chunkLayer.addChild(near, far);
    const counter = -this.rig.rotation;
    const stand = (tex: Texture, x: number, y: number, ax: number, ay: number, scale = 1) => {
      const s = new Sprite(tex);
      s.anchor.set(ax, ay);
      s.position.set(x, y);
      s.rotation = counter;
      s.scale.set(scale);
      this.upright.addChild(s);
      return s;
    };
    for (let x = -latW / 2 + 70; x < latW / 2; x += 190) {
      stand(lanternTexture(), x + (Math.abs(x) < 120 ? 120 : 0), ROW * 0.42 + 70, 0.5, 70 / 80);
      stand(lanternTexture(), x + 40 + (Math.abs(x + 40) < 140 ? 160 : 0), farY + ROW * 0.6 - 60, 0.5, 70 / 80);
    }
    stand(signTexture(), 150, ROW * 0.42 + 110, 0.5, 64 / 70);
    stand(hutTexture(), 0, farY + ROW * 0.6 - 120, 96 / 200, 140 / 150);
    // Drifting chunks between the rows.
    this.chunks = [];
    for (let k = 0; k <= N; k++) {
      for (let j = 0; j < 2; j++) {
        const s = new Sprite(chunkTexture((k * 3 + j) % 5));
        s.anchor.set(0.5);
        s.scale.set(0.5 + Math.random() * 0.5);
        s.rotation = Math.random() * 6;
        s.alpha = 0.75;
        s.position.set((Math.random() - 0.5) * latW, -(k + 0.5) * ROW + (Math.random() - 0.5) * 30);
        this.chunkLayer.addChild(s);
        this.chunks.push({ s, v: 10 + Math.random() * 18 });
      }
    }
    // The floes of the crossing, each with its multiplier.
    this.floes = [];
    const thin = LEVEL_ORDER.indexOf(this.level);
    const lsz = Math.round(Math.max(22, this.shell.fs(20) / this.ws));
    for (let k = 1; k <= N; k++) {
      const c = new Container();
      const seed = 1 + ((k * 7) % 9);
      const body = new Sprite(floeTexture(seed, thin));
      body.anchor.set(0.5);
      body.scale.set(FLOE_SCALE);
      const crack = new Sprite(crackTexture());
      crack.anchor.set(0.5);
      crack.scale.set(FLOE_SCALE);
      crack.alpha = 0;
      const label = new Text({ text: fmtX(multAt(this.level, k)), style: { fontFamily: FONT_BODY, fontSize: lsz, fontWeight: '700', fill: 0x14304e } });
      label.anchor.set(0.5);
      label.rotation = counter;
      // Below the penguin's feet on screen.
      if (this.rotated) label.position.set(26, 0);
      else label.position.set(0, 26);
      c.addChild(body, crack, label);
      c.position.set(0, -k * ROW);
      this.floeLayer.addChild(c);
      this.floes.push({ k, c, body, crack, label, ph: Math.random() * 6, seed });
    }
    this.upright.addChild(this.penguin, this.swim);
    this.penguin.rotation = counter;
    this.swim.rotation = counter;
    this.penguin.scale.set(0.95);
    this.k = 0;
    this.placePenguin();
    this.camTarget = this.focusY(0);
    if (!this.built) this.camY = this.camTarget;
    this.built = true;
    this.refreshLabels();
    this.refreshHud();
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    this.levelBtns = [];
    const tall = layout === 'tall';
    const side = layout === 'side';
    const x0 = tall ? 12 : side ? 18 : 24;
    const cap = caption('SCHWIERIGKEIT', fs(tall ? 14 : 15));
    cap.position.set(x0 + 2, 8);
    c.addChild(cap);
    const cols = side ? 2 : 4;
    const gap = 6;
    const lw = side ? (width - x0 * 2 - gap) / 2 : tall ? (width - x0 * 2 - gap * 3) / 4 : 112;
    const lh = tall ? 44 : 48;
    const top = cap.y + cap.height + 6 + lh / 2;
    LEVEL_ORDER.forEach((lv, i) => {
      const b = button({
        label: LEVELS[lv].label,
        ariaLabel: (t) => `Schwierigkeit ${t}`,
        width: lw,
        height: lh,
        color: [0x2a5a7a, 0x2a4a8a, 0x4a2a8a, 0x7a1a4a][i],
        textColor: CREAM,
        fontSize: fs(tall ? 16 : 18),
        display: false,
        onClick: () => this.setLevel(lv),
      });
      b.position.set(x0 + lw / 2 + (i % cols) * (lw + gap), top + Math.floor(i / cols) * (lh + gap));
      this.levelBtns.push(b);
      c.addChild(b);
    });
    const st = betStepper(fs, (d) => this.changeBet(d), 46);
    this.minus = st.minus;
    this.plus = st.plus;
    this.betText = st.text;
    const rows = Math.ceil(4 / cols);
    const sy = top + rows * (lh + gap) + (tall ? 14 : 20);
    const sx = x0;
    this.minus.position.set(sx + 23, sy);
    this.betText.position.set(sx + 92, sy);
    this.plus.position.set(sx + 161, sy);
    c.addChild(this.minus, this.betText, this.plus);
    this.rtpLine = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '600', fill: 0xbfa98a, wordWrap: true, align: 'left' } });
    if (layout === 'wide') {
      // Right block: the two big buttons stacked.
      const bx = Math.max(x0 + 4 * (lw + gap) + 30, width - 24 - 380);
      const bw = width - 24 - bx;
      this.mainBtn = button({ label: 'START', width: bw, height: 62, fontSize: 24, onClick: () => this.main() });
      this.mainBtn.position.set(bx + bw / 2, 48);
      this.collectBtn = button({ label: 'EINSAMMELN', width: bw, height: 54, color: 0x2a6a4a, textColor: CREAM, fontSize: 22, onClick: () => this.collect() });
      this.collectBtn.position.set(bx + bw / 2, 124);
      this.rtpLine.style.wordWrapWidth = bx - x0 - 220;
      this.rtpLine.anchor.set(0, 0.5);
      this.rtpLine.position.set(sx + 210, sy);
    } else {
      const bw = width - x0 * 2;
      const mh = tall ? 58 : 62;
      const my = side ? Math.max(sy + 70, height - 200) : sy + 62;
      this.mainBtn = button({ label: 'START', width: bw, height: mh, fontSize: 24, onClick: () => this.main() });
      this.mainBtn.position.set(width / 2, my);
      this.collectBtn = button({ label: 'EINSAMMELN', width: bw, height: 52, color: 0x2a6a4a, textColor: CREAM, fontSize: 22, onClick: () => this.collect() });
      this.collectBtn.position.set(width / 2, my + mh / 2 + 34);
      this.rtpLine.style.wordWrapWidth = bw;
      this.rtpLine.style.align = 'center';
      this.rtpLine.anchor.set(0.5, 0);
      this.rtpLine.position.set(width / 2, my + mh / 2 + 66);
    }
    c.addChild(this.mainBtn, this.collectBtn, this.rtpLine);
    this.changeBet(0);
  }

  // ---- Controls ------------------------------------------------------------------------------------

  private get inRound() {
    return this.phase === 'hop' || this.phase === 'stand' || this.phase === 'fall';
  }

  private setLevel(lv: Level) {
    if (this.inRound) return;
    if (lv === this.level) return;
    this.level = lv;
    this.phase = 'idle';
    this.buildRiver();
    this.refreshButtons();
  }

  private changeBet(d: number) {
    if (this.inRound) return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.refreshButtons();
  }

  private refreshButtons() {
    if (!this.mainBtn) return;
    const free = !this.inRound;
    this.minus.setEnabled(free && this.betIndex > 0);
    this.plus.setEnabled(free && this.betIndex < this.bets.length - 1);
    this.levelBtns.forEach((b, i) => {
      b.setEnabled(free);
      b.setSelected(LEVEL_ORDER[i] === this.level);
    });
    const next = multAt(this.level, this.k + 1);
    if (this.phase === 'stand') this.mainBtn.setLabel(this.k + 1 > this.steps ? 'ANS UFER ▲' : `HÜPFEN ▲ ${fmtX(next)}`);
    else if (this.phase === 'hop' || this.phase === 'fall') this.mainBtn.setLabel('…');
    else this.mainBtn.setLabel(`START · ${formatChips(this.bet)}`);
    this.mainBtn.setEnabled(this.phase === 'stand' || !this.inRound);
    const canCollect = this.phase === 'stand' && this.k >= 1;
    this.collectBtn.setEnabled(canCollect);
    this.collectBtn.setLabel(canCollect ? `EINSAMMELN ${formatChips(Math.floor(this.stake * multAt(this.level, this.k)))}` : 'EINSAMMELN');
    setItemRtp('ice', 'ruhigehand', steadyRtp(this.level));
    this.rtpLine.text = this.odds.id
      ? `${itemRtpText(steadyRtp(this.level), 'ruhigehand')} · erste Scholle hält`
      : `${rtpText(RTP)} · Bruchrisiko je Scholle ${Math.round(LEVELS[this.level].q * 100)} %`;
    this.rtpLine.style.fill = this.odds.id ? 0xbff0ff : 0xbfa98a;
  }

  private refreshHud() {
    const k = Math.min(this.k, this.steps);
    const m = multAt(this.level, k);
    this.multText.text = fmtX(m);
    this.multText.style.fill = k >= 1 ? GOLD : CREAM;
    if (this.inRound && k >= 1) {
      const last = k >= this.steps;
      this.subText.text = `Auszahlung ${formatChips(Math.floor(this.stake * multAt(this.level, k)))} · ${last ? 'nächster Sprung: Ufer' : `nächste Scholle ${fmtX(multAt(this.level, k + 1))}`}`;
    }
    else this.subText.text = `${LEVELS[this.level].label}: ${this.steps} Schollen bis ${fmtX(multAt(this.level, this.steps))}`;
    // A dark glass plate keeps the numbers readable over the ice.
    const w = Math.max(this.multText.width, this.subText.width) + 24;
    const h = this.subText.y + this.subText.height + 8 - 4;
    this.hudPlate.clear().roundRect(4, 4, w, h, 14).fill({ color: 0x06101e, alpha: 0.55 }).stroke({ color: ICE, width: 1.5, alpha: 0.35 });
  }

  private refreshLabels() {
    for (const f of this.floes) {
      const passed = f.k <= this.k && this.inRound;
      f.label.style.fill = passed ? 0x8a5a10 : f.k === this.k + 1 ? 0x0a2a4a : 0x2a4a6a;
      f.label.alpha = f.k > this.k + 6 ? 0.6 : 1;
    }
  }

  private main() {
    if (this.shell.rulesOpen) return;
    if (this.phase === 'stand') void this.hop();
    else if (this.phase === 'idle' || this.phase === 'reset') this.start();
  }

  // ---- Round ---------------------------------------------------------------------------------------

  private start() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    if (this.phase === 'reset') this.buildRiver();
    this.stake = bet;
    // The result first: which floe will break (or none).
    this.steady = this.odds.on('ruhigehand');
    this.breakAt = this.steady ? drawBreakSteady(this.level) : drawBreak(this.level);
    this.k = 0;
    this.phase = 'stand';
    this.talk.text = '';
    if (this.steady) {
      // Ruhige Hand: the first floe glows steady before the first hop.
      const f = this.floes[0];
      if (f) {
        this.ripple(f.c.x, f.c.y, 0x9fe8ff, 110);
        const g = this.view.toLocal(f.c.getGlobalPosition());
        void itemMoment(this.view, g.x, g.y - 70 * this.shell.s, 'ruhigehand', 'RUHIGE HAND', Math.max(0.6, this.shell.s * 0.85));
        this.ctx.sfx.medal();
        this.talk.text = 'Ruhige Hand: die erste Scholle hält.';
      }
    }
    void this.hop();
  }

  private floePos(k: number) {
    if (k <= 0) return { x: 0, y: ROW * 0.42 + 36 };
    if (k > this.steps) return { x: 0, y: -(this.steps + 1) * ROW + ROW * 0.6 - 40 };
    const f = this.floes[k - 1];
    // The penguin stands a little up-screen of the floe's middle, the label shows below its feet.
    return this.rotated ? { x: f.c.x - 14, y: f.c.y } : { x: f.c.x, y: f.c.y - 14 };
  }

  private focusY(k: number) {
    return this.floePos(k).y;
  }

  private placePenguin() {
    const p = this.floePos(this.k);
    this.penguin.position.set(p.x, p.y);
    this.penguinBody.position.set(0, 0);
    this.penguinBody.scale.set(1);
    this.penguinBody.alpha = 1;
    this.penguin.visible = true;
    this.swim.visible = false;
  }

  private async hop() {
    if (this.phase !== 'stand') return;
    const to = this.k + 1;
    if (luckOn() && to <= this.steps) {
      // Mod-Menü Gewinnchance: the breaking floe is drawn again among those still ahead
      // (the same chances, given the floes behind held), steered for this hop.
      const k = this.k;
      const draw = () => {
        let b = this.steady ? drawBreakSteady(this.level) : drawBreak(this.level);
        while (b <= k) b = this.steady ? drawBreakSteady(this.level) : drawBreak(this.level);
        return b;
      };
      this.breakAt = luckStep(draw, (b) => b !== to);
    }
    this.phase = 'hop';
    this.refreshButtons();
    this.ctx.sfx.whoosh();
    const from = { x: this.penguin.x, y: this.penguin.y };
    this.camTarget = this.focusY(to);
    const dur = this.calm ? 300 : 420;
    await animate(dur, (t) => {
      if (this.penguin.destroyed) return;
      const p = this.floePos(to);
      this.penguin.position.set(from.x + (p.x - from.x) * t, from.y + (p.y - from.y) * t);
      const lift = Math.sin(Math.PI * t) * 46;
      this.penguinBody.y = -lift;
      this.penguinBody.scale.set(1 + Math.sin(Math.PI * t) * 0.14, 1 - Math.sin(Math.PI * t) * 0.05);
      this.penguinShadow.scale.set((60 / 256) * (1 - Math.sin(Math.PI * t) * 0.35), (22 / 256) * (1 - Math.sin(Math.PI * t) * 0.35));
    }, ease.inOutCubic);
    if (this.view.destroyed) return;
    this.penguinBody.y = 0;
    // Landing squash.
    this.penguinBody.scale.set(1.12, 0.88);
    void tween(this.penguinBody.scale, { x: 1, y: 1 }, 260, ease.outBack);
    this.k = to;
    if (to > this.steps) {
      this.across();
      return;
    }
    const f = this.floes[to - 1];
    this.ctx.sfx.hop(to);
    // The floe dips under the weight.
    f.body.scale.set(FLOE_SCALE * 0.95);
    void tween(f.body.scale, { x: FLOE_SCALE, y: FLOE_SCALE }, 300, ease.outBack);
    this.ripple(f.c.x, f.c.y, 0xdff4ff, 70);
    if (to === this.breakAt) {
      await this.splash(f);
      return;
    }
    this.phase = 'stand';
    this.refreshLabels();
    this.refreshHud();
    this.refreshButtons();
    const m = multAt(this.level, to);
    this.multText.scale.set(1.15);
    void tween(this.multText.scale, { x: 1, y: 1 }, 300, ease.outBack);
    if (to >= 3 && to % 5 === 0) this.ctx.sfx.lineHit(Math.min(8, to / 5));
    if (to === this.steps) this.talk.text = 'Noch ein Sprung bis zum Ufer!';
    else if (m >= 2 && multAt(this.level, to - 1) < 2) this.talk.text = 'Doppelter Einsatz – einsammeln oder weiter?';
    else this.talk.text = '';
  }

  /** The floe holds no more: crack, split, splash. The penguin bobs back up, a bit dizzy. */
  private async splash(f: Floe) {
    this.phase = 'fall';
    this.refreshButtons();
    // Settle at once: the round is lost.
    this.ctx.state.report({ game: 'ice', stake: this.stake, win: 0, rtp: this.steady ? steadyRtp(this.level) : RTP, tags: ['ice', 'splash'] });
    this.shell.addHistory(`Platsch ${this.k}`, 0x24345a, 0xcfe4ff);
    this.ctx.sfx.iceCrack();
    void tween(f.crack, { alpha: 1 }, 140);
    await wait(380);
    if (this.view.destroyed) return;
    // Split into halves drifting apart.
    const thin = LEVEL_ORDER.indexOf(this.level);
    f.body.visible = false;
    f.crack.visible = false;
    f.label.visible = false;
    const halves = ([-1, 1] as const).map((side) => {
      const h = new Sprite(halfTexture(f.seed, thin, side));
      h.anchor.set(0.5);
      h.scale.set(FLOE_SCALE);
      f.c.addChild(h);
      void tween(h, { x: side * 34, rotation: side * 0.25 }, 900, ease.outCubic);
      void tween(h, { alpha: 0.45 }, 1200);
      return h;
    });
    void halves;
    this.ctx.sfx.splash();
    const px = this.penguin.x;
    const py = this.penguin.y;
    await animate(260, (t) => {
      if (this.penguinBody.destroyed) return;
      this.penguinBody.y = t * 18;
      this.penguinBody.scale.set(1 - t * 0.5);
      this.penguinBody.alpha = 1 - t;
    });
    if (this.view.destroyed) return;
    this.penguin.visible = false;
    this.ripple(px, py, 0xffffff, 110);
    this.ripple(px, py, 0xdff4ff, 160, 160);
    this.spray(px, py);
    await wait(this.calm ? 300 : 650);
    if (this.view.destroyed) return;
    // Pop! Back up, unharmed.
    this.swim.visible = true;
    this.swim.position.set(px + 30, py + 10);
    this.swim.scale.set(0.2);
    void tween(this.swim.scale, { x: 1, y: 1 }, 380, ease.outBack);
    this.ctx.sfx.partial();
    this.talk.text = 'Platsch! Die Scholle hielt nicht – der Pinguin ist wohlauf.';
    if (!this.calm) this.dizzy(px + 30, py - 30);
    await wait(1500);
    if (this.view.destroyed) return;
    await this.goHome(true);
  }

  /** Back to the start bank (after a swim or a collect) and a fresh river. */
  private async goHome(swum: boolean) {
    this.phase = 'reset';
    this.refreshButtons();
    if (swum) await tween(this.swim, { alpha: 0 }, 300);
    if (this.view.destroyed || this.phase !== 'reset') return;
    this.swim.alpha = 1;
    this.buildRiver();
    this.phase = 'reset';
    this.refreshButtons();
    this.penguinBody.alpha = 0;
    void tween(this.penguinBody, { alpha: 1 }, 300);
  }

  private collect() {
    if (this.phase !== 'stand' || this.k < 1) return;
    this.settleWin(false);
  }

  /** Reached the far bank: the crossing pays its top multiplier. */
  private across() {
    this.talk.text = 'Geschafft! Der Pinguin ist am anderen Ufer.';
    this.settleWin(true);
  }

  private settleWin(across: boolean) {
    // On the far bank k is steps + 1; the crossing pays the last floe's multiplier.
    const k = Math.min(this.k, this.steps);
    const m = multAt(this.level, k);
    const win = payout(this.stake, this.level, k);
    this.ctx.state.payout(win);
    const tags = ['ice'];
    if (m >= 5) tags.push('ice5');
    if (m >= 10) tags.push('ice10');
    if (across) tags.push('across');
    this.ctx.state.report({ game: 'ice', stake: this.stake, win, rtp: this.steady ? steadyRtp(this.level) : RTP, tags });
    this.shell.addHistory(fmtX(m), GOLD);
    this.phase = 'reset';
    this.refreshHud();
    this.refreshButtons();
    this.subText.text = `Eingesammelt: +${formatChips(win)} ${CURRENCY_PLURAL}`;
    if (!across) this.talk.text = `Eingesammelt bei ${fmtX(m)}!`;
    // Happy flipper bounce.
    if (!this.calm) {
      void tween(this.penguinBody.scale, { x: 1.15, y: 1.15 }, 140, ease.outCubic).then(() => tween(this.penguinBody.scale, { x: 1, y: 1 }, 380, ease.outBack));
    }
    const p = this.penguin.toGlobal({ x: 0, y: -60 });
    const lp = this.view.toLocal(p);
    floatText(this.view, lp.x, lp.y - 20, `+${formatChips(win)}`, COLORS.lamp, 34);
    if (m > 1) this.ctx.celebrate(m, p.x, p.y);
    else this.ctx.sfx.partial();
    if (rewardLevel(m) >= 3) {
      void winStage(this.shell.over, {
        x: 0,
        y: 0,
        w: this.shell.sw,
        h: this.shell.sh,
        title: across ? 'ÜBER DEN FLUSS!' : 'GROSSER SPRUNG',
        sub: `${fmtX(m)} Einsatz`,
        amount: win,
        accent: ICE,
        durationMs: 2200,
        onTick: () => this.ctx.sfx.tick(),
      });
    }
  }

  // ---- Effects -------------------------------------------------------------------------------------

  private ripple(x: number, y: number, col: number, r: number, delay = 0) {
    const g = new Graphics().ellipse(0, 0, 20, 14).stroke({ color: col, width: 3 });
    g.position.set(x, y);
    g.alpha = 0.9;
    this.fxLayer.addChild(g);
    const k = r / 20;
    void tween(g.scale, { x: k, y: k }, 700, ease.outCubic, delay);
    void tween(g, { alpha: 0 }, 700, ease.linear, delay).then(() => g.destroy());
  }

  private spray(x: number, y: number) {
    const n = this.calm ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.width = s.height = 10 + Math.random() * 10;
      s.tint = 0xdff4ff;
      s.blendMode = 'add';
      s.position.set(x, y);
      this.fxLayer.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 50;
      void tween(s, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, alpha: 0 }, 600 + Math.random() * 300, ease.outCubic).then(() => s.destroy());
    }
  }

  private dizzy(x: number, y: number) {
    for (const s of this.stars) s.destroy();
    this.stars = [];
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(starTexture());
      s.anchor.set(0.5);
      s.position.set(x, y);
      this.upright.addChild(s);
      this.stars.push(s);
    }
    const t0 = this.time;
    void animate(1500, (t) => {
      this.stars.forEach((s, i) => {
        if (s.destroyed) return;
        const a = (this.time - t0) * 5 + (i * Math.PI * 2) / 3;
        const p = this.rotated ? { x: Math.sin(a) * 10, y: -Math.cos(a) * 22 } : { x: Math.cos(a) * 22, y: Math.sin(a) * 8 };
        s.position.set(x + p.x, y + p.y);
        s.alpha = 1 - t * t;
      });
    }).then(() => {
      for (const s of this.stars) s.destroy();
      this.stars = [];
    });
  }

  // ---- Frame ---------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  update(dtMs: number) {
    if (this.odds.poll()) this.refreshButtons();
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    const dt = Math.min(dtMs, 60) / 1000;
    this.time += dt;
    // The river flows; floes rock and drift a little; chunks float past.
    if (this.water) this.water.tilePosition.x += dt * 22;
    for (const f of this.floes) {
      f.c.x = Math.sin(this.time * 0.55 + f.ph) * 16;
      f.body.rotation = Math.sin(this.time * 0.4 + f.ph) * 0.05;
    }
    const half = this.lateral / this.ws / 2 + 80;
    for (const c of this.chunks) {
      c.s.x += c.v * dt;
      c.s.rotation += dt * 0.05;
      if (c.s.x > half) c.s.x = -half;
    }
    // The penguin rides its floe.
    if (this.phase === 'stand' || this.phase === 'reset' || this.phase === 'idle') {
      const p = this.floePos(this.k);
      this.penguin.position.set(p.x, p.y);
      if (this.phase === 'stand') this.penguinBody.rotation = Math.sin(this.time * 2.2) * 0.04;
    }
    if (this.swim.visible) this.swim.y += Math.sin(this.time * 5) * 0.15;
    // Camera follows along the crossing.
    if (this.phase === 'reset' || this.phase === 'idle') this.camTarget = this.focusY(this.k);
    this.camY += (this.camTarget - this.camY) * Math.min(1, dt * 5);
    this.world.position.set(0, this.viewLen * 0.22 - this.camY * this.ws);
    // Snow drifts down the screen.
    const sw = this.shell.sw;
    const sh = this.shell.sh;
    for (const f of this.flakes) {
      f.s.y += f.v * dt;
      f.s.x += Math.sin(this.time + f.sway) * 8 * dt;
      if (f.s.y > sh + 6) {
        f.s.y = -6;
        f.s.x = Math.random() * sw;
      }
    }
    // The next floe glows softly.
    const next = this.floes[this.k];
    if (next && this.phase === 'stand') next.label.scale.set(1 + Math.sin(this.time * 4) * 0.06);
  }

  busy() {
    return this.inRound;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
    for (const t of this.texes) t.destroy(true);
    this.shell.destroy();
  }
}

function drawStation() {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, 140, 84, 14).fill(0x3a2418).stroke({ color: COLORS.brass, width: 2 });
  g.rect(8, 22, 124, 34).fill(0x12385e);
  for (let i = 0; i < 6; i++) g.ellipse(20 + i * 20, 30 + (i % 3) * 8, 8, 4).fill(0xf2f8ff);
  c.addChild(g);
  const lamp = new Graphics().circle(110, 14, 5).fill(0xffb04a);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const ice: GameDefinition = {
  id: 'ice',
  name: 'Eisstraße',
  houseEdge: 1 - RTP,
  footprint: { w: 140, h: 84 },
  size: 'table',
  blurb: 'Ein Pinguin, ein Fluss voller Schollen: einsammeln, bevor es platscht.',
  drawStation,
  create: (ctx) => new IceGame(ctx),
};
