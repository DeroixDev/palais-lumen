// Painted pieces of "Kratzglück": the vending machine around the card, the three card designs,
// the gold-foil scratch coating, the soft eraser brush and the vending machine for the room.
// Painted once with Canvas 2D (no ctx.filter).

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import type { ScratchDesign } from './rules';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Card size and the scratch field on it. */
export const CARD_W = 600;
export const CARD_H = 450;
export const FIELD = { x: 236, y: 84, size: 342, cell: 102, gap: 12 };

// ---- Machine -------------------------------------------------------------------------------------

/** The machine's body around the card: lacquered wood, brass trim, bulbs down the sides. */
export function machineTexture(W: number, H: number) {
  return cached(`vend-${W}x${H}`, () =>
    paint(W, H, (c) => {
      rrect(c, 2, 2, W - 4, H - 4, 28);
      fillInk(c, gold(c, 0, 0, W * 0.6, H), 4);
      rim(c, 0.6, 2.5);
      rrect(c, 16, 16, W - 32, H - 32, 18);
      fillInk(c, vgrad(c, 16, H - 16, 0x4a1420, 0.2, 0.55), 3);
      grain(c, 16, 16, W - 32, H - 32, 600, 31, 0.05);
      // Recess where the card lands.
      rrect(c, 40, 104, W - 80, H - 132, 16);
      const rg = c.createLinearGradient(0, 104, 0, H - 28);
      rg.addColorStop(0, '#12060c');
      rg.addColorStop(1, '#2a0c18');
      fillInk(c, rg, 2.5);
      glowAt(c, W / 2, 140, W * 0.45, 120, 0xffcf7a, 0.12, 'lighter');
      // Bulbs down both sides.
      for (let i = 0; i < 8; i++) {
        for (const x of [28, W - 28]) {
          const y = 128 + i * ((H - 170) / 7);
          glowAt(c, x, y, 12, 12, 0xffcf7a, 0.5, 'lighter');
          ellipse(c, x, y, 5, 5);
          fillInk(c, '#fff1c4', 1.2);
        }
      }
    }),
  );
}

/** The marquee across the top with the dispensing slot the cards come out of. */
export function marqueeTexture(W: number) {
  return cached(`marquee-${W}`, () =>
    paint(W, 112, (c) => {
      rrect(c, 2, 2, W - 4, 104, 26);
      fillInk(c, gold(c, 0, 0, W * 0.5, 110), 4);
      rim(c, 0.6, 2.5);
      rrect(c, 16, 14, W - 32, 62, 14);
      const g = c.createLinearGradient(0, 14, 0, 76);
      g.addColorStop(0, '#3a0a1a');
      g.addColorStop(1, '#1a040c');
      fillInk(c, g, 2.5);
      glowAt(c, W / 2, 45, W * 0.4, 30, 0xff5fa2, 0.25, 'lighter');
      // Slot.
      rrect(c, 52, 86, W - 104, 14, 7);
      c.fillStyle = '#05020a';
      c.fill();
      c.strokeStyle = 'rgba(255,240,200,0.5)';
      c.lineWidth = 1.5;
      c.stroke();
      for (const x of [34, W - 34]) {
        ellipse(c, x, 93, 5, 5);
        fillInk(c, '#fff1c4', 1);
      }
    }),
  );
}

// ---- Card ----------------------------------------------------------------------------------------

/** The printed card of a design: coloured paper, brass border, legend column, field frame. */
export function cardTexture(d: ScratchDesign) {
  return cached(`card-${d.id}`, () =>
    paint(CARD_W + 24, CARD_H + 24, (c) => {
      c.translate(12, 12);
      glowAt(c, CARD_W / 2, CARD_H / 2 + 12, CARD_W * 0.55, CARD_H * 0.6, 0x05020a, 0.7);
      rrect(c, 0, 0, CARD_W, CARD_H, 20);
      fillInk(c, vgrad(c, 0, CARD_H, d.card, 0.3, 0.45), 3);
      c.save();
      rrect(c, 0, 0, CARD_W, CARD_H, 20);
      c.clip();
      // Guilloche lines like a real ticket.
      c.strokeStyle = rgb(light(d.card, 0.35), 0.18);
      c.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        c.beginPath();
        for (let x = 0; x <= CARD_W; x += 8) {
          const y = 20 + i * 17 + Math.sin(x * 0.03 + i * 0.7) * 6;
          if (x) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.stroke();
      }
      grain(c, 0, 0, CARD_W, CARD_H, 500, 17, 0.06);
      glowAt(c, CARD_W * 0.25, 30, 260, 80, 0xffffff, 0.12, 'lighter');
      c.restore();
      rrect(c, 8, 8, CARD_W - 16, CARD_H - 16, 14);
      c.strokeStyle = gold(c, 0, 0, CARD_W, CARD_H);
      c.lineWidth = 4;
      c.stroke();
      // Header band.
      rrect(c, 20, 16, CARD_W - 40, 56, 12);
      fillInk(c, vgrad(c, 16, 72, dark(d.card, 0.45), 0.15, 0.3), 2);
      // Legend panel.
      rrect(c, 20, FIELD.y, 196, FIELD.size, 12);
      c.fillStyle = 'rgba(10,4,10,0.45)';
      c.fill();
      c.strokeStyle = 'rgba(255,240,200,0.25)';
      c.lineWidth = 1.5;
      c.stroke();
      // Field frame.
      rrect(c, FIELD.x - 8, FIELD.y - 8, FIELD.size + 16, FIELD.size + 16, 14);
      fillInk(c, gold(c, FIELD.x, FIELD.y, FIELD.x + FIELD.size, FIELD.y + FIELD.size), 2.5);
      rrect(c, FIELD.x, FIELD.y, FIELD.size, FIELD.size, 8);
      c.fillStyle = '#f6ecd4';
      c.fill();
      for (let r = 0; r < 3; r++)
        for (let q = 0; q < 3; q++) {
          const x = FIELD.x + 6 + q * (FIELD.cell + FIELD.gap);
          const y = FIELD.y + 6 + r * (FIELD.cell + FIELD.gap);
          rrect(c, x, y, FIELD.cell, FIELD.cell, 10);
          const cg = c.createRadialGradient(x + FIELD.cell / 2, y + FIELD.cell / 2, 4, x + FIELD.cell / 2, y + FIELD.cell / 2, FIELD.cell * 0.7);
          cg.addColorStop(0, '#fffaf0');
          cg.addColorStop(1, '#e2d2ac');
          c.fillStyle = cg;
          c.fill();
          c.strokeStyle = 'rgba(120,80,30,0.35)';
          c.lineWidth = 1.5;
          c.stroke();
        }
    }),
  );
}

/** The scratch coating ("Goldschicht"): foil with a big sunburst over the whole field (FIELD.size square). */
export function coatingTexture(d: ScratchDesign) {
  return cached(`coat-${d.id}`, () =>
    paint(FIELD.size, FIELD.size, (c) => {
      const S = FIELD.size;
      const [base, deep, acc] = d.wing;
      const bg = c.createLinearGradient(0, 0, S, S);
      bg.addColorStop(0, rgb(light(base, 0.25)));
      bg.addColorStop(0.5, rgb(base));
      bg.addColorStop(1, rgb(dark(base, 0.35)));
      rrect(c, 0, 0, S, S, 8);
      c.fillStyle = bg;
      c.fill();
      c.save();
      rrect(c, 0, 0, S, S, 8);
      c.clip();
      // The foil: a big art-deco sunburst rising from the lower edge, a stepped arch over it
      // and the half sun in the middle (the design's colours).
      const cx = S / 2, by = S * 0.78;
      for (let i = 0; i < 22; i++) {
        const a0 = Math.PI + (i / 22) * Math.PI;
        const a1 = Math.PI + ((i + 1) / 22) * Math.PI;
        c.beginPath();
        c.moveTo(cx, by);
        c.lineTo(cx + Math.cos(a0) * S, by + Math.sin(a0) * S);
        c.lineTo(cx + Math.cos(a1) * S, by + Math.sin(a1) * S);
        c.closePath();
        c.fillStyle = i % 2 ? rgb(light(base, 0.18)) : rgb(dark(base, 0.08));
        c.fill();
      }
      for (const [rr, w] of [[S * 0.62, 6], [S * 0.5, 3], [S * 0.42, 3]] as const) {
        c.beginPath();
        c.arc(cx, by, rr, Math.PI, Math.PI * 2);
        c.strokeStyle = rgb(deep, 0.75);
        c.lineWidth = w;
        c.stroke();
      }
      c.beginPath();
      c.arc(cx, by, S * 0.2, Math.PI, Math.PI * 2);
      c.closePath();
      const sun = c.createRadialGradient(cx - 20, by - 40, 4, cx, by, S * 0.2);
      sun.addColorStop(0, rgb(light(acc, 0.5)));
      sun.addColorStop(0.6, rgb(acc));
      sun.addColorStop(1, rgb(dark(acc, 0.25)));
      fillInk(c, sun, 3);
      c.fillStyle = rgb(deep);
      c.fillRect(0, by, S, 8);
      c.fillStyle = rgb(dark(base, 0.25));
      c.fillRect(0, by + 8, S, S - by);
      // Deco steps along the bottom band.
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) * (S / 9);
        c.beginPath();
        c.moveTo(x - 12, S);
        c.lineTo(x - 12, by + 30);
        c.lineTo(x, by + 20);
        c.lineTo(x + 12, by + 30);
        c.lineTo(x + 12, S);
        c.fillStyle = rgb(light(base, 0.1), 0.6);
        c.fill();
      }
      // Foil grain: thousands of tiny dabs (the metallic sheen).
      const r = seeded(d.id.length * 97);
      for (let i = 0; i < 5200; i++) {
        const x = r() * S;
        const y = r() * S;
        c.fillStyle = r() < 0.5 ? `rgba(255,250,235,${0.05 + r() * 0.12})` : `rgba(20,8,16,${0.05 + r() * 0.1})`;
        c.beginPath();
        c.ellipse(x, y, 1.2 + r() * 1.6, 0.8 + r() * 0.8, r() * 3, 0, Math.PI * 2);
        c.fill();
      }
      // Metallic foil sheen.
      const sh = c.createLinearGradient(0, 0, S, S * 0.6);
      sh.addColorStop(0.2, 'rgba(255,255,255,0)');
      sh.addColorStop(0.45, 'rgba(255,255,255,0.22)');
      sh.addColorStop(0.55, 'rgba(255,255,255,0)');
      c.fillStyle = sh;
      c.fillRect(0, 0, S, S);
      c.restore();
      // "Hier kratzen" hint, embossed.
      c.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(20,8,16,0.55)';
      c.fillText('HIER KRATZEN', S / 2, S - 26 + 1.5);
      c.fillStyle = 'rgba(255,248,230,0.85)';
      c.fillText('HIER KRATZEN', S / 2, S - 26);
    }, 2),
  );
}

/** Soft round eraser stamp (white; the alpha does the erasing). */
export function brushTexture() {
  return cached('brush', () =>
    paint(48, 48, (c) => {
      const g = c.createRadialGradient(24, 24, 4, 24, 24, 24);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 48, 48);
    }, 1),
  );
}

/** Golden ring for a winning symbol. */
export function winRingTexture() {
  return cached('win-ring', () =>
    paint(130, 130, (c) => {
      glowAt(c, 65, 65, 64, 64, 0xffcf7a, 0.45, 'lighter');
      rrect(c, 10, 10, 110, 110, 16);
      c.strokeStyle = '#ffcf7a';
      c.lineWidth = 5;
      c.stroke();
      rrect(c, 10, 10, 110, 110, 16);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1.5;
      c.stroke();
    }, 2),
  );
}

/** A brass coin held while scratching. */
export function scratchCoinTexture() {
  return cached('scr-coin', () =>
    paint(56, 56, (c) => {
      ellipse(c, 30, 32, 22, 22);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fill();
      ellipse(c, 27, 27, 22, 22);
      fillInk(c, gold(c, 5, 5, 49, 49), 2.2);
      ellipse(c, 27, 27, 15, 15);
      c.strokeStyle = 'rgba(90,50,10,0.6)';
      c.lineWidth = 1.5;
      c.stroke();
      for (const s of [-1, 1]) {
        ellipse(c, 27 + s * 5, 27, 5, 3.5);
        c.fillStyle = 'rgba(90,50,10,0.55)';
        c.fill();
      }
    }, 2),
  );
}

// ---- Room station: scratch-card vending machine ----------------------------------------------------

function scratchStation(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 210, 70, 170, (x) => {
    shadow(x, 0, -4, 44, 14, 0.6);
    const bw = 60;
    // Tall lacquered box.
    rrect(x, -bw / 2, -146, bw, 138, 8);
    fillInk(x, vgrad(x, -146, -8, 0x7a1d34, 0.25, 0.5), 2.2);
    const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.18)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(0.8, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.4)');
    rrect(x, -bw / 2, -146, bw, 138, 8);
    x.fillStyle = sg;
    x.fill();
    // Crown with a little sun.
    x.beginPath();
    x.moveTo(-bw / 2 - 2, -144);
    x.lineTo(-bw / 2 - 2, -152);
    x.quadraticCurveTo(0, -170, bw / 2 + 2, -152);
    x.lineTo(bw / 2 + 2, -144);
    x.closePath();
    fillInk(x, gold(x, -bw / 2, -170, bw / 2, -144), 2);
    x.beginPath();
    x.arc(0, -150, 6, Math.PI, Math.PI * 2);
    x.closePath();
    x.fillStyle = '#fff1c4';
    x.fill();
    // Glass window with rows of cards in three colours.
    rrect(x, -24, -138, 48, 70, 5);
    fillInk(x, gold(x, -24, -138, 24, -68), 1.6);
    rrect(x, -20, -134, 40, 62, 3);
    x.fillStyle = '#1a0a12';
    x.fill();
    const cols = ['#c8649a', '#5a7ad8', '#e0b25a'];
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 3; k++) {
        const cx = -16 + k * 12;
        const cy = -128 + row * 20;
        rrect(x, cx, cy, 10, 15, 1.5);
        x.fillStyle = cols[row];
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.5)';
        x.fillRect(cx + 2, cy + 6, 6, 5);
      }
    x.fillStyle = 'rgba(255,255,255,0.15)';
    x.beginPath();
    x.moveTo(-20, -134);
    x.lineTo(-6, -134);
    x.lineTo(-16, -72);
    x.lineTo(-20, -72);
    x.closePath();
    x.fill();
    // Coin slot, selector buttons and the dispensing tray.
    rrect(x, -bw / 2 - 2, -62, bw + 4, 16, 4);
    fillInk(x, vgrad(x, -62, -46, 0x3a0e1a, 0.4, 0.3), 1.8);
    for (let k = 0; k < 3; k++) {
      ellipse(x, -18 + k * 9, -54, 3.4, 2.6);
      x.fillStyle = cols[k];
      x.fill();
    }
    rrect(x, 12, -58, 10, 8, 2);
    fillInk(x, gold(x, 12, -58, 22, -50), 1);
    x.fillStyle = '#05020a';
    x.fillRect(16, -57, 2, 6);
    rrect(x, -18, -38, 36, 12, 3);
    fillInk(x, gold(x, -18, -38, 18, -26), 1.4);
    rrect(x, -14, -35, 28, 6, 2);
    x.fillStyle = '#12060c';
    x.fill();
    // A card sticking out of the tray.
    x.save();
    x.translate(4, -36);
    x.rotate(-0.15);
    rrect(x, -7, -5, 14, 9, 1.5);
    x.fillStyle = '#c8649a';
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 1;
    x.stroke();
    x.restore();
    x.fillStyle = gold(x, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
    // Bulbs on the edges.
    for (let k = 0; k < 7; k++)
      for (const s of [-1, 1]) {
        ellipse(x, s * (bw / 2 - 3), -136 + k * 18, 1.7, 1.7);
        x.fillStyle = '#fff1c4';
        x.fill();
      }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H - 110);
  glow.width = 96;
  glow.height = 120;
  glow.tint = 0xff5fa2;
  glow.alpha = 0.45;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H - 176;
  return c;
}

registerPaintedStation('scratch', scratchStation);
export { scratchStation };
