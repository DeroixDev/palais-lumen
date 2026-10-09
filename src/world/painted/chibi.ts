// Painted characters for the 3/4 view: big head, small body, soft shading and a chunky
// outline. Each look is painted once per view (front, back, side) and cached; walking only
// moves the legs and bobs the body, so it stays cheap with many guests.

import { Container, Sprite, Texture } from 'pixi.js';
import type { PlayerLook } from '../player';
import { INK, dark, ellipse, glowAt, light, paint, rgb, rrect, type Ctx } from './brush';

type View = 'front' | 'back' | 'side';

/** Canvas of the upper body; (AX, AY) is the hip point. */
const CW = 64;
const CH = 108;
const AX = 32;
const AY = 90;

interface Full {
  skin: number;
  hair: number;
  jacket: number;
  hairStyle: NonNullable<PlayerLook['hairStyle']>;
  outfit: NonNullable<PlayerLook['outfit']>;
  hat: NonNullable<PlayerLook['hat']>;
  hatColor: number;
  accessory: NonNullable<PlayerLook['accessory']>;
  accent: number;
}

const cache = new Map<string, Texture>();

function full(color: number, l: PlayerLook): Full {
  const outfit = l.outfit ?? 'suit';
  return {
    skin: l.skin ?? 0xe8b48a,
    hair: l.hair ?? 0x2a1a10,
    jacket: l.jacket ?? (outfit === 'dress' ? 0x6b1a2e : 0x2a1630),
    hairStyle: l.hairStyle ?? 'short',
    outfit,
    hat: l.hat ?? 'none',
    hatColor: l.hatColor ?? 0x1b1b22,
    accessory: l.accessory ?? (outfit === 'dress' ? 'necklace' : 'bowTie'),
    accent: color,
  };
}

function tex(key: string, w: number, h: number, draw: (c: Ctx) => void) {
  let t = cache.get(key);
  if (!t) {
    t = paint(w, h, draw, 2.5);
    cache.set(key, t);
  }
  return t;
}

// ---- Painting the parts ---------------------------------------------------------------------

function skinFill(c: Ctx, x: number, y: number, r: number, skin: number) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, rgb(light(skin, 0.35)));
  g.addColorStop(0.6, rgb(skin));
  g.addColorStop(1, rgb(dark(skin, 0.25)));
  return g;
}

function cloth(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(col, 0.28)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.4)));
  return g;
}

function ink(c: Ctx, fill: string | CanvasGradient, w = 2.2) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = w;
  c.stroke();
}

/** Torso, arms and skirt. x is mirrored for the side view by the caller. */
function body(c: Ctx, f: Full, v: View) {
  const side = v === 'side';
  const sw = side ? 9 : 13; // half shoulder width
  const hw = side ? 8 : 11; // half hip width
  const top = -30;
  const col = f.jacket;
  // Back arm (side view).
  if (side) arm(c, f, -2, top + 3, -6, -2, 0.75);
  if (f.outfit === 'dress') {
    // Bodice and a flared skirt.
    c.beginPath();
    c.moveTo(-sw + 2, top + 2);
    c.quadraticCurveTo(0, top - 2, sw - 2, top + 2);
    c.lineTo(hw - 2, -10);
    c.quadraticCurveTo(hw + 9, 4, hw + 7, 14);
    c.quadraticCurveTo(0, 18, -hw - 7, 14);
    c.quadraticCurveTo(-hw - 9, 4, -hw + 2, -10);
    c.closePath();
    ink(c, cloth(c, -hw, top, hw, 16, col));
    // Folds in the skirt.
    c.strokeStyle = rgb(dark(col, 0.35), 0.6);
    c.lineWidth = 1.4;
    for (const k of [-6, 0, 6]) {
      c.beginPath();
      c.moveTo(k * 0.5, -6);
      c.quadraticCurveTo(k * 1.1, 4, k * 1.4, 14);
      c.stroke();
    }
    // Waist sash.
    c.beginPath();
    c.rect(-hw + 2, -12, hw * 2 - 4, 3.5);
    c.fillStyle = rgb(f.accent, 0.9);
    c.fill();
    if (v === 'front') {
      // Neckline.
      c.beginPath();
      c.moveTo(-6, top + 1);
      c.quadraticCurveTo(0, top + 9, 6, top + 1);
      c.fillStyle = skinFill(c, 0, top + 2, 8, f.skin);
      c.fill();
    }
  } else {
    // Jacket.
    c.beginPath();
    c.moveTo(-sw, top + 4);
    c.quadraticCurveTo(-sw, top, -sw + 5, top);
    c.lineTo(sw - 5, top);
    c.quadraticCurveTo(sw, top, sw, top + 4);
    c.lineTo(hw, -1);
    c.quadraticCurveTo(0, 2, -hw, -1);
    c.closePath();
    ink(c, cloth(c, -sw, top, sw, 0, col));
    if (v === 'front') {
      // Shirt and lapels.
      c.beginPath();
      c.moveTo(-5, top);
      c.lineTo(5, top);
      c.lineTo(0, top + 15);
      c.closePath();
      c.fillStyle = '#fff6e6';
      c.fill();
      c.strokeStyle = rgb(dark(col, 0.5));
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-5, top);
      c.lineTo(0, top + 15);
      c.lineTo(5, top);
      c.stroke();
      for (const by of [top + 18, top + 23]) {
        c.beginPath();
        c.arc(0, by, 1.2, 0, Math.PI * 2);
        c.fillStyle = rgb(dark(col, 0.55));
        c.fill();
      }
      // Pocket square in the accent colour.
      c.beginPath();
      c.moveTo(-10, top + 9);
      c.lineTo(-6, top + 8);
      c.lineTo(-7, top + 11);
      c.closePath();
      c.fillStyle = rgb(f.accent);
      c.fill();
    } else if (v === 'back') {
      c.strokeStyle = rgb(dark(col, 0.4), 0.7);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(0, top + 6);
      c.lineTo(0, -2);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(sw - 1, top + 2);
      c.lineTo(sw - 3, top + 14);
      c.strokeStyle = '#fff6e6';
      c.lineWidth = 2;
      c.stroke();
    }
  }
  // Accessory at the neck.
  if (v !== 'back') {
    const nx = side ? sw - 3 : 0;
    if (f.accessory === 'bowTie') {
      c.beginPath();
      c.moveTo(nx, top + 2);
      c.lineTo(nx - 5, top - 1);
      c.lineTo(nx - 5, top + 5);
      c.closePath();
      c.moveTo(nx, top + 2);
      c.lineTo(nx + 5, top - 1);
      c.lineTo(nx + 5, top + 5);
      c.closePath();
      ink(c, rgb(f.accent), 1.2);
    } else if (f.accessory === 'tie') {
      c.beginPath();
      c.moveTo(nx - 2, top + 1);
      c.lineTo(nx + 2, top + 1);
      c.lineTo(nx + 2.5, top + 13);
      c.lineTo(nx, top + 16);
      c.lineTo(nx - 2.5, top + 13);
      c.closePath();
      ink(c, rgb(f.accent), 1.2);
    } else if (f.accessory === 'necklace') {
      c.beginPath();
      c.arc(nx, top + 1, 6, 0.3, Math.PI - 0.3);
      c.strokeStyle = '#fff1c4';
      c.lineWidth = 1.4;
      c.stroke();
      c.beginPath();
      c.arc(nx, top + 7.5, 1.8, 0, Math.PI * 2);
      c.fillStyle = rgb(f.accent);
      c.fill();
    }
  }
  // Arms.
  if (side) arm(c, f, 1, top + 3, 3, -3, 1);
  else {
    arm(c, f, -sw + 1, top + 3, -sw - 2, -4, 1);
    arm(c, f, sw - 1, top + 3, sw + 2, -4, 1);
  }
}

function arm(c: Ctx, f: Full, x0: number, y0: number, x1: number, y1: number, shade: number) {
  const sleeve = f.outfit === 'dress' ? f.skin : f.jacket;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = INK;
  c.lineWidth = 9.5;
  c.stroke();
  c.strokeStyle = rgb(shade < 1 ? dark(sleeve, 0.25) : sleeve);
  c.lineWidth = 6.5;
  c.stroke();
  c.beginPath();
  c.arc(x1, y1 + 2, 3.6, 0, Math.PI * 2);
  ink(c, skinFill(c, x1, y1 + 2, 3.6, f.skin), 1.6);
}

/** Hair that hangs behind the head (long hair). */
function hairBack(c: Ctx, f: Full, v: View) {
  if (f.hairStyle !== 'long') return;
  const hy = -48;
  c.beginPath();
  if (v === 'side') {
    c.moveTo(-4, hy - 10);
    c.quadraticCurveTo(-20, hy + 2, -14, hy + 26);
    c.quadraticCurveTo(-4, hy + 22, 2, hy + 6);
  } else {
    c.moveTo(-16, hy - 4);
    c.quadraticCurveTo(-21, hy + 16, -15, hy + 27);
    c.quadraticCurveTo(0, hy + 31, 15, hy + 27);
    c.quadraticCurveTo(21, hy + 16, 16, hy - 4);
  }
  c.closePath();
  ink(c, cloth(c, -16, hy - 10, 16, hy + 28, f.hair));
}

function head(c: Ctx, f: Full, v: View) {
  const hx = 0;
  const hy = -48;
  const r = 17;
  hairBack(c, f, v);
  // Ears.
  if (v !== 'back') {
    for (const ex of v === 'side' ? [-3] : [-r + 1, r - 1]) {
      ellipse(c, hx + ex, hy + 1, 3.5, 4.5);
      ink(c, skinFill(c, hx + ex, hy, 4, f.skin), 1.6);
    }
  }
  // Head.
  ellipse(c, hx, hy, r, r * 0.96);
  ink(c, skinFill(c, hx, hy, r, f.skin), 2.4);
  if (v === 'front') {
    // Eyes with a catchlight, blush and a small smile.
    for (const ex of [-6, 6]) {
      ellipse(c, hx + ex, hy + 3, 2.4, 3.4);
      c.fillStyle = '#1b1020';
      c.fill();
      ellipse(c, hx + ex - 0.8, hy + 1.6, 0.9, 1.1);
      c.fillStyle = '#ffffff';
      c.fill();
    }
    for (const bx of [-10, 10]) glowAt(c, hx + bx, hy + 8, 4.5, 2.8, 0xff7a8a, 0.45);
    c.beginPath();
    c.arc(hx, hy + 8, 2.6, 0.2, Math.PI - 0.2);
    c.strokeStyle = 'rgba(80,30,30,0.85)';
    c.lineWidth = 1.4;
    c.stroke();
  } else if (v === 'side') {
    ellipse(c, hx + 9, hy + 3, 2.1, 3.2);
    c.fillStyle = '#1b1020';
    c.fill();
    ellipse(c, hx + 8.4, hy + 1.7, 0.8, 1);
    c.fillStyle = '#fff';
    c.fill();
    glowAt(c, hx + 8, hy + 9, 4, 2.5, 0xff7a8a, 0.4);
    // Nose.
    c.beginPath();
    c.moveTo(hx + r - 2, hy + 1);
    c.quadraticCurveTo(hx + r + 3, hy + 5, hx + r - 1, hy + 7);
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.stroke();
  }
  hairTop(c, f, v, hx, hy, r);
  hat(c, f, v, hx, hy, r);
}

function hairTop(c: Ctx, f: Full, v: View, hx: number, hy: number, r: number) {
  const s = f.hairStyle;
  const fill = cloth(c, hx - r, hy - r, hx + r, hy + r, f.hair);
  if (s === 'bald') {
    glowAt(c, hx - 6, hy - 9, 6, 4, 0xffffff, 0.35);
    return;
  }
  c.beginPath();
  if (v === 'back') {
    // Back of the head: mostly hair.
    c.ellipse(hx, hy - 1, r + 1.5, r * 0.98 + 1, 0, Math.PI * 0.98, Math.PI * 2.02);
    c.quadraticCurveTo(hx + r, hy + (s === 'short' || s === 'sidePart' ? 10 : 14), hx, hy + (s === 'short' || s === 'sidePart' ? 12 : 16));
    c.quadraticCurveTo(hx - r, hy + 12, hx - r - 1, hy);
  } else if (v === 'side') {
    c.moveTo(hx + r - 2, hy - 6);
    c.quadraticCurveTo(hx + r - 2, hy - r - 4, hx - 2, hy - r - 2);
    c.quadraticCurveTo(hx - r - 3, hy - r + 2, hx - r - 1, hy + 4);
    c.quadraticCurveTo(hx - r + 2, hy + 12, hx - 6, hy + 10);
    c.quadraticCurveTo(hx - 2, hy - 2, hx + 4, hy - 5);
    c.closePath();
  } else {
    // Front: a cap with a fringe.
    c.moveTo(hx - r - 1, hy + 2);
    c.quadraticCurveTo(hx - r - 2, hy - r - 3, hx, hy - r - 3);
    c.quadraticCurveTo(hx + r + 2, hy - r - 3, hx + r + 1, hy + 2);
    if (s === 'sidePart') {
      c.quadraticCurveTo(hx + r - 4, hy - 8, hx - 2, hy - 8);
      c.quadraticCurveTo(hx - 10, hy - 6, hx - r - 1, hy + 2);
    } else if (s === 'curly') {
      for (let k = 4; k >= -4; k--) c.quadraticCurveTo(hx + k * 3.9 + 2, hy - 2, hx + k * 3.9, hy - 6 + (k % 2) * 2);
      c.lineTo(hx - r - 1, hy + 2);
    } else {
      c.quadraticCurveTo(hx + r - 2, hy - 6, hx + 8, hy - 6);
      c.quadraticCurveTo(hx + 3, hy - 3, hx, hy - 7);
      c.quadraticCurveTo(hx - 4, hy - 3, hx - 9, hy - 6);
      c.quadraticCurveTo(hx - r + 2, hy - 6, hx - r - 1, hy + 2);
    }
    c.closePath();
  }
  ink(c, fill, 2.2);
  // Shine.
  c.save();
  c.clip();
  c.beginPath();
  c.ellipse(hx - 5, hy - r + 3, 7, 2.6, -0.3, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fill();
  c.restore();
  if (s === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      c.beginPath();
      c.arc(hx + Math.cos(a) * (r + 1), hy - 2 + Math.sin(a) * (r + 1), 4.5, 0, Math.PI * 2);
      ink(c, fill, 1.6);
    }
  }
  if (s === 'bun') {
    const bx = v === 'side' ? hx - 10 : hx;
    const by = v === 'side' ? hy - r + 1 : hy - r - 4;
    ellipse(c, bx, by, 7.5, 7);
    ink(c, fill, 2);
    ellipse(c, bx - 2, by - 2.5, 3, 1.6);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fill();
  }
}

function hat(c: Ctx, f: Full, v: View, hx: number, hy: number, r: number) {
  if (f.hat === 'none') return;
  const col = f.hatColor;
  const top = f.hat === 'topHat';
  const brimY = hy - r + 5;
  const bw = top ? r + 3 : r + 7;
  const crownW = top ? 11 : 12;
  const crownH = top ? 26 : 13;
  const cx = v === 'side' ? hx - 1 : hx;
  ellipse(c, cx, brimY, bw, 5);
  ink(c, cloth(c, cx - bw, brimY - 5, cx + bw, brimY + 5, col), 2);
  c.beginPath();
  if (top) {
    rrect(c, cx - crownW, brimY - crownH, crownW * 2, crownH, 3);
  } else {
    c.moveTo(cx - crownW, brimY);
    c.quadraticCurveTo(cx - crownW - 1, brimY - crownH, cx - 3, brimY - crownH);
    c.quadraticCurveTo(cx, brimY - crownH + 4, cx + 3, brimY - crownH);
    c.quadraticCurveTo(cx + crownW + 1, brimY - crownH, cx + crownW, brimY);
    c.closePath();
  }
  ink(c, cloth(c, cx - crownW, brimY - crownH, cx + crownW, brimY, col), 2);
  // Band.
  c.beginPath();
  c.rect(cx - crownW + 1, brimY - 6, crownW * 2 - 2, 4);
  c.fillStyle = rgb(col === 0xc9962e ? 0x2a1630 : f.accent);
  c.fill();
  // Highlight on the crown.
  c.beginPath();
  c.rect(cx - crownW + 3, brimY - crownH + 3, 2.5, crownH - 10);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fill();
}

function upper(f: Full, v: View) {
  return tex(`u|${JSON.stringify(f)}|${v}`, CW, CH, (c) => {
    c.translate(AX, AY);
    if (v === 'back') {
      // From behind the head is drawn after the body but arms first.
      body(c, f, v);
      head(c, f, v);
    } else {
      body(c, f, v);
      head(c, f, v);
    }
  });
}

function leg(f: Full) {
  const dress = f.outfit === 'dress';
  return tex(`l|${dress}|${f.jacket}|${f.skin}`, 12, 18, (c) => {
    c.translate(6, 0);
    const trouser = dress ? f.skin : 0x1b1b22;
    rrect(c, -3.5, -2, 7, 13, 3);
    ink(c, cloth(c, -3, 0, 3, 12, trouser), 1.8);
    ellipse(c, 0.5, 13, 4.6, 3.4);
    ink(c, dress ? rgb(dark(f.jacket, 0.3)) : '#120c14', 1.6);
    ellipse(c, -0.5, 12, 1.6, 0.9);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
  });
}

let shadowTex: Texture | null = null;
function shadowTexture() {
  return (shadowTex ??= paint(60, 24, (c) => glowAt(c, 30, 12, 28, 10, 0x0a0410, 0.55)));
}

// ---- The character -----------------------------------------------------------------------------

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export class Chibi {
  readonly view = new Container();
  /** How far above the feet the interaction prompt should float. */
  readonly headroom = 112;
  private rig = new Container();
  private top: Sprite;
  private legL: Sprite;
  private legR: Sprite;
  private f: Full;
  private viewNow: View = 'front';
  private facing = Math.PI / 2;
  private turnTarget: number | null = null;
  private phase = 0;
  private amp = 0;
  private idle = 0;
  private seed = Math.random() * 10;

  constructor(color: number, look: PlayerLook = {}) {
    this.f = full(color, look);
    const sh = new Sprite(shadowTexture());
    sh.anchor.set(0.5);
    sh.y = 2;
    this.legL = new Sprite(leg(this.f));
    this.legR = new Sprite(leg(this.f));
    for (const l of [this.legL, this.legR]) l.anchor.set(0.5, 0.05);
    this.top = new Sprite(upper(this.f, 'front'));
    this.top.anchor.set(AX / CW, AY / CH);
    this.rig.addChild(this.legL, this.legR, this.top);
    this.rig.y = -14;
    this.view.addChild(sh, this.rig);
    // Smaller than the painted canvas: the canvas is drawn at a generous size.
    this.view.scale.set(0.82);
    this.setView('front', 1);
  }

  private setView(v: View, dir: number) {
    if (v !== this.viewNow) {
      this.viewNow = v;
      this.top.texture = upper(this.f, v);
    }
    this.rig.scale.x = v === 'side' ? dir : 1;
    const spread = v === 'side' ? 2 : 6;
    this.legL.x = -spread;
    this.legR.x = spread;
  }

  private applyFacing() {
    const cx = Math.cos(this.facing);
    const sy = Math.sin(this.facing);
    if (Math.abs(sy) > Math.abs(cx) * 0.9) this.setView(sy > 0 ? 'front' : 'back', 1);
    else this.setView('side', cx >= 0 ? 1 : -1);
  }

  faceTowards(angle: number) {
    this.turnTarget = angle;
  }

  update(dtMs: number, dir: number | null) {
    const dt = Math.min(dtMs, 100) / 1000;
    const walking = dir !== null;
    if (walking) {
      this.facing = wrap(this.facing + wrap(dir - this.facing) * Math.min(1, dt * 16));
      this.phase += dt * 14;
      this.idle = 0;
      this.turnTarget = null;
    } else {
      this.idle += dt;
      if (this.turnTarget !== null) this.facing = wrap(this.facing + wrap(this.turnTarget - this.facing) * Math.min(1, dt * 10));
    }
    this.amp += ((walking ? 1 : 0) - this.amp) * Math.min(1, dt * (walking ? 10 : 8));
    if (!walking && this.amp < 0.02) this.amp = 0;
    this.applyFacing();
    const s = Math.sin(this.phase) * this.amp;
    const side = this.viewNow === 'side';
    // Legs: step up and down from the front, swing from the side.
    this.legL.y = -1 + (side ? 0 : Math.max(0, s) * -3);
    this.legR.y = -1 + (side ? 0 : Math.max(0, -s) * -3);
    this.legL.rotation = side ? s * 0.6 : 0;
    this.legR.rotation = side ? -s * 0.6 : 0;
    // Body bounces with each step and breathes when standing.
    const t = this.idle + this.seed;
    const bob = Math.abs(Math.cos(this.phase)) * 2.6 * this.amp;
    this.top.y = -bob;
    this.top.rotation = s * 0.06;
    const breathe = Math.sin(t * 2.2) * 0.022 * (1 - this.amp);
    this.top.scale.set(1 - breathe * 0.5, 1 + breathe);
  }
}
