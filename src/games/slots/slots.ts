// Three-reel slot machine with one payline.

import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, countUp, floatText, glowTexture, gradientTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { SYMBOLS, symbolTextures, type SymbolId } from './symbols';

// ---- Rules -------------------------------------------------------------

const WEIGHTS: Record<SymbolId, number> = { cherry: 20, lemon: 30, bell: 20, bar: 13, seven: 7, diamond: 4 };
const PAY3: Record<SymbolId, number> = { cherry: 5, lemon: 10, bell: 15, bar: 30, seven: 80, diamond: 200 };
const PAY_TWO_CHERRIES = 3;
const PAY_ONE_CHERRY = 1;
const PAY_MIXED_HIGH = 10; // any mix of 7 and diamond
const TOTAL_WEIGHT = SYMBOLS.reduce((s, k) => s + WEIGHTS[k], 0);

function roll(): SymbolId {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) {
    r -= WEIGHTS[s];
    if (r < 0) return s;
  }
  return 'lemon';
}

/** Payout multiplier for the middle line. */
export function evaluate(line: SymbolId[]): { mult: number; hits: number[]; kind: 'none' | 'small' | 'jackpot' } {
  const [a, b, c] = line;
  if (a === b && b === c) {
    return { mult: PAY3[a], hits: [0, 1, 2], kind: a === 'seven' || a === 'diamond' ? 'jackpot' : 'small' };
  }
  const high = (s: SymbolId) => s === 'seven' || s === 'diamond';
  if (high(a) && high(b) && high(c)) return { mult: PAY_MIXED_HIGH, hits: [0, 1, 2], kind: 'small' };
  if (a === 'cherry' && b === 'cherry') return { mult: PAY_TWO_CHERRIES, hits: [0, 1], kind: 'small' };
  if (a === 'cherry') return { mult: PAY_ONE_CHERRY, hits: [0], kind: 'small' };
  return { mult: 0, hits: [], kind: 'none' };
}

/** Exact long-run payout ratio, computed from the table above (shown to the player). */
export function returnToPlayer() {
  const P = (s: SymbolId) => WEIGHTS[s] / TOTAL_WEIGHT;
  let r = 0;
  for (const s of SYMBOLS) r += P(s) ** 3 * PAY3[s];
  r += P('cherry') ** 2 * (1 - P('cherry')) * PAY_TWO_CHERRIES;
  r += P('cherry') * (1 - P('cherry')) * PAY_ONE_CHERRY;
  const hi = P('seven') + P('diamond');
  r += (hi ** 3 - P('seven') ** 3 - P('diamond') ** 3) * PAY_MIXED_HIGH;
  return r;
}

// ---- Themes ------------------------------------------------------------

interface SlotTheme {
  title: string;
  bodyTop: string;
  bodyBottom: string;
  trim: number;
  neon: number;
  bets: number[];
}

const THEMES: Record<string, SlotTheme> = {
  classic: { title: 'NACHTFALTER', bodyTop: '#7a1d34', bodyBottom: '#2a0f1c', trim: COLORS.brass, neon: COLORS.neon, bets: [10, 20, 50, 100] },
  diamond: { title: 'DIAMANT', bodyTop: '#16526b', bodyBottom: '#0a1a2a', trim: 0x9fe8ff, neon: COLORS.cyan, bets: [50, 100, 250, 500] },
  gold: { title: 'GOLDMOTTE', bodyTop: '#8a6a1f', bodyBottom: '#2a1d08', trim: 0xfff1c4, neon: COLORS.lamp, bets: [100, 250, 500, 1000] },
};

const themeOf = (o: Record<string, unknown>) => THEMES[(o.theme as string) ?? 'classic'] ?? THEMES.classic;

// ---- Layout constants (design size, scaled to fit the screen) ----------

const W = 560;
const H = 780;
const SYM = 110;
const REEL_W = 140;
const REEL_GAP = 10;
const REELS_X = (W - (REEL_W * 3 + REEL_GAP * 2)) / 2;
const REELS_Y = 190;

class SlotGame implements GameInstance {
  view = new Container();
  private cabinet = new Container();
  private reels: { strip: Container; sprites: Sprite[]; blur: BlurFilter }[] = [];
  private current: SymbolId[][] = [];
  private bulbs: Graphics[] = [];
  private bulbPhase = 0;
  private flashUntil = 0;
  private spinning = false;
  private betIndex = 0;
  private betText!: Text;
  private winText!: Text;
  private spinBtn!: Button;
  private minus!: Button;
  private plus!: Button;
  private paytable!: Container;
  private theme: SlotTheme;
  private payline!: Graphics;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.spin();
    }
  };

  constructor(private ctx: GameContext) {
    this.theme = themeOf(ctx.options);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
  }

  private get bet() {
    return this.theme.bets[this.betIndex];
  }

  private build() {
    const t = this.theme;
    const tex = symbolTextures();
    const c = this.cabinet;
    this.view.addChild(c);

    // Light spilling behind the machine.
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(W / 2, H / 2);
    halo.width = W * 2;
    halo.height = H * 1.6;
    halo.tint = t.neon;
    halo.alpha = 0.35;
    halo.blendMode = 'add';
    c.addChild(halo);

    // Body.
    const shadow = new Graphics().roundRect(10, 18, W, H, 40).fill({ color: 0x000000, alpha: 0.5 });
    c.addChild(shadow);
    const body = new Sprite(gradientTexture('slot-' + t.title, W, H, [[0, t.bodyTop], [1, t.bodyBottom]]));
    const bodyMask = new Graphics().roundRect(0, 0, W, H, 40).fill(0xffffff);
    body.mask = bodyMask;
    c.addChild(body, bodyMask);
    c.addChild(new Graphics().roundRect(0, 0, W, H, 40).stroke({ color: t.trim, width: 6 }));
    c.addChild(new Graphics().roundRect(12, 12, W - 24, H - 24, 30).stroke({ color: t.trim, width: 2, alpha: 0.4 }));

    // Marquee with chasing bulbs.
    const marquee = new Graphics().roundRect(30, 26, W - 60, 120, 24).fill(0x14080f).stroke({ color: t.trim, width: 3 });
    c.addChild(marquee);
    for (let i = 0; i < 26; i++) {
      const p = i / 26;
      let x: number, y: number;
      // Walk around the marquee rectangle.
      const per = 2 * (W - 80) + 2 * 100;
      let d = p * per;
      if (d < W - 80) {
        x = 40 + d;
        y = 36;
      } else if ((d -= W - 80) < 100) {
        x = W - 40;
        y = 36 + d;
      } else if ((d -= 100) < W - 80) {
        x = W - 40 - d;
        y = 136;
      } else {
        d -= W - 80;
        x = 40;
        y = 136 - d;
      }
      const b = new Graphics().circle(0, 0, 5).fill(0xffffff);
      b.position.set(x, y);
      b.tint = t.neon;
      this.bulbs.push(b);
      c.addChild(b);
    }
    const title = new Text({
      text: t.title,
      style: { fontFamily: FONT_DISPLAY, fontSize: 52, fill: 0xfff6e6, letterSpacing: 4 },
    });
    title.anchor.set(0.5);
    title.position.set(W / 2, 86);
    title.filters = [new GlowFilter({ color: t.neon, distance: 18, outerStrength: 3, innerStrength: 0.5, quality: 0.2 })];
    c.addChild(title);

    // Reel window.
    const winX = REELS_X - 14;
    const winW = REEL_W * 3 + REEL_GAP * 2 + 28;
    c.addChild(new Graphics().roundRect(winX, REELS_Y - 14, winW, SYM * 3 + 28, 18).fill(0x0a0508).stroke({ color: t.trim, width: 4 }));
    for (let i = 0; i < 3; i++) {
      const x = REELS_X + i * (REEL_W + REEL_GAP);
      const bg = new Sprite(gradientTexture('reel', REEL_W, SYM * 3, [[0, '#cfc2a8'], [0.5, '#fffaf0'], [1, '#cfc2a8']]));
      bg.position.set(x, REELS_Y);
      c.addChild(bg);
      const holder = new Container();
      holder.position.set(x, REELS_Y);
      const mask = new Graphics().rect(x, REELS_Y, REEL_W, SYM * 3).fill(0xffffff);
      holder.mask = mask;
      const strip = new Container();
      const blur = new BlurFilter({ strength: 0, quality: 2 });
      blur.strengthX = 0;
      strip.filters = [blur];
      holder.addChild(strip);
      c.addChild(holder, mask);
      const start = [roll(), roll(), roll()];
      this.current.push(start);
      const sprites = start.map((s, k) => {
        const sp = new Sprite(tex[s]);
        sp.anchor.set(0.5);
        sp.width = sp.height = 92;
        sp.position.set(REEL_W / 2, k * SYM + SYM / 2);
        strip.addChild(sp);
        return sp;
      });
      this.reels.push({ strip, sprites, blur });
      // Curved-glass shading.
      const shade = new Sprite(
        gradientTexture('reelshade', REEL_W, SYM * 3, [
          [0, 'rgba(0,0,0,0.55)'],
          [0.25, 'rgba(0,0,0,0)'],
          [0.75, 'rgba(0,0,0,0)'],
          [1, 'rgba(0,0,0,0.55)'],
        ]),
      );
      shade.position.set(x, REELS_Y);
      c.addChild(shade);
    }
    // Payline.
    this.payline = new Graphics();
    const py = REELS_Y + SYM * 1.5;
    this.payline.moveTo(winX - 6, py).lineTo(winX + winW + 6, py).stroke({ color: COLORS.red, width: 3, alpha: 0.85 });
    this.payline.poly([winX - 18, py - 10, winX - 4, py, winX - 18, py + 10]).fill(COLORS.red);
    this.payline.poly([winX + winW + 18, py - 10, winX + winW + 4, py, winX + winW + 18, py + 10]).fill(COLORS.red);
    c.addChild(this.payline);
    // Glass reflection.
    const glass = new Graphics().poly([winX, REELS_Y - 14, winX + winW * 0.45, REELS_Y - 14, winX + winW * 0.2, REELS_Y + SYM * 3 + 14, winX, REELS_Y + SYM * 3 + 14]);
    glass.fill({ color: 0xffffff, alpha: 0.05 });
    c.addChild(glass);

    // Win display.
    const ly = REELS_Y + SYM * 3 + 34;
    c.addChild(new Graphics().roundRect(70, ly, W - 140, 64, 14).fill(0x050304).stroke({ color: t.trim, width: 2, alpha: 0.6 }));
    const winLabel = label('GEWINN', 16, 0xb69a6a);
    winLabel.position.set(90, ly + 8);
    c.addChild(winLabel);
    this.winText = new Text({ text: '0', style: { fontFamily: FONT_DISPLAY, fontSize: 34, fill: COLORS.lamp } });
    this.winText.anchor.set(1, 0.5);
    this.winText.position.set(W - 90, ly + 34);
    c.addChild(this.winText);

    // Controls.
    const cy = ly + 128;
    const betBox = new Graphics().roundRect(56, cy - 36, 270, 72, 36).fill({ color: 0x000000, alpha: 0.35 });
    c.addChild(betBox);
    this.minus = button({ label: '–', width: 56, height: 56, onClick: () => this.changeBet(-1) });
    this.minus.position.set(92, cy);
    this.plus = button({ label: '+', width: 56, height: 56, onClick: () => this.changeBet(1) });
    this.plus.position.set(290, cy);
    const betLabel = label('EINSATZ', 14, 0xb69a6a);
    betLabel.anchor.set(0.5);
    betLabel.position.set(191, cy - 18);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.betText.position.set(191, cy + 8);
    c.addChild(this.minus, this.plus, betLabel, this.betText);

    this.spinBtn = button({ label: 'DREH', width: 160, height: 84, color: t.neon, textColor: 0x1a0610, fontSize: 30, onClick: () => void this.spin() });
    this.spinBtn.position.set(W - 130, cy);
    c.addChild(this.spinBtn);

    // Footer: transparency + paytable.
    const rtp = returnToPlayer();
    const info = new Text({
      text: `Auszahlungsquote ${(rtp * 100).toFixed(1).replace('.', ',')} %  ·  Hausvorteil ${((1 - rtp) * 100).toFixed(1).replace('.', ',')} %`,
      style: { fontFamily: FONT_BODY, fontSize: 17, fill: 0xd9c6a0 },
    });
    info.anchor.set(0.5);
    info.position.set(W / 2, H - 52);
    c.addChild(info);
    const ptBtn = new Text({ text: 'Gewinntabelle ansehen', style: { fontFamily: FONT_BODY, fontSize: 17, fill: COLORS.lamp, fontWeight: '700' } });
    ptBtn.anchor.set(0.5);
    ptBtn.position.set(W / 2, H - 28);
    ptBtn.eventMode = 'static';
    ptBtn.cursor = 'pointer';
    ptBtn.on('pointertap', () => (this.paytable.visible = !this.paytable.visible));
    c.addChild(ptBtn);
    this.paytable = this.buildPaytable();
    this.paytable.visible = false;
    c.addChild(this.paytable);

    this.updateBet();
  }

  private buildPaytable() {
    const tex = symbolTextures();
    const p = new Container();
    p.addChild(new Graphics().roundRect(40, 170, W - 80, 440, 20).fill({ color: 0x0b0609, alpha: 0.96 }).stroke({ color: this.theme.trim, width: 3 }));
    const head = label('GEWINNTABELLE · mittlere Linie', 22, COLORS.lamp);
    head.position.set(64, 186);
    p.addChild(head);
    const rows: [SymbolId[], string][] = [
      [['diamond', 'diamond', 'diamond'], `${PAY3.diamond}×`],
      [['seven', 'seven', 'seven'], `${PAY3.seven}×`],
      [['bar', 'bar', 'bar'], `${PAY3.bar}×`],
      [['bell', 'bell', 'bell'], `${PAY3.bell}×`],
      [['lemon', 'lemon', 'lemon'], `${PAY3.lemon}×`],
      [['cherry', 'cherry', 'cherry'], `${PAY3.cherry}×`],
      [['seven', 'diamond', 'seven'], `${PAY_MIXED_HIGH}×  (7 und Diamant gemischt)`],
      [['cherry', 'cherry'], `${PAY_TWO_CHERRIES}×  (links)`],
      [['cherry'], `${PAY_ONE_CHERRY}×  (links, Einsatz zurück)`],
    ];
    rows.forEach(([syms, txt], i) => {
      const y = 228 + i * 41;
      syms.forEach((s, k) => {
        const sp = new Sprite(tex[s]);
        sp.width = sp.height = 34;
        sp.position.set(70 + k * 38, y);
        p.addChild(sp);
      });
      const t = label(txt, 20, 0xfff6e6);
      t.position.set(200, y + 4);
      p.addChild(t);
    });
    p.eventMode = 'static';
    p.cursor = 'pointer';
    p.on('pointertap', () => (p.visible = false));
    return p;
  }

  private changeBet(d: number) {
    if (this.spinning) return;
    this.betIndex = Math.max(0, Math.min(this.theme.bets.length - 1, this.betIndex + d));
    this.updateBet();
  }

  private updateBet() {
    this.betText.text = formatChips(this.bet);
    this.minus.setEnabled(this.betIndex > 0 && !this.spinning);
    this.plus.setEnabled(this.betIndex < this.theme.bets.length - 1 && !this.spinning);
    this.spinBtn.setEnabled(!this.spinning);
  }

  async spin() {
    if (this.spinning) return;
    if (!this.ctx.state.placeBet(this.bet)) {
      this.ctx.toast('Nicht genug Spielgeld für diesen Einsatz.');
      return;
    }
    this.spinning = true;
    this.paytable.visible = false;
    this.updateBet();
    this.winText.text = '0';
    this.ctx.sfx.spinStart();
    const result: SymbolId[][] = [0, 1, 2].map(() => [roll(), roll(), roll()]);
    await Promise.all(result.map((r, i) => this.spinReel(i, r, 1100 + i * 420)));
    this.current = result;
    const line = result.map((r) => r[1]);
    await this.resolve(line);
    this.spinning = false;
    this.updateBet();
  }

  private async spinReel(i: number, target: SymbolId[], duration: number) {
    const reel = this.reels[i];
    const tex = symbolTextures();
    const prev = this.current[i];
    const fillerCount = 16 + i * 6;
    const list: SymbolId[] = [...target, ...Array.from({ length: fillerCount }, roll), ...prev];
    for (const s of reel.sprites) s.destroy();
    reel.sprites = list.map((s, k) => {
      const sp = new Sprite(tex[s]);
      sp.anchor.set(0.5);
      sp.width = sp.height = 92;
      sp.position.set(REEL_W / 2, k * SYM + SYM / 2);
      reel.strip.addChild(sp);
      return sp;
    });
    const startY = -(list.length - 3) * SYM;
    reel.strip.y = startY;
    // Short wind-up, then the long fall.
    await tween(reel.strip, { y: startY - 24 }, 140, ease.outCubic);
    let lastY = reel.strip.y;
    let tickAcc = 0;
    await animate(
      duration,
      (k) => {
        reel.strip.y = startY - 24 + (24 - startY) * k;
        const v = Math.abs(reel.strip.y - lastY);
        tickAcc += v;
        if (tickAcc > SYM) {
          tickAcc = 0;
          this.ctx.sfx.tick();
        }
        lastY = reel.strip.y;
        reel.blur.strengthY = Math.min(18, v * 0.35);
      },
      (t) => 1 - Math.pow(1 - t, 3),
    );
    reel.blur.strengthY = 0;
    this.ctx.sfx.thud();
    // Settle bounce.
    reel.strip.y = 14;
    await tween(reel.strip, { y: 0 }, 260, ease.outBack);
    // Drop the off-screen sprites so the strip stays small.
    reel.sprites.slice(3).forEach((s) => s.destroy());
    reel.sprites = reel.sprites.slice(0, 3);
  }

  private async resolve(line: SymbolId[]) {
    const { mult, hits, kind } = evaluate(line);
    if (mult === 0) {
      this.ctx.sfx.lose();
      return;
    }
    const win = this.bet * mult;
    this.ctx.state.payout(win);
    const g = this.cabinet;
    const toScreen = (x: number, y: number) => g.toGlobal({ x, y });

    // Highlight winning symbols.
    for (const i of hits) {
      const sp = this.reels[i].sprites[1];
      sp.filters = [new GlowFilter({ color: this.theme.neon, distance: 14, outerStrength: 4, quality: 0.2 })];
      void tween(sp.scale, { x: sp.scale.x * 1.18, y: sp.scale.y * 1.18 }, 300, ease.outBack).then(() =>
        tween(sp.scale, { x: sp.scale.x / 1.18, y: sp.scale.y / 1.18 }, 400, ease.inOutCubic, 600),
      );
    }
    const centre = toScreen(W / 2, REELS_Y + SYM * 1.5);
    const big = mult >= 15;
    if (kind === 'jackpot') {
      this.flashUntil = performance.now() + 4000;
      this.ctx.sfx.bigWin();
      this.ctx.shake(18);
      await this.banner('JACKPOT!', COLORS.lamp);
      this.ctx.particles.coinRain(this.viewW, 180);
      this.ctx.particles.coinBurst(centre.x, centre.y, 60);
      this.ctx.state.addTrophy('jackpot', 'gold', `Jackpot: ${formatChips(win)} an ${this.theme.title}`);
      this.ctx.toast('Neue Trophäe für deine Vitrine!');
    } else if (big) {
      this.flashUntil = performance.now() + 2500;
      this.ctx.sfx.bigWin();
      this.ctx.shake(10);
      void this.banner('GROSSER GEWINN', this.theme.neon);
      this.ctx.particles.coinRain(this.viewW, 70);
      this.ctx.particles.coinBurst(centre.x, centre.y, 30);
    } else {
      this.flashUntil = performance.now() + 900;
      this.ctx.sfx.win();
      this.ctx.particles.coinBurst(centre.x, centre.y, Math.min(24, 4 + mult * 3));
      this.ctx.particles.sparkle(centre.x, centre.y, 12);
    }
    const local = this.view.toLocal(toScreen(W / 2, REELS_Y + SYM * 3 + 66));
    floatText(this.view, local.x, local.y, `+${formatChips(win)}`, COLORS.lamp, Math.round(40 * Math.max(0.7, g.scale.x)));
    await countUp(this.winText, 0, win, big || kind === 'jackpot' ? 1800 : 600, '', () => this.ctx.sfx.coin());
    if (kind === 'jackpot') await wait(800);
    for (const i of hits) this.reels[i].sprites[1].filters = [];
  }

  private async banner(text: string, color: number) {
    const t = new Text({
      text,
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 72,
        fill: 0xfff6e6,
        stroke: { color: 0x14080f, width: 10 },
        align: 'center',
      },
    });
    t.filters = [new GlowFilter({ color, distance: 24, outerStrength: 4, quality: 0.2 })];
    t.anchor.set(0.5);
    const fit = Math.min(1, (this.viewW * 0.9) / t.width);
    t.position.set(this.viewW / 2, this.viewH * 0.42);
    t.scale.set(0.1);
    t.rotation = -0.2;
    this.view.addChild(t);
    await Promise.all([tween(t, { rotation: 0 }, 500, ease.outBack), tween(t.scale, { x: fit, y: fit }, 500, ease.outBack)]);
    void tween(t.scale, { x: fit * 1.05, y: fit * 1.05 }, 600, ease.inOutCubic).then(() =>
      tween(t, { alpha: 0 }, 500, ease.inCubic, 900).then(() => t.destroy()),
    );
  }

  private viewW = 800;
  private viewH = 600;

  resize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    const s = Math.min((w * 0.94) / W, (h * 0.9) / H);
    this.cabinet.scale.set(s);
    this.cabinet.position.set((w - W * s) / 2, (h - H * s) / 2 + 10);
  }

  update(dtMs: number) {
    this.bulbPhase += dtMs / 1000;
    const flashing = performance.now() < this.flashUntil;
    const speed = flashing ? 16 : 5;
    this.bulbs.forEach((b, i) => {
      const on = Math.floor(this.bulbPhase * speed + i) % 3 === 0;
      b.alpha = flashing ? (Math.floor(this.bulbPhase * 10) % 2 ? 1 : 0.25) : on ? 1 : 0.3;
    });
    this.payline.alpha = flashing ? 0.6 + Math.sin(this.bulbPhase * 20) * 0.4 : 0.85;
  }

  busy() {
    return this.spinning;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

function drawStation(options: Record<string, unknown>) {
  const t = themeOf(options);
  const c = new Container();
  const g = new Graphics();
  // Cabinet seen from above, screen facing down (towards the player).
  g.roundRect(4, 6, 62, 46, 8).fill({ color: 0x000000, alpha: 0.4 });
  g.roundRect(0, 0, 62, 46, 8).fill(parseInt(t.bodyTop.slice(1), 16)).stroke({ color: t.trim, width: 2 });
  g.roundRect(6, 4, 50, 14, 4).fill(0x14080f);
  g.roundRect(8, 26, 46, 16, 3).fill(0x0a0508);
  for (let i = 0; i < 3; i++) g.rect(11 + i * 15, 28, 11, 12).fill(0xfff6e6);
  // Stool.
  g.circle(31, 66, 9).fill(0x3a2230).stroke({ color: COLORS.brassDark, width: 2 });
  c.addChild(g);
  const lamp = new Graphics().roundRect(8, 6, 46, 10, 4).fill(t.neon);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const slots: GameDefinition = {
  id: 'slots',
  name: 'Slot-Automat',
  houseEdge: 1 - returnToPlayer(),
  footprint: { w: 62, h: 50 },
  drawStation,
  create: (ctx) => new SlotGame(ctx),
};
