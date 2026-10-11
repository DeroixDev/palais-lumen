// Painted materials for the HTML overlay: brass frames, velvet, medal studs and the Selene's
// emblem. Everything is drawn once with Canvas 2D (same brush as the world, no ctx.filter) and
// handed to CSS as data URLs in custom properties, so the DOM panels wear the same paint as the room.

import { drawEmblem } from '../core/fx';
import { ellipse, fillInk, glowAt, gold, seeded } from '../world/painted/brush';

type C = CanvasRenderingContext2D;

function canvasUrl(w: number, h: number, draw: (c: C) => void, res = 2) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * res);
  cv.height = Math.ceil(h * res);
  const c = cv.getContext('2d')!;
  c.scale(res, res);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  return cv.toDataURL();
}

/** A brass ring between two rounded rects, lit from the upper left, with chunky ink edges. */
function brassRing(c: C, x: number, y: number, w: number, h: number, r: number, t: number, size: number) {
  c.beginPath();
  // Outer, then inner counter-clockwise for an even-odd hole.
  rrPath(c, x, y, w, h, r);
  rrPath(c, x + t, y + t, w - 2 * t, h - 2 * t, Math.max(2, r - t));
  c.fillStyle = gold(c, 0, 0, size, size);
  c.fill('evenodd');
  c.strokeStyle = 'rgba(22,10,20,0.9)';
  c.lineWidth = 1.6;
  c.stroke();
  // Polished top-left glance (2 px) on the outer edge.
  c.save();
  c.beginPath();
  rrPath(c, x, y, w, h, r);
  c.clip();
  const hl = c.createLinearGradient(0, 0, size * 0.6, size * 0.6);
  hl.addColorStop(0, 'rgba(255,248,220,0.95)');
  hl.addColorStop(0.5, 'rgba(255,248,220,0)');
  c.strokeStyle = hl;
  c.lineWidth = 2;
  rrPath(c, x + 1.6, y + 1.6, w - 3.2, h - 3.2, Math.max(1, r - 1.6));
  c.stroke();
  c.restore();
}

function rrPath(c: C, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** Art-deco fan with a little moth, for the inner top-left corner; mirrored for the others. */
function cornerOrnament(c: C) {
  // Fan rays.
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * (Math.PI / 2);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
    c.strokeStyle = 'rgba(22,10,20,0.85)';
    c.lineWidth = 3.4;
    c.stroke();
    c.strokeStyle = gold(c, 0, 0, 24, 24);
    c.lineWidth = 1.6;
    c.stroke();
  }
  // Quarter arc.
  c.beginPath();
  c.arc(0, 0, 25, 0, Math.PI / 2);
  c.strokeStyle = 'rgba(22,10,20,0.85)';
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = gold(c, 0, 0, 26, 26);
  c.lineWidth = 2;
  c.stroke();
  // Disc on the corner with a small embossed moth.
  ellipse(c, 2, 2, 10, 10);
  fillInk(c, gold(c, -8, -8, 12, 12), 1.6);
  drawEmblem(c, 2.6, 3.2, 14, 'rgba(110,70,15,0.8)', 'rgba(110,70,15,0.9)');
  drawEmblem(c, 2, 2.6, 14, '#ffe7a0', '#c9902e');
}

/**
 * The panel frame for border-image: 100×100 css px, slice 40 (80 image px at 2× resolution), so
 * the middle 20 px stretch along the edges. The brass bar runs 0..13 from the edge; the
 * ornaments sit inside the 40 px corner squares.
 */
function panelFrame() {
  const S = 100;
  return canvasUrl(S, S, (c) => {
    brassRing(c, 1, 1, S - 2, S - 2, 20, 9, S);
    // Thin inner fillet.
    c.beginPath();
    rrPath(c, 13, 13, S - 26, S - 26, 10);
    c.strokeStyle = 'rgba(22,10,20,0.7)';
    c.lineWidth = 2.6;
    c.stroke();
    c.strokeStyle = 'rgba(240,200,104,0.75)';
    c.lineWidth = 1;
    c.stroke();
    const place = (x: number, y: number, sx: number, sy: number) => {
      c.save();
      c.translate(x, y);
      c.scale(sx, sy);
      cornerOrnament(c);
      c.restore();
    };
    place(9, 9, 1, 1);
    place(S - 9, 9, -1, 1);
    place(9, S - 9, 1, -1);
    place(S - 9, S - 9, -1, -1);
  });
}

/** Small brass plaque frame with rivets; 32×32, slice 12, center filled with dark lacquer. */
function plateFrame() {
  const S = 32;
  return canvasUrl(S, S, (c) => {
    c.beginPath();
    rrPath(c, 1, 1, S - 2, S - 2, 9);
    const lac = c.createLinearGradient(0, 0, 0, S);
    lac.addColorStop(0, '#3a1428');
    lac.addColorStop(0.5, '#24091a');
    lac.addColorStop(1, '#180612');
    c.fillStyle = lac;
    c.fill();
    brassRing(c, 1, 1, S - 2, S - 2, 9, 3.2, S);
    for (const [x, y] of [[6, 6], [S - 6, 6], [6, S - 6], [S - 6, S - 6]]) {
      ellipse(c, x, y, 1.6, 1.6);
      fillInk(c, gold(c, x - 2, y - 2, x + 2, y + 2), 0.8);
    }
  });
}

/** Brass strip for buttons and toasts: a polished bar 24 high, used as a background image. */
function brassBar() {
  return canvasUrl(8, 24, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 24);
    g.addColorStop(0, '#fff2c0');
    g.addColorStop(0.18, '#f2cd72');
    g.addColorStop(0.5, '#c8913a');
    g.addColorStop(0.78, '#a06a22');
    g.addColorStop(1, '#6e4614');
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 24);
  });
}

/** Velvet tile: deep plum with a fine pile, seamless enough to repeat. */
function velvet() {
  const S = 128;
  return canvasUrl(S, S, (c) => {
    c.fillStyle = '#2a0d1e';
    c.fillRect(0, 0, S, S);
    const r = seeded(77);
    for (let i = 0; i < 1400; i++) {
      const x = r() * S;
      const y = r() * S;
      const lightDot = r() < 0.5;
      c.fillStyle = lightDot ? `rgba(255,190,220,${0.025 + r() * 0.03})` : `rgba(8,2,8,${0.08 + r() * 0.1})`;
      c.fillRect(x, y, 1 + r() * 1.2, 1 + r() * 2.2);
    }
  }, 1);
}

/** Medal studs for the day gauge. */
function stud(kind: 'bronze' | 'silver' | 'gold' | 'diamond') {
  const S = 24;
  return canvasUrl(S, S, (c) => {
    const m = S / 2;
    glowAt(c, m, m + 1, 11, 11, 0x0a0410, 0.35);
    if (kind === 'diamond') {
      c.beginPath();
      c.moveTo(m, 2);
      c.lineTo(S - 3, m - 2);
      c.lineTo(m, S - 2);
      c.lineTo(3, m - 2);
      c.closePath();
      const g = c.createLinearGradient(3, 2, S - 3, S - 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#bff3ff');
      g.addColorStop(0.7, '#5fc4e8');
      g.addColorStop(1, '#2a6f96');
      fillInk(c, g, 1.6);
      c.beginPath();
      c.moveTo(3, m - 2);
      c.lineTo(S - 3, m - 2);
      c.moveTo(m, 2);
      c.lineTo(m - 4, m - 2);
      c.lineTo(m, S - 2);
      c.lineTo(m + 4, m - 2);
      c.closePath();
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 0.8;
      c.stroke();
      return;
    }
    const col = { bronze: ['#ffd9b0', '#c9803e', '#7a4318'], silver: ['#ffffff', '#c9d0dc', '#6d7684'], gold: ['#fff3c4', '#f0c25a', '#a8741f'] }[kind];
    const g = c.createRadialGradient(m - 3, m - 4, 1, m, m, 10);
    g.addColorStop(0, col[0]);
    g.addColorStop(0.55, col[1]);
    g.addColorStop(1, col[2]);
    ellipse(c, m, m, 9, 9);
    fillInk(c, g, 1.6);
    ellipse(c, m, m, 5.5, 5.5);
    c.strokeStyle = 'rgba(22,10,20,0.35)';
    c.lineWidth = 1;
    c.stroke();
    // Star stamp.
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 1.6 : 3.8;
      c.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = col[0];
    c.fill();
  });
}

/** The Selene's emblem for the boss gauge: a violet moth under a little crown. */
function queen() {
  const S = 40;
  return canvasUrl(S, S, (c) => {
    glowAt(c, 20, 22, 18, 16, 0xc9a0ff, 0.45);
    const w = c.createLinearGradient(0, 8, 0, 36);
    w.addColorStop(0, '#e6d0ff');
    w.addColorStop(0.5, '#9a5ad8');
    w.addColorStop(1, '#4a1a6a');
    drawEmblem(c, 20, 24, 34, 'rgba(22,10,20,0.85)', 'rgba(22,10,20,0.9)');
    drawEmblem(c, 20, 23, 30, w, '#2a0c3a', 'rgba(255,220,250,0.7)');
    c.beginPath();
    c.moveTo(13, 11);
    c.lineTo(15, 4);
    c.lineTo(18, 8);
    c.lineTo(20, 2.5);
    c.lineTo(22, 8);
    c.lineTo(25, 4);
    c.lineTo(27, 11);
    c.closePath();
    fillInk(c, gold(c, 13, 2, 27, 11), 1.4);
  });
}

let done = false;

/** Paints the materials once and publishes them as CSS custom properties on :root. */
export function installHudArt() {
  if (done) return;
  done = true;
  const root = document.documentElement.style;
  const set = (k: string, url: string) => root.setProperty(k, `url(${url})`);
  set('--nf-frame', panelFrame());
  set('--nf-plate', plateFrame());
  set('--nf-brass', brassBar());
  set('--nf-velvet', velvet());
  set('--nf-m-bronze', stud('bronze'));
  set('--nf-m-silver', stud('silver'));
  set('--nf-m-gold', stud('gold'));
  set('--nf-m-diamond', stud('diamond'));
  set('--nf-queen', queen());
}

