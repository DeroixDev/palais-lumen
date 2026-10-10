// Inside the elevator: the brass floor panel. Pick a floor, the needle swings over,
// the cabin hums and rattles, a ding, and the doors open on the new floor.
// Painted like the world: brushed brass plate, a glass-domed dial, backlit glass buttons.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture } from '../core/fx';
import { allRooms, type RoomDefinition } from '../core/registry';
import { BOSS_DAY, DAYS_PER_FLOOR, type GameState } from '../core/state';
import { animate, ease, wait } from '../core/tween';
import { brass, button, lockTexture } from '../core/ui';
import { focusable } from '../core/focus';
import { sfx } from '../core/audio';
import { INK, fillInk, glowAt, paint, rrect, seeded, type Ctx } from '../world/painted/brush';
import { enterMotion, leaveMotion, screw } from './kit';
import { gameIcon } from './gameIcons';
import { floorPlan } from './schedule';

/** First day a floor can be reached. */
export function floorOpensOnDay(floor: number) {
  return floor >= 5 ? BOSS_DAY : (floor - 1) * DAYS_PER_FLOOR + 1;
}

interface Row {
  floor: number;
  room: RoomDefinition;
  locked: boolean;
  lamp: Sprite;
  draw(lit: boolean): void;
}

const BOSS = 0xc9a0ff;
const cache = new Map<string, Texture>();
function once(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Brushed brass plate with an engraved double border, screws and a deco crest. */
function plateTex(W: number, H: number) {
  return once(`elev-plate-${W}x${H}`, () =>
    paint(W + 20, H + 24, (c) => {
      c.translate(10, 8);
      for (let i = 0; i < 6; i++) {
        rrect(c, -i, 6 + i - i, W + i * 2, H + i, 36 + i);
        c.fillStyle = `rgba(6,2,8,${0.16 - i * 0.022})`;
        c.fill();
      }
      rrect(c, 0, 0, W, H, 36);
      const g = c.createLinearGradient(0, 0, W * 0.6, H);
      g.addColorStop(0, '#f6d58a');
      g.addColorStop(0.35, '#d7a650');
      g.addColorStop(0.7, '#b8863a');
      g.addColorStop(1, '#8a5e22');
      fillInk(c, g, 3);
      c.save();
      rrect(c, 0, 0, W, H, 36);
      c.clip();
      // Brushed grain.
      const r = seeded(W + H);
      for (let i = 0; i < H * 1.4; i++) {
        const y = r() * H;
        c.strokeStyle = r() < 0.5 ? `rgba(255,246,214,${0.05 + r() * 0.06})` : `rgba(90,52,12,${0.04 + r() * 0.05})`;
        c.lineWidth = 0.6 + r();
        c.beginPath();
        c.moveTo(r() * W * 0.3, y);
        c.lineTo(W * (0.6 + r() * 0.4), y + (r() - 0.5) * 2);
        c.stroke();
      }
      glowAt(c, W * 0.25, H * 0.12, W * 0.6, H * 0.3, 0xfff4dc, 0.22);
      c.strokeStyle = 'rgba(255,250,232,0.85)';
      c.lineWidth = 2.5;
      rrect(c, 2, 2, W + 8, H + 8, 36);
      c.stroke();
      c.restore();
      for (const [k, a] of [[14, 0.55], [24, 0.45]] as const) {
        rrect(c, k, k, W - k * 2, H - k * 2, 36 - k * 0.6);
        c.strokeStyle = `rgba(90,52,12,${a})`;
        c.lineWidth = 1.6;
        c.stroke();
        rrect(c, k + 1, k + 1.4, W - k * 2, H - k * 2, 36 - k * 0.6);
        c.strokeStyle = 'rgba(255,246,214,0.4)';
        c.lineWidth = 1;
        c.stroke();
      }
      for (const [sx, sy] of [[44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44]]) screw(c, sx, sy, 8);
    }, Math.min(2, 1800 / H)),
  );
}

/** The floor dial: dark enamel half-moon in a brass bezel, ticks, and a glass dome. */
function dialTex(r: number) {
  return once(`elev-dial-${r}`, () =>
    paint(r * 2 + 60, r + 46, (c) => {
      const cx = r + 30;
      const cy = r + 22;
      const half = (rad: number) => {
        c.beginPath();
        c.moveTo(cx - rad, cy);
        c.arc(cx, cy, rad, Math.PI, 0);
        c.closePath();
      };
      c.save();
      c.translate(2, 5);
      half(r + 18);
      c.fillStyle = 'rgba(6,2,8,0.4)';
      c.fill();
      c.restore();
      half(r + 18);
      fillInk(c, brass(c, cx - r, cy - r, cx + r * 0.5, cy + 10), 2.4);
      half(r + 10);
      c.strokeStyle = 'rgba(90,52,12,0.6)';
      c.lineWidth = 1.4;
      c.stroke();
      half(r);
      const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.6, 4, cx, cy, r);
      g.addColorStop(0, '#3a2a34');
      g.addColorStop(1, '#100810');
      fillInk(c, g, 2);
      c.save();
      half(r);
      c.clip();
      for (let k = 0; k <= 48; k++) {
        const a = Math.PI + (k / 48) * Math.PI;
        const big = k % 8 === 4;
        const r1 = r - 10;
        const r2 = r - (big ? 28 : 18);
        c.strokeStyle = big ? 'rgba(255,236,190,0.85)' : 'rgba(255,236,190,0.45)';
        c.lineWidth = big ? 2.6 : 1.1;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        c.stroke();
      }
      c.beginPath();
      c.arc(cx, cy, r - 6, Math.PI, 0);
      c.strokeStyle = 'rgba(224,178,90,0.5)';
      c.lineWidth = 1.2;
      c.stroke();
      // Glass dome reflection.
      c.globalCompositeOperation = 'lighter';
      const sg = c.createLinearGradient(0, cy - r, 0, cy - r * 0.3);
      sg.addColorStop(0, 'rgba(255,255,255,0.14)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.ellipse(cx - r * 0.18, cy - r * 0.62, r * 0.62, r * 0.3, -0.2, 0, Math.PI * 2);
      c.fill();
      c.restore();
      // Base bar.
      rrect(c, cx - r - 18, cy - 2, r * 2 + 36, 14, 5);
      fillInk(c, brass(c, cx - r, cy, cx + r, cy + 14), 2);
    }, 2),
  );
}

function needleTex(len: number) {
  return once(`elev-needle-${len}`, () =>
    paint(30, len + 30, (c) => {
      const cx = 15;
      const cy = len + 15;
      c.beginPath();
      c.moveTo(cx - 4, cy);
      c.lineTo(cx, cy - len);
      c.lineTo(cx + 4, cy);
      c.closePath();
      const g = c.createLinearGradient(cx - 4, 0, cx + 4, 0);
      g.addColorStop(0, '#ff6a6a');
      g.addColorStop(1, '#8a1020');
      fillInk(c, g, 1.4);
      c.beginPath();
      c.arc(cx, cy, 11, 0, Math.PI * 2);
      fillInk(c, brass(c, cx - 11, cy - 11, cx + 11, cy + 11, 0.1), 2);
      c.beginPath();
      c.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fill();
    }, 3),
  );
}

/** Round floor button: brass bezel, glass cap. `lit` glows warm (or violet for the boss floor). */
function knobTex(r: number, state: 'idle' | 'lit' | 'locked', boss: boolean) {
  return once(`elev-knob-${r}-${state}-${boss}`, () =>
    paint(r * 2 + 16, r * 2 + 18, (c) => {
      const o = r + 8;
      c.beginPath();
      c.arc(o + 1, o + 4, r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(40,20,6,0.5)';
      c.fill();
      c.beginPath();
      c.arc(o, o, r, 0, Math.PI * 2);
      fillInk(c, brass(c, o - r, o - r, o + r * 0.5, o + r, 0, state === 'locked'), 2);
      c.beginPath();
      c.arc(o, o, r - 6, 0, Math.PI * 2);
      const g = c.createRadialGradient(o - r * 0.25, o - r * 0.3, 1, o, o, r - 6);
      if (state === 'lit') {
        const col = boss ? ['#fbf0ff', '#d6b0ff', '#7a4ac0'] : ['#fffbe8', '#ffd98a', '#c98a2a'];
        g.addColorStop(0, col[0]);
        g.addColorStop(0.55, col[1]);
        g.addColorStop(1, col[2]);
      } else if (state === 'locked') {
        g.addColorStop(0, '#5a4a40');
        g.addColorStop(1, '#2a1e18');
      } else {
        g.addColorStop(0, '#4a2a34');
        g.addColorStop(1, '#140a10');
      }
      fillInk(c, g, 1.4);
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(6,2,8,0.5)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(o, o + 2, r - 6, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      c.beginPath();
      c.ellipse(o - r * 0.22, o - r * 0.32, r * 0.36, r * 0.18, -0.5, 0, Math.PI * 2);
      c.fillStyle = state === 'lit' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)';
      c.fill();
    }, 3),
  );
}

/** Recessed strip behind a floor row. */
function rowTex(w: number, h: number, current: boolean) {
  return once(`elev-row-${w}x${h}-${current}`, () =>
    paint(w + 4, h + 4, (c) => {
      c.translate(2, 2);
      rrect(c, 0, 0, w, h, 14);
      c.fillStyle = current ? 'rgba(60,30,6,0.32)' : 'rgba(60,30,6,0.16)';
      c.fill();
      c.save();
      rrect(c, 0, 0, w, h, 14);
      c.clip();
      c.strokeStyle = 'rgba(60,30,6,0.45)';
      c.lineWidth = 4;
      rrect(c, 0, 1.5, w, h, 14);
      c.stroke();
      c.restore();
      rrect(c, 0.5, 1.5, w - 1, h - 1, 14);
      c.strokeStyle = 'rgba(255,246,214,0.45)';
      c.lineWidth = 1;
      c.stroke();
      c.strokeStyle = INK;
    }, 2),
  );
}

/** Cabin walls: mahogany panels with brass trim and a handrail. */
function cabinTex(w: number, h: number) {
  return (
    paint(w, h, (c: Ctx) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2a1410');
      g.addColorStop(1, '#120806');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const pw = 120;
      for (let x = -((pw - (w % pw)) / 2); x < w; x += pw) {
        rrect(c, x + 10, 24, pw - 20, h * 0.58 - 40, 8);
        const pg = c.createLinearGradient(x, 0, x + pw, 0);
        pg.addColorStop(0, '#4a2418');
        pg.addColorStop(0.5, '#5a2c1c');
        pg.addColorStop(1, '#3a1a10');
        c.fillStyle = pg;
        c.fill();
        c.strokeStyle = 'rgba(224,178,90,0.35)';
        c.lineWidth = 1.5;
        c.stroke();
        rrect(c, x + 10, h * 0.66, pw - 20, h * 0.34 - 24, 8);
        c.fillStyle = pg;
        c.fill();
        c.stroke();
      }
      glowAt(c, w / 2, 0, w * 0.6, h * 0.5, 0xffd8a0, 0.18);
      // Handrail.
      const y = h * 0.6;
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.fillRect(0, y + 8, w, 8);
      const rg = c.createLinearGradient(0, y - 6, 0, y + 8);
      rg.addColorStop(0, '#fff1c0');
      rg.addColorStop(0.4, '#d9a548');
      rg.addColorStop(1, '#6a4410');
      c.fillStyle = rg;
      c.fillRect(0, y - 6, w, 14);
      c.fillStyle = 'rgba(6,2,8,0.35)';
      c.fillRect(0, 0, w, h);
    }, 1)
  );
}

export class ElevatorPanel {
  readonly view = new Container();
  private bg = new Sprite();
  private stage = new Container();
  private panel = new Container();
  private needle = new Container();
  private rows: Row[] = [];
  private time = 0;
  private riding = false;
  private dialFloor: number;
  private newBadge: Container | null = null;
  private narrow: boolean | null = null;
  private W = 640;
  private H = 800;

  private entered = false;
  private cabinKey = '';
  private ownCabin = false;

  /**
   * `current` is the floor the cabin is on. `highlight` marks a floor that just opened.
   * `onChoose` gets the chosen floor after the ride (the current floor if the player
   * steps out again).
   */
  constructor(
    private state: GameState,
    private current: number,
    private onChoose: (floor: number) => void,
    private highlight: number | null = null,
  ) {
    this.dialFloor = current;
    this.stage.addChild(this.panel);
    this.view.addChild(this.bg, this.stage);
    this.view.eventMode = 'static';
    window.addEventListener('keydown', this.onKey);
  }

  private build(n: boolean) {
    this.panel.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rows = [];
    this.newBadge = null;
    this.needle = new Container();
    const W = (this.W = n ? 404 : 640);
    // Narrow rows get a third line for today's games (src/ui/schedule.ts).
    const rowH = n ? 86 : 64;
    const dialR = n ? 116 : 150;
    const dialY = n ? 206 : 232;
    const row0 = dialY + (n ? 40 : 54);
    // One row per floor: side rooms are reached through their doors, not by elevator.
    const rooms = allRooms().filter((r) => !r.parent).sort((a, b) => b.floor - a.floor);
    const H = (this.H = row0 + rooms.length * rowH + (n ? 92 : 100));

    const p = this.panel;
    const top = this.state.topFloor;
    const current = this.current;

    p.addChild(Object.assign(new Sprite(plateTex(W, H)), { x: -10, y: -8 }));
    const title = new Text({ text: 'AUFZUG · NACHTFALTER', style: { fontFamily: FONT_DISPLAY, fontSize: n ? 17 : 21, fill: 0x4a2a08, letterSpacing: n ? 3 : 4, dropShadow: { color: 0xfff4d0, alpha: 0.6, blur: 0, distance: 1.4, angle: Math.PI / 2 } } });
    title.anchor.set(0.5);
    title.position.set(W / 2, n ? 44 : 50);
    p.addChild(title);

    // Floor dial.
    const d = new Sprite(dialTex(dialR));
    d.position.set(W / 2 - dialR - 30, dialY - dialR - 22);
    p.addChild(d);
    for (let f = 0; f <= 5; f++) {
      const a = this.angle(f);
      const lockedF = f > top;
      const nt = new Text({ text: f === 0 ? 'F' : String(f), style: { fontFamily: FONT_DISPLAY, fontSize: n ? 21 : 26, fill: f === 5 ? BOSS : lockedF ? 0x7a6a5a : 0xfff1c4 } });
      nt.anchor.set(0.5);
      nt.position.set(W / 2 + Math.cos(a) * (dialR - (n ? 44 : 54)), dialY + Math.sin(a) * (dialR - (n ? 44 : 54)));
      p.addChild(nt);
    }
    const ns = new Sprite(needleTex(dialR - 22));
    ns.anchor.set(0.5, (dialR - 22 + 15) / (dialR - 22 + 30));
    this.needle.addChild(ns);
    this.needle.position.set(W / 2, dialY);
    this.needle.rotation = this.angle(this.dialFloor) + Math.PI / 2;
    p.addChild(this.needle);

    // Floor directory, top floor first.
    const kr = n ? 25 : 25;
    const kx = n ? 52 : 92;
    const rx = n ? 18 : 46;
    const rw = W - rx * 2;
    rooms.forEach((room, i) => {
      const f = room.floor;
      const y = row0 + i * rowH + rowH / 2;
      const locked = f > top;
      const row = new Container();
      row.position.set(0, y);
      const strip = new Sprite(rowTex(rw, rowH - 10, f === current));
      strip.position.set(rx - 2, -(rowH - 10) / 2 - 2);
      row.addChild(strip);
      const lamp = new Sprite(glowTexture());
      lamp.anchor.set(0.5);
      lamp.position.set(kx, 0);
      lamp.width = lamp.height = 120;
      lamp.tint = f === 5 ? BOSS : COLORS.lamp;
      lamp.blendMode = 'add';
      lamp.alpha = 0;
      const knob = new Sprite(knobTex(kr, locked ? 'locked' : f === current ? 'lit' : 'idle', f === 5));
      knob.anchor.set(0.5, (kr + 8) / (kr * 2 + 18));
      knob.position.set(kx, 0);
      const num = new Text({ text: f === 0 ? 'F' : String(f), style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: f === current ? 0x2a1406 : locked ? 0x9a8a7a : 0xfff1c4 } });
      num.anchor.set(0.5);
      num.position.set(kx, 1);
      const draw = (lit: boolean) => {
        knob.texture = knobTex(kr, locked ? 'locked' : lit ? 'lit' : 'idle', f === 5);
        num.style.fill = lit ? 0x2a1406 : locked ? 0x9a8a7a : 0xfff1c4;
      };
      row.addChild(lamp, knob, num);
      if (locked) {
        const lk = new Sprite(lockTexture());
        lk.anchor.set(0.5);
        lk.scale.set(0.7);
        lk.position.set(kx + kr * 0.75, kr * 0.6);
        row.addChild(lk);
      }
      const tx = kx + kr + (n ? 14 : 20);
      const plan = f > 0 ? floorPlan(this.state, room) : [];
      const three = n && plan.length > 0;
      const nameY = three ? -24 : -11;
      const tagY = three ? 0 : 14;
      const status = new Text({
        text: f === current ? 'HIER' : locked ? `ab Tag ${floorOpensOnDay(f)}` : f === 5 ? 'BOSS' : f === top && f > 0 ? 'HEUTE' : '',
        style: { fontFamily: FONT_BODY, fontSize: n ? 16 : 17, fontWeight: '700', fill: f === current ? 0x14501e : locked ? 0x5a3a14 : 0x5a1a6a },
      });
      status.anchor.set(1, 0.5);
      status.position.set(W - rx - 14, nameY);
      row.addChild(status);
      const maxName = W - rx - 14 - tx - (status.text ? status.width + 10 : 0);
      const name = new Text({ text: room.name, style: { fontFamily: FONT_DISPLAY, fontSize: n ? 19 : 21, fill: locked ? 0x6a4a20 : 0x2a1406, dropShadow: { color: 0xfff4d0, alpha: 0.5, blur: 0, distance: 1.2, angle: Math.PI / 2 } } });
      name.anchor.set(0, 0.5);
      name.position.set(tx, nameY);
      if (name.width > maxName) name.scale.set(maxName / name.width);
      const tag = new Text({ text: room.tagline, style: { fontFamily: FONT_BODY, fontSize: n ? 16 : 17, fontWeight: '600', fill: locked ? 0x6a4a20 : 0x4a2a10 } });
      tag.anchor.set(0, 0.5);
      tag.position.set(tx, tagY);
      // Today's games: small medallions, a pink dot on the ones new on this floor today.
      const iconS = n ? 24 : 24;
      const step = iconS + 4;
      const iconsW = plan.length * step;
      const iconRight = W - rx - 14 - (f === this.highlight && !locked ? 76 : 0);
      plan.forEach((g, k) => {
        const ic = gameIcon(g.id, iconS);
        ic.position.set(three ? tx + iconS / 2 + k * step : iconRight - iconsW + iconS / 2 + k * step, three ? 26 : tagY);
        if (locked) ic.alpha = 0.5;
        row.addChild(ic);
        if (g.isNew) {
          const dot = new Sprite(glowTexture());
          dot.anchor.set(0.5);
          dot.tint = 0xff5fa2;
          dot.width = dot.height = 14;
          dot.position.set(ic.x + iconS * 0.36, ic.y - iconS * 0.36);
          const pip = new Text({ text: '●', style: { fontFamily: FONT_BODY, fontSize: 11, fill: 0xff5fa2 } });
          pip.anchor.set(0.5);
          pip.position.copyFrom(dot.position);
          row.addChild(dot, pip);
        }
      });
      const maxTag = (three || !plan.length ? W - rx - 14 : iconRight - iconsW - 10) - tx;
      if (tag.width > maxTag) tag.scale.set(maxTag / tag.width);
      row.addChild(name, tag);
      if (f === this.highlight && !locked) {
        const badge = new Container();
        const bt = button({ label: 'NEU', width: 64, height: 28, color: COLORS.red, textColor: 0xfff6e6, fontSize: 15, onClick: () => this.choose(f) });
        badge.addChild(bt);
        badge.position.set(W - rx - 46, 14);
        tag.scale.set(Math.min(tag.scale.x, (W - rx - 90 - tx) / (tag.width / tag.scale.x)));
        row.addChild(badge);
        this.newBadge = badge;
      }
      if (!locked) {
        row.eventMode = 'static';
        row.cursor = 'pointer';
        row.hitArea = { contains: (x: number, yy: number) => x > rx && x < W - rx && yy > -rowH / 2 && yy < rowH / 2 };
        row.on('pointerover', () => !this.riding && (strip.alpha = 1.8));
        row.on('pointerout', () => (strip.alpha = 1));
        row.on('pointerdown', () => !this.riding && (knob.scale.set(0.92), num.scale.set(0.92)));
        row.on('pointerup', () => (knob.scale.set(1), num.scale.set(1)));
        row.on('pointerupoutside', () => (knob.scale.set(1), num.scale.set(1)));
        row.on('pointertap', () => this.choose(f));
      } else {
        row.eventMode = 'static';
        row.on('pointertap', () => {
          if (this.riding) return;
          sfx.tick();
          const x0 = row.x;
          void animate(240, (k) => !row.destroyed && (row.x = x0 + Math.sin(k * Math.PI * 4) * 4 * (1 - k)));
        });
      }
      focusable(row, {
        label: `${f === 0 ? 'Foyer' : `Etage ${f}`}: ${room.name}${status.text ? `, ${status.text}` : ''}`,
        rect: { x: rx, y: -rowH / 2, w: W - rx * 2, h: rowH },
        radius: 12,
        locked: () => (locked ? `ab Tag ${floorOpensOnDay(f)}` : null),
      });
      p.addChild(row);
      this.rows.push({ floor: f, room, locked, lamp, draw });
    });

    const stay = button({ label: 'AUSSTEIGEN', width: 240, height: 56, color: 0x3a1428, textColor: 0xf2e6c9, fontSize: 20, onClick: () => this.choose(this.current) });
    stay.position.set(W / 2, H - (n ? 48 : 52));
    p.addChild(stay);
  }

  /** Dial angle of a floor: the foyer on the left, 5 on the right. */
  private angle(f: number) {
    return Math.PI + ((f + 0.5) / 6) * Math.PI;
  }

  private onKey = (e: KeyboardEvent) => {
    const n = e.key.toLowerCase() === 'f' ? 0 : Number(e.key);
    if (e.key.trim() !== '' && n >= 0 && n <= 5) this.choose(n);
    else if (e.key === 'Escape') this.choose(this.current);
  };

  private async pulseHint(f: number) {
    await wait(400);
    for (let i = 0; i < 3 && !this.riding; i++) {
      const row = this.rows.find((r) => r.floor === f);
      if (!row) return;
      await animate(500, (k) => !row.lamp.destroyed && (row.lamp.alpha = Math.sin(k * Math.PI) * 0.8));
    }
  }

  private async choose(f: number) {
    const row = this.rows.find((r) => r.floor === f);
    if (this.riding || !row || row.locked) return;
    this.riding = true;
    window.removeEventListener('keydown', this.onKey);
    sfx.elevatorButton();
    // The other lit button goes dark, the chosen one lights up.
    for (const r of this.rows) r.draw(r === row);
    row.lamp.alpha = 0.9;
    if (f !== this.current) {
      const from = this.dialFloor;
      const dur = 900 + Math.abs(f - from) * 450;
      sfx.elevatorRide(dur / 1000, f > from);
      const a0 = this.needle.rotation;
      const a1 = this.angle(f) + Math.PI / 2;
      const baseX = this.panel.x;
      const baseY = this.panel.y;
      await animate(
        dur,
        (k) => {
          const e = ease.inOutCubic(k);
          this.needle.rotation = a0 + (a1 - a0) * e + Math.sin(k * 60) * 0.01 * Math.sin(k * Math.PI);
          // Light the row the cabin is passing.
          const at = Math.round(from + (f - from) * e);
          for (const r of this.rows) if (r !== row) r.lamp.alpha = r.floor === at ? 0.5 : 0;
          const shake = Math.sin(k * Math.PI) * 2.2;
          this.panel.position.set(baseX + Math.sin(k * 90) * shake * 0.5, baseY + Math.sin(k * 70) * shake);
        },
      );
      this.panel.position.set(baseX, baseY);
      for (const r of this.rows) if (r !== row) r.lamp.alpha = 0;
      sfx.elevatorDing();
      await animate(250, (k) => (this.needle.rotation = a1 + Math.sin(k * Math.PI * 3) * 0.04 * (1 - k)));
      await wait(250);
    } else {
      await wait(200);
    }
    await leaveMotion(this.stage, 220);
    this.onChoose(f);
  }

  resize(w: number, h: number) {
    const n = w < 720;
    if (n !== this.narrow && !this.riding) {
      this.narrow = n;
      this.build(n);
    }
    const key = `${Math.ceil(w)}x${Math.ceil(h)}`;
    if (key !== this.cabinKey) {
      const old = this.bg.texture;
      this.cabinKey = key;
      this.bg.texture = cabinTex(Math.ceil(w), Math.ceil(h));
      if (this.ownCabin) old.destroy(true);
      this.ownCabin = true;
    }
    const s = Math.min((w * 0.95) / this.W, (h * 0.95) / this.H, 1.05);
    this.stage.scale.set(s);
    this.stage.position.set(w / 2, h / 2);
    this.panel.position.set(-this.W / 2, -this.H / 2);
    if (!this.entered) {
      this.entered = true;
      void enterMotion(this.stage);
      if (this.highlight) void this.pulseHint(this.highlight);
    }
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    if (this.newBadge) this.newBadge.scale.set(1 + Math.sin(this.time * 5) * 0.06);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    const t = this.ownCabin ? this.bg.texture : null;
    this.view.destroy({ children: true });
    t?.destroy(true);
  }
}

/** Big "ETAGE 3 · UHRWERK" title shown when the doors open on a floor. */
export function floorTitle(room: RoomDefinition) {
  const c = new Container();
  const t = glowText(room.floor === 0 ? 'ERDGESCHOSS' : `ETAGE ${room.floor}`, { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 6 }, { color: room.theme.neon, distance: 10, outerStrength: 1.5 });
  t.position.set(0, -36);
  const n = glowText(room.name.toUpperCase(), { fontFamily: FONT_DISPLAY, fontSize: 52, fill: 0xfff6e6, letterSpacing: 3 }, { color: room.theme.neon, distance: 16, outerStrength: 2.5 });
  n.position.set(0, 18);
  c.addChild(t, n);
  return c;
}
