// Floors and walls of the club floor (floor 4): the black-stone club with its sunburst of
// neon seams, the raw concrete techno bunker and the hip-hop floor's court and graffiti bricks.
// Called from styleShell.ts / foyerShell.ts; painted once into the room shell.

import type { RoomStyle, RoomTheme } from '../../core/registry';
import { dark, ellipse, glowAt, light, mix, rgb, rrect, seeded, type Ctx } from './brush';

export const CLUB_STYLES: readonly RoomStyle[] = ['club', 'techno', 'hiphop'];
export const isClubStyle = (s: string) => (CLUB_STYLES as readonly string[]).includes(s);

const MAGENTA = 0xff3fb4;
const CYAN = 0x3fe8ff;

// ---- Floors -------------------------------------------------------------------------------------

export function clubFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme) {
  const r = seeded(W * 13 + H);
  if (t.style === 'techno') return concrete(c, W, H, top, r);
  if (t.style === 'hiphop') return court(c, W, H, top, t, r);
  // Polished black stone, cut in a sunburst around the stage.
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, '#120c1c');
  g.addColorStop(0.5, rgb(t.carpet));
  g.addColorStop(1, '#0a0812');
  c.fillStyle = g;
  c.fillRect(0, top, W, H - top);
  // Terrazzo chips.
  for (let i = 0; i < W * H * 0.004; i++) {
    const x = r() * W;
    const y = top + r() * (H - top);
    const col = [0x3a2a52, 0x2a3a5a, 0x5a2a4a, 0x8a8aa8][Math.floor(r() * 4)];
    ellipse(c, x, y, 0.8 + r() * 1.8, 0.6 + r() * 1.2);
    c.fillStyle = rgb(col, 0.5 + r() * 0.4);
    c.fill();
  }
  const cx = W / 2;
  const cy = top + 40;
  // Seams radiating from the stage, alternately magenta and cyan.
  const n = 34;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI * (0.03 + (k / n) * 0.94);
    const len = Math.max(W, H) * 1.4;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 260, cy + Math.sin(a) * 180);
    c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.7);
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = rgb(k % 2 ? MAGENTA : CYAN, k % 4 === 0 ? 0.32 : 0.12);
    c.lineWidth = 1.2;
    c.stroke();
  }
  // Concentric rings (squashed for the slant), every one a little dimmer.
  for (let i = 1; i < 9; i++) {
    const rx = 260 + i * 190;
    c.beginPath();
    c.ellipse(cx, cy, rx, rx * 0.62, 0, 0.02, Math.PI - 0.02);
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = rgb(i % 2 ? 0xc9a0ff : CYAN, 0.18 - i * 0.012);
    c.lineWidth = 1.4;
    c.stroke();
  }
  // Glossy reflections of the neon and the stage.
  glowAt(c, cx, top + 60, W * 0.32, 160, MAGENTA, 0.16, 'lighter');
  glowAt(c, cx * 0.4, H * 0.7, 300, 160, CYAN, 0.06, 'lighter');
  glowAt(c, cx * 1.6, H * 0.7, 300, 160, 0xc9a0ff, 0.06, 'lighter');
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = top + 20 + r() * (H - top - 40);
    c.fillStyle = 'rgba(255,255,255,0.025)';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 60, y);
    c.lineTo(x + 30, y + 40);
    c.lineTo(x - 30, y + 40);
    c.closePath();
    c.fill();
  }
  // A glowing edge strip just in front of the walls.
  c.strokeStyle = rgb(t.neon, 0.35);
  c.lineWidth = 2;
  c.strokeRect(34, top + 22, W - 68, H - top - 52);
}

/** Raw concrete with saw-cut joints, steel strips, stains and hazard tape. */
function concrete(c: Ctx, W: number, H: number, top: number, r: () => number) {
  const g = c.createLinearGradient(0, top, W, H);
  g.addColorStop(0, '#2a2a2e');
  g.addColorStop(0.5, '#1d1d22');
  g.addColorStop(1, '#141418');
  c.fillStyle = g;
  c.fillRect(0, top, W, H - top);
  // Aggregate and pores.
  for (let i = 0; i < W * H * 0.01; i++) {
    const x = r() * W;
    const y = top + r() * (H - top);
    c.fillStyle = r() < 0.5 ? `rgba(200,200,210,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.1 + r() * 0.15})`;
    c.fillRect(x, y, 1 + r() * 2, 1 + r());
  }
  // Mottled patches.
  for (let i = 0; i < 30; i++) glowAt(c, r() * W, top + r() * (H - top), 40 + r() * 90, 20 + r() * 40, r() < 0.5 ? 0x000000 : 0x5a5a66, 0.12);
  // Saw-cut joints.
  for (let x = 120; x < W; x += 160) {
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(x, top, 2, H - top);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(x + 2, top, 1, H - top);
  }
  for (let y = top + 110; y < H; y += 110) {
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, y, W, 2);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(0, y + 2, W, 1);
  }
  // Cracks.
  for (let i = 0; i < 8; i++) {
    let x = r() * W;
    let y = top + r() * (H - top);
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.3) * 26;
      y += (r() - 0.5) * 16;
      c.lineTo(x, y);
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
  }
  // Spilled drinks and boot scuffs.
  for (let i = 0; i < 10; i++) {
    ellipse(c, r() * W, top + 40 + r() * (H - top - 80), 10 + r() * 24, 5 + r() * 10);
    c.fillStyle = 'rgba(10,8,14,0.35)';
    c.fill();
  }
  // Hazard tape along the side walls.
  for (const x0 of [30, W - 46]) {
    c.save();
    c.beginPath();
    c.rect(x0, top + 20, 16, H - top - 60);
    c.clip();
    c.fillStyle = '#d8b020';
    c.fillRect(x0, top + 20, 16, H - top - 60);
    for (let y = top; y < H; y += 22) {
      c.beginPath();
      c.moveTo(x0 - 4, y);
      c.lineTo(x0 + 20, y + 16);
      c.lineTo(x0 + 20, y + 26);
      c.lineTo(x0 - 4, y + 10);
      c.closePath();
      c.fillStyle = '#141414';
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x0, top + 20, 16, H - top - 60);
    c.restore();
  }
  // Red light leaking from the strip at the foot of the wall.
  glowAt(c, W / 2, top + 10, W * 0.6, 60, 0xff2040, 0.18, 'lighter');
}

/** Honey parquet painted like a basketball court, scuffed by sneakers. */
function court(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const ph = 18;
  for (let y = top; y < H; y += ph) {
    let x = -r() * 200;
    while (x < W) {
      const len = 90 + r() * 160;
      const base = mix(0xb07a40, 0x8a5a2a, r());
      const g = c.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, rgb(light(base, 0.15)));
      g.addColorStop(1, rgb(dark(base, 0.2)));
      c.fillStyle = g;
      c.fillRect(x, y, len, ph);
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        const gy = y + 3 + r() * (ph - 6);
        c.moveTo(x + 3, gy);
        c.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 3, x + len * 0.7, gy + (r() - 0.5) * 3, x + len - 3, gy);
        c.strokeStyle = 'rgba(60,30,10,0.18)';
        c.lineWidth = 0.8;
        c.stroke();
      }
      c.fillStyle = 'rgba(40,20,6,0.6)';
      c.fillRect(x + len - 1, y, 1.5, ph);
      x += len;
    }
    c.fillStyle = 'rgba(40,20,6,0.5)';
    c.fillRect(0, y + ph - 1, W, 1);
  }
  // Varnish shine.
  const sg = c.createLinearGradient(0, top, W, H);
  sg.addColorStop(0, 'rgba(255,230,190,0.12)');
  sg.addColorStop(0.5, 'rgba(255,230,190,0)');
  sg.addColorStop(1, 'rgba(255,230,190,0.06)');
  c.fillStyle = sg;
  c.fillRect(0, top, W, H - top);
  // Court lines: centre circle, half-court line and the key in the team colour.
  const cx = W / 2;
  const cy = top + (H - top) * 0.55;
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(255,248,236,0.75)';
  c.beginPath();
  c.ellipse(cx, cy, 120, 74, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(cx, top + 30);
  c.lineTo(cx, H - 30);
  c.stroke();
  c.strokeRect(40, top + 26, W - 80, H - top - 60);
  for (const s of [-1, 1]) {
    const kx = s < 0 ? 40 : W - 40;
    c.fillStyle = rgb(t.carpetPattern, 0.55);
    c.fillRect(s < 0 ? kx : kx - 170, cy - 80, 170, 160);
    c.strokeRect(s < 0 ? kx : kx - 170, cy - 80, 170, 160);
    c.beginPath();
    c.ellipse(kx + s * 170, cy, 70, 80, 0, -Math.PI / 2, Math.PI / 2, s < 0);
    c.stroke();
    c.beginPath();
    c.ellipse(kx, cy, 340, 300, 0, -Math.PI / 2, Math.PI / 2, s < 0);
    c.stroke();
  }
  // Moth logo in the centre circle.
  c.save();
  c.translate(cx, cy);
  c.scale(1, 0.62);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * 34, -8, 34, 24, s * 0.4, 0, Math.PI * 2);
    c.fillStyle = rgb(t.carpetPattern, 0.7);
    c.fill();
    c.beginPath();
    c.ellipse(s * 24, 26, 20, 17, -s * 0.4, 0, Math.PI * 2);
    c.fill();
  }
  rrect(c, -6, -34, 12, 70, 6);
  c.fillStyle = 'rgba(255,248,236,0.8)';
  c.fill();
  c.restore();
  // Black sneaker scuffs.
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = top + r() * (H - top);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 8, y - 3 + r() * 6, x + 10 + r() * 14, y + (r() - 0.5) * 6);
    c.strokeStyle = `rgba(20,12,8,${0.15 + r() * 0.25})`;
    c.lineWidth = 1 + r() * 2;
    c.stroke();
  }
}

// ---- Walls --------------------------------------------------------------------------------------

/** The pattern of the wall (between ceiling and skirting). */
export function clubWall(c: Ctx, W: number, WH: number, t: RoomTheme) {
  const r = seeded(W + t.wall * 3);
  if (t.style === 'techno') return foamWall(c, W, WH, r);
  if (t.style === 'hiphop') return brickWall(c, W, WH, r);
  // Club: diamond-tufted padding in deep plum, cut by vertical neon slits.
  const g = c.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, '#0e0816');
  g.addColorStop(1, rgb(t.wall));
  c.fillStyle = g;
  c.fillRect(0, 0, W, WH);
  const a = 22;
  const b = 18;
  for (let row = 0, y = 20; y < WH - 30; row++, y += b) {
    for (let x = row % 2 ? a : 0; x < W + a; x += a * 2) {
      c.beginPath();
      c.moveTo(x, y - b);
      c.lineTo(x + a, y);
      c.lineTo(x, y + b);
      c.lineTo(x - a, y);
      c.closePath();
      const pg = c.createRadialGradient(x - 5, y - 5, 2, x, y, a);
      pg.addColorStop(0, rgb(light(t.wall, 0.2)));
      pg.addColorStop(1, rgb(dark(t.wall, 0.4)));
      c.fillStyle = pg;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1;
      c.stroke();
      ellipse(c, x, y - b, 1.6, 1.6);
      c.fillStyle = 'rgba(220,200,255,0.5)';
      c.fill();
    }
  }
  for (let x = 90; x < W; x += 220) {
    const col = (x / 220) % 2 < 1 ? MAGENTA : CYAN;
    glowAt(c, x, WH * 0.5, 26, WH * 0.6, col, 0.35, 'lighter');
    rrect(c, x - 3, 18, 6, WH - 50, 3);
    c.fillStyle = rgb(light(col, 0.5));
    c.fill();
  }
  c.fillStyle = 'rgba(4,2,10,0.25)';
  c.fillRect(0, 0, W, WH);
}

/** Techno: black acoustic foam above, bare concrete below, cable trays and a red LED strip. */
function foamWall(c: Ctx, W: number, WH: number, r: () => number) {
  c.fillStyle = '#0c0c10';
  c.fillRect(0, 0, W, WH);
  const s = 14;
  for (let y = 18; y < WH * 0.62; y += s) {
    for (let x = 0; x < W; x += s) {
      const flip = ((x + y) / s) % 2 < 1;
      const g = c.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, flip ? '#2a2a32' : '#141418');
      g.addColorStop(1, flip ? '#101014' : '#24242a');
      c.fillStyle = g;
      c.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
      c.beginPath();
      c.moveTo(x + 1, y + 1);
      c.lineTo(x + s / 2, y + s / 2);
      c.lineTo(x + s - 1, y + 1);
      c.strokeStyle = 'rgba(255,255,255,0.05)';
      c.lineWidth = 1;
      c.stroke();
    }
  }
  // Concrete below.
  const cy = WH * 0.62;
  const g = c.createLinearGradient(0, cy, 0, WH);
  g.addColorStop(0, '#3a3a40');
  g.addColorStop(1, '#232328');
  c.fillStyle = g;
  c.fillRect(0, cy, W, WH - cy);
  for (let i = 0; i < W * 0.6; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
    c.fillRect(r() * W, cy + r() * (WH - cy), 1.5, 1.5);
  }
  for (let x = 60; x < W; x += 180) {
    // Form-tie holes.
    for (const dy of [12, 30]) {
      ellipse(c, x, cy + dy, 2.4, 2.4);
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fill();
    }
  }
  // Cable tray with a bundle of cables.
  c.fillStyle = '#4a4a52';
  c.fillRect(0, cy - 8, W, 6);
  for (let k = 0; k < 4; k++) {
    c.beginPath();
    c.moveTo(0, cy - 9 - k * 1.5);
    for (let x = 0; x <= W; x += 60) c.lineTo(x, cy - 9 - k * 1.5 + Math.sin(x * 0.03 + k) * 1.2);
    c.strokeStyle = ['#111', '#2a2a2a', '#5a1010', '#1a2a4a'][k];
    c.lineWidth = 2;
    c.stroke();
  }
  // Red LED strip.
  glowAt(c, W / 2, cy - 18, W * 0.7, 18, 0xff2040, 0.4, 'lighter');
  c.fillStyle = '#ff6070';
  c.fillRect(0, cy - 19, W, 2);
  // Stickers and stencils.
  for (let i = 0; i < Math.floor(W / 260); i++) {
    const x = 120 + i * 260 + r() * 60;
    const y = cy + 18 + r() * 30;
    c.save();
    c.translate(x, y);
    c.rotate((r() - 0.5) * 0.3);
    const lbl = ['KEINE FOTOS', '134 BPM', 'BUNKER', 'NACHT'][i % 4];
    c.font = '700 9px "Barlow Condensed", sans-serif';
    const w = c.measureText(lbl).width + 10;
    c.fillStyle = i % 2 ? '#e8e8e8' : '#ff3050';
    c.fillRect(-w / 2, -7, w, 14);
    c.fillStyle = i % 2 ? '#111' : '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(lbl, 0, 0.5);
    c.restore();
  }
}

/** Hip-hop: red brick covered in graffiti, tags and spray drips. */
function brickWall(c: Ctx, W: number, WH: number, r: () => number) {
  c.fillStyle = '#3a1a14';
  c.fillRect(0, 0, W, WH);
  const bh = 11;
  const bw = 30;
  for (let row = 0, y = 14; y < WH; row++, y += bh) {
    for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
      const base = mix(0x8a3a28, 0x5a2216, r());
      c.fillStyle = rgb(base);
      c.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      c.fillStyle = 'rgba(255,220,190,0.08)';
      c.fillRect(x + 1, y + 1, bw - 2, 1.5);
    }
  }
  // Graffiti pieces: bubble letters with outline, fill gradient and drips.
  const words = ['FALTER', 'BOOM', 'CREW', 'MOND', 'BAP', 'NACHT'];
  const cols: [string, string][] = [['#ffd23f', '#ff6b2f'], ['#3fe8ff', '#3f6bff'], ['#ff3fb4', '#a03fff'], ['#7bff6a', '#1fa05a']];
  for (let i = 0, x = 60; x < W - 60; i++) {
    const word = words[i % words.length];
    const size = 34 + r() * 14;
    const y = 54 + r() * 34;
    c.save();
    c.translate(x, y);
    c.rotate((r() - 0.5) * 0.16);
    c.font = `900 ${size}px "Barlow Condensed", Impact, sans-serif`;
    c.textBaseline = 'middle';
    const wd = c.measureText(word).width;
    const [c1, c2] = cols[i % cols.length];
    // Spray haze behind.
    glowAt(c, wd / 2, 0, wd * 0.7, size * 0.8, parseInt(c1.slice(1), 16), 0.2);
    c.lineJoin = 'round';
    c.lineWidth = 9;
    c.strokeStyle = '#140a14';
    c.strokeText(word, 0, 0);
    c.lineWidth = 4;
    c.strokeStyle = '#fff6e6';
    c.strokeText(word, 0, 0);
    const g = c.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    c.fillStyle = g;
    c.fillText(word, 0, 0);
    // Highlights and drips.
    c.fillStyle = 'rgba(255,255,255,0.6)';
    for (let k = 0; k < 4; k++) c.fillRect(r() * wd, -size * 0.3, 3, 2);
    for (let k = 0; k < 3; k++) {
      const dx = r() * wd;
      const len = 8 + r() * 22;
      c.fillStyle = c2;
      c.fillRect(dx, size * 0.3, 2.2, len);
      ellipse(c, dx + 1.1, size * 0.3 + len, 2, 2.4);
      c.fill();
    }
    c.restore();
    x += wd + 70 + r() * 80;
  }
  // Small tags and a stencilled moth here and there.
  for (let i = 0; i < W / 70; i++) {
    const x = r() * W;
    const y = 20 + r() * (WH - 50);
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 5; k++) c.quadraticCurveTo(x + k * 6 + 3, y - 8 + r() * 16, x + k * 6 + 6, y + (r() - 0.5) * 6);
    c.strokeStyle = ['rgba(20,10,20,0.7)', 'rgba(255,255,255,0.55)', 'rgba(63,232,255,0.5)'][i % 3];
    c.lineWidth = 1.6;
    c.stroke();
  }
  for (let x = 200; x < W; x += 420) {
    c.save();
    c.translate(x, WH - 52);
    c.fillStyle = 'rgba(14,8,14,0.7)';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(s * 9, -3, 9, 6, s * 0.4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(s * 6, 7, 5, 4, -s * 0.4, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(-1.5, -9, 3, 20);
    c.restore();
  }
}

/** Crown, skirting and light washes for the club styles (instead of gold pilasters and moulding). */
export function clubWallFinish(c: Ctx, W: number, WH: number, t: RoomTheme, lights: { x: number; y: number; r: number; col: number; a: number }[]) {
  const hip = t.style === 'hiphop';
  const tech = t.style === 'techno';
  // Ceiling edge: black steel with an LED strip (or a concrete lintel on the hip-hop floor).
  c.fillStyle = hip ? '#2a2420' : '#0a0a0e';
  c.fillRect(0, 0, W, 14);
  if (!hip) {
    glowAt(c, W / 2, 14, W * 0.7, 10, t.neon, 0.5, 'lighter');
    c.fillStyle = rgb(light(t.neon, 0.4));
    c.fillRect(0, 12, W, 2);
  } else {
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(0, 12, W, 2);
  }
  // Skirting with an underglow.
  c.fillStyle = tech ? '#18181c' : hip ? '#1a1210' : '#08060e';
  c.fillRect(0, WH - 14, W, 14);
  if (!hip) {
    glowAt(c, W / 2, WH - 2, W * 0.7, 12, t.neon, 0.4, 'lighter');
    c.fillStyle = rgb(light(t.neon, 0.3), 0.9);
    c.fillRect(0, WH - 4, W, 1.5);
  }
  c.fillStyle = '#060408';
  c.fillRect(0, WH - 6, W, 6);
  for (const l of lights) if (l.y <= WH) glowAt(c, l.x, l.y, l.r, l.r * 0.8, l.col, l.a * 0.6, 'lighter');
  const tg = c.createLinearGradient(0, 0, 0, 60);
  tg.addColorStop(0, 'rgba(2,0,6,0.6)');
  tg.addColorStop(1, 'rgba(2,0,6,0)');
  c.fillStyle = tg;
  c.fillRect(0, 14, W, 60);
}
