// The four mini bosses in the painted chibi look (src/core/miniboss.ts): the Samtgräfin in her
// velvet gown, the Gärtner der Nacht with moonflowers and shears, the Uhrmacher with his giant
// pocket watch, DJ Stroboskop with two fans of strobe light behind his deck. Each is painted once (plus a
// "beaten" face) and cached; also a round portrait for the HUD plate and the boss trophies.

import { Texture } from 'pixi.js';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, rgb, rrect, shadow, type Ctx } from './brush';

/** Canvas of a boss figure; (FX, FY) is the point between the feet. */
export const FW = 170;
export const FH = 236;
export const FX = 85;
export const FY = 222;
/** Height of the head's centre above the feet (for bubbles and portraits). */
export const HEAD_Y = 142;

const cache = new Map<string, Texture>();
const once = (k: string, make: () => Texture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

// ---- Small painting helpers ---------------------------------------------------------------------

function skin(c: Ctx, x: number, y: number, r: number, col: number) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, rgb(light(col, 0.35)));
  g.addColorStop(0.6, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.25)));
  return g;
}

function cloth(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(col, 0.3)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.45)));
  return g;
}

type Eyes = 'smug' | 'beaten' | 'glow' | 'shades' | 'loupe';

/** Big chibi head with a face. */
function face(c: Ctx, x: number, y: number, r: number, col: number, eyes: Eyes, mouth: 'smirk' | 'o' | 'grin' | 'none' = 'smirk') {
  ellipse(c, x, y, r, r * 0.95);
  fillInk(c, skin(c, x, y, r, col), 2.6);
  const ey = y + r * 0.12;
  const ex = r * 0.36;
  if (eyes === 'beaten') {
    // Swirly, dizzy eyes.
    c.strokeStyle = '#1b1020';
    c.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      c.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.3) {
        const rr = 0.6 + a * 0.55;
        const px = x + s * ex + Math.cos(a) * rr;
        const py = ey + Math.sin(a) * rr;
        if (a === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
    mouth = 'o';
  } else if (eyes === 'shades') {
    for (const s of [-1, 1]) {
      ellipse(c, x + s * ex, ey - 1, r * 0.3, r * 0.24);
      const g = c.createLinearGradient(0, ey - 8, 0, ey + 6);
      g.addColorStop(0, '#ff8af0');
      g.addColorStop(0.5, '#2a0a3a');
      g.addColorStop(1, '#5a1a8a');
      fillInk(c, g, 1.8);
      ellipse(c, x + s * ex - 3, ey - 4, 3, 1.6);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fill();
    }
    c.beginPath();
    c.moveTo(x - ex + r * 0.3, ey - 2);
    c.lineTo(x + ex - r * 0.3, ey - 2);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
  } else {
    for (const s of [-1, 1]) {
      const big = eyes === 'loupe' && s === 1;
      const er = big ? 1.9 : 1;
      if (big) {
        // Watchmaker's loupe: a brass ring with a magnified eye.
        ellipse(c, x + s * ex, ey, r * 0.34, r * 0.34);
        c.fillStyle = 'rgba(220,240,255,0.55)';
        c.fill();
      }
      ellipse(c, x + s * ex, ey, 2.8 * er, 3.6 * er);
      c.fillStyle = eyes === 'glow' ? '#d8fff0' : '#1b1020';
      c.fill();
      if (eyes === 'glow') glowAt(c, x + s * ex, ey, 7, 7, 0x9fffd0, 0.6, 'lighter');
      ellipse(c, x + s * ex - 1, ey - 1.4, 1 * er, 1.2 * er);
      c.fillStyle = '#ffffff';
      c.fill();
      if (eyes === 'smug') {
        // Heavy lid: proud and a little bored.
        c.beginPath();
        c.moveTo(x + s * ex - 5, ey - 2.6);
        c.quadraticCurveTo(x + s * ex, ey - 4.2, x + s * ex + 5, ey - 2.2);
        c.strokeStyle = INK;
        c.lineWidth = 2.2;
        c.stroke();
      }
      if (big) {
        ellipse(c, x + s * ex, ey, r * 0.34, r * 0.34);
        c.strokeStyle = gold(c, x, ey - 10, x + 20, ey + 10);
        c.lineWidth = 3.4;
        c.stroke();
        c.strokeStyle = INK;
        c.lineWidth = 1.2;
        c.stroke();
      }
    }
  }
  for (const s of [-1, 1]) glowAt(c, x + s * r * 0.58, y + r * 0.42, 5.5, 3.2, 0xff7a8a, 0.4);
  c.strokeStyle = 'rgba(80,30,30,0.9)';
  c.lineWidth = 1.6;
  c.beginPath();
  if (mouth === 'smirk') {
    c.moveTo(x - 4, y + r * 0.5);
    c.quadraticCurveTo(x + 1, y + r * 0.6, x + 6, y + r * 0.42);
    c.stroke();
  } else if (mouth === 'grin') {
    c.moveTo(x - 7, y + r * 0.42);
    c.quadraticCurveTo(x, y + r * 0.72, x + 7, y + r * 0.42);
    c.closePath();
    c.fillStyle = '#5a1420';
    c.fill();
    c.stroke();
  } else if (mouth === 'o') {
    ellipse(c, x, y + r * 0.56, 3, 3.6);
    c.fillStyle = '#5a1420';
    c.fill();
  }
}

function arm(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: number, hand: number, w = 9) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = INK;
  c.lineWidth = w + 4;
  c.stroke();
  c.strokeStyle = rgb(col);
  c.lineWidth = w;
  c.stroke();
  ellipse(c, x1, y1, 5.5, 5.5);
  fillInk(c, skin(c, x1, y1, 6, hand), 1.8);
}

function aura(c: Ctx, col: number) {
  glowAt(c, 0, -90, 80, 100, col, 0.22, 'lighter');
  shadow(c, 0, 0, 52, 13, 0.6);
}

// ---- The four bosses ----------------------------------------------------------------------------

function samtgraefin(c: Ctx, beaten: boolean) {
  const velvet = 0x9a1434;
  aura(c, 0xff5a7a);
  // Bell-shaped ball gown.
  c.beginPath();
  c.moveTo(-18, -92);
  c.quadraticCurveTo(-26, -50, -58, -8);
  c.quadraticCurveTo(0, 10, 58, -8);
  c.quadraticCurveTo(26, -50, 18, -92);
  c.closePath();
  fillInk(c, cloth(c, -50, -92, 50, 0, velvet), 2.8);
  // Velvet folds and a golden hem.
  c.strokeStyle = rgb(dark(velvet, 0.45), 0.7);
  c.lineWidth = 2;
  for (const k of [-34, -16, 2, 20, 38]) {
    c.beginPath();
    c.moveTo(k * 0.3, -70);
    c.quadraticCurveTo(k * 0.8, -36, k * 1.2, -4);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-56, -9);
  c.quadraticCurveTo(0, 8, 56, -9);
  c.strokeStyle = gold(c, -50, -10, 50, 0);
  c.lineWidth = 4;
  c.stroke();
  // Bodice with gold lacing.
  rrect(c, -18, -108, 36, 30, 8);
  fillInk(c, cloth(c, -18, -108, 18, -78, 0xb81c40), 2.2);
  c.strokeStyle = gold(c, -6, -106, 6, -80);
  c.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(-5, -104 + i * 6);
    c.lineTo(5, -101 + i * 6);
    c.moveTo(5, -104 + i * 6);
    c.lineTo(-5, -101 + i * 6);
    c.stroke();
  }
  // Puffed sleeves and arms; the right hand holds an open fan.
  for (const s of [-1, 1]) {
    ellipse(c, s * 20, -104, 10, 9);
    fillInk(c, cloth(c, s * 20 - 10, -112, s * 20 + 10, -95, 0xb81c40), 2);
  }
  arm(c, -22, -98, -30, -70, 0xf2e6e0, 0xf3d2c0, 6);
  arm(c, 22, -98, 34, -110, 0xf2e6e0, 0xf3d2c0, 6);
  // The fan.
  c.save();
  c.translate(36, -116);
  c.rotate(-0.5);
  c.beginPath();
  c.moveTo(0, 0);
  c.arc(0, 0, 30, -Math.PI * 0.95, -Math.PI * 0.05);
  c.closePath();
  const fg = c.createRadialGradient(0, 0, 4, 0, 0, 30);
  fg.addColorStop(0, '#2a0a14');
  fg.addColorStop(0.7, '#5a1028');
  fg.addColorStop(1, '#e0b25a');
  fillInk(c, fg, 2);
  c.strokeStyle = 'rgba(240,200,120,0.7)';
  c.lineWidth = 1;
  for (let a = -0.9; a <= -0.1; a += 0.13) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a * Math.PI) * 28, Math.sin(a * Math.PI) * 28);
    c.stroke();
  }
  c.restore();
  // Pearls.
  for (let i = -3; i <= 3; i++) {
    ellipse(c, i * 3.6, -110 + Math.abs(i) * -0.6 + 2, 2.2, 2.2);
    c.fillStyle = '#fff8f0';
    c.fill();
  }
  // Tall powdered hair behind and above the head.
  const hx = 0;
  const hy = -HEAD_Y;
  c.beginPath();
  c.moveTo(-30, hy + 8);
  c.quadraticCurveTo(-40, hy - 30, -22, hy - 50);
  c.quadraticCurveTo(-14, hy - 76, 2, hy - 72);
  c.quadraticCurveTo(22, hy - 80, 26, hy - 52);
  c.quadraticCurveTo(42, hy - 30, 30, hy + 8);
  c.closePath();
  fillInk(c, cloth(c, -30, hy - 80, 30, hy + 8, 0xece6f2), 2.6);
  c.strokeStyle = 'rgba(150,140,170,0.6)';
  c.lineWidth = 1.6;
  for (const [x, y, r] of [[-18, -48, 9], [4, -60, 10], [18, -40, 9], [-10, -28, 8], [14, -22, 7]] as const) {
    c.beginPath();
    c.arc(hx + x, hy + y, r, 0.4, Math.PI * 1.6);
    c.stroke();
  }
  face(c, hx, hy, 27, 0xf6dccc, beaten ? 'beaten' : 'smug', 'smirk');
  // Fringe of curls.
  c.beginPath();
  c.moveTo(-28, hy - 2);
  c.quadraticCurveTo(-26, hy - 30, 0, hy - 30);
  c.quadraticCurveTo(26, hy - 30, 28, hy - 2);
  c.quadraticCurveTo(14, hy - 18, 0, hy - 16);
  c.quadraticCurveTo(-14, hy - 18, -28, hy - 2);
  fillInk(c, cloth(c, -28, hy - 30, 28, hy, 0xf2ecf6), 2.2);
  // Beauty mark.
  ellipse(c, hx + 12, hy + 12, 1.4, 1.4);
  c.fillStyle = '#2a1018';
  c.fill();
  // Tiara with three tiny lit candles.
  c.beginPath();
  c.moveTo(-16, hy - 28);
  c.quadraticCurveTo(0, hy - 36, 16, hy - 28);
  c.strokeStyle = gold(c, -16, hy - 36, 16, hy - 26);
  c.lineWidth = 4;
  c.stroke();
  for (const [x, h] of [[-10, 10], [0, 14], [10, 10]] as const) {
    const top = hy - 32 - h - (x === 0 ? 2 : 0);
    rrect(c, x - 2.6, top, 5.2, h, 2);
    fillInk(c, '#fff4e0', 1.2);
    glowAt(c, x, top - 5, 9, 11, 0xffb84a, 0.7, 'lighter');
    ellipse(c, x, top - 4, 2.4, 4);
    c.fillStyle = beaten ? 'rgba(120,120,120,0.6)' : '#ffd36a';
    c.fill();
  }
}

function gaertner(c: Ctx, beaten: boolean) {
  const coat = 0x1f4a3a;
  aura(c, 0x7affc0);
  // Long coat to the floor.
  c.beginPath();
  c.moveTo(-20, -112);
  c.quadraticCurveTo(-30, -60, -36, -4);
  c.quadraticCurveTo(0, 4, 36, -4);
  c.quadraticCurveTo(30, -60, 20, -112);
  c.closePath();
  fillInk(c, cloth(c, -30, -112, 30, 0, coat), 2.8);
  // Lapels, buttons, a split at the front.
  c.beginPath();
  c.moveTo(0, -60);
  c.lineTo(0, -2);
  c.strokeStyle = rgb(dark(coat, 0.6));
  c.lineWidth = 2;
  c.stroke();
  for (const y of [-92, -78, -64]) {
    ellipse(c, 4, y, 2.4, 2.4);
    c.fillStyle = '#d8e8c0';
    c.fill();
  }
  c.beginPath();
  c.moveTo(-14, -112);
  c.lineTo(0, -84);
  c.lineTo(14, -112);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  // Boots peeking out.
  for (const s of [-1, 1]) {
    ellipse(c, s * 12, -3, 10, 5);
    fillInk(c, '#2a1a12', 2);
  }
  // A firefly lantern at his side.
  c.beginPath();
  c.moveTo(-34, -66);
  c.lineTo(-38, -52);
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.stroke();
  glowAt(c, -38, -40, 22, 22, 0x9fffd0, beaten ? 0.15 : 0.55, 'lighter');
  rrect(c, -46, -52, 16, 22, 4);
  fillInk(c, 'rgba(200,255,230,0.75)', 2);
  c.strokeStyle = '#3a2a14';
  c.lineWidth = 2;
  c.strokeRect(-46, -52, 16, 22);
  // Arms: shears held across the chest.
  arm(c, -18, -104, 8, -80, coat, 0xbcd8d0, 9);
  arm(c, 18, -104, 22, -74, coat, 0xbcd8d0, 9);
  c.save();
  c.translate(12, -80);
  c.rotate(-0.7);
  for (const s of [-1, 1]) {
    c.save();
    c.rotate(s * 0.14);
    c.beginPath();
    c.moveTo(0, -3);
    c.lineTo(40, -2);
    c.lineTo(46, 0);
    c.lineTo(40, 3);
    c.lineTo(0, 3);
    c.closePath();
    const bg = c.createLinearGradient(0, -3, 0, 3);
    bg.addColorStop(0, '#f4fbff');
    bg.addColorStop(1, '#7a8a98');
    fillInk(c, bg, 1.6);
    c.restore();
  }
  for (const s of [-1, 1]) {
    ellipse(c, -10, s * 6, 7, 5);
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = '#8a3a2a';
    c.lineWidth = 2.4;
    c.stroke();
  }
  c.restore();
  // Head: pale, long hair, wide hat with moonflowers.
  const hy = -HEAD_Y + 4;
  c.beginPath();
  c.moveTo(-26, hy - 6);
  c.quadraticCurveTo(-30, hy + 22, -20, hy + 30);
  c.lineTo(20, hy + 30);
  c.quadraticCurveTo(30, hy + 22, 26, hy - 6);
  c.closePath();
  fillInk(c, cloth(c, -26, hy, 26, hy + 30, 0x2a3a4a), 2);
  face(c, 0, hy, 25, 0xbcd8d0, beaten ? 'beaten' : 'glow', beaten ? 'o' : 'none');
  // A thin, knowing smile.
  if (!beaten) {
    c.beginPath();
    c.moveTo(-6, hy + 13);
    c.quadraticCurveTo(0, hy + 16, 7, hy + 11);
    c.strokeStyle = 'rgba(30,50,50,0.9)';
    c.lineWidth = 1.6;
    c.stroke();
  }
  // Hat brim and crown.
  ellipse(c, 0, hy - 20, 46, 11);
  fillInk(c, cloth(c, -46, hy - 30, 46, hy - 10, 0x2a2a1a), 2.6);
  c.beginPath();
  c.moveTo(-22, hy - 22);
  c.quadraticCurveTo(-22, hy - 52, 0, hy - 52);
  c.quadraticCurveTo(22, hy - 52, 22, hy - 22);
  c.closePath();
  fillInk(c, cloth(c, -22, hy - 52, 22, hy - 22, 0x3a3a24), 2.4);
  c.fillStyle = '#4a7a3a';
  c.fillRect(-22, hy - 32, 44, 6);
  // Moonflowers on the band.
  for (const [x, y, r] of [[-14, -30, 7], [2, -34, 8], [16, -28, 6]] as const) {
    glowAt(c, x, hy + y, r * 2.2, r * 2.2, 0xcff4ff, beaten ? 0.15 : 0.5, 'lighter');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ellipse(c, x + Math.cos(a) * r * 0.6, hy + y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.55);
      c.fillStyle = beaten ? '#9aa4b0' : '#eaf8ff';
      c.fill();
    }
    ellipse(c, x, hy + y, r * 0.3, r * 0.3);
    c.fillStyle = '#ffe9a0';
    c.fill();
  }
}

function uhrmacher(c: Ctx, beaten: boolean) {
  aura(c, 0xffc860);
  // Stout body: waistcoat and a leather apron.
  ellipse(c, 0, -52, 36, 46);
  fillInk(c, cloth(c, -36, -98, 36, -6, 0x6a3a5a), 2.8);
  c.beginPath();
  c.moveTo(-24, -84);
  c.lineTo(24, -84);
  c.lineTo(30, -10);
  c.quadraticCurveTo(0, -2, -30, -10);
  c.closePath();
  fillInk(c, cloth(c, -24, -84, 24, -6, 0x8a5a32), 2.4);
  // A brass gear stitched on the apron.
  c.save();
  c.translate(0, -44);
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 9 : 12;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  fillInk(c, gold(c, -12, -12, 12, 12), 1.6);
  ellipse(c, 0, 0, 3.6, 3.6);
  c.fillStyle = '#5a3a1a';
  c.fill();
  c.restore();
  // Shoes.
  for (const s of [-1, 1]) {
    ellipse(c, s * 14, -4, 11, 5.5);
    fillInk(c, '#2a160c', 2);
  }
  // Arms: one holds up the giant pocket watch on its chain.
  arm(c, -30, -84, -40, -60, 0xf0ece4, 0xf0c8a8, 9);
  arm(c, 30, -84, 40, -104, 0xf0ece4, 0xf0c8a8, 9);
  c.beginPath();
  c.moveTo(40, -104);
  c.quadraticCurveTo(30, -90, 10, -80);
  c.strokeStyle = gold(c, 10, -104, 40, -80);
  c.lineWidth = 2.2;
  c.setLineDash([3, 2]);
  c.stroke();
  c.setLineDash([]);
  const wx = 48;
  const wy = -124;
  glowAt(c, wx, wy, 30, 30, 0xffd890, 0.35, 'lighter');
  ellipse(c, wx, wy - 22, 4, 4);
  fillInk(c, gold(c, wx - 4, wy - 26, wx + 4, wy - 18), 1.4);
  ellipse(c, wx, wy, 20, 20);
  fillInk(c, gold(c, wx - 20, wy - 20, wx + 20, wy + 20), 2.4);
  ellipse(c, wx, wy, 15.5, 15.5);
  const dg = c.createRadialGradient(wx - 4, wy - 4, 2, wx, wy, 16);
  dg.addColorStop(0, '#fffaf0');
  dg.addColorStop(1, '#e6d6b8');
  fillInk(c, dg, 1.4);
  c.strokeStyle = '#3a2a1a';
  c.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(wx + Math.cos(a) * 12, wy + Math.sin(a) * 12);
    c.lineTo(wx + Math.cos(a) * 14.5, wy + Math.sin(a) * 14.5);
    c.stroke();
  }
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(wx, wy);
  c.lineTo(wx + (beaten ? -9 : 0), wy + (beaten ? 4 : -11));
  c.moveTo(wx, wy);
  c.lineTo(wx + 7, wy + (beaten ? 6 : 3));
  c.stroke();
  // Head: bald dome, white tufts, a magnificent moustache, goggles on the forehead.
  const hy = -HEAD_Y + 20;
  for (const s of [-1, 1]) {
    ellipse(c, s * 25, hy + 2, 10, 12);
    fillInk(c, cloth(c, s * 25 - 10, hy - 10, s * 25 + 10, hy + 14, 0xf4f4f8), 2);
  }
  face(c, 0, hy, 26, 0xf0c8a8, beaten ? 'beaten' : 'loupe', 'none');
  glowAt(c, -8, hy - 16, 8, 5, 0xffffff, 0.35);
  // Moustache.
  c.beginPath();
  c.moveTo(0, hy + 12);
  c.quadraticCurveTo(-10, hy + 6, -20, hy + 14);
  c.quadraticCurveTo(-12, hy + 20, 0, hy + 16);
  c.quadraticCurveTo(12, hy + 20, 20, hy + 14);
  c.quadraticCurveTo(10, hy + 6, 0, hy + 12);
  fillInk(c, cloth(c, -20, hy + 6, 20, hy + 20, 0xf8f8fc), 1.8);
  // Goggles strap and lenses.
  c.beginPath();
  c.moveTo(-26, hy - 12);
  c.quadraticCurveTo(0, hy - 20, 26, hy - 12);
  c.strokeStyle = '#4a2a14';
  c.lineWidth = 4;
  c.stroke();
  for (const s of [-1, 1]) {
    ellipse(c, s * 9, hy - 17, 7, 6);
    fillInk(c, gold(c, s * 9 - 7, hy - 23, s * 9 + 7, hy - 11), 1.8);
    ellipse(c, s * 9, hy - 17, 4, 3.4);
    c.fillStyle = 'rgba(150,220,255,0.85)';
    c.fill();
  }
}

function falterbeat(c: Ctx, beaten: boolean) {
  aura(c, 0xff5fd8);
  // Two fans of strobe light behind him, magenta and cyan rays from his shoulders.
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 14, -100);
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + s * (0.2 + (k / 5) * 1.25);
      const len = k % 2 ? 58 : 76;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.09) * 10, Math.sin(a - 0.09) * 10);
      c.lineTo(Math.cos(a - 0.05) * len, Math.sin(a - 0.05) * len);
      c.lineTo(Math.cos(a + 0.05) * len, Math.sin(a + 0.05) * len);
      c.lineTo(Math.cos(a + 0.09) * 10, Math.sin(a + 0.09) * 10);
      c.closePath();
      const col = k % 2 ? 0x5fe3ff : 0xff5fd8;
      const rg = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      rg.addColorStop(0, rgb(light(col, 0.6), beaten ? 0.35 : 0.95));
      rg.addColorStop(1, rgb(col, beaten ? 0.2 : 0.75));
      fillInk(c, rg, 1.8);
      if (!beaten) glowAt(c, Math.cos(a) * len, Math.sin(a) * len, 8, 8, col, 0.6, 'lighter');
    }
    c.restore();
  }
  // Body in a sparkly jacket.
  rrect(c, -22, -112, 44, 56, 12);
  fillInk(c, cloth(c, -22, -112, 22, -56, 0x3a1a6a), 2.6);
  for (let i = 0; i < 14; i++) {
    const x = -18 + ((i * 37) % 36);
    const y = -108 + ((i * 23) % 48);
    ellipse(c, x, y, 1.3, 1.3);
    c.fillStyle = i % 2 ? '#ffd6ff' : '#9ff4ff';
    c.fill();
  }
  // Arms on the deck.
  arm(c, -20, -104, -34, -72, 0x3a1a6a, 0xd8a888, 9);
  arm(c, 20, -104, 30, -70, 0x3a1a6a, 0xd8a888, 9);
  // The DJ deck in front (hides the legs).
  c.beginPath();
  c.moveTo(-60, -74);
  c.lineTo(60, -74);
  c.lineTo(54, 0);
  c.lineTo(-54, 0);
  c.closePath();
  fillInk(c, cloth(c, -60, -74, 60, 0, 0x22142e), 2.8);
  rrect(c, -62, -82, 124, 12, 4);
  fillInk(c, cloth(c, -62, -82, 62, -70, 0x3a2a4a), 2.2);
  for (const s of [-1, 1]) {
    ellipse(c, s * 32, -77, 18, 5.5);
    fillInk(c, '#0a0610', 1.6);
    ellipse(c, s * 32, -77, 5, 1.6);
    c.fillStyle = s < 0 ? '#ff5fa2' : '#5fe3ff';
    c.fill();
  }
  // Neon strips and his name on the deck.
  for (const [y, col] of [[-62, 0xff4fd8], [-10, 0x5fe3ff]] as const) {
    glowAt(c, 0, y, 60, 6, col, beaten ? 0.15 : 0.55, 'lighter');
    c.fillStyle = rgb(col, beaten ? 0.4 : 0.95);
    c.fillRect(-50, y - 1.5, 100, 3);
  }
  c.font = '700 13px Cinzel, Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = beaten ? 'rgba(255,220,255,0.4)' : '#ffd6ff';
  c.fillText('DJ', 0, -38);
  c.fillText('STROBO', 0, -24);
  // Head: fluffy hair, a light-up headband, headphones, sunglasses.
  const hy = -HEAD_Y + 2;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * 10, hy - 24);
    c.lineTo(s * 16, hy - 42);
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    c.stroke();
    if (!beaten) glowAt(c, s * 16, hy - 46, 10, 10, s < 0 ? 0xff5fd8 : 0x5fe3ff, 0.6, 'lighter');
    ellipse(c, s * 16, hy - 46, 5, 5.6);
    fillInk(c, s < 0 ? '#ffd6ff' : '#d6faff', 1.6);
  }
  face(c, 0, hy, 26, 0xd8a888, beaten ? 'beaten' : 'shades', beaten ? 'o' : 'grin');
  c.beginPath();
  c.moveTo(-27, hy - 2);
  c.quadraticCurveTo(-28, hy - 30, 0, hy - 30);
  c.quadraticCurveTo(28, hy - 30, 27, hy - 2);
  c.quadraticCurveTo(18, hy - 14, 6, hy - 12);
  c.quadraticCurveTo(-4, hy - 20, -27, hy - 2);
  fillInk(c, cloth(c, -27, hy - 30, 27, hy, 0xf0e8ff), 2.2);
  // Headphones.
  c.beginPath();
  c.arc(0, hy - 4, 30, Math.PI * 1.08, Math.PI * 1.92);
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.stroke();
  c.strokeStyle = '#ff4fd8';
  c.lineWidth = 3.5;
  c.stroke();
  for (const s of [-1, 1]) {
    rrect(c, s * 29 - 7, hy - 10, 14, 22, 6);
    fillInk(c, cloth(c, s * 29 - 7, hy - 10, s * 29 + 7, hy + 12, 0x2a1a3a), 2);
    c.fillStyle = '#5fe3ff';
    c.fillRect(s * 29 - 1.5, hy - 6, 3, 14);
  }
}

const PAINTERS = [samtgraefin, gaertner, uhrmacher, falterbeat];

/** The boss standing on the floor, about 1.4 guests tall. Anchor: between the feet. */
export function bossTexture(n: number, beaten = false) {
  return once(`mb-${n}-${beaten ? 'b' : 'a'}`, () =>
    paint(FW, FH, (c) => {
      c.translate(FX, FY);
      PAINTERS[n - 1](c, beaten);
    }, 2),
  );
}

/** Round portrait in a brass ring (HUD plate, intro). */
export function bossPortrait(n: number, color: number, size = 96) {
  return once(`mbp-${n}-${size}`, () =>
    paint(size, size, (c) => {
      const r = size / 2;
      c.translate(r, r);
      ellipse(c, 0, 0, r - 3, r - 3);
      const g = c.createRadialGradient(0, -r * 0.2, 2, 0, 0, r);
      g.addColorStop(0, rgb(light(color, 0.2)));
      g.addColorStop(0.6, rgb(dark(color, 0.45)));
      g.addColorStop(1, rgb(dark(color, 0.75)));
      c.fillStyle = g;
      c.fill();
      c.save();
      ellipse(c, 0, 0, r - 4, r - 4);
      c.clip();
      const s = (r * 1.25) / 60;
      c.scale(s, s);
      c.translate(0, HEAD_Y - [0, 4, 20, 2][n - 1] + 10);
      PAINTERS[n - 1](c, false);
      c.restore();
      ellipse(c, 0, 0, r - 3, r - 3);
      c.strokeStyle = gold(c, -r, -r, r, r);
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.stroke();
    }, 2),
  );
}

/** The boss trophy's statuette, drawn on the trophy's plinth (origin = bottom centre, plinth top at y −26). */
export function bossTrophyArt(c: Ctx, n: number, metal: (x0: number, y0: number, x1: number, y1: number) => CanvasGradient, gem: number) {
  if (n === 1) {
    // Samtgräfin: an open fan on a stem.
    rrect(c, -4, -60, 8, 36, 3);
    fillInk(c, metal(-4, -60, 4, -24), 2);
    c.beginPath();
    c.moveTo(0, -56);
    c.arc(0, -56, 44, -Math.PI * 0.92, -Math.PI * 0.08);
    c.closePath();
    fillInk(c, metal(-44, -100, 44, -56), 2.4);
    c.strokeStyle = 'rgba(40,20,10,0.45)';
    c.lineWidth = 1.2;
    for (let a = -0.85; a <= -0.15; a += 0.1) {
      c.beginPath();
      c.moveTo(0, -56);
      c.lineTo(Math.cos(a * Math.PI) * 42, -56 + Math.sin(a * Math.PI) * 42);
      c.stroke();
    }
  } else if (n === 2) {
    // Gärtner: a moonflower in a pot with crossed shears.
    rrect(c, -18, -52, 36, 26, 5);
    fillInk(c, metal(-18, -52, 18, -26), 2);
    c.beginPath();
    c.moveTo(0, -52);
    c.quadraticCurveTo(-6, -76, 0, -92);
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ellipse(c, Math.cos(a) * 12, -100 + Math.sin(a) * 12, 10, 10);
      fillInk(c, metal(-20, -120, 20, -80), 1.6);
    }
    ellipse(c, 0, -100, 7, 7);
    fillInk(c, rgb(gem), 1.6);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * -26, -30);
      c.lineTo(s * 26, -74);
      c.strokeStyle = INK;
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = metal(-26, -74, 26, -30);
      c.lineWidth = 3;
      c.stroke();
    }
  } else if (n === 3) {
    // Uhrmacher: a pocket watch on a little stand.
    c.beginPath();
    c.moveTo(-14, -26);
    c.lineTo(0, -50);
    c.lineTo(14, -26);
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.stroke();
    c.strokeStyle = metal(-14, -50, 14, -26);
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, 0, -116, 6, 6);
    fillInk(c, metal(-6, -122, 6, -110), 1.6);
    ellipse(c, 0, -82, 32, 32);
    fillInk(c, metal(-32, -114, 32, -50), 2.6);
    ellipse(c, 0, -82, 24, 24);
    fillInk(c, '#fbf3e0', 1.6);
    c.strokeStyle = '#3a2a1a';
    c.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 19, -82 + Math.sin(a) * 19);
      c.lineTo(Math.cos(a) * 22, -82 + Math.sin(a) * 22);
      c.stroke();
    }
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(0, -82);
    c.lineTo(0, -98);
    c.moveTo(0, -82);
    c.lineTo(10, -78);
    c.stroke();
    ellipse(c, 0, -82, 2.4, 2.4);
    c.fillStyle = rgb(gem);
    c.fill();
  } else {
    // DJ: a record in a fan of light rays.
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + ((k + 0.5) / 9) * Math.PI;
      const len = k % 2 ? 42 : 52;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.1) * 20, -78 + Math.sin(a - 0.1) * 20);
      c.lineTo(Math.cos(a) * len, -78 + Math.sin(a) * len);
      c.lineTo(Math.cos(a + 0.1) * 20, -78 + Math.sin(a + 0.1) * 20);
      c.closePath();
      fillInk(c, metal(-52, -130, 52, -78), 1.8);
    }
    rrect(c, -4, -50, 8, 26, 3);
    fillInk(c, metal(-4, -50, 4, -24), 1.6);
    ellipse(c, 0, -78, 30, 30);
    fillInk(c, '#140a1a', 2.4);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    for (const r of [12, 18, 24]) {
      c.beginPath();
      c.arc(0, -78, r, 0, Math.PI * 2);
      c.stroke();
    }
    ellipse(c, 0, -78, 9, 9);
    fillInk(c, rgb(gem), 1.4);
    ellipse(c, 0, -78, 2, 2);
    c.fillStyle = '#140a1a';
    c.fill();
  }
}
