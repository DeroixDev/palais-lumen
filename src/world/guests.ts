// Other guests: they stroll between machines, play a while and sometimes win a little.
// Purely decorative, so the casino never feels empty when you play alone.

import { Container, Sprite } from 'pixi.js';
import { COLORS, floatText, glowTexture, mothTexture } from '../core/fx';
import { animate, ease } from '../core/tween';
import { sfx } from '../core/audio';
import { Player, type PlayerLook, type HairStyle } from './player';

export interface Spot {
  x: number;
  y: number;
  /** Where the effect of a win appears (the machine itself). */
  fx?: { x: number; y: number };
  kind: 'station' | 'lounge';
}

const SKIN = [0xe8b48a, 0xc68a5e, 0x8d5a3b, 0xf1c9a5, 0x6b4127];
const HAIR = [0x2a1a10, 0x6b3a1e, 0xd9b26a, 0x1b1b22, 0x9a9a9a, 0xb3402a];
const JACKET = [0x1d2a4a, 0x3a1a2a, 0x1f3a2a, 0x2a2a2a, 0x4a2a14];
const ACCENT = [COLORS.neon, COLORS.cyan, 0x7bd47b, 0xffa94a, 0xc9a0ff, COLORS.lamp, 0xff6b5f];
const DRESS = [0x6b1a2e, 0x1f5a44, 0x26305a, 0xb8862f, 0x5a2a6a, 0x1b1b22, 0xa24a6a, 0x2f6f7a];
const HAT = [0x1b1b22, 0x3a2a20, 0x2a2a3a, 0xd8c8a8, 0x4a1a24];
const SUIT_HAIR: HairStyle[] = ['short', 'short', 'sidePart', 'sidePart', 'curly', 'bald', 'long'];
const DRESS_HAIR: HairStyle[] = ['long', 'long', 'bun', 'bun', 'curly', 'short', 'sidePart'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A random, varied evening outfit for one guest. */
function randomLook(): PlayerLook {
  const dress = Math.random() < 0.45;
  const hair = pick(HAIR);
  if (dress) {
    return {
      skin: pick(SKIN),
      hair,
      outfit: 'dress',
      jacket: pick(DRESS),
      hairStyle: pick(DRESS_HAIR),
      accessory: Math.random() < 0.85 ? 'necklace' : 'none',
    };
  }
  const r = Math.random();
  return {
    skin: pick(SKIN),
    hair,
    outfit: 'suit',
    jacket: pick(JACKET),
    // Grey hair goes thin a little more often.
    hairStyle: hair === 0x9a9a9a && Math.random() < 0.5 ? 'bald' : pick(SUIT_HAIR),
    hat: r < 0.12 ? 'fedora' : r < 0.19 ? 'topHat' : 'none',
    hatColor: pick(HAT),
    accessory: Math.random() < 0.6 ? 'bowTie' : 'tie',
  };
}

interface Guest {
  p: Player;
  target: Spot | null;
  /** Seconds left to stay at the current spot. */
  stay: number;
  /** Seconds until the next possible small win while playing. */
  nextWin: number;
  stuck: number;
}

export class Guests {
  private list: Guest[] = [];
  private taken = new Set<Spot>();

  constructor(
    private layer: Container,
    private fxLayer: Container,
    private spots: Spot[],
    count: number,
    private collides: (x: number, y: number) => boolean,
    private listener: () => { x: number; y: number },
  ) {
    for (let i = 0; i < count; i++) {
      const p = new Player(pick(ACCENT), randomLook());
      p.view.scale.set(1.3);
      const start = this.free() ?? spots[0];
      if (!start) return;
      p.view.position.set(start.x + (Math.random() - 0.5) * 30, start.y + 10);
      this.layer.addChild(p.view);
      const g: Guest = { p, target: start, stay: 2 + Math.random() * 8, nextWin: 3 + Math.random() * 6, stuck: 0 };
      this.taken.add(start);
      this.list.push(g);
    }
  }

  private free(except?: Spot | null) {
    const options = this.spots.filter((s) => !this.taken.has(s) && s !== except);
    return options.length ? pick(options) : null;
  }

  update(dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    for (const g of this.list) {
      const v = g.p.view;
      const t = g.target;
      if (!t) continue;
      const dx = t.x - v.x;
      const dy = t.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const sp = 120 * dt;
        const mx = (dx / d) * sp;
        const my = (dy / d) * sp;
        const ox = v.x;
        const oy = v.y;
        if (!this.collides(v.x + mx, v.y)) v.x += mx;
        if (!this.collides(v.x, v.y + my)) v.y += my;
        // Blocked: sidestep, and after a while choose somewhere else.
        if (Math.hypot(v.x - ox, v.y - oy) < 0.2) {
          g.stuck += dt;
          v.x += (Math.random() - 0.5) * 4;
          v.y += 2;
          if (g.stuck > 1.5) this.retarget(g);
        } else g.stuck = 0;
        g.p.update(dtMs, Math.atan2(dy, dx));
      } else {
        g.p.update(dtMs, null);
        g.stay -= dt;
        if (t.kind === 'station') {
          g.nextWin -= dt;
          if (g.nextWin <= 0) {
            g.nextWin = 4 + Math.random() * 8;
            if (Math.random() < 0.35) this.smallWin(t);
          }
        }
        if (g.stay <= 0) this.retarget(g);
      }
      v.zIndex = v.y + 16;
    }
  }

  private retarget(g: Guest) {
    const next = this.free(g.target);
    if (!next) {
      g.stay = 3;
      return;
    }
    if (g.target) this.taken.delete(g.target);
    this.taken.add(next);
    g.target = next;
    g.stay = next.kind === 'station' ? 8 + Math.random() * 14 : 5 + Math.random() * 8;
    g.stuck = 0;
  }

  /** A little win at someone else's machine: a few moths rise and a number floats up. */
  private smallWin(s: Spot) {
    const at = s.fx ?? { x: s.x, y: s.y - 40 };
    const amount = pick([20, 30, 40, 60, 80, 120, 150, 250]);
    floatText(this.fxLayer, at.x, at.y - 10, `+${amount}`, COLORS.lamp, 20);
    for (let i = 0; i < 4; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 40;
      glow.tint = COLORS.lamp;
      glow.alpha = 0.5;
      glow.blendMode = 'add';
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.width = m.height = 16;
      m.tint = 0xfff1c4;
      c.addChild(glow, m);
      c.position.set(at.x, at.y);
      this.fxLayer.addChild(c);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const dist = 50 + Math.random() * 50;
      const base = 16 / m.texture.width;
      void animate(
        1300 + Math.random() * 500,
        (k) => {
          c.x = at.x + Math.cos(ang) * dist * k + Math.sin(k * 12 + i) * 6;
          c.y = at.y + Math.sin(ang) * dist * k;
          c.alpha = 1 - k;
          m.scale.x = base * (0.4 + 0.6 * Math.abs(Math.cos(k * 40)));
        },
        ease.outCubic,
      ).then(() => c.destroy({ children: true }));
    }
    const l = this.listener();
    if (Math.hypot(l.x - at.x, l.y - at.y) < 380) sfx.coin();
  }
}
