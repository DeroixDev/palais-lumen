// The painted house deck shared by the card tables (Blackjack, Baccarat, Kartenleiter):
// 52 faces in four night suits (Mond ♥, Laterne ♦, Stern ♠, Schlüssel ♣), a sunburst back,
// the dealing shoe and a card view that flips with real 3/4 perspective. Every texture is
// painted once with Canvas 2D and cached; the flip only moves the four corners of a mesh.

import { Container, Graphics, PerspectiveMesh, Sprite, type Texture } from 'pixi.js';
import { reducedMotion } from '../../core/fx';
import { animate, ease } from '../../core/tween';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, rgb, rim, rrect, seeded, shadow, type Ctx } from '../../world/painted/brush';
import { isRedSuit, type Card, type Suit } from './cards';

export const CARD_W = 120;
export const CARD_H = 168;
const R = 11;

const RED = 0xb81f45;
const NIGHT = 0x221a3c;
const PAPER = 0xfbf1dc;
const suitInk = (s: Suit) => (isRedSuit(s) ? RED : NIGHT);

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

// ---- Suit icons ------------------------------------------------------------------------------------

/** Each suit painted once on a 128×128 canvas (centred, about 100 tall), stamped onto the cards. */
const iconCanvas = new Map<Suit, HTMLCanvasElement>();
function suitIcon(s: Suit) {
  let cv = iconCanvas.get(s);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.translate(64, 64);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const col = suitInk(s);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgb(light(col, 0.32)));
    g.addColorStop(0.55, rgb(col));
    g.addColorStop(1, rgb(dark(col, 0.35)));
    return g;
  };
  if (s === 0) {
    // Mond: a fat crescent opening to the upper right (the bite is cut out of the disc).
    c.beginPath();
    c.arc(0, 0, 48, 0, Math.PI * 2);
    c.fillStyle = fill(-48, -48, 48, 48);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = 'rgba(255,240,230,0.55)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 43, Math.PI * 0.7, Math.PI * 1.2);
    c.stroke();
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(22, -16, 42, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // Ink along the inner edge of the bite.
    c.save();
    c.beginPath();
    c.arc(0, 0, 48, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(22, -16, 43, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  } else if (s === 1) {
    // Laterne: ring, cap, glowing diamond glass, foot.
    c.beginPath();
    c.arc(0, -46, 8, 0, Math.PI * 2);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = rgb(dark(col, 0.2));
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    c.moveTo(-18, -26);
    c.lineTo(-10, -38);
    c.lineTo(10, -38);
    c.lineTo(18, -26);
    c.closePath();
    fillInk(c, fill(-18, -38, 18, -26), 3);
    c.beginPath();
    c.moveTo(0, -28);
    c.lineTo(34, 8);
    c.lineTo(0, 44);
    c.lineTo(-34, 8);
    c.closePath();
    fillInk(c, fill(-34, -28, 34, 44), 3);
    const gl = c.createRadialGradient(-4, 4, 2, 0, 8, 26);
    gl.addColorStop(0, 'rgba(255,246,214,0.95)');
    gl.addColorStop(0.5, 'rgba(255,190,150,0.45)');
    gl.addColorStop(1, 'rgba(255,190,150,0)');
    c.save();
    c.clip();
    c.fillStyle = gl;
    c.fillRect(-34, -28, 68, 72);
    c.strokeStyle = 'rgba(30,8,16,0.55)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(0, -28);
    c.lineTo(0, 44);
    c.moveTo(-34, 8);
    c.lineTo(34, 8);
    c.stroke();
    c.restore();
    rrect(c, -14, 42, 28, 9, 3);
    fillInk(c, fill(-14, 42, 14, 51), 3);
  } else if (s === 2) {
    // Stern: a deco star, four long points and four short, with a facet line on each point.
    const pts: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 4 === 0 ? 54 : i % 2 === 0 ? 30 : 15;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    fillInk(c, fill(-54, -54, 54, 54), 3);
    c.strokeStyle = rgb(dark(col, 0.45), 0.6);
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 16; i += 2) {
      c.moveTo(0, 0);
      c.lineTo(pts[i][0] * 0.82, pts[i][1] * 0.82);
    }
    c.stroke();
    ellipse(c, 0, 0, 9, 9);
    fillInk(c, 'rgba(255,240,220,0.85)', 2.2);
  } else {
    // Schlüssel: round bow with a moon hole, shaft and bit.
    c.beginPath();
    c.arc(0, -26, 24, 0, Math.PI * 2);
    c.moveTo(11, -26);
    c.arc(0, -26, 11, 0, Math.PI * 2, true);
    c.fillStyle = fill(-24, -50, 24, -2);
    c.fill('evenodd');
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.stroke();
    rrect(c, -6, -4, 12, 54, 4);
    fillInk(c, fill(-6, -4, 6, 50), 3);
    c.beginPath();
    c.moveTo(6, 24);
    c.lineTo(24, 24);
    c.lineTo(24, 32);
    c.lineTo(16, 32);
    c.lineTo(16, 38);
    c.lineTo(24, 38);
    c.lineTo(24, 48);
    c.lineTo(6, 48);
    c.closePath();
    fillInk(c, fill(6, 24, 24, 48), 3);
    c.strokeStyle = 'rgba(255,240,230,0.5)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, -26, 19, Math.PI * 0.95, Math.PI * 1.45);
    c.stroke();
  }
  iconCanvas.set(s, cv);
  return cv;
}

/** Stamps a suit icon `size` tall at (x, y); `down` turns it upside down (bottom half of a card). */
function stamp(c: Ctx, s: Suit, x: number, y: number, size: number, down = false) {
  const k = size / 104;
  c.save();
  c.translate(x, y);
  if (down) c.rotate(Math.PI);
  c.drawImage(suitIcon(s), -64 * k, -64 * k, 128 * k, 128 * k);
  c.restore();
}

/** A suit icon as its own small texture (for labels and buttons). */
export function suitTexture(s: Suit, size = 40) {
  return cached(`suit-${s}-${size}`, () => paint(size, size, (c) => stamp(c, s, size / 2, size / 2, size * 0.86), 3));
}

// ---- Faces --------------------------------------------------------------------------------------

const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];

/** Pip positions (in a 0..1 box) for 2..10, classic layout. */
const PIPS: Record<number, [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

function paper(c: Ctx) {
  // Soft shadow is a separate sprite; the card itself is paper with a gilt edge line.
  rrect(c, 1, 1, CARD_W - 2, CARD_H - 2, R);
  const g = c.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  g.addColorStop(0, rgb(light(PAPER, 0.5)));
  g.addColorStop(0.6, rgb(PAPER));
  g.addColorStop(1, rgb(dark(PAPER, 0.08)));
  fillInk(c, g, 2);
  c.save();
  rrect(c, 1, 1, CARD_W - 2, CARD_H - 2, R);
  c.clip();
  grain(c, 2, 2, CARD_W - 4, CARD_H - 4, 70, 31, 0.035);
  c.restore();
  rrect(c, 5, 5, CARD_W - 10, CARD_H - 10, R - 4);
  c.strokeStyle = 'rgba(176,122,42,0.55)';
  c.lineWidth = 1.2;
  c.stroke();
}

function corner(c: Ctx, card: Card) {
  const col = rgb(dark(suitInk(card.suit), 0.1));
  const text = RANK_TEXT[card.rank];
  for (const down of [false, true]) {
    c.save();
    if (down) {
      c.translate(CARD_W, CARD_H);
      c.rotate(Math.PI);
    }
    c.fillStyle = col;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.font = `700 ${text.length > 1 ? 26 : 32}px Cinzel, Georgia, serif`;
    if (text.length > 1) {
      c.save();
      c.translate(19, 36);
      c.scale(0.72, 1);
      c.fillText(text, 0, 0);
      c.restore();
    } else c.fillText(text, 19, 36);
    stamp(c, card.suit, 19, 52, 20);
    c.restore();
  }
}

function numberFace(c: Ctx, card: Card) {
  const pts = PIPS[card.rank];
  const x0 = 47, x1 = 73, y0 = 33, y1 = 135;
  const size = card.rank >= 9 ? 22 : 26;
  for (const [px, py] of pts) {
    const x = x0 + (x1 - x0) * px;
    const y = y0 + (y1 - y0) * py;
    stamp(c, card.suit, x, y, size, py > 0.5);
  }
}

function aceFace(c: Ctx, card: Card) {
  const cx = CARD_W / 2, cy = CARD_H / 2;
  glowAt(c, cx, cy, 52, 52, isRedSuit(card.suit) ? 0xffb0a0 : 0xb8a8ff, 0.35);
  // Gilt rosette behind the big emblem.
  c.save();
  c.translate(cx, cy);
  for (let i = 0; i < 16; i++) {
    c.rotate(Math.PI / 8);
    c.beginPath();
    c.moveTo(-4, 26);
    c.lineTo(0, 44);
    c.lineTo(4, 26);
    c.closePath();
    c.fillStyle = 'rgba(200,146,58,0.55)';
    c.fill();
  }
  c.restore();
  ellipse(c, cx, cy, 30, 30);
  c.strokeStyle = gold(c, cx - 30, cy - 30, cx + 30, cy + 30);
  c.lineWidth = 3;
  c.stroke();
  stamp(c, card.suit, cx, cy, 52);
}

/** Half of a court card: a bust before a fan of light, in the suit's colours (painted once per rank/suit). */
function courtBust(c: Ctx, rank: number, s: Suit, w: number, h: number) {
  const ink = suitInk(s);
  const robe = isRedSuit(s) ? 0x9a1838 : 0x2a2a6a;
  const wing = isRedSuit(s) ? 0xe89a5a : 0x9a8ae0;
  const cx = w / 2;
  // A fan of light rays behind the head and shoulders (the house's art-deco sunburst).
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + ((i + 0.5) / 13) * Math.PI;
    const len = (i % 2 ? 0.42 : 0.5) * w;
    c.beginPath();
    c.moveTo(cx + Math.cos(a - 0.07) * 14, h * 0.5 + Math.sin(a - 0.07) * 14);
    c.lineTo(cx + Math.cos(a) * len, h * 0.5 + Math.sin(a) * len);
    c.lineTo(cx + Math.cos(a + 0.07) * 14, h * 0.5 + Math.sin(a + 0.07) * 14);
    c.closePath();
    c.fillStyle = i % 2 ? rgb(wing, 0.85) : rgb(light(wing, 0.35));
    c.fill();
    c.strokeStyle = rgb(dark(ink, 0.1), 0.6);
    c.lineWidth = 0.9;
    c.stroke();
  }
  // Robe / shoulders.
  c.beginPath();
  c.moveTo(cx - w * 0.36, h + 2);
  c.quadraticCurveTo(cx - w * 0.34, h * 0.66, cx, h * 0.64);
  c.quadraticCurveTo(cx + w * 0.34, h * 0.66, cx + w * 0.36, h + 2);
  c.closePath();
  fillInk(c, vgrad(c, h * 0.62, h, robe, 0.3, 0.3), 1.4);
  // Collar: gold V.
  c.beginPath();
  c.moveTo(cx - 10, h * 0.66);
  c.lineTo(cx, h * 0.86);
  c.lineTo(cx + 10, h * 0.66);
  c.strokeStyle = gold(c, cx - 10, h * 0.6, cx + 10, h * 0.9);
  c.lineWidth = 3;
  c.stroke();
  // Head.
  ellipse(c, cx, h * 0.45, 11, 12.5);
  fillInk(c, vgrad(c, h * 0.3, h * 0.6, 0xf3dcc0, 0.3, 0.2), 1.4);
  // Eyes and mouth.
  for (const side of [-1, 1]) {
    ellipse(c, cx + side * 4, h * 0.44, 1.5, 1.9);
    c.fillStyle = '#1a0f20';
    c.fill();
  }
  ellipse(c, cx, h * 0.53, 2.6, 1.2);
  c.fillStyle = 'rgba(160,60,70,0.7)';
  c.fill();
  if (rank === 13) {
    // König: spiked crown and a white beard.
    c.beginPath();
    c.moveTo(cx - 11, h * 0.36);
    c.lineTo(cx - 12, h * 0.22);
    c.lineTo(cx - 6, h * 0.29);
    c.lineTo(cx, h * 0.17);
    c.lineTo(cx + 6, h * 0.29);
    c.lineTo(cx + 12, h * 0.22);
    c.lineTo(cx + 11, h * 0.36);
    c.closePath();
    fillInk(c, gold(c, cx - 12, h * 0.17, cx + 12, h * 0.36), 1.3);
    c.beginPath();
    c.moveTo(cx - 9, h * 0.52);
    c.quadraticCurveTo(cx, h * 0.78, cx + 9, h * 0.52);
    c.quadraticCurveTo(cx, h * 0.6, cx - 9, h * 0.52);
    fillInk(c, '#f6efe4', 1.1);
  } else if (rank === 12) {
    // Dame: tiara with a little moon, long hair.
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * 10, h * 0.4);
      c.quadraticCurveTo(cx + side * 16, h * 0.62, cx + side * 9, h * 0.72);
      c.lineTo(cx + side * 6, h * 0.5);
      c.closePath();
      fillInk(c, rgb(dark(robe, 0.4)), 1.1);
    }
    c.beginPath();
    c.moveTo(cx - 10, h * 0.36);
    c.quadraticCurveTo(cx, h * 0.24, cx + 10, h * 0.36);
    c.strokeStyle = gold(c, cx - 10, h * 0.24, cx + 10, h * 0.36);
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, cx, h * 0.26, 3.4, 3.4);
    fillInk(c, '#fff4d0', 1);
  } else {
    // Bube: a tilted cap with a feather.
    c.beginPath();
    c.moveTo(cx - 13, h * 0.37);
    c.quadraticCurveTo(cx - 2, h * 0.18, cx + 13, h * 0.33);
    c.closePath();
    fillInk(c, vgrad(c, h * 0.18, h * 0.37, robe, 0.3, 0.2), 1.3);
    c.beginPath();
    c.moveTo(cx + 8, h * 0.3);
    c.quadraticCurveTo(cx + 22, h * 0.12, cx + 24, h * 0.04);
    c.strokeStyle = rgb(light(wing, 0.3));
    c.lineWidth = 3;
    c.stroke();
  }
}

function courtFace(c: Ctx, card: Card) {
  const fx = 28, fy = 18, fw = CARD_W - 56, fh = CARD_H - 36;
  const velvet = isRedSuit(card.suit) ? 0xf6dccc : 0xe0dcf2;
  rrect(c, fx, fy, fw, fh, 6);
  fillInk(c, vgrad(c, fy, fy + fh, velvet, 0.2, 0.15), 1.6);
  // Paint one half on a scratch canvas and stamp it twice (the classic double-headed card).
  const half = document.createElement('canvas');
  const hw = fw - 4, hh = fh / 2 - 2;
  half.width = hw * 3;
  half.height = hh * 3;
  const hc = half.getContext('2d')!;
  hc.scale(3, 3);
  hc.lineJoin = 'round';
  hc.lineCap = 'round';
  courtBust(hc, card.rank, card.suit, hw, hh);
  c.save();
  rrect(c, fx, fy, fw, fh, 6);
  c.clip();
  c.drawImage(half, fx + 2, fy + 2, hw, hh);
  c.translate(fx + fw - 2, fy + fh - 2);
  c.rotate(Math.PI);
  c.drawImage(half, 0, 0, hw, hh);
  c.restore();
  c.strokeStyle = 'rgba(176,122,42,0.8)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(fx + 4, fy + fh / 2);
  c.lineTo(fx + fw - 4, fy + fh / 2);
  c.stroke();
  // Suit stamps in the panel corners.
  stamp(c, card.suit, fx + 11, fy + 12, 15);
  stamp(c, card.suit, fx + fw - 11, fy + fh - 12, 15, true);
  rrect(c, fx, fy, fw, fh, 6);
  c.strokeStyle = gold(c, fx, fy, fx + fw, fy + fh);
  c.lineWidth = 2;
  c.stroke();
}

function vgrad(c: Ctx, y0: number, y1: number, col: number, top = 0.25, bottom = 0.35) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(light(col, top)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, bottom)));
  return g;
}

/** The painted face of a card (cached; first use paints it). */
export function cardTexture(card: Card) {
  return cached(`card-${card.rank}-${card.suit}`, () =>
    paint(CARD_W, CARD_H, (c) => {
      paper(c);
      if (card.rank === 1) aceFace(c, card);
      else if (card.rank >= 11) courtFace(c, card);
      else numberFace(c, card);
      corner(c, card);
    }, 2),
  );
}

/** The house back: night-blue velvet, two gilt sunbursts round a silver crescent, starry lattice. */
export function backTexture() {
  return cached('card-back', () =>
    paint(CARD_W, CARD_H, (c) => {
      rrect(c, 1, 1, CARD_W - 2, CARD_H - 2, R);
      fillInk(c, '#f3e6c8', 2);
      rrect(c, 6, 6, CARD_W - 12, CARD_H - 12, R - 4);
      const g = c.createRadialGradient(CARD_W / 2, CARD_H / 2, 8, CARD_W / 2, CARD_H / 2, CARD_H * 0.6);
      g.addColorStop(0, '#2a3a7a');
      g.addColorStop(0.6, '#1a2458');
      g.addColorStop(1, '#0a0e24');
      c.fillStyle = g;
      c.fill();
      c.save();
      rrect(c, 6, 6, CARD_W - 12, CARD_H - 12, R - 4);
      c.clip();
      // Diamond lattice.
      c.strokeStyle = 'rgba(224,178,90,0.16)';
      c.lineWidth = 1;
      for (let k = -CARD_H; k < CARD_W + CARD_H; k += 12) {
        c.beginPath();
        c.moveTo(k, 0);
        c.lineTo(k + CARD_H, CARD_H);
        c.moveTo(k, CARD_H);
        c.lineTo(k + CARD_H, 0);
        c.stroke();
      }
      const r = seeded(9);
      for (let i = 0; i < 26; i++) {
        const x = 8 + r() * (CARD_W - 16);
        const y = 8 + r() * (CARD_H - 16);
        ellipse(c, x, y, 0.8 + r(), 0.8 + r());
        c.fillStyle = `rgba(255,240,210,${0.35 + r() * 0.4})`;
        c.fill();
      }
      glowAt(c, CARD_W / 2, CARD_H / 2, 54, 54, 0xffcf7a, 0.22, 'lighter');
      c.restore();
      // Two gilt sunbursts, mirrored top and bottom, rising from a brass bar; the crescent between.
      const cx = CARD_W / 2, cy = CARD_H / 2;
      for (const down of [false, true]) {
        c.save();
        c.translate(cx, cy);
        if (down) c.rotate(Math.PI);
        for (let i = 0; i < 11; i++) {
          const a = Math.PI + ((i + 0.5) / 11) * Math.PI;
          const len = i % 2 ? 40 : 52;
          c.beginPath();
          c.moveTo(Math.cos(a - 0.09) * 16, -12 + Math.sin(a - 0.09) * 16);
          c.lineTo(Math.cos(a) * len, -12 + Math.sin(a) * len);
          c.lineTo(Math.cos(a + 0.09) * 16, -12 + Math.sin(a + 0.09) * 16);
          c.closePath();
          c.fillStyle = gold(c, -50, -64, 50, -12);
          c.fill();
          c.strokeStyle = INK;
          c.lineWidth = 1.1;
          c.stroke();
        }
        c.beginPath();
        c.arc(0, -12, 13, Math.PI, Math.PI * 2);
        c.closePath();
        c.fillStyle = gold(c, -13, -25, 13, -12);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.2;
        c.stroke();
        rrect(c, -40, -12, 80, 3.5, 1.5);
        c.fillStyle = gold(c, -40, -12, 40, -8);
        c.fill();
        c.restore();
      }
      c.beginPath();
      c.arc(cx, cy, 8, 0, Math.PI * 2);
      c.moveTo(cx + 13, cy - 3);
      c.arc(cx + 3.5, cy - 3, 8.6, 0, Math.PI * 2, true);
      c.fillStyle = '#e6ebf5';
      c.fill('evenodd');
      rrect(c, 6, 6, CARD_W - 12, CARD_H - 12, R - 4);
      c.strokeStyle = gold(c, 0, 0, CARD_W, CARD_H);
      c.lineWidth = 2.4;
      c.stroke();
      rrect(c, 10, 10, CARD_W - 20, CARD_H - 20, R - 6);
      c.strokeStyle = 'rgba(240,200,104,0.45)';
      c.lineWidth = 1;
      c.stroke();
    }, 2),
  );
}

/** Soft contact shadow under a card (stretch it with the card). */
export function cardShadowTexture() {
  return cached('card-shadow', () =>
    paint(CARD_W + 40, CARD_H + 40, (c) => {
      for (let i = 0; i < 8; i++) {
        rrect(c, 20 - i * 2.4, 20 - i * 2.4, CARD_W + i * 4.8, CARD_H + i * 4.8, R + i * 2.4);
        c.fillStyle = `rgba(8,3,12,${0.11 - i * 0.012})`;
        c.fill();
      }
    }, 1),
  );
}

/** Warm glow ring to mark winning cards (tint and add-blend it). */
export function cardGlowTexture() {
  return cached('card-glow', () =>
    paint(CARD_W + 60, CARD_H + 60, (c) => {
      for (let i = 0; i < 10; i++) {
        rrect(c, 30 - i * 3, 30 - i * 3, CARD_W + i * 6, CARD_H + i * 6, R + i * 3);
        c.strokeStyle = `rgba(255,255,255,${0.32 - i * 0.03})`;
        c.lineWidth = 3;
        c.stroke();
      }
    }, 1),
  );
}

// ---- The dealing shoe ---------------------------------------------------------------------------

export const SHOE_W = 150;
export const SHOE_H = 120;
/** Where the next card leaves the shoe, relative to the texture's top left. */
export const SHOE_MOUTH = { x: 34, y: 78 };

/** A walnut-and-brass dealing shoe seen from the 3/4 view, the mouth on the left. */
export function shoeTexture() {
  return cached('shoe', () =>
    paint(SHOE_W, SHOE_H, (c) => {
      shadow(c, 80, 104, 70, 14, 0.55);
      // Body: a wedge rising to the back.
      c.beginPath();
      c.moveTo(18, 70);
      c.lineTo(132, 34);
      c.lineTo(140, 92);
      c.lineTo(26, 106);
      c.closePath();
      fillInk(c, vgrad(c, 34, 106, 0x5a2a14, 0.25, 0.35), 2.4);
      // Top: the slanted card bed with backs showing.
      c.beginPath();
      c.moveTo(18, 70);
      c.lineTo(44, 50);
      c.lineTo(140, 20);
      c.lineTo(132, 34);
      c.closePath();
      fillInk(c, vgrad(c, 20, 70, 0x7a3a1c, 0.35, 0.2), 2);
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.moveTo(48 + i * 12, 50 - i * 3.6);
        c.lineTo(58 + i * 12, 46 - i * 3.6);
        c.strokeStyle = i % 2 ? 'rgba(58,26,90,0.9)' : 'rgba(240,220,180,0.8)';
        c.lineWidth = 2.4;
        c.stroke();
      }
      // The top card in the mouth (the house back).
      c.beginPath();
      c.moveTo(22, 72);
      c.lineTo(54, 60);
      c.lineTo(62, 82);
      c.lineTo(30, 94);
      c.closePath();
      fillInk(c, '#1a2458', 1.6);
      c.strokeStyle = 'rgba(240,200,104,0.7)';
      c.lineWidth = 1;
      c.stroke();
      // Brass front plate and rivets.
      c.beginPath();
      c.moveTo(16, 68);
      c.lineTo(28, 108);
      c.lineTo(38, 106);
      c.lineTo(26, 66);
      c.closePath();
      fillInk(c, gold(c, 16, 66, 38, 108), 1.6);
      rrect(c, 70, 86, 56, 10, 3);
      fillInk(c, gold(c, 70, 86, 126, 96), 1.4);
      for (const x of [76, 120]) {
        ellipse(c, x, 91, 2, 2);
        c.fillStyle = '#fff1c4';
        c.fill();
      }
      // A little sun crest on the side.
      ellipse(c, 98, 66, 10, 7);
      fillInk(c, gold(c, 88, 59, 108, 73), 1.2);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + ((i + 0.5) / 5) * Math.PI;
        c.beginPath();
        c.moveTo(98, 69);
        c.lineTo(98 + Math.cos(a) * 7, 69 + Math.sin(a) * 5.5);
        c.strokeStyle = '#5a2a14';
        c.lineWidth = 1.2;
        c.stroke();
      }
      c.beginPath();
      c.moveTo(18, 70);
      c.lineTo(132, 34);
      rim(c, 0.6, 1.5);
    }, 2),
  );
}

// ---- Card view with a real 3/4 flip ------------------------------------------------------------

/** Perspective camera distance in card heights; smaller = stronger perspective. */
const CAMERA = 3.2;

export interface CardViewOptions {
  faceUp?: boolean;
  /** Lean of the table plane (radians): the far edge of the card looks a little narrower. */
  tilt?: number;
}

/**
 * A card on the felt. Built from a PerspectiveMesh so a flip turns the card around its long
 * axis with real perspective (the near edge grows as it lifts off the table), plus a soft
 * shadow that stays on the felt. Scale/rotate/position it like any container.
 */
export class CardView extends Container {
  card: Card | null;
  faceUp: boolean;
  private mesh: PerspectiveMesh;
  private shadowS: Sprite;
  private glowS: Sprite | null = null;
  private tilt: number;
  private flipA = 0;
  private lift = 0;

  constructor(card: Card | null, o: CardViewOptions = {}) {
    super();
    this.card = card;
    this.faceUp = !!o.faceUp && !!card;
    this.tilt = o.tilt ?? 0.28;
    this.shadowS = new Sprite(cardShadowTexture());
    this.shadowS.anchor.set(0.5);
    this.mesh = new PerspectiveMesh({ texture: this.faceUp && card ? cardTexture(card) : backTexture(), verticesX: 8, verticesY: 8 });
    this.addChild(this.shadowS, this.mesh);
    this.pose(this.faceUp ? 0 : 0, 0);
  }

  setCard(card: Card | null, faceUp = this.faceUp) {
    this.card = card;
    this.faceUp = faceUp && !!card;
    this.pose(0, this.lift);
  }

  /** Shows the card at `angle` (0 = resting as it is, π = turned over) lifted by `lift` (0..1). */
  pose(angle: number, lift: number) {
    this.flipA = angle;
    this.lift = lift;
    const w = CARD_W / 2;
    const h = CARD_H / 2;
    const D = CARD_H * CAMERA;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    const z0 = -lift * CARD_H * 0.45;
    const proj = (x: number, y: number) => {
      // Turn around the card's long axis, lift towards the camera, lean back with the table.
      const xr = x * ca;
      const zr = x * sa + z0;
      const yt = y * ct - zr * st * 0.3;
      const zt = zr * ct - y * st;
      const k = D / (D + zt);
      return [xr * k, yt * k - lift * 10];
    };
    // Past 90° the other side faces the camera, mirrored.
    const flipped = Math.cos(angle) < 0;
    const showFace = flipped ? !this.faceUp : this.faceUp;
    const tex = showFace && this.card ? cardTexture(this.card) : backTexture();
    if (this.mesh.texture !== tex) this.mesh.texture = tex;
    const m = flipped ? -1 : 1;
    const [x0, y0] = proj(-w * m, -h);
    const [x1, y1] = proj(w * m, -h);
    const [x2, y2] = proj(w * m, h);
    const [x3, y3] = proj(-w * m, h);
    this.mesh.setCorners(x0, y0, x1, y1, x2, y2, x3, y3);
    // The shadow stays on the felt and spreads as the card lifts.
    this.shadowS.position.set(4 + lift * 10, 6 + lift * 16);
    this.shadowS.scale.set(Math.max(0.15, Math.abs(ca)) * (1 + lift * 0.1), 1 + lift * 0.06);
    this.shadowS.alpha = 0.9 - lift * 0.4;
  }

  /** Turns the card over (to face up or down) with a lift and a little settle. */
  async flip(faceUp = true, ms = 420) {
    if (faceUp === this.faceUp) return;
    if (reducedMotion()) {
      this.faceUp = faceUp;
      this.pose(0, 0);
      return;
    }
    await animate(ms, (k) => {
      if (this.destroyed) return;
      this.pose(k * Math.PI, Math.sin(k * Math.PI) * 0.9);
    }, ease.inOutCubic);
    if (this.destroyed) return;
    this.faceUp = faceUp;
    this.pose(0, 0);
    // Tiny bounce as it lands.
    const s = this.scale.x;
    await animate(140, (k) => !this.destroyed && this.scale.set(s * (1 + 0.04 * Math.sin(k * Math.PI))));
  }

  /** Glow around the card (winning hand), 0 hides it. */
  setGlow(alpha: number, tint = 0xffcf7a) {
    if (!this.glowS) {
      this.glowS = new Sprite(cardGlowTexture());
      this.glowS.anchor.set(0.5);
      this.glowS.blendMode = 'add';
      this.addChildAt(this.glowS, 1);
    }
    this.glowS.tint = tint;
    this.glowS.alpha = alpha;
    this.glowS.visible = alpha > 0.01;
  }

  /** Current flip angle (for callers that drive pose() themselves). */
  get flipAngle() {
    return this.flipA;
  }
}

/**
 * Slides a card from the shoe to its spot: it leaves face down, sails in a low arc with a turn,
 * lands with a small slap. With reduced motion it just appears.
 */
export async function dealCard(card: CardView, from: { x: number; y: number }, to: { x: number; y: number; rotation?: number }, ms = 340, onLand?: () => void) {
  const r1 = to.rotation ?? 0;
  if (reducedMotion()) {
    card.position.set(to.x, to.y);
    card.rotation = r1;
    onLand?.();
    return;
  }
  const r0 = r1 - 0.9;
  const s = card.scale.x;
  card.position.set(from.x, from.y);
  card.rotation = r0;
  card.alpha = 0;
  await animate(ms, (k) => {
    if (card.destroyed) return;
    card.alpha = Math.min(1, k * 4);
    card.x = from.x + (to.x - from.x) * k;
    card.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 26;
    card.rotation = r0 + (r1 - r0) * k;
    card.pose(card.flipAngle, Math.sin(k * Math.PI) * 0.5);
  }, ease.outCubic);
  if (card.destroyed) return;
  card.pose(0, 0);
  onLand?.();
  await animate(110, (k) => !card.destroyed && card.scale.set(s * (1 + 0.035 * Math.sin(k * Math.PI))));
}

// ---- Squeeze: peeling a face-down card from a corner -------------------------------------------

type Pt = { x: number; y: number };

/** Clips a convex polygon to the half plane where (p - o)·n <= d. */
function clipHalf(poly: Pt[], o: Pt, n: Pt, d: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => (p.x - o.x) * n.x + (p.y - o.y) * n.y - d;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if (fa <= 0 !== fb <= 0) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * The baccarat squeeze: a face-down card whose corner is peeled back bit by bit. `set(p)` with
 * p from 0 (closed) to 1 (fully open) moves the fold line in from the chosen corner; the face
 * shows behind the fold, with a bright curl and a shadow along it. Centered on (0, 0).
 */
export class SqueezeView extends Container {
  private face: Sprite;
  private back: Sprite;
  private faceMask = new Graphics();
  private backMask = new Graphics();
  private curl = new Graphics();
  private shadowS: Sprite;
  private dir: Pt;
  private origin: Pt;
  private span: number;

  constructor(card: Card, from: 'corner' | 'side' = 'corner') {
    super();
    this.shadowS = new Sprite(cardShadowTexture());
    this.shadowS.anchor.set(0.5);
    this.shadowS.position.set(6, 10);
    this.face = new Sprite(cardTexture(card));
    this.back = new Sprite(backTexture());
    for (const s of [this.face, this.back]) s.anchor.set(0.5);
    this.face.mask = this.faceMask;
    this.back.mask = this.backMask;
    this.addChild(this.shadowS, this.face, this.back, this.faceMask, this.backMask, this.curl);
    const w = CARD_W / 2;
    const h = CARD_H / 2;
    if (from === 'corner') {
      this.origin = { x: w, y: h };
      this.dir = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
      this.span = (CARD_W + CARD_H) * Math.SQRT1_2;
    } else {
      this.origin = { x: 0, y: h };
      this.dir = { x: 0, y: -1 };
      this.span = CARD_H;
    }
    this.set(0);
  }

  set(p: number) {
    const w = CARD_W / 2;
    const h = CARD_H / 2;
    const rect: Pt[] = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
    const d = Math.max(0, Math.min(1, p)) * this.span;
    // Face: the part between the corner and the fold line.
    const facePoly = clipHalf(rect, this.origin, this.dir, d);
    const backPoly = clipHalf(rect, this.origin, { x: -this.dir.x, y: -this.dir.y }, -d);
    const draw = (g: Graphics, poly: Pt[]) => {
      g.clear();
      if (poly.length >= 3) g.poly(poly.flatMap((q) => [q.x, q.y])).fill(0xffffff);
    };
    draw(this.faceMask, facePoly);
    draw(this.backMask, backPoly);
    this.face.visible = facePoly.length >= 3;
    this.back.visible = backPoly.length >= 3;
    // The curl: a light band on the back side of the fold and a shade on the face side.
    this.curl.clear();
    if (d > 0.5 && p < 1) {
      const band = (from: number, to: number, color: number, alpha: number) => {
        const a = clipHalf(clipHalf(rect, this.origin, this.dir, to), this.origin, { x: -this.dir.x, y: -this.dir.y }, -from);
        if (a.length >= 3) this.curl.poly(a.flatMap((q) => [q.x, q.y])).fill({ color, alpha });
      };
      const bw = Math.min(14, d * 0.5);
      band(d, d + bw, 0xfff6e6, 0.85);
      band(d + bw, d + bw + 4, 0x2a1446, 0.45);
      band(Math.max(0, d - 8), d, 0x0a0410, 0.18);
    }
  }
}
