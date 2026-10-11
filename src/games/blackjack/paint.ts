// Painted pieces of "Selene 21": the half-moon table in plum felt (wide and tall cut),
// the croupier with her faces, and the station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { dark, ellipse, fillInk, glowAt, gold, light, paint, propSprite, rgb, rrect, shadow, type Ctx } from '../../world/painted/brush';
import { velvetNap } from '../../core/ui';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

export const FELT = 0x3e1f5a;
const RAIL = 0x5a1a2e;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export interface TableGeo {
  w: number;
  h: number;
  /** Straight far edge (dealer side). */
  edgeY: number;
  /** Lowest point of the near arc (the rail's inner edge). */
  bottom: number;
  /** Player betting circle. */
  circle: { x: number; y: number; r: number };
  shoe: { x: number; y: number };
  /** Big rule line, then two small ones. */
  rules: string[];
  /** Centre line (lowest point) of the big rule arc. */
  rulesY: number;
  /** Small lines left and right of the player's cards (wide table) or one centred line. */
  splitRules: boolean;
}

/** Text written along an arc on the felt (centre cx, cy, radius r; centred on angle a). */
function arcText(c: Ctx, text: string, cx: number, cy: number, r: number, a: number, font: string, color: string) {
  c.save();
  c.font = font;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const widths = [...text].map((ch) => c.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0);
  let ang = a + total / r / 2;
  for (let i = 0; i < text.length; i++) {
    const w = widths[i];
    ang -= w / r / 2;
    c.save();
    c.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    c.rotate(ang - Math.PI / 2);
    c.fillText(text[i], 0, 0);
    c.restore();
    ang -= w / r / 2;
  }
  c.restore();
}

/** The table as one texture: rail, plum felt with printed rules, betting circle, card guides. */
export function tableTexture(g: TableGeo) {
  return cached(`bj-table-${g.w}x${g.h}`, () =>
    paint(g.w, g.h, (c) => {
      const cx = g.w / 2;
      const L = 24, Rr = g.w - 24;
      // Ellipse of the near arc: passes through the far corners and the bottom point.
      const ry = g.bottom - g.edgeY;
      const rx = (Rr - L) / 2;
      const shape = (grow: number) => {
        c.beginPath();
        c.moveTo(L - grow, g.edgeY - grow * 0.4);
        c.lineTo(Rr + grow, g.edgeY - grow * 0.4);
        c.ellipse(cx, g.edgeY, rx + grow, ry + grow, 0, 0, Math.PI);
        c.closePath();
      };
      // Shadow on the floor and the dark wooden skirt below the rail.
      shadow(c, cx, g.edgeY + ry * 0.75, rx * 1.05, ry * 0.7, 0.6);
      c.save();
      c.translate(0, 26);
      shape(34);
      c.restore();
      fillInk(c, '#2a1008', 3);
      // Padded leather rail.
      shape(34);
      const rg = c.createLinearGradient(0, g.edgeY, 0, g.bottom + 34);
      rg.addColorStop(0, rgb(light(RAIL, 0.2)));
      rg.addColorStop(0.7, rgb(RAIL));
      rg.addColorStop(1, rgb(dark(RAIL, 0.45)));
      fillInk(c, rg, 3);
      c.save();
      shape(34);
      c.clip();
      // Tufted buttons along the rail.
      for (let i = 1; i < 26; i++) {
        const a = (i / 26) * Math.PI;
        const x = cx + Math.cos(a) * (rx + 17);
        const y = g.edgeY + Math.sin(a) * (ry + 17);
        ellipse(c, x, y, 2.6, 2.2);
        c.fillStyle = 'rgba(20,6,10,0.6)';
        c.fill();
        ellipse(c, x - 0.6, y - 0.8, 1.2, 1);
        c.fillStyle = 'rgba(255,220,220,0.35)';
        c.fill();
      }
      c.restore();
      // Brass bead between rail and felt.
      shape(4);
      c.strokeStyle = gold(c, L, g.edgeY, Rr, g.bottom);
      c.lineWidth = 5;
      c.stroke();
      // Felt.
      shape(0);
      const fg = c.createRadialGradient(cx, g.edgeY + ry * 0.45, 20, cx, g.edgeY + ry * 0.5, rx * 1.1);
      fg.addColorStop(0, rgb(light(FELT, 0.18)));
      fg.addColorStop(0.6, rgb(FELT));
      fg.addColorStop(1, rgb(dark(FELT, 0.4)));
      c.fillStyle = fg;
      c.fill();
      c.save();
      shape(0);
      c.clip();
      velvetNap(c, L, g.edgeY, Rr - L, ry, 2101, 0.6, 0.045);
      glowAt(c, cx, g.edgeY + ry * 0.3, rx * 0.8, ry * 0.6, 0xffcf7a, 0.12, 'lighter');
      // Printed rules along gentle circular arcs between the dealer's and the player's cards.
      const ink = 'rgba(240,206,130,0.88)';
      const big = Math.round(Math.min(30, g.w * 0.05));
      const small = Math.round(big * 0.62);
      const Rb = g.w * 0.62;
      const ocx = cx;
      const ocy = g.rulesY - Rb;
      arcText(c, g.rules[0], ocx, ocy, Rb, Math.PI / 2, `700 ${big}px Cinzel, Georgia, serif`, ink);
      const sfont = `700 ${small}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const sink = 'rgba(240,220,180,0.72)';
      const Rs = Rb + big * 0.95;
      if (g.splitRules) {
        arcText(c, g.rules[1], ocx, ocy, Rs, Math.PI / 2 + 0.36, sfont, sink);
        arcText(c, g.rules[2], ocx, ocy, Rs, Math.PI / 2 - 0.36, sfont, sink);
      } else arcText(c, `${g.rules[1]} · ${g.rules[2]}`, ocx, ocy, Rs, Math.PI / 2, sfont, sink);
      c.strokeStyle = 'rgba(224,178,90,0.45)';
      c.lineWidth = 1.5;
      for (const r of [Rb - big * 0.75, Rs + small * 0.8]) {
        c.beginPath();
        c.arc(ocx, ocy, r, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
        c.stroke();
      }
      c.restore();
      // Betting circle.
      const { x: bx, y: by, r: br } = g.circle;
      ellipse(c, bx, by, br, br * 0.8);
      c.strokeStyle = 'rgba(240,206,130,0.85)';
      c.lineWidth = 3;
      c.stroke();
      ellipse(c, bx, by, br - 7, br * 0.8 - 6);
      c.strokeStyle = 'rgba(240,206,130,0.35)';
      c.lineWidth = 1.5;
      c.stroke();
      // Dealer's chip rack at the far edge.
      const rw = Math.min(300, g.w * 0.34);
      rrect(c, cx - rw / 2, g.edgeY - 4, rw, 26, 6);
      fillInk(c, gold(c, cx - rw / 2, g.edgeY - 4, cx + rw / 2, g.edgeY + 22), 2);
      const cols = ['#2f6fd6', '#e0761f', '#1b1b22', '#1d8a5c', '#7b3fc4', '#c8243a'];
      const n = Math.floor((rw - 16) / 15);
      for (let i = 0; i < n; i++) {
        rrect(c, cx - rw / 2 + 8 + i * 15, g.edgeY + 1, 12, 15, 4);
        c.fillStyle = cols[Math.floor(i / 2) % cols.length];
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1;
        c.stroke();
      }
    }, 1.5),
  );
}

// ---- The croupier ----------------------------------------------------------------------------------

export type Face = 'neutral' | 'happy' | 'smug' | 'oh' | 'blink' | 'sad';
export const DEALER_W = 300;
export const DEALER_H = 230;
/** Neck point in the body texture; heads are painted around it. */
const NECK = { x: DEALER_W / 2, y: 118 };

/** Shoulders, waistcoat and arms resting on the table edge (the bottom of the texture). */
export function dealerBodyTexture() {
  return cached('bj-dealer-body', () =>
    paint(DEALER_W, DEALER_H, (c) => {
      const cx = DEALER_W / 2;
      // A fan of light rays behind her (the house sunburst), brass and night blue, softly lit.
      for (let i = 0; i < 15; i++) {
        const a0 = Math.PI + (i / 15) * Math.PI;
        const a1 = Math.PI + ((i + 1) / 15) * Math.PI;
        const R = i % 2 ? 128 : 146;
        c.beginPath();
        c.moveTo(cx + Math.cos(a0) * 34, 150 + Math.sin(a0) * 34);
        c.lineTo(cx + Math.cos(a0) * R, 150 + Math.sin(a0) * R);
        c.lineTo(cx + Math.cos(a1) * R, 150 + Math.sin(a1) * R);
        c.lineTo(cx + Math.cos(a1) * 34, 150 + Math.sin(a1) * 34);
        c.closePath();
        const g = c.createLinearGradient(cx, 150, cx + Math.cos((a0 + a1) / 2) * R, 150 + Math.sin((a0 + a1) / 2) * R);
        if (i % 2) {
          g.addColorStop(0, 'rgba(42,58,122,0.95)');
          g.addColorStop(1, 'rgba(20,28,64,0.95)');
        } else {
          g.addColorStop(0, 'rgba(255,236,170,0.95)');
          g.addColorStop(1, 'rgba(176,122,42,0.95)');
        }
        fillInk(c, g, 2);
      }
      glowAt(c, cx, 110, 120, 70, 0xffcf7a, 0.25, 'lighter');
      // Torso: white shirt, plum velvet waistcoat, gold bow tie.
      c.beginPath();
      c.moveTo(cx - 82, DEALER_H);
      c.quadraticCurveTo(cx - 84, 140, cx - 34, 128);
      c.lineTo(cx + 34, 128);
      c.quadraticCurveTo(cx + 84, 140, cx + 82, DEALER_H);
      c.closePath();
      fillInk(c, vgrad2(c, 128, DEALER_H, 0xf6efe4), 2.4);
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + side * 80, DEALER_H);
        c.quadraticCurveTo(cx + side * 82, 146, cx + side * 36, 130);
        c.lineTo(cx + side * 10, 170);
        c.lineTo(cx + side * 16, DEALER_H);
        c.closePath();
        fillInk(c, vgrad2(c, 128, DEALER_H, 0x4a1a5a), 2);
        c.save();
        c.clip();
        velvetNap(c, cx - 90, 128, 180, 110, side > 0 ? 7 : 8, 1.4, 0.06);
        c.restore();
      }
      for (let i = 0; i < 3; i++) {
        ellipse(c, cx + 18, 184 + i * 14, 2.6, 2.6);
        fillInk(c, gold(c, cx + 15, 181 + i * 14, cx + 21, 187 + i * 14), 1);
      }
      // Bow tie.
      c.beginPath();
      c.moveTo(cx, 136);
      c.lineTo(cx - 16, 128);
      c.lineTo(cx - 16, 146);
      c.closePath();
      c.moveTo(cx, 136);
      c.lineTo(cx + 16, 128);
      c.lineTo(cx + 16, 146);
      c.closePath();
      fillInk(c, gold(c, cx - 16, 128, cx + 16, 146), 1.6);
      ellipse(c, cx, 137, 4, 4);
      fillInk(c, '#c8901a', 1.2);
      // Neck.
      rrect(c, cx - 11, NECK.y - 8, 22, 20, 6);
      fillInk(c, '#ecd2b4', 1.6);
      // Arms resting forward, hands on the felt.
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + side * 78, 150);
        c.quadraticCurveTo(cx + side * 100, 200, cx + side * 70, DEALER_H - 4);
        c.lineTo(cx + side * 44, DEALER_H - 4);
        c.quadraticCurveTo(cx + side * 66, 196, cx + side * 60, 158);
        c.closePath();
        fillInk(c, vgrad2(c, 150, DEALER_H, 0x3a1448), 2);
        ellipse(c, cx + side * 56, DEALER_H - 8, 15, 9);
        fillInk(c, '#ecd2b4', 1.8);
        // White cuff.
        rrect(c, cx + side * 57 - 14, DEALER_H - 20, 28, 7, 3);
        fillInk(c, '#f6efe4', 1.2);
      }
    }, 2),
  );
}

function vgrad2(c: Ctx, y0: number, y1: number, col: number) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(light(col, 0.25)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.35)));
  return g;
}

export const HEAD_W = 150;
export const HEAD_H = 150;
/** Neck point inside the head texture. */
export const HEAD_NECK = { x: 75, y: 128 };

/** Her head with one of the faces; anchor it at HEAD_NECK on the body's neck. */
export function dealerHeadTexture(face: Face) {
  return cached(`bj-head-${face}`, () =>
    paint(HEAD_W, HEAD_H, (c) => {
      const cx = 75, cy = 78;
      // Bob of dark violet hair behind the face.
      c.beginPath();
      c.moveTo(cx - 40, cy + 26);
      c.bezierCurveTo(cx - 52, cy - 30, cx - 20, cy - 50, cx, cy - 48);
      c.bezierCurveTo(cx + 20, cy - 50, cx + 52, cy - 30, cx + 40, cy + 26);
      c.quadraticCurveTo(cx, cy + 34, cx - 40, cy + 26);
      fillInk(c, vgrad2(c, cy - 50, cy + 30, 0x2a1440), 2.4);
      // Face.
      ellipse(c, cx, cy + 4, 31, 35);
      const fg = c.createRadialGradient(cx - 10, cy - 8, 4, cx, cy + 4, 40);
      fg.addColorStop(0, '#fbe8d4');
      fg.addColorStop(1, '#e2bf9c');
      fillInk(c, fg, 2.2);
      // Fringe.
      c.beginPath();
      c.moveTo(cx - 33, cy - 4);
      c.bezierCurveTo(cx - 30, cy - 40, cx + 20, cy - 46, cx + 34, cy - 10);
      c.quadraticCurveTo(cx + 8, cy - 22, cx - 33, cy - 4);
      fillInk(c, vgrad2(c, cy - 46, cy, 0x341a50), 2);
      // Blush.
      for (const side of [-1, 1]) {
        glowAt(c, cx + side * 18, cy + 14, 9, 6, 0xff8a9a, 0.45);
      }
      const eye = (x: number, y: number, kind: Face) => {
        c.strokeStyle = '#1a0f20';
        c.lineWidth = 3;
        if (kind === 'blink') {
          c.beginPath();
          c.moveTo(x - 7, y + 1);
          c.quadraticCurveTo(x, y + 5, x + 7, y + 1);
          c.stroke();
          return;
        }
        if (kind === 'happy') {
          c.beginPath();
          c.moveTo(x - 7, y + 3);
          c.quadraticCurveTo(x, y - 6, x + 7, y + 3);
          c.stroke();
          return;
        }
        const ry = kind === 'oh' ? 9 : kind === 'smug' ? 4.5 : 7.5;
        const rx = kind === 'oh' ? 7.5 : 6.5;
        ellipse(c, x, y, rx, ry);
        c.fillStyle = '#1a0f20';
        c.fill();
        ellipse(c, x - 2, y - ry * 0.4, 2.2, 2.2);
        c.fillStyle = '#ffffff';
        c.fill();
        ellipse(c, x + 2.5, y + ry * 0.4, 1, 1);
        c.fill();
        if (kind === 'smug' || kind === 'sad') {
          // Heavy upper lid.
          c.beginPath();
          c.moveTo(x - 8, y - (kind === 'sad' ? 3 : 1));
          c.lineTo(x + 8, y - (kind === 'sad' ? 6 : 1));
          c.strokeStyle = '#2a1440';
          c.lineWidth = 3.4;
          c.stroke();
        }
      };
      for (const side of [-1, 1]) eye(cx + side * 13, cy + 2, face);
      // Brows.
      c.strokeStyle = '#2a1440';
      c.lineWidth = 2.4;
      for (const side of [-1, 1]) {
        const lift = face === 'oh' ? -6 : face === 'smug' && side > 0 ? -5 : face === 'sad' ? (side > 0 ? -2 : -2) : 0;
        const tilt = face === 'sad' ? side * 3 : face === 'smug' && side < 0 ? 2 : 0;
        c.beginPath();
        c.moveTo(cx + side * 7, cy - 10 + lift - tilt);
        c.lineTo(cx + side * 19, cy - 12 + lift + tilt);
        c.stroke();
      }
      // Mouth.
      c.strokeStyle = '#7a2a3a';
      c.lineWidth = 2.6;
      const my = cy + 22;
      c.beginPath();
      if (face === 'happy') {
        c.moveTo(cx - 10, my - 2);
        c.quadraticCurveTo(cx, my + 10, cx + 10, my - 2);
        c.closePath();
        c.fillStyle = '#7a2a3a';
        c.fill();
      } else if (face === 'oh') {
        ellipse(c, cx, my + 2, 5, 6);
        c.fillStyle = '#5a1a2a';
        c.fill();
      } else if (face === 'smug') {
        c.moveTo(cx - 8, my + 1);
        c.quadraticCurveTo(cx + 2, my + 4, cx + 10, my - 3);
        c.stroke();
      } else if (face === 'sad') {
        c.moveTo(cx - 7, my + 4);
        c.quadraticCurveTo(cx, my - 2, cx + 7, my + 4);
        c.stroke();
      } else {
        c.moveTo(cx - 7, my);
        c.quadraticCurveTo(cx, my + 5, cx + 7, my);
        c.stroke();
      }
      // A little gilt sun hair pin.
      ellipse(c, cx + 26, cy - 30, 7, 5);
      fillInk(c, gold(c, cx + 19, cy - 35, cx + 33, cy - 25), 1.2);
    }, 2),
  );
}

export const DEALER_NECK = NECK;

// ---- Station on the casino floor ------------------------------------------------------------------

function stool(c: Ctx, x: number, y: number) {
  shadow(c, x, y + 4, 15, 6, 0.45);
  c.fillStyle = gold(c, x - 2, y - 10, x + 2, y);
  c.fillRect(x - 2, y - 12, 4, 14);
  ellipse(c, x, y - 14, 11, 5.5);
  fillInk(c, vgrad2(c, y - 20, y - 8, 0x3a1a3a), 1.6);
}

export function station(): PaintedStation {
  const W = 140;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 200, 190, 100, 110, (x) => {
    shadow(x, 0, 24, 82, 28, 0.6);
    // Stools around the curve.
    for (const [sx, sy] of [[-52, 46], [-18, 62], [18, 62], [52, 46]] as const) stool(x, sx, sy);
    // A pendant lamp with a brass shade hangs over the table.
    x.strokeStyle = gold(x, -1, -110, 1, -80);
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(0, -110);
    x.lineTo(0, -88);
    x.stroke();
    x.beginPath();
    x.moveTo(-16, -78);
    x.quadraticCurveTo(0, -100, 16, -78);
    x.closePath();
    fillInk(x, gold(x, -16, -100, 16, -78), 1.6);
    glowAt(x, 0, -74, 26, 12, 0xffd8a0, 0.7, 'lighter');
    // Half-moon slab: skirt, rail, plum felt.
    const top = (grow: number, dy: number) => {
      x.beginPath();
      x.moveTo(-66 - grow, -20 + dy);
      x.lineTo(66 + grow, -20 + dy);
      x.ellipse(0, -20 + dy, 66 + grow, 42 + grow, 0, 0, Math.PI);
      x.closePath();
    };
    top(6, 8);
    fillInk(x, '#2a1008', 2);
    top(6, 0);
    fillInk(x, vgrad2(x, -20, 28, RAIL), 2);
    top(0, 0);
    const fg = x.createRadialGradient(0, -6, 4, 0, -4, 66);
    fg.addColorStop(0, rgb(light(FELT, 0.25)));
    fg.addColorStop(1, rgb(dark(FELT, 0.3)));
    x.fillStyle = fg;
    x.fill();
    x.strokeStyle = 'rgba(224,178,90,0.85)';
    x.lineWidth = 1.5;
    x.stroke();
    // Printed arc and betting spots.
    x.strokeStyle = 'rgba(240,206,130,0.55)';
    x.lineWidth = 1;
    x.beginPath();
    x.ellipse(0, -20, 40, 26, 0, Math.PI * 0.15, Math.PI * 0.85);
    x.stroke();
    for (const [bx, by] of [[-36, 4], [0, 12], [36, 4]] as const) {
      ellipse(x, bx, by, 6, 4);
      x.stroke();
    }
    // Cards: dealer's two, a player's hand.
    const card = (cx: number, cy: number, r: number, face: boolean) => {
      x.save();
      x.translate(cx, cy);
      x.rotate(r);
      rrect(x, -5, -7, 10, 14, 2);
      fillInk(x, face ? '#fbf1dc' : '#2a1446', 1);
      if (face) {
        ellipse(x, 0, 0, 2, 2);
        x.fillStyle = '#b81f45';
        x.fill();
      }
      x.restore();
    };
    card(-6, -10, -0.05, true);
    card(6, -10, 0.05, false);
    card(-3, 6, 0.1, true);
    card(4, 7, 0.2, true);
    // Shoe and chip rack.
    rrect(x, 40, -24, 16, 10, 2);
    fillInk(x, '#5a2a14', 1.2);
    rrect(x, -20, -22, 26, 6, 2);
    fillInk(x, gold(x, -20, -22, 6, -16), 1);
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H / 2 - 66);
  glow.width = 140;
  glow.height = 90;
  glow.tint = 0xffc890;
  glow.alpha = 0.5;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H / 2 - 100;
  return c;
}

registerPaintedStation('blackjack', station);

