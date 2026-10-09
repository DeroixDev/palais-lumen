// "Kristall-Baccarat": Spieler, Bank or Unentschieden under a crystal chandelier. The coup is
// drawn from a freshly shuffled 8-deck shoe the moment the bet is placed, then shown card by
// card: second and third cards are "squeezed" – brought close and peeled open corner first.
//
// Report tags: 'baccarat' (every round), the side bet on: 'player', 'banker' or 'tie',
// and 'natural' when the coup ended on a natural 8 or 9.

import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture, reducedMotion } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { PANEL_PAD, panelTexture } from '../../ui/kit';
import { Shoe, type Card } from '../cards/cards';
import { CARD_W, CardView, SqueezeView, dealCard } from '../cards/cardArt';
import { RulesCard, StakeControl, TotalBadge, chipPile, infoButton, pct, presentWin, readable, slide } from '../cards/tableKit';
import { DECKS, ODDS, PAYS, RTP, SIDE_LABEL, playCoup, returnFor, total, type Coup, type Side } from './rules';
import { CANDLES, CHANDELIER_W, SIDE_COLOR, bacTableTexture, beadTexture, chandelierTexture, glintTexture, station, type BacGeo } from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const SIDES: Side[] = ['player', 'tie', 'banker'];

type Mode = 'wide' | 'tall';
interface Layout {
  mode: Mode;
  W: number;
  H: number;
  table: { x: number; y: number };
  geo: BacGeo;
  chandelier: { x: number; y: number; s: number };
  cardScale: number;
  /** Where squeezed cards are held up, in table coordinates. */
  stage: { x: number; y: number };
}

function layoutFor(mode: Mode): Layout {
  if (mode === 'wide') {
    return {
      mode,
      W: 1280,
      H: 660,
      table: { x: 0, y: 0 },
      geo: {
        w: 1000,
        h: 660,
        shape: 'oval',
        cx: 500,
        cy: 382,
        rx: 462,
        ry: 226,
        boxes: { player: { x: 282, y: 332, w: 310, h: 196 }, banker: { x: 718, y: 332, w: 310, h: 196 } },
        fields: { player: { x: 268, y: 506, w: 220, h: 96 }, tie: { x: 500, y: 506, w: 216, h: 96 }, banker: { x: 732, y: 506, w: 220, h: 96 } },
      },
      chandelier: { x: 500, y: -14, s: 1 },
      cardScale: 0.8,
      stage: { x: 500, y: 330 },
    };
  }
  return {
    mode,
    W: 600,
    H: 1150,
    table: { x: 0, y: 150 },
    geo: {
      w: 600,
      h: 760,
      shape: 'round',
      cx: 300,
      cy: 372,
      rx: 264,
      ry: 312,
      boxes: { player: { x: 300, y: 196, w: 360, h: 184 }, banker: { x: 300, y: 410, w: 360, h: 184 } },
      fields: { player: { x: 116, y: 590, w: 164, h: 104 }, tie: { x: 300, y: 590, w: 188, h: 104 }, banker: { x: 484, y: 590, w: 164, h: 104 } },
    },
    chandelier: { x: 300, y: 94, s: 0.62 },
    cardScale: 0.8,
    stage: { x: 300, y: 300 },
  };
}

type Phase = 'idle' | 'playing';

class BaccaratGame implements GameInstance {
  view = new Container();
  private root = new Container();
  private tableLayer = new Container();
  private chipLayer = new Container();
  private cardLayer = new Container();
  private fxLayer = new Container();
  private ui = new Container();
  private stageLayer = new Container();
  private L: Layout = layoutFor('wide');
  private phase: Phase = 'idle';
  private side: Side = 'banker';
  private stake: StakeControl;
  private rules: RulesCard;
  private dead = false;
  private hurry = false;
  private shoe = new Shoe(DECKS, 1);
  private views: { player: CardView[]; banker: CardView[] } = { player: [], banker: [] };
  private badges = { player: new TotalBadge(26), banker: new TotalBadge(26) };
  private pile: Container | null = null;
  private road: Side[] = [];
  private roadLayer = new Container();
  private status!: Text;
  private boxGlow = { player: new Graphics(), banker: new Graphics() };
  private fieldGlow = { player: new Graphics(), tie: new Graphics(), banker: new Graphics() };
  private candles: Sprite[] = [];
  private glints: { s: Sprite; t: number; p: number }[] = [];
  private flare = 0;
  private time = 0;
  private sideBtns: Record<Side, Button>;
  private dealBtn: Button;
  private infoBtn: Button;
  private rtpText!: Text;
  private textScale = 1;
  private keyHandler = (e: KeyboardEvent) => {
    if (this.rules.open) {
      if (e.code === 'Escape') this.rules.hide();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.phase === 'idle') void this.play();
      else this.hurry = true;
    } else if (this.phase === 'idle' && (e.code === 'Digit1' || e.code === 'KeyS')) this.choose('player');
    else if (this.phase === 'idle' && (e.code === 'Digit2' || e.code === 'KeyU')) this.choose('tie');
    else if (this.phase === 'idle' && (e.code === 'Digit3' || e.code === 'KeyB')) this.choose('banker');
  };

  constructor(private ctx: GameContext) {
    this.stake = new StakeControl(ctx, BETS, 1);
    const r = (s: Side) => `${SIDE_LABEL[s]} gewinnt in ${pct(ODDS[s])} der Coups, zahlt ${String(PAYS[s]).replace('.', ',')} : 1 → Auszahlungsquote ${pct(RTP[s], 2)}.`;
    this.rules = new RulesCard("SO GEHT'S", [
      '• Setz auf Spieler, Bank oder Unentschieden. Beide Seiten bekommen zwei Karten; wer näher an 9 kommt, gewinnt.',
      '• Bilder und Zehnen zählen 0, das Ass 1, sonst der Kartenwert. Gezählt wird nur die Einerstelle (7 + 8 = 5).',
      '• Eine 8 oder 9 mit den ersten zwei Karten ist ein Natural: Schluss. Sonst zieht der Spieler bis 5 eine dritte Karte, die Bank nach der klassischen Tabelle.',
      `• ${r('player')}`,
      `• ${r('banker')}`,
      `• ${r('tie')} Bei Unentschieden bekommen Spieler- und Bank-Einsätze ihr Geld zurück.`,
      '• 8 Decks, vor jedem Coup frisch gemischt – die Quoten gelten exakt (alle Kartenfolgen durchgerechnet). Ausgezahlt wird auf ganze Falter abgerundet.',
      '• Tippen oder Leertaste beschleunigt das Aufdecken. Tasten 1 / 2 / 3 wählen Spieler, Unentschieden, Bank.',
    ], 620);
    this.sideBtns = this.makeSideButtons(236);
    this.dealBtn = this.makeDealButton(236);
    this.infoBtn = infoButton(() => this.rules.toggle());
    this.view.addChild(this.root, this.rules.view);
    this.root.addChild(this.tableLayer, this.chipLayer, this.cardLayer, this.fxLayer, this.ui, this.stageLayer);
    // Tapping the table while cards are being revealed hurries the reveal along.
    this.tableLayer.eventMode = 'static';
    this.tableLayer.on('pointertap', () => {
      if (this.phase === 'playing') this.hurry = true;
    });
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Build ----------------------------------------------------------------------------------

  private makeSideButtons(w: number): Record<Side, Button> {
    const fs = w < 200 ? 18 : 21;
    return {
      player: button({ label: 'SPIELER', width: w, height: 54, color: 0x1e3a6a, textColor: 0xfff6e6, fontSize: fs, onClick: () => this.choose('player') }),
      tie: button({ label: 'UNENTSCHIEDEN', width: w, height: 54, color: 0x1a5a3a, textColor: 0xfff6e6, fontSize: w < 200 ? 16 : 19, display: w >= 200, onClick: () => this.choose('tie') }),
      banker: button({ label: 'BANK', width: w, height: 54, color: 0x6a1a2a, textColor: 0xfff6e6, fontSize: fs, onClick: () => this.choose('banker') }),
    };
  }

  private makeDealButton(w: number) {
    return button({ label: 'AUSTEILEN', width: w, height: 84, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 27, onClick: () => void this.play() });
  }

  private build() {
    const L = this.L;
    const g = L.geo;
    const T = L.table;
    this.tableLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ui.removeChildren();
    for (const b of [...Object.values(this.sideBtns), this.dealBtn]) b.destroy({ children: true });
    this.sideBtns = this.makeSideButtons(L.mode === 'wide' ? 236 : 182);
    this.dealBtn = this.makeDealButton(L.mode === 'wide' ? 236 : 280);
    this.candles = [];
    this.glints = [];
    this.tableLayer.hitArea = new Rectangle(0, 0, L.W, L.H);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(T.x + g.cx, T.y + g.cy - 40);
    halo.width = g.w * 1.5;
    halo.height = g.h * 1.1;
    halo.tint = 0xffd0b0;
    halo.alpha = 0.14;
    halo.blendMode = 'add';
    const table = new Sprite(bacTableTexture(g));
    table.position.set(T.x, T.y);
    this.tableLayer.addChild(halo, table);
    for (const s of ['player', 'banker'] as const) {
      const b = g.boxes[s];
      const gl = (this.boxGlow[s] = new Graphics());
      gl.roundRect(T.x + b.x - b.w / 2, T.y + b.y - b.h / 2, b.w, b.h, 14).fill({ color: SIDE_COLOR[s], alpha: 0.28 }).stroke({ color: 0xfff1c4, width: 4, alpha: 0.9 });
      gl.alpha = 0;
      gl.blendMode = 'add';
      this.tableLayer.addChild(gl);
    }
    for (const s of SIDES) {
      const f = g.fields[s];
      const gl = (this.fieldGlow[s] = new Graphics());
      gl.roundRect(T.x + f.x - f.w / 2 - 4, T.y + f.y - f.h / 2 - 4, f.w + 8, f.h + 8, 20).stroke({ color: 0xfff1c4, width: 4 });
      gl.roundRect(T.x + f.x - f.w / 2, T.y + f.y - f.h / 2, f.w, f.h, 18).fill({ color: SIDE_COLOR[s], alpha: 0.18 });
      gl.alpha = 0;
      // The fields themselves are tappable too.
      const hit = new Container();
      hit.hitArea = new Rectangle(T.x + f.x - f.w / 2, T.y + f.y - f.h / 2, f.w, f.h);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', (e) => {
        e.stopPropagation();
        this.choose(s);
      });
      this.tableLayer.addChild(gl, hit);
    }
    // The chandelier with flickering candles and twinkling prisms.
    const ch = new Container();
    const C = L.chandelier;
    ch.position.set(T.x + C.x - (CHANDELIER_W * C.s) / 2, C.y);
    ch.scale.set(C.s);
    const chs = new Sprite(chandelierTexture());
    ch.addChild(chs);
    for (const p of CANDLES) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.position.set(p.x, p.y);
      s.width = s.height = 46;
      s.tint = 0xffd890;
      s.blendMode = 'add';
      s.alpha = 0.7;
      ch.addChild(s);
      this.candles.push(s);
    }
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(glintTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0;
      ch.addChild(s);
      this.glints.push({ s, t: Math.random() * 2000, p: 1200 + Math.random() * 1800 });
    }
    this.tableLayer.addChild(ch);

    // Title, return line, panel, controls.
    const title = glowText('KRISTALL-BACCARAT', { fontFamily: FONT_DISPLAY, fontSize: L.mode === 'tall' ? 30 : 28, fill: 0xfff6e6, letterSpacing: 3 }, { color: 0x9fd8ff, distance: 12, outerStrength: 2 });
    title.anchor.set(L.mode === 'tall' ? 0.5 : 0, 0.5);
    title.position.set(L.mode === 'tall' ? L.W / 2 : 24, 30);
    this.rtpText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '600', fill: 0xe6d6b4, align: 'center', lineHeight: 20 } });
    this.rtpText.anchor.set(0.5, 0);
    this.rtpText.position.set(L.mode === 'tall' ? L.W / 2 : 1140, L.mode === 'tall' ? 52 : 484);
    const pw = L.mode === 'wide' ? 262 : L.W - 20;
    const py = L.mode === 'wide' ? 80 : T.y + g.h - 10;
    const ph = L.mode === 'wide' ? 566 : L.H - py - 6;
    const panel = new Sprite(panelTexture(pw, ph, { velvet: 0x3a1420 }));
    panel.position.set((L.mode === 'wide' ? 1009 : 10) - PANEL_PAD, py - PANEL_PAD);
    this.status?.destroy();
    this.status = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: 0xfff6e6, stroke: { color: 0x14080f, width: 6 }, letterSpacing: 1, align: 'center' } });
    this.status.anchor.set(0.5);
    const sy = L.mode === 'wide' ? T.y + 440 : T.y + 512;
    this.status.position.set(T.x + g.cx, sy);
    const tip = label('DEIN TIPP', 16, 0xd9c6a0);
    tip.anchor.set(0.5);
    this.ui.addChild(panel, title, this.rtpText, tip, this.sideBtns.player, this.sideBtns.tie, this.sideBtns.banker, this.stake.view, this.dealBtn, this.infoBtn, this.roadLayer);
    this.fxLayer.addChild(this.status);
    for (const s of ['player', 'banker'] as const) this.fxLayer.addChild(this.badges[s].view);
    if (L.mode === 'wide') {
      const cx = 1140;
      this.infoBtn.position.set(1236, 40);
      tip.position.set(cx, 102);
      this.sideBtns.player.position.set(cx, 138);
      this.sideBtns.tie.position.set(cx, 196);
      this.sideBtns.banker.position.set(cx, 254);
      this.stake.view.position.set(cx, 340);
      this.dealBtn.position.set(cx, 430);
      this.roadLayer.position.set(cx - 112, 618);
    } else {
      this.infoBtn.position.set(L.W - 40, 40);
      tip.position.set(L.W / 2, py + 26);
      this.sideBtns.player.position.set(108, py + 72);
      this.sideBtns.tie.position.set(300, py + 72);
      this.sideBtns.banker.position.set(492, py + 72);
      this.stake.view.position.set(160, py + 168);
      this.dealBtn.position.set(436, py + 164);
      this.roadLayer.position.set(L.W / 2 - 112, py + 236);
    }
    this.drawRoad();
    this.choose(this.side, true);
    this.relayout();
  }

  private relayout() {
    const L = this.L;
    const T = L.table;
    for (const s of ['player', 'banker'] as const) {
      const b = L.geo.boxes[s];
      this.views[s].forEach((v, i) => {
        const p = this.cardSpot(s, i, Math.max(2, this.views[s].length));
        v.scale.set(L.cardScale);
        v.position.set(p.x, p.y);
      });
      this.badges[s].view.position.set(T.x + b.x, T.y + b.y - b.h / 2 - 2);
    }
    if (this.pile) {
      const f = L.geo.fields[this.side];
      this.pile.position.set(T.x + f.x + f.w / 2 - 40, T.y + f.y + f.h / 2 + 30);
    }
  }

  private cardSpot(s: 'player' | 'banker', i: number, n: number) {
    const L = this.L;
    const b = L.geo.boxes[s];
    const dx = CARD_W * L.cardScale + 6;
    return { x: L.table.x + b.x + (i - (n - 1) / 2) * dx, y: L.table.y + b.y - 8 + (i === 2 ? 6 : 0), rotation: i === 2 ? 0.05 : 0 };
  }

  private choose(s: Side, quiet = false) {
    if (this.phase !== 'idle' && !quiet) return;
    this.side = s;
    for (const k of SIDES) {
      this.sideBtns[k].setSelected(k === s);
      this.fieldGlow[k].alpha = k === s ? 1 : 0;
    }
    const others = SIDES.filter((k) => k !== s).map((k) => `${SIDE_LABEL[k]} ${pct(RTP[k])}`).join(' · ');
    this.rtpText.text =
      this.L.mode === 'wide'
        ? `Auszahlungsquote ${pct(RTP[s])}\nHausvorteil ${pct(1 - RTP[s])} (${SIDE_LABEL[s]})\n${others.replace('Unentschieden', 'Unent.')}`
        : `Auszahlungsquote ${pct(RTP[s])} · Hausvorteil ${pct(1 - RTP[s])} (${SIDE_LABEL[s]})\n${others}`;
    readable(this.rtpText, 17, this.textScale, this.L.mode === 'wide' ? 250 : this.L.W - 110);
    if (!quiet) this.ctx.sfx.chip();
  }

  resize(w: number, h: number) {
    const mode: Mode = w / h >= 1 ? 'wide' : 'tall';
    if (mode !== this.L.mode) {
      this.L = layoutFor(mode);
      this.build();
    }
    const L = this.L;
    const s = Math.min(w / L.W, h / L.H) * 0.98;
    this.root.scale.set(s);
    this.root.position.set((w - L.W * s) / 2, (h - L.H * s) / 2);
    this.textScale = s;
    readable(this.rtpText, 17, s, L.mode === 'wide' ? 250 : L.W - 110);
    this.rules.layout(w, h);
  }

  // ---- Round ------------------------------------------------------------------------------------

  private ms(n: number) {
    return this.hurry ? Math.min(n, 120) : n;
  }

  private setControls(on: boolean) {
    for (const s of SIDES) this.sideBtns[s].setEnabled(on);
    this.stake.setEnabled(on);
    this.dealBtn.setEnabled(on);
  }

  private async clearTable() {
    const all = [...this.views.player, ...this.views.banker];
    this.views = { player: [], banker: [] };
    this.badges.player.hide();
    this.badges.banker.hide();
    this.boxGlow.player.alpha = 0;
    this.boxGlow.banker.alpha = 0;
    this.status.text = '';
    this.pile?.destroy({ children: true });
    this.pile = null;
    await Promise.all(
      all.map((v, i) =>
        reducedMotion()
          ? Promise.resolve(v.destroy({ children: true }))
          : wait(i * 25).then(() =>
              animate(240, (k) => {
                if (v.destroyed) return;
                v.y -= 14 * k;
                v.alpha = 1 - k;
              }).then(() => v.destroy({ children: true })),
            ),
      ),
    );
  }

  async play() {
    if (this.phase !== 'idle' || this.dead) return;
    const bet = this.stake.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.phase = 'playing';
    this.hurry = false;
    this.setControls(false);
    await this.clearTable();
    if (this.dead) return;
    // The chip goes onto the chosen field.
    const f = this.L.geo.fields[this.side];
    this.pile = chipPile(bet, this.stake.unit);
    this.chipLayer.addChild(this.pile);
    const px = this.L.table.x + f.x + f.w / 2 - 40;
    const py = this.L.table.y + f.y + f.h / 2 + 30;
    this.pile.position.set(px, py + 60);
    this.ctx.sfx.chip();
    void slide(this.pile, px, py, 260);
    // The whole coup is decided now from a freshly shuffled shoe; the table only shows it.
    this.shoe.shuffle();
    const coup = playCoup(() => this.shoe.draw());
    await this.show(coup);
    if (this.dead) return;
    await this.settle(coup, bet);
  }

  /** Deals the four cards face down, then reveals them (squeezing the decisive ones). */
  private async show(coup: Coup) {
    const L = this.L;
    const mouth = { x: L.table.x + L.geo.cx, y: L.mode === 'wide' ? 180 : L.table.y + 40 };
    const order: ['player' | 'banker', Card][] = [['player', coup.player[0]], ['banker', coup.banker[0]], ['player', coup.player[1]], ['banker', coup.banker[1]]];
    for (const [s, c] of order) {
      const v = new CardView(c, { faceUp: false });
      v.scale.set(L.cardScale);
      this.cardLayer.addChild(v);
      this.views[s].push(v);
      const to = this.cardSpot(s, this.views[s].length - 1, 2);
      this.ctx.sfx.cardDeal();
      await dealCard(v, mouth, to, this.ms(280));
      if (this.dead) return;
    }
    // Spieler first, then Bank: the first card flips, the second is squeezed.
    for (const s of ['player', 'banker'] as const) {
      this.ctx.sfx.cardFlip();
      await this.views[s][0].flip(true, this.ms(320));
      this.updateBadge(s, coup, 1);
      await this.squeeze(this.views[s][1]);
      if (this.dead) return;
      this.updateBadge(s, coup, 2);
      await wait(this.ms(200));
    }
    if (coup.natural) {
      const p = total(coup.player.slice(0, 2));
      const b = total(coup.banker.slice(0, 2));
      this.status.text = `NATURAL ${Math.max(p, b)}!`;
      this.popStatus();
      this.flare = 1;
      this.ctx.sfx.shimmer();
      await wait(this.ms(700));
      return;
    }
    // Third cards by the tableau.
    for (const s of ['player', 'banker'] as const) {
      const cards = coup[s];
      if (cards.length < 3) {
        if (s === 'player') {
          this.status.text = 'Spieler steht';
          await wait(this.ms(500));
        }
        continue;
      }
      this.status.text = s === 'player' ? 'Spieler zieht' : 'Bank zieht';
      this.popStatus();
      // Make room for the third card.
      this.views[s].forEach((v, i) => {
        const p = this.cardSpot(s, i, 3);
        void slide(v, p.x, p.y, this.ms(220));
      });
      const v = new CardView(cards[2], { faceUp: false });
      v.scale.set(L.cardScale);
      this.cardLayer.addChild(v);
      this.views[s].push(v);
      this.ctx.sfx.cardDeal();
      await dealCard(v, mouth, this.cardSpot(s, 2, 3), this.ms(300));
      await this.squeeze(v);
      if (this.dead) return;
      this.updateBadge(s, coup, 3);
      await wait(this.ms(300));
    }
    this.status.text = '';
  }

  private popStatus() {
    if (reducedMotion()) return;
    this.status.scale.set(0.5);
    void tween(this.status.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  private updateBadge(s: 'player' | 'banker', coup: Coup, n: number) {
    const v = total(coup[s].slice(0, n));
    this.badges[s].set(`${SIDE_LABEL[s].toUpperCase()} ${v}`, n === 2 && v >= 8 ? 'gold' : 'plain');
    this.badges[s].pop();
  }

  /**
   * The squeeze: the card is lifted to the middle of the table, enlarged, and its corner
   * peeled back in two slow pulls before it snaps open. Tap/Space hurries it.
   */
  private async squeeze(v: CardView) {
    const card = v.card!;
    if (reducedMotion() || this.hurry) {
      this.ctx.sfx.cardFlip();
      await v.flip(true, this.ms(260));
      return;
    }
    const L = this.L;
    const home = { x: v.x, y: v.y, r: v.rotation };
    const sq = new SqueezeView(card, 'corner');
    sq.position.set(v.x, v.y);
    sq.rotation = v.rotation;
    sq.scale.set(L.cardScale);
    v.visible = false;
    this.stageLayer.addChild(sq);
    const big = L.mode === 'wide' ? 1.55 : 1.7;
    const at = { x: L.table.x + L.stage.x, y: L.table.y + L.stage.y };
    // A dim veil focuses the table on the card.
    const veil = new Graphics().rect(0, 0, L.W, L.H).fill({ color: 0x0a0410, alpha: 0.45 });
    veil.alpha = 0;
    this.stageLayer.addChildAt(veil, 0);
    void tween(veil, { alpha: 1 }, 200);
    await Promise.all([tween(sq, { x: at.x, y: at.y, rotation: -0.08 }, this.ms(320), ease.outCubic), tween(sq.scale, { x: big, y: big }, this.ms(320), ease.outCubic)]);
    // Two slow pulls on the corner, a breath in between.
    const pull = async (from: number, to: number, ms: number) => {
      this.ctx.sfx.cardPeel(ms / 1000);
      await animate(this.ms(ms), (k) => !sq.destroyed && sq.set(from + (to - from) * k), ease.inOutCubic);
    };
    await pull(0, 0.3, 620);
    await wait(this.ms(320));
    await pull(0.3, 0.56, 560);
    await wait(this.ms(220));
    await pull(0.56, 1, 240);
    this.ctx.sfx.cardFlip();
    if (this.dead) return;
    void tween(veil, { alpha: 0 }, 220).then(() => veil.destroy());
    await Promise.all([tween(sq, { x: home.x, y: home.y, rotation: home.r }, this.ms(300), ease.inOutCubic), tween(sq.scale, { x: L.cardScale, y: L.cardScale }, this.ms(300), ease.inOutCubic)]);
    sq.destroy({ children: true });
    if (v.destroyed) return;
    v.faceUp = true;
    v.pose(0, 0);
    v.visible = true;
  }

  private async settle(coup: Coup, bet: number) {
    const L = this.L;
    const T = L.table;
    const side = this.side;
    const back = returnFor(side, coup.winner);
    const win = Math.floor(bet * back);
    const tags = ['baccarat', side];
    if (coup.natural) tags.push('natural');
    // Show who won.
    const p = total(coup.player);
    const b = total(coup.banker);
    this.status.text = coup.winner === 'tie' ? `UNENTSCHIEDEN ${p} : ${b}` : `${SIDE_LABEL[coup.winner].toUpperCase()} GEWINNT ${Math.max(p, b)} : ${Math.min(p, b)}`;
    this.status.style.fill = coup.winner === side ? COLORS.lamp : 0xfff6e6;
    this.popStatus();
    if (coup.winner !== 'tie') {
      const gl = this.boxGlow[coup.winner];
      gl.alpha = 1;
      this.views[coup.winner].forEach((v) => v.setGlow(0.6, SIDE_COLOR[coup.winner]));
    } else {
      for (const s of ['player', 'banker'] as const) this.boxGlow[s].alpha = 0.6;
    }
    this.road.push(coup.winner);
    if (this.road.length > 8) this.road.shift();
    this.drawRoad();
    // Chips.
    const f = L.geo.fields[side];
    const fx = T.x + f.x + f.w / 2 - 40;
    const fy = T.y + f.y + f.h / 2 + 30;
    if (this.pile) {
      if (win === 0) {
        void slide(this.pile, T.x + L.geo.cx, T.y + 120, 420).then(() => this.pile && tween(this.pile, { alpha: 0 }, 160));
      } else if (win > bet) {
        const paid = chipPile(win - bet, this.stake.unit);
        paid.position.set(T.x + L.geo.cx - fx, T.y + 120 - fy);
        this.pile.addChild(paid);
        void slide(paid, -30, 0, 460);
      }
    }
    if (win > 0) this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'baccarat', stake: bet, win, rtp: RTP[side], tags });
    if (win > bet) this.flare = 1;
    if (win === 0) this.ctx.sfx.lose();
    await presentWin(this.ctx, this.root, {
      stake: bet,
      win,
      at: { x: fx, y: fy - 30 },
      area: { x: T.x + L.geo.cx - L.geo.rx + 20, y: T.y + L.geo.cy - L.geo.ry + 20, w: L.geo.rx * 2 - 40, h: L.geo.ry * 2 - 40 },
    });
    if (win === bet) this.status.text += '\nEinsatz zurück';
    await wait(300);
    if (this.dead) return;
    this.phase = 'idle';
    this.setControls(true);
  }

  private drawRoad() {
    this.roadLayer.removeChildren().forEach((c) => c.destroy());
    this.road.forEach((s, i) => {
      const b = new Sprite(beadTexture(s));
      b.anchor.set(0.5);
      b.width = b.height = 28;
      b.position.set(i * 32, 0);
      b.alpha = 0.55 + 0.45 * ((i + 1) / this.road.length);
      this.roadLayer.addChild(b);
    });
    if (!this.road.length) {
      const t = new Text({ text: 'Kristall-Tafel: die letzten Coups', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xb8a684 } });
      t.anchor.set(0, 0.5);
      t.x = -6;
      this.roadLayer.addChild(t);
    }
  }

  update(dtMs: number) {
    this.stake.update(this.busy());
    this.time += dtMs;
    this.flare = Math.max(0, this.flare - dtMs / 1600);
    const calm = reducedMotion();
    this.candles.forEach((s, i) => {
      const fl = calm ? 0 : Math.sin(this.time / 90 + i * 1.7) * 0.06 + Math.sin(this.time / 37 + i) * 0.04;
      s.alpha = 0.6 + fl + this.flare * 0.4;
      s.width = s.height = 46 + this.flare * 30;
    });
    for (const g of this.glints) {
      if (calm) break;
      g.t += dtMs;
      if (g.t > g.p) {
        g.t = 0;
        g.p = 900 + Math.random() * 2200;
        g.s.position.set(30 + Math.random() * (CHANDELIER_W - 60), 100 + Math.random() * 80);
        g.s.rotation = Math.random();
      }
      const k = g.t / 500;
      g.s.alpha = k < 1 ? Math.sin(k * Math.PI) * (0.8 + this.flare * 0.2) : 0;
      g.s.scale.set(0.5 + Math.sin(Math.min(1, k) * Math.PI) * 0.4 + this.flare * 0.3);
    }
  }

  busy() {
    return this.phase !== 'idle';
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

export const baccarat: GameDefinition = {
  id: 'baccarat',
  name: 'Kristall-Baccarat',
  houseEdge: 1 - RTP.player,
  footprint: { w: 146, h: 84 },
  size: 'table',
  blurb: 'Spieler, Bank oder Unentschieden – unterm Kristalllüster, Karten werden gequetscht.',
  drawStation: () => station(),
  create: (ctx) => new BaccaratGame(ctx),
};
