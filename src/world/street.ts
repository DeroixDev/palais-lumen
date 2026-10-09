// The street in front of the casino, seen from the side. It is the backdrop of the start
// screen and the stage for the arrival: taxi pulls up, you get out, the doors open.

import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, FONT_DISPLAY, bake, glowText, glowTexture, mothTexture } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';

const W = 1600;
const H = 900;
const GROUND = 720;
const DOOR_X = 1000;
const FACADE = { x: 640, w: 720, top: 150 };

export interface Look {
  color: number;
  skin?: number;
  hair?: number;
  jacket?: number;
  /** Doorman's cap. */
  cap?: boolean;
}

/** A person seen from the side, with swinging legs. */
class Walker {
  readonly view = new Container();
  private legA = new Graphics();
  private legB = new Graphics();
  private body = new Container();
  private t = 0;
  private t2 = Math.random() * 10;

  constructor(look: Look) {
    const shadow = new Graphics().ellipse(0, 0, 22, 6).fill({ color: 0x000000, alpha: 0.45 });
    for (const leg of [this.legB, this.legA]) {
      leg.roundRect(-5, 0, 10, 40, 4).fill(0x1b1b22);
      leg.roundRect(-6, 34, 16, 7, 3).fill(0x0b0b10);
      leg.position.set(0, -42);
    }
    const g = new Graphics();
    // Jacket, shirt, bow tie, head, hair.
    g.roundRect(-15, -92, 30, 54, 10).fill(look.jacket ?? 0x2a1630).stroke({ color: look.color, width: 2.5 });
    g.poly([-5, -92, 5, -92, 0, -70]).fill(0xfff6e6);
    g.poly([-5, -88, 5, -88, 0, -84]).fill(look.color);
    g.roundRect(-20, -88, 8, 40, 4).fill(look.jacket ?? 0x2a1630);
    g.circle(0, -106, 13).fill(look.skin ?? 0xe8b48a);
    g.ellipse(-2, -114, 14, 8).fill(look.hair ?? 0x2a1a10);
    g.circle(6, -106, 1.6).fill(0x1b1b22);
    if (look.cap) {
      g.roundRect(-13, -124, 26, 12, 4).fill(look.jacket ?? 0x6b1a2e).stroke({ color: COLORS.brass, width: 1.5 });
      g.roundRect(-2, -114, 20, 4, 2).fill(0x1b1b22);
      g.rect(-13, -116, 26, 3).fill(COLORS.brass);
    }
    // Front arm, swinging while walking.
    this.arm.roundRect(-4, 0, 8, 36, 4).fill(look.jacket ?? 0x2a1630).stroke({ color: 0x14080f, width: 1, alpha: 0.5 });
    this.arm.circle(0, 38, 4.5).fill(look.skin ?? 0xe8b48a);
    this.arm.position.set(2, -88);
    this.body.addChild(g, this.arm);
    // The upper body bends at the hips (for bowing).
    this.body.pivot.set(0, -42);
    this.body.position.set(0, -42);
    this.view.addChild(shadow, this.legB, this.legA, this.body);
  }

  private arm = new Graphics();
  /** 0..1: how deep the bow is. */
  bow = 0;

  update(dtMs: number, walking: boolean) {
    if (walking) this.t += dtMs / 1000;
    else this.t2 += dtMs / 1000;
    const s = walking ? Math.sin(this.t * 9) : 0;
    this.legA.rotation = s * 0.45;
    this.legB.rotation = -s * 0.45;
    this.arm.rotation = -s * 0.5 - this.bow * 0.5;
    // Standing: slow breathing.
    this.body.y = -42 + (walking ? -Math.abs(Math.cos(this.t * 9)) * 3 : Math.sin(this.t2 * 2.2) * 0.8);
    this.body.rotation = this.bow * 0.45;
    if (walking && Math.abs(s) > 0.97 && Math.random() < 0.5) sfx.footstep();
  }
}

function drawCity() {
  const c = new Container();
  const g = new Graphics();
  // Sky.
  for (let i = 0; i < 30; i++) {
    const k = i / 29;
    const r = Math.round(10 + k * 40);
    const gg = Math.round(12 + k * 14);
    const b = Math.round(40 + k * 18);
    g.rect(0, (i * GROUND) / 30, W, GROUND / 30 + 1).fill((r << 16) | (gg << 8) | b);
  }
  for (let i = 0; i < 140; i++) g.circle(Math.random() * W, Math.random() * 420, Math.random() * 1.4 + 0.3).fill({ color: 0xfff6e6, alpha: 0.3 + Math.random() * 0.6 });
  // Distant skyline with lit windows.
  let x = -20;
  while (x < W) {
    const bw = 70 + Math.random() * 120;
    const bh = 160 + Math.random() * 260;
    g.rect(x, GROUND - bh, bw, bh).fill(0x150c22);
    for (let wy = GROUND - bh + 14; wy < GROUND - 30; wy += 22)
      for (let wx = x + 10; wx < x + bw - 12; wx += 18) if (Math.random() < 0.3) g.rect(wx, wy, 8, 11).fill({ color: Math.random() < 0.7 ? 0xffcf7a : 0x9fd8ff, alpha: 0.35 + Math.random() * 0.4 });
    x += bw + 6;
  }
  // Sidewalk and street.
  g.rect(0, GROUND, W, 40).fill(0x2a2230);
  g.rect(0, GROUND, W, 4).fill(0x4a3a50);
  g.rect(0, GROUND + 40, W, H - GROUND - 40).fill(0x121018);
  for (let sx = 20; sx < W; sx += 120) g.rect(sx, GROUND + 100, 60, 6).fill({ color: 0xfff6e6, alpha: 0.25 });
  c.addChild(g);
  return c;
}

function drawFacade() {
  const c = new Container();
  const g = new Graphics();
  const { x, w, top } = FACADE;
  // Stepped art-deco building.
  g.rect(x, top + 60, w, GROUND - top - 60).fill(0x2a1630);
  g.rect(x + 80, top, w - 160, 70).fill(0x2a1630);
  g.rect(x + 200, top - 50, w - 400, 60).fill(0x2a1630);
  g.rect(x, top + 60, w, 6).fill(COLORS.brass);
  g.rect(x + 80, top, w - 160, 5).fill(COLORS.brass);
  g.rect(x + 200, top - 50, w - 400, 4).fill(COLORS.brass);
  // Vertical deco stripes and warm windows.
  for (let i = 0; i < 7; i++) g.rect(x + 40 + i * ((w - 80) / 6) - 3, top + 70, 6, GROUND - top - 70).fill({ color: COLORS.brass, alpha: 0.35 });
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6; i++) {
      const wx = x + 62 + i * ((w - 80) / 6);
      const wy = top + 250 + row * 70;
      if (Math.abs(wx + 30 - DOOR_X) < 110 && row === 2) continue;
      g.roundRect(wx, wy, 52, 40, 20).fill({ color: 0xffcf7a, alpha: 0.55 });
      g.roundRect(wx, wy, 52, 40, 20).stroke({ color: COLORS.brassDark, width: 2 });
    }
  // Canopy over the door.
  g.poly([DOOR_X - 150, GROUND - 210, DOOR_X + 150, GROUND - 210, DOOR_X + 180, GROUND - 175, DOOR_X - 180, GROUND - 175]).fill(0x6b1a2e);
  g.rect(DOOR_X - 180, GROUND - 176, 360, 6).fill(COLORS.brass);
  // Door frame.
  g.roundRect(DOOR_X - 90, GROUND - 170, 180, 170, 10).fill(0x0b0508).stroke({ color: COLORS.brass, width: 5 });
  // Red carpet down to the street.
  g.poly([DOOR_X - 70, GROUND, DOOR_X + 70, GROUND, DOOR_X + 110, GROUND + 40, DOOR_X - 110, GROUND + 40]).fill(0xb3132b);
  c.addChild(g);
  return c;
}

export class Street {
  readonly view = new Container();
  private world = new Container();
  private bulbs: Graphics[] = [];
  private sign!: Sprite;
  private signGlow!: Sprite;
  private doorLight!: Sprite;
  /** Both entrance doors, redrawn while they swing (0 shut, 1 wide open towards the street). */
  private doors = new Graphics();
  private doorman!: Walker;
  private puffs: { g: Graphics; vx: number; vy: number; life: number }[] = [];
  private exhaust: { x: number; y: number; c: Container } | null = null;
  private puffAcc = 0;
  private moths: { c: Container; wings: Sprite; base: number; cx: number; cy: number; ph: number; sp: number }[] = [];
  private cars: { c: Container; v: number; wheels: Graphics[] }[] = [];
  private time = 0;
  private nextCar = 2;
  private walkers: { w: Walker; walking: boolean }[] = [];
  private screenW = 1280;
  private screenH = 800;
  /** Camera: zoom 1 shows the whole street; the arrival zooms into the door. */
  private cam = { x: W / 2 + 150, y: H / 2, zoom: 1 };

  constructor() {
    this.view.addChild(this.world);
    // Endless night sky and street around the scene, for screens with another shape.
    this.world.addChild(
      new Graphics()
        .rect(-3000, -3000, W + 6000, 3000 + 40)
        .fill(0x0a0c28)
        .rect(-3000, GROUND + 40, W + 6000, 3000)
        .fill(0x121018),
    );
    // Baked textures are cropped to their content, so put each back at its own origin.
    for (const part of [drawCity(), drawFacade()]) {
      const b = part.getLocalBounds();
      const s = new Sprite(bake(part));
      s.position.set(b.x, b.y);
      this.world.addChild(s);
    }

    // Light behind the door.
    this.doorLight = new Sprite(glowTexture());
    this.doorLight.anchor.set(0.5);
    this.doorLight.position.set(DOOR_X, GROUND - 80);
    this.doorLight.width = 420;
    this.doorLight.height = 360;
    this.doorLight.tint = COLORS.lamp;
    this.doorLight.alpha = 0.25;
    this.doorLight.blendMode = 'add';
    const inner = new Graphics().rect(DOOR_X - 84, GROUND - 164, 168, 164).fill(0xffd98a);
    this.world.addChild(inner, this.doorLight);
    this.world.addChild(this.doors);
    this.drawDoors(0);
    // The doorman waits beside the entrance.
    this.doorman = new Walker({ color: COLORS.brass, jacket: 0x6b1a2e, skin: 0xc68a5e, hair: 0x1b1b22, cap: true });
    this.doorman.view.position.set(DOOR_X + 150, GROUND + 14);
    this.doorman.view.scale.x = -1;
    this.world.addChild(this.doorman.view);
    this.walkers.push({ w: this.doorman, walking: false });

    // Neon sign with marquee bulbs.
    this.signGlow = new Sprite(glowTexture());
    this.signGlow.anchor.set(0.5);
    this.signGlow.position.set(DOOR_X, FACADE.top + 140);
    this.signGlow.width = 900;
    this.signGlow.height = 280;
    this.signGlow.tint = COLORS.neon;
    this.signGlow.alpha = 0.4;
    this.signGlow.blendMode = 'add';
    this.world.addChild(this.signGlow);
    const board = new Graphics().roundRect(DOOR_X - 300, FACADE.top + 90, 600, 110, 20).fill(0x14080f).stroke({ color: COLORS.brass, width: 4 });
    this.world.addChild(board);
    for (let i = 0; i < 28; i++) {
      const bx = DOOR_X - 288 + (i % 14) * (576 / 13);
      const by = i < 14 ? FACADE.top + 100 : FACADE.top + 190;
      const b = new Graphics().circle(bx, by, 4).fill(0xffe7a8);
      this.bulbs.push(b);
      this.world.addChild(b);
    }
    this.sign = glowText('NACHTFALTER', { fontFamily: FONT_DISPLAY, fontSize: 62, fill: 0xfff6e6, letterSpacing: 6 }, { color: COLORS.neon, distance: 22, outerStrength: 3.5, innerStrength: 0.6 });
    this.sign.position.set(DOOR_X, FACADE.top + 146);
    this.world.addChild(this.sign);
    const moth = new Sprite(mothTexture());
    moth.anchor.set(0.5);
    moth.width = moth.height = 70;
    moth.tint = 0xffcf7a;
    moth.position.set(DOOR_X, FACADE.top + 30);
    this.world.addChild(moth);

    // Street lamps with moths.
    for (const lx of [560, 1440]) {
      const pole = new Graphics();
      pole.rect(lx - 4, GROUND - 260, 8, 260).fill(0x1b1b22);
      pole.roundRect(lx - 18, GROUND - 278, 36, 22, 8).fill(0x2a2a30);
      pole.ellipse(lx, GROUND - 254, 14, 6).fill(0xfff1c4);
      this.world.addChild(pole);
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(lx, GROUND - 250);
      glow.width = glow.height = 260;
      glow.tint = COLORS.lamp;
      glow.alpha = 0.45;
      glow.blendMode = 'add';
      this.world.addChild(glow);
      for (let i = 0; i < 4; i++) this.addMoth(lx, GROUND - 262);
    }
    for (let i = 0; i < 3; i++) this.addMoth(DOOR_X, FACADE.top + 146);
  }

  /**
   * Double doors hinged at the frame, swinging outwards towards the street.
   * The free edge comes closer to the viewer, so it grows taller and drops a little;
   * past 90 degrees the back of the leaf shows.
   */
  private drawDoors(k: number) {
    const g = this.doors.clear();
    const top = GROUND - 164;
    const hh = 164;
    const theta = k * (Math.PI * 0.62);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (const side of [-1, 1]) {
      const hx = DOOR_X + side * 84; // hinge
      const fx = hx - side * 84 * cos; // free edge
      const grow = 1 + sin * 0.22;
      const cy = top + hh / 2 + sin * 12;
      const ft = cy - (hh / 2) * grow;
      const fb = cy + (hh / 2) * grow;
      const front = cos >= 0;
      const lerp = (u: number, v: number) => {
        // Point on the leaf: u 0 hinge..1 free edge, v 0 top..1 bottom.
        const x = hx + (fx - hx) * u;
        const t0 = top + (ft - top) * u;
        const b0 = top + hh + (fb - top - hh) * u;
        return [x, t0 + (b0 - t0) * v];
      };
      const quad = (u0: number, u1: number, v0: number, v1: number) => [...lerp(u0, v0), ...lerp(u1, v0), ...lerp(u1, v1), ...lerp(u0, v1)];
      // Shadow of the open leaf on the carpet.
      if (k > 0.05) g.poly([hx, GROUND, fx, fb + 2, fx + side * 6, fb + 10, hx + side * 4, GROUND + 6]).fill({ color: 0x000000, alpha: 0.25 * sin });
      g.poly(quad(0, 1, 0, 1)).fill(front ? 0x3a1a12 : 0x24100a).stroke({ color: COLORS.brass, width: 3 });
      // Leaf thickness at the free edge once it turns.
      if (k > 0.05) g.poly([fx, ft, fx + side * 5 * sin, ft + 2, fx + side * 5 * sin, fb - 2, fx, fb]).fill(0x1a0a06);
      if (front) {
        g.poly(quad(0.2, 0.8, 0.11, 0.66)).fill({ color: 0xffcf7a, alpha: 0.35 });
        g.poly(quad(0.2, 0.8, 0.11, 0.66)).stroke({ color: COLORS.brass, width: 1.5, alpha: 0.7 });
        const [px, py] = lerp(0.9, 0.56);
        g.roundRect(px - 3, py - 14, 6, 28, 3).fill(COLORS.brass);
      } else {
        g.poly(quad(0.15, 0.85, 0.1, 0.9)).stroke({ color: COLORS.brassDark, width: 1.5, alpha: 0.6 });
      }
    }
  }

  /** Warm moths tumble out of the opened doors towards the street. */
  private mothBurst() {
    for (let i = 0; i < 14; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 36;
      glow.tint = COLORS.lamp;
      glow.alpha = 0.6;
      glow.blendMode = 'add';
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.width = m.height = 16;
      m.tint = 0xfff1c4;
      c.addChild(glow, m);
      const sx = DOOR_X + (Math.random() - 0.5) * 120;
      const sy = GROUND - 40 - Math.random() * 110;
      c.position.set(sx, sy);
      this.world.addChild(c);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const dist = 120 + Math.random() * 220;
      const base = 16 / m.texture.width;
      const ph = Math.random() * 10;
      void animate(1400 + Math.random() * 900, (k) => {
        if (c.destroyed) return;
        c.position.set(sx + Math.cos(ang) * dist * k + Math.sin(k * 9 + ph) * 14, sy + Math.sin(ang) * dist * k);
        c.scale.set(1 + k * 0.8);
        c.alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(k * 60 + ph)));
      }).then(() => !c.destroyed && c.destroy({ children: true }));
    }
  }

  private addMoth(cx: number, cy: number) {
    const c = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 30;
    glow.tint = COLORS.lamp;
    glow.alpha = 0.5;
    glow.blendMode = 'add';
    const wings = new Sprite(mothTexture());
    wings.anchor.set(0.5);
    wings.width = wings.height = 14;
    wings.tint = 0xfff1c4;
    c.addChild(glow, wings);
    this.world.addChild(c);
    this.moths.push({ c, wings, base: 14 / wings.texture.width, cx, cy, ph: Math.random() * 10, sp: 1 + Math.random() * 1.5 });
  }

  private makeCar(taxi: boolean) {
    const c = new Container();
    // The body sits on its springs above the wheels, so it can dip when braking.
    const body = new Container();
    body.pivot.set(0, -16);
    body.position.set(0, -16);
    const g = new Graphics();
    const paint = taxi ? 0x3a1a3a : [0x1d2a4a, 0x2a2a2a, 0x4a1a1a][Math.floor(Math.random() * 3)];
    g.ellipse(0, 0, 130, 10).fill({ color: 0x000000, alpha: 0.5 });
    g.roundRect(-120, -60, 240, 44, 16).fill(paint);
    g.poly([-70, -60, -45, -100, 50, -100, 80, -60]).fill(paint);
    g.poly([-60, -62, -40, -94, -4, -94, -4, -62]).fill(0x9fd8ff);
    g.poly([4, -62, 4, -94, 46, -94, 70, -62]).fill(0x9fd8ff);
    g.poly([-56, -64, -42, -90, -30, -90, -46, -64]).fill({ color: 0xffffff, alpha: 0.25 });
    g.rect(-120, -40, 240, 4).fill(COLORS.brass);
    g.roundRect(108, -54, 14, 10, 4).fill(0xfff1c4);
    g.roundRect(-122, -54, 10, 10, 3).fill(0xc8243a);
    if (taxi) {
      g.roundRect(-24, -116, 48, 16, 5).fill(COLORS.lamp);
    }
    body.addChild(g);
    c.addChild(body);
    if (taxi) {
      const t = glowText('TAXI', { fontFamily: FONT_DISPLAY, fontSize: 11, fill: 0x14080f }, { color: COLORS.lamp, distance: 6, outerStrength: 1 });
      t.position.set(0, -108);
      body.addChild(t);
    }
    // Rear door (hinged at its front edge), drawn over the body.
    const door = new Graphics();
    door.roundRect(-58, -60, 54, 42, 4).fill(0x3a1a3a).stroke({ color: 0x0b0508, width: 1.5 });
    door.poly([-56, -62, -40, -94, -4, -94, -4, -62]).fill(0x9fd8ff).stroke({ color: 0x0b0508, width: 1.5 });
    door.rect(-58, -40, 54, 4).fill(COLORS.brass);
    door.roundRect(-16, -52, 9, 3, 1.5).fill(0xcfd6e0);
    door.pivot.set(-4, 0);
    door.position.set(-4, 0);
    door.visible = taxi;
    body.addChild(door);
    // Brake lights.
    const brake = new Sprite(glowTexture());
    brake.anchor.set(0.5);
    brake.position.set(-120, -49);
    brake.width = 90;
    brake.height = 50;
    brake.tint = 0xff2a3a;
    brake.alpha = 0;
    brake.blendMode = 'add';
    body.addChild(brake);
    const beam = new Sprite(glowTexture());
    beam.anchor.set(0, 0.5);
    beam.position.set(116, -48);
    beam.width = 260;
    beam.height = 70;
    beam.tint = 0xfff1c4;
    beam.alpha = 0.35;
    beam.blendMode = 'add';
    body.addChild(beam);
    const wheels: Graphics[] = [];
    for (const wx of [-72, 72]) {
      const w = new Graphics().circle(0, 0, 22).fill(0x0b0b10).circle(0, 0, 11).fill(0x8a8a90);
      w.rect(-2, -11, 4, 22).fill(0x4a4a50);
      w.position.set(wx, -16);
      c.addChild(w);
      wheels.push(w);
    }
    this.world.addChild(c);
    return { c, wheels, body, door, brake };
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    this.applyCam();
  }

  private applyCam() {
    // "Cover" the screen; on narrow screens keep the door in view.
    // Portrait screens: keep the whole sign in view and let the sky fill the space above.
    const base = Math.min(Math.max(this.screenW / W, this.screenH / H), this.screenW / 760);
    const z = base * this.cam.zoom;
    this.world.scale.set(z);
    let x = this.screenW / 2 - this.cam.x * z;
    let y = this.screenH / 2 - this.cam.y * z;
    x = Math.min(0, Math.max(this.screenW - W * z, x));
    if (H * z >= this.screenH) y = Math.min(0, Math.max(this.screenH - H * z, y));
    else y = Math.max(this.screenH - H * z - this.screenH * 0.12, Math.min(y, this.screenH * 0.35));
    this.world.position.set(x, y);
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.time += dt;
    this.bulbs.forEach((b, i) => (b.alpha = Math.floor(this.time * 6 + i) % 3 === 0 ? 1 : 0.3));
    const flick = Math.sin(this.time * 29) > 0.985;
    this.sign.alpha = flick ? 0.6 : 1;
    this.signGlow.alpha = flick ? 0.2 : 0.38 + Math.sin(this.time * 2) * 0.04;
    for (const m of this.moths) {
      const a = this.time * m.sp + m.ph;
      m.c.position.set(m.cx + Math.cos(a) * 34 + Math.sin(a * 2.3) * 10, m.cy + Math.sin(a * 1.4) * 22);
      m.wings.scale.x = m.base * (0.35 + 0.65 * Math.abs(Math.cos(this.time * 24 + m.ph)));
    }
    // Passing traffic.
    this.nextCar -= dt;
    if (this.nextCar <= 0) {
      this.nextCar = 5 + Math.random() * 7;
      const car = this.makeCar(false);
      car.c.position.set(-200, GROUND + 92);
      this.cars.push({ ...car, v: 420 + Math.random() * 160 });
    }
    for (const car of [...this.cars]) {
      car.c.x += car.v * dt;
      for (const w of car.wheels) w.rotation += (car.v * dt) / 22;
      if (car.c.x > W + 250) {
        car.c.destroy({ children: true });
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    for (const w of this.walkers) w.w.update(dtMs, w.walking);
    // Exhaust from the taxi while its engine runs.
    if (this.exhaust) {
      this.puffAcc += dt;
      if (this.puffAcc > 0.09) {
        this.puffAcc = 0;
        const p = new Graphics().circle(0, 0, 7).fill({ color: 0xbfb8c8, alpha: 0.35 });
        const ex = this.exhaust;
        p.position.set(ex.c.x + ex.x, ex.c.y + ex.y);
        this.world.addChild(p);
        this.puffs.push({ g: p, vx: -40 - Math.random() * 30, vy: -18 - Math.random() * 12, life: 0 });
      }
    }
    for (const p of [...this.puffs]) {
      p.life += dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.scale.set(1 + p.life * 2.2);
      p.g.alpha = Math.max(0, 1 - p.life / 1.1);
      if (p.life > 1.1) {
        p.g.destroy();
        this.puffs.splice(this.puffs.indexOf(p), 1);
      }
    }
    this.applyCam();
  }

  /** The arrival: taxi pulls up, you get out, walk the red carpet, the doors swing open. */
  async arrive(look: Look) {
    sfx.ignition();
    const engine = sfx.car();
    engine.set(0.75, 0.9, 0.4);
    const taxi = this.makeCar(true);
    const stopX = DOOR_X - 230;
    taxi.c.position.set(-300, GROUND + 50);
    this.exhaust = { x: -126, y: -26, c: taxi.c };
    const startX = taxi.c.x;
    void tween(this.cam, { x: DOOR_X - 120, zoom: 1.15 }, 2400, ease.inOutCubic);
    let braking = false;
    await animate(
      2300,
      (k) => {
        const x = startX + (stopX - startX) * ease.outCubic(k);
        for (const w of taxi.wheels) w.rotation += (x - taxi.c.x) / 22;
        taxi.c.x = x;
        if (k > 0.55 && !braking) {
          braking = true;
          sfx.brake();
          engine.set(0.2, 0.3, 0.5);
        }
        // Nose dips while braking.
        taxi.body.rotation = braking ? Math.sin(Math.min(1, (k - 0.55) / 0.45) * Math.PI) * 0.035 : 0;
        taxi.brake.alpha = braking ? 0.85 : 0;
      },
    );
    engine.set(0.12, 0, 0.3);
    sfx.handbrake();
    // The body settles back on its springs.
    void animate(500, (k) => (taxi.body.rotation = -Math.sin(k * Math.PI * 2) * 0.012 * (1 - k)));
    void tween(taxi.brake, { alpha: 0 }, 500);
    await wait(300);
    // Rear door opens, you step out, the door shuts.
    sfx.carDoorOpen();
    await tween(taxi.door.scale, { x: 0.25 }, 280, ease.outCubic);
    const you = new Walker(look);
    you.view.position.set(stopX + 30, GROUND + 22);
    you.view.alpha = 0;
    this.world.addChildAt(you.view, this.world.getChildIndex(taxi.c));
    const entry = { w: you, walking: false };
    this.walkers.push(entry);
    await tween(you.view, { alpha: 1, y: GROUND + 30 }, 300);
    await wait(150);
    sfx.carDoor();
    await tween(taxi.door.scale, { x: 1 }, 160, ease.inCubic);
    void animate(250, (k) => (taxi.body.rotation = Math.sin(k * Math.PI * 3) * 0.006 * (1 - k)));
    sfx.horn();
    // The doorman greets you with a bow.
    void animate(1200, (k) => (this.doorman.bow = Math.sin(Math.min(1, k * 1.4) * Math.PI)), ease.linear);
    // Taxi pulls away: revs, a gear change, revs again.
    engine.set(0.7, 0.4, 0.25);
    void wait(900).then(() => engine.set(0.4, 0.7, 0.12));
    void wait(1050).then(() => engine.set(0.8, 1, 0.35));
    void wait(1900).then(() => engine.stop());
    void animate(
      2200,
      (k) => {
        if (taxi.c.destroyed) return;
        const x = stopX + 1200 * k * k;
        for (const w of taxi.wheels) w.rotation += (x - taxi.c.x) / 22;
        taxi.c.x = x;
        taxi.body.rotation = -Math.sin(Math.min(1, k * 3) * Math.PI) * 0.02;
      },
      ease.linear,
    ).then(() => {
      this.exhaust = null;
      if (!taxi.c.destroyed) taxi.c.destroy({ children: true });
    });
    entry.walking = true;
    void tween(this.cam, { x: DOOR_X, y: GROUND - 140, zoom: 1.6 }, 2200, ease.inOutCubic);
    // The doors swing open towards you and warm light floods out.
    void wait(1300).then(() => {
      sfx.bigDoors();
      void animate(900, (k) => !this.doors.destroyed && this.drawDoors(k), ease.outBack);
      void tween(this.doorLight, { alpha: 0.9, width: 900, height: 700 }, 900, ease.outCubic);
      this.mothBurst();
    });
    await tween(you.view, { x: DOOR_X - 8, y: GROUND + 8 }, 2000, ease.linear);
    await wait(250);
    void tween(you.view.scale, { x: 0.8, y: 0.8 }, 900, ease.inCubic);
    void tween(you.view, { alpha: 0 }, 900, ease.inCubic);
    await tween(this.cam, { zoom: 3.2, y: GROUND - 90 }, 1000, ease.inCubic);
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}
