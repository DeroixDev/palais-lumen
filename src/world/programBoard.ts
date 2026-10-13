// The "Programm" poster on a brass easel in the foyer, next to the elevator: today's games
// per floor as little medallions (src/ui/gameIcons.ts). Painted once per day and rotation.

import { INK, ellipse, fillInk, glowAt, gold, propSprite, rgb, rrect, shadow, GOLD } from './painted/brush';
import { paintGameIcon } from '../ui/gameIcons';

export interface BoardRow {
  floor: number;
  games: { id: string; isNew: boolean }[];
  locked: boolean;
}

const PW = 104;
const PH = 128;

/** The easel sprite; (x, y) is where its feet stand. */
export function programBoardSprite(x: number, y: number, rows: BoardRow[]) {
  return propSprite(x, y, PW + 40, PH + 70, PW / 2 + 20, PH + 56, (c) => {
    shadow(c, 0, 4, 34, 9, 0.5);
    // Easel legs and the back leg.
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-30, 4);
    c.lineTo(-8, -PH - 34);
    c.moveTo(30, 4);
    c.lineTo(8, -PH - 34);
    c.moveTo(0, -PH - 30);
    c.lineTo(0, 0);
    c.stroke();
    c.strokeStyle = rgb(GOLD);
    c.lineWidth = 2.6;
    c.stroke();
    // Ledge.
    rrect(c, -PW / 2 - 4, -22, PW + 8, 7, 3);
    fillInk(c, gold(c, -PW / 2, -22, PW / 2, -15), 1.4);
    // The poster: deep teal with a brass frame, tilted a hair.
    c.save();
    c.translate(0, -22 - PH / 2);
    c.rotate(-0.02);
    const x0 = -PW / 2;
    const y0 = -PH / 2;
    rrect(c, x0, y0, PW, PH, 6);
    fillInk(c, gold(c, x0, y0, x0 + PW, y0 + PH), 2);
    rrect(c, x0 + 4, y0 + 4, PW - 8, PH - 8, 4);
    const g = c.createLinearGradient(0, y0, 0, y0 + PH);
    g.addColorStop(0, '#1e2a5a');
    g.addColorStop(1, '#0a0e24');
    c.fillStyle = g;
    c.fill();
    glowAt(c, 0, y0 + 14, 50, 14, 0xa8c8ff, 0.3, 'lighter');
    // Title.
    c.fillStyle = '#ffcf7a';
    c.font = '700 13px Cinzel, Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('PROGRAMM', 0, y0 + 14);
    c.fillStyle = 'rgba(224,178,90,0.6)';
    c.fillRect(x0 + 12, y0 + 23, PW - 24, 1);
    // One line per floor, top floor first.
    const list = [...rows].sort((a, b) => b.floor - a.floor);
    const rh = (PH - 32) / Math.max(1, list.length);
    list.forEach((r, i) => {
      const ry = y0 + 30 + rh * (i + 0.5);
      c.globalAlpha = r.locked ? 0.45 : 1;
      ellipse(c, x0 + 13, ry, 6.5, 6.5);
      fillInk(c, r.floor === 5 ? '#c9a0ff' : '#ffd98a', 1);
      c.fillStyle = '#2a1406';
      c.font = '700 10px "Barlow Condensed", "Arial Narrow", sans-serif';
      c.fillText(String(r.floor), x0 + 13, ry + 0.5);
      const ir = Math.min(6.2, (PW - 34) / Math.max(1, r.games.length) / 2 - 0.6);
      r.games.forEach((gm, k) => {
        const gx = x0 + 28 + ir + k * (ir * 2 + 1.2);
        paintGameIcon(c, gm.id, gx, ry, ir);
        if (gm.isNew && !r.locked) {
          ellipse(c, gx + ir * 0.8, ry - ir * 0.8, 1.8, 1.8);
          c.fillStyle = '#ff5fa2';
          c.fill();
        }
      });
      c.globalAlpha = 1;
    });
    c.restore();
  });
}
