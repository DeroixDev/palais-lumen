// "Glühwürmchen-Bingo": a quick bingo card (3×3 or 4×4) against fireflies released from a glass
// jar. Each firefly carries a number: it settles on the card when the number is there, otherwise
// in the tray below. Complete rows, columns and diagonals are lines; a fully lit card pays most.
// The draw is decided before the first firefly leaves the jar (rules.ts).
//
// Round report tags: 'bingo' (every round), 'line' (at least one line), 'full' (full card).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { winStage } from '../slots/stage';
import { BetStepper, DrawShell, MIN_FONT, fmtMult, infoKnob, rtpText, spaceKey } from '../drawKit';
import { MODES, cardLines, drawFireflies, newCard, returnToPlayer, scoreCard, type BingoMode, type CardSize } from './rules';
import { CARD, FIREFLY, JAR, bingoStation, cardGrid, cardTexture, fireflyTexture, gardenTexture, jarTexture, slotTexture } from './paint';
import { lineTexture } from '../keno/paint';

const SW = 720;
const SH = 600;
const BETS = [10, 20, 50, 100, 200, 500];
const JAR_X = 22;
const JAR_Y = 120;
const CARD_X = 280;
const CARD_Y = 92;
const TRAY_Y = 556;
const RULES =
  'Du bekommst eine Bingokarte mit 3×3 oder 4×4 Zahlen. Nach deinem Einsatz fliegen Glühwürmchen aus dem Glas – ' +
  'jedes trägt eine Zahl (3×3: 15 Glühwürmchen aus 1–36, 4×4: 20 aus 1–36). Steht die Zahl auf deiner Karte, setzt es sich darauf.\n\n' +
  'Volle Reihen, Spalten und Diagonalen sind Linien. Gezahlt wird der höchste erreichte Rang aus der Tabelle: ' +
  'eine Linie, mehrere Linien – oder die volle Karte. „Neue Karte“ mischt deine Zahlen neu; deine Chancen bleiben gleich.';

interface Cell {
  n: number;
  x: number;
  y: number;
  lit: Graphics;
  glow: Sprite;
  text: Text;
}

interface Bug {
  s: Sprite;
  bx: number;
  by: number;
  ph: number;
  sp: number;
}

class BingoGame implements GameInstance {
  view: Container;
  private shell: DrawShell;
  private size: CardSize = 3;
  private card: number[];
  private cells: Cell[] = [];
  private cardLayer = new Container();
  private lineLayer = new Container();
  /** Card numbers above the line glows, so a lit line never hides them. */
  private numLayer = new Container();
  private trayLayer = new Container();
  private flyLayer = new Container();
  private sitters = new Container();
  private jarBugs: Bug[] = [];
  private slots: { bg: Sprite; text: Text; x: number; w: number }[] = [];
  private running = false;
  private calm = reducedMotion();
  private time = 0;
  private bet: BetStepper;
  private header!: Text;
  private sub!: Text;
  private sizeBtns: Button[] = [];
  private fresh!: Button;
  private main!: Button;
  private rtp!: ReturnType<typeof rtpText>;
  private pay = new Container();
  private payRows: { key: string; hi: Graphics }[] = [];
  private tall = false;
  private deckW = 480;
  private unkey: () => void;

  constructor(private ctx: GameContext) {
    this.shell = new DrawShell({ sceneW: SW, sceneH: SH, deckWide: 480, deckTall: 500, velvet: 0x1a2a22, layout: (t, w) => this.layout(t, w) });
    this.view = this.shell.view;
    this.bet = new BetStepper(ctx, BETS, 300);
    this.card = newCard(this.mode);
    this.build();
    this.unkey = spaceKey(() => this.play());
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get mode(): BingoMode {
    return MODES[this.size];
  }

  // ---- Build ----------------------------------------------------------------------------------

  private build() {
    const sc = this.shell.scene;
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(SW / 2, SH / 2);
    halo.width = SW * 1.6;
    halo.height = SH * 1.4;
    halo.tint = FIREFLY;
    halo.alpha = 0.1;
    halo.blendMode = 'add';
    sc.addChild(halo, new Sprite(gardenTexture(SW, SH)));
    const title = new Text({ text: 'GLÜHWÜRMCHEN-BINGO', style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xf4ffd0, letterSpacing: 2, stroke: { color: 0x0a140e, width: 6 } } });
    title.anchor.set(0.5);
    title.position.set(SW / 2 + 24, 52);
    const tg = new Sprite(glowTexture());
    tg.anchor.set(0.5);
    tg.position.copyFrom(title.position);
    tg.width = 520;
    tg.height = 70;
    tg.tint = FIREFLY;
    tg.alpha = 0.3;
    tg.blendMode = 'add';
    sc.addChild(tg, title);

    // Jar with idle fireflies drifting inside.
    const jarGlow = new Sprite(glowTexture());
    jarGlow.anchor.set(0.5);
    jarGlow.position.set(JAR_X + JAR.w / 2, JAR_Y + JAR.h * 0.6);
    jarGlow.width = 300;
    jarGlow.height = 360;
    jarGlow.tint = FIREFLY;
    jarGlow.alpha = 0.22;
    jarGlow.blendMode = 'add';
    const jar = new Sprite(jarTexture());
    jar.position.set(JAR_X, JAR_Y);
    const bugs = new Container();
    sc.addChild(jarGlow, bugs, jar);
    for (let i = 0; i < 14; i++) {
      const s = new Sprite(fireflyTexture());
      s.anchor.set(0.5);
      s.width = s.height = 30;
      const bx = JAR_X + JAR.inner.x + 20 + Math.random() * (JAR.inner.w - 40);
      const by = JAR_Y + JAR.inner.y + 30 + Math.random() * (JAR.inner.h - 60);
      s.position.set(bx, by);
      bugs.addChild(s);
      this.jarBugs.push({ s, bx, by, ph: Math.random() * 7, sp: 0.6 + Math.random() * 0.8 });
    }

    this.cardLayer.position.set(CARD_X, CARD_Y);
    this.numLayer.position.set(CARD_X, CARD_Y);
    sc.addChild(this.cardLayer, this.lineLayer, this.numLayer, this.trayLayer, this.sitters, this.flyLayer);
    const info = infoKnob(() => this.shell.showRules(RULES));
    info.position.set(52, 52);
    sc.addChild(info);
    this.buildCard();

    // Deck.
    const d = this.shell.deck;
    this.header = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xf4ffd0, letterSpacing: 0.5 } });
    this.header.anchor.set(0, 0.5);
    this.sub = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '600', fill: 0xc9d6a0 } });
    this.sub.anchor.set(0, 0.5);
    ([3, 4] as CardSize[]).forEach((n) => {
      const b = button({
        label: `${n}×${n}`,
        ariaLabel: `Karte ${n} mal ${n}`,
        width: 104,
        height: 56,
        color: 0x2a4a32,
        textColor: 0xf4ffd0,
        fontSize: 26,
        onClick: () => this.setSize(n),
      });
      this.sizeBtns.push(b);
    });
    this.fresh = button({ label: 'Neue Karte', width: 184, height: 56, color: 0x4a2a3a, textColor: 0xfff6e6, fontSize: 26, display: false, onClick: () => this.newCard() });
    this.main = button({ label: 'FREILASSEN', width: 330, height: 72, color: FIREFLY, textColor: 0x14200a, fontSize: 28, onClick: () => this.play() });
    this.rtp = rtpText(returnToPlayer(this.mode), 420);
    d.addChild(this.header, this.sub, ...this.sizeBtns, this.fresh, this.pay, this.bet.view, this.main, this.rtp.text);
    this.setSize(3, true);
  }

  private layout(tall: boolean, w: number) {
    this.tall = tall;
    this.deckW = w;
    this.header.position.set(56, 48);
    this.sizeBtns[0].position.set(36 + 52, 104);
    this.sizeBtns[1].position.set(36 + 52 + 118, 104);
    this.fresh.position.set(w - 36 - 92, 104);
    this.sub.position.set(36, 156);
    if (tall) {
      this.pay.position.set(34, 186);
      this.rtp.text.position.set(w / 2, 376);
      this.bet.view.position.set(36, 440);
      this.main.position.set(w - 36 - 165, 440);
    } else {
      this.pay.position.set(30, 186);
      this.rtp.text.position.set(w / 2, 420);
      this.bet.view.position.set((w - 300) / 2, 482);
      this.main.position.set(w / 2, 548);
    }
    this.fit(this.header);
    this.buildPayTable();
  }

  private fit(t: Text) {
    const max = this.deckW - 110;
    t.scale.set(1);
    if (t.width > max) t.scale.set(max / t.width);
  }

  private setHeader(t: string) {
    this.header.text = t;
    this.fit(this.header);
  }

  // ---- Card -----------------------------------------------------------------------------------

  private buildCard() {
    this.cardLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.numLayer.removeChildren().forEach((c) => c.destroy());
    this.cells = [];
    const size = this.size;
    const bg = new Sprite(cardTexture(size));
    bg.position.set(-10, -10);
    this.cardLayer.addChild(bg);
    const { cell, gap, x0 } = cardGrid(size);
    this.card.forEach((n, i) => {
      const r = Math.floor(i / size);
      const q = i % size;
      const x = x0 + q * (cell + gap) + cell / 2;
      const y = x0 + r * (cell + gap) + cell / 2;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(x, y);
      glow.width = glow.height = cell * 1.8;
      glow.tint = FIREFLY;
      glow.blendMode = 'add';
      glow.alpha = 0;
      const lit = new Graphics().roundRect(x - cell / 2 + 3, y - cell / 2 + 3, cell - 6, cell - 6, 10).fill({ color: FIREFLY, alpha: 0.42 });
      lit.visible = false;
      const text = new Text({ text: String(n), style: { fontFamily: FONT_DISPLAY, fontSize: size === 3 ? 46 : 38, fill: 0xf2e6c9 } });
      text.anchor.set(0.5);
      text.position.set(x, y + 2);
      this.cardLayer.addChild(glow, lit);
      this.numLayer.addChild(text);
      this.cells.push({ n, x: CARD_X + x, y: CARD_Y + y, lit, glow, text });
    });
  }

  private buildTray() {
    this.trayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.slots = [];
    const n = this.mode.draws;
    const gap = 4;
    const avail = SW - 64;
    const w = Math.min(46, Math.floor((avail - gap * (n - 1)) / n));
    const total = n * w + (n - 1) * gap;
    const x0 = (SW - total) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap) + w / 2;
      const bg = new Sprite(slotTexture(w, 40, false));
      bg.anchor.set(0.5);
      bg.position.set(x, TRAY_Y);
      const text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '800', fill: 0xe8f4c8 } });
      text.anchor.set(0.5);
      text.position.set(x, TRAY_Y + 1);
      this.trayLayer.addChild(bg, text);
      this.slots.push({ bg, text, x, w });
    }
  }

  private setSize(n: CardSize, force = false) {
    if (this.running || (n === this.size && !force)) return;
    this.size = n;
    this.sizeBtns.forEach((b, i) => b.setSelected((i ? 4 : 3) === n));
    this.card = newCard(this.mode);
    this.clearRound();
    this.buildCard();
    this.buildTray();
    this.sub.text = `${this.mode.draws} Glühwürmchen · Zahlen 1–${this.mode.pool}`;
    this.setHeader('Karte bereit – lass sie fliegen!');
    this.buildPayTable();
    if (!force) this.ctx.sfx.chip();
  }

  private newCard() {
    if (this.running) return;
    this.card = newCard(this.mode);
    this.clearRound();
    this.buildCard();
    this.buildTray();
    this.ctx.sfx.rustle();
    if (!this.calm) {
      for (const l of [this.cardLayer, this.numLayer]) {
        l.scale.set(0.96);
        void tween(l.scale, { x: 1, y: 1 }, 260, ease.outBack);
      }
    }
  }

  private clearRound() {
    this.lineLayer.removeChildren().forEach((c) => c.destroy());
    this.sitters.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const c of this.cells) {
      c.lit.visible = false;
      c.glow.alpha = 0;
      c.text.style.fill = 0xf2e6c9;
    }
    for (const s of this.slots) {
      s.text.text = '';
      s.bg.texture = slotTexture(s.w, 40, false);
    }
    this.markTier(null);
  }

  // ---- Paytable -----------------------------------------------------------------------------

  private buildPayTable() {
    this.pay.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.payRows = [];
    const m = this.mode;
    const rows: { key: string; name: string; mult: number }[] = [{ key: 'full', name: 'Volle Karte', mult: m.fullPay }];
    for (let i = m.linePay.length - 1; i >= 1; i--) rows.push({ key: `l${i}`, name: m.tierNames[i], mult: m.linePay[i] });
    const tall = this.tall;
    const W = tall ? SW - 68 : this.deckW - 60;
    const head = new Text({ text: `GEWINNE · KARTE ${m.size}×${m.size}`, style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '700', fill: 0xd9c6a0, letterSpacing: 1.5 } });
    head.position.set(4, 0);
    this.pay.addChild(head);
    const cols = tall ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const cw = cols === 2 ? (W - 16) / 2 : W;
    const rh = tall ? 40 : 36;
    rows.forEach((r, i) => {
      const col = Math.floor(i / perCol);
      const x = col * (cw + 16);
      const y = 36 + (i % perCol) * rh;
      const bg = new Graphics().roundRect(x, y, cw, rh - 4, 8).fill({ color: 0xffffff, alpha: i % 2 ? 0.04 : 0.08 });
      const hi = new Graphics().roundRect(x, y, cw, rh - 4, 8).fill({ color: FIREFLY, alpha: 0.28 }).stroke({ color: FIREFLY, width: 2 });
      hi.visible = false;
      const a = new Text({ text: r.name, style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '600', fill: 0xf2e6c9 } });
      a.anchor.set(0, 0.5);
      a.position.set(x + 12, y + (rh - 4) / 2);
      const b = new Text({ text: fmtMult(r.mult), style: { fontFamily: FONT_DISPLAY, fontSize: MIN_FONT, fill: r.mult >= 20 ? 0xff9ac8 : 0xe8ff9a } });
      b.anchor.set(1, 0.5);
      b.position.set(x + cw - 12, y + (rh - 4) / 2);
      this.pay.addChild(bg, hi, a, b);
      this.payRows.push({ key: r.key, hi });
    });
    this.rtp.set(returnToPlayer(m), W);
  }

  private markTier(key: string | null) {
    for (const r of this.payRows) r.hi.visible = r.key === key;
  }

  // ---- Round ----------------------------------------------------------------------------------

  async play() {
    if (this.running) return;
    this.shell.closeRules();
    const stake = this.bet.bet;
    if (!this.ctx.state.placeBet(stake)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.running = true;
    this.lock(true);
    this.clearRound();
    const mode = this.mode;
    const card = this.card;
    // Decide everything first.
    const drawn = drawFireflies(mode);
    const result = scoreCard(mode, card, drawn);
    const rtp = returnToPlayer(mode);
    const lines = cardLines(mode.size);
    const marked = card.map(() => false);
    const done = new Set<number>();
    let landed = 0;
    this.setHeader(`Glühwürmchen 0 / ${drawn.length}`);
    this.ctx.sfx.whoosh();
    const flights: Promise<void>[] = [];
    for (let i = 0; i < drawn.length; i++) {
      const n = drawn[i];
      const ci = card.indexOf(n);
      flights.push(
        this.fly(i, n, ci).then(() => {
          if (this.view.destroyed) return;
          landed++;
          this.slotShow(i, n, ci >= 0);
          if (ci >= 0) {
            marked[ci] = true;
            this.light(ci);
            // New lines through this cell.
            lines.forEach((l, li) => {
              if (!done.has(li) && l.every((k) => marked[k])) {
                done.add(li);
                this.drawLine(l, done.size);
              }
            });
            const full = marked.every(Boolean);
            this.markTier(full ? 'full' : done.size ? `l${Math.min(done.size, mode.linePay.length - 1)}` : null);
          }
          this.setHeader(`Glühwürmchen ${landed} / ${drawn.length} · ${done.size} ${done.size === 1 ? 'Linie' : 'Linien'}`);
        }),
      );
      await wait(this.calm ? 90 : 300);
      if (this.view.destroyed) return;
    }
    await Promise.all(flights);
    if (this.view.destroyed) return;
    await wait(250);
    if (this.view.destroyed) return;
    await this.settle(stake, result.lines.length, result.full, result.mult, rtp);
  }

  /** One firefly leaves the jar and settles on its card cell (ci ≥ 0) or its tray slot. */
  private async fly(i: number, n: number, ci: number) {
    const sx = JAR_X + JAR.w / 2 + (Math.random() - 0.5) * 50;
    const sy = JAR_Y + JAR.mouthY + 20;
    const cell = ci >= 0 ? this.cells[ci] : null;
    const { cell: cs } = cardGrid(this.size);
    const tx = cell ? cell.x + cs * 0.28 : this.slots[i].x;
    const ty = cell ? cell.y - cs * 0.28 : TRAY_Y - 30;
    const bug = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 64;
    glow.tint = FIREFLY;
    glow.blendMode = 'add';
    glow.alpha = 0.8;
    const s = new Sprite(fireflyTexture());
    s.anchor.set(0.5);
    s.width = s.height = 40;
    const tag = new Text({ text: String(n), style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '800', fill: 0xf4ffd0, stroke: { color: 0x0a140e, width: 4 } } });
    tag.anchor.set(0.5);
    tag.y = -30;
    bug.addChild(glow, s, tag);
    bug.position.set(sx, sy);
    this.flyLayer.addChild(bug);
    const sw = s.scale.x;
    if (this.calm) {
      await wait(140);
      if (bug.destroyed) return;
      bug.position.set(tx, ty);
    } else {
      this.ctx.sfx.firefly(false);
      // Rise out of the jar, then a lazy curve to the target.
      const cx = (sx + tx) / 2 + (Math.random() - 0.5) * 160;
      const cy = Math.min(sy, ty) - 80 - Math.random() * 80;
      const wob = Math.random() * 6;
      await animate(
        640 + Math.random() * 160,
        (k) => {
          if (bug.destroyed) return;
          const u = 1 - k;
          bug.x = u * u * sx + 2 * u * k * cx + k * k * tx + Math.sin(k * 12 + wob) * 6 * u;
          bug.y = u * u * sy + 2 * u * k * cy + k * k * ty;
          s.scale.x = sw * (0.55 + 0.45 * Math.abs(Math.sin(k * 40)));
          s.rotation = Math.sin(k * 8 + wob) * 0.4;
        },
        ease.inOutCubic,
      );
    }
    if (bug.destroyed) return;
    s.scale.x = sw;
    s.rotation = 0;
    tag.destroy();
    this.flyLayer.removeChild(bug);
    this.sitters.addChild(bug);
    bug.scale.set(cell ? 0.8 : 0.6);
    glow.alpha = cell ? 0.9 : 0.4;
    this.ctx.sfx.firefly(ci >= 0);
  }

  private light(ci: number) {
    const c = this.cells[ci];
    c.lit.visible = true;
    c.text.style.fill = 0x14200a;
    c.glow.alpha = 0.9;
    void tween(c.glow, { alpha: 0.35 }, 700, ease.outCubic);
    if (!this.calm) {
      c.text.scale.set(1.3);
      void tween(c.text.scale, { x: 1, y: 1 }, 320, ease.outBack);
      const g = this.shell.global(c.x, c.y);
      this.ctx.particles.sparkle(g.x, g.y, 5, FIREFLY, 70);
    }
  }

  private slotShow(i: number, n: number, hit: boolean) {
    const s = this.slots[i];
    if (!s) return;
    s.text.text = String(n);
    s.text.style.fill = hit ? 0x1a0f08 : 0xe8f4c8;
    if (hit) s.bg.texture = slotTexture(s.w, 40, true);
  }

  private drawLine(l: number[], nth: number) {
    this.ctx.sfx.lineHit(nth - 1);
    const a = this.cells[l[0]];
    const b = this.cells[l[l.length - 1]];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ext = cardGrid(this.size).cell * 0.42;
    const ax = a.x - Math.cos(ang) * ext;
    const ay = a.y - Math.sin(ang) * ext;
    const len = Math.hypot(b.x - a.x, b.y - a.y) + ext * 2;
    const s = new Sprite(lineTexture());
    s.anchor.set(0, 0.5);
    s.position.set(ax, ay);
    s.rotation = ang;
    s.height = 12;
    s.tint = 0xf4ffb0;
    s.alpha = 0.75;
    s.blendMode = 'add';
    this.lineLayer.addChild(s);
    if (this.calm) s.width = len;
    else {
      s.width = 1;
      void tween(s, { width: len }, 320, ease.outCubic);
    }
  }

  private async settle(stake: number, lines: number, full: boolean, mult: number, rtp: number) {
    const win = Math.round(stake * mult);
    if (win > 0) this.ctx.state.payout(win);
    const tags = ['bingo'];
    if (lines > 0) tags.push('line');
    if (full) tags.push('full');
    this.ctx.state.report({ game: 'bingo', stake, win, rtp, tags });
    const what = full ? 'Volle Karte!' : lines ? `${lines} ${lines === 1 ? 'Linie' : 'Linien'}` : 'Keine Linie';
    this.setHeader(win > 0 ? `${what} · Gewinn ${formatChips(win)}` : `${what} · diesmal nichts`);
    const cx = CARD_X + CARD / 2;
    const cy = CARD_Y + CARD / 2;
    const g = this.shell.global(cx, cy);
    if (mult > 1) {
      this.ctx.celebrate(mult, g.x, g.y, { x: g.x, y: g.y, r: 200 * this.shell.scale });
      if (rewardLevel(mult) >= 3) {
        await winStage(this.shell.over, {
          x: 20,
          y: 20,
          w: SW - 40,
          h: SH - 40,
          title: full ? 'VOLLE KARTE' : 'GROSSER GEWINN',
          sub: `${what} · ×${fmtMult(mult).replace('×', '')}`,
          amount: win,
          accent: FIREFLY,
          durationMs: rewardLevel(mult) === 4 ? 2600 : 2100,
          onTick: () => this.ctx.sfx.tick(),
        });
      } else floatText(this.shell.scene, cx, cy, `+${formatChips(win)}`, COLORS.lamp, 46);
    } else if (win > 0) {
      this.ctx.sfx.partial();
      floatText(this.shell.scene, cx, cy, `${formatChips(win)} zurück`, 0xd9c6a0, 38);
    } else this.ctx.sfx.lose();
    if (this.view.destroyed) return;
    this.running = false;
    this.lock(false);
  }

  private lock(on: boolean) {
    this.bet.lock(on);
    this.main.setEnabled(!on);
    this.fresh.setEnabled(!on);
    this.sizeBtns.forEach((b) => b.setEnabled(!on));
  }

  // ---- Instance -----------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  update(dtMs: number) {
    this.bet.poll(this.running);
    this.time += dtMs / 1000;
    if (this.calm) return;
    const t = this.time;
    for (const b of this.jarBugs) {
      b.s.x = b.bx + Math.sin(t * b.sp + b.ph) * 18;
      b.s.y = b.by + Math.cos(t * b.sp * 1.3 + b.ph) * 14;
      b.s.alpha = 0.55 + 0.45 * Math.sin(t * 3 * b.sp + b.ph);
    }
    // Settled fireflies blink slowly.
    const list = this.sitters.children;
    for (let i = 0; i < list.length; i++) {
      const g = (list[i] as Container).children[0];
      if (g) g.alpha = 0.45 + 0.4 * Math.sin(t * 2.4 + i * 1.7);
    }
  }

  busy() {
    return this.running;
  }

  destroy() {
    this.unkey();
    this.view.destroy({ children: true });
  }
}

export const bingo: GameDefinition = {
  id: 'bingo',
  name: 'Glühwürmchen-Bingo',
  houseEdge: 1 - returnToPlayer(MODES[3]),
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: 'Glühwürmchen fliegen aus dem Glas und landen auf deiner Bingokarte.',
  drawStation: () => bingoStation(),
  create: (ctx) => new BingoGame(ctx),
};
