// Life on the club floor (floor 4): dancers on the dance floors and the proximity music.
// The closer the player gets to a room's dance floor, the louder and fuller the band
// (sfx.setProximity); it falls back when they walk away, open a game or leave the floor.
// Hooked into RoomExtras, so it lives and dies with the room.

import type { Container } from 'pixi.js';
import type { RoomDefinition } from '../core/registry';
import { sfx } from '../core/audio';
import { reducedMotion } from '../core/fx';
import { Chibi } from './painted/chibi';
import { isClubStyle } from './painted/clubShell';
import { beatNow } from './painted/propsClub';
import type { PlayerLook } from './player';

interface Dancer {
  p: Chibi;
  x: number;
  y: number;
  ph: number;
  /** 'bounce' (everyone), 'jump' (techno), 'bboy' (spins now and then). */
  move: 'bounce' | 'jump' | 'bboy';
  face: number;
}

const SKIN = [0xe8b48a, 0xc68a5e, 0x8d5a3b, 0xf1c9a5, 0x6b4127];
const HAIR = [0x2a1a10, 0x6b3a1e, 0xd9b26a, 0x1b1b22, 0xb3402a, 0xff6bb8, 0x3fe8ff];
const BRIGHT = [0xff3fb4, 0x3fe8ff, 0xa06bff, 0xffd23f, 0x7bd47b, 0xff6b2f, 0x1b1b22, 0xe8e8f0];

function dancerLook(r: () => number, style: string): PlayerLook {
  const p = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const dress = r() < 0.5;
  return {
    skin: p(SKIN),
    hair: p(HAIR),
    outfit: dress ? 'dress' : 'suit',
    jacket: style === 'techno' ? p([0x1b1b22, 0x2a2a2a, 0x14141c, 0x3a1a2a]) : p(BRIGHT),
    hairStyle: dress ? p(['long', 'bun', 'curly', 'short'] as const) : p(['short', 'curly', 'sidePart', 'bald'] as const),
    hat: !dress && style === 'hiphop' && r() < 0.3 ? 'fedora' : 'none',
    hatColor: 0x1b1b22,
    accessory: dress ? (r() < 0.6 ? 'necklace' : 'none') : 'none',
  };
}

export interface ClubHost {
  entities: Container;
  spots: { x: number; y: number; kind: string }[];
  player(): { x: number; y: number };
}

export class ClubLife {
  private dancers: Dancer[] = [];
  private area: { x: number; y: number; w: number; h: number } | null = null;
  private radius: number;
  private prox = 0;
  private time = 0;

  static for(def: RoomDefinition, host: ClubHost) {
    return isClubStyle(def.theme.style) ? new ClubLife(def, host) : null;
  }

  private constructor(
    private def: RoomDefinition,
    private host: ClubHost,
  ) {
    const style = def.theme.style;
    this.radius = style === 'club' ? 700 : 420;
    const df = def.decor.find((d) => d.kind === 'danceFloor');
    if (df) this.area = { x: df.x - (df.w ?? 640) / 2, y: df.y - (df.h ?? 300) / 2, w: df.w ?? 640, h: df.h ?? 300 };
    // Guests like to hang out at the bar and in the VIP booths.
    for (const d of def.decor) {
      if (d.kind === 'clubBar') {
        const bw = d.w ?? 360;
        for (let i = 0; i < Math.floor(bw / 70); i++) host.spots.push({ kind: 'lounge', x: d.x - bw / 2 + 40 + i * 70, y: d.y + (d.h ?? 70) / 2 + 40 });
      } else if (d.kind === 'vipBooth') host.spots.push({ kind: 'lounge', x: d.x + 70, y: d.y + 60 });
    }
    this.spawnDancers();
  }

  private spawnDancers() {
    const a = this.area;
    if (!a) return;
    const style = this.def.theme.style;
    const n = style === 'club' ? 10 : style === 'techno' ? 5 : 4;
    let seed = this.def.id.length * 977 + n;
    const r = () => ((seed = (seed * 16807) % 2147483647) % 10000) / 10000;
    // Spread them on a loose grid, leaving gaps for the player to walk through.
    const cols = Math.ceil(Math.sqrt(n * (a.w / a.h)));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      const x = a.x + ((cx + 0.5) / cols) * a.w + (r() - 0.5) * (a.w / cols) * 0.5;
      const y = a.y + 30 + ((cy + 0.5) / rows) * (a.h - 40) + (r() - 0.5) * 20;
      const p = new Chibi(BRIGHT[i % BRIGHT.length], dancerLook(r, style));
      p.view.position.set(x, y);
      p.view.zIndex = y + 16;
      this.host.entities.addChild(p.view);
      const move = style === 'hiphop' && i === 0 ? 'bboy' : style === 'techno' ? 'jump' : 'bounce';
      const face = Math.PI / 2 + (r() - 0.5) * 2;
      p.faceTowards(face);
      this.dancers.push({ p, x, y, ph: r() * Math.PI * 2, move, face });
    }
  }

  /** 0 far away, 1 on the dance floor. */
  private target() {
    const a = this.area;
    if (!a) return 0;
    const pl = this.host.player();
    const dx = Math.max(a.x - pl.x, 0, pl.x - (a.x + a.w));
    const dy = Math.max(a.y - pl.y, 0, pl.y - (a.y + a.h)) * 1.2;
    return Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / this.radius));
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const dt = Math.min(dtMs, 100) / 1000;
    this.prox += (this.target() - this.prox) * Math.min(1, dt * 2.5);
    sfx.setProximity(this.prox);
    (window as unknown as { __clubProx?: number }).__clubProx = this.prox;
    const b = beatNow(this.time);
    const calm = reducedMotion();
    const amp = calm ? 0.4 : 1;
    for (const d of this.dancers) {
      d.p.update(dtMs, null);
      const k = b + d.ph / Math.PI;
      const v = d.p.view;
      // Every four beats, a dancer turns a little.
      if (Math.floor(k) % 4 === 0 && (k % 1) < 0.05) {
        d.face = Math.PI / 2 + Math.sin(d.ph + Math.floor(k)) * 1.4;
        d.p.faceTowards(d.face);
      }
      if (d.move === 'bboy' && !calm && Math.floor(b / 8) % 2 === 1) {
        // Windmill: spin round the hips for a bar.
        const e = (b % 8) / 8;
        v.rotation = e * Math.PI * 4;
        v.position.set(d.x, d.y - 30 + Math.cos(e * Math.PI * 4) * 4);
        v.scale.set(0.82 * (Math.cos(e * Math.PI * 8) > 0 ? 1 : -1), 0.82);
        continue;
      }
      v.scale.set(0.82);
      const beat = Math.abs(Math.sin(k * Math.PI));
      const hop = d.move === 'jump' ? beat * 9 : beat * 4;
      v.position.set(d.x + Math.sin(k * Math.PI * 0.5) * 4 * amp, d.y - hop * amp);
      v.rotation = Math.sin(k * Math.PI * 0.5) * 0.09 * amp;
    }
  }

  destroy() {
    for (const d of this.dancers) d.p.view.destroy({ children: true });
    this.dancers = [];
    sfx.setProximity(0);
    delete (window as unknown as { __clubProx?: number }).__clubProx;
  }
}
