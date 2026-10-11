// The boss corridor's own pieces in the room (floor 5): a moth-wing gate after every machine
// (a wall the player can't pass until that machine had its one try), a brass plaque at each
// machine ("Automat 2 von 5 · Ein Versuch"), a wax seal on spent machines, a light over the
// machine that is up next, a shadow that deepens towards the throne, and the Queen's challenge.
// Built by RoomScene for a room with `corridor: true`; the flow is in src/ui/bossRun.ts.

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { glowTexture, reducedMotion, sparkTexture } from '../core/fx';
import type { RoomDefinition, StationPlacement } from '../core/registry';
import type { GameState } from '../core/state';
import { CORRIDOR, MACHINES, corridorMachines, gateOpen, machineIndex, spentCount } from '../core/bossRun';
import { getGame } from '../core/registry';
import { animate, ease } from '../core/tween';
import { sfx } from '../core/audio';
import { type Ctx, ellipse, fillInk, glowAt, gold, paint, rrect, seeded, shadow } from './painted/brush';
import { crestEmblem, paintWing } from './painted/propsCrystal';
import type { Rect } from './decor';
import type { ExtraInteractable } from './roomExtras';
import { WALL_H } from './styles';

import { BOSS_NAME } from '../core/brand';
export interface CorridorHost {
  world: Container;
  entities: Container;
  lights: Container;
  fx: Container;
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  player(): { x: number; y: number };
}

/** Screen room the lantern strip (src/ui/bossRun.ts) takes at the bottom. */
export const CORRIDOR_BOTTOM = 92;

/**
 * The corridor's own zoom: the low corridor fills the height between HUD and lantern strip,
 * but never so close that less than ~420 px of it are in view (the next gate or machine).
 */
export function corridorZoom(w: number, h: number, top: number) {
  return Math.max(0.5, Math.min(1.2, (h - top - CORRIDOR_BOTTOM) / CORRIDOR.height, w / 420));
}

/** How far (world px) the camera looks ahead in walking direction for a view `viewW` wide. */
export const corridorLeadPx = (viewW: number) => Math.min(280, viewW * 0.27);

const cache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

// ---- The gates: an iron portcullis across the corridor --------------------------------------
// A gate stands across the corridor, i.e. along the depth axis. Seen straight on it would be a
// thin line, so it gets a slight perspective shear (the back end leans left, GATE_SK px of x per
// px of depth). The grille comes down out of the dark above the room: its bars reach up to one
// line near the top of the back wall and fade out there, so it reads as a portcullis hanging
// from the ceiling. Two stone posts hold it, a moth with spread wings guards the red wax seal.

/** Perspective shear of the gate line (x per px of depth). */
export const GATE_SK = 0.36;
/** The grille's top edge: this far above the back end of the gate line (screen px). */
const GATE_TOP = 128;
/** Height of the front post; the back post reaches up to the top of the back wall. */
const POST_FRONT = 210;
const POST_BACK = 124;
/** How far the grille rises to clear the corridor completely. */
const GATE_RISE = 640;

type P3 = (x: number, y: number, z: number) => [number, number];
/** Gate-local projection: x across the gate line, y = depth from the back post, z = height. */
const proj = (len: number): P3 => (x, y, z) => {
  // Things shrink a little towards the back (perspective).
  const s = 0.7 + 0.3 * Math.max(0, Math.min(1, y / len));
  return [x * s + GATE_SK * (y - len / 2), y - z * s];
};

/** A painted sprite around the gate's anchor (the back end of the gate line on the floor). */
function gateSprite(key: string, x0: number, y0: number, x1: number, y1: number, draw: (c: Ctx) => void) {
  const tex = cached(key, () =>
    paint(x1 - x0, y1 - y0, (c) => {
      c.translate(-x0, -y0);
      draw(c);
    }),
  );
  const s = new Sprite(tex);
  s.anchor.set(-x0 / (x1 - x0), -y0 / (y1 - y0));
  return s;
}

function quad(c: Ctx, pts: [number, number][]) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
}

function fillFace(c: Ctx, fill: string | CanvasGradient, ink: number) {
  if (ink > 0) fillInk(c, fill, ink);
  else {
    c.fillStyle = fill;
    c.fill();
  }
}

/** A box seen from the front left and above: its left face, front face and top. */
function box3(c: Ctx, P: P3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, left: string | CanvasGradient, front: string | CanvasGradient, top: string | CanvasGradient, ink = 1.2) {
  quad(c, [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)]);
  fillFace(c, left, ink);
  quad(c, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]);
  fillFace(c, front, ink);
  quad(c, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]);
  fillFace(c, top, ink);
}

/** A square stone post with a plinth, a gold capital, a moth finial and a moth carved on its front. */
function paintPost(c: Ctx, P: P3, y: number, h: number) {
  const [fx] = P(-14, y + 5, 0);
  const fg = c.createLinearGradient(fx, 0, fx + 28, 0);
  fg.addColorStop(0, '#3e3050');
  fg.addColorStop(0.45, '#5e4e72');
  fg.addColorStop(1, '#2a2036');
  // Depth is drawn shallow, like the other props' plinths.
  box3(c, P, -18, 18, y - 7, y + 7, 0, 14, '#1e1628', fg, '#4a3a5c', 1.4);
  box3(c, P, -14, 14, y - 5, y + 5, 14, h - 14, '#1a1324', fg, '#3a2e48', 1.4);
  // Fluting on the front face.
  for (const dx of [-7, 0, 7]) {
    const [x0, y0] = P(dx, y + 5, 22);
    const [, y1] = P(dx, y + 5, h - 22);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0, y1);
    c.strokeStyle = 'rgba(14,6,20,0.45)';
    c.lineWidth = 1.6;
    c.stroke();
    c.beginPath();
    c.moveTo(x0 + 1.4, y0);
    c.lineTo(x0 + 1.4, y1);
    c.strokeStyle = 'rgba(220,200,255,0.12)';
    c.lineWidth = 1;
    c.stroke();
  }
  const [gx0, gy0] = P(-18, y + 7, h);
  box3(c, P, -18, 18, y - 7, y + 7, h - 14, h, '#6a4a18', gold(c, gx0, gy0, gx0 + 36, gy0 + 14), '#f2d08a', 1.4);
  const [mx, my] = P(0, y + 5, h * 0.6);
  c.save();
  c.translate(mx, my);
  c.globalAlpha = 0.9;
  crestEmblem(c, 16, '#c98ae0');
  c.restore();
  // Finial: a little gold moth on a ball.
  const [tx, ty] = P(0, y, h);
  glowAt(c, tx, ty - 14, 18, 16, 0xffcf7a, 0.35, 'lighter');
  ellipse(c, tx, ty - 5, 6, 5);
  fillInk(c, gold(c, tx - 6, ty - 10, tx + 6, ty), 1.2);
  c.save();
  c.translate(tx, ty - 17);
  crestEmblem(c, 20);
  c.restore();
}

/** Back post (stands against the back wall, behind the player). */
function backPostSprite(len: number) {
  const P = proj(len);
  const [x] = P(0, 0, 0);
  return gateSprite(`gpostB-${len}`, x - 32, -POST_BACK - 34, x + 32, 30, (c) => {
    shadow(c, ...P(4, 14, 0), 24, 7, 0.45);
    paintPost(c, P, 0, POST_BACK / 0.7);
  });
}

/** Front post: always in front of the player. */
function frontPostSprite(len: number) {
  const P = proj(len);
  const [x] = P(0, len, 0);
  return gateSprite(`gpostF-${len}`, x - 34, len - POST_FRONT - 34, x + 34, len + 30, (c) => {
    shadow(c, ...P(4, len + 14, 0), 28, 8, 0.5);
    paintPost(c, P, len, POST_FRONT);
  });
}

/** Screen y of the grille's top edge (gate-local). */
const TOP_Y = -GATE_TOP;

/** The grille: bars from the floor slot up into the dark, rails, a purple veil, the moth's wings. */
function grilleSprite(len: number) {
  const P = proj(len);
  const [bx] = P(0, 0, 0);
  const [fx] = P(0, len, 0);
  const x0 = bx - 90;
  const x1 = fx + 90;
  return gateSprite(`ggrille-${len}`, x0, TOP_Y - 4, x1, len + 16, (c) => {
    const floor = (y: number) => P(0, y, 0);
    // Veil of moth light filling the gate.
    quad(c, [floor(0), floor(len), [floor(len)[0], TOP_Y], [floor(0)[0], TOP_Y]]);
    const vg = c.createLinearGradient(0, TOP_Y, 0, len);
    vg.addColorStop(0, 'rgba(120,60,180,0.05)');
    vg.addColorStop(0.5, 'rgba(160,90,220,0.22)');
    vg.addColorStop(1, 'rgba(225,175,255,0.4)');
    c.fillStyle = vg;
    c.fill();
    // Vertical bars with gold spike tips in the floor slot.
    const step = 17;
    for (let y = 8; y <= len - 6; y += step) {
      const [x, yb] = floor(y);
      const s = 0.7 + 0.3 * (y / len);
      const w = 3 * s;
      c.beginPath();
      c.rect(x - w - 1.2 * s, TOP_Y, 1.2 * s, yb - TOP_Y);
      c.fillStyle = '#06040a';
      c.fill();
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, '#120c18');
      g.addColorStop(0.4, '#54466a');
      g.addColorStop(1, '#100a16');
      rrect(c, x - w, TOP_Y, w * 2, yb - TOP_Y, w);
      c.fillStyle = g;
      c.fill();
      c.beginPath();
      c.moveTo(x - w - 0.6, yb - 3);
      c.lineTo(x + w + 0.6, yb - 3);
      c.lineTo(x, yb + 8 * s);
      c.closePath();
      fillInk(c, gold(c, x - 3, yb - 3, x + 3, yb + 8), 0.9);
    }
    // Cross rails, parallel to the floor, riveted where they meet the bars.
    for (const z of [18, 84, 156, 236]) {
      const a = P(-3, 2, z);
      const b = P(-3, len - 2, z);
      if (b[1] - 7 < TOP_Y) continue;
      c.save();
      c.beginPath();
      c.rect(x0, TOP_Y, x1 - x0, len + 20 - TOP_Y);
      c.clip();
      quad(c, [a, b, [b[0], b[1] - 7], [a[0], a[1] - 7]]);
      const rg = c.createLinearGradient(0, b[1] - 7, 0, b[1]);
      rg.addColorStop(0, '#7a6a90');
      rg.addColorStop(0.5, '#3a3048');
      rg.addColorStop(1, '#140e1a');
      fillInk(c, rg, 1);
      for (let y = 8; y <= len - 6; y += step) {
        const [rx, ry] = P(-3, y, z);
        if (ry - 3.5 < TOP_Y) continue;
        ellipse(c, rx, ry - 3.5, 1.5, 1.5);
        c.fillStyle = '#e0b25a';
        c.fill();
      }
      c.restore();
    }
    // The moth's wings spread across the grille around the seal (the seal is its body).
    const [sx, sy] = sealAt(len);
    glowAt(c, sx, sy - 6, 96, 60, 0xc98ae0, 0.3, 'lighter');
    for (const s of [-1, 1]) {
      c.save();
      c.translate(sx + s * 6, sy - 4);
      c.scale(s * 0.62, 0.62);
      c.rotate(-0.18);
      paintWing(c, false);
      c.restore();
    }
    // Into the dark: the top of the grille fades out.
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const fade = c.createLinearGradient(0, TOP_Y, 0, TOP_Y + 110);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fade;
    c.fillRect(x0, TOP_Y - 4, x1 - x0, 116);
    c.restore();
  });
}

/** Floor slot the grille's spikes sit in. */
function slotSprite(len: number) {
  const P = proj(len);
  const [bx] = P(0, 0, 0);
  const [fx] = P(0, len, 0);
  return gateSprite(`gslot-${len}`, bx - 20, -14, fx + 20, len + 14, (c) => {
    quad(c, [P(-12, -4, 0), P(12, -4, 0), P(12, len + 4, 0), P(-12, len + 4, 0)]);
    c.fillStyle = 'rgba(6,0,10,0.12)';
    c.fill();
    // A brass-lined groove, drawn flat on the floor.
    quad(c, [P(-3, -2, 0), P(3, -2, 0), P(3, len + 2, 0), P(-3, len + 2, 0)]);
    c.fillStyle = 'rgba(7,2,12,0.45)';
    c.fill();
    c.beginPath();
    c.moveTo(...P(3.8, -2, 0));
    c.lineTo(...P(3.8, len + 2, 0));
    c.strokeStyle = 'rgba(224,178,90,0.35)';
    c.lineWidth = 1;
    c.stroke();
  });
}

/** Where the seal hangs on the grille (gate-local screen offset): the middle, at chest height of the moth. */
const sealAt = (len: number) => proj(len)(-3, len / 2, 150);

/** Red wax seal with the moth crest, as two halves that break apart along a jagged crack. */
function sealHalf(side: -1 | 1) {
  return cached(`gseal-${side}`, () =>
    paint(60, 80, (c) => {
      c.translate(30, 34);
      const crack: [number, number][] = [[1, -26], [-3, -14], [3, -5], [-2, 4], [3, 13], [-1, 24], [1, 40]];
      c.save();
      c.beginPath();
      c.moveTo(side * 40, -40);
      for (const [x, y] of crack) c.lineTo(x, y);
      c.lineTo(side * 40, 46);
      c.closePath();
      c.clip();
      // Ribbon tails under the wax.
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * 4, 6);
        c.lineTo(s * 13, 40);
        c.lineTo(s * 8, 36);
        c.lineTo(s * 4, 42);
        c.lineTo(s * -2, 8);
        c.closePath();
        fillInk(c, s < 0 ? '#7a1a3a' : '#5a1030', 1.2);
      }
      const r = seeded(31);
      c.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const rr = 19 + (r() - 0.5) * 3.4 + (k % 7 === 3 ? 2.6 : 0);
        if (k) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      const g = c.createRadialGradient(-6, -7, 2, 0, 0, 22);
      g.addColorStop(0, '#f06070');
      g.addColorStop(0.55, '#b02238');
      g.addColorStop(1, '#5e0c1c');
      fillInk(c, g, 1.6);
      ellipse(c, 0, 0, 13, 13);
      c.strokeStyle = 'rgba(60,0,12,0.55)';
      c.lineWidth = 1.6;
      c.stroke();
      c.globalAlpha = 0.85;
      crestEmblem(c, 20, '#ffcf7a');
      c.globalAlpha = 1;
      glowAt(c, -7, -8, 6, 4, 0xffffff, 0.35, 'lighter');
      c.restore();
      // The broken edge.
      c.beginPath();
      crack.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = 'rgba(40,0,8,0.5)';
      c.lineWidth = 1;
      c.stroke();
    }),
  );
}

/** "AUTOMAT 2 VON 5 · Ein Versuch. Wähle deinen Einsatz." on a brass easel. */
function plaqueTexture(i: number, name: string) {
  return cached(`plq-${i}-${name}`, () =>
    paint(190, 132, (c) => {
      c.translate(95, 126);
      shadow(c, 0, 0, 30, 6, 0.5);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * 22, 0);
        c.lineTo(s * 8, -70);
        c.strokeStyle = '#2a1608';
        c.lineWidth = 4;
        c.stroke();
      }
      rrect(c, -90, -122, 180, 72, 8);
      fillInk(c, gold(c, -90, -122, 90, -50), 2.2);
      rrect(c, -83, -115, 166, 58, 5);
      const g = c.createLinearGradient(0, -115, 0, -57);
      g.addColorStop(0, '#3a0e3a');
      g.addColorStop(1, '#1a0620');
      c.fillStyle = g;
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffcf7a';
      c.font = '700 15px Cinzel, Georgia, serif';
      c.fillText(`AUTOMAT ${i + 1} VON ${MACHINES}`, 0, -102);
      c.fillStyle = '#f2e6c9';
      c.font = '700 14px "Barlow Condensed", sans-serif';
      c.fillText(name, 0, -86);
      c.fillStyle = '#d9b8ff';
      c.font = '700 13px "Barlow Condensed", sans-serif';
      c.fillText('Ein Versuch. Wähle deinen Einsatz.', 0, -69);
    }),
  );
}

/** Red wax seal "GESPIELT" over a machine whose try is used. */
function sealTexture() {
  return cached('seal', () =>
    paint(96, 60, (c) => {
      const r = seeded(9);
      c.translate(48, 30);
      c.rotate(-0.12);
      c.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const rr = 40 + (r() - 0.5) * 6;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.55;
        if (k) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      const g = c.createRadialGradient(-8, -6, 2, 0, 0, 40);
      g.addColorStop(0, '#e04a5a');
      g.addColorStop(1, '#7a1020');
      fillInk(c, g, 1.8);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '700 17px "Barlow Condensed", sans-serif';
      c.fillStyle = '#ffe6d0';
      c.fillText('GESPIELT', 0, 1);
    }),
  );
}

/** Gold chevron over the machine that is up next. */
function arrowTexture() {
  return cached('arrow', () =>
    paint(60, 54, (c) => {
      glowAt(c, 30, 24, 30, 24, 0xffcf7a, 0.55, 'lighter');
      c.beginPath();
      c.moveTo(8, 8);
      c.lineTo(52, 8);
      c.lineTo(30, 46);
      c.closePath();
      fillInk(c, gold(c, 8, 8, 52, 46), 2.6);
    }),
  );
}

/** The corridor grows darker towards the throne (a thin gradient stretched over the floor). */
function shadeTexture() {
  return cached('shade', () =>
    paint(256, 4, (c) => {
      const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(6,0,12,0)');
      g.addColorStop(0.35, 'rgba(6,0,12,0.05)');
      g.addColorStop(0.75, 'rgba(6,0,12,0.3)');
      g.addColorStop(0.88, 'rgba(10,0,16,0.38)');
      g.addColorStop(1, 'rgba(10,0,16,0.2)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 4);
    }, 1),
  );
}

interface Gate {
  i: number;
  x: number;
  /** World y of the back end of the gate line; the gate runs `len` px towards the front. */
  y0: number;
  len: number;
  /** Stepped obstacle along the slanted gate line. */
  rects: Rect[];
  grille: Container;
  bars: Sprite;
  sealL: Sprite;
  sealR: Sprite;
  sealGlow: Sprite;
  glow: Sprite;
  hints: ExtraInteractable[];
  /** Open state shown now; null before the first refresh. */
  open: boolean | null;
}

/** A dust puff, spark or crumb of wax from a gate opening (moved in update()). */
interface Bit {
  s: Sprite;
  vx: number;
  vy: number;
  /** Gravity (px/s²). */
  g: number;
  spin: number;
  life: number;
  max: number;
  /** Width growth per second (dust). */
  grow: number;
  a0: number;
  /** Stops falling here (seal halves land on the floor). */
  floor?: number;
  /** Dust: fades in, then out. */
  soft?: boolean;
}

export class CorridorScene {
  private gates: Gate[] = [];
  private seals: Sprite[] = [];
  private beacon: Sprite;
  private arrow: Sprite;
  private queenSpot: ExtraInteractable;
  private bits: Bit[] = [];
  private time = 0;
  private dead = false;
  /** Camera lead in walking direction (-1..1), smoothed; RoomScene turns it into pixels. */
  lead = 0;
  private lastX = NaN;
  private dir = 1;

  constructor(
    private state: GameState,
    private def: RoomDefinition,
    private host: CorridorHost,
  ) {
    const W = def.width;
    const H = def.height;
    const shade = new Sprite(shadeTexture());
    shade.position.set(0, WALL_H - 150);
    shade.width = W;
    shade.height = H - WALL_H + 150;
    shade.eventMode = 'none';
    host.world.addChildAt(shade, 1);
    const slots = new Container();
    host.world.addChildAt(slots, 2);

    const yTop = WALL_H + 8;
    const yBot = H - 26;
    const len = yBot - yTop;
    const P = proj(len);
    CORRIDOR.gates.forEach((gx, i) => {
      const at = (s: Sprite, z: number) => {
        s.position.set(gx, yTop);
        s.zIndex = z;
        return s;
      };
      slots.addChild(at(slotSprite(len), 0));
      host.entities.addChild(at(backPostSprite(len), yTop + 16), at(frontPostSprite(len), yBot + 30));
      // The grille rises into the dark above the room: a mask cuts it off at its top edge.
      const grille = new Container();
      grille.zIndex = yBot + 1;
      const bars = at(grilleSprite(len), 0);
      const mask = new Graphics().rect(gx - 400, yTop + TOP_Y, 800, len + 60 - TOP_Y).fill(0xffffff);
      grille.addChild(bars, mask);
      bars.mask = mask;
      host.entities.addChild(grille);
      const [sx, sy] = sealAt(len);
      const sealL = new Sprite(sealHalf(-1));
      const sealR = new Sprite(sealHalf(1));
      for (const s of [sealL, sealR]) {
        s.anchor.set(0.5, 34 / 80);
        s.position.set(gx + sx, yTop + sy);
        s.zIndex = yBot + 2;
      }
      host.entities.addChild(sealL, sealR);
      const sealGlow = new Sprite(glowTexture());
      sealGlow.anchor.set(0.5);
      sealGlow.tint = 0xff7a6a;
      sealGlow.blendMode = 'add';
      sealGlow.position.set(gx + sx, yTop + sy);
      sealGlow.width = sealGlow.height = 90;
      sealGlow.alpha = 0.35;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.tint = 0xb06ad8;
      glow.blendMode = 'add';
      glow.position.set(gx, yTop + len / 2 - 90);
      glow.width = 190;
      glow.height = len + 40;
      glow.alpha = 0.3;
      host.lights.addChild(glow, sealGlow);
      // The obstacle follows the slanted line in steps (overlapping, so nothing slips through).
      const N = 12;
      const rects: Rect[] = [];
      for (let k = 0; k < N; k++) {
        const u0 = (k * len) / N;
        const u1 = ((k + 1) * len) / N;
        const x = gx + P(0, (u0 + u1) / 2, 0)[0];
        const y = k === 0 ? 0 : yTop + u0;
        rects.push({ x: x - 18, y, w: 36, h: (k === N - 1 ? H : yTop + u1 + 2) - y });
      }
      const line = (y: number) => gx + P(0, y - yTop, 0)[0];
      const hints: ExtraInteractable[] = [WALL_H + 70, WALL_H + 175, WALL_H + 280, WALL_H + 385].map((y) => ({ kind: 'extra', id: `gate:${i}`, x: line(y) - 48, y, title: 'Tor · erst den Automaten spielen' }));
      this.gates.push({ i, x: gx, y0: yTop, len, rects, grille, bars, sealL, sealR, sealGlow, glow, hints, open: null });
    });

    // Plaques and seals at the machines.
    const machines = corridorMachines(def);
    machines.forEach((st, i) => {
      const g = getGame(st.game);
      const p = new Sprite(plaqueTexture(i, st.label ?? g.name));
      p.anchor.set(0.5, 126 / 132);
      p.position.set(st.x - 96, st.y + g.footprint.h + 6);
      p.zIndex = p.y;
      host.entities.addChild(p);
      const s = new Sprite(sealTexture());
      s.anchor.set(0.5);
      s.position.set(st.x + g.footprint.w / 2, st.y + g.footprint.h * 0.45);
      s.zIndex = st.y + g.footprint.h + 2;
      s.visible = false;
      host.entities.addChild(s);
      this.seals.push(s);
    });
    // Light over the machine that is up next.
    this.beacon = new Sprite(glowTexture());
    this.beacon.anchor.set(0.5);
    this.beacon.tint = 0xffcf7a;
    this.beacon.blendMode = 'add';
    this.beacon.width = 220;
    this.beacon.height = 260;
    host.lights.addChild(this.beacon);
    this.arrow = new Sprite(arrowTexture());
    this.arrow.anchor.set(0.5, 1);
    host.fx.addChild(this.arrow);
    const t = CORRIDOR.throne;
    this.queenSpot = { kind: 'extra', id: 'queen', x: t.x, y: t.y + 76, title: `${BOSS_NAME} herausfordern` };
    host.interactables.push(this.queenSpot);
    this.refresh();
    // A saved spot behind a closed gate or off the floor (an old save of the throne room): back to the start.
    const p = host.player() as { x: number; y: number; set?: (x: number, y: number) => void };
    const shut = this.gates.find((g) => !g.open);
    if (p.y > H - 40 || p.y < WALL_H + 20 || (shut && p.x > this.lineX(shut, p.y) - 20)) {
      p.x = def.spawn.x;
      p.y = def.spawn.y;
    }
  }

  /** x of a gate's line at world depth y. */
  private lineX(g: Gate, y: number) {
    return g.x + GATE_SK * (Math.max(0, Math.min(g.len, y - g.y0)) - g.len / 2);
  }

  /** Puts gates, seals and the beacon in line with the save (no animation). */
  refresh() {
    for (const g of this.gates) this.setGate(g, gateOpen(this.state.data, g.i), false);
    this.placeMarks();
  }

  private placeMarks() {
    const n = spentCount(this.state.data);
    const machines = corridorMachines(this.def);
    this.seals.forEach((s, i) => (s.visible = i < n));
    // A spent machine says so in its prompt.
    for (const it of this.host.interactables as { kind: string; station?: StationPlacement; title?: string }[]) {
      if (it.kind !== 'station' || !it.station) continue;
      const k = machineIndex(this.def, it.station);
      const name = it.station.label ?? getGame(it.station.game).name;
      it.title = k >= 0 && k < n ? `${name} · Versuch gespielt` : `${name} spielen`;
    }
    const next = machines[n];
    this.beacon.visible = this.arrow.visible = !!next;
    if (next) {
      const g = getGame(next.game);
      this.beacon.position.set(next.x + g.footprint.w / 2, next.y + g.footprint.h / 2);
      this.arrow.position.set(next.x + g.footprint.w / 2, next.y - 62);
    }
  }

  private setGate(g: Gate, open: boolean, animated: boolean) {
    if (g.open === open) return;
    g.open = open;
    const obs = this.host.obstacles;
    const ia = this.host.interactables;
    if (open) {
      for (const r of g.rects) {
        const k = obs.indexOf(r);
        if (k >= 0) obs.splice(k, 1);
      }
      for (const h of g.hints) {
        const j = ia.indexOf(h);
        if (j >= 0) ia.splice(j, 1);
      }
    } else {
      for (const r of g.rects) if (!obs.includes(r)) obs.push(r);
      for (const h of g.hints) if (!ia.includes(h)) ia.push(h);
    }
    const [sx, sy] = sealAt(g.len);
    const still = () => {
      this.bits = this.bits.filter((b) => b.s !== g.sealL && b.s !== g.sealR);
      g.grille.visible = g.glow.visible = g.sealGlow.visible = !open;
      g.bars.position.set(g.x, g.y0);
      g.bars.alpha = 1;
      for (const s of [g.sealL, g.sealR]) {
        s.visible = !open;
        s.alpha = 1;
        s.rotation = 0;
        s.position.set(g.x + sx, g.y0 + sy);
      }
    };
    if (!animated) return still();
    // Opening: the wax seal cracks and falls, the grille grinds up into the arch.
    sfx.crack();
    setTimeout(() => !this.dead && sfx.creak(), 180);
    sfx.shimmer();
    setTimeout(() => !this.dead && sfx.door(), 700);
    if (reducedMotion()) return still();
    const seal = { x: g.x + sx, y: g.y0 + sy };
    const floor = g.y0 + g.len / 2 + 6;
    this.spark(seal.x, seal.y, 0, 0, 0, 0.35, 0xfff1c4, 1.6);
    for (const [s, side] of [[g.sealL, -1], [g.sealR, 1]] as const) {
      this.bits.push({ s, vx: side * (40 + Math.random() * 20), vy: -70, g: 900, spin: side * 4, life: 0, max: 2.4, grow: 0, a0: 1, floor: floor + side * 6 });
    }
    for (let k = 0; k < 9; k++) {
      const c = new Sprite(glowTexture());
      c.anchor.set(0.5);
      c.tint = 0xa01a2c;
      c.width = c.height = 5 + Math.random() * 4;
      c.position.set(seal.x + (Math.random() - 0.5) * 16, seal.y + (Math.random() - 0.5) * 16);
      this.host.fx.addChild(c);
      this.bits.push({ s: c, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 90, g: 700, spin: 0, life: 0, max: 0.9, grow: 0, a0: 1, floor: floor + (Math.random() - 0.5) * 30 });
    }
    g.sealGlow.visible = false;
    g.glow.alpha = 0.8;
    const P = proj(g.len);
    let dusted = false;
    let sparkT = 0;
    let last = 0;
    void animate(1700, (k) => {
      if (this.dead) return;
      const b = Math.max(0, (k - 0.12) / 0.88);
      const e = ease.inOutCubic(b);
      const rattle = b > 0 && b < 1 ? Math.sin(k * 90) * 0.7 : 0;
      g.bars.position.set(g.x + rattle, g.y0 - GATE_RISE * e);
      g.bars.alpha = 1 - Math.max(0, (e - 0.6) / 0.4);
      g.glow.alpha = 0.8 * (1 - k);
      if (b > 0 && !dusted) {
        dusted = true;
        // Dust puffs out of the floor slot as the spikes come free.
        for (let u = 14; u < g.len; u += 34) {
          const [x, y] = P(0, u, 0);
          this.dust(g.x + x, g.y0 + y - 4, 1);
        }
      }
      // Sparks where the grille grinds along the post tops, and grit falling from above.
      sparkT += (k - last) * 1.7;
      last = k;
      while (b > 0 && b < 0.95 && sparkT > 0.035) {
        sparkT -= 0.035;
        for (const [u, h] of [[6, POST_BACK / 0.7], [g.len - 6, POST_FRONT]]) {
          const [x, y] = P(-16, u, h - 8);
          this.spark(g.x + x, g.y0 + y + 2, (Math.random() - 0.5) * 180, -30 - Math.random() * 80, 700, 0.5, 0xffcf7a, 0.22);
        }
        if (Math.random() < 0.5) {
          const [x] = P(0, Math.random() * g.len, 0);
          this.dust(g.x + x, g.y0 + TOP_Y + 30 + Math.random() * 60, 0.35, 60);
        }
      }
    }, ease.linear).then(() => {
      if (this.dead) return;
      g.grille.visible = g.glow.visible = false;
      g.bars.position.set(g.x, g.y0);
    });
  }

  private spark(x: number, y: number, vx: number, vy: number, grav: number, max: number, tint: number, size: number) {
    const s = new Sprite(sparkTexture());
    s.anchor.set(0.5);
    s.tint = tint;
    s.blendMode = 'add';
    s.scale.set(size);
    s.position.set(x, y);
    this.host.fx.addChild(s);
    this.bits.push({ s, vx, vy, g: grav, spin: 6, life: 0, max, grow: size > 1 ? 60 : 0, a0: 1 });
  }

  private dust(x: number, y: number, size: number, fall = 0) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.tint = 0x9a8aa6;
    s.width = 26 * size;
    s.height = 16 * size;
    s.position.set(x + (Math.random() - 0.5) * 10, y);
    s.alpha = 0;
    this.host.fx.addChild(s);
    this.bits.push({ s, vx: (Math.random() - 0.5) * 30, vy: fall || -14 - Math.random() * 14, g: 0, spin: 0, life: 0, max: fall ? 0.8 : 1.5, grow: fall ? 4 : 46 * size, a0: fall ? 0.5 : 0.42, soft: true });
  }

  /** Machine `i` had its try: its seal goes on and gate `i` opens, with a show. */
  openGate(i: number) {
    const g = this.gates[i];
    if (g) this.setGate(g, true, true);
    this.placeMarks();
    const st = corridorMachines(this.def)[i];
    if (st && !reducedMotion()) {
      const s = this.seals[i];
      s.scale.set(2);
      s.alpha = 0;
      void animate(380, (k) => {
        if (this.dead) return;
        s.scale.set(2 - k);
        s.alpha = k;
      }, ease.outBack);
    }
  }

  /** The gate in front of the player is closed (x within `reach` of its line at depth y), or -1. */
  closedGateNear(x: number, reach = 70, y?: number) {
    const g = this.gates.find((q) => !q.open && Math.abs((y === undefined ? q.x : this.lineX(q, y)) - x) < reach);
    return g ? g.i : -1;
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const t = this.time;
    const dt = Math.min(dtMs, 50) / 1000;
    const calm = reducedMotion();
    // Camera lead: look ahead in the direction the player last walked.
    const px = this.host.player().x;
    if (Number.isFinite(this.lastX) && Math.abs(px - this.lastX) > 0.3) this.dir = Math.sign(px - this.lastX);
    this.lastX = px;
    this.lead += (this.dir - this.lead) * Math.min(1, dt * 1.6);
    this.beacon.alpha = calm ? 0.4 : 0.34 + Math.sin(t * 2.4) * 0.1;
    if (this.arrow.visible) this.arrow.alpha = 0.85;
    if (!calm && this.arrow.visible) this.arrow.pivot.y = Math.abs(Math.sin(t * 3)) * 8;
    for (const g of this.gates) {
      if (g.open || calm) continue;
      g.glow.alpha = 0.26 + Math.sin(t * 1.8 + g.i) * 0.06;
      g.sealGlow.alpha = 0.3 + Math.sin(t * 2.6 + g.i) * 0.12;
    }
    for (const b of this.bits) {
      b.life += dt;
      const s = b.s;
      b.vy += b.g * dt;
      s.x += b.vx * dt;
      s.y += b.vy * dt;
      if (b.floor !== undefined && s.y > b.floor) {
        s.y = b.floor;
        b.vy = 0;
        b.vx *= 0.8;
        b.spin = 0;
      }
      s.rotation += b.spin * dt;
      if (b.grow) {
        s.width += b.grow * dt;
        s.height += b.grow * 0.6 * dt;
      }
      const k = b.life / b.max;
      // Dust fades in and out; everything else fades over the last third.
      s.alpha = b.soft ? b.a0 * Math.min(1, k * 5) * (1 - k) : b.a0 * Math.min(1, (1 - k) * 3);
    }
    this.bits = this.bits.filter((b) => {
      if (b.life < b.max) return true;
      // Seal halves belong to the gate and are reused; the rest are one-offs.
      if (this.gates.some((g) => g.sealL === b.s || g.sealR === b.s)) b.s.visible = false;
      else b.s.destroy();
      return false;
    });
  }

  destroy() {
    this.dead = true;
  }
}
