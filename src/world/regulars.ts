// The regulars in a room (src/core/story.ts): painted chibis with a fixed look and a prop of
// their own (croupier's rake, tray, magnifier, butterfly net, chips that become a pocket watch),
// standing on a fixed free spot. A lilac moon bubble shows when they have something new to
// tell. Talking shows the next line in a painted speech bubble above them.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, announce, reducedMotion } from '../core/fx';
import { getGame, type RoomDefinition } from '../core/registry';
import type { GameState } from '../core/state';
import { hasNews, hear, midConversation, nextLine, propFor, regular, regularsIn, type RegularDef, type RegularProp } from '../core/story';
import { SpeechBubble } from '../ui/bubble';
import { sfx } from '../core/audio';
import { Chibi } from './painted/chibi';
import { GOLD, INK, ellipse, fillInk, glowAt, gold, paint, rgb, rrect } from './painted/brush';
import type { Rect } from './decor';
import { WALL_H } from './styles';

export interface RegularsHost {
  entities: Container;
  fx: Container;
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  collides(x: number, y: number): boolean;
  player(): { x: number; y: number };
  /** The prompt shows the nearest interactable's title; call after a title changed. */
  refreshPrompt(): void;
}

type RegularInteractable = { kind: 'extra'; id: string; x: number; y: number; title: string };

interface Placed {
  r: RegularDef;
  p: Chibi;
  x: number;
  y: number;
  marker: Sprite;
  name: Text;
  prop: Sprite;
  propKind: RegularProp;
  it: RegularInteractable;
  ph: number;
  news: boolean;
}

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

/** Lilac bubble with a crescent moon: "has something new to tell" (quest guests use a yellow "!"). */
function markerTexture() {
  return cached('reg-marker', () =>
    paint(48, 54, (c) => {
      const cx = 24;
      const cy = 22;
      glowAt(c, cx, cy, 24, 22, 0xc9a0ff, 0.35);
      c.beginPath();
      c.ellipse(cx, cy, 17, 16, 0, 0, Math.PI * 2);
      c.moveTo(cx - 6, cy + 13);
      c.lineTo(cx, cy + 25);
      c.lineTo(cx + 5, cy + 13);
      const g = c.createLinearGradient(0, cy - 16, 0, cy + 16);
      g.addColorStop(0, '#f4ecff');
      g.addColorStop(1, '#b48ae0');
      fillInk(c, g, 2.2);
      c.beginPath();
      c.ellipse(cx - 6, cy - 8, 6, 3, -0.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fill();
      // Crescent moon.
      c.beginPath();
      c.arc(cx + 1, cy + 1, 8.5, 0, Math.PI * 2);
      c.arc(cx + 5, cy - 2, 7, 0, Math.PI * 2, true);
      c.fillStyle = '#4a2370';
      c.fill('evenodd');
      c.beginPath();
      c.arc(cx + 9, cy + 7, 1.4, 0, Math.PI * 2);
      c.fillStyle = '#4a2370';
      c.fill();
    }, 3),
  );
}

/** Painted props; the hand is at (PX, PY) of the canvas. */
const PW = 44;
const PH = 96;
const PX = 14;
const PY = 70;

function propTexture(kind: RegularProp) {
  return cached(`reg-prop-${kind}`, () =>
    paint(PW, PH, (c) => {
      c.translate(PX, PY);
      if (kind === 'rake') {
        // Croupier's rake: long dark stick, brass ferrule, a flat blade on top.
        c.beginPath();
        c.moveTo(0, 18);
        c.lineTo(4, -62);
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.stroke();
        c.strokeStyle = '#6a3a1e';
        c.lineWidth = 3;
        c.stroke();
        rrect(c, 2.4, -50, 4, 6, 1.5);
        fillInk(c, gold(c, 2, -50, 7, -44), 1);
        c.save();
        c.translate(4.2, -63);
        c.rotate(0.05);
        rrect(c, -11, -3, 22, 6, 2);
        fillInk(c, '#3a1e10', 1.6);
        c.restore();
      } else if (kind === 'tray') {
        // Silver tray at shoulder height with a tall glass of lemonade.
        c.translate(4, -38);
        ellipse(c, 0, 0, 17, 5);
        const g = c.createLinearGradient(-17, 0, 17, 0);
        g.addColorStop(0, '#f4f4f8');
        g.addColorStop(0.5, '#a8acb8');
        g.addColorStop(1, '#e4e4ec');
        fillInk(c, g, 1.6);
        rrect(c, -4, -18, 8, 17, 2);
        const lg = c.createLinearGradient(0, -18, 0, 0);
        lg.addColorStop(0, 'rgba(255,240,180,0.85)');
        lg.addColorStop(1, 'rgba(240,170,60,0.95)');
        fillInk(c, lg, 1.3);
        c.beginPath();
        c.moveTo(2, -18);
        c.lineTo(6, -26);
        c.strokeStyle = '#e04a6a';
        c.lineWidth = 1.6;
        c.stroke();
        c.beginPath();
        c.arc(-1, -14, 2.4, 0, Math.PI * 2);
        c.fillStyle = '#7bd47b';
        c.fill();
      } else if (kind === 'magnifier') {
        c.beginPath();
        c.moveTo(0, 2);
        c.lineTo(6, -14);
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.stroke();
        c.strokeStyle = '#3a2214';
        c.lineWidth = 3;
        c.stroke();
        c.beginPath();
        c.arc(9, -22, 8.5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(190,230,255,0.45)';
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 4;
        c.stroke();
        c.strokeStyle = rgb(GOLD);
        c.lineWidth = 2.2;
        c.stroke();
        c.beginPath();
        c.arc(7, -24, 3.5, Math.PI, Math.PI * 1.6);
        c.strokeStyle = 'rgba(255,255,255,0.85)';
        c.lineWidth = 1.5;
        c.stroke();
      } else if (kind === 'net') {
        // Butterfly net on a long pole, leaning over the shoulder.
        c.beginPath();
        c.moveTo(0, 16);
        c.lineTo(10, -50);
        c.strokeStyle = INK;
        c.lineWidth = 4.5;
        c.stroke();
        c.strokeStyle = '#b8864a';
        c.lineWidth = 2.6;
        c.stroke();
        c.beginPath();
        c.ellipse(13, -60, 11, 8, -0.3, 0, Math.PI * 2);
        c.strokeStyle = INK;
        c.lineWidth = 3.4;
        c.stroke();
        c.strokeStyle = '#d8d2c4';
        c.lineWidth = 1.8;
        c.stroke();
        c.beginPath();
        c.moveTo(3, -56);
        c.quadraticCurveTo(14, -30, 24, -62);
        c.fillStyle = 'rgba(240,240,250,0.45)';
        c.fill();
        c.strokeStyle = 'rgba(200,200,220,0.8)';
        c.lineWidth = 1;
        c.stroke();
      } else if (kind === 'chips') {
        // A short stack of chips in the hand.
        for (let i = 0; i < 4; i++) {
          ellipse(c, 2, -2 - i * 3, 7, 3);
          fillInk(c, i % 2 ? '#c8243a' : '#2f6fd6', 1.2);
          ellipse(c, 2, -2 - i * 3, 4, 1.6);
          c.strokeStyle = 'rgba(255,255,255,0.6)';
          c.lineWidth = 0.8;
          c.stroke();
        }
      } else {
        // Pocket watch on a chain: the alarm that tells Jonas when the evening is over.
        c.beginPath();
        c.moveTo(-2, -24);
        c.quadraticCurveTo(-5, -8, 2, -4);
        c.strokeStyle = rgb(GOLD);
        c.lineWidth = 1.4;
        c.stroke();
        c.beginPath();
        c.arc(3, 0, 7, 0, Math.PI * 2);
        fillInk(c, gold(c, -4, -7, 10, 7), 1.6);
        c.beginPath();
        c.arc(3, 0, 5, 0, Math.PI * 2);
        c.fillStyle = '#fff8e6';
        c.fill();
        c.strokeStyle = '#2a1406';
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(3, 0);
        c.lineTo(3, -3.6);
        c.moveTo(3, 0);
        c.lineTo(5.4, 1);
        c.stroke();
      }
    }, 3),
  );
}

/** Where the prop's hand point sits on the chibi (view coordinates before its 0.82 scale). */
const HAND: Record<RegularProp, { x: number; y: number }> = {
  rake: { x: 15, y: -14 },
  tray: { x: 14, y: -14 },
  magnifier: { x: -15, y: -12 },
  net: { x: -15, y: -12 },
  chips: { x: 15, y: -12 },
  watch: { x: 15, y: -10 },
};

export class Regulars {
  private placed: Placed[] = [];
  private own: RegularInteractable[] = [];
  private ownObstacles: Rect[] = [];
  private bubble = new SpeechBubble();
  /** Who the bubble belongs to. */
  private speaker: Placed | null = null;
  private time = 0;
  private sig = '';
  private off: () => void;

  constructor(
    private state: GameState,
    private def: RoomDefinition,
    private host: RegularsHost,
  ) {
    this.host.fx.addChild(this.bubble.view);
    this.place();
    this.sig = this.signature();
    // Markers and prompt titles follow the story (a medal or a chapter can open new lines).
    this.off = state.onChange(() => {
      const s = this.signature();
      if (s === this.sig) return;
      this.sig = s;
      this.refresh();
    });
  }

  private signature() {
    return this.placed.map((x) => `${x.r.id}:${hasNews(this.state.data, x.r.id) ? 1 : 0}:${propFor(this.state.data, x.r)}`).join('|');
  }

  /** A free floor spot near `near` (all points within `r` walkable), away from other interactables. */
  private freeSpot(near: { x: number; y: number }, r: number, keep: number, tall: number) {
    const { width: W, height: H } = this.def;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = WALL_H + 60; y < H - 70; y += 20)
      for (let x = 70; x < W - 70; x += 20) {
        const dd = Math.hypot(x - near.x, y - near.y);
        if (dd >= bestD) continue;
        if (this.host.interactables.some((i) => Math.hypot(i.x - x, i.y - y) < keep)) continue;
        if (Math.hypot(x - this.def.elevatorX, y - WALL_H) < 150) continue;
        if (Math.hypot(x - this.def.spawn.x, y - this.def.spawn.y) < 90) continue;
        // Not in front of a machine or under its name sign.
        if (this.def.stations.some((st) => {
          const f = getGame(st.game).footprint;
          return x > st.x - 40 && x < st.x + f.w + 40 && y > st.y - 170 && y < st.y + f.h + 60;
        })) continue;
        let ok = true;
        for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, -r], [-r, r], [r, r], [0, -tall], [0, -tall / 2]])
          if (this.host.collides(x + dx, y + dy)) {
            ok = false;
            break;
          }
        if (ok) {
          best = { x, y };
          bestD = dd;
        }
      }
    return best;
  }

  private place() {
    const d = this.state.data;
    const { width: W, height: H } = this.def;
    regularsIn(d, this.def.id).forEach((r, i) => {
      const s = r.spot(this.def.id);
      const at = this.freeSpot({ x: s.x * W, y: s.y * H }, 26, 100, 80);
      if (!at) return;
      const p = new Chibi(r.color, r.look);
      p.view.position.set(at.x, at.y);
      p.view.zIndex = at.y + 16;
      p.faceTowards(Math.PI / 2);
      this.host.entities.addChild(p.view);
      const propKind = propFor(d, r);
      const prop = new Sprite(propTexture(propKind));
      prop.anchor.set(PX / PW, PY / PH);
      p.view.addChild(prop);
      const marker = new Sprite(markerTexture());
      marker.anchor.set(0.5, 1);
      marker.position.set(0, -(p.headroom - 22) / 0.82);
      p.view.addChild(marker);
      const name = new Text({ text: r.tag.toUpperCase(), style: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 1.5, stroke: { color: 0x1a0b10, width: 3 } } });
      name.anchor.set(0.5, 0);
      name.position.set(0, 10);
      name.alpha = 0;
      p.view.addChild(name);
      const it: RegularInteractable = { kind: 'extra', id: `regular:${r.id}`, x: at.x, y: at.y + 40, title: '' };
      const o = { x: at.x - 14, y: at.y - 10, w: 28, h: 16 };
      this.host.obstacles.push(o);
      this.ownObstacles.push(o);
      this.host.interactables.push(it);
      this.own.push(it);
      const pl: Placed = { r, p, x: at.x, y: at.y, marker, name, prop, propKind, it, ph: i * 2.1 + 0.5, news: false };
      this.setProp(pl, propKind);
      this.placed.push(pl);
    });
    this.refresh();
  }

  private setProp(pl: Placed, kind: RegularProp) {
    pl.propKind = kind;
    pl.prop.texture = propTexture(kind);
    const h = HAND[kind];
    pl.prop.position.set(h.x, h.y);
  }

  /** Markers, props and prompt titles from the story state. */
  private refresh() {
    const d = this.state.data;
    for (const pl of this.placed) {
      const news = hasNews(d, pl.r.id);
      pl.news = news;
      const kind = propFor(d, pl.r);
      if (kind !== pl.propKind) this.setProp(pl, kind);
      pl.it.title = midConversation(d, pl.r.id) ? `${pl.r.tag}: weiter zuhören` : news ? `${pl.r.tag} zuhören` : `Mit ${pl.r.tag} plaudern`;
    }
    this.host.refreshPrompt();
  }

  /** Talks to a regular (interactable id `regular:<id>`). False if the id is not one of ours. */
  talk(id: string): boolean {
    if (!id.startsWith('regular:')) return false;
    const pl = this.placed.find((x) => `regular:${x.r.id}` === id);
    const r = regular(id.slice(8));
    if (!pl || !r) return true;
    const line = nextLine(this.state.data, r.id);
    if (!line) return true;
    hear(this.state, r.id, line);
    sfx.click();
    this.speaker = pl;
    this.bubble.say(r.tag, line.text, 'center', 1);
    this.bubble.view.position.set(pl.x, pl.y - 128);
    announce(`${r.name}: ${line.text}`);
    pl.p.faceTowards(Math.atan2(this.host.player().y - pl.y, this.host.player().x - pl.x));
    this.state.emit();
    this.refresh();
    return true;
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const t = this.time;
    const you = this.host.player();
    for (const pl of this.placed) {
      pl.marker.y = -(pl.p.headroom - 22) / 0.82 + (reducedMotion() ? 0 : Math.sin(t * 2.6 + pl.ph) * 3);
      // The marker steps aside while the regular talks.
      pl.marker.visible = pl.news && !(this.speaker === pl && this.bubble.showing);
      const near = Math.hypot(you.x - pl.x, you.y - pl.y);
      if (near < 170) pl.p.faceTowards(Math.atan2(you.y - pl.y, you.x - pl.x));
      else pl.p.faceTowards(Math.PI / 2);
      // Name under the feet when you come close.
      const want = near < 230 ? 0.9 : 0;
      pl.name.alpha += (want - pl.name.alpha) * Math.min(1, dtMs / 150);
      pl.p.update(dtMs, null);
    }
    this.bubble.update(dtMs);
    // Walked far away: the bubble fades.
    if (this.speaker && this.bubble.showing && Math.hypot(you.x - this.speaker.x, you.y - this.speaker.y) > 420) this.bubble.hide();
  }

  destroy() {
    this.off();
    this.bubble.clear();
    this.bubble.view.destroy({ children: true });
    for (const pl of this.placed) pl.p.view.destroy({ children: true });
    this.placed = [];
    const ia = this.host.interactables;
    for (const o of this.own) {
      const k = ia.indexOf(o);
      if (k >= 0) ia.splice(k, 1);
    }
    const ob = this.host.obstacles;
    for (const o of this.ownObstacles) {
      const k = ob.indexOf(o);
      if (k >= 0) ob.splice(k, 1);
    }
    this.own = [];
    this.ownObstacles = [];
  }
}
