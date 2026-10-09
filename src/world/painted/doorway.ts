// Doorways between the rooms of one floor: an arch in the back wall, or a lit opening in a
// side wall, with a small brass plate naming the room behind it.

import { Container, Sprite, Text } from 'pixi.js';
import type { DoorDef } from '../../core/registry';
import { FONT_BODY } from '../../core/fx';
import { glowAt, gold, paint, rgb, rrect } from './brush';
import { P_SIDE, P_WALL_H } from './foyerShell';

/** Doorway art plus the floor point in front of it where the player stands to use it. */
export function paintedDoorway(door: DoorDef, roomW: number, roomH: number, neon: number) {
  const c = new Container();
  const label = door.label ?? '';
  if (door.side === 'back') {
    const w = 96;
    const h = 118;
    const s = new Sprite(
      paint(w + 20, h + 10, (ctx) => {
        const x0 = 10;
        // Frame and arch.
        ctx.beginPath();
        ctx.moveTo(x0, h + 6);
        ctx.lineTo(x0, 44);
        ctx.arc(x0 + w / 2, 44, w / 2, Math.PI, 0);
        ctx.lineTo(x0 + w, h + 6);
        ctx.closePath();
        ctx.fillStyle = gold(ctx, x0, 0, x0 + w, h);
        ctx.fill();
        // Opening: warm light from the next room.
        ctx.beginPath();
        ctx.moveTo(x0 + 9, h + 6);
        ctx.lineTo(x0 + 9, 46);
        ctx.arc(x0 + w / 2, 46, w / 2 - 9, Math.PI, 0);
        ctx.lineTo(x0 + w - 9, h + 6);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(neon, 0.95));
        g.addColorStop(0.55, '#3a1a2a');
        g.addColorStop(1, '#140810');
        ctx.fillStyle = g;
        ctx.fill();
        glowAt(ctx, x0 + w / 2, h, w * 0.5, 22, neon, 0.55, 'lighter');
        // Curtain halves drawn back.
        for (const side of [-1, 1]) {
          const cx = x0 + w / 2 + side * (w / 2 - 14);
          ctx.beginPath();
          ctx.moveTo(cx - 8, 20);
          ctx.quadraticCurveTo(cx + side * 6, h * 0.55, cx - side * 2, h + 4);
          ctx.lineTo(cx + side * 8, h + 4);
          ctx.lineTo(cx + side * 8, 20);
          ctx.closePath();
          ctx.fillStyle = '#7a1630';
          ctx.fill();
        }
      }),
    );
    s.anchor.set(0.5, 1);
    s.position.set(door.x, P_WALL_H + 4);
    c.addChild(s);
  } else if (door.side === 'left' || door.side === 'right') {
    // A lit gap in the side wall, seen at an angle.
    const h = 110;
    const left = door.side === 'left';
    const s = new Sprite(
      paint(40, h + 30, (ctx) => {
        rrect(ctx, 6, 10, 28, h, 6);
        ctx.fillStyle = gold(ctx, 0, 0, 40, h);
        ctx.fill();
        rrect(ctx, 11, 16, 18, h - 10, 4);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(neon, 0.9));
        g.addColorStop(1, '#1a0a12');
        ctx.fillStyle = g;
        ctx.fill();
        glowAt(ctx, 20, h, 30, 18, neon, 0.5, 'lighter');
      }),
    );
    s.anchor.set(left ? 0 : 1, 1);
    s.position.set(left ? 0 : roomW, door.y + 30);
    c.addChild(s);
    // Spill of light on the floor.
    const spill = new Sprite(paint(140, 80, (ctx) => glowAt(ctx, left ? 0 : 140, 40, 130, 34, neon, 0.35)));
    spill.anchor.set(left ? 0 : 1, 0.5);
    spill.position.set(left ? P_SIDE : roomW - P_SIDE, door.y + 10);
    spill.blendMode = 'add';
    c.addChild(spill);
  } else {
    // Front: a glowing threshold in the bottom wall.
    const s = new Sprite(paint(110, 40, (ctx) => {
      rrect(ctx, 5, 8, 100, 24, 8);
      ctx.fillStyle = gold(ctx, 0, 0, 110, 40);
      ctx.fill();
      glowAt(ctx, 55, 20, 60, 16, neon, 0.6, 'lighter');
    }));
    s.anchor.set(0.5, 0.5);
    s.position.set(door.x, roomH - P_SIDE / 2);
    c.addChild(s);
  }
  if (label) {
    const t = new Text({ text: label, style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xfff1c4, stroke: { color: 0x1a0a12, width: 4 }, letterSpacing: 1 } });
    t.anchor.set(0.5, 1);
    const p = doorStand(door, roomW, roomH);
    if (door.side === 'back') t.position.set(door.x, P_WALL_H - 120);
    else t.position.set(p.x, door.side === 'front' ? p.y - 30 : door.y - 92);
    c.addChild(t);
  }
  return c;
}

/** Floor point in front of a door (where its prompt shows and where you appear coming through). */
export function doorStand(door: DoorDef, roomW: number, roomH: number) {
  switch (door.side) {
    case 'back':
      return { x: door.x, y: P_WALL_H + 40 };
    case 'left':
      return { x: P_SIDE + 46, y: door.y };
    case 'right':
      return { x: roomW - P_SIDE - 46, y: door.y };
    default:
      return { x: door.x, y: roomH - P_SIDE - 46 };
  }
}
