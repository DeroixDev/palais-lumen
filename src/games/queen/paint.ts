// Painted parts of the duel in the light cone: the dome with its Fresnel lens behind Selene, the
// lamp cards (back and faces 1..20, the lamp grows with the number) and the 20 small card pips
// that show which defences an attack breaks. Selene herself is painted by the dome
// (src/world/painted/propsCrystal.ts).

import { Container, Sprite, type Texture } from 'pixi.js';
import { ellipse, fillInk, glowAt, gold, paint, rrect, seeded } from '../../world/painted/brush';
import { crestEmblem, paintFresnel, paintHalo, paintBossFigure, paintWing } from '../../world/painted/propsCrystal';
import { paintMiniLantern } from '../../core/lumenArt';
import { SCENE_H, SCENE_W } from '../ladderKit';

export const QUEEN = { x: SCENE_W / 2, y: 178, s: 1.1 };
export const CARD = { x: SCENE_W / 2, y: 318, w: 62, h: 86 };
export const PIPS_Y = 380;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** The dome: night-blue ribs, the great lens, velvet drapes, the light cone and the dais under Selene. */
export function sceneTexture() {
  return cached('scene', () =>
    paint(SCENE_W, SCENE_H, (c) => {
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      const bg = c.createLinearGradient(0, 0, 0, SCENE_H);
      bg.addColorStop(0, '#1a2458');
      bg.addColorStop(0.6, '#0e1430');
      bg.addColorStop(1, '#06081a');
      fillInk(c, bg, 3);
      c.save();
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      c.clip();
      const r = seeded(51);
      // Dome ribs converging on the lens, and the stars painted between them.
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        c.beginPath();
        c.moveTo(QUEEN.x, QUEEN.y - 20);
        c.lineTo(QUEEN.x + Math.cos(a) * 520, QUEEN.y - 20 + Math.sin(a) * 520);
        c.strokeStyle = i % 2 ? 'rgba(242,205,114,0.16)' : 'rgba(242,205,114,0.32)';
        c.lineWidth = i % 2 ? 1.2 : 2.4;
        c.stroke();
      }
      for (const rr of [150, 210, 270]) {
        c.beginPath();
        c.arc(QUEEN.x, QUEEN.y - 20, rr, Math.PI, Math.PI * 2);
        c.strokeStyle = 'rgba(242,205,114,0.2)';
        c.lineWidth = 1.4;
        c.stroke();
      }
      for (let i = 0; i < 46; i++) {
        ellipse(c, r() * SCENE_W, r() * 240, 0.6 + r() * 0.9, 0.6 + r() * 0.9);
        c.fillStyle = `rgba(230,236,255,${0.2 + r() * 0.5})`;
        c.fill();
      }
      // The great Fresnel lens behind her.
      c.save();
      c.translate(QUEEN.x, QUEEN.y - 26);
      c.globalAlpha = 0.85;
      paintFresnel(c, 96);
      c.restore();
      // Velvet drapes on both sides.
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? 0 : SCENE_W;
        c.beginPath();
        c.moveTo(x0, 0);
        c.lineTo(x0 - s * 70, 0);
        c.quadraticCurveTo(x0 - s * 40, 160, x0 - s * 54, 300);
        c.lineTo(x0, 300);
        c.closePath();
        const g = c.createLinearGradient(x0, 0, x0 - s * 70, 0);
        g.addColorStop(0, '#0a0e24');
        g.addColorStop(1, '#2a3a7a');
        fillInk(c, g, 2);
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x0 - s * k * 16, 4);
          c.quadraticCurveTo(x0 - s * (k * 10 + 6), 160, x0 - s * k * 13, 296);
          c.strokeStyle = 'rgba(4,6,20,0.45)';
          c.lineWidth = 2;
          c.stroke();
        }
        ellipse(c, x0 - s * 46, 150, 6, 6);
        c.fillStyle = gold(c, x0 - s * 52, 144, x0 - s * 40, 156);
        c.fill();
      }
      // The light cone from the lens down onto the dais, and the warm lamps either side.
      const cone = c.createLinearGradient(0, QUEEN.y - 40, 0, 300);
      cone.addColorStop(0, 'rgba(230,238,255,0.24)');
      cone.addColorStop(1, 'rgba(230,238,255,0.04)');
      c.beginPath();
      c.moveTo(QUEEN.x - 60, QUEEN.y - 40);
      c.lineTo(QUEEN.x + 60, QUEEN.y - 40);
      c.lineTo(QUEEN.x + 150, 296);
      c.lineTo(QUEEN.x - 150, 296);
      c.closePath();
      c.fillStyle = cone;
      c.fill();
      glowAt(c, QUEEN.x, QUEEN.y - 10, 190, 150, 0x8aa8ff, 0.28, 'lighter');
      for (const s of [-1, 1]) glowAt(c, QUEEN.x + s * 150, 300, 70, 90, 0xffb347, 0.18, 'lighter');
      // The dais.
      for (let i = 0; i < 3; i++) {
        const w = 300 - i * 50;
        const y = 286 - i * 14;
        ellipse(c, QUEEN.x, y, w / 2, 26 - i * 4);
        const g = c.createLinearGradient(0, y - 26, 0, y + 26);
        g.addColorStop(0, '#2a3a7a');
        g.addColorStop(1, '#0a0e24');
        fillInk(c, g, 2);
        ellipse(c, QUEEN.x, y - 2, w / 2 - 6, 22 - i * 4);
        c.strokeStyle = 'rgba(224,178,90,0.55)';
        c.lineWidth = 1.4;
        c.stroke();
      }
      // Floor.
      const fl = c.createLinearGradient(0, 300, 0, SCENE_H);
      fl.addColorStop(0, 'rgba(6,8,24,0.0)');
      fl.addColorStop(1, 'rgba(2,2,10,0.8)');
      c.fillStyle = fl;
      c.fillRect(0, 300, SCENE_W, SCENE_H - 300);
      // Dust.
      for (let i = 0; i < 40; i++) {
        ellipse(c, r() * SCENE_W, r() * 300, 0.6 + r(), 0.6 + r());
        c.fillStyle = `rgba(255,240,210,${0.15 + r() * 0.35})`;
        c.fill();
      }
      c.restore();
      // Title ribbon.
      rrect(c, SCENE_W / 2 - 96, 10, 192, 32, 10);
      fillInk(c, gold(c, SCENE_W / 2 - 96, 10, SCENE_W / 2 + 96, 42), 2);
    }),
  );
}

function cardShape(c: CanvasRenderingContext2D, w: number, h: number) {
  rrect(c, 3, 3, w - 6, h - 6, 8);
}

/** Back of a lamp card: night-blue velvet with Selene's crest. */
export function cardBack() {
  return cached('back', () =>
    paint(CARD.w + 6, CARD.h + 6, (c) => {
      c.translate(3, 3);
      cardShape(c, CARD.w, CARD.h);
      const g = c.createLinearGradient(0, 0, 0, CARD.h);
      g.addColorStop(0, '#2a3a7a');
      g.addColorStop(1, '#0a0e24');
      fillInk(c, g, 2.2);
      rrect(c, 8, 8, CARD.w - 16, CARD.h - 16, 5);
      c.strokeStyle = gold(c, 0, 0, CARD.w, CARD.h);
      c.lineWidth = 1.6;
      c.stroke();
      c.save();
      c.translate(CARD.w / 2, CARD.h / 2);
      crestEmblem(c, 26, '#fff1c4');
      c.restore();
    }),
  );
}

/** Face of lamp card `n` (1..20): parchment, the number, a lamp whose size grows with it. */
export function cardFace(n: number, broken: boolean | null) {
  return cached(`face-${n}-${broken}`, () =>
    paint(CARD.w + 6, CARD.h + 6, (c) => {
      c.translate(3, 3);
      cardShape(c, CARD.w, CARD.h);
      const g = c.createLinearGradient(0, 0, 0, CARD.h);
      g.addColorStop(0, '#fff6e2');
      g.addColorStop(1, broken === null ? '#e6d2ae' : broken ? '#f4e2a0' : '#d2dcf0');
      fillInk(c, g, 2.2);
      rrect(c, 7, 7, CARD.w - 14, CARD.h - 14, 5);
      c.strokeStyle = broken ? 'rgba(160,110,20,0.8)' : 'rgba(60,80,150,0.7)';
      c.lineWidth = 1.4;
      c.stroke();
      // Lamp: bigger number, bigger lamp (and brighter).
      const s = 0.45 + (n / 20) * 0.55;
      c.save();
      c.globalAlpha = broken === false ? 0.45 : 0.6;
      paintMiniLantern(c, CARD.w / 2, CARD.h / 2 + 10, 58 * s, broken ? 0xffd76e : broken === false ? 0xbcd0ff : 0xffe7a8);
      c.restore();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '700 30px Cinzel, Georgia, serif';
      c.lineJoin = 'round';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(255,250,236,0.9)';
      c.strokeText(String(n), CARD.w / 2, CARD.h / 2 + 2);
      c.fillStyle = broken ? '#7a4a08' : '#1a2458';
      c.fillText(String(n), CARD.w / 2, CARD.h / 2 + 2);
      c.font = '700 11px "Barlow Condensed", sans-serif';
      c.fillStyle = 'rgba(30,36,80,0.8)';
      c.fillText('ABWEHR', CARD.w / 2, 15);
      if (broken !== null) {
        c.font = '700 10px "Barlow Condensed", sans-serif';
        c.fillStyle = broken ? '#7a4a08' : '#2a3a7a';
        c.fillText(broken ? 'DURCHBROCHEN' : 'GEHALTEN', CARD.w / 2, CARD.h - 13);
      }
    }),
  );
}

/** A small card pip under the scene: lit (gold) when the chosen attack breaks that defence. */
export function pipTexture(lit: boolean) {
  return cached(`pip-${lit}`, () =>
    paint(16, 20, (c) => {
      rrect(c, 2, 2, 12, 16, 3);
      if (lit) {
        const g = c.createLinearGradient(0, 2, 0, 18);
        g.addColorStop(0, '#fff1c4');
        g.addColorStop(1, '#d9a040');
        fillInk(c, g, 1.4);
      } else {
        c.fillStyle = '#1a2458';
        c.fill();
        c.strokeStyle = 'rgba(188,208,255,0.45)';
        c.lineWidth = 1.2;
        c.stroke();
      }
    }),
  );
}

/** Selene: halo, fan of light (with white hit flashes) and body, centred on her thorax. */
export function buildQueen() {
  const c = new Container();
  const halo = new Sprite(cached('halo', () => paint(100, 100, (x) => {
    x.translate(50, 50);
    paintHalo(x);
  })));
  halo.anchor.set(0.5);
  halo.y = -42;
  const wing = cached('wing', () => paint(130, 200, (x) => {
    x.translate(6, 96);
    paintWing(x, false);
  }));
  const flash = cached('wingFlash', () => paint(130, 200, (x) => {
    x.translate(6, 96);
    paintWing(x, true);
  }));
  const mk = (tex: Texture, side: number) => {
    const s = new Sprite(tex);
    s.anchor.set(6 / 130, 96 / 200);
    s.position.set(side * 6, -2);
    s.scale.x = side;
    return s;
  };
  const wR = mk(wing, 1);
  const wL = mk(wing, -1);
  const fR = mk(flash, 1);
  const fL = mk(flash, -1);
  fR.alpha = fL.alpha = 0;
  const body = new Sprite(cached('queen', () => paint(90, 150, (x) => {
    x.translate(45, 76);
    paintBossFigure(x);
  })));
  body.anchor.set(45 / 90, 76 / 150);
  c.addChild(halo, wL, wR, fL, fR, body);
  return { c, halo, wL, wR, fL, fR, body };
}

