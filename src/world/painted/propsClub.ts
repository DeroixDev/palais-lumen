// Painted pieces for the club floor (floor 4): the dance stage with its DJ, truss and moving
// heads, the LED dance floor, speaker stacks, the neon bar, VIP booths, the light desk; the
// techno bunker's lasers, strobes and fog; the hip-hop floor's turntables, boombox, sneaker
// wall, gold chains and hoop. Everything is painted once; Pixi overlays pulse to the beat
// (sfx.beatPos), and a few shared switches (clubShow) let the usable props change the show.
// Coordinates: (x, y) is where the piece stands on the floor (the middle of its footprint);
// wall pieces hang on the back wall at x.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { FONT_BODY, glowTexture, reducedMotion } from '../../core/fx';
import { sfx } from '../../core/audio';
import type { BuiltDecor } from '../decor';
import { P_WALL_H } from './foyerShell';
import { box, ent, glow } from './foyerProps';
import { Chibi } from './chibi';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

import { CLUB_SOUND } from '../../core/brand';
// ---- The show ------------------------------------------------------------------------------------

const MAGENTA = 0xff3fb4;
const CYAN = 0x3fe8ff;
const VIOLET = 0xa06bff;

/** Colour sets of the light show; the light desk switches between them. */
export const PALETTES: number[][] = [
  [MAGENTA, CYAN, VIOLET],
  [0xff3040, 0xffa020, 0xfff060],
  [0x40ff90, CYAN, 0x3f6bff],
  [0xffffff, MAGENTA, 0xffd23f],
];

/** Shared switches of the floor's show, flipped by the usable props (see clubUse.ts). */
export const clubShow = {
  palette: 0,
  /** performance.now() of the last drop (DJ booth) / bass boost (boombox) / fog burst / scratch. */
  dropAt: -1e9,
  boostAt: -1e9,
  fogAt: -1e9,
  scratchAt: -1e9,
};

const since = (t: number) => (performance.now() - t) / 1000;
/** 1 right after the event, fading to 0 over `len` seconds. */
const fresh = (t: number, len: number) => Math.max(0, 1 - since(t) / len);
const pal = (i: number) => PALETTES[clubShow.palette % PALETTES.length][((i % 3) + 3) % 3];

/** Where the band is, in beats (falls back to a steady clock before the sound starts). */
export function beatNow(time: number) {
  return sfx.beatPos() ?? time * 2.07;
}
/** A kick envelope: 1 on the beat, dying away before the next one. */
const kickOf = (b: number) => Math.exp(-(b - Math.floor(b)) * 5);

// ---- Shared textures -----------------------------------------------------------------------------

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

/** A soft cone of light pointing down from (w/2, 0). */
function beamTexture() {
  return cached('club-beam', () =>
    paint(80, 520, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 520);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.beginPath();
      c.moveTo(37, 0);
      c.lineTo(43, 0);
      c.lineTo(80, 520);
      c.lineTo(0, 520);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      // Brighter core.
      const k = c.createLinearGradient(0, 0, 0, 400);
      k.addColorStop(0, 'rgba(255,255,255,0.9)');
      k.addColorStop(1, 'rgba(255,255,255,0)');
      c.beginPath();
      c.moveTo(39, 0);
      c.lineTo(41, 0);
      c.lineTo(52, 400);
      c.lineTo(28, 400);
      c.closePath();
      c.fillStyle = k;
      c.fill();
    }, 1),
  );
}

/** A thin laser line from (2, 0) downwards. */
function laserTexture() {
  return cached('club-laser', () =>
    paint(6, 700, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 700);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(2, 0, 2, 700);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(0, 0, 6, 700);
    }, 1),
  );
}

/** A lit tile of the dance floor (white, tinted per tile). */
function tileTexture(w: number, h: number) {
  return cached(`club-tile-${w}x${h}`, () =>
    paint(w, h, (c) => {
      rrect(c, 2, 2, w - 4, h - 4, 4);
      const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0.25)');
      c.fillStyle = g;
      c.fill();
    }, 1),
  );
}

/** A loudspeaker cone seen from the front. */
function coneTexture(r: number) {
  return cached(`club-cone-${r}`, () =>
    paint(r * 2 + 4, r * 2 + 4, (c) => {
      c.translate(r + 2, r + 2);
      ellipse(c, 0, 0, r, r);
      const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, '#5a5a66');
      g.addColorStop(0.6, '#1e1e26');
      g.addColorStop(1, '#0a0a10');
      fillInk(c, g, 1.6);
      for (const k of [0.75, 0.5]) {
        ellipse(c, 0, 0, r * k, r * k);
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        c.lineWidth = 1;
        c.stroke();
      }
      ellipse(c, 0, 0, r * 0.28, r * 0.28);
      const d = c.createRadialGradient(-r * 0.1, -r * 0.1, 0, 0, 0, r * 0.28);
      d.addColorStop(0, '#9a9aa8');
      d.addColorStop(1, '#2a2a34');
      fillInk(c, d, 1);
    }, 2),
  );
}

function addSprite(parent: Container, tex: Texture, x: number, y: number, ax = 0.5, ay = 0.5) {
  const s = new Sprite(tex);
  s.anchor.set(ax, ay);
  s.position.set(x, y);
  parent.addChild(s);
  return s;
}

// ---- Painting helpers ----------------------------------------------------------------------------

/** Brushed steel / chrome, lit from the left. */
function chrome(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f4f6fa');
  g.addColorStop(0.3, '#a8b0c0');
  g.addColorStop(0.55, '#4a5060');
  g.addColorStop(0.8, '#c8d0dc');
  g.addColorStop(1, '#3a3e4a');
  return g;
}

/** A neon tube along the current path: coloured halo, saturated tube and a white-hot core. */
function neonStroke(c: Ctx, col: number, width = 3) {
  c.save();
  c.shadowColor = rgb(col, 0.95);
  c.shadowBlur = 14;
  c.strokeStyle = rgb(col, 0.9);
  c.lineWidth = width + 2;
  c.stroke();
  c.shadowBlur = 0;
  c.strokeStyle = rgb(light(col, 0.75));
  c.lineWidth = width * 0.45;
  c.stroke();
  c.restore();
}

/** Square aluminium truss between two points (vertical or horizontal). */
function truss(c: Ctx, x0: number, y0: number, x1: number, y1: number, s = 14) {
  const vert = Math.abs(x1 - x0) < Math.abs(y1 - y0);
  const len = vert ? y1 - y0 : x1 - x0;
  c.save();
  c.translate(x0, y0);
  if (!vert) c.rotate(0);
  const rail = (o: number) => {
    c.beginPath();
    if (vert) {
      c.moveTo(o, 0);
      c.lineTo(o, len);
    } else {
      c.moveTo(0, o);
      c.lineTo(len, o);
    }
    c.strokeStyle = 'rgba(14,14,20,0.9)';
    c.lineWidth = 4.2;
    c.stroke();
    c.strokeStyle = vert ? chrome(c, o - 2, 0, o + 2, 0) : '#c8d0dc';
    c.lineWidth = 2.6;
    c.stroke();
  };
  // Zigzag lacing.
  c.beginPath();
  for (let k = 0, p = 0; p <= len; k++, p += s) {
    if (vert) k % 2 ? c.lineTo(s / 2, p) : (k ? c.lineTo(-s / 2, p) : c.moveTo(-s / 2, p));
    else k % 2 ? c.lineTo(p, s / 2) : (k ? c.lineTo(p, -s / 2) : c.moveTo(p, -s / 2));
  }
  c.strokeStyle = 'rgba(160,170,190,0.85)';
  c.lineWidth = 1.2;
  c.stroke();
  rail(-s / 2);
  rail(s / 2);
  c.restore();
}

/** A speaker cabinet front (w×h at x0,y0) with a grille and a logo plate. */
function cabinet(c: Ctx, x0: number, y0: number, w: number, h: number, d: number) {
  // Top face.
  rrect(c, x0, y0 - d, w, d + 4, 3);
  fillInk(c, vgrad(c, y0 - d, y0, 0x3a3a44, 0.2, 0.2), 1.6);
  rrect(c, x0, y0, w, h, 4);
  fillInk(c, vgrad(c, y0, y0 + h, 0x1c1c24, 0.1, 0.4), 2);
  rrect(c, x0 + 4, y0 + 4, w - 8, h - 8, 3);
  c.fillStyle = '#121218';
  c.fill();
  // Corner protectors.
  for (const [cx, cy] of [[x0 + 3, y0 + 3], [x0 + w - 3, y0 + 3], [x0 + 3, y0 + h - 3], [x0 + w - 3, y0 + h - 3]]) {
    ellipse(c, cx, cy, 3, 3);
    c.fillStyle = chrome(c, cx - 3, cy - 3, cx + 3, cy + 3);
    c.fill();
  }
}

/** A sneaker in side view, toe to the right, about 34×16. */
function sneaker(c: Ctx, x: number, y: number, col: number, accent: number, flip = false) {
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  // Sole.
  c.beginPath();
  c.moveTo(-17, 0);
  c.lineTo(15, 0);
  c.quadraticCurveTo(19, -1, 18, -5);
  c.lineTo(-17, -5);
  c.closePath();
  fillInk(c, '#f6f2ea', 1.2);
  c.fillStyle = rgb(accent, 0.8);
  c.fillRect(-16, -3, 30, 1.4);
  // Upper.
  c.beginPath();
  c.moveTo(-16, -5);
  c.lineTo(-15, -15);
  c.quadraticCurveTo(-10, -18, -6, -14);
  c.lineTo(2, -12);
  c.quadraticCurveTo(12, -11, 17, -5);
  c.closePath();
  fillInk(c, vgrad(c, -18, -5, col, 0.3, 0.25), 1.3);
  // Wing-shaped logo and laces.
  c.beginPath();
  c.moveTo(-10, -7);
  c.quadraticCurveTo(0, -13, 10, -7);
  c.quadraticCurveTo(0, -9, -10, -7);
  c.fillStyle = rgb(accent);
  c.fill();
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    c.moveTo(-4 + k * 3, -13);
    c.lineTo(-2 + k * 3, -11);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1;
    c.stroke();
  }
  c.restore();
}

// ---- The pieces ----------------------------------------------------------------------------------

export function buildPaintedClub(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 31 + y * 7 + 3));
  const calm = reducedMotion();
  switch (d.kind) {
    // ---- The dance stage: deck, DJ booth and DJ, truss with moving heads, LED panels, sparks.
    case 'djStage': {
      const sw = w || 760;
      const sd = h || 170;
      const PH = 34;
      const front = sd / 2;
      const back = -sd / 2;
      const beamY = 6 - y + 10; // truss beam just under the ceiling
      const deckF = front - PH;
      const deckB = back - PH;
      const v = new Container();
      const tw = sw / 2 - 26;
      const panelX = [-sw / 2 + 56, sw / 2 - 126];
      v.addChild(
        propSprite(x, y, sw + 90, front - beamY + 60, sw / 2 + 45, -beamY + 30, (c) => {
          shadow(c, 0, front + 6, sw * 0.55, 20, 0.7);
          // Truss towers and the beam.
          for (const s of [-1, 1]) truss(c, s * tw, beamY + 4, s * tw, deckB + 40);
          truss(c, -tw - 10, beamY + 4, tw + 10, beamY + 4);
          for (const s of [-1, 1]) {
            rrect(c, s * tw - 14, deckB + 34, 28, 10, 2);
            fillInk(c, '#2a2a34', 1.4);
          }
          // LED panels on stands (their picture is animated on top).
          for (const px of panelX) {
            rrect(c, px - 4, beamY + 70, 78, deckB + 30 - beamY - 70, 3);
            fillInk(c, '#0a0a10', 2);
            c.fillStyle = '#3a3a44';
            c.fillRect(px + 30, deckB + 20, 10, 14);
          }
          // Deck: black boards with gaffer tape, the front face with a grille and an LED lip.
          rrect(c, -sw / 2, deckB, sw, sd, 6);
          fillInk(c, vgrad(c, deckB, deckF, 0x16121e, 0.1, 0.2), 2.4);
          c.save();
          rrect(c, -sw / 2, deckB, sw, sd, 6);
          c.clip();
          for (let k = 0; k < sd; k += 14) {
            c.fillStyle = 'rgba(0,0,0,0.35)';
            c.fillRect(-sw / 2, deckB + k, sw, 1);
          }
          for (let k = 0; k < 6; k++) {
            const tx = (rnd() - 0.5) * sw * 0.8;
            const ty = deckB + 20 + rnd() * (sd - 40);
            c.save();
            c.translate(tx, ty);
            c.rotate(0.6);
            c.fillStyle = 'rgba(240,240,230,0.5)';
            c.fillRect(-7, -1.5, 14, 3);
            c.rotate(-1.2);
            c.fillRect(-7, -1.5, 14, 3);
            c.restore();
          }
          // Cable runs.
          c.beginPath();
          c.moveTo(-sw / 2 + 20, deckF - 20);
          c.bezierCurveTo(-sw * 0.2, deckF - 40, -60, deckF - 6, 0, deckF - 30);
          c.strokeStyle = 'rgba(10,10,14,0.9)';
          c.lineWidth = 2.5;
          c.stroke();
          glowAt(c, 0, deckB + sd * 0.4, sw * 0.4, sd * 0.5, MAGENTA, 0.12, 'lighter');
          // Gloss: the light rig mirrored in the black deck.
          for (let k = 0; k < 7; k++) {
            const gx = -sw / 2 + 60 + k * ((sw - 120) / 6);
            c.beginPath();
            c.moveTo(gx - 6, deckB);
            c.lineTo(gx + 6, deckB);
            c.lineTo(gx + 22, deckF);
            c.lineTo(gx - 22, deckF);
            c.closePath();
            c.fillStyle = rgb(k % 2 ? CYAN : MAGENTA, 0.07);
            c.fill();
          }
          c.restore();
          rrect(c, -sw / 2, deckF, sw, PH, 4);
          fillInk(c, vgrad(c, deckF, front, 0x16141e, 0.05, 0.4), 2.4);
          c.save();
          rrect(c, -sw / 2 + 6, deckF + 8, sw - 12, PH - 12, 3);
          c.clip();
          for (let gx = -sw / 2; gx < sw / 2; gx += 5) {
            c.fillStyle = 'rgba(255,255,255,0.05)';
            c.fillRect(gx, deckF + 8, 2, PH);
          }
          c.restore();
          c.fillStyle = chrome(c, 0, deckF, 0, deckF + 4);
          c.fillRect(-sw / 2 + 2, deckF, sw - 4, 3);
          // Footlights along the lip.
          for (let k = 0; k < 8; k++) {
            const fx = -sw / 2 + 40 + k * ((sw - 80) / 7);
            rrect(c, fx - 9, deckF - 12, 18, 12, 3);
            fillInk(c, '#1a1a22', 1.2);
            ellipse(c, fx, deckF - 10, 6, 2.5);
            c.fillStyle = rgb(k % 2 ? MAGENTA : CYAN);
            c.fill();
          }
        }),
      );
      // The animated LED panels.
      const panels = new Graphics();
      v.addChild(panels);
      // Moving heads hanging from the beam.
      const headXs = [-sw * 0.4, -sw * 0.26, sw * 0.26, sw * 0.4];
      const heads: { g: Container; x: number }[] = [];
      const headTex = cached('club-head', () =>
        paint(30, 36, (c) => {
          rrect(c, 3, 0, 24, 8, 2);
          fillInk(c, '#2a2a34', 1.2);
          c.beginPath();
          c.moveTo(5, 8);
          c.lineTo(5, 20);
          c.moveTo(25, 8);
          c.lineTo(25, 20);
          c.strokeStyle = '#3a3a48';
          c.lineWidth = 3;
          c.stroke();
          rrect(c, 7, 14, 16, 18, 5);
          fillInk(c, vgrad(c, 14, 32, 0x30303c, 0.2, 0.3), 1.4);
          ellipse(c, 15, 30, 6, 3);
          c.fillStyle = '#fff6f0';
          c.fill();
        }, 2),
      );
      for (const hx of headXs) {
        const g = new Container();
        g.position.set(x + hx, y + beamY + 10);
        const s = addSprite(g, headTex, 0, 0, 0.5, 0.1);
        s.scale.set(1);
        v.addChild(g);
        heads.push({ g, x: hx });
      }
      // Booth and DJ.
      const dj = new Chibi(0xff3fb4, { skin: 0x8d5a3b, hair: 0x1b1b22, hairStyle: 'curly', outfit: 'suit', jacket: 0x14141c, accessory: 'none' });
      dj.view.position.set(x, y + deckF - 34);
      v.addChild(dj.view);
      const phones = new Graphics();
      phones.arc(0, -84, 16, Math.PI * 1.05, Math.PI * 1.95).stroke({ color: 0x1a1a22, width: 4 });
      phones.roundRect(-20, -84, 8, 14, 3).fill(0x2a2a34).stroke({ color: 0x0a0a10, width: 1 });
      phones.roundRect(12, -84, 8, 14, 3).fill(0x2a2a34).stroke({ color: 0x0a0a10, width: 1 });
      phones.circle(-16, -77, 2).fill(MAGENTA);
      phones.circle(16, -77, 2).fill(MAGENTA);
      dj.view.addChild(phones);
      const bw = 230;
      v.addChild(
        propSprite(x, y + deckF - 6, bw + 30, 112, bw / 2 + 15, 102, (c) => {
          const top = -72;
          const fy = -14;
          // Console top: two players, a mixer and a laptop.
          rrect(c, -bw / 2, top - 4, bw, 22, 4);
          fillInk(c, '#16161e', 1.8);
          for (const s of [-1, 1]) {
            const px = s * 70;
            rrect(c, px - 30, top - 2, 60, 18, 3);
            fillInk(c, '#2a2a34', 1.2);
            ellipse(c, px, top + 9, 17, 6);
            fillInk(c, chrome(c, px - 17, top, px + 17, top + 16), 1);
            ellipse(c, px, top + 9, 6, 2.2);
            c.fillStyle = rgb(s < 0 ? CYAN : MAGENTA);
            c.fill();
          }
          rrect(c, -22, top - 2, 44, 18, 2);
          fillInk(c, '#22222c', 1.2);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = '#0a0a10';
            c.fillRect(-16 + k * 10, top + 2, 2, 12);
            c.fillStyle = '#e8e8f0';
            c.fillRect(-18 + k * 10, top + 5 + (k % 3) * 2, 6, 3);
          }
          // Laptop with a glowing screen.
          c.beginPath();
          c.moveTo(78, top - 4);
          c.lineTo(108, top - 4);
          c.lineTo(104, top - 26);
          c.lineTo(82, top - 26);
          c.closePath();
          fillInk(c, '#c8ccd6', 1.2);
          c.fillStyle = 'rgba(120,200,255,0.8)';
          c.fillRect(85, top - 23, 16, 15);
          // Front panel: white gloss with the moth logo.
          rrect(c, -bw / 2, top + 14, bw, fy - top - 14 + 14, 6);
          fillInk(c, vgrad(c, top + 14, fy + 14, 0xeef0f6, 0.1, 0.3), 2);
          c.save();
          c.translate(0, top + 40);
          c.shadowColor = rgb(MAGENTA);
          c.shadowBlur = 12;
          for (const s of [-1, 1]) {
            c.beginPath();
            c.ellipse(s * 15, -3, 15, 10, s * 0.45, 0, Math.PI * 2);
            c.moveTo(s * 10 + 8 * s, 10);
            c.ellipse(s * 10, 9, 9, 7, -s * 0.4, 0, Math.PI * 2);
            c.strokeStyle = rgb(MAGENTA);
            c.lineWidth = 2.6;
            c.stroke();
          }
          c.beginPath();
          c.moveTo(0, -14);
          c.lineTo(0, 16);
          c.stroke();
          c.restore();
          c.font = `700 9px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#3a3a48';
          c.fillText(CLUB_SOUND, 0, fy + 8);
          c.fillStyle = rgb(CYAN);
          c.fillRect(-bw / 2 + 4, fy + 11, bw - 8, 2);
        }),
      );
      const glowFront = glow(v, x, y + deckF + 4, sw * 1.1, 60, MAGENTA, 0.25);
      // Sparks from the stage corners during a drop.
      const sparks = new Graphics();
      v.addChild(sparks);
      // Beams: a separate part in the light layer.
      const beams = new Container();
      const beamSprites = heads.map((hd, i) => {
        const s = addSprite(beams, beamTexture(), x + hd.x, y + beamY + 30, 0.5, 0);
        s.blendMode = 'add';
        s.scale.set(1.4, 1.15);
        s.tint = pal(i);
        return s;
      });
      const strobe = glow(beams, x, y + front + 220, sw * 1.4, 520, 0xffffff, 0);
      const stagePool = glow(beams, x, y + front + 30, sw, 120, MAGENTA, 0.2);
      return [
        ent(v, [{ x: x - sw / 2, y: y - sd / 2, w: sw, h: sd }], y + front, (time) => {
          const b = beatNow(time);
          const k = kickOf(b);
          const drop = fresh(clubShow.dropAt, 6);
          // DJ nods to the beat, jumps on a drop.
          dj.update(16, null);
          dj.view.y = y + deckF - 34 - k * 3 - (drop > 0.7 ? Math.abs(Math.sin(time * 12)) * 14 : 0);
          dj.view.rotation = Math.sin(b * Math.PI) * 0.04;
          // LED panels: a bouncing equaliser in the palette colours.
          panels.clear();
          for (const [pi, px] of panelX.entries()) {
            const top = y + beamY + 74;
            const bot = y + deckB + 26;
            const ph = bot - top;
            for (let i = 0; i < 7; i++) {
              const lvl = 0.25 + 0.6 * Math.abs(Math.sin(b * 0.9 + i * 0.7 + pi)) * (0.5 + 0.5 * k) + drop * 0.3;
              const bh = Math.min(1, lvl) * ph;
              for (let s = 0; s < bh; s += 9) panels.rect(x + px + 2 + i * 10, bot - s - 7, 8, 6).fill({ color: pal(i + Math.floor(s / 40)), alpha: 0.85 });
            }
          }
          // Moving heads sweep; beams pulse with the kick.
          heads.forEach((hd, i) => {
            const side = hd.x < 0 ? 1 : -1;
            const a = side * 0.35 + Math.sin(b * (Math.PI / 4) + i * 1.3) * (calm ? 0.2 : 0.45) + drop * Math.sin(time * 9 + i) * 0.3;
            hd.g.rotation = a;
            const s = beamSprites[i];
            s.rotation = a;
            s.tint = pal(i + Math.floor(b / 8));
            s.alpha = 0.18 + 0.3 * k + drop * 0.25;
          });
          stagePool.alpha = 0.16 + 0.12 * k;
          stagePool.tint = pal(Math.floor(b / 4));
          glowFront.alpha = 0.2 + 0.15 * k;
          glowFront.tint = pal(Math.floor(b / 4) + 1);
          // Strobe and sparks on a drop.
          strobe.alpha = !calm && drop > 0.2 && drop < 0.85 ? (Math.floor(time * 16) % 2 ? 0.35 : 0) : 0;
          sparks.clear();
          if (drop > 0)
            for (const s of [-1, 1])
              for (let i = 0; i < 26; i++) {
                const e = (time * 1.6 + i / 26) % 1;
                const sx = x + s * (sw / 2 - 30) + Math.sin(i * 7.3) * 10 * e;
                const sy = y + deckF - 10 - e * 170 + e * e * 60;
                sparks.circle(sx, sy, 2 - e * 1.4).fill({ color: e < 0.3 ? 0xffffff : 0xffd23f, alpha: drop * (1 - e) });
              }
        }, () => void (clubShow.dropAt = performance.now())),
        { view: beams, layer: 'lights', obstacles: [] },
      ];
    }

    // ---- LED dance floor (club), steel grid (techno), battle mat (hip-hop).
    case 'danceFloor': {
      const fw = w || 640;
      const fh = h || 300;
      const L = x - fw / 2;
      const T = y - fh / 2;
      const v = new Container();
      if (t.style === 'hiphop') {
        // A round battle mat of cardboard and lino, taped down, with a ring of floor lights.
        const R = Math.min(fw, fh * 1.6) / 2;
        v.addChild(
          propSprite(x, y, R * 2 + 40, R * 1.3 + 40, R + 20, R * 0.65 + 20, (c) => {
            shadow(c, 0, 4, R + 6, R * 0.62 + 4, 0.4);
            ellipse(c, 0, 0, R, R * 0.62);
            fillInk(c, vgrad(c, -R * 0.62, R * 0.62, 0x9a7a4a, 0.25, 0.25), 2);
            // Lino squares with seams and gaffer tape.
            c.save();
            ellipse(c, 0, 0, R, R * 0.62);
            c.clip();
            for (let gx = -R; gx < R; gx += 70) {
              c.fillStyle = 'rgba(40,24,10,0.35)';
              c.fillRect(gx, -R, 2, R * 2);
            }
            ellipse(c, 0, 0, R * 0.72, R * 0.45);
            c.fillStyle = '#26262e';
            c.fill();
            for (let gx = -R; gx < R; gx += 50) {
              c.fillStyle = 'rgba(255,255,255,0.06)';
              c.fillRect(gx, -R, 1.5, R * 2);
            }
            for (let k = 0; k < 8; k++) {
              c.save();
              c.rotate((k / 8) * Math.PI * 2);
              c.fillStyle = 'rgba(200,200,190,0.75)';
              c.fillRect(R * 0.68, -5, R * 0.26, 10);
              c.restore();
            }
            c.font = `900 26px ${FONT_BODY}`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.save();
            c.scale(1, 0.62);
            c.fillStyle = '#ffd23f';
            c.strokeStyle = '#140a14';
            c.lineWidth = 5;
            c.strokeText('CYPHER', 0, 0);
            c.fillText('CYPHER', 0, 0);
            c.restore();
            c.restore();
          }),
        );
        const ring = new Graphics();
        v.addChild(ring);
        return [
          {
            view: v,
            layer: 'floor',
            obstacles: [],
            update: (time) => {
              const b = beatNow(time);
              ring.clear();
              for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                const on = (i + Math.floor(b * 2)) % 4 === 0;
                const px = x + Math.cos(a) * (R + 8);
                const py = y + Math.sin(a) * (R * 0.62 + 6);
                ring.circle(px, py, 3).fill({ color: on ? 0xffd23f : 0x5a4a2a, alpha: on ? 1 : 0.7 });
                if (on) ring.circle(px, py, 9).fill({ color: 0xffd23f, alpha: 0.18 });
              }
            },
          },
        ];
      }
      const tech = t.style === 'techno';
      const cols = Math.max(3, Math.round(fw / (tech ? 56 : 64)));
      const rows = Math.max(2, Math.round(fh / (tech ? 44 : 48)));
      const tw = fw / cols;
      const th = fh / rows;
      v.addChild(
        propSprite(x, y, fw + 40, fh + 40, fw / 2 + 20, fh / 2 + 20, (c) => {
          shadow(c, 0, fh / 2, fw * 0.55, 18, 0.4);
          rrect(c, -fw / 2 - 8, -fh / 2 - 8, fw + 16, fh + 16, 6);
          fillInk(c, tech ? '#2a2a30' : chrome(c, -fw / 2, -fh / 2, fw / 2, fh / 2), 2);
          for (let i = 0; i < cols; i++)
            for (let j = 0; j < rows; j++) {
              const tx = -fw / 2 + i * tw;
              const ty = -fh / 2 + j * th;
              rrect(c, tx + 1.5, ty + 1.5, tw - 3, th - 3, tech ? 1 : 4);
              const g = c.createLinearGradient(tx, ty, tx + tw, ty + th);
              g.addColorStop(0, tech ? '#1e1e24' : '#2a2238');
              g.addColorStop(1, tech ? '#0e0e12' : '#0e0a18');
              c.fillStyle = g;
              c.fill();
              c.strokeStyle = tech ? 'rgba(120,120,130,0.4)' : 'rgba(255,255,255,0.12)';
              c.lineWidth = 1;
              c.stroke();
              if (tech) {
                // Steel chequer plate.
                for (let a = 0; a < 6; a++) {
                  c.save();
                  c.translate(tx + 8 + (a % 3) * (tw / 3), ty + 10 + Math.floor(a / 3) * (th / 2));
                  c.rotate(a % 2 ? 0.7 : -0.7);
                  c.fillStyle = 'rgba(200,200,210,0.12)';
                  c.fillRect(-5, -1, 10, 2);
                  c.restore();
                }
              } else {
                c.fillStyle = 'rgba(255,255,255,0.06)';
                c.fillRect(tx + 4, ty + 4, tw * 0.4, 2);
              }
            }
        }),
      );
      const tiles = new Container();
      v.addChild(tiles);
      const tex = tileTexture(Math.round(tw), Math.round(th));
      const sprites: Sprite[] = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const s = addSprite(tiles, tex, L + i * tw + tw / 2, T + j * th + th / 2);
          s.blendMode = 'add';
          s.alpha = 0;
          sprites.push(s);
        }
      const pool = glow(v, x, y, fw * 1.3, fh * 1.4, MAGENTA, 0.15);
      pool.blendMode = 'add';
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      return [
        {
          view: v,
          layer: 'floor',
          obstacles: [],
          update: (time) => {
            const b = beatNow(time);
            const k = kickOf(b);
            const fb = Math.floor(b);
            const drop = fresh(clubShow.dropAt, 6);
            const pattern = tech ? 4 + (Math.floor(b / 16) % 2) : Math.floor(b / 16) % 4;
            const sd = seeded(fb * 7 + 1);
            const rand = sprites.map(() => sd());
            for (let j = 0; j < rows; j++)
              for (let i = 0; i < cols; i++) {
                const s = sprites[j * cols + i];
                let a = 0;
                let col = pal(i + j);
                switch (pattern) {
                  case 0:
                    a = (i + j + fb) % 2 ? k : 0.06;
                    break;
                  case 1: {
                    const dd = Math.hypot(i - cx, (j - cy) * 1.4);
                    a = Math.max(0, Math.cos(dd * 0.9 - b * Math.PI)) ** 3;
                    col = pal(Math.floor(dd - b));
                    break;
                  }
                  case 2:
                    a = i === Math.floor(b * 2) % cols || cols - 1 - i === Math.floor(b * 2) % cols ? 1 : 0.05 + 0.1 * k;
                    col = pal(Math.floor(b / 2));
                    break;
                  case 3:
                    a = rand[j * cols + i] < 0.3 ? k : 0.05;
                    break;
                  case 4:
                    // Techno: a red bar runs across on every beat.
                    a = Math.abs(i - (b % 1) * cols) < 1 ? 0.9 : 0.04;
                    col = 0xff2040;
                    break;
                  default:
                    a = (j + fb) % rows === 0 ? k : 0.04;
                    col = 0xffffff;
                }
                s.alpha = Math.min(1, a * (calm ? 0.55 : 0.85) + drop * 0.25);
                s.tint = col;
              }
            pool.alpha = 0.1 + 0.12 * k;
            pool.tint = tech ? 0xff2040 : pal(Math.floor(b / 4));
          },
        },
      ];
    }

    // ---- Stacked speaker cabinets, cones pumping with the kick.
    case 'speakerStack': {
      const s = w || 1;
      const v = new Container();
      const W = 92 * s;
      const cones: { sp: Sprite; base: number }[] = [];
      v.addChild(
        propSprite(x, y, W + 40, 220 * s, W / 2 + 20, 196 * s, (c) => {
          shadow(c, 0, 8, W * 0.6, 14, 0.6);
          // Sub, then two mid-tops; front faces at y from the floor up.
          cabinet(c, -W / 2, -64 * s, W, 70 * s, 12 * s);
          cabinet(c, -W / 2 + 4, -132 * s, W - 8, 56 * s, 10 * s);
          cabinet(c, -W / 2 + 8, -186 * s, W - 16, 42 * s, 8 * s);
          // Horn on the top box and a logo plate.
          rrect(c, -W * 0.28, -178 * s, W * 0.56, 22 * s, 4);
          fillInk(c, '#0c0c12', 1.2);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = 'rgba(255,255,255,0.06)';
            c.fillRect(-W * 0.26, -176 * s + k * 5 * s, W * 0.52, 1);
          }
          rrect(c, -16, -14 * s, 32, 7, 2);
          c.fillStyle = chrome(c, -16, 0, 16, 0);
          c.fill();
          // Steel straps.
          c.fillStyle = 'rgba(160,170,190,0.5)';
          c.fillRect(-W / 2 + 2, -134 * s, 3, 72 * s);
          c.fillRect(W / 2 - 5, -134 * s, 3, 72 * s);
        }),
      );
      for (const [cx2, cy2, r] of [[-W * 0.24, -30 * s, 17 * s], [W * 0.24, -30 * s, 17 * s], [0, -104 * s, 16 * s]] as const) {
        const sp = addSprite(v, coneTexture(Math.round(r)), x + cx2, y + cy2);
        cones.push({ sp, base: 1 });
      }
      const gl = glow(v, x, y - 30 * s, W * 1.8, 80, MAGENTA, 0.0);
      return [
        ent(v, [box(x, y - 4, W, 40)], y + 6, (time) => {
          const b = beatNow(time);
          const k = kickOf(b) * (calm ? 0.5 : 1) + fresh(clubShow.boostAt, 3) * 0.6;
          for (const c of cones) c.sp.scale.set(1 + k * 0.09);
          gl.alpha = k * 0.12;
          gl.tint = pal(Math.floor(b / 4));
        }),
      ];
    }

    // ---- Neon bar with backlit bottles, a slushie machine and a bartender.
    case 'clubBar': {
      const bw = w || 360;
      const bh = h || 70;
      const H = 48;
      const by = bh / 2;
      const topY = by - H - bh * 0.7;
      const backTop = topY - 112;
      const v = new Container();
      const neon = t.neon;
      v.addChild(
        propSprite(x, y, bw + 60, -backTop + by + 70, bw / 2 + 30, -backTop + 40, (c) => {
          shadow(c, 0, by, bw * 0.58, 20, 0.65);
          // Back bar: glowing glass shelves.
          const bx = -bw / 2 + 14;
          const bwid = bw - 28;
          rrect(c, bx, backTop, bwid, 116, 6);
          fillInk(c, '#0e0c16', 2.2);
          c.save();
          rrect(c, bx + 6, backTop + 6, bwid - 12, 104, 4);
          c.clip();
          const lg = c.createLinearGradient(bx, 0, bx + bwid, 0);
          lg.addColorStop(0, rgb(MAGENTA, 0.5));
          lg.addColorStop(0.5, rgb(VIOLET, 0.45));
          lg.addColorStop(1, rgb(CYAN, 0.5));
          c.fillStyle = lg;
          c.fillRect(bx, backTop, bwid, 116);
          c.fillStyle = 'rgba(8,4,14,0.45)';
          c.fillRect(bx, backTop, bwid, 116);
          for (const sy of [backTop + 46, backTop + 96]) {
            let px = bx + 14;
            while (px < bx + bwid - 50) {
              const bwd = 7 + rnd() * 4;
              const bht = 18 + rnd() * 12;
              const col = [0xff6b5f, 0x7bd47b, 0xffd23f, 0x9fe8ff, 0xff9ac0, 0xc9a0ff][Math.floor(rnd() * 6)];
              rrect(c, px, sy - bht, bwd, bht, 2);
              c.fillStyle = rgb(col, 0.75);
              c.fill();
              c.strokeStyle = 'rgba(0,0,0,0.6)';
              c.lineWidth = 1;
              c.stroke();
              c.fillRect(px + bwd / 2 - 1.5, sy - bht - 6, 3, 6);
              c.fillStyle = 'rgba(255,255,255,0.5)';
              c.fillRect(px + 1.5, sy - bht + 3, 1.4, bht - 6);
              px += bwd + 4 + rnd() * 3;
            }
            c.fillStyle = 'rgba(220,240,255,0.7)';
            c.fillRect(bx + 6, sy, bwid - 12, 2.5);
            glowAt(c, 0, sy, bwid * 0.5, 8, 0xffffff, 0.3, 'lighter');
          }
          c.restore();
          // "BAR" in neon on top.
          c.font = `900 24px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.save();
          c.shadowColor = rgb(neon);
          c.shadowBlur = 16;
          c.lineWidth = 3;
          c.strokeStyle = rgb(neon);
          c.strokeText(t.barLabel ?? 'BAR', 0, backTop - 14);
          c.fillStyle = rgb(light(neon, 0.8));
          c.fillText(t.barLabel ?? 'BAR', 0, backTop - 14);
          c.restore();
          // Slushie machine (its tanks swirl on top).
          const sx = bx + bwid - 44;
          rrect(c, sx - 4, backTop + 58, 44, 44, 4);
          fillInk(c, '#d8dce6', 1.4);
        }),
      );
      // Slushie swirl and the bartender, between the back bar and the counter.
      const swirl = new Graphics();
      const tender = new Chibi(0xffcf7a, { skin: 0xc68a5e, hair: 0xb3402a, hairStyle: 'bun', outfit: 'dress', jacket: 0x14141c, accessory: 'none' });
      tender.view.position.set(x - bw * 0.12, y + topY + 10);
      v.addChild(swirl, tender.view);
      v.addChild(
        propSprite(x, y, bw + 60, -backTop + by + 70, bw / 2 + 30, -backTop + 40, (c) => {
          // Counter: black gloss front with a lit lip, white quartz top.
          rrect(c, -bw / 2, by - H, bw, H, 8);
          fillInk(c, vgrad(c, by - H, by, 0x18141f, 0.1, 0.5), 2.6);
          for (let k = 0; k < Math.round(bw / 40); k++) {
            const px = -bw / 2 + 20 + k * 40;
            c.fillStyle = 'rgba(255,255,255,0.05)';
            c.fillRect(px, by - H + 6, 1.5, H - 14);
          }
          rrect(c, -bw / 2 - 6, topY, bw + 12, bh * 0.7 + 4, 6);
          const tg = c.createLinearGradient(-bw / 2, topY, bw / 2, topY + bh * 0.7);
          tg.addColorStop(0, '#ffffff');
          tg.addColorStop(1, '#b8bccc');
          fillInk(c, tg, 2.2);
          glowAt(c, 0, topY + bh * 0.3, bw * 0.5, bh * 0.4, neon, 0.18, 'lighter');
          // Things on the counter: glasses with straws, a shaker, a lemon bowl, a tip jar.
          for (let k = 0; k < 4; k++) {
            const gx = -bw / 2 + 50 + k * ((bw - 100) / 3) + (rnd() - 0.5) * 20;
            const gy = topY + 10 + rnd() * 12;
            rrect(c, gx - 5, gy - 14, 10, 14, 2);
            c.fillStyle = rgb([0xff6b5f, 0x7bd47b, 0x3fe8ff, 0xffd23f][k], 0.75);
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.8)';
            c.lineWidth = 1;
            c.stroke();
            c.beginPath();
            c.moveTo(gx + 1, gy - 12);
            c.lineTo(gx + 6, gy - 22);
            c.strokeStyle = k % 2 ? '#ff3fb4' : '#3fe8ff';
            c.lineWidth = 1.6;
            c.stroke();
          }
          rrect(c, -bw / 2 + 18, topY + 8, 12, 18, 3);
          fillInk(c, chrome(c, -bw / 2 + 18, 0, -bw / 2 + 30, 0), 1.2);
        }),
      );
      const lip = glow(v, x, y + by - 2, bw * 1.15, 34, neon, 0.5);
      const ph = rnd() * 10;
      const sx = x - bw / 2 + 14 + (bw - 28) - 44;
      return [
        ent(v, [box(x, y, bw, bh)], y + by, (time) => {
          const b = beatNow(time);
          tender.update(16, null);
          const shake = fresh(clubShow.boostAt, 1.5);
          tender.view.x = x - bw * 0.12 + Math.sin(time * 0.4 + ph) * bw * 0.25;
          tender.view.rotation = Math.sin(time * 30) * 0.05 * shake;
          swirl.clear();
          for (let k = 0; k < 2; k++) {
            const tx = sx + 6 + k * 18;
            const ty = y + backTop + 62;
            swirl.roundRect(tx, ty, 14, 30, 4).fill({ color: k ? 0x3fe8ff : 0xff3fb4, alpha: 0.85 });
            const sy2 = ty + 4 + ((time * 14 + k * 9) % 22);
            swirl.rect(tx + 2, sy2, 10, 2).fill({ color: 0xffffff, alpha: 0.5 });
          }
          lip.alpha = 0.35 + 0.15 * kickOf(b);
        }, () => void (clubShow.boostAt = performance.now())),
      ];
    }

    // ---- A curved velvet booth with a table, an ice bucket and a sparkler.
    case 'vipBooth': {
      const bw = w || 220;
      const v = new Container();
      const col = t.sofa ?? 0x5a1a6a;
      v.addChild(
        propSprite(x, y, bw + 60, 230, bw / 2 + 30, 175, (c) => {
          shadow(c, 0, 10, bw * 0.6, bw * 0.3, 0.6);
          // A horseshoe booth seen from above: back along the far edge, seat ring, open front.
          const R = bw / 2;
          const Ry = bw * 0.3;
          const SH = 18;
          const BH = 50;
          const a0 = Math.PI * 0.78;
          const a1 = Math.PI * 2.22;
          const pt = (a: number, rx: number, ry: number, dy: number): [number, number] => [Math.cos(a) * rx, Math.sin(a) * ry + dy];
          const arc = (rx: number, ry: number, dy: number, from: number, to: number, first: boolean) => {
            const n = 40;
            for (let k = 0; k <= n; k++) {
              const [px, py] = pt(from + ((to - from) * k) / n, rx, ry, dy);
              if (k === 0 && first) c.moveTo(px, py);
              else c.lineTo(px, py);
            }
          };
          // Backrest: a tufted band standing on the outer edge.
          c.beginPath();
          arc(R, Ry, -SH - BH, a0, a1, true);
          arc(R, Ry, -SH, a1, a0, false);
          c.closePath();
          fillInk(c, vgrad(c, -Ry - SH - BH, Ry, col, 0.3, 0.3), 2.4);
          for (let k = 1; k < 14; k++) {
            const a = a0 + ((a1 - a0) * k) / 14;
            for (const f of [0.35, 0.7]) {
              const [px, py] = pt(a, R, Ry, -SH - BH * f);
              ellipse(c, px, py, 1.8, 1.5);
              c.fillStyle = rgb(dark(col, 0.55));
              c.fill();
            }
          }
          c.beginPath();
          arc(R, Ry, -SH - BH, a0, a1, true);
          c.strokeStyle = gold(c, -R, -Ry - SH - BH, R, -SH);
          c.lineWidth = 3;
          c.stroke();
          // Seat ring.
          c.beginPath();
          arc(R, Ry, -SH, a0, a1, true);
          arc(R - 36, Ry - 22, -SH, a1, a0, false);
          c.closePath();
          fillInk(c, vgrad(c, -Ry - SH, Ry, light(col, 0.12), 0.35, 0.2), 2);
          // Skirts: the outer front ends and the inner face below the seat.
          for (const [f, t2] of [[a0, Math.PI], [Math.PI * 2, a1]] as const) {
            c.beginPath();
            arc(R, Ry, -SH, f, t2, true);
            arc(R, Ry, 0, t2, f, false);
            c.closePath();
            fillInk(c, rgb(dark(col, 0.35)), 1.6);
          }
          c.beginPath();
          arc(R - 36, Ry - 22, -SH, Math.PI, Math.PI * 2, true);
          arc(R - 36, Ry - 22, -SH + 12, Math.PI * 2, Math.PI, false);
          c.closePath();
          fillInk(c, rgb(dark(col, 0.45)), 1.4);
          // VIP plate on top of the back.
          const vy = -Ry - SH - BH - 12;
          rrect(c, -24, vy - 9, 48, 18, 4);
          fillInk(c, '#120a18', 1.4);
          c.font = `900 13px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.save();
          c.shadowColor = '#ffd23f';
          c.shadowBlur = 10;
          c.fillStyle = '#ffe9a0';
          c.fillText('VIP', 0, vy + 0.5);
          c.restore();
          // Round table with an ice bucket and glasses.
          ellipse(c, 0, 18, 6, 4);
          c.fillStyle = '#2a2a34';
          c.fill();
          c.fillStyle = chrome(c, -3, 0, 3, 0);
          c.fillRect(-3, -4, 6, 22);
          ellipse(c, 0, -6, 40, 14);
          fillInk(c, vgrad(c, -20, 8, 0x1a1a22, 0.3, 0.2), 1.8);
          ellipse(c, 0, -8, 38, 12);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fill();
          // Bucket.
          c.beginPath();
          c.moveTo(-12, -24);
          c.lineTo(-9, -8);
          c.lineTo(9, -8);
          c.lineTo(12, -24);
          c.closePath();
          fillInk(c, chrome(c, -12, 0, 12, 0), 1.3);
          ellipse(c, 0, -24, 12, 4);
          fillInk(c, '#dff6ff', 1);
          c.save();
          c.translate(3, -26);
          c.rotate(0.3);
          rrect(c, -4, -22, 8, 24, 3);
          fillInk(c, '#1a3a2a', 1.2);
          c.fillStyle = gold(c, -4, -22, 4, -16);
          c.fillRect(-4, -22, 8, 6);
          c.restore();
          for (const gx of [-28, 24]) {
            c.beginPath();
            c.moveTo(gx - 3, -18);
            c.lineTo(gx + 3, -18);
            c.lineTo(gx + 1.5, -8);
            c.lineTo(gx - 1.5, -8);
            c.closePath();
            fillInk(c, 'rgba(255,220,140,0.85)', 1);
          }
          // LED underglow.
          glowAt(c, 0, bw * 0.3, bw * 0.6, 18, t.neon, 0.4, 'lighter');
        }),
      );
      const sparks = new Graphics();
      v.addChild(sparks);
      const gl = glow(v, x + 9, y - 52, 60, 60, 0xffd23f, 0);
      let pokeAt = -1e9;
      return [
        ent(v, [box(x, y - 6, bw, bw * 0.5)], y + bw * 0.3, (time) => {
          const k = fresh(pokeAt, 3);
          sparks.clear();
          gl.alpha = k * 0.6;
          if (k > 0)
            for (let i = 0; i < 18; i++) {
              const e = (time * 2 + i / 18) % 1;
              const a = (i / 18) * Math.PI * 2;
              sparks.circle(x + 9 + Math.cos(a) * e * 16, y - 52 - e * 18 + Math.sin(a) * e * 10, 1.4).fill({ color: 0xfff6c0, alpha: k * (1 - e) });
            }
        }, () => void (pokeAt = performance.now())),
      ];
    }

    // ---- Front-of-house light desk: faders, screens, a gooseneck lamp.
    case 'lightDesk': {
      const v = new Container();
      const dw = w || 140;
      v.addChild(
        propSprite(x, y, dw + 40, 120, dw / 2 + 20, 90, (c) => {
          shadow(c, 0, 20, dw * 0.6, 14, 0.6);
          // Flight case on legs.
          for (const lx of [-dw / 2 + 10, dw / 2 - 10]) {
            c.fillStyle = '#2a2a34';
            c.fillRect(lx - 3, -6, 6, 26);
          }
          rrect(c, -dw / 2, -26, dw, 26, 4);
          fillInk(c, vgrad(c, -26, 0, 0x2a2a34, 0.1, 0.4), 2);
          c.fillStyle = chrome(c, 0, -26, 0, -22);
          c.fillRect(-dw / 2 + 2, -26, dw - 4, 3);
          // Console top.
          c.beginPath();
          c.moveTo(-dw / 2, -26);
          c.lineTo(-dw / 2 + 6, -56);
          c.lineTo(dw / 2 - 6, -56);
          c.lineTo(dw / 2, -26);
          c.closePath();
          fillInk(c, '#1c1c24', 2);
          for (let k = 0; k < 12; k++) {
            const fx = -dw / 2 + 14 + k * ((dw - 28) / 11);
            c.fillStyle = '#060608';
            c.fillRect(fx - 0.8, -50, 1.6, 18);
            rrect(c, fx - 3, -46 + ((k * 7) % 12), 6, 4, 1);
            c.fillStyle = ['#ff3fb4', '#3fe8ff', '#ffd23f', '#e8e8f0'][k % 4];
            c.fill();
          }
          // Two screens.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(s * 22 - 20, -58);
            c.lineTo(s * 22 + 20, -58);
            c.lineTo(s * 22 + 18, -86);
            c.lineTo(s * 22 - 18, -86);
            c.closePath();
            fillInk(c, '#0a0a10', 1.6);
            const sg = c.createLinearGradient(0, -84, 0, -60);
            sg.addColorStop(0, s < 0 ? '#2a4a8a' : '#4a1a5a');
            sg.addColorStop(1, '#0a0a18');
            c.fillStyle = sg;
            c.fillRect(s * 22 - 15, -83, 30, 22);
            c.beginPath();
            for (let k = 0; k < 28; k++) c.lineTo(s * 22 - 14 + k, -72 + Math.sin(k * 0.7 + s) * 6 * Math.sin(k * 0.2));
            c.strokeStyle = s < 0 ? '#3fe8ff' : '#ff3fb4';
            c.lineWidth = 1;
            c.stroke();
          }
          // Gooseneck lamp.
          c.beginPath();
          c.moveTo(dw / 2 - 12, -54);
          c.quadraticCurveTo(dw / 2 - 4, -80, dw / 2 - 20, -84);
          c.strokeStyle = '#3a3a48';
          c.lineWidth = 2;
          c.stroke();
          glowAt(c, dw / 2 - 20, -60, 24, 14, 0xffe0a0, 0.4, 'lighter');
        }),
      );
      const leds = new Graphics();
      v.addChild(leds);
      return [
        ent(v, [box(x, y - 8, dw, 40)], y + 14, (time) => {
          const b = beatNow(time);
          const f = Math.floor(b * 2);
          leds.clear();
          for (let k = 0; k < 12; k++) {
            const on = (k * 5 + f) % 7 < 2;
            leds.circle(x - dw / 2 + 14 + k * ((dw - 28) / 11), y - 52, 1.6).fill({ color: on ? pal(k) : 0x30303a });
          }
        }, () => void (clubShow.palette = (clubShow.palette + 1) % PALETTES.length)),
      ];
    }

    // ---- Chrome railing with an LED strip (chain-link fence in the bunker). r=1 runs along y.
    case 'railing': {
      const len = w || 200;
      const vert = (d.r ?? 0) % 2 === 1;
      const tech = t.style === 'techno';
      const RH = tech ? 70 : 38;
      const v = new Container();
      const pw = vert ? 40 : len + 20;
      const phh = vert ? len + RH + 30 : RH + 30;
      v.addChild(
        propSprite(x, y, pw, phh, pw / 2, vert ? len / 2 + 14 : 14, (c) => {
          const pts: [number, number][] = [];
          const n = Math.max(2, Math.round(len / 60) + 1);
          for (let k = 0; k < n; k++) {
            const p = -len / 2 + (k / (n - 1)) * len;
            pts.push(vert ? [0, p] : [p, 0]);
          }
          if (tech) {
            // Mesh panel.
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1]);
            c.lineTo(pts[n - 1][0], pts[n - 1][1]);
            c.lineTo(pts[n - 1][0], pts[n - 1][1] - RH);
            c.lineTo(pts[0][0], pts[0][1] - RH);
            c.closePath();
            c.save();
            c.clip();
            for (let k = -len - RH; k < len + RH; k += 8) {
              c.beginPath();
              c.moveTo(vert ? -10 : k, vert ? k : -RH);
              c.lineTo(vert ? 10 : k + RH, vert ? k + RH * 0.6 : 0);
              c.moveTo(vert ? 10 : k + RH, vert ? k : -RH);
              c.lineTo(vert ? -10 : k, vert ? k + RH * 0.6 : 0);
              c.strokeStyle = 'rgba(150,150,160,0.45)';
              c.lineWidth = 0.9;
              c.stroke();
            }
            c.restore();
          }
          // Posts and the top rail.
          for (const [px, py] of pts) {
            shadow(c, px + 2, py + 2, 6, 3, 0.5);
            c.fillStyle = chrome(c, px - 2, 0, px + 2, 0);
            c.fillRect(px - 2, py - RH, 4, RH);
            c.strokeStyle = INK;
            c.lineWidth = 0.8;
            c.strokeRect(px - 2, py - RH, 4, RH);
          }
          c.beginPath();
          c.moveTo(pts[0][0], pts[0][1] - RH);
          c.lineTo(pts[n - 1][0], pts[n - 1][1] - RH);
          c.strokeStyle = INK;
          c.lineWidth = 6;
          c.stroke();
          c.strokeStyle = tech ? '#6a6a74' : chrome(c, 0, -RH - 3, 0, -RH + 3);
          c.lineWidth = 4;
          c.stroke();
          if (!tech) {
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1] - RH * 0.45);
            c.lineTo(pts[n - 1][0], pts[n - 1][1] - RH * 0.45);
            c.strokeStyle = 'rgba(200,210,230,0.7)';
            c.lineWidth = 1.6;
            c.stroke();
          }
        }),
      );
      const strip = new Graphics();
      v.addChild(strip);
      const ob = vert ? { x: x - 7, y: y - len / 2, w: 14, h: len } : { x: x - len / 2, y: y - 7, w: len, h: 14 };
      return [
        ent(v, [ob], y + (vert ? len / 2 : 4), (time) => {
          const b = beatNow(time);
          strip.clear();
          const n = Math.round(len / 14);
          for (let k = 0; k < n; k++) {
            const p = -len / 2 + (k + 0.5) * (len / n);
            const on = (k + Math.floor(b * 4)) % 6 < 2;
            const px = x + (vert ? 0 : p);
            const py = y + (vert ? p : 0) - 4;
            strip.circle(px, py, 1.8).fill({ color: tech ? 0xff2040 : pal(k >> 2), alpha: on ? 1 : 0.35 });
          }
        }),
      ];
    }

    // ---- A column wrapped in chasing LED rings.
    case 'ledPillar': {
      const R = 20;
      const H = 190;
      const v = new Container();
      v.addChild(
        propSprite(x, y, R * 2 + 40, H + 40, R + 20, H + 20, (c) => {
          shadow(c, 3, 4, R + 12, 8, 0.6);
          c.beginPath();
          c.moveTo(-R, -H);
          c.lineTo(-R, 0);
          c.ellipse(0, 0, R, R * 0.42, 0, Math.PI, 0, true);
          c.lineTo(R, -H);
          c.closePath();
          const g = c.createLinearGradient(-R, 0, R, 0);
          g.addColorStop(0, '#3a3448');
          g.addColorStop(0.3, '#1c1826');
          g.addColorStop(1, '#08060e');
          fillInk(c, g, 2);
          c.fillStyle = 'rgba(255,255,255,0.12)';
          c.fillRect(-R + 4, -H, 3, H);
        }),
      );
      const rings = new Graphics();
      v.addChild(rings);
      return [
        ent(v, [box(x, y, R * 2, 22)], y + 8, (time) => {
          const b = beatNow(time);
          rings.clear();
          for (let k = 0; k < 9; k++) {
            const ry = y - 14 - k * 20;
            const on = (k + Math.floor(b * 2)) % 9;
            const a = on < 3 ? 1 - on / 3 : 0.12;
            rings.ellipse(x, ry, R + 0.5, R * 0.42).stroke({ color: pal(k), width: 2.2, alpha: a });
            if (a > 0.5) rings.ellipse(x, ry, R + 6, R * 0.42 + 4).stroke({ color: pal(k), width: 4, alpha: 0.18 });
          }
        }),
      ];
    }

    // ---- Fog machine: a little box breathing haze; a burst when used.
    case 'fogMachine': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 80, 60, 40, 40, (c) => {
          shadow(c, 0, 6, 30, 8, 0.6);
          rrect(c, -24, -26, 48, 28, 4);
          fillInk(c, vgrad(c, -26, 2, 0x2a2a34, 0.2, 0.3), 1.8);
          for (let k = 0; k < 5; k++) {
            c.fillStyle = '#0a0a10';
            c.fillRect(-18 + k * 6, -20, 3, 14);
          }
          rrect(c, 20, -18, 14, 10, 3);
          fillInk(c, '#3a3a48', 1.2);
          ellipse(c, -14, -30, 7, 3);
          fillInk(c, '#4a4a58', 1);
          c.fillStyle = '#ff3040';
          c.fillRect(10, -22, 4, 3);
        }),
      );
      const haze = new Container();
      const puffs = Array.from({ length: 10 }, (_, i) => {
        const s = addSprite(haze, glowTexture(), x, y);
        s.tint = t.style === 'techno' ? 0xb8a8c8 : 0xc8b8e8;
        return { s, ph: i / 10 };
      });
      return [
        ent(v, [box(x, y - 10, 50, 26)], y + 4, (time) => {
          const k = fresh(clubShow.fogAt, 5);
          for (const p of puffs) {
            const e = (time * (0.06 + k * 0.08) + p.ph) % 1;
            p.s.position.set(x + 30 + e * (160 + k * 160) + Math.sin(time * 0.5 + p.ph * 9) * 20, y - 16 - e * 40);
            const size = 60 + e * (220 + k * 220);
            p.s.width = size;
            p.s.height = size * 0.6;
            p.s.alpha = Math.sin(e * Math.PI) * (0.1 + k * 0.25);
          }
        }, () => void (clubShow.fogAt = performance.now())),
        { view: haze, layer: 'lights', obstacles: [] },
      ];
    }

    // ---- Two turntables and a mixer on a flight case, a crate of records, a DJ.
    case 'turntables': {
      const tw = w || 170;
      const v = new Container();
      const dj = new Chibi(0xffd23f, { skin: 0x6b4127, hair: 0x1b1b22, hairStyle: 'short', outfit: 'suit', jacket: 0xb8862f, accessory: 'none' });
      dj.view.position.set(x, y - 26);
      v.addChild(dj.view);
      const cap = new Graphics();
      cap.ellipse(0, -90, 17, 9).fill(0xc8242a).stroke({ color: 0x14080f, width: 1.2 });
      cap.ellipse(-13, -86, 12, 4).fill(0xa01a20).stroke({ color: 0x14080f, width: 1 });
      dj.view.addChild(cap);
      v.addChild(
        propSprite(x, y, tw + 120, 110, tw / 2 + 80, 80, (c) => {
          shadow(c, 0, 20, tw * 0.6, 14, 0.6);
          // Flight case on trestles.
          for (const lx of [-tw / 2 + 14, tw / 2 - 14]) {
            c.beginPath();
            c.moveTo(lx - 10, 20);
            c.lineTo(lx, -14);
            c.lineTo(lx + 10, 20);
            c.strokeStyle = '#2a2a34';
            c.lineWidth = 3;
            c.stroke();
          }
          rrect(c, -tw / 2, -26, tw, 20, 3);
          fillInk(c, vgrad(c, -26, -6, 0x1a1a22, 0.1, 0.4), 2);
          for (const ex of [-tw / 2, tw / 2 - 8]) {
            c.fillStyle = chrome(c, ex, 0, ex + 8, 0);
            c.fillRect(ex, -26, 8, 20);
          }
          rrect(c, -tw / 2, -50, tw, 26, 4);
          fillInk(c, '#22222c', 2);
          // Decks.
          for (const s of [-1, 1]) {
            const px = s * (tw / 2 - 40);
            rrect(c, px - 34, -50, 68, 24, 3);
            fillInk(c, chrome(c, px - 34, -50, px + 34, -26), 1.2);
            ellipse(c, px - 4, -38, 24, 9);
            fillInk(c, '#0c0c10', 1.2);
            for (const rr of [20, 15, 10]) {
              ellipse(c, px - 4, -38, rr, rr * 0.37);
              c.strokeStyle = 'rgba(255,255,255,0.08)';
              c.lineWidth = 1;
              c.stroke();
            }
            ellipse(c, px - 4, -38, 6, 2.4);
            c.fillStyle = s < 0 ? '#ffd23f' : '#ff3fb4';
            c.fill();
            // Tonearm.
            c.beginPath();
            c.moveTo(px + 26, -46);
            c.lineTo(px + 22, -34);
            c.lineTo(px + 10, -32);
            c.strokeStyle = '#d8dce6';
            c.lineWidth = 1.8;
            c.stroke();
          }
          rrect(c, -14, -50, 28, 24, 2);
          fillInk(c, '#2a2a34', 1.2);
          for (let k = 0; k < 3; k++) {
            c.fillStyle = '#e8e8f0';
            c.fillRect(-10 + k * 8, -46 + k * 3, 5, 3);
          }
          c.fillStyle = '#e8e8f0';
          c.fillRect(-9, -31, 18, 2.5);
          // Crate of records beside it.
          const cx = tw / 2 + 36;
          rrect(c, cx - 24, -28, 48, 34, 3);
          fillInk(c, vgrad(c, -28, 6, 0xd8a02a, 0.2, 0.3), 1.6);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = 'rgba(0,0,0,0.35)';
            c.fillRect(cx - 20, -22 + k * 7, 40, 3);
          }
          for (let k = 0; k < 7; k++) {
            rrect(c, cx - 20 + k * 6, -46 + (k % 2) * 2, 4, 22, 1);
            c.fillStyle = ['#ff3fb4', '#3fe8ff', '#ffd23f', '#1a1a22', '#7bd47b', '#e8e8f0', '#ff6b2f'][k];
            c.fill();
          }
        }),
      );
      const recs = new Graphics();
      v.addChild(recs);
      return [
        ent(v, [box(x + 30, y - 14, tw + 80, 44)], y + 10, (time) => {
          const b = beatNow(time);
          const sc = fresh(clubShow.scratchAt, 1.2);
          dj.update(16, null);
          dj.view.y = y - 26 - kickOf(b) * 3;
          recs.clear();
          for (const s of [-1, 1]) {
            const px = x + s * (tw / 2 - 40) - 4;
            const a = time * 3.5 * (sc > 0 && s < 0 ? -Math.sign(Math.sin(time * 18)) * 2 : 1);
            recs.circle(px + Math.cos(a) * 16, y - 38 + Math.sin(a) * 6, 1.6).fill({ color: 0xffffff, alpha: 0.85 });
          }
        }, () => void (clubShow.scratchAt = performance.now())),
      ];
    }

    // ---- A big boombox on milk crates.
    case 'boombox': {
      const v = new Container();
      const BW = 130;
      v.addChild(
        propSprite(x, y, BW + 50, 170, BW / 2 + 25, 130, (c) => {
          shadow(c, 0, 18, 56, 12, 0.6);
          // Milk crates.
          for (const [cx, cy, col] of [[-30, 0, 0x2a6ae8], [30, 0, 0xe83a2a], [0, -44, 0xffc42a]] as const) {
            rrect(c, cx - 30, cy - 42, 60, 42, 3);
            fillInk(c, vgrad(c, cy - 42, cy, col, 0.2, 0.35), 1.8);
            for (let i = 0; i < 4; i++)
              for (let j = 0; j < 3; j++) {
                rrect(c, cx - 25 + i * 13, cy - 36 + j * 12, 9, 8, 2);
                c.fillStyle = rgb(dark(col, 0.5));
                c.fill();
              }
          }
          // Boombox body on top.
          const by = -86;
          c.beginPath();
          c.moveTo(-BW / 2 + 30, by - 50);
          c.lineTo(-BW / 2 + 36, by - 66);
          c.lineTo(BW / 2 - 36, by - 66);
          c.lineTo(BW / 2 - 30, by - 50);
          c.strokeStyle = '#2a2a34';
          c.lineWidth = 5;
          c.stroke();
          rrect(c, -BW / 2, by - 50, BW, 54, 8);
          fillInk(c, chrome(c, -BW / 2, by - 50, BW / 2, by + 4), 2.2);
          rrect(c, -BW / 2 + 4, by - 46, BW - 8, 46, 6);
          c.fillStyle = '#1a1a22';
          c.fill();
          // Cassette deck and a little EQ.
          rrect(c, -20, by - 42, 40, 22, 3);
          fillInk(c, '#3a3a48', 1.2);
          rrect(c, -15, by - 38, 30, 13, 2);
          c.fillStyle = 'rgba(160,200,255,0.4)';
          c.fill();
          for (const s of [-1, 1]) {
            ellipse(c, s * 7, by - 31.5, 3, 3);
            c.fillStyle = '#1a1a22';
            c.fill();
          }
          for (let k = 0; k < 6; k++) {
            c.fillStyle = k < 4 ? '#7bd47b' : '#ff3040';
            c.fillRect(-17 + k * 6, by - 16, 4, 3);
          }
          // Buttons on top and an antenna.
          for (let k = 0; k < 5; k++) {
            rrect(c, -18 + k * 8, by - 55, 6, 5, 1);
            c.fillStyle = '#c8ccd6';
            c.fill();
          }
          c.beginPath();
          c.moveTo(BW / 2 - 12, by - 50);
          c.lineTo(BW / 2 + 6, by - 112);
          c.strokeStyle = chrome(c, 0, 0, 2, 0);
          c.lineWidth = 2;
          c.stroke();
          ellipse(c, BW / 2 + 6, by - 112, 2.5, 2.5);
          c.fillStyle = '#c8ccd6';
          c.fill();
          c.font = `700 7px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#ffd23f';
          c.fillText('NEON BLASTER', 0, by - 2);
          // Speaker rings.
          for (const s of [-1, 1]) {
            ellipse(c, s * 40, by - 24, 21, 21);
            fillInk(c, chrome(c, s * 40 - 21, by - 45, s * 40 + 21, by - 3), 1.4);
          }
        }),
      );
      const cones = [-1, 1].map((s) => addSprite(v, coneTexture(17), x + s * 40, y - 86 - 24));
      const notes = new Graphics();
      v.addChild(notes);
      return [
        ent(v, [box(x, y - 20, 120, 44)], y + 4, (time) => {
          const b = beatNow(time);
          const boost = fresh(clubShow.boostAt, 4);
          const k = kickOf(b) * (0.5 + boost);
          for (const c of cones) c.scale.set(1 + k * 0.12);
          notes.clear();
          if (boost > 0)
            for (let i = 0; i < 4; i++) {
              const e = (time * 0.7 + i / 4) % 1;
              const nx = x + (i % 2 ? 1 : -1) * (40 + e * 30);
              const ny = y - 120 - e * 60;
              notes.circle(nx, ny, 3).fill({ color: 0xffd23f, alpha: boost * (1 - e) });
              notes.rect(nx + 2, ny - 12, 1.4, 12).fill({ color: 0xffd23f, alpha: boost * (1 - e) });
            }
        }, () => void (clubShow.boostAt = performance.now())),
      ];
    }

    // ---- A backlit wall of sneakers.
    case 'sneakerShelf': {
      const sw = w || 200;
      const SH = 150;
      const cols = Math.max(2, Math.round(sw / 52));
      const rows = 3;
      const v = new Container();
      v.addChild(
        propSprite(x, y, sw + 30, SH + 40, sw / 2 + 15, SH + 20, (c) => {
          shadow(c, 0, 4, sw * 0.55, 10, 0.6);
          rrect(c, -sw / 2, -SH, sw, SH, 4);
          fillInk(c, vgrad(c, -SH, 0, 0xf2eee6, 0.1, 0.25), 2.2);
          const cw = (sw - 12) / cols;
          const ch = (SH - 16) / rows;
          const cols2 = [0xff3fb4, 0x3fe8ff, 0xffd23f, 0x7bd47b, 0xff6b2f, 0xa06bff, 0xe8e8f0, 0x1a1a22];
          for (let i = 0; i < cols; i++)
            for (let j = 0; j < rows; j++) {
              const cx = -sw / 2 + 6 + i * cw;
              const cy = -SH + 6 + j * ch;
              rrect(c, cx + 2, cy + 2, cw - 4, ch - 4, 2);
              const g = c.createLinearGradient(0, cy, 0, cy + ch);
              g.addColorStop(0, '#fffaf0');
              g.addColorStop(1, '#c8c0b0');
              c.fillStyle = g;
              c.fill();
              glowAt(c, cx + cw / 2, cy + 6, cw * 0.5, 10, 0xffffff, 0.6, 'lighter');
              const k = Math.floor(rnd() * cols2.length);
              sneaker(c, cx + cw / 2, cy + ch - 6, cols2[k], cols2[(k + 3) % cols2.length], rnd() < 0.5);
            }
          c.font = `900 10px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#1a1a22';
          c.fillText('SNEAKER-WAND', 0, -SH - 4);
        }),
      );
      return [ent(v, [box(x, y - 14, sw, 30)], y + 2)];
    }

    // ---- Gold chains on a velvet bust in a glass case.
    case 'chainDisplay': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 110, 190, 55, 160, (c) => {
          shadow(c, 0, 6, 34, 10, 0.6);
          // Pedestal.
          rrect(c, -26, -50, 52, 52, 3);
          fillInk(c, vgrad(c, -50, 2, 0x1a1a22, 0.2, 0.4), 2);
          c.fillStyle = gold(c, -26, -52, 26, -46);
          c.fillRect(-26, -52, 52, 5);
          // Bust in black velvet.
          c.beginPath();
          c.moveTo(-22, -52);
          c.quadraticCurveTo(-22, -84, -8, -88);
          c.lineTo(-7, -104);
          c.quadraticCurveTo(0, -112, 7, -104);
          c.lineTo(8, -88);
          c.quadraticCurveTo(22, -84, 22, -52);
          c.closePath();
          fillInk(c, vgrad(c, -112, -52, 0x2a2232, 0.2, 0.4), 1.8);
          // Chains: thick links in loops, a moth pendant.
          for (const [ry, n] of [[18, 16], [24, 20]] as const) {
            for (let k = 0; k <= n; k++) {
              const a = (k / n) * Math.PI;
              const lx = Math.cos(a) * (ry - 4);
              const ly = -90 + Math.sin(a) * ry;
              ellipse(c, lx, ly, 2.6, 1.8);
              c.fillStyle = gold(c, lx - 3, ly - 2, lx + 3, ly + 2);
              c.fill();
              c.strokeStyle = 'rgba(80,50,10,0.7)';
              c.lineWidth = 0.6;
              c.stroke();
            }
          }
          for (const s of [-1, 1]) {
            ellipse(c, s * 5, -64, 5, 4);
            fillInk(c, gold(c, -10, -68, 10, -60), 1);
          }
          ellipse(c, 0, -63, 2, 4);
          fillInk(c, '#7a4e18', 0.8);
          // Glass case.
          rrect(c, -30, -150, 60, 100, 3);
          c.fillStyle = 'rgba(200,230,255,0.1)';
          c.fill();
          c.strokeStyle = 'rgba(230,245,255,0.6)';
          c.lineWidth = 1.5;
          c.stroke();
          c.beginPath();
          c.moveTo(-24, -146);
          c.lineTo(-14, -146);
          c.lineTo(-26, -110);
          c.closePath();
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fill();
          glowAt(c, 0, -100, 40, 50, 0xffe7a8, 0.25, 'lighter');
        }),
      );
      const glints = new Graphics();
      v.addChild(glints);
      const ph = rnd() * 10;
      let pokeAt = -1e9;
      return [
        ent(v, [box(x, y - 22, 56, 30)], y + 4, (time) => {
          const k = fresh(pokeAt, 2);
          glints.clear();
          for (let i = 0; i < 3; i++) {
            const a = 0.5 + 0.5 * Math.sin(time * 2.3 + i * 2.1 + ph);
            const gx = x + Math.cos(i * 1.1 + 0.4) * 18;
            const gy = y - 86 + Math.sin(i * 1.1 + 0.4) * 20;
            const r = 3 + a * 3 + k * 4;
            glints.moveTo(gx, gy - r).lineTo(gx + r * 0.25, gy).lineTo(gx, gy + r).lineTo(gx - r * 0.25, gy).closePath().fill({ color: 0xffffff, alpha: a * 0.9 });
            glints.moveTo(gx - r, gy).lineTo(gx, gy + r * 0.25).lineTo(gx + r, gy).lineTo(gx, gy - r * 0.25).closePath().fill({ color: 0xffffff, alpha: a * 0.9 });
          }
        }, () => void (pokeAt = performance.now())),
      ];
    }

    // ---- Neon art on the back wall. r picks the motif.
    case 'neonArt': {
      const s = w || 1;
      const motif = d.r ?? 0;
      const col = h || [MAGENTA, CYAN, VIOLET, 0xffd23f, 0xff2040, 0x7bff6a][motif % 6];
      const v = new Container();
      const texts = ['', 'DANCE', '', 'HIP HOP', 'TECHNO', 'BOOM BAP', 'LOVE'];
      const txt = texts[motif] ?? '';
      const tw = txt ? txt.length * 18 * s + 40 : 120 * s;
      const sp = propSprite(x, 26, tw + 40, 110 * s, (tw + 40) / 2, 0, (c) => {
        c.translate(0, 50 * s);
        if (txt) {
          c.font = `700 italic ${Math.round(30 * s)}px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.save();
          c.shadowColor = rgb(col);
          c.shadowBlur = 18;
          c.lineWidth = 4;
          c.strokeStyle = rgb(col);
          c.strokeText(txt, 0, 0);
          c.shadowBlur = 0;
          c.lineWidth = 1.4;
          c.strokeStyle = rgb(light(col, 0.85));
          c.strokeText(txt, 0, 0);
          c.restore();
          return;
        }
        c.scale(s, s);
        if (motif === 2) {
          // Three sound waves.
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            for (let p = -50; p <= 50; p += 2) c.lineTo(p, -18 + k * 18 + Math.sin(p * 0.12 + k) * (8 - k * 2));
            neonStroke(c, k === 1 ? CYAN : col, 3);
          }
          return;
        }
        // A moth outline.
        for (const sd of [-1, 1]) {
          c.beginPath();
          c.ellipse(sd * 22, -8, 22, 15, sd * 0.45, 0, Math.PI * 2);
          neonStroke(c, col, 3);
          c.beginPath();
          c.ellipse(sd * 15, 15, 12, 10, -sd * 0.4, 0, Math.PI * 2);
          neonStroke(c, col, 3);
        }
        c.beginPath();
        c.moveTo(0, -24);
        c.lineTo(0, 26);
        neonStroke(c, 0xffffff, 3);
        c.beginPath();
        c.moveTo(-2, -24);
        c.quadraticCurveTo(-10, -36, -18, -36);
        c.moveTo(2, -24);
        c.quadraticCurveTo(10, -36, 18, -36);
        neonStroke(c, col, 2);
      });
      v.addChild(sp);
      const gl = glow(v, x, 26 + 50 * s, tw * 1.6, 120 * s, col, 0.3);
      const ph = rnd() * 10;
      return [
        {
          view: v,
          layer: 'wall',
          obstacles: [],
          update: (time) => {
            // Mostly steady, with the odd flicker.
            const f = Math.sin(time * 23 + ph) > 0.985 ? 0.4 : 1;
            sp.alpha = f;
            gl.alpha = 0.22 * f + 0.06 * Math.sin(time * 1.7 + ph);
          },
        },
      ];
    }

    // ---- Laser projector on the wall: a fan of beams sweeping the room.
    case 'laser': {
      const col = (d.r ?? 0) % 2 ? 0xff2040 : 0x40ff70;
      const v = new Container();
      v.addChild(
        propSprite(x, 30, 50, 40, 25, 10, (c) => {
          rrect(c, -18, -6, 36, 22, 3);
          fillInk(c, vgrad(c, -6, 16, 0x2a2a34, 0.2, 0.3), 1.6);
          ellipse(c, 0, 12, 5, 3);
          c.fillStyle = rgb(col);
          c.fill();
          c.fillStyle = '#4a4a58';
          c.fillRect(-2, -14, 4, 8);
        }),
      );
      const beams = new Container();
      const lines = Array.from({ length: 9 }, () => {
        const s = addSprite(beams, laserTexture(), x, 42, 0.5, 0);
        s.blendMode = 'add';
        s.tint = col;
        s.scale.y = 1.4;
        return s;
      });
      const dot = glow(beams, x, 42, 50, 50, col, 0.8);
      return [
        { view: v, layer: 'wall', obstacles: [] },
        {
          view: beams,
          layer: 'lights',
          obstacles: [],
          update: (time) => {
            const b = beatNow(time);
            const k = kickOf(b);
            const sweep = Math.sin(b * (Math.PI / 8)) * (calm ? 0.3 : 0.8);
            const spread = 0.12 + 0.08 * Math.sin(b * (Math.PI / 4));
            const on = Math.floor(b / 8) % 4 !== 3;
            lines.forEach((s, i) => {
              s.rotation = sweep + (i - 4) * spread;
              s.alpha = on ? 0.25 + 0.4 * k : 0;
            });
            dot.alpha = on ? 0.5 + 0.4 * k : 0.2;
          },
        },
      ];
    }

    // ---- Strobe on the wall: white flashes in the build-ups (dimmed for reduced motion).
    case 'strobe': {
      const v = new Container();
      v.addChild(
        propSprite(x, 30, 60, 40, 30, 10, (c) => {
          rrect(c, -22, -6, 44, 20, 3);
          fillInk(c, '#1a1a22', 1.6);
          rrect(c, -18, -2, 36, 12, 2);
          c.fillStyle = 'rgba(230,240,255,0.6)';
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.6)';
          c.fillRect(-16, 3, 32, 2);
        }),
      );
      const fx = new Container();
      const head = glow(fx, x, 36, 90, 50, 0xffffff, 0);
      const wash = glow(fx, x, 300, 900, 600, 0xe8f0ff, 0);
      return [
        { view: v, layer: 'wall', obstacles: [] },
        {
          view: fx,
          layer: 'lights',
          obstacles: [],
          update: (time) => {
            const b = beatNow(time);
            const build = Math.floor(b / 4) % 8 >= 6 || fresh(clubShow.dropAt, 6) > 0.2;
            const rate = Math.floor(b / 4) % 8 === 7 ? 4 : 2;
            const flash = build && (b * rate) % 1 < 0.18 ? 1 : 0;
            head.alpha = calm ? flash * 0.4 : flash;
            wash.alpha = calm ? 0 : flash * 0.22;
          },
        },
      ];
    }

    // ---- Basketball hoop on the wall.
    case 'hoop': {
      const v = new Container();
      const sp = propSprite(x, 18, 120, 140, 60, 0, (c) => {
        // Backboard.
        rrect(c, -46, 4, 92, 64, 3);
        fillInk(c, 'rgba(240,244,250,0.92)', 2);
        c.strokeStyle = '#e83a2a';
        c.lineWidth = 3;
        c.strokeRect(-18, 28, 36, 26);
        // Rim and net.
        c.fillStyle = '#5a5a66';
        c.fillRect(-4, 60, 8, 10);
        ellipse(c, 0, 74, 22, 6);
        c.strokeStyle = '#e8641a';
        c.lineWidth = 3.5;
        c.stroke();
        for (let k = 0; k <= 8; k++) {
          const a = Math.PI + (k / 8) * Math.PI;
          const tx = Math.cos(a) * 22;
          c.beginPath();
          c.moveTo(tx, 74 - Math.sin(a) * 6);
          c.lineTo(tx * 0.55, 108);
          c.strokeStyle = 'rgba(255,255,255,0.8)';
          c.lineWidth = 1;
          c.stroke();
        }
        for (const ny of [86, 98]) {
          c.beginPath();
          c.ellipse(0, ny, 22 - (ny - 74) * 0.28, 4, 0, 0, Math.PI);
          c.strokeStyle = 'rgba(255,255,255,0.7)';
          c.stroke();
        }
      });
      v.addChild(sp);
      return [{ view: v, layer: 'wall', obstacles: [] }];
    }

    // ---- Mirror ball high above the floor, throwing specks of light around.
    case 'discoBall': {
      const lift = h || 300;
      const R = (w || 1) * 26;
      const v = new Container();
      const by = y - lift;
      const chain = new Graphics().moveTo(x, by - R - 400).lineTo(x, by - R).stroke({ color: 0x8a8a98, width: 2 });
      v.addChild(chain);
      const ball = addSprite(
        v,
        cached(`club-ball-${R}`, () =>
          paint(R * 2 + 8, R * 2 + 8, (c) => {
            c.translate(R + 4, R + 4);
            ellipse(c, 0, 0, R, R);
            c.save();
            c.clip();
            const fs = R / 5;
            for (let yy = -R; yy < R; yy += fs)
              for (let xx = -R; xx < R; xx += fs) {
                const k = (xx * 0.03 + yy * 0.05 + Math.sin(xx * 7 + yy * 3)) % 1;
                const lit = Math.max(0, 1 - Math.hypot(xx + R * 0.35, yy + R * 0.35) / (R * 1.6));
                c.fillStyle = `rgb(${Math.round(90 + lit * 150 + k * 20)},${Math.round(95 + lit * 150 + k * 20)},${Math.round(120 + lit * 130)})`;
                c.fillRect(xx + 0.6, yy + 0.6, fs - 1.2, fs - 1.2);
              }
            c.restore();
            ellipse(c, 0, 0, R, R);
            c.strokeStyle = INK;
            c.lineWidth = 1.6;
            c.stroke();
            ellipse(c, -R * 0.35, -R * 0.4, R * 0.25, R * 0.18);
            c.fillStyle = 'rgba(255,255,255,0.5)';
            c.fill();
          }, 2),
        ),
        x,
        by,
      );
      void ball;
      const halo = glow(v, x, by, R * 5, R * 5, 0xffffff, 0.25);
      const glints = new Graphics();
      v.addChild(glints);
      const specks = new Graphics();
      v.addChild(specks);
      const spread = (w || 1) * 300;
      return [
        {
          view: v,
          layer: 'lights',
          obstacles: [],
          update: (time) => {
            const b = beatNow(time);
            const rot = time * 0.6;
            glints.clear();
            for (let i = 0; i < 6; i++) {
              const a = rot + i * 1.05;
              const gx = x + Math.cos(a) * R * 0.75;
              if (Math.sin(a) < 0) continue;
              const gy = by + Math.sin(i * 2.3) * R * 0.6;
              const r = 4 + 3 * Math.sin(time * 5 + i);
              glints.moveTo(gx, gy - r).lineTo(gx + r * 0.25, gy).lineTo(gx, gy + r).lineTo(gx - r * 0.25, gy).closePath().fill({ color: 0xffffff, alpha: 0.9 });
            }
            specks.clear();
            for (let i = 0; i < 36; i++) {
              const a = rot * (calm ? 0.4 : 1) + i * 2.4;
              const rr = spread * (0.25 + ((i * 37) % 100) / 130);
              const sx = x + Math.cos(a) * rr;
              const sy = y + Math.sin(a) * rr * 0.55;
              specks.ellipse(sx, sy, 3.2, 2).fill({ color: pal(i), alpha: 0.5 + 0.3 * kickOf(b) });
            }
            halo.alpha = 0.18 + 0.1 * kickOf(b);
          },
        },
      ];
    }
  }
  return null;
}

// ---- The neon sign over a club room ----------------------------------------------------------------

/** A neon-tube sign on a black steel plate (instead of the gilded marquee), or null for other floors. */
export function clubSign(text: string, style: string, neon: number, x: number, y: number, font: string) {
  if (style !== 'club' && style !== 'techno' && style !== 'hiphop') return null;
  const c = new Container();
  const size = style === 'club' ? 46 : 38;
  const w = Math.max(200, text.length * size * 0.62 + 70);
  const h = size + 30;
  const second = style === 'club' ? CYAN : style === 'techno' ? 0xffffff : 0xffd23f;
  const plate = new Sprite(
    paint(w + 40, h + 40, (ctx) => {
      ctx.translate(20, 20);
      if (style === 'hiphop') {
        // A spray-painted plank with a tag-style frame.
        rrect(ctx, 0, 4, w, h - 8, 6);
        fillInk(ctx, vgrad(ctx, 4, h - 4, 0x2a2420, 0.1, 0.3), 2);
      } else {
        rrect(ctx, 0, 0, w, h, 6);
        fillInk(ctx, vgrad(ctx, 0, h, 0x14121c, 0.12, 0.3), 2.2);
        for (const [bx, by] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
          ellipse(ctx, bx, by, 3, 3);
          ctx.fillStyle = chrome(ctx, bx - 3, by - 3, bx + 3, by + 3);
          ctx.fill();
        }
      }
      ctx.font = `${size}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      // Halo, tube and white-hot core.
      ctx.shadowColor = rgb(neon);
      ctx.shadowBlur = 22;
      ctx.lineWidth = 5;
      ctx.strokeStyle = rgb(neon);
      ctx.strokeText(text, w / 2, h / 2 + 2);
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgb(light(neon, 0.85));
      ctx.strokeText(text, w / 2, h / 2 + 2);
      ctx.shadowBlur = 0;
      // Underline tube in the second colour.
      ctx.beginPath();
      ctx.moveTo(30, h - 9);
      ctx.lineTo(w - 30, h - 9);
      neonStroke(ctx, second, 2);
      rim(ctx, 0.1);
    }),
  );
  plate.anchor.set(0.5);
  c.addChild(plate);
  const halo = new Sprite(glowTexture());
  halo.anchor.set(0.5);
  halo.width = w * 1.7;
  halo.height = h * 2.6;
  halo.tint = neon;
  halo.alpha = 0.3;
  halo.blendMode = 'add';
  c.addChildAt(halo, 0);
  c.position.set(x, y);
  return {
    view: c,
    update: (time: number) => {
      const b = beatNow(time);
      // Buzz now and then; on the club floor the halo breathes with the kick.
      const flick = Math.sin(time * 31) > 0.992 ? 0.5 : 1;
      plate.alpha = flick;
      halo.alpha = (0.22 + 0.12 * kickOf(b)) * flick;
    },
  };
}

/** Coloured light the room shell paints around the club's lamps (pools on the floor). */
export function clubLightSpots(decor: DecorPlacement[]) {
  const spots: { x: number; y: number; r: number; col: number; a: number }[] = [];
  for (const d of decor) {
    if (d.kind === 'djStage') spots.push({ x: d.x, y: d.y + (d.h ?? 170) / 2 + 40, r: 260, col: MAGENTA, a: 0.35 });
    else if (d.kind === 'danceFloor') spots.push({ x: d.x, y: d.y, r: (d.w ?? 600) * 0.5, col: VIOLET, a: 0.3 });
    else if (d.kind === 'clubBar') spots.push({ x: d.x, y: d.y + 30, r: 200, col: CYAN, a: 0.3 });
    else if (d.kind === 'vipBooth') spots.push({ x: d.x, y: d.y, r: 140, col: 0xffd23f, a: 0.22 });
    else if (d.kind === 'ledPillar') spots.push({ x: d.x, y: d.y, r: 90, col: MAGENTA, a: 0.25 });
    else if (d.kind === 'neonArt') spots.push({ x: d.x, y: 70, r: 120, col: d.h || CYAN, a: 0.3 });
    else if (d.kind === 'laser') spots.push({ x: d.x, y: 60, r: 110, col: (d.r ?? 0) % 2 ? 0xff2040 : 0x40ff70, a: 0.25 });
    else if (d.kind === 'chainDisplay' || d.kind === 'sneakerShelf') spots.push({ x: d.x, y: d.y, r: 110, col: 0xffe0a0, a: 0.3 });
  }
  return spots;
}

void P_WALL_H;
