// "Mottenfall": a glowing moth drops through lantern pegs into multiplier buckets.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, floatText, glowTexture, gradientTexture, mothTexture } from '../../core/fx';
import { animate, ease, tween } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';

// ---- Rules -------------------------------------------------------------

const ROWS = 12;
type Risk = 'low' | 'mid' | 'high';
const RISK_LABEL: Record<Risk, string> = { low: 'Ruhig', mid: 'Mittel', high: 'Wild' };
const HALF: Record<Risk, number[]> = {
  low: [8, 3, 1.5, 1.2, 1.1, 0.9, 0.6],
  mid: [30, 10, 4, 2, 1.1, 0.5, 0.3],
  high: [150, 24, 7, 2, 0.7, 0.2, 0.2],
};
const TABLE: Record<Risk, number[]> = {
  low: [...HALF.low, ...HALF.low.slice(0, 6).reverse()],
  mid: [...HALF.mid, ...HALF.mid.slice(0, 6).reverse()],
  high: [...HALF.high, ...HALF.high.slice(0, 6).reverse()],
};

function binom(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
const PROB = Array.from({ length: ROWS + 1 }, (_, k) => binom(ROWS, k) / 2 ** ROWS);

export function returnToPlayer(risk: Risk) {
  return TABLE[risk].reduce((s, m, i) => s + m * PROB[i], 0);
}

const fmtMult = (m: number) => (m >= 10 ? String(m) : String(m).replace('.', ','));

// ---- Layout -------------------------------------------------------------

const W = 640;
const H = 900;
const DX = 42;
const DY = 42;
const TOP = 150;
const CX = W / 2;
const BUCKET_Y = TOP + ROWS * DY + 8;
const BETS = [10, 20, 50, 100, 250];

function bucketColor(m: number) {
  if (m >= 20) return 0xff5fa2;
  if (m >= 5) return 0xffa94a;
  if (m >= 1.5) return 0xffcf7a;
  if (m >= 1) return 0xb69a6a;
  return 0x5a4a5a;
}

interface Peg {
  g: Graphics;
  heat: number;
}

class PlinkoGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private pegs: Peg[][] = [];
  private buckets: { c: Container; bg: Graphics; text: Text }[] = [];
  private ballLayer = new Container();
  private risk: Risk = 'mid';
  private betIndex = 0;
  private inFlight = 0;
  private betText!: Text;
  private rtpText!: Text;
  private riskButtons: Button[] = [];
  private minus!: Button;
  private plus!: Button;
  private time = 0;
  private history: { m: number; c: Container }[] = [];
  private historyLayer = new Container();
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.drop();
    }
  };

  constructor(private ctx: GameContext) {
    this.build();
    window.addEventListener('keydown', this.keyHandler);
  }

  private get bet() {
    return BETS[this.betIndex];
  }

  private build() {
    const b = this.board;
    this.view.addChild(b);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(CX, H / 2);
    halo.width = W * 2;
    halo.height = H * 1.5;
    halo.tint = COLORS.lamp;
    halo.alpha = 0.22;
    halo.blendMode = 'add';
    b.addChild(halo);

    // Velvet board with a brass frame.
    b.addChild(new Graphics().roundRect(8, 16, W, H, 36).fill({ color: 0x000000, alpha: 0.5 }));
    const velvet = new Sprite(gradientTexture('plinko-velvet', W, H, [[0, '#3a1030'], [1, '#14060f']]));
    const mask = new Graphics().roundRect(0, 0, W, H, 36).fill(0xffffff);
    velvet.mask = mask;
    b.addChild(velvet, mask);
    b.addChild(new Graphics().roundRect(0, 0, W, H, 36).stroke({ color: COLORS.brass, width: 6 }));

    const title = glowText('MOTTENFALL', { fontFamily: FONT_DISPLAY, fontSize: 46, fill: 0xfff6e6, letterSpacing: 4 }, { color: COLORS.lamp, distance: 16, outerStrength: 2.5 });
    title.position.set(CX, 52);
    b.addChild(title);
    this.historyLayer.position.set(CX, 104);
    b.addChild(this.historyLayer);

    // Lantern pegs.
    for (let r = 0; r < ROWS; r++) {
      const row: Peg[] = [];
      for (let j = 0; j < r + 3; j++) {
        const x = CX + (j - (r + 2) / 2) * DX;
        const y = TOP + r * DY;
        const g = new Graphics();
        g.circle(0, 0, 7).fill(0x9a6a1c);
        g.circle(0, 0, 4.5).fill(0xffe7a8);
        g.position.set(x, y);
        b.addChild(g);
        row.push({ g, heat: 0 });
      }
      this.pegs.push(row);
    }

    // Buckets.
    const bucketW = DX - 4;
    for (let k = 0; k <= ROWS; k++) {
      const x = CX + (k - ROWS / 2) * DX;
      const c = new Container();
      c.position.set(x, BUCKET_Y + 18);
      const bg = new Graphics();
      const text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 13, fill: 0x14080f } });
      text.anchor.set(0.5);
      c.addChild(bg, text);
      b.addChild(c);
      this.buckets.push({ c, bg, text });
      void bucketW;
    }
    b.addChild(this.ballLayer);

    // Controls.
    const cy = BUCKET_Y + 92;
    const riskLabel = label('RISIKO', 14, 0xb69a6a);
    riskLabel.position.set(40, cy - 50);
    b.addChild(riskLabel);
    (['low', 'mid', 'high'] as Risk[]).forEach((r, i) => {
      const btn = button({
        label: RISK_LABEL[r],
        width: 88,
        height: 40,
        color: 0x3a2a30,
        textColor: 0xfff6e6,
        fontSize: 18,
        display: false,
        onClick: () => this.setRisk(r),
      });
      btn.position.set(84 + i * 106, cy - 6);
      this.riskButtons.push(btn);
      b.addChild(btn);
    });
    const betLabel = label('EINSATZ', 14, 0xb69a6a);
    betLabel.position.set(40, cy + 30);
    b.addChild(betLabel);
    this.minus = button({ label: '–', width: 44, height: 44, onClick: () => this.changeBet(-1) });
    this.minus.position.set(62, cy + 74);
    this.plus = button({ label: '+', width: 44, height: 44, onClick: () => this.changeBet(1) });
    this.plus.position.set(236, cy + 74);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.betText.position.set(149, cy + 74);
    b.addChild(this.minus, this.plus, this.betText);

    const dropBtn = button({ label: 'LOSLASSEN', width: 230, height: 84, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 28, onClick: () => this.drop() });
    dropBtn.position.set(W - 160, cy + 34);
    b.addChild(dropBtn);
    this.rtpText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 16, fill: 0xd9c6a0 } });
    this.rtpText.anchor.set(0.5);
    this.rtpText.position.set(W - 160, cy + 96);
    b.addChild(this.rtpText);

    this.setRisk('mid');
    this.changeBet(0);
  }

  private setRisk(r: Risk) {
    if (this.inFlight > 0) {
      this.ctx.toast('Warte, bis alle Motten gelandet sind.');
      return;
    }
    this.risk = r;
    this.riskButtons.forEach((btn, i) => {
      const on = (['low', 'mid', 'high'] as Risk[])[i] === r;
      btn.setSelected(on);
      btn.alpha = on ? 1 : 0.7;
    });
    const table = TABLE[r];
    const bw = DX - 4;
    this.buckets.forEach((bk, k) => {
      const m = table[k];
      bk.bg.clear().roundRect(-bw / 2, -16, bw, 32, 7).fill(bucketColor(m));
      bk.bg.roundRect(-bw / 2, -16, bw, 10, 5).fill({ color: 0xffffff, alpha: 0.25 });
      bk.text.text = `${fmtMult(m)}×`;
      bk.text.style.fontSize = m >= 100 ? 11 : 13;
      bk.text.style.fill = m < 1 ? 0xd9c6a0 : 0x14080f;
      bk.c.scale.set(0.6);
      void tween(bk.c.scale, { x: 1, y: 1 }, 300 + k * 20, ease.outBack);
    });
    const rtp = returnToPlayer(r);
    this.rtpText.text = `Auszahlungsquote ${(rtp * 100).toFixed(1).replace('.', ',')} % · Hausvorteil ${((1 - rtp) * 100).toFixed(1).replace('.', ',')} %`;
  }

  private changeBet(d: number) {
    this.betIndex = Math.max(0, Math.min(BETS.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.minus.setEnabled(this.betIndex > 0);
    this.plus.setEnabled(this.betIndex < BETS.length - 1);
  }

  /** Drops one moth. Several can fall at the same time. */
  drop() {
    if (this.inFlight >= 8) return;
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.ctx.sfx.whoosh();
    // Decide the whole path now: one left/right choice per row.
    const path = Array.from({ length: ROWS }, () => (Math.random() < 0.5 ? 0 : 1));
    void this.fly(path, bet, this.risk);
  }

  private async fly(path: number[], bet: number, risk: Risk) {
    this.inFlight++;
    const ball = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 60;
    glow.tint = COLORS.lamp;
    glow.blendMode = 'add';
    const moth = new Sprite(mothTexture());
    moth.anchor.set(0.5);
    moth.width = moth.height = 30;
    moth.tint = 0xfff1c4;
    ball.addChild(glow, moth);
    this.ballLayer.addChild(ball);
    const trail: Graphics[] = [];

    let x = CX + (Math.random() - 0.5) * 6;
    let y = TOP - 70;
    ball.position.set(x, y);
    // Fall onto the top peg.
    await animate(260, (k) => ball.position.set(x, y + (TOP - 14 - y) * k), ease.inCubic);
    let rights = 0;
    for (let r = 0; r < ROWS; r++) {
      // Hit the peg in row r.
      const pegIndex = rights + 1;
      this.hitPeg(r, pegIndex);
      const dir = path[r];
      rights += dir;
      const nx = CX + (2 * rights - (r + 1)) * (DX / 2);
      const ny = r < ROWS - 1 ? TOP + (r + 1) * DY - 14 : BUCKET_Y + 4;
      const sx = ball.x;
      const sy = ball.y;
      const hop = 10 + Math.random() * 8;
      const dur = 115 + Math.random() * 30;
      await animate(dur, (k) => {
        ball.x = sx + (nx - sx) * k;
        ball.y = sy + (ny - sy) * k * k - hop * 4 * k * (1 - k);
        moth.rotation = (dir ? 1 : -1) * 0.5 * Math.sin(k * Math.PI);
        moth.scale.x = (30 / moth.texture.width) * (0.45 + 0.55 * Math.abs(Math.cos(k * Math.PI * 2)));
      });
      // Light trail dot.
      const dot = new Graphics().circle(ball.x, ball.y, 4).fill({ color: COLORS.lamp, alpha: 0.6 });
      this.ballLayer.addChildAt(dot, 0);
      trail.push(dot);
      void tween(dot, { alpha: 0 }, 500).then(() => dot.destroy());
    }
    // Landed.
    const k = rights;
    const m = TABLE[risk][k];
    const bk = this.buckets[k];
    void tween(bk.c, { y: BUCKET_Y + 26 }, 90).then(() => tween(bk.c, { y: BUCKET_Y + 18 }, 260, ease.outBack));
    bk.c.scale.set(1.25);
    void tween(bk.c.scale, { x: 1, y: 1 }, 400, ease.outBack);
    ball.destroy({ children: true });
    this.ctx.sfx.bucket(m);
    this.inFlight--;
    const win = Math.round(bet * m);
    this.addHistory(m);
    const screen = this.board.toGlobal({ x: bk.c.x, y: BUCKET_Y });
    const local = this.view.toLocal(screen);
    if (win > 0) this.ctx.state.payout(win);
    if (m > 1) {
      floatText(this.view, local.x, local.y - 40, `+${formatChips(win)}`, COLORS.lamp, 30);
      // Big wins: the moth bursts into light and the board lights up bottom to top.
      if (m >= 10) this.lightUpBoard();
      const centre = this.board.toGlobal({ x: CX, y: TOP + (ROWS * DY) / 2 });
      this.ctx.celebrate(m, screen.x, screen.y, { x: centre.x, y: centre.y, r: 200 * this.board.scale.x });
    } else {
      this.ctx.particles.sparkle(screen.x, screen.y, 6, 0xb69a6a, 60);
      if (m >= 0.5) this.ctx.sfx.partial();
      else this.ctx.sfx.lose();
      if (win > 0) floatText(this.view, local.x, local.y - 30, `${formatChips(win)} zurück`, 0xd9c6a0, 22);
    }
  }

  private hitPeg(r: number, j: number) {
    const peg = this.pegs[r]?.[j];
    if (!peg) return;
    peg.heat = 1;
    this.ctx.sfx.pegTick(r);
  }

  private lightUpBoard() {
    for (let r = ROWS - 1; r >= 0; r--) {
      setTimeout(() => this.pegs[r].forEach((p) => (p.heat = 1)), (ROWS - 1 - r) * 40);
    }
  }

  private addHistory(m: number) {
    const c = new Container();
    const g = new Graphics().roundRect(-24, -13, 48, 26, 8).fill(bucketColor(m));
    const t = new Text({ text: `${fmtMult(m)}×`, style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: m < 1 ? 0xd9c6a0 : 0x14080f } });
    t.anchor.set(0.5);
    c.addChild(g, t);
    this.historyLayer.addChild(c);
    this.history.unshift({ m, c });
    if (this.history.length > 9) this.history.pop()!.c.destroy({ children: true });
    this.history.forEach((h, i) => {
      h.c.alpha = i === 0 ? 1 : 0.7;
      void tween(h.c, { x: (i - 4) * 54 * -1 - 0 }, 200);
    });
    c.x = 4 * 54 + 54;
    c.scale.set(0.3);
    void tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  resize(w: number, h: number) {
    const s = Math.min((w * 0.95) / W, (h * 0.94) / H);
    this.board.scale.set(s);
    this.board.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const cool = dtMs / 450;
    for (const row of this.pegs)
      for (const p of row) {
        if (p.heat <= 0) continue;
        p.heat = Math.max(0, p.heat - cool);
        p.g.scale.set(1 + p.heat * 0.6);
        p.g.alpha = 0.85 + p.heat * 0.15;
      }
  }

  busy() {
    return this.inFlight > 0;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

function drawStation() {
  const c = new Container();
  const g = new Graphics();
  // Upright board seen from above: a tall triangle of lights.
  g.roundRect(4, 8, 76, 64, 10).fill({ color: 0x000000, alpha: 0.4 });
  g.roundRect(0, 0, 76, 64, 10).fill(0x3a1030).stroke({ color: COLORS.brass, width: 2 });
  for (let r = 0; r < 5; r++) for (let j = 0; j <= r; j++) g.circle(38 + (j - r / 2) * 11, 10 + r * 9, 2.2).fill(0xffe7a8);
  for (let k = 0; k < 6; k++) g.rect(8 + k * 10.5, 54, 9, 6).fill(k === 0 || k === 5 ? 0xff5fa2 : 0xffcf7a);
  g.circle(38, 82, 8).fill(0x3a2230).stroke({ color: COLORS.brassDark, width: 2 });
  c.addChild(g);
  const lamp = new Graphics().circle(38, 10, 5).fill(COLORS.lamp);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const plinko: GameDefinition = {
  id: 'plinko',
  name: 'Mottenfall',
  houseEdge: 1 - returnToPlayer('mid'),
  footprint: { w: 76, h: 64 },
  drawStation,
  create: (ctx) => new PlinkoGame(ctx),
};
