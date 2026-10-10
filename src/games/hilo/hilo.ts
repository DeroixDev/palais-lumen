// "Kartenleiter": higher or lower? Every right call climbs one rung of a brass ladder and the
// moth climbs with it; cash out whenever you like, a wrong call drops everything. Each rung's
// multiplier comes from the true chance of the call, so the round returns exactly 95 % however
// you play and whenever you stop (see rules.ts and scripts/rtp-hilo.mjs).
//
// Report tags: 'hilo' (every round), 'rung5' / 'rung10' (the round reached rung 5 / 10),
// 'cashout' (the player cashed out with a win).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture, reducedMotion } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { PANEL_PAD, panelTexture } from '../../ui/kit';
import { formatChips } from '../../core/state';
import { freshDecks, RANK_NAME, type Card } from '../cards/cards';
import { CARD_H, CARD_W, CardView, backTexture, dealCard } from '../cards/cardArt';
import { RulesCard, StakeControl, infoButton, pct, presentWin, readable, rtpLine, slide } from '../cards/tableKit';
import { CALL_LABEL, MAX_MULT, MIRROR_BEST_RTP, RTP, RUNGS, cardRank, cashOut, chance, ladderRank, mirrorBest, mirrorChance, mirrorNext, mirrorRanks, mirrorRtp, nextMult, wins, type Call } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { LADDER_W, ladderTexture, mothTexture, plateTexture, station, stripTexture } from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const DECK = freshDecks(1);
const randomCard = (): Card => DECK[Math.floor(Math.random() * DECK.length)];

/** "1,46" / "12,4" / "350" */
export const fmtMult = (m: number) => (m >= 100 ? String(Math.floor(m)) : m >= 10 ? m.toFixed(1).replace('.', ',') : m.toFixed(2).replace('.', ','));

type Mode = 'wide' | 'tall';
type Phase = 'idle' | 'climb' | 'anim';

interface Layout {
  mode: Mode;
  W: number;
  H: number;
  ladder: { x: number; y: number; step: number };
  strip: { x: number; y: number; w: number; h: number };
  /** Card spot, deck and the trail row (design coordinates). */
  spot: { x: number; y: number; s: number };
  deck: { x: number; y: number; s: number };
  trail: { x: number; y: number; dx: number; s: number; n: number };
  info: { y: number };
}

function layoutFor(mode: Mode): Layout {
  if (mode === 'wide') {
    return {
      mode,
      W: 1280,
      H: 660,
      ladder: { x: 70, y: 46, step: 44 },
      strip: { x: 300, y: 60, w: 690, h: 580 },
      spot: { x: 600, y: 320, s: 1.3 },
      deck: { x: 868, y: 300, s: 0.9 },
      trail: { x: 352, y: 128, dx: 46, s: 0.4, n: 12 },
      info: { y: 470 },
    };
  }
  return {
    mode,
    W: 600,
    H: 1010,
    ladder: { x: 4, y: 96, step: 42 },
    strip: { x: 160, y: 96, w: 436, h: 606 },
    spot: { x: 370, y: 344, s: 1.4 },
    deck: { x: 530, y: 180, s: 0.58 },
    trail: { x: 206, y: 610, dx: 34, s: 0.3, n: 11 },
    info: { y: 500 },
  };
}

interface Rung {
  plate: Sprite;
  text: Text;
  glow: Sprite;
  y: number;
}

class HiloGame implements GameInstance {
  view = new Container();
  private root = new Container();
  private back = new Container();
  private ladderLayer = new Container();
  private cardLayer = new Container();
  private fx = new Container();
  private ui = new Container();
  private stageLayer = new Container();
  private L: Layout = layoutFor('wide');
  private phase: Phase = 'idle';
  private stake: StakeControl;
  private rules: RulesCard;
  private dead = false;
  private card: Card = randomCard();
  private cardView!: CardView;
  private trail: CardView[] = [];
  private rung = 0;
  private mult = 1;
  private staked = 0;
  private rungs: Rung[] = [];
  private moth!: Sprite;
  private mothGlow!: Sprite;
  private chanceText!: Text;
  private potText!: Text;
  private rtpText!: Text;
  private btn: Record<'higher' | 'lower' | 'same' | 'skip' | 'cash' | 'info', Button>;
  private time = 0;
  private odds: OddsWatch;
  /** Mondspiegel: the two ladder ranks (2..14) that will not come on the first call. */
  private mirror: [number, number] | null = null;
  private mirrorView = new Container();
  /** Return of this round (the first call's, with the mirror; later rungs are fair). */
  private roundRtp = RTP;
  private keyHandler = (e: KeyboardEvent) => {
    if (this.rules.open) {
      if (e.code === 'Escape') this.rules.hide();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.rung > 0) void this.cash();
      else void this.skip();
    } else if (e.code === 'KeyH') void this.call('higher');
    else if (e.code === 'KeyT') void this.call('lower');
    else if (e.code === 'KeyG') void this.call('same');
    else if (e.code === 'KeyK') void this.skip();
  };

  constructor(private ctx: GameContext) {
    this.stake = new StakeControl(ctx, BETS, 1);
    this.odds = new OddsWatch(ctx.state, 'hilo', ['mondspiegel']);
    this.rules = new RulesCard("SO GEHT'S", [
      '• Sag an, ob die nächste Karte höher oder tiefer ist. 2 ist die tiefste, das Ass die höchste Karte. Gleicher Rang verliert „Höher“ und „Tiefer“ – dafür gibt es den Tipp „Gleich“.',
      '• Jeder Treffer bringt dich eine Sprosse höher. Der Multiplikator jeder Sprosse kommt aus der echten Wahrscheinlichkeit deines Tipps (gemischt wird vor jeder Karte, alle 52 Karten).',
      `• Der Hausvorteil wird nur einmal genommen, auf der ersten Sprosse (${pct(RTP, 0)} der fairen Quote). Danach ist jede Sprosse fair – egal wann du auszahlst: Auszahlungsquote genau ${pct(RTP)}.`,
      `• Auszahlen jederzeit ab Sprosse 1. Oben (Sprosse ${RUNGS} oder ×${formatChips(MAX_MULT)}) wird automatisch ausgezahlt. Ausgezahlt wird auf ganze Falter abgerundet.`,
      '• „Karte tauschen“ legt die Karte kostenlos weg und deckt eine neue auf.',
      '• Tasten: H höher · T tiefer · G gleich · K tauschen · Leertaste auszahlen.',
    ], 620);
    this.btn = this.makeButtons(236);
    this.view.addChild(this.root, this.rules.view);
    this.root.addChild(this.back, this.ladderLayer, this.cardLayer, this.fx, this.ui, this.stageLayer);
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Build -----------------------------------------------------------------------------------

  private makeButtons(w: number) {
    const mk = (label: string, color: number, h: number, size: number, fn: () => void) => button({ label, width: w, height: h, color, textColor: 0xfff6e6, fontSize: size, display: false, onClick: fn });
    return {
      higher: mk('HÖHER', 0x2a6a4a, 72, 26, () => void this.call('higher')),
      lower: mk('TIEFER', 0x7a1d34, 72, 26, () => void this.call('lower')),
      same: mk('GLEICH', 0x2a3a7a, 56, 22, () => void this.call('same')),
      skip: mk('KARTE TAUSCHEN', 0x3a2a3a, 52, 20, () => void this.skip()),
      cash: button({ label: 'AUSZAHLEN', width: w, height: 80, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 24, onClick: () => void this.cash() }),
      info: infoButton(() => this.rules.toggle()),
    };
  }

  private build() {
    const L = this.L;
    this.back.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ladderLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ui.removeChildren();
    for (const b of Object.values(this.btn)) b.destroy({ children: true });
    this.btn = this.makeButtons(L.mode === 'wide' ? 236 : 270);
    this.fx.removeChildren().forEach((c) => c.destroy({ children: true }));
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(L.strip.x + L.strip.w / 2, L.strip.y + L.strip.h / 2);
    halo.width = L.strip.w * 1.8;
    halo.height = L.strip.h * 1.3;
    halo.tint = 0x7af0e0;
    halo.alpha = 0.1;
    halo.blendMode = 'add';
    const S = L.strip;
    const strip = new Sprite(stripTexture(S.w, S.h, { x: L.spot.x - S.x, y: L.spot.y - S.y, w: CARD_W * L.spot.s + 16, h: CARD_H * L.spot.s + 16 }));
    strip.position.set(S.x, S.y);
    this.back.addChild(halo, strip);
    // The deck: a few backs stacked.
    for (let i = 0; i < 4; i++) {
      const b = new Sprite(backTexture());
      b.anchor.set(0.5);
      b.scale.set(L.deck.s);
      b.position.set(L.deck.x - i * 1.5, L.deck.y - i * 2.5);
      this.back.addChild(b);
    }
    // Ladder and rungs.
    const lt = ladderTexture(RUNGS, L.ladder.step);
    const ladder = new Sprite(lt);
    ladder.position.set(L.ladder.x, L.ladder.y);
    this.ladderLayer.addChild(ladder);
    this.rungs = [];
    for (let i = 1; i <= RUNGS; i++) {
      const y = L.ladder.y + lt.height - 40 - i * L.ladder.step;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(L.ladder.x + LADDER_W / 2, y);
      glow.width = 190;
      glow.height = 70;
      glow.tint = COLORS.lamp;
      glow.blendMode = 'add';
      glow.alpha = 0;
      const plate = new Sprite(plateTexture(84, 28, false));
      plate.anchor.set(0.5);
      plate.position.set(L.ladder.x + LADDER_W / 2, y);
      const text = new Text({ text: String(i), style: { fontFamily: FONT_BODY, fontSize: 19, fontWeight: '700', fill: 0x8a7a6a } });
      text.anchor.set(0.5);
      text.position.set(plate.x, y + 1);
      this.ladderLayer.addChild(glow, plate, text);
      this.rungs.push({ plate, text, glow, y });
    }
    this.mothGlow = new Sprite(glowTexture());
    this.mothGlow.anchor.set(0.5);
    this.mothGlow.width = this.mothGlow.height = 120;
    this.mothGlow.tint = COLORS.lamp;
    this.mothGlow.blendMode = 'add';
    this.mothGlow.alpha = 0.5;
    this.moth = new Sprite(mothTexture());
    this.moth.anchor.set(0.5);
    this.moth.scale.set(0.8);
    this.ladderLayer.addChild(this.mothGlow, this.moth);
    this.placeMoth(this.rung, false);
    this.rungs.forEach((r, i) => this.lightRung(r, i + 1 <= this.rung, false));

    // Texts on the felt.
    this.chanceText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '700', fill: 0xd9f0e6, align: 'center' } });
    this.chanceText.anchor.set(0.5);
    this.potText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 32, fill: 0xfff6e6, stroke: { color: 0x0a2a2e, width: 6 }, align: 'center' } });
    this.potText.anchor.set(0.5);
    const cx = L.spot.x;
    this.potText.position.set(cx, L.spot.y + (CARD_H * L.spot.s) / 2 + 44);
    this.chanceText.position.set(cx, L.spot.y + (CARD_H * L.spot.s) / 2 + 86);
    this.fx.addChild(this.potText, this.chanceText);
    this.mirrorView = new Container();
    this.fx.addChild(this.mirrorView);
    if (this.mirror) this.paintMirror(false);

    // Title, panel, controls.
    const title = glowText('KARTENLEITER', { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xfff6e6, letterSpacing: 3 }, { color: 0x7af0e0, distance: 12, outerStrength: 2 });
    title.anchor.set(0.5);
    title.position.set(L.mode === 'wide' ? L.strip.x + L.strip.w / 2 : L.W / 2, L.mode === 'wide' ? 30 : 28);
    this.rtpText = new Text({ text: this.rtpLabel(), style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '600', fill: 0xe6d6b4, align: 'center', lineHeight: 20 } });
    this.rtpText.anchor.set(0.5, 0);
    const pw = L.mode === 'wide' ? 262 : L.W - 20;
    const py = L.mode === 'wide' ? 80 : L.strip.y + L.strip.h + 2;
    const ph = L.mode === 'wide' ? 566 : L.H - py - 6;
    const panel = new Sprite(panelTexture(pw, ph, { velvet: 0x14303a, accent: 0x1a5a5a }));
    panel.position.set((L.mode === 'wide' ? 1009 : 10) - PANEL_PAD, py - PANEL_PAD);
    this.ui.addChild(panel, title, this.rtpText, this.stake.view, ...Object.values(this.btn));
    const b = this.btn;
    if (L.mode === 'wide') {
      const x = 1140;
      b.info.position.set(1236, 40);
      this.stake.view.position.set(x, 136);
      b.higher.position.set(x, 228);
      b.lower.position.set(x, 308);
      b.same.position.set(x, 380);
      b.skip.position.set(x, 442);
      b.cash.position.set(x, 512);
      this.rtpText.position.set(x, 560);
    } else {
      b.info.position.set(L.W - 40, 40);
      this.rtpText.position.set(L.W / 2, 50);
      b.higher.position.set(155, py + 52);
      b.lower.position.set(445, py + 52);
      b.same.position.set(155, py + 132);
      b.skip.position.set(445, py + 132);
      this.stake.view.position.set(160, py + 226);
      b.cash.position.set(445, py + 222);
      this.rtpText.position.set(L.W / 2, 50);
    }
    // The card on the spot and the trail.
    this.cardView?.destroy({ children: true });
    this.cardView = new CardView(this.card, { faceUp: true, tilt: 0.18 });
    this.cardView.scale.set(L.spot.s);
    this.cardView.position.set(L.spot.x, L.spot.y);
    this.cardLayer.addChild(this.cardView);
    this.trail.forEach((v, i) => {
      v.scale.set(L.trail.s);
      v.position.set(L.trail.x + i * L.trail.dx, L.trail.y);
    });
    this.refresh();
  }

  private placeMoth(rung: number, animated: boolean) {
    const L = this.L;
    const lt = this.rungs[0];
    const bottom = lt ? lt.y + L.ladder.step : L.ladder.y + 500;
    const y = (rung === 0 ? bottom + 6 : this.rungs[rung - 1].y) - 34;
    const x = L.ladder.x + LADDER_W / 2 + (rung % 2 ? 26 : -26);
    if (!animated || reducedMotion()) {
      this.moth.position.set(x, y);
      this.mothGlow.position.set(x, y);
      return Promise.resolve();
    }
    const x0 = this.moth.x;
    const y0 = this.moth.y;
    return animate(380, (k) => {
      if (this.moth.destroyed) return;
      this.moth.x = x0 + (x - x0) * k;
      this.moth.y = y0 + (y - y0) * k - Math.sin(k * Math.PI) * 18;
      this.moth.scale.x = 0.8 * (0.5 + 0.5 * Math.abs(Math.cos(k * Math.PI * 3)));
      this.mothGlow.position.set(this.moth.x, this.moth.y);
    }, ease.outCubic).then(() => !this.moth.destroyed && this.moth.scale.set(0.8));
  }

  private lightRung(r: Rung, on: boolean, animated: boolean, mult?: number) {
    r.plate.texture = plateTexture(84, 28, on);
    r.text.style.fill = on ? 0x2a1406 : 0x8a7a6a;
    if (mult !== undefined) r.text.text = `×${fmtMult(mult)}`;
    if (!on) r.text.text = String(this.rungs.indexOf(r) + 1);
    if (r.text.width > 80) r.text.scale.set(80 / (r.text.width / r.text.scale.x));
    else r.text.scale.set(1);
    if (!animated || reducedMotion()) {
      r.glow.alpha = on ? 0.55 : 0;
      return;
    }
    if (on) {
      r.glow.alpha = 1;
      void tween(r.glow, { alpha: 0.55 }, 500);
      r.plate.scale.set(1.3);
      void tween(r.plate.scale, { x: 1, y: 1 }, 300, ease.outBack);
    } else void tween(r.glow, { alpha: 0 }, 300);
  }

  private rtpLabel() {
    const wide = this.L.mode === 'wide';
    if (!this.odds?.id) return wide ? `Auszahlungsquote ${pct(RTP)}\nHausvorteil ${pct(1 - RTP)}` : `${rtpLine(RTP)}\ngleich, wann du auszahlst`;
    const head = itemRtpText(MIRROR_BEST_RTP, 'mondspiegel', 'bester Tipp');
    const best = this.mirror ? mirrorBest(this.card.rank, this.mirror) : null;
    const now = best && this.rung === 0 ? `jetzt: ${CALL_LABEL[best]} ${pct(mirrorRtp(this.card.rank, best, this.mirror!))}` : 'ab Sprosse 1 fair';
    return wide ? `${head.replace(' · ', '\n').replace(' mit ', '\nmit ')}\n${now}` : `${head.replace(' · ', '\n')} · ${now}`;
  }

  // ---- Mondspiegel -------------------------------------------------------------------------------

  /** Two little cards with a crescent mirror frame and a cross: the ranks that will not come. */
  private paintMirror(moment: boolean) {
    const m = this.mirrorView;
    m.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.mirror) return;
    const L = this.L;
    const wide = L.mode === 'wide';
    const s = wide ? 0.5 : 0.4;
    const x0 = wide ? L.spot.x - 205 : L.spot.x - 165;
    const y0 = L.spot.y - (wide ? 30 : 10);
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(x0, y0);
    glow.width = 240;
    glow.height = 260;
    glow.tint = 0xcfe6ff;
    glow.blendMode = 'add';
    glow.alpha = 0.35;
    m.addChild(glow);
    const names = this.mirror.map((l) => RANK_NAME[cardRank(l)]).join(' · ');
    const cap = new Text({ text: `KOMMT NICHT\n${names}`, style: { fontFamily: FONT_DISPLAY, fontSize: wide ? 18 : 16, fill: 0xcfe6ff, stroke: { color: 0x0a2a2e, width: 4 }, letterSpacing: 1, align: 'center' } });
    if (cap.width > (wide ? 230 : 190)) cap.scale.set((wide ? 230 : 190) / cap.width);
    cap.anchor.set(0.5, 1);
    cap.position.set(x0, y0 - (CARD_H * s) / 2 - 18);
    m.addChild(cap);
    this.mirror.forEach((l, i) => {
      const v = new CardView({ rank: cardRank(l), suit: (i * 2 + 1) as Card['suit'] }, { faceUp: true });
      v.scale.set(s);
      const x = x0 + (i ? 1 : -1) * (CARD_W * s * 0.56);
      v.position.set(x, y0 + (i ? 14 : 0));
      v.rotation = i ? 0.08 : -0.08;
      v.alpha = 0.92;
      const cross = new Graphics();
      const h = (CARD_H * s) / 2 - 8;
      const w = (CARD_W * s) / 2 - 6;
      cross.moveTo(-w, -h).lineTo(w, h).moveTo(w, -h).lineTo(-w, h).stroke({ color: 0x14080f, width: 6, cap: 'round' });
      cross.moveTo(-w, -h).lineTo(w, h).moveTo(w, -h).lineTo(-w, h).stroke({ color: 0xff6a7a, width: 3, cap: 'round' });
      cross.alpha = 0.8;
      cross.position.copyFrom(v.position);
      cross.rotation = v.rotation;
      m.addChild(v, cross);
    });
    if (moment) {
      void itemMoment(this.fx, x0, y0 + (CARD_H * s) / 2 + 70, 'mondspiegel', 'MONDSPIEGEL', 0.7);
      if (!reducedMotion()) {
        m.alpha = 0;
        void tween(m, { alpha: 1 }, 420);
      }
    }
  }

  /** A fresh mirror for the next first call (or none when the item is off or a round runs). */
  private setMirror(moment: boolean) {
    const want = this.odds.on('mondspiegel') && this.rung === 0;
    this.mirror = want ? mirrorRanks() : null;
    this.paintMirror(want && moment);
    this.refresh();
  }

  /** Buttons show what each call would pay; impossible calls are off. */
  private refresh() {
    const r = this.card.rank;
    const free = this.phase !== 'anim';
    const top = this.rung >= RUNGS;
    const mir0 = this.mirror && this.rung === 0 ? this.mirror : null;
    for (const c of ['higher', 'lower', 'same'] as Call[]) {
      const p = chance(r, c);
      const b = this.btn[c];
      // A call the mirror has ruled out can't win: off.
      b.setEnabled(free && p > 0 && !top && (!mir0 || mirrorChance(r, c, mir0) > 0));
      b.setLabel(p > 0 ? `${CALL_LABEL[c].toUpperCase()}  ×${fmtMult(nextMult(this.mult, this.rung, r, c))}` : CALL_LABEL[c].toUpperCase());
    }
    this.btn.skip.setEnabled(free);
    this.btn.cash.setEnabled(free && this.rung > 0);
    const pay = cashOut(this.staked, this.mult);
    this.btn.cash.setLabel(this.rung > 0 ? `AUSZAHLEN ${formatChips(pay)}` : 'AUSZAHLEN');
    this.stake.setEnabled(this.phase === 'idle');
    const mir = this.mirror && this.rung === 0 ? this.mirror : null;
    const ph = mir ? mirrorChance(r, 'higher', mir) : chance(r, 'higher');
    const pl = mir ? mirrorChance(r, 'lower', mir) : chance(r, 'lower');
    const ps = mir ? mirrorChance(r, 'same', mir) : 1 / 13;
    this.chanceText.text = `${RANK_NAME[r]}${mir ? ' (Spiegel)' : ''}:  höher ${pct(ph)} · tiefer ${pct(pl)} · gleich ${pct(ps)}`;
    if (this.rtpText && !this.rtpText.destroyed) {
      const t = this.rtpLabel();
      if (t !== this.rtpText.text) {
        this.rtpText.text = t;
        this.rtpText.style.fill = this.odds.id ? 0xcfe6ff : 0xe6d6b4;
        readable(this.rtpText, 17, this.root.scale.x || 1, this.L.mode === 'wide' ? 250 : this.L.W - 110);
      }
    }
    this.potText.text = this.rung > 0 ? `×${fmtMult(this.mult)}  =  ${formatChips(pay)}` : this.phase === 'idle' ? 'Tipp abgeben!' : '';
    this.potText.style.fill = this.rung > 0 ? COLORS.lamp : 0xfff6e6;
    this.fitPot();
  }

  /** The pot line never runs over the table's edge. */
  private fitPot() {
    const max = this.L.strip.w - 70;
    this.potText.scale.set(1);
    if (this.potText.width > max) this.potText.scale.set(max / this.potText.width);
    this.chanceText.scale.set(1);
    if (this.chanceText.width > max) this.chanceText.scale.set(max / this.chanceText.width);
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
    readable(this.rtpText, 17, s, L.mode === 'wide' ? 250 : L.W - 110);
    this.chanceText.style.fontSize = Math.max(21, Math.ceil(13.5 / s));
    this.fitPot();
    this.rules.layout(w, h);
  }

  // ---- Play -------------------------------------------------------------------------------------

  async call(c: Call) {
    if (this.phase === 'anim' || this.dead || this.rung >= RUNGS) return;
    const from = this.card;
    if (chance(from.rank, c) <= 0) return;
    if (this.phase === 'idle') {
      const bet = this.stake.bet;
      if (!this.ctx.state.placeBet(bet)) {
        this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
        return;
      }
      this.staked = bet;
      this.clearTrail();
    }
    this.phase = 'anim';
    // The next card is decided now; the table only shows it. With the mirror (first call only)
    // it comes from the eleven ranks the mirror left.
    const mir = this.rung === 0 ? this.mirror : null;
    if (this.rung === 0) this.roundRtp = mir ? mirrorRtp(from.rank, c, mir) : RTP;
    const next = mir ? this.cardOfLadder(mirrorNext(mir)) : randomCard();
    this.mirror = null;
    this.refresh();
    if (mir) void tween(this.mirrorView, { alpha: 0 }, 300).then(() => this.paintMirror(false));
    const ok = wins(from.rank, next.rank, c);
    const L = this.L;
    const v = new CardView(next, { faceUp: false, tilt: 0.18 });
    v.scale.set(L.spot.s);
    this.cardLayer.addChild(v);
    this.ctx.sfx.cardDeal();
    const land = { x: L.spot.x + (L.mode === 'wide' ? 60 : 40), y: L.spot.y + 10 };
    await dealCard(v, { x: L.deck.x, y: L.deck.y }, { ...land, rotation: 0.06 }, 320);
    if (this.dead) return;
    // A breath, then the reveal.
    await wait(reducedMotion() ? 0 : 160);
    this.ctx.sfx.cardFlip();
    await v.flip(true, 360);
    if (this.dead) return;
    // The old card goes to the trail, the new one takes its place.
    this.pushTrail(this.cardView);
    this.cardView = v;
    this.card = next;
    void tween(v, { x: L.spot.x, y: L.spot.y, rotation: 0 }, 260, ease.outCubic);
    if (ok) {
      this.mult = nextMult(this.mult, this.rung, from.rank, c);
      this.rung++;
      this.ctx.sfx.lineHit(Math.min(this.rung, 10));
      v.setGlow(0.7, 0x9af0b0);
      void wait(600).then(() => !v.destroyed && v.setGlow(0));
      this.lightRung(this.rungs[this.rung - 1], true, true, this.mult);
      await this.placeMoth(this.rung, true);
      const g = this.ladderLayer.toGlobal(this.moth.position);
      this.ctx.particles.sparkle(g.x, g.y, 10, COLORS.lamp, 90);
      if (this.rung >= RUNGS || this.mult >= MAX_MULT) {
        this.phase = 'climb';
        await this.cash(true);
        return;
      }
      this.phase = 'climb';
      this.refresh();
      return;
    }
    // Wrong call: the ladder goes dark, the moth flutters down.
    this.ctx.sfx.lose();
    v.setGlow(0.7, 0xff5f6a);
    const reached = this.rung;
    this.ctx.state.report({ game: 'hilo', stake: this.staked, win: 0, rtp: this.roundRtp, tags: this.tags(reached, false) });
    this.potText.text = from.rank === next.rank && c !== 'same' ? 'Gleicher Rang – verloren' : 'Daneben!';
    this.potText.style.fill = 0xff9a9a;
    this.fitPot();
    await this.resetLadder();
    if (this.dead) return;
    this.phase = 'idle';
    this.setMirror(true);
    this.potText.text = 'Neue Runde!';
    this.fitPot();
    void wait(400).then(() => !v.destroyed && v.setGlow(0));
  }

  private tags(reached: number, cashed: boolean) {
    const t = ['hilo'];
    if (reached >= 5) t.push('rung5');
    if (reached >= 10) t.push('rung10');
    if (cashed) t.push('cashout');
    return t;
  }

  async cash(auto = false) {
    if (this.dead || this.rung === 0 || (this.phase !== 'climb' && !auto)) return;
    this.phase = 'anim';
    const win = cashOut(this.staked, this.mult);
    const mult = this.mult;
    const reached = this.rung;
    if (win > 0) this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'hilo', stake: this.staked, win, rtp: this.roundRtp, tags: this.tags(reached, true) });
    this.potText.text = auto ? `GANZ OBEN!  +${formatChips(win)}` : `AUSGEZAHLT  +${formatChips(win)}`;
    this.potText.style.fill = COLORS.lamp;
    this.fitPot();
    this.ctx.sfx.coin();
    const L = this.L;
    await presentWin(this.ctx, this.root, {
      stake: this.staked,
      win,
      at: { x: this.moth.x, y: this.moth.y },
      area: { x: L.strip.x + 20, y: L.strip.y + 20, w: L.strip.w - 40, h: L.strip.h - 60 },
    });
    void mult;
    await this.resetLadder();
    if (this.dead) return;
    this.phase = 'idle';
    this.setMirror(true);
  }

  /** A card of this ladder rank (2..14), any suit. */
  private cardOfLadder(l: number): Card {
    const all = DECK.filter((c) => ladderRank(c.rank) === l);
    return all[Math.floor(Math.random() * all.length)];
  }

  private async resetLadder() {
    const top = this.rung;
    this.rung = 0;
    this.mult = 1;
    for (let i = top; i >= 1; i--) {
      this.lightRung(this.rungs[i - 1], false, true);
      if (!reducedMotion()) await wait(30);
    }
    await this.placeMoth(0, true);
  }

  async skip() {
    if (this.phase === 'anim' || this.dead) return;
    const prev = this.phase;
    this.phase = 'anim';
    this.refresh();
    const L = this.L;
    const old = this.cardView;
    this.ctx.sfx.whoosh();
    void animate(reducedMotion() ? 1 : 260, (k) => {
      if (old.destroyed) return;
      old.x = L.spot.x - k * 120;
      old.alpha = 1 - k;
      old.rotation = -0.3 * k;
    }).then(() => old.destroy({ children: true }));
    const next = randomCard();
    const v = new CardView(next, { faceUp: false, tilt: 0.18 });
    v.scale.set(L.spot.s);
    this.cardLayer.addChild(v);
    this.ctx.sfx.cardDeal();
    await dealCard(v, { x: L.deck.x, y: L.deck.y }, { x: L.spot.x, y: L.spot.y }, 300);
    this.ctx.sfx.cardFlip();
    await v.flip(true, 300);
    if (this.dead) return;
    this.cardView = v;
    this.card = next;
    this.phase = prev;
    if (this.rung === 0 && this.mirror) this.setMirror(false);
    else this.refresh();
  }

  private pushTrail(v: CardView) {
    const L = this.L;
    this.trail.push(v);
    if (this.trail.length > L.trail.n) {
      const gone = this.trail.shift()!;
      void tween(gone, { alpha: 0 }, 200).then(() => gone.destroy({ children: true }));
    }
    v.setGlow(0);
    this.trail.forEach((t, i) => {
      const x = L.trail.x + i * L.trail.dx;
      if (t === v) {
        void tween(t.scale, { x: L.trail.s, y: L.trail.s }, 300, ease.outCubic);
        void slide(t, x, L.trail.y, 300);
      } else void slide(t, x, L.trail.y, 200);
    });
  }

  private clearTrail() {
    for (const t of this.trail) void tween(t, { alpha: 0 }, 200).then(() => t.destroy({ children: true }));
    this.trail = [];
  }

  update(dtMs: number) {
    this.stake.update(this.busy());
    if (this.odds.poll() && this.phase === 'idle' && !this.dead) this.setMirror(true);
    this.time += dtMs;
    if (!reducedMotion() && this.phase !== 'anim' && this.moth) {
      // The moth breathes on its rung.
      this.moth.scale.x = 0.8 * (0.86 + 0.14 * Math.abs(Math.cos(this.time / 260)));
      this.mothGlow.alpha = 0.4 + 0.15 * Math.sin(this.time / 500) + Math.min(0.4, this.rung * 0.04);
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

export const hilo: GameDefinition = {
  id: 'hilo',
  name: 'Kartenleiter',
  houseEdge: 1 - RTP,
  footprint: { w: 120, h: 76 },
  size: 'table',
  blurb: 'Höher oder tiefer? Sprosse für Sprosse nach oben – auszahlen, wann du willst.',
  drawStation: () => station(),
  create: (ctx) => new HiloGame(ctx),
};
