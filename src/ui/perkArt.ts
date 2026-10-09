// Painted medallions for the Glücksbringer-Kette: an enamel disc in the perk's colour inside a
// rim that shows the rarity (brass, silver-blue, gold with gems), and a small painted sign.
// Painted once per perk and size, then reused (also as data URLs for the HTML bar).

import type { Texture } from 'pixi.js';
import { perkById, type Rarity } from '../core/perks';
import { INK, dark, fillInk, glowAt, light, paint, rgb, type Ctx } from '../world/painted/brush';

export const RARITY_COLOR: Record<Rarity, number> = { common: 0xd9a548, rare: 0x9fd0ff, legendary: 0xffd75a };

const cache = new Map<string, Texture>();

/** Rim gradient per rarity. */
function rimFill(c: Ctx, r: number, rarity: Rarity) {
  const g = c.createLinearGradient(-r, -r, r * 0.6, r);
  const stops: Record<Rarity, string[]> = {
    common: ['#fff1c0', '#d9a548', '#8a5a18', '#e6b85a'],
    rare: ['#f4fbff', '#a9c8e0', '#4a6a8a', '#cfe4f4'],
    legendary: ['#fffbe0', '#ffd75a', '#a8741f', '#fff1a0'],
  };
  stops[rarity].forEach((s, i) => g.addColorStop(i / 3, s));
  return g;
}

/** Cream ink for the signs, with a dark outline. */
function signFill(c: Ctx, path: () => void, fill = '#fff1d0') {
  path();
  c.fillStyle = 'rgba(10,4,16,0.45)';
  c.save();
  c.translate(0.6, 1.2);
  path();
  c.fill();
  c.restore();
  path();
  fillInk(c, fill, 1.4);
}

function coin(c: Ctx, x: number, y: number, rx: number, ry: number) {
  signFill(c, () => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }, '#ffd77a');
}

function star(c: Ctx, x: number, y: number, r: number, fill = '#fff1d0') {
  signFill(c, () => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }, fill);
}

function crescent(c: Ctx, x: number, y: number, r: number, fill = '#fff1d0') {
  signFill(c, () => {
    c.beginPath();
    c.arc(x, y, r, Math.PI * 0.3, Math.PI * 1.7, false);
    c.arc(x + r * 0.45, y - r * 0.1, r * 0.78, Math.PI * 1.55, Math.PI * 0.45, true);
    c.closePath();
  }, fill);
}

/** The sign of each perk, drawn around (0,0) in a box of about ±s. */
function sign(c: Ctx, id: string, s: number) {
  switch (id) {
    case 'polster':
      for (let i = 0; i < 4; i++) coin(c, 0, s * 0.55 - i * s * 0.3, s * 0.62, s * 0.22);
      break;
    case 'sparstrumpf':
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.2, -s * 0.85);
        c.lineTo(s * 0.35, -s * 0.85);
        c.lineTo(s * 0.35, s * 0.25);
        c.quadraticCurveTo(s * 0.35, s * 0.8, -s * 0.25, s * 0.8);
        c.lineTo(-s * 0.7, s * 0.8);
        c.quadraticCurveTo(-s * 0.9, s * 0.4, -s * 0.5, s * 0.25);
        c.lineTo(-s * 0.2, s * 0.15);
        c.closePath();
      }, '#ff9aa8');
      signFill(c, () => {
        c.beginPath();
        c.rect(-s * 0.26, -s * 0.9, s * 0.66, s * 0.3);
      }, '#fff1d0');
      break;
    case 'leichtfuss':
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.7, s * 0.8);
        c.quadraticCurveTo(-s * 0.6, -s * 0.4, s * 0.7, -s * 0.85);
        c.quadraticCurveTo(s * 0.5, s * 0.2, -s * 0.7, s * 0.8);
        c.closePath();
      });
      c.strokeStyle = 'rgba(90,60,30,0.7)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-s * 0.75, s * 0.9);
      c.quadraticCurveTo(-s * 0.1, -s * 0.1, s * 0.55, -s * 0.65);
      c.stroke();
      break;
    case 'mondfaenger':
      crescent(c, -s * 0.15, 0, s * 0.75);
      star(c, s * 0.5, -s * 0.35, s * 0.32, '#bff0ff');
      break;
    case 'pfennig':
      coin(c, 0, 0, s * 0.8, s * 0.8);
      signFill(c, () => {
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          c.moveTo(0, 0);
          c.arc(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25, s * 0.22, 0, Math.PI * 2);
        }
      }, '#4a8a3a');
      break;
    case 'wechselgeld':
      coin(c, -s * 0.3, s * 0.25, s * 0.5, s * 0.5);
      coin(c, s * 0.35, -s * 0.25, s * 0.5, s * 0.5);
      break;
    case 'nachtschicht':
      signFill(c, () => {
        c.beginPath();
        c.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      });
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -s * 0.55);
      c.moveTo(0, 0);
      c.lineTo(s * 0.4, s * 0.15);
      c.stroke();
      break;
    case 'trostpreis':
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.35, 0);
        c.lineTo(-s * 0.55, s * 0.95);
        c.lineTo(-s * 0.2, s * 0.75);
        c.lineTo(0, s * 0.95);
        c.lineTo(s * 0.2, s * 0.75);
        c.lineTo(s * 0.55, s * 0.95);
        c.lineTo(s * 0.35, 0);
        c.closePath();
      }, '#5a8ad0');
      signFill(c, () => {
        c.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          const rr = i % 2 ? s * 0.48 : s * 0.6;
          c.lineTo(Math.cos(a) * rr, -s * 0.2 + Math.sin(a) * rr);
        }
        c.closePath();
      }, '#ff9a6a');
      break;
    case 'sammler':
      signFill(c, () => {
        c.beginPath();
        const w = s * 0.75;
        for (let i = 0; i <= 8; i++) c.lineTo(-w + (i * 2 * w) / 8, -w + (i % 2 ? s * 0.08 : 0));
        for (let i = 0; i <= 8; i++) c.lineTo(w - (i % 2 ? s * 0.08 : 0), -w + (i * 2 * w) / 8);
        for (let i = 0; i <= 8; i++) c.lineTo(w - (i * 2 * w) / 8, w - (i % 2 ? s * 0.08 : 0));
        for (let i = 0; i <= 8; i++) c.lineTo(-w + (i % 2 ? s * 0.08 : 0), w - (i * 2 * w) / 8);
        c.closePath();
      });
      crescent(c, 0, 0, s * 0.4, '#c97aff');
      break;
    case 'kronjuwel':
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.8, s * 0.55);
        c.lineTo(-s * 0.85, -s * 0.45);
        c.lineTo(-s * 0.4, -s * 0.05);
        c.lineTo(0, -s * 0.7);
        c.lineTo(s * 0.4, -s * 0.05);
        c.lineTo(s * 0.85, -s * 0.45);
        c.lineTo(s * 0.8, s * 0.55);
        c.closePath();
      }, '#ffd75a');
      signFill(c, () => {
        c.beginPath();
        c.ellipse(0, s * 0.2, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
      }, '#ff4a7a');
      break;
    case 'glanz':
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.4, -s * 0.9);
        c.lineTo(-s * 0.05, -s * 0.1);
        c.lineTo(s * 0.05, -s * 0.1);
        c.lineTo(s * 0.4, -s * 0.9);
        c.closePath();
      }, '#c8243a');
      signFill(c, () => {
        c.beginPath();
        c.arc(0, s * 0.3, s * 0.5, 0, Math.PI * 2);
      }, '#e8eef4');
      star(c, s * 0.55, -s * 0.2, s * 0.25);
      break;
    case 'straehne':
      star(c, -s * 0.55, s * 0.3, s * 0.32);
      star(c, 0, -s * 0.05, s * 0.36);
      star(c, s * 0.55, -s * 0.4, s * 0.4, '#ffd75a');
      break;
    case 'goldfaden':
      signFill(c, () => {
        c.beginPath();
        c.rect(-s * 0.5, -s * 0.75, s, s * 1.5);
      }, '#7a4a20');
      signFill(c, () => {
        c.beginPath();
        c.rect(-s * 0.38, -s * 0.55, s * 0.76, s * 1.1);
      }, '#ffd75a');
      c.strokeStyle = 'rgba(140,90,20,0.8)';
      c.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = -s * 0.45 + i * s * 0.18;
        c.beginPath();
        c.moveTo(-s * 0.36, y);
        c.lineTo(s * 0.36, y + s * 0.06);
        c.stroke();
      }
      break;
    case 'mondsichel':
      crescent(c, 0, 0, s * 0.9, '#cfe8ff');
      break;
    case 'erbstueck':
      signFill(c, () => {
        c.beginPath();
        c.rect(-s * 0.8, -s * 0.15, s * 1.6, s * 0.85);
      }, '#8a4a20');
      signFill(c, () => {
        c.beginPath();
        c.moveTo(-s * 0.8, -s * 0.15);
        c.quadraticCurveTo(0, -s * 0.9, s * 0.8, -s * 0.15);
        c.closePath();
      }, '#a85a2a');
      signFill(c, () => {
        c.beginPath();
        c.rect(-s * 0.15, -s * 0.25, s * 0.3, s * 0.35);
      }, '#ffd75a');
      break;
  }
}

/** Paints a perk medallion of radius r centred on (0,0). */
export function paintPerk(c: Ctx, id: string, r: number) {
  const p = perkById(id);
  if (!p) return;
  // Shadow.
  c.beginPath();
  c.arc(1, r * 0.1, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(8,4,16,0.45)';
  c.fill();
  if (p.rarity === 'legendary') glowAt(c, 0, 0, r * 1.25, r * 1.25, 0xffd75a, 0.35);
  // Rim.
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  fillInk(c, rimFill(c, r, p.rarity), Math.max(1.4, r * 0.06));
  // Enamel.
  const ri = r * 0.78;
  c.beginPath();
  c.arc(0, 0, ri, 0, Math.PI * 2);
  const g = c.createRadialGradient(-ri * 0.35, -ri * 0.4, 0, 0, 0, ri);
  g.addColorStop(0, rgb(light(p.color, 0.35)));
  g.addColorStop(0.6, rgb(p.color));
  g.addColorStop(1, rgb(dark(p.color, 0.5)));
  fillInk(c, g, 1.2);
  // Studs on the rim (gems for legendary).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    c.beginPath();
    c.arc(Math.cos(a) * r * 0.89, Math.sin(a) * r * 0.89, r * (p.rarity === 'legendary' ? 0.06 : 0.035), 0, Math.PI * 2);
    c.fillStyle = p.rarity === 'legendary' ? (i % 2 ? '#ff4a7a' : '#7ad0ff') : 'rgba(255,248,226,0.7)';
    c.fill();
  }
  sign(c, id, ri * 0.62);
  // Gloss.
  c.beginPath();
  c.ellipse(-ri * 0.3, -ri * 0.45, ri * 0.45, ri * 0.22, -0.5, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.14)';
  c.fill();
}

/** Medallion texture, size × size px with the medallion filling ~88 %. */
export function perkTexture(id: string, size = 96) {
  const key = `${id}-${size}`;
  let t = cache.get(key);
  if (!t) {
    t = paint(size, size, (c) => {
      c.translate(size / 2, size / 2 - size * 0.02);
      paintPerk(c, id, size * 0.44);
    }, 2);
    cache.set(key, t);
  }
  return t;
}

const urls = new Map<string, string>();
/** The medallion as a PNG data URL for the HTML bar. */
export function perkDataUrl(id: string, size = 48) {
  const key = `${id}-${size}`;
  let u = urls.get(key);
  if (!u) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    const c = cv.getContext('2d')!;
    c.scale(2, 2);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.translate(size / 2, size / 2);
    paintPerk(c, id, size * 0.44);
    u = cv.toDataURL();
    urls.set(key, u);
  }
  return u;
}
