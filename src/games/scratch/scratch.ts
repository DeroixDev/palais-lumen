// "Kratzglück": a scratch-card vending machine. Pick one of three card designs (each with its
// own price ladder and prize table), buy a card and scratch the painted moth-wing coating off
// with your finger or the mouse, or press "Alles aufdecken". Three equal symbols win.
// The prize is drawn when the card is bought (rules.ts); the field is laid out to show it.
//
// The coating is one RenderTexture per game, filled from the baked wing painting when a card is
// dispensed and then erased stroke by stroke with a pool of brush sprites ('erase' blend), so
// scratching allocates nothing.
//
// Round report tags: 'scratch' (every card), 'scratch20' (a card that paid 20× or more).

import { Container, Graphics, RenderTexture, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { symbolTextures } from '../slots/symbols';
import { winStage } from '../slots/stage';
import { BetStepper, DrawShell, MIN_FONT, fmtMult, infoKnob, rtpText, spaceKey } from '../drawKit';
import { DESIGNS, TIER_SYMBOLS, drawTicket, dusted, dustRtp, returnToPlayer, winChance, type ScratchDesign, type Ticket } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import { CARD_H, CARD_W, FIELD, brushTexture, cardTexture, coatingTexture, machineTexture, marqueeTexture, scratchCoinTexture, scratchStation, winRingTexture } from './paint';
import { luckDraw } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const SW = 720;
const SH = 600;
const CARD_X = 60;
const CARD_Y = 122;
const GRID = 10;
const GN = Math.ceil(FIELD.size / GRID);
const STAMPS = 48;
const BRUSH = 46;
/** Share of a field that must be scratched before it pops open by itself. */
const OPEN_AT = 0.45;
const RULES =
  'Wähle eine Karte: Kerzenschein (günstig, oft kleine Gewinne), Mondschein (ausgewogen) oder Goldstaub (teuer, seltene große Gewinne). ' +
  'Jede Karte hat ihre eigene Preisleiter.\n\n' +
  'Nach dem Kauf kratzt du die Goldschicht mit dem Finger oder der Maus frei – oder tippst auf „Alles aufdecken“ (Leertaste). ' +
  'Drei gleiche Symbole gewinnen den Betrag aus der Liste links auf der Karte. Der Gewinn steht beim Kauf schon fest; Kratzen ändert nichts daran.';

function cellCentre(i: number) {
  const q = i % 3;
  const r = Math.floor(i / 3);
  return {
    x: 6 + q * (FIELD.cell + FIELD.gap) + FIELD.cell / 2,
    y: 6 + r * (FIELD.cell + FIELD.gap) + FIELD.cell / 2,
  };
}

class ScratchGame implements GameInstance {
  view: Container;
  private shell: DrawShell;
  private design: ScratchDesign = DESIGNS[0];
  private ticket: Ticket | null = null;
  private stake = 0;
  private active = false;
  private settling = false;
  private calm = reducedMotion();
  private time = 0;
  private bet: BetStepper;
  private unkey: () => void;

  // Card.
  private card = new Container();
  private cardBg = new Sprite();
  private cardName!: Text;
  private legend: { s: Sprite; t: Text; hi: Graphics }[] = [];
  private symbols: Sprite[] = [];
  private rings: Sprite[] = [];
  private pairGlow: Sprite[] = [];
  private coat: Sprite;
  private rt: RenderTexture;
  private coatSrc = new Sprite();
  private brushLayer = new Container();
  private stamps: Sprite[] = [];
  private eraseRect: Sprite;
  private coin = new Sprite(scratchCoinTexture());
  private mask = new Graphics();

  // Scratch state (no allocations while scratching).
  private gridCell = new Int8Array(GN * GN).fill(-1);
  private gridDone = new Uint8Array(GN * GN);
  private cellTotal = new Int16Array(9);
  private cellDone = new Int16Array(9);
  private open = new Uint8Array(9);
  private openCount = 0;
  private down = false;
  private lastX = 0;
  private lastY = 0;
  private lastSound = 0;

  // Deck.
  private header!: Text;
  private chance!: Text;
  private designBtns: Button[] = [];
  private main!: Button;
  private rtp!: ReturnType<typeof rtpText>;
  private deckW = 480;
  private odds: OddsWatch;
  /** Funkenstaub was on when this ticket was bought; `redrawn`: the fresh ticket came already. */
  private dust = false;
  private redrawn = false;

  constructor(private ctx: GameContext) {
    this.shell = new DrawShell({ sceneW: SW, sceneH: SH, deckWide: 480, deckTall: 420, velvet: 0x3a0e1e, layout: (t, w) => this.layout(t, w) });
    this.view = this.shell.view;
    this.bet = new BetStepper(ctx, this.design.ladder, 300, 'PREIS');
    this.bet.onChange = () => this.refreshMain();
    this.odds = new OddsWatch(ctx.state, 'scratch', ['mottenstaub']);
    this.rt = RenderTexture.create({ width: FIELD.size, height: FIELD.size, resolution: 2 });
    this.coat = new Sprite(this.rt);
    this.eraseRect = new Sprite(Texture.WHITE);
    this.build();
    this.unkey = spaceKey(() => this.mainAction());
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Build ----------------------------------------------------------------------------------

  private build() {
    const sc = this.shell.scene;
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(SW / 2, SH / 2);
    halo.width = SW * 1.6;
    halo.height = SH * 1.4;
    halo.tint = 0xff5fa2;
    halo.alpha = 0.12;
    halo.blendMode = 'add';
    sc.addChild(halo, new Sprite(machineTexture(SW, SH)));

    // The card.
    const c = this.card;
    c.position.set(CARD_X, CARD_Y);
    this.cardBg.position.set(-12, -12);
    c.addChild(this.cardBg);
    this.cardName = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xfff1c4, letterSpacing: 2, stroke: { color: 0x14080f, width: 5 } } });
    this.cardName.anchor.set(0, 0.5);
    this.cardName.position.set(40, 44);
    const rule = new Text({ text: '3 GLEICHE GEWINNEN', style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '700', fill: 0xf2e6c9, letterSpacing: 1 } });
    rule.anchor.set(1, 0.5);
    rule.position.set(CARD_W - 40, 44);
    c.addChild(this.cardName, rule);
    const tex = symbolTextures();
    const rowH = FIELD.size / TIER_SYMBOLS.length;
    for (let i = 0; i < TIER_SYMBOLS.length; i++) {
      const tier = TIER_SYMBOLS.length - 1 - i;
      const y = FIELD.y + rowH * i + rowH / 2;
      const hi = new Graphics().roundRect(24, y - rowH / 2 + 3, 188, rowH - 6, 10).fill({ color: 0xffcf7a, alpha: 0.3 }).stroke({ color: 0xffcf7a, width: 2 });
      hi.visible = false;
      const s = new Sprite(tex[TIER_SYMBOLS[tier]]);
      s.anchor.set(0.5);
      s.width = s.height = 50;
      s.position.set(62, y);
      const t = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: 0xfff1c4, stroke: { color: 0x14080f, width: 4 } } });
      t.anchor.set(1, 0.5);
      t.position.set(200, y + 1);
      c.addChild(hi, s, t);
      this.legend[tier] = { s, t, hi };
    }
    const field = new Container();
    field.position.set(FIELD.x, FIELD.y);
    c.addChild(field);
    for (let i = 0; i < 9; i++) {
      const p = cellCentre(i);
      const g = new Sprite(glowTexture());
      g.anchor.set(0.5);
      g.position.set(p.x, p.y);
      g.width = g.height = 150;
      g.tint = 0xffcf7a;
      g.blendMode = 'add';
      g.alpha = 0;
      const s = new Sprite(tex.moth);
      s.anchor.set(0.5);
      s.position.set(p.x, p.y);
      s.width = s.height = 88;
      const ring = new Sprite(winRingTexture());
      ring.anchor.set(0.5);
      ring.position.set(p.x, p.y);
      ring.width = ring.height = 120;
      ring.visible = false;
      field.addChild(g, s, ring);
      this.symbols.push(s);
      this.rings.push(ring);
      this.pairGlow.push(g);
    }
    field.addChild(this.coat);
    this.coin.anchor.set(0.3, 0.3);
    this.coin.width = this.coin.height = 52;
    this.coin.visible = false;
    field.addChild(this.coin);

    // Coating source and eraser stamps (rendered into the RenderTexture, never shown).
    this.coatSrc.position.set(0, 0);
    for (let i = 0; i < STAMPS; i++) {
      const s = new Sprite(brushTexture());
      s.anchor.set(0.5);
      s.width = s.height = BRUSH;
      s.blendMode = 'erase';
      s.visible = false;
      this.brushLayer.addChild(s);
      this.stamps.push(s);
    }
    this.eraseRect.blendMode = 'erase';
    this.eraseRect.visible = false;
    this.brushLayer.addChild(this.eraseRect);

    // Which coarse grid square belongs to which field.
    for (let gy = 0; gy < GN; gy++)
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * GRID + GRID / 2;
        const y = gy * GRID + GRID / 2;
        for (let i = 0; i < 9; i++) {
          const p = cellCentre(i);
          if (Math.abs(x - p.x) < FIELD.cell / 2 && Math.abs(y - p.y) < FIELD.cell / 2) {
            this.gridCell[gy * GN + gx] = i;
            this.cellTotal[i]++;
          }
        }
      }

    this.coat.eventMode = 'static';
    this.coat.cursor = 'crosshair';
    this.coat.on('pointerdown', (e) => this.strokeStart(e));
    this.coat.on('globalpointermove', (e) => this.strokeMove(e));
    this.coat.on('pointerup', () => this.strokeEnd());
    this.coat.on('pointerupoutside', () => this.strokeEnd());

    this.mask.rect(0, 104, SW, SH - 104).fill(0xffffff);
    sc.addChild(this.card, this.mask);
    this.card.mask = this.mask;
    const marquee = new Sprite(marqueeTexture(SW));
    const title = new Text({ text: 'KRATZGLÜCK', style: { fontFamily: FONT_DISPLAY, fontSize: 34, fill: 0xffe0ee, letterSpacing: 4, stroke: { color: 0x1a040c, width: 6 } } });
    title.anchor.set(0.5);
    title.position.set(SW / 2 + 20, 46);
    sc.addChild(marquee, title);
    const info = infoKnob(() => this.shell.showRules(RULES));
    info.position.set(50, 46);
    sc.addChild(info);

    // Deck.
    const d = this.shell.deck;
    this.header = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xffe0ee, letterSpacing: 0.5 } });
    this.header.anchor.set(0, 0.5);
    this.chance = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '600', fill: 0xe6d6b4 } });
    this.chance.anchor.set(0.5);
    DESIGNS.forEach((ds, i) => {
      const b = button({ label: ds.name, width: 200, height: 56, color: ds.card, textColor: 0xfff6e6, fontSize: 26, display: false, onClick: () => this.setDesign(i) });
      this.designBtns.push(b);
    });
    this.main = button({ label: 'KAUFEN', width: 330, height: 72, color: 0xff5fa2, textColor: 0x1a0610, fontSize: 27, onClick: () => this.mainAction() });
    this.rtp = rtpText(returnToPlayer(this.design), 420);
    d.addChild(this.header, this.chance, ...this.designBtns, this.bet.view, this.main, this.rtp.text);
    this.setDesign(0, true);
  }

  private layout(tall: boolean, w: number) {
    this.deckW = w;
    this.header.position.set(56, 48);
    if (tall) {
      this.designBtns.forEach((b, i) => {
        b.position.set(36 + 100 + i * 224, 106);
      });
      this.chance.position.set(w / 2, 164);
      this.rtp.text.position.set(w / 2, 202);
      this.bet.view.position.set(36, 300);
      this.main.position.set(w - 36 - 165, 300);
    } else {
      this.designBtns.forEach((b, i) => b.position.set(w / 2, 108 + i * 66));
      this.chance.position.set(w / 2, 280);
      this.rtp.text.position.set(w / 2, 318);
      this.bet.view.position.set((w - 300) / 2, 420);
      this.main.position.set(w / 2, 520);
    }
    this.refreshRtp();
    this.fit(this.header);
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

  // ---- Designs --------------------------------------------------------------------------------

  private setDesign(i: number, force = false) {
    if (this.active || this.settling) {
      if (!force) this.ctx.toast('Erst diese Karte fertig kratzen.');
      return;
    }
    const d = DESIGNS[i];
    if (d === this.design && !force) return;
    this.design = d;
    this.designBtns.forEach((b, k) => b.setSelected(k === i));
    this.bet.setLadder(d.ladder);
    this.chance.text = `Gewinnchance ${Math.round(winChance(d) * 100)} % · bis ${fmtMult(d.mult[d.mult.length - 1])}`;
    this.refreshRtp();
    this.showCard(d, null);
    this.setHeader(force ? 'Wähle eine Karte und kauf sie' : `${d.name} gewählt`);
    this.refreshMain();
    if (!force) this.ctx.sfx.chip();
  }

  /** The payout line: the design's own, or with Funkenstaub the exact share with the dust. */
  private refreshRtp() {
    const d = this.design;
    if (this.odds.id) {
      setItemRtp('scratch', 'mottenstaub', dustRtp(d));
      this.rtp.set(dustRtp(d), this.deckW - 64, itemRtpText(dustRtp(d), 'mottenstaub'), 0xe8c8ff);
    } else this.rtp.set(returnToPlayer(d), this.deckW - 64);
  }

  /** Paints the card face for a design; with a ticket the field shows its symbols under fresh coating. */
  private showCard(d: ScratchDesign, t: Ticket | null) {
    this.cardBg.texture = cardTexture(d);
    this.cardName.text = d.name.toUpperCase();
    d.mult.forEach((m, tier) => {
      const l = this.legend[tier];
      l.t.text = fmtMult(m);
      l.t.style.fill = m >= 20 ? 0xff9ac8 : 0xfff1c4;
      l.hi.visible = false;
    });
    const tex = symbolTextures();
    for (let i = 0; i < 9; i++) {
      this.symbols[i].texture = tex[TIER_SYMBOLS[t ? t.cells[i] : 5]];
      this.symbols[i].scale.set(88 / 200);
      this.symbols[i].alpha = 1;
      this.rings[i].visible = false;
      this.pairGlow[i].alpha = 0;
    }
    this.resetCoating(d);
  }

  private resetCoating(d: ScratchDesign) {
    this.coatSrc.texture = coatingTexture(d);
    this.ctx.renderer.render({ container: this.coatSrc, target: this.rt, clear: true });
    this.gridDone.fill(0);
    this.cellDone.fill(0);
    this.open.fill(0);
    this.openCount = 0;
  }

  private refreshMain() {
    if (this.active) this.main.setLabel('ALLES AUFDECKEN');
    else this.main.setLabel(`KAUFEN · ${formatChips(this.bet.bet)}`);
    this.main.setEnabled(!this.settling);
    this.designBtns.forEach((b) => b.setEnabled(!this.active && !this.settling));
    this.bet.lock(this.active || this.settling);
  }

  // ---- Buying ---------------------------------------------------------------------------------

  private mainAction() {
    if (this.settling) return;
    this.shell.closeRules();
    if (this.active) void this.revealAll();
    else void this.buy();
  }

  private async buy() {
    const price = this.bet.bet;
    if (!this.ctx.state.placeBet(price)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diese Karte.`);
      return;
    }
    this.stake = price;
    // The prize is decided now.
    this.ticket = luckDraw(() => drawTicket(this.design), (t) => t.mult - 1);
    this.dust = this.odds.on('mottenstaub');
    this.redrawn = false;
    this.settling = true;
    this.refreshMain();
    this.setHeader('Die Karte kommt …');
    this.ctx.sfx.till();
    if (!this.calm) {
      // The old card drops away, the new one slides out of the slot.
      await tween(this.card, { y: SH + 40, alpha: 0 }, 260, ease.inCubic);
      if (this.view.destroyed) return;
      this.showCard(this.design, this.ticket);
      this.card.alpha = 1;
      this.card.y = CARD_Y - CARD_H - 30;
      this.ctx.sfx.whoosh();
      await tween(this.card, { y: CARD_Y }, 620, ease.outBack);
      if (this.view.destroyed) return;
      this.ctx.sfx.thud();
    } else this.showCard(this.design, this.ticket);
    this.settling = false;
    this.active = true;
    this.refreshMain();
    this.setHeader('Kratz die Goldschicht frei!');
  }

  // ---- Scratching -----------------------------------------------------------------------------

  private strokeStart(e: FederatedPointerEvent) {
    if (!this.active) {
      if (!this.settling) this.ctx.toast(this.ticket ? 'Kauf eine neue Karte, um weiterzukratzen.' : 'Kauf zuerst eine Karte.');
      return;
    }
    this.down = true;
    const p = e.getLocalPosition(this.coat.parent!);
    this.lastX = p.x;
    this.lastY = p.y;
    this.coin.visible = true;
    this.coin.position.set(p.x, p.y);
    this.stampSegment(p.x, p.y, p.x, p.y);
  }

  private strokeMove(e: FederatedPointerEvent) {
    if (!this.down || !this.active) return;
    const p = e.getLocalPosition(this.coat.parent!);
    this.coin.position.set(p.x, p.y);
    this.coin.rotation = Math.sin(this.time * 30) * 0.15;
    this.stampSegment(this.lastX, this.lastY, p.x, p.y);
    this.lastX = p.x;
    this.lastY = p.y;
  }

  private strokeEnd() {
    this.down = false;
    this.coin.visible = false;
  }

  /** Erases along a segment with the stamp pool, renders once, updates the coverage grid. */
  private stampSegment(x0: number, y0: number, x1: number, y1: number) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.min(STAMPS, Math.max(1, Math.ceil(d / 7)));
    for (let i = 0; i < STAMPS; i++) {
      const s = this.stamps[i];
      if (i < n) {
        const k = n === 1 ? 1 : i / (n - 1);
        s.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
        s.visible = true;
        this.cover(s.x, s.y);
      } else s.visible = false;
    }
    this.eraseRect.visible = false;
    this.ctx.renderer.render({ container: this.brushLayer, target: this.rt, clear: false });
    if (d > 2 && this.time - this.lastSound > 0.08) {
      this.lastSound = this.time;
      this.ctx.sfx.scratch();
    }
    for (let i = 0; i < 9; i++) if (!this.open[i] && this.cellDone[i] >= this.cellTotal[i] * OPEN_AT) this.openCell(i);
  }

  /** Marks the coverage squares under one brush stamp. */
  private cover(x: number, y: number) {
    const r = BRUSH * 0.4;
    const gx0 = Math.max(0, Math.floor((x - r) / GRID));
    const gx1 = Math.min(GN - 1, Math.floor((x + r) / GRID));
    const gy0 = Math.max(0, Math.floor((y - r) / GRID));
    const gy1 = Math.min(GN - 1, Math.floor((y + r) / GRID));
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const k = gy * GN + gx;
        if (this.gridDone[k]) continue;
        const cx = gx * GRID + GRID / 2 - x;
        const cy = gy * GRID + GRID / 2 - y;
        if (cx * cx + cy * cy > r * r) continue;
        this.gridDone[k] = 1;
        const cell = this.gridCell[k];
        if (cell >= 0) this.cellDone[cell]++;
      }
  }

  /** A field is scratched enough: wipe the rest of its coating and show the symbol. */
  private openCell(i: number) {
    if (this.open[i] || !this.ticket) return;
    this.open[i] = 1;
    this.openCount++;
    const p = cellCentre(i);
    for (const s of this.stamps) s.visible = false;
    const e = this.eraseRect;
    e.visible = true;
    e.position.set(p.x - FIELD.cell / 2 - 4, p.y - FIELD.cell / 2 - 4);
    e.width = e.height = FIELD.cell + 8;
    this.ctx.renderer.render({ container: this.brushLayer, target: this.rt, clear: false });
    e.visible = false;
    const s = this.symbols[i];
    this.ctx.sfx.pegTick(this.openCount);
    if (!this.calm) {
      s.scale.set((88 / 200) * 1.35);
      void tween(s.scale, { x: 88 / 200, y: 88 / 200 }, 320, ease.outBack);
    }
    // Two of a kind: both glow – the third could be anywhere.
    const sym = this.ticket.cells[i];
    const same: number[] = [];
    for (let k = 0; k < 9; k++) if (this.open[k] && this.ticket.cells[k] === sym) same.push(k);
    if (same.length === 2 && this.openCount < 9) {
      for (const k of same) this.pairGlow[k].alpha = 0.55;
      this.setHeader('Zwei gleiche – noch eins!');
    }
    if (this.openCount === 9) void this.settle();
    else if (same.length < 2) this.setHeader(`${this.openCount} von 9 Feldern offen`);
  }

  /** Clears what is left of the coating (the slivers between the fields). */
  private wipe() {
    for (const s of this.stamps) s.visible = false;
    const e = this.eraseRect;
    e.visible = true;
    e.position.set(0, 0);
    e.width = e.height = FIELD.size;
    this.ctx.renderer.render({ container: this.brushLayer, target: this.rt, clear: false });
    e.visible = false;
  }

  private async revealAll() {
    if (!this.active) return;
    this.down = false;
    this.coin.visible = false;
    for (let i = 0; i < 9 && this.active; i++) {
      if (this.open[i]) continue;
      this.openCell(i);
      if (!this.calm && this.openCount < 9) await wait(110);
      if (this.view.destroyed) return;
    }
  }

  // ---- Settle ---------------------------------------------------------------------------------

  private async settle() {
    const t = this.ticket;
    if (!t || !this.active) return;
    this.active = false;
    this.settling = true;
    this.refreshMain();
    if (this.dust && !this.redrawn && dusted(t.cells)) {
      await this.dustOver(t);
      return;
    }
    const stake = this.stake;
    const win = Math.round(stake * t.mult);
    if (win > 0) this.ctx.state.payout(win);
    const tags = ['scratch'];
    if (t.mult >= 20) tags.push('scratch20');
    this.ctx.state.report({ game: 'scratch', stake, win, rtp: this.dust ? dustRtp(this.design) : returnToPlayer(this.design), tags });
    for (const g of this.pairGlow) g.alpha = 0;
    this.wipe();
    const fx = CARD_X + FIELD.x + FIELD.size / 2;
    const fy = CARD_Y + FIELD.y + FIELD.size / 2;
    if (t.tier >= 0) {
      for (let i = 0; i < 9; i++)
        if (t.cells[i] === t.tier) {
          this.rings[i].visible = true;
          this.pairGlow[i].alpha = 0.9;
          if (!this.calm) {
            this.rings[i].scale.set(0.2);
            void tween(this.rings[i], { width: 120, height: 120 }, 360, ease.outBack);
          }
        }
      this.legend[t.tier].hi.visible = true;
      this.setHeader(`Drei gleiche! Gewinn ${formatChips(win)}`);
    } else this.setHeader('Leider kein Gewinn – nächste Karte?');
    await wait(this.calm ? 0 : 250);
    if (this.view.destroyed) return;
    const g = this.shell.global(fx, fy);
    if (t.mult > 1) {
      this.ctx.celebrate(t.mult, g.x, g.y, { x: g.x, y: g.y, r: 180 * this.shell.scale });
      if (rewardLevel(t.mult) >= 3) {
        await winStage(this.shell.over, {
          x: 20,
          y: 20,
          w: SW - 40,
          h: SH - 40,
          title: rewardLevel(t.mult) === 4 ? 'HAUPTGEWINN' : 'GROSSER GEWINN',
          sub: `Drei gleiche · ×${fmtMult(t.mult).replace('×', '')}`,
          amount: win,
          accent: rewardLevel(t.mult) === 4 ? 0xfff1c4 : COLORS.neon,
          durationMs: rewardLevel(t.mult) === 4 ? 2600 : 2100,
          onTick: () => this.ctx.sfx.tick(),
        });
      } else floatText(this.shell.scene, fx, fy, `+${formatChips(win)}`, COLORS.lamp, 46);
    } else if (win > 0) {
      this.ctx.sfx.partial();
      floatText(this.shell.scene, fx, fy, `${formatChips(win)} zurück`, 0xd9c6a0, 38);
    } else this.ctx.sfx.lose();
    if (this.view.destroyed) return;
    this.settling = false;
    this.refreshMain();
  }

  /** Funkenstaub: the losing card shows two moons and two moths – dust, and a fresh ticket. */
  private async dustOver(t: Ticket) {
    this.wipe();
    for (let i = 0; i < 9; i++) {
      const sym = TIER_SYMBOLS[t.cells[i]];
      const hit = sym === 'moon' || sym === 'moth';
      this.pairGlow[i].alpha = hit ? 0.9 : 0;
      this.pairGlow[i].tint = hit ? 0xe8c8ff : 0xffcf7a;
    }
    this.setHeader('Zwei Monde, zwei Lüster – Funkenstaub!');
    this.ctx.sfx.shimmer();
    const fx = CARD_X + FIELD.x + FIELD.size / 2;
    const fy = CARD_Y + FIELD.y + FIELD.size / 2;
    const g = this.shell.global(fx, fy);
    this.ctx.particles.sparkle(g.x, g.y, 26, 0xe8c8ff, 220 * this.shell.scale);
    await itemMoment(this.shell.scene, fx, fy - 40, 'mottenstaub', 'FRISCHES LOS!', 1.1);
    await wait(this.calm ? 300 : 900);
    if (this.view.destroyed) return;
    for (const p of this.pairGlow) {
      p.alpha = 0;
      p.tint = 0xffcf7a;
    }
    // The fresh ticket of the same design (bought already: no new price).
    this.ticket = luckDraw(() => drawTicket(this.design), (t) => t.mult - 1);
    this.redrawn = true;
    if (!this.calm) {
      await tween(this.card, { y: SH + 40, alpha: 0 }, 260, ease.inCubic);
      if (this.view.destroyed) return;
      this.showCard(this.design, this.ticket);
      this.card.alpha = 1;
      this.card.y = CARD_Y - CARD_H - 30;
      this.ctx.sfx.whoosh();
      await tween(this.card, { y: CARD_Y }, 620, ease.outBack);
      if (this.view.destroyed) return;
    } else this.showCard(this.design, this.ticket);
    this.settling = false;
    this.active = true;
    this.refreshMain();
    this.setHeader('Ein frisches Los – kratz noch mal!');
  }

  // ---- Instance -----------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  update(dtMs: number) {
    const busy = this.busy();
    if (this.odds.poll()) this.refreshRtp();
    this.bet.poll(busy);
    if (!busy && this.main) this.refreshPrice();
    this.time += dtMs / 1000;
    if (this.calm) return;
    for (let i = 0; i < 9; i++) if (this.rings[i].visible) this.rings[i].alpha = 0.75 + 0.25 * Math.sin(this.time * 5 + i);
  }

  private shownPrice = -1;
  private refreshPrice() {
    if (this.bet.bet === this.shownPrice) return;
    this.shownPrice = this.bet.bet;
    this.refreshMain();
  }

  busy() {
    return this.active || this.settling;
  }

  destroy() {
    this.unkey();
    this.view.destroy({ children: true });
    this.brushLayer.destroy({ children: true });
    this.coatSrc.destroy();
    this.rt.destroy(true);
  }
}

export const scratch: GameDefinition = {
  id: 'scratch',
  name: 'Kratzglück',
  houseEdge: 1 - returnToPlayer(DESIGNS[0]),
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: 'Kauf ein Los am Automaten und kratz die Goldschicht frei – drei gleiche gewinnen.',
  drawStation: () => scratchStation(),
  create: (ctx) => new ScratchGame(ctx),
};
