// Painted trophies and medals for the menus (vitrine, day settlement): metal lit from the
// upper left, chunky ink outlines, a wooden plinth with a brass plate. Painted once per
// kind and medal, then reused.

import { Container, Sprite, type Texture } from 'pixi.js';
import { drawEmblem } from '../core/fx';
import type { Medal, TrophyKind } from '../core/state';
import { MEDAL_COLORS } from '../world/trophies';
import { bossTrophyArt } from '../world/painted/propsBoss';
import { INK, dark, fillInk, glowAt, light, paint, rgb, rrect, type Ctx } from '../world/painted/brush';

const cache = new Map<string, Texture>();
function once(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Polished metal gradient in the medal's colours. */
function metal(c: Ctx, m: Medal, x0: number, y0: number, x1: number, y1: number) {
  const k = MEDAL_COLORS[m];
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(k.light, 0.3)));
  g.addColorStop(0.25, rgb(k.base));
  g.addColorStop(0.55, rgb(dark(k.base, 0.3)));
  g.addColorStop(0.78, rgb(k.base));
  g.addColorStop(1, rgb(k.dark));
  return g;
}

/**
 * Trophies won on a moon level (Mondstufe): the metal gets a cool moonlit glaze (blood red on
 * level 5), a crescent on the plinth and one star per level.
 */
function moonGlaze(c: Ctx, heat: number) {
  const blood = heat >= 5;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(-40, -120, 40, 0);
  g.addColorStop(0, blood ? 'rgba(255,120,110,0.35)' : 'rgba(200,225,255,0.38)');
  g.addColorStop(0.5, blood ? 'rgba(200,30,40,0.3)' : 'rgba(110,120,230,0.32)');
  g.addColorStop(1, blood ? 'rgba(90,10,20,0.3)' : 'rgba(60,50,150,0.3)');
  c.fillStyle = g;
  c.fillRect(-AX, -AY, TW, TH);
  c.restore();
  // Crescent on the plinth plate.
  c.beginPath();
  c.arc(-24, -11, 5, Math.PI * 0.3, Math.PI * 1.7);
  c.arc(-22, -12, 4, Math.PI * 1.6, Math.PI * 0.4, true);
  c.closePath();
  c.fillStyle = blood ? '#ff8a7a' : '#e8f2ff';
  c.fill();
  for (let i = 0; i < heat; i++) {
    c.beginPath();
    c.arc(-8 + i * 6.5, -4.5, 1.8, 0, Math.PI * 2);
    c.fillStyle = blood ? '#ffb0a0' : '#cfe8ff';
    c.fill();
  }
}

const TW = 120;
const TH = 150;
const AX = 60;
const AY = 140;

/** A trophy about 110 px tall; the sprite's anchor is the bottom centre (like drawTrophy). */
export function paintedTrophy(kind: TrophyKind, medal: Medal, heat = 0): Sprite {
  const tex = once(`tr-${kind}-${medal}${heat > 0 ? `-moon${heat}` : ''}`, () =>
    paint(TW, TH, (c) => {
      c.translate(AX, AY);
      const k = MEDAL_COLORS[medal];
      glowAt(c, 0, 2, 44, 8, 0x0a0410, 0.5);
      // Plinth: dark wood with a brass plate.
      rrect(c, -32, -22, 64, 22, 4);
      const wg = c.createLinearGradient(0, -22, 0, 0);
      wg.addColorStop(0, '#5a3020');
      wg.addColorStop(1, '#24120c');
      fillInk(c, wg, 2);
      rrect(c, -34, -26, 68, 7, 3);
      fillInk(c, '#3a1e14', 1.6);
      rrect(c, -18, -16, 36, 9, 2);
      fillInk(c, metal(c, 'gold', -18, -16, 18, -6), 1.2);
      if (kind === 'cup') {
        // Foot and stem.
        c.beginPath();
        c.moveTo(-18, -26);
        c.quadraticCurveTo(-16, -34, -6, -36);
        c.lineTo(-5, -50);
        c.lineTo(5, -50);
        c.lineTo(6, -36);
        c.quadraticCurveTo(16, -34, 18, -26);
        c.closePath();
        fillInk(c, metal(c, medal, -18, -50, 18, -26), 2);
        // Handles.
        for (const s of [-1, 1]) {
          c.beginPath();
          c.ellipse(s * 33, -92, 11, 14, 0, 0, Math.PI * 2);
          c.strokeStyle = INK;
          c.lineWidth = 8;
          c.stroke();
          c.strokeStyle = rgb(k.base);
          c.lineWidth = 4.5;
          c.stroke();
        }
        // Bowl.
        c.beginPath();
        c.moveTo(-32, -112);
        c.lineTo(32, -112);
        c.bezierCurveTo(32, -76, 16, -58, 0, -54);
        c.bezierCurveTo(-16, -58, -32, -76, -32, -112);
        c.closePath();
        fillInk(c, metal(c, medal, -32, -112, 32, -54), 2.4);
        c.beginPath();
        c.ellipse(0, -112, 32, 6, 0, 0, Math.PI * 2);
        fillInk(c, rgb(dark(k.base, 0.45)), 2);
        // Shine and the engraved sun emblem.
        c.beginPath();
        c.moveTo(-22, -104);
        c.bezierCurveTo(-22, -84, -14, -70, -6, -64);
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 3.5;
        c.stroke();
        drawEmblem(c, 4, -84, 24, rgb(dark(k.base, 0.35), 0.7), rgb(dark(k.base, 0.5), 0.8));
      } else if (kind === 'crystal') {
        c.beginPath();
        c.moveTo(-14, -26);
        c.lineTo(-5, -42);
        c.lineTo(5, -42);
        c.lineTo(14, -26);
        c.closePath();
        fillInk(c, metal(c, 'gold', -14, -42, 14, -26), 1.8);
        glowAt(c, 0, -84, 46, 52, k.light, 0.35);
        const pts: [number, number][] = [[0, -130], [28, -88], [0, -42], [-28, -88]];
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        const g = c.createLinearGradient(-28, -130, 28, -42);
        g.addColorStop(0, rgb(light(k.light, 0.5)));
        g.addColorStop(0.5, rgb(k.base));
        g.addColorStop(1, rgb(k.dark));
        fillInk(c, g, 2.4);
        // Facets.
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.beginPath();
        c.moveTo(0, -130);
        c.lineTo(-28, -88);
        c.lineTo(-8, -88);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.beginPath();
        c.moveTo(0, -42);
        c.lineTo(28, -88);
        c.lineTo(8, -88);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.4)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(-28, -88);
        c.lineTo(28, -88);
        c.moveTo(0, -130);
        c.lineTo(-8, -88);
        c.lineTo(0, -42);
        c.lineTo(8, -88);
        c.closePath();
        c.stroke();
      } else if (kind === 'crown') {
        // Cushion.
        c.beginPath();
        c.ellipse(0, -34, 34, 10, 0, 0, Math.PI * 2);
        const cg = c.createLinearGradient(0, -44, 0, -24);
        cg.addColorStop(0, '#a0284a');
        cg.addColorStop(1, '#4a0c20');
        fillInk(c, cg, 2);
        c.beginPath();
        c.moveTo(-30, -44);
        c.lineTo(-36, -96);
        c.lineTo(-16, -70);
        c.lineTo(0, -106);
        c.lineTo(16, -70);
        c.lineTo(36, -96);
        c.lineTo(30, -44);
        c.closePath();
        fillInk(c, metal(c, medal, -36, -106, 36, -44), 2.4);
        rrect(c, -31, -56, 62, 14, 4);
        fillInk(c, metal(c, medal, -31, -56, 31, -42), 2);
        for (const [x, y, r, col] of [[-36, -98, 5, k.light], [0, -108, 6, k.light], [36, -98, 5, k.light], [0, -49, 5, 0xc8243a], [-18, -49, 3.5, 0x5fe3ff], [18, -49, 3.5, 0x5fe3ff]] as const) {
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          fillInk(c, rgb(col), 1.4);
          c.beginPath();
          c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,0.7)';
          c.fill();
        }
      } else if (kind.startsWith('mb')) {
        // Mini boss trophies (src/core/miniboss.ts): a statuette per boss.
        bossTrophyArt(c, Number(kind.slice(2)), (x0, y0, x1, y1) => metal(c, medal, x0, y0, x1, y1), 0xc8243a);
      } else {
        // Jackpot: a tiny golden slot machine.
        rrect(c, -26, -110, 52, 84, 9);
        fillInk(c, metal(c, medal, -26, -110, 26, -26), 2.4);
        rrect(c, -19, -94, 38, 24, 4);
        fillInk(c, '#1a0b06', 1.6);
        c.font = '700 17px Cinzel, Georgia, serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#e8324a';
        for (let i = 0; i < 3; i++) c.fillText('7', -12 + i * 12, -81);
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.fillRect(-18, -93, 36, 6);
        rrect(c, -15, -58, 30, 10, 3);
        fillInk(c, rgb(k.dark), 1.4);
        c.fillStyle = INK;
        c.fillRect(26, -96, 5, 26);
        c.beginPath();
        c.arc(29, -100, 7, 0, Math.PI * 2);
        fillInk(c, '#e8324a', 1.6);
      }
      if (heat > 0) moonGlaze(c, heat);
    }, 2),
  );
  const s = new Sprite(tex);
  s.anchor.set(AX / TW, AY / TH);
  return s;
}

/** A medal about 160 px across with its ribbon; origin at the centre of the disc (like drawMedal). */
export function paintedMedal(medal: Medal): Container {
  const tex = once(`md-${medal}`, () =>
    paint(200, 280, (c) => {
      c.translate(100, 180);
      const k = MEDAL_COLORS[medal];
      // Ribbon: two velvet bands.
      const band = (pts: number[], col: number) => {
        c.beginPath();
        for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i], pts[i + 1]);
        c.closePath();
        const g = c.createLinearGradient(pts[0], pts[1], pts[4], pts[5]);
        g.addColorStop(0, rgb(light(col, 0.2)));
        g.addColorStop(1, rgb(dark(col, 0.35)));
        fillInk(c, g, 2.4);
      };
      band([-50, -170, -16, -170, 18, -52, -16, -52], 0x8a1630);
      band([50, -170, 16, -170, -18, -52, 14, -52], 0x1d3f8a);
      c.beginPath();
      c.arc(3, 8, 82, 0, Math.PI * 2);
      c.fillStyle = 'rgba(8,4,16,0.4)';
      c.fill();
      c.beginPath();
      c.arc(0, 0, 80, 0, Math.PI * 2);
      fillInk(c, metal(c, medal, -80, -80, 80, 80), 3);
      // Milled rim.
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        c.beginPath();
        c.arc(Math.cos(a) * 73, Math.sin(a) * 73, 2.2, 0, Math.PI * 2);
        c.fillStyle = rgb(light(k.light, 0.2), 0.8);
        c.fill();
      }
      c.beginPath();
      c.arc(0, 0, 64, 0, Math.PI * 2);
      const fg = c.createRadialGradient(-22, -26, 4, 0, 0, 66);
      fg.addColorStop(0, rgb(light(k.light, 0.35)));
      fg.addColorStop(0.6, rgb(k.base));
      fg.addColorStop(1, rgb(dark(k.base, 0.3)));
      c.fillStyle = fg;
      c.fill();
      c.strokeStyle = rgb(k.dark, 0.7);
      c.lineWidth = 2;
      c.stroke();
      // Embossed sun emblem.
      drawEmblem(c, 3, 7, 92, rgb(dark(k.dark, 0.2), 0.75), rgb(dark(k.dark, 0.3), 0.85));
      drawEmblem(c, 0, 4, 92, rgb(light(k.light, 0.1)), rgb(k.dark), rgb(k.base, 0.8));
      // Gloss.
      c.save();
      c.beginPath();
      c.arc(0, 0, 80, 0, Math.PI * 2);
      c.clip();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.ellipse(-30, -40, 60, 26, -0.6, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }, 2),
  );
  const c = new Container();
  const s = new Sprite(tex);
  s.anchor.set(0.5, 180 / 280);
  c.addChild(s);
  return c;
}
