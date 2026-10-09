// Slot symbols, drawn in code and baked to textures once.

import { Container, Graphics, Text, type Texture } from 'pixi.js';
import { bake, FONT_DISPLAY } from '../../core/fx';

export type SymbolId = 'cherry' | 'lemon' | 'bell' | 'bar' | 'seven' | 'diamond';
export const SYMBOLS: SymbolId[] = ['cherry', 'lemon', 'bell', 'bar', 'seven', 'diamond'];

const S = 100;

function cherry() {
  const g = new Graphics();
  g.moveTo(50, 18).quadraticCurveTo(40, 40, 30, 62).stroke({ color: 0x2f7d32, width: 5 });
  g.moveTo(50, 18).quadraticCurveTo(62, 40, 70, 58).stroke({ color: 0x2f7d32, width: 5 });
  g.ellipse(62, 16, 14, 7).fill(0x43a047);
  g.circle(30, 68, 19).fill(0xb3132b);
  g.circle(70, 64, 19).fill(0xd61f3a);
  g.circle(24, 61, 6).fill({ color: 0xffffff, alpha: 0.6 });
  g.circle(64, 57, 6).fill({ color: 0xffffff, alpha: 0.6 });
  return g;
}

function lemon() {
  const g = new Graphics();
  g.ellipse(50, 52, 36, 27).fill(0xf5c518);
  g.circle(14, 52, 7).fill(0xf5c518);
  g.circle(86, 52, 7).fill(0xf5c518);
  g.ellipse(50, 52, 36, 27).stroke({ color: 0xc69500, width: 3 });
  g.ellipse(40, 42, 13, 6).fill({ color: 0xffffff, alpha: 0.5 });
  return g;
}

function bell() {
  const g = new Graphics();
  g.moveTo(50, 12)
    .bezierCurveTo(26, 14, 26, 48, 22, 66)
    .lineTo(14, 76)
    .lineTo(86, 76)
    .lineTo(78, 66)
    .bezierCurveTo(74, 48, 74, 14, 50, 12)
    .fill(0xf0b73b)
    .stroke({ color: 0x9a6a12, width: 3 });
  g.circle(50, 84, 9).fill(0x9a6a12);
  g.circle(50, 10, 6).fill(0x9a6a12);
  g.moveTo(38, 24).quadraticCurveTo(32, 44, 31, 62).stroke({ color: 0xfff1c4, width: 5, alpha: 0.7 });
  return g;
}

function bar() {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(8, 30, 84, 40, 8).fill(0x1b1b22).stroke({ color: 0xe0b25a, width: 4 });
  const t = new Text({ text: 'BAR', style: { fontFamily: FONT_DISPLAY, fontSize: 30, fill: 0xfff1c4 } });
  t.anchor.set(0.5);
  t.position.set(50, 51);
  c.addChild(g, t);
  return c;
}

function seven() {
  const t = new Text({
    text: '7',
    style: {
      fontFamily: FONT_DISPLAY,
      fontSize: 86,
      fill: 0xe0233f,
      stroke: { color: 0xf0c25a, width: 7 },
      dropShadow: { color: 0x5a0010, distance: 4, angle: Math.PI / 3, blur: 0, alpha: 1 },
    },
  });
  t.anchor.set(0.5);
  t.position.set(50, 52);
  const c = new Container();
  c.addChild(t);
  return c;
}

function diamond() {
  const g = new Graphics();
  g.poly([20, 36, 34, 18, 66, 18, 80, 36, 50, 84]).fill(0x5fe3ff).stroke({ color: 0x1b8fb8, width: 3 });
  g.poly([20, 36, 80, 36, 50, 84]).fill({ color: 0x2bb7e6, alpha: 0.8 });
  g.poly([34, 18, 42, 36, 50, 18]).fill({ color: 0xffffff, alpha: 0.7 });
  g.poly([50, 18, 58, 36, 66, 18]).fill({ color: 0xc8f6ff, alpha: 0.7 });
  g.poly([42, 36, 58, 36, 50, 84]).fill({ color: 0x9cefff, alpha: 0.6 });
  return g;
}

const drawers: Record<SymbolId, () => Container> = { cherry, lemon, bell, bar, seven, diamond };

let textures: Record<SymbolId, Texture> | null = null;

export function symbolTextures() {
  if (!textures) {
    textures = {} as Record<SymbolId, Texture>;
    for (const id of SYMBOLS) {
      const wrap = new Container();
      // Transparent frame so every symbol bakes to the same size.
      wrap.addChild(new Graphics().rect(0, 0, S, S).fill({ color: 0x000000, alpha: 0.001 }));
      wrap.addChild(drawers[id]());
      textures[id] = bake(wrap);
    }
  }
  return textures;
}
