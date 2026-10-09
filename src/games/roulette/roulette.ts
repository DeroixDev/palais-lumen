// European roulette (single zero) with a painted wheel and a felt betting table.
// Wide screens: wheel left, table right. Portrait phones: the table fills the screen with a
// vertical layout and the chip tray in the thumb zone; the wheel comes forward for the spin.

import { Circle, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, banner, floatText, glowTexture, reducedMotion, rewardLevel, shake, sharedGlow } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { focusable } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import {
  CHIP_ANCHOR,
  CHIP_EDGE,
  CHIP_R,
  ORDER,
  PAINT,
  REDS,
  WHEEL,
  ballShadowTexture,
  ballTexture,
  bowlTexture,
  chipTexture,
  medallionTexture,
  pocketColor,
  rotorLightTexture,
  rotorTexture,
  tableTexture,
  trayTexture,
  turretCapTexture,
  type CellSpec,
} from './paint';

// ---- Rules -------------------------------------------------------------

const HOUSE_EDGE = 1 / 37;

type BetKey = string; // "n:17", "red", "black", "even", "odd", "low", "high", "dozen:0", "col:2"

function betWins(key: BetKey, n: number): number {
  // Returns the payout multiplier (winnings on top of the stake), or -1 if the bet loses.
  if (key.startsWith('n:')) return Number(key.slice(2)) === n ? 35 : -1;
  if (n === 0) return -1;
  switch (key) {
    case 'red':
      return REDS.has(n) ? 1 : -1;
    case 'black':
      return !REDS.has(n) ? 1 : -1;
    case 'even':
      return n % 2 === 0 ? 1 : -1;
    case 'odd':
      return n % 2 === 1 ? 1 : -1;
    case 'low':
      return n <= 18 ? 1 : -1;
    case 'high':
      return n >= 19 ? 1 : -1;
  }
  if (key.startsWith('dozen:')) return Math.floor((n - 1) / 12) === Number(key.slice(6)) ? 2 : -1;
  if (key.startsWith('col:')) return (n - 1) % 3 === Number(key.slice(4)) ? 2 : -1;
  return -1;
}

// ---- Layout -------------------------------------------------------------

/** Visible wheel diameter in wheel units (the bowl texture has a margin for its shadow). */
const WHEEL_D = WHEEL.outer * 2 + 12;
const CHIPS = [10, 50, 100, 500];
/** 1500 → "1,5k", 250000 → "250k", so big chips still fit. */
const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')}k` : String(n);

type Mode = 'wide' | 'tall';

interface BoardSpec {
  mode: Mode;
  cells: CellSpec[];
  gw: number;
  gh: number;
  pad: number;
  top: number;
  /** Chip scale on this board. */
  chip: number;
  /** Where the history sits (grid coordinates) and how many fit. */
  hist: { x: number; y: number; r: number; n: number; dx: number; dy: number };
  ornaments: { x: number; y: number; s: number }[];
}

function wideSpec(): BoardSpec {
  const CW = 58;
  const CH = 64;
  const cells: CellSpec[] = [];
  cells.push({ key: 'n:0', x: 0, y: 0, w: CW, h: CH * 3, text: '0', fill: PAINT.green, size: 26, display: true });
  for (let c = 0; c < 12; c++)
    for (let r = 0; r < 3; r++) {
      const n = 3 * c + (3 - r);
      cells.push({ key: `n:${n}`, x: CW * (c + 1), y: CH * r, w: CW, h: CH, text: String(n), fill: pocketColor(n), size: 22, display: true });
    }
  for (let r = 0; r < 3; r++) cells.push({ key: `col:${2 - r}`, x: CW * 13, y: CH * r, w: CW, h: CH, text: '2:1', size: 20 });
  const dz = ['1. DUTZEND', '2. DUTZEND', '3. DUTZEND'];
  for (let d = 0; d < 3; d++) cells.push({ key: `dozen:${d}`, x: CW + d * CW * 4, y: CH * 3, w: CW * 4, h: 54, text: dz[d], size: 20 });
  const outs: [BetKey, string, number?][] = [
    ['low', '1–18'],
    ['even', 'GERADE'],
    ['red', 'ROT', PAINT.red],
    ['black', 'SCHWARZ', PAINT.black],
    ['odd', 'UNGERADE'],
    ['high', '19–36'],
  ];
  outs.forEach(([k, t, f], i) => cells.push({ key: k, x: CW + i * CW * 2, y: CH * 3 + 54, w: CW * 2, h: 54, text: t, fill: f, size: 19 }));
  return {
    mode: 'wide',
    cells,
    gw: CW * 14,
    gh: CH * 3 + 108,
    pad: 34,
    top: 50,
    chip: 0.8,
    hist: { x: 150, y: -30, r: 15, n: 13, dx: 38, dy: 0 },
    ornaments: [
      { x: 30, y: CH * 3 + 54, s: 40 },
      { x: CW * 13 + 30, y: CH * 3 + 54, s: 40 },
    ],
  };
}

/** Vertical board for portrait screens; cell sizes come from the space available. */
function tallSpec(availW: number, availH: number): BoardSpec {
  const pad = 14;
  const rh = Math.max(26, Math.min(56, (availH - pad * 2) / 14));
  const side = Math.round(Math.max(34, Math.min(52, rh * 1.15)));
  const cw = Math.max(40, Math.min(110, (availW - pad * 2 - side * 2) / 3));
  const x0 = side * 2;
  const cells: CellSpec[] = [];
  const numSize = Math.round(Math.min(rh * 0.52, cw * 0.3, 24));
  cells.push({ key: 'n:0', x: x0, y: 0, w: cw * 3, h: rh, text: '0', fill: PAINT.green, size: numSize, display: true });
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 3; j++) {
      const n = 3 * i + j + 1;
      cells.push({ key: `n:${n}`, x: x0 + j * cw, y: rh * (1 + i), w: cw, h: rh, text: String(n), fill: pocketColor(n), size: numSize, display: true });
    }
  const sideSize = Math.round(Math.max(12, Math.min(side * 0.4, (rh * 2 * 0.86) / 4.3, 18)));
  for (let j = 0; j < 3; j++) cells.push({ key: `col:${j}`, x: x0 + j * cw, y: rh * 13, w: cw, h: rh, text: '2:1', size: Math.round(Math.min(rh * 0.5, 18)) });
  const dz = ['1. DUTZEND', '2. DUTZEND', '3. DUTZEND'];
  for (let d = 0; d < 3; d++) cells.push({ key: `dozen:${d}`, x: side, y: rh * (1 + 4 * d), w: side, h: rh * 4, text: dz[d], size: sideSize, rotate: true });
  const outs: [BetKey, string, number?][] = [
    ['low', '1–18'],
    ['even', 'GERADE'],
    ['red', 'ROT', PAINT.red],
    ['black', 'SCHWARZ', PAINT.black],
    ['odd', 'UNGERADE'],
    ['high', '19–36'],
  ];
  outs.forEach(([k, t, f], i) => cells.push({ key: k, x: 0, y: rh * (1 + 2 * i), w: side, h: rh * 2, text: t, fill: f, size: sideSize, rotate: true }));
  const hr = Math.min(rh * 0.4, 15);
  return {
    mode: 'tall',
    cells,
    gw: x0 + cw * 3,
    gh: rh * 14,
    pad,
    top: 0,
    chip: Math.min(0.78, Math.max(0.5, (Math.min(cw, rh * 1.4) * 0.4) / CHIP_R)),
    hist: { x: hr + 4, y: rh / 2, r: hr, n: Math.max(1, Math.floor((x0 - 4) / (hr * 2 + 5))), dx: hr * 2 + 5, dy: 0 },
    ornaments: [{ x: side, y: rh * 13.5, s: Math.min(side * 1.3, rh * 1.4) }],
  };
}

class RouletteGame implements GameInstance {
  view = new Container();
  // Wheel (origin at its centre).
  private wheelGroup = new Container();
  private rotor = new Container();
  private pocketGlow = new Sprite(glowTexture());
  private ball = new Sprite(ballTexture());
  private ballShadow = new Sprite(ballShadowTexture());
  private medal = new Container();
  private medalSprite = new Sprite();
  private medalText!: Text;
  private wheelSpeed = 0.25; // rad/s
  private ballAngle = 0; // relative to the rotor while resting
  private ballRadius: number = WHEEL.rest;
  private ballHop = 0;
  /** Portrait phones: the wheel only comes forward for the spin. */
  private wheelHidden = false;
  private wheelHome = { x: 0, y: 0, s: 1 };

  // Table.
  private boardGroup = new Container();
  private spec!: BoardSpec;
  private tableTex: Texture | null = null;
  private trayTex: Texture | null = null;
  private chipLayer = new Container();
  private cells = new Map<BetKey, CellSpec>();
  private hover = new Graphics();
  private highlight = new Graphics();
  private historyLayer = new Container();
  private dim = new Graphics();

  // Controls.
  private controls = new Container();
  private chipButtons: Container[] = [];
  private totalText!: Text;
  private hintText!: Text;
  private spinBtn!: Button;
  private clearBtn!: Button;
  private repeatBtn!: Button;

  private spinning = false;
  private bets = new Map<BetKey, number>();
  private lastBets = new Map<BetKey, number>();
  private chipValue = 10;
  private history: number[] = [];
  private minBet: number;
  private chips: number[];
  private time = 0;
  private layoutKey = '';
  private stakeWatch: StakeWatch;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.spin();
    }
  };

  constructor(private ctx: GameContext) {
    // Chips and the table minimum are written for day 1 and grow with today's stakes.
    this.chips = ctx.state.stakes(CHIPS);
    const baseMin = Number(ctx.options.minBet ?? 10);
    this.minBet = ctx.state.stakes([baseMin])[0];
    this.chipValue = this.chips[baseMin >= 50 ? 1 : 0];
    this.stakeWatch = new StakeWatch(ctx.state);
    this.buildWheel();
    this.view.addChild(this.boardGroup, this.controls, this.dim, this.wheelGroup);
    this.dim.eventMode = 'none';
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Wheel ------------------------------------------------------------

  private buildWheel() {
    const g = this.wheelGroup;
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.width = halo.height = WHEEL_D * 1.6;
    halo.tint = COLORS.lamp;
    halo.alpha = 0.22;
    halo.blendMode = 'add';
    const bowl = new Sprite(bowlTexture());
    bowl.anchor.set(0.5);
    const rotorSprite = new Sprite(rotorTexture());
    rotorSprite.anchor.set(0.5);
    this.pocketGlow.anchor.set(0.5);
    this.pocketGlow.width = this.pocketGlow.height = 90;
    this.pocketGlow.tint = COLORS.lamp;
    this.pocketGlow.blendMode = 'add';
    this.pocketGlow.alpha = 0;
    this.rotor.addChild(rotorSprite, this.pocketGlow);
    const light = new Sprite(rotorLightTexture());
    light.anchor.set(0.5);
    const cap = new Sprite(turretCapTexture());
    cap.anchor.set(0.5);
    this.ball.anchor.set(0.5);
    this.ballShadow.anchor.set(0.5);
    // Result medallion over the turret.
    this.medalSprite.anchor.set(0.5);
    this.medalText = new Text({
      text: '',
      style: { fontFamily: FONT_DISPLAY, fontSize: 50, fill: 0xfff3dc, stroke: { color: 0x14080f, width: 6 } },
    });
    this.medalText.anchor.set(0.5, 0.46);
    this.medal.addChild(this.medalSprite, this.medalText);
    this.medal.visible = false;
    g.addChild(halo, bowl, this.rotor, light, cap, this.ballShadow, this.ball, this.medal);
    this.ballAngle = Math.random() * Math.PI * 2;
  }

  private pocketAngle(n: number) {
    return ORDER.indexOf(n) * ((Math.PI * 2) / 37);
  }

  private placeBall() {
    const a = this.rotor.rotation + this.ballAngle - Math.PI / 2;
    const x = Math.cos(a) * this.ballRadius;
    const y = Math.sin(a) * this.ballRadius;
    const h = this.ballHop;
    this.ball.position.set(x, y - h * 0.4);
    this.ball.scale.set(1 + h * 0.012);
    this.ballShadow.position.set(x + 3 + h * 0.3, y + 4 + h * 0.45);
    this.ballShadow.alpha = Math.max(0.25, 0.85 - h * 0.025);
    this.ballShadow.scale.set(1 + h * 0.01);
  }

  // ---- Board ------------------------------------------------------------

  private buildBoard(spec: BoardSpec) {
    this.spec = spec;
    const g = this.boardGroup;
    g.removeChildren().forEach((c) => c !== this.chipLayer && c !== this.highlight && c !== this.hover && c !== this.historyLayer && c.destroy({ children: true }));
    this.tableTex?.destroy(true);
    const res = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    this.tableTex = tableTexture(spec.cells, spec.gw, spec.gh, spec.pad, spec.top, spec.mode === 'tall' ? res : 2, spec.ornaments);
    const table = new Sprite(this.tableTex);
    table.position.set(-spec.pad, -spec.pad - spec.top);
    g.addChild(table);
    this.cells.clear();
    for (const cell of spec.cells) {
      this.cells.set(cell.key, cell);
      const hit = new Graphics().rect(cell.x, cell.y, cell.w, cell.h).fill({ color: 0xffffff, alpha: 0.001 });
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', () => this.addBet(cell.key));
      hit.on('pointerover', () => this.showHover(cell));
      hit.on('pointerout', () => this.hover.clear());
      focusable(hit, { label: () => this.betSpeech(cell.key), rect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h }, radius: 4 });
      g.addChild(hit);
    }
    this.hover.eventMode = 'none';
    this.highlight.eventMode = 'none';
    this.chipLayer.eventMode = 'none';
    g.addChild(this.hover, this.highlight, this.chipLayer, this.historyLayer);
    if (spec.mode === 'wide') {
      const t = new Text({ text: 'LETZTE ZAHLEN', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: 0xcfe9dc, letterSpacing: 1.5 } });
      t.anchor.set(0, 0.5);
      t.position.set(0, spec.hist.y);
      g.addChildAt(t, 1);
    }
    this.highlight.clear();
    this.refreshHistory();
  }

  /** "17 rot, gesetzt 20" for screen readers. */
  private betSpeech(key: BetKey) {
    const NAMES: Record<string, string> = { red: 'Rot', black: 'Schwarz', even: 'Gerade', odd: 'Ungerade', low: '1 bis 18', high: '19 bis 36' };
    const [kind, arg] = key.split(':');
    const i = Number(arg);
    const name = kind === 'n' ? `${i}${i === 0 ? '' : REDS.has(i) ? ' rot' : ' schwarz'}` : kind === 'dozen' ? `${i * 12 + 1} bis ${i * 12 + 12}` : kind === 'col' ? `Kolonne ${i + 1}, 2 zu 1` : (NAMES[key] ?? key);
    const amount = this.bets.get(key);
    return `Setzen auf ${name}${amount ? `, gesetzt ${formatChips(amount)}` : ''}`;
  }

  private showHover(cell: CellSpec) {
    if (this.spinning) return;
    this.hover.clear().rect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2).fill({ color: 0xfff1c4, alpha: 0.16 });
  }

  private buildControls(mode: Mode, width: number) {
    const c = this.controls;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    this.trayTex?.destroy(true);
    this.chipButtons = [];
    const tall = mode === 'tall';
    const H = tall ? 166 : 132;
    const res = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    this.trayTex = trayTexture(width, H, tall ? res : 2);
    c.addChild(new Sprite(this.trayTex));

    const chipY = tall ? 46 : 58;
    const chipStep = tall ? Math.min(64, (width - 130) / 4) : 74;
    const chipScale = tall ? 1.1 : 1.2;
    this.chips.forEach((v, i) => {
      const chip = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 96;
      glow.tint = COLORS.lamp;
      glow.blendMode = 'add';
      glow.label = 'glow';
      const s = new Sprite(chipTexture(CHIPS[i]));
      s.anchor.set(CHIP_ANCHOR.x, CHIP_ANCHOR.y);
      s.scale.set(chipScale);
      const t = new Text({ text: short(v), style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xfff3dc, stroke: { color: 0x14080f, width: 4 } } });
      t.anchor.set(0.5);
      t.y = 1;
      chip.addChild(glow, s, t);
      chip.position.set(24 + 22 + i * chipStep, chipY);
      chip.eventMode = 'static';
      chip.cursor = 'pointer';
      chip.hitArea = new Circle(0, 4, 31);
      chip.on('pointertap', () => {
        this.chipValue = this.chips[i];
        this.ctx.sfx.chip();
        this.updateChipButtons();
      });
      focusable(chip, { label: () => `Chip ${formatChips(v)}${this.chipValue === v ? ', gewählt' : ''}`, rect: { x: -31, y: -27, w: 62, h: 62 }, radius: 31 });
      this.chipButtons.push(chip);
      c.addChild(chip);
    });

    const valueStyle = tall
      ? { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700' as const, fill: 0xffd98a, lineHeight: 21 }
      : { fontFamily: FONT_BODY, fontSize: 19, fontWeight: '700' as const, fill: 0xffd98a };
    const hintStyle = { fontFamily: FONT_BODY, fontSize: tall ? 15 : 17, fontWeight: '600' as const, fill: 0xe9dcc4 };
    this.totalText = new Text({ text: '', style: valueStyle });
    this.hintText = new Text({ text: '', style: { ...hintStyle, wordWrap: tall, wordWrapWidth: Math.max(60, width - 24 - 4 * chipStep - 22) } });
    const edge = new Text({
      text: `Hausvorteil ${(HOUSE_EDGE * 100).toFixed(1).replace('.', ',')} % · Volltreffer zahlt 35:1`,
      style: { fontFamily: FONT_BODY, fontSize: tall ? 14 : 16, fontWeight: '600', fill: 0xbfa98a },
    });
    c.addChild(this.totalText, this.hintText, edge);

    const secondary = { color: 0x3a2030, textColor: 0xfff3dc, display: false } as const;
    if (tall) {
      const x0 = 24 + 4 * chipStep + 8;
      this.totalText.anchor.set(0, 0.5);
      this.totalText.position.set(x0, chipY);
      this.hintText.anchor.set(0, 0.5);
      this.hintText.position.set(x0, chipY);
      const rowY = 112;
      const inner = width - 28;
      const cw = Math.round(inner * 0.23);
      const rw = Math.round(inner * 0.31);
      const sw = inner - cw - rw - 16;
      this.clearBtn = button({ ...secondary, label: 'Leeren', width: cw, height: 52, fontSize: 18, onClick: () => this.clearBets() });
      this.repeatBtn = button({ ...secondary, label: 'Wiederholen', width: rw, height: 52, fontSize: 18, onClick: () => this.repeatBets() });
      this.spinBtn = button({ label: 'DREHEN', width: sw, height: 58, color: COLORS.brass, fontSize: 22, onClick: () => void this.spin() });
      this.clearBtn.position.set(14 + cw / 2, rowY);
      this.repeatBtn.position.set(14 + cw + 8 + rw / 2, rowY);
      this.spinBtn.position.set(width - 14 - sw / 2, rowY);
      edge.anchor.set(0.5, 0.5);
      edge.position.set(width / 2, H - 14);
    } else {
      const rowY = chipY;
      this.clearBtn = button({ ...secondary, label: 'Leeren', width: 120, height: 52, fontSize: 20, onClick: () => this.clearBets() });
      this.repeatBtn = button({ ...secondary, label: 'Wiederholen', width: 150, height: 52, fontSize: 20, onClick: () => this.repeatBets() });
      this.spinBtn = button({ label: 'DREHEN', width: 230, height: 66, color: COLORS.brass, fontSize: 26, onClick: () => void this.spin() });
      this.spinBtn.position.set(width - 28 - 115, rowY);
      this.repeatBtn.position.set(width - 28 - 230 - 14 - 75, rowY);
      this.clearBtn.position.set(width - 28 - 230 - 14 - 150 - 12 - 60, rowY);
      this.totalText.anchor.set(0, 0.5);
      this.totalText.position.set(28, H - 22);
      this.hintText.anchor.set(0, 0.5);
      this.hintText.position.set(28, H - 22);
      edge.anchor.set(1, 0.5);
      edge.position.set(width - 28, H - 22);
    }
    c.addChild(this.clearBtn, this.repeatBtn, this.spinBtn);
    this.updateChipButtons(false);
    this.refreshBets();
  }

  private updateChipButtons(animateIt = true) {
    const baseY = this.spec?.mode === 'tall' ? 46 : 58;
    this.chipButtons.forEach((c, i) => {
      const sel = this.chips[i] === this.chipValue;
      const y = baseY - (sel ? 8 : 0);
      if (animateIt) void tween(c, { y }, 180, ease.outBack);
      else c.y = y;
      const glow = c.getChildByLabel('glow');
      if (glow) glow.alpha = sel ? 0.55 : 0;
      c.alpha = sel ? 1 : 0.86;
    });
  }

  private get totalBet() {
    let s = 0;
    for (const v of this.bets.values()) s += v;
    return s;
  }

  private addBet(key: BetKey) {
    if (this.spinning) return;
    const next = this.totalBet + this.chipValue;
    if (next > this.ctx.state.balance) {
      this.ctx.toast('Nicht genug Falter für diesen Chip.');
      return;
    }
    this.bets.set(key, (this.bets.get(key) ?? 0) + this.chipValue);
    this.ctx.sfx.chip();
    this.refreshBets(key);
  }

  private clearBets() {
    if (this.spinning) return;
    this.bets.clear();
    this.refreshBets();
  }

  private repeatBets() {
    if (this.spinning || this.lastBets.size === 0) return;
    let sum = 0;
    for (const v of this.lastBets.values()) sum += v;
    if (sum > this.ctx.state.balance) {
      this.ctx.toast('Nicht genug Falter, um die letzten Einsätze zu wiederholen.');
      return;
    }
    this.bets = new Map(this.lastBets);
    this.ctx.sfx.chip();
    this.refreshBets();
  }

  /** A stack of painted chips for an amount, made of today's chip values (at most 5 high). */
  private chipStack(amount: number, withLabel = true) {
    const c = new Container();
    const parts: number[] = [];
    let rest = amount;
    for (let i = this.chips.length - 1; i >= 0 && parts.length < 5; i--) {
      while (rest >= this.chips[i] && parts.length < 5) {
        parts.push(i);
        rest -= this.chips[i];
      }
    }
    if (parts.length === 0) parts.push(0);
    parts.reverse();
    const k = this.spec.chip;
    parts.forEach((ci, j) => {
      const s = new Sprite(chipTexture(CHIPS[ci]));
      s.anchor.set(CHIP_ANCHOR.x, CHIP_ANCHOR.y);
      s.scale.set(k);
      s.y = -j * CHIP_EDGE * k;
      c.addChild(s);
    });
    const topY = -(parts.length - 1) * CHIP_EDGE * k;
    if (withLabel) {
      const t = new Text({
        text: short(amount),
        style: { fontFamily: FONT_DISPLAY, fontSize: Math.round(26 * k), fill: 0xfff3dc, stroke: { color: 0x14080f, width: 4 } },
      });
      t.anchor.set(0.5);
      t.scale.set(0.5);
      t.position.set(0, topY + 1);
      c.addChild(t);
    }
    // Keep the whole stack centred on its cell.
    c.pivot.y = topY / 2;
    return c;
  }

  private refreshBets(popKey?: BetKey) {
    this.chipLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const [key, amount] of this.bets) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      const chip = this.chipStack(amount);
      chip.position.set(cell.x + cell.w / 2, cell.y + cell.h / 2);
      chip.label = key;
      this.chipLayer.addChild(chip);
      if (key === popKey) {
        chip.alpha = 0;
        chip.y -= 18;
        chip.scale.set(1.25);
        void tween(chip, { alpha: 1, y: chip.y + 18 }, 160, ease.outCubic);
        void tween(chip.scale, { x: 1, y: 1 }, 240, ease.outBack);
      }
    }
    if (!this.spinBtn) return;
    const total = this.totalBet;
    const tall = this.spec.mode === 'tall';
    this.totalText.text = total > 0 ? (tall ? `Einsatz\n${formatChips(total)}` : `Einsatz auf dem Tisch: ${formatChips(total)}`) : '';
    this.hintText.text = total > 0 ? '' : tall ? `Chip wählen, dann aufs Feld tippen. Ab ${formatChips(this.minBet)}.` : `Chip wählen, dann auf ein Feld klicken. Mindesteinsatz ${formatChips(this.minBet)}.`;
    this.spinBtn.setLabel(total > 0 ? `DREHEN · ${short(total)}` : 'DREHEN');
    this.spinBtn.setEnabled(!this.spinning && total >= this.minBet);
    this.clearBtn.setEnabled(!this.spinning && total > 0);
    this.repeatBtn.setEnabled(!this.spinning && this.lastBets.size > 0);
  }

  private refreshHistory() {
    this.historyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.spec) return;
    const h = this.spec.hist;
    this.history.slice(0, h.n).forEach((n, i) => {
      const c = new Container();
      const s = new Sprite(medallionTexture(n));
      s.anchor.set(0.5);
      s.scale.set((h.r * 2.2) / 124);
      const t = new Text({ text: String(n), style: { fontFamily: FONT_DISPLAY, fontSize: Math.round(h.r * 1.9), fill: 0xfff3dc } });
      t.anchor.set(0.5, 0.46);
      t.scale.set(0.5);
      c.addChild(s, t);
      c.position.set(h.x + i * h.dx, h.y + i * h.dy);
      if (i > 0) c.alpha = 0.72;
      this.historyLayer.addChild(c);
      if (i === 0) {
        c.scale.set(0.2);
        void tween(c.scale, { x: 1, y: 1 }, 320, ease.outBack);
      }
    });
  }

  // ---- Round ------------------------------------------------------------

  async spin() {
    if (this.spinning) return;
    const total = this.totalBet;
    if (total < this.minBet) {
      this.ctx.toast(`Mindesteinsatz an diesem Tisch: ${this.minBet}.`);
      return;
    }
    if (!this.ctx.state.placeBet(total)) {
      this.ctx.toast('Nicht genug Falter.');
      return;
    }
    this.spinning = true;
    this.lastBets = new Map(this.bets);
    this.highlight.clear();
    this.highlight.filters = [];
    this.hover.clear();
    this.refreshBets();
    this.medal.visible = false;
    this.pocketGlow.alpha = 0;
    await this.bringWheel(true);

    const result = Math.floor(Math.random() * 37);
    const T = 5600;
    this.ctx.sfx.whoosh();
    this.ctx.sfx.ballRoll((T / 1000) * 0.75);
    this.wheelSpeed = 1.4;
    const start = this.ballAngle;
    const target = this.pocketAngle(result);
    // Ball runs against the wheel for several laps, then drops off the track and hops over the frets.
    let end = target;
    while (end > start - Math.PI * 2 * 7) end -= Math.PI * 2;
    const dropStart = 0.58;
    const dropEnd = 0.88;
    let bounced = 0;
    await animate(T, (t) => {
      const e = 1 - Math.pow(1 - t, 2.6);
      let jitter = 0;
      let r: number = WHEEL.track;
      let hop = 0;
      if (t > dropStart) {
        const s = Math.min(1, (t - dropStart) / (dropEnd - dropStart));
        hop = Math.abs(Math.sin(s * Math.PI * 4)) * 22 * (1 - s);
        r = WHEEL.track + (WHEEL.rest - WHEEL.track) * ease.inOutCubic(s) + hop * 0.5;
        jitter = Math.sin(s * 40) * 0.04 * (1 - s);
        const nb = Math.floor(s * 4);
        if (nb > bounced && s < 1) {
          bounced = nb;
          this.ctx.sfx.tick();
        }
      }
      this.ballAngle = start + (end - start) * e + jitter;
      this.ballRadius = r;
      this.ballHop = hop;
    });
    this.ballAngle = target;
    this.ballRadius = WHEEL.rest;
    this.ballHop = 0;
    this.ctx.sfx.thud();
    this.history.unshift(result);
    await this.showResult(result);
    this.refreshHistory();
    await this.settle(result);
    this.spinning = false;
    this.refreshBets();
  }

  /** Portrait phones: the wheel comes forward over the dimmed table for the spin, and leaves again. */
  private async bringWheel(show: boolean) {
    if (!this.wheelHidden) return;
    const calm = reducedMotion();
    const s = this.wheelHome.s;
    if (show) {
      this.wheelGroup.visible = true;
      this.wheelGroup.alpha = 0;
      this.wheelGroup.scale.set(calm ? s : s * 0.92);
      void tween(this.dim, { alpha: 1 }, 280);
      await Promise.all([tween(this.wheelGroup, { alpha: 1 }, 220), tween(this.wheelGroup.scale, { x: s, y: s }, 280, ease.outBack)]);
    } else {
      void tween(this.dim, { alpha: 0 }, 180);
      if (!calm) void tween(this.wheelGroup.scale, { x: s * 0.97, y: s * 0.97 }, 180, ease.inCubic);
      await tween(this.wheelGroup, { alpha: 0 }, 180, ease.inCubic);
      this.wheelGroup.visible = false;
    }
  }

  private async showResult(n: number) {
    // The pocket lights up and turns with the rotor; the medallion pops over the turret.
    const a = this.pocketAngle(n) - Math.PI / 2;
    this.pocketGlow.position.set(Math.cos(a) * WHEEL.rest, Math.sin(a) * WHEEL.rest);
    this.pocketGlow.alpha = 0.9;
    this.medalSprite.texture = medallionTexture(n);
    this.medalText.text = String(n);
    this.medal.visible = true;
    this.medal.alpha = 0;
    this.medal.scale.set(0.4);
    void tween(this.medal, { alpha: 1 }, 160);
    await tween(this.medal.scale, { x: 1, y: 1 }, 380, ease.outBack);
    if (this.wheelHidden) {
      await wait(1000);
      await this.bringWheel(false);
    }
  }

  private async settle(n: number) {
    // Highlight the winning number on the board.
    const c = this.cells.get(`n:${n}`)!;
    this.highlight.clear().rect(c.x + 2, c.y + 2, c.w - 4, c.h - 4).fill({ color: COLORS.lamp, alpha: 0.2 }).stroke({ color: 0xffe4a0, width: 4 });
    this.highlight.filters = [sharedGlow(COLORS.lamp, 14)];
    this.highlight.alpha = 1;

    let payout = 0;
    let bestMult = -1;
    const winners: BetKey[] = [];
    for (const [key, amount] of this.bets) {
      const m = betWins(key, n);
      if (m >= 0) {
        payout += amount * (m + 1);
        winners.push(key);
        bestMult = Math.max(bestMult, m);
      }
    }
    const tags = ['roulette', n === 0 ? 'zero' : REDS.has(n) ? 'red' : 'black'];
    if (winners.some((k) => k.startsWith('n:'))) tags.push('straight');
    const report = () => this.ctx.state.report({ game: 'roulette', stake: [...this.bets.values()].reduce((a, b) => a + b, 0), win: payout, rtp: 36 / 37, tags });

    // Losing chips are raked off towards the wheel side, winners get paid beside their stack.
    const toScreen = (x: number, y: number) => this.boardGroup.toGlobal({ x, y });
    const rakeX = this.spec.mode === 'wide' ? -60 : 0;
    const rakeY = this.spec.mode === 'wide' ? 0 : -60;
    for (const chip of [...this.chipLayer.children]) {
      const key = chip.label as BetKey;
      if (winners.includes(key)) {
        const halo = new Sprite(glowTexture());
        halo.anchor.set(0.5);
        halo.width = halo.height = 70 * this.spec.chip * 1.4;
        halo.tint = COLORS.lamp;
        halo.blendMode = 'add';
        halo.y = chip.pivot.y;
        chip.addChildAt(halo, 0);
        void tween(chip.scale, { x: 1.15, y: 1.15 }, 260, ease.outBack);
      } else {
        void tween(chip, { alpha: 0, x: chip.x + rakeX, y: chip.y + rakeY }, 420, ease.inCubic, 250);
      }
    }

    if (payout > 0) {
      // Payout stacks slide in next to the winning bets.
      await wait(320);
      for (const key of winners) {
        const cell = this.cells.get(key)!;
        const amount = this.bets.get(key)! * betWins(key, n);
        const pay = this.chipStack(amount, false);
        const dx = Math.min(cell.w * 0.28, CHIP_R * this.spec.chip * 1.3);
        pay.position.set(cell.x + cell.w / 2 + dx, cell.y + cell.h / 2);
        pay.alpha = 0;
        this.chipLayer.addChild(pay);
        const fromX = pay.x + (this.spec.mode === 'wide' ? -80 : 0);
        const fromY = pay.y + (this.spec.mode === 'wide' ? 0 : -80);
        const toX = pay.x;
        const toY = pay.y;
        pay.position.set(fromX, fromY);
        void tween(pay, { x: toX, y: toY, alpha: 1 }, 300, ease.outCubic);
        this.ctx.sfx.chip();
      }
      this.ctx.state.payout(payout);
      report();
      const total = this.totalBet;
      const mult = payout / total;
      const level = rewardLevel(mult);
      const pos = toScreen(c.x + c.w / 2, c.y + c.h / 2);
      const local = this.view.toLocal(pos);
      floatText(this.view, local.x, local.y - 30, `+${formatChips(payout)}`, COLORS.lamp, 40);
      for (const key of winners) {
        const cell = this.cells.get(key)!;
        const p = toScreen(cell.x + cell.w / 2, cell.y + cell.h / 2);
        this.ctx.particles.sparkle(p.x, p.y, bestMult >= 35 ? 16 : 8);
      }
      // Moths rise from the winning field and circle the wheel when it is on screen.
      const wheelCentre = this.wheelGroup.getGlobalPosition();
      const wheelR = (WHEEL.rim + 10) * this.wheelGroup.scale.x;
      this.ctx.celebrate(mult, pos.x, pos.y, this.wheelHidden ? undefined : { x: wheelCentre.x, y: wheelCentre.y, r: wheelR });
      if (level >= 2) {
        const mid = toScreen(this.spec.gw / 2, this.spec.gh / 2);
        this.ctx.particles.lightWave(mid.x, mid.y, COLORS.lamp, Math.max(this.spec.gw, this.spec.gh) * this.boardGroup.scale.x * 0.7);
      }
      if (level >= 3) {
        const bw = this.view.toLocal(toScreen(this.spec.gw / 2, this.spec.gh * 0.4));
        void banner(this.view, level >= 4 ? 'VOLLTREFFER!' : 'GROSSER GEWINN', level >= 4 ? COLORS.lamp : COLORS.neon, bw.x, bw.y, this.lastW * 0.95);
      }
      if (level >= 4) {
        void shake(this.boardGroup, 8, 300);
        if (!this.wheelHidden) void shake(this.wheelGroup, 6, 300);
      }
      for (let i = 0; i < Math.min(12, winners.length * 4); i++) this.ctx.sfx.coin(i * 0.06);
      await wait(1100);
      // Everything on the winning fields goes to the player.
      for (const chip of [...this.chipLayer.children]) {
        if (chip.alpha <= 0.01) continue;
        void tween(chip, { alpha: 0, y: chip.y + (this.spec.mode === 'wide' ? 30 : 40) }, 360, ease.inCubic);
      }
      await wait(400);
    } else {
      report();
      this.ctx.sfx.lose();
      await wait(1100);
    }
    this.bets.clear();
  }

  // ---- Frame ------------------------------------------------------------

  private lastW = 800;

  resize(w: number, h: number) {
    this.lastW = w;
    const tall = w / h < 0.9;
    if (!tall) {
      const key = 'wide';
      if (this.layoutKey !== key) {
        this.layoutKey = key;
        this.buildBoard(wideSpec());
        this.boardGroup.addChild(this.controls);
        this.buildControls('wide', this.spec.gw + this.spec.pad * 2);
      }
      const sp = this.spec;
      const tableW = sp.gw + sp.pad * 2;
      const tableH = sp.top + sp.gh + sp.pad * 2;
      const ctrlGap = 8;
      const boardH = tableH + ctrlGap + 132;
      const totalW = WHEEL_D + 30 + tableW;
      const totalH = Math.max(WHEEL_D, boardH);
      const s = Math.min((w * 0.96) / totalW, (h * 0.94) / totalH);
      const ox = (w - totalW * s) / 2;
      const oy = (h - totalH * s) / 2;
      this.wheelHidden = false;
      this.wheelGroup.visible = true;
      this.wheelGroup.alpha = 1;
      this.wheelGroup.scale.set(s);
      this.wheelGroup.position.set(ox + (WHEEL_D / 2) * s, oy + (totalH / 2) * s);
      this.boardGroup.scale.set(s);
      const bx = ox + (WHEEL_D + 30) * s;
      const by = oy + ((totalH - boardH) / 2) * s;
      this.boardGroup.position.set(bx + sp.pad * s, by + (sp.top + sp.pad) * s);
      this.controls.position.set(-sp.pad, sp.gh + sp.pad + ctrlGap);
      this.dim.clear();
      this.dim.alpha = 0;
    } else {
      const margin = 8;
      const ctrlH = 166;
      const cw = w - margin * 2;
      const availH = h - ctrlH - margin * 3;
      // Is there room for the wheel above a comfortable table?
      const comfy = 14 * 44 + 28;
      const wheelRoom = availH - comfy;
      const wheelVisible = wheelRoom >= 230;
      const wheelPx = wheelVisible ? Math.min(wheelRoom - 8, cw * 0.7, 380) : Math.min(cw, availH) * 0.98;
      const boardH = wheelVisible ? availH - wheelPx - margin : availH;
      const sp = tallSpec(cw, boardH);
      const key = `tall-${Math.round(sp.gw)}-${Math.round(sp.gh)}-${cw}`;
      if (this.layoutKey !== key) {
        this.layoutKey = key;
        this.buildBoard(sp);
        this.view.addChildAt(this.controls, 1);
        this.buildControls('tall', cw);
      }
      const tw = this.spec.gw + this.spec.pad * 2;
      const th = this.spec.gh + this.spec.pad * 2;
      const top = wheelVisible ? margin + wheelPx + margin : margin;
      this.boardGroup.scale.set(1);
      this.boardGroup.position.set(Math.round((w - tw) / 2 + this.spec.pad), Math.round(top + (boardH - th) / 2 + this.spec.pad));
      this.controls.position.set(margin, h - ctrlH - margin);
      const s = wheelPx / WHEEL_D;
      this.wheelHidden = !wheelVisible;
      if (wheelVisible) {
        this.wheelHome = { x: w / 2, y: margin + wheelPx / 2, s };
      } else {
        this.wheelHome = { x: w / 2, y: margin + availH / 2, s };
      }
      this.wheelGroup.position.set(this.wheelHome.x, this.wheelHome.y);
      this.wheelGroup.scale.set(s);
      if (this.wheelHidden && !this.spinning) {
        this.wheelGroup.visible = false;
        this.dim.alpha = 0;
      } else if (!this.wheelHidden) {
        this.wheelGroup.visible = true;
        this.wheelGroup.alpha = 1;
        this.dim.alpha = 0;
      }
      this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0a0410, alpha: 0.62 });
    }
    this.updateChipButtons(false);
  }

  /** Today's stakes changed (boss phase, event): the same chip stays picked, with its new value. Chips already on the table stay. */
  private refreshStakes() {
    const pick = Math.max(0, this.chips.indexOf(this.chipValue));
    this.chips = this.ctx.state.stakes(CHIPS);
    this.minBet = this.ctx.state.stakes([Number(this.ctx.options.minBet ?? 10)])[0];
    this.chipValue = this.chips[pick];
    this.chipButtons.forEach((c, i) => {
      const t = c.children[2];
      if (t instanceof Text) t.text = short(this.chips[i]);
    });
    this.updateChipButtons(false);
    this.refreshBets();
    this.ctx.toast(this.stakeWatch.note);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) this.refreshStakes();
    const dt = dtMs / 1000;
    this.time += dt;
    // Wheel eases back to its idle speed.
    this.wheelSpeed += (0.25 - this.wheelSpeed) * Math.min(1, dt * 0.35);
    this.rotor.rotation += this.wheelSpeed * dt;
    this.placeBall();
    if (this.pocketGlow.alpha > 0) this.pocketGlow.alpha = 0.65 + 0.3 * Math.sin(this.time * 5);
    if (this.highlight.filters && (this.highlight.filters as unknown[]).length) this.highlight.alpha = 0.75 + 0.25 * Math.sin(this.time * 4.2);
  }

  busy() {
    return this.spinning;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
    this.tableTex?.destroy(true);
    this.trayTex?.destroy(true);
  }
}

function drawStation(options: Record<string, unknown>) {
  const vip = Number(options.minBet ?? 10) >= 50;
  const c = new Container();
  const g = new Graphics();
  g.roundRect(4, 8, 150, 84, 40).fill({ color: 0x000000, alpha: 0.4 });
  g.roundRect(0, 0, 150, 84, 40).fill(0x4a2414);
  g.roundRect(6, 6, 138, 72, 34).fill(vip ? 0x173f6b : COLORS.felt);
  // Wheel.
  g.circle(36, 42, 26).fill(0x2a140b).stroke({ color: COLORS.brass, width: 2 });
  g.circle(36, 42, 18).fill(COLORS.red);
  g.circle(36, 42, 10).fill(0x5a2e16);
  g.circle(36, 42, 4).fill(COLORS.brass);
  // Board grid.
  for (let i = 0; i < 6; i++) g.rect(72 + i * 11, 22, 10, 40).fill(i % 2 ? COLORS.black : COLORS.red);
  g.rect(70, 20, 70, 44).stroke({ color: 0xfff6e6, width: 1.5, alpha: 0.7 });
  // Stools along the long side.
  for (let i = 0; i < 3; i++) g.circle(62 + i * 34, 100, 8).fill(0x3a2230).stroke({ color: COLORS.brassDark, width: 2 });
  c.addChild(g);
  return c;
}

export const roulette: GameDefinition = {
  id: 'roulette',
  name: 'Roulette',
  houseEdge: HOUSE_EDGE,
  footprint: { w: 150, h: 84 },
  drawStation,
  create: (ctx) => new RouletteGame(ctx),
};
