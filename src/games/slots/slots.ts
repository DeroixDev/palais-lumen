// "Neun Felder": 3×3 slot machine that pays on 8 lines (rows, columns, diagonals).
// The golden moth is wild and stands in for any symbol.

import { BlurFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, countUp, glowText, sharedGlow, floatText, glowTexture, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { markModal } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { OddsWatch, itemMoment, itemName, itemRtpText } from '../itemKit';
import { SYMBOLS, SYMBOL_NAMES, paintEmblem, symbolTextures, type SymbolId } from './symbols';
import { bulbTexture, lightWave, plaqueTexture, reducedMotion, winStage } from './stage';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, rgb, rim, rrect, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { luckDraw } from '../../core/debugLuck';

import { CURRENCY_PLURAL, SLOT_CLASSIC, SLOT_GOLD, SLOT_WILD } from '../../core/brand';
// ---- Rules -------------------------------------------------------------

const WEIGHTS: Record<SymbolId, number> = { firefly: 26, candle: 24, lantern: 18, key: 13, moon: 8, moth: 4 };
/** Pay per line, as a multiple of the whole stake. Three moths pay the moth value. */
export const PAY: Record<SymbolId, number> = { firefly: 0.3, candle: 0.4, lantern: 0.9, key: 2, moon: 6, moth: 30 };
/**
 * Several lines in one spin multiply the summed line pays: COMBO[n] for n lines.
 * Four lines of the smallest symbol already pay 12× the stake.
 */
export const COMBO = [0, 1, 1.2, 3, 10, 15, 25, 40, 60];
/**
 * Exact long-run payout ratio over all 6^9 grids, weighted by symbol odds.
 * The combo makes lines depend on each other, so this is counted grid by grid
 * offline (scripts/slots-rtp.mjs checks it against the tables above).
 */
export const RTP = 0.9488697;
/**
 * Glücksfeder (odds item): a spin without any line gets its middle cell drawn once more.
 * Exact over all 6^9 grids (scripts/slots-rtp.mjs checks it).
 */
export const FEATHER_RTP = 1.0527922;
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
export function evaluate(grid: SymbolId[][]): { wins: LineWin[]; base: number; combo: number; mult: number } {
  const wins: LineWin[] = [];
  LINES.forEach((l, i) => {
    const sym = lineSymbol(l.cells.map(([c, r]) => grid[c][r]));
    if (sym) wins.push({ line: i, symbol: sym, mult: PAY[sym] });
  });
  // Smallest first so the presentation builds up.
  wins.sort((a, b) => a.mult - b.mult);
  const base = wins.reduce((s, w) => s + w.mult, 0);
  const combo = COMBO[wins.length];
  return { wins, base, combo, mult: base * combo };
}

export function returnToPlayer() {
  return RTP;
}

// ---- Themes ------------------------------------------------------------

interface SlotTheme {
  title: string;
  bodyTop: string;
  bodyBottom: string;
  trim: number;
  neon: number;
  bets: number[];
  /** Painted look: cabinet body colour, trim metal and velvet of the inner panels. */
  body: number;
  metal: 'gold' | number;
  velvet: number;
}

const THEMES: Record<string, SlotTheme> = {
  classic: { title: SLOT_CLASSIC.toLocaleUpperCase('de-DE'), bodyTop: '#7a1d34', bodyBottom: '#2a0f1c', trim: COLORS.brass, neon: COLORS.neon, bets: [10, 20, 50, 100], body: 0x7a1d34, metal: 'gold', velvet: 0x2a0a18 },
  diamond: { title: 'MONDSCHEIN', bodyTop: '#16526b', bodyBottom: '#0a1a2a', trim: 0x9fe8ff, neon: COLORS.cyan, bets: [50, 100, 250, 500], body: 0x16526b, metal: 0xcfeaff, velvet: 0x0a1a2a },
  gold: { title: SLOT_GOLD.toLocaleUpperCase('de-DE'), bodyTop: '#8a6a1f', bodyBottom: '#2a1d08', trim: 0xfff1c4, neon: COLORS.lamp, bets: [100, 250, 500, 1000], body: 0x5a3a12, metal: 'gold', velvet: 0x22140a },
};

const themeOf = (o: Record<string, unknown>) => THEMES[(o.theme as string) ?? 'classic'] ?? THEMES.classic;

// ---- Layout constants (design size, scaled to fit the screen) ----------

const W = 560;
const H = 780;
/** Room the lever needs on the right of the cabinet. */
const LEVER = 40;
const PAD = 28;
const SYM = 110;
const REEL_W = 140;
const REEL_GAP = 10;
const REELS_X = (W - (REEL_W * 3 + REEL_GAP * 2)) / 2;
const REELS_Y = 196;
const REELS_W = REEL_W * 3 + REEL_GAP * 2;
const WIN_Y = REELS_Y + SYM * 3 + 32;
const DECK_Y = WIN_Y + 74;
const CTRL_Y = DECK_Y + 50;
const FOOT_Y = H - 25;

function metalFill(c: Ctx, m: 'gold' | number, x0: number, y0: number, x1: number, y1: number) {
  if (m === 'gold') return gold(c, x0, y0, x1, y1);
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, rgb(m));
  g.addColorStop(0.6, rgb(dark(m, 0.45)));
  g.addColorStop(0.85, rgb(light(m, 0.2)));
  g.addColorStop(1, rgb(dark(m, 0.6)));
  return g;
}

/** Points of the marquee arch, used for the bulbs. */
function archPoint(t: number) {
  const x0 = 58, y0 = 96, cx = W / 2, cy = 4, x1 = W - 58, y1 = 96;
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
}

/** The whole cabinet painted once: crown, body, reel window, win window, control deck. */
function paintCabinet(t: SlotTheme) {
  return paint(W + PAD * 2, H + PAD * 2, (c) => {
    c.translate(PAD, PAD);
    const m = t.metal;
    shadow(c, W / 2, H + 6, W * 0.55, 26, 0.7);
    // Crown with the marquee arch.
    c.beginPath();
    c.moveTo(16, 186);
    c.lineTo(16, 80);
    c.quadraticCurveTo(W / 2, -34, W - 16, 80);
    c.lineTo(W - 16, 186);
    c.closePath();
    fillInk(c, metalFill(c, m, 0, 0, W * 0.6, 200), 5);
    rim(c, 0.7, 2.5);
    // Body.
    rrect(c, 0, 160, W, H - 160, 34);
    fillInk(c, vgrad(c, 160, H, t.body, 0.22, 0.55), 5);
    const side = c.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(255,240,220,0.16)');
    side.addColorStop(0.12, 'rgba(255,240,220,0)');
    side.addColorStop(0.85, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.38)');
    rrect(c, 0, 160, W, H - 160, 34);
    c.fillStyle = side;
    c.fill();
    grain(c, 6, 166, W - 12, H - 172, 260, 7, 0.05);
    rrect(c, 0, 160, W, H - 160, 34);
    rim(c, 0.35, 2.5);
    // Metal trim line inside the body edge.
    rrect(c, 9, 169, W - 18, H - 178, 27);
    c.strokeStyle = metalFill(c, m, 0, 160, W, H);
    c.lineWidth = 3;
    c.stroke();
    // Marquee panel inside the arch: dark glass with a deco sunburst.
    c.beginPath();
    c.moveTo(38, 176);
    c.lineTo(38, 90);
    c.quadraticCurveTo(W / 2, -12, W - 38, 90);
    c.lineTo(W - 38, 176);
    c.closePath();
    const mg = c.createLinearGradient(0, 30, 0, 176);
    mg.addColorStop(0, rgb(dark(t.velvet, 0.2)));
    mg.addColorStop(1, rgb(dark(t.velvet, 0.5)));
    fillInk(c, mg, 4);
    c.save();
    c.clip();
    glowAt(c, W / 2, 128, 230, 80, t.neon, 0.5, 'lighter');
    c.translate(W / 2, 200);
    for (let i = 0; i < 15; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 15);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - 0.04) * 260, Math.sin(a - 0.04) * 260);
      c.lineTo(Math.cos(a + 0.04) * 260, Math.sin(a + 0.04) * 260);
      c.closePath();
      c.fillStyle = rgb(light(t.neon, 0.3), i % 2 ? 0.07 : 0.12);
      c.fill();
    }
    c.restore();
    // Bulb sockets along the arch and down both sides.
    for (let i = 0; i <= 14; i++) {
      const p = archPoint(i / 14);
      c.beginPath();
      c.arc(p.x, p.y, 9, 0, Math.PI * 2);
      fillInk(c, metalFill(c, m, p.x - 9, p.y - 9, p.x + 9, p.y + 9), 2);
    }
    for (let i = 0; i < 11; i++) {
      for (const x of [20, W - 20]) {
        const y = 214 + i * 38;
        c.beginPath();
        c.arc(x, y, 8, 0, Math.PI * 2);
        fillInk(c, metalFill(c, m, x - 8, y - 8, x + 8, y + 8), 2);
      }
    }
    // Moth medallion on the crown.
    ellipse(c, W / 2, 12, 30, 26);
    fillInk(c, metalFill(c, m, W / 2 - 30, -14, W / 2 + 30, 38), 4);
    rim(c, 0.7, 2);
    ellipse(c, W / 2, 12, 21, 18);
    c.fillStyle = rgb(dark(t.velvet, 0.3));
    c.fill();
    paintEmblem(c, W / 2, 14, 40, { wing: 0xf0c868, wingDark: 0x9a6418, body: 0x5a3010, eye: t.neon }, 1.6);
    // Reel window: thick bezel, dark well, ivory reels with a cylinder shade.
    rrect(c, REELS_X - 26, REELS_Y - 26, REELS_W + 52, SYM * 3 + 52, 26);
    fillInk(c, metalFill(c, m, REELS_X - 26, REELS_Y - 26, REELS_X + REELS_W, REELS_Y + SYM * 3 + 26), 5);
    rim(c, 0.65, 2.5);
    rrect(c, REELS_X - 12, REELS_Y - 12, REELS_W + 24, SYM * 3 + 24, 16);
    fillInk(c, '#0b0508', 3);
    for (let i = 0; i < 3; i++) {
      const x = REELS_X + i * (REEL_W + REEL_GAP);
      rrect(c, x, REELS_Y, REEL_W, SYM * 3, 6);
      const rg = c.createLinearGradient(x, 0, x + REEL_W, 0);
      rg.addColorStop(0, '#d6c6a4');
      rg.addColorStop(0.3, '#fffaf0');
      rg.addColorStop(1, '#cdb894');
      c.fillStyle = rg;
      c.fill();
      grain(c, x, REELS_Y, REEL_W, SYM * 3, 50, 30 + i, 0.06);
    }
    // Payline pips at the left and right of the window.
    for (let r = 0; r < 3; r++) {
      for (const [x, d] of [[REELS_X - 19, 1], [REELS_X + REELS_W + 19, -1]] as const) {
        const y = REELS_Y + r * SYM + SYM / 2;
        c.beginPath();
        c.moveTo(x - 6 * d, y - 8);
        c.lineTo(x + 6 * d, y);
        c.lineTo(x - 6 * d, y + 8);
        c.closePath();
        fillInk(c, rgb(light(t.neon, 0.3)), 1.6);
      }
    }
    // Win window.
    rrect(c, 64, WIN_Y - 6, W - 128, 70, 18);
    fillInk(c, metalFill(c, m, 64, WIN_Y, W - 64, WIN_Y + 64), 4);
    rim(c, 0.6, 2);
    rrect(c, 74, WIN_Y + 4, W - 148, 50, 12);
    const wg = c.createLinearGradient(0, WIN_Y + 4, 0, WIN_Y + 54);
    wg.addColorStop(0, '#050204');
    wg.addColorStop(1, rgb(dark(t.velvet, 0.2)));
    fillInk(c, wg, 2);
    glowAt(c, W - 160, WIN_Y + 30, 140, 22, 0xffcf7a, 0.12, 'lighter');
    // Control deck: a velvet panel framed in metal.
    rrect(c, 22, DECK_Y, W - 44, 100, 22);
    fillInk(c, metalFill(c, m, 22, DECK_Y, W - 22, DECK_Y + 100), 4);
    rim(c, 0.6, 2);
    rrect(c, 32, DECK_Y + 9, W - 64, 82, 16);
    fillInk(c, vgrad(c, DECK_Y + 9, DECK_Y + 91, dark(t.velvet, 0.05), 0.12, 0.35), 2);
    grain(c, 32, DECK_Y + 9, W - 64, 82, 80, 11, 0.05);
    // Recess for the bet controls.
    rrect(c, 104, CTRL_Y - 34, 230, 68, 34);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fill();
    c.strokeStyle = 'rgba(255,240,210,0.12)';
    c.lineWidth = 2;
    c.stroke();
    // Kick plate.
    rrect(c, 60, FOOT_Y - 15, W - 120, 30, 12);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fill();
    c.fillStyle = metalFill(c, m, 0, H - 10, W, H);
    rrect(c, 30, H - 10, W - 60, 6, 3);
    c.fill();
    // Corner moths as ornament.
    for (const x of [36, W - 36]) paintEmblem(c, x, H - 34, 26, { wing: 0xe0b25a, wingDark: 0x7a4e18, body: 0x3a1a08, eye: t.neon }, 1.4);
  });
}

/** Lever housing and arm (the arm is a separate sprite so it can be pulled). */
function paintLeverBase(t: SlotTheme) {
  return paint(60, 110, (c) => {
    rrect(c, 4, 30, 34, 60, 10);
    fillInk(c, metalFill(c, t.metal, 4, 30, 38, 90), 3);
    rim(c, 0.6, 1.5);
    ellipse(c, 24, 60, 12, 12);
    fillInk(c, vgrad(c, 48, 72, dark(t.body, 0.3), 0.3, 0.3), 2.5);
  });
}
function paintLeverArm(t: SlotTheme) {
  // Pivot at (16, 120) of a 32×132 canvas; the knob sits at the top.
  return paint(40, 136, (c) => {
    c.strokeStyle = INK;
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(20, 122);
    c.lineTo(20, 26);
    c.stroke();
    c.strokeStyle = metalFill(c, t.metal, 14, 26, 26, 122);
    c.lineWidth = 6;
    c.stroke();
    ellipse(c, 20, 20, 16, 16);
    const g = c.createRadialGradient(14, 14, 2, 20, 20, 18);
    g.addColorStop(0, '#ff9a9a');
    g.addColorStop(0.5, '#d8243a');
    g.addColorStop(1, '#5a0a18');
    fillInk(c, g, 3);
    ellipse(c, 14, 13, 5, 3.5);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fill();
  });
}

/** Curved glass over the reels: shade at top and bottom, one reflection streak. */
function paintGlass() {
  return paint(REELS_W, SYM * 3, (c) => {
    for (let i = 0; i < 3; i++) {
      const x = i * (REEL_W + REEL_GAP);
      const g = c.createLinearGradient(0, 0, 0, SYM * 3);
      g.addColorStop(0, 'rgba(20,6,16,0.62)');
      g.addColorStop(0.22, 'rgba(20,6,16,0)');
      g.addColorStop(0.78, 'rgba(20,6,16,0)');
      g.addColorStop(1, 'rgba(20,6,16,0.62)');
      c.fillStyle = g;
      c.fillRect(x, 0, REEL_W, SYM * 3);
    }
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(REELS_W * 0.42, 0);
    c.lineTo(REELS_W * 0.2, SYM * 3);
    c.lineTo(0, SYM * 3);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    c.moveTo(REELS_W * 0.47, 0);
    c.lineTo(REELS_W * 0.52, 0);
    c.lineTo(REELS_W * 0.3, SYM * 3);
    c.lineTo(REELS_W * 0.25, SYM * 3);
    c.closePath();
    c.fill();
  }, 1);
}

/** A soft neon frame (white, tint it); used for the suspense reel and the winning cells. */
function frameTexture(w: number, h: number, r: number) {
  return paint(w + 40, h + 40, (c) => {
    for (let i = 7; i >= 1; i--) {
      rrect(c, 20, 20, w, h, r);
      c.strokeStyle = `rgba(255,255,255,${0.05 + (7 - i) * 0.015})`;
      c.lineWidth = i * 4;
      c.stroke();
    }
    rrect(c, 20, 20, w, h, r);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.stroke();
  }, 1);
}

/** Gold cell frame for winning symbols. */
function cellFrameTexture() {
  return paint(132, 112, (c) => {
    rrect(c, 6, 6, 120, 100, 14);
    c.strokeStyle = INK;
    c.lineWidth = 9;
    c.stroke();
    c.strokeStyle = gold(c, 0, 0, 100, 110);
    c.lineWidth = 5;
    c.stroke();
    for (const [x, y] of [[6, 6], [126, 6], [6, 106], [126, 106]]) {
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      fillInk(c, '#fff1c4', 2);
    }
  });
}

/** The paytable card: velvet with a metal frame and moth corners. */
function paintPaytable(t: SlotTheme, w: number, h: number) {
  return paint(w + 20, h + 20, (c) => {
    c.translate(10, 10);
    glowAt(c, w / 2, h / 2 + 12, w * 0.6, h * 0.55, 0x05020a, 0.6);
    rrect(c, 0, 0, w, h, 24);
    fillInk(c, metalFill(c, t.metal, 0, 0, w * 0.5, h), 4);
    rim(c, 0.6, 2);
    rrect(c, 10, 10, w - 20, h - 20, 16);
    fillInk(c, vgrad(c, 10, h - 10, t.velvet, 0.12, 0.4), 2);
    grain(c, 10, 10, w - 20, h - 20, 220, 5, 0.05);
    for (const [x, y] of [[20, 18], [w - 20, 18], [20, h - 16], [w - 20, h - 16]]) {
      paintEmblem(c, x, y, 24, { wing: 0xe0b25a, wingDark: 0x7a4e18, body: 0x3a1a08, eye: t.neon }, 1.3);
    }
  });
}

interface Bulb {
  s: Sprite;
  glow: Sprite;
}

class SlotGame implements GameInstance {
  view = new Container();
  private cabinet = new Container();
  private reels: { strip: Container; sprites: Sprite[]; blur: BlurFilter }[] = [];
  private current: SymbolId[][] = [];
  private bulbs: Bulb[] = [];
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
  private hiliteLayer!: Container;
  private tensionGlow!: Sprite;
  private tension = false;
  private leverArm!: Sprite;
  private stageLayer = new Container();
  private calm = reducedMotion();
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.spin();
    } else if (e.code === 'Escape' && this.paytable.visible) {
      this.paytable.visible = false;
    }
  };

  constructor(private ctx: GameContext) {
    this.theme = themeOf(ctx.options);
    this.bets = ctx.state.stakes(this.theme.bets);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'slots', ['gluecksfeder']);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  /** Today's ladder: the theme's day-1 bets scaled to today's stakes. */
  private bets: number[];
  private stakeWatch: StakeWatch;
  /** Odds item: the Glücksfeder draws the middle cell of a losing spin once more. */
  private odds: OddsWatch;
  private feather = false;
  private infoText!: Text;
  private paytableRtp: Text | null = null;
  private get bet() {
    return this.bets[this.betIndex];
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
    halo.width = W * 2.1;
    halo.height = H * 1.6;
    halo.tint = t.neon;
    halo.alpha = 0.28;
    halo.blendMode = 'add';
    c.addChild(halo);

    // Lever behind the body edge.
    const leverBase = new Sprite(paintLeverBase(t));
    leverBase.position.set(W - 8, REELS_Y + 70);
    this.leverArm = new Sprite(paintLeverArm(t));
    this.leverArm.anchor.set(0.5, 122 / 136);
    this.leverArm.position.set(W + 16, REELS_Y + 130);
    c.addChild(this.leverArm, leverBase);

    const body = new Sprite(paintCabinet(t));
    body.position.set(-PAD, -PAD);
    c.addChild(body);

    // Chasing bulbs: painted bulb plus an additive glow in the theme colour.
    const bulbTex = bulbTexture();
    const addBulb = (x: number, y: number, r: number) => {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(x, y);
      glow.width = glow.height = r * 6;
      glow.tint = t.neon;
      glow.blendMode = 'add';
      const s = new Sprite(bulbTex);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.width = s.height = r * 2.3;
      c.addChild(glow, s);
      this.bulbs.push({ s, glow });
    };
    for (let i = 0; i <= 14; i++) {
      const p = archPoint(i / 14);
      addBulb(p.x, p.y, 7);
    }
    for (let i = 10; i >= 0; i--) addBulb(W - 20, 214 + i * 38, 6);
    for (let i = 0; i < 11; i++) addBulb(20, 214 + i * 38, 6);

    const title = glowText(t.title, { fontFamily: FONT_DISPLAY, fontSize: 50, fill: 0xfff6e6, letterSpacing: 4 }, { color: t.neon, distance: 16, outerStrength: 2.6, innerStrength: 0.4 });
    title.position.set(W / 2, 126);
    if (title.width > W - 120) title.scale.set((W - 120) / title.width);
    c.addChild(title);

    // Winning-cell glows sit behind the symbols.
    this.hiliteLayer = new Container();
    c.addChild(this.hiliteLayer);
    for (let i = 0; i < 3; i++) {
      const x = REELS_X + i * (REEL_W + REEL_GAP);
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
      const sprites = start.map((s, k) => this.symbolSprite(strip, tex[s], k));
      this.reels.push({ strip, sprites, blur });
    }
    const glass = new Sprite(paintGlass());
    glass.position.set(REELS_X, REELS_Y);
    c.addChild(glass);
    // Winning lines and cell frames.
    this.lineLayer = new Container();
    c.addChild(this.lineLayer);
    // Suspense glow for the last reel (baked, tinted).
    this.tensionGlow = new Sprite(frameTexture(REEL_W + 12, SYM * 3 + 12, 12));
    this.tensionGlow.position.set(REELS_X + 2 * (REEL_W + REEL_GAP) - 6 - 20, REELS_Y - 6 - 20);
    this.tensionGlow.tint = t.neon;
    this.tensionGlow.blendMode = 'add';
    this.tensionGlow.alpha = 0;
    c.addChild(this.tensionGlow);

    // Win display.
    const winLabel = label('GEWINN', 20, 0xd9c6a0);
    winLabel.anchor.set(0, 0.5);
    winLabel.position.set(92, WIN_Y + 29);
    c.addChild(winLabel);
    this.winText = new Text({ text: '0', style: { fontFamily: FONT_DISPLAY, fontSize: 36, fill: COLORS.lamp } });
    this.winText.anchor.set(1, 0.5);
    this.winText.position.set(W - 92, WIN_Y + 30);
    c.addChild(this.winText);

    // Controls: table, bet, spin.
    const ptBtn = button({ label: '', ariaLabel: 'Gewinntabelle', width: 62, height: 62, onClick: () => this.togglePaytable() });
    ptBtn.position.set(66, CTRL_Y);
    // Icon: the 3×3 grid with a line through it (= Gewinntabelle).
    const icon = new Graphics();
    for (let cc = 0; cc < 3; cc++) for (let r = 0; r < 3; r++) icon.roundRect(-16 + cc * 11, -16 + r * 11, 9, 9, 2).fill(r === 1 ? 0x1a0610 : { color: 0x1a0610, alpha: 0.35 });
    ptBtn.addChild(icon);
    this.minus = button({ label: '–', ariaLabel: 'Einsatz senken', width: 64, height: 64, onClick: () => this.changeBet(-1) });
    this.minus.position.set(140, CTRL_Y);
    this.plus = button({ label: '+', ariaLabel: 'Einsatz erhöhen', width: 64, height: 64, onClick: () => this.changeBet(1) });
    this.plus.position.set(298, CTRL_Y);
    const betLabel = label('EINSATZ', 16, 0xd9c6a0);
    betLabel.anchor.set(0.5);
    betLabel.position.set(219, CTRL_Y - 17);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.betText.position.set(219, CTRL_Y + 10);
    c.addChild(ptBtn, this.minus, this.plus, betLabel, this.betText);

    this.spinBtn = button({ label: 'DREH', width: 176, height: 88, color: t.neon, textColor: 0x1a0610, fontSize: 32, onClick: () => void this.spin() });
    this.spinBtn.position.set(W - 116, CTRL_Y);
    c.addChild(this.spinBtn);

    // Footer: where the paytable is (it carries the payout share; the machine front doesn't).
    const info = new Text({
      text: 'Alle 8 Linien zählen  ·  Gewinntabelle links',
      style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '600', fill: 0xe6d6b4 },
    });
    info.anchor.set(0.5);
    info.position.set(W / 2, FOOT_Y + 1);
    c.addChild(info);
    this.infoText = info;

    this.paytable = this.buildPaytable();
    markModal(this.paytable);
    this.paytable.visible = false;
    c.addChild(this.paytable, this.stageLayer);

    this.updateBet();
  }

  private symbolSprite(strip: Container, texture: Texture, k: number) {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    sp.width = sp.height = 104;
    sp.position.set(REEL_W / 2, k * SYM + SYM / 2);
    strip.addChild(sp);
    return sp;
  }

  private togglePaytable() {
    const p = this.paytable;
    if (p.visible) {
      void tween(p, { alpha: 0 }, 180, ease.inCubic).then(() => (p.visible = false));
      return;
    }
    p.visible = true;
    p.alpha = 0;
    p.scale.set(0.92);
    void tween(p, { alpha: 1 }, 200);
    void tween(p.scale, { x: 1, y: 1 }, 280, ease.outBack);
  }

  private buildPaytable() {
    const tex = symbolTextures();
    const t = this.theme;
    const PW = W - 40;
    const PH = 580;
    const p = new Container();
    // Scale around the card's centre.
    p.pivot.set(W / 2, 150 + PH / 2);
    p.position.set(W / 2, 150 + PH / 2);
    const shade = new Graphics().roundRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2, 40).fill({ color: 0x05020a, alpha: 0.5 });
    shade.eventMode = 'static';
    shade.on('pointertap', () => this.togglePaytable());
    p.addChild(shade);
    const card = new Sprite(paintPaytable(t, PW, PH));
    card.position.set(20 - 10, 150 - 10);
    card.eventMode = 'static';
    p.addChild(card);
    const x0 = 46;
    const head = label('GEWINNTABELLE', 26, COLORS.lamp, true);
    head.position.set(x0 + 20, 176);
    p.addChild(head);
    const close = button({ label: '×', ariaLabel: 'Gewinntabelle schließen', width: 56, height: 56, fontSize: 34, onClick: () => this.togglePaytable() });
    close.position.set(W - 66, 190);
    p.addChild(close);
    const sub = label('Pro Linie, mal deinem Einsatz. Alle 8 Linien zählen.', 19, 0xe6d6b4);
    sub.position.set(x0 + 20, 220);
    p.addChild(sub);
    // The 8 lines as tiny grids.
    LINES.forEach((l, i) => {
      const gx = x0 + 22 + i * 58;
      const gy = 254;
      const g = new Graphics();
      for (let cc = 0; cc < 3; cc++) for (let r = 0; r < 3; r++) g.roundRect(gx + cc * 15, gy + r * 15, 13, 13, 3).fill({ color: 0xfff6e6, alpha: 0.14 });
      for (const [cc, r] of l.cells) g.roundRect(gx + cc * 15, gy + r * 15, 13, 13, 3).fill(t.neon);
      p.addChild(g);
    });
    const order: SymbolId[] = ['moth', 'moon', 'key', 'lantern', 'candle', 'firefly'];
    order.forEach((sym, i) => {
      const y = 314 + i * 46;
      if (i % 2 === 0) p.addChild(new Graphics().roundRect(x0 + 10, y - 4, W - 2 * x0 - 20, 46, 10).fill({ color: 0xfff6e6, alpha: 0.05 }));
      for (let k = 0; k < 3; k++) {
        const sp = new Sprite(tex[sym]);
        sp.width = sp.height = 40;
        sp.position.set(x0 + 16 + k * 38, y);
        p.addChild(sp);
      }
      const name = label(SYMBOL_NAMES[sym], 21, 0xfff6e6);
      name.position.set(x0 + 146, y + 8);
      p.addChild(name);
      const val = label(`${String(PAY[sym]).replace('.', ',')}×`, 24, COLORS.lamp, true);
      val.anchor.set(1, 0);
      val.position.set(W - x0 - 20, y + 6);
      p.addChild(val);
    });
    const comboHead = label('Mehrere Linien: Summe mal Kombi-Faktor', 20, 0xfff6e6);
    comboHead.position.set(x0 + 20, 598);
    p.addChild(comboHead);
    const comboRow = label(
      COMBO.slice(2).map((f, i) => `${i + 2}→×${String(f).replace('.', ',')}`).join('  '),
      19,
      COLORS.lamp,
    );
    comboRow.position.set(x0 + 20, 628);
    if (comboRow.width > W - 2 * x0 - 40) comboRow.scale.set((W - 2 * x0 - 40) / comboRow.width);
    p.addChild(comboRow);
    const wild = label(`Der ${SLOT_WILD} ist Joker und ersetzt jedes Symbol.`, 18, 0xe6d6b4);
    wild.position.set(x0 + 20, 668);
    if (wild.width > W - 2 * x0 - 40) wild.scale.set((W - 2 * x0 - 40) / wild.width);
    p.addChild(wild);
    // The payout share: here, not on the machine front (filled by refreshInfo).
    this.paytableRtp = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '600', fill: 0xe6d6b4, lineHeight: 20 } });
    this.paytableRtp.position.set(x0 + 20, 694);
    p.addChild(this.paytableRtp);
    return p;
  }

  private changeBet(d: number) {
    if (this.spinning) return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.updateBet();
  }

  private updateBet() {
    this.betText.text = formatChips(this.bet);
    this.betText.scale.set(Math.min(1, 84 / Math.max(1, this.betText.width / this.betText.scale.x)));
    this.minus.setEnabled(this.betIndex > 0 && !this.spinning);
    this.plus.setEnabled(this.betIndex < this.bets.length - 1 && !this.spinning);
    this.spinBtn.setEnabled(!this.spinning);
  }

  private pullLever() {
    const arm = this.leverArm;
    void tween(arm.scale, { y: -0.55 }, 160, ease.inCubic).then(() => tween(arm.scale, { y: 1 }, 420, ease.outBack));
  }

  async spin() {
    if (this.spinning) return;
    if (!this.ctx.state.placeBet(this.bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    this.spinning = true;
    this.paytable.visible = false;
    this.clearLines();
    this.updateBet();
    this.winText.text = '0';
    this.pullLever();
    this.ctx.sfx.spinStart();
    this.feather = this.odds.on('gluecksfeder');
    // The result is decided here; the reels only play it out.
    const result: SymbolId[][] = luckDraw(
      () => [0, 1, 2].map(() => [roll(), roll(), roll()]),
      (g) => evaluate(g).mult - 1,
    );
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
    if (this.feather && evaluate(result).wins.length === 0) await this.featherCell(result);
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
    reel.sprites = list.map((s, k) => this.symbolSprite(reel.strip, tex[s], k));
    const startY = -(list.length - 3) * SYM;
    reel.strip.y = startY;
    // Short wind-up, then the long fall.
    await tween(reel.strip, { y: startY - 24 }, 140, ease.outCubic);
    let lastY = reel.strip.y;
    let tickAcc = 0;
    if (!this.calm) reel.strip.filters = [reel.blur];
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
    // Settle bounce, and a little puff of light where the reel stopped.
    reel.strip.y = 14;
    const x = REELS_X + i * (REEL_W + REEL_GAP) + REEL_W / 2;
    this.flashAt(x, REELS_Y + SYM * 1.5, REEL_W * 1.4, SYM * 3.4, 0xfff1c4, 0.35, 320);
    await tween(reel.strip, { y: 0 }, 260, ease.outBack);
    // Drop the off-screen sprites so the strip stays small.
    reel.sprites.slice(3).forEach((s) => s.destroy());
    reel.sprites = reel.sprites.slice(0, 3);
    // A landed moth flaps its wings once.
    reel.sprites.forEach((sp, r) => {
      if (target[r] !== 'moth') return;
      const base = sp.scale.x;
      void animate(700, (k) => (sp.scale.x = base * (0.6 + 0.4 * Math.abs(Math.cos(k * Math.PI * 3)))));
    });
  }

  /** Glücksfeder: the feather brushes over the middle cell and it is drawn once more. */
  private async featherCell(grid: SymbolId[][]) {
    const next = roll();
    const tex = symbolTextures();
    const sp = this.reels[1].sprites[1];
    const { x, y } = this.cellCentre([1, 1]);
    const at = this.view.toLocal(this.lineLayer.toGlobal({ x, y: y - SYM * 1.05 }));
    void itemMoment(this.view, at.x, at.y, 'gluecksfeder', 'GLÜCKSFEDER', 0.75 * this.lineLayer.worldTransform.a);
    this.ctx.sfx.whoosh();
    this.flashAt(x, y, REEL_W * 1.3, SYM * 1.3, 0xffcf7a, 0.7, 700);
    const sy = sp.scale.y;
    const flips = this.calm ? 1 : 6;
    for (let i = 0; i < flips; i++) {
      await animate(this.calm ? 120 : 60 + i * 18, (k) => !sp.destroyed && (sp.scale.y = sy * Math.abs(Math.cos(k * Math.PI))));
      if (sp.destroyed) return;
      sp.texture = tex[i === flips - 1 ? next : SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]];
      this.ctx.sfx.tick();
    }
    sp.scale.y = sy;
    grid[1][1] = next;
    this.ctx.sfx.thud();
    this.flashAt(x, y, REEL_W * 1.2, SYM * 1.2, 0xfff1c4, 0.5, 320);
    await wait(this.calm ? 150 : 300);
  }

  /** The footer (with the feather while it works) and the payout line in the paytable. */
  private refreshInfo() {
    if (!this.infoText) return;
    const rtp = returnToPlayer();
    const own = `Auszahlungsquote ${(rtp * 100).toFixed(1).replace('.', ',')} %  ·  Hausvorteil ${((1 - rtp) * 100).toFixed(1).replace('.', ',')} %`;
    if (this.paytableRtp) {
      this.paytableRtp.text = this.odds.id ? `${itemRtpText(FEATHER_RTP, 'gluecksfeder')}\nOhne Item: ${own}` : own;
      this.paytableRtp.scale.set(Math.min(1, (W - 132) / (this.paytableRtp.width / this.paytableRtp.scale.x)));
    }
    this.infoText.text = this.odds.id ? `${itemName('gluecksfeder')}: ohne Linie wird einmal neu gezogen` : 'Alle 8 Linien zählen  ·  Gewinntabelle links';
    this.infoText.style.fill = this.odds.id ? 0xffd890 : 0xe6d6b4;
    this.infoText.scale.set(Math.min(1, (W - 40) / (this.infoText.width / this.infoText.scale.x)));
  }

  /** A short additive light puff (behind nothing, over the reels). */
  private flashAt(x: number, y: number, w: number, h: number, color: number, alpha: number, ms: number) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = w;
    s.height = h;
    s.tint = color;
    s.blendMode = 'add';
    s.alpha = alpha;
    this.lineLayer.addChild(s);
    void tween(s, { alpha: 0 }, ms).then(() => s.destroy());
  }

  private cellCentre([c, r]: Cell) {
    return { x: REELS_X + c * (REEL_W + REEL_GAP) + REEL_W / 2, y: REELS_Y + r * SYM + SYM / 2 };
  }

  private clearLines() {
    this.lineLayer.removeChildren().forEach((ch) => ch.destroy());
    this.hiliteLayer.removeChildren().forEach((ch) => ch.destroy());
    if (this.stamp) this.stamp.visible = false;
  }

  /** Draws one winning line as a glowing ribbon through its three cells. */
  private drawLine(line: number, color: number) {
    const pts = LINES[line].cells.map((cell) => this.cellCentre(cell));
    const first = pts[0];
    const last = pts[2];
    // Extend a little beyond the outer cells.
    const dx = (last.x - first.x) * 0.2;
    const dy = (last.y - first.y) * 0.2;
    const g = new Graphics();
    const path = () => g.moveTo(first.x - dx, first.y - dy).lineTo(last.x + dx, last.y + dy);
    path().stroke({ color: 0x160a14, width: 16, cap: 'round', alpha: 0.75 });
    path().stroke({ color, width: 11, cap: 'round' });
    path().stroke({ color: 0xffffff, width: 3, cap: 'round', alpha: 0.9 });
    for (const p of pts) {
      g.circle(p.x, p.y, 11).fill(0x160a14);
      g.circle(p.x, p.y, 8).fill(color);
      g.circle(p.x - 2, p.y - 2, 3).fill({ color: 0xffffff, alpha: 0.9 });
    }
    g.filters = [sharedGlow(color, 14)];
    // Under the symbols, so they stay readable; the ribbon shows between the cells.
    this.hiliteLayer.addChild(g);
    g.alpha = 0;
    void tween(g, { alpha: 1 }, 150);
    return g;
  }

  private cellTex: Texture | null = null;
  private hiliteCell(cell: Cell, color: number) {
    const { x, y } = this.cellCentre(cell);
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(x, y);
    glow.width = REEL_W * 1.1;
    glow.height = SYM * 1.1;
    glow.tint = color;
    glow.blendMode = 'add';
    glow.alpha = 0.32;
    this.hiliteLayer.addChild(glow);
    this.cellTex ??= cellFrameTexture();
    const f = new Sprite(this.cellTex);
    f.anchor.set(0.5);
    f.position.set(x, y);
    f.scale.set(1.15);
    f.alpha = 0;
    this.lineLayer.addChild(f);
    void tween(f, { alpha: 1 }, 120);
    void tween(f.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  /** One report per spin, right after it is settled. */
  private reportRound(grid: SymbolId[][], lines: number, win: number, mult: number) {
    const tags = ['slots'];
    if (lines >= 2) tags.push('lines2');
    if (lines >= 3) tags.push('lines3');
    if (grid.some((col) => col.includes('moth'))) tags.push('moth');
    if (rewardLevel(mult) === 4) tags.push('jackpot');
    if (this.feather) tags.push('feder');
    this.ctx.state.report({ game: 'slots', stake: this.bet, win, rtp: this.feather ? FEATHER_RTP : RTP, tags });
  }

  private async resolve(grid: SymbolId[][]) {
    const { wins, combo, mult } = evaluate(grid);
    if (wins.length === 0) {
      this.reportRound(grid, 0, 0, 0);
      this.ctx.sfx.lose();
      return;
    }
    const win = Math.round(this.bet * mult);
    const g = this.cabinet;
    const toScreen = (x: number, y: number) => g.toGlobal({ x, y });
    const real = mult > 1;
    const t = this.theme;

    // Present the lines one after another, each with a rising note.
    let shown = 0;
    const hit = new Set<string>();
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      this.drawLine(w.line, real ? t.neon : 0xb69a6a);
      for (const cell of LINES[w.line].cells) {
        const [c, r] = cell;
        const sp = this.reels[c].sprites[r];
        if (!hit.has(`${c}${r}`)) {
          hit.add(`${c}${r}`);
          this.hiliteCell(cell, real ? t.neon : 0xb69a6a);
        }
        const base = 104 / sp.texture.width;
        sp.scale.set(base * 1.2);
        void tween(sp.scale, { x: base, y: base }, 380, ease.outBack);
      }
      if (real) this.ctx.sfx.lineHit(i);
      else this.ctx.sfx.partial();
      const before = shown;
      shown = Math.round(this.bet * wins.slice(0, i + 1).reduce((a, b) => a + b.mult, 0));
      void countUp(this.winText, before, shown, 300);
      this.bumpWin();
      if (wins.length > 1 && i > 0) this.combo(i + 1);
      await wait(wins.length > 4 ? 260 : 420);
    }
    // Several lines: the summed pays get multiplied, shown as a big "×10" stamp.
    if (combo > 1) {
      await this.combo(wins.length, combo);
      this.ctx.sfx.lineHit(wins.length + 2);
      const before = shown;
      shown = win;
      this.bumpWin();
      await countUp(this.winText, before, shown, this.calm ? 0 : 700);
      await wait(250);
    }

    this.ctx.state.payout(win);
    this.reportRound(grid, wins.length, win, mult);
    const centre = toScreen(W / 2, REELS_Y + SYM * 1.5);
    const local = this.view.toLocal(toScreen(W / 2, WIN_Y + 10));
    if (!real) {
      floatText(this.view, local.x, local.y, `${formatChips(win)} zurück`, 0xd9c6a0, Math.round(30 * Math.max(0.7, g.scale.x)));
      return;
    }
    const level = rewardLevel(mult);
    // Moths circle the machine on big wins; coins fly to the purse.
    const machine = toScreen(W / 2, H / 2);
    this.ctx.celebrate(mult, centre.x, centre.y, { x: machine.x, y: machine.y, r: (W / 2) * g.scale.x });
    if (level === 4 || wins.some((w) => w.symbol === 'moth')) {
      this.ctx.state.addTrophy('jackpot', 'gold', `Lüster-Jackpot: ${formatChips(win)} an ${t.title}`);
      this.ctx.toast('Neue Trophäe für deine Vitrine!');
    }
    if (level >= 3) {
      // Stage moment, skippable from 0.5 s.
      this.flashUntil = this.bulbPhase + 2.6;
      await winStage(this.stageLayer, {
        x: REELS_X - 12,
        y: REELS_Y - 12,
        w: REELS_W + 24,
        h: SYM * 3 + 24,
        title: level === 4 ? 'JACKPOT' : 'GROSSER GEWINN',
        sub: `×${fmt(mult)} Einsatz`,
        amount: win,
        accent: level === 4 ? COLORS.lamp : t.neon,
        durationMs: level === 4 ? 2500 : 2000,
        onTick: () => this.ctx.sfx.tick(),
      });
    } else if (level === 2) {
      // Medium: a light wave rolls down the machine, the bulbs flash.
      this.flashUntil = this.bulbPhase + 1.2;
      floatText(this.view, local.x, local.y, `+${formatChips(win)}`, COLORS.lamp, Math.round(40 * Math.max(0.7, g.scale.x)));
      await lightWave(this.lineLayer, 0, 0, W, H, t.neon);
    } else {
      this.flashUntil = this.bulbPhase + 0.7;
      floatText(this.view, local.x, local.y, `+${formatChips(win)}`, COLORS.lamp, Math.round(36 * Math.max(0.7, g.scale.x)));
    }
  }

  private bumpWin() {
    const s = this.winText.scale;
    s.set(1.18);
    void tween(s, { x: 1, y: 1 }, 220, ease.outBack);
  }

  /** "2 LINIEN" … and finally the brass stamp "4 LINIEN · ×10" slamming onto the glass. */
  private stamp: Container | null = null;
  private stampPlate!: Sprite;
  private stampText!: Text;
  private async combo(n: number, factor = 0) {
    if (!this.stamp) {
      const s = new Container();
      this.stampPlate = new Sprite(plaqueTexture(300, 64, this.theme.velvet));
      this.stampPlate.anchor.set(0.5);
      this.stampText = new Text({
        text: '',
        style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: 0xfff6e6, letterSpacing: 1, stroke: { color: 0x14080f, width: 5 } },
      });
      this.stampText.anchor.set(0.5);
      s.addChild(this.stampPlate, this.stampText);
      s.position.set(W / 2, REELS_Y - 8);
      // Below the paytable and the big-win stage.
      this.cabinet.addChildAt(s, this.cabinet.getChildIndex(this.paytable));
      this.stamp = s;
    }
    const s = this.stamp;
    const final = factor > 1;
    s.visible = true;
    s.alpha = 1;
    this.stampText.text = final ? `${n} LINIEN · ×${fmt(factor)}` : `${n} LINIEN`;
    this.stampText.style.fill = final ? COLORS.lamp : 0xfff6e6;
    const tw = this.stampText.width / this.stampText.scale.x;
    const plateW = final ? Math.max(300, tw + 90) : Math.max(200, tw + 80);
    this.stampPlate.texture = plaqueTexture(Math.round(plateW / 20) * 20, final ? 64 : 54, this.theme.velvet);
    const id = ++this.comboId;
    if (!final) {
      s.rotation = 0;
      s.scale.set(0.7);
      await tween(s.scale, { x: 0.86, y: 0.86 }, 200, ease.outBack);
      return;
    }
    // The stamp: falls from large, lands with a squash, dust and a note.
    s.rotation = this.calm ? 0 : -0.06;
    s.scale.set(this.calm ? 1 : 1.9);
    s.alpha = this.calm ? 1 : 0;
    if (!this.calm) {
      void tween(s, { alpha: 1 }, 90);
      await tween(s.scale, { x: 1, y: 1 }, 170, ease.inCubic);
      if (id !== this.comboId) return;
      const p = this.cabinet.toGlobal({ x: W / 2, y: REELS_Y - 8 });
      this.ctx.particles.sparkle(p.x, p.y, 16, COLORS.lamp, 220 * this.cabinet.scale.x);
      s.scale.set(1.08, 0.9);
      await tween(s.scale, { x: 1, y: 1 }, 220, ease.outBack);
    }
  }
  private comboId = 0;

  resize(w: number, h: number) {
    const s = Math.min((w * 0.97) / (W + LEVER), (h * 0.92) / (H + PAD));
    this.cabinet.scale.set(s);
    this.cabinet.position.set((w - (W + LEVER) * s) / 2, (h - H * s) / 2 + 10 * s);
  }

  update(dtMs: number) {
    if (this.odds.poll()) this.refreshInfo();
    // Today's stakes changed (boss phase, event): same rung of the ladder, new amounts.
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(this.theme.bets);
      this.updateBet();
      this.ctx.toast(this.stakeWatch.note);
    }
    this.bulbPhase += dtMs / 1000;
    const flashing = this.bulbPhase < this.flashUntil;
    const n = this.bulbs.length;
    this.bulbs.forEach((b, i) => {
      let a: number;
      if (flashing) a = Math.floor(this.bulbPhase * 10) % 2 ? 1 : 0.3;
      else if (this.spinning) a = (Math.floor(this.bulbPhase * 14 + i) % 4 === 0 ? 1 : 0.25);
      else {
        // A slow wave chasing around the cabinet.
        const k = (Math.sin(this.bulbPhase * 3 - (i / n) * Math.PI * 6) + 1) / 2;
        a = 0.25 + 0.75 * k * k;
      }
      b.glow.alpha = a * 0.75;
      b.s.alpha = 0.55 + 0.45 * a;
    });
    this.tensionGlow.alpha = this.tension ? 0.6 + 0.4 * Math.sin(this.bulbPhase * 18) : Math.max(0, this.tensionGlow.alpha - dtMs / 300);
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

const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ','));

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
  size: 'cabinet',
  drawStation,
  create: (ctx) => new SlotGame(ctx),
};
