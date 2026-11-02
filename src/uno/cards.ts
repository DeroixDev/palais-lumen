// Our own card design, painted once per card type into a canvas and used as a background image.
// A card on screen is then one plain element with one image: cheap to create, cheap to paint,
// and every card of a type shares the same decoded bitmap.
//
// The look ("ruhiger Tisch"): flat and crisp. A white rim, one solid colour, a white disc with the
// big upright number or symbol, indices in two corners. Every colour also has its own shape in the
// corners (Rot Kreis, Gelb Dreieck, Grün Quadrat, Blau Raute), so the colour never depends on
// seeing it. No gradients, no gloss, no outlines. Painted at the device pixel ratio.
// Before the images are ready (first frames, or the web font still loading) a card shows its flat
// colour; once the font has arrived every image is painted again and swapped in by one stylesheet.

import type { Card, Color } from './engine';

/** The four card colours (also the colour state on the table). */
export const CARD_COLORS: Record<Color, string> = { r: '#e5383b', y: '#f2b705', g: '#1f9d5f', b: '#2b6fe0' };
/** Number/symbol colour on the white disc (a shade darker, for contrast). */
const DISC_INK: Record<Color, string> = { r: '#cc2a2e', y: '#a06c00', g: '#16804c', b: '#1f58c2' };
/** Text on the colour itself. */
export const ON_COLOR: Record<Color, string> = { r: '#ffffff', y: '#16181d', g: '#ffffff', b: '#ffffff' };
const WILD_BODY = '#1d2027';
const BACK_BODY = '#20242c';

/** Shape of each colour, as an SVG path in a 0..24 box (UI) and drawn the same on the cards. */
export const SHAPE_NAME: Record<Color, string> = { r: 'Kreis', y: 'Dreieck', g: 'Quadrat', b: 'Raute' };
const SVG_SHAPE: Record<Color, string> = {
  r: '<circle cx="12" cy="12" r="8.5"/>',
  y: '<path d="M12 3.2 21.4 19.8H2.6z"/>',
  g: '<rect x="4.2" y="4.2" width="15.6" height="15.6"/>',
  b: '<path d="M12 2.4 21.6 12 12 21.6 2.4 12z"/>',
};

/** Symbols used by the UI (colour state, colour picker): <svg><use href="#sym-r"/></svg>. */
export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${(['r', 'y', 'g', 'b'] as const).map((c) => `<symbol id="sym-${c}" viewBox="0 0 24 24">${SVG_SHAPE[c]}</symbol>`).join('')}<symbol id="sym-w" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></symbol></defs></svg>`;

export const symSVG = (c: Color | 'w', cls = '') => `<svg class="sym ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#sym-${c}"/></svg>`;

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
const FONT = (px: number) => `800 ${px}px Archivo, "Helvetica Neue", Arial, sans-serif`;

function text(g: G, t: string, x: number, y: number, px: number, fill: string) {
  g.font = FONT(px);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.fillText(t, x, y);
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

/** The colour's shape, centred on (x, y), s = its box size. */
function shape(g: G, c: Color, x: number, y: number, s: number, fill: string) {
  const h = s / 2;
  g.beginPath();
  if (c === 'r') g.arc(x, y, h * 0.72, 0, Math.PI * 2);
  else if (c === 'y') { g.moveTo(x, y - h * 0.78); g.lineTo(x + h * 0.8, y + h * 0.62); g.lineTo(x - h * 0.8, y + h * 0.62); g.closePath(); }
  else if (c === 'g') g.rect(x - h * 0.64, y - h * 0.64, h * 1.28, h * 1.28);
  else { g.moveTo(x, y - h * 0.82); g.lineTo(x + h * 0.82, y); g.lineTo(x, y + h * 0.82); g.lineTo(x - h * 0.82, y); g.closePath(); }
  g.fillStyle = fill;
  g.fill();
}

function skipIcon(g: G, r: number, col: string, lw: number) {
  g.lineCap = 'butt';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.moveTo(-r * 0.7, r * 0.7);
  g.lineTo(r * 0.7, -r * 0.7);
  g.lineWidth = lw;
  g.strokeStyle = col;
  g.stroke();
}

function revIcon(g: G, s: number, col: string) {
  // two arrows on the diagonal, pointing opposite ways
  const arrow = () => {
    g.beginPath();
    g.moveTo(-0.55 * s, -0.1 * s);
    g.lineTo(0.12 * s, -0.1 * s);
    g.lineTo(0.12 * s, -0.3 * s);
    g.lineTo(0.55 * s, 0);
    g.lineTo(0.12 * s, 0.3 * s);
    g.lineTo(0.12 * s, 0.1 * s);
    g.lineTo(-0.55 * s, 0.1 * s);
    g.closePath();
    g.fillStyle = col;
    g.fill();
  };
  g.save();
  g.rotate(-Math.PI / 4);
  g.save(); g.translate(0.06 * s, -0.22 * s); arrow(); g.restore();
  g.save(); g.rotate(Math.PI); g.translate(0.06 * s, -0.22 * s); arrow(); g.restore();
  g.restore();
}

/** The four-colour disc of the wild cards: flat quarters, each with its shape. */
function wildDisc(g: G, x: number, y: number, r: number, shapes: boolean) {
  const order: Color[] = ['r', 'y', 'g', 'b'];
  order.forEach((c, i) => {
    const a0 = -Math.PI + (i * Math.PI) / 2;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, r, a0, a0 + Math.PI / 2);
    g.closePath();
    g.fillStyle = CARD_COLORS[c];
    g.fill();
    if (shapes) {
      const am = a0 + Math.PI / 4;
      shape(g, c, x + Math.cos(am) * r * 0.55, y + Math.sin(am) * r * 0.55, r * 0.34, ON_COLOR[c]);
    }
  });
  // thin white cross and rim keep the quarters crisp
  g.strokeStyle = '#fff';
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.moveTo(x - r, y); g.lineTo(x + r, y);
  g.moveTo(x, y - r); g.lineTo(x, y + r);
  g.stroke();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.lineWidth = r * 0.08;
  g.stroke();
}

function corner(g: G, c: Card, x: number, y: number, rot: number) {
  const col = c.c === 'w' ? null : c.c;
  const ink = col ? ON_COLOR[col] : '#fff';
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (c.k === 'num') text(g, String(c.n), 0, 0, 21, ink);
  else if (c.k === 'd2') text(g, '+2', 0, 0, 17, ink);
  else if (c.k === 'd4') text(g, '+4', 0, 0, 17, ink);
  else if (c.k === 'skip') skipIcon(g, 6, ink, 2.6);
  else if (c.k === 'rev') revIcon(g, 15, ink);
  else wildDisc(g, 0, 0, 7.5, false);
  if (c.k === 'num' && (c.n === 6 || c.n === 9)) { g.fillStyle = ink; g.fillRect(-4.5, 10, 9, 1.8); }
  // the colour's shape under the index (wild cards: the four-colour disc says it all)
  if (col) shape(g, col, 0, 20, 9, ink);
  else if (c.k === 'd4') wildDisc(g, 0, 19, 5.5, false);
  g.restore();
}

function body(g: G, fill: string) {
  rr(g, 0, 0, 100, 150, 8);
  g.fillStyle = '#fff';
  g.fill();
  rr(g, 4, 4, 92, 142, 5);
  g.fillStyle = fill;
  g.fill();
}

function paintFace(g: G, c: Card) {
  const col = c.c === 'w' ? null : c.c;
  body(g, col ? CARD_COLORS[col] : WILD_BODY);
  const cx = 50, cy = 75;
  if (col) {
    g.beginPath();
    g.arc(cx, cy, 31, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    const ink = DISC_INK[col];
    g.save();
    g.translate(cx, cy);
    switch (c.k) {
      case 'num':
        text(g, String(c.n), 0, 2, 50, ink);
        if (c.n === 6 || c.n === 9) g.fillRect(-9, 22, 18, 3.4);
        break;
      case 'd2': text(g, '+2', -1, 2, 38, ink); break;
      case 'skip': skipIcon(g, 17, ink, 6.5); break;
      case 'rev': revIcon(g, 40, ink); break;
      default: break;
    }
    g.restore();
  } else {
    wildDisc(g, cx, cy, 31, c.k === 'wild');
    if (c.k === 'd4') {
      g.beginPath();
      g.arc(cx, cy, 18, 0, Math.PI * 2);
      g.fillStyle = WILD_BODY;
      g.fill();
      text(g, '+4', cx - 0.5, cy + 1.5, 24, '#fff');
    }
  }
  corner(g, c, 15, 16, 0);
  corner(g, c, 85, 134, Math.PI);
}

function paintBack(g: G) {
  body(g, BACK_BODY);
  rr(g, 11, 11, 78, 128, 4);
  g.strokeStyle = 'rgba(255,255,255,.16)';
  g.lineWidth = 1.5;
  g.stroke();
  // four small tiles turned into a diamond, one per colour
  g.save();
  g.translate(50, 75);
  g.rotate(Math.PI / 4);
  const s = 13, gap = 2.4;
  ([['r', -1, -1], ['y', 1, -1], ['b', -1, 1], ['g', 1, 1]] as const).forEach(([k, sx, sy]) => {
    g.fillStyle = CARD_COLORS[k];
    g.fillRect(sx < 0 ? -s - gap / 2 : gap / 2, sy < 0 ? -s - gap / 2 : gap / 2, s, s);
  });
  g.restore();
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
  // the largest card on screen (lobby fan, pile) is about 130 css px: paint it at the device's pixel ratio
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  const W = Math.round(Math.min(320, Math.max(160, 130 * dpr)));
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
