// "Duell im Lichtkegel": the boss fight at the end of the floor-5 corridor. Pick an attack and a
// stake; the Selene draws a defence card (1 to 20). A stronger attack breaks fewer cards
// but pays more. Her life bar across the top is the Lumen still missing to today's goal: a
// hit knocks it down, a lost stake feeds her. Once it is empty she falls and the day is settled.
//
// Report tags: 'queen' (every round), the attack id ('wing', 'blade', 'crown', 'star'),
// 'hit' or 'bust'.

import { Container, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, banner, floatText, glowTexture, reducedMotion } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { LadderDeck, SCENE_H, SCENE_W, fmtMult, ladderWin, layoutLadder } from '../ladderKit';
import { BAR_H, QueenBar } from '../../ui/queenBar';
import { ATTACKS, DECK, QUEEN_RTP, breaks, drawDefence, hitChance, payout, type Attack } from './rules';
import { CARD, PIPS_Y, QUEEN, buildQueen, cardBack, cardFace, pipTexture, sceneTexture } from './paint';
import { luckStep } from '../../core/debugLuck';

import { BOSS_CAPS, BOSS_NAME, CURRENCY, CURRENCY_PLURAL, GAME_NAMES } from '../../core/brand';
const BETS = [10, 20, 50, 100, 200, 500];
const RULES =
  `Wähle einen Angriff und deinen Einsatz. ${BOSS_NAME} zieht eine Abwehrkarte von 1 bis 20, jede gleich wahrscheinlich.\n\n` +
  'Lichtschlag bricht 1–10 (50 %, zahlt 1,9×), Mondklinge 1–5 (25 %, 3,8×), Kronenstoß 1–2 (10 %, 9,5×), Sternenfeuer nur die 1 (5 %, 19×). ' +
  'Jeder Angriff zahlt auf Dauer genau 95 %.\n\n' +
  `Ihr Lebensbalken sind die ${CURRENCY_PLURAL}, die dir zum Tagesziel fehlen. Ist er leer, ist ${BOSS_NAME} besiegt und der Tag wird abgerechnet.`;
const OUCH = ['Autsch! Mein Fächer!', 'Unerhört!', 'Nur Glück!', 'Mein Mondstaub!', 'Wie kannst du es wagen?'];
const LAUGH = ['Hihihi!', 'Leuchte nur!', 'Das kitzelt!', 'Mehr, Liebling!', 'Meine Krone dankt!'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const pct = (a: Attack) => `${Math.round(hitChance(a) * 100)} %`;

type Phase = 'idle' | 'anim' | 'won';

class QueenGame implements GameInstance {
  view = new Container();
  private body = new Container();
  private board = new Container();
  private scene = new Container();
  private fxLayer = new Container();
  private bar: QueenBar;
  private deck: LadderDeck;
  private queen = buildQueen();
  private card = new Sprite(cardBack());
  private pips: Sprite[] = [];
  private bigText!: Text;
  private subText!: Text;
  private speech!: Text;
  private attackButtons: Button[] = [];

  private phase: Phase = 'idle';
  private attack: Attack = ATTACKS[0];
  private betIndex = 0;
  private bets: number[];
  private stakeWatch: StakeWatch;
  private time = 0;
  private hit = 0;
  private laugh = 0;
  private fall = 0;
  private confirmUntil = 0;
  private calm = reducedMotion();

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.mainAction();
    }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (n >= 0) this.choose(ATTACKS[n]);
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.bar = new QueenBar(ctx.state);
    this.deck = new LadderDeck({
      rtp: QUEEN_RTP,
      accent: 0xc9a0ff,
      rules: RULES,
      options: (tall, w) => this.buildOptions(tall, w),
      refresh: () => this.refreshOptions(),
      onMain: () => this.mainAction(),
      onSecond: () => this.giveUp(),
      onBet: (d) => this.changeBet(d),
    });
    this.deck.rulesHost = this.scene;
    this.build();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Build ---------------------------------------------------------------------------

  private build() {
    this.view.addChild(this.body, this.bar.view);
    this.board.addChild(this.scene, this.deck.view);
    this.scene.addChild(new Sprite(sceneTexture()));
    const title = new Text({ text: GAME_NAMES.queen.toLocaleUpperCase('de-DE'), style: { fontFamily: FONT_DISPLAY, fontSize: 17, fill: 0x2a1406, letterSpacing: 1.5 } });
    title.anchor.set(0.5);
    title.position.set(SCENE_W / 2, 26);
    if (title.width > 176) title.scale.set(176 / title.width);
    this.bigText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 21, fill: 0xfff6e6, stroke: { color: 0x14060f, width: 4 } } });
    this.bigText.anchor.set(0.5);
    this.bigText.position.set(SCENE_W / 2, 60);
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: 0xe6d6b4, stroke: { color: 0x14060f, width: 3 } } });
    this.subText.anchor.set(0.5);
    this.subText.position.set(SCENE_W / 2, 84);
    const q = this.queen.c;
    q.position.set(QUEEN.x, QUEEN.y);
    q.scale.set(QUEEN.s);
    this.speech = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: 0xfff1f8, stroke: { color: 0x2a0630, width: 4 } } });
    this.speech.anchor.set(0.5);
    this.speech.position.set(QUEEN.x, QUEEN.y - 118);
    this.speech.alpha = 0;
    this.card.anchor.set(0.5);
    this.card.position.set(CARD.x, CARD.y);
    for (let i = 0; i < DECK; i++) {
      const s = new Sprite(pipTexture(false));
      s.anchor.set(0.5);
      s.position.set(SCENE_W / 2 + (i - (DECK - 1) / 2) * 16.5, PIPS_Y);
      this.pips.push(s);
      this.scene.addChild(s);
    }
    const cap = new Text({ text: 'Abwehrkarten 1–20 · gold = dein Angriff bricht sie', style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '600', fill: 0xc9b48e } });
    cap.anchor.set(0.5);
    cap.position.set(SCENE_W / 2, SCENE_H - 12);
    if (cap.width > SCENE_W - 30) cap.scale.set((SCENE_W - 30) / cap.width);
    this.scene.addChild(title, q, this.card, this.bigText, this.subText, this.speech, cap, this.fxLayer);
    this.changeBet(0);
    if (this.ctx.state.goalReached) this.victory(true);
    else this.refresh();
  }

  private buildOptions(tall: boolean, w: number) {
    const c = new Container();
    this.attackButtons = [];
    const bw = (w - 8) / 2;
    const bh = tall ? 30 : 46;
    ATTACKS.forEach((a, i) => {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.tint = a.color;
      glow.width = glow.height = 22;
      const b = button({
        label: `${a.name} ${String(a.mult).replace('.', ',')}×`,
        ariaLabel: (t) => `Angriff: ${t}, Chance ${pct(a)}`,
        width: bw,
        height: bh,
        color: 0x4a2a5a,
        textColor: 0xfff6e6,
        fontSize: tall ? 16 : 19,
        display: false,
        icon: glow,
        iconWidth: 16,
        onClick: () => this.choose(a),
      });
      b.position.set(bw / 2 + (i % 2) * (bw + 8), (tall ? 13 : 30) + Math.floor(i / 2) * (bh + (tall ? 4 : 6)));
      this.attackButtons.push(b);
      c.addChild(b);
    });
    return c;
  }

  private refreshOptions() {
    this.attackButtons.forEach((b, i) => {
      const on = ATTACKS[i] === this.attack;
      b.setSelected(on);
      b.alpha = on ? 1 : 0.82;
      b.setEnabled(this.phase === 'idle' || on);
    });
  }

  // ---- State ---------------------------------------------------------------------------

  private choose(a: Attack) {
    if (this.phase !== 'idle') return;
    this.attack = a;
    this.ctx.sfx.chip();
    this.refresh();
  }

  private changeBet(d: number) {
    if (this.phase === 'anim') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.deck.setBet(this.bet, this.betIndex > 0, this.betIndex < this.bets.length - 1);
  }

  private refresh() {
    const a = this.attack;
    if (this.phase === 'won') {
      this.deck.setMain('TAG ABRECHNEN', true);
      this.deck.setSecond('BESIEGT', false);
      this.deck.lockBet(true);
      this.refreshOptions();
      return;
    }
    if (this.phase === 'idle') {
      const poor = this.ctx.state.balance < this.bets[0];
      if (poor) this.status(`KEINE ${CURRENCY.toLocaleUpperCase('de-DE')} MEHR`, 0xff9a7a, 'Für einen Angriff reicht es nicht.');
      else this.status(a.name.toUpperCase(), a.color, `bricht Abwehr 1–${a.beats} · Chance ${pct(a)} · ${fmtMult(a.mult)}`);
    }
    this.pips.forEach((p, i) => {
      p.texture = pipTexture(i < a.beats);
    });
    this.deck.setMain(this.phase === 'anim' ? 'ANGRIFF …' : 'ANGREIFEN', this.phase === 'idle');
    const confirm = performance.now() < this.confirmUntil;
    this.deck.setSecond(confirm ? 'WIRKLICH AUFGEBEN?' : 'AUFGEBEN', this.phase === 'idle');
    this.deck.lockBet(this.phase === 'anim');
    this.refreshOptions();
  }

  private status(big: string, col: number, sub: string) {
    this.bigText.text = big;
    this.bigText.style.fill = col;
    this.bigText.scale.set(Math.min(1, 300 / Math.max(1, this.bigText.width / this.bigText.scale.x)));
    this.subText.text = sub;
    this.subText.scale.set(Math.min(1, 330 / Math.max(1, this.subText.width / this.subText.scale.x)));
  }

  private say(text: string) {
    this.speech.text = text;
    this.speech.alpha = 1;
    this.speech.scale.set(this.calm ? 1 : 0.6);
    if (!this.calm) void tween(this.speech.scale, { x: 1, y: 1 }, 260, ease.outBack);
    void tween(this.speech, { alpha: 0 }, 500, ease.inCubic, 1500);
  }

  private mainAction() {
    if (this.phase === 'won') return this.settle();
    if (this.phase !== 'idle') return;
    void this.strike();
  }

  /** "Aufgeben" asks once, then settles the day as it stands. */
  private giveUp() {
    if (this.phase !== 'idle') return;
    if (performance.now() < this.confirmUntil) return this.settle();
    this.confirmUntil = performance.now() + 3000;
    this.ctx.sfx.thud();
    this.ctx.toast(this.ctx.state.goalReached ? 'Noch einmal tippen: der Tag wird abgerechnet.' : 'Noch einmal tippen zum Aufgeben: das Tagesziel ist dann verfehlt und die Saison vorbei.');
    this.refresh();
    setTimeout(() => !this.view.destroyed && this.refresh(), 3100);
  }

  private settle() {
    const fn = this.ctx.options.settle;
    if (typeof fn === 'function') (fn as () => void)();
    else this.ctx.exit();
  }

  private async strike() {
    const a = this.attack;
    const stake = this.bet;
    if (!this.ctx.state.placeBet(stake)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    this.deck.closeRules();
    this.phase = 'anim';
    this.bar.pulse('heal');
    const defence = luckStep(() => drawDefence(), (d) => breaks(a, d));
    const hit = breaks(a, defence);
    this.refresh();
    this.status(a.name.toUpperCase(), a.color, `Einsatz ${formatChips(stake)} · ${BOSS_NAME} zieht …`);
    this.ctx.sfx.whoosh();
    // The card flips while the attack flies.
    const flip = this.flipCard(defence, hit);
    await this.fly(a, hit);
    await flip;
    if (this.view.destroyed) return;
    const g = this.scene.toGlobal({ x: QUEEN.x, y: QUEEN.y });
    if (hit) {
      const win = payout(stake, a);
      this.ctx.state.payout(win);
      this.ctx.state.report({ game: 'queen', stake, win, rtp: QUEEN_RTP, tags: ['queen', a.id, 'hit'] });
      this.hit = 1;
      this.bar.pulse('hit');
      this.say(pick(OUCH));
      this.status(`TREFFER! +${formatChips(win)}`, COLORS.lamp, `Abwehr ${defence} durchbrochen · ${fmtMult(a.mult)}`);
      const local = this.view.toLocal(g);
      floatText(this.view, local.x, local.y - 60, `−${formatChips(win)}`, 0xff8ac0, 34);
      this.ctx.particles.sparkle(g.x, g.y, this.calm ? 4 : 18, a.color, 140 * this.board.scale.x);
      // Letzter Tanz: every hit also brings a Mondstein.
      if (this.ctx.state.data.bossPhase >= 3) {
        this.ctx.state.data.moonstones += 1;
        this.ctx.toast('Letzter Tanz: +1 Mondstein für den Treffer.');
      }
      await ladderWin(this.ctx, this.board, this.scene, a.mult, win, g, { big: 'VOLLTREFFER', jackpot: 'STERNENFEUER' });
    } else {
      this.ctx.state.report({ game: 'queen', stake, win: 0, rtp: QUEEN_RTP, tags: ['queen', a.id, 'bust'] });
      this.ctx.sfx.lose();
      this.laugh = 1;
      if (Math.random() < 0.6) this.ctx.sfx.queenLaugh();
      this.say(pick(LAUGH));
      this.status('GEHALTEN', 0xd9a0ff, `Abwehr ${defence} hält · ${BOSS_NAME} heilt um ${formatChips(stake)}`);
      await wait(this.calm ? 200 : 700);
    }
    if (this.view.destroyed) return;
    if (this.ctx.state.goalReached) return this.victory(false);
    this.phase = 'idle';
    this.refresh();
  }

  /** The defence card turns over: back, edge, face. */
  private async flipCard(n: number, broken: boolean) {
    const c = this.card;
    c.texture = cardBack();
    if (this.calm) {
      await wait(250);
      if (!c.destroyed) c.texture = cardFace(n, broken);
      return;
    }
    await animate(240, (k) => !c.destroyed && (c.scale.x = 1 - k), ease.inCubic);
    if (c.destroyed) return;
    this.ctx.sfx.cardFlip();
    c.texture = cardFace(n, broken);
    await animate(260, (k) => !c.destroyed && (c.scale.x = k), ease.outBack);
  }

  /** A ball of light flies from the player's side at the Queen; a held attack bursts on her shield. */
  private async fly(a: Attack, hit: boolean) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.tint = a.color;
    s.blendMode = 'add';
    s.width = s.height = 40 + a.mult * 2;
    this.fxLayer.addChild(s);
    const x0 = SCENE_W / 2 + 120;
    const y0 = SCENE_H + 10;
    const x1 = QUEEN.x;
    const y1 = QUEEN.y + (hit ? 0 : 50);
    await animate(this.calm ? 250 : 620, (k) => {
      if (s.destroyed) return;
      s.position.set(x0 + (x1 - x0) * k + Math.sin(k * Math.PI) * -90, y0 + (y1 - y0) * k);
      s.alpha = 0.7 + 0.3 * Math.sin(k * 20);
    }, ease.inCubic);
    if (s.destroyed) return;
    // Burst: gold sparks on a hit, a purple shield ring on a block.
    const ring = new Sprite(glowTexture());
    ring.anchor.set(0.5);
    ring.position.set(x1, y1);
    ring.tint = hit ? a.color : 0xb06ad8;
    ring.blendMode = 'add';
    this.fxLayer.addChild(ring);
    s.destroy();
    await animate(this.calm ? 150 : 380, (k) => {
      if (ring.destroyed) return;
      ring.width = ring.height = 60 + k * 160;
      ring.alpha = 1 - k;
    });
    if (!ring.destroyed) ring.destroy();
  }

  /** Her life is gone: she falls, the moths scatter, and the day can be settled. */
  private victory(already: boolean) {
    this.phase = 'won';
    this.fall = already ? 1 : 0.001;
    this.status(`${BOSS_CAPS} FÄLLT!`, COLORS.lamp, already ? 'Dein Tagesziel steht schon.' : 'Das Tagesziel ist erreicht.');
    this.refresh();
    if (already) return;
    this.ctx.sfx.bigWin();
    setTimeout(() => !this.view.destroyed && this.ctx.sfx.medal(), 700);
    const g = this.scene.toGlobal({ x: QUEEN.x, y: QUEEN.y });
    this.ctx.particles.drawSwarm(g.x, g.y, this.calm ? 8 : 36, null, 0xc9a0ff, 3.5);
    this.ctx.particles.lightWave(g.x, g.y, 0xfff1c4, 300);
    const at = this.view.toLocal(g);
    void banner(this.view, `SIEG ÜBER ${BOSS_CAPS}`, COLORS.lamp, at.x, at.y, Math.max(200, this.lastW - 24));
  }

  // ---- Frame ---------------------------------------------------------------------------

  private lastW = 400;

  resize(w: number, h: number) {
    this.lastW = w;
    const bw = Math.min(w - 16, 860);
    this.bar.resize(bw);
    this.bar.view.position.set((w - bw) / 2, 6);
    const top = BAR_H + 10;
    this.body.position.set(0, top);
    layoutLadder(this.body, this.board, this.scene, this.deck, w, h - top);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
      if (this.phase === 'idle') this.refresh();
    }
    this.time += dtMs / 1000;
    this.bar.update(dtMs);
    const q = this.queen;
    const t = this.time;
    this.hit = Math.max(0, this.hit - dtMs / 600);
    this.laugh = Math.max(0, this.laugh - dtMs / 1200);
    const phase = Math.max(1, this.ctx.state.data.bossPhase);
    const flap = this.calm ? 1 : 0.72 + 0.28 * Math.abs(Math.cos(t * 1.6 * (1 + 0.4 * (phase - 1))));
    q.wR.scale.x = q.fR.scale.x = flap;
    q.wL.scale.x = q.fL.scale.x = -flap;
    q.fR.alpha = q.fL.alpha = this.hit > 0.3 ? 0.9 : this.hit * 2;
    q.body.tint = this.hit > 0.3 ? 0xffd0f0 : 0xffffff;
    q.halo.rotation = t * 0.25;
    if (this.fall > 0) this.fall = Math.min(1, this.fall + dtMs / 1600);
    const bob = this.calm ? 0 : Math.sin(t * 1.2) * 6;
    q.c.x = QUEEN.x + (this.hit > 0 && !this.calm ? Math.sin(t * 60) * 7 * this.hit : 0);
    q.c.y = QUEEN.y + bob - (this.laugh > 0 && !this.calm ? Math.abs(Math.sin(t * 22)) * 6 * this.laugh : 0) + this.fall * 90;
    q.c.alpha = 1 - this.fall * 0.85;
    q.c.rotation = this.fall * 0.5;
    const s = QUEEN.s * (1 + 0.06 * (phase - 1)) * (1 - this.fall * 0.3);
    q.c.scale.set(s);
  }

  busy() {
    return this.phase === 'anim';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

export const queen: GameDefinition = {
  id: 'queen',
  name: GAME_NAMES.queen,
  houseEdge: 1 - QUEEN_RTP,
  footprint: { w: 220, h: 120 },
  size: 'table',
  boss: true,
  blurb: `Der Bosskampf: brich die Abwehr von ${BOSS_NAME}, der Herrin der Lampen, bis ihr Lebensbalken leer ist.`,
  drawStation: () => new Container(),
  create: (ctx) => new QueenGame(ctx),
};
