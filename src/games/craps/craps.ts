// "Straßenwürfel": street craps against a brick wall under a gas lantern. Two bone dice are
// thrown at the curb, bounce and tumble (the faces are drawn first, the path is simulated
// to land there), a chalk slate shows the throw and a brass puck marks the point.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, coinTexture, floatText, glowTexture, mothTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { SceneShell, type Layout } from '../sceneShell';
import { barSize, layoutBar } from '../barLayout';
import { FIELD_RTP, LINE_RTP, comeOut, fieldReturn, pointPays, rollDie } from './rules';
import { DIE_TEX, PUCK, dieTexture, drawCrapsStation, puckTexture, streetLayout, streetTexture, type StreetLayout } from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');
const CREAM = 0xfff3dc;
const CHALK = 0xf4eede;
const WIN = 0xffcf7a;
const LOSE = 0xff8a7a;

const RULES = [
  'Zwei Würfel, eine Wand – geworfen wird gegen den Bordstein.',
  '',
  '• Erster Wurf (Anwurf): 7 oder 11 gewinnt sofort 1:1. 2, 3 oder 12 verliert.',
  '• Jede andere Zahl wird dein Punkt. Wirf sie noch einmal, bevor eine 7 fällt: der Punkt zahlt 9:10 (ein halber Falter wird per Zufall auf- oder abgerundet). Kommt zuerst die 7, ist der Einsatz weg.',
  '• Feld (wahlweise, gleicher Einsatz, nur der Anwurf): 3, 4, 9, 10, 11 zahlen 1:1, 2 und 12 zahlen 2:1. 5, 6, 7 und 8 verlieren.',
  '',
  `Auf der Straße zahlt der Punkt 1:1 (98,6 %). Hier zahlt er 9:10, damit das Haus im Rahmen bleibt: Linie ${pct(LINE_RTP)}\u00a0% Auszahlungsquote, Feld ${pct(FIELD_RTP)}\u00a0%. Die Würfel fallen rein zufällig.`,
].join('\n');

// ---- Throw simulation ----------------------------------------------------------------------------------

interface DieFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
}

interface Throw {
  frames: [DieFrame, DieFrame][];
  /** Frame index → hit strength (0..1) for the clack sounds. */
  hits: Map<number, number>;
}

/**
 * Two dice flung from the bottom right towards the curb: gravity, bounces on the cobbles,
 * the curb and the sides, a knock between the dice. Tries a few throws until both come to
 * rest in the open street, apart from each other. Pure animation: the faces are already drawn.
 */
function simulateThrow(L: StreetLayout, rand = Math.random): Throw {
  const D = L.die;
  let best: Throw | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = 2600 * (D / 50);
    const dice = [0, 1].map((i) => ({
      x: L.sw - D * (1.1 + i * 1.3 + rand() * 0.6),
      y: L.sh - D * (0.7 + rand() * 0.3),
      z: D * (1 + rand() * 0.4),
      vx: -(0.25 + rand() * 0.45) * Math.min(L.sw, 900) * 1.1,
      vy: -(L.sh - L.wallH) * (1.5 + rand() * 0.7),
      vz: 260 + rand() * 220,
      yaw: rand() * 6.28,
      w: (rand() - 0.5) * 18,
      roll: 0,
    }));
    const frames: [DieFrame, DieFrame][] = [];
    const hits = new Map<number, number>();
    const hit = (f: number, s: number) => hits.set(f, Math.max(hits.get(f) ?? 0, Math.min(1, s)));
    const dt = 1 / 120;
    const top = L.wallH + D * 0.5;
    let t = 0;
    for (let step = 0; step < 120 * 3.4; step++) {
      t += dt;
      const f = frames.length;
      for (const d of dice) {
        d.vz -= g * dt;
        d.z += d.vz * dt;
        if (d.z <= 0) {
          d.z = 0;
          if (d.vz < -70) {
            hit(f, -d.vz / 700);
            d.vz = -d.vz * 0.42;
            d.vx *= 0.78;
            d.vy *= 0.78;
            d.w = d.w * 0.75 + (rand() - 0.5) * 6;
          } else d.vz = 0;
        }
        if (d.z === 0) {
          const k = Math.exp(-2.6 * dt);
          d.vx *= k;
          d.vy *= k;
          d.w *= Math.exp(-3.2 * dt);
        }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y < top) {
          d.y = top;
          hit(f, Math.abs(d.vy) / 900);
          d.vy = Math.abs(d.vy) * 0.6;
          d.vx += (rand() - 0.5) * 160;
          d.vz += 140;
          d.w += (rand() - 0.5) * 16;
        }
        if (d.x < D / 2) {
          d.x = D / 2;
          d.vx = Math.abs(d.vx) * 0.6;
          hit(f, 0.4);
        } else if (d.x > L.sw - D / 2) {
          d.x = L.sw - D / 2;
          d.vx = -Math.abs(d.vx) * 0.6;
          hit(f, 0.4);
        }
        if (d.y > L.sh - D * 0.55 && d.vy > 0) d.vy = -d.vy * 0.5;
        const sp = Math.hypot(d.vx, d.vy) + Math.abs(d.vz) * 0.3;
        d.roll += sp * dt;
        d.yaw += d.w * dt;
      }
      // The two dice knock against each other.
      const [a, b] = dice;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < D * 1.02 && Math.abs(a.z - b.z) < D * 0.7) {
        const nx = dx / dist;
        const ny = dy / dist;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= rel * nx * 0.9;
          a.vy -= rel * ny * 0.9;
          b.vx += rel * nx * 0.9;
          b.vy += rel * ny * 0.9;
          hit(f, rel / 600);
        }
        const push = (D * 1.02 - dist) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
      if (step % 2 === 0) frames.push([{ ...pick(a) }, { ...pick(b) }]);
      const still = dice.every((d) => d.z === 0 && Math.abs(d.vz) < 1 && Math.hypot(d.vx, d.vy) < 10);
      if (still && t > 0.8) break;
    }
    const end = frames[frames.length - 1];
    const R = L.rest;
    const inside = end.every((d) => d.x >= R.x && d.x <= R.x + R.w && d.y >= R.y && d.y <= R.y + R.h);
    const apart = Math.hypot(end[0].x - end[1].x, end[0].y - end[1].y) > D * 1.15;
    best = { frames, hits };
    if (inside && apart) break;
  }
  return best!;
}

function pick(d: DieFrame): DieFrame {
  return { x: d.x, y: d.y, z: d.z, yaw: d.yaw, roll: d.roll };
}

// ---- Game -----------------------------------------------------------------------------------------------

type Phase = 'idle' | 'rolling' | 'point' | 'settling';

interface DieView {
  root: Container;
  body: Sprite;
  shadow: Sprite;
  glow: Sprite;
}

class CrapsGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  private L!: StreetLayout;
  private streetTex: Texture | null = null;
  private street = new Sprite();
  private sceneLayer = new Container();
  private lanternGlow = new Sprite(glowTexture());
  private moths: { s: Sprite; a: number; r: number; sp: number }[] = [];
  private boxGlow = new Sprite(glowTexture());
  private chipLayer = new Container();
  private diceLayer = new Container();
  private dice: DieView[] = [];
  private puck = new Container();
  private puckSprite = new Sprite(puckTexture(false));
  private slateSum!: Text;
  private slateLine!: Text;
  private slateSub!: Text;
  private slateMaxW = 200;

  private phase: Phase = 'idle';
  private betIndex = 0;
  private bets: number[];
  private fieldOn = false;
  private point = 0;
  private lineStake = 0;
  private fieldStake = 0;
  private roundWin = 0;
  private roundTags: string[] = [];
  private faces: [number, number] = [3, 4];
  private time = 0;
  private calm = reducedMotion();
  private stakeWatch: StakeWatch;
  private lineChips: Container | null = null;
  private fieldChips: Container | null = null;

  // Controls.
  private minus!: Button;
  private plus!: Button;
  private betText!: Text;
  private fieldBtn!: Button;
  private actionBtn!: Button;

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.action();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.shell = new SceneShell({
      title: 'STRASSENWÜRFEL',
      accent: 0xffb860,
      rules: RULES,
      ctrlSize: barSize,
      buildControls: (c, w, h, layout, fs) => this.buildControls(c, w, h, layout, fs),
      layoutScene: (w, h, layout) => this.layoutScene(w, h, layout === 'tall'),
    });
    this.view.addChild(this.shell.board);
    this.shell.scene.addChild(this.sceneLayer);
    for (let i = 0; i < 2; i++) {
      const root = new Container();
      const shadow = new Sprite(glowTexture());
      shadow.anchor.set(0.5);
      shadow.tint = 0x000000;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.tint = WIN;
      glow.blendMode = 'add';
      glow.alpha = 0;
      const body = new Sprite(dieTexture(i ? 4 : 3));
      body.anchor.set(0.5);
      root.addChild(glow, body);
      this.dice.push({ root, body, shadow, glow });
    }
    this.puckSprite.anchor.set(0.5, 0.45);
    this.puck.addChild(this.puckSprite);
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Layout ------------------------------------------------------------------------------------------

  private layoutScene(w: number, h: number, tall: boolean) {
    this.L = streetLayout(w, h, tall);
    const L = this.L;
    this.streetTex?.destroy(true);
    this.streetTex = streetTexture(L, Math.min(2, Math.max(1.25, window.devicePixelRatio || 1)));
    this.street.texture = this.streetTex;
    const S = this.sceneLayer;
    S.removeChildren();
    S.addChild(this.street);
    // Lantern light flickers; three moths circle it.
    this.lanternGlow.anchor.set(0.5);
    this.lanternGlow.position.set(L.lantern.x, L.lantern.y);
    this.lanternGlow.width = 240;
    this.lanternGlow.height = 200;
    this.lanternGlow.tint = 0xffc070;
    this.lanternGlow.blendMode = 'add';
    S.addChild(this.lanternGlow);
    if (this.moths.length === 0) {
      for (let i = 0; i < 3; i++) {
        const s = new Sprite(mothTexture());
        s.anchor.set(0.5);
        s.width = s.height = 16 + i * 3;
        s.tint = 0xfff1c4;
        this.moths.push({ s, a: i * 2.1, r: 26 + i * 9, sp: 1.6 + i * 0.5 });
      }
    }
    for (const m of this.moths) S.addChild(m.s);
    this.boxGlow.anchor.set(0.5);
    this.boxGlow.tint = WIN;
    this.boxGlow.blendMode = 'add';
    this.boxGlow.alpha = 0;
    S.addChild(this.boxGlow);
    // Slate texts.
    const fs = this.shell.fs;
    const s = L.slate;
    const big = Math.round(Math.min(s.h * 0.8, 64));
    this.slateSum?.destroy();
    this.slateLine?.destroy();
    this.slateSub?.destroy();
    this.slateSum = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: big, fill: CHALK, stroke: { color: 0x101414, width: 3 } } });
    this.slateSum.anchor.set(0.5);
    this.slateSum.position.set(s.x + 16 + big * 0.62, s.y + s.h / 2 + 2);
    const tx = s.x + 26 + big * 1.3;
    const tw = s.x + s.w - 12 - tx;
    this.slateLine = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fs(Math.min(30, s.h * 0.4)), fontWeight: '700', fill: CHALK, letterSpacing: 1 } });
    this.slateLine.anchor.set(0, 0.5);
    this.slateLine.position.set(tx, s.y + s.h * 0.36);
    this.slateSub = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fs(Math.min(19, s.h * 0.27)), fontWeight: '600', fill: 0xcfc8b4 } });
    this.slateSub.anchor.set(0, 0.5);
    this.slateSub.position.set(tx, s.y + s.h * 0.7);
    this.slateMaxW = tw;
    S.addChild(this.slateSum, this.slateLine, this.slateSub);
    S.addChild(this.chipLayer);
    // Puck.
    const pk = Math.min(1, (L.line.h - 6) / PUCK);
    this.puck.scale.set(pk);
    this.placePuck(false);
    S.addChild(this.puck);
    // Dice.
    const D = L.die;
    for (const d of this.dice) {
      d.body.scale.set(D / (DIE_TEX * 0.8));
      d.glow.width = d.glow.height = D * 2.2;
      d.shadow.width = D * 1.5;
      d.shadow.height = D * 0.9;
      d.shadow.alpha = 0.55;
      S.addChild(d.shadow);
    }
    S.addChild(this.diceLayer);
    for (const d of this.dice) this.diceLayer.addChild(d.root);
    if (this.phase === 'idle' || this.phase === 'point') this.restDice();
    this.refreshChips();
    this.refreshSlate();
  }

  /** Dice at rest in the middle of the street showing the last faces. */
  private restDice() {
    const L = this.L;
    const cx = L.rest.x + L.rest.w * 0.5;
    const cy = L.rest.y + L.rest.h * 0.45;
    this.dice.forEach((d, i) => {
      const x = cx + (i ? 0.75 : -0.75) * L.die;
      const y = cy + (i ? 0.2 : -0.15) * L.die;
      this.drawDie(i, { x, y, z: 0, yaw: i ? 0.25 : -0.18, roll: 0 }, this.faces[i]);
    });
  }

  private placePuck(on: boolean) {
    const L = this.L;
    if (on && this.point) {
      const b = L.boxes[[4, 5, 6, 8, 9, 10].indexOf(this.point)];
      this.puck.position.set(b.x + b.w / 2, b.y + 4);
    } else this.puck.position.set(L.puckHome.x, L.puckHome.y);
    this.puckSprite.texture = puckTexture(on);
    this.boxGlow.alpha = 0;
    if (on && this.point) {
      const b = L.boxes[[4, 5, 6, 8, 9, 10].indexOf(this.point)];
      this.boxGlow.position.set(b.x + b.w / 2, b.y + b.h / 2);
      this.boxGlow.width = b.w * 1.8;
      this.boxGlow.height = b.h * 1.8;
      this.boxGlow.alpha = 0.35;
    }
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    const tall = layout === 'tall';
    const rtp = new Text({
      text: `Linie: Auszahlungsquote ${pct(LINE_RTP)}\u00a0% · Hausvorteil ${pct(1 - LINE_RTP)}\u00a0%\nFeld: Auszahlungsquote ${pct(FIELD_RTP)}\u00a0% · Hausvorteil ${pct(1 - FIELD_RTP)}\u00a0%`,
      style: { fontFamily: FONT_BODY, fontSize: fs(tall ? 13 : 15), fontWeight: '600', fill: 0xbfa98a, lineHeight: fs(tall ? 15 : 18) },
    });
    const bar = layoutBar(c, width, height, layout, fs, {
      stepCaption: 'EINSATZ LINIE',
      onStep: (d) => this.changeBet(d),
      secCaption: 'FELD (ANWURF)',
      secondary: (w) => button({ label: '', ariaLabel: (t) => `Feld-Wette: ${t}`, width: w, height: 52, color: 0x2e3a2a, textColor: CREAM, fontSize: fs(19), display: false, onClick: () => this.toggleField() }),
      main: (w, h, f) => button({ label: 'WÜRFELN', width: w, height: h, color: COLORS.brass, fontSize: f, onClick: () => void this.action() }),
      rtp,
    });
    this.minus = bar.minus;
    this.plus = bar.plus;
    this.betText = bar.text;
    this.fieldBtn = bar.secondary;
    this.actionBtn = bar.main;
    this.changeBet(0);
    this.toggleField(false);
  }


  // ---- Controls -----------------------------------------------------------------------------------------

  private changeBet(d: number) {
    if (d !== 0 && this.phase !== 'idle') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.betText.scale.set(Math.min(1, 84 / Math.max(1, this.betText.width / this.betText.scale.x)));
    this.refreshButtons();
    if (d !== 0) this.ctx.sfx.chip();
  }

  private toggleField(flip = true) {
    if (flip) {
      if (this.phase !== 'idle') return;
      this.fieldOn = !this.fieldOn;
      this.ctx.sfx.chip();
    }
    this.fieldBtn.setLabel(this.fieldOn ? 'AN · gleicher Einsatz' : 'AUS');
    this.fieldBtn.setSelected(this.fieldOn);
    this.refreshButtons();
    if (this.phase === 'idle') this.refreshChips();
  }

  private refreshButtons() {
    if (!this.actionBtn) return;
    const idle = this.phase === 'idle';
    this.minus.setEnabled(idle && this.betIndex > 0);
    this.plus.setEnabled(idle && this.betIndex < this.bets.length - 1);
    this.fieldBtn.setEnabled(idle);
    const total = this.bet * (this.fieldOn ? 2 : 1);
    if (idle) this.actionBtn.setLabel(`WÜRFELN · ${formatChips(total)}`);
    else if (this.phase === 'point') this.actionBtn.setLabel(`WÜRFELN · PUNKT ${this.point}`);
    this.actionBtn.setEnabled(idle || this.phase === 'point');
  }

  // ---- Chips ---------------------------------------------------------------------------------------------

  private coinStack(amount: number, ghost: boolean) {
    const c = new Container();
    const n = Math.max(1, Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, amount / this.bets[0])))));
    const size = Math.min(40, this.L.line.h * 0.62);
    for (let i = 0; i < n; i++) {
      const s = new Sprite(coinTexture());
      s.anchor.set(0.5);
      s.width = size;
      s.height = size * 0.62;
      s.y = -i * size * 0.13;
      c.addChild(s);
    }
    const t = new Text({ text: formatChips(amount), style: { fontFamily: FONT_BODY, fontSize: this.shell.fs(17), fontWeight: '700', fill: CREAM, stroke: { color: 0x14080f, width: 4 } } });
    t.anchor.set(0, 0.5);
    t.position.set(size * 0.6, -n * size * 0.06);
    c.addChild(t);
    c.alpha = ghost ? 0.45 : 1;
    return c;
  }

  /** Coins on the line and the field: the planned bet (faint) while idle, the real stake during a round. */
  private refreshChips() {
    if (!this.L) return;
    this.chipLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.lineChips = this.fieldChips = null;
    const idle = this.phase === 'idle';
    const line = idle ? this.bet : this.lineStake;
    const field = idle ? (this.fieldOn ? this.bet : 0) : this.fieldStake;
    if (line > 0) {
      this.lineChips = this.coinStack(line, idle);
      this.lineChips.position.set(this.L.lineChip.x, this.L.lineChip.y);
      this.chipLayer.addChild(this.lineChips);
    }
    if (field > 0) {
      this.fieldChips = this.coinStack(field, idle);
      this.fieldChips.position.set(this.L.fieldChip.x - 30, this.L.fieldChip.y);
      this.chipLayer.addChild(this.fieldChips);
    }
  }

  // ---- Slate ---------------------------------------------------------------------------------------------

  private slate(sum: string, line: string, sub: string, color = CHALK) {
    if (!this.slateSum) return;
    this.slateSum.text = sum;
    this.slateSum.style.fill = color;
    this.slateLine.text = line;
    this.slateLine.style.fill = color;
    const maxW = this.slateMaxW;
    this.slateLine.scale.set(1);
    if (this.slateLine.width > maxW) this.slateLine.scale.set(maxW / this.slateLine.width);
    this.slateSub.text = sub;
    this.slateSub.scale.set(1);
    if (this.slateSub.width > maxW) this.slateSub.scale.set(maxW / this.slateSub.width);
    const big = this.slateSum.style.fontSize as number;
    this.slateSum.scale.set(1);
    if (this.slateSum.width > big * 1.3) this.slateSum.scale.set((big * 1.3) / this.slateSum.width);
  }

  private refreshSlate() {
    if (this.phase === 'point') this.slate(String(this.faces[0] + this.faces[1]), `PUNKT ${this.point}`, `Die ${this.point} vor der 7`);
    else if (this.phase === 'idle') this.slate('?', 'ANWURF', '7 oder 11 gewinnt');
  }

  // ---- Round ---------------------------------------------------------------------------------------------

  async action() {
    if (this.shell.rulesOpen) return;
    if (this.phase === 'idle') return this.startRound();
    if (this.phase === 'point') return this.throwDice();
  }

  private async startRound() {
    const line = this.bet;
    const field = this.fieldOn ? this.bet : 0;
    if (!this.ctx.state.placeBet(line + field)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.lineStake = line;
    this.fieldStake = field;
    this.roundWin = 0;
    this.roundTags = ['craps'];
    this.point = 0;
    this.phase = 'rolling';
    this.refreshChips();
    for (const c of [this.lineChips, this.fieldChips]) {
      if (!c || this.calm) continue;
      c.y -= 16;
      void tween(c, { y: c.y + 16 }, 220, ease.outBack);
    }
    this.ctx.sfx.chip();
    await this.throwDice();
  }

  private async throwDice() {
    this.phase = 'rolling';
    this.refreshButtons();
    // The result first, then a throw that lands on it.
    const faces: [number, number] = [rollDie(), rollDie()];
    const sum = faces[0] + faces[1];
    this.slate('', this.point ? `PUNKT ${this.point}` : 'ANWURF', 'Die Würfel rollen …');
    await this.animateThrow(faces);
    this.faces = faces;
    this.shell.addHistory(String(sum), this.historyColor(sum), 0x1a0c10);
    if (this.point === 0) await this.resolveComeOut(sum);
    else await this.resolvePoint(sum);
  }

  private historyColor(sum: number) {
    if (this.point === 0) return comeOut(sum) === 'natural' ? 0xffcf7a : comeOut(sum) === 'craps' ? 0xc86a5a : 0xd9cfb8;
    return sum === this.point ? 0xffcf7a : sum === 7 ? 0xc86a5a : 0xd9cfb8;
  }

  private async resolveComeOut(sum: number) {
    // The field is decided by the first throw.
    if (this.fieldStake > 0) {
      const r = fieldReturn(sum);
      if (r > 0) {
        this.roundTags.push('field');
        await this.payStack(this.fieldChips, this.fieldStake * r, this.fieldStake);
      } else this.rakeStack(this.fieldChips);
    }
    const k = comeOut(sum);
    if (k === 'natural') {
      this.roundTags.push('natural');
      this.slate(String(sum), 'NATURAL!', `${sum} gewinnt 1:1`, WIN);
      this.glowDice(WIN);
      await this.payStack(this.lineChips, this.lineStake * 2, this.lineStake);
      return this.finish();
    }
    if (k === 'craps') {
      this.slate(String(sum), 'VERLOREN', `${sum} beim Anwurf`, LOSE);
      this.glowDice(LOSE);
      this.rakeStack(this.lineChips);
      this.ctx.sfx.lose();
      return this.finish();
    }
    // Point: the puck flips to "AN" and slides onto its box.
    this.point = sum;
    this.slate(String(sum), `PUNKT ${sum}`, `Die ${sum} vor der 7`, WIN);
    this.ctx.sfx.chip();
    await this.movePuck(true);
    this.phase = 'point';
    this.refreshButtons();
  }

  private async resolvePoint(sum: number) {
    if (sum === this.point) {
      this.roundTags.push('point');
      this.slate(String(sum), 'PUNKT!', `${sum} vor der 7 · zahlt 9:10`, WIN);
      this.glowDice(WIN);
      await this.payStack(this.lineChips, pointPays(this.lineStake), this.lineStake);
      await this.movePuck(false);
      return this.finish();
    }
    if (sum === 7) {
      this.roundTags.push('seven');
      this.slate('7', 'SIEBEN', `Punkt ${this.point} verloren`, LOSE);
      this.glowDice(LOSE);
      this.rakeStack(this.lineChips);
      this.ctx.sfx.lose();
      await this.movePuck(false);
      return this.finish();
    }
    this.slate(String(sum), `PUNKT ${this.point}`, `${sum} zählt nicht · weiter`);
    this.phase = 'point';
    this.refreshButtons();
  }

  private async finish() {
    this.phase = 'settling';
    const stake = this.lineStake + this.fieldStake;
    const rtp = (this.lineStake * LINE_RTP + this.fieldStake * FIELD_RTP) / stake;
    // One report per round (tags: craps; natural = 7/11 on the first throw, point = point made,
    // seven = seven-out, field = the field bet won).
    this.ctx.state.report({ game: 'craps', stake, win: this.roundWin, rtp, tags: this.roundTags });
    const mult = this.roundWin / stake;
    if (mult > 1) {
      const p = this.shell.scene.toGlobal({ x: this.L.lineChip.x, y: this.L.lineChip.y });
      this.ctx.celebrate(mult, p.x, p.y);
      this.ctx.sfx.win();
      if (rewardLevel(mult) >= 2) this.ctx.particles.lightWave(p.x, p.y, COLORS.lamp, 300);
    }
    await wait(this.calm ? 500 : 1100);
    this.point = 0;
    this.lineStake = this.fieldStake = 0;
    this.phase = 'idle';
    this.glowDice(0);
    this.refreshChips();
    this.refreshButtons();
    this.refreshSlate();
  }

  // ---- Animation ----------------------------------------------------------------------------------------

  private drawDie(i: number, f: DieFrame, face: number, squash = 1) {
    const d = this.dice[i];
    const D = this.L.die;
    d.root.position.set(f.x, f.y - f.z);
    d.root.rotation = f.yaw;
    const lift = 1 + f.z / (D * 5);
    d.root.scale.set(lift, lift * squash);
    d.body.texture = dieTexture(face);
    d.shadow.position.set(f.x + f.z * 0.12, f.y + D * 0.22);
    const k = 1 / (1 + f.z / (D * 1.5));
    d.shadow.scale.set((D * 1.5 / 256) * (0.7 + 0.3 * k), (D * 0.9 / 256) * (0.7 + 0.3 * k));
    d.shadow.alpha = 0.3 + 0.35 * k;
  }

  private async animateThrow(faces: [number, number]) {
    const L = this.L;
    this.glowDice(0);
    this.ctx.sfx.whoosh();
    if (this.calm) {
      // Calm: the dice simply appear on the street.
      this.dice.forEach((d) => (d.root.alpha = 0));
      this.faces = faces;
      this.restDice();
      await Promise.all(this.dice.map((d) => tween(d.root, { alpha: 1 }, 250)));
      this.ctx.sfx.diceHit(0.6);
      return;
    }
    const th = simulateThrow(L);
    const frames = th.frames;
    const flip = L.die * 0.85;
    // Faces along the way: random, the last flip lands on the drawn face.
    const plan = [0, 1].map((i) => {
      const last = frames[frames.length - 1][i].roll;
      const n = Math.max(2, Math.round(last / flip));
      const k = (n * flip) / Math.max(1, last);
      const seq: number[] = [];
      for (let j = 0; j <= n; j++) {
        let v = 1 + Math.floor(Math.random() * 6);
        if (j > 0 && v === seq[j - 1]) v = (v % 6) + 1;
        seq.push(v);
      }
      seq[n] = faces[i];
      if (seq[n - 1] === faces[i]) seq[n - 1] = (faces[i] % 6) + 1;
      return { k, seq };
    });
    const total = frames.length * (1000 / 60);
    let lastFrame = -1;
    await animate(total, (t) => {
      const fi = Math.min(frames.length - 1, Math.floor(t * (frames.length - 1)));
      for (let f = lastFrame + 1; f <= fi; f++) {
        const h = th.hits.get(f);
        if (h) this.ctx.sfx.diceHit(h);
      }
      lastFrame = fi;
      for (let i = 0; i < 2; i++) {
        const fr = frames[fi][i];
        const roll = fr.roll * plan[i].k;
        const idx = Math.min(plan[i].seq.length - 1, Math.floor(roll / flip + 0.5));
        const ph = roll / flip - Math.floor(roll / flip);
        const squash = 0.62 + 0.38 * Math.abs(Math.cos(Math.PI * ph));
        this.drawDie(i, fr, plan[i].seq[idx], squash);
      }
    });
    const end = frames[frames.length - 1];
    for (let i = 0; i < 2; i++) this.drawDie(i, end[i], faces[i]);
    // A little settle pop.
    this.dice.forEach((d) => {
      const s = d.root.scale.x;
      d.root.scale.set(s * 1.12);
      void tween(d.root.scale, { x: s, y: s }, 260, ease.outBack);
    });
  }

  private glowDice(color: number) {
    for (const d of this.dice) {
      d.glow.alpha = color ? 0.85 : 0;
      if (color) d.glow.tint = color;
    }
  }

  private async movePuck(on: boolean) {
    const L = this.L;
    const target = on ? L.boxes[[4, 5, 6, 8, 9, 10].indexOf(this.point)] : null;
    const to = target ? { x: target.x + target.w / 2, y: target.y + 4 } : L.puckHome;
    if (this.calm) {
      this.placePuck(on);
      return;
    }
    const sx = this.puckSprite.scale.x;
    // Flip on the spot, then slide.
    await tween(this.puckSprite.scale, { x: 0.05 }, 110, ease.inCubic);
    this.puckSprite.texture = puckTexture(on);
    await tween(this.puckSprite.scale, { x: sx }, 140, ease.outCubic);
    const from = { x: this.puck.x, y: this.puck.y };
    await animate(420, (k) => {
      this.puck.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 30);
    }, ease.inOutCubic);
    this.ctx.sfx.thud();
    this.placePuck(on);
  }

  /** Winning coins: the payout slides in next to the stake, then everything goes to the purse. */
  private async payStack(stack: Container | null, amount: number, stake: number) {
    this.roundWin += amount;
    this.ctx.state.payout(amount);
    if (!stack) return;
    const pay = this.coinStack(amount - stake, false);
    pay.position.set(stack.x - 64, stack.y);
    pay.alpha = 0;
    this.chipLayer.addChild(pay);
    void tween(pay, { alpha: 1, x: stack.x - 52 }, 260, ease.outCubic);
    for (let i = 0; i < 4; i++) this.ctx.sfx.coin(i * 0.06);
    const local = this.view.toLocal(this.shell.scene.toGlobal({ x: stack.x, y: stack.y }));
    floatText(this.view, local.x, local.y - 30, `+${formatChips(amount)}`, COLORS.lamp, Math.round(30 * this.shell.s + 6));
    await wait(this.calm ? 200 : 520);
    void tween(pay, { alpha: 0, y: pay.y + 20 }, 300, ease.inCubic);
    void tween(stack, { alpha: 0, y: stack.y + 20 }, 300, ease.inCubic);
  }

  private rakeStack(stack: Container | null) {
    if (!stack) return;
    void tween(stack, { alpha: 0, y: stack.y - 60 }, 420, ease.inCubic, 200);
  }

  // ---- Frame ---------------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
    this.refreshButtons();
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.refreshChips();
      this.ctx.toast(this.stakeWatch.note);
    }
    const dt = dtMs / 1000;
    this.time += dt;
    if (!this.L) return;
    const flick = this.calm ? 0 : Math.sin(this.time * 11) * 0.04 + Math.sin(this.time * 23.7) * 0.03;
    this.lanternGlow.alpha = 0.55 + flick;
    for (const m of this.moths) {
      m.a += m.sp * dt * (this.calm ? 0.3 : 1);
      m.s.position.set(this.L.lantern.x + Math.cos(m.a) * m.r, this.L.lantern.y + Math.sin(m.a * 1.3) * m.r * 0.45);
      m.s.scale.x = (m.s.scale.y || 0.1) * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 18 + m.r)));
    }
    if (this.boxGlow.alpha > 0) this.boxGlow.alpha = 0.3 + 0.12 * Math.sin(this.time * 4);
    for (const d of this.dice) if (d.glow.alpha > 0) d.glow.alpha = 0.6 + 0.25 * Math.sin(this.time * 5);
  }

  busy() {
    return this.phase !== 'idle';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.shell.destroy();
    this.streetTex?.destroy(true);
    this.view.destroy({ children: true });
  }
}

export const craps: GameDefinition = {
  id: 'craps',
  name: 'Straßenwürfel',
  houseEdge: 1 - LINE_RTP,
  footprint: { w: 128, h: 76 },
  size: 'table',
  blurb: 'Würfel gegen die Wand: 7 oder 11 gewinnt, sonst jagst du deinen Punkt.',
  drawStation: () => drawCrapsStation(),
  create: (ctx) => new CrapsGame(ctx),
};
