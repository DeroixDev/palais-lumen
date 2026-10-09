// "Mottenfall": a glowing moth drops through lantern pegs into multiplier buckets.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, floatText, glowTexture, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { paintMoth } from '../slots/symbols';
import { lightWave, reducedMotion, winStage } from '../slots/stage';
import { ellipse, fillInk, glowAt, gold, grain, light, paint, rim, rrect, seeded, shadow, vgrad } from '../../world/painted/brush';
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
const H = 960;
const PAD = 28;
const DX = 42;
const DY = 42;
const TOP = 176;
const CX = W / 2;
const BUCKET_Y = TOP + ROWS * DY + 8;
const DECK_Y = BUCKET_Y + 62;
const BETS = [10, 20, 50, 100, 250];
const BUCKET_W = DX - 4;
const BUCKET_H = 40;

function bucketColor(m: number) {
  if (m >= 20) return 0xff5fa2;
  if (m >= 5) return 0xffa94a;
  if (m >= 1.5) return 0xffcf7a;
  if (m >= 1) return 0xb69a6a;
  return 0x5a4a5a;
}

// ---- Painted parts --------------------------------------------------------

const VELVET = 0x3a1030;

/** The cabinet: brass crown with the title arch, a deep night-glass playfield, the deck. */
function paintCabinet() {
  return paint(W + PAD * 2, H + PAD * 2, (c) => {
    c.translate(PAD, PAD);
    shadow(c, W / 2, H + 6, W * 0.55, 26, 0.7);
    // Crown arch.
    c.beginPath();
    c.moveTo(14, 150);
    c.lineTo(14, 70);
    c.quadraticCurveTo(W / 2, -40, W - 14, 70);
    c.lineTo(W - 14, 150);
    c.closePath();
    fillInk(c, gold(c, 0, 0, W * 0.6, 160), 5);
    rim(c, 0.7, 2.5);
    // Body.
    rrect(c, 0, 120, W, H - 120, 34);
    fillInk(c, vgrad(c, 120, H, 0x5a1a4a, 0.2, 0.55), 5);
    const side = c.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(255,240,220,0.15)');
    side.addColorStop(0.1, 'rgba(255,240,220,0)');
    side.addColorStop(0.88, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.38)');
    rrect(c, 0, 120, W, H - 120, 34);
    c.fillStyle = side;
    c.fill();
    grain(c, 6, 126, W - 12, H - 132, 260, 3, 0.05);
    rrect(c, 9, 129, W - 18, H - 138, 27);
    c.strokeStyle = gold(c, 0, 120, W, H);
    c.lineWidth = 3;
    c.stroke();
    // Title panel in the arch.
    c.beginPath();
    c.moveTo(36, 140);
    c.lineTo(36, 80);
    c.quadraticCurveTo(W / 2, -16, W - 36, 80);
    c.lineTo(W - 36, 140);
    c.closePath();
    const mg = c.createLinearGradient(0, 30, 0, 140);
    mg.addColorStop(0, '#2a0a24');
    mg.addColorStop(1, '#140612');
    fillInk(c, mg, 4);
    c.save();
    c.clip();
    glowAt(c, W / 2, 90, 260, 70, 0xffcf7a, 0.4, 'lighter');
    c.restore();
    // Medallion.
    ellipse(c, W / 2, 6, 30, 26);
    fillInk(c, gold(c, W / 2 - 30, -20, W / 2 + 30, 32), 4);
    rim(c, 0.7, 2);
    ellipse(c, W / 2, 6, 21, 18);
    c.fillStyle = '#1a0818';
    c.fill();
    paintMoth(c, W / 2, 8, 40, { wing: 0xf0c868, wingDark: 0x9a6418, body: 0x5a3010, eye: 0xff5fa2 }, 1.6);
    // Playfield: night glass framed in brass.
    const fx = 28, fy = 150, fw = W - 56, fh = BUCKET_Y + BUCKET_H + 14 - fy;
    rrect(c, fx - 10, fy - 10, fw + 20, fh + 20, 26);
    fillInk(c, gold(c, fx, fy, fx + fw, fy + fh), 5);
    rim(c, 0.6, 2.5);
    rrect(c, fx, fy, fw, fh, 18);
    const pg = c.createLinearGradient(0, fy, 0, fy + fh);
    pg.addColorStop(0, '#120a2a');
    pg.addColorStop(0.6, '#2a0e36');
    pg.addColorStop(1, '#3a1030');
    fillInk(c, pg, 3);
    c.save();
    rrect(c, fx, fy, fw, fh, 18);
    c.clip();
    glowAt(c, W / 2, fy + 40, 260, 120, 0xffcf7a, 0.18, 'lighter');
    glowAt(c, W / 2, BUCKET_Y, 300, 90, 0xff5fa2, 0.14, 'lighter');
    // Stars.
    const r = seeded(17);
    for (let i = 0; i < 70; i++) {
      const x = fx + r() * fw;
      const y = fy + r() * fh * 0.85;
      ellipse(c, x, y, 0.8 + r() * 1.4, 0.8 + r() * 1.4);
      c.fillStyle = `rgba(255,240,210,${0.2 + r() * 0.4})`;
      c.fill();
    }
    // Faint triangle of light where the pegs stand.
    c.beginPath();
    c.moveTo(CX, TOP - 30);
    c.lineTo(CX + (ROWS / 2 + 1.6) * DX, BUCKET_Y - 10);
    c.lineTo(CX - (ROWS / 2 + 1.6) * DX, BUCKET_Y - 10);
    c.closePath();
    c.fillStyle = 'rgba(255,220,160,0.04)';
    c.fill();
    // Glass reflection.
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.beginPath();
    c.moveTo(fx, fy);
    c.lineTo(fx + fw * 0.35, fy);
    c.lineTo(fx + fw * 0.1, fy + fh);
    c.lineTo(fx, fy + fh);
    c.closePath();
    c.fill();
    c.restore();
    // Bucket rail.
    rrect(c, fx + 4, BUCKET_Y + BUCKET_H - 2, fw - 8, 10, 4);
    fillInk(c, gold(c, fx, BUCKET_Y, fx + fw, BUCKET_Y + 50), 2);
    // Drop chute at the top.
    rrect(c, CX - 26, fy - 14, 52, 26, 8);
    fillInk(c, gold(c, CX - 26, fy - 14, CX + 26, fy + 12), 3);
    rrect(c, CX - 15, fy - 6, 30, 14, 5);
    c.fillStyle = '#0a0410';
    c.fill();
    // Control deck.
    rrect(c, 22, DECK_Y, W - 44, H - DECK_Y - 22, 22);
    fillInk(c, gold(c, 22, DECK_Y, W - 22, H), 4);
    rim(c, 0.6, 2);
    rrect(c, 32, DECK_Y + 9, W - 64, H - DECK_Y - 40, 16);
    fillInk(c, vgrad(c, DECK_Y + 9, H - 31, VELVET, 0.12, 0.4), 2);
    grain(c, 32, DECK_Y + 9, W - 64, H - DECK_Y - 40, 90, 9, 0.05);
    // Recess behind the bet controls.
    rrect(c, 52, DECK_Y + 98, 250, 64, 32);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fill();
    c.strokeStyle = 'rgba(255,240,210,0.12)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = gold(c, 0, H - 10, W, H);
    rrect(c, 30, H - 10, W - 60, 6, 3);
    c.fill();
  });
}

/** Brass peg with a warm glass bead (lantern stud). */
function pegTexture() {
  return paint(20, 20, (c) => {
    ellipse(c, 10, 10, 7.5, 7.5);
    fillInk(c, gold(c, 3, 3, 17, 17), 1.8);
    ellipse(c, 10, 10, 4.2, 4.2);
    const g = c.createRadialGradient(9, 9, 0.5, 10, 10, 5);
    g.addColorStop(0, '#fffef0');
    g.addColorStop(0.6, '#ffe7a8');
    g.addColorStop(1, '#d8902a');
    c.fillStyle = g;
    c.fill();
    ellipse(c, 7.5, 7, 1.6, 1.2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill();
  }, 3);
}

/** A bucket cup: brass rim, glowing glass in the bucket's colour. */
const bucketTex = new Map<number, Texture>();
function bucketTexture(col: number) {
  let t = bucketTex.get(col);
  if (t) return t;
  t = paint(BUCKET_W + 8, BUCKET_H + 8, (c) => {
    c.translate(4, 4);
    c.beginPath();
    c.moveTo(0, 4);
    c.lineTo(BUCKET_W, 4);
    c.lineTo(BUCKET_W - 3, BUCKET_H - 6);
    c.quadraticCurveTo(BUCKET_W - 4, BUCKET_H, BUCKET_W - 10, BUCKET_H);
    c.lineTo(10, BUCKET_H);
    c.quadraticCurveTo(4, BUCKET_H, 3, BUCKET_H - 6);
    c.closePath();
    fillInk(c, vgrad(c, 4, BUCKET_H, col, 0.35, 0.4), 2.2);
    rim(c, 0.55, 1.5);
    glowAt(c, BUCKET_W / 2, BUCKET_H * 0.6, BUCKET_W * 0.5, BUCKET_H * 0.4, light(col, 0.5), 0.35, 'lighter');
    rrect(c, -1, 0, BUCKET_W + 2, 8, 3);
    fillInk(c, gold(c, 0, 0, BUCKET_W, 8), 1.6);
  }, 2);
  bucketTex.set(col, t);
  return t;
}

/** The glowing moth that falls. */
let ballTex: Texture | null = null;
function ballTexture() {
  ballTex ??= paint(64, 64, (c) => {
    glowAt(c, 32, 32, 30, 30, 0xfff1c4, 0.65, 'lighter');
    paintMoth(c, 32, 34, 50, { wing: 0xfff1c4, wingDark: 0xe0a848, body: 0x8a5a1a, eye: 0xff5fa2 }, 2);
  }, 2);
  return ballTex;
}

interface Peg {
  s: Sprite;
  glow: Sprite;
  heat: number;
}

class PlinkoGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private pegs: Peg[][] = [];
  private buckets: { c: Container; bg: Sprite; text: Text; glow: Sprite }[] = [];
  private ballLayer = new Container();
  private stageLayer = new Container();
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
  private calm = reducedMotion();
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.drop();
    }
  };

  /** Today's ladder: the day-1 bets scaled to today's stakes. */
  private bets: number[];

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
  }

  private get bet() {
    return this.bets[this.betIndex];
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
    halo.alpha = 0.2;
    halo.blendMode = 'add';
    b.addChild(halo);

    const body = new Sprite(paintCabinet());
    body.position.set(-PAD, -PAD);
    b.addChild(body);

    const title = glowText('MOTTENFALL', { fontFamily: FONT_DISPLAY, fontSize: 46, fill: 0xfff6e6, letterSpacing: 4 }, { color: COLORS.lamp, distance: 16, outerStrength: 2.4 });
    title.position.set(CX, 92);
    b.addChild(title);
    // History: a column of chips in the empty top-left corner of the playfield, newest on top.
    this.historyLayer.position.set(74, TOP + 8);

    // Lantern pegs: painted stud plus a glow that brightens when hit.
    const pegTex = pegTexture();
    for (let r = 0; r < ROWS; r++) {
      const row: Peg[] = [];
      for (let j = 0; j < r + 3; j++) {
        const x = CX + (j - (r + 2) / 2) * DX;
        const y = TOP + r * DY;
        const glow = new Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.position.set(x, y);
        glow.width = glow.height = 34;
        glow.tint = COLORS.lamp;
        glow.blendMode = 'add';
        glow.alpha = 0.18;
        const s = new Sprite(pegTex);
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.width = s.height = 17;
        b.addChild(glow, s);
        row.push({ s, glow, heat: 0 });
      }
      this.pegs.push(row);
    }

    // Buckets.
    for (let k = 0; k <= ROWS; k++) {
      const x = CX + (k - ROWS / 2) * DX;
      const c = new Container();
      c.position.set(x, BUCKET_Y + BUCKET_H / 2);
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = 70;
      glow.height = 90;
      glow.blendMode = 'add';
      glow.alpha = 0;
      const bg = new Sprite(bucketTexture(0xffcf7a));
      bg.anchor.set(0.5);
      const text = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 14, fill: 0x14080f } });
      text.anchor.set(0.5);
      text.y = 3;
      c.addChild(glow, bg, text);
      b.addChild(c);
      this.buckets.push({ c, bg, text, glow });
    }
    b.addChild(this.historyLayer, this.ballLayer);

    // Controls on the deck.
    const ry = DECK_Y + 60;
    const riskLabel = label('RISIKO', 18, 0xd9c6a0);
    riskLabel.anchor.set(0, 0.5);
    riskLabel.position.set(54, DECK_Y + 24);
    b.addChild(riskLabel);
    (['low', 'mid', 'high'] as Risk[]).forEach((r, i) => {
      const btn = button({
        label: RISK_LABEL[r],
        width: 80,
        height: 52,
        color: 0x4a2a3a,
        textColor: 0xfff6e6,
        fontSize: 24,
        display: false,
        onClick: () => this.setRisk(r),
      });
      btn.position.set(92 + i * 88, ry);
      this.riskButtons.push(btn);
      b.addChild(btn);
    });
    const by = DECK_Y + 130;
    this.minus = button({ label: '–', width: 56, height: 56, onClick: () => this.changeBet(-1) });
    this.minus.position.set(86, by);
    this.plus = button({ label: '+', width: 56, height: 56, onClick: () => this.changeBet(1) });
    this.plus.position.set(268, by);
    const betLabel = label('EINSATZ', 16, 0xd9c6a0);
    betLabel.anchor.set(0.5);
    betLabel.position.set(177, by - 17);
    this.betText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 27, fill: 0xfff6e6 } });
    this.betText.anchor.set(0.5);
    this.betText.position.set(177, by + 9);
    b.addChild(this.minus, this.plus, betLabel, this.betText);

    const dropBtn = button({ label: 'LOSLASSEN', width: 236, height: 96, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 28, onClick: () => this.drop() });
    dropBtn.position.set(W - 172, DECK_Y + 72);
    b.addChild(dropBtn);
    this.rtpText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '600', fill: 0xe6d6b4, align: 'center' } });
    this.rtpText.anchor.set(0.5);
    this.rtpText.position.set(W - 172, DECK_Y + 152);
    b.addChild(this.rtpText, this.stageLayer);

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
      btn.alpha = on ? 1 : 0.75;
    });
    const table = TABLE[r];
    this.buckets.forEach((bk, k) => {
      const m = table[k];
      const col = bucketColor(m);
      bk.bg.texture = bucketTexture(col);
      bk.glow.tint = col;
      bk.text.text = `${fmtMult(m)}×`;
      bk.text.style.fill = m < 1 ? 0xe6d6b4 : 0x14080f;
      bk.text.scale.set(1);
      if (bk.text.width > BUCKET_W - 4) bk.text.scale.set((BUCKET_W - 4) / bk.text.width);
      if (!this.calm) {
        bk.c.scale.set(0.6);
        void tween(bk.c.scale, { x: 1, y: 1 }, 300 + k * 20, ease.outBack);
      }
    });
    const rtp = returnToPlayer(r);
    this.rtpText.text = `Auszahlungsquote ${(rtp * 100).toFixed(1).replace('.', ',')} %\nHausvorteil ${((1 - rtp) * 100).toFixed(1).replace('.', ',')} %`;
  }

  private changeBet(d: number) {
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.betText.scale.set(Math.min(1, 116 / Math.max(1, this.betText.width / this.betText.scale.x)));
    this.minus.setEnabled(this.betIndex > 0);
    this.plus.setEnabled(this.betIndex < this.bets.length - 1);
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
    glow.width = glow.height = 70;
    glow.tint = COLORS.lamp;
    glow.blendMode = 'add';
    glow.alpha = 0.8;
    const moth = new Sprite(ballTexture());
    moth.anchor.set(0.5);
    const MS = 38;
    moth.width = moth.height = MS;
    ball.addChild(glow, moth);
    this.ballLayer.addChild(ball);

    let x = CX + (Math.random() - 0.5) * 6;
    let y = TOP - 48;
    ball.position.set(x, y);
    ball.scale.set(0.4);
    void tween(ball.scale, { x: 1, y: 1 }, 200, ease.outBack);
    // Fall onto the top peg.
    await animate(260, (k) => ball.position.set(x, y + (TOP - 16 - y) * k), ease.inCubic);
    let rights = 0;
    for (let r = 0; r < ROWS; r++) {
      // Hit the peg in row r.
      const pegIndex = rights + 1;
      this.hitPeg(r, pegIndex);
      const dir = path[r];
      rights += dir;
      const nx = CX + (2 * rights - (r + 1)) * (DX / 2);
      const ny = r < ROWS - 1 ? TOP + (r + 1) * DY - 16 : BUCKET_Y + 6;
      const sx = ball.x;
      const sy = ball.y;
      const hop = 10 + Math.random() * 8;
      const dur = 115 + Math.random() * 30;
      await animate(dur, (k) => {
        ball.x = sx + (nx - sx) * k;
        ball.y = sy + (ny - sy) * k * k - hop * 4 * k * (1 - k);
        moth.rotation = (dir ? 1 : -1) * 0.5 * Math.sin(k * Math.PI);
        moth.scale.x = (MS / moth.texture.width) * (0.45 + 0.55 * Math.abs(Math.cos(k * Math.PI * 2)));
      });
      // Light trail: a fading glow puff.
      if (!this.calm || r % 3 === 0) {
        const dot = new Sprite(glowTexture());
        dot.anchor.set(0.5);
        dot.position.set(ball.x, ball.y);
        dot.width = dot.height = 22;
        dot.tint = COLORS.lamp;
        dot.blendMode = 'add';
        dot.alpha = 0.7;
        this.ballLayer.addChildAt(dot, 0);
        void tween(dot, { alpha: 0 }, 500).then(() => dot.destroy());
      }
    }
    // Landed.
    const k = rights;
    const m = TABLE[risk][k];
    const bk = this.buckets[k];
    const by = BUCKET_Y + BUCKET_H / 2;
    void tween(bk.c, { y: by + 8 }, 90).then(() => tween(bk.c, { y: by }, 260, ease.outBack));
    bk.c.scale.set(1.25);
    void tween(bk.c.scale, { x: 1, y: 1 }, 400, ease.outBack);
    bk.glow.alpha = m > 1 ? 1 : 0.4;
    void tween(bk.glow, { alpha: 0 }, m > 1 ? 900 : 400);
    ball.destroy({ children: true });
    this.ctx.sfx.bucket(m);
    this.inFlight--;
    const win = Math.round(bet * m);
    this.addHistory(m);
    const screen = this.board.toGlobal({ x: bk.c.x, y: BUCKET_Y });
    const local = this.view.toLocal(screen);
    const fs = Math.max(0.75, this.board.scale.x);
    if (win > 0) this.ctx.state.payout(win);
    if (m > 1) {
      const centre = this.board.toGlobal({ x: CX, y: TOP + (ROWS * DY) / 2 });
      this.ctx.celebrate(m, screen.x, screen.y, { x: centre.x, y: centre.y, r: 200 * this.board.scale.x });
      const level = rewardLevel(m);
      if (level >= 3) {
        this.lightUpBoard();
        await winStage(this.stageLayer, {
          x: 28,
          y: 150,
          w: W - 56,
          h: BUCKET_Y - 160,
          title: level === 4 ? 'JACKPOT' : 'GROSSER GEWINN',
          sub: `×${fmtMult(m)} Einsatz`,
          amount: win,
          accent: level === 4 ? COLORS.lamp : COLORS.neon,
          durationMs: level === 4 ? 2500 : 2000,
          onTick: () => this.ctx.sfx.tick(),
        });
      } else {
        floatText(this.view, local.x, local.y - 40, `+${formatChips(win)}`, COLORS.lamp, Math.round(32 * fs));
        // Medium wins: the board lights up from the bottom and a light wave rolls down.
        if (level === 2) {
          this.lightUpBoard();
          void lightWave(this.ballLayer, 28, 150, W - 56, BUCKET_Y - 150, COLORS.lamp);
        }
      }
    } else {
      this.ctx.particles.sparkle(screen.x, screen.y, 6, 0xb69a6a, 60);
      if (m >= 0.5) this.ctx.sfx.partial();
      else this.ctx.sfx.lose();
      if (win > 0) floatText(this.view, local.x, local.y - 30, `${formatChips(win)} zurück`, 0xd9c6a0, Math.round(24 * fs));
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
      void wait((ROWS - 1 - r) * 40).then(() => this.pegs[r]?.forEach((p) => (p.heat = 1)));
    }
  }

  private addHistory(m: number) {
    const c = new Container();
    const col = bucketColor(m);
    const g = new Graphics();
    g.roundRect(-25, -14, 50, 28, 9).fill(0x160a14);
    g.roundRect(-23, -12, 46, 24, 7).fill(col);
    g.roundRect(-21, -11, 42, 8, 4).fill({ color: 0xffffff, alpha: 0.28 });
    const t = new Text({ text: `${fmtMult(m)}×`, style: { fontFamily: FONT_DISPLAY, fontSize: 13, fill: m < 1 ? 0xe6d6b4 : 0x14080f } });
    t.anchor.set(0.5);
    if (t.width > 42) t.scale.set(42 / t.width);
    c.addChild(g, t);
    this.historyLayer.addChild(c);
    this.history.unshift({ m, c });
    if (this.history.length > 8) this.history.pop()!.c.destroy({ children: true });
    this.history.forEach((h, i) => {
      h.c.alpha = i === 0 ? 1 : 0.65;
      void tween(h.c, { y: i * 33 }, 200);
    });
    c.y = -20;
    c.scale.set(0.3);
    void tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  resize(w: number, h: number) {
    const s = Math.min((w * 0.97) / W, (h * 0.95) / (H + PAD));
    this.board.scale.set(s);
    this.board.position.set((w - W * s) / 2, (h - H * s) / 2 + 8 * s);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const cool = dtMs / 450;
    for (const row of this.pegs)
      for (const p of row) {
        if (p.heat <= 0) continue;
        p.heat = Math.max(0, p.heat - cool);
        p.s.scale.set((17 / 20) * (1 + p.heat * 0.5));
        p.glow.alpha = 0.18 + p.heat * 0.82;
        p.glow.width = p.glow.height = 34 + p.heat * 26;
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
