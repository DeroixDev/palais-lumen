// Painted parts of Großes Rad: the money wheel, the small bonus wheel, the stage it stands
// on, the clicker, the bet plaques and the station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { drawEmblem, glowTexture } from '../../core/fx';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rim, rrect, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { BONUS_PAY, BONUS_WHEEL, WHEEL, type Field, type Segment } from './rules';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export const FIELD_COLOR: Record<Segment, number> = {
  x1: 0x3d6fc0,
  x2: 0x2f9a5a,
  x5: 0x8a44c8,
  x10: 0xe0761f,
  x20: 0xd8243a,
  bonus: 0xe0b25a,
};
export const FIELD_LABEL: Record<Field, string> = { x1: '×1', x2: '×2', x5: '×5', x10: '×10', x20: '×20' };

// ---- Main wheel (in wheel units: radius R) --------------------------------------------------------------

export const R = 220;
/** Radius of the bulb ring and of the peg ring. */
export const BULB_R = R - 11;
export const PEG_R = R - 28;
const SEG_OUT = R - 30;
const SEG_IN = 70;
export const WHEEL_TEX = R * 2 + 20;

/** Segment i spans angles [i, i+1)·seg, clockwise from the top. */
function segPath(c: Ctx, i: number, n: number, r0: number, r1: number) {
  const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
  const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2;
  c.beginPath();
  c.arc(0, 0, r1, a0, a1);
  c.arc(0, 0, r0, a1, a0, true);
  c.closePath();
}

function sunMark(c: Ctx, x: number, y: number, s: number, col: string) {
  drawEmblem(c, x, y, s, col, col);
}

export function wheelTexture() {
  return cached('wheel', () =>
    paint(WHEEL_TEX, WHEEL_TEX, (c) => {
      c.translate(WHEEL_TEX / 2, WHEEL_TEX / 2);
      const n = WHEEL.length;
      // Outer rim: brass with a dark groove for the bulbs.
      ellipse(c, 0, 0, R, R);
      fillInk(c, gold(c, -R, -R, R, R), 3);
      ellipse(c, 0, 0, R - 22, R - 22);
      c.fillStyle = '#2a0e18';
      c.fill();
      // Segments.
      WHEEL.forEach((s, i) => {
        segPath(c, i, n, SEG_IN, SEG_OUT);
        const col = FIELD_COLOR[s];
        const g = c.createRadialGradient(0, 0, SEG_IN, 0, 0, SEG_OUT);
        g.addColorStop(0, rgb(dark(col, 0.35)));
        g.addColorStop(0.7, rgb(col));
        g.addColorStop(1, rgb(light(col, 0.25)));
        c.fillStyle = s === 'bonus' ? gold(c, -SEG_OUT, -SEG_OUT, SEG_OUT, SEG_OUT) : g;
        c.fill();
        c.strokeStyle = 'rgba(20,8,14,0.9)';
        c.lineWidth = 1.6;
        c.stroke();
        // Label, reading outwards along the segment.
        const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
        c.save();
        c.rotate(a + Math.PI / 2);
        if (s === 'bonus') {
          sunMark(c, 0, -SEG_OUT + 26, 22, '#3a1606');
          c.font = '700 13px Cinzel, Georgia, serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = '#3a1606';
          c.save();
          c.translate(0, -SEG_OUT + 82);
          c.rotate(-Math.PI / 2);
          c.fillText('BONUS', 0, 0);
          c.restore();
        } else {
          const label = s.slice(1);
          c.font = `700 ${label.length > 1 ? 20 : 24}px Cinzel, Georgia, serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.lineWidth = 4;
          c.strokeStyle = 'rgba(16,6,12,0.85)';
          c.save();
          c.translate(0, -SEG_OUT + 30);
          if (label.length > 1) c.scale(0.78, 1);
          c.strokeText(label, 0, 0);
          c.fillStyle = '#fff6e6';
          c.fillText(label, 0, 0);
          c.restore();
          // Small pips towards the hub.
          c.fillStyle = 'rgba(255,246,230,0.55)';
          ellipse(c, 0, -SEG_OUT + 62, 2.4, 2.4);
          c.fill();
        }
        c.restore();
      });
      // Inner brass ring and hub.
      ellipse(c, 0, 0, SEG_IN, SEG_IN);
      fillInk(c, gold(c, -SEG_IN, -SEG_IN, SEG_IN, SEG_IN), 3);
      ellipse(c, 0, 0, SEG_IN - 12, SEG_IN - 12);
      const hg = c.createRadialGradient(-12, -16, 4, 0, 0, SEG_IN);
      hg.addColorStop(0, '#5a1a40');
      hg.addColorStop(1, '#1e0816');
      c.fillStyle = hg;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
      // Spokes of light on the hub.
      for (let k = 0; k < 12; k++) {
        c.save();
        c.rotate((k / 12) * Math.PI * 2);
        c.beginPath();
        c.moveTo(-3, -SEG_IN + 16);
        c.lineTo(3, -SEG_IN + 16);
        c.lineTo(0, -24);
        c.closePath();
        c.fillStyle = 'rgba(255,207,122,0.25)';
        c.fill();
        c.restore();
      }
      sunMark(c, 0, 2, 54, '#f0c868');
      // Pegs between the segments.
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = Math.cos(a) * PEG_R;
        const y = Math.sin(a) * PEG_R;
        ellipse(c, x, y, 4.2, 4.2);
        fillInk(c, gold(c, x - 4, y - 4, x + 4, y + 4), 1.4);
      }
      // Bulb sockets in the rim.
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
        const x = Math.cos(a) * BULB_R;
        const y = Math.sin(a) * BULB_R;
        ellipse(c, x, y, 6, 6);
        fillInk(c, '#fff1c4', 1.4);
      }
      // Gloss across the face.
      c.save();
      ellipse(c, 0, 0, R - 22, R - 22);
      c.clip();
      const gl = c.createLinearGradient(-R, -R, R * 0.2, R * 0.4);
      gl.addColorStop(0, 'rgba(255,255,255,0.14)');
      gl.addColorStop(0.5, 'rgba(255,255,255,0.03)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gl;
      c.fillRect(-R, -R, R * 2, R * 2);
      c.restore();
      ellipse(c, 0, 0, R, R);
      rim(c, 0.6, 2);
    }, 2),
  );
}

/** Soft white wedge for the winning segment (tint it, blend add). Points up, apex at the centre. */
export function wedgeTexture(n: number, r0: number, r1: number) {
  return cached(`wedge-${n}-${r0}-${r1}`, () =>
    paint(r1 * 2, r1 * 2, (c) => {
      c.translate(r1, r1);
      const half = Math.PI / n;
      c.beginPath();
      c.arc(0, 0, r1 - 1, -Math.PI / 2 - half, -Math.PI / 2 + half);
      c.arc(0, 0, r0, -Math.PI / 2 + half, -Math.PI / 2 - half, true);
      c.closePath();
      const g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
      g.addColorStop(0, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = 5;
      c.stroke();
    }, 1),
  );
}

/** The leather clicker on its brass mount; pivot at (0, 0), the tongue hangs down. */
export function clickerTexture() {
  return cached('clicker', () =>
    paint(60, 84, (c) => {
      c.translate(30, 20);
      // Tongue.
      c.beginPath();
      c.moveTo(-7, 0);
      c.lineTo(7, 0);
      c.lineTo(3, 52);
      c.quadraticCurveTo(0, 58, -3, 52);
      c.closePath();
      fillInk(c, vgrad(c, 0, 56, 0x8a2a1a, 0.3, 0.4), 2);
      // Mount.
      rrect(c, -22, -16, 44, 22, 8);
      fillInk(c, gold(c, -22, -16, 22, 6), 2.4);
      ellipse(c, 0, -5, 6, 6);
      fillInk(c, '#5a3010', 1.4);
      ellipse(c, -1.5, -6.5, 2, 2);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill();
    }, 3),
  );
}

// ---- Bonus wheel ---------------------------------------------------------------------------------------

export const BR = 120;
export const BONUS_TEX = BR * 2 + 16;

export function bonusWheelTexture() {
  return cached('bonusWheel', () =>
    paint(BONUS_TEX, BONUS_TEX, (c) => {
      c.translate(BONUS_TEX / 2, BONUS_TEX / 2);
      const n = BONUS_WHEEL.length;
      ellipse(c, 0, 0, BR, BR);
      fillInk(c, gold(c, -BR, -BR, BR, BR), 3);
      BONUS_WHEEL.forEach((f, i) => {
        segPath(c, i, n, 26, BR - 12);
        const col = FIELD_COLOR[f];
        c.fillStyle = vgrad(c, -BR, BR, col, 0.25, 0.3);
        const g = c.createRadialGradient(0, 0, 26, 0, 0, BR);
        g.addColorStop(0, rgb(dark(col, 0.3)));
        g.addColorStop(1, rgb(light(col, 0.2)));
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(20,8,14,0.9)';
        c.lineWidth = 2;
        c.stroke();
        const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
        c.save();
        c.rotate(a + Math.PI / 2);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = '700 14px Cinzel, Georgia, serif';
        c.fillStyle = 'rgba(255,246,230,0.8)';
        c.fillText(FIELD_LABEL[f], 0, -BR + 34);
        c.font = '700 24px Cinzel, Georgia, serif';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(16,6,12,0.85)';
        const t = `${BONUS_PAY[f]}`;
        c.strokeText(t, 0, -BR + 60);
        c.fillStyle = '#fff6e6';
        c.fillText(t, 0, -BR + 60);
        c.restore();
      });
      ellipse(c, 0, 0, 28, 28);
      fillInk(c, gold(c, -28, -28, 28, 28), 2.4);
      sunMark(c, 0, 1, 30, '#3a1606');
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        ellipse(c, Math.cos(a) * (BR - 6), Math.sin(a) * (BR - 6), 3.2, 3.2);
        fillInk(c, '#fff1c4', 1);
      }
    }, 2),
  );
}

// ---- Stage --------------------------------------------------------------------------------------------

export interface StageLayout {
  /** Wheel centre and drawn radius (scene pixels). */
  wx: number;
  wy: number;
  wr: number;
  floorY: number;
}

/** Velvet curtains, a plank stage with footlights and the wheel's brass stand. */
export function stageTexture(sw: number, sh: number, L: StageLayout, res = 2) {
  return paint(sw, sh, (c) => {
    // Backdrop: deep velvet with folds.
    const bg = c.createLinearGradient(0, 0, 0, sh);
    bg.addColorStop(0, '#1a0614');
    bg.addColorStop(1, '#3a0c22');
    c.fillStyle = bg;
    c.fillRect(0, 0, sw, sh);
    const folds = Math.max(6, Math.round(sw / 70));
    for (let i = 0; i < folds; i++) {
      const x = (i + 0.5) * (sw / folds);
      const g = c.createLinearGradient(x - sw / folds / 2, 0, x + sw / folds / 2, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(0.45, 'rgba(255,120,170,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g;
      c.fillRect(x - sw / folds / 2, 0, sw / folds, L.floorY);
    }
    grain(c, 0, 0, sw, L.floorY, Math.round(sw / 2), 13, 0.04);
    // Spotlight on the wheel.
    glowAt(c, L.wx, L.wy, L.wr * 1.5, L.wr * 1.4, 0xffd9a0, 0.28, 'lighter');
    // Valance with gold fringe.
    const vh = Math.min(34, sh * 0.07);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(sw, 0);
    c.lineTo(sw, vh);
    const sw2 = Math.max(4, Math.round(sw / 120));
    for (let i = sw2; i >= 0; i--) c.quadraticCurveTo(((i + 0.5) / sw2) * sw, vh * 1.9, (i / sw2) * sw, vh);
    c.closePath();
    fillInk(c, vgrad(c, 0, vh * 1.6, 0x7a1a3a, 0.2, 0.4), 2);
    c.strokeStyle = gold(c, 0, 0, sw, vh);
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < sw2; i++) {
      c.moveTo((i / sw2) * sw, vh);
      c.quadraticCurveTo(((i + 0.5) / sw2) * sw, vh * 1.9, ((i + 1) / sw2) * sw, vh);
    }
    c.stroke();
    // Side curtains, tied back.
    for (const side of [0, 1]) {
      const x0 = side ? sw : 0;
      const d = side ? -1 : 1;
      const cw = Math.min(70, sw * 0.08);
      c.beginPath();
      c.moveTo(x0, 0);
      c.lineTo(x0 + d * cw * 1.2, 0);
      c.quadraticCurveTo(x0 + d * cw * 0.4, L.floorY * 0.5, x0 + d * cw, L.floorY);
      c.lineTo(x0, L.floorY);
      c.closePath();
      fillInk(c, vgrad(c, 0, L.floorY, 0x8a1a44, 0.25, 0.5), 2);
      ellipse(c, x0 + d * cw * 0.5, L.floorY * 0.52, 6, 10);
      fillInk(c, gold(c, x0, L.floorY * 0.5 - 10, x0 + d * 12, L.floorY * 0.5 + 10), 1.4);
    }
    // Stand: brass column and a foot, behind the wheel.
    const colW = Math.max(14, L.wr * 0.11);
    rrect(c, L.wx - colW / 2, L.wy, colW, L.floorY - L.wy + 4, 4);
    fillInk(c, gold(c, L.wx - colW, L.wy, L.wx + colW, L.floorY), 2.2);
    ellipse(c, L.wx, L.floorY + 2, L.wr * 0.42, Math.max(8, L.wr * 0.09));
    fillInk(c, gold(c, L.wx - L.wr * 0.4, L.floorY - 8, L.wx + L.wr * 0.4, L.floorY + 10), 2.2);
    // Stage floor: planks, front edge and footlights.
    const fy = L.floorY;
    rrect(c, -4, fy, sw + 8, sh - fy + 4, 0);
    fillInk(c, vgrad(c, fy, sh, 0x7a4a26, 0.2, 0.45), 2);
    c.strokeStyle = 'rgba(40,20,8,0.55)';
    c.lineWidth = 1.2;
    for (let y = fy + 9; y < sh; y += 10 + (y - fy) * 0.12) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(sw, y);
      c.stroke();
    }
    c.fillStyle = gold(c, 0, fy - 2, sw, fy + 4);
    c.fillRect(0, fy - 2, sw, 4);
    shadow(c, L.wx, fy + 6, L.wr * 0.8, 10, 0.45);
    const n = Math.max(5, Math.round(sw / 90));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * sw;
      glowAt(c, x, fy + 2, 60, 30, 0xffcf7a, 0.22, 'lighter');
      rrect(c, x - 10, fy - 6, 20, 9, 4);
      fillInk(c, gold(c, x - 10, fy - 6, x + 10, fy + 3), 1.2);
    }
  }, res);
}

// ---- Bet plaque -----------------------------------------------------------------------------------------

/** A bet plaque in the field's colour (w×h, margin 8). */
export function plaqueTexture(f: Field, w: number, h: number) {
  return cached(`plaque-${f}-${w}-${h}`, () =>
    paint(w + 16, h + 16, (c) => {
      c.translate(8, 8);
      glowAt(c, w / 2, h / 2 + 6, w * 0.55, h * 0.6, 0x05020a, 0.55);
      rrect(c, 0, 0, w, h, 14);
      fillInk(c, gold(c, 0, 0, w * 0.5, h * 1.2), 2.6);
      rim(c, 0.6, 1.6);
      rrect(c, 5, 5, w - 10, h - 10, 10);
      const col = FIELD_COLOR[f];
      c.fillStyle = vgrad(c, 5, h - 5, col, 0.25, 0.45);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.stroke();
      c.save();
      rrect(c, 5, 5, w - 10, h - 10, 10);
      c.clip();
      glowAt(c, w / 2, 10, w * 0.6, h * 0.3, 0xffffff, 0.16, 'lighter');
      c.fillStyle = 'rgba(10,4,16,0.32)';
      c.fillRect(5, h * 0.62, w - 10, h);
      c.restore();
    }, 2),
  );
}

// ---- Station on the floor ---------------------------------------------------------------------------------

/** A little round stage with the big wheel standing on it, bulbs round its rim. */
function wheelStation(): PaintedStation {
  const W = 112;
  const H = 72;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 190, 230, 95, 150, (x) => {
    shadow(x, 0, 32, 74, 22, 0.6);
    // Stage: round platform with a velvet skirt.
    ellipse(x, 0, 16, 60, 24);
    fillInk(x, vgrad(x, 0, 40, 0x7a1a3a, 0.2, 0.5), 2.2);
    x.fillRect(-60, 2, 120, 14);
    ellipse(x, 0, 2, 60, 24);
    fillInk(x, vgrad(x, -22, 26, 0x8a5a2e, 0.3, 0.3), 2.2);
    x.strokeStyle = 'rgba(40,20,8,0.5)';
    x.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      x.beginPath();
      x.moveTo(-56, k * 8 + 2);
      x.lineTo(56, k * 8 + 2);
      x.stroke();
    }
    // Skirt scallops with gold fringe.
    x.strokeStyle = gold(x, -60, 16, 60, 30);
    x.lineWidth = 2;
    x.beginPath();
    for (let k = 0; k < 8; k++) {
      const a0 = -60 + k * 15;
      x.moveTo(a0, 16 + Math.sin((k / 8) * Math.PI) * 6);
      x.quadraticCurveTo(a0 + 7.5, 24 + Math.sin(((k + 0.5) / 8) * Math.PI) * 6, a0 + 15, 16 + Math.sin(((k + 1) / 8) * Math.PI) * 6);
    }
    x.stroke();
    // Footlights.
    for (const fx of [-40, -14, 14, 40]) {
      ellipse(x, fx, 18, 3, 2);
      x.fillStyle = '#fff1c4';
      x.fill();
    }
    // Stand.
    x.fillStyle = gold(x, -4, -60, 4, 0);
    rrect(x, -5, -64, 10, 66, 3);
    fillInk(x, gold(x, -5, -64, 5, 2), 1.6);
    ellipse(x, 0, 0, 20, 7);
    fillInk(x, gold(x, -20, -7, 20, 7), 1.6);
    // The wheel, seen nearly face-on.
    const wy = -92;
    const r = 44;
    ellipse(x, 0, wy, r, r);
    fillInk(x, gold(x, -r, wy - r, r, wy + r), 2.4);
    ellipse(x, 0, wy, r - 5, r - 5);
    x.fillStyle = '#2a0e18';
    x.fill();
    const cols = ['#3d6fc0', '#2f9a5a', '#3d6fc0', '#8a44c8', '#3d6fc0', '#2f9a5a', '#e0761f', '#3d6fc0', '#2f9a5a', '#d8243a', '#3d6fc0', '#e0b25a'];
    cols.forEach((col, i) => {
      const a0 = -Math.PI / 2 + (i / cols.length) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / cols.length;
      x.beginPath();
      x.moveTo(0, wy);
      x.arc(0, wy, r - 7, a0, a1);
      x.closePath();
      x.fillStyle = col;
      x.fill();
      x.strokeStyle = 'rgba(20,8,14,0.8)';
      x.lineWidth = 1;
      x.stroke();
    });
    ellipse(x, 0, wy, 11, 11);
    fillInk(x, gold(x, -11, wy - 11, 11, wy + 11), 1.6);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ellipse(x, Math.cos(a) * (r - 2.5), wy + Math.sin(a) * (r - 2.5), 1.8, 1.8);
      x.fillStyle = '#fff6d0';
      x.fill();
    }
    // Clicker on top.
    x.beginPath();
    x.moveTo(-3, wy - r - 6);
    x.lineTo(3, wy - r - 6);
    x.lineTo(0, wy - r + 8);
    x.closePath();
    fillInk(x, '#a8321e', 1.2);
    rrect(x, -8, wy - r - 12, 16, 8, 3);
    fillInk(x, gold(x, -8, wy - r - 12, 8, wy - r - 4), 1.2);
    // Gloss.
    x.save();
    ellipse(x, 0, wy, r - 6, r - 6);
    x.clip();
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.beginPath();
    x.moveTo(-r, wy - r);
    x.lineTo(0, wy - r);
    x.lineTo(-r, wy + 10);
    x.closePath();
    x.fill();
    x.restore();
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const g = new Sprite(glowTexture());
  g.anchor.set(0.5);
  g.position.set(W / 2, H / 2 - 92);
  g.width = g.height = 150;
  g.tint = 0xffcf7a;
  g.alpha = 0.5;
  g.blendMode = 'add';
  lamp.addChild(g);
  c.addChild(lamp);
  c.labelY = H / 2 - 150;
  return c;
}

registerPaintedStation('wheel', wheelStation);

export function drawWheelStation() {
  return wheelStation();
}
