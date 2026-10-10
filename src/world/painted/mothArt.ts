// Painted moths for the album: each species gets its own wing outline, colours and pattern,
// drawn once with Canvas 2D (soft gradients, ink outline, rim light) and cached. The same
// painting serves the flying moth, the album page and the dark silhouette of a missing one.

import type { Texture } from 'pixi.js';
import type { MothArt, MothSpecies, WingPattern, WingShape } from '../../core/album';
import { INK, dark, fillInk, glowAt, light, paint, rgb, seeded, type Ctx } from './brush';

type P = [number, number];
/** A wing: start point, then cubic segments [cp1, cp2, end] in half-span units (right wing). */
interface Wing {
  start: P;
  segs: [P, P, P][];
}

const FORE: Record<WingShape, Wing> = {
  classic: { start: [0.04, -0.12], segs: [[[0.35, -0.5], [0.75, -0.56], [0.98, -0.44]], [[1.02, -0.22], [0.92, 0.02], [0.72, 0.08]], [[0.45, 0.13], [0.2, 0.1], [0.04, 0.06]]] },
  round: { start: [0.04, -0.12], segs: [[[0.3, -0.52], [0.72, -0.58], [0.9, -0.4]], [[1.02, -0.2], [0.98, 0.08], [0.78, 0.14]], [[0.5, 0.18], [0.2, 0.12], [0.04, 0.06]]] },
  hawk: { start: [0.04, -0.1], segs: [[[0.4, -0.36], [0.8, -0.36], [1.02, -0.22]], [[1.0, -0.12], [0.96, -0.06], [0.86, -0.04]], [[0.55, 0.04], [0.25, 0.08], [0.04, 0.06]]] },
  tailed: { start: [0.04, -0.12], segs: [[[0.3, -0.5], [0.7, -0.56], [0.92, -0.42]], [[1.0, -0.24], [0.94, 0.0], [0.74, 0.08]], [[0.45, 0.14], [0.2, 0.1], [0.04, 0.06]]] },
  swallow: { start: [0.04, -0.12], segs: [[[0.32, -0.46], [0.7, -0.54], [1.0, -0.5]], [[0.9, -0.3], [0.86, -0.06], [0.74, 0.06]], [[0.45, 0.12], [0.2, 0.1], [0.04, 0.06]]] },
  broad: { start: [0.04, -0.14], segs: [[[0.34, -0.56], [0.78, -0.64], [1.02, -0.56]], [[1.0, -0.36], [1.02, 0.06], [0.84, 0.16]], [[0.5, 0.22], [0.22, 0.12], [0.04, 0.06]]] },
};

const HIND: Record<WingShape, Wing> = {
  classic: { start: [0.04, 0.02], segs: [[[0.3, -0.02], [0.56, 0.0], [0.64, 0.14]], [[0.72, 0.34], [0.5, 0.52], [0.3, 0.5]], [[0.12, 0.46], [0.04, 0.32], [0.03, 0.2]]] },
  round: { start: [0.04, 0.02], segs: [[[0.34, -0.02], [0.66, 0.04], [0.72, 0.22]], [[0.78, 0.44], [0.52, 0.64], [0.32, 0.6]], [[0.12, 0.56], [0.04, 0.36], [0.03, 0.2]]] },
  hawk: { start: [0.04, 0.02], segs: [[[0.24, 0.0], [0.42, 0.04], [0.46, 0.12]], [[0.5, 0.24], [0.34, 0.34], [0.22, 0.32]], [[0.1, 0.3], [0.04, 0.24], [0.03, 0.16]]] },
  tailed: { start: [0.04, 0.02], segs: [[[0.32, -0.02], [0.62, 0.04], [0.64, 0.2]], [[0.66, 0.34], [0.5, 0.42], [0.44, 0.48]], [[0.4, 0.62], [0.46, 0.84], [0.36, 0.98]], [[0.3, 0.84], [0.24, 0.6], [0.2, 0.5]], [[0.08, 0.44], [0.03, 0.32], [0.03, 0.2]]] },
  swallow: { start: [0.04, 0.02], segs: [[[0.3, -0.02], [0.6, 0.02], [0.64, 0.18]], [[0.66, 0.32], [0.56, 0.44], [0.48, 0.48]], [[0.5, 0.58], [0.48, 0.66], [0.44, 0.7]], [[0.36, 0.6], [0.3, 0.52], [0.22, 0.5]], [[0.08, 0.44], [0.03, 0.32], [0.03, 0.2]]] },
  broad: { start: [0.04, 0.02], segs: [[[0.36, -0.02], [0.74, 0.06], [0.78, 0.26]], [[0.8, 0.5], [0.56, 0.72], [0.36, 0.68]], [[0.14, 0.62], [0.04, 0.4], [0.03, 0.2]]] },
};

/** Traces a wing path; `h` is the half span, `sx` = ±1 for the side. */
function trace(c: Ctx, w: Wing, h: number, sx: number) {
  c.beginPath();
  c.moveTo(w.start[0] * h * sx, w.start[1] * h);
  for (const [a, b, e] of w.segs) c.bezierCurveTo(a[0] * h * sx, a[1] * h, b[0] * h * sx, b[1] * h, e[0] * h * sx, e[1] * h);
  c.closePath();
}

/** Point on a wing's outer edge: segment `i` at `t`, for patterns along the margin. */
function edgePoint(w: Wing, i: number, t: number): P {
  const s = i === 0 ? w.start : w.segs[i - 1][2];
  const [a, b, e] = w.segs[i];
  const u = 1 - t;
  return [u * u * u * s[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0], u * u * u * s[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]];
}

function star(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.32 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

function gear(c: Ctx, x: number, y: number, r: number, col: string) {
  c.beginPath();
  const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    c.lineTo(x + Math.cos(a - 0.12) * rr, y + Math.sin(a - 0.12) * rr);
    c.lineTo(x + Math.cos(a + 0.12) * rr, y + Math.sin(a + 0.12) * rr);
  }
  c.closePath();
  c.strokeStyle = col;
  c.lineWidth = Math.max(1, r * 0.18);
  c.stroke();
  c.beginPath();
  c.arc(x, y, r * 0.3, 0, Math.PI * 2);
  c.stroke();
}

function suit(c: Ctx, kind: number, x: number, y: number, r: number) {
  c.beginPath();
  if (kind === 0) {
    // Heart.
    c.moveTo(x, y + r * 0.9);
    c.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r, x, y - r * 0.35);
    c.bezierCurveTo(x + r * 0.6, y - r, x + r * 1.3, y - r * 0.1, x, y + r * 0.9);
  } else if (kind === 1) {
    // Diamond.
    c.moveTo(x, y - r);
    c.lineTo(x + r * 0.7, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r * 0.7, y);
  } else {
    // Spade.
    c.moveTo(x, y - r);
    c.bezierCurveTo(x + r * 1.3, y + r * 0.1, x + r * 0.5, y + r, x, y + r * 0.35);
    c.bezierCurveTo(x - r * 0.5, y + r, x - r * 1.3, y + r * 0.1, x, y - r);
    c.moveTo(x, y + r * 0.2);
    c.lineTo(x + r * 0.35, y + r * 1.05);
    c.lineTo(x - r * 0.35, y + r * 1.05);
  }
  c.closePath();
  c.fill();
}

/** Pattern on one wing (already clipped to it). Coordinates in half-span units, mirrored by `sx`. */
function pattern(c: Ctx, p: WingPattern, a: MothArt, hind: boolean, shape: WingShape, h: number, sx: number, seed: number) {
  const X = (x: number) => x * h * sx;
  const Y = (y: number) => y * h;
  const mark = rgb(a.mark);
  const rnd = seeded(seed + (hind ? 77 : 11));
  const wing = hind ? HIND[shape] : FORE[shape];
  c.save();
  switch (p) {
    case 'eyes': {
      const [ex, ey, er] = hind ? [0.36, 0.28, 0.13] : [0.56, -0.24, 0.085];
      c.beginPath();
      c.arc(X(ex), Y(ey), er * h * 1.25, 0, Math.PI * 2);
      c.fillStyle = rgb(dark(a.hind, 0.6), 0.85);
      c.fill();
      c.beginPath();
      c.arc(X(ex), Y(ey), er * h, 0, Math.PI * 2);
      c.fillStyle = mark;
      c.fill();
      c.beginPath();
      c.arc(X(ex), Y(ey), er * h * 0.55, 0, Math.PI * 2);
      c.fillStyle = rgb(a.body);
      c.fill();
      c.beginPath();
      c.arc(X(ex - 0.025), Y(ey - 0.03), er * h * 0.2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fill();
      break;
    }
    case 'bands': {
      c.strokeStyle = mark;
      c.globalAlpha = 0.8;
      c.lineWidth = h * 0.06;
      const rows = hind ? [0.3] : [0.4, 0.68];
      for (const k of rows) {
        c.beginPath();
        c.moveTo(X(k * 0.9), Y(hind ? -0.05 : -0.6));
        c.quadraticCurveTo(X(k * 1.15), Y(hind ? 0.25 : -0.2), X(k * 0.85), Y(hind ? 0.6 : 0.2));
        c.stroke();
      }
      c.globalAlpha = 0.5;
      c.lineWidth = h * 0.02;
      c.strokeStyle = rgb(light(a.mark, 0.4));
      for (const k of rows) {
        c.beginPath();
        c.moveTo(X(k * 0.9 + 0.05), Y(hind ? -0.05 : -0.6));
        c.quadraticCurveTo(X(k * 1.15 + 0.05), Y(hind ? 0.25 : -0.2), X(k * 0.85 + 0.05), Y(hind ? 0.6 : 0.2));
        c.stroke();
      }
      break;
    }
    case 'veins': {
      c.strokeStyle = mark;
      c.globalAlpha = 0.7;
      c.lineWidth = Math.max(1, h * 0.018);
      for (let i = 0; i < wing.segs.length - 1; i++)
        for (const t of [0.15, 0.45, 0.75]) {
          const [ex, ey] = edgePoint(wing, i, t);
          c.beginPath();
          c.moveTo(X(0.06), Y(hind ? 0.08 : -0.02));
          c.quadraticCurveTo(X(ex * 0.55), Y(ey * 0.4), X(ex), Y(ey));
          c.stroke();
        }
      break;
    }
    case 'dots': {
      c.fillStyle = mark;
      for (let i = 0; i < wing.segs.length - 1; i++)
        for (let k = 1; k < 5; k++) {
          const [ex, ey] = edgePoint(wing, i, k / 5);
          c.beginPath();
          c.arc(X(ex * 0.86), Y(ey * 0.86 + (hind ? 0.02 : 0)), h * 0.035, 0, Math.PI * 2);
          c.fill();
        }
      break;
    }
    case 'tiger': {
      c.fillStyle = mark;
      const n = hind ? 5 : 9;
      for (let i = 0; i < n; i++) {
        const x = hind ? 0.15 + rnd() * 0.45 : 0.15 + rnd() * 0.75;
        const y = hind ? 0.08 + rnd() * 0.4 : -0.45 + rnd() * 0.45;
        c.beginPath();
        c.ellipse(X(x), Y(y), h * (0.04 + rnd() * 0.06), h * (0.03 + rnd() * 0.04), rnd() * 3, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'marble': {
      for (let i = 0; i < 14; i++) {
        const x = 0.1 + rnd() * 0.8;
        const y = hind ? rnd() * 0.6 : -0.55 + rnd() * 0.65;
        glowAt(c, X(x), Y(y), h * (0.08 + rnd() * 0.12), h * (0.05 + rnd() * 0.08), rnd() < 0.5 ? a.mark : a.tip, 0.45);
      }
      break;
    }
    case 'gears': {
      const list: [number, number, number][] = hind ? [[0.35, 0.26, 0.11]] : [[0.5, -0.26, 0.12], [0.76, -0.36, 0.07], [0.3, -0.06, 0.06]];
      for (const [x, y, r] of list) gear(c, X(x), Y(y), r * h, mark);
      break;
    }
    case 'stars': {
      c.fillStyle = mark;
      const n = hind ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const x = hind ? 0.12 + rnd() * 0.5 : 0.15 + rnd() * 0.75;
        const y = hind ? 0.06 + rnd() * 0.45 : -0.48 + rnd() * 0.5;
        star(c, X(x), Y(y), h * (0.025 + rnd() * 0.04));
        c.fill();
      }
      break;
    }
    case 'neon': {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = mark;
      for (const [w, al] of [[h * 0.07, 0.25], [h * 0.03, 0.6], [h * 0.012, 1]] as const) {
        c.lineWidth = w;
        c.globalAlpha = al;
        c.beginPath();
        c.moveTo(X(0.12), Y(hind ? 0.1 : -0.12));
        c.lineTo(X(hind ? 0.5 : 0.85), Y(hind ? 0.32 : -0.4));
        c.moveTo(X(0.2), Y(hind ? 0.22 : 0.0));
        c.lineTo(X(hind ? 0.32 : 0.7), Y(hind ? 0.48 : -0.08));
        c.stroke();
      }
      break;
    }
    case 'crown': {
      if (!hind) {
        const x = X(0.55);
        const y = Y(-0.24);
        const r = h * 0.12;
        c.beginPath();
        c.moveTo(x - r, y + r * 0.5);
        c.lineTo(x - r, y - r * 0.4);
        c.lineTo(x - r * 0.5, y + r * 0.05);
        c.lineTo(x, y - r * 0.7);
        c.lineTo(x + r * 0.5, y + r * 0.05);
        c.lineTo(x + r, y - r * 0.4);
        c.lineTo(x + r, y + r * 0.5);
        c.closePath();
        fillInk(c, mark, 1);
      } else {
        c.fillStyle = mark;
        for (let k = 1; k < 5; k++) {
          const [ex, ey] = edgePoint(wing, 1, k / 5);
          c.beginPath();
          c.arc(X(ex * 0.82), Y(ey * 0.82), h * 0.03, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case 'cards': {
      c.fillStyle = mark;
      if (hind) suit(c, 0, X(0.34), Y(0.26), h * 0.1);
      else {
        suit(c, 2, X(0.5), Y(-0.26), h * 0.1);
        suit(c, 1, X(0.78), Y(-0.36), h * 0.06);
      }
      break;
    }
    case 'flame': {
      const [fx, fy, r] = hind ? [0.34, 0.26, 0.12] : [0.6, -0.26, 0.16];
      const g = c.createRadialGradient(X(fx), Y(fy + r * 0.3), 0, X(fx), Y(fy), r * h);
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.5, mark);
      g.addColorStop(1, rgb(a.mark, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(X(fx), Y(fy - r));
      c.quadraticCurveTo(X(fx + r * 0.7), Y(fy + r * 0.2), X(fx), Y(fy + r * 0.6));
      c.quadraticCurveTo(X(fx - r * 0.7), Y(fy + r * 0.2), X(fx), Y(fy - r));
      c.fill();
      break;
    }
    case 'drops': {
      const n = hind ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const x = hind ? 0.18 + rnd() * 0.4 : 0.2 + rnd() * 0.65;
        const y = hind ? 0.1 + rnd() * 0.35 : -0.45 + rnd() * 0.42;
        const r = h * (0.03 + rnd() * 0.03);
        c.beginPath();
        c.arc(X(x), Y(y), r, 0, Math.PI * 2);
        c.fillStyle = rgb(a.mark, 0.85);
        c.fill();
        c.beginPath();
        c.arc(X(x) - r * 0.35 * sx, Y(y) - r * 0.35, r * 0.35, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fill();
      }
      break;
    }
    case 'zigzag': {
      c.strokeStyle = mark;
      c.lineWidth = h * 0.035;
      c.globalAlpha = 0.85;
      for (const off of hind ? [0.25] : [0.35, 0.65]) {
        c.beginPath();
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const x = off + (i % 2 ? 0.06 : -0.06);
          const y = hind ? -0.02 + t * 0.6 : -0.6 + t * 0.75;
          if (i === 0) c.moveTo(X(x), Y(y));
          else c.lineTo(X(x), Y(y));
        }
        c.stroke();
      }
      break;
    }
  }
  c.restore();
  // Dark shading towards the body, like the scales overlap there.
  c.save();
  glowAt(c, X(0.02), Y(hind ? 0.1 : -0.02), h * 0.35, h * 0.3, a.body, 0.35);
  c.restore();
}

/** One wing pair side: hind wing first (it sits under the forewing), then the forewing. */
function wingSide(c: Ctx, a: MothArt, h: number, sx: number, seed: number) {
  for (const hind of [true, false]) {
    const w = hind ? HIND[a.shape] : FORE[a.shape];
    trace(c, w, h, sx);
    let g: CanvasGradient;
    if (hind) {
      g = c.createRadialGradient(0, h * 0.1, h * 0.05, 0, h * 0.2, h * 0.8);
      g.addColorStop(0, rgb(light(a.hind, 0.15)));
      g.addColorStop(0.6, rgb(a.hind));
      g.addColorStop(1, rgb(dark(a.hind, 0.3)));
    } else {
      g = c.createLinearGradient(0, 0, h * sx, -h * 0.5);
      g.addColorStop(0, rgb(light(a.fore, 0.08)));
      g.addColorStop(0.55, rgb(a.fore));
      g.addColorStop(1, rgb(a.tip));
    }
    fillInk(c, g, Math.max(1.4, h * 0.022));
    c.save();
    trace(c, w, h, sx);
    c.clip();
    pattern(c, a.pattern, a, hind, a.shape, h, sx, seed);
    // Fringe: a pale edge just inside the outline, and a soft rim light from the upper left.
    trace(c, w, h, sx);
    c.strokeStyle = rgb(light(hind ? a.hind : a.tip, 0.5), 0.45);
    c.lineWidth = h * 0.04;
    c.stroke();
    c.translate(-1.2 * sx, 1.6);
    trace(c, w, h, sx);
    c.strokeStyle = 'rgba(255,244,220,0.35)';
    c.lineWidth = h * 0.025;
    c.stroke();
    c.restore();
    trace(c, w, h, sx);
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.4, h * 0.022);
    c.stroke();
  }
}

/** Body, head, eyes and antennae. */
function body(c: Ctx, a: MothArt, h: number) {
  // Antennae.
  c.strokeStyle = rgb(dark(a.body, 0.2));
  c.lineWidth = Math.max(1, h * 0.018);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * h * 0.02, -h * 0.2);
    c.quadraticCurveTo(s * h * 0.08, -h * 0.42, s * h * 0.24, -h * 0.5);
    c.stroke();
    if (a.feathered) {
      c.lineWidth = Math.max(0.8, h * 0.01);
      for (let k = 0; k < 7; k++) {
        const t = 0.25 + k * 0.1;
        const x = s * h * (0.02 + 0.22 * t * t);
        const y = -h * (0.2 + 0.3 * t);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + s * h * 0.05, y + h * 0.02);
        c.moveTo(x, y);
        c.lineTo(x - s * h * 0.01, y - h * 0.05);
        c.stroke();
      }
      c.lineWidth = Math.max(1, h * 0.018);
    } else {
      c.beginPath();
      c.arc(s * h * 0.24, -h * 0.5, h * 0.02, 0, Math.PI * 2);
      c.fillStyle = rgb(a.body);
      c.fill();
    }
  }
  // Abdomen with rings, thorax, head.
  c.beginPath();
  c.ellipse(0, h * 0.18, h * 0.06, h * 0.24, 0, 0, Math.PI * 2);
  const g = c.createLinearGradient(-h * 0.06, 0, h * 0.06, 0);
  g.addColorStop(0, rgb(light(a.body, 0.35)));
  g.addColorStop(1, rgb(dark(a.body, 0.3)));
  fillInk(c, g, Math.max(1.2, h * 0.018));
  c.strokeStyle = rgb(dark(a.body, 0.5), 0.6);
  c.lineWidth = Math.max(0.8, h * 0.01);
  for (let k = 1; k < 5; k++) {
    c.beginPath();
    c.moveTo(-h * 0.05, h * (0.04 + k * 0.07));
    c.quadraticCurveTo(0, h * (0.06 + k * 0.07), h * 0.05, h * (0.04 + k * 0.07));
    c.stroke();
  }
  c.beginPath();
  c.ellipse(0, -h * 0.06, h * 0.08, h * 0.1, 0, 0, Math.PI * 2);
  const tg = c.createRadialGradient(-h * 0.03, -h * 0.1, 0, 0, -h * 0.06, h * 0.1);
  tg.addColorStop(0, rgb(light(a.body, 0.5)));
  tg.addColorStop(1, rgb(a.body));
  fillInk(c, tg, Math.max(1.2, h * 0.018));
  c.beginPath();
  c.arc(0, -h * 0.18, h * 0.055, 0, Math.PI * 2);
  fillInk(c, rgb(dark(a.body, 0.15)), Math.max(1, h * 0.015));
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * h * 0.035, -h * 0.19, h * 0.018, 0, Math.PI * 2);
    c.fillStyle = '#1a0a10';
    c.fill();
    c.beginPath();
    c.arc(s * h * 0.035 - h * 0.006, -h * 0.196, h * 0.006, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill();
  }
}

/** Paints a moth centred on (cx, cy) with a wing span of `span`. */
export function drawSpecies(c: Ctx, m: MothSpecies, cx: number, cy: number, span: number) {
  const a = m.art;
  const h = span / 2;
  let seed = 7;
  for (const ch of m.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  c.save();
  c.translate(cx, cy);
  if (a.glow) {
    glowAt(c, 0, 0, h * 1.15, h * 0.95, a.glow, 0.4);
    glowAt(c, 0, 0, h * 0.6, h * 0.5, a.glow, 0.3);
  }
  wingSide(c, a, h, -1, seed);
  wingSide(c, a, h, 1, seed);
  body(c, a, h);
  if (m.rarity === 'legendary') {
    c.globalCompositeOperation = 'lighter';
    const r = seeded(seed);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(255,248,220,${0.5 + r() * 0.5})`;
      star(c, (r() - 0.5) * h * 2, (r() - 0.55) * h * 1.3, h * (0.02 + r() * 0.035));
      c.fill();
    }
  }
  c.restore();
}

const cache = new Map<string, Texture>();

/** Canvas size for a moth of this span (room for antennae and tails). */
export const mothBox = (span: number) => ({ w: Math.ceil(span * 1.3), h: Math.ceil(span * 1.12), cy: Math.ceil(span * 0.4) });

/**
 * The species as a texture, anchor (0.5, cy/h). `kind` 'dark' is the silhouette of a missing
 * moth (same outline, filled with ink).
 */
export function speciesTexture(m: MothSpecies, span: number, kind: 'color' | 'dark' = 'color') {
  const key = `${m.id}-${span}-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = mothBox(span);
  const tex = paint(b.w, b.h, (c) => {
    if (kind === 'dark') {
      // Same outline without glow, filled with a soft ink.
      const plain: MothSpecies = { ...m, rarity: 'common', art: { ...m.art, glow: undefined } };
      drawSpecies(c, plain, b.w / 2, b.cy, span);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = 'rgba(58,36,30,0.55)';
      c.fillRect(0, 0, b.w, b.h);
      return;
    }
    drawSpecies(c, m, b.w / 2, b.cy, span);
  }, 2);
  cache.set(key, tex);
  return tex;
}

/** Anchor y for a texture from speciesTexture. */
export const speciesAnchorY = (span: number) => mothBox(span).cy / mothBox(span).h;
