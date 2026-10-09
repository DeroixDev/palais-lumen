// A casino floor seen from above: floor, walls, machines, furniture, the elevator,
// the player and the camera.

import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { getGame, getRoom, type RoomDefinition, type StationPlacement } from '../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, bake, glowTexture, mothTexture } from '../core/fx';
import type { GameState } from '../core/state';
import { animate, ease, wait } from '../core/tween';
import { drawTrophy } from './trophies';
import { Player } from './player';
import { Guests, type Spot } from './guests';
import { buildDecor, type BuiltDecor, type Rect } from './decor';
import { SIDE, WALL_H, paintFloor, paintWalls, shade } from './styles';
import { sfx } from '../core/audio';

export { WALL_H };

export type Interactable =
  | { kind: 'station'; station: StationPlacement; x: number; y: number; title: string }
  | { kind: 'elevator'; x: number; y: number; title: string }
  | { kind: 'shelf'; x: number; y: number; title: string };

/** Half the width of the elevator doorway. */
const DOOR_W = 46;

export class RoomScene {
  readonly view = new Container();
  readonly world = new Container();
  readonly def: RoomDefinition;
  readonly player: Player;
  private floorDecor = new Container();
  private wallDecor = new Container();
  private entities = new Container();
  private lights = new Container();
  private obstacles: Rect[] = [];
  private interactables: Interactable[] = [];
  private stationLamps: { g: Container; phase: number }[] = [];
  private lampMoths: { c: Container; wings: Sprite; base: number; cx: number; cy: number; r: number; ph: number; sp: number }[] = [];
  private animated: NonNullable<BuiltDecor['update']>[] = [];
  private spots: Spot[] = [];
  private guests: Guests | null = null;
  private fxLayer = new Container();
  private prompt = new Container();
  private promptText: Text;
  private shelf: Container | null = null;
  private shelfSize = { w: 300, h: 44 };
  private sign!: Sprite;
  private elevator!: { doorL: Container; doorR: Container; needle: Graphics; lamp: Sprite; open: number };
  private throne: (Container & { hit?: () => void }) | null = null;
  /** Direction the player faces while a cutscene moves them. */
  private scripted: number | null | undefined = undefined;
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;
  private pending: Interactable | null = null;
  private nearest: Interactable | null = null;
  private time = 0;
  private stepAcc = 0;
  private screenW = 800;
  private screenH = 600;
  zoom = 1;
  /** Height of the HTML bar covering the top of the screen. */
  topInset = 64;
  /** Disables movement while a game or menu is open. */
  frozen = false;
  private dead = false;

  constructor(
    roomId: string,
    private state: GameState,
    private onInteract: (i: Interactable) => void,
  ) {
    this.def = getRoom(roomId);
    this.view.addChild(this.world);
    this.buildShell();
    this.world.addChild(this.floorDecor, this.wallDecor);
    this.buildElevator();
    this.buildSign();
    this.world.addChild(this.entities);
    this.entities.sortableChildren = true;
    this.world.addChild(this.lights);
    this.buildStations();
    this.buildDecor();
    this.buildLights();
    this.world.addChild(this.fxLayer);

    const pos = state.data.roomId === this.def.id && state.data.position.x > 0 ? state.data.position : this.def.spawn;
    const host = state.data.players.host;
    this.player = new Player(host?.color ?? COLORS.lamp, { skin: host?.skin });
    this.player.view.position.set(pos.x, pos.y);
    this.entities.addChild(this.player.view);
    const guestCount = Math.min(7, Math.max(3, Math.round(this.def.stations.length * 0.7)));
    this.guests = new Guests(this.entities, this.fxLayer, this.spots, guestCount, (x, y) => this.collides(x, y), () => this.player.view.position);

    // Interaction prompt bubble.
    const bubble = new Graphics();
    this.promptText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: COLORS.ink } });
    this.promptText.anchor.set(0.5);
    this.prompt.addChild(bubble, this.promptText);
    this.prompt.visible = false;
    this.prompt.eventMode = 'static';
    this.prompt.cursor = 'pointer';
    this.prompt.on('pointertap', (e) => {
      e.stopPropagation();
      if (this.nearest) this.onInteract(this.nearest);
    });
    this.world.addChild(this.prompt);

    this.world.eventMode = 'static';
    this.world.on('pointertap', (e: FederatedPointerEvent) => this.onTap(e));
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearKeys);
  }

  // ---- Building ---------------------------------------------------------

  /** Floor and walls, painted once and baked into one texture. */
  private buildShell() {
    const { width: W, height: H, theme } = this.def;
    const c = new Container();
    const g = new Graphics();
    paintFloor(g, theme, W, H);
    paintWalls(g, theme, W, H);
    c.addChild(g);
    const b = c.getLocalBounds();
    const sprite = new Sprite(bake(c));
    sprite.position.set(b.x, b.y);
    this.world.addChild(sprite);
    this.obstacles.push({ x: 0, y: 0, w: W, h: WALL_H + 6 }, { x: 0, y: 0, w: SIDE, h: H }, { x: W - SIDE, y: 0, w: SIDE, h: H }, { x: 0, y: H - SIDE, w: W, h: SIDE });
  }

  /** Neon sign, baked once with its glow so the filter doesn't run every frame. */
  private buildSign() {
    const signText = new Text({ text: this.def.sign, style: { fontFamily: FONT_DISPLAY, fontSize: 44, fill: 0xfff6e6, letterSpacing: 6 } });
    const signWrap = new Container();
    signWrap.addChild(new Graphics().rect(-30, -30, signText.width + 60, signText.height + 60).fill({ color: 0, alpha: 0.001 }));
    signText.filters = [new GlowFilter({ color: this.def.theme.neon, distance: 20, outerStrength: 3.5, innerStrength: 0.6, quality: 0.2 })];
    signWrap.addChild(signText);
    this.sign = new Sprite(bake(signWrap));
    this.sign.anchor.set(0.5);
    this.sign.position.set(this.def.width / 2, 62);
    this.world.addChild(this.sign);
  }

  /** Art-deco elevator in the back wall: floor dial, brass doors, call button. */
  private buildElevator() {
    const ex = this.def.elevatorX;
    const t = this.def.theme;
    const c = new Container();
    c.position.set(ex, 0);
    const top = 62;
    const g = new Graphics();
    // Frame with a stepped art-deco crown.
    g.rect(-DOOR_W - 20, top - 10, (DOOR_W + 20) * 2, WALL_H - top + 10).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(-DOOR_W - 14, top - 6, (DOOR_W + 14) * 2, WALL_H - top + 6).fill(COLORS.brassDark);
    g.rect(-DOOR_W - 10, top - 2, (DOOR_W + 10) * 2, WALL_H - top + 2).fill(COLORS.brass);
    for (let i = 0; i < 3; i++) g.rect(-DOOR_W - 6 + i * 6, top - 12 - i * 6, (DOOR_W + 6 - i * 6) * 2, 6).fill(i % 2 ? COLORS.brass : COLORS.brassDark);
    // Floor dial above the doors.
    const dy = top - 22;
    g.circle(0, dy, 30).fill(COLORS.brassDark);
    g.moveTo(-28, dy).arc(0, dy, 28, Math.PI, 0).closePath().fill(0x1b1013);
    g.moveTo(-26, dy).arc(0, dy, 26, Math.PI, 0).stroke({ color: COLORS.brass, width: 1.5 });
    for (let f = 1; f <= 5; f++) {
      const a = Math.PI + ((f - 0.5) / 5) * Math.PI;
      g.circle(Math.cos(a) * 20, dy + Math.sin(a) * 20, f === 5 ? 3 : 2.2).fill(f === 5 ? 0xc9a0ff : 0xfff1c4);
    }
    g.rect(-30, dy, 60, 4).fill(COLORS.brass);
    // Cabin behind the doors: warm light, wood panels, a mirror at the back.
    g.rect(-DOOR_W, top, DOOR_W * 2, WALL_H - top).fill(0x2a1a10);
    g.rect(-DOOR_W + 8, top + 6, DOOR_W * 2 - 16, WALL_H - top - 24).fill(0x4a2a18);
    g.roundRect(-16, top + 14, 32, 44, 12).fill(0x9ab8d0).stroke({ color: COLORS.brass, width: 2 });
    g.rect(-DOOR_W, WALL_H - 14, DOOR_W * 2, 14).fill(shade(t.carpet, -0.2));
    c.addChild(g);
    const inner = new Sprite(glowTexture());
    inner.anchor.set(0.5);
    inner.position.set(0, top + 30);
    inner.width = 120;
    inner.height = 90;
    inner.tint = 0xffd9a0;
    inner.alpha = 0.5;
    inner.blendMode = 'add';
    c.addChild(inner);
    // Doors, masked to the doorway so they slide into the wall.
    const leaf = (side: number) => {
      const d = new Container();
      const lg = new Graphics();
      const x0 = side < 0 ? -DOOR_W : 0;
      lg.rect(x0, top, DOOR_W, WALL_H - top).fill(0xc9a04a).stroke({ color: COLORS.brassDark, width: 1.5 });
      lg.rect(x0 + 5, top + 5, DOOR_W - 10, WALL_H - top - 10).stroke({ color: COLORS.brassDark, width: 1.5 });
      // Sunburst rays fanning from the seam.
      const sx = side < 0 ? 0 : 0;
      for (let k = 0; k < 6; k++) {
        const a = (k / 5) * (Math.PI / 2) * 0.9 + 0.08;
        const ex2 = sx + side * Math.sin(a) * 40;
        const ey2 = top + 46 - Math.cos(a) * 40;
        lg.moveTo(sx + side * 3, top + 46).lineTo(ex2, Math.max(top + 6, ey2)).stroke({ color: COLORS.brassDark, width: 1.2, alpha: 0.8 });
      }
      lg.moveTo(x0 + 6, top + 64).lineTo(x0 + DOOR_W - 6, top + 64).stroke({ color: COLORS.brassDark, width: 1.2 });
      lg.rect(x0 + 2, top + 2, 3, WALL_H - top - 4).fill({ color: 0xffffff, alpha: 0.18 });
      d.addChild(lg);
      return d;
    };
    const doorL = leaf(-1);
    const doorR = leaf(1);
    const mask = new Graphics().rect(-DOOR_W, top, DOOR_W * 2, WALL_H - top).fill(0xffffff);
    c.addChild(doorL, doorR, mask);
    doorL.mask = mask;
    doorR.mask = mask;
    const seam = new Graphics().rect(-0.75, top, 1.5, WALL_H - top).fill({ color: COLORS.brassDark, alpha: 0.8 });
    doorL.addChild(seam);
    // Needle on the dial, and the call button.
    const needle = new Graphics().rect(-1.2, -22, 2.4, 22).fill(COLORS.red);
    needle.circle(0, 0, 3).fill(COLORS.brass);
    needle.position.set(0, dy);
    c.addChild(needle);
    const plate = new Graphics().roundRect(DOOR_W + 18, 92, 16, 30, 4).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 1.5 });
    plate.circle(DOOR_W + 26, 107, 4).fill(0xfff1c4);
    c.addChild(plate);
    const lamp = new Sprite(glowTexture());
    lamp.anchor.set(0.5);
    lamp.position.set(DOOR_W + 26, 107);
    lamp.width = lamp.height = 40;
    lamp.tint = t.neon;
    lamp.blendMode = 'add';
    c.addChild(lamp);
    // Threshold plate on the floor.
    const th = new Graphics().rect(-DOOR_W - 6, WALL_H, (DOOR_W + 6) * 2, 7).fill(COLORS.brassDark);
    th.rect(-DOOR_W - 6, WALL_H, (DOOR_W + 6) * 2, 2).fill(COLORS.brass);
    c.addChild(th);
    this.world.addChild(c);
    this.elevator = { doorL, doorR, needle, lamp, open: 0 };
    this.setDial(this.def.floor);
    this.interactables.push({ kind: 'elevator', x: ex, y: WALL_H + 40, title: 'Aufzug nehmen' });
  }

  /** Points the dial above the elevator at a floor (fractions move the needle in between). */
  setDial(floor: number) {
    this.elevator.needle.rotation = -Math.PI / 2 + ((floor - 0.5) / 5 - 0.5) * Math.PI;
  }

  private setDoors(open: number) {
    if (this.dead) return;
    this.elevator.open = open;
    this.elevator.doorL.x = -open * DOOR_W;
    this.elevator.doorR.x = open * DOOR_W;
  }

  private buildStations() {
    for (const st of this.def.stations) {
      const game = getGame(st.game);
      const c = game.drawStation(st.options ?? {});
      c.position.set(st.x, st.y);
      c.zIndex = st.y + game.footprint.h;
      this.entities.addChild(c);
      const lamp = c.children.find((ch) => ch.label === 'lamp');
      if (lamp) this.stationLamps.push({ g: lamp as Container, phase: Math.random() * 10 });
      if (st.label) {
        const t = new Text({ text: st.label.toUpperCase(), style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xfff6e6, letterSpacing: 1 } });
        t.anchor.set(0.5, 1);
        t.position.set(game.footprint.w / 2, -4);
        t.alpha = 0.8;
        c.addChild(t);
      }
      this.obstacles.push({ x: st.x, y: st.y, w: game.footprint.w, h: game.footprint.h });
      this.spots.push({ kind: 'station', x: st.x + game.footprint.w / 2, y: st.y + game.footprint.h + 22, fx: { x: st.x + game.footprint.w / 2, y: st.y + 10 } });
      this.interactables.push({
        kind: 'station',
        station: st,
        x: st.x + game.footprint.w / 2,
        y: st.y + game.footprint.h + 22,
        title: `${st.label ?? game.name} spielen`,
      });
    }
  }

  private buildDecor() {
    const layers = { floor: this.floorDecor, wall: this.wallDecor, entities: this.entities, lights: this.lights };
    for (const d of this.def.decor) {
      if (d.kind === 'trophyShelf') {
        this.buildShelf(d.x, d.y, d.w ?? 300);
        continue;
      }
      const b = buildDecor(d, this.def.theme);
      if (!b) continue;
      if (b.z !== undefined) b.view.zIndex = b.z;
      layers[b.layer].addChild(b.view);
      this.obstacles.push(...b.obstacles);
      if (b.update) this.animated.push(b.update);
      if (d.kind === 'throne') this.throne = b.view as Container & { hit?: () => void };
      // Places where guests like to hang out.
      const w = d.w ?? 0;
      const h = d.h ?? 0;
      if (d.kind === 'bar') {
        const bw = w || 300;
        const bh = h || 70;
        for (let i = 0; i < Math.floor(bw / 60); i++) this.spots.push({ kind: 'lounge', x: d.x - bw / 2 + 30 + i * 60, y: d.y + bh / 2 + 44 });
      } else if (d.kind === 'sofa' && (d.r ?? 0) % 2 === 0) {
        const sw = w || 160;
        const sh = h || 54;
        const fy = (d.r ?? 0) === 2 ? d.y - sh / 2 - 26 : d.y + sh / 2 + 26;
        this.spots.push({ kind: 'lounge', x: d.x - sw * 0.25, y: fy }, { kind: 'lounge', x: d.x + sw * 0.25, y: fy });
      } else if (d.kind === 'bench') this.spots.push({ kind: 'lounge', x: d.x, y: d.y + 36 });
      else if (d.kind === 'fountain' || d.kind === 'moonPool' || d.kind === 'iceSwan' || d.kind === 'champagne' || d.kind === 'piano')
        this.spots.push({ kind: 'lounge', x: d.x + 30, y: d.y + (d.kind === 'fountain' ? (w || 90) + 26 : d.kind === 'moonPool' ? (w || 100) * 0.7 + 26 : d.kind === 'piano' ? 120 : 52) });
    }
  }

  /** Glass trophy cabinet; it shows the player's latest trophies. */
  private buildShelf(x: number, y: number, w: number) {
    const h = 44;
    const c = new Container();
    const g = new Graphics();
    c.addChild(g);
    g.roundRect(4, -54, w, h + 64, 8).fill({ color: 0x000000, alpha: 0.4 });
    g.roundRect(0, -60, w, h + 60, 8).fill(0x1a0b10).stroke({ color: COLORS.brass, width: 3 });
    g.rect(6, h - 8, w - 12, 6).fill(COLORS.brass);
    g.rect(6, -54, w - 12, 50).fill({ color: 0xffffff, alpha: 0.04 });
    g.rect(6, -20, w - 12, 3).fill({ color: 0xffffff, alpha: 0.12 });
    g.poly([14, -54, 40, -54, 20, h - 10, 6, h - 10]).fill({ color: 0xffffff, alpha: 0.05 });
    const t = new Text({ text: 'VITRINE', style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2 } });
    t.anchor.set(0.5);
    t.position.set(w / 2, h + 12);
    c.addChild(t);
    this.shelf = new Container();
    c.addChild(this.shelf);
    this.shelfSize = { w, h };
    this.refreshShelf();
    const L = x - w / 2;
    const T = y - 50;
    c.position.set(L, T);
    c.zIndex = T + h;
    this.entities.addChild(c);
    this.obstacles.push({ x: L, y: T - 60, w, h: h + 60 });
    this.interactables.push({ kind: 'shelf', x, y: T + h + 30, title: 'Vitrine ansehen' });
  }

  refreshShelf() {
    if (!this.shelf) return;
    const { w, h } = this.shelfSize;
    this.shelf.removeChildren().forEach((c) => c.destroy({ children: true }));
    const trophies = this.state.data.trophies.slice(-8);
    if (trophies.length === 0) {
      const t = new Text({ text: 'noch leer', style: { fontFamily: FONT_BODY, fontSize: 14, fill: 0x8a7a6a, fontStyle: 'italic' } });
      t.anchor.set(0.5);
      t.position.set(w / 2, h / 2 - 14);
      this.shelf.addChild(t);
      return;
    }
    const step = (w - 20) / Math.max(1, trophies.length);
    trophies.forEach((tr, i) => {
      const t = drawTrophy(tr.kind, tr.medal);
      t.scale.set(0.42);
      t.position.set(10 + step * (i + 0.5), h - 8);
      this.shelf!.addChild(t);
    });
  }

  private buildLights() {
    const th = this.def.theme;
    // Soft pools of light on the floor, with a few moths circling each.
    for (let y = WALL_H + 140; y < this.def.height; y += 280) {
      for (let x = 200; x < this.def.width; x += 340) {
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.width = s.height = 420;
        s.tint = th.light;
        s.alpha = 0.12;
        s.blendMode = 'add';
        this.lights.addChild(s);
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          const c = new Container();
          const glow = new Sprite(glowTexture());
          glow.anchor.set(0.5);
          glow.width = glow.height = 34;
          glow.tint = th.light;
          glow.alpha = 0.35;
          glow.blendMode = 'add';
          const wings = new Sprite(mothTexture());
          wings.anchor.set(0.5);
          wings.width = wings.height = 14;
          wings.tint = 0xfff1c4;
          wings.alpha = 0.75;
          c.addChild(glow, wings);
          this.lights.addChild(c);
          this.lampMoths.push({ c, wings, base: 14 / wings.texture.width, cx: x, cy: y, r: 22 + Math.random() * 40, ph: Math.random() * 10, sp: 0.8 + Math.random() * 1.4 });
        }
      }
    }
    for (const st of this.def.stations) {
      const game = getGame(st.game);
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.position.set(st.x + game.footprint.w / 2, st.y + game.footprint.h / 2);
      s.width = game.footprint.w * 2.6;
      s.height = game.footprint.h * 2.6;
      s.tint = th.neon;
      s.alpha = 0.2;
      s.blendMode = 'add';
      this.lights.addChild(s);
    }
    const signGlow = new Sprite(glowTexture());
    signGlow.anchor.set(0.5);
    signGlow.position.set(this.def.width / 2, 70);
    signGlow.width = 900;
    signGlow.height = 240;
    signGlow.tint = th.neon;
    signGlow.alpha = 0.25;
    signGlow.blendMode = 'add';
    this.lights.addChild(signGlow);
  }

  // ---- Elevator and boss ----------------------------------------------------

  /** Moves the player in a straight line while the walk animation plays. */
  private async walkTo(x: number, y: number, speed = 200) {
    const pv = this.player.view;
    const sx = pv.x;
    const sy = pv.y;
    const d = Math.hypot(x - sx, y - sy);
    if (d < 2) return;
    this.scripted = Math.atan2(y - sy, x - sx);
    await animate((d / speed) * 1000, (k) => !this.dead && pv.position.set(sx + (x - sx) * k, sy + (y - sy) * k));
    this.scripted = null;
  }

  private async doors(open: boolean) {
    sfx.elevatorDoor();
    const from = this.elevator.open;
    await animate(650, (k) => this.setDoors(from + ((open ? 1 : 0) - from) * k), ease.inOutCubic);
  }

  /** Walk to the elevator, doors open, step in, turn around, doors close. */
  async boardElevator() {
    this.frozen = true;
    this.target = null;
    this.pending = null;
    this.prompt.visible = false;
    const ex = this.def.elevatorX;
    await this.walkTo(ex, WALL_H + 40);
    sfx.elevatorButton();
    this.elevator.lamp.alpha = 1;
    await this.doors(true);
    const pv = this.player.view;
    const a0 = pv.alpha;
    const fade = animate(500, (k) => !this.dead && (pv.alpha = a0 * (1 - k * 0.6)));
    await this.walkTo(ex, WALL_H - 8, 150);
    await fade;
    this.scripted = null;
    this.player.faceTowards(Math.PI / 2);
    await wait(450);
    const close = this.doors(false);
    await animate(500, (k) => !this.dead && (pv.alpha = a0 * 0.4 * (1 - k)));
    await close;
    this.scripted = undefined;
  }

  /** The player arrives by elevator: doors open, step out, doors close. */
  async exitElevator() {
    this.frozen = true;
    const ex = this.def.elevatorX;
    const pv = this.player.view;
    pv.position.set(ex, WALL_H - 8);
    pv.alpha = 0;
    this.scripted = null;
    this.player.faceTowards(Math.PI / 2);
    this.updateCamera();
    sfx.elevatorDing();
    await wait(300);
    const open = this.doors(true);
    await animate(400, (k) => !this.dead && (pv.alpha = k));
    await open;
    await this.walkTo(ex, WALL_H + 60, 150);
    this.scripted = undefined;
    void this.doors(false);
    this.frozen = false;
  }

  /** The Moth Queen flinches (boss floor only). */
  bossHit() {
    this.throne?.hit?.();
  }

  /** Where the Moth Queen floats, for effects aimed at her. */
  bossPoint() {
    const d = this.def.decor.find((x) => x.kind === 'throne');
    return d ? this.toScreen(d.x, d.y - 90) : null;
  }

  // ---- Input ------------------------------------------------------------

  private keyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if ((e.code === 'KeyE' || e.code === 'Enter') && !this.frozen && this.nearest) this.onInteract(this.nearest);
    if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      this.target = null;
      this.pending = null;
    }
  };
  private keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private clearKeys = () => this.keys.clear();

  private onTap(e: FederatedPointerEvent) {
    if (this.frozen) return;
    const p = this.world.toLocal(e.global);
    // Tapped close to something interactive? Walk there and use it.
    let best: Interactable | null = null;
    let bestD = 90;
    for (const i of this.interactables) {
      const d = Math.hypot(i.x - p.x, i.y - 20 - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best) {
      this.target = { x: best.x, y: best.y };
      this.pending = best;
    } else {
      this.target = { x: p.x, y: p.y };
      this.pending = null;
    }
  }

  // ---- Simulation -------------------------------------------------------

  private collides(x: number, y: number) {
    const r = 20;
    return this.obstacles.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const dt = Math.min(dtMs, 50) / 1000;
    let dx = 0;
    let dy = 0;
    if (!this.frozen) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      if (dx === 0 && dy === 0 && this.target) {
        const tx = this.target.x - this.player.view.x;
        const ty = this.target.y - this.player.view.y;
        const d = Math.hypot(tx, ty);
        if (d < 8) {
          this.target = null;
          if (this.pending) {
            const p = this.pending;
            this.pending = null;
            this.onInteract(p);
          }
        } else {
          dx = tx / d;
          dy = ty / d;
        }
      }
    }
    const len = Math.hypot(dx, dy);
    const pv = this.player.view;
    if (len > 0) {
      const speed = 280;
      const mx = (dx / len) * speed * dt;
      const my = (dy / len) * speed * dt;
      const ox = pv.x;
      const oy = pv.y;
      if (!this.collides(pv.x + mx, pv.y)) pv.x += mx;
      if (!this.collides(pv.x, pv.y + my)) pv.y += my;
      this.stepAcc += dt;
      if (this.stepAcc > 0.3) {
        this.stepAcc = 0;
        sfx.footstep();
      }
      // Stuck while walking to a tap target: give up, but still use the thing if we're close.
      if (this.target && Math.hypot(pv.x - ox, pv.y - oy) < 0.5) {
        const p = this.pending;
        const close = p && Math.hypot(p.x - pv.x, p.y - pv.y) < 70;
        this.target = null;
        this.pending = null;
        if (p && close) this.onInteract(p);
      }
    }
    this.player.update(dtMs, this.scripted !== undefined ? this.scripted : len > 0 ? Math.atan2(dy, dx) : null);
    pv.zIndex = pv.y + 16;

    // Nearest interactable and prompt.
    let best: Interactable | null = null;
    let bestD = 64;
    for (const i of this.interactables) {
      const d = Math.hypot(i.x - pv.x, i.y - pv.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      this.showPrompt(best);
    }
    if (this.prompt.visible) this.prompt.y = pv.y - 58 + Math.sin(this.time * 4) * 3;

    // Lamps on machines pulse; the neon sign flickers now and then.
    for (const l of this.stationLamps) l.g.alpha = 0.55 + 0.45 * Math.sin(this.time * 3 + l.phase);
    this.sign.alpha = Math.sin(this.time * 31) > 0.97 ? 0.55 : 1;
    for (const m of this.lampMoths) {
      const a = this.time * m.sp + m.ph;
      const x = m.cx + Math.cos(a) * m.r + Math.sin(a * 2.7) * 8;
      const y = m.cy + Math.sin(a * 1.3) * m.r * 0.7;
      m.c.rotation = Math.atan2(y - m.c.y, x - m.c.x) + Math.PI / 2;
      m.c.position.set(x, y);
      m.wings.scale.x = m.base * (0.35 + 0.65 * Math.abs(Math.cos(this.time * 22 + m.ph)));
    }
    for (const a of this.animated) a(this.time, dtMs);
    this.elevator.lamp.alpha = this.frozen ? 1 : 0.55 + 0.25 * Math.sin(this.time * 2.5);
    this.guests?.update(dtMs);

    this.updateCamera();
  }

  private showPrompt(i: Interactable | null) {
    if (!i || this.frozen) {
      this.prompt.visible = false;
      return;
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    this.promptText.text = `${touch ? 'Tippen' : 'E'} · ${i.title}`;
    const w = this.promptText.width + 28;
    const bubble = this.prompt.children[0] as Graphics;
    bubble.clear().roundRect(-w / 2, -18, w, 36, 18).fill(COLORS.lamp).stroke({ color: COLORS.ink, width: 2 });
    bubble.poly([-8, 17, 8, 17, 0, 27]).fill(COLORS.lamp);
    this.prompt.x = this.player.view.x;
    this.prompt.visible = true;
  }

  savePosition() {
    this.state.data.roomId = this.def.id;
    this.state.data.position = { x: Math.round(this.player.view.x), y: Math.round(this.player.view.y) };
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    const narrow = w < 700;
    this.zoom = Math.max(narrow ? 0.72 : 0.5, Math.min(1.2, Math.min(w / 1000, (h - this.topInset) / 720)));
    this.world.scale.set(this.zoom);
    this.updateCamera();
  }

  private updateCamera() {
    const z = this.world.scale.x;
    const W = this.def.width * z;
    const H = this.def.height * z;
    const px = this.player.view.x * z;
    const py = this.player.view.y * z;
    const cx = W <= this.screenW ? (this.screenW - W) / 2 : Math.min(0, Math.max(this.screenW - W, this.screenW / 2 - px));
    const top = this.topInset;
    const free = this.screenH - top;
    const cy = H <= free ? top + (free - H) / 2 : Math.min(top, Math.max(this.screenH - H, top + free / 2 - py));
    this.world.position.set(cx, cy);
  }

  /** Screen position of a world point (used to zoom into a machine). */
  toScreen(x: number, y: number) {
    return this.world.toGlobal({ x, y });
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearKeys);
    this.view.destroy({ children: true });
  }
}
