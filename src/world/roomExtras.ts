// What today brings into a room: the day event (candlelight in a power cut, closed games
// with a sign), guests with a task ("!" bubble above their head), the regulars' upgrades
// from full stamp cards (gold felt, golden cabinets, a golden moth statue) and, in the
// foyer, the stamp card stand next to the reception. Rebuilt when the state changes.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, glowTexture } from '../core/fx';
import { allRooms, getGame, type RoomDefinition, type StationPlacement } from '../core/registry';
import { floorForDay, type GameState, type Quest } from '../core/state';
import { closedGames, currentEvent } from '../core/events';
import { STAMP_REWARDS, hasReward } from '../core/stamps';
import { Chibi } from './painted/chibi';
import { paintedStation } from './painted/stations';
import { buildPaintedDecor } from './painted';
import { GOLD, INK, ellipse, fillInk, glowAt, gold, paint, propSprite, rgb, rrect, seeded, shadow } from './painted/brush';
import type { PlayerLook } from './player';
import type { Rect } from './decor';
import { WALL_H } from './styles';
import { programBoardSprite } from './programBoard';
import { floorPlan } from '../ui/schedule';

/** The bits of the room the extras build into. */
export interface ExtrasHost {
  /** Where guests stand; spots at closed games are taken out before the guests arrive. */
  spots: { x: number; y: number; fx?: { x: number; y: number }; kind: string }[];
  world: Container;
  entities: Container;
  lights: Container;
  fx: Container;
  /** The room's interactables (extras add and remove their own). */
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  collides(x: number, y: number): boolean;
  player(): { x: number; y: number };
}

export type ExtraInteractable = { kind: 'extra'; id: string; x: number; y: number; title: string };

interface Giver {
  q: Quest;
  p: Chibi;
  bubble: Sprite;
  label: Text | null;
  state: string;
  x: number;
  y: number;
  ph: number;
}

const SKIN = [0xe8b48a, 0xc68a5e, 0x8d5a3b, 0xf1c9a5, 0x6b4127];
const HAIR = [0x2a1a10, 0x6b3a1e, 0xd9b26a, 0x1b1b22, 0x9a9a9a, 0xb3402a];
const DRESS = [0x6b1a2e, 0x1f5a44, 0x26305a, 0xb8862f, 0x5a2a6a, 0xa24a6a];
const JACKET = [0x1d2a4a, 0x3a1a2a, 0x1f3a2a, 0x4a2a14, 0x2a2a2a];

/** A fixed look per guest name, so the same guest always looks the same. */
export function giverLook(name: string): { color: number; look: PlayerLook } {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = seeded(h);
  const p = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const lady = /Gräfin|Madame|Tante|Fräulein|Signora/.test(name);
  const look: PlayerLook = lady
    ? { skin: p(SKIN), hair: p(HAIR), outfit: 'dress', jacket: p(DRESS), hairStyle: p(['long', 'bun', 'curly'] as const), accessory: 'necklace' }
    : { skin: p(SKIN), hair: p(HAIR), outfit: 'suit', jacket: p(JACKET), hairStyle: p(['short', 'sidePart', 'curly'] as const), hat: r() < 0.4 ? 'topHat' : 'none', hatColor: 0x1b1b22, accessory: 'bowTie' };
  return { color: 0xffcf7a, look };
}

// ---- Painted bits ------------------------------------------------------------------------------

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

/** Speech bubble above a guest: "!" (has a task), "…" (working on it), "✓" (done). */
function bubbleTexture(kind: 'open' | 'busy' | 'done') {
  return cached(`qbubble-${kind}`, () =>
    paint(48, 54, (c) => {
      const cx = 24;
      const cy = 22;
      const fill = kind === 'done' ? ['#c8f0c0', '#4f9a5a'] : kind === 'busy' ? ['#fff6e0', '#d9c08a'] : ['#fff4c8', '#e6b84a'];
      glowAt(c, cx, cy, 24, 22, kind === 'done' ? 0x7bd47b : 0xffcf7a, 0.35);
      c.beginPath();
      c.ellipse(cx, cy, 17, 16, 0, 0, Math.PI * 2);
      c.moveTo(cx - 6, cy + 13);
      c.lineTo(cx, cy + 25);
      c.lineTo(cx + 5, cy + 13);
      const g = c.createLinearGradient(0, cy - 16, 0, cy + 16);
      g.addColorStop(0, fill[0]);
      g.addColorStop(1, fill[1]);
      fillInk(c, g, 2.2);
      c.beginPath();
      c.ellipse(cx - 6, cy - 8, 6, 3, -0.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      if (kind === 'open') {
        c.font = '700 26px "Barlow Condensed", sans-serif';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(255,248,226,0.9)';
        c.strokeText('!', cx, cy + 1);
        c.fillStyle = '#b8243a';
        c.fillText('!', cx, cy + 1);
      } else if (kind === 'done') {
        c.beginPath();
        c.moveTo(cx - 8, cy);
        c.lineTo(cx - 2, cy + 6);
        c.lineTo(cx + 9, cy - 7);
        c.strokeStyle = '#1f5a2a';
        c.lineWidth = 4.5;
        c.stroke();
      } else {
        for (const dx of [-7, 0, 7]) {
          c.beginPath();
          c.arc(cx + dx, cy + 1, 2.6, 0, Math.PI * 2);
          c.fillStyle = '#6a4210';
          c.fill();
        }
      }
    }, 3),
  );
}

/** Small hanging board "GESCHLOSSEN" for a closed game. */
function closedSignTexture() {
  return cached('closed-sign', () =>
    paint(76, 46, (c) => {
      // Strings to the hook.
      c.strokeStyle = 'rgba(40,24,12,0.9)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(14, 18);
      c.lineTo(38, 3);
      c.lineTo(62, 18);
      c.stroke();
      c.beginPath();
      c.arc(38, 3, 2.4, 0, Math.PI * 2);
      c.fillStyle = gold(c, 35, 0, 41, 6);
      c.fill();
      rrect(c, 5, 16, 66, 24, 5);
      const g = c.createLinearGradient(0, 16, 0, 40);
      g.addColorStop(0, '#8a5a32');
      g.addColorStop(1, '#4a2a14');
      fillInk(c, g, 2);
      rrect(c, 8, 19, 60, 18, 3);
      c.strokeStyle = 'rgba(255,220,160,0.35)';
      c.lineWidth = 1;
      c.stroke();
      c.font = '700 12px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#fff1c4';
      c.fillText('GESCHLOSSEN', 38, 28.5);
    }, 3),
  );
}

/** A little brass easel with the stamp card, next to the reception desk. */
function stampStand(x: number, y: number) {
  return propSprite(x, y, 70, 96, 35, 84, (c) => {
    shadow(c, 0, 4, 22, 7, 0.5);
    // Easel legs.
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-14, 4);
    c.lineTo(0, -60);
    c.lineTo(14, 4);
    c.moveTo(0, -60);
    c.lineTo(0, 2);
    c.stroke();
    c.strokeStyle = rgb(GOLD);
    c.lineWidth = 2.2;
    c.stroke();
    // The card.
    c.save();
    c.translate(0, -36);
    c.rotate(-0.05);
    rrect(c, -24, -18, 48, 32, 3);
    const g = c.createLinearGradient(0, -18, 0, 14);
    g.addColorStop(0, '#fbf1da');
    g.addColorStop(1, '#e2cfa4');
    fillInk(c, g, 1.6);
    c.fillStyle = '#7a1d34';
    c.fillRect(-24, -18, 48, 7);
    for (let i = 0; i < 8; i++) {
      const sx = -16 + (i % 4) * 10.6;
      const sy = -4 + Math.floor(i / 4) * 10;
      c.beginPath();
      c.arc(sx, sy, 3.6, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(122,29,52,0.6)';
      c.lineWidth = 1;
      c.stroke();
      if (i < 5) {
        c.fillStyle = 'rgba(184,36,58,0.75)';
        c.fill();
      }
    }
    c.restore();
    // Ledge.
    rrect(c, -20, -20, 40, 5, 2);
    fillInk(c, gold(c, -20, -20, 20, -15), 1.2);
  });
}

// ---- The extras ---------------------------------------------------------------------------------

export class RoomExtras {
  /** Everything the extras put into the room's layers, destroyed on rebuild. */
  private loose: Container[] = [];
  private dim: Graphics | null = null;
  private glows: { s: Sprite; a: number; ph: number }[] = [];
  private lantern: Sprite | null = null;
  private givers: Giver[] = [];
  private own: ExtraInteractable[] = [];
  private ownObstacles: Rect[] = [];
  private stationTex = new Map<Container, Texture>();
  /** Guest spots taken out at closed games; put back on rebuild. */
  private hiddenSpots: ExtrasHost['spots'] = [];
  private sig = '';
  private time = 0;
  private off: () => void;

  constructor(
    private state: GameState,
    private def: RoomDefinition,
    private host: ExtrasHost,
  ) {
    this.build();
    this.off = state.onChange(() => {
      if (this.signature() !== this.sig) this.build();
    });
  }

  /** What the room shows depends on these; rebuilt when they change. */
  private signature() {
    const d = this.state.data;
    return [d.event, d.evening.number, d.season.number, d.counters.rotSalt ?? 0, d.stampRewards.join(','), closedGames(d).join(','), d.quests.map((q) => `${q.id}:${q.accepted ? 1 : 0}${q.done ? 1 : 0}:${q.have}`).join('|')].join('#');
  }

  /** Rebuilds now if what the room shows has changed (instead of waiting for the next state change). */
  refresh() {
    if (this.signature() !== this.sig) this.build();
  }

  private get today() {
    return this.def.floor > 0 && this.def.floor === floorForDay(this.state.data.evening.number);
  }

  private clear() {
    for (const c of this.loose) if (!c.destroyed) c.destroy({ children: true });
    this.loose = [];
    for (const g of this.givers) g.p.view.destroy({ children: true });
    this.givers = [];
    for (const gl of this.glows) gl.s.destroy();
    this.glows = [];
    this.lantern?.destroy();
    this.lantern = null;
    this.dim?.destroy();
    this.dim = null;
    const ia = this.host.interactables;
    for (const o of this.own) {
      const k = ia.indexOf(o);
      if (k >= 0) ia.splice(k, 1);
    }
    this.own = [];
    const ob = this.host.obstacles;
    for (const o of this.ownObstacles) {
      const k = ob.indexOf(o);
      if (k >= 0) ob.splice(k, 1);
    }
    this.ownObstacles = [];
    this.host.spots.push(...this.hiddenSpots);
    this.hiddenSpots = [];
  }

  private build() {
    this.sig = this.signature();
    this.clear();
    const d = this.state.data;
    const ev = this.def.floor > 0 ? currentEvent(d) : null;
    this.stationLooks(this.def.floor > 0 ? closedGames(d) : []);
    if (this.def.floor > 0 && hasReward(d, this.def.id)) this.statue();
    if (ev?.dark) this.candlelight();
    if (this.today) this.placeGivers();
    if (this.def.floor === 0) this.receptionStand();
    if (this.def.floor === 0) this.programBoard();
  }

  // ---- Stations: closed games and golden upgrades ---------------------------------------------

  private stationView(st: StationPlacement) {
    return this.host.entities.children.find((c) => c.x === st.x && c.y === st.y && !this.loose.includes(c)) as Container | undefined;
  }

  private stationLooks(closed: string[]) {
    const reward = this.def.floor > 0 && hasReward(this.state.data, this.def.id) ? STAMP_REWARDS[this.def.id] : null;
    for (const st of this.def.stations) {
      const c = this.stationView(st);
      if (!c) continue;
      const body = c.children[0] as Sprite | undefined;
      if (!(body instanceof Sprite)) continue;
      // Gold felt and golden cabinets: repaint only the body sprite.
      const opts = { ...(st.options ?? {}) };
      if (reward?.felt && st.game === 'roulette') opts.goldFelt = true;
      if (reward?.goldSlots && st.game === 'slots') opts.theme = 'gold';
      const want = opts.goldFelt || (opts.theme === 'gold' && st.options?.theme !== 'gold');
      if (want && !this.stationTex.has(c)) {
        const p = paintedStation(st.game, opts);
        const s = p?.children[0];
        if (s instanceof Sprite) {
          this.stationTex.set(c, body.texture);
          body.texture = s.texture;
          // Glints on the new gold.
          const g = new Sprite(glowTexture());
          g.anchor.set(0.5);
          g.tint = 0xffd890;
          g.blendMode = 'add';
          g.alpha = 0.25;
          const f = getGame(st.game).footprint;
          g.position.set(st.x + f.w / 2, st.y + f.h / 2 - 10);
          g.width = f.w * 2;
          g.height = f.h * 2;
          this.put(g, this.host.lights);
        }
        p?.destroy({ children: true });
      }
      // Closed: dark machine, lamp off, a sign hanging in front.
      const isClosed = closed.includes(st.game);
      c.tint = isClosed ? 0x4a4258 : 0xffffff;
      const lamp = c.children.find((ch) => ch.label === 'lamp');
      if (lamp) lamp.visible = !isClosed;
      if (isClosed) {
        // Nobody plays here today.
        const fx = { x: st.x + getGame(st.game).footprint.w / 2, y: st.y + 10 };
        const sp = this.host.spots;
        for (let k = sp.length - 1; k >= 0; k--) if (sp[k].kind === 'station' && sp[k].fx?.x === fx.x && sp[k].fx?.y === fx.y) this.hiddenSpots.push(...sp.splice(k, 1));
        const f = getGame(st.game).footprint;
        const s = new Sprite(closedSignTexture());
        s.anchor.set(0.5, 0.1);
        s.position.set(st.x + f.w / 2, st.y + f.h - 36);
        s.rotation = (((st.x * 7 + st.y) % 5) - 2) * 0.03;
        s.zIndex = st.y + f.h + 2;
        s.scale.set(0.85);
        this.put(s);
      }
    }
  }

  // ---- Statue from a full stamp card -------------------------------------------------------------

  /** A free floor spot (all points within `r` walkable), nearest to `near`, away from things you use. */
  private freeSpot(near: { x: number; y: number }, r: number, keep = 100, avoid: { x: number; y: number }[] = [], tall = 0) {
    const { width: W, height: H } = this.def;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = WALL_H + 60; y < H - 70; y += 20)
      for (let x = 70; x < W - 70; x += 20) {
        const dd = Math.hypot(x - near.x, y - near.y);
        if (dd >= bestD) continue;
        if (this.host.interactables.some((i) => Math.hypot(i.x - x, i.y - y) < keep)) continue;
        if (avoid.some((a) => Math.hypot(a.x - x, a.y - y) < keep * 1.6)) continue;
        if (Math.hypot(x - this.def.elevatorX, y - WALL_H) < 150) continue;
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

  private statue() {
    const side = this.def.elevatorX < this.def.width / 2 ? 1 : -1;
    const at = this.freeSpot({ x: this.def.width / 2 + side * 300, y: WALL_H + 130 }, 34, 80);
    if (!at) return;
    const parts = buildPaintedDecor({ kind: 'statue', x: at.x, y: at.y }, { ...this.def.theme, style: 'velvet', wallTrim: GOLD });
    const b = parts?.[0];
    if (!b) return;
    b.view.zIndex = b.z ?? at.y + 28;
    this.put(b.view);
    for (const o of b.obstacles) {
      this.host.obstacles.push(o);
      this.ownObstacles.push(o);
    }
    const g = new Sprite(glowTexture());
    g.anchor.set(0.5);
    g.position.set(at.x, at.y - 70);
    g.width = 150;
    g.height = 170;
    g.tint = 0xffd890;
    g.blendMode = 'add';
    g.alpha = 0.3;
    this.host.lights.addChild(g);
    this.glows.push({ s: g, a: 0.3, ph: 1 });
    const t = new Text({ text: 'STAMMGAST', style: { fontFamily: FONT_BODY, fontSize: 11, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2, stroke: { color: 0x1a0b10, width: 3 } } });
    t.anchor.set(0.5, 0);
    t.position.set(at.x, at.y + 30);
    t.alpha = 0.85;
    t.zIndex = at.y + 40;
    this.put(t);
  }

  /** Adds a piece to one of the room's layers (entities by default) and remembers it. */
  private put(c: Container, layer = this.host.entities) {
    layer.addChild(c);
    this.loose.push(c);
  }

  // ---- Power cut: only candles -------------------------------------------------------------------

  private candlelight() {
    const { width: W, height: H } = this.def;
    this.dim = new Graphics().rect(-40, -40, W + 80, H + 80).fill({ color: 0x07040e, alpha: 0.6 });
    this.dim.eventMode = 'none';
    const w = this.host.world;
    w.addChildAt(this.dim, w.getChildIndex(this.host.lights));
    const glow = (x: number, y: number, r: number, a: number, tint = 0xffb45a) => {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.width = r * 2;
      s.height = r * 1.6;
      s.tint = tint;
      s.blendMode = 'add';
      s.alpha = a;
      this.host.lights.addChild(s);
      this.glows.push({ s, a, ph: Math.random() * 10 });
    };
    // Candles on the open tables and machines, in the sconces and chandeliers.
    for (const st of this.def.stations) {
      if (currentEvent(this.state.data)?.closed?.includes(st.game)) continue;
      const f = getGame(st.game).footprint;
      glow(st.x + f.w / 2, st.y + f.h / 2, Math.max(f.w, 70) * 1.3, 0.42);
      this.candle(st.x + f.w * 0.78, st.y + f.h * 0.4, st.y + f.h + 1);
    }
    for (const dc of this.def.decor) {
      if (dc.kind === 'sconce') glow(dc.x, 70, 80, 0.4);
      else if (dc.kind === 'chandelier') glow(dc.x, dc.y, (dc.w ?? 46) * 3, 0.3);
      else if (dc.kind === 'table' || dc.kind === 'bar' || dc.kind === 'piano') {
        glow(dc.x, dc.y, 90, 0.3);
        this.candle(dc.x, dc.y - 10, dc.y + 40);
      }
    }
    // The player carries a little light of their own.
    const l = new Sprite(glowTexture());
    l.anchor.set(0.5);
    l.width = 260;
    l.height = 200;
    l.tint = 0xffc070;
    l.blendMode = 'add';
    l.alpha = 0.28;
    this.host.lights.addChild(l);
    this.lantern = l;
    void W;
    void H;
  }

  /** A painted candle with its flame, standing on something. */
  private candle(x: number, y: number, z: number) {
    const s = new Sprite(
      cached('candle', () =>
        paint(20, 34, (c) => {
          glowAt(c, 10, 8, 10, 10, 0xffc060, 0.6);
          rrect(c, 6, 14, 8, 16, 2);
          const g = c.createLinearGradient(6, 0, 14, 0);
          g.addColorStop(0, '#fff6e0');
          g.addColorStop(1, '#d9c8a8');
          fillInk(c, g, 1.2);
          ellipse(c, 10, 9, 3, 5.5);
          c.fillStyle = '#ffd36a';
          c.fill();
          ellipse(c, 10, 10, 1.4, 2.6);
          c.fillStyle = '#fff8e0';
          c.fill();
        }, 3),
      ),
    );
    s.anchor.set(0.5, 0.9);
    s.position.set(x, y);
    s.zIndex = z;
    this.put(s);
  }

  // ---- Guests with a task -----------------------------------------------------------------------

  private placeGivers() {
    const qs = this.state.data.quests;
    const taken: { x: number; y: number }[] = [];
    const { width: W, height: H } = this.def;
    // Spread them out: one near the middle, the others towards the sides.
    const anchors = [
      { x: W * 0.55, y: H * 0.62 },
      { x: W * 0.3, y: H * 0.78 },
      { x: W * 0.78, y: H * 0.5 },
    ];
    qs.forEach((q, i) => {
      const at = this.freeSpot(anchors[i % anchors.length], 26, 80, taken, 80);
      if (!at) return;
      taken.push(at);
      const { color, look } = giverLook(q.giver);
      const p = new Chibi(color, look);
      p.view.position.set(at.x, at.y);
      p.view.zIndex = at.y + 16;
      p.faceTowards(Math.PI / 2);
      this.host.entities.addChild(p.view);
      const bubble = new Sprite(bubbleTexture('open'));
      bubble.anchor.set(0.5, 1);
      bubble.position.set(0, -(p.headroom - 22) / 0.82);
      p.view.addChild(bubble);
      const g: Giver = { q, p, bubble, label: null, state: '', x: at.x, y: at.y, ph: i * 1.7 };
      this.setBubble(g);
      this.givers.push(g);
      const o = { x: at.x - 14, y: at.y - 10, w: 28, h: 16 };
      this.host.obstacles.push(o);
      this.ownObstacles.push(o);
      const it: ExtraInteractable = { kind: 'extra', id: `quest:${q.id}`, x: at.x, y: at.y + 40, title: q.done ? `${q.giver} danken` : q.accepted ? `${q.giver}: ${q.have}/${q.need}` : `${q.giver} zuhören` };
      this.host.interactables.push(it);
      this.own.push(it);
    });
  }

  private setBubble(g: Giver) {
    const q = g.q;
    const kind = q.done ? 'done' : q.accepted ? 'busy' : 'open';
    if (kind === g.state) return;
    g.state = kind;
    g.bubble.texture = bubbleTexture(kind);
  }

  // ---- Foyer: stamp card at the reception ---------------------------------------------------------

  private receptionStand() {
    const r = this.def.decor.find((x) => x.kind === 'reception');
    if (!r) return;
    const x = r.x - (r.w ?? 76) - 40;
    const y = r.y + 14;
    const s = stampStand(x, y);
    s.zIndex = y;
    this.put(s);
    const o = { x: x - 14, y: y - 10, w: 28, h: 14 };
    this.host.obstacles.push(o);
    this.ownObstacles.push(o);
    const it: ExtraInteractable = { kind: 'extra', id: 'stamps', x, y: y + 40, title: 'Stammkunden-Karte' };
    this.host.interactables.push(it);
    this.own.push(it);
  }

  // ---- Foyer: today's programme on an easel by the elevator ------------------------------------

  private programBoard() {
    const x = this.def.elevatorX - 118;
    const y = WALL_H + 92;
    const top = this.state.topFloor;
    const rows = allRooms()
      .filter((r) => r.floor > 0)
      .map((r) => ({ floor: r.floor, games: floorPlan(this.state, r), locked: r.floor > top }));
    const s = programBoardSprite(x, y, rows);
    s.zIndex = y;
    this.put(s);
    const o = { x: x - 30, y: y - 10, w: 60, h: 14 };
    this.host.obstacles.push(o);
    this.ownObstacles.push(o);
    const it: ExtraInteractable = { kind: 'extra', id: 'program', x, y: y + 40, title: 'Programm des Tages' };
    this.host.interactables.push(it);
    this.own.push(it);
  }

  // ---- Per frame ----------------------------------------------------------------------------------

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const t = this.time;
    for (const gl of this.glows) gl.s.alpha = gl.a * (0.85 + Math.sin(t * 7 + gl.ph) * 0.08 + Math.sin(t * 13.7 + gl.ph * 2) * 0.06);
    if (this.lantern) {
      const p = this.host.player();
      this.lantern.position.set(p.x, p.y - 30);
      this.lantern.alpha = 0.26 + Math.sin(t * 9) * 0.02;
    }
    const you = this.host.player();
    for (const g of this.givers) {
      g.bubble.y = -(g.p.headroom - 22) / 0.82 + Math.sin(t * 3 + g.ph) * 3;
      // Turn to the player when they come close.
      if (Math.hypot(you.x - g.x, you.y - g.y) < 160) g.p.faceTowards(Math.atan2(you.y - g.y, you.x - g.x));
      g.p.update(dtMs, null);
    }
  }

  /** Screen anchor of a guest with a task (for effects). */
  giverPoint(questId: string) {
    const g = this.givers.find((x) => x.q.id === questId);
    return g ? { x: g.x, y: g.y - 120 } : null;
  }

  destroy() {
    this.off();
    this.clear();
  }
}
