// The player's avatar (and every guest), seen from directly above.
//
// All parts are drawn once in the constructor in a local frame where the
// character faces +y (down the screen). Animation only moves, rotates and
// scales the prebuilt parts, so nothing is redrawn per frame.

import { Container, Graphics } from 'pixi.js';

export type HairStyle = 'short' | 'sidePart' | 'bun' | 'long' | 'curly' | 'bald';
export type Outfit = 'suit' | 'dress';
export type Hat = 'none' | 'fedora' | 'topHat';
export type Accessory = 'bowTie' | 'tie' | 'necklace' | 'none';

export interface PlayerLook {
  skin?: number;
  hair?: number;
  /** Colour of the jacket, or of the dress when outfit is 'dress'. */
  jacket?: number;
  hairStyle?: HairStyle;
  outfit?: Outfit;
  hat?: Hat;
  hatColor?: number;
  /** Defaults to a bow tie with a suit and a necklace with a dress. */
  accessory?: Accessory;
}

const OUTLINE = { color: 0x14080f, alpha: 0.6, width: 1.1 };
const SHIRT = 0xfff6e6;

function mix(a: number, b: number, t: number) {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
const darken = (c: number, t: number) => mix(c, 0x000000, t);

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export class Player {
  readonly view = new Container();
  /** Upper body: rotates towards the walking direction. */
  private body = new Container();
  private head = new Container();
  private armL = new Container();
  private armR = new Container();
  private feetRot = new Container();
  private footL = new Graphics();
  private footR = new Graphics();
  private armBaseY = 1;

  private phase = 0;
  private amp = 0;
  private idle = 0;
  private facing = Math.PI / 2;
  private seed = Math.random() * 10;

  constructor(color: number, look: PlayerLook = {}) {
    const skin = look.skin ?? 0xe8b48a;
    const hair = look.hair ?? 0x2a1a10;
    const outfit = look.outfit ?? 'suit';
    const cloth = look.jacket ?? (outfit === 'dress' ? 0x6b1a2e : 0x2a1630);
    const accessory = look.accessory ?? (outfit === 'dress' ? 'necklace' : 'bowTie');
    const hairStyle = look.hairStyle ?? 'short';
    const hat = look.hat ?? 'none';
    const hatColor = look.hatColor ?? 0x1b1b22;

    // Soft drop shadow: two stacked translucent ellipses.
    const shadow = new Graphics()
      .ellipse(1.5, 3.5, 20, 16)
      .fill({ color: 0x000000, alpha: 0.18 })
      .ellipse(1, 3, 15.5, 12)
      .fill({ color: 0x000000, alpha: 0.24 });

    // Shoes (polished, with a small toe shine).
    const shoe = outfit === 'dress' ? darken(cloth, 0.35) : 0x17121a;
    for (const f of [this.footL, this.footR]) {
      const w = outfit === 'dress' ? 3 : 3.6;
      f.ellipse(0, 0, w, 5.2).fill(shoe).stroke(OUTLINE);
      f.ellipse(0, 2.4, w * 0.5, 1.5).fill({ color: 0xffffff, alpha: 0.22 });
    }
    this.footL.x = -6;
    this.footR.x = 6;
    this.feetRot.addChild(this.footL, this.footR);

    const torso = new Graphics();
    if (outfit === 'dress') this.drawDress(torso, cloth, skin, color, accessory);
    else this.drawSuit(torso, cloth, color, accessory);

    this.drawArm(this.armL, outfit, cloth, skin, color, -1);
    this.drawArm(this.armR, outfit, cloth, skin, color, 1);
    const shoulderX = outfit === 'dress' ? 12.8 : 14.4;
    this.armL.x = -shoulderX;
    this.armR.x = shoulderX;
    this.armL.y = this.armR.y = this.armBaseY;

    this.head.y = -1;
    this.head.scale.set(0.86);
    this.head.addChild(this.drawHead(skin, hair, hairStyle, hat, hatColor, color));

    this.body.addChild(this.armL, this.armR, torso, this.head);
    this.view.addChild(shadow, this.feetRot, this.body);
    this.view.scale.set(1.45);
    this.applyFacing();
  }

  // ---------------------------------------------------------------- drawing

  private drawSuit(g: Graphics, jacket: number, accent: number, accessory: Accessory) {
    // Dark rim with accent piping, then the jacket and lit shoulder caps.
    g.ellipse(0, 0, 16.6, 11.6).stroke(OUTLINE);
    g.ellipse(0, 0, 16, 11).fill(darken(jacket, 0.3)).stroke({ color: accent, width: 1.2, alpha: 0.75 });
    g.ellipse(0, -0.6, 14.4, 9.4).fill(jacket);
    g.ellipse(-7.5, -1, 6, 4.6).fill({ color: lighten(jacket, 0.16), alpha: 0.8 });
    g.ellipse(7.5, -1, 6, 4.6).fill({ color: lighten(jacket, 0.16), alpha: 0.8 });
    g.ellipse(-8.5, -2, 3, 2).fill({ color: lighten(jacket, 0.3), alpha: 0.5 });
    g.ellipse(8.5, -2, 3, 2).fill({ color: lighten(jacket, 0.3), alpha: 0.5 });
    // Back seam.
    g.moveTo(0, -10.6).lineTo(0, -7).stroke({ color: darken(jacket, 0.4), width: 0.9 });
    // Shirt front and satin lapels.
    g.poly([-5, 3.5, 5, 3.5, 0, 11.4]).fill(SHIRT);
    g.poly([-5.2, 3.5, -0.8, 10.6, -6.8, 8.4]).fill(lighten(jacket, 0.22)).stroke({ ...OUTLINE, width: 0.6 });
    g.poly([5.2, 3.5, 0.8, 10.6, 6.8, 8.4]).fill(lighten(jacket, 0.22)).stroke({ ...OUTLINE, width: 0.6 });
    // Pocket square.
    g.poly([-11, 5.2, -8, 4.6, -9.2, 6.8]).fill(accent);
    if (accessory === 'bowTie') {
      g.poly([0, 8.6, -3.6, 6.8, -3.4, 10.6]).fill(accent).stroke({ ...OUTLINE, width: 0.6 });
      g.poly([0, 8.6, 3.6, 6.8, 3.4, 10.6]).fill(accent).stroke({ ...OUTLINE, width: 0.6 });
      g.circle(0, 8.6, 1.1).fill(darken(accent, 0.25));
    } else if (accessory === 'tie') {
      g.poly([-1.3, 7.6, 1.3, 7.6, 1.6, 10.2, 0, 11.6, -1.6, 10.2]).fill(accent).stroke({ ...OUTLINE, width: 0.6 });
    } else if (accessory === 'necklace') {
      this.drawNecklace(g, accent);
    }
  }

  private drawDress(g: Graphics, dress: number, skin: number, accent: number, accessory: Accessory) {
    // Wide round skirt with folds and a shimmering hem.
    g.circle(0, 1.5, 16.4).fill(darken(dress, 0.3)).stroke(OUTLINE);
    g.circle(0, 1, 14.2).fill(dress);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13;
      g.moveTo(Math.cos(a) * 8, 1 + Math.sin(a) * 8)
        .lineTo(Math.cos(a) * 15.6, 1.5 + Math.sin(a) * 15.6)
        .stroke({ color: darken(dress, 0.35), width: 1, alpha: 0.55 });
    }
    g.circle(0, 1.5, 15.4).stroke({ color: accent, width: 0.9, alpha: 0.55 });
    g.ellipse(-4, -3, 7, 5).fill({ color: lighten(dress, 0.18), alpha: 0.35 });
    // Bare shoulders and décolleté.
    g.ellipse(-9.2, -0.4, 3.4, 3).fill(skin).stroke(OUTLINE);
    g.ellipse(9.2, -0.4, 3.4, 3).fill(skin).stroke(OUTLINE);
    g.ellipse(0, 4.6, 5.5, 3.6).fill(skin);
    // Bodice and thin straps.
    g.ellipse(0, -0.5, 8.6, 6.4).fill(lighten(dress, 0.1)).stroke({ ...OUTLINE, width: 0.8 });
    g.ellipse(0, -2, 6, 3.4).fill({ color: lighten(dress, 0.28), alpha: 0.4 });
    g.moveTo(-6.5, 2).lineTo(-9.6, -1.6).stroke({ color: darken(dress, 0.2), width: 1 });
    g.moveTo(6.5, 2).lineTo(9.6, -1.6).stroke({ color: darken(dress, 0.2), width: 1 });
    g.ellipse(0, 4.8, 4.2, 2.4).fill(skin);
    if (accessory === 'necklace') this.drawNecklace(g, accent);
    else if (accessory === 'bowTie') {
      g.circle(-3.5, 6.6, 1.6).fill(accent);
      g.circle(3.5, 6.6, 1.6).fill(accent);
    }
  }

  private drawNecklace(g: Graphics, accent: number) {
    // A string of tiny pearls just in front of the neck, with a gem.
    const cy = -1;
    const r = 8.1;
    for (let a = 0.22 * Math.PI; a <= 0.78 * Math.PI + 1e-6; a += 0.07 * Math.PI) {
      g.circle(Math.cos(a) * r, cy + Math.sin(a) * r, 0.75).fill(0xfff1d6);
    }
    g.circle(0, cy + r + 1.2, 1.5).fill(accent).stroke({ ...OUTLINE, width: 0.6 });
    g.circle(-0.4, cy + r + 0.8, 0.45).fill({ color: 0xffffff, alpha: 0.8 });
  }

  private drawArm(arm: Container, outfit: Outfit, cloth: number, skin: number, accent: number, side: number) {
    const g = new Graphics();
    if (outfit === 'dress') {
      g.ellipse(0, 1.5, 2.4, 5.2).fill(skin).stroke(OUTLINE);
      g.ellipse(-side * 0.8, 0, 1.2, 3).fill({ color: 0xffffff, alpha: 0.15 });
      if (side > 0) g.ellipse(0, 5.4, 2.6, 0.9).fill(accent); // bracelet
      g.circle(0, 7.6, 2.5).fill(skin).stroke(OUTLINE);
    } else {
      g.ellipse(0, 1, 4, 6.4).fill(cloth).stroke(OUTLINE);
      g.ellipse(-side * 1.2, -0.5, 1.6, 3.6).fill({ color: lighten(cloth, 0.2), alpha: 0.5 });
      g.ellipse(0, 6.4, 2.9, 1.3).fill(SHIRT); // cuff
      g.circle(0, 8.2, 2.7).fill(skin).stroke(OUTLINE);
      g.circle(-0.6, 7.6, 0.9).fill({ color: 0xffffff, alpha: 0.18 });
    }
    arm.addChild(g);
  }

  private drawHead(skin: number, hair: number, style: HairStyle, hat: Hat, hatColor: number, accent: number) {
    const g = new Graphics();
    const hairDark = darken(hair, 0.35);
    const hairLight = lighten(hair, 0.28);

    if (style === 'long' && hat === 'none') {
      // Hair falling over the back and shoulders.
      g.ellipse(0, -4.5, 10.6, 9).fill(hair).stroke(OUTLINE);
      for (const x of [-6, -2.5, 2.5, 6]) {
        g.moveTo(x * 0.6, -6).quadraticCurveTo(x * 1.1, -10, x * 1.05, -12.4).stroke({ color: hairDark, width: 0.8, alpha: 0.7 });
      }
    }

    // Ears, then the head itself, then a nose tip pointing forward.
    g.circle(-7.9, 0.6, 2.1).fill(darken(skin, 0.12)).stroke(OUTLINE);
    g.circle(7.9, 0.6, 2.1).fill(darken(skin, 0.12)).stroke(OUTLINE);
    g.circle(0, 0, 8.2).fill(skin).stroke(OUTLINE);
    g.ellipse(0, 7.6, 1.7, 1.4).fill(darken(skin, 0.08)).stroke({ ...OUTLINE, width: 0.6, alpha: 0.4 });
    g.circle(-0.5, 7.3, 0.5).fill({ color: 0xffffff, alpha: 0.35 });

    if (hat === 'none') this.drawHair(g, style, hair, hairDark, hairLight, accent);
    else if (hat === 'fedora') {
      g.ellipse(0, -0.4, 12.4, 11.8).fill(darken(hatColor, 0.18)).stroke(OUTLINE);
      g.ellipse(0, -0.4, 11.2, 10.6).stroke({ color: lighten(hatColor, 0.2), width: 0.8, alpha: 0.6 });
      g.ellipse(0, -1, 7.4, 8.2).fill(hatColor).stroke({ color: accent, width: 1.6 });
      g.ellipse(-2.2, -2.8, 3, 4).fill({ color: lighten(hatColor, 0.25), alpha: 0.35 });
      g.moveTo(0, -6.8).lineTo(0, 3.8).stroke({ color: darken(hatColor, 0.4), width: 1.1 });
      g.moveTo(-2.4, 4.4).lineTo(-1.6, 6.2).stroke({ color: darken(hatColor, 0.4), width: 0.8 });
      g.moveTo(2.4, 4.4).lineTo(1.6, 6.2).stroke({ color: darken(hatColor, 0.4), width: 0.8 });
    } else {
      g.circle(0, 0, 11).fill(darken(hatColor, 0.2)).stroke(OUTLINE);
      g.circle(0, 0, 7.4).fill(hatColor).stroke({ color: accent, width: 1.5 });
      g.circle(-1.6, -1.6, 4.6).fill({ color: lighten(hatColor, 0.3), alpha: 0.25 });
      g.circle(-2.6, -2.6, 1.6).fill({ color: 0xffffff, alpha: 0.18 });
    }
    return g;
  }

  /** Hair cap covering the crown and back of the head, open at the face. */
  private hairCap(g: Graphics, r: number, open: number, fx: number, fy: number) {
    const a0 = Math.PI / 2 + open;
    const a1 = Math.PI / 2 - open + TAU;
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
    g.quadraticCurveTo(fx, fy, Math.cos(a0) * r, Math.sin(a0) * r);
    g.closePath();
  }

  private drawHair(g: Graphics, style: HairStyle, hair: number, dark: number, light: number, accent: number) {
    switch (style) {
      case 'bald':
        g.moveTo(Math.cos(Math.PI * 0.95) * 7.2, Math.sin(Math.PI * 0.95) * 7.2).arc(0, 0, 7.2, Math.PI * 0.95, Math.PI * 2.05).stroke({ color: hair, width: 2.4 });
        g.ellipse(-2, -2.6, 3, 2).fill({ color: 0xffffff, alpha: 0.32 });
        g.circle(-3.2, -3.4, 0.8).fill({ color: 0xffffff, alpha: 0.5 });
        return;
      case 'curly': {
        this.hairCap(g, 8.6, 0.7, 0, 3);
        g.fill(hair).stroke(OUTLINE);
        const curls: [number, number][] = [];
        for (let a = Math.PI * 0.62; a <= Math.PI * 2.38; a += 0.42) curls.push([Math.cos(a) * 7.4, Math.sin(a) * 7.4]);
        const inner: [number, number][] = [[-3, -3], [2.5, -3.5], [0, 0.2], [-3.6, 1.6], [3.6, 1.2], [0, -5.2]];
        for (const [x, y] of curls) g.circle(x, y, 2.9).fill({ color: 0x14080f, alpha: 0.45 });
        for (const [x, y] of curls) g.circle(x, y, 2.4).fill(hair);
        for (const [x, y] of inner) g.circle(x, y, 2.3).fill(hair).stroke({ color: dark, width: 0.7, alpha: 0.6 });
        for (const [x, y] of [...curls, ...inner]) g.circle(x - 0.7, y - 0.7, 0.8).fill({ color: light, alpha: 0.6 });
        return;
      }
      case 'long':
        this.hairCap(g, 8.8, 0.62, 0, 5);
        g.fill(hair).stroke(OUTLINE);
        g.moveTo(0, -8.6).lineTo(0, 3.5).stroke({ color: dark, width: 0.9 });
        g.moveTo(Math.cos(Math.PI * 1.15) * 5.5, Math.sin(Math.PI * 1.15) * 5.5).arc(0, 0, 5.5, Math.PI * 1.15, Math.PI * 1.4).stroke({ color: light, width: 1.4, alpha: 0.6 });
        g.moveTo(Math.cos(Math.PI * 1.6) * 5.5, Math.sin(Math.PI * 1.6) * 5.5).arc(0, 0, 5.5, Math.PI * 1.6, Math.PI * 1.85).stroke({ color: light, width: 1.4, alpha: 0.6 });
        return;
      case 'bun':
        this.hairCap(g, 8.7, 0.72, 0, 4.5);
        g.fill(hair).stroke(OUTLINE);
        for (const x of [-4, -1.5, 1.5, 4]) g.moveTo(x, 3).lineTo(x * 0.3, -4).stroke({ color: dark, width: 0.7, alpha: 0.7 });
        // The bun sits on the crown, held by a ribbon in the accent colour.
        g.circle(0, -4.6, 4.6).fill({ color: 0x14080f, alpha: 0.35 });
        g.circle(0, -4.8, 3.9).fill(hair).stroke({ color: accent, width: 1.2 });
        g.moveTo(Math.cos(Math.PI * 0.9) * 2.3, -4.8 + Math.sin(Math.PI * 0.9) * 2.3).arc(0, -4.8, 2.3, Math.PI * 0.9, Math.PI * 1.6).stroke({ color: light, width: 1, alpha: 0.7 });
        g.moveTo(Math.cos(Math.PI * 0.1) * 1.2, -4.8 + Math.sin(Math.PI * 0.1) * 1.2).arc(0, -4.8, 1.2, Math.PI * 0.1, Math.PI * 0.9).stroke({ color: dark, width: 0.8 });
        return;
      case 'sidePart':
        this.hairCap(g, 8.8, 0.85, 3.5, 3.6);
        g.fill(hair).stroke(OUTLINE);
        g.moveTo(-3, -8).quadraticCurveTo(-3.6, -2, -2.4, 2.8).stroke({ color: dark, width: 1 });
        g.moveTo(-1.2, -6).quadraticCurveTo(2.5, -2.5, 3.5, 2.8).stroke({ color: light, width: 1.5, alpha: 0.55 });
        g.moveTo(1.5, -6.8).quadraticCurveTo(5, -3, 6, 1).stroke({ color: light, width: 1, alpha: 0.4 });
        return;
      case 'short':
      default:
        this.hairCap(g, 8.7, 0.8, 0, 2.6);
        g.fill(hair).stroke(OUTLINE);
        g.moveTo(Math.cos(Math.PI * 1.1) * 5, Math.sin(Math.PI * 1.1) * 5).arc(0, 0, 5, Math.PI * 1.1, Math.PI * 1.55).stroke({ color: light, width: 1.6, alpha: 0.55 });
        g.moveTo(Math.cos(Math.PI * 1.7) * 6.8, Math.sin(Math.PI * 1.7) * 6.8).arc(0, 0, 6.8, Math.PI * 1.7, Math.PI * 1.9).stroke({ color: light, width: 1, alpha: 0.4 });
        return;
    }
  }

  // -------------------------------------------------------------- animation

  private applyFacing() {
    const r = this.facing - Math.PI / 2;
    this.body.rotation = r;
    this.feetRot.rotation = r;
  }

  private turnTarget: number | null = null;

  /** Turns on the spot to face an angle (used by cutscenes, e.g. inside the elevator). */
  faceTowards(angle: number) {
    this.turnTarget = angle;
  }

  /** dir is the walking angle in radians, or null when standing still. */
  update(dtMs: number, dir: number | null) {
    const dt = Math.min(dtMs, 100) / 1000;
    const walking = dir !== null;
    if (walking) {
      // Turn smoothly towards the walking direction; keep facing when stopping.
      this.facing = wrapAngle(this.facing + wrapAngle(dir - this.facing) * Math.min(1, dt * 14));
      this.phase += dt * 15;
      this.idle = 0;
      this.turnTarget = null;
    } else {
      this.idle += dt;
      if (this.turnTarget !== null) this.facing = wrapAngle(this.facing + wrapAngle(this.turnTarget - this.facing) * Math.min(1, dt * 8));
    }
    this.amp += ((walking ? 1 : 0) - this.amp) * Math.min(1, dt * (walking ? 10 : 8));
    if (!walking && this.amp < 0.02) this.amp = 0;
    const swing = Math.sin(this.phase) * this.amp;

    this.applyFacing();
    // Feet step along the walking direction; arms swing against them.
    this.footL.y = 5.5 + swing * 5.5;
    this.footR.y = 5.5 - swing * 5.5;
    this.armL.y = this.armBaseY - swing * 3.6;
    this.armR.y = this.armBaseY + swing * 3.6;
    this.armL.rotation = swing * 0.12;
    this.armR.rotation = swing * 0.12;

    // Shoulders twist slightly with each step, the head stays steadier.
    const twist = swing * 0.07;
    this.body.rotation += twist;

    // Idle: gentle breathing and the occasional look around.
    const t = this.idle + this.seed;
    const idleK = Math.min(1, Math.max(0, (this.idle - 0.8) / 1.2));
    const glance = Math.sin(t * 0.55) * Math.max(0, Math.sin(t * 0.23)) * 0.45 * idleK;
    this.head.rotation = -twist * 0.8 + glance;
    const breathe = 1 + Math.sin(t * 2.4) * 0.018 * (1 - this.amp);
    const bob = 1 + Math.abs(swing) * 0.03;
    this.body.scale.set(breathe * bob, breathe * bob);
  }
}
