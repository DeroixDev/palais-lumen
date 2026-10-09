// Painted pieces of "Glühwürmchen-Bingo": the night-garden scene, the glass jar, the bingo
// card (3×3 or 4×4), the fireflies, the lit-cell glow and the jar cabinet for the room.
// Painted once with Canvas 2D (no ctx.filter).

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { ellipse, fillInk, glowAt, gold, grain, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export const FIREFLY = 0xd8ff6a;

function leaf(c: Ctx, x: number, y: number, len: number, ang: number, col: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0);
  c.fillStyle = col;
  c.fill();
  c.restore();
}

/** Night garden behind the jar and card, in a brass frame. */
export function gardenTexture(W: number, H: number) {
  return cached(`garden-${W}x${H}`, () =>
    paint(W, H, (c) => {
      rrect(c, 2, 2, W - 4, H - 4, 28);
      fillInk(c, gold(c, 0, 0, W * 0.6, H), 4);
      rim(c, 0.6, 2.5);
      rrect(c, 16, 16, W - 32, H - 32, 18);
      const g = c.createLinearGradient(0, 16, 0, H - 16);
      g.addColorStop(0, '#071a22');
      g.addColorStop(0.55, '#0e2a2a');
      g.addColorStop(1, '#14301e');
      fillInk(c, g, 3);
      c.save();
      rrect(c, 16, 16, W - 32, H - 32, 18);
      c.clip();
      const r = seeded(61);
      glowAt(c, W * 0.8, 60, 260, 140, 0xfff1c4, 0.1, 'lighter');
      grain(c, 16, 16, W - 32, H - 32, 700, 8, 0.03);
      for (let i = 0; i < 160; i++) {
        c.fillStyle = `rgba(255,246,230,${0.12 + r() * 0.35})`;
        c.beginPath();
        c.arc(16 + r() * (W - 32), 16 + r() * H * 0.45, 0.4 + r() * 0.9, 0, Math.PI * 2);
        c.fill();
      }
      // Hedges and leaves along the bottom and sides.
      for (let i = 0; i < 120; i++) {
        const side = r();
        const x = side < 0.6 ? r() * W : side < 0.8 ? 16 + r() * 50 : W - 16 - r() * 50;
        const y = side < 0.6 ? H - 20 - r() * 90 : 120 + r() * (H - 160);
        const shade = Math.floor(30 + r() * 40);
        leaf(c, x, y, 20 + r() * 30, r() * Math.PI * 2, `rgba(${shade - 10},${shade + 30},${shade},${0.5 + r() * 0.4})`);
      }
      // Faint fireflies in the dark.
      for (let i = 0; i < 26; i++) glowAt(c, 30 + r() * (W - 60), 40 + r() * (H - 80), 8, 8, 0xd8ff6a, 0.25 + r() * 0.3, 'lighter');
      // Wooden shelf the jar and card stand on.
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(16, H - 92, W - 32, 8);
      c.restore();
    }),
  );
}

/** The glass jar with cork lid and brass band (240×340, open-mouth at the top). */
export const JAR = { w: 240, h: 340, mouthY: 62, inner: { x: 34, y: 92, w: 172, h: 222 } };
export function jarTexture() {
  return cached('jar', () =>
    paint(JAR.w, JAR.h, (c) => {
      const w = JAR.w;
      const h = JAR.h;
      shadow(c, w / 2, h - 8, 100, 14, 0.55);
      // Glass body.
      c.beginPath();
      c.moveTo(62, 60);
      c.lineTo(178, 60);
      c.quadraticCurveTo(184, 80, 212, 96);
      c.quadraticCurveTo(226, 106, 226, 132);
      c.lineTo(226, h - 40);
      c.quadraticCurveTo(226, h - 12, 196, h - 12);
      c.lineTo(44, h - 12);
      c.quadraticCurveTo(14, h - 12, 14, h - 40);
      c.lineTo(14, 132);
      c.quadraticCurveTo(14, 106, 28, 96);
      c.quadraticCurveTo(56, 80, 62, 60);
      c.closePath();
      const gg = c.createLinearGradient(14, 0, 226, 0);
      gg.addColorStop(0, 'rgba(180,230,210,0.28)');
      gg.addColorStop(0.3, 'rgba(120,180,170,0.10)');
      gg.addColorStop(0.75, 'rgba(120,180,170,0.08)');
      gg.addColorStop(1, 'rgba(180,230,210,0.3)');
      c.fillStyle = gg;
      c.fill();
      c.strokeStyle = 'rgba(20,10,20,0.75)';
      c.lineWidth = 3;
      c.stroke();
      c.strokeStyle = 'rgba(220,255,240,0.45)';
      c.lineWidth = 1.5;
      c.stroke();
      // Grass and a twig inside.
      c.save();
      c.clip();
      glowAt(c, w / 2, h * 0.58, 100, 120, 0xd8ff6a, 0.18, 'lighter');
      const r = seeded(33);
      for (let i = 0; i < 40; i++) {
        const x = 20 + r() * 200;
        c.strokeStyle = `rgba(${40 + r() * 30},${90 + r() * 50},${50 + r() * 30},0.85)`;
        c.lineWidth = 2 + r() * 2;
        c.beginPath();
        c.moveTo(x, h - 12);
        c.quadraticCurveTo(x + (r() - 0.5) * 30, h - 50, x + (r() - 0.5) * 40, h - 50 - r() * 50);
        c.stroke();
      }
      c.strokeStyle = '#4a2e1a';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(40, h - 30);
      c.quadraticCurveTo(110, h - 120, 190, h - 170);
      c.stroke();
      c.restore();
      // Reflections.
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(34, 140);
      c.quadraticCurveTo(30, 220, 36, h - 60);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(204, 150);
      c.lineTo(204, h - 70);
      c.stroke();
      // Brass band at the neck.
      rrect(c, 54, 50, 132, 18, 6);
      fillInk(c, gold(c, 54, 50, 186, 68), 2);
      rim(c, 0.6, 1.4);
      // Cork lid, ajar (tilted back).
      c.save();
      c.translate(120, 36);
      c.rotate(-0.22);
      rrect(c, -58, -18, 116, 30, 10);
      const cg = c.createLinearGradient(0, -18, 0, 12);
      cg.addColorStop(0, '#d8a870');
      cg.addColorStop(1, '#8a5a30');
      fillInk(c, cg, 2.2);
      const rr = seeded(5);
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(70,40,20,${0.2 + rr() * 0.3})`;
        c.fillRect(-54 + rr() * 108, -14 + rr() * 22, 2, 2);
      }
      c.restore();
    }),
  );
}

/** The bingo card: cream paper with a brass border and embossed cells. */
export const CARD = 420;
export function cardTexture(size: number) {
  return cached(`card-${size}`, () =>
    paint(CARD + 20, CARD + 20, (c) => {
      c.translate(10, 10);
      glowAt(c, CARD / 2, CARD / 2 + 10, CARD * 0.55, CARD * 0.55, 0x050208, 0.6);
      rrect(c, 0, 0, CARD, CARD, 22);
      fillInk(c, gold(c, 0, 0, CARD, CARD), 4);
      rim(c, 0.6, 2);
      rrect(c, 12, 12, CARD - 24, CARD - 24, 14);
      const pg = c.createLinearGradient(0, 12, 0, CARD - 12);
      pg.addColorStop(0, '#f8eed2');
      pg.addColorStop(1, '#e2cfa2');
      fillInk(c, pg, 2);
      grain(c, 12, 12, CARD - 24, CARD - 24, 300, 4, 0.05);
      const { cell, gap, x0 } = cardGrid(size);
      for (let r = 0; r < size; r++)
        for (let q = 0; q < size; q++) {
          const x = x0 + q * (cell + gap);
          const y = x0 + r * (cell + gap);
          rrect(c, x, y + 2, cell, cell, 12);
          c.fillStyle = 'rgba(255,255,255,0.6)';
          c.fill();
          rrect(c, x, y, cell, cell, 12);
          const cg = c.createLinearGradient(0, y, 0, y + cell);
          cg.addColorStop(0, '#2a3a2a');
          cg.addColorStop(1, '#14201a');
          fillInk(c, cg, 2);
          rrect(c, x + 5, y + 5, cell - 10, cell - 10, 9);
          c.strokeStyle = 'rgba(216,255,106,0.16)';
          c.lineWidth = 1.5;
          c.stroke();
        }
      // Tiny moths in the corners.
      for (const [x, y] of [[22, 22], [CARD - 22, 22], [22, CARD - 22], [CARD - 22, CARD - 22]]) {
        ellipse(c, x - 3, y, 3, 2);
        ellipse(c, x + 3, y, 3, 2);
        c.fillStyle = '#9a6f25';
        c.fill();
      }
    }),
  );
}

export function cardGrid(size: number) {
  const gap = size === 3 ? 14 : 10;
  const x0 = 30;
  const cell = (CARD - x0 * 2 - gap * (size - 1)) / size;
  return { cell, gap, x0 };
}

/** A firefly seen from above: dark wings, glowing abdomen (48×48). */
export function fireflyTexture() {
  return cached('firefly', () =>
    paint(48, 48, (c) => {
      glowAt(c, 24, 30, 20, 20, FIREFLY, 0.75, 'lighter');
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(24 + s * 7, 20, 9, 5, s * 0.5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(220,230,255,0.5)';
        c.fill();
        c.strokeStyle = 'rgba(20,10,20,0.6)';
        c.lineWidth = 1;
        c.stroke();
      }
      ellipse(c, 24, 18, 4, 6);
      fillInk(c, '#3a2a1a', 1.2);
      ellipse(c, 24, 30, 5, 7);
      const g = c.createRadialGradient(24, 30, 1, 24, 30, 7);
      g.addColorStop(0, '#ffffe0');
      g.addColorStop(1, rgb(FIREFLY));
      c.fillStyle = g;
      c.fill();
      ellipse(c, 24, 12, 3, 3);
      c.fillStyle = '#c84a2a';
      c.fill();
    }, 2.5),
  );
}

/** Small plate for a drawn number in the tray. */
export function slotTexture(w: number, h: number, lit: boolean) {
  return cached(`slot-${w}x${h}-${lit}`, () =>
    paint(w + 6, h + 6, (c) => {
      c.translate(3, 3);
      rrect(c, 0, 0, w, h, 8);
      fillInk(c, lit ? vgrad(c, 0, h, 0xe0b25a, 0.4, 0.3) : vgrad(c, 0, h, 0x1a2a22, 0.15, 0.4), 1.6);
      c.strokeStyle = lit ? 'rgba(255,248,220,0.7)' : 'rgba(216,255,106,0.18)';
      c.lineWidth = 1;
      rrect(c, 2, 2, w - 4, h - 4, 6);
      c.stroke();
    }, 2),
  );
}

// ---- Room station: the jar cabinet --------------------------------------------------------------

function bingoStation(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 210, 70, 170, (x) => {
    shadow(x, 0, -4, 46, 14, 0.6);
    // Stool.
    shadow(x, 0, 34, 16, 6, 0.45);
    x.fillStyle = gold(x, -2, 18, 2, 30);
    x.fillRect(-2, 18, 4, 14);
    ellipse(x, 0, 16, 12, 6);
    fillInk(x, vgrad(x, 10, 22, 0x2a4a2a, 0.35, 0.3), 1.6);
    const bw = 66;
    // Wooden cabinet with brass trim.
    rrect(x, -bw / 2, -70, bw, 62, 8);
    fillInk(x, vgrad(x, -70, -8, 0x5a3418, 0.25, 0.5), 2.2);
    const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.16)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.38)');
    rrect(x, -bw / 2, -70, bw, 62, 8);
    x.fillStyle = sg;
    x.fill();
    for (let i = 0; i < 3; i++) {
      x.strokeStyle = 'rgba(30,14,6,0.35)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(-bw / 2 + 4, -58 + i * 16);
      x.lineTo(bw / 2 - 4, -58 + i * 16);
      x.stroke();
    }
    // Front: a little bingo card behind glass.
    rrect(x, -20, -62, 40, 30, 4);
    fillInk(x, gold(x, -20, -62, 20, -32), 1.4);
    rrect(x, -16, -58, 32, 22, 2);
    x.fillStyle = '#f2e6c9';
    x.fill();
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        rrect(x, -14 + j * 10, -56 + i * 6.6, 8, 5, 1);
        x.fillStyle = (i + j) % 3 === 0 ? '#d8ff6a' : '#2a3a2a';
        x.fill();
      }
    // Deck with a release lever.
    rrect(x, -bw / 2 - 2, -28, bw + 4, 12, 4);
    fillInk(x, vgrad(x, -28, -16, 0x3a2410, 0.4, 0.3), 1.8);
    ellipse(x, 14, -22, 6, 3.5);
    fillInk(x, vgrad(x, -26, -18, 0xd8ff6a, 0.4, 0.2), 1.2);
    // Brass collar.
    rrect(x, -bw / 2 - 2, -76, bw + 4, 10, 4);
    fillInk(x, gold(x, -bw / 2, -76, bw / 2, -66), 1.8);
    // Big glass jar on top.
    x.beginPath();
    x.moveTo(-14, -146);
    x.lineTo(14, -146);
    x.quadraticCurveTo(16, -138, 26, -132);
    x.quadraticCurveTo(30, -128, 30, -120);
    x.lineTo(30, -82);
    x.quadraticCurveTo(30, -76, 24, -76);
    x.lineTo(-24, -76);
    x.quadraticCurveTo(-30, -76, -30, -82);
    x.lineTo(-30, -120);
    x.quadraticCurveTo(-30, -128, -26, -132);
    x.quadraticCurveTo(-16, -138, -14, -146);
    x.closePath();
    x.fillStyle = 'rgba(140,200,180,0.22)';
    x.fill();
    x.strokeStyle = 'rgba(20,10,20,0.8)';
    x.lineWidth = 2;
    x.stroke();
    x.save();
    x.clip();
    glowAt(x, 0, -104, 34, 34, 0xd8ff6a, 0.35, 'lighter');
    const r = seeded(12);
    for (let i = 0; i < 9; i++) {
      const fx = -22 + r() * 44;
      const fy = -132 + r() * 50;
      glowAt(x, fx, fy, 5, 5, 0xd8ff6a, 0.9, 'lighter');
      ellipse(x, fx, fy, 1.6, 1.6);
      x.fillStyle = '#ffffe0';
      x.fill();
    }
    for (let i = 0; i < 10; i++) {
      x.strokeStyle = 'rgba(60,120,60,0.8)';
      x.lineWidth = 1.4;
      const gx = -26 + i * 5.5;
      x.beginPath();
      x.moveTo(gx, -76);
      x.quadraticCurveTo(gx + 2, -86, gx + (i % 2 ? 4 : -3), -94);
      x.stroke();
    }
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.45)';
    x.lineWidth = 2.5;
    x.beginPath();
    x.moveTo(-23, -120);
    x.lineTo(-23, -88);
    x.stroke();
    // Cork and brass band.
    rrect(x, -15, -150, 30, 7, 3);
    fillInk(x, gold(x, -15, -150, 15, -143), 1.2);
    rrect(x, -12, -160, 24, 11, 4);
    fillInk(x, vgrad(x, -160, -149, 0xc8955a, 0.3, 0.3), 1.4);
    // Kick plate.
    x.fillStyle = gold(x, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H - 112);
  glow.width = 100;
  glow.height = 110;
  glow.tint = FIREFLY;
  glow.alpha = 0.5;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H - 172;
  return c;
}

registerPaintedStation('bingo', bingoStation);
export { bingoStation };
