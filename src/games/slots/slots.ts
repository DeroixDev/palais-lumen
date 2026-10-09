// "Neun Felder": 3×3 slot machine that pays on 8 lines (rows, columns, diagonals).
// The golden moth is wild and stands in for any symbol.

import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, countUp, glowText, sharedGlow, floatText, glowTexture, gradientTexture, tierFor } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { SYMBOLS, SYMBOL_NAMES, symbolTextures, type SymbolId } from './symbols';

// ---- Rules -------------------------------------------------------------

const WEIGHTS: Record<SymbolId, number> = { firefly: 26, candle: 24, lantern: 18, key: 13, moon: 8, moth: 4 };
/** Pay per line, as a multiple of the whole stake. Three moths pay the moth value. */
const PAY: Record<SymbolId, number> = { firefly: 0.5, candle: 0.8, lantern: 2, key: 4, moon: 12, moth: 60 };
const TOTAL_WEIGHT = SYMBOLS.reduce((s, k) => s + WEIGHTS[k], 0);

/** Cells as [column, row]. */
type Cell = [number, number];
export const LINES: { name: string; cells: Cell[] }[] = [
  { name: 'oben', cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'Mitte', cells: [[0, 1], [1, 1], [2, 1]] },
  { name: 'unten', cells: [[0, 2], [1, 2], [2, 2]] },
  { name: 'links', cells: [[0, 0], [0, 1], [0, 2]] },
  { name: 'mittig', cells: [[1, 0], [1, 1], [1, 2]] },
  { name: 'rechts', cells: [[2, 0], [2, 1], [2, 2]] },
  { name: 'diagonal', cells: [[0, 0], [1, 1], [2, 2]] },
  { name: 'diagonal', cells: [[0, 2], [1, 1], [2, 0]] },
];

function roll(): SymbolId {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) {
    r -= WEIGHTS[s];
    if (r < 0) return s;
  }
  return 'firefly';
}

function lineSymbol(syms: SymbolId[]): SymbolId | null {
  const plain = syms.filter((s) => s !== 'moth');
  if (plain.length === 0) return 'moth';
  return plain.every((s) => s === plain[0]) ? plain[0] : null;
}

export interface LineWin {
  line: number;
  symbol: SymbolId;
  mult: number;
}

/** grid[column][row] */
export function evaluate(grid: SymbolId[][]): { wins: LineWin[]; mult: number } {
  const wins: LineWin[] = [];
  LINES.forEach((l, i) => {
    const sym = lineSymbol(l.cells.map(([c, r]) => grid[c][r]));
    if (sym) wins.push({ line: i, symbol: sym, mult: PAY[sym] });
  });
  // Smallest first so the presentation builds up.
  wins.sort((a, b) => a.mult - b.mult);
  return { wins, mult: wins.reduce((s, w) => s + w.mult, 0) };
}

/** Exact long-run payout ratio over all 6^9 grids (shown to the player). */
export function returnToPlayer() {
  const P = SYMBOLS.map((s) => WEIGHTS[s] / TOTAL_WEIGHT);
  // Every line pays independently, so the expected total is 8 × the expected value of one line.
  let line = 0;
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++)
      for (let c = 0; c < 6; c++) {
        const sym = lineSymbol([SYMBOLS[a], SYMBOLS[b], SYMBOLS[c]]);
        if (sym) line += P[a] * P[b] * P[c] * PAY[sym];
      }
  return line * LINES.length;
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
  diamond: { title: 'MONDSCHEIN', bodyTop: '#16526b', bodyBottom: '#0a1a2a', trim: 0x9fe8ff, neon: COLORS.cyan, bets: [50, 100, 250, 500] },
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
  private lineLayer!: Container;
  private tensionGlow!: Graphics;
  private tension = false;
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
    const title = glowText(t.title, { fontFamily: FONT_DISPLAY, fontSize: 52, fill: 0xfff6e6, letterSpacing: 4 }, { color: t.neon, distance: 18, outerStrength: 3, innerStrength: 0.5 });
    title.position.set(W / 2, 86);
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
      // The blur filter is only attached while the reel spins (see spinReel).
      holder.addChild(strip);
      c.addChild(holder, mask);
      const start = [roll(), roll(), roll()];
      this.current.push(start);
      const sprites = start.map((s, k) => {
        const sp = new Sprite(tex[s]);
        sp.anchor.set(0.5);
        sp.width = sp.height = 100;
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
    // Winning lines are drawn here as neon strokes.
    this.lineLayer = new Container();
    c.addChild(this.lineLayer);
    // Suspense glow for the last reel.
    this.tensionGlow = new Graphics()
      .roundRect(REELS_X + 2 * (REEL_W + REEL_GAP) - 6, REELS_Y - 6, REEL_W + 12, SYM * 3 + 12, 10)
      .stroke({ color: t.neon, width: 6 });
    this.tensionGlow.filters = [new GlowFilter({ color: t.neon, distance: 16, outerStrength: 3, quality: 0.2 })];
    this.tensionGlow.alpha = 0;
    c.addChild(this.tensionGlow);
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
    p.addChild(new Graphics().roundRect(30, 166, W - 60, 470, 20).fill({ color: 0x0b0609, alpha: 0.97 }).stroke({ color: this.theme.trim, width: 3 }));
    const head = label('GEWINNTABELLE', 24, COLORS.lamp, true);
    head.position.set(54, 182);
    p.addChild(head);
    const sub = label('Pro Linie, als Vielfaches deines Einsatzes. Alle 8 Linien zählen gleichzeitig.', 16, 0xd9c6a0);
    sub.position.set(54, 216);
    p.addChild(sub);
    // The 8 lines as tiny grids.
    LINES.forEach((l, i) => {
      const gx = 54 + i * 58;
      const gy = 246;
      const g = new Graphics();
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) g.rect(gx + c * 14, gy + r * 14, 12, 12).fill({ color: 0xffffff, alpha: 0.12 });
      for (const [c, r] of l.cells) g.rect(gx + c * 14, gy + r * 14, 12, 12).fill(this.theme.neon);
      p.addChild(g);
    });
    const order: SymbolId[] = ['moth', 'moon', 'key', 'lantern', 'candle', 'firefly'];
    order.forEach((sym, i) => {
      const y = 310 + i * 46;
      for (let k = 0; k < 3; k++) {
        const sp = new Sprite(tex[sym]);
        sp.width = sp.height = 40;
        sp.position.set(54 + k * 42, y);
        p.addChild(sp);
      }
      const name = label(SYMBOL_NAMES[sym], 19, 0xfff6e6);
      name.position.set(190, y + 8);
      p.addChild(name);
      const val = label(`${String(PAY[sym]).replace('.', ',')}×`, 22, COLORS.lamp, true);
      val.anchor.set(1, 0);
      val.position.set(W - 54, y + 6);
      p.addChild(val);
    });
    const wild = label('Der goldene Nachtfalter ist Joker und ersetzt jedes Symbol.', 17, COLORS.lamp);
    wild.position.set(54, 590);
    p.addChild(wild);
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
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.spinning = true;
    this.paytable.visible = false;
    this.clearLines();
    this.updateBet();
    this.winText.text = '0';
    this.ctx.sfx.spinStart();
    // The result is decided here; the reels only play it out.
    const result: SymbolId[][] = [0, 1, 2].map(() => [roll(), roll(), roll()]);
    // Suspense when the first two reels already line up something valuable.
    const valuable = (x: SymbolId) => x === 'moon' || x === 'moth';
    const suspense = LINES.some((l) => l.cells[0][0] === 0 && l.cells[1][0] === 1 && l.cells.slice(0, 2).every(([c, r]) => valuable(result[c][r])));
    const durations = [1000, 1400, suspense ? 3000 : 1800];
    await Promise.all(
      result.map((r, i) =>
        this.spinReel(i, r, durations[i]).then(() => {
          if (i === 1 && suspense) {
            this.tension = true;
            this.ctx.sfx.tension(1.4);
          }
        }),
      ),
    );
    this.tension = false;
    this.current = result;
    await this.resolve(result);
    this.spinning = false;
    this.updateBet();
  }

  private async spinReel(i: number, target: SymbolId[], duration: number) {
    const reel = this.reels[i];
    const tex = symbolTextures();
    const prev = this.current[i];
    const fillerCount = Math.round(duration / 70);
    const list: SymbolId[] = [...target, ...Array.from({ length: fillerCount }, roll), ...prev];
    for (const s of reel.sprites) s.destroy();
    reel.sprites = list.map((s, k) => {
      const sp = new Sprite(tex[s]);
      sp.anchor.set(0.5);
      sp.width = sp.height = 100;
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
    reel.strip.filters = [reel.blur];
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
    reel.strip.filters = [];
    this.ctx.sfx.thud();
    // Settle bounce.
    reel.strip.y = 14;
    await tween(reel.strip, { y: 0 }, 260, ease.outBack);
    // Drop the off-screen sprites so the strip stays small.
    reel.sprites.slice(3).forEach((s) => s.destroy());
    reel.sprites = reel.sprites.slice(0, 3);
    // A landed moth flaps its wings once.
    reel.sprites.forEach((sp, r) => {
      if (target[r] !== 'moth') return;
      const base = sp.scale.x;
      void animate(700, (k) => (sp.scale.x = base * (0.55 + 0.45 * Math.abs(Math.cos(k * Math.PI * 3)))));
    });
  }

  private cellCentre([c, r]: Cell) {
    return { x: REELS_X + c * (REEL_W + REEL_GAP) + REEL_W / 2, y: REELS_Y + r * SYM + SYM / 2 };
  }

  private clearLines() {
    this.lineLayer.removeChildren().forEach((ch) => ch.destroy());
    for (const reel of this.reels) for (const sp of reel.sprites) sp.filters = [];
  }

  /** Draws one winning line as a glowing neon stroke through its three cells. */
  private drawLine(line: number, color: number) {
    const pts = LINES[line].cells.map((cell) => this.cellCentre(cell));
    const first = pts[0];
    const last = pts[2];
    // Extend a little beyond the outer cells.
    const dx = (last.x - first.x) * 0.18;
    const dy = (last.y - first.y) * 0.18;
    const g = new Graphics();
    g.moveTo(first.x - dx, first.y - dy).lineTo(last.x + dx, last.y + dy).stroke({ color, width: 8, cap: 'round', alpha: 0.9 });
    g.moveTo(first.x - dx, first.y - dy).lineTo(last.x + dx, last.y + dy).stroke({ color: 0xffffff, width: 3, cap: 'round' });
    for (const p of pts) g.circle(p.x, p.y, 9).fill(color);
    g.filters = [sharedGlow(color, 14)];
    this.lineLayer.addChild(g);
    g.alpha = 0;
    void tween(g, { alpha: 1 }, 150);
    return g;
  }

  private async resolve(grid: SymbolId[][]) {
    const { wins, mult } = evaluate(grid);
    if (wins.length === 0) {
      this.ctx.sfx.lose();
      return;
    }
    const win = Math.round(this.bet * mult);
    const g = this.cabinet;
    const toScreen = (x: number, y: number) => g.toGlobal({ x, y });
    const real = mult > 1;

    // Present the lines one after another, each with a rising note.
    let shown = 0;
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      this.drawLine(w.line, real ? this.theme.neon : 0xb69a6a);
      for (const [c, r] of LINES[w.line].cells) {
        const sp = this.reels[c].sprites[r];
        sp.filters = [sharedGlow(this.theme.neon, 12)];
        const base = 100 / sp.texture.width;
        sp.scale.set(base * 1.18);
        void tween(sp.scale, { x: base, y: base }, 380, ease.outBack);
      }
      if (real) this.ctx.sfx.lineHit(i);
      else this.ctx.sfx.partial();
      const before = shown;
      shown = Math.round(this.bet * wins.slice(0, i + 1).reduce((a, b) => a + b.mult, 0));
      void countUp(this.winText, before, shown, 300);
      if (wins.length > 1 && i > 0) this.combo(i + 1);
      await wait(wins.length > 4 ? 260 : 420);
    }

    this.ctx.state.payout(win);
    const centre = toScreen(W / 2, REELS_Y + SYM * 1.5);
    const local = this.view.toLocal(toScreen(W / 2, REELS_Y + SYM * 3 + 66));
    if (!real) {
      floatText(this.view, local.x, local.y, `${formatChips(win)} zurück`, 0xd9c6a0, Math.round(30 * Math.max(0.7, g.scale.x)));
      return;
    }
    const tier = tierFor(mult);
    this.flashUntil = performance.now() + (tier === 'jackpot' ? 4500 : tier === 'big' ? 2500 : 900);
    floatText(this.view, local.x, local.y, `+${formatChips(win)}`, COLORS.lamp, Math.round(40 * Math.max(0.7, g.scale.x)));
    // Moths circle the machine on big wins.
    const machine = toScreen(W / 2, H / 2);
    this.ctx.celebrate(mult, centre.x, centre.y, { x: machine.x, y: machine.y, r: (W / 2) * g.scale.x });
    if (tier === 'jackpot' || wins.some((w) => w.symbol === 'moth')) {
      this.ctx.state.addTrophy('jackpot', 'gold', `Nachtfalter-Jackpot: ${formatChips(win)} an ${this.theme.title}`);
      this.ctx.toast('Neue Trophäe für deine Vitrine!');
    }
    if (tier !== 'small') await wait(1600);
  }

  /** "2 LINIEN!", "3 LINIEN!" … pops above the reels; one label that counts up. */
  private comboText: Text | null = null;
  private combo(n: number) {
    let t = this.comboText;
    if (!t || t.destroyed) {
      t = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: COLORS.lamp, stroke: { color: 0x14080f, width: 6 } },
      });
      t.anchor.set(0.5);
      this.cabinet.addChild(t);
      this.comboText = t;
    }
    const label = t;
    label.text = `${n} LINIEN!`;
    label.position.set(W / 2, REELS_Y - 4);
    label.alpha = 1;
    label.scale.set(0.5);
    const id = ++this.comboId;
    void tween(label.scale, { x: 1, y: 1 }, 260, ease.outBack);
    void wait(900).then(() => {
      if (id !== this.comboId || label.destroyed) return;
      void tween(label, { alpha: 0, y: REELS_Y - 30 }, 400, ease.inCubic);
    });
  }
  private comboId = 0;

  resize(w: number, h: number) {
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
    this.tensionGlow.alpha = this.tension ? 0.55 + 0.45 * Math.sin(this.bulbPhase * 18) : Math.max(0, this.tensionGlow.alpha - dtMs / 300);
    this.tensionGlow.visible = this.tensionGlow.alpha > 0.01;
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
