// The small house-tech tablet that hangs on the back wall of every room: a brass-framed wall
// panel like the room controls in a grand hotel, its night-blue screen showing a moon and the
// room's climate. Painted once; the screen breathes a little light.

import { Container, Sprite } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, ellipse, fillInk, glowAt, gold, paint, rgb, rim, rrect } from './brush';

const W = 30;
const H = 40;
/** Height of the panel's middle on the back wall (the wall face runs from 0 to WALL_H). */
export const TABLET_Y = 96;

let tex: ReturnType<typeof paint> | null = null;

function texture() {
  if (tex && !tex.destroyed) return tex;
  tex = paint(W + 16, H + 18, (c) => {
    c.translate((W + 16) / 2, (H + 18) / 2 - 2);
    // Shadow on the wall, a little down and right.
    c.fillStyle = 'rgba(8,4,14,0.4)';
    rrect(c, -W / 2 + 2.5, -H / 2 + 3.5, W, H, 6);
    c.fill();
    // Brass frame with a stepped deco crown.
    rrect(c, -W / 2, -H / 2, W, H, 5.5);
    fillInk(c, gold(c, -W / 2, -H / 2, W / 2, H / 2), 1.6);
    rim(c, 0.55, 1);
    c.beginPath();
    c.moveTo(-5, -H / 2 + 0.5);
    c.lineTo(-3, -H / 2 - 2.5);
    c.lineTo(3, -H / 2 - 2.5);
    c.lineTo(5, -H / 2 + 0.5);
    c.closePath();
    fillInk(c, gold(c, -5, -H / 2 - 3, 5, -H / 2), 1.1);
    // Black glass bezel.
    rrect(c, -W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 3.5);
    c.fillStyle = '#0a0d1a';
    c.fill();
    // Screen: night blue, a little lighter at the top.
    const sx = -W / 2 + 5;
    const sy = -H / 2 + 5;
    const sw = W - 10;
    const sh = H - 16;
    rrect(c, sx, sy, sw, sh, 2);
    const g = c.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0, '#26407a');
    g.addColorStop(0.55, '#14224a');
    g.addColorStop(1, '#0b1430');
    c.fillStyle = g;
    c.fill();
    c.save();
    rrect(c, sx, sy, sw, sh, 2);
    c.clip();
    glowAt(c, 0, sy + 7, 10, 8, 0x9fb8ff, 0.35, 'lighter');
    // Crescent moon in moon silver.
    c.fillStyle = '#e8eefc';
    ellipse(c, 0, sy + 7, 3.6, 3.6);
    c.fill();
    c.fillStyle = '#1d3164';
    ellipse(c, 1.6, sy + 6.2, 3.1, 3.1);
    c.fill();
    // Two thin status lines and a row of dots (climate, light, do-not-disturb).
    c.fillStyle = 'rgba(200,214,245,0.75)';
    c.fillRect(sx + 3, sy + 13.5, sw - 6, 1.2);
    c.fillStyle = 'rgba(200,214,245,0.4)';
    c.fillRect(sx + 3, sy + 16.5, sw - 9, 1);
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i === 1 ? '#ffd98a' : 'rgba(200,214,245,0.55)';
      ellipse(c, sx + 5 + i * 5, sy + 20.5, 1.1, 1.1);
      c.fill();
    }
    // Glare across the glass.
    c.beginPath();
    c.moveTo(sx - 2, sy + 9);
    c.lineTo(sx + 9, sy - 2);
    c.lineTo(sx + 14, sy - 2);
    c.lineTo(sx - 2, sy + 15);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    c.restore();
    rrect(c, sx, sy, sw, sh, 2);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
    // Brass home key under the screen.
    ellipse(c, 0, H / 2 - 6, 2.6, 2.6);
    fillInk(c, gold(c, -3, H / 2 - 9, 3, H / 2 - 3), 0.9);
    c.strokeStyle = INK;
    // Tiny status light, top right of the bezel.
    c.fillStyle = rgb(0x8affc0, 0.9);
    ellipse(c, W / 2 - 5.5, -H / 2 + 4, 0.8, 0.8);
    c.fill();
  });
  return tex;
}

/** The tablet at x on the back wall, with the soft light of its screen (call `update` per frame). */
export function paintedTablet(x: number) {
  const v = new Container();
  v.position.set(x, TABLET_Y);
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(0, -4);
  glow.width = 46;
  glow.height = 40;
  glow.tint = 0x6f8fe0;
  glow.alpha = 0.22;
  glow.blendMode = 'add';
  const s = new Sprite(texture());
  s.anchor.set(0.5);
  v.addChild(glow, s);
  return {
    view: v,
    update(time: number) {
      glow.alpha = 0.18 + 0.06 * Math.sin(time * 1.3);
    },
  };
}
