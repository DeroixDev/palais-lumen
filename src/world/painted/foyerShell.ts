// The painted foyer: cream and midnight marble with the sunburst rosette, the night-blue back
// wall with gilded fans, sign and elevator, all painted once.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { RoomDefinition, RoomTheme } from '../../core/registry';
import { styleFloor, styleWall } from './styleShell';
import { clubWallFinish, isClubStyle } from './clubShell';
import { glowTexture } from '../../core/fx';
import { INK, dark, glowAt, gold, light, paint, rgb, rrect, seeded, type Ctx } from './brush';

export const P_WALL_H = 150;
export const P_SIDE = 24;

/** Points the floor and walls are lit from: chandeliers and sconces. */
export interface LightSpot {
  x: number;
  y: number;
  r: number;
  col: number;
  a: number;
}

export function paintShell(def: RoomDefinition, lights: LightSpot[]) {
  const W = def.width;
  const H = def.height;
  const t = def.theme;
  const draw = (c: Ctx) => {
    floor(c, W, H, t, lights);
    wall(c, W, t, lights);
    sides(c, W, H, t.wall);
  };
  if (W * 1.5 <= 4096) return new Sprite(paint(W, H, draw, 1.5));
  // Long rooms (the boss corridor): painted in strips, so no texture is wider than a GPU allows.
  const c = new Container();
  const TILE = 2048;
  for (let x0 = 0; x0 < W; x0 += TILE) {
    const s = new Sprite(paint(Math.min(TILE, W - x0), H, (ctx) => {
      ctx.translate(-x0, 0);
      draw(ctx);
    }, 1.5));
    s.x = x0;
    c.addChild(s);
  }
  return c;
}

// ---- Floor -----------------------------------------------------------------------------------

function floor(c: Ctx, W: number, H: number, t: RoomTheme, lights: LightSpot[]) {
  const top = P_WALL_H - 6;
  if (t.style === 'foyer') foyerFloor(c, W, H, top, t.carpetAccent);
  else styleFloor(c, W, H, top, t);

  // Light pools and their reflections on the polished floor.
  for (const l of lights) {
    if (l.y < top) {
      glowAt(c, l.x, top + 30, l.r * 0.9, l.r * 0.45, l.col, l.a * 0.6, 'lighter');
      continue;
    }
    glowAt(c, l.x, l.y + 20, l.r * 1.4, l.r, l.col, l.a * 0.55, 'lighter');
    glowAt(c, l.x, l.y + l.r * 0.5, l.r * 0.18, l.r * 0.75, l.col, l.a * 0.5, 'lighter');
  }

  // Ambient occlusion where the floor meets the walls, and a soft vignette.
  const ao = c.createLinearGradient(0, top, 0, top + 90);
  ao.addColorStop(0, 'rgba(4,6,18,0.75)');
  ao.addColorStop(1, 'rgba(4,6,18,0)');
  c.fillStyle = ao;
  c.fillRect(0, top, W, 90);
  for (const [x0, x1] of [[P_SIDE, P_SIDE + 80], [W - P_SIDE, W - P_SIDE - 80]]) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(4,6,18,0.6)');
    g.addColorStop(1, 'rgba(4,6,18,0)');
    c.fillStyle = g;
    c.fillRect(Math.min(x0, x1), top, 80, H - top);
  }
  const bot = c.createLinearGradient(0, H - 120, 0, H);
  bot.addColorStop(0, 'rgba(4,6,18,0)');
  bot.addColorStop(1, 'rgba(4,6,18,0.55)');
  c.fillStyle = bot;
  c.fillRect(0, H - 120, W, 120);
}

function foyerFloor(c: Ctx, W: number, H: number, top: number, accent: number) {
  const r = seeded(W * 3 + H);
  c.fillStyle = '#0c1026';
  c.fillRect(0, top, W, H - top);
  // Harlequin marble, squashed a little for the slanted view.
  const a = 44;
  const b = 31;
  for (let row = 0, y = top - b; y < H + b; row++, y += b) {
    for (let x = -2 * a + (row % 2 ? a : 0); x < W + 2 * a; x += 2 * a) {
      const darkTile = row % 2 === 1;
      const g = c.createLinearGradient(x - a, y - b, x + a * 0.5, y + b);
      if (darkTile) {
        g.addColorStop(0, '#26305e');
        g.addColorStop(1, '#0b0f26');
      } else {
        g.addColorStop(0, '#e2d4b2');
        g.addColorStop(1, '#ad9a76');
      }
      c.beginPath();
      c.moveTo(x, y - b);
      c.lineTo(x + a, y);
      c.lineTo(x, y + b);
      c.lineTo(x - a, y);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      // Veins.
      c.save();
      c.clip();
      for (let v = 0; v < 2; v++) {
        const vx = x - a + r() * a * 2;
        c.beginPath();
        c.moveTo(vx - 20, y - b);
        c.bezierCurveTo(vx + (r() - 0.5) * 40, y - b * 0.3, vx + (r() - 0.5) * 40, y + b * 0.3, vx + (r() - 0.5) * 30 + 10, y + b);
        c.strokeStyle = darkTile ? 'rgba(200,215,255,0.13)' : 'rgba(110,96,80,0.2)';
        c.lineWidth = 0.6 + r() * 1.1;
        c.stroke();
      }
      c.restore();
      // Bevelled edges: light on the upper left, gold seam.
      c.beginPath();
      c.moveTo(x - a, y);
      c.lineTo(x, y - b);
      c.lineTo(x + a, y);
      c.strokeStyle = darkTile ? 'rgba(255,255,255,0.07)' : 'rgba(255,240,210,0.35)';
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath();
      c.moveTo(x - a, y);
      c.lineTo(x, y + b);
      c.lineTo(x + a, y);
      c.strokeStyle = rgb(accent, 0.28);
      c.lineWidth = 1;
      c.stroke();
    }
  }

  // The marble sits in night-blue dusk; only the lamps below bring it up.
  c.fillStyle = 'rgba(6,10,30,0.26)';
  c.fillRect(0, top, W, H - top);

  // Compass star in the middle, with the runner from the door.
  const cx = W / 2;
  const cy = top + (H - top) * 0.47;
  const runner = c.createLinearGradient(cx - 70, 0, cx + 70, 0);
  runner.addColorStop(0, '#4a0f20');
  runner.addColorStop(0.5, '#7e1f36');
  runner.addColorStop(1, '#4a0f20');
  c.fillStyle = runner;
  c.fillRect(cx - 72, cy, 144, H - cy);
  for (const ex of [cx - 72, cx + 66]) {
    c.fillStyle = gold(c, ex, 0, ex + 6, 0);
    c.fillRect(ex, cy, 6, H - cy);
  }
  for (let y = cy + 40; y < H; y += 54) {
    c.beginPath();
    c.moveTo(cx, y - 14);
    c.lineTo(cx + 18, y);
    c.lineTo(cx, y + 14);
    c.lineTo(cx - 18, y);
    c.closePath();
    c.strokeStyle = rgb(accent, 0.6);
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.arc(cx, y, 3, 0, Math.PI * 2);
    c.fillStyle = rgb(accent, 0.7);
    c.fill();
  }
  // The rosette: a midnight disc in a dotted gold ring, a sunburst of gold, cream and jade
  // rays, and the crescent moon of the house in the middle.
  c.save();
  c.translate(cx, cy);
  c.scale(1, 0.74);
  glowAt(c, 0, 0, 260, 260, 0x0a0e24, 0.5);
  c.beginPath();
  c.arc(0, 0, 204, 0, Math.PI * 2);
  const disc = c.createRadialGradient(-40, -60, 10, 0, 0, 204);
  disc.addColorStop(0, '#2a3466');
  disc.addColorStop(1, '#10152e');
  c.fillStyle = disc;
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = gold(c, -204, -204, 204, 204);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, 186, 0, Math.PI * 2);
  c.lineWidth = 1.6;
  c.strokeStyle = rgb(accent, 0.7);
  c.stroke();
  for (let i = 0; i < 72; i++) {
    const ang = (i / 72) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(ang) * 195, Math.sin(ang) * 195, 2.2, 0, Math.PI * 2);
    c.fillStyle = '#fff1c4';
    c.fill();
  }
  // Fine gold hairlines between the rays.
  for (let i = 0; i < 32; i++) {
    const ang = (i / 32) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(ang) * 50, Math.sin(ang) * 50);
    c.lineTo(Math.cos(ang) * 170, Math.sin(ang) * 170);
    c.strokeStyle = 'rgba(242,205,114,0.18)';
    c.lineWidth = 1;
    c.stroke();
  }
  // Rays: two halves each (lit and shaded) so they look carved.
  const ray = (ang: number, len: number, wid: number, litCol: string, shadeCol: string) => {
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(ang + side * wid) * 40, Math.sin(ang + side * wid) * 40);
      c.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      c.closePath();
      c.fillStyle = side < 0 ? litCol : shadeCol;
      c.fill();
    }
  };
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 - Math.PI / 2 + Math.PI / 16;
    ray(ang, 118, 0.1, '#3f9a92', '#1d5a56');
  }
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
    ray(ang, 150, 0.09, '#f2e6c8', '#b8a47e');
  }
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 - Math.PI / 2;
    ray(ang, 182, 0.11, '#f8d27a', '#a8741f');
  }
  // The crescent medallion.
  c.beginPath();
  c.arc(0, 0, 48, 0, Math.PI * 2);
  c.fillStyle = '#141a3a';
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = gold(c, -48, -48, 48, 48);
  c.stroke();
  c.beginPath();
  c.arc(-4, 0, 30, 0, Math.PI * 2);
  c.arc(8, -6, 25, 0, Math.PI * 2, true);
  c.fillStyle = gold(c, -34, -30, 26, 30);
  c.fill('evenodd');
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? 3 : 10;
    c.lineTo(10 + Math.cos(a) * rr, -4 + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = '#fff4d8';
  c.fill();
  c.restore();
}

// ---- Back wall --------------------------------------------------------------------------------

function wall(c: Ctx, W: number, t: RoomTheme, lights: LightSpot[]) {
  const WH = P_WALL_H;
  const col = t.wall;
  const trim = t.wallTrim;
  const g = c.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, rgb(dark(col, 0.45)));
  g.addColorStop(0.65, rgb(light(col, 0.06)));
  g.addColorStop(1, rgb(dark(col, 0.2)));
  c.fillStyle = g;
  c.fillRect(0, 0, W, WH);
  // Lacquer sheen.
  for (let x = 0; x < W; x += 6) {
    c.fillStyle = `rgba(255,255,255,${0.012 + 0.012 * Math.sin(x * 0.05)})`;
    c.fillRect(x, 20, 3, WH - 50);
  }
  // Each floor has its own wall pattern; the foyer has panels with gold sunburst fans.
  if (t.style !== 'foyer') styleWall(c, W, WH, t);
  // The club floor has no gold pilasters or mouldings: steel, LED strips and its own trim.
  if (isClubStyle(t.style)) return clubWallFinish(c, W, WH, t, lights);
  const step = 140;
  for (let x = 0; x <= W; x += step) {
    const px = x + step / 2;
    if (t.style === 'foyer') {
    rrect(c, px - 54, 30, 108, 80, 4);
    c.fillStyle = rgb(dark(col, 0.25), 0.7);
    c.fill();
    c.strokeStyle = rgb(trim, 0.55);
    c.lineWidth = 1.5;
    c.stroke();
    const fy = 106;
    c.save();
    rrect(c, px - 54, 30, 108, 80, 4);
    c.clip();
    for (let k = 0; k <= 12; k++) {
      const ang = Math.PI + (k / 12) * Math.PI;
      c.beginPath();
      c.moveTo(px, fy);
      c.lineTo(px + Math.cos(ang) * 70, fy + Math.sin(ang) * 70);
      c.strokeStyle = rgb(trim, k % 2 ? 0.25 : 0.5);
      c.lineWidth = k % 2 ? 1 : 2;
      c.stroke();
    }
    for (const rr of [24, 46, 66]) {
      c.beginPath();
      c.arc(px, fy, rr, Math.PI, 0);
      c.strokeStyle = gold(c, px - rr, fy - rr, px + rr, fy);
      c.lineWidth = rr === 24 ? 3 : 1.6;
      c.stroke();
    }
    c.restore();
    }
    // Pilaster.
    const pg = c.createLinearGradient(x - 10, 0, x + 10, 0);
    pg.addColorStop(0, rgb(dark(col, 0.3)));
    pg.addColorStop(0.35, rgb(light(col, 0.18)));
    pg.addColorStop(1, rgb(dark(col, 0.35)));
    c.fillStyle = pg;
    c.fillRect(x - 10, 14, 20, WH - 34);
    for (const fx of [-5, 0, 5]) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x + fx - 0.8, 32, 1.6, WH - 64);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(x + fx + 0.8, 32, 1, WH - 64);
    }
    c.fillStyle = gold(c, x - 13, 16, x + 13, 28);
    c.fillRect(x - 13, 16, 26, 10);
    c.fillRect(x - 12, WH - 40, 24, 8);
  }
  // Crown moulding with dentils.
  c.fillStyle = gold(c, 0, 0, 0, 14);
  c.fillRect(0, 0, W, 12);
  c.fillStyle = rgb(dark(col, 0.55));
  c.fillRect(0, 12, W, 6);
  for (let x = 2; x < W; x += 10) {
    c.fillStyle = '#c9963e';
    c.fillRect(x, 12, 5, 5);
  }
  // Wainscot and skirting.
  const wg = c.createLinearGradient(0, WH - 34, 0, WH);
  wg.addColorStop(0, rgb(dark(col, 0.35)));
  wg.addColorStop(1, rgb(dark(col, 0.6)));
  c.fillStyle = wg;
  c.fillRect(0, WH - 32, W, 32);
  c.fillStyle = gold(c, 0, WH - 34, 0, WH - 30);
  c.fillRect(0, WH - 34, W, 4);
  for (let x = 8; x < W; x += 70) {
    rrect(c, x, WH - 26, 60, 16, 3);
    c.strokeStyle = rgb(trim, 0.35);
    c.lineWidth = 1;
    c.stroke();
  }
  c.fillStyle = '#0a0c1c';
  c.fillRect(0, WH - 6, W, 6);
  // Warm light washes from the lamps.
  for (const l of lights) if (l.y <= WH) glowAt(c, l.x, l.y, l.r, l.r * 0.8, l.col, l.a, 'lighter');
  // Darker towards the ceiling.
  const tg = c.createLinearGradient(0, 0, 0, 60);
  tg.addColorStop(0, 'rgba(3,4,14,0.5)');
  tg.addColorStop(1, 'rgba(3,4,14,0)');
  c.fillStyle = tg;
  c.fillRect(0, 12, W, 60);
}

function sides(c: Ctx, W: number, H: number, col: number) {
  const d = rgb(dark(col, 0.55));
  c.fillStyle = d;
  c.fillRect(0, 0, P_SIDE, H);
  c.fillRect(W - P_SIDE, 0, P_SIDE, H);
  c.fillRect(0, H - P_SIDE, W, P_SIDE);
  c.fillStyle = gold(c, 0, 0, 4, 0);
  c.fillRect(P_SIDE - 3, P_WALL_H - 4, 3, H - P_WALL_H - P_SIDE + 4);
  c.fillRect(W - P_SIDE, P_WALL_H - 4, 3, H - P_WALL_H - P_SIDE + 4);
  c.fillRect(P_SIDE - 3, H - P_SIDE, W - 2 * P_SIDE + 6, 3);
  // Top edge of the side walls catches a little light.
  c.fillStyle = 'rgba(255,240,210,0.08)';
  c.fillRect(2, P_WALL_H, 6, H - P_WALL_H);
  c.fillRect(W - 8, P_WALL_H, 6, H - P_WALL_H);
}

// ---- Sign --------------------------------------------------------------------------------------

/** Gilded marquee sign with running bulbs. */
export function paintedSign(text: string, x: number, y: number, font: string) {
  const c = new Container();
  const w = Math.max(220, text.length * 46 + 70);
  const h = 66;
  const plate = new Sprite(
    paint(w + 20, h + 20, (ctx) => {
      ctx.translate(10, 10);
      // Stepped art-deco plate.
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(w - 14, 0);
      ctx.lineTo(w, 14);
      ctx.lineTo(w, h - 14);
      ctx.lineTo(w - 14, h);
      ctx.lineTo(14, h);
      ctx.lineTo(0, h - 14);
      ctx.lineTo(0, 14);
      ctx.closePath();
      ctx.fillStyle = gold(ctx, 0, 0, w, h);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      rrect(ctx, 9, 9, w - 18, h - 18, 6);
      const ig = ctx.createLinearGradient(0, 9, 0, h - 9);
      ig.addColorStop(0, '#0a0e24');
      ig.addColorStop(1, '#1a2248');
      ctx.fillStyle = ig;
      ctx.fill();
      ctx.font = `${Math.round(h * 0.52)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,200,120,0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff2d0';
      ctx.fillText(text, w / 2, h / 2 + 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(12, 12, w - 24, (h - 24) * 0.45);
    }),
  );
  plate.anchor.set(0.5);
  c.addChild(plate);
  const bulbs: Sprite[] = [];
  const n = Math.floor((w * 2 + h * 2) / 26);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const per = (w + h) * 2;
    let d = k * per;
    let bx: number;
    let by: number;
    if (d < w) [bx, by] = [d, 0];
    else if ((d -= w) < h) [bx, by] = [w, d];
    else if ((d -= h) < w) [bx, by] = [w - d, h];
    else [bx, by] = [0, h - (d - w)];
    const dot = new Graphics().circle(0, 0, 2.6).fill(0xfff1c4).stroke({ color: 0x3a2008, width: 1 });
    dot.position.set(bx - w / 2, by - h / 2);
    const gl = new Sprite(glowTexture());
    gl.anchor.set(0.5);
    gl.width = gl.height = 22;
    gl.tint = 0xffcf7a;
    gl.blendMode = 'add';
    gl.position.copyFrom(dot.position);
    c.addChild(gl, dot);
    bulbs.push(gl);
  }
  const halo = new Sprite(glowTexture());
  halo.anchor.set(0.5);
  halo.width = w * 1.8;
  halo.height = h * 2.6;
  halo.tint = 0xffb45a;
  halo.alpha = 0.22;
  halo.blendMode = 'add';
  c.addChildAt(halo, 0);
  c.position.set(x, y);
  return {
    view: c,
    update: (time: number) => {
      bulbs.forEach((b, i) => (b.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 4 - i * 0.55))));
      halo.alpha = 0.2 + Math.sin(time * 1.3) * 0.03;
    },
  };
}

// ---- Elevator -----------------------------------------------------------------------------------

export const P_DOOR_W = 46;

/** Painted elevator: cabin, two sliding brass leaves, the frame with its dial, a needle and a call lamp. */
export function paintedElevator(ex: number, floors: number) {
  const DW = P_DOOR_W;
  const top = 62;
  const WH = P_WALL_H;
  const c = new Container();
  c.position.set(ex, 0);
  const cabin = new Sprite(
    paint(DW * 2, WH - top, (ctx) => {
      // Night-blue lacquer with a gilded fan over a moon-silver mirror (as in the cabin view).
      const g = ctx.createLinearGradient(0, 0, 0, WH - top);
      g.addColorStop(0, '#ffe2b0');
      g.addColorStop(0.22, '#2a3a74');
      g.addColorStop(1, '#0a1030');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, DW * 2, WH - top);
      for (let x = 6; x < DW * 2; x += 15) {
        ctx.fillStyle = 'rgba(224,178,90,0.22)';
        ctx.fillRect(x, 14, 1, WH - top - 30);
      }
      for (let k = 0; k < 9; k++) {
        const a = Math.PI + ((k + 0.5) / 9) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(DW, 12);
        ctx.lineTo(DW + Math.cos(a) * 26, 12 + Math.sin(a) * 26 + 20);
        ctx.strokeStyle = 'rgba(240,200,110,0.55)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      rrect(ctx, DW - 15, 12, 30, 40, 13);
      const mg = ctx.createLinearGradient(DW - 15, 12, DW + 15, 52);
      mg.addColorStop(0, '#eef3ff');
      mg.addColorStop(1, '#8a9cc8');
      ctx.fillStyle = mg;
      ctx.fill();
      ctx.strokeStyle = gold(ctx, DW - 15, 12, DW + 15, 52);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = gold(ctx, 0, 60, 0, 64);
      ctx.fillRect(4, 58, DW * 2 - 8, 3);
      glowAt(ctx, DW, 0, DW * 1.2, 30, 0xffe2a8, 0.7, 'lighter');
    }),
  );
  cabin.position.set(-DW, top);
  c.addChild(cabin);
  const leaf = (side: number) => {
    const s = new Sprite(
      paint(DW, WH - top, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, DW, 0);
        g.addColorStop(0, side < 0 ? '#e8c27a' : '#a8742a');
        g.addColorStop(0.5, '#d4a24e');
        g.addColorStop(1, side < 0 ? '#9a6824' : '#f0cc84');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, DW, WH - top);
        // A night-blue lacquer panel in the brass leaf, with a gilded half-fan rising from the seam.
        rrect(ctx, 6, 6, DW - 12, WH - top - 18, 3);
        const lg = ctx.createLinearGradient(0, 6, 0, WH - top - 12);
        lg.addColorStop(0, '#22306a');
        lg.addColorStop(1, '#0c1434');
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,46,10,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const sx = side < 0 ? DW - 6 : 6;
        const sy = WH - top - 18;
        ctx.save();
        rrect(ctx, 6, 6, DW - 12, WH - top - 18, 3);
        ctx.clip();
        for (let k = 0; k < 7; k++) {
          const ang = ((k + 0.5) / 7) * (Math.PI / 2);
          const len = k % 2 ? 44 : 60;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + side * Math.sin(ang - 0.05) * len, sy - Math.cos(ang - 0.05) * len);
          ctx.lineTo(sx + side * Math.sin(ang + 0.05) * len, sy - Math.cos(ang + 0.05) * len);
          ctx.closePath();
          ctx.fillStyle = k % 2 ? 'rgba(240,200,110,0.55)' : 'rgba(250,214,130,0.85)';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, 12, side < 0 ? Math.PI : 1.5 * Math.PI, side < 0 ? 1.5 * Math.PI : 2 * Math.PI);
        ctx.lineTo(sx, sy);
        ctx.closePath();
        ctx.fillStyle = '#f0c868';
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(side < 0 ? 3 : DW - 6, 4, 3, WH - top - 8);
        ctx.fillStyle = 'rgba(80,46,10,0.8)';
        ctx.fillRect(side < 0 ? DW - 1 : 0, 0, 1, WH - top);
      }),
    );
    s.position.set(side < 0 ? -DW : 0, top);
    const holder = new Container();
    holder.addChild(s);
    return holder;
  };
  const doorL = leaf(-1);
  const doorR = leaf(1);
  const mask = new Graphics().rect(-DW, top, DW * 2, WH - top).fill(0xffffff);
  c.addChild(doorL, doorR, mask);
  doorL.mask = mask;
  doorR.mask = mask;
  const dy = top - 24;
  const fw = DW + 22;
  const frame = new Sprite(
    paint(fw * 2 + 40, WH + 12, (ctx) => {
      ctx.translate(fw + 20, 0);
      // Shadow around the opening.
      glowAt(ctx, 0, WH - 50, fw + 26, 90, 0x05020a, 0.55);
      ctx.beginPath();
      ctx.rect(-fw, top - 16, fw * 2, WH - top + 16);
      ctx.rect(DW, top, -DW * 2, WH - top);
      ctx.fillStyle = gold(ctx, -fw, top - 16, fw, WH);
      ctx.fill('evenodd');
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Fluted jambs.
      for (const jx of [-fw + 5, DW + 5]) {
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = 'rgba(80,46,10,0.45)';
          ctx.fillRect(jx + k * 5, top + 4, 1.5, WH - top - 10);
        }
      }
      // Stepped crown with the dial.
      for (let i = 0; i < 3; i++) {
        const ww = fw + 6 - i * 10;
        rrect(ctx, -ww, top - 24 - i * 9, ww * 2, 12, 3);
        ctx.fillStyle = gold(ctx, -ww, top - 30 - i * 9, ww, top - 16 - i * 9);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, dy, 30, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = gold(ctx, -30, dy - 30, 30, dy);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, dy, 25, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#0c1026';
      ctx.fill();
      for (let f = 0; f < floors; f++) {
        const ang = Math.PI + ((f + 0.5) / floors) * Math.PI;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 19, dy + Math.sin(ang) * 19, f === floors - 1 ? 2.8 : 2.1, 0, Math.PI * 2);
        // Each floor's dot glows in the colour of its light era.
        ctx.fillStyle = ['#ffb347', '#a8c8ff', '#e6eca0', '#ff5fa2', '#fff2d0'][f] ?? '#fff1c4';
        ctx.fill();
      }
      // Call button plate.
      rrect(ctx, DW + 26, 92, 14, 28, 4);
      ctx.fillStyle = gold(ctx, DW + 26, 92, DW + 40, 120);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(DW + 33, 106, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff1c4';
      ctx.fill();
      // Threshold.
      ctx.fillStyle = gold(ctx, 0, WH, 0, WH + 8);
      ctx.fillRect(-DW - 6, WH, (DW + 6) * 2, 7);
    }),
  );
  frame.position.set(-fw - 20, 0);
  c.addChild(frame);
  const needle = new Graphics().poly([-1.6, 0, 0, -21, 1.6, 0]).fill(0xd8243a);
  needle.circle(0, 0, 3.4).fill(0xe0b25a);
  needle.position.set(0, dy);
  c.addChild(needle);
  const lamp = new Sprite(glowTexture());
  lamp.anchor.set(0.5);
  lamp.position.set(DW + 33, 106);
  lamp.width = lamp.height = 44;
  lamp.tint = 0x5fe3ff;
  lamp.blendMode = 'add';
  c.addChild(lamp);
  return { c, doorL, doorR, needle, lamp };
}
