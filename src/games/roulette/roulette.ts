// European roulette (single zero) with an animated wheel and a betting board.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, drawChip, floatText, glowTexture, sharedGlow } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';

// ---- Rules -------------------------------------------------------------

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
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

const colorOf = (n: number) => (n === 0 ? COLORS.felt : REDS.has(n) ? COLORS.red : COLORS.black);

// ---- Layout -------------------------------------------------------------

const R = 230; // wheel radius (outer edge of the ball track)
const WHEEL_SIZE = (R + 44) * 2;
const CW = 56;
const CH = 64;
const BOARD_W = CW * 14;
const BOARD_H = CH * 3 + 56 + 56;
const CONTROLS_H = 150;
const CHIPS = [10, 50, 100, 500];
/** 1500 → "1,5k", 250000 → "250k", so big chips still fit. */
const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')}k` : String(n);
class RouletteGame implements GameInstance {
  view = new Container();
  private wheelGroup = new Container();
  private boardGroup = new Container();
  private wheel = new Container();
  private ball = new Container();
  private ballShadow = new Graphics();
  private wheelSpeed = 0.25; // rad/s
  private ballAngle = 0; // relative to wheel while resting
  private ballRadius = 168;
  private ballResting = true;
  private spinning = false;
  private bets = new Map<BetKey, number>();
  private lastBets = new Map<BetKey, number>();
  private chipLayer = new Container();
  private cells = new Map<BetKey, { x: number; y: number; w: number; h: number }>();
  private highlight = new Graphics();
  private chipValue = 10;
  private chipButtons: Container[] = [];
  private totalText!: Text;
  private resultText!: Text;
  private history: number[] = [];
  private historyLayer = new Container();
  private spinBtn!: Button;
  private clearBtn!: Button;
  private repeatBtn!: Button;
  private minBet: number;
  private chips: number[];
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
    this.buildWheel();
    this.buildBoard();
    this.view.addChild(this.wheelGroup, this.boardGroup);
    window.addEventListener('keydown', this.keyHandler);
  }

  // ---- Wheel ------------------------------------------------------------

  private buildWheel() {
    const g = this.wheelGroup;
    const cx = WHEEL_SIZE / 2;
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(cx, cx);
    halo.width = halo.height = WHEEL_SIZE * 1.7;
    halo.tint = COLORS.lamp;
    halo.alpha = 0.25;
    halo.blendMode = 'add';
    g.addChild(halo);

    const bowl = new Graphics();
    bowl.circle(cx, cx + 10, R + 44).fill({ color: 0x000000, alpha: 0.5 });
    bowl.circle(cx, cx, R + 44).fill(0x4a2414);
    bowl.circle(cx, cx, R + 36).fill(0x6b3a1e);
    bowl.circle(cx, cx, R + 30).stroke({ color: COLORS.brass, width: 4 });
    bowl.circle(cx, cx, R + 8).fill(0x2a140b); // ball track
    bowl.circle(cx, cx, R - 14).fill(0x1a0b06);
    for (let i = 0; i < 8; i++) {
      // Diamond deflectors on the track.
      const a = (i / 8) * Math.PI * 2;
      const x = cx + Math.cos(a) * (R - 2);
      const y = cx + Math.sin(a) * (R - 2);
      bowl.poly([x, y - 7, x + 4, y, x, y + 7, x - 4, y]).fill(COLORS.brass);
    }
    g.addChild(bowl);

    // Rotating part.
    const w = this.wheel;
    w.position.set(cx, cx);
    const step = (Math.PI * 2) / 37;
    const r1 = 140;
    const r2 = R - 18;
    const pockets = new Graphics();
    ORDER.forEach((n, k) => {
      const a0 = k * step - step / 2 - Math.PI / 2;
      const a1 = a0 + step;
      pockets
        .moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1)
        .arc(0, 0, r2, a0, a1)
        .lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
        .arc(0, 0, r1, a1, a0, true)
        .fill(colorOf(n));
      // Fret between pockets.
      pockets.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1).lineTo(Math.cos(a0) * (r2 - 34), Math.sin(a0) * (r2 - 34)).stroke({ color: COLORS.brass, width: 2 });
    });
    pockets.circle(0, 0, r2).stroke({ color: COLORS.brass, width: 3 });
    pockets.circle(0, 0, r2 - 34).stroke({ color: COLORS.brass, width: 2 });
    pockets.circle(0, 0, r1).stroke({ color: COLORS.brass, width: 3 });
    w.addChild(pockets);
    ORDER.forEach((n, k) => {
      const a = k * step - Math.PI / 2;
      const t = new Text({ text: String(n), style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xfff6e6 } });
      t.anchor.set(0.5);
      t.position.set(Math.cos(a) * (r2 - 17), Math.sin(a) * (r2 - 17));
      t.rotation = a + Math.PI / 2;
      w.addChild(t);
    });
    // Cone and turret.
    const cone = new Graphics();
    cone.circle(0, 0, r1 - 2).fill(0x5a2e16);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      cone.moveTo(0, 0).lineTo(Math.cos(a) * 70, Math.sin(a) * 70).stroke({ color: COLORS.brass, width: 8, cap: 'round' });
      cone.circle(Math.cos(a) * 72, Math.sin(a) * 72, 9).fill(COLORS.brass);
    }
    cone.circle(0, 0, 26).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 3 });
    cone.circle(-6, -6, 8).fill({ color: 0xffffff, alpha: 0.5 });
    cone.circle(0, 0, r1 - 2).stroke({ color: 0x000000, width: 6, alpha: 0.25 });
    w.addChild(cone);
    g.addChild(w);

    // Ball.
    this.ballShadow.circle(3, 4, 9).fill({ color: 0x000000, alpha: 0.45 });
    const b = new Graphics();
    b.circle(0, 0, 9).fill(0xf4f4f4);
    b.circle(-3, -3, 3.5).fill(0xffffff);
    this.ball.addChild(this.ballShadow, b);
    g.addChild(this.ball);

    // Result readout under the wheel.
    this.resultText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 40, fill: 0xfff6e6, stroke: { color: COLORS.ink, width: 6 } } });
    this.resultText.anchor.set(0.5);
    this.resultText.position.set(cx, cx);
    this.resultText.alpha = 0;
    g.addChild(this.resultText);
    this.ballAngle = Math.random() * Math.PI * 2;
  }

  private pocketAngle(n: number) {
    return ORDER.indexOf(n) * ((Math.PI * 2) / 37);
  }

  private placeBall(absAngle: number, radius: number) {
    const cx = WHEEL_SIZE / 2;
    const a = absAngle - Math.PI / 2;
    this.ball.position.set(cx + Math.cos(a) * radius, cx + Math.sin(a) * radius);
  }

  // ---- Board ------------------------------------------------------------

  private buildBoard() {
    const g = this.boardGroup;
    const felt = new Graphics();
    felt.roundRect(-20, -64, BOARD_W + 40, BOARD_H + CONTROLS_H + 84, 26).fill(COLORS.feltDark).stroke({ color: 0x4a2414, width: 12 });
    felt.roundRect(-20, -64, BOARD_W + 40, BOARD_H + CONTROLS_H + 84, 26).stroke({ color: COLORS.brass, width: 2, alpha: 0.6 });
    g.addChild(felt);
    g.addChild(this.historyLayer);
    const histLabel = label('LETZTE ZAHLEN', 15, 0x9fc9b8);
    histLabel.position.set(0, -52);
    g.addChild(histLabel);

    const lines = new Graphics();
    const cell = (key: BetKey, x: number, y: number, w: number, h: number, text: string, fill?: number, size = 22) => {
      this.cells.set(key, { x, y, w, h });
      const bg = new Graphics().rect(x, y, w, h).fill(fill ?? COLORS.felt);
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bg.on('pointertap', () => this.addBet(key));
      bg.on('pointerover', () => (bg.alpha = 0.82));
      bg.on('pointerout', () => (bg.alpha = 1));
      g.addChild(bg);
      lines.rect(x, y, w, h).stroke({ color: 0xfff6e6, width: 2, alpha: 0.85 });
      const t = new Text({ text, style: { fontFamily: size > 18 ? FONT_DISPLAY : FONT_BODY, fontSize: size, fontWeight: '700', fill: 0xfff6e6 } });
      t.anchor.set(0.5);
      t.position.set(x + w / 2, y + h / 2);
      t.eventMode = 'none';
      g.addChild(t);
    };
    cell('n:0', 0, 0, CW, CH * 3, '0', COLORS.felt);
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) {
        const n = 3 * c + (3 - r);
        cell(`n:${n}`, CW * (c + 1), CH * r, CW, CH, String(n), colorOf(n));
      }
    }
    for (let r = 0; r < 3; r++) cell(`col:${2 - r}`, CW * 13, CH * r, CW, CH, '2:1', COLORS.felt, 18);
    const dz = ['1. 12', '2. 12', '3. 12'];
    for (let d = 0; d < 3; d++) cell(`dozen:${d}`, CW + d * CW * 4, CH * 3, CW * 4, 56, dz[d], COLORS.felt, 20);
    const outs: [BetKey, string, number?][] = [
      ['low', '1–18'],
      ['even', 'GERADE'],
      ['red', 'ROT', COLORS.red],
      ['black', 'SCHWARZ', COLORS.black],
      ['odd', 'UNGERADE'],
      ['high', '19–36'],
    ];
    outs.forEach(([k, t, f], i) => cell(k, CW + i * CW * 2, CH * 3 + 56, CW * 2, 56, t, f, 17));
    g.addChild(lines, this.highlight, this.chipLayer);

    // Controls.
    const cy = BOARD_H + 58;
    this.chips.forEach((v, i) => {
      const chip = drawChip(CHIPS[i], 26);
      const t = new Text({ text: short(v), style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xfff6e6 } });
      t.anchor.set(0.5);
      chip.addChild(t);
      chip.position.set(40 + i * 66, cy);
      chip.eventMode = 'static';
      chip.cursor = 'pointer';
      chip.on('pointertap', () => {
        this.chipValue = v;
        this.ctx.sfx.chip();
        this.updateChipButtons();
      });
      this.chipButtons.push(chip);
      g.addChild(chip);
    });
    this.totalText = label('', 22, 0xfff6e6);
    this.totalText.position.set(0, cy + 42);
    g.addChild(this.totalText);
    const edge = label(`Hausvorteil ${(HOUSE_EDGE * 100).toFixed(1).replace('.', ',')} % · Volltreffer zahlt 35:1`, 16, 0x9fc9b8);
    edge.position.set(0, cy + 72);
    g.addChild(edge);

    this.clearBtn = button({ label: 'Einsatz weg', width: 140, height: 48, color: 0x3a2a30, textColor: 0xfff6e6, fontSize: 20, display: false, onClick: () => this.clearBets() });
    this.clearBtn.position.set(BOARD_W - 400, cy);
    this.repeatBtn = button({ label: 'Wiederholen', width: 140, height: 48, color: 0x3a2a30, textColor: 0xfff6e6, fontSize: 20, display: false, onClick: () => this.repeatBets() });
    this.repeatBtn.position.set(BOARD_W - 250, cy);
    this.spinBtn = button({ label: 'DREHEN', width: 150, height: 64, color: COLORS.brass, fontSize: 26, onClick: () => void this.spin() });
    this.spinBtn.position.set(BOARD_W - 80, cy);
    g.addChild(this.clearBtn, this.repeatBtn, this.spinBtn);
    this.updateChipButtons();
    this.refreshBets();
  }

  private updateChipButtons() {
    this.chipButtons.forEach((c, i) => {
      const sel = this.chips[i] === this.chipValue;
      void tween(c, { y: BOARD_H + 58 - (sel ? 10 : 0) }, 180, ease.outBack);
      let ring = c.getChildByLabel('sel') as Graphics | null;
      if (!ring) {
        ring = new Graphics().circle(0, 0, 33).stroke({ color: COLORS.lamp, width: 6, alpha: 0.22 }).circle(0, 0, 30).stroke({ color: COLORS.lamp, width: 2.5 });
        ring.label = 'sel';
        c.addChildAt(ring, 0);
      }
      ring.visible = sel;
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

  private refreshBets(popKey?: BetKey) {
    this.chipLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const [key, amount] of this.bets) {
      const cell = this.cells.get(key)!;
      const tier = Math.max(0, this.chips.filter((v) => amount >= v).length - 1);
      const chip = drawChip(CHIPS[tier], 19);
      const t = new Text({ text: short(amount), style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: 0xfff6e6 } });
      t.anchor.set(0.5);
      chip.addChild(t);
      chip.position.set(cell.x + cell.w / 2, cell.y + cell.h / 2);
      chip.label = key;
      this.chipLayer.addChild(chip);
      if (key === popKey) {
        chip.scale.set(1.6);
        chip.alpha = 0;
        void tween(chip, { alpha: 1 }, 120);
        void tween(chip.scale, { x: 1, y: 1 }, 260, ease.outBack);
      }
    }
    const total = this.totalBet;
    this.totalText.text = total > 0 ? `Einsatz: ${formatChips(total)}` : `Chip wählen, dann auf das Feld tippen (ab ${this.minBet})`;
    this.spinBtn.setEnabled(!this.spinning && total >= this.minBet);
    this.clearBtn.setEnabled(!this.spinning && total > 0);
    this.repeatBtn.setEnabled(!this.spinning && this.lastBets.size > 0);
  }

  private refreshHistory() {
    this.historyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.history.slice(0, 12).forEach((n, i) => {
      const c = new Container();
      c.addChild(new Graphics().circle(0, 0, 15).fill(colorOf(n)).stroke({ color: 0xfff6e6, width: 1.5, alpha: 0.6 }));
      const t = new Text({ text: String(n), style: { fontFamily: FONT_DISPLAY, fontSize: 13, fill: 0xfff6e6 } });
      t.anchor.set(0.5);
      c.addChild(t);
      c.position.set(150 + i * 36, -42);
      if (i > 0) c.alpha = 0.75;
      this.historyLayer.addChild(c);
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
    this.refreshBets();
    void tween(this.resultText, { alpha: 0 }, 200);

    const result = Math.floor(Math.random() * 37);
    const T = 5600;
    this.ctx.sfx.whoosh();
    this.ctx.sfx.ballRoll(T / 1000 * 0.75);
    this.wheelSpeed = 1.4;
    this.ballResting = false;
    const start = this.ballAngle;
    const target = this.pocketAngle(result);
    // Ball runs against the wheel for several laps, then settles into the pocket.
    let end = target;
    while (end > start - Math.PI * 2 * 7) end -= Math.PI * 2;
    const bounceStart = 0.58;
    const bounceEnd = 0.86;
    let bounced = 0;
    await animate(T, (t) => {
      const e = 1 - Math.pow(1 - t, 2.6);
      let jitter = 0;
      let r = R - 4;
      if (t > bounceStart) {
        const s = Math.min(1, (t - bounceStart) / (bounceEnd - bounceStart));
        const hop = Math.abs(Math.sin(s * Math.PI * 4)) * 22 * (1 - s);
        r = R - 4 + (168 - (R - 4)) * ease.inOutCubic(s) + hop;
        jitter = Math.sin(s * 40) * 0.04 * (1 - s);
        const nb = Math.floor(s * 4);
        if (nb > bounced && s < 1) {
          bounced = nb;
          this.ctx.sfx.tick();
        }
      }
      this.ballAngle = start + (end - start) * e + jitter;
      this.ballRadius = r;
    });
    this.ballAngle = target;
    this.ballRadius = 168;
    this.ballResting = true;
    this.ctx.sfx.thud();
    this.history.unshift(result);
    this.refreshHistory();
    await this.settle(result);
    this.spinning = false;
    this.refreshBets();
  }

  private async settle(n: number) {
    // Show the number.
    this.resultText.text = String(n);
    this.resultText.style.fill = n === 0 ? 0x5ff0b0 : REDS.has(n) ? 0xff6a7d : 0xfff6e6;
    this.resultText.scale.set(0.3);
    void tween(this.resultText, { alpha: 1 }, 200);
    void tween(this.resultText.scale, { x: 1.2, y: 1.2 }, 500, ease.outElastic);

    // Highlight the winning number on the board.
    const c = this.cells.get(`n:${n}`)!;
    this.highlight.clear().rect(c.x + 2, c.y + 2, c.w - 4, c.h - 4).stroke({ color: COLORS.lamp, width: 5 });
    this.highlight.filters = [sharedGlow(COLORS.lamp, 14)];

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

    // Losing chips slide off towards the wheel, winners pulse.
    const toScreen = (x: number, y: number) => this.boardGroup.toGlobal({ x, y });
    for (const chip of [...this.chipLayer.children]) {
      const key = chip.label as BetKey;
      if (winners.includes(key)) {
        chip.addChildAt(new Graphics().circle(0, 0, 24).stroke({ color: COLORS.lamp, width: 6, alpha: 0.25 }).circle(0, 0, 21.5).stroke({ color: COLORS.lamp, width: 2.5 }), 0);
        void tween(chip.scale, { x: 1.3, y: 1.3 }, 300, ease.outBack);
      } else {
        void tween(chip, { alpha: 0, y: chip.y - 40 }, 500, ease.inCubic, 300);
      }
    }

    if (payout > 0) {
      this.ctx.state.payout(payout);
      const pos = toScreen(c.x + c.w / 2, c.y + c.h / 2);
      for (const key of winners) {
        const cell = this.cells.get(key)!;
        const p = toScreen(cell.x + cell.w / 2, cell.y + cell.h / 2);
        this.ctx.particles.coinBurst(p.x, p.y, bestMult >= 35 ? 30 : 10);
        this.ctx.particles.sparkle(p.x, p.y, 10);
      }
      const total = this.totalBet;
      const local = this.view.toLocal(pos);
      floatText(this.view, local.x, local.y - 30, `+${formatChips(payout)}`, COLORS.lamp, 40);
      // Moths rise from the winning field and circle the wheel.
      const wheelCentre = this.wheel.getGlobalPosition();
      const wheelR = (R + 30) * this.wheelGroup.scale.x;
      this.ctx.celebrate(payout / total, pos.x, pos.y, { x: wheelCentre.x, y: wheelCentre.y, r: wheelR });
      for (let i = 0; i < Math.min(12, winners.length * 4); i++) this.ctx.sfx.coin(i * 0.06);
    } else {
      this.ctx.sfx.lose();
    }
    await wait(1600);
    this.bets.clear();
  }

  // ---- Frame ------------------------------------------------------------

  resize(w: number, h: number) {
    const boardTotalH = BOARD_H + CONTROLS_H + 84;
    const boardTotalW = BOARD_W + 40;
    if (w / h > 1.25) {
      const totalW = WHEEL_SIZE + 40 + boardTotalW;
      const totalH = Math.max(WHEEL_SIZE, boardTotalH);
      const s = Math.min((w * 0.95) / totalW, (h * 0.86) / totalH);
      const ox = (w - totalW * s) / 2;
      const oy = (h - totalH * s) / 2 + 20;
      this.wheelGroup.scale.set(s);
      this.wheelGroup.position.set(ox, oy + ((totalH - WHEEL_SIZE) / 2) * s);
      this.boardGroup.scale.set(s);
      this.boardGroup.position.set(ox + (WHEEL_SIZE + 60) * s, oy + ((totalH - boardTotalH) / 2 + 64) * s);
    } else {
      const totalW = Math.max(WHEEL_SIZE, boardTotalW);
      const totalH = WHEEL_SIZE * 0.8 + 20 + boardTotalH;
      const s = Math.min((w * 0.96) / totalW, (h * 0.88) / totalH);
      const ox = (w - totalW * s) / 2;
      const oy = (h - totalH * s) / 2 + 24;
      this.wheelGroup.scale.set(s * 0.8);
      this.wheelGroup.position.set((w - WHEEL_SIZE * s * 0.8) / 2, oy);
      this.boardGroup.scale.set(s);
      this.boardGroup.position.set(ox + 20 * s, oy + (WHEEL_SIZE * 0.8 + 20 + 64) * s);
    }
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    // Wheel eases back to its idle speed.
    this.wheelSpeed += (0.25 - this.wheelSpeed) * Math.min(1, dt * 0.35);
    this.wheel.rotation += this.wheelSpeed * dt;
    const abs = this.wheel.rotation + this.ballAngle;
    this.placeBall(abs, this.ballRadius);
    this.ballShadow.alpha = this.ballResting ? 0.6 : 1;
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
