// Trophy and medal artwork, drawn in code.

import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_DISPLAY } from '../core/fx';
import type { Medal, TrophyKind } from '../core/state';

export const MEDAL_COLORS: Record<Medal, { base: number; light: number; dark: number }> = {
  none: { base: 0x6b6170, light: 0x9a90a0, dark: 0x3a3340 },
  bronze: { base: 0xc07a3a, light: 0xf0b07a, dark: 0x6e3e14 },
  silver: { base: 0xc9d1dc, light: 0xffffff, dark: 0x6d7785 },
  gold: { base: 0xf0c25a, light: 0xfff1c4, dark: 0x8a5e14 },
  diamond: { base: 0x7fe9ff, light: 0xe8fcff, dark: 0x1b7fa8 },
};

/** A trophy roughly 100 px tall, origin at the bottom centre. */
export function drawTrophy(kind: TrophyKind, medal: Medal): Container {
  const c = new Container();
  const m = MEDAL_COLORS[medal];
  const g = new Graphics();
  // Plinth.
  g.roundRect(-30, -18, 60, 18, 3).fill(0x2a1a14).stroke({ color: 0x000000, width: 1, alpha: 0.4 });
  g.rect(-24, -14, 48, 6).fill({ color: m.base, alpha: 0.8 });
  if (kind === 'cup') {
    g.rect(-6, -40, 12, 22).fill(m.dark);
    g.roundRect(-18, -46, 36, 8, 3).fill(m.base);
    g.moveTo(-30, -100).lineTo(30, -100).bezierCurveTo(30, -66, 14, -50, 0, -48).bezierCurveTo(-14, -50, -30, -66, -30, -100).fill(m.base);
    g.circle(-34, -86, 10).stroke({ color: m.base, width: 5 });
    g.circle(34, -86, 10).stroke({ color: m.base, width: 5 });
    g.moveTo(-20, -96).bezierCurveTo(-20, -74, -12, -62, -4, -56).stroke({ color: m.light, width: 4, alpha: 0.8 });
  } else if (kind === 'crystal') {
    g.rect(-5, -34, 10, 16).fill(m.dark);
    g.poly([0, -110, 26, -70, 0, -34, -26, -70]).fill(m.base);
    g.poly([0, -110, 26, -70, 0, -70]).fill({ color: m.light, alpha: 0.7 });
    g.poly([0, -34, -26, -70, 0, -70]).fill({ color: m.dark, alpha: 0.5 });
  } else if (kind === 'crown') {
    g.roundRect(-30, -50, 60, 22, 4).fill(m.base);
    g.poly([-30, -50, -34, -92, -16, -66, 0, -100, 16, -66, 34, -92, 30, -50]).fill(m.base);
    g.circle(-34, -94, 5).fill(m.light);
    g.circle(0, -102, 6).fill(m.light);
    g.circle(34, -94, 5).fill(m.light);
    g.circle(0, -40, 6).fill(COLORS.red);
    g.circle(-18, -40, 4).fill(COLORS.cyan);
    g.circle(18, -40, 4).fill(COLORS.cyan);
    g.rect(-30, -50, 60, 4).fill({ color: m.light, alpha: 0.7 });
  } else if (kind.startsWith('mb')) {
    // Mini boss trophy: a medallion on a stem (the painted statuette is in src/ui/trophyArt.ts).
    g.rect(-4, -60, 8, 42).fill(m.dark);
    g.circle(0, -78, 26).fill(m.base).stroke({ color: m.dark, width: 3 });
    g.circle(0, -78, 16).fill({ color: m.light, alpha: 0.6 });
    g.circle(0, -78, 6).fill(COLORS.red);
  } else {
    // Jackpot: a tiny golden slot machine.
    g.roundRect(-24, -96, 48, 78, 8).fill(m.base).stroke({ color: m.dark, width: 2 });
    g.roundRect(-18, -80, 36, 22, 3).fill(0x1a0b06);
    for (let i = 0; i < 3; i++) {
      const t = new Text({ text: '7', style: { fontFamily: FONT_DISPLAY, fontSize: 16, fill: COLORS.red } });
      t.anchor.set(0.5);
      t.position.set(-11 + i * 11, -69);
      c.addChild(t);
    }
    g.rect(24, -84, 4, 26).fill(m.dark);
    g.circle(26, -88, 6).fill(COLORS.red);
    g.roundRect(-14, -46, 28, 10, 3).fill(m.dark);
  }
  c.addChildAt(g, 0);
  return c;
}

/** A medal roughly 160 px across, origin at the centre of the disc. */
export function drawMedal(medal: Medal): Container {
  const c = new Container();
  const m = MEDAL_COLORS[medal];
  const g = new Graphics();
  // Ribbon.
  g.poly([-46, -150, -14, -150, 18, -50, -14, -50]).fill(0x8a1630);
  g.poly([46, -150, 14, -150, -18, -50, 14, -50]).fill(0x1d3f8a);
  g.circle(0, 6, 82).fill({ color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, 80).fill(m.dark);
  g.circle(0, 0, 72).fill(m.base);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.circle(Math.cos(a) * 76, Math.sin(a) * 76, 2.4).fill(m.light);
  }
  g.circle(0, 0, 56).stroke({ color: m.light, width: 3, alpha: 0.7 });
  // Moth emblem.
  g.ellipse(-20, -6, 20, 26).fill({ color: m.dark, alpha: 0.85 });
  g.ellipse(20, -6, 20, 26).fill({ color: m.dark, alpha: 0.85 });
  g.ellipse(-14, 22, 12, 14).fill({ color: m.dark, alpha: 0.85 });
  g.ellipse(14, 22, 12, 14).fill({ color: m.dark, alpha: 0.85 });
  g.roundRect(-4, -26, 8, 56, 4).fill(m.light);
  g.moveTo(-2, -26).lineTo(-12, -42).stroke({ color: m.light, width: 2 });
  g.moveTo(2, -26).lineTo(12, -42).stroke({ color: m.light, width: 2 });
  c.addChild(g);
  return c;
}
