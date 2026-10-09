// "Diamantminen": 25 stones in a mine face, some hide a sooty lantern. Crack stones open for
// diamonds; every diamond raises the multiplier, collect whenever you like. A lantern puffs
// out its soot and the round is lost.
//
// Report tags: 'mines' (every round), 'mines5' (5+ diamonds found in the round),
// 'mines10' (10+ diamonds), 'cashout' (collected), 'bust' (hit a lantern), 'allclear'
// (every diamond on the field found).

import { Container, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, sparkTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { LadderDeck, SCENE_H, SCENE_W, fmtMult, ladderWin, layoutLadder } from '../ladderKit';
import { MAX_TRAPS, MINES_RTP, MIN_TRAPS, TILES, layTraps, minesMult, minesPayout, minesPayoutShown } from './rules';
import {
  DIAMOND,
  FIELD_X,
  FIELD_Y,
  GAP,
  SOOT,
  TILE,
  crackTexture,
  diamondTexture,
  hangingLanternTexture,
  lanternTexture,
  pocketTexture,
  sceneTexture,
  smokeTexture,
  stoneTexture,
} from './paint';

const BETS = [10, 20, 50, 100, 200, 500];
const RULES =
  'Wähle vor der Runde, wie viele der 25 Steine eine Rußlaterne verstecken (1 bis 10). ' +
  'Tippe Steine an: Jeder Diamant erhöht den Multiplikator. Kassiere, wann du willst – ' +
  'triffst du eine Laterne, ist der Einsatz weg.\n\n' +
  'Multiplikator = 0,95 ÷ Chance, bis hierher nur Diamanten zu finden. ' +
  'Darum zahlt jede Strategie auf Dauer genau 95 %.';

type Phase = 'idle' | 'play' | 'anim' | 'done';

interface Tile {
  c: Container;
  stone: Sprite;
  crack: Sprite;
  content: Sprite;
  glow: Sprite;
  open: boolean;
  focus: FocusHandle;
  variant: number;
}

class MinesGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private scene = new Container();
  private tilesLayer = new Container();
  private fxLayer = new Container();
  private tiles: Tile[] = [];
  private deck: LadderDeck;
  private bigText!: Text;
  private subText!: Text;
  private lanterns: { s: Sprite; glow: Sprite; ph: number }[] = [];
  private trapsMinus?: Button;
  private trapsPlus?: Button;
  private trapsText?: Text;
  private firstText?: Text;

  private phase: Phase = 'idle';
  private traps = 3;
  private field: boolean[] = [];
  private found = 0;
  private stake = 0;
  private betIndex = 0;
  private bets: number[];
  private stakeWatch: StakeWatch;
  private time = 0;
  private calm = reducedMotion();

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.mainAction();
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.deck = new LadderDeck({
      rtp: MINES_RTP,
      accent: COLORS.lamp,
      rules: RULES,
      options: (tall, w) => this.buildOptions(tall, w),
      refresh: () => this.refreshOptions(),
      onMain: () => this.mainAction(),
      onSecond: () => this.collect(),
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
    this.board.addChild(this.scene, this.deck.view);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(SCENE_W / 2, SCENE_H / 2);
    halo.width = SCENE_W * 1.8;
    halo.height = SCENE_H * 1.5;
    halo.tint = 0x9fe8ff;
    halo.alpha = 0.12;
    halo.blendMode = 'add';
    this.scene.addChild(halo, new Sprite(sceneTexture()));

    const title = new Text({ text: 'DIAMANTMINEN', style: { fontFamily: FONT_DISPLAY, fontSize: 19, fill: 0x2a1406, letterSpacing: 2, dropShadow: { color: 0xfff4d0, alpha: 0.5, blur: 0, distance: 1.2, angle: Math.PI / 2 } } });
    title.anchor.set(0.5);
    title.position.set(SCENE_W / 2, 26);
    if (title.width > 160) title.scale.set(160 / title.width);
    this.bigText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0xfff6e6 } });
    this.bigText.anchor.set(0.5);
    this.bigText.position.set(SCENE_W / 2, 67);
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
    this.subText.anchor.set(0.5);
    this.subText.position.set(SCENE_W / 2, 87);
    this.scene.addChild(title, this.bigText, this.subText);

    // Two hanging lanterns that sway a little.
    for (const [x, ph] of [[52, 0], [SCENE_W - 52, 1.7]] as const) {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(x, 104);
      glow.width = glow.height = 90;
      glow.tint = 0xffb060;
      glow.alpha = 0.45;
      glow.blendMode = 'add';
      const s = new Sprite(hangingLanternTexture());
      s.anchor.set(0.5, 0);
      s.position.set(x, 40);
      this.scene.addChild(glow, s);
      this.lanterns.push({ s, glow, ph });
    }

    for (let i = 0; i < TILES; i++) this.tiles.push(this.makeTile(i));
    this.scene.addChild(this.tilesLayer, this.fxLayer);
    this.changeBet(0);
    this.refresh();
  }

  private makeTile(i: number): Tile {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const c = new Container();
    c.position.set(FIELD_X + col * (TILE + GAP) + TILE / 2, FIELD_Y + row * (TILE + GAP) + TILE / 2);
    const pocket = new Sprite(pocketTexture());
    pocket.anchor.set(0.5);
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 80;
    glow.blendMode = 'add';
    glow.alpha = 0;
    const content = new Sprite(diamondTexture());
    content.anchor.set(0.5);
    content.visible = false;
    const variant = (i * 7 + row) % 3;
    const stone = new Sprite(stoneTexture(variant));
    stone.anchor.set(0.5);
    stone.tint = 0xe2dcdc;
    const crack = new Sprite(crackTexture());
    crack.anchor.set(0.5);
    crack.alpha = 0;
    c.addChild(pocket, glow, content, stone, crack);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const t: Tile = { c, stone, crack, content, glow, open: false, variant, focus: null as unknown as FocusHandle };
    c.on('pointerover', () => {
      if (!t.open && this.canPick()) {
        stone.tint = 0xffffff;
        stone.y = -2;
      }
    });
    c.on('pointerout', () => {
      stone.tint = 0xe2dcdc;
      stone.y = 0;
    });
    c.on('pointertap', () => this.tap(i));
    t.focus = focusable(c, {
      label: () => `Stein Reihe ${row + 1}, Spalte ${col + 1}${t.open ? (this.field[i] ? ', Laterne' : ', Diamant') : ''}`,
      rect: { w: TILE, h: TILE },
      radius: 10,
      enabled: () => !t.open && this.canPick(),
      activate: () => this.tap(i),
    });
    this.tilesLayer.addChild(c);
    return t;
  }

  private buildOptions(tall: boolean, w: number) {
    const c = new Container();
    const cap = label('FALLEN', 17, 0xd9c6a0);
    this.trapsMinus = button({ label: '–', ariaLabel: 'Weniger Fallen', width: 46, height: 46, onClick: () => this.setTraps(this.traps - 1) });
    this.trapsPlus = button({ label: '+', ariaLabel: 'Mehr Fallen', width: 46, height: 46, onClick: () => this.setTraps(this.traps + 1) });
    this.trapsText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 28, fill: SOOT } });
    this.trapsText.anchor.set(0.5);
    this.firstText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4, align: tall ? 'right' : 'center' } });
    if (tall) {
      cap.anchor.set(0, 0.5);
      cap.position.set(0, 26);
      this.trapsMinus.position.set(88, 26);
      this.trapsText.position.set(140, 27);
      this.trapsPlus.position.set(192, 26);
      this.firstText.anchor.set(1, 0.5);
      this.firstText.position.set(w, 26);
    } else {
      cap.anchor.set(0.5);
      cap.position.set(w / 2, 8);
      this.trapsMinus.position.set(w / 2 - 70, 42);
      this.trapsText.position.set(w / 2, 43);
      this.trapsPlus.position.set(w / 2 + 70, 42);
      this.firstText.anchor.set(0.5);
      this.firstText.position.set(w / 2, 78);
    }
    c.addChild(cap, this.trapsMinus, this.trapsText, this.trapsPlus, this.firstText);
    return c;
  }

  private refreshOptions() {
    if (!this.trapsText || !this.firstText || !this.trapsMinus || !this.trapsPlus) return;
    const locked = this.phase === 'play' || this.phase === 'anim';
    this.trapsText.text = String(this.traps);
    this.trapsMinus.setEnabled(!locked && this.traps > MIN_TRAPS);
    this.trapsPlus.setEnabled(!locked && this.traps < MAX_TRAPS);
    this.firstText.visible = !this.deck.tall;
    this.firstText.text = `Erster Diamant: ${fmtMult(minesMult(this.traps, 1))}`;
  }

  // ---- State ---------------------------------------------------------------------------

  private canPick() {
    return this.phase === 'play' || this.phase === 'idle' || this.phase === 'done';
  }

  private setTraps(n: number) {
    if (this.phase === 'play' || this.phase === 'anim') return;
    this.traps = Math.max(MIN_TRAPS, Math.min(MAX_TRAPS, n));
    this.ctx.sfx.chip();
    this.refresh();
  }

  private changeBet(d: number) {
    if (this.phase === 'play' || this.phase === 'anim') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.deck.setBet(this.bet, this.betIndex > 0, this.betIndex < this.bets.length - 1);
  }

  /** Status plate, buttons and options for the current phase. */
  private refresh() {
    const p = this.phase;
    const diamonds = TILES - this.traps;
    if (p === 'idle') {
      this.status(`${this.traps} ${this.traps === 1 ? 'FALLE' : 'FALLEN'} · ${diamonds} DIAMANTEN`, 0xfff6e6, `Erster Diamant: ${fmtMult(minesMult(this.traps, 1))}`);
    } else if (p === 'play' || p === 'anim') {
      const next = this.found < diamonds ? `Nächster ${fmtMult(minesMult(this.traps, this.found + 1))}` : '';
      if (this.found === 0) this.status('×1,00', 0xfff6e6, `Erster Diamant: ${fmtMult(minesMult(this.traps, 1))}`);
      else this.status(fmtMult(minesMult(this.traps, this.found)), DIAMOND, `${next} · Funde ${this.found}/${diamonds}`);
    }
    const playing = p === 'play';
    this.deck.setMain(playing ? 'ZUFALL' : 'SPIELEN', p !== 'anim');
    const can = playing && this.found > 0;
    this.deck.setSecond(can ? `KASSIEREN ${formatChips(minesPayoutShown(this.stake, this.traps, this.found))}` : 'KASSIEREN', can);
    this.deck.lockBet(playing || p === 'anim');
    this.refreshOptions();
    for (const t of this.tiles) t.focus.refresh();
  }

  private status(big: string, col: number, sub: string) {
    this.bigText.text = big;
    this.bigText.style.fill = col;
    this.bigText.scale.set(1);
    if (this.bigText.width > 216) this.bigText.scale.set(216 / this.bigText.width);
    this.subText.text = sub;
    this.subText.scale.set(1);
    if (this.subText.width > 216) this.subText.scale.set(216 / this.subText.width);
  }

  private mainAction() {
    if (this.phase === 'anim') return;
    if (this.phase === 'play') {
      const closed = this.tiles.map((t, i) => (t.open ? -1 : i)).filter((i) => i >= 0);
      if (closed.length) void this.pick(closed[Math.floor(Math.random() * closed.length)]);
      return;
    }
    void this.start();
  }

  /** Bet placed, traps laid, fresh stones. Returns false if the bet could not be placed. */
  private start(): boolean {
    if (this.phase === 'play' || this.phase === 'anim') return false;
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return false;
    }
    this.deck.closeRules();
    this.stake = bet;
    // The whole field is decided before the first stone opens.
    this.field = layTraps(this.traps);
    this.found = 0;
    this.phase = 'play';
    this.ctx.sfx.whoosh();
    this.fxLayer.removeChildren().forEach((c) => c.destroy());
    this.tiles.forEach((t, i) => {
      const wasOpen = t.open || t.stone.alpha < 1;
      t.open = false;
      t.content.visible = false;
      t.content.alpha = 1;
      t.glow.alpha = 0;
      t.crack.alpha = 0;
      t.stone.visible = true;
      t.stone.texture = stoneTexture(t.variant);
      t.stone.rotation = 0;
      t.stone.position.set(0, 0);
      if (wasOpen && !this.calm) {
        // Stones drop back into place, row by row.
        t.stone.alpha = 0;
        t.stone.y = -10;
        void tween(t.stone, { alpha: 1, y: 0 }, 220, ease.outCubic, Math.floor(i / 5) * 40 + (i % 5) * 12);
      } else t.stone.alpha = 1;
    });
    this.refresh();
    return true;
  }

  private tap(i: number) {
    if (this.phase === 'anim') return;
    if (this.phase !== 'play') {
      if (!this.start()) return;
    }
    if (this.tiles[i].open) return;
    void this.pick(i);
  }

  private async pick(i: number) {
    const t = this.tiles[i];
    if (this.phase !== 'play' || t.open) return;
    this.phase = 'anim';
    t.open = true;
    this.refresh();
    const trap = this.field[i];
    await this.crackOpen(t, trap, true);
    if (this.view.destroyed) return;
    if (trap) {
      this.bust(t);
      return;
    }
    this.found++;
    this.ctx.sfx.lineHit(Math.min(this.found - 1, 9));
    this.sparkleAt(t);
    if (this.found >= TILES - this.traps) {
      // Every diamond found: collects by itself.
      this.phase = 'play';
      this.collect(true);
      return;
    }
    this.phase = 'play';
    this.refresh();
    // Little pop on the status plate.
    if (!this.calm) {
      this.bigText.scale.set(this.bigText.scale.x * 1.15);
      const s = Math.min(1, 216 / (this.bigText.width / this.bigText.scale.x));
      void tween(this.bigText.scale, { x: s, y: s }, 260, ease.outBack);
    }
  }

  /** The stone cracks, splits in two and falls away; what was under it rises. */
  private async crackOpen(t: Tile, trap: boolean, live: boolean) {
    t.content.texture = trap ? lanternTexture() : diamondTexture();
    t.glow.tint = trap ? SOOT : DIAMOND;
    t.stone.tint = 0xe2dcdc;
    t.stone.y = 0;
    if (live) {
      this.ctx.sfx.crack();
      if (!this.calm) {
        const x0 = t.c.x;
        await animate(130, (k) => {
          if (t.c.destroyed) return;
          t.crack.alpha = Math.min(1, k * 1.6);
          t.c.x = x0 + Math.sin(k * 40) * 1.6 * (1 - k);
        });
        if (t.c.destroyed) return;
        t.c.x = x0;
      }
    }
    t.stone.visible = false;
    t.crack.alpha = 0;
    // Two halves fall apart.
    if (!this.calm) {
      for (const side of [-1, 1]) {
        const h = new Sprite(stoneTexture(t.variant, side));
        h.anchor.set(0.5);
        h.position.set(t.c.x, t.c.y);
        h.tint = 0xe2dcdc;
        this.fxLayer.addChild(h);
        const x0 = h.x;
        const y0 = h.y;
        void animate(live ? 420 : 260, (k) => {
          if (h.destroyed) return;
          h.x = x0 + side * 16 * k;
          h.y = y0 + 26 * k * k - 6 * Math.sin(k * Math.PI);
          h.rotation = side * 0.5 * k;
          h.alpha = 1 - k;
        }).then(() => h.destroy());
      }
    }
    t.content.visible = true;
    t.content.alpha = live ? 1 : 0.4;
    t.content.tint = live ? 0xffffff : 0x9a9aae;
    t.glow.alpha = live ? 0.9 : 0.12;
    if (live && !this.calm) {
      t.content.scale.set(0.2);
      void tween(t.content.scale, { x: 1, y: 1 }, 320, ease.outBack);
      void tween(t.glow, { alpha: trap ? 0.5 : 0.35 }, 600, ease.outCubic);
      await wait(160);
    } else {
      t.content.scale.set(live ? 1 : 0.9);
      if (live) t.glow.alpha = trap ? 0.5 : 0.35;
    }
  }

  private sparkleAt(t: Tile) {
    const g = this.scene.toGlobal({ x: t.c.x, y: t.c.y });
    this.ctx.particles.sparkle(g.x, g.y, this.calm ? 3 : 9, DIAMOND, 90 * this.board.scale.x);
    if (this.calm) return;
    for (let k = 0; k < 5; k++) {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      s.tint = k % 2 ? 0xffffff : DIAMOND;
      s.blendMode = 'add';
      s.position.set(t.c.x + (Math.random() - 0.5) * 30, t.c.y + (Math.random() - 0.5) * 26);
      s.scale.set(0);
      this.fxLayer.addChild(s);
      const peak = 0.6 + Math.random() * 0.5;
      void animate(520, (q) => {
        if (s.destroyed) return;
        s.scale.set(Math.sin(q * Math.PI) * peak);
        s.rotation = q * 2;
      }, ease.linear).then(() => s.destroy());
    }
  }

  /** The lantern puffs out its soot: a warm flash, a soft cloud, the round is lost. */
  private bust(t: Tile) {
    this.phase = 'anim';
    this.ctx.state.report({ game: 'mines', stake: this.stake, win: 0, rtp: MINES_RTP, tags: this.tags(['bust']) });
    this.ctx.sfx.puff();
    this.status('RUSS!', 0xff9a7a, this.found ? `${this.found} ${this.found === 1 ? 'Diamant' : 'Diamanten'} – der Einsatz ist weg.` : 'Gleich der erste Stein – der Einsatz ist weg.');
    this.deck.setMain('SPIELEN', false);
    this.deck.setSecond('KASSIEREN', false);
    const flash = new Sprite(glowTexture());
    flash.anchor.set(0.5);
    flash.position.set(t.c.x, t.c.y);
    flash.tint = SOOT;
    flash.blendMode = 'add';
    flash.width = flash.height = 60;
    flash.alpha = 0.9;
    this.fxLayer.addChild(flash);
    void animate(500, (k) => {
      if (flash.destroyed) return;
      flash.width = flash.height = 60 + 140 * k;
      flash.alpha = 0.9 * (1 - k);
    }, ease.outCubic).then(() => flash.destroy());
    const puffs = this.calm ? 3 : 9;
    for (let k = 0; k < puffs; k++) {
      const s = new Sprite(smokeTexture());
      s.anchor.set(0.5);
      s.tint = k % 3 === 0 ? 0x6a5a6e : 0xa898a8;
      s.position.set(t.c.x, t.c.y);
      s.alpha = 0;
      this.fxLayer.addChild(s);
      const a = (k / puffs) * Math.PI * 2 + Math.random() * 0.6;
      const d = 30 + Math.random() * 30;
      const x0 = t.c.x;
      const y0 = t.c.y;
      void animate(1300 + Math.random() * 500, (q) => {
        if (s.destroyed) return;
        s.x = x0 + Math.cos(a) * d * ease.outCubic(q);
        s.y = y0 + Math.sin(a) * d * 0.7 * ease.outCubic(q) - 40 * q;
        s.scale.set(0.5 + q * 1.2);
        s.alpha = q < 0.15 ? q / 0.15 * 0.85 : 0.85 * (1 - (q - 0.15) / 0.85);
      }, ease.linear).then(() => s.destroy());
    }
    // The lantern goes dim and sooty.
    t.glow.tint = 0xff6a3a;
    void tween(t.content, { alpha: 0.75 }, 600);
    void this.revealRest().then(() => this.endRound());
  }

  private collect(auto = false) {
    if (this.phase !== 'play' || this.found === 0) return;
    this.phase = 'anim';
    const m = minesMult(this.traps, this.found);
    const win = minesPayout(this.stake, this.traps, this.found);
    this.ctx.state.payout(win);
    const tags = this.tags(['cashout']);
    if (this.found >= TILES - this.traps) tags.push('allclear');
    this.ctx.state.report({ game: 'mines', stake: this.stake, win, rtp: MINES_RTP, tags });
    this.status(`+${formatChips(win)}`, COLORS.lamp, auto ? `Alle Diamanten gefunden! ${fmtMult(m)}` : `Kassiert bei ${fmtMult(m)}`);
    this.deck.setMain('SPIELEN', false);
    this.deck.setSecond('KASSIEREN', false);
    if (!this.calm) {
      this.bigText.scale.set(this.bigText.scale.x * 1.25);
      const s = Math.min(1, 216 / (this.bigText.width / this.bigText.scale.x));
      void tween(this.bigText.scale, { x: s, y: s }, 380, ease.outBack);
    }
    const at = this.scene.toGlobal({ x: SCENE_W / 2, y: 70 });
    if (m > 1) {
      const local = this.view.toLocal(at);
      floatText(this.view, local.x, local.y - 10, `+${formatChips(win)}`, COLORS.lamp, Math.round(30 * Math.max(0.8, this.board.scale.x)));
    } else this.ctx.sfx.partial();
    // Opened diamonds flare up together.
    for (const t of this.tiles) if (t.open && t.content.visible) t.glow.alpha = 1;
    const shown = this.revealRest();
    void ladderWin(this.ctx, this.board, this.scene, m, win, at, { big: 'DIAMANTFUND', jackpot: 'SCHATZADER' })
      .then(() => shown)
      .then(() => this.endRound());
  }

  private tags(extra: string[]) {
    const t = ['mines', ...extra];
    if (this.found >= 5) t.push('mines5');
    if (this.found >= 10) t.push('mines10');
    return t;
  }

  /** Every stone still closed opens quietly, dimmed: here lay the other lanterns. */
  private async revealRest() {
    const rest = this.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !t.open);
    for (const [n, { t, i }] of rest.entries()) {
      t.open = true;
      void wait(this.calm ? 0 : 150 + n * 28).then(() => {
        if (!t.c.destroyed) void this.crackOpen(t, this.field[i], false);
      });
    }
    await wait(this.calm ? 200 : 450 + rest.length * 28);
  }

  private endRound() {
    if (this.view.destroyed) return;
    this.phase = 'done';
    this.deck.setMain('SPIELEN', true);
    this.deck.lockBet(false);
    this.refreshOptions();
    for (const t of this.tiles) {
      t.focus.refresh();
      if (t.content.visible && t.content.alpha >= 1) void tween(t.glow, { alpha: 0.3 }, 500);
    }
  }

  // ---- Frame ---------------------------------------------------------------------------

  resize(w: number, h: number) {
    layoutLadder(this.view, this.board, this.scene, this.deck, w, h);
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    this.time += dtMs / 1000;
    for (const l of this.lanterns) {
      l.s.rotation = this.calm ? 0 : Math.sin(this.time * 1.3 + l.ph) * 0.05;
      l.glow.x = l.s.x - Math.sin(l.s.rotation) * 60;
      l.glow.alpha = 0.42 + Math.sin(this.time * 9 + l.ph * 3) * 0.04 + Math.sin(this.time * 23 + l.ph) * 0.02;
    }
    // Found diamonds twinkle.
    if (!this.calm) {
      this.tiles.forEach((t, i) => {
        if (!t.content.visible || this.field[i] || t.content.alpha < 1) return;
        t.content.rotation = Math.sin(this.time * 2 + i) * 0.06;
      });
    }
  }

  busy() {
    return this.phase === 'play' || this.phase === 'anim';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.view.destroy({ children: true });
  }
}

function drawStation() {
  // The painted mine cart (paint.ts) stands in every room; this is only the flat fallback.
  const c = new Container();
  const s = new Sprite(stoneTexture(0));
  s.width = 76;
  s.height = 64;
  const lamp = new Container();
  lamp.label = 'lamp';
  c.addChild(s, lamp);
  return c;
}

export const mines: GameDefinition = {
  id: 'mines',
  name: 'Diamantminen',
  houseEdge: 1 - MINES_RTP,
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: 'Steine knacken, Diamanten sammeln – kassieren, bevor die Rußlaterne pufft.',
  drawStation,
  create: (ctx) => new MinesGame(ctx),
};
