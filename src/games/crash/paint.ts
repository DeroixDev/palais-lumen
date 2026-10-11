// Painted pieces of "Mondflug": the night sky, moon, sky lantern, candle, clouds, the observatory
// window frame and the brass multiplier display. All drawn once with Canvas 2D (no ctx.filter).

import type { Texture } from 'pixi.js';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, rgb, rrect, seeded, shadow } from '../../world/painted/brush';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

// ---- Sky -----------------------------------------------------------------------------------------

/** The sky behind everything: deep blue to plum with a soft nebula and painted haze. Size-dependent. */
export function skyTexture(w: number, h: number) {
  return paint(w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070b26');
    g.addColorStop(0.45, '#161a46');
    g.addColorStop(0.78, '#2c1648');
    g.addColorStop(1, '#4a1c44');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Milky haze and nebula dabs.
    const r = seeded(77);
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = h * (0.1 + r() * 0.7);
      glowAt(c, x, y, 60 + r() * 140, 30 + r() * 60, r() < 0.5 ? 0x6a4aa8 : 0x2a5a9a, 0.08 + r() * 0.06);
    }
    // Moonlight wash from the upper right.
    glowAt(c, w * 0.85, h * 0.12, w * 0.6, h * 0.55, 0xfff1c4, 0.1);
    // Painterly brush strokes.
    grain(c, 0, 0, w, h, Math.round((w * h) / 700), 21, 0.035);
    // Tiny fixed background stars.
    for (let i = 0; i < (w * h) / 1400; i++) {
      const a = 0.2 + r() * 0.45;
      c.fillStyle = `rgba(255,246,230,${a})`;
      c.beginPath();
      c.arc(r() * w, r() * h * 0.92, 0.5 + r() * 0.7, 0, Math.PI * 2);
      c.fill();
    }
  }, 1.5);
}

/** Rooftops and garden hedges of the casino, a dark painted silhouette with a few lit windows. */
export function skylineTexture(w: number) {
  const h = 150;
  return paint(w, h, (c) => {
    const r = seeded(5);
    // Far hedges.
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 18) c.lineTo(x, 70 + Math.sin(x * 0.03) * 10 + r() * 8);
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = '#1c1036';
    c.fill();
    // Casino roof with a dome and a lamp spire.
    const dx = w * 0.62;
    c.beginPath();
    c.moveTo(dx - 150, h);
    c.lineTo(dx - 150, 92);
    c.lineTo(dx - 70, 92);
    c.lineTo(dx - 70, 70);
    c.quadraticCurveTo(dx, 4, dx + 70, 70);
    c.lineTo(dx + 70, 92);
    c.lineTo(dx + 160, 92);
    c.lineTo(dx + 160, h);
    c.closePath();
    fillInk(c, '#140a26', 2);
    c.strokeStyle = 'rgba(224,178,90,0.55)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(dx - 70, 70);
    c.quadraticCurveTo(dx, 4, dx + 70, 70);
    c.stroke();
    c.beginPath();
    c.moveTo(dx, 37);
    c.lineTo(dx, 12);
    c.stroke();
    // Lit windows.
    for (let i = 0; i < 9; i++) {
      const x = dx - 136 + i * 34;
      if (Math.abs(x - dx) < 60) continue;
      glowAt(c, x + 6, 112, 16, 12, 0xffc46a, 0.35);
      c.fillStyle = r() < 0.75 ? '#ffd27a' : '#8a5a2a';
      rrect(c, x, 104, 12, 18, 3);
      c.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = dx - 36 + i * 30;
      c.fillStyle = '#ffdf96';
      c.beginPath();
      c.arc(x + 6, 74, 6, Math.PI, 0);
      c.lineTo(x + 12, 86);
      c.lineTo(x, 86);
      c.closePath();
      c.fill();
    }
    // Near hedges, rounded topiary.
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 30) {
      const y = 116 + Math.sin(x * 0.05) * 6;
      c.arc(x, y + 6, 20 + r() * 8, Math.PI, 0);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = '#0d0818';
    c.fill();
    c.strokeStyle = 'rgba(120,140,220,0.15)';
    c.lineWidth = 1.5;
    c.stroke();
  }, 1.5);
}

export function cloudTexture(i: number) {
  return cached(`cloud-${i}`, () =>
    paint(320, 110, (c) => {
      const r = seeded(31 + i * 17);
      const blobs: [number, number, number][] = [];
      for (let k = 0; k < 7; k++) blobs.push([50 + r() * 220, 58 + (r() - 0.5) * 24, 22 + r() * 26]);
      // Shadowed underside first, then the lit top.
      for (const [x, y, rad] of blobs) glowAt(c, x, y + 8, rad * 1.6, rad * 0.9, 0x2a1a48, 0.55);
      for (const [x, y, rad] of blobs) glowAt(c, x - 4, y - 6, rad * 1.4, rad * 0.8, 0x9a8ac8, 0.38);
      for (const [x, y, rad] of blobs) glowAt(c, x - 8, y - 12, rad * 0.8, rad * 0.4, 0xfff1dc, 0.16);
    }),
  );
}

export function starTexture() {
  return cached('star', () =>
    paint(24, 24, (c) => {
      glowAt(c, 12, 12, 11, 11, 0xfff6e6, 0.5);
      c.fillStyle = 'rgba(255,250,240,0.95)';
      c.beginPath();
      c.moveTo(12, 3);
      c.quadraticCurveTo(13, 11, 21, 12);
      c.quadraticCurveTo(13, 13, 12, 21);
      c.quadraticCurveTo(11, 13, 3, 12);
      c.quadraticCurveTo(11, 11, 12, 3);
      c.fill();
    }),
  );
}

// ---- Moon, sky lantern, candle -----------------------------------------------------------------------

export const MOON_R = 54;

export function moonTexture() {
  return cached('moon', () =>
    paint(140, 140, (c) => {
      c.translate(70, 70);
      glowAt(c, 0, 0, 68, 68, 0xfff1c4, 0.35);
      c.beginPath();
      c.arc(0, 0, MOON_R, 0, Math.PI * 2);
      const g = c.createRadialGradient(-18, -20, 6, 0, 0, MOON_R);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(0.55, '#f6e2a8');
      g.addColorStop(1, '#c9a25a');
      fillInk(c, g, 2.5);
      c.save();
      c.beginPath();
      c.arc(0, 0, MOON_R - 1, 0, Math.PI * 2);
      c.clip();
      const craters: [number, number, number][] = [
        [-16, -10, 11],
        [18, 14, 14],
        [8, -26, 6],
        [-22, 22, 7],
        [26, -8, 5],
        [-2, 6, 4],
      ];
      for (const [x, y, rr] of craters) {
        ellipse(c, x, y, rr, rr * 0.85);
        c.fillStyle = 'rgba(168,120,48,0.32)';
        c.fill();
        c.strokeStyle = 'rgba(255,250,230,0.45)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(x + 1, y + 1, rr, 0.2, Math.PI * 0.9);
        c.stroke();
      }
      // Terminator shade on the lower right.
      const s = c.createLinearGradient(-MOON_R, -MOON_R, MOON_R, MOON_R);
      s.addColorStop(0.55, 'rgba(90,50,30,0)');
      s.addColorStop(1, 'rgba(90,50,30,0.35)');
      c.fillStyle = s;
      c.fillRect(-MOON_R, -MOON_R, MOON_R * 2, MOON_R * 2);
      c.restore();
    }),
  );
}

/** The sky lantern ("Himmelslaterne"): a paper lantern lit from inside by its little flame. Upright. */
export function flyerTexture() {
  return cached('flyer', () =>
    paint(96, 96, (c) => {
      c.translate(48, 50);
      glowAt(c, 0, 4, 46, 46, 0xffb347, 0.45);
      // Paper body: wide dome on top, narrowing to the ring.
      c.beginPath();
      c.moveTo(-15, 28);
      c.bezierCurveTo(-30, 8, -30, -26, -20, -36);
      c.quadraticCurveTo(0, -46, 20, -36);
      c.bezierCurveTo(30, -26, 30, 8, 15, 28);
      c.closePath();
      const g = c.createRadialGradient(0, 16, 3, 0, -2, 42);
      g.addColorStop(0, '#fffbe6');
      g.addColorStop(0.35, '#ffd98a');
      g.addColorStop(0.75, '#f29a3a');
      g.addColorStop(1, '#b8501e');
      fillInk(c, g, 2.2);
      // Paper seams.
      c.strokeStyle = 'rgba(150,70,20,0.45)';
      c.lineWidth = 1.2;
      for (const k of [-0.55, 0, 0.55]) {
        c.beginPath();
        c.moveTo(k * 15, 28);
        c.bezierCurveTo(k * 30, 8, k * 30, -26, k * 20, -38);
        c.stroke();
      }
      // Rim light on the left.
      c.beginPath();
      c.moveTo(-20, -32);
      c.bezierCurveTo(-27, -20, -26, 4, -16, 20);
      c.strokeStyle = 'rgba(255,248,220,0.6)';
      c.lineWidth = 2;
      c.stroke();
      // Small art-deco band of the house.
      c.beginPath();
      c.moveTo(-26, -14);
      c.quadraticCurveTo(0, -8, 26, -14);
      c.strokeStyle = 'rgba(168,100,30,0.7)';
      c.lineWidth = 2.4;
      c.stroke();
      // Wire ring and the flame below.
      ellipse(c, 0, 29, 15, 4);
      c.strokeStyle = INK;
      c.lineWidth = 3.2;
      c.stroke();
      c.strokeStyle = gold(c, -15, 26, 15, 32);
      c.lineWidth = 1.6;
      c.stroke();
      glowAt(c, 0, 30, 14, 12, 0xfff1c4, 0.9, 'lighter');
      c.beginPath();
      c.moveTo(0, 22);
      c.bezierCurveTo(5, 27, 5, 33, 0, 34);
      c.bezierCurveTo(-5, 33, -5, 27, 0, 22);
      c.fillStyle = '#fffbe6';
      c.fill();
    }, 3),
  );
}

export function candleTexture() {
  return cached('candle', () =>
    paint(70, 80, (c) => {
      c.translate(35, 74);
      shadow(c, 0, 0, 30, 6, 0.6);
      // Brass dish.
      ellipse(c, 0, -4, 24, 7);
      fillInk(c, gold(c, -24, -10, 24, 2), 2);
      ellipse(c, 0, -6, 16, 4);
      c.fillStyle = 'rgba(120,80,20,0.45)';
      c.fill();
      // Wax.
      rrect(c, -8, -44, 16, 40, 4);
      const w = c.createLinearGradient(-8, 0, 8, 0);
      w.addColorStop(0, '#fffaf0');
      w.addColorStop(0.6, '#f4e2c2');
      w.addColorStop(1, '#c8a880');
      fillInk(c, w, 2);
      // Drip.
      c.fillStyle = '#fff6e6';
      c.beginPath();
      c.moveTo(-8, -40);
      c.quadraticCurveTo(-10, -30, -7, -26);
      c.quadraticCurveTo(-4, -30, -4, -40);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(0, -44);
      c.lineTo(0, -50);
      c.stroke();
    }),
  );
}

export function flameTexture() {
  return cached('flame', () =>
    paint(30, 44, (c) => {
      c.translate(15, 38);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-11, -6, -6, -22, 0, -34);
      c.bezierCurveTo(6, -22, 11, -6, 0, 0);
      const g = c.createRadialGradient(0, -8, 1, 0, -10, 22);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(0.35, '#ffd25a');
      g.addColorStop(1, '#ff7a2a');
      c.fillStyle = g;
      c.fill();
      ellipse(c, 0, -6, 3, 5);
      c.fillStyle = 'rgba(90,120,255,0.55)';
      c.fill();
    }),
  );
}

/** A curved wind stroke for the gust. */
export function gustTexture() {
  return cached('gust', () =>
    paint(260, 40, (c) => {
      for (const [w, a] of [
        [7, 0.18],
        [3, 0.55],
        [1.4, 0.9],
      ] as const) {
        c.strokeStyle = `rgba(214,228,255,${a})`;
        c.lineWidth = w;
        c.beginPath();
        c.moveTo(8, 24);
        c.bezierCurveTo(80, 10, 150, 34, 220, 18);
        c.quadraticCurveTo(250, 12, 244, 4);
        c.stroke();
      }
    }),
  );
}

// ---- Window frame and brass display ---------------------------------------------------------------

/** The observatory window around the sky: brass frame, deco corner fans and a wooden sill. */
export function frameTexture(w: number, h: number) {
  const m = 26;
  return paint(w + m * 2, h + m * 2 + 20, (c) => {
    c.translate(m, m);
    shadow(c, w / 2, h + 14, w / 2 + 20, 24, 0.6);
    // Outer frame band (the ring between two rounded rectangles).
    const rr = (x: number, y: number, ww: number, hh: number, r: number) => {
      c.moveTo(x + r, y);
      c.arcTo(x + ww, y, x + ww, y + hh, r);
      c.arcTo(x + ww, y + hh, x, y + hh, r);
      c.arcTo(x, y + hh, x, y, r);
      c.arcTo(x, y, x + ww, y, r);
      c.closePath();
    };
    c.beginPath();
    rr(-16, -16, w + 32, h + 32, 30);
    rr(0, 0, w, h, 20);
    c.fillStyle = gold(c, -16, -16, w + 16, h + 16);
    c.fill('evenodd');
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.stroke();
    // Inner bevel lines.
    c.strokeStyle = 'rgba(255,246,210,0.6)';
    c.lineWidth = 1.5;
    rrect(c, -10, -10, w + 20, h + 20, 26);
    c.stroke();
    c.strokeStyle = 'rgba(90,56,10,0.7)';
    rrect(c, -4, -4, w + 8, h + 8, 22);
    c.stroke();
    // Deco fans at the corners.
    const fan = (x: number, y: number, a0: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(a0);
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, 30 - i * 5, 0, Math.PI / 2);
        c.closePath();
        c.fillStyle = i % 2 ? '#b07a2a' : '#f0c868';
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.2;
        c.stroke();
      }
      c.restore();
    };
    fan(-16, -16, 0);
    fan(w + 16, -16, Math.PI / 2);
    // Sill.
    rrect(c, -30, h + 6, w + 60, 22, 8);
    fillInk(c, (() => {
      const g = c.createLinearGradient(0, h + 6, 0, h + 28);
      g.addColorStop(0, rgb(light(0x6a3418, 0.3)));
      g.addColorStop(1, rgb(dark(0x6a3418, 0.4)));
      return g;
    })(), 2.5);
    c.strokeStyle = 'rgba(255,240,210,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-22, h + 9);
    c.lineTo(w + 22, h + 9);
    c.stroke();
    // Inner shadow on the sky's edge.
    c.save();
    rrect(c, 0, 0, w, h, 20);
    c.clip();
    c.strokeStyle = 'rgba(4,2,12,0.55)';
    c.lineWidth = 16;
    rrect(c, -4, -2, w + 8, h + 8, 24);
    c.stroke();
    c.restore();
  });
}

export const PLAQUE = { w: 340, h: 132 };

/** The brass multiplier display: deco frame, dark glass and a sunburst crest. */
export function plaqueTexture() {
  const { w, h } = PLAQUE;
  return cached('plaque', () =>
    paint(w + 40, h + 50, (c) => {
      c.translate(20, 30);
      shadow(c, w / 2, h + 4, w / 2, 16, 0.6);
      // Stepped deco outline.
      const step = (inset: number) => {
        const s = 14 - inset * 0.3;
        c.beginPath();
        c.moveTo(inset + s, inset);
        c.lineTo(w - inset - s, inset);
        c.lineTo(w - inset - s, inset + 6);
        c.lineTo(w - inset, inset + 6);
        c.lineTo(w - inset, h - inset - 6);
        c.lineTo(w - inset - s, h - inset - 6);
        c.lineTo(w - inset - s, h - inset);
        c.lineTo(inset + s, h - inset);
        c.lineTo(inset + s, h - inset - 6);
        c.lineTo(inset, h - inset - 6);
        c.lineTo(inset, inset + 6);
        c.lineTo(inset + s, inset + 6);
        c.closePath();
      };
      step(0);
      fillInk(c, gold(c, 0, 0, w * 0.6, h), 3);
      step(0);
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(255,250,220,0.7)';
      c.lineWidth = 3;
      c.translate(1, 1.5);
      c.stroke();
      c.restore();
      // Crest on top.
      c.beginPath();
      c.moveTo(w / 2 - 46, 2);
      c.quadraticCurveTo(w / 2, -34, w / 2 + 46, 2);
      c.closePath();
      fillInk(c, gold(c, w / 2 - 40, -30, w / 2 + 40, 4), 2.5);
      for (let i = -2; i <= 2; i++) {
        c.strokeStyle = 'rgba(110,70,15,0.6)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.lineTo(w / 2 + i * 14, -18 + Math.abs(i) * 4);
        c.stroke();
      }
      // Glass.
      rrect(c, 16, 14, w - 32, h - 28, 10);
      const g = c.createLinearGradient(0, 14, 0, h - 14);
      g.addColorStop(0, '#1a0e22');
      g.addColorStop(0.5, '#0c0612');
      g.addColorStop(1, '#22102a');
      fillInk(c, g, 2.5);
      // Glass reflection.
      c.save();
      rrect(c, 16, 14, w - 32, h - 28, 10);
      c.clip();
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.beginPath();
      c.moveTo(16, 14);
      c.lineTo(w * 0.55, 14);
      c.lineTo(w * 0.35, h);
      c.lineTo(16, h);
      c.closePath();
      c.fill();
      c.restore();
      // Screws.
      for (const [x, y] of [
        [9, h / 2],
        [w - 9, h / 2],
      ]) {
        c.beginPath();
        c.arc(x, y, 4, 0, Math.PI * 2);
        fillInk(c, gold(c, x - 4, y - 4, x + 4, y + 4), 1.2);
        c.strokeStyle = 'rgba(90,56,10,0.8)';
        c.beginPath();
        c.moveTo(x - 2.5, y);
        c.lineTo(x + 2.5, y);
        c.stroke();
      }
    }),
  );
}

/** The dark velvet control bar under the window, with a brass top edge. */
export function barTexture(w: number, h: number) {
  return paint(w, h + 10, (c) => {
    shadow(c, w / 2, h, w / 2, 12, 0.5);
    rrect(c, 1, 1, w - 2, h - 2, 20);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2c1638');
    g.addColorStop(1, '#170a1e');
    fillInk(c, g, 2.5);
    c.save();
    rrect(c, 1, 1, w - 2, h - 2, 20);
    c.clip();
    c.fillStyle = gold(c, 0, 0, w, 6);
    c.fillRect(0, 0, w, 4);
    grain(c, 0, 4, w, h, Math.round((w * h) / 500), 9, 0.05);
    c.restore();
    rrect(c, 8, 10, w - 16, h - 18, 14);
    c.strokeStyle = 'rgba(224,178,90,0.35)';
    c.lineWidth = 1.2;
    c.stroke();
  }, 2);
}
