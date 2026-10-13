// The day as a curve: the balance after every round, inked by hand onto a ledger card.
// Card and curve are baked once; the curve is revealed left to right through a mask.

import { Container, Graphics, Sprite } from 'pixi.js';
import { fillInk, glowAt, grain, paint, rrect, seeded } from '../world/painted/brush';
import { paintEmblem } from '../games/slots/symbols';
import { formatChips } from '../core/state';
import { bodyText } from './kit';

const INK = 0x3a1c10;
const GOAL = 0x2f6a3a;
const START = 0x6a4a2a;

export interface CurveCard {
  view: Container;
  /** 0 = empty card, 1 = full curve with its peak moth and end mark. */
  reveal(k: number): void;
}

export function curveCard(history: number[], start: number, goal: number, w: number, h: number, small: boolean): CurveCard {
  const view = new Container();
  const pts = history.length > 1 ? history : [history[0] ?? start, history[0] ?? start];
  const N = pts.length;
  // Plot area inside the card.
  // Left margin holds the start/goal labels, the right one the end value.
  const pl = small ? 60 : 78;
  const pr = small ? 54 : 70;
  const pt = small ? 40 : 48;
  const pb = small ? 26 : 30;
  const pw = w - pl - pr;
  const ph = h - pt - pb;
  let lo = Math.min(start, ...pts);
  const top = Math.max(start, ...pts);
  // A goal far above the day's range would squash the curve: pin it to the top edge instead.
  const span = Math.max(top - lo, start * 0.02, 1);
  const goalClipped = goal > top + span * 0.75;
  let hi = goalClipped ? top : Math.max(goal, top);
  const pad = Math.max(1, (hi - lo) * 0.1);
  lo -= pad;
  hi += pad;
  const X = (i: number) => pl + (i / (N - 1)) * pw;
  const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * ph;
  const goalY = goalClipped ? pt - (small ? 14 : 18) : Y(goal);

  // Parchment ledger card with start and goal lines.
  const card = new Sprite(
    paint(w, h, (c) => {
      rrect(c, 2, 2, w - 4, h - 4, 10);
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, '#efdfb6');
      g.addColorStop(1, '#d7bd8a');
      fillInk(c, g, 2.5);
      c.save();
      rrect(c, 2, 2, w - 4, h - 4, 10);
      c.clip();
      grain(c, 0, 0, w, h, Math.round((w * h) / 260), 7, 0.06);
      // Ruled ledger lines and a red margin.
      c.strokeStyle = 'rgba(70,90,120,0.16)';
      c.lineWidth = 1;
      for (let y = pt - 8; y < h - 6; y += small ? 22 : 26) {
        c.beginPath();
        c.moveTo(8, y);
        c.lineTo(w - 8, y);
        c.stroke();
      }
      c.strokeStyle = 'rgba(160,40,50,0.28)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(pl - 10, 8);
      c.lineTo(pl - 10, h - 8);
      c.stroke();
      // Darker, older edges.
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      v.addColorStop(0, 'rgba(90,50,20,0)');
      v.addColorStop(1, 'rgba(90,50,20,0.28)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
      c.restore();
      const dashed = (y: number, col: string, width: number, dash: number[]) => {
        c.save();
        c.setLineDash(dash);
        c.strokeStyle = col;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(pl - 10, y);
        c.lineTo(w - pr + 6, y);
        c.stroke();
        c.restore();
      };
      dashed(Y(start), 'rgba(106,74,42,0.75)', 1.6, [7, 6]);
      dashed(goalY, 'rgba(47,106,58,0.85)', 2.2, [12, 5]);
      if (goalClipped) {
        // Small arrowheads: the goal lies further up, off the card.
        c.fillStyle = 'rgba(47,106,58,0.9)';
        for (const x of [pl - 10, w - pr + 6]) {
          c.beginPath();
          c.moveTo(x, goalY - 6);
          c.lineTo(x - 5, goalY + 1);
          c.lineTo(x + 5, goalY + 1);
          c.closePath();
          c.fill();
        }
      }
    }),
  );
  view.addChild(card);

  const lineLabel = (t: string, v: number, col: number) => {
    const l = bodyText(`${t}\n${formatChips(v)}`, small ? 12 : 14, col, { bold: true, align: 'right' });
    l.style.lineHeight = small ? 14 : 16;
    l.anchor.set(1, 0.5);
    l.position.set(pl - 15, Y(v));
    view.addChild(l);
    return l;
  };
  const startL = lineLabel('Start', start, START);
  if (goalClipped) {
    // "Ziel 15.100 ↑" sits on the pinned line, at its right end.
    const gl = bodyText(`Ziel ${formatChips(goal)} ↑`, small ? 12 : 14, GOAL, { bold: true });
    gl.anchor.set(1, 1);
    gl.position.set(w - pr + 2, goalY - 2);
    view.addChild(gl);
  } else {
    const goalL = lineLabel('Ziel', goal, GOAL);
    // Start and goal close together: push the two labels apart.
    const need = goalL.height + 4 - (Y(start) - Y(goal));
    if (need > 0) {
      goalL.y -= need / 2;
      startL.y += need / 2;
    }
  }

  // The curve: ink wash to the start line, then a slightly wobbly pen line.
  const rnd = seeded(N * 31 + Math.round(start));
  const P = pts.map((v, i) => ({ x: X(i), y: Y(v) + (i > 0 && i < N - 1 ? (rnd() - 0.5) * 1.2 : 0) }));
  const path = (c: CanvasRenderingContext2D, dx = 0, dy = 0) => {
    c.moveTo(P[0].x + dx, P[0].y + dy);
    if (N > 60) {
      for (let i = 1; i < N; i++) c.lineTo(P[i].x + dx, P[i].y + dy);
      return;
    }
    for (let i = 1; i < N - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2;
      const my = (P[i].y + P[i + 1].y) / 2;
      c.quadraticCurveTo(P[i].x + dx, P[i].y + dy, mx + dx, my + dy);
    }
    c.lineTo(P[N - 1].x + dx, P[N - 1].y + dy);
  };
  const ys = Y(start);
  const curve = new Sprite(
    paint(w, h, (c) => {
      // Washes fade towards the start line: gold above it, rose below.
      for (const [y0, y1, far, rgbCol] of [
        [0, ys, pt, '214,150,40'],
        [ys, h, h - pb, '170,50,70'],
      ] as [number, number, number, string][]) {
        c.save();
        c.beginPath();
        c.rect(0, y0, w, y1 - y0);
        c.clip();
        c.beginPath();
        path(c);
        c.lineTo(P[N - 1].x, ys);
        c.lineTo(P[0].x, ys);
        c.closePath();
        const g = c.createLinearGradient(0, ys, 0, far === ys ? ys + 1 : far);
        g.addColorStop(0, `rgba(${rgbCol},0.05)`);
        g.addColorStop(1, `rgba(${rgbCol},0.3)`);
        c.fillStyle = g;
        c.fill();
        c.restore();
      }
      // A soft bleed under the line, then the pen stroke and a thin second pass.
      c.beginPath();
      path(c, 0.8, 1.2);
      c.strokeStyle = 'rgba(58,28,16,0.22)';
      c.lineWidth = small ? 5 : 6;
      c.stroke();
      c.beginPath();
      path(c);
      c.strokeStyle = 'rgba(46,20,12,0.92)';
      c.lineWidth = small ? 2.4 : 2.8;
      c.stroke();
      c.beginPath();
      path(c, -0.6, -0.5);
      c.strokeStyle = 'rgba(46,20,12,0.35)';
      c.lineWidth = 1;
      c.stroke();
      // Ink dot at the end.
      const e = P[N - 1];
      c.beginPath();
      c.arc(e.x, e.y, small ? 4.5 : 5.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(46,20,12,0.95)';
      c.fill();
    }),
  );
  view.addChild(curve);
  const mask = new Graphics();
  view.addChild(mask);
  curve.mask = mask;

  // Peak: a small moth sits on the highest point of the day.
  let peakI = 0;
  for (let i = 1; i < N; i++) if (pts[i] > pts[peakI]) peakI = i;
  const mothTex = paint(56, 44, (c) => {
    glowAt(c, 28, 22, 26, 20, 0xffd27a, 0.45);
    paintEmblem(c, 28, 24, 46, { wing: 0xe0b25a, wingDark: 0x7a4e18, body: 0x3a1a08, eye: 0xffcf7a }, 1.4);
  });
  // Only a day that rose above its start has a peak worth a moth.
  const rose = pts[peakI] > start;
  const moth = new Sprite(mothTex);
  moth.anchor.set(0.5, 0.85);
  const ms = small ? 0.75 : 0.9;
  moth.position.set(Math.min(w - 26, Math.max(26, P[peakI].x)), P[peakI].y - 4);
  moth.alpha = 0;
  view.addChild(moth);
  const peakL = bodyText(`Höchststand ${formatChips(pts[peakI])}`, small ? 12 : 14, INK, { bold: true });
  peakL.anchor.set(P[peakI].x > w * 0.6 ? 1 : 0, 1);
  peakL.position.set(P[peakI].x + (peakL.anchor.x ? -28 : 28), P[peakI].y - 12);
  peakL.y = Math.max(peakL.height + 4, peakL.y);
  peakL.alpha = 0;
  view.addChild(peakL);

  const end = pts[N - 1];
  const endL = bodyText(formatChips(end), small ? 13 : 16, end >= goal ? GOAL : INK, { bold: true });
  endL.anchor.set(0, 0.5);
  endL.position.set(P[N - 1].x + 9, P[N - 1].y);
  if (endL.x + endL.width > w - 4) endL.x = w - 4 - endL.width;
  endL.alpha = 0;
  view.addChild(endL);
  // Peak right at the end: keep its label off the end value.
  if (peakI === N - 1) peakL.visible = false;
  if (!rose) {
    moth.visible = false;
    peakL.visible = false;
  }
  // A day that only went down: a small red ink ring marks its low point instead (unless that is the end).
  let lowI = 0;
  for (let i = 1; i < N; i++) if (pts[i] < pts[lowI]) lowI = i;
  const low = new Graphics();
  const lowL = bodyText(`Tiefststand ${formatChips(pts[lowI])}`, small ? 12 : 14, 0x8a2a32, { bold: true });
  const showLow = !rose && lowI < N - 1 && pts[lowI] < start;
  low.visible = lowL.visible = showLow;
  if (showLow) {
    const r = small ? 6 : 7;
    low.circle(P[lowI].x, P[lowI].y, r).stroke({ color: 0xa02a36, width: 2, alpha: 0.85 });
    lowL.anchor.set(P[lowI].x > w * 0.6 ? 1 : 0, 0);
    lowL.position.set(P[lowI].x + (lowL.anchor.x ? -12 : 12), P[lowI].y + 8);
    lowL.y = Math.min(h - lowL.height - 4, lowL.y);
  }
  low.alpha = lowL.alpha = 0;
  view.addChild(low, lowL);
  const kLow = N > 1 ? lowI / (N - 1) : 0;

  const kPeak = N > 1 ? peakI / (N - 1) : 0;
  const reveal = (k: number) => {
    mask.clear().rect(0, 0, pl + pw * k + (k >= 1 ? pr : 6), h).fill(0xffffff);
    const mk = Math.max(0, Math.min(1, (k - kPeak) / 0.12 + (k >= 1 ? 1 : 0)));
    moth.alpha = mk;
    moth.scale.set(ms * (0.5 + 0.5 * mk + 0.25 * Math.sin(mk * Math.PI)));
    peakL.alpha = mk;
    low.alpha = lowL.alpha = Math.max(0, Math.min(1, (k - kLow) / 0.12 + (k >= 1 ? 1 : 0)));
    endL.alpha = k >= 1 ? 1 : 0;
  };
  reveal(0);
  return { view, reveal };
}
