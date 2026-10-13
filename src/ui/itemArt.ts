// Painted medallions for the economy items (bag, hotbar, shop, reels). Same brass medallion as
// the odds items of the games (src/games/itemKit.ts), so every item in the bag looks like it
// came from the same jeweller. Painted once per item with Canvas 2D, for Pixi as a texture and
// for the HTML overlay as a data URL.

import type { Texture } from 'pixi.js';
import { drawEmblem } from '../core/fx';
import { itemDef } from '../core/modifiers';
import { itemMedalTexture } from '../games/itemKit';
import { INK, ellipse, fillInk, glowAt, gold, light, paint, rgb, rim, rrect, type Ctx } from '../world/painted/brush';

const S = 112;

/** Glow colour of each item (also used for chips and reels). */
export const ITEM_TINT: Record<string, number> = {
  engel: 0xfff4d0,
  teufel: 0xff5a4a,
  wundertuete: 0xffcf7a,
  bonusziehung: 0x9fe8ff,
  kamera: 0xd8d0ff,
  drink: 0x7fd8ff,
  goldjeton: 0xffd75a,
  dietrich: 0xc9cbd2,
  zuversicht: 0x8fe88a,
  versicherung: 0x9fc8ff,
  verstaerker: 0xff8fd8,
  statue: 0xfff1c4,
  zeitmaschine: 0xc9a0ff,
};

export const tintOf = (id: string) => ITEM_TINT[id] ?? 0xffcf7a;

/** Medallion: brass rim, plum enamel, the item's glow and picture; legendary items get a star rim. */
function medal(c: Ctx, id: string) {
  const m = S / 2;
  const legend = itemDef(id)?.tier === 'legendaer';
  glowAt(c, m, m + 4, 54, 54, 0x0a0410, 0.55);
  if (legend) glowAt(c, m, m, 56, 56, 0xc9a0ff, 0.5, 'lighter');
  ellipse(c, m, m, 48, 48);
  fillInk(c, gold(c, 0, 8, 0, S - 8), 3);
  rim(c, 0.6, 2);
  if (legend)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ellipse(c, m + Math.cos(a) * 43, m + Math.sin(a) * 43, 2.2, 2.2);
      c.fillStyle = '#fff4d0';
      c.fill();
    }
  ellipse(c, m, m, 38, 38);
  const g = c.createRadialGradient(m - 10, m - 12, 4, m, m, 40);
  g.addColorStop(0, rgb(0x4a1a3a));
  g.addColorStop(1, rgb(0x14060f));
  fillInk(c, g, 2);
  glowAt(c, m, m, 34, 34, tintOf(id), 0.3, 'lighter');
  c.save();
  c.translate(m, m);
  ICONS[id]?.(c);
  c.restore();
}

const texCache = new Map<string, Texture>();
/** Pixi texture of an item's medallion (112×112 design px). */
export function itemTexture(id: string): Texture {
  if (!ICONS[id]) return itemMedalTexture(id);
  let t = texCache.get(id);
  if (!t) {
    t = paint(S, S, (c) => medal(c, id));
    texCache.set(id, t);
  }
  return t;
}

const urlCache = new Map<string, string>();
/** Data URL of an item's medallion for the HTML overlay. */
export function itemUrl(id: string): string {
  let u = urlCache.get(id);
  if (u) return u;
  const tex = itemTexture(id);
  const src = tex.source.resource as unknown;
  u = src instanceof HTMLCanvasElement ? src.toDataURL() : '';
  urlCache.set(id, u);
  return u;
}

// ---- Pictures -----------------------------------------------------------------------------------

function star(c: Ctx, x: number, y: number, r: number, inner = 0.42) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** A tiny reel window (for Engel and Teufel). */
function reel(c: Ctx, face: string, ink: string) {
  rrect(c, -20, -6, 40, 30, 6);
  fillInk(c, gold(c, 0, -6, 0, 24), 2.5);
  rrect(c, -15, -2, 30, 22, 4);
  const g = c.createLinearGradient(0, -2, 0, 20);
  g.addColorStop(0, '#d8cbb0');
  g.addColorStop(0.5, '#fffaf0');
  g.addColorStop(1, '#c8b898');
  fillInk(c, g, 1.5);
  c.fillStyle = ink;
  c.font = '700 16px Cinzel, Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(face, 0, 10);
}

const ICONS: Record<string, (c: Ctx) => void> = {
  engel(c) {
    // Two white wings over a little reel, a halo above.
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 10, -6);
      c.bezierCurveTo(s * 22, -30, s * 36, -22, s * 32, -8);
      c.bezierCurveTo(s * 30, 0, s * 20, 2, s * 12, 2);
      const g = c.createLinearGradient(0, -28, 0, 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c8d0e8');
      fillInk(c, g, 2);
      c.strokeStyle = 'rgba(120,130,170,0.6)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(s * 14, -4);
      c.lineTo(s * 28, -14);
      c.moveTo(s * 14, -1);
      c.lineTo(s * 26, -6);
      c.stroke();
    }
    ellipse(c, 0, -28, 12, 4);
    c.strokeStyle = INK;
    c.lineWidth = 4.5;
    c.stroke();
    c.strokeStyle = '#ffe08a';
    c.lineWidth = 2.5;
    c.stroke();
    reel(c, '↺', '#3a5a8a');
  },
  teufel(c) {
    // A reel between two red horns.
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 8, -4);
      c.quadraticCurveTo(s * 14, -26, s * 26, -30);
      c.quadraticCurveTo(s * 22, -16, s * 20, -2);
      c.closePath();
      const g = c.createLinearGradient(0, -30, 0, -2);
      g.addColorStop(0, '#ffb0a0');
      g.addColorStop(0.5, '#e0352a');
      g.addColorStop(1, '#7a1010');
      fillInk(c, g, 2);
    }
    reel(c, '×3', '#a01a1a');
  },
  wundertuete(c) {
    // A striped paper bag with a big question mark and sparkles.
    c.beginPath();
    c.moveTo(-18, -14);
    c.lineTo(18, -14);
    c.lineTo(22, 28);
    c.lineTo(-22, 28);
    c.closePath();
    const g = c.createLinearGradient(-22, 0, 22, 0);
    g.addColorStop(0, '#e8c890');
    g.addColorStop(1, '#b07a3a');
    fillInk(c, g, 2.5);
    c.save();
    c.clip();
    c.fillStyle = 'rgba(200,40,90,0.55)';
    for (let x = -30; x < 30; x += 12) c.fillRect(x, -16, 5, 46);
    c.restore();
    // Twisted top.
    c.beginPath();
    c.moveTo(-14, -14);
    c.lineTo(-6, -24);
    c.lineTo(0, -18);
    c.lineTo(6, -26);
    c.lineTo(14, -14);
    c.closePath();
    fillInk(c, '#d8b070', 2);
    c.fillStyle = '#fff4d0';
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.font = '700 26px Cinzel, Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeText('?', 0, 9);
    c.fillText('?', 0, 9);
    star(c, 24, -22, 6);
    fillInk(c, '#fff1a0', 1.2);
    star(c, -26, -10, 4);
    fillInk(c, '#fff1a0', 1);
  },
  bonusziehung(c) {
    // A lottery ticket with a moonstone stamped on it.
    c.save();
    c.rotate(-0.18);
    rrect(c, -26, -16, 52, 34, 4);
    const g = c.createLinearGradient(0, -16, 0, 18);
    g.addColorStop(0, '#fff6dc');
    g.addColorStop(1, '#e0c890');
    fillInk(c, g, 2.5);
    c.strokeStyle = 'rgba(150,90,30,0.6)';
    c.setLineDash([3, 3]);
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(10, -14);
    c.lineTo(10, 16);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#7a3a1a';
    c.font = '700 9px Cinzel, Georgia, serif';
    c.textAlign = 'center';
    c.fillText('BONUS', -8, -3);
    c.fillText('+1', -8, 10);
    // Stone.
    c.beginPath();
    c.moveTo(18, -8);
    c.lineTo(24, 0);
    c.lineTo(18, 9);
    c.lineTo(12, 0);
    c.closePath();
    const sg = c.createLinearGradient(12, -8, 24, 9);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.5, '#9fe8ff');
    sg.addColorStop(1, '#2a6f96');
    fillInk(c, sg, 1.5);
    c.restore();
  },
  kamera(c) {
    // A brass box camera with a flash bulb.
    rrect(c, -26, -10, 52, 32, 6);
    const g = c.createLinearGradient(0, -10, 0, 22);
    g.addColorStop(0, '#4a3a4a');
    g.addColorStop(1, '#1a121a');
    fillInk(c, g, 2.5);
    rrect(c, -26, -2, 52, 8, 2);
    fillInk(c, gold(c, 0, -2, 0, 6), 1.5);
    ellipse(c, 2, 8, 12, 12);
    fillInk(c, gold(c, -10, -4, 10, 20), 2);
    ellipse(c, 2, 8, 8, 8);
    const lg = c.createRadialGradient(-1, 5, 1, 2, 8, 9);
    lg.addColorStop(0, '#e8f0ff');
    lg.addColorStop(0.4, '#5a6aa0');
    lg.addColorStop(1, '#101020');
    fillInk(c, lg, 1.5);
    rrect(c, -20, -18, 12, 8, 2);
    fillInk(c, '#2a1a2a', 1.5);
    glowAt(c, 18, -20, 12, 12, 0xfff8d0, 0.8, 'lighter');
    ellipse(c, 18, -18, 5, 5);
    fillInk(c, '#fffbe8', 1.5);
  },
  drink(c) {
    // A cocktail glass with a blue moon drink and a lemon crescent.
    c.beginPath();
    c.moveTo(-22, -22);
    c.lineTo(22, -22);
    c.lineTo(2, 2);
    c.lineTo(-2, 2);
    c.closePath();
    c.fillStyle = 'rgba(230,245,255,0.25)';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.stroke();
    c.beginPath();
    c.moveTo(-17, -16);
    c.lineTo(17, -16);
    c.lineTo(1.5, 1);
    c.lineTo(-1.5, 1);
    c.closePath();
    const g = c.createLinearGradient(0, -16, 0, 2);
    g.addColorStop(0, '#bff3ff');
    g.addColorStop(1, '#2a7ab8');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-1, 2);
    c.lineTo(-1, 22);
    c.moveTo(1, 2);
    c.lineTo(1, 22);
    c.stroke();
    ellipse(c, 0, 24, 12, 3.5);
    fillInk(c, 'rgba(230,245,255,0.6)', 2);
    // Crescent on the rim.
    c.beginPath();
    c.arc(16, -24, 8, 0, Math.PI * 2);
    c.arc(19, -27, 7, 0, Math.PI * 2, true);
    fillInk(c, '#ffe27a', 1.5);
  },
  goldjeton(c) {
    // A gold casino chip with a moth.
    ellipse(c, 0, 0, 27, 27);
    fillInk(c, gold(c, -27, -27, 27, 27), 2.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.save();
      c.rotate(a);
      rrect(c, 20, -4, 7, 8, 2);
      c.fillStyle = '#fff4d0';
      c.fill();
      c.restore();
    }
    ellipse(c, 0, 0, 17, 17);
    c.strokeStyle = 'rgba(110,70,15,0.8)';
    c.lineWidth = 1.5;
    c.stroke();
    drawEmblem(c, 0, 1, 24, '#8a5a12', '#5a3a08');
  },
  dietrich(c) {
    // A lock pick crossed with a slim key over a padlock.
    rrect(c, -14, -2, 28, 24, 5);
    fillInk(c, gold(c, -14, -2, 14, 22), 2.5);
    c.beginPath();
    c.arc(0, -4, 10, Math.PI, 0);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = '#c9cbd2';
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, 0, 8, 3, 3);
    c.fillStyle = '#2a1406';
    c.fill();
    c.fillRect(-1.2, 8, 2.4, 7);
    c.save();
    c.rotate(-0.7);
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-30, 4);
    c.lineTo(14, 4);
    c.lineTo(18, 0);
    c.stroke();
    c.strokeStyle = '#e8ecf4';
    c.lineWidth = 2.5;
    c.stroke();
    rrect(c, -36, -1, 10, 10, 3);
    fillInk(c, '#7a2a3a', 1.5);
    c.restore();
  },
  zuversicht(c) {
    // A four-leaf clover with a sparkle.
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate((i * Math.PI) / 2 + Math.PI / 4);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-14, -6, -14, -24, 0, -18);
      c.bezierCurveTo(14, -24, 14, -6, 0, 0);
      const g = c.createLinearGradient(0, -20, 0, 0);
      g.addColorStop(0, '#c8f8a0');
      g.addColorStop(1, '#2a8a3a');
      fillInk(c, g, 2);
      c.restore();
    }
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(6, 16, 2, 28);
    c.stroke();
    c.strokeStyle = '#3a9a3a';
    c.lineWidth = 2;
    c.stroke();
    star(c, 20, -22, 7);
    fillInk(c, '#fff8c0', 1.2);
  },
  versicherung(c) {
    // A shield with a moth.
    c.beginPath();
    c.moveTo(0, -28);
    c.quadraticCurveTo(14, -20, 24, -22);
    c.quadraticCurveTo(26, 10, 0, 28);
    c.quadraticCurveTo(-26, 10, -24, -22);
    c.quadraticCurveTo(-14, -20, 0, -28);
    c.closePath();
    const g = c.createLinearGradient(-24, -28, 24, 28);
    g.addColorStop(0, '#d8e8ff');
    g.addColorStop(0.5, '#5a7ac8');
    g.addColorStop(1, '#1a2a5a');
    fillInk(c, g, 2.5);
    c.strokeStyle = rgb(0xe0b25a);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -22);
    c.quadraticCurveTo(11, -15, 19, -17);
    c.quadraticCurveTo(20, 7, 0, 22);
    c.quadraticCurveTo(-20, 7, -19, -17);
    c.quadraticCurveTo(-11, -15, 0, -22);
    c.stroke();
    drawEmblem(c, 0, 1, 26, '#ffe6a0', '#a8741f');
  },
  verstaerker(c) {
    // A brass gramophone horn blowing sparkles: everything louder.
    c.beginPath();
    c.moveTo(-22, 6);
    c.quadraticCurveTo(0, 0, 18, -22);
    c.quadraticCurveTo(28, -4, 22, 16);
    c.quadraticCurveTo(4, 8, -22, 14);
    c.closePath();
    fillInk(c, gold(c, -22, -22, 22, 16), 2.5);
    ellipse(c, 20, -3, 6, 18);
    const g = c.createRadialGradient(20, -3, 1, 20, -3, 18);
    g.addColorStop(0, '#3a1a08');
    g.addColorStop(1, '#a8741f');
    fillInk(c, g, 2);
    rrect(c, -28, 4, 8, 12, 2);
    fillInk(c, '#5a2a3a', 1.5);
    for (const [x, y, r] of [[-6, -20, 6], [6, -30, 4], [-18, -10, 4]] as const) {
      star(c, x, y, r);
      fillInk(c, rgb(light(0xff8fd8, 0.4)), 1);
    }
    c.fillStyle = '#fff4d0';
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.font = '700 13px Cinzel, Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeText('×1,5', 0, 24);
    c.fillText('×1,5', 0, 24);
  },
  statue(c) {
    // A golden moth on a marble pedestal under a halo.
    glowAt(c, 0, -10, 26, 22, 0xfff1c4, 0.6, 'lighter');
    rrect(c, -16, 12, 32, 16, 3);
    const g = c.createLinearGradient(0, 12, 0, 28);
    g.addColorStop(0, '#f4ecf8');
    g.addColorStop(1, '#a898b0');
    fillInk(c, g, 2);
    rrect(c, -20, 24, 40, 6, 2);
    fillInk(c, '#c8b8d0', 1.5);
    drawEmblem(c, 0, -4, 40, 'rgba(22,10,20,0.85)', 'rgba(22,10,20,0.9)');
    const mg = c.createLinearGradient(-16, -18, 16, 10);
    mg.addColorStop(0, '#fff4c2');
    mg.addColorStop(0.5, '#e6b85a');
    mg.addColorStop(1, '#9a6a22');
    drawEmblem(c, 0, -5, 36, mg, '#6a4210', 'rgba(255,240,200,0.8)');
    ellipse(c, 0, -26, 11, 3.5);
    c.strokeStyle = '#ffe08a';
    c.lineWidth = 2.2;
    c.stroke();
  },
  zeitmaschine(c) {
    // An hourglass in a brass frame with a cog.
    c.save();
    c.translate(10, 10);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 13 : 17;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    fillInk(c, gold(c, -17, -17, 17, 17), 2);
    ellipse(c, 0, 0, 5, 5);
    fillInk(c, '#2a1406', 1);
    c.restore();
    rrect(c, -22, -28, 28, 5, 2);
    fillInk(c, gold(c, -22, -28, 6, -23), 1.8);
    rrect(c, -22, 21, 28, 5, 2);
    fillInk(c, gold(c, -22, 21, 6, 26), 1.8);
    c.beginPath();
    c.moveTo(-18, -23);
    c.lineTo(2, -23);
    c.quadraticCurveTo(2, -6, -6, -1);
    c.quadraticCurveTo(2, 4, 2, 21);
    c.lineTo(-18, 21);
    c.quadraticCurveTo(-18, 4, -10, -1);
    c.quadraticCurveTo(-18, -6, -18, -23);
    c.closePath();
    c.fillStyle = 'rgba(230,240,255,0.3)';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    // Violet sand, running.
    c.beginPath();
    c.moveTo(-15, -18);
    c.lineTo(-1, -18);
    c.quadraticCurveTo(-4, -8, -8, -4);
    c.closePath();
    c.fillStyle = '#c9a0ff';
    c.fill();
    c.beginPath();
    c.moveTo(-16, 20);
    c.quadraticCurveTo(-8, 10, 0, 20);
    c.closePath();
    c.fill();
    c.strokeStyle = '#e8d4ff';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-8, -3);
    c.lineTo(-8, 14);
    c.stroke();
  },
};

let pouch = '';
/** The bag key's picture: a plum velvet drawstring pouch with a brass ring and a moth. */
export function pouchUrl() {
  if (pouch) return pouch;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  glowAt(c, 24, 40, 18, 5, 0x0a0410, 0.5);
  c.beginPath();
  c.moveTo(17, 14);
  c.bezierCurveTo(4, 22, 4, 42, 24, 42);
  c.bezierCurveTo(44, 42, 44, 22, 31, 14);
  c.closePath();
  const g = c.createRadialGradient(18, 24, 2, 24, 30, 22);
  g.addColorStop(0, '#9a3a6a');
  g.addColorStop(0.6, '#5a1a3e');
  g.addColorStop(1, '#2a0a1e');
  fillInk(c, g, 2);
  // Gathered neck and the brass ring.
  c.beginPath();
  c.moveTo(15, 8);
  c.lineTo(20, 15);
  c.lineTo(28, 15);
  c.lineTo(33, 8);
  c.quadraticCurveTo(24, 12, 15, 8);
  fillInk(c, '#7a2a52', 1.6);
  rrect(c, 17, 13, 14, 5, 2.5);
  fillInk(c, gold(c, 17, 13, 31, 18), 1.4);
  drawEmblem(c, 24, 30, 16, '#ffe6a0', '#a8741f');
  pouch = cv.toDataURL();
  return pouch;
}
