// What makes a side room special: its daily find (a glinting curio you can pick up once a day),
// a spotlight under its pinned special machines, and a little life of its own (cigar smoke
// in the Hinterzimmer, moths round the moonflower in the Gewächshaus, steam in the Kammer).

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture, emblemTexture, reducedMotion } from '../core/fx';
import { getGame, type RoomDefinition } from '../core/registry';
import type { GameState } from '../core/state';
import { animate, ease } from '../core/tween';
import { curioOf, curioTaken, onCurio, type Curio } from '../core/curios';
import type { ExtraInteractable } from './roomExtras';
import type { Rect } from './decor';
import { ellipse, fillInk, glowAt, gold, light, paint, rgb, rrect, shadow, vgrad, type Ctx } from './painted/brush';

export interface SpecialsHost {
  floor: Container;
  entities: Container;
  lights: Container;
  fx: Container;
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  floatText(text: string, x: number, y: number, color?: number, size?: number): void;
  /** Shows the prompt again (its title changed). */
  refreshPrompt(): void;
}

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

// ---- Painted curios -------------------------------------------------------------------------------
// Each is painted in a 120×130 canvas with its floor point at (60, 110).

function moonstone(c: Ctx, x: number, y: number, s: number) {
  glowAt(c, x, y, s * 2.4, s * 2.4, 0x9fe8ff, 0.7, 'lighter');
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x + s * 0.8, y - s * 0.2);
  c.lineTo(x + s * 0.5, y + s * 0.8);
  c.lineTo(x - s * 0.5, y + s * 0.8);
  c.lineTo(x - s * 0.8, y - s * 0.2);
  c.closePath();
  const g = c.createLinearGradient(x - s, y - s, x + s, y + s);
  g.addColorStop(0, '#f0fcff');
  g.addColorStop(0.5, '#6fd0f0');
  g.addColorStop(1, '#1b6f98');
  fillInk(c, g, 1.4);
  c.beginPath();
  c.moveTo(x - s * 0.3, y - s * 0.55);
  c.lineTo(x + s * 0.1, y - s * 0.55);
  c.lineTo(x - s * 0.15, y);
  c.closePath();
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fill();
}

function cigarBox(c: Ctx, full: boolean) {
  // Small round side table.
  shadow(c, 0, 4, 40, 11, 0.55);
  rrect(c, -4, -46, 8, 48, 3);
  fillInk(c, vgrad(c, -46, 2, 0x4a2a16, 0.2, 0.4), 1.6);
  ellipse(c, 0, 0, 20, 6);
  fillInk(c, '#3a2010', 1.4);
  // Table top: polished walnut with a gold rim, its edge seen from the front.
  ellipse(c, 0, -46, 40, 15);
  fillInk(c, '#3a1c0c', 1.8);
  ellipse(c, 0, -51, 40, 15);
  const tg = c.createLinearGradient(-40, -66, 40, -36);
  tg.addColorStop(0, '#b07a48');
  tg.addColorStop(1, '#5a3218');
  fillInk(c, tg, 1.8);
  ellipse(c, 0, -51, 35, 12);
  c.strokeStyle = 'rgba(224,178,90,0.7)';
  c.lineWidth = 1.4;
  c.stroke();
  ellipse(c, -12, -56, 14, 4);
  c.fillStyle = 'rgba(255,236,200,0.25)';
  c.fill();
  // The box: walls, cigars, open lid leaning back.
  rrect(c, -22, -78, 44, 12, 3);
  fillInk(c, '#5a1a1a', 1.4);
  rrect(c, -24, -66, 48, 14, 3);
  fillInk(c, vgrad(c, -66, -52, 0x7a2a1e, 0.2, 0.35), 1.6);
  c.fillStyle = gold(c, -10, -64, 10, -56);
  c.fillRect(-12, -63, 24, 6);
  c.font = '700 5px sans-serif';
  rrect(c, -20, -70, 40, 6, 2);
  c.fillStyle = '#2a0e08';
  c.fill();
  for (let k = 0; k < 6; k++) {
    rrect(c, -19 + k * 6.4, -71, 5.6, 6, 2.6);
    c.fillStyle = k % 2 ? '#7a4a24' : '#8a5a2e';
    c.fill();
    c.fillStyle = '#c9963e';
    c.fillRect(-18 + k * 6.4, -69, 3.6, 1.6);
  }
  if (full) moonstone(c, 6, -76, 7);
  // Ashtray with a thin curl of smoke.
  ellipse(c, 26, -50, 8, 3);
  fillInk(c, '#a8b0bc', 1.2);
  c.beginPath();
  c.moveTo(28, -52);
  c.bezierCurveTo(34, -62, 22, -70, 30, -82);
  c.strokeStyle = 'rgba(220,220,230,0.35)';
  c.lineWidth = 2;
  c.stroke();
}

function moonflower(c: Ctx, full: boolean) {
  // Stone plinth with a big glazed pot.
  shadow(c, 0, 4, 44, 12, 0.55);
  rrect(c, -34, -20, 68, 22, 5);
  fillInk(c, vgrad(c, -20, 2, 0x8a94a4, 0.25, 0.4), 1.8);
  ellipse(c, 0, -20, 34, 8);
  fillInk(c, '#b8c0cc', 1.4);
  c.beginPath();
  c.moveTo(-22, -24);
  c.quadraticCurveTo(-26, -46, -18, -54);
  c.lineTo(18, -54);
  c.quadraticCurveTo(26, -46, 22, -24);
  c.closePath();
  fillInk(c, vgrad(c, -54, -24, 0x2a5a7a, 0.3, 0.4), 1.8);
  ellipse(c, 0, -54, 19, 5);
  fillInk(c, '#1a1410', 1.2);
  // Stems and leaves.
  for (const [sx, h] of [[-1, 40], [1, 34], [0, 52]] as const) {
    c.beginPath();
    c.moveTo(sx * 4, -56);
    c.quadraticCurveTo(sx * 18, -56 - h * 0.5, sx * 10, -56 - h);
    c.strokeStyle = '#2f6a3a';
    c.lineWidth = 2.6;
    c.stroke();
    c.save();
    c.translate(sx * 14, -56 - h * 0.45);
    c.rotate(sx * 0.8 - 0.2);
    c.beginPath();
    c.ellipse(0, 0, 12, 4.5, 0, 0, Math.PI * 2);
    fillInk(c, '#3f8a4a', 1);
    c.restore();
  }
  const bx = 0;
  const by = -104;
  if (full) {
    glowAt(c, bx, by, 60, 50, 0xd8c8ff, 0.55, 'lighter');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      c.save();
      c.translate(bx, by);
      c.rotate(a);
      c.beginPath();
      c.ellipse(13, 0, 14, 7, 0, 0, Math.PI * 2);
      const g = c.createLinearGradient(0, 0, 26, 0);
      g.addColorStop(0, '#fff8ff');
      g.addColorStop(1, '#c8b0f0');
      fillInk(c, g, 1.1);
      c.restore();
    }
    ellipse(c, bx, by, 7, 6);
    fillInk(c, '#ffe7a0', 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ellipse(c, bx + Math.cos(a) * 4, by + Math.sin(a) * 3.4, 1.2, 1.2);
      c.fillStyle = '#c9762e';
      c.fill();
    }
  } else {
    // A closed bud, faintly silver.
    c.beginPath();
    c.moveTo(bx, by - 18);
    c.quadraticCurveTo(bx + 10, by - 2, bx, by + 10);
    c.quadraticCurveTo(bx - 10, by - 2, bx, by - 18);
    fillInk(c, vgrad(c, by - 18, by + 10, 0xa8b8c8, 0.2, 0.4), 1.2);
  }
}

function gearStand(c: Ctx, full: boolean) {
  shadow(c, 0, 4, 40, 11, 0.55);
  rrect(c, -30, -16, 60, 18, 4);
  fillInk(c, vgrad(c, -16, 2, 0x3a3440, 0.25, 0.4), 1.8);
  rrect(c, -6, -46, 12, 32, 3);
  fillInk(c, vgrad(c, -46, -14, 0x5a5a66, 0.2, 0.4), 1.4);
  // Upright gear.
  const cy = -80;
  c.save();
  c.translate(0, cy);
  c.beginPath();
  const teeth = 14;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? 36 : 29;
    i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  fillInk(c, gold(c, -36, -36, 36, 36), 2);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ellipse(c, Math.cos(a) * 18, Math.sin(a) * 18, 6, 6);
    c.fillStyle = '#3a2410';
    c.fill();
  }
  ellipse(c, 0, 0, 7, 7);
  fillInk(c, '#5a3a1a', 1.2);
  c.restore();
  if (full) {
    // A big coin wedged between two teeth.
    const x = 26;
    const y = cy - 24;
    glowAt(c, x, y, 26, 26, 0xffe7a0, 0.6, 'lighter');
    ellipse(c, x, y, 10, 10);
    fillInk(c, gold(c, x - 10, y - 10, x + 10, y + 10), 1.4);
    ellipse(c, x, y, 6.5, 6.5);
    c.strokeStyle = 'rgba(122,78,24,0.8)';
    c.lineWidth = 1.2;
    c.stroke();
  }
}

function curioTexture(kind: Curio['kind'], full: boolean) {
  return cached(`curio-${kind}-${full}`, () =>
    paint(120, 130, (c) => {
      c.translate(60, 110);
      if (kind === 'cigarBox') cigarBox(c, full);
      else if (kind === 'moonflower') moonflower(c, full);
      else gearStand(c, full);
    }),
  );
}

/** What flies up at the pickup. */
function prizeTexture(kind: Curio['kind']) {
  return cached(`prize-${kind}`, () =>
    paint(60, 60, (c) => {
      if (kind === 'cigarBox') moonstone(c, 30, 30, 16);
      else if (kind === 'moonflower') {
        glowAt(c, 30, 30, 30, 30, 0xff9ab0, 0.5, 'lighter');
        ellipse(c, 30, 30, 18, 18);
        fillInk(c, '#f6ead8', 2);
        ellipse(c, 30, 30, 13, 13);
        c.strokeStyle = '#b8243a';
        c.lineWidth = 2.5;
        c.stroke();
        c.font = '700 13px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#b8243a';
        c.fillText('✦', 30, 31);
      } else {
        glowAt(c, 30, 30, 30, 30, 0xffe7a0, 0.6, 'lighter');
        ellipse(c, 30, 30, 16, 16);
        fillInk(c, gold(c, 14, 14, 46, 46), 2);
        ellipse(c, 30, 30, 10, 10);
        c.strokeStyle = 'rgba(122,78,24,0.9)';
        c.lineWidth = 1.6;
        c.stroke();
      }
    }),
  );
}

/** A four-point sparkle. */
function sparkTexture() {
  return cached('curio-spark', () =>
    paint(40, 40, (c) => {
      glowAt(c, 20, 20, 12, 12, 0xffffff, 0.7, 'lighter');
      c.beginPath();
      c.moveTo(20, 2);
      c.quadraticCurveTo(22, 18, 38, 20);
      c.quadraticCurveTo(22, 22, 20, 38);
      c.quadraticCurveTo(18, 22, 2, 20);
      c.quadraticCurveTo(18, 18, 20, 2);
      c.fillStyle = '#fffbea';
      c.fill();
    }),
  );
}

/** Soft floor disc under a pinned special machine. */
function stageTexture(w: number, col: number) {
  return cached(`stage-${w}-${col}`, () =>
    paint(w + 80, (w + 80) * 0.5, (c) => {
      const cx = (w + 80) / 2;
      const cy = (w + 80) * 0.25;
      glowAt(c, cx, cy, w * 0.75, w * 0.32, col, 0.45);
      c.beginPath();
      c.ellipse(cx, cy, w * 0.62, w * 0.24, 0, 0, Math.PI * 2);
      c.strokeStyle = rgb(light(col, 0.4), 0.6);
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.stroke();
      c.setLineDash([]);
    }),
  );
}

// ---- The room's specials -------------------------------------------------------------------------

interface Floater {
  s: Sprite;
  x: number;
  y: number;
  r: number;
  ph: number;
  sp: number;
  kind: 'smoke' | 'moth' | 'steam';
  base: number;
}

export class RoomSpecials {
  private curio: Curio | null;
  private item: Sprite | null = null;
  private glint: Sprite | null = null;
  private interact: ExtraInteractable | null = null;
  private floaters: Floater[] = [];
  private time = 0;
  private off: () => void = () => {};
  private dead = false;

  constructor(
    private state: GameState,
    private def: RoomDefinition,
    private host: SpecialsHost,
  ) {
    this.curio = curioOf(def.id);
    this.buildStages();
    this.buildCurio();
    this.buildAmbience();
    if (this.curio) this.off = onCurio((c) => c.room === this.def.id && this.pickup());
  }

  /** A lit disc under each pinned station, so the special machines stand out. */
  private buildStages() {
    for (const st of this.def.stations) {
      if (!st.pinned) continue;
      const g = getGame(st.game);
      const s = new Sprite(stageTexture(Math.max(100, g.footprint.w + 30), this.def.theme.neon));
      s.anchor.set(0.5);
      s.position.set(st.x + g.footprint.w / 2, st.y + g.footprint.h - 6);
      s.blendMode = 'add';
      this.host.floor.addChild(s);
    }
  }

  private buildCurio() {
    const c = this.curio;
    if (!c) return;
    const full = !curioTaken(this.state, c.room);
    const s = new Sprite(curioTexture(c.kind, full));
    s.anchor.set(0.5, 110 / 130);
    s.position.set(c.x, c.y);
    s.scale.set(1.25);
    s.zIndex = c.y + 6;
    this.host.entities.addChild(s);
    this.item = s;
    this.host.obstacles.push({ x: c.x - 32, y: c.y - 16, w: 64, h: 28 });
    const g = new Sprite(sparkTexture());
    g.anchor.set(0.5);
    g.position.set(c.x + 1.25 * (c.kind === 'brassCoin' ? 26 : c.kind === 'cigarBox' ? 6 : 0), c.y - 1.25 * (c.kind === 'cigarBox' ? 76 : 104));
    g.blendMode = 'add';
    g.visible = full;
    this.host.lights.addChild(g);
    this.glint = g;
    this.interact = { kind: 'extra', id: `curio:${c.room}`, x: c.x, y: c.y + 40, title: full ? c.title : c.taken };
    this.host.interactables.push(this.interact);
  }

  /** The find flies up with a burst of sparkles; the curio is left empty for today. */
  private pickup() {
    const c = this.curio!;
    if (this.item) this.item.texture = curioTexture(c.kind, false);
    if (this.glint) this.glint.visible = false;
    if (this.interact) this.interact.title = c.taken;
    this.host.refreshPrompt();
    const gx = this.glint?.x ?? c.x;
    const gy = this.glint?.y ?? c.y - 80;
    const prize = new Sprite(prizeTexture(c.kind));
    prize.anchor.set(0.5);
    prize.position.set(gx, gy);
    this.host.fx.addChild(prize);
    const calm = reducedMotion();
    void animate(calm ? 700 : 1300, (k) => {
      if (prize.destroyed) return;
      prize.y = gy - 70 * ease.outCubic(k);
      prize.scale.set(1.5 * (calm ? 1 : 0.6 + 0.6 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5)) * (k > 0.75 ? 1 - (k - 0.75) * 2 : 1));
      prize.alpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      if (!calm) prize.rotation = Math.sin(k * 10) * 0.15;
    }).then(() => !prize.destroyed && prize.destroy());
    if (!calm) {
      for (let i = 0; i < 14; i++) {
        const sp = new Sprite(sparkTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        sp.tint = i % 3 ? 0xfff1c4 : this.def.theme.neon;
        const a = (i / 14) * Math.PI * 2;
        const d = 40 + (i % 4) * 14;
        const s0 = 0.4 + (i % 3) * 0.2;
        this.host.fx.addChild(sp);
        void animate(700 + (i % 5) * 80, (k) => {
          if (sp.destroyed) return;
          sp.position.set(gx + Math.cos(a) * d * ease.outCubic(k), gy + Math.sin(a) * d * 0.7 * ease.outCubic(k) - 20 * k);
          sp.scale.set(s0 * (1 - k));
          sp.rotation = k * 3;
        }).then(() => !sp.destroyed && sp.destroy());
      }
    }
    this.host.floatText(c.float, gx, gy - 40, c.kind === 'cigarBox' ? 0x9fe8ff : c.kind === 'moonflower' ? 0xffc8e0 : 0xffe7a0, 24);
  }

  private floater(kind: Floater['kind'], x: number, y: number, r: number, size: number, tint: number, alpha: number) {
    const s = new Sprite(kind === 'moth' ? emblemTexture() : glowTexture());
    s.anchor.set(0.5);
    s.width = s.height = size;
    s.tint = tint;
    s.alpha = alpha;
    if (kind === 'moth') s.blendMode = 'add';
    this.host.lights.addChild(s);
    this.floaters.push({ s, x, y, r, ph: Math.random() * 10, sp: 0.5 + Math.random() * 0.8, kind, base: kind === 'moth' ? size / s.texture.width : alpha });
  }

  private buildAmbience() {
    const { width: W, height: H } = this.def;
    if (this.def.id === 'f1b') {
      // Cigar smoke hanging under the lamps.
      for (let i = 0; i < 9; i++) this.floater('smoke', 120 + Math.random() * (W - 240), 230 + Math.random() * (H - 330), 40 + Math.random() * 50, 220 + Math.random() * 160, 0xb8b4c8, 0.07);
    } else if (this.def.id === 'f2b' && this.curio) {
      // Moths circling the moonflower while it blooms, and some round the lamps.
      for (let i = 0; i < 7; i++) this.floater('moth', this.curio.x, this.curio.y - 104, 30 + Math.random() * 50, 14, 0xf0e8ff, 0.85);
      for (let i = 0; i < 12; i++) this.floater('smoke', 80 + Math.random() * (W - 160), 200 + Math.random() * (H - 260), 30, 10, 0xd8ff9a, 0.5);
    } else if (this.def.id === 'f3b') {
      for (let i = 0; i < 6; i++) this.floater('steam', 80 + Math.random() * (W - 160), 260 + Math.random() * (H - 360), 30, 160 + Math.random() * 100, 0xe8e0d8, 0.06);
    }
  }

  update(dtMs: number) {
    if (this.dead) return;
    this.time += dtMs / 1000;
    const t = this.time;
    if (this.glint?.visible) {
      const k = (Math.sin(t * 2.2) + 1) / 2;
      this.glint.alpha = 0.35 + 0.65 * k;
      this.glint.scale.set(0.5 + 0.5 * k);
      this.glint.rotation = t * 0.6;
    }
    const calm = reducedMotion();
    const bloom = this.curio && !curioTaken(this.state, this.curio.room);
    for (const f of this.floaters) {
      const a = t * f.sp * (calm ? 0.3 : 1) + f.ph;
      if (f.kind === 'moth') {
        // Fewer moths stay once the flower has closed.
        f.s.visible = !!bloom || f.ph < 3;
        const x = f.x + Math.cos(a * 1.6) * f.r + Math.sin(a * 3.1) * 6;
        const y = f.y + Math.sin(a * 2.1) * f.r * 0.6;
        f.s.rotation = Math.atan2(y - f.s.y, x - f.s.x) + Math.PI / 2;
        f.s.position.set(x, y);
        f.s.scale.x = f.base * (0.35 + 0.65 * Math.abs(Math.cos(t * 20 + f.ph)));
        f.s.scale.y = f.base;
      } else if (f.r <= 30 && f.kind === 'smoke') {
        // Fireflies.
        f.s.position.set(f.x + Math.sin(a * 0.7) * 40, f.y + Math.cos(a * 0.9) * 26);
        f.s.alpha = f.base * (0.3 + 0.7 * Math.max(0, Math.sin(a * 2.3)));
      } else {
        // Slow drifting smoke or steam, breathing in and out.
        f.s.position.set(f.x + Math.sin(a * 0.3) * f.r, f.y + Math.cos(a * 0.23) * f.r * 0.4 - (f.kind === 'steam' ? ((t * 8 + f.ph * 30) % 60) : 0));
        f.s.alpha = f.base * (0.6 + 0.4 * Math.sin(a * 0.5));
      }
    }
  }

  destroy() {
    this.dead = true;
    this.off();
  }
}
