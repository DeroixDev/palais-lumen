// Painted game stations for the floors: slot cabinets, the roulette table, the Plinko
// cabinet and the Mondflug observatory table. Same footprints as the flat versions; the
// container's (0, 0) is the footprint's top left, and tall things rise above it.

import { Container, Sprite } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, propSprite, rgb, rrect, shadow, vgrad, type Ctx } from './brush';

export type PaintedStation = Container & { labelY?: number };

const SLOT_THEMES: Record<string, { body: number; neon: number; trim: 'gold' | number }> = {
  classic: { body: 0x7a1d34, neon: 0xff5fa2, trim: 'gold' },
  diamond: { body: 0x16526b, neon: 0x5fe3ff, trim: 0xcfeaff },
  gold: { body: 0x8a6a1f, neon: 0xffcf7a, trim: 'gold' },
};

function lampSprite(c: Container, x: number, y: number, w: number, h: number, tint: number, alpha = 0.7) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  s.tint = tint;
  s.alpha = alpha;
  s.blendMode = 'add';
  c.addChild(s);
  return s;
}

function stool(c: Ctx, x: number, y: number, col: number) {
  shadow(c, x, y + 4, 16, 6, 0.45);
  c.fillStyle = gold(c, x - 2, y - 10, x + 2, y);
  c.fillRect(x - 2, y - 12, 4, 14);
  ellipse(c, x, y - 14, 12, 6);
  fillInk(c, vgrad(c, y - 20, y - 8, col, 0.35, 0.3), 1.6);
  ellipse(c, x - 3, y - 16, 5, 2);
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fill();
}

function trimFill(c: Ctx, trim: 'gold' | number, x0: number, y0: number, x1: number, y1: number) {
  if (trim === 'gold') return gold(c, x0, y0, x1, y1);
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, rgb(trim));
  g.addColorStop(1, rgb(dark(trim, 0.5)));
  return g;
}

// ---- Slot cabinet ---------------------------------------------------------------------------------

function slotCabinet(options: Record<string, unknown>): PaintedStation {
  const th = SLOT_THEMES[(options.theme as string) ?? 'classic'] ?? SLOT_THEMES.classic;
  const W = 62;
  const H = 50;
  const c: PaintedStation = new Container();
  // Floor point = middle of the footprint's front edge.
  const sp = propSprite(W / 2, H, 110, 190, 55, 150, (x) => {
    shadow(x, 0, -2, 40, 12, 0.6);
    stool(x, 0, 30, 0x3a1a2a);
    // Body: top face and front.
    const bw = 54;
    rrect(x, -bw / 2, -112, bw, 104, 8);
    fillInk(x, vgrad(x, -112, -8, th.body, 0.25, 0.45), 2.2);
    // Side shading for volume.
    const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.18)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(0.8, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.35)');
    rrect(x, -bw / 2, -112, bw, 104, 8);
    x.fillStyle = sg;
    x.fill();
    // Topper: arched marquee.
    x.beginPath();
    x.moveTo(-bw / 2 - 2, -110);
    x.lineTo(-bw / 2 - 2, -124);
    x.quadraticCurveTo(0, -146, bw / 2 + 2, -124);
    x.lineTo(bw / 2 + 2, -110);
    x.closePath();
    fillInk(x, trimFill(x, th.trim, -bw / 2, -146, bw / 2, -110), 2);
    x.beginPath();
    x.moveTo(-bw / 2 + 5, -113);
    x.lineTo(-bw / 2 + 5, -122);
    x.quadraticCurveTo(0, -139, bw / 2 - 5, -122);
    x.lineTo(bw / 2 - 5, -113);
    x.closePath();
    x.fillStyle = rgb(dark(th.body, 0.55));
    x.fill();
    glowAt(x, 0, -122, 30, 12, th.neon, 0.9, 'lighter');
    // Moth emblem in the marquee.
    for (const s of [-1, 1]) {
      ellipse(x, s * 6, -123, 6, 4);
      x.fillStyle = rgb(light(th.neon, 0.5));
      x.fill();
    }
    // Screen with three reels.
    rrect(x, -21, -96, 42, 34, 5);
    fillInk(x, trimFill(x, th.trim, -21, -96, 21, -62), 1.8);
    rrect(x, -18, -93, 36, 28, 3);
    x.fillStyle = '#0c0608';
    x.fill();
    const syms = ['#e8531f', '#f3dd9c', '#c8f24a'];
    for (let i = 0; i < 3; i++) {
      rrect(x, -16 + i * 11.5, -91, 9.5, 24, 2);
      const rg = x.createLinearGradient(0, -91, 0, -67);
      rg.addColorStop(0, '#9a8a78');
      rg.addColorStop(0.5, '#fff6e6');
      rg.addColorStop(1, '#9a8a78');
      x.fillStyle = rg;
      x.fill();
      ellipse(x, -11.3 + i * 11.5, -79, 3.2, 3.2);
      x.fillStyle = syms[i];
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.16)';
    x.beginPath();
    x.moveTo(-18, -93);
    x.lineTo(-6, -93);
    x.lineTo(-14, -65);
    x.lineTo(-18, -65);
    x.closePath();
    x.fill();
    // Button deck sticking out, with the big spin button.
    rrect(x, -bw / 2 - 2, -58, bw + 4, 14, 4);
    fillInk(x, vgrad(x, -58, -44, dark(th.body, 0.2), 0.4, 0.3), 1.8);
    for (const bx of [-16, -6]) {
      ellipse(x, bx, -51, 3.4, 2.4);
      x.fillStyle = '#f3dd9c';
      x.fill();
    }
    ellipse(x, 12, -52, 7, 4);
    fillInk(x, vgrad(x, -56, -48, th.neon, 0.5, 0.2), 1.4);
    // Coin tray and kick plate.
    rrect(x, -12, -32, 24, 8, 3);
    fillInk(x, trimFill(x, th.trim, -12, -32, 12, -24), 1.4);
    x.fillStyle = trimFill(x, th.trim, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
    // Lever.
    x.strokeStyle = INK;
    x.lineWidth = 4.5;
    x.beginPath();
    x.moveTo(bw / 2, -70);
    x.lineTo(bw / 2 + 7, -70);
    x.lineTo(bw / 2 + 7, -100);
    x.stroke();
    x.strokeStyle = trimFill(x, th.trim, bw / 2, -100, bw / 2 + 8, -70);
    x.lineWidth = 2.5;
    x.stroke();
    ellipse(x, bw / 2 + 7, -103, 5, 5);
    fillInk(x, vgrad(x, -108, -98, 0xd8243a, 0.5, 0.3), 1.4);
    // Chasing bulbs down the sides.
    for (let k = 0; k < 6; k++) {
      for (const s of [-1, 1]) {
        ellipse(x, s * (bw / 2 - 4), -104 + k * 15, 1.8, 1.8);
        x.fillStyle = '#fff1c4';
        x.fill();
      }
    }
  });
  c.addChild(sp);
  // The marquee glow pulses (the room animates the child called "lamp").
  const lamp = new Container();
  lamp.label = 'lamp';
  lampSprite(lamp, W / 2, H - 122, 90, 50, th.neon, 0.8);
  lampSprite(lamp, W / 2, H - 79, 50, 40, 0xfff1c4, 0.35);
  c.addChild(lamp);
  c.labelY = H - 152;
  return c;
}

// ---- Roulette table ----------------------------------------------------------------------------

function rouletteTable(options: Record<string, unknown>): PaintedStation {
  const vip = Number(options.minBet ?? 10) >= 50;
  const W = 150;
  const H = 84;
  const felt = vip ? 0x1d3a5a : 0x1d5a3a;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 210, 170, 105, 70, (x) => {
    shadow(x, 0, 26, 92, 30, 0.6);
    // Stools in front.
    for (const sx of [-44, 0, 44]) stool(x, sx, 66, 0x3a1a2a);
    // Table: rounded slab with a thick wooden rim and a skirt.
    rrect(x, -82, -30, 164, 56, 28);
    fillInk(x, vgrad(x, -30, 34, 0x5a2a14, 0.2, 0.4), 2.2);
    rrect(x, -82, -40, 164, 52, 26);
    fillInk(x, vgrad(x, -40, 12, 0x7a3a1c, 0.35, 0.2), 2.2);
    rrect(x, -74, -34, 148, 40, 20);
    const fg = x.createRadialGradient(0, -14, 6, 0, -14, 90);
    fg.addColorStop(0, rgb(light(felt, 0.25)));
    fg.addColorStop(1, rgb(dark(felt, 0.35)));
    x.fillStyle = fg;
    x.fill();
    x.strokeStyle = 'rgba(224,178,90,0.8)';
    x.lineWidth = 1.5;
    x.stroke();
    // Betting grid.
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 3; j++) {
        const red = (i + j) % 2 === 0;
        x.fillStyle = red ? '#b8243a' : '#1b1013';
        x.fillRect(-10 + i * 6.6, -28 + j * 8.4, 5.6, 7.4);
      }
    }
    x.strokeStyle = 'rgba(255,246,230,0.6)';
    x.lineWidth = 0.8;
    x.strokeRect(-11, -29, 81, 26);
    // Wheel bowl on the left.
    ellipse(x, -44, -15, 24, 16);
    fillInk(x, gold(x, -68, -31, -20, 1), 1.8);
    ellipse(x, -44, -16, 19, 12.5);
    x.fillStyle = '#3a1a0c';
    x.fill();
    x.save();
    x.translate(-44, -16);
    x.scale(1, 0.66);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      x.beginPath();
      x.moveTo(0, 0);
      x.arc(0, 0, 17, a, a + (Math.PI * 2) / 18);
      x.closePath();
      x.fillStyle = k === 0 ? '#1f7a4a' : k % 2 ? '#b8243a' : '#1b1013';
      x.fill();
    }
    x.beginPath();
    x.arc(0, 0, 8, 0, Math.PI * 2);
    x.fillStyle = gold(x, -8, -8, 8, 8);
    x.fill();
    x.restore();
    ellipse(x, -38, -21, 2, 2);
    x.fillStyle = '#ffffff';
    x.fill();
    // Chip stacks.
    for (const [cx, cy, col] of [[54, -6, '#2f6fd6'], [62, -2, '#d8243a'], [46, -1, '#e0b25a']] as const) {
      for (let k = 0; k < 3; k++) {
        ellipse(x, cx, cy - k * 2.2, 4.5, 2.4);
        x.fillStyle = col;
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.5)';
        x.lineWidth = 0.6;
        x.stroke();
      }
    }
    // Brass rail highlight.
    x.beginPath();
    x.ellipse(0, -14, 80, 24, 0, Math.PI * 1.1, Math.PI * 1.9);
    x.strokeStyle = 'rgba(255,240,200,0.35)';
    x.lineWidth = 2;
    x.stroke();
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  lampSprite(lamp, W / 2, H / 2 - 10, 220, 110, vip ? 0x9fe8ff : 0xffd49a, 0.35);
  c.addChild(lamp);
  c.labelY = H / 2 - 48;
  return c;
}

// ---- Plinko cabinet ------------------------------------------------------------------------------

function plinkoCabinet(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 130, 200, 65, 160, (x) => {
    shadow(x, 0, -4, 46, 14, 0.6);
    stool(x, 0, 30, 0x3a1a2a);
    const bw = 68;
    rrect(x, -bw / 2, -128, bw, 120, 10);
    fillInk(x, vgrad(x, -128, -8, 0x4a1a4a, 0.25, 0.45), 2.2);
    // Arched top.
    x.beginPath();
    x.moveTo(-bw / 2, -124);
    x.quadraticCurveTo(0, -150, bw / 2, -124);
    x.closePath();
    fillInk(x, gold(x, -bw / 2, -150, bw / 2, -124), 2);
    // Glass board with pegs.
    rrect(x, -27, -118, 54, 78, 6);
    fillInk(x, gold(x, -27, -118, 27, -40), 1.6);
    rrect(x, -23, -114, 46, 70, 4);
    const bg = x.createLinearGradient(0, -114, 0, -44);
    bg.addColorStop(0, '#1a0a26');
    bg.addColorStop(1, '#3a1240');
    x.fillStyle = bg;
    x.fill();
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k <= row; k++) {
        const px = (k - row / 2) * 6;
        const py = -106 + row * 8;
        ellipse(x, px, py, 1.4, 1.4);
        x.fillStyle = '#fff1c4';
        x.fill();
      }
    }
    // Buckets glowing in a rainbow along the bottom.
    const cols = ['#ff5fa2', '#ffa94a', '#ffcf7a', '#c8f24a', '#ffcf7a', '#ffa94a', '#ff5fa2'];
    cols.forEach((col, i) => {
      x.fillStyle = col;
      x.fillRect(-21 + i * 6, -52, 5, 6);
    });
    // A falling moth ball.
    ellipse(x, 3, -84, 2.6, 2.6);
    x.fillStyle = '#ffffff';
    x.fill();
    glowAt(x, 3, -84, 8, 8, 0xfff1c4, 0.8, 'lighter');
    x.fillStyle = 'rgba(255,255,255,0.14)';
    x.beginPath();
    x.moveTo(-23, -114);
    x.lineTo(-8, -114);
    x.lineTo(-20, -44);
    x.lineTo(-23, -44);
    x.closePath();
    x.fill();
    // Deck with drop button.
    rrect(x, -bw / 2 - 2, -36, bw + 4, 14, 4);
    fillInk(x, vgrad(x, -36, -22, 0x2a0e2a, 0.4, 0.3), 1.8);
    ellipse(x, 0, -30, 9, 4.5);
    fillInk(x, vgrad(x, -34, -26, 0xff5fa2, 0.5, 0.2), 1.4);
    x.fillStyle = gold(x, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  lampSprite(lamp, W / 2, H - 80, 90, 110, 0xff5fa2, 0.45);
  c.addChild(lamp);
  c.labelY = H - 156;
  return c;
}

// ---- Mondflug observatory table ------------------------------------------------------------------

function crashTable(): PaintedStation {
  const W = 120;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 190, 190, 95, 110, (x) => {
    shadow(x, 0, 24, 74, 26, 0.6);
    for (const sx of [-38, 0, 38]) stool(x, sx, 64, 0x2a2a4a);
    // Round table with a night-sky top.
    ellipse(x, 0, 6, 64, 28);
    fillInk(x, vgrad(x, -20, 34, 0x2a1a3a, 0.2, 0.5), 2.2);
    x.fillRect(-64, -6, 128, 12);
    ellipse(x, 0, -6, 64, 28);
    fillInk(x, gold(x, -64, -34, 64, 22), 2.2);
    ellipse(x, 0, -6, 58, 24);
    const sky = x.createRadialGradient(-10, -14, 4, 0, -6, 64);
    sky.addColorStop(0, '#2a3a7a');
    sky.addColorStop(1, '#0a1030');
    x.fillStyle = sky;
    x.fill();
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39;
      const rr = 6 + ((i * 37) % 50);
      ellipse(x, Math.cos(a) * rr, -6 + Math.sin(a) * rr * 0.4, 0.9, 0.9);
      x.fillStyle = 'rgba(255,246,230,0.8)';
      x.fill();
    }
    // The flight curve in brass, rising towards the moon.
    x.beginPath();
    x.moveTo(-44, 6);
    x.bezierCurveTo(-10, 4, 14, -4, 30, -20);
    x.strokeStyle = '#ffcf7a';
    x.lineWidth = 2.5;
    x.stroke();
    // Moon globe on a stand behind.
    x.fillStyle = gold(x, 34, -40, 40, -10);
    x.fillRect(35, -42, 4, 30);
    ellipse(x, 37, -54, 15, 15);
    const mg = x.createRadialGradient(32, -60, 3, 37, -54, 15);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#c9a25a');
    x.fillStyle = mg;
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 1.8;
    x.stroke();
    glowAt(x, 37, -54, 34, 34, 0xfff1c4, 0.4, 'lighter');
    // Little brass telescope on the left.
    x.save();
    x.translate(-40, -18);
    x.rotate(-0.5);
    rrect(x, -4, -18, 8, 26, 3);
    fillInk(x, gold(x, -4, -18, 4, 8), 1.4);
    x.restore();
    // A moth flying the curve.
    for (const s of [-1, 1]) {
      ellipse(x, 10 + s * 3.5, -4, 3.5, 2.4);
      x.fillStyle = '#fff1c4';
      x.fill();
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  lampSprite(lamp, W / 2 + 37, H / 2 - 54, 70, 70, 0xfff1c4, 0.6);
  c.addChild(lamp);
  c.labelY = H / 2 - 76;
  return c;
}

export function paintedStation(game: string, options: Record<string, unknown>): PaintedStation | null {
  switch (game) {
    case 'slots':
      return slotCabinet(options);
    case 'roulette':
      return rouletteTable(options);
    case 'plinko':
      return plinkoCabinet();
    case 'crash':
      return crashTable();
  }
  return null;
}

