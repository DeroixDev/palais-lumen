// Painted floors and back-wall patterns for the five casino floors. The foyer has its own
// in foyerShell.ts; light pools, ambient occlusion, mouldings and pilasters are shared there.

import type { RoomTheme } from '../../core/registry';
import { clubFloor, clubWall, isClubStyle } from './clubShell';
import { dark, ellipse, glowAt, gold, light, mix, rgb, rrect, seeded, type Ctx } from './brush';

// ---- Floors -------------------------------------------------------------------------------------

export function styleFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme) {
  const r = seeded(W * 7 + H * 3 + t.carpet);
  switch (t.style) {
    case 'velvet':
      return velvetFloor(c, W, H, top, t, r);
    case 'garden':
      return gardenFloor(c, W, H, top, t, r);
    case 'clockwork':
      return clockFloor(c, W, H, top, t, r);
    case 'crystal':
      return crystalFloor(c, W, H, top, t, r);
    case 'throne':
      return throneFloor(c, W, H, top, t, r);
    case 'club':
    case 'techno':
    case 'hiphop':
      return clubFloor(c, W, H, top, t);
    default:
      c.fillStyle = rgb(t.carpet);
      c.fillRect(0, top, W, H - top);
  }
}

/** Deep velvet carpet with a gold lattice, little sunburst medallions and a soft nap. */
function velvetFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, rgb(dark(t.carpet, 0.25)));
  g.addColorStop(0.5, rgb(t.carpet));
  g.addColorStop(1, rgb(dark(t.carpet, 0.2)));
  c.fillStyle = g;
  c.fillRect(0, top, W, H - top);
  nap(c, W, H, top, t.carpetPattern, r, 2600, 0.18);
  // Lattice of diamonds, squashed for the slant.
  const a = 54;
  const b = 38;
  c.lineWidth = 1.6;
  for (let row = 0, y = top; y < H + b; row++, y += b) {
    for (let x = row % 2 ? a : 0; x < W + a; x += a * 2) {
      c.beginPath();
      c.moveTo(x, y - b);
      c.lineTo(x + a, y);
      c.lineTo(x, y + b);
      c.lineTo(x - a, y);
      c.closePath();
      c.strokeStyle = rgb(t.carpetAccent, 0.22);
      c.stroke();
      // Medallion: a tiny sunburst of gold thread.
      c.save();
      c.translate(x, y + 2);
      c.scale(1, 0.72);
      for (let k = 0; k < 7; k++) {
        const an = Math.PI + ((k + 0.5) / 7) * Math.PI;
        c.beginPath();
        c.moveTo(Math.cos(an - 0.14) * 2.5, Math.sin(an - 0.14) * 2.5);
        c.lineTo(Math.cos(an) * (k % 2 ? 7 : 10), Math.sin(an) * (k % 2 ? 7 : 10));
        c.lineTo(Math.cos(an + 0.14) * 2.5, Math.sin(an + 0.14) * 2.5);
        c.closePath();
        c.fillStyle = rgb(t.carpetAccent, 0.38);
        c.fill();
      }
      ellipse(c, 0, 0, 2.6, 2.6);
      c.fillStyle = rgb(t.carpetAccent, 0.5);
      c.fill();
      c.restore();
    }
  }
  border(c, W, H, top, t.carpetAccent, 46);
}

/** Moonlit lawn with a winding flagstone path. */
function gardenFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, '#0f2418');
  g.addColorStop(0.5, rgb(t.carpet));
  g.addColorStop(1, '#0c1d14');
  c.fillStyle = g;
  c.fillRect(0, top, W, H - top);
  // Blades of grass, moonlight on their tips.
  for (let i = 0; i < 9000; i++) {
    const x = r() * W;
    const y = top + r() * (H - top);
    const h = 3 + r() * 6;
    const lean = (r() - 0.5) * 4;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
    const k = r();
    c.strokeStyle = k < 0.15 ? 'rgba(170,215,230,0.35)' : k < 0.6 ? 'rgba(40,90,52,0.7)' : 'rgba(10,30,18,0.6)';
    c.lineWidth = 1.2;
    c.stroke();
  }
  // Clover and tiny flowers.
  for (let i = 0; i < 140; i++) {
    const x = r() * W;
    const y = top + 20 + r() * (H - top - 20);
    const col = [0xdff6ff, 0xc9a0ff, 0xfff1c4][Math.floor(r() * 3)];
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2;
      ellipse(c, x + Math.cos(ang) * 2.4, y + Math.sin(ang) * 1.6, 1.8, 1.3);
      c.fillStyle = rgb(col, 0.75);
      c.fill();
    }
  }
  // Flagstone path: a loop from the elevator round the middle.
  const path: [number, number][] = [];
  for (let k = 0; k <= 60; k++) {
    const ang = (k / 60) * Math.PI * 2;
    path.push([W / 2 + Math.cos(ang) * W * 0.36, top + (H - top) * 0.52 + Math.sin(ang) * (H - top) * 0.3]);
  }
  for (let k = 0; k < path.length && !t.bare; k++) {
    const [x, y] = path[k];
    for (let j = 0; j < 2; j++) stone(c, x + (r() - 0.5) * 30, y + (r() - 0.5) * 14, 16 + r() * 8, r);
  }
  if (!t.bare) for (let y = top + 10; y < top + (H - top) * 0.22; y += 22) stone(c, W / 2 + (r() - 0.5) * 20, y, 18, r);
  // Moonlight wash from the upper left.
  glowAt(c, W * 0.25, top + 40, W * 0.6, (H - top) * 0.7, 0x9fc8ff, 0.12, 'lighter');
}

function stone(c: Ctx, x: number, y: number, s: number, r: () => number) {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.62);
  c.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rr = s * (0.8 + r() * 0.3);
    i ? c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  c.closePath();
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.save();
  c.translate(1.5, 3);
  c.fill();
  c.restore();
  const g = c.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#a9b3bf');
  g.addColorStop(1, '#4f5866');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(20,24,32,0.8)';
  c.lineWidth = 1.5;
  c.stroke();
  c.restore();
}

/** Oiled wooden planks with brass plates and rivets. */
function clockFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const ph = 26;
  for (let row = 0, y = top; y < H; row++, y += ph) {
    let x = -r() * 160;
    while (x < W) {
      const len = 120 + r() * 140;
      const base = mix(0x5a3a22, 0x3a2414, r());
      const g = c.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, rgb(light(base, 0.12)));
      g.addColorStop(1, rgb(dark(base, 0.25)));
      c.fillStyle = g;
      c.fillRect(x, y, len, ph);
      // Grain.
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        const gy = y + 3 + r() * (ph - 6);
        c.moveTo(x + 4, gy);
        c.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 4, x + len * 0.7, gy + (r() - 0.5) * 4, x + len - 4, gy);
        c.strokeStyle = 'rgba(20,10,4,0.22)';
        c.lineWidth = 0.8;
        c.stroke();
      }
      c.fillStyle = 'rgba(16,8,4,0.8)';
      c.fillRect(x + len - 1, y, 2, ph);
      c.fillStyle = 'rgba(255,220,170,0.12)';
      c.fillRect(x, y, len, 1.5);
      x += len;
    }
    c.fillStyle = 'rgba(10,6,2,0.7)';
    c.fillRect(0, y + ph - 1.5, W, 1.5);
  }
  // Brass floor plates with rivets, here and there.
  for (let i = 0; i < 10; i++) {
    const x = 120 + r() * (W - 240);
    const y = top + 60 + r() * (H - top - 120);
    rrect(c, x - 34, y - 20, 68, 40, 4);
    c.fillStyle = gold(c, x - 34, y - 20, x + 34, y + 20);
    c.globalAlpha = 0.55;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(40,20,6,0.7)';
    c.lineWidth = 1.5;
    c.stroke();
    for (const [dx, dy] of [[-28, -14], [28, -14], [-28, 14], [28, 14]]) {
      ellipse(c, x + dx, y + dy, 2.2, 2.2);
      c.fillStyle = '#f0cc84';
      c.fill();
    }
  }
  border(c, W, H, top, t.carpetAccent, 40);
}

/** Pale polished marble in big squares, with glints of ice. */
function crystalFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const s = 96;
  const sy = 66;
  for (let row = 0, y = top; y < H; row++, y += sy) {
    for (let col = 0, x = 0; x < W; col++, x += s) {
      const alt = (row + col) % 2 === 0;
      const g = c.createLinearGradient(x, y, x + s, y + sy);
      g.addColorStop(0, alt ? '#dbe8f4' : '#9fb4cc');
      g.addColorStop(1, alt ? '#9cb0c8' : '#5d7290');
      c.fillStyle = g;
      c.fillRect(x, y, s, sy);
      // Veins.
      c.beginPath();
      let vx = x + r() * s;
      let vy = y;
      c.moveTo(vx, vy);
      while (vy < y + sy) {
        vx += (r() - 0.5) * 22;
        vy += 6 + r() * 10;
        c.lineTo(vx, Math.min(vy, y + sy));
      }
      c.strokeStyle = alt ? 'rgba(120,140,170,0.35)' : 'rgba(220,240,255,0.25)';
      c.lineWidth = 0.8 + r();
      c.stroke();
      c.strokeStyle = 'rgba(232,244,255,0.55)';
      c.lineWidth = 1.2;
      c.strokeRect(x + 0.5, y + 0.5, s - 1, sy - 1);
    }
  }
  // Inlaid silver star lines where tiles meet.
  for (let i = 0; i < 40; i++) {
    const x = Math.round(r() * (W / s)) * s;
    const y = top + Math.round(r() * ((H - top) / sy)) * sy;
    c.save();
    c.translate(x, y);
    c.scale(1, 0.7);
    for (let k = 0; k < 4; k++) {
      c.rotate(Math.PI / 4);
      c.beginPath();
      c.moveTo(0, -9);
      c.lineTo(2, 0);
      c.lineTo(0, 9);
      c.lineTo(-2, 0);
      c.closePath();
      c.fillStyle = k % 2 ? 'rgba(232,244,255,0.85)' : 'rgba(159,232,255,0.8)';
      c.fill();
    }
    c.restore();
  }
  c.fillStyle = 'rgba(14,22,40,0.32)';
  c.fillRect(0, top, W, H - top);
  border(c, W, H, top, t.carpetAccent, 40);
}

/** Night-blue marble slabs with brass inlay, and a runner up to the Kuppel. */
function throneFloor(c: Ctx, W: number, H: number, top: number, t: RoomTheme, r: () => number) {
  const sh = 44;
  for (let row = 0, y = top; y < H; row++, y += sh) {
    let x = row % 2 ? -40 : 0;
    while (x < W) {
      const w = 80 + r() * 50;
      const base = mix(0x1a2450, 0x0c1230, r());
      const g = c.createLinearGradient(x, y, x + w * 0.4, y + sh);
      g.addColorStop(0, rgb(light(base, 0.1)));
      g.addColorStop(1, rgb(dark(base, 0.3)));
      rrect(c, x + 1, y + 1, w - 2, sh - 2, 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(224,178,90,0.22)';
      c.lineWidth = 1.4;
      c.stroke();
      // Moon-silver veins in the marble.
      if (r() < 0.45) {
        c.beginPath();
        c.moveTo(x + r() * w, y + 3);
        c.quadraticCurveTo(x + r() * w, y + sh * 0.5, x + r() * w, y + sh - 3);
        c.strokeStyle = 'rgba(200,214,255,0.12)';
        c.lineWidth = 1;
        c.stroke();
      }
      x += w;
    }
  }
  // A long corridor gets its runner lengthwise, from the elevator to the Kuppel.
  if (W > H * 3) {
    const cy = top + (H - top) * 0.52;
    const rg = c.createLinearGradient(0, cy - 70, 0, cy + 70);
    rg.addColorStop(0, rgb(dark(t.carpetPattern, 0.2)));
    rg.addColorStop(0.5, rgb(light(t.carpetPattern, 0.12)));
    rg.addColorStop(1, rgb(dark(t.carpetPattern, 0.2)));
    c.fillStyle = rg;
    c.fillRect(0, cy - 70, W, 140);
    for (let i = 0; i < W / 3; i++) {
      c.fillStyle = r() < 0.5 ? rgb(light(t.carpetPattern, 0.3), 0.2) : rgb(dark(t.carpetPattern, 0.4), 0.2);
      c.fillRect(r() * W, cy - 70 + r() * 140, 3, 1);
    }
    // Small brass fans woven into the runner, pointing the way.
    for (let x = 120; x < W; x += 160) {
      c.save();
      c.translate(x, cy + 6);
      c.scale(1, 0.7);
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + ((k + 0.5) / 7) * Math.PI;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a - 0.08) * 22, Math.sin(a - 0.08) * 22);
        c.lineTo(Math.cos(a + 0.08) * 22, Math.sin(a + 0.08) * 22);
        c.closePath();
        c.fillStyle = rgb(t.carpetAccent, 0.32);
        c.fill();
      }
      c.restore();
    }
    for (const ey of [cy - 70, cy + 63]) {
      c.fillStyle = gold(c, 0, ey, 0, ey + 7);
      c.fillRect(0, ey, W, 7);
    }
    c.fillStyle = 'rgba(4,6,20,0.3)';
    c.fillRect(0, top, W, H - top);
    return;
  }
  // Runner from the door to the throne.
  const cx = W / 2;
  const rg = c.createLinearGradient(cx - 80, 0, cx + 80, 0);
  rg.addColorStop(0, rgb(dark(t.carpetPattern, 0.2)));
  rg.addColorStop(0.5, rgb(light(t.carpetPattern, 0.15)));
  rg.addColorStop(1, rgb(dark(t.carpetPattern, 0.2)));
  c.fillStyle = rg;
  c.fillRect(cx - 80, top, 160, H - top);
  nap(c, W, H, top, t.carpetPattern, r, 600, 0.2, cx - 80, 160);
  for (const ex of [cx - 80, cx + 72]) {
    c.fillStyle = gold(c, ex, 0, ex + 8, 0);
    c.fillRect(ex, top, 8, H - top);
  }
  c.fillStyle = 'rgba(4,6,20,0.3)';
  c.fillRect(0, top, W, H - top);
}

/** Soft carpet nap: lots of tiny short strokes. */
function nap(c: Ctx, W: number, H: number, top: number, col: number, r: () => number, n: number, a: number, x0 = 0, w = W) {
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w;
    const y = top + r() * (H - top);
    c.fillStyle = r() < 0.5 ? rgb(light(col, 0.3), a) : rgb(dark(col, 0.4), a);
    c.fillRect(x, y, 2 + r() * 3, 1);
  }
}

/** Gold border inset from the walls. */
function border(c: Ctx, W: number, H: number, top: number, col: number, inset: number) {
  c.strokeStyle = rgb(col, 0.5);
  c.lineWidth = 3;
  c.strokeRect(inset, top + inset * 0.6, W - inset * 2, H - top - inset * 1.4);
  c.strokeStyle = rgb(col, 0.22);
  c.lineWidth = 1.2;
  c.strokeRect(inset + 10, top + inset * 0.6 + 8, W - inset * 2 - 20, H - top - inset * 1.4 - 16);
}

// ---- Walls ---------------------------------------------------------------------------------------

/** The pattern between crown moulding and wainscot. */
export function styleWall(c: Ctx, W: number, WH: number, t: RoomTheme) {
  const r = seeded(W + t.wall);
  if (isClubStyle(t.style)) return clubWall(c, W, WH, t);
  switch (t.style) {
    case 'velvet': {
      // Damask wallpaper: rows of gold-thread flourishes.
      for (let y = 26; y < WH - 34; y += 34) {
        for (let x = (y / 34) % 2 ? 0 : 22; x < W; x += 44) {
          c.save();
          c.translate(x, y + 8);
          c.beginPath();
          c.moveTo(0, -12);
          c.bezierCurveTo(9, -6, 9, 6, 0, 12);
          c.bezierCurveTo(-9, 6, -9, -6, 0, -12);
          c.fillStyle = rgb(light(t.wall, 0.12), 0.7);
          c.fill();
          c.strokeStyle = rgb(t.wallTrim, 0.22);
          c.lineWidth = 1;
          c.stroke();
          ellipse(c, 0, 0, 2, 2);
          c.fillStyle = rgb(t.wallTrim, 0.35);
          c.fill();
          c.restore();
        }
      }
      return;
    }
    case 'garden': {
      // Night sky above a stone balustrade: stars, a big moon, a trellis.
      const g = c.createLinearGradient(0, 0, 0, WH);
      g.addColorStop(0, '#050a1e');
      g.addColorStop(0.7, '#14244a');
      g.addColorStop(1, '#1d3358');
      c.fillStyle = g;
      c.fillRect(0, 14, W, WH - 48);
      for (let i = 0; i < 260; i++) {
        const x = r() * W;
        const y = 16 + r() * (WH - 60);
        const s = r() < 0.08 ? 1.8 : 0.9;
        ellipse(c, x, y, s, s);
        c.fillStyle = `rgba(230,240,255,${0.4 + r() * 0.6})`;
        c.fill();
      }
      const mx = W * 0.18;
      glowAt(c, mx, 60, 120, 90, 0xdff0ff, 0.35, 'lighter');
      ellipse(c, mx, 60, 30, 30);
      const mg = c.createRadialGradient(mx - 8, 52, 4, mx, 60, 30);
      mg.addColorStop(0, '#fffbe8');
      mg.addColorStop(1, '#c9d6e8');
      c.fillStyle = mg;
      c.fill();
      // Trellis arches.
      for (let x = 0; x < W; x += 140) {
        c.beginPath();
        c.moveTo(x + 10, WH - 34);
        c.lineTo(x + 10, 60);
        c.quadraticCurveTo(x + 70, 10, x + 130, 60);
        c.lineTo(x + 130, WH - 34);
        c.strokeStyle = 'rgba(200,214,230,0.45)';
        c.lineWidth = 3;
        c.stroke();
        for (let k = 1; k < 5; k++) {
          c.beginPath();
          c.moveTo(x + 10 + k * 24, 50);
          c.lineTo(x + 10 + k * 24, WH - 34);
          c.strokeStyle = 'rgba(200,214,230,0.18)';
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
      return;
    }
    case 'clockwork': {
      // Riveted copper plates and a run of pipes.
      for (let x = 0; x < W; x += 70) {
        for (let y = 20; y < WH - 40; y += 46) {
          const base = mix(0x8a4a24, 0x5a2e16, r());
          const g = c.createLinearGradient(x, y, x + 70, y + 46);
          g.addColorStop(0, rgb(light(base, 0.15)));
          g.addColorStop(1, rgb(dark(base, 0.3)));
          c.fillStyle = g;
          c.fillRect(x + 1, y + 1, 68, 44);
          for (const [dx, dy] of [[5, 5], [64, 5], [5, 40], [64, 40]]) {
            ellipse(c, x + dx, y + dy, 1.8, 1.8);
            c.fillStyle = '#f0b878';
            c.fill();
          }
        }
      }
      for (const py of [34, 92]) {
        const g = c.createLinearGradient(0, py - 5, 0, py + 5);
        g.addColorStop(0, '#f0cc84');
        g.addColorStop(0.5, '#b07a2a');
        g.addColorStop(1, '#5a3a10');
        c.fillStyle = g;
        c.fillRect(0, py - 5, W, 10);
        for (let x = 30; x < W; x += 110) {
          c.fillStyle = gold(c, x, py - 8, x + 10, py + 8);
          c.fillRect(x, py - 8, 10, 16);
        }
      }
      return;
    }
    case 'crystal': {
      // Frosted glass panels in silver frames, with a cool shimmer.
      for (let x = 0; x < W; x += 70) {
        const g = c.createLinearGradient(x, 20, x + 70, WH - 40);
        g.addColorStop(0, 'rgba(223,246,255,0.35)');
        g.addColorStop(0.5, 'rgba(120,170,220,0.15)');
        g.addColorStop(1, 'rgba(223,246,255,0.25)');
        c.fillStyle = g;
        c.fillRect(x + 4, 22, 62, WH - 64);
        c.strokeStyle = 'rgba(232,244,255,0.7)';
        c.lineWidth = 2;
        c.strokeRect(x + 4, 22, 62, WH - 64);
        c.beginPath();
        c.moveTo(x + 12, 28);
        c.lineTo(x + 30, 28);
        c.lineTo(x + 12, 70);
        c.closePath();
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fill();
        for (let k = 0; k < 4; k++) {
          ellipse(c, x + 10 + r() * 50, 26 + r() * (WH - 70), 1.2, 1.2);
          c.fillStyle = 'rgba(255,255,255,0.8)';
          c.fill();
        }
      }
      return;
    }
    case 'throne': {
      // Night-blue lacquer panels in brass frames, each crowned with a small sunburst.
      const pw = 80;
      for (let x = 0; x < W; x += pw) {
        const g = c.createLinearGradient(x, 16, x + pw, WH - 40);
        g.addColorStop(0, rgb(light(t.wall, 0.12)));
        g.addColorStop(1, rgb(dark(t.wall, 0.25)));
        c.fillStyle = g;
        c.fillRect(x + 6, 18, pw - 12, WH - 58);
        c.strokeStyle = rgb(t.wallTrim, 0.55);
        c.lineWidth = 1.6;
        c.strokeRect(x + 6, 18, pw - 12, WH - 58);
        c.strokeStyle = rgb(t.wallTrim, 0.2);
        c.lineWidth = 1;
        c.strokeRect(x + 11, 23, pw - 22, WH - 68);
        // Sunburst over the panel's foot.
        const fx = x + pw / 2;
        const fy = WH - 46;
        for (let k = 0; k < 9; k++) {
          const a = Math.PI + ((k + 0.5) / 9) * Math.PI;
          c.beginPath();
          c.moveTo(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6);
          c.lineTo(fx + Math.cos(a) * (k % 2 ? 22 : 30), fy + Math.sin(a) * (k % 2 ? 22 : 30));
          c.strokeStyle = rgb(t.wallTrim, k % 2 ? 0.25 : 0.4);
          c.lineWidth = 1.4;
          c.stroke();
        }
        c.beginPath();
        c.arc(fx, fy, 6, Math.PI, 0);
        c.fillStyle = rgb(t.wallTrim, 0.45);
        c.fill();
        // Moon-silver stars scattered in the lacquer.
        for (let k = 0; k < 3; k++) {
          ellipse(c, x + 14 + r() * (pw - 28), 26 + r() * (WH - 100), 0.9, 0.9);
          c.fillStyle = 'rgba(223,232,255,0.55)';
          c.fill();
        }
      }
      // A thin brass frieze of steps along the top.
      for (let x = 0; x < W; x += 16) {
        c.fillStyle = rgb(t.wallTrim, x % 32 ? 0.25 : 0.45);
        c.fillRect(x, 8, 10, x % 32 ? 4 : 7);
      }
      return;
    }
  }
}
