// A casino floor seen from above: floor, walls, machines, furniture, the elevator,
// the player and the camera.

import { clearLine, findPath, type Pt } from './pathfind';
import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { getGame, getRoom, type DecorKind, type DoorDef, type RoomDefinition, type StationPlacement } from '../core/registry';
import { doorStand, paintedDoorway } from './painted/doorway';
import { ACHIEVEMENTS } from '../core/achievements';
import { COMPANION_COLOR } from '../core/items';
import { COLORS, FONT_BODY, FONT_DISPLAY, bake, glowTexture, emblemTexture } from '../core/fx';
import type { GameState } from '../core/state';
import { animate, ease, wait } from '../core/tween';
import { drawTrophy } from './trophies';
import { Player, type Avatar } from './player';
import { Chibi } from './painted/chibi';
import { paintShell, paintedElevator, paintedSign, type LightSpot } from './painted/foyerShell';
import { paintedStation } from './painted/stations';
import { buildPaintedDecor } from './painted';
import { paintedAchBoard, paintedVitrine } from './painted/foyerProps';
import { Guests, type Spot } from './guests';
import { RoomExtras, type ExtraInteractable } from './roomExtras';
import { CORRIDOR_BOTTOM, CorridorScene, corridorLeadPx, corridorZoom } from './bossRun';
import { RoomSpecials } from './sideRooms';
import { albumLectern } from './albumLectern';
import { MinibossFigure } from './minibossFigure';
import { Regulars } from './regulars';
import { guestFactor, onEventSwitch } from '../core/events';
import { buildDecor, type BuiltDecor, type Rect } from './decor';
import { SIDE, WALL_H, paintFloor, paintWalls, shade } from './styles';
import { sfx } from '../core/audio';
import { CLUB_USE_TITLE } from './clubUse';
import { clubLightSpots, clubSign } from './painted/propsClub';
import { TABLET_Y, paintedTablet } from './painted/tablet';

import { CURRENCY } from '../core/brand';
export { WALL_H };

export type Interactable =
  | { kind: 'station'; station: StationPlacement; x: number; y: number; title: string; area?: Rect }
  | { kind: 'elevator'; x: number; y: number; title: string }
  | { kind: 'door'; door: DoorDef; x: number; y: number; title: string }
  | { kind: 'shelf'; x: number; y: number; title: string }
  | { kind: 'achievements'; x: number; y: number; title: string }
  | { kind: 'use'; prop: DecorKind; x: number; y: number; title: string; cx: number; cy: number; poke?: () => void; area?: Rect }
  /** The house-tech panel on the back wall (one per room, see buildTablet). */
  | { kind: 'tablet'; x: number; y: number; title: string }
  | ExtraInteractable;

/** Things on the floors you can use, and what the prompt says. */
const USE_TITLE: Partial<Record<DecorKind, string>> = {
  shopCounter: 'Laden öffnen',
  wardrobe: 'Umkleide',
  reception: 'Empfang · Gruppe',
  piano: 'Klavier spielen',
  fountain: `Ein ${CURRENCY} wünschen`,
  jukebox: 'Platte wechseln',
  bar: 'Mocktail bestellen',
  champagne: 'Anstoßen',
  clockTower: 'Glocke läuten',
  boiler: 'Dampf ablassen',
  moonPool: 'Mondlicht berühren',
  lanternPost: 'Glühwürmchen aufscheuchen',
  crystal: 'Kristall anschlagen',
  iceSwan: 'Eisschwan bestaunen',
  brazier: 'Glut anfachen',
  plaque: 'Wie das Haus gewinnt',
  ...CLUB_USE_TITLE,
};

/** Half the width of the elevator doorway. */
const DOOR_W = 46;
/** The player's feet box around the standing point (see `collides`). */
const FEET_W = 18;
const FEET_UP = 6;
const FEET_DOWN = 4;

export class RoomScene {
  readonly view = new Container();
  readonly world = new Container();
  readonly def: RoomDefinition;
  readonly player: Avatar;
  /** The painted look (3/4 view, soft light); only the foyer has it so far. */
  readonly painted: boolean;
  private floorDecor = new Container();
  private wallDecor = new Container();
  private entities = new Container();
  private lights = new Container();
  private obstacles: Rect[] = [];
  private interactables: Interactable[] = [];
  private stationLamps: { g: Container; phase: number }[] = [];
  /** Little lights drifting round the lamps (the house's old moths, now motes of light). */
  private lampMotes: { c: Container; glow: Sprite; core: Sprite; cx: number; cy: number; r: number; ph: number; sp: number; size: number }[] = [];
  private animated: NonNullable<BuiltDecor['update']>[] = [];
  private spots: Spot[] = [];
  private guests: Guests | null = null;
  /** Day event, task guests and stamp-card upgrades (src/world/roomExtras.ts). */
  extras!: RoomExtras;
  /** Boss corridor: gates, plaques, the Queen's challenge (src/world/bossRun.ts). */
  corridor: CorridorScene | null = null;
  /** Side-room finds, spotlit special machines and ambience (src/world/sideRooms.ts). */
  private specials: RoomSpecials | null = null;
  /** Today's mini boss on its floor (src/world/minibossFigure.ts). */
  miniboss: MinibossFigure | null = null;
  /** The regulars standing here today (src/world/regulars.ts). */
  regulars: Regulars | null = null;
  private fxLayer = new Container();
  private prompt = new Container();
  private promptText: Text;
  private shelf: Container | null = null;
  private achWall: { c: Container; w: number } | null = null;
  private entrance: BuiltDecor | null = null;
  private companion: { c: Container; glow: Sprite; core: Sprite; vx: number; vy: number } | null = null;
  private useCooldown = 0;
  private shelfSize = { w: 300, h: 44 };
  private sign!: Container;
  /** Side rooms have no elevator; they are reached through a door from the floor's main room. */
  private elevator: { doorL: Container; doorR: Container; needle: Graphics; lamp: Sprite; open: number } | null = null;
  private throne: (Container & { hit?: () => void; phase?: (n: number) => void; laugh?: () => void }) | null = null;
  /** Direction the player faces while a cutscene moves them. */
  private scripted: number | null | undefined = undefined;
  private keys = new Set<string>();
  /** Swipe-and-hold steering on touch screens (screen coordinates). */
  private drag: { id: number; sx: number; sy: number; x: number; y: number; active: boolean } | null = null;
  private stick = new Graphics();
  /** How long the player has been pushing against the thing in front of them. */
  private bump = 0;
  private target: { x: number; y: number } | null = null;
  private pending: Interactable | null = null;
  /** Waypoints towards `target` found by the route finder (click-to-walk goes round obstacles). */
  private route: Pt[] = [];
  /** A few fresh route searches are allowed when the walk gets stuck (a guest stepped in the way). */
  private replanned = 0;
  /** Brass ring that marks where a click sends the player. */
  private marker: Graphics | null = null;
  private markerT = 0;
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
  /** Photo mode moves the camera itself; the room leaves it alone. */
  cameraLocked = false;
  private dead = false;

  constructor(
    roomId: string,
    private state: GameState,
    private onInteract: (i: Interactable) => void,
  ) {
    this.def = getRoom(roomId);
    this.painted = true;
    this.view.addChild(this.world);
    this.buildShell();
    this.world.addChild(this.floorDecor, this.wallDecor);
    if (!this.def.parent) this.buildElevator();
    this.buildDoors();
    this.buildSign();
    this.world.addChild(this.entities);
    this.entities.sortableChildren = true;
    this.world.addChild(this.lights);
    this.buildStations();
    this.buildDecor();
    this.buildLights();
    this.world.addChild(this.fxLayer);

    const saved = state.data.roomId === this.def.id && state.data.position.x > 0 ? state.data.position : null;
    // A save from before the room was rebuilt may put the player inside a wall or a machine.
    const pos = saved && saved.x < this.def.width && saved.y < this.def.height && !this.collides(saved.x, saved.y) ? saved : this.def.spawn;
    this.player = this.makePlayer();
    this.player.view.position.set(pos.x, pos.y);
    this.entities.addChild(this.player.view);
    this.buildCompanion();
    this.placeUseSpots();
    this.extras = new RoomExtras(state, this.def, { spots: this.spots, world: this.world, entities: this.entities, lights: this.lights, fx: this.fxLayer, interactables: this.interactables, obstacles: this.obstacles, collides: (x, y) => this.collides(x, y), player: () => this.player.view.position });
    if (this.def.corridor) this.corridor = new CorridorScene(state, this.def, { world: this.world, entities: this.entities, lights: this.lights, fx: this.fxLayer, interactables: this.interactables, obstacles: this.obstacles, player: () => this.player.view.position });
    this.specials = new RoomSpecials(state, this.def, { floor: this.floorDecor, entities: this.entities, lights: this.lights, fx: this.fxLayer, interactables: this.interactables, obstacles: this.obstacles, floatText: (t, x, y, c, sz) => this.floatText(t, x, y, c, sz), refreshPrompt: () => (this.nearest = null) });
    // The moth album's lectern in the foyer (src/world/albumLectern.ts).
    albumLectern(this.def, { entities: this.entities, obstacles: this.obstacles, interactables: this.interactables });
    this.miniboss = MinibossFigure.for(state, this.def, { entities: this.entities, lights: this.lights, interactables: this.interactables, obstacles: this.obstacles, collides: (x, y) => this.collides(x, y) });
    if (!this.def.corridor) this.regulars = new Regulars(state, this.def, { entities: this.entities, fx: this.fxLayer, interactables: this.interactables, obstacles: this.obstacles, collides: (x, y) => this.collides(x, y), player: () => this.player.view.position, refreshPrompt: () => (this.nearest = null) });
    this.buildTablet();
    this.spawnGuests();
    // Debug switched today's event: closed games and the crowd change right away.
    this.offEventSwitch = onEventSwitch(() => {
      this.extras.refresh();
      this.spawnGuests();
    });

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
    window.addEventListener('pointerdown', this.dragStart);
    window.addEventListener('pointermove', this.dragMove);
    window.addEventListener('pointerup', this.dragEnd);
    window.addEventListener('pointercancel', this.dragEnd);
    this.view.addChild(this.stick);
  }

  // ---- Building ---------------------------------------------------------

  /** Floor and walls, painted once and baked into one texture. */
  private buildShell() {
    const { width: W, height: H, theme } = this.def;
    if (this.painted) {
      this.world.addChild(paintShell(this.def, this.lightSpots()));
      this.obstacles.push({ x: 0, y: 0, w: W, h: WALL_H + 6 }, { x: 0, y: 0, w: SIDE, h: H }, { x: W - SIDE, y: 0, w: SIDE, h: H }, { x: 0, y: H - SIDE, w: W, h: SIDE });
      return;
    }
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
    if (this.painted) {
      const t = this.def.theme;
      const s = clubSign(this.def.sign, t.style, t.neon, this.def.width / 2, 62, FONT_DISPLAY) ?? paintedSign(this.def.sign, this.def.width / 2, 62, FONT_DISPLAY);
      this.sign = s.view;
      this.world.addChild(s.view);
      this.animated.push((time) => s.update(time));
      return;
    }
    const signText = new Text({ text: this.def.sign, style: { fontFamily: FONT_DISPLAY, fontSize: 44, fill: 0xfff6e6, letterSpacing: 6 } });
    const signWrap = new Container();
    signWrap.addChild(new Graphics().rect(-30, -30, signText.width + 60, signText.height + 60).fill({ color: 0, alpha: 0.001 }));
    signText.filters = [new GlowFilter({ color: this.def.theme.neon, distance: 20, outerStrength: 3.5, innerStrength: 0.6, quality: 0.2 })];
    signWrap.addChild(signText);
    const sign = new Sprite(bake(signWrap));
    sign.anchor.set(0.5);
    sign.position.set(this.def.width / 2, 62);
    this.sign = sign;
    this.world.addChild(sign);
  }

  /** Art-deco elevator in the back wall: floor dial, brass doors, call button. */
  private buildElevator() {
    const ex = this.def.elevatorX;
    if (this.painted) {
      const e = paintedElevator(ex, 6);
      this.world.addChild(e.c);
      this.elevator = { doorL: e.doorL, doorR: e.doorR, needle: e.needle, lamp: e.lamp, open: 0 };
      this.setDial(this.def.floor);
      this.interactables.push({ kind: 'elevator', x: ex, y: WALL_H + 40, title: 'Aufzug nehmen' });
      return;
    }
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
    g.moveTo(-28, dy).arc(0, dy, 28, Math.PI, 0).closePath().fill(0x0c1026);
    g.moveTo(-26, dy).arc(0, dy, 26, Math.PI, 0).stroke({ color: COLORS.brass, width: 1.5 });
    for (let f = 0; f <= 5; f++) {
      const a = Math.PI + ((f + 0.5) / 6) * Math.PI;
      g.circle(Math.cos(a) * 20, dy + Math.sin(a) * 20, f === 5 ? 3 : 2.2).fill(f === 5 ? 0xdfe8ff : 0xfff1c4);
    }
    g.rect(-30, dy, 60, 4).fill(COLORS.brass);
    // Cabin behind the doors: warm light, night-blue lacquer, a moon-silver mirror at the back.
    g.rect(-DOOR_W, top, DOOR_W * 2, WALL_H - top).fill(0x0c1434);
    g.rect(-DOOR_W + 8, top + 6, DOOR_W * 2 - 16, WALL_H - top - 24).fill(0x1c2a5e);
    g.roundRect(-16, top + 14, 32, 44, 12).fill(0xdfe8ff).stroke({ color: COLORS.brass, width: 2 });
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

  /**
   * The small house-tech tablet on the back wall: on the stretch of wall that is furthest from
   * everything else up there (elevator, doorways, the sign, pictures and lamps, machines and
   * furniture standing against the wall, other things to use), so it never blocks a way or a game.
   * In the boss corridor it hangs in the first stretch, before the first gate.
   */
  private buildTablet() {
    const W = this.def.width;
    const busy: [number, number][] = [];
    const add = (a: number, b: number) => busy.push([a, b]);
    if (!this.def.parent) add(this.def.elevatorX - 125, this.def.elevatorX + 125);
    for (const d of this.def.doors ?? []) if (d.side === 'back') add(d.x - 95, d.x + 95);
    const sb = this.sign.getLocalBounds();
    const half = Math.min(320, sb.width / 2);
    add(this.sign.x - half - 20, this.sign.x + half + 20);
    const WALL_W: Partial<Record<DecorKind, number>> = { painting: 80, sconce: 40, window: 66, mirror: 60, wallClock: 40, ivy: 80, banner: 50, relief: 80, gauge: 40, curtain: 80, neonArt: 140, laser: 40, strobe: 40, hoop: 60, plaque: 120, achievementWall: 250, moonWindow: 92, floorBoard: 104 };
    for (const d of this.def.decor) {
      const wallPiece = WALL_W[d.kind];
      if (wallPiece !== undefined) {
        const w = d.w && d.w > 2 ? d.w : wallPiece;
        add(d.x - w / 2 - 26, d.x + w / 2 + 26);
      } else if (d.y < WALL_H + 110 && !['rug', 'runner', 'path', 'mosaic', 'gearInlay', 'chandelier', 'gasPipe', 'domeFloor'].includes(d.kind)) {
        const w = d.w && d.w > 2 ? d.w : 60;
        add(d.x - w / 2 - 20, d.x + w / 2 + 20);
      }
    }
    for (const st of this.def.stations)
      if (st.y < WALL_H + 140) {
        const g = getGame(st.game);
        add(st.x - 20, st.x + g.footprint.w + 20);
      }
    for (const i of this.interactables) if (i.y < WALL_H + 120) add(i.x - 70, i.x + 70);
    let lo = SIDE + 60;
    let hi = W - SIDE - 60;
    if (this.def.corridor) {
      const gates = this.interactables.filter((i) => i.kind === 'extra' && i.x > this.def.elevatorX + 200).map((i) => i.x);
      hi = Math.min(hi, (gates.length ? Math.min(...gates) : 1000) - 120);
    }
    const sy = WALL_H + 40;
    let best = -Infinity;
    let bestX = Math.round((lo + hi) / 2);
    // A room may name its spot (tabletX); it is used while its floor spot is free.
    const fixed = this.def.tabletX;
    if (fixed !== undefined && !this.collides(fixed, sy)) {
      lo = hi = bestX = fixed;
    }
    for (let x = lo; x <= hi; x += 5) {
      if (this.collides(x, sy) || this.collides(x, sy + 30)) continue;
      let clear = Math.min(x - lo + 40, hi - x + 40);
      // Outside a busy stretch: the distance to it; inside: how deep (negative).
      for (const [a, b] of busy) clear = Math.min(clear, x < a ? a - x : x > b ? x - b : -Math.min(x - a, b - x));
      if (clear > best) {
        best = clear;
        bestX = x;
      }
    }
    const t = paintedTablet(bestX);
    this.wallDecor.addChild(t.view);
    this.animated.push((time) => t.update(time));
    this.interactables.push({ kind: 'tablet', x: bestX, y: sy, title: 'Haustechnik' });
  }

  /** Doorways to the other rooms of this floor. */
  private buildDoors() {
    for (const door of this.def.doors ?? []) {
      this.wallDecor.addChild(paintedDoorway(door, this.def.width, this.def.height, this.def.theme.neon, this.def.theme.style));
      const p = doorStand(door, this.def.width, this.def.height);
      const name = door.label ?? getRoom(door.to).name;
      this.interactables.push({ kind: 'door', door, x: p.x, y: p.y, title: name });
    }
  }

  /** Walk up to a door and fade out through it. */
  async leaveThrough(door: DoorDef) {
    this.frozen = true;
    this.target = null;
    this.pending = null;
    this.prompt.visible = false;
    const p = doorStand(door, this.def.width, this.def.height);
    await this.walkTo(p.x, p.y);
    const out = { back: [0, -60], left: [-50, 0], right: [50, 0], front: [0, 50] }[door.side];
    sfx.door();
    await this.walkTo(p.x + out[0], p.y + out[1], 170);
    this.scripted = undefined;
  }

  /** Coming in through the door that leads back to `fromId` (or the spawn point if there is none). */
  async arriveFrom(fromId: string) {
    const door = (this.def.doors ?? []).find((d) => d.to === fromId);
    if (!door) {
      this.frozen = false;
      return;
    }
    this.frozen = true;
    const p = doorStand(door, this.def.width, this.def.height);
    const out = { back: [0, -50], left: [-40, 0], right: [40, 0], front: [0, 40] }[door.side];
    this.player.view.position.set(p.x + out[0], p.y + out[1]);
    this.updateCamera();
    await this.walkTo(p.x - out[0] * 0.6, p.y - out[1] * 0.6, 170);
    this.scripted = undefined;
    this.frozen = false;
  }

  /** Points the dial above the elevator at a floor (fractions move the needle in between). */
  setDial(floor: number) {
    if (!this.elevator) return;
    this.elevator.needle.rotation = ((floor + 0.5) / 6 - 0.5) * Math.PI;
  }

  private setDoors(open: number) {
    if (this.dead || !this.elevator) return;
    this.elevator.open = open;
    this.elevator.doorL.x = -open * DOOR_W;
    this.elevator.doorR.x = open * DOOR_W;
  }

  private buildStations() {
    for (const st of this.def.stations) {
      const game = getGame(st.game);
      const painted = this.painted ? paintedStation(st.game, st.options ?? {}) : null;
      const c = painted ?? game.drawStation(st.options ?? {});
      c.position.set(st.x, st.y);
      c.zIndex = st.y + game.footprint.h;
      this.entities.addChild(c);
      const lamp = c.children.find((ch) => ch.label === 'lamp');
      if (lamp) this.stationLamps.push({ g: lamp as Container, phase: Math.random() * 10 });
      if (st.label) {
        const t = new Text({ text: st.label.toUpperCase(), style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xfff6e6, letterSpacing: 1 } });
        t.anchor.set(0.5, 1);
        t.position.set(game.footprint.w / 2, painted?.labelY ?? -4);
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
        // Usable from every free side, not only from the front.
        area: { x: st.x, y: st.y, w: game.footprint.w, h: game.footprint.h },
      });
    }
  }

  private pendingUse: { i: Extract<Interactable, { kind: 'use' }>; o: Rect; from?: 'below' | 'above' }[] = [];

  /** Puts each usable thing's prompt spot on a free side (the piano is played from the keys). */
  private placeUseSpots() {
    for (const { i, o, from } of this.pendingUse) {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const below: [number, number] = [cx, o.y + o.h + 26];
      const above: [number, number] = [cx, o.y - 26];
      const cands: [number, number][] = from === 'below' ? [below, above] : from === 'above' || i.prop === 'piano' ? [above, below] : [below, [o.x - 26, cy], [o.x + o.w + 26, cy], above];
      const spot = cands.find(([x, y]) => !this.collides(x, y)) ?? below;
      i.x = spot[0];
      i.y = spot[1];
      // Things with a fixed side (the piano's keys) keep it; everything else works from all sides.
      if (!from && i.prop !== 'piano') i.area = o;
      this.interactables.push(i);
    }
    this.pendingUse = [];
  }

  private buildDecor() {
    const layers = { floor: this.floorDecor, wall: this.wallDecor, entities: this.entities, lights: this.lights };
    for (const d of this.def.decor) {
      if (d.kind === 'trophyShelf') {
        this.buildShelf(d.x, d.y, d.w ?? 300);
        continue;
      }
      if (d.kind === 'achievementWall') {
        this.buildAchievementWall(d.x, d.w ?? 240);
        continue;
      }
      // The painted look returns several pieces (a counter and its shopkeeper); the first is the prop itself.
      const parts = (this.painted && buildPaintedDecor(d, this.def.theme)) || [buildDecor(d, this.def.theme)].filter((x): x is BuiltDecor => !!x);
      const b = parts[0];
      if (!b) continue;
      if (d.kind === 'entrance') this.entrance = b;
      const title = USE_TITLE[d.kind];
      if (title) {
        const o = b.obstacles.length ? b.obstacles.reduce((a, r) => ({ x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), w: Math.max(a.x + a.w, r.x + r.w) - Math.min(a.x, r.x), h: Math.max(a.y + a.h, r.y + r.h) - Math.min(a.y, r.y) })) : { x: d.x - 20, y: d.y - 20, w: 40, h: 40 };
        this.pendingUse.push({ i: { kind: 'use', prop: d.kind, x: 0, y: 0, title, cx: d.x, cy: d.y, poke: b.poke }, o, from: b.useFrom });
      }
      for (const part of parts) {
        if (part.z !== undefined) part.view.zIndex = part.z;
        layers[part.layer].addChild(part.view);
        this.obstacles.push(...part.obstacles);
        if (part.update) this.animated.push(part.update);
      }
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
    if (this.painted) {
      const { back, glass } = paintedVitrine(w, h);
      c.addChild(back);
      this.shelf = new Container();
      c.addChild(this.shelf, glass);
      this.shelfSize = { w, h };
      this.refreshShelf();
      const L = x - w / 2;
      const T = y - 50;
      c.position.set(L, T);
      c.zIndex = T + h;
      this.entities.addChild(c);
      this.obstacles.push({ x: L, y: T - 60, w, h: h + 60 });
      this.interactables.push({ kind: 'shelf', x, y: T + h + 30, title: 'Vitrine ansehen' });
      return;
    }
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

  /** Brass board of medallions on the back wall; lit ones are unlocked achievements. */
  private buildAchievementWall(x: number, w: number) {
    const c = new Container();
    c.position.set(x - w / 2, 18);
    this.wallDecor.addChild(c);
    this.achWall = { c, w };
    this.refreshAchievements();
    this.interactables.push({ kind: 'achievements', x, y: WALL_H + 40, title: 'Erfolge ansehen' });
  }

  refreshAchievements() {
    if (!this.achWall) return;
    const { c, w } = this.achWall;
    c.removeChildren().forEach((ch) => ch.destroy({ children: true, texture: this.painted }));
    const h = 112;
    if (this.painted) {
      const done = ACHIEVEMENTS.map((a) => !!this.state.data.achievements[a.id]);
      c.addChild(paintedAchBoard(w, h, done, `ERFOLGE  ${done.filter(Boolean).length} / ${ACHIEVEMENTS.length}`));
      return;
    }
    const g = new Graphics();
    g.roundRect(4, 5, w, h, 8).fill({ color: 0x000000, alpha: 0.45 });
    g.roundRect(0, 0, w, h, 8).fill(0x2a1608).stroke({ color: COLORS.brass, width: 3 });
    g.roundRect(6, 6, w - 12, h - 12, 5).stroke({ color: COLORS.brassDark, width: 1.5 });
    c.addChild(g);
    const done = ACHIEVEMENTS.filter((a) => this.state.data.achievements[a.id]).length;
    const t = new Text({ text: `ERFOLGE  ${done} / ${ACHIEVEMENTS.length}`, style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2 } });
    t.anchor.set(0.5, 0);
    t.position.set(w / 2, 10);
    c.addChild(t);
    const cols = Math.ceil(ACHIEVEMENTS.length / 3);
    const step = (w - 24) / cols;
    ACHIEVEMENTS.forEach((a, i) => {
      const on = !!this.state.data.achievements[a.id];
      const mx = 12 + step * ((i % cols) + 0.5);
      const my = 42 + Math.floor(i / cols) * 22;
      g.circle(mx, my, 7.5).fill(on ? COLORS.brass : 0x1b1013).stroke({ color: on ? 0xfff1c4 : COLORS.brassDark, width: 1.5 });
      if (on) g.circle(mx - 2, my - 2, 2.2).fill({ color: 0xffffff, alpha: 0.6 });
    });
    if (done > 0) {
      const gl = new Sprite(glowTexture());
      gl.anchor.set(0.5);
      gl.position.set(w / 2, h / 2);
      gl.width = w * 1.4;
      gl.height = h * 1.6;
      gl.tint = COLORS.lamp;
      gl.alpha = Math.min(0.35, 0.08 + done * 0.012);
      gl.blendMode = 'add';
      c.addChild(gl);
    }
  }

  private makePlayer() {
    const host = this.state.data.players.host;
    const look = this.state.look;
    const opts = { skin: host?.skin, ...look };
    return this.painted ? new Chibi(host?.color ?? COLORS.lamp, opts) : new Player(host?.color ?? COLORS.lamp, opts);
  }

  /** Rebuilds the avatar after a visit to the wardrobe. */
  refreshLook() {
    const old = this.player;
    const p = this.makePlayer();
    p.view.position.copyFrom(old.view.position);
    p.faceTowards(Math.PI / 2);
    this.entities.addChild(p.view);
    old.view.destroy({ children: true });
    (this as { player: Avatar }).player = p;
    this.companion?.c.destroy({ children: true });
    this.companion = null;
    this.buildCompanion();
  }

  /** A companion light from the shop (Laternchen, Mondglas, Goldfunke) that floats after the player. */
  private buildCompanion() {
    const kind = this.state.look.companion;
    if (kind === 'none') return;
    const col = COMPANION_COLOR[kind];
    const c = new Container();
    const gl = new Sprite(glowTexture());
    gl.anchor.set(0.5);
    gl.width = gl.height = 70;
    gl.tint = col;
    gl.alpha = 0.55;
    gl.blendMode = 'add';
    const core = new Sprite(emblemTexture());
    core.anchor.set(0.5);
    core.width = core.height = 20;
    core.tint = col;
    c.addChild(gl, core);
    c.position.set(this.player.view.x + 30, this.player.view.y - 30);
    this.lights.addChild(c);
    this.companion = { c, glow: gl, core, vx: 0, vy: 0 };
  }

  private updateCompanion(dt: number) {
    const m = this.companion;
    if (!m) return;
    const pv = this.player.view;
    const a = this.time * 1.3;
    const tx = pv.x + Math.cos(a) * 34;
    const ty = pv.y - 34 + Math.sin(a * 1.7) * 14;
    m.vx += (tx - m.c.x) * dt * 6 - m.vx * dt * 3;
    m.vy += (ty - m.c.y) * dt * 6 - m.vy * dt * 3;
    m.c.x += m.vx * dt;
    m.c.y += m.vy * dt;
    // A light floats, it doesn't flap: a slow bob and a gentle breathing glow.
    m.core.y = Math.sin(this.time * 2.2) * 3;
    m.glow.y = m.core.y;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.6);
    m.core.width = m.core.height = 19 + pulse * 3;
    m.glow.alpha = 0.4 + pulse * 0.25;
    m.c.alpha = pv.alpha;
  }

  // ---- Using things -----------------------------------------------------------

  /** A note, a sparkle or a puff of words rising from a point. */
  floatText(text: string, x: number, y: number, color = 0xfff1c4, size = 26) {
    const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0x14080f, width: 4 } } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    const drift = (Math.random() - 0.5) * 40;
    void animate(1300, (k) => {
      if (t.destroyed) return;
      t.position.set(x + drift * k + Math.sin(k * 9) * 4, y - 70 * k);
      t.alpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    }, ease.outCubic).then(() => !t.destroyed && t.destroy());
  }

  /** A coin flips from the player into a point (the wishing fountain). */
  async tossCoin(x: number, y: number) {
    const pv = this.player.view;
    const coin = new Graphics().circle(0, 0, 6).fill(COLORS.lamp).stroke({ color: COLORS.brassDark, width: 1.5 });
    this.fxLayer.addChild(coin);
    const sx = pv.x;
    const sy = pv.y - 20;
    await animate(650, (k) => {
      if (coin.destroyed) return;
      coin.position.set(sx + (x - sx) * k, sy + (y - sy) * k - Math.sin(k * Math.PI) * 90);
      coin.scale.x = Math.cos(k * 20);
    });
    if (!coin.destroyed) coin.destroy();
  }

  /** Turns to the thing and gives it a nudge; returns false while the last use is still fresh. */
  use(i: Extract<Interactable, { kind: 'use' }>, poke = true) {
    if (this.time < this.useCooldown) return false;
    this.useCooldown = this.time + 0.5;
    const pv = this.player.view;
    this.player.faceTowards(Math.atan2(i.cy - pv.y, i.cx - pv.x));
    if (poke) i.poke?.();
    return true;
  }

  /** The player walks in through the front door (first thing in the foyer). */
  async enterThroughDoor() {
    const d = this.def.decor.find((x) => x.kind === 'entrance');
    if (!d) return;
    this.frozen = true;
    const pv = this.player.view;
    pv.position.set(d.x, this.def.height + 10);
    pv.alpha = 0;
    this.updateCamera();
    this.entrance?.poke?.();
    void animate(500, (k) => !this.dead && (pv.alpha = k));
    await this.walkTo(d.x, this.def.height - 170, 170);
    this.scripted = undefined;
    this.frozen = false;
  }

  /** Where the painted room is lit from; the shell paints pools and reflections for each. */
  private lightSpots(): LightSpot[] {
    const spots: LightSpot[] = [
      { x: this.def.width / 2, y: 62, r: 220, col: 0xffb45a, a: 0.3 },
      { x: this.def.elevatorX, y: 70, r: 90, col: 0xffd9a0, a: 0.35 },
    ];
    for (const d of this.def.decor) {
      if (d.kind === 'chandelier') spots.push({ x: d.x, y: d.y, r: (d.w ?? 46) * 4.2, col: 0xffd49a, a: 0.5 });
      else if (d.kind === 'floorLamp') spots.push({ x: d.x, y: d.y, r: 120, col: 0xffc880, a: 0.45 });
      else if (d.kind === 'gasLantern' && !d.r) spots.push({ x: d.x, y: d.y, r: 130, col: 0xfff0c8, a: 0.4 });
      else if (d.kind === 'candelabrum') spots.push({ x: d.x, y: d.y, r: 130, col: 0xffc070, a: 0.45 });
      else if (d.kind === 'painting') spots.push({ x: d.x, y: 40, r: 70, col: 0xffe2a8, a: 0.3 });
      else if (d.kind === 'jukebox' || d.kind === 'fountain') spots.push({ x: d.x, y: d.y, r: 110, col: d.kind === 'jukebox' ? 0xff7ab8 : 0x7ad8ff, a: 0.3 });
    }
    spots.push(...clubLightSpots(this.def.decor));
    return spots;
  }

  /** Painted room: breathing light under each chandelier, dust in the light, motes of light round the crystal. */
  private buildPaintedLights() {
    const motes: { s: Sprite; x: number; y: number; vx: number; vy: number; ph: number; box: { x: number; y: number; r: number } }[] = [];
    for (const d of this.def.decor) {
      if (d.kind !== 'chandelier' && d.kind !== 'floorLamp') continue;
      const r = d.kind === 'chandelier' ? (d.w ?? 46) * 4.2 : 120;
      const pool = new Sprite(glowTexture());
      pool.anchor.set(0.5);
      pool.position.set(d.x, d.y + 20);
      pool.width = r * 2.4;
      pool.height = r * 1.7;
      pool.tint = 0xffd49a;
      pool.blendMode = 'add';
      pool.alpha = 0.12;
      this.lights.addChild(pool);
      const ph = Math.random() * 10;
      this.animated.push((t) => (pool.alpha = 0.11 + Math.sin(t * 1.7 + ph) * 0.015 + Math.sin(t * 5.3 + ph) * 0.006));
      // Dust hanging in the light, from the crystal down to the floor.
      const lift = d.kind === 'chandelier' ? d.h || 60 + (d.w ?? 46) * 1.4 : 70;
      const n = d.kind === 'chandelier' ? 16 : 6;
      for (let i = 0; i < n; i++) {
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.tint = 0xfff1d0;
        s.blendMode = 'add';
        const size = 3 + Math.random() * 4;
        s.width = s.height = size;
        const box = { x: d.x, y: d.y - lift / 2, r: r * 0.55 };
        motes.push({ s, x: d.x + (Math.random() - 0.5) * box.r * 2, y: box.y + (Math.random() - 0.5) * lift, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 5, ph: Math.random() * 10, box: { ...box, r: Math.max(box.r, lift / 2) } });
        this.lights.addChild(s);
      }
      if (d.kind === 'chandelier') {
        for (let i = 0; i < 2; i++) {
          const c = new Container();
          const glow = new Sprite(glowTexture());
          glow.anchor.set(0.5);
          glow.width = glow.height = 30;
          glow.tint = 0xffe2a8;
          glow.alpha = 0.35;
          glow.blendMode = 'add';
          const core = new Sprite(emblemTexture());
          core.anchor.set(0.5);
          core.width = core.height = 9;
          core.tint = 0xfff1c4;
          core.alpha = 0.8;
          c.addChild(glow, core);
          this.lights.addChild(c);
          this.lampMotes.push({ c, glow, core, cx: d.x, cy: d.y - lift, r: 26 + Math.random() * 30, ph: Math.random() * 10, sp: 0.25 + Math.random() * 0.3, size: 9 });
        }
      }
    }
    this.animated.push((t, dtMs) => {
      const dt = dtMs / 1000;
      for (const m of motes) {
        m.x += (m.vx + Math.sin(t * 0.7 + m.ph) * 4) * dt;
        m.y += m.vy * dt;
        const dx = m.x - m.box.x;
        const dy = m.y - m.box.y;
        if (dy < -m.box.r) m.y = m.box.y + m.box.r;
        if (Math.abs(dx) > m.box.r * 0.8) m.x = m.box.x - Math.sign(dx) * m.box.r * 0.8;
        // Brightest in the middle of the cone, twinkling as they turn.
        const k = Math.max(0, 1 - Math.hypot(dx / m.box.r, dy / m.box.r));
        m.s.alpha = k * (0.35 + 0.35 * Math.sin(t * 2.5 + m.ph));
        m.s.position.set(m.x, m.y);
      }
    });
  }

  private buildLights() {
    if (this.painted) {
      this.buildPaintedLights();
      return;
    }
    const th = this.def.theme;
    // Soft pools of light on the floor, with a few motes of light drifting in each.
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
          const core = new Sprite(emblemTexture());
          core.anchor.set(0.5);
          core.width = core.height = 10;
          core.tint = 0xfff1c4;
          core.alpha = 0.75;
          c.addChild(glow, core);
          this.lights.addChild(c);
          this.lampMotes.push({ c, glow, core, cx: x, cy: y, r: 22 + Math.random() * 40, ph: Math.random() * 10, sp: 0.25 + Math.random() * 0.35, size: 10 });
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
    const from = this.elevator?.open ?? 0;
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
    if (this.elevator) this.elevator.lamp.alpha = 1;
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

  /** The Selene flinches (boss floor only). */
  bossHit() {
    this.throne?.hit?.();
  }

  /** The Selene's boss phase (1..3): she grows and her aura changes (src/ui/boss.ts). */
  bossPhase(n: number) {
    this.throne?.phase?.(n);
  }

  bossLaugh() {
    this.throne?.laugh?.();
  }

  /** Where the Selene floats, for effects aimed at her. */
  bossPoint() {
    const d = this.def.decor.find((x) => x.kind === 'throne');
    return d ? this.toScreen(d.x, d.y - (this.painted ? 196 : 90)) : null;
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

  private dragStart = (e: PointerEvent) => {
    if (this.frozen || this.drag || !(e.target instanceof HTMLCanvasElement)) return;
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false };
  };

  private dragMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX;
    d.y = e.clientY;
    const dist = Math.hypot(d.x - d.sx, d.y - d.sy);
    if (!d.active && dist > 14 && !this.frozen) {
      d.active = true;
      this.target = null;
      this.pending = null;
    }
    // The stick's centre follows the finger when it goes far, so turning around is quick.
    const max = 70;
    if (dist > max) {
      d.sx = d.x - ((d.x - d.sx) / dist) * max;
      d.sy = d.y - ((d.y - d.sy) / dist) * max;
    }
  };

  private dragEnd = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.stick.clear();
  };

  private drawStick() {
    const d = this.drag;
    this.stick.clear();
    if (!d || !d.active || this.frozen) return;
    const dist = Math.hypot(d.x - d.sx, d.y - d.sy);
    const k = Math.min(1, 46 / Math.max(1, dist));
    this.stick.circle(d.sx, d.sy, 52).fill({ color: 0x000000, alpha: 0.18 }).stroke({ color: COLORS.lamp, width: 2, alpha: 0.45 });
    this.stick.circle(d.sx + (d.x - d.sx) * k, d.sy + (d.y - d.sy) * k, 22).fill({ color: COLORS.lamp, alpha: 0.55 });
  }

  /** How far the player's feet are from being able to use `i`: to its spot, or to any side of its area. */
  private reach(i: Interactable, x: number, y: number) {
    const spot = Math.hypot(i.x - x, i.y - y);
    const a = this.areaOf(i);
    if (!a) return spot;
    const dx = Math.max(a.x - x, 0, x - (a.x + a.w));
    const dy = Math.max(a.y - y, 0, y - (a.y + a.h));
    // Standing right at an edge is like standing on the spot (which is 22-26 px in front).
    return Math.min(spot, Math.hypot(dx, dy) + 14);
  }

  /**
   * What an interactable occupies on the floor, so it can be used from every side. People, lecterns
   * and boards ('extra') stand 40 px above their prompt spot; the Queen's throne keeps its front.
   */
  private areaOf(i: Interactable): Rect | undefined {
    if ('area' in i && i.area) return i.area;
    if (i.kind === 'extra' && i.id !== 'queen') return { x: i.x - 22, y: i.y - 60, w: 44, h: 30 };
    return undefined;
  }

  /** The free spot on whichever side of the thing is closest to the player (the front if in doubt). */
  private sideNearPlayer(i: Interactable) {
    const a = this.areaOf(i);
    const pv = this.player.view;
    if (!a) return { x: i.x, y: i.y };
    const cx = Math.max(a.x + 10, Math.min(a.x + a.w - 10, pv.x));
    const cy = Math.max(a.y + 6, Math.min(a.y + a.h - 6, pv.y));
    const cands = [
      { x: i.x, y: i.y },
      { x: cx, y: a.y + a.h + 20 },
      { x: cx, y: a.y - 14 },
      { x: a.x - 26, y: cy },
      { x: a.x + a.w + 26, y: cy },
    ].filter((c) => !this.collides(c.x, c.y));
    if (!cands.length) return { x: i.x, y: i.y };
    cands.sort((u, v) => Math.hypot(u.x - pv.x, u.y - pv.y) - Math.hypot(v.x - pv.x, v.y - pv.y));
    return cands[0];
  }

  /** Middle of the thing an interactable belongs to (to tell if the player walks into it). */
  private objectPoint(i: Interactable) {
    if (i.kind === 'station') {
      const g = getGame(i.station.game);
      return { x: i.station.x + g.footprint.w / 2, y: i.station.y + g.footprint.h / 2 };
    }
    if (i.kind === 'use') return { x: i.cx, y: i.cy };
    if (i.kind === 'tablet') return { x: i.x, y: TABLET_Y };
    return { x: i.x, y: i.y - 70 };
  }

  private onTap(e: FederatedPointerEvent) {
    if (this.frozen || this.drag?.active) return;
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
    // Tapping the thing itself counts too, from any side.
    if (!best)
      for (const i of this.interactables) {
        const a = this.areaOf(i);
        if (a && p.x > a.x - 10 && p.x < a.x + a.w + 10 && p.y > a.y - 40 && p.y < a.y + a.h + 10) best = i;
      }
    if (best) {
      this.target = this.sideNearPlayer(best);
      this.pending = best;
    } else {
      this.target = { x: p.x, y: p.y };
      this.pending = null;
    }
    this.replanned = 0;
    this.planRoute();
    const end = this.route[this.route.length - 1];
    if (end) this.showMarker(best ? this.target.x : end.x, best ? this.target.y : end.y);
  }

  /** Finds a walkable way to `target` round furniture, tables and walls (a straight line if it's clear). */
  private planRoute() {
    this.route = [];
    if (!this.target) return;
    const pv = this.player.view;
    // Routes keep a hair's breadth off every edge, so a waypoint exactly at a table's corner
    // can't turn into a wall once the walk lands a fraction of a pixel to one side.
    const free = (x: number, y: number) => !this.collides(x, y, 1.5);
    if (!this.collides(this.target.x, this.target.y) && clearLine(pv, this.target, (x, y) => !this.collides(x, y))) {
      this.route = [{ x: this.target.x, y: this.target.y }];
      return;
    }
    const path = findPath({ x: pv.x, y: pv.y }, this.target, free, this.def.width, this.def.height);
    if (path?.length) this.route = path;
    else {
      // Nowhere to go: stand still rather than run into a wall.
      this.target = null;
      this.pending = null;
    }
  }

  private hitboxView: Graphics | null = null;

  /** Draws the collision boxes and the player's feet box (Mod-Menü, and for tuning by eye). */
  showHitboxes(on: boolean) {
    this.hitboxView?.destroy();
    this.hitboxView = null;
    if (!on) return;
    const g = new Graphics();
    for (const o of this.obstacles) g.rect(o.x, o.y, o.w, o.h).fill({ color: 0xff3060, alpha: 0.3 }).stroke({ color: 0xff3060, width: 4, alpha: 1 });
    const pv = this.player.view;
    g.rect(pv.x - FEET_W, pv.y - FEET_UP, FEET_W * 2, FEET_UP + FEET_DOWN).fill({ color: 0x40e0ff, alpha: 0.6 });
    g.zIndex = 1e6;
    this.entities.addChild(g);
    this.hitboxView = g;
  }

  private showMarker(x: number, y: number) {
    if (!this.marker) {
      this.marker = new Graphics();
      this.fxLayer.addChild(this.marker);
    }
    this.marker.position.set(x, y);
    this.markerT = 1;
  }

  private drawMarker(dt: number) {
    const m = this.marker;
    if (!m) return;
    m.clear();
    if (this.markerT <= 0) return;
    this.markerT = Math.max(0, this.markerT - dt * 1.8);
    const k = 1 - this.markerT;
    const a = this.markerT;
    m.ellipse(0, 0, 10 + k * 16, (10 + k * 16) * 0.45).stroke({ color: COLORS.lamp, width: 3, alpha: a });
    m.ellipse(0, 0, 5, 2.4).fill({ color: COLORS.lamp, alpha: a * 0.8 });
  }

  // ---- Simulation -------------------------------------------------------

  /**
   * Whether the player's feet fit at (x, y). The feet are a flat box (wide, but only a few pixels
   * deep), as in a 3/4 view: you can walk right up to a table's front edge, and your head may
   * overlap what stands behind you.
   */
  private collides(x: number, y: number, pad = 0) {
    const w = FEET_W + pad;
    return this.obstacles.some((o) => x + w > o.x && x - w < o.x + o.w && y + FEET_DOWN + pad > o.y && y - FEET_UP - pad < o.y + o.h);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const dt = Math.min(dtMs, 50) / 1000;
    let dx = 0;
    let dy = 0;
    /** Distance left to the next waypoint: a step never overshoots it (it might sit right by a table). */
    let capTo = Infinity;
    if (!this.frozen) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      if (this.drag?.active) {
        const d = this.drag;
        const dist = Math.hypot(d.x - d.sx, d.y - d.sy);
        if (dist > 10) {
          dx = (d.x - d.sx) / dist;
          dy = (d.y - d.sy) / dist;
          this.target = null;
          this.pending = null;
        }
      }
      if (dx === 0 && dy === 0 && this.target) {
        // Next waypoint of the route; intermediate corners are taken a little early for a smooth line.
        let wp = this.route[0] ?? this.target;
        let d = Math.hypot(wp.x - this.player.view.x, wp.y - this.player.view.y);
        const free = (x: number, y: number) => !this.collides(x, y);
        while (this.route.length > 1 && (d < 1.5 || (d < 14 && clearLine(this.player.view, this.route[1], free)))) {
          this.route.shift();
          wp = this.route[0];
          d = Math.hypot(wp.x - this.player.view.x, wp.y - this.player.view.y);
        }
        const tx = wp.x - this.player.view.x;
        const ty = wp.y - this.player.view.y;
        if (d < 8 && this.route.length <= 1) {
          // End of the route: the goal itself, or the closest free spot to it.
          const p = this.pending;
          const close = p && (this.route.length <= 1 || Math.hypot(p.x - this.player.view.x, p.y - this.player.view.y) < 70);
          this.target = null;
          this.route = [];
          this.pending = null;
          if (p && close) this.onInteract(p);
        } else {
          dx = tx / d;
          dy = ty / d;
          capTo = d;
        }
      }
    }
    const len = Math.hypot(dx, dy);
    const pv = this.player.view;
    if (len > 0) {
      const speed = 280;
      const step = Math.min(speed * dt, capTo);
      const mx = (dx / len) * step;
      const my = (dy / len) * step;
      const ox = pv.x;
      const oy = pv.y;
      if (!this.collides(pv.x + mx, pv.y)) pv.x += mx;
      if (!this.collides(pv.x, pv.y + my)) pv.y += my;
      // Walking into a machine, table or shop uses it, after a short push.
      const moved = Math.hypot(pv.x - ox, pv.y - oy);
      const near = this.nearest;
      // Only when steering by hand: a tap route walks round things and replans instead.
      if (!this.frozen && !this.target && near && moved < Math.hypot(mx, my) * 0.5) {
        const o = this.objectPoint(near);
        const tx = o.x - pv.x;
        const ty = o.y - pv.y;
        const tl = Math.hypot(tx, ty) || 1;
        if ((dx * tx + dy * ty) / (len * tl) > 0.45) {
          this.bump += dt;
          if (this.bump > 0.16) {
            this.bump = 0;
            this.target = null;
            this.pending = null;
            if (this.drag) this.drag.active = false;
            this.stick.clear();
            this.keys.clear();
            this.onInteract(near);
            return;
          }
        } else this.bump = 0;
      } else this.bump = 0;
      this.stepAcc += dt;
      if (this.stepAcc > 0.3) {
        this.stepAcc = 0;
        sfx.footstep();
      }
      // Stuck while walking to a tap target: look for a new way once, then give up, but still
      // use the thing if we're close.
      if (this.target && Math.hypot(pv.x - ox, pv.y - oy) < Math.min(0.5, step * 0.2) && this.replanned < 4) {
        this.replanned++;
        this.planRoute();
      } else if (this.target && Math.hypot(pv.x - ox, pv.y - oy) < Math.min(0.5, step * 0.2)) {
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
      // Small props give way to machines, the elevator and the shops when both are close.
      const d = this.reach(i, pv.x, pv.y) + ((i.kind === 'use' && !['shopCounter', 'wardrobe', 'reception'].includes(i.prop)) || i.kind === 'tablet' ? 18 : 0);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      this.showPrompt(best);
    }
    if (this.prompt.visible) this.prompt.y = pv.y - (this.player.headroom ?? 58) + Math.sin(this.time * 4) * 3;

    // Lamps on machines pulse; the neon sign flickers now and then.
    for (const l of this.stationLamps) l.g.alpha = 0.55 + 0.45 * Math.sin(this.time * 3 + l.phase);
    if (!this.painted) this.sign.alpha = Math.sin(this.time * 31) > 0.97 ? 0.55 : 1;
    for (const m of this.lampMotes) {
      // Slow, drifting loops and a soft glow that swells and fades.
      const a = this.time * m.sp + m.ph;
      m.c.position.set(m.cx + Math.cos(a) * m.r + Math.sin(a * 1.9) * 6, m.cy + Math.sin(a * 1.3) * m.r * 0.6 + Math.sin(this.time * 1.7 + m.ph) * 4);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.1 + m.ph * 3);
      m.core.alpha = 0.45 + pulse * 0.45;
      m.core.width = m.core.height = m.size * (0.85 + pulse * 0.3);
      m.glow.alpha = 0.18 + pulse * 0.25;
    }
    for (const a of this.animated) a(this.time, dtMs);
    if (this.elevator) this.elevator.lamp.alpha = this.frozen ? 1 : 0.55 + 0.25 * Math.sin(this.time * 2.5);
    this.guests?.update(dtMs);
    this.extras.update(dtMs);
    this.corridor?.update(dtMs);
    this.specials?.update(dtMs);
    this.miniboss?.update(dtMs);
    this.regulars?.update(dtMs);
    this.updateCompanion(dt);
    this.drawStick();
    this.drawMarker(dt);

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
    this.zoom = this.def.corridor ? corridorZoom(w, h, this.topInset) : Math.max(narrow ? 0.72 : 0.5, Math.min(1.2, Math.min(w / 1000, (h - this.topInset) / 720)));
    this.world.scale.set(this.zoom);
    this.updateCamera();
  }

  /** Photo mode: no walking, no prompt, the camera belongs to the photographer. */
  setPhotoMode(on: boolean) {
    this.frozen = on;
    this.cameraLocked = on;
    this.drag = null;
    this.target = null;
    this.pending = null;
    this.keys.clear();
    this.prompt.visible = false;
    this.nearest = null;
    if (!on) this.resize(this.screenW, this.screenH);
  }

  private updateCamera() {
    if (this.cameraLocked) return;
    const z = this.world.scale.x;
    const W = this.def.width * z;
    const H = this.def.height * z;
    // The boss corridor looks ahead in walking direction.
    const lead = this.corridor ? this.corridor.lead * corridorLeadPx(this.screenW / z) : 0;
    const px = (this.player.view.x + lead) * z;
    const py = this.player.view.y * z;
    const cx = W <= this.screenW ? (this.screenW - W) / 2 : Math.min(0, Math.max(this.screenW - W, this.screenW / 2 - px));
    const top = this.topInset;
    const free = this.screenH - top - (this.def.corridor ? CORRIDOR_BOTTOM : 0);
    const cy = H <= free ? top + (free - H) / 2 : Math.min(top, Math.max(this.screenH - H, top + free / 2 - py));
    this.world.position.set(cx, cy);
  }

  /** Screen position of a world point (used to zoom into a machine). */
  toScreen(x: number, y: number) {
    return this.world.toGlobal({ x, y });
  }

  private offEventSwitch: () => void = () => {};

  /** Today's crowd: more on a gala, fewer on a quiet evening (replaces any guests already here). */
  private spawnGuests() {
    this.guests?.destroy();
    // The corridor belongs to the player and the Queen; no one stands in front of a machine.
    this.guests = null;
    if (this.def.corridor) return;
    const guestCount = Math.round(Math.min(7, Math.max(3, Math.round(this.def.stations.length * 0.7))) * guestFactor(this.state.data));
    this.guests = new Guests(this.entities, this.fxLayer, this.spots, guestCount, (x, y) => this.collides(x, y), () => this.player.view.position, { w: this.def.width, h: this.def.height }, this.painted ? (c, l) => new Chibi(c, l) : undefined);
  }

  destroy() {
    this.dead = true;
    this.offEventSwitch();
    this.extras?.destroy();
    this.corridor?.destroy();
    this.specials?.destroy();
    this.miniboss?.destroy();
    this.regulars?.destroy();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearKeys);
    window.removeEventListener('pointerdown', this.dragStart);
    window.removeEventListener('pointermove', this.dragMove);
    window.removeEventListener('pointerup', this.dragEnd);
    window.removeEventListener('pointercancel', this.dragEnd);
    this.view.destroy({ children: true });
  }
}
