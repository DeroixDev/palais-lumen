// "Zielscheibe": a moth throws a dart at a slowly turning, moonlit target. The ring is drawn
// before the throw; the ring sizes are the odds (a ring's area is its share of the hits). The
// throwing style picks the ring table: Sicher, Normal or Riskant – each returns exactly 95 %.
//
// Report tags: 'target' (every throw), 'bull' (bullseye), 'miss' (missed the target).

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, floatText, glowTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { animate, ease, tween } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { winStage } from '../slots/stage';
import { StakeWatch } from '../stakeWatch';
import { SceneShell, betStepper, caption, rtpText, type Layout } from '../sceneShell';
import { STYLES, STYLE_ORDER, drawHit, missChance, multFor, returnToPlayer, ringRadii, type Style } from './rules';
import { RING_COLORS, RING_INK, RT, archerTexture, armTexture, boardTexture, dartTexture, faceTexture, gladeTexture, stuckTexture } from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const CREAM = 0xfff3dc;
const GOLD = 0xffcf7a;
const MOON = 0xfff1c4;
const SPIN = 0.45;

type Phase = 'idle' | 'throw';

const fmtM = (m: number) => `×${String(m).replace('.', ',')}`;
const pct = (p: number) => `${(Math.abs(p * 100 - Math.round(p * 100)) < 1e-9 ? Math.round(p * 100).toString() : (p * 100).toFixed(1)).replace('.', ',')} %`;

class TargetGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  private bg = new Sprite();
  private bgTex: Texture | null = null;
  private tgt = new Container();
  private board = new Sprite(boardTexture());
  private face = new Container();
  private faceSprite = new Sprite();
  private faceDarts = new Container();
  private boardDarts = new Container();
  private flashes: Graphics[] = [];
  private labels = new Container();
  private halo = new Sprite(glowTexture());
  private legend = new Container();
  private archer = new Container();
  private archerBody = new Sprite(archerTexture());
  private arm = new Container();
  private handDart = new Sprite(dartTexture());
  private fly = new Container();
  private talk!: Text;
  private stuck: Sprite[] = [];

  private R = 120;
  private layoutMode: Layout = 'wide';
  private phase: Phase = 'idle';
  private style: Style = 'normal';
  private betIndex = 1;
  private time = 0;
  private calm = reducedMotion();

  private styleBtns: Button[] = [];
  private minus!: Button;
  private plus!: Button;
  private betText!: Text;
  private mainBtn!: Button;
  private rtpLine!: Text;

  private bets: number[];
  private stakeWatch: StakeWatch;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.main();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.shell = new SceneShell({
      title: 'ZIELSCHEIBE',
      accent: MOON,
      rules:
        'Die Motte wirft einen Pfeil auf die Mondscheibe. Der getroffene Ring bestimmt die Auszahlung (Einsatz × Ring).\n' +
        'Die Ringgrößen sind die Chancen: Die Fläche eines Rings entspricht genau seinem Anteil an den Treffern. Daneben zahlt nichts.\n' +
        '• Sicher: viele kleine Treffer, Mitte ×5.\n• Normal: Mitte ×20.\n• Riskant: oft daneben, aber die Mitte zahlt ×100.\n' +
        'Jeder Wurfstil zahlt im Schnitt genau 95 % zurück. Der Treffer steht fest, bevor der Pfeil die Hand verlässt.\n' +
        'Leertaste: werfen.',
      ctrlSize: (l) => (l === 'tall' ? 196 : l === 'side' ? 400 : 168),
      buildControls: (c, w, h, l, fs) => this.buildControls(c, w, h, l, fs),
      layoutScene: (w, h, l) => this.layoutScene(w, h, l),
    });
    this.view.addChild(this.shell.board);
    this.halo.anchor.set(0.5);
    this.halo.tint = MOON;
    this.halo.blendMode = 'add';
    this.halo.alpha = 0.25;
    this.board.anchor.set(0.5, 0.5 / 1.2);
    this.faceSprite.anchor.set(0.5);
    this.face.addChild(this.faceSprite, this.faceDarts);
    this.tgt.addChild(this.halo, this.board, this.boardDarts, this.face, this.labels);
    // The archer: body, and an arm with the dart that swings round the shoulder.
    this.archerBody.anchor.set(84 / 170, 176 / 200);
    const armS = new Sprite(armTexture());
    armS.anchor.set(0.5, 62 / 70);
    this.handDart.anchor.set(112 / 120, 0.5);
    this.handDart.scale.set(0.55);
    this.handDart.position.set(14, -54);
    this.handDart.rotation = -0.5;
    this.arm.addChild(this.handDart, armS);
    this.arm.position.set(18, -86);
    this.arm.rotation = 0.6;
    this.archer.addChild(this.archerBody, this.arm);
    this.talk = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: CREAM, align: 'center', stroke: { color: 0x0a0610, width: 5 } } });
    this.talk.anchor.set(0.5, 1);
    this.shell.scene.addChild(this.bg, this.tgt, this.legend, this.archer, this.fly, this.talk);
    this.setStyle('normal', true);
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Build ---------------------------------------------------------------------------------------

  private layoutScene(w: number, h: number, layout: Layout) {
    this.layoutMode = layout;
    const tall = layout === 'tall';
    const legH = tall ? 78 : 0;
    const legW = tall ? 0 : Math.min(230, w * 0.26);
    const aw = w - legW;
    const ah = h - legH;
    const R = Math.round(tall ? Math.min(aw * 0.33, ah * 0.3) : Math.min(ah * 0.33, aw * 0.27));
    const tx = tall ? aw * 0.56 : aw * 0.55;
    const ty = tall ? ah * 0.4 : ah * 0.45;
    this.R = R;
    this.bgTex?.destroy(true);
    this.bgTex = gladeTexture(w, h, tx, ty, R);
    this.bg.texture = this.bgTex;
    this.tgt.position.set(tx, ty);
    this.tgt.scale.set(R / RT);
    this.halo.width = RT * 3.4;
    this.halo.height = RT * 3.4;
    // The archer stands in the grass at the lower left.
    const ak = (tall ? ah * 0.42 : ah * 0.5) / 190;
    this.archer.scale.set(Math.min(1.3, ak));
    this.archer.position.set(Math.max(60 * this.archer.scale.x, tall ? aw * 0.16 : aw * 0.12), ah - 6);
    this.talk.style.fontSize = this.shell.fs(tall ? 19 : 22);
    this.talk.style.wordWrap = true;
    this.talk.style.wordWrapWidth = aw - 30;
    this.talk.position.set(tall ? w / 2 : aw / 2, ah - 10);
    this.legend.position.set(tall ? 0 : aw, tall ? ah : 0);
    this.buildLegend(tall ? w : legW, tall ? legH : h, tall);
    this.buildLabels();
  }

  private buildLegend(w: number, h: number, tall: boolean) {
    const L = this.legend;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    const st = STYLES[this.style];
    const rows = [...st.rings.map((r, i) => ({ col: RING_COLORS[i], ink: RING_INK[i], m: fmtM(r.mult), p: r.p, name: i === 0 ? 'Mitte' : `Ring ${i}` })), { col: 0x8a6a3a, ink: CREAM, m: '×0', p: missChance(this.style), name: 'Daneben' }];
    const plate = new Graphics();
    L.addChild(plate);
    const fs = this.shell.fs;
    if (tall) {
      plate.rect(0, 0, w, h).fill({ color: 0x06040e, alpha: 0.55 });
      plate.rect(0, 0, w, 2).fill({ color: GOLD, alpha: 0.4 });
      const cw = (w - 12) / rows.length;
      rows.forEach((r, i) => {
        const cx = 6 + cw * i + cw / 2;
        const chip = new Graphics().roundRect(-cw / 2 + 3, 8, cw - 6, 30, 10).fill(r.col).stroke({ color: 0x1a0c10, width: 2 });
        const m = new Text({ text: r.m, style: { fontFamily: FONT_BODY, fontSize: fs(17), fontWeight: '700', fill: r.ink } });
        m.anchor.set(0.5);
        m.position.set(cx, 23);
        if (m.width > cw - 10) m.scale.set((cw - 10) / m.width);
        chip.x = cx;
        const p = new Text({ text: pct(r.p), style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '600', fill: 0xd9c6a0 } });
        p.anchor.set(0.5, 0);
        p.position.set(cx, 44);
        if (p.width > cw - 4) p.scale.set((cw - 4) / p.width);
        L.addChild(chip, m, p);
      });
      return;
    }
    plate.rect(0, 0, w, h).fill({ color: 0x06040e, alpha: 0.5 });
    plate.rect(0, 0, 2, h).fill({ color: GOLD, alpha: 0.4 });
    const head = caption('CHANCEN', fs(15));
    head.position.set(16, 12);
    L.addChild(head);
    const rh = Math.min(48, (h - 50) / rows.length);
    rows.forEach((r, i) => {
      const y = 44 + i * rh + rh / 2;
      const chip = new Graphics().roundRect(14, y - rh * 0.38, 74, rh * 0.76, 10).fill(r.col).stroke({ color: 0x1a0c10, width: 2 });
      const m = new Text({ text: r.m, style: { fontFamily: FONT_BODY, fontSize: fs(19), fontWeight: '700', fill: r.ink } });
      m.anchor.set(0.5);
      m.position.set(51, y);
      if (m.width > 66) m.scale.set(66 / m.width);
      const p = new Text({ text: `${r.name}\n${pct(r.p)}`, style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '600', fill: 0xd9c6a0, lineHeight: fs(15) * 1.1 } });
      p.anchor.set(0, 0.5);
      p.position.set(98, y);
      if (p.width > w - 104) p.scale.set((w - 104) / p.width);
      L.addChild(chip, m, p);
    });
  }

  /** Ring multipliers written on the target (they do not turn), plus the ring flashes. */
  private buildLabels() {
    this.labels.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const g of this.flashes) g.destroy();
    this.flashes = [];
    const radii = ringRadii(this.style).map((k) => k * RT);
    const st = STYLES[this.style];
    const k = this.R / RT;
    radii.forEach((rout, i) => {
      const rin = i ? radii[i - 1] : 0;
      const g = new Graphics().circle(0, 0, rout).fill(0xffffff);
      if (rin > 0) g.circle(0, 0, rin).cut();
      g.alpha = 0;
      g.blendMode = 'add';
      this.flashes.push(g);
      this.labels.addChildAt(g, 0);
      const width = rout - rin;
      const size = Math.min(30, Math.max(this.shell.fs(14) / k, Math.min(width * 0.8, 26)));
      const t = new Text({ text: fmtM(st.rings[i].mult), style: { fontFamily: FONT_BODY, fontSize: size, fontWeight: '700', fill: RING_INK[i], stroke: { color: i % 2 ? 0x0a0610 : 0xfff6e0, width: 3 } } });
      t.anchor.set(0.5);
      t.position.set(0, i === 0 ? 0 : -(rin + rout) / 2);
      if (i === 0 && t.width > rout * 1.9) t.scale.set((rout * 1.9) / t.width);
      this.labels.addChild(t);
    });
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    this.styleBtns = [];
    const tall = layout === 'tall';
    const side = layout === 'side';
    const x0 = tall ? 12 : side ? 18 : 24;
    const cap = caption('WURFSTIL', fs(tall ? 14 : 15));
    cap.position.set(x0 + 2, 8);
    c.addChild(cap);
    const gap = 6;
    const bw = side || tall ? (width - x0 * 2 - gap * 2) / 3 : 132;
    const bh = tall ? 46 : 50;
    const top = cap.y + cap.height + 6 + bh / 2;
    STYLE_ORDER.forEach((st, i) => {
      const b = button({
        label: STYLES[st].label,
        ariaLabel: (t) => `Wurfstil ${t}`,
        width: bw,
        height: bh,
        color: [0x2a5a4a, 0x2a3a8a, 0x8a1a3a][i],
        textColor: CREAM,
        fontSize: fs(tall ? 17 : 19),
        display: false,
        onClick: () => this.setStyle(st),
      });
      b.position.set(x0 + bw / 2 + i * (bw + gap), top);
      this.styleBtns.push(b);
      c.addChild(b);
    });
    const st = betStepper(fs, (d) => this.changeBet(d), 46);
    this.minus = st.minus;
    this.plus = st.plus;
    this.betText = st.text;
    const sy = top + bh / 2 + (tall ? 30 : 36);
    this.minus.position.set(x0 + 23, sy);
    this.betText.position.set(x0 + 92, sy);
    this.plus.position.set(x0 + 161, sy);
    c.addChild(this.minus, this.betText, this.plus);
    this.rtpLine = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '600', fill: 0xbfa98a, wordWrap: true, align: 'left' } });
    if (layout === 'wide') {
      const bx = Math.max(x0 + 3 * (bw + gap) + 30, width - 24 - 360);
      const mw = width - 24 - bx;
      this.mainBtn = button({ label: 'WERFEN', width: mw, height: 84, fontSize: 28, onClick: () => this.main() });
      this.mainBtn.position.set(bx + mw / 2, height / 2);
      this.rtpLine.style.wordWrapWidth = bx - x0 - 230;
      this.rtpLine.anchor.set(0, 0.5);
      this.rtpLine.position.set(x0 + 206, sy);
    } else if (tall) {
      // Stepper and the throw button share a row; the payout line below.
      const mx = x0 + 184 + 12;
      const mw = width - x0 - mx;
      this.mainBtn = button({ label: 'WERFEN', width: mw, height: 58, fontSize: 22, onClick: () => this.main() });
      this.mainBtn.position.set(mx + mw / 2, sy);
      this.rtpLine.style.wordWrapWidth = width - x0 * 2;
      this.rtpLine.style.align = 'center';
      this.rtpLine.anchor.set(0.5, 0);
      this.rtpLine.position.set(width / 2, sy + 36);
    } else {
      const mh = 72;
      const my = Math.max(sy + 80, height - 120);
      this.mainBtn = button({ label: 'WERFEN', width: width - x0 * 2, height: mh, fontSize: 26, onClick: () => this.main() });
      this.mainBtn.position.set(width / 2, my);
      this.rtpLine.style.wordWrapWidth = width - x0 * 2;
      this.rtpLine.style.align = 'center';
      this.rtpLine.anchor.set(0.5, 0);
      this.rtpLine.position.set(width / 2, my + mh / 2 + 8);
    }
    c.addChild(this.mainBtn, this.rtpLine);
    this.changeBet(0);
  }

  // ---- Controls ------------------------------------------------------------------------------------

  private setStyle(s: Style, force = false) {
    if (this.phase !== 'idle' && !force) return;
    const changed = s !== this.style;
    if (changed) this.talk.text = '';
    this.style = s;
    this.faceSprite.texture = faceTexture(s);
    if (this.legend.parent && this.shell.sw) {
      const tall = this.layoutMode === 'tall';
      const w = this.shell.sw;
      this.buildLegend(tall ? w : Math.min(230, w * 0.26), tall ? 78 : this.shell.sh, tall);
      this.buildLabels();
    }
    if (changed && !force) {
      // Old darts drop off; the face re-forms.
      this.clearDarts();
      if (!this.calm) {
        this.face.scale.set(0.85);
        void tween(this.face.scale, { x: 1, y: 1 }, 380, ease.outBack);
      }
      this.ctx.sfx.chip();
    }
    this.refreshButtons();
  }

  private changeBet(d: number) {
    if (this.phase !== 'idle') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.refreshButtons();
  }

  private refreshButtons() {
    if (!this.mainBtn) return;
    const free = this.phase === 'idle';
    this.minus.setEnabled(free && this.betIndex > 0);
    this.plus.setEnabled(free && this.betIndex < this.bets.length - 1);
    this.styleBtns.forEach((b, i) => {
      b.setEnabled(free);
      b.setSelected(STYLE_ORDER[i] === this.style);
    });
    this.mainBtn.setEnabled(free);
    this.mainBtn.setLabel(free ? `WERFEN · ${formatChips(this.bet)}` : '…');
    this.rtpLine.text = `${STYLES[this.style].label}: Mitte ${fmtM(STYLES[this.style].rings[0].mult)} · ${rtpText(returnToPlayer(this.style))}`;
  }

  private main() {
    if (this.shell.rulesOpen) return;
    if (this.phase === 'idle') void this.throwDart();
  }

  private clearDarts() {
    for (const s of this.stuck) void tween(s, { alpha: 0 }, 250).then(() => s.destroy());
    this.stuck = [];
  }

  // ---- Throw ---------------------------------------------------------------------------------------

  private async throwDart() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    const style = this.style;
    // The result first: which ring (or a miss), and a spot inside it.
    const ring = drawHit(style);
    const spot = this.spotFor(style, ring);
    this.phase = 'throw';
    this.refreshButtons();
    this.talk.text = '';
    // Wind-up and release.
    const calm = this.calm;
    await animate(calm ? 120 : 260, (t) => !this.arm.destroyed && (this.arm.rotation = 0.6 - t * 2.4), ease.outCubic);
    if (this.view.destroyed) return;
    this.ctx.sfx.whoosh();
    await animate(calm ? 60 : 110, (t) => !this.arm.destroyed && (this.arm.rotation = -1.8 + t * 3.0), ease.inCubic);
    if (this.view.destroyed) return;
    const scene = this.shell.scene;
    const p0 = scene.toLocal(this.handDart.getGlobalPosition());
    this.handDart.visible = false;
    const dart = new Sprite(dartTexture());
    dart.anchor.set(112 / 120, 0.5);
    dart.position.copyFrom(p0);
    this.fly.addChild(dart);
    const host = ring >= 0 ? this.face : this.tgt;
    const dur = calm ? 380 : 560;
    const s0 = 0.75;
    const s1 = Math.max(0.3, (this.R / RT) * 0.55);
    await animate(dur, (t) => {
      if (dart.destroyed) return;
      // Home in on the spot, wherever the turning face has carried it.
      const p1 = scene.toLocal(host.toGlobal(spot));
      const lift = Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.28;
      const cx = (p0.x + p1.x) / 2;
      const cy = Math.min(p0.y, p1.y) - lift;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * cx + t * t * p1.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * cy + t * t * p1.y;
      const dx = 2 * (1 - t) * (cx - p0.x) + 2 * t * (p1.x - cx);
      const dy = 2 * (1 - t) * (cy - p0.y) + 2 * t * (p1.y - cy);
      dart.position.set(x, y);
      dart.rotation = Math.atan2(dy, dx);
      dart.scale.set(s0 + (s1 - s0) * t);
    }, ease.linear);
    if (this.view.destroyed) return;
    dart.destroy();
    this.handDart.visible = true;
    void animate(260, (t) => !this.arm.destroyed && (this.arm.rotation = 1.2 - t * 0.6), ease.outCubic);
    this.land(style, ring, spot, bet);
  }

  /** A random spot inside the ring (face coordinates), or on the straw board for a miss. */
  private spotFor(style: Style, ring: number) {
    const radii = ringRadii(style).map((k) => k * RT);
    const a = Math.random() * Math.PI * 2;
    if (ring >= 0) {
      const rin = ring ? radii[ring - 1] + 4 : 0;
      const rout = radii[ring] - 4;
      const r = Math.sqrt(rin * rin + Math.random() * (rout * rout - rin * rin));
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }
    // The straw around the target: outside the brass rim, inside the board.
    const S = RT * 1.32 - 14;
    for (;;) {
      const x = (Math.random() * 2 - 1) * S;
      const y = (Math.random() * 2 - 1) * S;
      if (Math.hypot(x, y) > RT + 22) return { x, y };
    }
  }

  private land(style: Style, ring: number, spot: { x: number; y: number }, bet: number) {
    const s = new Sprite(stuckTexture());
    s.anchor.set(14 / 60, 46 / 60);
    s.position.set(spot.x, spot.y);
    s.scale.set(0.9);
    if (ring >= 0) {
      // Stuck in the turning face: it turns along from here on.
      s.rotation = -this.face.rotation;
      this.faceDarts.addChild(s);
    } else this.boardDarts.addChild(s);
    this.stuck.push(s);
    if (this.stuck.length > 6) {
      const old = this.stuck.shift()!;
      void tween(old, { alpha: 0 }, 300).then(() => old.destroy());
    }
    this.ctx.sfx.thunk();
    // The board takes the hit.
    if (!this.calm) {
      const k = this.R / RT;
      this.tgt.scale.set(k * 1.035);
      void tween(this.tgt.scale, { x: k, y: k }, 320, ease.outBack);
    }
    const mult = multFor(style, ring);
    const win = Math.round(bet * mult);
    if (win > 0) this.ctx.state.payout(win);
    const tags = ['target'];
    if (ring === 0) tags.push('bull');
    if (ring < 0) tags.push('miss');
    this.ctx.state.report({ game: 'target', stake: bet, win, rtp: returnToPlayer(style), tags });
    this.shell.addHistory(ring >= 0 ? fmtM(mult) : 'daneben', ring >= 0 ? RING_COLORS[ring] : 0x5a4a3a, ring >= 0 ? RING_INK[ring] : 0xe6d6b4);
    const g = (ring >= 0 ? this.face : this.tgt).toGlobal(spot);
    const lp = this.view.toLocal(g);
    if (ring >= 0) {
      const f = this.flashes[ring];
      f.alpha = 0.85;
      f.tint = ring === 0 ? GOLD : 0xffffff;
      void tween(f, { alpha: 0 }, 800, ease.outCubic);
      const label = this.labels.children[this.flashes.length + ring];
      if (label && !this.calm) {
        label.scale.set(label.scale.x * 1.4);
        const back = label.scale.x / 1.4;
        void tween(label.scale, { x: back, y: back }, 360, ease.outBack);
      }
    }
    if (ring === 0) {
      this.halo.alpha = 0.9;
      void tween(this.halo, { alpha: 0.25 }, 1200);
    }
    const names = ['Volltreffer! Mitten in den Mond!', 'Guter Wurf!', 'Getroffen.', 'Am Rand erwischt.', 'Knapp am Rand.'];
    if (ring < 0) this.talk.text = 'Daneben – ins Stroh.';
    else this.talk.text = `${names[Math.min(ring, names.length - 1)]}  ${fmtM(mult)}`;
    if (mult > 1) {
      this.ctx.celebrate(mult, g.x, g.y);
      floatText(this.view, lp.x, lp.y - 30, `+${formatChips(win)}`, COLORS.lamp, 34);
    } else if (win > 0) {
      this.ctx.sfx.partial();
      floatText(this.view, lp.x, lp.y - 30, `${formatChips(win)} zurück`, 0xd9c6a0, 26);
    } else this.ctx.sfx.lose();
    this.phase = 'idle';
    this.refreshButtons();
    if (rewardLevel(mult) >= 3) {
      void winStage(this.shell.over, {
        x: 0,
        y: 0,
        w: this.shell.sw,
        h: this.shell.sh,
        title: ring === 0 ? 'VOLLTREFFER' : 'GROSSER TREFFER',
        sub: `${fmtM(mult)} Einsatz`,
        amount: win,
        accent: MOON,
        durationMs: mult >= 50 ? 2600 : 2100,
        onTick: () => this.ctx.sfx.tick(),
      });
    }
  }

  // ---- Frame ---------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    const dt = Math.min(dtMs, 60) / 1000;
    this.time += dt;
    this.face.rotation += dt * (this.calm ? SPIN * 0.4 : SPIN);
    // The moth hovers and breathes; its wings shimmer.
    this.archerBody.y = Math.sin(this.time * 2) * 2;
    this.archerBody.scale.set(1, 1 + Math.sin(this.time * 2) * 0.01);
    if (this.phase === 'idle') this.arm.rotation = 0.6 + Math.sin(this.time * 1.6) * 0.06;
    this.halo.alpha += (0.25 + Math.sin(this.time * 1.3) * 0.05 - this.halo.alpha) * Math.min(1, dt * 1.5);
  }

  busy() {
    return this.phase !== 'idle';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
    this.bgTex?.destroy(true);
    this.shell.destroy();
  }
}

function drawStation() {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, 120, 84, 18).fill(0x3a1424).stroke({ color: COLORS.brass, width: 2 });
  [30, 24, 18, 12, 5].forEach((r, i) => g.circle(60, 36, r).fill(RING_COLORS[4 - i]));
  c.addChild(g);
  const lamp = new Graphics().circle(60, 36, 5).fill(MOON);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const target: GameDefinition = {
  id: 'target',
  name: 'Zielscheibe',
  houseEdge: 1 - returnToPlayer('normal'),
  footprint: { w: 120, h: 84 },
  size: 'table',
  blurb: 'Ein Pfeil auf die Mondscheibe: sicher, normal oder riskant.',
  drawStation,
  create: (ctx) => new TargetGame(ctx),
};
