// "Teich-Derby": six ducks race across the moonlit pond. Bet on a winner (Sieg) or on a top-two
// finish (Platz) at the odds on today's race card. The finishing order is drawn before the
// starting shot; the race is then choreographed to it, with late surges and, now and then,
// a photo finish in slow motion.
//
// Report tags: 'derby' (every race), 'outsider' (a bet won at odds of 8 or more),
// 'photo' (the race ended in a photo finish), 'place' (the bet was a Platz bet).

import { Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, rewardLevel } from '../../core/fx';
import { ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { formatChips } from '../../core/state';
import { winStage } from '../slots/stage';
import { StakeWatch } from '../stakeWatch';
import { SceneShell, betStepper, caption, rtpText, type Layout } from '../sceneShell';
import { CRUMB, FORMS, betRtp, crumbProbs, crumbRtp, drawOrder, makeCard, randomCard, settle, type BetKind, type RaceCard } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import {
  DUCK,
  DUCKS,
  crumbTexture,
  PODIUM,
  bankTexture,
  duckTexture,
  finishTexture,
  nearTexture,
  podiumTexture,
  ropeTexture,
  skyTexture,
  startTexture,
  wakeTexture,
  waterTexture,
} from './paint';
import { luckDraw } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const BETS = [10, 20, 50, 100, 200, 500];
const RACE_MS = 9000;
const START_X = 110;
const CREAM = 0xfff3dc;
const GOLD = 0xffcf7a;

/** House edge shown in the room: the mean over every bet of every race card form. */
const MEAN_RTP = (() => {
  let s = 0;
  let n = 0;
  for (const f of FORMS) {
    const card = makeCard(f);
    for (let i = 0; i < 6; i++) {
      s += betRtp(card, i, 'win') + betRtp(card, i, 'place');
      n += 2;
    }
  }
  return s / n;
})();

type Phase = 'idle' | 'count' | 'race' | 'photo' | 'podium';

interface Runner {
  i: number;
  c: Container;
  body: Sprite;
  wake: Sprite;
  mark: Container;
  /** Final distance share when the winner crosses (winner 1). */
  L: number;
  a: number;
  b: number;
  ph: number;
  x: number;
  done: boolean;
  splash: number;
}

interface Drop {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
}

const fmtOdds = (o: number) => o.toFixed(2).replace('.', ',');

class DerbyGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  /** Unmasked scene content (photographed for the photo finish). */
  private content = new Container();
  private sky = new Sprite();
  private bank!: TilingSprite;
  private waters: TilingSprite[] = [];
  private ropes: TilingSprite[] = [];
  private near!: TilingSprite;
  private world = new Container();
  private dropLayer = new Container();
  private laneHi = new Graphics();
  private laneHits: Graphics[] = [];
  private laneInfo: Text[] = [];
  private startSp = new Sprite();
  private finishSp = new Sprite();
  private vignette = new Graphics();
  private flash = new Graphics();
  private mapG = new Graphics();
  private talk!: Text;
  private bigText!: Text;
  private overLayer = new Container();
  private texes: Texture[] = [];

  private runners: Runner[] = [];
  private drops: Drop[] = [];

  private bankH = 80;
  private laneH = 50;
  private finishX = 1800;
  private cam = 0;
  private duckScale = 1;

  private phase: Phase = 'idle';
  private card: RaceCard = randomCard();
  private pick = 0;
  private kind: BetKind = 'win';
  private betIndex = 1;
  private stake = 0;
  private order: number[] = [];
  private photo = false;
  private u = 0;
  private timeScale = 1;
  private leader = -1;
  private talkCool = 0;
  private settled = false;
  private time = 0;
  private finalStretch = false;
  private calm = reducedMotion();

  private duckBtns: Button[] = [];
  private kindBtns: Button[] = [];
  private minus!: Button;
  private plus!: Button;
  private betText!: Text;
  private mainBtn!: Button;
  private rtpLine!: Text;

  private bets: number[];
  private stakeWatch: StakeWatch;
  private oddsWatch: OddsWatch;
  /** Brotkrumen thrown for this race (the order was drawn with them). */
  private crumbs = false;
  private crumbSp: Sprite | null = null;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      this.main();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.oddsWatch = new OddsWatch(ctx.state, 'derby', ['brotkrumen']);
    this.pick = this.favourite();
    this.shell = new SceneShell({
      title: 'TEICH-DERBY',
      accent: 0x7fd8ff,
      rules:
        'Sechs Enten schwimmen um die Wette. Wähle deine Ente und die Wette:\n' +
        '• Sieg – sie muss gewinnen.\n' +
        '• Platz – sie muss Erste oder Zweite werden (kleinere Quote).\n' +
        'Die Quoten stehen auf der Rennkarte: Favoriten zahlen wenig, Außenseiter viel. Jede Karte hat feste Siegchancen; die Quote ist die faire Quote mal 0,965, auf 0,05 abgerundet. ' +
        'Die Reihenfolge wird beim Startschuss ausgelost, das Rennen zeigt sie dann. Ein Gewinn zahlt Einsatz × Quote.\n' +
        'Leertaste: Start.',
      ctrlSize: (l) => (l === 'tall' ? 312 : l === 'side' ? 420 : 186),
      buildControls: (c, w, h, l, fs) => this.buildControls(c, w, h, l, fs),
      layoutScene: (w, h, l) => this.layoutScene(w, h, l === 'tall'),
    });
    this.view.addChild(this.shell.board);
    this.shell.scene.addChild(this.content);
    this.talk = new Text({
      text: '',
      style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: CREAM, align: 'center', stroke: { color: 0x0a0610, width: 5 } },
    });
    this.talk.anchor.set(0.5, 0);
    this.bigText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 90, fill: GOLD, stroke: { color: 0x14080f, width: 10 } } });
    this.bigText.anchor.set(0.5);
    this.bigText.alpha = 0;
    this.shell.over.addChild(this.overLayer);
    for (let i = 0; i < 6; i++) this.runners.push(this.makeRunner(i));
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  private favourite() {
    let best = 0;
    this.card.p.forEach((p, i) => p > this.card.p[best] && (best = i));
    return best;
  }

  private odds(i: number, kind = this.kind) {
    return kind === 'win' ? this.card.win[i] : this.card.place[i];
  }

  // ---- Build ---------------------------------------------------------------------------------------

  private makeRunner(i: number): Runner {
    const c = new Container();
    const wake = new Sprite(wakeTexture());
    wake.anchor.set(1, 0.5);
    wake.alpha = 0;
    const body = new Sprite(duckTexture(i));
    body.anchor.set(DUCK.ax / DUCK.w, DUCK.ay / DUCK.h);
    // Your duck gets a gold ring over its head.
    const mark = new Container();
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.width = halo.height = 70;
    halo.tint = GOLD;
    halo.blendMode = 'add';
    halo.alpha = 0.6;
    const arrow = new Graphics().poly([-9, -8, 9, -8, 0, 4]).fill(GOLD).stroke({ color: 0x2a1406, width: 2 });
    mark.addChild(halo, arrow);
    mark.visible = false;
    c.addChild(wake, body, mark);
    return { i, c, body, wake, mark, L: 1, a: 0, b: 0, ph: Math.random() * 10, x: START_X, done: false, splash: 0 };
  }

  private layoutScene(w: number, h: number, tall: boolean) {
    for (const t of this.texes) t.destroy(true);
    this.texes = [];
    this.content.removeChildren();
    this.waters.forEach((s) => s.destroy());
    this.ropes.forEach((s) => s.destroy());
    this.laneHits.forEach((s) => s.destroy());
    this.laneInfo.forEach((s) => s.destroy());
    this.waters = [];
    this.ropes = [];
    this.laneHits = [];
    this.laneInfo = [];
    this.bank?.destroy();
    this.near?.destroy();

    const bankH = Math.round(Math.max(56, Math.min(110, h * 0.2)));
    const nearH = Math.round(Math.max(12, Math.min(26, h * 0.05)));
    const laneH = (h - bankH - nearH) / 6;
    this.bankH = bankH;
    this.laneH = laneH;
    this.finishX = Math.round(Math.max(1700, w * 2.6));
    this.duckScale = Math.min(1.4, (laneH * 1.2) / 62);

    const skyT = skyTexture(w, bankH);
    const bankT = bankTexture(Math.round(bankH * 0.8));
    this.texes.push(skyT, bankT);
    this.sky.texture = skyT;
    this.bank = new TilingSprite({ texture: bankT, width: w, height: bankT.height });
    this.bank.y = bankH - bankT.height;
    this.content.addChild(this.sky, this.bank);

    const waterT = [waterTexture(Math.ceil(laneH) + 1, 0), waterTexture(Math.ceil(laneH) + 1, 1)];
    this.texes.push(...waterT);
    for (let k = 0; k < 6; k++) {
      const s = new TilingSprite({ texture: waterT[k % 2], width: w, height: Math.ceil(laneH) + 1 });
      s.y = bankH + k * laneH;
      this.waters.push(s);
      this.content.addChild(s);
    }
    this.laneHi.clear();
    this.content.addChild(this.laneHi);
    for (let k = 1; k < 6; k++) {
      const r = new TilingSprite({ texture: ropeTexture(), width: w, height: 14 });
      r.y = bankH + k * laneH - 7;
      r.alpha = 0.9;
      this.ropes.push(r);
      this.content.addChild(r);
    }
    // Start and finish live in the world (they scroll with the camera).
    const startT = startTexture(h - nearH, bankH);
    const finishT = finishTexture(h - nearH, bankH);
    this.texes.push(startT, finishT);
    this.startSp.texture = startT;
    this.startSp.position.set(START_X - 20 - 20, 0);
    this.finishSp.texture = finishT;
    this.finishSp.position.set(this.finishX - 63, 0);
    this.world.removeChildren();
    this.world.addChild(this.startSp, this.finishSp);
    // Lane info on the water behind the start: number, name and odds.
    const fsz = this.shell.fs(Math.min(24, Math.max(16, laneH * 0.42)));
    for (let k = 0; k < 6; k++) {
      const t = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fsz, fontWeight: '700', fill: CREAM, stroke: { color: 0x0a0610, width: 4 } } });
      t.anchor.set(0, 0.5);
      t.position.set(START_X + 36, bankH + (k + 0.55) * laneH);
      this.laneInfo.push(t);
      this.world.addChild(t);
    }
    for (const r of this.runners) this.world.addChild(r.c);
    this.world.addChild(this.dropLayer);
    this.content.addChild(this.world);
    const nearT = nearTexture(nearH + 10);
    this.texes.push(nearT);
    this.near = new TilingSprite({ texture: nearT, width: w, height: nearH + 10 });
    this.near.y = h - nearH - 10;
    this.content.addChild(this.near);
    // Taps on a lane pick that duck.
    for (let k = 0; k < 6; k++) {
      const g = new Graphics().rect(0, 0, w, laneH).fill({ color: 0xffffff, alpha: 0.001 });
      g.y = bankH + k * laneH;
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => this.choose(k));
      this.laneHits.push(g);
      this.content.addChild(g);
    }
    this.vignette.clear();
    for (let i = 0; i < 6; i++) this.vignette.rect(-i * 14, -i * 14, w + i * 28, h + i * 28).stroke({ color: 0x05020a, width: 30, alpha: 0.16 });
    this.vignette.alpha = 0;
    this.flash.clear().rect(0, 0, w, h).fill(0xffffff);
    this.flash.alpha = 0;
    this.talk.style.fontSize = this.shell.fs(tall ? 19 : 22);
    this.talk.style.wordWrap = true;
    this.talk.style.wordWrapWidth = w - 40;
    this.talk.position.set(w / 2, 8);
    this.bigText.position.set(w / 2, bankH + (h - bankH) * 0.42);
    this.bigText.style.fontSize = Math.min(110, h * 0.3);
    this.content.addChild(this.mapG, this.vignette, this.talk, this.bigText, this.flash);
    this.placeRunners();
    this.refreshCard();
    this.drawMap();
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    this.duckBtns = [];
    this.kindBtns = [];
    const tall = layout === 'tall';
    const side = layout === 'side';
    const x0 = tall ? 12 : side ? 18 : 24;
    const tip = caption('DEINE ENTE', fs(tall ? 14 : 15));
    tip.position.set(x0 + 2, 8);
    c.addChild(tip);
    const cols = tall ? 3 : side ? 2 : 6;
    const gap = 8;
    const bw = Math.min(176, (width - x0 * 2 - gap * (cols - 1)) / cols);
    const bh = tall ? 46 : 50;
    const top = tip.y + tip.height + 6 + bh / 2;
    DUCKS.forEach((d, i) => {
      const b = button({
        label: d.name,
        ariaLabel: (t) => `Ente ${i + 1}: ${t}`,
        width: bw,
        height: bh,
        color: d.team,
        textColor: CREAM,
        fontSize: fs(tall ? 17 : 19),
        display: false,
        onClick: () => this.choose(i),
      });
      b.position.set(x0 + bw / 2 + (i % cols) * (bw + gap), top + Math.floor(i / cols) * (bh + gap));
      this.duckBtns.push(b);
      c.addChild(b);
    });
    const rows = Math.ceil(6 / cols);
    const row2 = top + rows * (bh + gap) + (tall ? 8 : 14);
    const kw = tall ? 70 : side ? 96 : 104;
    (['win', 'place'] as BetKind[]).forEach((k, i) => {
      const b = button({
        label: k === 'win' ? 'Sieg' : 'Platz',
        ariaLabel: (t) => `Wette: ${t}`,
        width: kw,
        height: 46,
        color: 0x3a2040,
        textColor: CREAM,
        fontSize: fs(18),
        display: false,
        onClick: () => this.setKind(k),
      });
      b.position.set(x0 + kw / 2 + i * (kw + 6), row2);
      this.kindBtns.push(b);
      c.addChild(b);
    });
    const st = betStepper(fs, (d) => this.changeBet(d), 46);
    this.minus = st.minus;
    this.plus = st.plus;
    this.betText = st.text;
    // Stepper: right of the bet kind, or on its own row when the column is narrow.
    const stepW = 184;
    let sx = x0 + kw * 2 + 6 + (tall ? 10 : 24);
    let sy = row2;
    if (sx + stepW > width - x0) {
      sx = x0;
      sy = row2 + 56;
    }
    this.minus.position.set(sx + 23, sy);
    this.betText.position.set(sx + 92, sy);
    this.plus.position.set(sx + 161, sy);
    c.addChild(this.minus, this.betText, this.plus);
    this.rtpLine = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: fs(15), fontWeight: '600', fill: 0xbfa98a, wordWrap: true, wordWrapWidth: width - x0 * 2, align: tall || side ? 'center' : 'left' } });
    if (tall || side) {
      const mh = side ? 64 : 56;
      const my = side ? Math.max(sy + 70, height - 84 - mh / 2) : sy + 58;
      this.mainBtn = button({ label: 'START', width: width - x0 * 2, height: mh, fontSize: 24, onClick: () => this.main() });
      this.mainBtn.position.set(width / 2, my);
      this.rtpLine.anchor.set(0.5, 0);
      this.rtpLine.position.set(width / 2, my + mh / 2 + 6);
    } else {
      const mx = sx + stepW + 24;
      const mw = Math.min(360, width - mx - 24);
      this.mainBtn = button({ label: 'START', width: mw, height: 64, fontSize: 24, onClick: () => this.main() });
      this.mainBtn.position.set(width - 24 - mw / 2, row2 - 4);
      this.rtpLine.anchor.set(0, 0.5);
      this.rtpLine.position.set(x0, height - 18);
    }
    c.addChild(this.mainBtn, this.rtpLine);
    this.changeBet(0);
    this.refreshCard();
  }

  // ---- Controls ------------------------------------------------------------------------------------

  private get locked() {
    return this.phase === 'count' || this.phase === 'race' || this.phase === 'photo';
  }

  private choose(i: number) {
    if (this.phase === 'podium') this.newCard();
    if (this.locked) return;
    this.pick = i;
    this.ctx.sfx.quack(0.9 + i * 0.06);
    const r = this.runners[i];
    if (!this.calm) {
      r.body.scale.set(this.duckScale * 1.18);
      void tween(r.body.scale, { x: this.duckScale, y: this.duckScale }, 320, ease.outBack);
    }
    this.refreshCard();
  }

  private setKind(k: BetKind) {
    if (this.phase === 'podium') this.newCard();
    if (this.locked) return;
    this.kind = k;
    this.refreshCard();
  }

  private changeBet(d: number) {
    if (this.locked) return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.refreshButtons();
  }

  private refreshButtons() {
    if (!this.mainBtn) return;
    const free = !this.locked;
    this.minus.setEnabled(free && this.betIndex > 0);
    this.plus.setEnabled(free && this.betIndex < this.bets.length - 1);
    this.duckBtns.forEach((b, i) => {
      b.setEnabled(free);
      b.setSelected(i === this.pick);
      b.setLabel(`${DUCKS[i].name} ${fmtOdds(this.odds(i))}`);
    });
    this.kindBtns.forEach((b, i) => {
      b.setEnabled(free);
      b.setSelected((i === 0 ? 'win' : 'place') === this.kind);
    });
    if (this.phase === 'podium') this.mainBtn.setLabel('NEUES RENNEN');
    else if (this.locked) this.mainBtn.setLabel('RENNEN LÄUFT …');
    else this.mainBtn.setLabel(`START · ${formatChips(this.bet)}`);
    this.mainBtn.setEnabled(!this.locked);
    const head = this.shell.layout === 'wide' ? `${this.kind === 'win' ? 'Sieg' : 'Platz'} auf ${DUCKS[this.pick].name}: ` : '';
    const crumbs = this.locked ? this.crumbs : !!this.oddsWatch.id;
    if (crumbs) {
      // With the crumbs: the exact return of this very bet (its duck pulls 1.25 times as strong).
      const rtp = crumbRtp(this.card, this.pick, this.kind);
      setItemRtp('derby', 'brotkrumen', rtp);
      this.rtpLine.text = `${head}×${fmtOdds(this.odds(this.pick))} · ${itemRtpText(rtp, 'brotkrumen')}`;
    } else this.rtpLine.text = `${head}×${fmtOdds(this.odds(this.pick))} · ${rtpText(betRtp(this.card, this.pick, this.kind))}`;
    this.rtpLine.style.fill = crumbs ? 0xffd89a : 0xbfa98a;
  }

  /** Lane texts, your lane's glow and the buttons for the current card and pick. */
  private refreshCard() {
    this.laneInfo.forEach((t, i) => {
      const fav = this.card.p[i] === Math.max(...this.card.p);
      const out = this.card.win[i] >= 8;
      const tag = fav ? '  Favorit' : out ? '  Außenseiter' : '';
      t.text = `${i + 1} ${DUCKS[i].name}  ${fmtOdds(this.odds(i))}${tag}`;
      t.style.fill = i === this.pick ? GOLD : CREAM;
    });
    this.drawLaneHi();
    this.runners.forEach((r) => (r.mark.visible = r.i === this.pick && this.phase !== 'idle'));
    this.refreshButtons();
  }

  private drawLaneHi() {
    const g = this.laneHi.clear();
    const y = this.bankH + this.pick * this.laneH;
    g.rect(0, y + 2, this.shell.sw, this.laneH - 4).fill({ color: GOLD, alpha: 0.1 });
    g.rect(0, y + 2, this.shell.sw, 2).fill({ color: GOLD, alpha: 0.5 });
    g.rect(0, y + this.laneH - 4, this.shell.sw, 2).fill({ color: GOLD, alpha: 0.5 });
  }

  private main() {
    if (this.shell.rulesOpen) return;
    if (this.phase === 'podium') {
      this.newCard();
      return;
    }
    if (this.phase === 'idle') void this.start();
  }

  // ---- Race ----------------------------------------------------------------------------------------

  private newCard() {
    this.card = randomCard();
    this.phase = 'idle';
    this.overLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.crumbSp?.destroy();
    this.crumbSp = null;
    this.crumbs = false;
    this.u = 0;
    this.cam = 0;
    this.talk.text = 'Neue Rennkarte! Wähle deine Ente.';
    for (const r of this.runners) {
      r.done = false;
      r.x = START_X;
    }
    this.laneInfo.forEach((t) => (t.alpha = 1));
    this.placeRunners();
    this.refreshCard();
  }

  private async start() {
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    this.stake = bet;
    // The result first: the whole finishing order (with crumbs: your duck pulls harder).
    this.crumbs = this.oddsWatch.on('brotkrumen');
    const probs = this.crumbs ? crumbProbs(this.card.p, this.pick) : this.card.p;
    this.order = luckDraw(
      () => drawOrder(probs),
      (o) => settle(this.card, this.pick, this.kind, o) - 1,
    );
    if (this.crumbs) this.throwCrumbs();
    this.scriptRace();
    this.phase = 'count';
    this.settled = false;
    this.refreshCard();
    this.talk.text = `${DUCKS[this.pick].name} auf ${this.kind === 'win' ? 'Sieg' : 'Platz'} · ×${fmtOdds(this.odds(this.pick))}`;
    for (const n of ['3', '2', '1']) {
      if (this.view.destroyed) return;
      this.bigText.text = n;
      this.bigText.alpha = 1;
      this.bigText.scale.set(1.3);
      void tween(this.bigText.scale, { x: 1, y: 1 }, 300, ease.outBack);
      this.ctx.sfx.tick();
      await wait(480);
    }
    if (this.view.destroyed) return;
    this.bigText.text = 'LOS!';
    this.ctx.sfx.starter();
    void tween(this.bigText, { alpha: 0 }, 700, ease.inCubic, 200);
    for (const t of this.laneInfo) void tween(t, { alpha: 0 }, 400);
    this.talk.text = 'Und sie sind gestartet!';
    this.phase = 'race';
    this.u = 0;
    this.timeScale = 1;
    this.leader = -1;
    this.talkCool = 1;
    this.finalStretch = false;
    for (const r of this.runners) r.splash = 1;
    this.refreshButtons();
  }

  /** Brotkrumen: a handful of crumbs lands on the water in front of your duck. */
  private throwCrumbs() {
    const r = this.runners[this.pick];
    this.crumbSp?.destroy();
    const sp = new Sprite(crumbTexture());
    sp.anchor.set(0, 0.5);
    const k = Math.max(0.6, this.duckScale);
    sp.scale.set(k * 1.4);
    sp.position.set(r.c.x + 50 * k, r.c.y - 6 * k);
    sp.alpha = 0;
    this.world.addChildAt(sp, this.world.getChildIndex(r.c));
    this.crumbSp = sp;
    void tween(sp, { alpha: 1 }, this.calm ? 120 : 260);
    if (!this.calm) {
      sp.y -= 30 * k;
      void tween(sp, { y: sp.y + 30 * k }, 320, ease.outBack);
    }
    this.ctx.sfx.rustle();
    const g = this.view.toLocal(this.world.toGlobal({ x: r.c.x + 90 * k, y: r.c.y - 70 * k }));
    void itemMoment(this.view, g.x, Math.max(80, g.y), 'brotkrumen', `BROTKRUMEN ×${String(CRUMB).replace('.', ',')}`, Math.max(0.55, this.shell.s * 0.75));
  }

  /** Lays out every duck's path so the drawn order comes true at the line. */
  private scriptRace() {
    this.photo = Math.random() < 0.32;
    let gap = 0;
    this.order.forEach((d, rank) => {
      const r = this.runners[d];
      if (rank === 1) gap = this.photo ? 0.0035 : 0.012 + Math.random() * 0.02;
      else if (rank > 1) gap += 0.008 + Math.random() * 0.03;
      r.L = 1 - gap;
      r.a = (Math.random() - 0.5) * 0.05;
      r.b = (Math.random() - 0.5) * 0.024;
      r.done = false;
    });
    // The winner comes from behind; an early leader fades late.
    const win = this.runners[this.order[0]];
    win.a = -(0.02 + Math.random() * 0.025);
    const early = this.runners[this.order[1 + Math.floor(Math.random() * 3)]];
    early.a = 0.05 + Math.random() * 0.02;
    if (this.photo) {
      const second = this.runners[this.order[1]];
      second.a = Math.max(second.a, 0.03);
    }
  }

  /** Share of the course covered at race time u (0..1 = start to the winner's finish). */
  private progress(r: Runner, u: number) {
    if (u >= 1) return u * r.L;
    return u * r.L + r.a * Math.sin(Math.PI * Math.pow(u, 1.25)) + r.b * Math.sin(2 * Math.PI * u) * (1 - u);
  }

  private placeRunners() {
    const s = this.duckScale;
    this.runners.forEach((r, k) => {
      r.c.y = this.bankH + (k + 0.8) * this.laneH;
      r.body.scale.set(s);
      r.wake.scale.set(s);
      r.wake.x = -DUCK.ax * s * 0.55;
      r.wake.y = -2;
      r.mark.position.set(-22 * s, -70 * s);
      r.mark.scale.set(Math.max(0.55, s * 0.75));
      r.c.x = r.x;
    });
  }

  private result = { win: 0, mult: 0 };

  private settle() {
    if (this.settled) return this.result;
    this.settled = true;
    const mult = settle(this.card, this.pick, this.kind, this.order);
    const win = Math.round(this.stake * mult);
    const odds = this.odds(this.pick);
    const tags = ['derby'];
    if (win > 0 && odds >= 8) tags.push('outsider');
    if (this.photo) tags.push('photo');
    if (this.kind === 'place') tags.push('place');
    if (win > 0) this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'derby', stake: this.stake, win, rtp: this.crumbs ? crumbRtp(this.card, this.pick, this.kind) : betRtp(this.card, this.pick, this.kind), tags });
    const w = this.order[0];
    this.shell.addHistory(`${win > 0 ? '★ ' : ''}${DUCKS[w].name}`, DUCKS[w].team, CREAM);
    const r = this.runners[this.pick];
    const p = this.content.toGlobal({ x: r.c.x - this.cam, y: r.c.y - 30 });
    if (win > 0) {
      this.ctx.celebrate(mult, p.x, p.y);
      this.ctx.sfx.quack(1.1);
      const lp = this.view.toLocal(p);
      floatText(this.view, lp.x, lp.y - 20, `+${formatChips(win)}`, COLORS.lamp, 34);
      if (rewardLevel(mult) >= 3) {
        void winStage(this.shell.over, {
          x: 0,
          y: 0,
          w: this.shell.sw,
          h: this.shell.sh,
          title: 'AUSSENSEITER!',
          sub: `${DUCKS[this.pick].name} · ×${fmtOdds(odds)}`,
          amount: win,
          accent: COLORS.lamp,
          durationMs: 2200,
          onTick: () => this.ctx.sfx.tick(),
        });
      }
    } else this.ctx.sfx.lose();
    this.result = { win, mult };
    return this.result;
  }

  private finishRace() {
    this.phase = 'podium';
    const res = this.settle();
    this.showPodium(res.win);
    this.refreshButtons();
  }

  private showPodium(win: number) {
    const L = this.overLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sw = this.shell.sw;
    const sh = this.shell.sh;
    const c = new Container();
    const pw = PODIUM.w + 80;
    const k = Math.min(1.2, (sw - 20) / pw, (sh - 20) / 300);
    const veil = new Graphics().roundRect(0, 0, sw, sh, 20).fill({ color: 0x0a0410, alpha: 0.55 });
    veil.eventMode = 'static';
    veil.on('pointertap', () => this.newCard());
    L.addChild(veil, c);
    c.scale.set(k);
    c.position.set(sw / 2, sh / 2);
    const pod = new Sprite(podiumTexture());
    pod.anchor.set(0.5, 0);
    pod.position.set(0, 10);
    c.addChild(pod);
    const spots = [
      [0, 0],
      [-100, 40],
      [100, 60],
    ];
    for (let rank = 0; rank < 3; rank++) {
      const d = this.order[rank];
      const [x, y] = spots[rank];
      const duck = new Sprite(duckTexture(d));
      duck.anchor.set(0.5, DUCK.ay / DUCK.h);
      duck.scale.set(rank === 0 ? 1.15 : 0.95);
      duck.position.set(x - 6, y + 22);
      c.addChild(duck);
      const nm = new Text({ text: DUCKS[d].name, style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: d === this.pick ? GOLD : CREAM, stroke: { color: 0x0a0610, width: 4 } } });
      nm.anchor.set(0.5, 1);
      nm.position.set(x, y - 50 * duck.scale.y);
      c.addChild(nm);
      if (!this.calm) {
        duck.y -= 40;
        duck.alpha = 0;
        void tween(duck, { y: y + 22, alpha: 1 }, 380, ease.outBack, 200 + (2 - rank) * 220);
      }
    }
    const pos = this.order.indexOf(this.pick);
    const name = DUCKS[this.pick].name;
    const line =
      win > 0
        ? `${name} – ${this.kind === 'win' ? 'Sieg' : `Platz ${pos + 1}`}!  +${formatChips(win)} ${CURRENCY_PLURAL}`
        : `${name} wurde ${pos + 1}. – diesmal nichts.`;
    const res = new Text({ text: line, style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '700', fill: win > 0 ? GOLD : 0xd9c6a0, stroke: { color: 0x0a0610, width: 5 } } });
    res.anchor.set(0.5, 0);
    res.position.set(0, 10 + PODIUM.h + 22);
    if (res.width > pw) res.scale.set(pw / res.width);
    const hint = new Text({ text: 'Tippen für das nächste Rennen', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xbfa98a } });
    hint.anchor.set(0.5, 0);
    hint.position.set(0, res.y + 38);
    c.addChild(res, hint);
    c.pivot.set(0, 70);
    L.alpha = 0;
    void tween(L, { alpha: 1 }, 260);
    this.talk.text = '';
  }

  /** Slow motion ended at the line: flash, freeze, and the photo of the finish. */
  private async photoFinish() {
    this.phase = 'photo';
    this.ctx.sfx.shutter();
    this.flash.alpha = this.calm ? 0.35 : 0.85;
    void tween(this.flash, { alpha: 0 }, 400, ease.outCubic);
    const sw = this.shell.sw;
    // The photo: the six lanes at the line, drawn again close up in sepia.
    const pw = Math.round(Math.min(460, sw * 0.8));
    const ph = Math.round(Math.min(330, (this.shell.sh - 60) * 0.85));
    const lh = ph / 6;
    const dz = (lh * 1.25) / 62;
    const lineX = pw * 0.62;
    const card = new Container();
    const k = Math.min(1, (this.shell.sh * 0.92) / (ph + 76));
    const g = new Graphics()
      .roundRect(-pw / 2 - 14, -ph / 2 - 14, pw + 28, ph + 76, 6)
      .fill(0xf6eedc)
      .stroke({ color: 0x2a1406, width: 3 });
    const img = new Container();
    img.position.set(-pw / 2, -ph / 2);
    const bg = new Graphics().rect(0, 0, pw, ph).fill(0x8a7a5a);
    for (let i = 1; i < 6; i++) bg.rect(0, i * lh - 1, pw, 2).fill({ color: 0x3a2a1a, alpha: 0.5 });
    for (let y = 0, j = 0; y < ph; y += 8, j++) {
      bg.rect(lineX - 8, y, 8, 8).fill(j % 2 ? 0x2a1a10 : 0xf2e2c0);
      bg.rect(lineX, y, 8, 8).fill(j % 2 ? 0xf2e2c0 : 0x2a1a10);
    }
    img.addChild(bg);
    for (const r of this.runners) {
      const d = new Sprite(duckTexture(r.i));
      d.anchor.set(DUCK.ax / DUCK.w, DUCK.ay / DUCK.h);
      d.scale.set(dz);
      d.tint = 0xf0d8a8;
      d.position.set(lineX + ((r.x - this.finishX) * dz) / this.duckScale, (r.i + 0.82) * lh);
      img.addChild(d);
    }
    const m = new Graphics().rect(0, 0, pw, ph).fill(0xffffff);
    img.addChild(m);
    img.mask = m;
    const line = new Graphics().rect(lineX - pw / 2 - 1.5, -ph / 2, 3, ph).fill({ color: 0xd8243a, alpha: 0.85 });
    const cap = new Text({ text: `ZIELFOTO · ${DUCKS[this.order[0]].name} um eine Schnabelspitze!`, style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0x2a1406 } });
    cap.anchor.set(0.5);
    cap.position.set(0, ph / 2 + 30);
    if (cap.width > pw) cap.scale.set(pw / cap.width);
    card.addChild(g, img, line, cap);
    card.scale.set(k);
    card.position.set(sw / 2, this.shell.sh / 2 - 20 * k);
    card.rotation = this.calm ? 0 : -0.03;
    this.overLayer.addChild(card);
    card.alpha = 0;
    void tween(card, { alpha: 1 }, 220);
    await wait(this.calm ? 1400 : 1900);
    if (this.view.destroyed) return;
    await tween(card, { alpha: 0 }, 260);
    card.destroy({ children: true });
    this.settle();
    this.talk.text = `${DUCKS[this.order[0]].name} gewinnt – per Zielfoto!`;
    this.phase = 'race';
    this.timeScale = 1;
    void tween(this.vignette, { alpha: 0 }, 400);
  }

  // ---- Frame ---------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  private drawMap() {
    // A small race map in the sky: the course and six coloured dots.
    const g = this.mapG.clear();
    const mw = Math.min(220, this.shell.sw * 0.34);
    const x0 = 16;
    const y0 = this.bankH * 0.22 + (this.talk.height > 0 && this.shell.sw < 600 ? this.talk.height + 4 : 0);
    g.roundRect(x0 - 8, y0 - 8, mw + 16, 16, 8).fill({ color: 0x0a0410, alpha: 0.55 });
    g.rect(x0, y0 - 1, mw, 2).fill({ color: CREAM, alpha: 0.4 });
    g.rect(x0 + mw - 1, y0 - 6, 3, 12).fill(CREAM);
    const span = this.finishX - START_X;
    for (const r of [...this.runners].sort((a, b) => (a.i === this.pick ? 1 : 0) - (b.i === this.pick ? 1 : 0))) {
      const k = Math.max(0, Math.min(1, (r.x - START_X) / span));
      g.circle(x0 + k * mw, y0, r.i === this.pick ? 5.5 : 4).fill(DUCKS[r.i].team).stroke({ color: r.i === this.pick ? GOLD : 0x0a0410, width: 1.5 });
    }
    this.mapG.visible = this.phase !== 'idle';
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    // A stalled frame (tab in the background) must not teleport the ducks.
    dtMs = Math.min(dtMs, 50);
    const dt = dtMs / 1000;
    this.time += dt;
    if (this.oddsWatch.poll()) this.refreshButtons();
    // The crumbs are eaten once the race is under way.
    if (this.crumbSp && this.phase === 'race' && this.u > 0.08) this.crumbSp.alpha = Math.max(0, this.crumbSp.alpha - dt * 2);
    const sw = this.shell.sw;

    if (this.phase === 'race') {
      // Slow motion for the photo finish.
      const lead = Math.max(...this.runners.map((r) => this.progress(r, this.u)));
      if (this.photo && !this.settled && lead > 0.955) {
        if (this.timeScale > 0.5) {
          this.talk.text = 'Kopf an Kopf … ZIELFOTO!';
          this.ctx.sfx.tension(1.2);
        }
        this.timeScale += (0.2 - this.timeScale) * Math.min(1, dt * 6);
        this.vignette.alpha = Math.min(1, this.vignette.alpha + dt * 3);
      }
      const prevU = this.u;
      this.u += (dtMs * this.timeScale) / RACE_MS;
      if (!this.finalStretch && this.u > 0.78) {
        this.finalStretch = true;
        this.talk.text = 'Die Zielgerade!';
        this.talkCool = 1;
      }
      if (prevU < 1 && this.u >= 1) {
        this.u = 1;
        this.ctx.sfx.quack(1.15);
        if (this.photo) {
          this.moveRunners(dt);
          void this.photoFinish();
          return;
        }
        this.settle();
        this.talk.text = `${DUCKS[this.order[0]].name} gewinnt!`;
      }
      // Leader changes are called out (not too often).
      this.talkCool -= dt;
      if (this.u < 0.97 && this.talkCool <= 0) {
        let best = this.runners[0];
        for (const r of this.runners) if (this.progress(r, this.u) > this.progress(best, this.u)) best = r;
        if (best.i !== this.leader) {
          if (this.leader >= 0) {
            const lines = [`${DUCKS[best.i].name} übernimmt die Führung!`, `${DUCKS[best.i].name} schiebt sich nach vorn!`, `Jetzt vorne: ${DUCKS[best.i].name}!`];
            this.talk.text = lines[Math.floor(Math.random() * lines.length)];
            this.ctx.sfx.quack(0.9 + best.i * 0.05);
            this.talkCool = 1.1;
          }
          this.leader = best.i;
        }
      }
      this.moveRunners(dt);
      // Everyone home: podium.
      const last = Math.max(...this.runners.map((r) => 1 / r.L));
      if (this.u >= last + 0.03) this.finishRace();
    }

    if (this.phase === 'race' || this.phase === 'photo') {
      const leadX = Math.max(...this.runners.map((r) => r.x));
      const target = Math.max(0, Math.min(this.finishX + 150 - sw, leadX - sw * 0.62));
      this.cam += (target - this.cam) * Math.min(1, dt * 4);
    } else if (this.phase === 'idle') this.cam += (0 - this.cam) * Math.min(1, dt * 4);

    // Scroll the pond.
    this.world.x = -this.cam;
    if (this.bank) this.bank.tilePosition.x = -this.cam * 0.45;
    this.waters.forEach((s, k) => (s.tilePosition.x = -this.cam + Math.sin(this.time * 0.6 + k) * 6 - this.time * (6 + k)));
    this.ropes.forEach((s) => (s.tilePosition.x = -this.cam));
    if (this.near) this.near.tilePosition.x = -this.cam * 1.3;

    // Ducks bob and paddle.
    const slow = this.phase === 'photo' ? 0 : this.phase === 'race' ? this.timeScale : 0.3;
    for (const r of this.runners) {
      const s = this.duckScale;
      r.body.y = Math.sin(this.time * 7 * Math.max(0.3, slow) + r.ph) * 1.6 * s;
      r.body.rotation = Math.sin(this.time * 9 * Math.max(0.3, slow) + r.ph) * 0.05;
      r.mark.y = -70 * s + Math.sin(this.time * 4) * 3;
    }
    // Spray drops.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const k = this.phase === 'photo' ? 0.1 : 1;
      d.life -= dt * k;
      d.s.x += d.vx * dt * k;
      d.s.y += d.vy * dt * k;
      d.vy += 260 * dt * k;
      d.s.alpha = Math.max(0, d.life * 2);
      if (d.life <= 0) {
        d.s.destroy();
        this.drops.splice(i, 1);
      }
    }
    if (this.phase !== 'idle') this.drawMap();
    else this.mapG.visible = false;
  }

  private moveRunners(dt: number) {
    const span = this.finishX - START_X;
    for (const r of this.runners) {
      const p = this.progress(r, this.u);
      const nx = START_X + p * span;
      const v = (nx - r.x) / Math.max(1e-3, dt);
      r.x = nx;
      r.c.x = nx;
      r.wake.alpha = Math.min(0.9, Math.abs(v) / 200);
      if (!r.done && p >= 1) {
        r.done = true;
        if (r.i === this.pick) this.ctx.sfx.quack(1.05);
      }
      // Paddle spray behind the duck.
      r.splash -= dt * (0.6 + Math.abs(v) / 120);
      if (r.splash <= 0 && this.drops.length < 70 && !this.calm) {
        r.splash = 0.12;
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.width = s.height = 6 + Math.random() * 5;
        s.tint = 0xdff4ff;
        s.blendMode = 'add';
        s.position.set(r.x - DUCK.ax * this.duckScale * 0.7, r.c.y - 2);
        this.dropLayer.addChild(s);
        this.drops.push({ s, vx: -40 - Math.random() * 50, vy: -60 - Math.random() * 60, life: 0.5 });
      }
    }
  }

  busy() {
    return this.locked;
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
    for (const t of this.texes) t.destroy(true);
    this.shell.destroy();
  }
}

function drawStation() {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(75, 42, 75, 40).fill(0x4a2a14).stroke({ color: COLORS.brass, width: 2 });
  g.ellipse(75, 42, 62, 30).fill(0x1c4a64);
  for (let k = 0; k < 6; k++) g.circle(40 + ((k * 23) % 60), 22 + k * 7, 3).fill(DUCKS[k].body);
  c.addChild(g);
  const lamp = new Graphics().circle(75, 10, 5).fill(COLORS.lamp);
  lamp.label = 'lamp';
  c.addChild(lamp);
  return c;
}

export const derby: GameDefinition = {
  id: 'derby',
  name: 'Teich-Derby',
  houseEdge: 1 - MEAN_RTP,
  footprint: { w: 150, h: 84 },
  size: 'table',
  blurb: 'Sechs Enten, ein Teich: Tipp auf Sieg oder Platz.',
  drawStation,
  create: (ctx) => new DerbyGame(ctx),
};
