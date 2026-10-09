// Doorways between the rooms of one floor: an arch in the back wall, a lit opening in a side
// wall or a stairwell in the front wall, each with a lit plaque naming the room behind it.
// The frame follows the floor's style (velvet curtains, a stone arch with ivy, a riveted iron
// hatch, a neon outline), so a door looks like it belongs to its room.

import { Container, Sprite, Text } from 'pixi.js';
import type { DoorDef } from '../../core/registry';
import { FONT_BODY } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, rgb, rrect, seeded, type Ctx } from './brush';
import { P_SIDE, P_WALL_H } from './foyerShell';

type Look = 'velvet' | 'garden' | 'clockwork' | 'neon';

function lookOf(style?: string): Look {
  if (style === 'velvet' || style === 'foyer' || style === 'throne') return 'velvet';
  if (style === 'garden') return 'garden';
  if (style === 'clockwork') return 'clockwork';
  return 'neon';
}

/** Frame colour of a look. */
function frameFill(c: Ctx, look: Look, x0: number, y0: number, x1: number, y1: number) {
  if (look === 'garden') {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#c9ced8');
    g.addColorStop(0.5, '#8a909c');
    g.addColorStop(1, '#4a505c');
    return g;
  }
  if (look === 'clockwork') {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#e8a870');
    g.addColorStop(0.35, '#a8602e');
    g.addColorStop(0.7, '#6a3818');
    g.addColorStop(1, '#3a1e0e');
    return g;
  }
  if (look === 'neon') return '#16121c';
  return gold(c, x0, y0, x1, y1);
}

/** A few ivy leaves along a path of points. */
function ivy(c: Ctx, pts: [number, number][], rnd: () => number) {
  for (const [x, y] of pts) {
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      c.save();
      c.translate(x + Math.cos(a) * 5, y + Math.sin(a) * 4);
      c.rotate(a);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(5, -5, 10, 0);
      c.quadraticCurveTo(5, 5, 0, 0);
      c.fillStyle = rnd() < 0.5 ? '#3f7a3a' : '#2a5a2a';
      c.fill();
      c.strokeStyle = 'rgba(10,30,14,0.8)';
      c.lineWidth = 0.8;
      c.stroke();
      c.restore();
    }
  }
}

/** Back-wall arch, painted in a canvas of (w + 40) × (h + 20); the floor line is at y = h + 10. */
function paintArch(c: Ctx, w: number, h: number, look: Look, neon: number, rnd: () => number) {
  const x0 = 20;
  const base = h + 10;
  const top = base - h;
  const R = w / 2;
  const arch = (inset: number) => {
    c.beginPath();
    if (look === 'clockwork') {
      rrect(c, x0 + inset, top + 8 + inset, w - inset * 2, h - 8 - inset + 4, 14 - inset * 0.6);
      return;
    }
    c.moveTo(x0 + inset, base + 2);
    c.lineTo(x0 + inset, top + R);
    c.arc(x0 + R, top + R, R - inset, Math.PI, 0);
    c.lineTo(x0 + w - inset, base + 2);
    c.closePath();
  };
  // Light falling out of the doorway onto the wall around it.
  glowAt(c, x0 + R, base - h * 0.45, w * 0.95, h * 0.7, neon, 0.28, 'lighter');
  // Frame.
  arch(-4);
  c.fillStyle = 'rgba(6,2,10,0.5)';
  c.fill();
  arch(0);
  fillInk(c, frameFill(c, look, x0, top, x0 + w, base), 2.4);
  // Opening: the next room's light.
  arch(10);
  const g = c.createLinearGradient(0, top, 0, base);
  g.addColorStop(0, rgb(light(neon, 0.25), 0.95));
  g.addColorStop(0.5, rgb(neon, 0.6));
  g.addColorStop(1, rgb(dark(neon, 0.75)));
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  glowAt(c, x0 + R, top + h * 0.35, w * 0.45, h * 0.35, 0xffffff, 0.35, 'lighter');
  // A glimpse of floor beyond.
  c.fillStyle = 'rgba(10,4,12,0.45)';
  c.fillRect(x0, base - 24, w, 30);
  c.restore();
  if (look === 'velvet') {
    // Curtain halves drawn back, with gold tassels.
    for (const side of [-1, 1]) {
      const cx = x0 + R + side * (R - 18);
      c.beginPath();
      c.moveTo(cx - side * 10, top + 18);
      c.quadraticCurveTo(cx + side * 8, top + h * 0.55, cx - side * 2, base);
      c.lineTo(cx + side * 10, base);
      c.lineTo(cx + side * 10, top + 18);
      c.closePath();
      const cg = c.createLinearGradient(cx - 10, 0, cx + 10, 0);
      cg.addColorStop(0, '#5a0c22');
      cg.addColorStop(0.5, '#a8203e');
      cg.addColorStop(1, '#4a0a1c');
      fillInk(c, cg, 1.6);
      ellipse(c, cx + side * 4, top + h * 0.55, 4, 6);
      fillInk(c, gold(c, cx, top + h * 0.5, cx + 8, top + h * 0.6), 1);
    }
    // Keystone.
    c.beginPath();
    c.moveTo(x0 + R - 10, top - 4);
    c.lineTo(x0 + R + 10, top - 4);
    c.lineTo(x0 + R + 7, top + 14);
    c.lineTo(x0 + R - 7, top + 14);
    c.closePath();
    fillInk(c, gold(c, x0 + R - 10, top - 4, x0 + R + 10, top + 14), 1.4);
  } else if (look === 'garden') {
    // Stone blocks round the arch and ivy climbing over it.
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      c.beginPath();
      c.moveTo(x0 + R + Math.cos(a) * (R - 10), top + R + Math.sin(a) * (R - 10));
      c.lineTo(x0 + R + Math.cos(a) * R, top + R + Math.sin(a) * R);
      c.strokeStyle = 'rgba(30,34,44,0.7)';
      c.lineWidth = 1.4;
      c.stroke();
    }
    const pts: [number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * 1.05 + (k / 10) * Math.PI * 0.6;
      pts.push([x0 + R + Math.cos(a) * (R - 3), top + R + Math.sin(a) * (R - 3)]);
    }
    for (let yy = top + R; yy < base - 10; yy += 12) pts.push([x0 + 4, yy]);
    ivy(c, pts, rnd);
    // Lantern hanging in the arch.
    c.beginPath();
    c.moveTo(x0 + R, top + 10);
    c.lineTo(x0 + R, top + 22);
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.stroke();
    rrect(c, x0 + R - 6, top + 22, 12, 15, 3);
    fillInk(c, 'rgba(255,226,160,0.95)', 1.3);
    glowAt(c, x0 + R, top + 30, 26, 26, 0xffe2a0, 0.55, 'lighter');
  } else if (look === 'clockwork') {
    // Rivets, a gear crest and hazard stripes on the sill.
    for (let yy = top + 16; yy < base - 4; yy += 14) {
      for (const xx of [x0 + 5, x0 + w - 5]) {
        ellipse(c, xx, yy, 1.8, 1.8);
        c.fillStyle = '#f0c088';
        c.fill();
      }
    }
    c.save();
    c.translate(x0 + R, top + 6);
    c.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = i % 2 ? 16 : 12;
      i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    fillInk(c, gold(c, -16, -16, 16, 16), 1.4);
    ellipse(c, 0, 0, 5, 5);
    c.fillStyle = '#2a1a10';
    c.fill();
    c.restore();
    c.save();
    c.beginPath();
    c.rect(x0 + 10, base - 6, w - 20, 8);
    c.clip();
    c.fillStyle = '#e8b22a';
    c.fillRect(x0, base - 6, w, 8);
    c.fillStyle = '#1a1410';
    for (let k = x0; k < x0 + w + 10; k += 12) {
      c.beginPath();
      c.moveTo(k, base + 2);
      c.lineTo(k + 6, base + 2);
      c.lineTo(k + 14, base - 6);
      c.lineTo(k + 8, base - 6);
      c.closePath();
      c.fill();
    }
    c.restore();
  } else {
    // Neon tube outline.
    arch(3);
    c.strokeStyle = rgb(neon, 0.45);
    c.lineWidth = 9;
    c.stroke();
    c.strokeStyle = rgb(light(neon, 0.6));
    c.lineWidth = 2.6;
    c.stroke();
  }
}

/** Lit name plaque; returns a container centred on (0, 0). */
function plaque(label: string, look: Look, neon: number, arrow: -1 | 0 | 1 = 0) {
  const c = new Container();
  const text = (arrow < 0 ? '‹ ' : '') + label + (arrow > 0 ? ' ›' : '');
  const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: look === 'neon' ? 0xffffff : 0xfff1c4, letterSpacing: 1 } });
  t.anchor.set(0.5);
  const w = Math.ceil(t.width + 22);
  const h = 24;
  const plate = new Sprite(
    paint(w + 24, h + 24, (ctx) => {
      glowAt(ctx, (w + 24) / 2, (h + 24) / 2, w * 0.7, h * 1.1, neon, 0.35, 'lighter');
      rrect(ctx, 12, 12, w, h, look === 'garden' ? 4 : 7);
      ctx.fillStyle = look === 'garden' ? '#1c2a22' : look === 'clockwork' ? '#2a160c' : '#1a0a14';
      ctx.fill();
      ctx.strokeStyle = look === 'neon' ? rgb(light(neon, 0.4)) : look === 'garden' ? '#c9ced8' : '#e0b25a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      rrect(ctx, 10.5, 10.5, w + 3, h + 3, 8);
      ctx.stroke();
    }),
  );
  plate.anchor.set(0.5);
  c.addChild(plate, t);
  return c;
}

/** Doorway art plus the floor point in front of it where the player stands to use it. */
export function paintedDoorway(door: DoorDef, roomW: number, roomH: number, neon: number, style?: string) {
  const c = new Container();
  const label = door.label ?? '';
  const look = lookOf(style);
  const rnd = seeded(Math.round(door.x * 7 + door.y * 3 + 11));
  if (door.side === 'back') {
    const w = 104;
    const h = 126;
    const s = new Sprite(paint(w + 40, h + 20, (ctx) => paintArch(ctx, w, h, look, neon, rnd)));
    s.anchor.set(0.5, (h + 10) / (h + 20));
    s.position.set(door.x, P_WALL_H + 4);
    c.addChild(s);
    // A warm mat of light on the floor in front, so the door reads from across the room.
    const spill = new Sprite(paint(200, 90, (ctx) => glowAt(ctx, 100, 20, 96, 60, neon, 0.4)));
    spill.anchor.set(0.5, 0.2);
    spill.position.set(door.x, P_WALL_H + 6);
    spill.blendMode = 'add';
    c.addChild(spill);
    if (label) {
      // The name hangs inside the arch, below the top of the wall, clear of the room's sign.
      const p = plaque(label, look, neon);
      p.position.set(door.x, P_WALL_H - 66);
      c.addChild(p);
    }
  } else if (door.side === 'left' || door.side === 'right') {
    // An opening in the side wall: light from the next room, jambs that step into the room,
    // a threshold mat and a hanging sign pointing at it.
    const left = door.side === 'left';
    const oh = 132;
    const top = door.y - 104;
    const W2 = P_SIDE + 52;
    const s = new Sprite(
      paint(W2, oh + 50, (ctx) => {
        if (!left) {
          ctx.translate(W2, 0);
          ctx.scale(-1, 1);
        }
        const y0 = 16;
        // The gap: corridor light.
        const g = ctx.createLinearGradient(0, 0, P_SIDE + 10, 0);
        g.addColorStop(0, rgb(light(neon, 0.35)));
        g.addColorStop(1, rgb(neon, 0.75));
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, P_SIDE + 4, oh);
        glowAt(ctx, 6, y0 + oh / 2, 30, oh * 0.55, 0xffffff, 0.4, 'lighter');
        // Threshold.
        ctx.fillStyle = 'rgba(10,4,12,0.35)';
        ctx.fillRect(0, y0 + oh - 18, P_SIDE + 4, 18);
        // Jambs: two short pilasters standing out of the wall at both ends.
        for (const jy of [y0 - 10, y0 + oh - 4]) {
          rrect(ctx, 0, jy, P_SIDE + 18, 14, 3);
          fillInk(ctx, frameFill(ctx, look, 0, jy, P_SIDE + 18, jy + 14), 1.6);
        }
        // Lintel along the wall's top edge.
        rrect(ctx, P_SIDE - 6, y0 - 8, 10, oh + 10, 3);
        fillInk(ctx, frameFill(ctx, look, P_SIDE - 6, 0, P_SIDE + 4, 0), 1.4);
        if (look === 'garden') ivy(ctx, [[P_SIDE + 4, y0 - 6], [P_SIDE + 12, y0 - 2], [P_SIDE, y0 + 10], [P_SIDE + 2, y0 + oh - 2]], rnd);
        if (look === 'neon') {
          ctx.strokeStyle = rgb(light(neon, 0.6));
          ctx.lineWidth = 2.5;
          ctx.strokeRect(P_SIDE - 2, y0 - 2, 3, oh + 4);
        }
        // Mat into the room.
        rrect(ctx, P_SIDE + 2, y0 + oh * 0.5 - 4, 44, 34, 6);
        ctx.fillStyle = look === 'clockwork' ? 'rgba(60,60,70,0.7)' : look === 'garden' ? 'rgba(150,140,120,0.55)' : 'rgba(120,20,40,0.75)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(224,178,90,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }),
    );
    s.anchor.set(left ? 0 : 1, 0);
    s.position.set(left ? 0 : roomW, top - 16);
    c.addChild(s);
    // Spill of light on the floor.
    const spill = new Sprite(paint(220, 140, (ctx) => glowAt(ctx, left ? 0 : 220, 70, 210, 64, neon, 0.45)));
    spill.anchor.set(left ? 0 : 1, 0.5);
    spill.position.set(left ? P_SIDE : roomW - P_SIDE, door.y - 30);
    spill.blendMode = 'add';
    c.addChild(spill);
    if (label) {
      const p = plaque(label, look, neon, left ? -1 : 1);
      // Hangs off a bracket on the wall, above the opening.
      const bx = left ? P_SIDE + p.width / 2 - 6 : roomW - P_SIDE - p.width / 2 + 6;
      p.position.set(bx, top - 26);
      c.addChild(p);
    }
  } else {
    // Front: stairs going down through the bottom wall.
    const w = 120;
    const s = new Sprite(
      paint(w + 40, P_SIDE + 40, (ctx) => {
        const x0 = 20;
        const y0 = 14;
        glowAt(ctx, x0 + w / 2, y0 + 10, w * 0.7, 30, neon, 0.45, 'lighter');
        // Steps into the dark.
        for (let k = 0; k < 4; k++) {
          const sy = y0 + k * 7;
          ctx.fillStyle = rgb(dark(look === 'clockwork' ? 0x6a6a76 : 0x8a7a6a, 0.15 + k * 0.2));
          ctx.fillRect(x0 + 4, sy, w - 8, 7);
          ctx.fillStyle = look === 'clockwork' ? '#e8b22a' : 'rgba(255,240,210,0.3)';
          ctx.fillRect(x0 + 4, sy, w - 8, 1.6);
        }
        ctx.fillStyle = rgb(neon, 0.35);
        ctx.fillRect(x0 + 4, y0 + 28, w - 8, P_SIDE);
        // Posts on both sides.
        for (const px of [x0 - 6, x0 + w - 6]) {
          rrect(ctx, px, y0 - 14, 12, P_SIDE + 22, 3);
          fillInk(ctx, frameFill(ctx, look, px, 0, px + 12, 0), 1.6);
          ellipse(ctx, px + 6, y0 - 14, 7, 4);
          fillInk(ctx, frameFill(ctx, look, px, y0 - 18, px + 12, y0 - 10), 1.2);
        }
      }),
    );
    s.anchor.set(0.5, 0);
    s.position.set(door.x, roomH - P_SIDE - 14);
    c.addChild(s);
    const spill = new Sprite(paint(240, 120, (ctx) => glowAt(ctx, 120, 120, 120, 80, neon, 0.4)));
    spill.anchor.set(0.5, 1);
    spill.position.set(door.x, roomH - P_SIDE);
    spill.blendMode = 'add';
    c.addChild(spill);
    if (label) {
      const p = plaque(label, look, neon);
      p.position.set(door.x, roomH - P_SIDE - 34);
      c.addChild(p);
    }
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
