// Small painted medallions, one per game id: a brass ring around dark velvet with the game's
// motif (reels, wheel, dice, cards ...). Used by the day card's "Spielplan", the elevator
// panel and the foyer's programme board. Unknown ids get the house sun.

import { Sprite, type Texture } from 'pixi.js';
import { INK, ellipse, fillInk, glowAt, gold, paint, rgb, rrect, type Ctx } from '../world/painted/brush';

/** Accent of each game's medallion (velvet tint and glow). */
const ACCENT: Record<string, number> = {
  slots: 0xff5fa2,
  roulette: 0x2f9a5a,
  plinko: 0xff8a3a,
  crash: 0x5a7aff,
  blackjack: 0x1d7a4a,
  baccarat: 0xb8243a,
  hilo: 0x8a5ad8,
  craps: 0xd84a2a,
  wheel: 0xffcf3a,
  shells: 0x3ab8b0,
  mines: 0x7a8a9a,
  tower: 0xc8862a,
  coin: 0xe0b25a,
  derby: 0x4ab84a,
  ice: 0x7ad8ff,
  target: 0xe0402a,
  keno: 0x3a8ae0,
  bingo: 0xe05ab8,
  scratch: 0xc0c8d0,
  poker: 0x5fe3ff,
};

export const gameAccent = (id: string) => ACCENT[id] ?? 0xffcf7a;

const CREAM = '#fbf1da';
const RED = '#d0243a';
const DARK = '#141a2b';

function card(c: Ctx, x: number, y: number, w: number, h: number, rot: number, pip: string, col = DARK) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  rrect(c, -w / 2, -h / 2, w, h, w * 0.14);
  fillInk(c, CREAM, Math.max(1, w * 0.06));
  c.fillStyle = col;
  c.font = `bold ${Math.round(h * 0.42)}px Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(pip, 0, h * 0.04);
  c.restore();
}

function die(c: Ctx, x: number, y: number, s: number, rot: number, n: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  rrect(c, -s / 2, -s / 2, s, s, s * 0.2);
  const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#d8c8a8');
  fillInk(c, g, Math.max(1, s * 0.06));
  const spots: Record<number, number[][]> = { 1: [[0, 0]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  for (const [dx, dy] of spots[n] ?? spots[5]) {
    ellipse(c, dx * s * 0.25, dy * s * 0.25, s * 0.085, s * 0.085);
    c.fillStyle = n === 1 ? RED : DARK;
    c.fill();
  }
  c.restore();
}

/** The house sun (unknown ids, blackjack's ace): rays over a half disc. */
function sun(c: Ctx, x: number, y: number, s: number, col = '#f0c868') {
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
    const len = s * (i === 3 ? 0.55 : i % 2 ? 0.44 : 0.5);
    c.beginPath();
    c.moveTo(x + Math.cos(a - 0.12) * s * 0.2, y + s * 0.15 + Math.sin(a - 0.12) * s * 0.2);
    c.lineTo(x + Math.cos(a) * len, y + s * 0.15 + Math.sin(a) * len);
    c.lineTo(x + Math.cos(a + 0.12) * s * 0.2, y + s * 0.15 + Math.sin(a + 0.12) * s * 0.2);
    c.closePath();
    fillInk(c, col, Math.max(1, s * 0.04));
  }
  c.beginPath();
  c.arc(x, y + s * 0.15, s * 0.17, Math.PI, Math.PI * 2);
  c.closePath();
  fillInk(c, col, Math.max(1, s * 0.05));
  c.beginPath();
  c.rect(x - s * 0.5, y + s * 0.15, s, s * 0.06);
  fillInk(c, '#5a3010', Math.max(1, s * 0.03));
}

/** A spark: warm halo, white core, four points. */
function spark(c: Ctx, x: number, y: number, s: number) {
  glowAt(c, x, y, s * 0.7, s * 0.7, 0xffc870, 0.8, 'lighter');
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? s * 0.1 : s * 0.5;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = '#fff6e0';
  c.fill();
}

/** The motif of a game inside a circle of radius r around (0, 0). */
function motif(c: Ctx, id: string, r: number) {
  const s = r;
  const lw = Math.max(1.2, r * 0.07);
  switch (id) {
    case 'slots': {
      rrect(c, -s * 0.62, -s * 0.42, s * 1.24, s * 0.84, s * 0.12);
      fillInk(c, gold(c, -s, -s, s, s), lw);
      const cols = ['#e8531f', '#f3dd9c', '#c8f24a'];
      for (let i = 0; i < 3; i++) {
        rrect(c, -s * 0.52 + i * s * 0.36, -s * 0.32, s * 0.3, s * 0.64, s * 0.05);
        c.fillStyle = CREAM;
        c.fill();
        ellipse(c, -s * 0.37 + i * s * 0.36, 0, s * 0.1, s * 0.1);
        c.fillStyle = cols[i];
        c.fill();
      }
      break;
    }
    case 'roulette': {
      ellipse(c, 0, 0, s * 0.68, s * 0.68);
      fillInk(c, gold(c, -s, -s, s, s), lw);
      for (let i = 0; i < 16; i++) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, s * 0.58, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
        c.closePath();
        c.fillStyle = i === 0 ? '#1d8a4a' : i % 2 ? RED : '#1a1018';
        c.fill();
      }
      ellipse(c, 0, 0, s * 0.3, s * 0.3);
      fillInk(c, gold(c, -s * 0.3, -s * 0.3, s * 0.3, s * 0.3), lw * 0.7);
      ellipse(c, s * 0.42, -s * 0.18, s * 0.08, s * 0.08);
      c.fillStyle = '#ffffff';
      c.fill();
      break;
    }
    case 'plinko': {
      for (let row = 0; row < 4; row++)
        for (let k = 0; k <= row; k++) {
          ellipse(c, (k - row / 2) * s * 0.3, -s * 0.42 + row * s * 0.26, s * 0.06, s * 0.06);
          c.fillStyle = '#ffe7a8';
          c.fill();
        }
      const cols = ['#ff5fa2', '#ffcf7a', '#ffa94a', '#ffcf7a', '#ff5fa2'];
      cols.forEach((col, i) => {
        rrect(c, -s * 0.6 + i * s * 0.24, s * 0.48, s * 0.2, s * 0.16, s * 0.04);
        c.fillStyle = col;
        c.fill();
      });
      glowAt(c, s * 0.14, -s * 0.02, s * 0.3, s * 0.3, 0xfff1c4, 0.7, 'lighter');
      ellipse(c, s * 0.14, -s * 0.02, s * 0.1, s * 0.1);
      c.fillStyle = '#ffffff';
      c.fill();
      break;
    }
    case 'crash': {
      ellipse(c, s * 0.3, -s * 0.3, s * 0.26, s * 0.26);
      c.fillStyle = '#fff4d0';
      c.fill();
      glowAt(c, s * 0.3, -s * 0.3, s * 0.5, s * 0.5, 0xfff1c4, 0.5, 'lighter');
      c.beginPath();
      c.moveTo(-s * 0.6, s * 0.5);
      c.bezierCurveTo(-s * 0.1, s * 0.45, s * 0.1, s * 0.2, s * 0.22, -s * 0.12);
      c.strokeStyle = '#ffcf7a';
      c.lineWidth = lw * 1.4;
      c.stroke();
      spark(c, s * 0.0, s * 0.22, s * 0.5);
      break;
    }
    case 'blackjack':
      card(c, -s * 0.22, s * 0.02, s * 0.62, s * 0.86, -0.22, 'A');
      card(c, s * 0.22, s * 0.02, s * 0.62, s * 0.86, 0.18, 'K', RED);
      break;
    case 'baccarat': {
      card(c, -s * 0.2, -s * 0.04, s * 0.58, s * 0.8, -0.18, '9', RED);
      card(c, s * 0.18, -s * 0.02, s * 0.58, s * 0.8, 0.16, '8');
      ellipse(c, 0, s * 0.5, s * 0.26, s * 0.12);
      fillInk(c, gold(c, -s * 0.3, s * 0.4, s * 0.3, s * 0.6), lw * 0.7);
      break;
    }
    case 'hilo': {
      card(c, 0, 0, s * 0.62, s * 0.88, 0, '7', RED);
      for (const k of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * 0.54, k * s * 0.56);
        c.lineTo(s * 0.4, k * s * 0.3);
        c.lineTo(s * 0.68, k * s * 0.3);
        c.closePath();
        fillInk(c, k < 0 ? '#7ad87a' : '#ff6a6a', lw * 0.6);
      }
      break;
    }
    case 'craps':
      die(c, -s * 0.24, -s * 0.12, s * 0.62, -0.25, 5);
      die(c, s * 0.26, s * 0.18, s * 0.56, 0.3, 6);
      break;
    case 'wheel': {
      ellipse(c, 0, s * 0.05, s * 0.66, s * 0.66);
      fillInk(c, gold(c, -s, -s, s, s), lw);
      const cols = ['#ff5fa2', '#ffcf3a', '#5fe3ff', '#7ad87a', '#c06aff', '#ff8a3a'];
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.moveTo(0, s * 0.05);
        c.arc(0, s * 0.05, s * 0.56, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
        c.closePath();
        c.fillStyle = cols[i % 6];
        c.fill();
      }
      ellipse(c, 0, s * 0.05, s * 0.12, s * 0.12);
      fillInk(c, gold(c, -s * 0.1, -s * 0.1, s * 0.1, s * 0.1), lw * 0.6);
      c.beginPath();
      c.moveTo(-s * 0.12, -s * 0.7);
      c.lineTo(s * 0.12, -s * 0.7);
      c.lineTo(0, -s * 0.44);
      c.closePath();
      fillInk(c, RED, lw * 0.6);
      break;
    }
    case 'shells': {
      for (const [x, lift] of [[-s * 0.42, 0], [0, -s * 0.22], [s * 0.42, 0]]) {
        c.beginPath();
        c.moveTo(x - s * 0.22, s * 0.32 + lift);
        c.quadraticCurveTo(x - s * 0.2, -s * 0.22 + lift, x, -s * 0.24 + lift);
        c.quadraticCurveTo(x + s * 0.2, -s * 0.22 + lift, x + s * 0.22, s * 0.32 + lift);
        c.closePath();
        fillInk(c, gold(c, x - s * 0.2, -s * 0.3, x + s * 0.2, s * 0.3), lw * 0.7);
      }
      glowAt(c, 0, s * 0.3, s * 0.2, s * 0.2, 0xffffff, 0.6, 'lighter');
      ellipse(c, 0, s * 0.32, s * 0.09, s * 0.09);
      c.fillStyle = '#fffaf0';
      c.fill();
      break;
    }
    case 'mines': {
      for (let i = 0; i < 9; i++) {
        const x = ((i % 3) - 1) * s * 0.4;
        const y = (Math.floor(i / 3) - 1) * s * 0.4;
        rrect(c, x - s * 0.17, y - s * 0.17, s * 0.34, s * 0.34, s * 0.06);
        c.fillStyle = i === 4 ? '#1a1018' : i === 2 || i === 6 ? '#3ab8ff' : '#5a4a5a';
        c.fill();
      }
      ellipse(c, 0, 0, s * 0.11, s * 0.11);
      c.fillStyle = RED;
      c.fill();
      for (const i of [2, 6]) {
        const x = ((i % 3) - 1) * s * 0.4;
        const y = (Math.floor(i / 3) - 1) * s * 0.4;
        c.beginPath();
        c.moveTo(x, y - s * 0.1);
        c.lineTo(x + s * 0.09, y);
        c.lineTo(x, y + s * 0.1);
        c.lineTo(x - s * 0.09, y);
        c.closePath();
        c.fillStyle = '#e8fbff';
        c.fill();
      }
      break;
    }
    case 'tower': {
      for (let i = 0; i < 5; i++) {
        const w = s * (0.9 - i * 0.12);
        rrect(c, -w / 2, s * 0.5 - (i + 1) * s * 0.22, w, s * 0.2, s * 0.04);
        fillInk(c, i === 4 ? '#ffcf3a' : i % 2 ? '#c8862a' : '#8a5a2a', lw * 0.5);
      }
      glowAt(c, 0, -s * 0.5, s * 0.3, s * 0.2, 0xffcf7a, 0.6, 'lighter');
      break;
    }
    case 'coin': {
      ellipse(c, 0, 0, s * 0.6, s * 0.6);
      fillInk(c, gold(c, -s * 0.6, -s * 0.6, s * 0.6, s * 0.6), lw);
      ellipse(c, 0, 0, s * 0.46, s * 0.46);
      c.strokeStyle = 'rgba(90,52,12,0.6)';
      c.lineWidth = lw * 0.6;
      c.stroke();
      sun(c, 0, -s * 0.06, s * 0.62, '#fff1c4');
      break;
    }
    case 'derby': {
      // Chequered finish flag over a racing duck.
      c.fillStyle = '#d0b080';
      c.fillRect(-s * 0.5, -s * 0.6, s * 0.06, s * 1.1);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          c.fillStyle = (i + j) % 2 ? '#1a1018' : '#fffaf0';
          c.fillRect(-s * 0.44 + i * s * 0.18, -s * 0.6 + j * s * 0.16, s * 0.18, s * 0.16);
        }
      ellipse(c, s * 0.18, s * 0.32, s * 0.32, s * 0.2);
      fillInk(c, '#ffd84a', lw * 0.6);
      ellipse(c, s * 0.42, s * 0.08, s * 0.14, s * 0.13);
      fillInk(c, '#ffd84a', lw * 0.6);
      c.beginPath();
      c.moveTo(s * 0.54, s * 0.08);
      c.lineTo(s * 0.68, s * 0.12);
      c.lineTo(s * 0.54, s * 0.16);
      c.closePath();
      c.fillStyle = '#ff8a2a';
      c.fill();
      break;
    }
    case 'ice': {
      c.strokeStyle = '#e8fbff';
      c.lineWidth = lw * 1.2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ex = Math.cos(a) * s * 0.6;
        const ey = Math.sin(a) * s * 0.6;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(ex, ey);
        for (const k of [0.55, 0.8]) {
          const mx = Math.cos(a) * s * 0.6 * k;
          const my = Math.sin(a) * s * 0.6 * k;
          for (const t of [-0.6, 0.6]) {
            c.moveTo(mx, my);
            c.lineTo(mx + Math.cos(a + t) * s * 0.16, my + Math.sin(a + t) * s * 0.16);
          }
        }
        c.stroke();
      }
      glowAt(c, 0, 0, s * 0.5, s * 0.5, 0x9ae8ff, 0.5, 'lighter');
      break;
    }
    case 'target': {
      const cols = [RED, CREAM, RED, CREAM, '#ffcf3a'];
      cols.forEach((col, i) => {
        ellipse(c, 0, 0, s * (0.62 - i * 0.12), s * (0.62 - i * 0.12));
        c.fillStyle = col;
        c.fill();
      });
      c.beginPath();
      c.moveTo(s * 0.02, -s * 0.02);
      c.lineTo(s * 0.62, -s * 0.5);
      c.strokeStyle = '#3a2410';
      c.lineWidth = lw * 1.2;
      c.stroke();
      break;
    }
    case 'keno': {
      const nums = ['7', '12', '33', '58'];
      [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.32], [0.3, 0.32]].forEach(([x, y], i) => {
        ellipse(c, x * s, y * s, s * 0.26, s * 0.26);
        fillInk(c, i === 1 ? '#ffcf3a' : '#3a8ae0', lw * 0.6);
        ellipse(c, x * s, y * s, s * 0.15, s * 0.15);
        c.fillStyle = CREAM;
        c.fill();
        c.fillStyle = DARK;
        c.font = `bold ${Math.round(s * 0.18)}px Georgia, serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(nums[i], x * s, y * s + s * 0.01);
      });
      break;
    }
    case 'bingo': {
      rrect(c, -s * 0.56, -s * 0.56, s * 1.12, s * 1.12, s * 0.1);
      fillInk(c, CREAM, lw * 0.7);
      for (let i = 0; i < 16; i++) {
        const x = -s * 0.42 + (i % 4) * s * 0.28;
        const y = -s * 0.42 + Math.floor(i / 4) * s * 0.28;
        if ([0, 5, 10, 15, 6].includes(i)) {
          ellipse(c, x, y, s * 0.11, s * 0.11);
          c.fillStyle = 'rgba(224,90,184,0.85)';
          c.fill();
        } else {
          ellipse(c, x, y, s * 0.04, s * 0.04);
          c.fillStyle = '#8a7a6a';
          c.fill();
        }
      }
      break;
    }
    case 'scratch': {
      rrect(c, -s * 0.6, -s * 0.42, s * 1.2, s * 0.84, s * 0.1);
      fillInk(c, '#f3e6c8', lw * 0.7);
      rrect(c, -s * 0.48, -s * 0.28, s * 0.96, s * 0.56, s * 0.08);
      c.fillStyle = '#a8b0b8';
      c.fill();
      c.save();
      c.clip();
      c.beginPath();
      c.moveTo(-s * 0.48, s * 0.1);
      c.quadraticCurveTo(-s * 0.1, -s * 0.3, s * 0.1, s * 0.3);
      c.lineTo(-s * 0.48, s * 0.3);
      c.closePath();
      c.fillStyle = '#ffcf3a';
      c.fill();
      c.restore();
      ellipse(c, s * 0.38, s * 0.3, s * 0.18, s * 0.18);
      fillInk(c, gold(c, s * 0.2, s * 0.12, s * 0.56, s * 0.48), lw * 0.6);
      break;
    }
    case 'poker':
      card(c, -s * 0.28, s * 0.06, s * 0.54, s * 0.76, -0.32, 'A');
      card(c, 0, -s * 0.02, s * 0.54, s * 0.76, 0, 'K', RED);
      card(c, s * 0.28, s * 0.06, s * 0.54, s * 0.76, 0.32, 'D');
      break;
    default:
      sun(c, 0, -s * 0.1, s * 1.2);
  }
}

/** Paints the medallion of a game centred on (x, y) with radius r into a canvas. */
export function paintGameIcon(c: Ctx, id: string, x: number, y: number, r: number) {
  const acc = gameAccent(id);
  c.save();
  c.translate(x, y);
  ellipse(c, r * 0.04, r * 0.1, r, r);
  c.fillStyle = 'rgba(2,3,8,0.4)';
  c.fill();
  ellipse(c, 0, 0, r, r);
  fillInk(c, gold(c, -r, -r, r * 0.6, r), Math.max(1, r * 0.06));
  ellipse(c, 0, 0, r * 0.84, r * 0.84);
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r * 0.84);
  g.addColorStop(0, rgb(acc, 0.55));
  g.addColorStop(0.45, '#141c40');
  g.addColorStop(1, '#06080e');
  c.fillStyle = g;
  c.fill();
  c.save();
  ellipse(c, 0, 0, r * 0.84, r * 0.84);
  c.clip();
  motif(c, id, r * 0.8);
  c.restore();
  // Glass glint.
  c.beginPath();
  c.ellipse(-r * 0.3, -r * 0.48, r * 0.34, r * 0.14, -0.5, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fill();
  c.strokeStyle = INK;
  c.restore();
}

const cache = new Map<string, Texture>();

/** The medallion as a texture, `px` world pixels across (cached per id and size). */
export function gameIconTexture(id: string, px = 48) {
  const key = `${id}@${px}`;
  let t = cache.get(key);
  if (!t) {
    t = paint(px + 4, px + 6, (c) => paintGameIcon(c, id, px / 2 + 2, px / 2 + 2, px / 2), 2);
    cache.set(key, t);
  }
  return t;
}

/** A sprite of the medallion, centred, about `size` across. */
export function gameIcon(id: string, size: number) {
  const px = size <= 32 ? 32 : size <= 48 ? 48 : 64;
  const s = new Sprite(gameIconTexture(id, px));
  s.anchor.set(0.5, (px / 2 + 2) / (px + 6));
  s.scale.set(size / px);
  return s;
}
