// "Nachtfalter 21": blackjack at a half-moon table in plum felt, dealt from a six-deck shoe by
// a moth croupier who reacts to every hand. Twist: once per day the "Glückskarte" lets the
// player put back the card they just drew and draw a new one.
//
// Report tags: 'blackjack' (every round), 'bj' (player natural), 'bust' (a player hand went
// over 21), 'push' (a hand tied), 'double' (doubled down), 'split' (split a pair),
// 'luck' (the Glückskarte was used).

import { Container, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture, reducedMotion } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { PANEL_PAD, panelTexture } from '../../ui/kit';
import { Shoe, cardName, type Card } from '../cards/cards';
import { CARD_H, CARD_W, CardView, SHOE_MOUTH, dealCard, shoeTexture } from '../cards/cardArt';
import { Bubble, RulesCard, StakeControl, TotalBadge, chipPile, infoButton, pct, presentWin, readable, rtpLine, slide } from '../cards/tableKit';
import { RULES, canDouble, canSplit, dealerShouldHit, handValue, isNatural, newHand, settleHand, type Hand } from './rules';
import { DEALER_H, DEALER_NECK, DEALER_W, HEAD_NECK, dealerBodyTexture, dealerHeadTexture, station, tableTexture, type Face, type TableGeo } from './paint';

/** Basic-strategy return per initial stake and per Falter wagered (scripts/rtp-blackjack.mjs, 20 M rounds). */
export const RTP_INITIAL = 0.96;
export const RTP_WAGERED = 0.9648;

const BETS = [10, 20, 50, 100, 200, 500];
const RULE_LINES = ['BLACKJACK ZAHLT 6:5', 'BANK ZIEHT AUF SOFT 17', '17 GEGEN 17 GEWINNT DIE BANK'];
const LUCK_KEY = 'bjLuck';

type Phase = 'idle' | 'dealing' | 'player' | 'luck' | 'dealer';
type Mode = 'wide' | 'tall';

interface Layout {
  mode: Mode;
  W: number;
  H: number;
  /** Top left of the table texture. */
  table: { x: number; y: number };
  geo: TableGeo;
  cardScale: number;
  dealerRowY: number;
  playerRowY: number;
  splitDX: number;
  discard: { x: number; y: number };
  shoeScale: number;
}

function layoutFor(mode: Mode): Layout {
  if (mode === 'wide') {
    return {
      mode,
      W: 1280,
      H: 660,
      table: { x: 0, y: 0 },
      geo: { w: 1000, h: 660, edgeY: 215, bottom: 600, circle: { x: 500, y: 566, r: 46 }, shoe: { x: 830, y: 110 }, rules: RULE_LINES, rulesY: 392, splitRules: true },
      cardScale: 0.8,
      dealerRowY: 300,
      playerRowY: 476,
      splitDX: 190,
      discard: { x: 110, y: 270 },
      shoeScale: 1,
    };
  }
  return {
    mode,
    W: 600,
    H: 1120,
    table: { x: 0, y: 96 },
    geo: { w: 600, h: 760, edgeY: 215, bottom: 700, circle: { x: 300, y: 652, r: 42 }, shoe: { x: 462, y: 112 }, rules: RULE_LINES, rulesY: 396, splitRules: false },
    cardScale: 0.8,
    dealerRowY: 300,
    playerRowY: 520,
    splitDX: 148,
    discard: { x: 70, y: 260 },
    shoeScale: 0.8,
  };
}

interface Seat {
  hand: Hand;
  views: CardView[];
  badge: TotalBadge;
  pile: Container;
  lucky: boolean;
  /** Centre x of this hand on the table. */
  x: number;
  label: Text | null;
}

class Dealer {
  readonly view = new Container();
  private head: Sprite;
  private body: Sprite;
  private face: Face = 'neutral';
  private until = 0;
  private t = 0;
  private nextBlink = 2500;
  readonly bubble = new Bubble(250);

  constructor() {
    this.body = new Sprite(dealerBodyTexture());
    this.head = new Sprite(dealerHeadTexture('neutral'));
    this.head.anchor.set(HEAD_NECK.x / this.head.texture.width, HEAD_NECK.y / this.head.texture.height);
    this.head.position.set(DEALER_NECK.x, DEALER_NECK.y + 8);
    this.view.addChild(this.body, this.head);
    this.bubble.view.position.set(DEALER_W / 2 + 150, 40);
    this.view.addChild(this.bubble.view);
  }

  react(face: Face, text?: string, ms = 1600) {
    this.face = face;
    this.head.texture = dealerHeadTexture(face);
    this.until = this.t + ms;
    if (text) this.bubble.say(text, Math.max(ms, 1500));
    if (!reducedMotion()) {
      const y0 = DEALER_NECK.y + 8;
      void animate(320, (k) => {
        if (this.head.destroyed) return;
        this.head.y = y0 - Math.sin(k * Math.PI) * (face === 'oh' ? 10 : 5);
        this.head.rotation = (face === 'smug' ? 0.08 : face === 'sad' ? -0.06 : 0) * Math.sin(k * Math.PI * 0.5);
      }, ease.outCubic);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.bubble.update(dt);
    // Breathing.
    if (!reducedMotion()) this.body.scale.y = 1 + Math.sin(this.t / 900) * 0.006;
    if (this.face !== 'neutral' && this.t > this.until) {
      this.face = 'neutral';
      this.head.texture = dealerHeadTexture('neutral');
      this.head.rotation = 0;
    }
    if (this.face === 'neutral' && this.t > this.nextBlink) {
      this.head.texture = dealerHeadTexture('blink');
      if (this.t > this.nextBlink + 130) {
        this.head.texture = dealerHeadTexture('neutral');
        this.nextBlink = this.t + 2200 + Math.random() * 3200;
      }
    }
  }
}

class BlackjackGame implements GameInstance {
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
  private shoe = new Shoe(RULES.decks, 0.25);
  private dealer = new Dealer();
  private dealerCards: Card[] = [];
  private dealerViews: CardView[] = [];
  private dealerBadge = new TotalBadge(26);
  private seats: Seat[] = [];
  private active = 0;
  private stake: StakeControl;
  private rules: RulesCard;
  private dead = false;
  private shoeSprite!: Sprite;
  private btn: Record<'deal' | 'hit' | 'stand' | 'double' | 'split' | 'luck' | 'next' | 'info', Button>;
  private rtpText!: Text;
  private luckNote!: Text;
  private title!: Sprite;
  private usedLuck = false;
  private keyHandler = (e: KeyboardEvent) => {
    if (this.rules.open) {
      if (e.code === 'Escape') this.rules.hide();
      return;
    }
    const k = e.code;
    if (k === 'Space') {
      e.preventDefault();
      if (this.phase === 'idle') void this.deal();
      else if (this.phase === 'luck') this.act('next');
    } else if (k === 'KeyZ') this.act('hit');
    else if (k === 'KeyH') this.act('stand');
    else if (k === 'KeyV') this.act('double');
    else if (k === 'KeyT') this.act('split');
    else if (k === 'KeyG') this.act('luck');
  };

  constructor(private ctx: GameContext) {
    this.stake = new StakeControl(ctx, BETS, 1);
    this.rules = new RulesCard("SO GEHT'S", [
      '• Ziel: näher an 21 als die Bank, ohne darüber zu kommen. Bilder zählen 10, das Ass 1 oder 11.',
      '• Blackjack (Ass + Zehnerkarte als erste zwei Karten) zahlt 6:5. Sonst zahlt ein Sieg 1:1, Gleichstand gibt den Einsatz zurück.',
      '• Die Bank zieht bis 16 und auf Soft 17. Bei 17 gegen 17 gewinnt die Bank.',
      '• Verdoppeln auf den ersten zwei Karten (nicht nach dem Teilen). Ein Paar einmal teilen; geteilte Asse bekommen je eine Karte.',
      '• Glückskarte: einmal pro Tag die zuletzt gezogene Karte zurücklegen und neu ziehen. Eine so entstandene 21 ist kein Blackjack.',
      '• 6 Decks im Schlitten, neu gemischt nach drei Vierteln.',
      `• Auszahlungsquote ${(RTP_INITIAL * 100).toFixed(1).replace('.', ',')} % mit Grundstrategie (20 Mio. simulierte Runden).`,
      '• Tasten: Leertaste geben · Z ziehen · H halten · V verdoppeln · T teilen · G Glückskarte.',
    ], 600);
    this.btn = {
      deal: button({ label: 'GEBEN', width: 236, height: 88, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 30, onClick: () => void this.deal() }),
      hit: button({ label: 'ZIEHEN', width: 236, height: 62, color: 0x2a6a4a, textColor: 0xfff6e6, fontSize: 24, onClick: () => this.act('hit') }),
      stand: button({ label: 'HALTEN', width: 236, height: 62, color: 0x7a1d34, textColor: 0xfff6e6, fontSize: 24, onClick: () => this.act('stand') }),
      double: button({ label: 'VERDOPPELN', width: 236, height: 62, color: 0x8a5a14, textColor: 0xfff6e6, fontSize: 22, onClick: () => this.act('double') }),
      split: button({ label: 'TEILEN', width: 236, height: 62, color: 0x2a3a7a, textColor: 0xfff6e6, fontSize: 24, onClick: () => this.act('split') }),
      luck: button({ label: 'GLÜCKSKARTE', width: 236, height: 58, color: 0x4a1a6a, textColor: 0xffe7a8, fontSize: 21, onClick: () => this.act('luck') }),
      next: button({ label: 'WEITER', width: 236, height: 62, color: 0x3a2a3a, textColor: 0xfff6e6, fontSize: 24, onClick: () => this.act('next') }),
      info: infoButton(() => this.rules.toggle()),
    };
    this.view.addChild(this.root);
    this.root.addChild(this.tableLayer, this.chipLayer, this.cardLayer, this.fxLayer, this.ui, this.stageLayer);
    this.view.addChild(this.rules.view);
    this.usedLuck = this.luckUsedToday();
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
    this.dealer.react('happy', 'Willkommen am Tisch!', 1800);
  }

  // ---- Building and layout -------------------------------------------------------------------

  private build() {
    const L = this.L;
    // The croupier survives a rebuild; everything else on the table is painted anew.
    this.dealer.view.removeFromParent();
    this.dealer.bubble.view.removeFromParent();
    this.tableLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ui.removeChildren();
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(L.table.x + L.geo.w / 2, L.table.y + L.geo.edgeY + 160);
    halo.width = L.geo.w * 1.5;
    halo.height = L.geo.h * 1.2;
    halo.tint = 0xb08ae0;
    halo.alpha = 0.16;
    halo.blendMode = 'add';
    this.tableLayer.addChild(halo);
    // The croupier stands behind the table.
    this.dealer.view.position.set(L.table.x + L.geo.w / 2 - DEALER_W / 2, L.table.y + L.geo.edgeY + 18 - DEALER_H);
    this.dealer.bubble.view.x = L.mode === 'tall' ? DEALER_W / 2 + 120 : DEALER_W / 2 + 170;
    this.tableLayer.addChild(this.dealer.view);
    const table = new Sprite(tableTexture(L.geo));
    table.position.set(L.table.x, L.table.y);
    this.tableLayer.addChild(table);
    this.shoeSprite = new Sprite(shoeTexture());
    this.shoeSprite.scale.set(L.shoeScale);
    this.shoeSprite.position.set(L.table.x + L.geo.shoe.x, L.table.y + L.geo.shoe.y);
    this.tableLayer.addChild(this.shoeSprite);
    // The bubble must sit above the table.
    this.tableLayer.addChild(this.dealer.bubble.view);
    this.dealer.bubble.view.position.set(this.dealer.view.x + this.dealer.bubble.view.x, this.dealer.view.y + 40);

    this.title?.destroy();
    this.title = glowText('NACHTFALTER 21', { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xfff6e6, letterSpacing: 3 }, { color: 0xb08ae0, distance: 12, outerStrength: 2 });
    this.title.anchor.set(L.mode === 'tall' ? 0.5 : 0, 0.5);
    this.title.position.set(L.mode === 'tall' ? L.W / 2 : 26, 34);
    this.rtpText?.destroy();
    this.rtpText = new Text({
      text: L.mode === 'wide' ? `Auszahlungsquote ${pct(RTP_INITIAL)}\nHausvorteil ${pct(1 - RTP_INITIAL)}\nmit Grundstrategie` : `${rtpLine(RTP_INITIAL)}\nmit Grundstrategie`,
      style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '600', fill: 0xe6d6b4, align: L.mode === 'tall' ? 'center' : 'left', lineHeight: 20 },
    });
    this.rtpText.anchor.set(L.mode === 'tall' ? 0.5 : 0, 0);
    this.rtpText.position.set(L.mode === 'tall' ? L.W / 2 : 28, 58);
    this.luckNote?.destroy();
    this.luckNote = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '600', fill: 0xc8b0f0, align: 'center' } });
    this.luckNote.anchor.set(0.5);
    // Velvet panel behind the controls.
    const pw = L.mode === 'wide' ? 262 : L.W - 20;
    const ph = L.mode === 'wide' ? 560 : L.H - (L.table.y + L.geo.h) - 6;
    const panel = new Sprite(panelTexture(pw, ph));
    panel.position.set((L.mode === 'wide' ? 1009 : 10) - PANEL_PAD, (L.mode === 'wide' ? 80 : L.table.y + L.geo.h) - PANEL_PAD);
    this.ui.addChild(panel, this.title, this.rtpText, this.luckNote);
    this.dealerBadge.view.removeFromParent();
    this.fxLayer.addChild(this.dealerBadge.view);
    for (const b of Object.values(this.btn)) this.ui.addChild(b);
    this.ui.addChild(this.stake.view);
    this.placeControls();
    this.relayoutCards(false);
  }

  private placeControls() {
    const L = this.L;
    const b = this.btn;
    if (L.mode === 'wide') {
      const cx = 1140;
      b.info.position.set(1236, 40);
      this.stake.view.position.set(cx, 200);
      b.deal.position.set(cx, 316);
      const ys = [290, 362, 434, 506];
      b.hit.position.set(cx, ys[0]);
      b.next.position.set(cx, ys[0]);
      b.stand.position.set(cx, ys[1]);
      b.double.position.set(cx, ys[2]);
      b.split.position.set(cx, ys[3]);
    } else {
      b.info.position.set(L.W - 40, 40);
      const y0 = L.table.y + L.geo.h;
      this.stake.view.position.set(L.W / 2, y0 + 50);
      b.deal.position.set(L.W / 2, y0 + 160);
      const cols = [155, 445];
      const rows = [y0 + 124, y0 + 196];
      b.hit.position.set(cols[0], rows[0]);
      b.next.position.set(cols[0], rows[0]);
      b.stand.position.set(cols[1], rows[0]);
      b.double.position.set(cols[0], rows[1]);
      b.split.position.set(cols[1], rows[1]);
      for (const k of ['hit', 'next', 'stand', 'double', 'split'] as const) b[k].scale.set(1);
    }
    this.refreshButtons();
  }

  private refreshButtons() {
    const b = this.btn;
    const p = this.phase;
    const idle = p === 'idle';
    const seat = this.seats[this.active];
    const playing = p === 'player' && !!seat;
    this.stake.view.visible = idle || p === 'dealing';
    this.stake.setEnabled(idle);
    b.deal.visible = idle || p === 'dealing';
    b.deal.setEnabled(idle);
    b.hit.visible = playing;
    b.stand.visible = playing;
    b.double.visible = playing;
    b.split.visible = playing;
    b.next.visible = p === 'luck';
    if (playing) {
      b.double.setEnabled(canDouble(seat.hand) && this.ctx.state.canAfford(this.stake.bet));
      b.split.setEnabled(canSplit(seat.hand, this.seats.length) && this.ctx.state.canAfford(this.stake.bet));
    }
    // The Glückskarte sits where the stake was while a hand is played.
    const L = this.L;
    const y0 = L.table.y + L.geo.h;
    const atIdle = idle || p === 'dealing';
    if (L.mode === 'wide') {
      b.luck.position.set(1140, atIdle ? 420 : 196);
      this.luckNote.position.set(1140, atIdle ? 470 : 200);
    } else {
      b.luck.position.set(L.W / 2, atIdle ? y0 + 236 : y0 + 46);
      this.luckNote.position.set(L.W / 2, atIdle ? y0 + 236 : y0 + 46);
    }
    const luckReady = !this.usedLuck && (playing || p === 'luck') && !!seat && seat.hand.cards.length >= 2;
    b.luck.visible = luckReady;
    this.luckNote.visible = !luckReady && (idle || playing || p === 'luck');
    this.luckNote.text = this.usedLuck ? 'Glückskarte: morgen wieder' : idle ? (L.mode === 'wide' ? '✦ Glückskarte bereit\n(1× heute)' : '✦ Glückskarte bereit (1× heute)') : '';
    readable(this.luckNote, 17, this.root.scale.x || 1, 240);
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
    readable(this.rtpText, 17, s, L.mode === 'wide' ? 300 : L.W - 120);
    readable(this.luckNote, 17, s, 240);
    this.rules.layout(w, h);
  }

  // ---- Positions ------------------------------------------------------------------------------

  private get cw() {
    return CARD_W * this.L.cardScale;
  }

  /** Where card i of n sits in a hand centred on x. */
  private cardPos(x: number, y: number, i: number, n: number) {
    const dx = this.cw * 0.42;
    return { x: x - ((n - 1) * dx) / 2 + i * dx, y: y - i * 4 };
  }

  private get dealerX() {
    return this.L.table.x + this.L.geo.w / 2;
  }

  private get dealerY() {
    return this.L.table.y + this.L.dealerRowY;
  }

  private get playerY() {
    return this.L.table.y + this.L.playerRowY;
  }

  private seatX(i: number, n: number) {
    const cx = this.L.table.x + this.L.geo.w / 2;
    return n === 1 ? cx : cx + (i === 0 ? -1 : 1) * this.L.splitDX;
  }

  private get shoeMouth() {
    const L = this.L;
    return { x: L.table.x + L.geo.shoe.x + SHOE_MOUTH.x * L.shoeScale, y: L.table.y + L.geo.shoe.y + SHOE_MOUTH.y * L.shoeScale };
  }

  private get circle() {
    const L = this.L;
    return { x: L.table.x + L.geo.circle.x, y: L.table.y + L.geo.circle.y };
  }

  /** Puts every card, badge and pile where it belongs (after a resize or a split). */
  private relayoutCards(animated: boolean) {
    const move = (v: Container, x: number, y: number) => (animated ? void slide(v, x, y, 260) : v.position.set(x, y));
    this.dealerViews.forEach((v, i) => {
      const p = this.cardPos(this.dealerX, this.dealerY, i, this.dealerViews.length);
      v.scale.set(this.L.cardScale);
      move(v, p.x, p.y);
    });
    const dn = this.dealerViews.length;
    const dl = this.cardPos(this.dealerX, this.dealerY, 0, Math.max(1, dn));
    this.dealerBadge.view.position.set(dl.x - this.cw / 2 - 40, this.dealerY);
    this.seats.forEach((s, si) => {
      s.x = this.seatX(si, this.seats.length);
      s.views.forEach((v, i) => {
        const p = this.cardPos(s.x, this.playerY, i, s.views.length);
        v.scale.set(this.L.cardScale);
        move(v, p.x, p.y);
      });
      const first = this.cardPos(s.x, this.playerY, 0, Math.max(1, s.views.length));
      s.badge.view.position.set(first.x - this.cw / 2 - 36, this.playerY + 20);
      const c = this.circle;
      const px = this.seats.length === 1 ? c.x : s.x + (si === 0 ? 50 : -50);
      move(s.pile, px, c.y + 8);
      if (s.label) s.label.position.set(s.x, this.playerY - CARD_H * this.L.cardScale * 0.5 - 22);
    });
  }

  // ---- Round --------------------------------------------------------------------------------------

  private luckUsedToday() {
    const d = this.ctx.state.data;
    return d.counters[LUCK_KEY] === d.season.number * 1000 + d.evening.number;
  }

  private draw() {
    return this.shoe.draw();
  }

  private async clearTable() {
    const all = [...this.dealerViews, ...this.seats.flatMap((s) => s.views)];
    const piles = this.seats.map((s) => s.pile);
    const labels = this.seats.map((s) => s.label).filter((l): l is Text => !!l);
    this.dealerViews = [];
    this.dealerCards = [];
    this.dealerBadge.hide();
    for (const s of this.seats) s.badge.view.destroy({ children: true });
    this.seats = [];
    labels.forEach((l) => l.destroy());
    piles.forEach((p) => p.destroy({ children: true }));
    if (!all.length) return;
    const d = this.L.discard;
    await Promise.all(
      all.map((v, i) =>
        reducedMotion()
          ? Promise.resolve(v.destroy({ children: true }))
          : wait(i * 30).then(() =>
              animate(260, (k) => {
                if (v.destroyed) return;
                v.x += (d.x - v.x) * k * 0.5;
                v.y += (d.y - v.y) * k * 0.5;
                v.alpha = 1 - k;
                v.rotation += 0.04;
              }).then(() => v.destroy({ children: true })),
            ),
      ),
    );
  }

  private newSeat(cards: Card[], fromSplit = false): Seat {
    const badge = new TotalBadge(24);
    this.fxLayer.addChild(badge.view);
    const pile = new Container();
    this.chipLayer.addChild(pile);
    return { hand: newHand(cards, fromSplit), views: [], badge, pile, lucky: false, x: this.dealerX, label: null };
  }

  /** Deals one card from the shoe to a seat (or the dealer when seat is null). */
  private async dealTo(seat: Seat | null, card: Card, faceUp: boolean) {
    const v = new CardView(card, { faceUp: false });
    v.scale.set(this.L.cardScale);
    this.cardLayer.addChild(v);
    const list = seat ? seat.views : this.dealerViews;
    list.push(v);
    const n = list.length;
    const x = seat ? seat.x : this.dealerX;
    const y = seat ? this.playerY : this.dealerY;
    // Earlier cards of the hand shuffle over to make room.
    list.forEach((o, i) => {
      if (o === v) return;
      const p = this.cardPos(x, y, i, n);
      void slide(o, p.x, p.y, 220);
    });
    const to = this.cardPos(x, y, n - 1, n);
    this.ctx.sfx.cardDeal();
    await dealCard(v, this.shoeMouth, { ...to, rotation: (Math.random() - 0.5) * 0.05 }, 300);
    if (faceUp) {
      this.ctx.sfx.cardFlip();
      await v.flip(true, 300);
    }
    return v;
  }

  private updateBadges(revealDealer: boolean) {
    for (const s of this.seats) {
      const v = handValue(s.hand.cards);
      const nat = isNatural(s.hand) && !s.lucky;
      s.badge.set(nat ? 'BJ' : v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total), nat ? 'gold' : v.total > 21 ? 'bad' : 'plain');
      s.badge.pop();
    }
    if (this.dealerCards.length) {
      const shown = revealDealer ? this.dealerCards : this.dealerCards.slice(0, 1);
      const v = handValue(shown);
      this.dealerBadge.set(revealDealer && isNatural({ cards: this.dealerCards }) ? 'BJ' : String(v.total), v.total > 21 ? 'bad' : 'plain');
    }
  }

  async deal() {
    if (this.phase !== 'idle' || this.dead) return;
    const bet = this.stake.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.phase = 'dealing';
    this.refreshButtons();
    await this.clearTable();
    if (this.dead) return;
    this.shoe.checkCut();
    if (this.shoe.shuffled) {
      this.shoe.shuffled = false;
      this.dealer.react('happy', 'Frisch gemischt – sechs Decks!', 1600);
    }
    const seat = this.newSeat([]);
    this.seats = [seat];
    this.relayoutCards(false);
    this.addChips(seat, bet);
    this.ctx.sfx.chip();
    // Decide all four cards now, then show them coming out of the shoe.
    const p1 = this.draw(), d1 = this.draw(), p2 = this.draw(), d2 = this.draw();
    seat.hand.cards.push(p1);
    await this.dealTo(seat, p1, true);
    this.dealerCards.push(d1);
    await this.dealTo(null, d1, true);
    seat.hand.cards.push(p2);
    await this.dealTo(seat, p2, true);
    this.dealerCards.push(d2);
    await this.dealTo(null, d2, false);
    if (this.dead) return;
    this.updateBadges(false);
    const up = d1.rank;
    const dealerNat = isNatural({ cards: this.dealerCards });
    if (up === 1 || up >= 10) {
      // The dealer peeks under her ace or ten.
      this.dealer.react('smug', 'Ich schaue kurz nach …', 900);
      const hole = this.dealerViews[1];
      if (!reducedMotion()) await animate(500, (k) => !hole.destroyed && hole.pose(Math.sin(k * Math.PI) * 0.5, Math.sin(k * Math.PI) * 0.25));
      if (this.dead) return;
    }
    if (dealerNat || isNatural(seat.hand)) {
      await this.revealHole();
      await this.settle();
      return;
    }
    this.phase = 'player';
    this.active = 0;
    this.markActive();
    this.refreshButtons();
  }

  private addChips(seat: Seat, amount: number) {
    const pile = chipPile(amount, this.stake.unit);
    pile.x = seat.pile.children.length ? 34 : 0;
    seat.pile.addChild(pile);
    if (!reducedMotion()) {
      pile.y = 60;
      pile.alpha = 0;
      void tween(pile, { y: 0, alpha: 1 }, 260, ease.outCubic);
    }
  }

  private markActive() {
    this.seats.forEach((s, i) => s.views.forEach((v) => v.setGlow(this.seats.length > 1 && i === this.active && this.phase === 'player' ? 0.55 : 0)));
  }

  /** Player buttons and keys. */
  act(what: 'hit' | 'stand' | 'double' | 'split' | 'luck' | 'next') {
    if (this.busyAct || this.dead) return;
    const seat = this.seats[this.active];
    if (!seat) return;
    if (what === 'luck') {
      if (this.usedLuck || (this.phase !== 'player' && this.phase !== 'luck') || seat.hand.cards.length < 2) return;
      void this.run(() => this.useLuck(seat));
      return;
    }
    if (what === 'next') {
      if (this.phase !== 'luck') return;
      void this.run(() => this.nextHand());
      return;
    }
    if (this.phase !== 'player') return;
    if (what === 'hit') void this.run(() => this.hit(seat));
    else if (what === 'stand') void this.run(() => this.nextHand());
    else if (what === 'double') {
      if (!canDouble(seat.hand)) return;
      if (!this.ctx.state.placeBet(this.stake.bet)) return this.ctx.toast('Nicht genug Falter zum Verdoppeln.');
      void this.run(() => this.double(seat));
    } else if (what === 'split') {
      if (!canSplit(seat.hand, this.seats.length)) return;
      if (!this.ctx.state.placeBet(this.stake.bet)) return this.ctx.toast('Nicht genug Falter zum Teilen.');
      void this.run(() => this.split(seat));
    }
  }

  private busyAct = false;
  private async run(fn: () => Promise<void>) {
    this.busyAct = true;
    for (const k of ['hit', 'stand', 'double', 'split', 'luck', 'next'] as const) this.btn[k].setEnabled(false);
    try {
      await fn();
    } finally {
      this.busyAct = false;
      if (!this.dead) {
        for (const k of ['hit', 'stand', 'luck', 'next'] as const) this.btn[k].setEnabled(true);
        this.refreshButtons();
      }
    }
  }

  private async hit(seat: Seat) {
    const c = this.draw();
    seat.hand.cards.push(c);
    await this.dealTo(seat, c, true);
    this.updateBadges(false);
    await this.afterCard(seat);
  }

  /** After a new card: bust (maybe offer the Glückskarte), 21 stands by itself. */
  private async afterCard(seat: Seat) {
    const v = handValue(seat.hand.cards).total;
    if (v > 21) {
      this.ctx.sfx.lose();
      seat.views.forEach((x) => x.setGlow(0.5, 0xff5f6a));
      if (!this.usedLuck) {
        this.dealer.react('oh', 'Überkauft! Glückskarte?', 1800);
        this.phase = 'luck';
        this.refreshButtons();
        return;
      }
      this.dealer.react('smug', 'Überkauft.', 1400);
      await wait(350);
      await this.nextHand();
      return;
    }
    if (v === 21 || seat.hand.done) {
      await wait(200);
      await this.nextHand();
    }
  }

  private async double(seat: Seat) {
    seat.hand.bet = 2;
    seat.hand.doubled = true;
    this.addChips(seat, this.stake.bet);
    this.ctx.sfx.chip();
    const c = this.draw();
    seat.hand.cards.push(c);
    const v = await this.dealTo(seat, c, false);
    // The doubled card comes in sideways, as at a real table.
    if (!reducedMotion()) void tween(v, { rotation: Math.PI / 2 }, 200);
    else v.rotation = Math.PI / 2;
    this.ctx.sfx.cardFlip();
    await v.flip(true, 320);
    seat.hand.done = true;
    this.updateBadges(false);
    await this.afterCard(seat);
  }

  private async split(seat: Seat) {
    const [a, b] = seat.hand.cards;
    seat.hand.cards = [a];
    seat.hand.fromSplit = true;
    const second = this.newSeat([b], true);
    this.addChips(second, this.stake.bet);
    this.ctx.sfx.chip();
    second.views.push(seat.views.pop()!);
    this.seats.push(second);
    this.relayoutCards(true);
    await wait(280);
    const c1 = this.draw();
    seat.hand.cards.push(c1);
    await this.dealTo(seat, c1, true);
    const c2 = this.draw();
    second.hand.cards.push(c2);
    await this.dealTo(second, c2, true);
    this.updateBadges(false);
    this.dealer.react('happy', 'Zwei Hände – mutig!', 1300);
    if (a.rank === 1) {
      // Split aces: one card each, then the dealer.
      seat.hand.done = true;
      second.hand.done = true;
      await wait(300);
      await this.dealerTurn();
      return;
    }
    this.markActive();
    if (handValue(seat.hand.cards).total === 21) await this.nextHand();
  }

  /** The Glückskarte: the last card of the hand goes back, a new one comes from the shoe. */
  private async useLuck(seat: Seat) {
    const d = this.ctx.state.data;
    d.counters[LUCK_KEY] = d.season.number * 1000 + d.evening.number;
    this.usedLuck = true;
    this.ctx.state.emit();
    seat.lucky = true;
    const old = seat.views.pop()!;
    const oldCard = seat.hand.cards.pop()!;
    seat.views.forEach((x) => x.setGlow(0));
    this.dealer.react('oh', 'Die Glückskarte!', 1300);
    this.ctx.sfx.shimmer();
    const g = this.fxLayer.toGlobal(old.position);
    this.ctx.particles.sparkle(g.x, g.y, 14, 0xc8a8ff, 120);
    await animate(reducedMotion() ? 1 : 380, (k) => {
      if (old.destroyed) return;
      old.y -= 6 * k;
      old.alpha = 1 - k;
      old.rotation += 0.05;
    });
    old.destroy({ children: true });
    void oldCard;
    const c = this.draw();
    seat.hand.cards.push(c);
    const v = await this.dealTo(seat, c, true);
    v.setGlow(0.6, 0xc8a8ff);
    void tween({ a: 0.6 }, { a: 0 }, 1200).then(() => !v.destroyed && v.setGlow(0));
    this.updateBadges(false);
    this.phase = 'player';
    if (seat.hand.doubled) seat.hand.done = true;
    await this.afterCard(seat);
    this.refreshButtons();
  }

  private async nextHand() {
    const seat = this.seats[this.active];
    if (seat) seat.hand.done = true;
    if (this.active < this.seats.length - 1) {
      this.active++;
      this.phase = 'player';
      this.markActive();
      this.refreshButtons();
      const s = this.seats[this.active];
      if (handValue(s.hand.cards).total === 21) await this.nextHand();
      return;
    }
    await this.dealerTurn();
  }

  private async revealHole() {
    const hole = this.dealerViews[1];
    if (!hole || hole.faceUp) return;
    this.ctx.sfx.cardFlip();
    await hole.flip(true, 420);
    this.updateBadges(true);
  }

  private async dealerTurn() {
    this.phase = 'dealer';
    this.markActive();
    this.refreshButtons();
    await this.revealHole();
    if (this.dead) return;
    const live = this.seats.some((s) => handValue(s.hand.cards).total <= 21);
    if (live) {
      while (dealerShouldHit(this.dealerCards)) {
        await wait(260);
        const c = this.draw();
        this.dealerCards.push(c);
        await this.dealTo(null, c, true);
        this.updateBadges(true);
        if (this.dead) return;
      }
    }
    await wait(250);
    await this.settle();
  }

  private async settle() {
    if (this.dead) return;
    this.updateBadges(true);
    const bet = this.stake.bet;
    let staked = 0;
    let win = 0;
    const tags = ['blackjack'];
    const dealerTotal = handValue(this.dealerCards).total;
    const dealerNat = isNatural({ cards: this.dealerCards });
    let best: 'bj' | 'win' | 'push' | 'lose' = 'lose';
    for (const s of this.seats) {
      // A 21 made with the Glückskarte counts as 21, not as a natural.
      const h = s.lucky ? { ...s.hand, fromSplit: true } : s.hand;
      const back = settleHand(h, this.dealerCards);
      const amount = Math.floor(back * bet);
      staked += s.hand.bet * bet;
      win += amount;
      const total = handValue(s.hand.cards).total;
      const nat = isNatural(h);
      if (nat && back > s.hand.bet) tags.push('bj');
      if (total > 21) tags.push('bust');
      if (s.hand.doubled) tags.push('double');
      let text: string;
      let color: number;
      if (back > s.hand.bet) {
        text = nat ? 'BLACKJACK!' : 'GEWONNEN';
        color = nat ? COLORS.lamp : 0x9af0b0;
        best = nat ? 'bj' : best === 'bj' ? best : 'win';
        s.views.forEach((v) => v.setGlow(0.7, nat ? 0xffcf7a : 0x9af0b0));
      } else if (back === s.hand.bet) {
        text = 'UNENTSCHIEDEN';
        color = 0xe6d6b4;
        tags.push('push');
        if (best === 'lose') best = 'push';
      } else {
        text = total > 21 ? 'ÜBERKAUFT' : dealerNat ? 'BANK: BLACKJACK' : total === 17 && dealerTotal === 17 ? '17 GEGEN 17' : 'VERLOREN';
        color = 0xff8a8a;
      }
      s.label = new Text({ text, style: { fontFamily: FONT_DISPLAY, fontSize: 24, fill: color, stroke: { color: 0x14080f, width: 5 }, letterSpacing: 1 } });
      s.label.anchor.set(0.5);
      s.label.position.set(s.x, this.playerY - CARD_H * this.L.cardScale * 0.5 - 22);
      this.fxLayer.addChild(s.label);
      if (!reducedMotion()) {
        s.label.scale.set(0.4);
        void tween(s.label.scale, { x: 1, y: 1 }, 280, ease.outBack);
      }
      // Chips: lost ones go to the rack, winners get paid beside them.
      if (amount === 0) {
        const rack = { x: this.dealerX, y: this.L.table.y + this.L.geo.edgeY + 10 };
        const local = { x: rack.x - s.pile.x, y: rack.y - s.pile.y };
        s.pile.children.forEach((c) => void slide(c, local.x, local.y, 420).then(() => tween(c, { alpha: 0 }, 160)));
      } else if (amount > s.hand.bet * bet) {
        const paid = chipPile(amount - s.hand.bet * bet, this.stake.unit);
        paid.position.set(this.dealerX - s.pile.x, this.L.table.y + this.L.geo.edgeY + 10 - s.pile.y);
        s.pile.addChild(paid);
        void slide(paid, -40, 0, 420);
      }
    }
    if (this.seats.length > 1) tags.push('split');
    if (this.seats.some((s) => s.lucky)) tags.push('luck');
    const uniq = [...new Set(tags)];
    if (win > 0) this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'blackjack', stake: staked, win, rtp: RTP_WAGERED, tags: uniq });
    // The croupier reacts.
    if (best === 'bj') this.dealer.react('oh', 'Blackjack! Bravo!', 2000);
    else if (best === 'win') this.dealer.react(dealerTotal > 21 ? 'sad' : 'happy', dealerTotal > 21 ? 'Oh – die Bank ist überkauft.' : 'Gut gespielt!', 1800);
    else if (best === 'push') this.dealer.react('neutral', 'Gleichstand.', 1400);
    else this.dealer.react('smug', dealerNat ? 'Blackjack für die Bank.' : 'Die Bank gewinnt.', 1600);
    if (win === 0) this.ctx.sfx.lose();
    const at = { x: this.seats[0].x, y: this.playerY };
    const L = this.L;
    await presentWin(this.ctx, this.root, {
      stake: staked,
      win,
      at,
      area: { x: L.table.x + 30, y: L.table.y + L.geo.edgeY, w: L.geo.w - 60, h: L.geo.bottom - L.geo.edgeY },
    });
    if (this.dead) return;
    this.phase = 'idle';
    this.placeControls();
  }

  update(dtMs: number) {
    this.stake.update(this.busy());
    this.dealer.update(dtMs);
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

/** For screen readers and tests: the cards as words. */
export const describeHand = (cards: Card[]) => cards.map(cardName).join(', ');

export const blackjack: GameDefinition = {
  id: 'blackjack',
  name: 'Nachtfalter 21',
  houseEdge: 1 - RTP_INITIAL,
  footprint: { w: 140, h: 84 },
  size: 'table',
  blurb: 'Blackjack am Halbmondtisch – mit einer Glückskarte pro Tag.',
  drawStation: () => station(),
  create: (ctx) => new BlackjackGame(ctx),
};

