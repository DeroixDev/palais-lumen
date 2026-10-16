// Our own card design, painted once per card type into a canvas and used as a background image.
// A card on screen is then one plain element with one image: cheap to create, cheap to paint,
// and every card of a type shares the same decoded bitmap. Saturated colour body, a slanted white
// oval with the big chunky number or symbol, small indices in two corners, a glossy sheen.
// Before the images are ready (first frames, or the web font still loading) a card shows its flat
// colour; once the font has arrived every image is painted again and swapped in by one stylesheet.

import type { Card, Color } from './engine';

export const CARD_COLORS: Record<Color, string> = { r: '#ff2e4d', y: '#ffd21a', g: '#19e07a', b: '#1f8bff' };
const LIGHT: Record<Color, string> = { r: '#ff7088', y: '#ffeb6b', g: '#7dffbc', b: '#6fc0ff' };
const DEEP: Record<Color, string> = { r: '#c8002a', y: '#f59a00', g: '#00a554', b: '#0052cc' };
const INK = '#160726';

/** The symbol sprite (lobby glints only now; the cards draw their own symbols). */
export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
<defs>
  <symbol id="u-glint" viewBox="0 0 40 40"><path d="M20 0l4 16 16 4-16 4-4 16-4-16L0 20l16-4z" fill="currentColor"/></symbol>
</defs></svg>`;

/** Class key of a card face, e.g. r7, bskip, wd4. */
export const faceKey = (c: Card) => `${c.c}${c.k === 'num' ? c.n : c.k}`;

export const cardClass = (c: Card) => `card f-${c.c} cf-${faceKey(c)}`;

/** Markup of one card face (lobby). */
export const cardHTML = (c: Card, attrs = '') => `<div class="${cardClass(c)}"${attrs}></div>`;

export function cardEl(c: Card, tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.className = cardClass(c);
  return el;
}

export function backEl(extra = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card back' + (extra ? ' ' + extra : '');
  return el;
}

// ---------------- painting ----------------

type G = CanvasRenderingContext2D;
const FONT = (px: number) => `italic 900 extra-condensed ${px}px Archivo, "Arial Narrow", Impact, sans-serif`;

function font(g: G, px: number) {
  g.font = FONT(px);
  try { (g as G & { fontStretch?: string }).fontStretch = 'extra-condensed'; } catch { /* older browsers */ }
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Text with a dark outline and a hard drop shadow (sticker look). */
function bold(g: G, text: string, x: number, y: number, px: number, fill: string, outline = 0.085, shadow = 0.05) {
  font(g, px);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = px * outline * 2;
  g.strokeStyle = INK;
  g.fillStyle = INK;
  const s = px * shadow;
  g.strokeText(text, x + s, y + s);
  g.fillText(text, x + s, y + s);
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function oval(g: G) {
  g.beginPath();
  g.ellipse(0, 0, 33, 57, 0, 0, Math.PI * 2);
}

/** The four-colour oval of the wild cards: pinwheel segments, slightly swirled. */
function wildOval(g: G, scale = 1) {
  g.save();
  g.scale(scale, scale);
  oval(g);
  g.save();
  g.clip();
  const cols = [CARD_COLORS.r, CARD_COLORS.b, CARD_COLORS.g, CARD_COLORS.y];
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 2;
    const a1 = a0 + Math.PI / 2;
    g.beginPath();
    g.moveTo(0, 0);
    // swirl: the edges bend a little
    g.quadraticCurveTo(Math.cos(a0 + 0.5) * 30, Math.sin(a0 + 0.5) * 30, Math.cos(a0) * 80, Math.sin(a0) * 80);
    g.lineTo(Math.cos((a0 + a1) / 2) * 110, Math.sin((a0 + a1) / 2) * 110);
    g.lineTo(Math.cos(a1) * 80, Math.sin(a1) * 80);
    g.quadraticCurveTo(Math.cos(a1 + 0.5) * 30, Math.sin(a1 + 0.5) * 30, 0, 0);
    g.closePath();
    g.fillStyle = cols[i];
    g.fill();
  }
  // gloss on the oval
  const sh = g.createLinearGradient(-30, -55, 20, 10);
  sh.addColorStop(0, 'rgba(255,255,255,.45)');
  sh.addColorStop(0.5, 'rgba(255,255,255,.08)');
  sh.addColorStop(0.51, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(-40, -60, 80, 120);
  g.restore();
  oval(g);
  g.lineWidth = 3.2 / Math.max(scale, 0.4);
  g.strokeStyle = '#fff';
  g.stroke();
  g.restore();
}

function skipIcon(g: G, r: number, col: string, outline: boolean) {
  g.lineCap = 'butt';
  const path = () => {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.moveTo(-r * 0.7, r * 0.7);
    g.lineTo(r * 0.7, -r * 0.7);
  };
  if (outline) {
    g.save();
    g.translate(r * 0.08, r * 0.08);
    path(); g.lineWidth = r * 0.62; g.strokeStyle = INK; g.stroke();
    g.restore();
    path(); g.lineWidth = r * 0.62; g.strokeStyle = INK; g.stroke();
  }
  path(); g.lineWidth = r * 0.36; g.strokeStyle = col; g.stroke();
}

function revIcon(g: G, s: number, col: string, outline: boolean) {
  // two fat straight arrows, side by side, pointing opposite ways along the diagonal
  const arrow = () => {
    g.beginPath();
    g.moveTo(-0.6 * s, -0.1 * s);
    g.lineTo(0.14 * s, -0.1 * s);
    g.lineTo(0.14 * s, -0.29 * s);
    g.lineTo(0.6 * s, 0);
    g.lineTo(0.14 * s, 0.29 * s);
    g.lineTo(0.14 * s, 0.1 * s);
    g.lineTo(-0.6 * s, 0.1 * s);
    g.closePath();
  };
  g.save();
  g.rotate(-0.95);
  g.lineJoin = 'round';
  for (const rot of [0, Math.PI]) {
    g.save();
    g.rotate(rot);
    g.translate(0.1 * s, -0.33 * s);
    if (outline) {
      g.save(); g.rotate(-rot); g.translate(s * 0.05, s * 0.05); g.rotate(rot); arrow(); g.lineWidth = s * 0.16; g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.fill(); g.restore();
      arrow(); g.lineWidth = s * 0.16; g.strokeStyle = INK; g.stroke();
    }
    arrow(); g.fillStyle = col; g.fill();
    g.restore();
  }
  g.restore();
}

function corner(g: G, c: Card, x: number, y: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (c.k === 'num') bold(g, String(c.n), 0, 0, 24, '#fff', 0.1, 0.06);
  else if (c.k === 'd2') bold(g, '+2', 0, 0, 21, '#fff', 0.1, 0.06);
  else if (c.k === 'd4') bold(g, '+4', 0, 0, 21, '#fff', 0.1, 0.06);
  else if (c.k === 'skip') skipIcon(g, 6.5, '#fff', true);
  else if (c.k === 'rev') revIcon(g, 14, '#fff', true);
  else { g.rotate(0.5); wildOval(g, 0.17); }
  if (c.k === 'num' && (c.n === 6 || c.n === 9)) { g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 1.6; rr(g, -5, 10, 10, 2.6, 1); g.stroke(); g.fill(); }
  g.restore();
}

function body(g: G, top: string, mid: string, bot: string) {
  rr(g, 0, 0, 100, 150, 9);
  g.fillStyle = '#fff';
  g.fill();
  rr(g, 4.6, 4.6, 90.8, 140.8, 6);
  g.save();
  g.clip();
  const lg = g.createLinearGradient(10, 0, 90, 150);
  lg.addColorStop(0, top);
  lg.addColorStop(0.45, mid);
  lg.addColorStop(1, bot);
  g.fillStyle = lg;
  g.fillRect(0, 0, 100, 150);
  // fine slashes
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.lineWidth = 3;
  for (let i = -150; i < 150; i += 11) { g.beginPath(); g.moveTo(i, 150); g.lineTo(i + 100, 0); g.stroke(); }
  const rg = g.createRadialGradient(28, 22, 0, 28, 22, 80);
  rg.addColorStop(0, 'rgba(255,255,255,.28)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 100, 150);
}

function gloss(g: G) {
  // diagonal sheen across the upper left, then the clip from body() ends
  const sh = g.createLinearGradient(0, 0, 62, 70);
  sh.addColorStop(0, 'rgba(255,255,255,.3)');
  sh.addColorStop(0.55, 'rgba(255,255,255,.05)');
  sh.addColorStop(0.56, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 100, 150);
  g.restore();
  rr(g, 4.6, 4.6, 90.8, 140.8, 6);
  g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(22,7,38,.35)';
  g.stroke();
}

function paintFace(g: G, c: Card) {
  const k = c.c === 'w' ? null : c.c;
  const wild = !k;
  if (!k) body(g, '#2a1a40', '#120a1f', '#05030a');
  else body(g, LIGHT[k], CARD_COLORS[k], DEEP[k]);
  g.save();
  g.translate(50, 75);
  g.rotate(0.5);
  if (wild) wildOval(g);
  else {
    oval(g);
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(22,7,38,.35)';
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 3;
    g.fill();
    g.shadowColor = 'transparent';
  }
  g.restore();
  g.save();
  g.translate(50, 77);
  const col = k ? CARD_COLORS[k] : '#fff';
  switch (c.k) {
    case 'num':
      bold(g, String(c.n), 0, 0, 86, col, 0.075, 0.05);
      if (c.n === 6 || c.n === 9) { g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 3; rr(g, -12, 35, 24, 5, 2); g.stroke(); g.fill(); }
      break;
    case 'd2': bold(g, '+2', -1, 0, 66, col, 0.08, 0.05); break;
    case 'd4': bold(g, '+4', -1, 0, 64, '#fff', 0.09, 0.06); break;
    case 'skip': skipIcon(g, 21, col, true); break;
    case 'rev': revIcon(g, 40, col, true); break;
    case 'wild': break;
  }
  g.restore();
  gloss(g);
  corner(g, c, 15, 18, 0);
  corner(g, c, 85, 132, Math.PI);
}

function paintBack(g: G) {
  body(g, '#4a12c9', '#26066e', '#10022e');
  g.save();
  g.translate(50, 75);
  g.rotate(0.5);
  oval(g);
  const og = g.createLinearGradient(-30, -55, 30, 55);
  og.addColorStop(0, '#ff5fb0');
  og.addColorStop(0.5, '#ff3d9a');
  og.addColorStop(1, '#ff2e4d');
  g.fillStyle = og;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();
  oval(g);
  g.lineWidth = 2.4;
  g.strokeStyle = '#2fe6ff';
  g.stroke();
  g.restore();
  g.save();
  g.translate(50, 75);
  g.rotate(-0.38);
  bold(g, 'UNSER', 0, -21, 17, '#fff', 0.12, 0.06);
  bold(g, 'UNO', 0, 6, 48, '#dcff1f', 0.09, 0.07);
  g.restore();
  g.fillStyle = '#ffe14a';
  for (const [x, y, s] of [[22, 26, 5], [78, 122, 4]] as const) {
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y); g.lineTo(x + s * 0.25, y + s * 0.25);
    g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25); g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25);
    g.closePath();
    g.fill();
  }
  gloss(g);
}

// ---------------- the image cache ----------------

const ALL: Card[] = (() => {
  const out: Card[] = [];
  let id = 0;
  for (const c of ['r', 'y', 'g', 'b'] as const) {
    for (let n = 0; n <= 9; n++) out.push({ id: id++, c, k: 'num', n });
    for (const k of ['skip', 'rev', 'd2'] as const) out.push({ id: id++, c, k });
  }
  out.push({ id: id++, c: 'w', k: 'wild' }, { id: id++, c: 'w', k: 'd4' });
  return out;
})();

let sheet: HTMLStyleElement | null = null;
let urls: string[] = [];
let gen = 0;

function paintAll() {
  const my = ++gen;
  // big enough for the largest card on screen (lobby fan ~150 css px) at the device's pixel ratio
  const W = Math.round(Math.min(300, Math.max(160, 150 * Math.min(devicePixelRatio || 1, 2))));
  const H = Math.round(W * 1.5);
  const jobs: { sel: string; paint: (g: G) => void }[] = [
    { sel: '.card.back', paint: paintBack },
    ...ALL.map((c) => ({ sel: `.cf-${faceKey(c)}`, paint: (g: G) => paintFace(g, c) })),
  ];
  const rules: string[] = new Array(jobs.length).fill('');
  const fresh: string[] = [];
  let left = jobs.length;
  const finish = () => {
    if (my !== gen) { fresh.forEach((u) => URL.revokeObjectURL(u)); return; }
    sheet ??= document.head.appendChild(document.createElement('style'));
    sheet.textContent = rules.join('\n');
    const old = urls;
    urls = fresh;
    // the old images may still be on screen for a moment
    setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 3000);
  };
  // painted in small slices when the page is idle: never one long task, not even on a slow phone
  let i = 0;
  const idle: (cb: () => void) => void = 'requestIdleCallback' in window ? (cb) => requestIdleCallback(cb, { timeout: 120 }) : (cb) => setTimeout(cb, 16);
  const slice = () => {
    if (my !== gen) return;
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 6) {
      const k = i++;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d')!;
      g.scale(W / 100, H / 150);
      jobs[k].paint(g);
      cv.toBlob((b) => {
        if (b) { const u = URL.createObjectURL(b); fresh.push(u); rules[k] = `${jobs[k].sel}{background-image:url(${u})}`; }
        if (--left === 0) finish();
      }, 'image/png');
    }
    if (i < jobs.length) idle(slice);
  };
  slice();
}

let started = false;
/** Paints every card type once (and again when the web font has arrived). */
export function prepareCards() {
  if (started) return;
  started = true;
  const f = document.fonts;
  if (!f) { paintAll(); return; }
  const want = FONT(80);
  let withFont = false;
  // never wait long: paint with the fallback font, the real one swaps in when it arrives
  const late = setTimeout(paintAll, 1200);
  const tryFont = () => f.load(want).then((faces) => {
    if (!faces.length || withFont) return;
    withFont = true;
    clearTimeout(late);
    paintAll();
  }, () => {});
  void tryFont();
  // the font stylesheet may not even be parsed yet: try again once fonts have loaded
  f.addEventListener('loadingdone', () => { if (!withFont) void tryFont(); });
}
