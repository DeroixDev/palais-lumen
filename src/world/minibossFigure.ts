// The mini boss standing on its floor on its day (src/core/miniboss.ts): placed on free floor
// near where the player steps out of the elevator, with a soft aura, a little idle motion and a
// tap target. Once today's goal is reached it shows its beaten face and sways dizzily.

import { Container, Sprite } from 'pixi.js';
import { glowTexture, reducedMotion } from '../core/fx';
import { minibossFor, type MiniBoss } from '../core/miniboss';
import { mainRoomOf, type RoomDefinition } from '../core/registry';
import type { GameState } from '../core/state';
import { FH, FW, FX, FY, HEAD_Y, bossTexture } from './painted/propsBoss';
import type { Rect } from './decor';
import { WALL_H } from './styles';

export interface FigureHost {
  entities: Container;
  lights: Container;
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  collides(x: number, y: number): boolean;
}

export class MinibossFigure {
  readonly x: number;
  readonly y: number;
  private c = new Container();
  private body: Sprite;
  private glow: Sprite;
  private beaten = false;
  private t = Math.random() * 5;
  private hop = 0;
  private own: { kind: 'extra'; id: string; x: number; y: number; title: string };
  private ob: Rect;

  /** The figure for this room today, or null (only the floor's main room on its boss day). */
  static for(state: GameState, def: RoomDefinition, host: FigureHost) {
    const b = minibossFor(state.data);
    if (!b || def.floor !== b.n || mainRoomOf(b.n)?.id !== def.id) return null;
    const at = spot(def, host);
    return at ? new MinibossFigure(state, b, at, host) : null;
  }

  private constructor(
    private state: GameState,
    readonly boss: MiniBoss,
    at: { x: number; y: number },
    private host: FigureHost,
  ) {
    this.x = at.x;
    this.y = at.y;
    this.body = new Sprite(bossTexture(boss.n));
    this.body.anchor.set(FX / FW, FY / FH);
    this.body.scale.set(0.78);
    this.c.addChild(this.body);
    this.c.position.set(at.x, at.y);
    this.c.zIndex = at.y + 10;
    host.entities.addChild(this.c);
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.tint = boss.color;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0.35;
    this.glow.width = 260;
    this.glow.height = 200;
    this.glow.position.set(at.x, at.y - 70);
    host.lights.addChild(this.glow);
    this.ob = { x: at.x - 30, y: at.y - 16, w: 60, h: 24 };
    host.obstacles.push(this.ob);
    this.own = { kind: 'extra', id: 'miniboss', x: at.x, y: at.y + 46, title: `${boss.name.replace(/^(Die|Der) /, '')} ansprechen` };
    host.interactables.push(this.own);
  }

  /** Top of the head in world coordinates (for speech bubbles). */
  get head() {
    return { x: this.x, y: this.y - HEAD_Y * 0.78 - 30 };
  }

  /** A little jump (taunts, hits). */
  bounce() {
    this.hop = 1;
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.t += dt;
    const beaten = this.state.goalReached;
    if (beaten !== this.beaten) {
      this.beaten = beaten;
      this.body.texture = bossTexture(this.boss.n, beaten);
      this.glow.alpha = beaten ? 0.15 : 0.35;
    }
    if (reducedMotion()) {
      this.body.rotation = 0;
      this.body.y = 0;
      return;
    }
    this.hop = Math.max(0, this.hop - dt * 2.4);
    const jump = Math.sin(this.hop * Math.PI) * 14;
    if (beaten) {
      this.body.rotation = Math.sin(this.t * 2.2) * 0.06;
      this.body.scale.y = 0.78 * 0.97;
      this.body.y = -jump;
    } else {
      // Breathing, and the DJ nods to the beat.
      const nod = this.boss.id === 'falterbeat' ? Math.abs(Math.sin(this.t * Math.PI * 2)) * 3 : Math.sin(this.t * 1.8) * 1.5;
      this.body.rotation = Math.sin(this.t * 0.9) * 0.015;
      this.body.scale.y = 0.78 * (1 + Math.sin(this.t * 1.8) * 0.012);
      this.body.y = -nod - jump;
    }
    this.glow.alpha = (beaten ? 0.15 : 0.3) + Math.sin(this.t * 1.6) * 0.06;
  }

  destroy() {
    const ia = this.host.interactables;
    const i = ia.indexOf(this.own);
    if (i >= 0) ia.splice(i, 1);
    const ob = this.host.obstacles;
    const k = ob.indexOf(this.ob);
    if (k >= 0) ob.splice(k, 1);
    this.c.destroy({ children: true });
    this.glow.destroy();
  }
}

/** Free floor a few steps from the elevator, towards the middle of the room. */
function spot(def: RoomDefinition, host: FigureHost) {
  const { width: W, height: H } = def;
  const sx = def.spawn.x;
  const near = { x: sx + (sx < W / 2 ? 260 : -260), y: Math.min(H - 120, def.spawn.y + 150) };
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = WALL_H + 90; y < H - 80; y += 16)
    for (let x = 90; x < W - 90; x += 16) {
      const d = Math.hypot(x - near.x, (y - near.y) * 1.4);
      if (d >= bestD) continue;
      if (Math.hypot(x - def.elevatorX, y - WALL_H) < 170) continue;
      if (host.interactables.some((i) => Math.hypot(i.x - x, i.y - y) < 90)) continue;
      let ok = true;
      for (const [dx, dy] of [[0, 0], [-40, 0], [40, 0], [0, -30], [0, 30], [-40, -60], [40, -60], [0, -110], [0, 50]])
        if (host.collides(x + dx, y + dy)) {
          ok = false;
          break;
        }
      if (ok) {
        best = { x, y };
        bestD = d;
      }
    }
  return best;
}
