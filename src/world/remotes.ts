// The other players of a group, walking through the house: a painted figure in their own look,
// a name tag in their colour, a brass plate with the game while they sit at a machine, and their
// reactions as bubbles. Positions arrive ~12 times a second and are shown a little behind, so
// the figures glide between the updates instead of hopping.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { Chibi } from './painted/chibi';
import type { RoomScene } from './room';
import type { GameState, PlayerProfile } from '../core/state';
import type { Pose } from '../net/protocol';
import { SpeechBubble } from '../ui/bubble';
import { DEFAULT_OUTFITTING } from '../core/items';
import { FONT_BODY } from '../core/fx';
import { getGame } from '../core/registry';
import { fillInk, glowAt, paint, rgb, rrect, type Ctx } from './painted/brush';
import { brass } from '../core/ui';

/** How far behind the newest position the figures are shown (ms). */
const DELAY = 120;
/** A jump this far (px) is a teleport (a door, the elevator), not a walk. */
const SNAP = 220;
/** Feet to name tag, in world px. */
const TAG_Y = 70;

interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}

const tagCache = new Map<string, Texture>();
const plateCache = new Map<string, Texture>();

function measure(font: string, text: string) {
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = font;
  return c.measureText(text).width;
}

/** Name tag: night glass in a thin brass rim, a dot in the player's colour, the name in cream. */
function tagTexture(name: string, color: number, self: boolean) {
  const key = `${name}|${color}|${self}`;
  let t = tagCache.get(key);
  if (t) return t;
  const font = `700 15px ${FONT_BODY}`;
  const w = Math.ceil(measure(font, name) + 38);
  const h = 24;
  t = paint(w + 6, h + 6, (c: Ctx) => {
    c.translate(3, 3);
    rrect(c, 0, 0, w, h, h / 2);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, self ? 'rgba(40,52,104,0.92)' : 'rgba(26,34,72,0.9)');
    g.addColorStop(1, 'rgba(8,10,26,0.92)');
    fillInk(c, g, 1.6);
    rrect(c, 1.5, 1.5, w - 3, h - 3, h / 2 - 1.5);
    c.strokeStyle = self ? 'rgba(255,217,138,0.95)' : 'rgba(224,178,90,0.75)';
    c.lineWidth = 1.2;
    c.stroke();
    glowAt(c, 13, h / 2, 9, 9, color, 0.55);
    c.beginPath();
    c.arc(13, h / 2, 4.6, 0, Math.PI * 2);
    c.fillStyle = rgb(color);
    c.fill();
    c.strokeStyle = 'rgba(10,8,20,0.8)';
    c.lineWidth = 1.2;
    c.stroke();
    c.font = font;
    c.fillStyle = '#fff6e6';
    c.textBaseline = 'middle';
    c.fillText(name, 24, h / 2 + 1);
  }, 2.5);
  tagCache.set(key, t);
  return t;
}

/** Brass plate with the game a player sits at. */
function plateTexture(text: string) {
  let t = plateCache.get(text);
  if (t) return t;
  const font = `700 13px ${FONT_BODY}`;
  const label = text.toUpperCase();
  const w = Math.ceil(measure(font, label) * 1.08 + 34);
  const h = 22;
  t = paint(w + 6, h + 10, (c: Ctx) => {
    c.translate(3, 3);
    rrect(c, 0, 0, w, h, 5);
    fillInk(c, brass(c, 0, 0, w * 0.3, h * 1.6), 1.6);
    // A little chip with a lamp-gold dot, as on the machines.
    c.beginPath();
    c.arc(12, h / 2, 5.5, 0, Math.PI * 2);
    c.fillStyle = '#2a1406';
    c.fill();
    c.beginPath();
    c.arc(12, h / 2, 2.6, 0, Math.PI * 2);
    c.fillStyle = '#ffcf7a';
    c.fill();
    c.font = font;
    c.fillStyle = '#2a1406';
    c.textBaseline = 'middle';
    if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '1px';
    c.fillText(label, 23, h / 2 + 1);
    // Small point under the plate.
    c.beginPath();
    c.moveTo(w / 2 - 5, h);
    c.lineTo(w / 2, h + 6);
    c.lineTo(w / 2 + 5, h);
    c.closePath();
    fillInk(c, '#a06a22', 1.2);
  }, 2.5);
  plateCache.set(text, t);
  return t;
}

const gameName = (id: string) => {
  try {
    return getGame(id).name;
  } catch {
    return id;
  }
};

interface Pop {
  t: Text;
  age: number;
  x0: number;
}

class Figure {
  chibi: Chibi | null = null;
  readonly tag = new Sprite();
  readonly plate = new Sprite();
  readonly bubble = new SpeechBubble();
  readonly pops: Pop[] = [];
  samples: Sample[] = [];
  at: string | null = null;
  look = '';
  x = 0;
  y = 0;
  /** Extra height of the name tag when it has to make room for another. */
  lift = 0;
  liftTo = 0;
  private px = NaN;
  private py = NaN;

  get tagShown() {
    return this.tag.visible;
  }
  get tagWidth() {
    return this.tag.width;
  }
  get tagHeight() {
    return this.tag.height;
  }

  constructor(
    readonly id: string,
    private room: RoomScene,
    readonly self: boolean,
  ) {
    this.tag.anchor.set(0.5, 1);
    this.plate.anchor.set(0.5, 1);
    this.plate.visible = false;
    room.labelLayer.addChild(this.tag, this.plate, this.bubble.view);
  }

  /** Builds or rebuilds the painted figure when the look changes. */
  dress(p: PlayerProfile) {
    const key = JSON.stringify([p.name, p.color, p.skin, p.look]);
    if (key === this.look) return;
    this.look = key;
    this.tag.texture = tagTexture(p.name, p.color, this.self);
    if (this.self) return;
    const old = this.chibi;
    this.chibi = new Chibi(p.color, { skin: p.skin, ...DEFAULT_OUTFITTING, ...p.look });
    if (old) {
      this.chibi.view.position.copyFrom(old.view.position);
      this.chibi.view.alpha = old.view.alpha;
      old.view.destroy({ children: true });
    }
    this.room.figureLayer.addChild(this.chibi.view);
  }

  push(p: Pose, now: number) {
    const last = this.samples[this.samples.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > SNAP) this.samples = [];
    this.samples.push({ t: now, x: p.x, y: p.y, a: p.a });
    if (this.samples.length > 12) this.samples.shift();
    if (p.at !== this.at) {
      this.at = p.at;
      if (p.at) this.plate.texture = plateTexture(gameName(p.at));
    }
  }

  emote(e: string, name: string, isLine: boolean) {
    if (isLine) {
      this.bubble.say(name, e, 'center', 0.9);
      return;
    }
    const t = new Text({ text: e, style: { fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif', fontSize: 40 } });
    t.anchor.set(0.5, 1);
    this.room.labelLayer.addChild(t);
    this.pops.push({ t, age: 0, x0: (Math.random() - 0.5) * 16 });
  }

  update(dtMs: number, now: number, selfView: Container | null) {
    let a = 1;
    if (selfView) {
      this.x = selfView.x;
      this.y = selfView.y;
      a = selfView.alpha;
    } else if (this.chibi && this.samples.length) {
      const t = now - DELAY;
      const s = this.samples;
      let i = s.length - 1;
      while (i > 0 && s[i - 1].t > t) i--;
      const b = s[i];
      const p = s[i - 1];
      if (p && b.t > p.t && t > p.t && t < b.t) {
        const k = (t - p.t) / (b.t - p.t);
        this.x = p.x + (b.x - p.x) * k;
        this.y = p.y + (b.y - p.y) * k;
        a = p.a + (b.a - p.a) * k;
      } else {
        const q = t <= s[0].t ? s[0] : s[s.length - 1];
        this.x = q.x;
        this.y = q.y;
        a = q.a;
      }
      const v = this.chibi.view;
      const dx = this.x - (Number.isNaN(this.px) ? this.x : this.px);
      const dy = this.y - (Number.isNaN(this.py) ? this.y : this.py);
      this.px = this.x;
      this.py = this.y;
      const moving = Math.hypot(dx, dy) > 0.25;
      if (!moving && this.at) this.chibi.faceTowards(-Math.PI / 2);
      this.chibi.update(dtMs, moving ? Math.atan2(dy, dx) : null);
      v.position.set(this.x, this.y);
      v.zIndex = this.y + 16;
      v.alpha = a;
    }
    const show = a > 0.05;
    this.tag.visible = show;
    this.tag.alpha = Math.min(1, a * 1.2);
    // Ease towards the stacking lift so tags don't jump when people pass each other.
    this.lift += (this.liftTo - this.lift) * Math.min(1, dtMs / 90);
    const ty = this.y - TAG_Y - this.lift;
    this.tag.position.set(this.x, ty);
    this.plate.visible = show && !!this.at;
    this.plate.position.set(this.x, ty - 26);
    this.bubble.update(dtMs);
    this.bubble.view.position.set(this.x, ty - (this.plate.visible ? 52 : 28));
    for (const p of [...this.pops]) {
      // Capped step: on a stuttering device the pop still gets its frames instead of skipping them.
      p.age += Math.min(dtMs, 100);
      const k = p.age / 1700;
      p.t.position.set(this.x + p.x0 + Math.sin(k * 8) * 4, ty - 30 - k * 70);
      p.t.alpha = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      p.t.scale.set(k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, k * 0.1));
      if (k >= 1) {
        p.t.destroy();
        this.pops.splice(this.pops.indexOf(p), 1);
      }
    }
  }

  destroy() {
    this.chibi?.view.destroy({ children: true });
    this.tag.destroy();
    this.plate.destroy();
    this.bubble.clear();
    this.bubble.view.destroy();
    for (const p of this.pops) p.t.destroy();
  }
}

export class Remotes {
  private room: RoomScene | null = null;
  private figures = new Map<string, Figure>();
  private latest = new Map<string, Pose>();
  /** Tags and figures are only drawn while in a group. */
  active = false;

  constructor(
    private state: GameState,
    private online: () => string[],
  ) {}

  /** A new room was entered: figures for everybody standing in it. */
  attach(room: RoomScene) {
    this.detach();
    this.room = room;
    this.sync();
  }

  /** Before the room goes: its figures go with it. */
  detach() {
    const alive = this.room && !this.room.view.destroyed;
    if (alive) for (const f of this.figures.values()) f.destroy();
    this.figures.clear();
    this.room = null;
  }

  pose(id: string, p: Pose) {
    if (id === this.state.selfId) return;
    this.latest.set(id, p);
    const room = this.room;
    if (!room || room.view.destroyed) return;
    if (p.r !== room.def.id || !this.active) {
      this.drop(id);
      return;
    }
    this.figure(id)?.push(p, performance.now());
  }

  /** Who is online changed, or a look: figures follow. */
  sync() {
    const room = this.room;
    if (!room || room.view.destroyed) return;
    const ids = this.active ? new Set(this.online()) : new Set<string>();
    for (const id of [...this.figures.keys()]) if (!ids.has(id)) this.drop(id);
    for (const id of ids) {
      if (id === this.state.selfId) {
        this.figure(id);
        continue;
      }
      const p = this.latest.get(id);
      if (p && p.r === room.def.id) this.figure(id)?.push(p, performance.now());
      else this.drop(id);
    }
    for (const [id, f] of this.figures) {
      const prof = this.state.data.players[id];
      if (prof) f.dress(prof);
    }
  }

  forget(id: string) {
    this.latest.delete(id);
    this.drop(id);
  }

  private drop(id: string) {
    const f = this.figures.get(id);
    if (!f) return;
    f.destroy();
    this.figures.delete(id);
  }

  private figure(id: string) {
    const room = this.room;
    if (!room || room.view.destroyed) return null;
    let f = this.figures.get(id);
    if (!f) {
      const prof = this.state.data.players[id];
      if (!prof) return null;
      f = new Figure(id, room, id === this.state.selfId);
      f.dress(prof);
      this.figures.set(id, f);
    }
    return f;
  }

  /** True if the player's figure can be seen right now (else a reaction comes as a toast). */
  visible(id: string) {
    return !!this.figures.get(id) && (id === this.state.selfId || (this.latest.get(id)?.a ?? 0) > 0.05);
  }

  emote(id: string, e: string, isLine: boolean) {
    const f = this.figures.get(id);
    f?.emote(e, this.state.data.players[id]?.name ?? '', isLine);
  }

  update(dtMs: number) {
    const room = this.room;
    if (!room || room.view.destroyed || !this.figures.size) return;
    const now = performance.now();
    const figs = [...this.figures.values()];
    for (const f of figs) f.update(dtMs, now, f.self ? room.player.view : null);
    // Stack the tags of people standing close together (front figure keeps its place).
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const f of figs.filter((f) => f.tagShown).sort((a, b) => b.y - a.y)) {
      const w = f.tagWidth;
      const h = f.tagHeight + 2;
      let lift = 0;
      for (let moved = true; moved; ) {
        moved = false;
        for (const o of placed) {
          const y = f.y - lift;
          if (Math.abs(o.x - f.x) < (o.w + w) / 2 && Math.abs(o.y - y) < h) {
            lift = f.y - (o.y - h);
            moved = true;
          }
        }
      }
      placed.push({ x: f.x, y: f.y - lift, w, h });
      f.liftTo = lift;
    }
  }

  clear() {
    const room = this.room;
    this.detach();
    this.room = room;
    this.latest.clear();
  }
}
