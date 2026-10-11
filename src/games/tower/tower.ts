// "Drachenturm": climb a stone tower floor by floor. On every floor pick one door; behind
// some of them a dragon sleeps. Every quiet door raises the multiplier, collect
// whenever you like. Wake a dragon and the climb is over (it only puffs a little smoke).
//
// Report tags: 'tower' (every round), 'tower5' (5+ floors climbed in the round), 'top'
// (reached the top), 'cashout' (collected), 'bust' (woke a dragon), 'hard' (on Schwer).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, sparkTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, label, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { LadderDeck, SCENE_H, SCENE_W, fmtMult, ladderWin, layoutLadder } from '../ladderKit';
import { DIFFS, FLOORS, TOWER_RTP, placeDragons, scoutDoor, scoutRtp, towerMult, towerPayout, towerPayoutShown, type Diff } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import {
  DOOR_H,
  FIRE,
  FLOOR_H,
  VIEW,
  baseTexture,
  doorLayout,
  doorTexture,
  dragonTexture,
  floorTexture,
  sceneTexture,
  smokeTexture,
  topTexture,
  treasureTexture,
} from './paint';
import { luckStep, luckOn } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const BETS = [10, 20, 50, 100, 200, 500];
const RULES =
  'Klettere Etage für Etage nach oben. Auf jeder Etage wählst du eine Tür – hinter manchen schläft ein Drache. ' +
  'Leicht: 1 von 4 Türen, Mittel: 1 von 3, Schwer: 2 von 3.\n\n' +
  'Jede ruhige Tür erhöht den Multiplikator; kassiere, wann du willst. Weckst du einen Drachen, ist der Einsatz weg. ' +
  'Multiplikator = 0,95 ÷ Chance, so weit zu kommen – jede Strategie zahlt auf Dauer genau 95 %.';
const DIFF_ORDER: Diff[] = ['easy', 'mid', 'hard'];
/** Where the active floor's middle sits in the window. */
const FOCUS_Y = VIEW.h * 0.6;
const DIM = 0x8a8696;

type Phase = 'idle' | 'play' | 'anim' | 'done';

interface Door {
  c: Container;
  leaf: Sprite;
  content: Sprite;
  glow: Sprite;
  open: boolean;
  focus: FocusHandle;
}

interface Floor {
  c: Container;
  band: Sprite;
  doors: Door[];
  plate: Text;
  halo: Sprite;
}

class TowerGame implements GameInstance {
  view = new Container();
  private board = new Container();
  private scene = new Container();
  private win = new Container();
  private world = new Container();
  private fxLayer = new Container();
  private floors: Floor[] = [];
  private top!: Sprite;
  private deck: LadderDeck;
  private bigText!: Text;
  private subText!: Text;
  private diffButtons: Button[] = [];
  private diffNote?: Text;

  private phase: Phase = 'idle';
  private diff: Diff = 'mid';
  private builtFor: Diff | null = null;
  private dragons: boolean[][] = [];
  private floor = 0;
  private stake = 0;
  private betIndex = 0;
  private bets: number[];
  private stakeWatch: StakeWatch;
  /** Odds item: the Minensucher shows one dragon of the first floor. On this round? */
  private odds: OddsWatch;
  private scout = false;
  private time = 0;
  private calm = reducedMotion();

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.mainAction();
      return;
    }
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m && !e.repeat) this.tapDoor(this.phase === 'play' ? this.floor : 0, Number(m[1]) - 1);
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'tower', ['minensucher']);
    this.deck = new LadderDeck({
      rtp: TOWER_RTP,
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
    halo.tint = 0x9a8aff;
    halo.alpha = 0.12;
    halo.blendMode = 'add';
    this.scene.addChild(halo, new Sprite(sceneTexture()));
    const title = new Text({ text: 'DRACHENTURM', style: { fontFamily: FONT_DISPLAY, fontSize: 18, fill: 0x2a1406, letterSpacing: 2, dropShadow: { color: 0xfff4d0, alpha: 0.5, blur: 0, distance: 1.2, angle: Math.PI / 2 } } });
    title.anchor.set(0.5);
    title.position.set(SCENE_W / 2, 26);
    if (title.width > 172) title.scale.set(172 / title.width);
    this.bigText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0xfff6e6 } });
    this.bigText.anchor.set(0.5);
    this.bigText.position.set(SCENE_W / 2, 65);
    this.subText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
    this.subText.anchor.set(0.5);
    this.subText.position.set(SCENE_W / 2, 85);
    this.scene.addChild(title, this.bigText, this.subText);

    // The window onto the tower; the world inside it moves up as we climb.
    this.win.position.set(VIEW.x, VIEW.y);
    const mask = new Graphics().roundRect(0, 0, VIEW.w, VIEW.h, 10).fill(0xffffff);
    this.win.addChild(mask, this.world, this.fxLayer);
    this.win.mask = mask;
    this.scene.addChild(this.win);
    this.buildTower();
    this.changeBet(0);
    this.refresh();
    this.world.y = this.cameraFor(0);
  }

  /** Floors for the chosen difficulty (3 or 4 doors each), foot and top. */
  private buildTower() {
    this.world.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.floors = [];
    const n = DIFFS[this.diff].doors;
    const base = new Sprite(baseTexture());
    base.position.set(0, 0);
    this.world.addChild(base);
    for (let i = 0; i < FLOORS; i++) {
      const c = new Container();
      c.y = -(i + 1) * FLOOR_H;
      const band = new Sprite(floorTexture(n, i));
      const halo = new Sprite(glowTexture());
      halo.anchor.set(0.5);
      halo.position.set(VIEW.w / 2, FLOOR_H - 50);
      halo.width = VIEW.w * 1.2;
      halo.height = 150;
      halo.tint = 0xffcf7a;
      halo.blendMode = 'add';
      halo.alpha = 0;
      c.addChild(band, halo);
      const { w, xs } = doorLayout(n);
      const doors: Door[] = xs.map((x, j) => this.makeDoor(c, i, j, x, w));
      // Multiplier plate over the doors.
      const plateBg = new Graphics();
      const plate = new Text({ text: fmtMult(towerMult(this.diff, i + 1)), style: { fontFamily: FONT_DISPLAY, fontSize: 16, fill: 0xfff1c4 } });
      plate.anchor.set(0.5);
      plate.position.set(VIEW.w / 2, 17);
      const pw = Math.max(70, plate.width + 26);
      plateBg.roundRect(VIEW.w / 2 - pw / 2, 5, pw, 24, 8).fill(0x1e1440).stroke({ color: COLORS.brass, width: 2 });
      const num = new Text({ text: `${i + 1}`, style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xd9c6a0 } });
      num.anchor.set(0.5);
      num.position.set(22, 17);
      const numBg = new Graphics().circle(22, 17, 13).fill(0x1e1440).stroke({ color: COLORS.brass, width: 2 });
      c.addChild(plateBg, plate, numBg, num);
      this.world.addChild(c);
      this.floors.push({ c, band, doors, plate, halo });
    }
    this.top = new Sprite(topTexture());
    this.top.y = -FLOORS * FLOOR_H - 150;
    this.world.addChild(this.top);
    this.builtFor = this.diff;
    this.paintFloors();
  }

  private makeDoor(parent: Container, floor: number, j: number, x: number, w: number): Door {
    const c = new Container();
    c.position.set(x, FLOOR_H - 12);
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(0, -DOOR_H * 0.4);
    glow.width = w * 1.6;
    glow.height = DOOR_H * 1.4;
    glow.blendMode = 'add';
    glow.alpha = 0;
    const content = new Sprite(treasureTexture());
    content.anchor.set(0.5, 1);
    content.position.set(0, -2);
    content.visible = false;
    const leaf = new Sprite(doorTexture(w));
    leaf.anchor.set(2 / (w + 4), 1 - 2 / (DOOR_H + 4));
    leaf.position.set(-w / 2, 0);
    c.addChild(glow, content, leaf);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const d: Door = { c, leaf, content, glow, open: false, focus: null as unknown as FocusHandle };
    c.on('pointerover', () => {
      if (this.doorLive(floor) && !d.open) leaf.tint = 0xffffff;
    });
    c.on('pointerout', () => {
      if (!d.open) this.paintFloors();
    });
    c.on('pointertap', () => this.tapDoor(floor, j));
    d.focus = focusable(c, {
      label: () => `Tür ${j + 1}, Etage ${floor + 1}`,
      rect: { x: -w / 2, y: -DOOR_H, w, h: DOOR_H },
      radius: 8,
      enabled: () => this.doorLive(floor) && !d.open,
      activate: () => this.tapDoor(floor, j),
    });
    parent.addChild(c);
    return d;
  }

  private buildOptions(tall: boolean, w: number) {
    const c = new Container();
    this.diffButtons = [];
    const bw = tall ? (w - 16) / 3 : (w - 12) / 3;
    DIFF_ORDER.forEach((d, i) => {
      const b = button({
        label: DIFFS[d].label,
        ariaLabel: (t) => `Schwierigkeit ${t}: ${DIFFS[d].dragons} von ${DIFFS[d].doors} Türen mit Drache`,
        width: bw,
        height: 46,
        color: 0x4a2a3a,
        textColor: 0xfff6e6,
        fontSize: 21,
        display: false,
        onClick: () => this.setDiff(d),
      });
      b.position.set(bw / 2 + i * (bw + (tall ? 8 : 6)), tall ? 26 : 42);
      this.diffButtons.push(b);
      c.addChild(b);
    });
    if (!tall) {
      const cap = label('SCHWIERIGKEIT', 17, 0xd9c6a0);
      cap.anchor.set(0.5);
      cap.position.set(w / 2, 8);
      this.diffNote = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: 0xe6d6b4 } });
      this.diffNote.anchor.set(0.5);
      this.diffNote.position.set(w / 2, 82);
      c.addChild(cap, this.diffNote);
    } else this.diffNote = undefined;
    return c;
  }

  private refreshOptions() {
    const locked = this.phase === 'play' || this.phase === 'anim';
    this.diffButtons.forEach((b, i) => {
      const on = DIFF_ORDER[i] === this.diff;
      b.setSelected(on);
      b.alpha = on ? 1 : 0.8;
      b.setEnabled(!locked || on);
    });
    if (this.diffNote) {
      const d = DIFFS[this.diff];
      this.diffNote.text = `${d.dragons} von ${d.doors} Türen: Drache`;
    }
  }

  // ---- State ---------------------------------------------------------------------------

  private doorLive(floor: number) {
    if (this.phase === 'play') return floor === this.floor;
    return (this.phase === 'idle' || this.phase === 'done') && floor === 0;
  }

  private setDiff(d: Diff) {
    if (this.phase === 'play' || this.phase === 'anim') return;
    if (d === this.diff) return;
    this.diff = d;
    this.ctx.sfx.chip();
    this.refreshRtp();
    this.buildTower();
    this.phase = 'idle';
    this.tweenCamera(0);
    this.refresh();
  }

  private changeBet(d: number) {
    if (this.phase === 'play' || this.phase === 'anim') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.deck.setBet(this.bet, this.betIndex > 0, this.betIndex < this.bets.length - 1);
  }

  private refresh() {
    const p = this.phase;
    const d = DIFFS[this.diff];
    if (p === 'idle') {
      this.status(`${d.label.toUpperCase()} · OBEN ${fmtMult(towerMult(this.diff, FLOORS))}`, 0xfff6e6, `${d.dragons} von ${d.doors} Türen: Drache`);
    } else if (p === 'play' || p === 'anim') {
      const k = this.floor;
      const next = k < FLOORS ? `nächste ${fmtMult(towerMult(this.diff, k + 1))}` : '';
      this.status(k === 0 ? '×1,00' : fmtMult(towerMult(this.diff, k)), k === 0 ? 0xfff6e6 : COLORS.lamp, `Etage ${k}/${FLOORS} · ${next}`);
    }
    const playing = p === 'play';
    this.deck.setMain(playing ? 'ZUFALL' : 'SPIELEN', p !== 'anim');
    const can = playing && this.floor > 0;
    this.deck.setSecond(can ? `KASSIEREN ${formatChips(towerPayoutShown(this.stake, this.diff, this.floor))}` : 'KASSIEREN', can);
    this.deck.lockBet(playing || p === 'anim');
    this.refreshOptions();
    this.paintFloors();
  }

  /** Active floor lit, floors above dimmed, climbed floors warm. */
  private paintFloors() {
    const active = this.phase === 'play' || this.phase === 'anim' ? this.floor : this.phase === 'idle' ? 0 : -1;
    this.floors.forEach((f, i) => {
      const live = i === active;
      f.band.tint = live ? 0xffffff : i < active || (active < 0 && f.doors.some((d) => d.open)) ? 0xc8bcc0 : DIM;
      f.halo.alpha = live ? 0.22 : 0;
      for (const d of f.doors) {
        if (!d.open) d.leaf.tint = live ? 0xf0e4dc : DIM;
        d.focus.refresh();
      }
    });
  }

  /** The deck's payout line: with the Minensucher it depends on the difficulty. */
  private refreshRtp() {
    setItemRtp('tower', 'minensucher', scoutRtp(this.diff));
    this.deck.setRtp(this.odds.id ? itemRtpText(scoutRtp(this.diff), 'minensucher').replace(' · ', '\n') : null, 0xffc890);
  }

  private status(big: string, col: number, sub: string) {
    this.bigText.text = big;
    this.bigText.style.fill = col;
    this.bigText.scale.set(1);
    if (this.bigText.width > 222) this.bigText.scale.set(222 / this.bigText.width);
    this.subText.text = sub;
    this.subText.scale.set(1);
    if (this.subText.width > 222) this.subText.scale.set(222 / this.subText.width);
  }

  private cameraFor(floor: number) {
    // Floor `floor` spans y ∈ [-(floor+1)·H, -floor·H] in the world.
    const mid = floor >= FLOORS ? -FLOORS * FLOOR_H - 40 : -(floor + 0.5) * FLOOR_H;
    return FOCUS_Y - mid;
  }

  private tweenCamera(floor: number, ms = 650) {
    const to = this.cameraFor(floor);
    if (this.calm) {
      this.world.y = to;
      return Promise.resolve();
    }
    return tween(this.world, { y: to }, ms, ease.inOutCubic);
  }

  private mainAction() {
    if (this.phase === 'anim') return;
    if (this.phase === 'play') {
      const f = this.floors[this.floor];
      // (Only closed doors: the Minensucher may have opened one on the first floor.)
      const closed = f.doors.map((d, i) => (d.open ? -1 : i)).filter((i) => i >= 0);
      void this.pick(closed[Math.floor(Math.random() * closed.length)]);
      return;
    }
    this.start();
  }

  private start(): boolean {
    if (this.phase === 'play' || this.phase === 'anim') return false;
    const bet = this.bet;
    if (!this.ctx.state.placeBet(bet)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return false;
    }
    this.deck.closeRules();
    this.stake = bet;
    // Every floor's dragons are placed before the first door opens.
    this.dragons = Array.from({ length: FLOORS }, () => placeDragons(this.diff));
    const wasUp = this.floor > 0 || this.floors.some((f) => f.doors.some((d) => d.open));
    if (this.builtFor !== this.diff) this.buildTower();
    for (const f of this.floors)
      for (const d of f.doors) {
        d.open = false;
        d.leaf.scale.x = 1;
        d.leaf.skew.y = 0;
        d.leaf.alpha = 1;
        d.content.visible = false;
        d.glow.alpha = 0;
      }
    this.fxLayer.removeChildren().forEach((c) => c.destroy());
    this.floor = 0;
    this.phase = 'play';
    this.scout = this.odds.on('minensucher');
    this.ctx.sfx.whoosh();
    if (wasUp) void this.tweenCamera(0, 500);
    this.refresh();
    if (this.scout) {
      // Minensucher: one sleeping dragon of the first floor is shown before the first pick.
      const d = this.floors[0].doors[scoutDoor(this.dragons[0])];
      void this.openDoor(d, true, false);
      d.glow.tint = 0xffa94a;
      d.glow.alpha = 0.6;
      const g = this.view.toLocal(d.c.getGlobalPosition());
      void itemMoment(this.view, g.x, g.y - 90 * this.board.scale.x, 'minensucher', 'DRACHE GEFUNDEN', Math.max(0.6, this.board.scale.x * 0.8));
      this.ctx.sfx.medal();
    }
    return true;
  }

  private tapDoor(floor: number, j: number) {
    if (this.phase === 'anim') return;
    if (this.phase !== 'play') {
      if (floor !== 0) return;
      if (!this.start()) return;
    }
    if (floor !== this.floor) return;
    const f = this.floors[floor];
    if (!f || j >= f.doors.length || f.doors[j].open) return;
    void this.pick(j);
  }

  private async pick(j: number) {
    if (this.phase !== 'play') return;
    const k = this.floor;
    const f = this.floors[k];
    const door = f.doors[j];
    if (luckOn()) {
      // Mod-Menü Gewinnchance: this floor's dragons are placed again (doors already shown
      // keep theirs), steered towards a free or a dragon door here.
      const shown = f.doors.map((d, x) => (d.open ? x : -1)).filter((x) => x >= 0);
      const place = () => {
        let r = placeDragons(this.diff);
        while (!shown.every((x) => r[x])) r = placeDragons(this.diff);
        return r;
      };
      this.dragons[k] = luckStep(place, (r) => !r[j]);
    }
    const dragon = this.dragons[k][j];
    this.phase = 'anim';
    this.refresh();
    await this.openDoor(door, dragon, true);
    if (this.view.destroyed) return;
    if (dragon) {
      await this.wake(door);
      if (this.view.destroyed) return;
      this.bust(k);
      return;
    }
    this.ctx.sfx.lineHit(Math.min(k, 9));
    this.sparkle(door);
    // The other doors of this floor open a crack: here slept the dragons.
    f.doors.forEach((d, i) => {
      if (i !== j) void wait(this.calm ? 0 : 200 + i * 60).then(() => {
        if (!d.c.destroyed) void this.openDoor(d, this.dragons[k][i], false);
      });
    });
    this.floor = k + 1;
    if (this.floor >= FLOORS) {
      await this.tweenCamera(FLOORS, 900);
      if (this.view.destroyed) return;
      this.phase = 'play';
      this.collect(true);
      return;
    }
    await wait(this.calm ? 120 : 380);
    if (this.view.destroyed) return;
    this.phase = 'play';
    this.refresh();
    void this.tweenCamera(this.floor);
    if (!this.calm) {
      this.bigText.scale.set(this.bigText.scale.x * 1.15);
      const s = Math.min(1, 222 / (this.bigText.width / this.bigText.scale.x));
      void tween(this.bigText.scale, { x: s, y: s }, 260, ease.outBack);
    }
  }

  /** The leaf swings out towards us on its hinge (3/4 view: it narrows, shears, darkens). */
  private async openDoor(d: Door, dragon: boolean, live: boolean) {
    if (d.open) return;
    d.open = true;
    d.content.texture = dragon ? dragonTexture(false) : treasureTexture();
    d.content.visible = true;
    d.content.alpha = live ? 1 : 0.55;
    d.content.tint = live ? 0xffffff : 0xa8a0b8;
    d.content.scale.set(dragon ? 0.82 : 0.9);
    d.glow.tint = dragon ? 0x9a8aff : 0xffcf7a;
    d.glow.alpha = live ? 0.7 : 0.15;
    if (live) this.ctx.sfx.creak();
    const end = live ? 1.95 : 1.3;
    const set = (a: number) => {
      if (d.leaf.destroyed) return;
      const cos = Math.cos(a);
      d.leaf.scale.x = Math.abs(cos) < 0.04 ? 0.04 * Math.sign(cos || 1) : cos;
      d.leaf.skew.y = -Math.sin(a) * 0.16;
      const shade = Math.round(240 - Math.sin(Math.min(a, Math.PI / 2)) * 110);
      d.leaf.tint = (shade << 16) | (Math.round(shade * 0.94) << 8) | Math.round(shade * 0.9);
    };
    if (this.calm) set(end);
    else await animate(live ? 460 : 300, (k) => set(end * k), ease.outCubic);
  }

  private sparkle(d: Door) {
    const g = d.c.getGlobalPosition();
    const s = this.board.scale.x;
    this.ctx.particles.sparkle(g.x, g.y - 40 * s, this.calm ? 3 : 10, 0xffcf7a, 90 * s);
    this.ctx.sfx.coin();
    if (!this.calm) {
      d.content.scale.set(0.5);
      void tween(d.content.scale, { x: 0.9, y: 0.9 }, 320, ease.outBack);
    }
  }

  /** The dragon wakes: eyes open, a hop, a puff of smoke and a warm fire glow. */
  private async wake(d: Door) {
    await wait(this.calm ? 80 : 260);
    if (d.c.destroyed) return;
    d.content.texture = dragonTexture(true);
    this.ctx.sfx.puff();
    const pos = this.fxLayer.toLocal(d.c.getGlobalPosition());
    const fire = new Sprite(glowTexture());
    fire.anchor.set(0.5);
    fire.position.set(pos.x - 20, pos.y - 34);
    fire.tint = FIRE;
    fire.blendMode = 'add';
    fire.alpha = 0;
    fire.width = fire.height = 50;
    this.fxLayer.addChild(fire);
    void animate(1100, (k) => {
      if (fire.destroyed) return;
      fire.alpha = Math.sin(k * Math.PI) * (0.85 + Math.sin(k * 40) * 0.1);
      fire.width = fire.height = 50 + 70 * k;
    }).then(() => fire.destroy());
    if (!this.calm) {
      const y0 = d.content.y;
      void animate(380, (k) => {
        if (d.content.destroyed) return;
        d.content.y = y0 - Math.sin(k * Math.PI) * 14;
        d.content.scale.set(0.82 + Math.sin(k * Math.PI) * 0.18);
      });
    }
    const puffs = this.calm ? 2 : 7;
    for (let i = 0; i < puffs; i++) {
      const s = new Sprite(smokeTexture());
      s.anchor.set(0.5);
      s.tint = i % 2 ? 0xb8a8c8 : 0x8a7a9a;
      s.alpha = 0;
      this.fxLayer.addChild(s);
      const x0 = pos.x - 26 + (Math.random() - 0.5) * 16;
      const y0 = pos.y - 36;
      const dx = -20 - Math.random() * 40;
      void animate(1200 + Math.random() * 500, (q) => {
        if (s.destroyed) return;
        s.x = x0 + dx * ease.outCubic(q) + Math.sin(q * 6 + i) * 4;
        s.y = y0 - 70 * q;
        s.scale.set(0.35 + q * 1.1);
        s.alpha = q < 0.15 ? (q / 0.15) * 0.8 : 0.8 * (1 - (q - 0.15) / 0.85);
      }, ease.linear).then(() => s.destroy());
    }
    await wait(this.calm ? 200 : 520);
  }

  private bust(k: number) {
    this.ctx.state.report({ game: 'tower', stake: this.stake, win: 0, rtp: this.scout ? scoutRtp(this.diff) : TOWER_RTP, tags: this.tags(k, ['bust']) });
    this.status('DRACHE!', 0xff9a7a, k ? `Etage ${k + 1} – der Einsatz ist weg.` : 'Gleich unten – der Einsatz ist weg.');
    this.deck.setMain('SPIELEN', false);
    this.deck.setSecond('KASSIEREN', false);
    // The rest of this floor opens, then all floors above show where the dragons slept.
    void this.revealFrom(k).then(() => this.endRound());
  }

  private collect(auto = false) {
    if (this.phase !== 'play' || this.floor === 0) return;
    this.phase = 'anim';
    const k = this.floor;
    const m = towerMult(this.diff, k);
    const win = towerPayout(this.stake, this.diff, k);
    this.ctx.state.payout(win);
    this.ctx.state.report({ game: 'tower', stake: this.stake, win, rtp: this.scout ? scoutRtp(this.diff) : TOWER_RTP, tags: this.tags(k, ['cashout']) });
    this.status(`+${formatChips(win)}`, COLORS.lamp, auto ? `Turmspitze! ${fmtMult(m)}` : `Kassiert auf Etage ${k} · ${fmtMult(m)}`);
    this.deck.setMain('SPIELEN', false);
    this.deck.setSecond('KASSIEREN', false);
    this.paintFloors();
    if (!this.calm) {
      this.bigText.scale.set(this.bigText.scale.x * 1.25);
      const s = Math.min(1, 222 / (this.bigText.width / this.bigText.scale.x));
      void tween(this.bigText.scale, { x: s, y: s }, 380, ease.outBack);
    }
    const at = this.scene.toGlobal({ x: SCENE_W / 2, y: 70 });
    if (m > 1) {
      const local = this.view.toLocal(at);
      floatText(this.view, local.x, local.y - 10, `+${formatChips(win)}`, COLORS.lamp, Math.round(30 * Math.max(0.8, this.board.scale.x)));
    } else this.ctx.sfx.partial();
    if (auto && !this.calm) this.topFlare();
    void ladderWin(this.ctx, this.board, this.scene, m, win, at, { big: 'TURMSCHATZ', jackpot: 'DRACHENHORT' }).then(() => this.endRound());
  }

  private topFlare() {
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      s.tint = 0xfff1c4;
      s.blendMode = 'add';
      s.position.set(VIEW.w / 2 + (Math.random() - 0.5) * 120, this.world.y + this.top.y + 40 + Math.random() * 40);
      s.scale.set(0);
      this.fxLayer.addChild(s);
      void animate(900, (q) => {
        if (s.destroyed) return;
        s.scale.set(Math.sin(q * Math.PI) * 1.4);
        s.rotation = q * 3;
      }).then(() => s.destroy());
    }
  }

  private tags(k: number, extra: string[]) {
    const t = ['tower', ...extra];
    if (k >= 5) t.push('tower5');
    if (k >= FLOORS) t.push('top');
    if (this.diff === 'hard') t.push('hard');
    return t;
  }

  /** After a dragon: the rest of the floor opens, dimmed. */
  private async revealFrom(k: number) {
    const f = this.floors[k];
    f.doors.forEach((d, i) => {
      if (!d.open) void wait(this.calm ? 0 : i * 70).then(() => {
        if (!d.c.destroyed) void this.openDoor(d, this.dragons[k][i], false);
      });
    });
    await wait(this.calm ? 200 : 700);
  }

  private endRound() {
    if (this.view.destroyed) return;
    this.phase = 'done';
    this.deck.setMain('SPIELEN', true);
    this.deck.lockBet(false);
    this.refreshOptions();
    this.paintFloors();
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
    if (this.odds.poll()) this.refreshRtp();
    this.time += dtMs / 1000;
    if (this.calm) return;
    const active = this.phase === 'play' ? this.floor : this.phase === 'idle' ? 0 : -1;
    const f = this.floors[active];
    if (f) f.halo.alpha = 0.18 + Math.sin(this.time * 2.4) * 0.06;
    // Sleeping dragons breathe; treasure glows.
    for (const fl of this.floors)
      for (const d of fl.doors) {
        if (!d.content.visible) continue;
        d.glow.alpha = d.content.alpha >= 1 ? 0.55 + Math.sin(this.time * 3 + d.c.x) * 0.12 : 0.15;
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
  // The painted tower (paint.ts) stands in every room; this is only the flat fallback.
  const c = new Container();
  const g = new Graphics().roundRect(10, 0, 56, 64, 8).fill(0x5e5468).stroke({ color: COLORS.brass, width: 2 });
  const lamp = new Container();
  lamp.label = 'lamp';
  c.addChild(g, lamp);
  return c;
}

export const tower: GameDefinition = {
  id: 'tower',
  name: 'Drachenturm',
  houseEdge: 1 - TOWER_RTP,
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: 'Tür für Tür den Turm hinauf – nur keinen schlafenden Drachen wecken.',
  drawStation,
  create: (ctx) => new TowerGame(ctx),
};
