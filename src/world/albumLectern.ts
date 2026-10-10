// The moth album on its lectern in the foyer, between the reception and the piano: a carved
// wooden reading stand with the open album on it. Walk up and use it to open the album.

import type { Container } from 'pixi.js';
import type { RoomDefinition } from '../core/registry';
import { MOTHS } from '../core/album';
import { drawSpecies } from './painted/mothArt';
import { GOLD, INK, dark, fillInk, glowAt, gold, light, propSprite, rgb, shadow } from './painted/brush';
import type { Rect } from './decor';

export interface LecternHost {
  entities: Container;
  obstacles: Rect[];
  interactables: { kind: string; x: number; y: number }[];
}

/** Where it stands in the foyer (world pixels, floor point). */
const AT = { x: 1112, y: 606 };
const WOOD = 0x5a2e1a;

function lecternSprite(x: number, y: number) {
  return propSprite(x, y, 120, 150, 60, 136, (c) => {
    shadow(c, 0, 4, 34, 10, 0.55);
    // Foot and column.
    c.beginPath();
    c.ellipse(0, 0, 26, 8, 0, 0, Math.PI * 2);
    fillInk(c, rgb(dark(WOOD, 0.2)), 2);
    c.beginPath();
    c.moveTo(-9, -2);
    c.lineTo(-7, -58);
    c.lineTo(7, -58);
    c.lineTo(9, -2);
    c.closePath();
    const cg = c.createLinearGradient(-9, 0, 9, 0);
    cg.addColorStop(0, rgb(light(WOOD, 0.25)));
    cg.addColorStop(0.5, rgb(WOOD));
    cg.addColorStop(1, rgb(dark(WOOD, 0.4)));
    fillInk(c, cg, 2);
    // Brass rings on the column.
    for (const yy of [-12, -46]) {
      c.beginPath();
      c.ellipse(0, yy, 10, 3, 0, 0, Math.PI * 2);
      fillInk(c, gold(c, -10, yy - 3, 10, yy + 3), 1.2);
    }
    // Slanted desk.
    c.beginPath();
    c.moveTo(-44, -60);
    c.lineTo(44, -60);
    c.lineTo(36, -92);
    c.lineTo(-36, -92);
    c.closePath();
    const dg = c.createLinearGradient(0, -92, 0, -60);
    dg.addColorStop(0, rgb(light(WOOD, 0.3)));
    dg.addColorStop(1, rgb(dark(WOOD, 0.25)));
    fillInk(c, dg, 2.2);
    c.beginPath();
    c.moveTo(-44, -60);
    c.lineTo(44, -60);
    c.lineTo(44, -54);
    c.lineTo(-44, -54);
    c.closePath();
    fillInk(c, rgb(dark(WOOD, 0.35)), 1.6);
    // The open album: leather cover, two cream pages.
    c.beginPath();
    c.moveTo(-40, -64);
    c.lineTo(40, -64);
    c.lineTo(33, -96);
    c.lineTo(-33, -96);
    c.closePath();
    fillInk(c, '#5a1426', 1.8);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -66);
      c.lineTo(s * 36, -67);
      c.lineTo(s * 30, -94);
      c.quadraticCurveTo(s * 14, -97, 0, -93);
      c.closePath();
      const pg = c.createLinearGradient(s * 30, -94, 0, -66);
      pg.addColorStop(0, '#fbf3df');
      pg.addColorStop(1, '#e2cea0');
      fillInk(c, pg, 1.2);
    }
    // Pinned moths on the pages.
    const show = [MOTHS[0], MOTHS[11], MOTHS[23], MOTHS[3]];
    drawSpecies(c, show[1], -17, -82, 18);
    drawSpecies(c, show[2], 17, -84, 16);
    drawSpecies(c, show[0], -14, -72, 11);
    drawSpecies(c, show[3], 18, -73, 11);
    // Spine shadow and a ribbon bookmark.
    c.strokeStyle = 'rgba(90,60,30,0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -93);
    c.lineTo(0, -66);
    c.stroke();
    c.beginPath();
    c.moveTo(3, -66);
    c.quadraticCurveTo(6, -56, 2, -46);
    c.lineTo(6, -48);
    c.lineTo(8, -44);
    c.quadraticCurveTo(10, -56, 6, -66);
    c.closePath();
    fillInk(c, '#b8243a', 1);
    // Brass corners on the desk.
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(s * 40, -58, 3.4, 0, Math.PI * 2);
      fillInk(c, gold(c, s * 40 - 3, -61, s * 40 + 3, -55), 1);
    }
    // A little reading light on top.
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(34, -92);
    c.quadraticCurveTo(40, -118, 22, -122);
    c.stroke();
    c.strokeStyle = rgb(GOLD);
    c.lineWidth = 1.6;
    c.stroke();
    c.beginPath();
    c.ellipse(20, -120, 9, 5, -0.3, 0, Math.PI * 2);
    fillInk(c, gold(c, 11, -125, 29, -115), 1.4);
    glowAt(c, 8, -96, 34, 20, 0xffe0a0, 0.35, 'lighter');
  });
}

/** Puts the lectern into the foyer (no-op in other rooms). */
export function albumLectern(def: RoomDefinition, host: LecternHost) {
  if (def.id !== 'foyer') return;
  const s = lecternSprite(AT.x, AT.y);
  s.zIndex = AT.y;
  host.entities.addChild(s);
  host.obstacles.push({ x: AT.x - 30, y: AT.y - 12, w: 60, h: 18 });
  host.interactables.push({ kind: 'extra', id: 'album', x: AT.x, y: AT.y + 40, title: 'Motten-Album' } as { kind: string; x: number; y: number });
}
