// Painted parts of the Queen's duel: the dark throne hall behind her, the moth defence cards
// (back and faces 1..20) and the 20 small card pips that show which defences an attack breaks.
// The Queen herself is painted by the throne room (src/world/painted/propsCrystal.ts).

import { Container, Sprite, type Texture } from 'pixi.js';
import { ellipse, fillInk, glowAt, gold, paint, rrect, seeded } from '../../world/painted/brush';
import { crestEmblem, paintHalo, paintBossFigure, paintWing } from '../../world/painted/propsCrystal';
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

/** Stone hall, purple drapes, braziers' glow and the dais under the Queen. */
export function sceneTexture() {
  return cached('scene', () =>
    paint(SCENE_W, SCENE_H, (c) => {
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      const bg = c.createLinearGradient(0, 0, 0, SCENE_H);
      bg.addColorStop(0, '#24102e');
      bg.addColorStop(0.6, '#140818');
      bg.addColorStop(1, '#0a040e');
      fillInk(c, bg, 3);
      c.save();
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      c.clip();
      const r = seeded(51);
      // Stone blocks.
      for (let y = 0, row = 0; y < 250; y += 26, row++) {
        for (let x = row % 2 ? -28 : 0; x < SCENE_W; x += 56) {
          rrect(c, x + 1, y + 1, 54, 24, 2);
          c.fillStyle = `rgba(${40 + r() * 20},${24 + r() * 10},${50 + r() * 20},0.55)`;
          c.fill();
          c.strokeStyle = 'rgba(4,0,8,0.7)';
          c.lineWidth = 1.2;
          c.stroke();
        }
      }
      // Drapes on both sides.
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? 0 : SCENE_W;
        c.beginPath();
        c.moveTo(x0, 0);
        c.lineTo(x0 - s * 70, 0);
        c.quadraticCurveTo(x0 - s * 40, 160, x0 - s * 54, 300);
        c.lineTo(x0, 300);
        c.closePath();
        const g = c.createLinearGradient(x0, 0, x0 - s * 70, 0);
        g.addColorStop(0, '#2a0630');
        g.addColorStop(1, '#6a1a6a');
        fillInk(c, g, 2);
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x0 - s * k * 16, 4);
          c.quadraticCurveTo(x0 - s * (k * 10 + 6), 160, x0 - s * k * 13, 296);
          c.strokeStyle = 'rgba(10,0,14,0.45)';
          c.lineWidth = 2;
          c.stroke();
        }
        ellipse(c, x0 - s * 46, 150, 6, 6);
        c.fillStyle = gold(c, x0 - s * 52, 144, x0 - s * 40, 156);
        c.fill();
      }
      // Aura behind the Queen and the brazier glow below.
      glowAt(c, QUEEN.x, QUEEN.y - 10, 190, 150, 0x9a5ad0, 0.35, 'lighter');
      for (const s of [-1, 1]) glowAt(c, QUEEN.x + s * 150, 300, 70, 90, 0xff9a4a, 0.18, 'lighter');
      // The dais.
      for (let i = 0; i < 3; i++) {
        const w = 300 - i * 50;
        const y = 286 - i * 14;
        ellipse(c, QUEEN.x, y, w / 2, 26 - i * 4);
        const g = c.createLinearGradient(0, y - 26, 0, y + 26);
        g.addColorStop(0, '#4a1a5a');
        g.addColorStop(1, '#1a0822');
        fillInk(c, g, 2);
        ellipse(c, QUEEN.x, y - 2, w / 2 - 6, 22 - i * 4);
        c.strokeStyle = 'rgba(224,178,90,0.55)';
        c.lineWidth = 1.4;
        c.stroke();
      }
      // Floor.
      const fl = c.createLinearGradient(0, 300, 0, SCENE_H);
      fl.addColorStop(0, 'rgba(20,6,24,0.0)');
      fl.addColorStop(1, 'rgba(4,0,8,0.8)');
      c.fillStyle = fl;
      c.fillRect(0, 300, SCENE_W, SCENE_H - 300);
      // Dust.
      for (let i = 0; i < 40; i++) {
        ellipse(c, r() * SCENE_W, r() * 300, 0.6 + r(), 0.6 + r());
        c.fillStyle = `rgba(255,230,250,${0.15 + r() * 0.35})`;
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

/** Back of a defence card: dark velvet with the Queen's moth. */
export function cardBack() {
  return cached('back', () =>
    paint(CARD.w + 6, CARD.h + 6, (c) => {
      c.translate(3, 3);
      cardShape(c, CARD.w, CARD.h);
      const g = c.createLinearGradient(0, 0, 0, CARD.h);
      g.addColorStop(0, '#5a1a6a');
      g.addColorStop(1, '#22082a');
      fillInk(c, g, 2.2);
      rrect(c, 8, 8, CARD.w - 16, CARD.h - 16, 5);
      c.strokeStyle = gold(c, 0, 0, CARD.w, CARD.h);
      c.lineWidth = 1.6;
      c.stroke();
      c.save();
      c.translate(CARD.w / 2, CARD.h / 2);
      crestEmblem(c, 22);
      c.restore();
    }),
  );
}

/** Face of defence card `n` (1..20): parchment, the number, a shield whose size grows with it. */
export function cardFace(n: number, broken: boolean | null) {
  return cached(`face-${n}-${broken}`, () =>
    paint(CARD.w + 6, CARD.h + 6, (c) => {
      c.translate(3, 3);
      cardShape(c, CARD.w, CARD.h);
      const g = c.createLinearGradient(0, 0, 0, CARD.h);
      g.addColorStop(0, '#fff6e2');
      g.addColorStop(1, broken === null ? '#e6d2ae' : broken ? '#f4e2a0' : '#e6c6e6');
      fillInk(c, g, 2.2);
      rrect(c, 7, 7, CARD.w - 14, CARD.h - 14, 5);
      c.strokeStyle = broken ? 'rgba(160,110,20,0.8)' : 'rgba(120,60,150,0.7)';
      c.lineWidth = 1.4;
      c.stroke();
      // Shield: bigger number, bigger shield.
      const s = 0.45 + (n / 20) * 0.55;
      c.save();
      c.translate(CARD.w / 2, CARD.h / 2 + 10);
      c.scale(s, s);
      c.beginPath();
      c.moveTo(0, -26);
      c.quadraticCurveTo(22, -24, 24, -16);
      c.quadraticCurveTo(22, 12, 0, 26);
      c.quadraticCurveTo(-22, 12, -24, -16);
      c.quadraticCurveTo(-22, -24, 0, -26);
      c.closePath();
      c.fillStyle = broken ? 'rgba(200,150,60,0.35)' : 'rgba(150,80,200,0.35)';
      c.fill();
      c.restore();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '30px Bungee, Impact, sans-serif';
      c.lineJoin = 'round';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(255,250,236,0.9)';
      c.strokeText(String(n), CARD.w / 2, CARD.h / 2 + 2);
      c.fillStyle = broken ? '#7a4a08' : '#4a1660';
      c.fillText(String(n), CARD.w / 2, CARD.h / 2 + 2);
      c.font = '700 11px "Barlow Condensed", sans-serif';
      c.fillStyle = 'rgba(60,30,60,0.8)';
      c.fillText('ABWEHR', CARD.w / 2, 15);
      if (broken !== null) {
        c.font = '700 10px "Barlow Condensed", sans-serif';
        c.fillStyle = broken ? '#7a4a08' : '#6a1a6a';
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
        c.fillStyle = '#3a1a44';
        c.fill();
        c.strokeStyle = 'rgba(201,160,255,0.45)';
        c.lineWidth = 1.2;
        c.stroke();
      }
    }),
  );
}

/** The Queen: halo, wings (with white hit flashes) and body, centred on her thorax. */
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

