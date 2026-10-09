// Inside the elevator: the brass floor panel. Pick a floor, the needle swings over,
// the cabin hums and rattles, a ding, and the doors open on the new floor.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture } from '../core/fx';
import { allRooms, type RoomDefinition } from '../core/registry';
import { BOSS_DAY, DAYS_PER_FLOOR, type GameState } from '../core/state';
import { animate, ease, tween, wait } from '../core/tween';
import { button } from '../core/ui';
import { sfx } from '../core/audio';

const W = 640;
const H = 720;
const DIAL = { x: W / 2, y: 238, r: 150 };
const ROW0 = 300;
const ROW_H = 62;

/** First day a floor can be reached. */
export function floorOpensOnDay(floor: number) {
  return floor >= 5 ? BOSS_DAY : (floor - 1) * DAYS_PER_FLOOR + 1;
}

interface Row {
  floor: number;
  room: RoomDefinition;
  locked: boolean;
  lamp: Sprite;
  btn: Graphics;
  draw(lit: boolean): void;
}

export class ElevatorPanel {
  readonly view = new Container();
  private bg = new Graphics();
  private panel = new Container();
  private needle = new Container();
  private rows: Row[] = [];
  private time = 0;
  private riding = false;
  private dialFloor: number;
  private newBadge: Container | null = null;

  /**
   * `current` is the floor the cabin is on. `highlight` marks a floor that just opened.
   * `onChoose` gets the chosen floor after the ride (the current floor if the player
   * steps out again).
   */
  constructor(
    state: GameState,
    private current: number,
    private onChoose: (floor: number) => void,
    highlight: number | null = null,
  ) {
    this.dialFloor = current;
    this.view.addChild(this.bg, this.panel);
    this.view.eventMode = 'static';
    const p = this.panel;
    const top = state.topFloor;

    // Brass plate with an engraved border and screws.
    const plate = new Graphics();
    plate.roundRect(6, 10, W, H, 36).fill({ color: 0x000000, alpha: 0.5 });
    plate.roundRect(0, 0, W, H, 36).fill(0xb8893a).stroke({ color: COLORS.brassDark, width: 4 });
    plate.roundRect(14, 14, W - 28, H - 28, 28).stroke({ color: 0xffe2a0, width: 2, alpha: 0.6 });
    plate.roundRect(22, 22, W - 44, H - 44, 24).stroke({ color: COLORS.brassDark, width: 1.5, alpha: 0.7 });
    for (let i = 0; i < 14; i++) plate.rect(0, 40 + i * 48, W, 1).fill({ color: 0xffffff, alpha: 0.04 });
    for (const [sx, sy] of [[44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44]]) {
      plate.circle(sx, sy, 9).fill(0xd9b06a).stroke({ color: COLORS.brassDark, width: 2 });
      plate.moveTo(sx - 6, sy - 2).lineTo(sx + 6, sy + 2).stroke({ color: COLORS.brassDark, width: 2 });
    }
    p.addChild(plate);
    const title = new Text({ text: 'AUFZUG · NACHTFALTER', style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0x5a3a10, letterSpacing: 4 } });
    title.anchor.set(0.5);
    title.position.set(W / 2, 52);
    p.addChild(title);

    // Floor dial.
    const d = new Graphics();
    d.moveTo(DIAL.x - DIAL.r - 14, DIAL.y).arc(DIAL.x, DIAL.y, DIAL.r + 14, Math.PI, 0).closePath().fill(COLORS.brassDark);
    d.moveTo(DIAL.x - DIAL.r, DIAL.y).arc(DIAL.x, DIAL.y, DIAL.r, Math.PI, 0).closePath().fill(0x1b1013);
    d.moveTo(DIAL.x - DIAL.r + 10, DIAL.y).arc(DIAL.x, DIAL.y, DIAL.r - 10, Math.PI, 0).stroke({ color: COLORS.brass, width: 2, alpha: 0.6 });
    for (let k = 0; k <= 40; k++) {
      const a = Math.PI + (k / 40) * Math.PI;
      const r1 = DIAL.r - 14;
      const r2 = DIAL.r - (k % 8 === 4 ? 30 : 20);
      d.moveTo(DIAL.x + Math.cos(a) * r1, DIAL.y + Math.sin(a) * r1).lineTo(DIAL.x + Math.cos(a) * r2, DIAL.y + Math.sin(a) * r2).stroke({ color: 0xfff1c4, width: k % 8 === 4 ? 2.5 : 1, alpha: 0.7 });
    }
    d.rect(DIAL.x - DIAL.r - 14, DIAL.y, (DIAL.r + 14) * 2, 10).fill(COLORS.brassDark);
    p.addChild(d);
    for (let f = 1; f <= 5; f++) {
      const a = this.angle(f);
      const n = new Text({ text: String(f), style: { fontFamily: FONT_DISPLAY, fontSize: 26, fill: f === 5 ? 0xc9a0ff : f > top ? 0x6a5a4a : 0xfff1c4 } });
      n.anchor.set(0.5);
      n.position.set(DIAL.x + Math.cos(a) * (DIAL.r - 54), DIAL.y + Math.sin(a) * (DIAL.r - 54));
      p.addChild(n);
    }
    const ng = new Graphics();
    ng.poly([-4, 0, 0, -DIAL.r + 22, 4, 0]).fill(COLORS.red);
    ng.circle(0, 0, 12).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 3 });
    ng.circle(-3, -3, 3).fill({ color: 0xffffff, alpha: 0.5 });
    this.needle.addChild(ng);
    this.needle.position.set(DIAL.x, DIAL.y);
    this.needle.rotation = this.angle(current) + Math.PI / 2;
    p.addChild(this.needle);

    // Floor directory, top floor first.
    const rooms = allRooms().sort((a, b) => b.floor - a.floor);
    rooms.forEach((room, i) => {
      const f = room.floor;
      const y = ROW0 + i * ROW_H + ROW_H / 2;
      const locked = f > top;
      const row = new Container();
      row.position.set(0, y);
      const bgRow = new Graphics().roundRect(46, -ROW_H / 2 + 5, W - 92, ROW_H - 10, 14).fill({ color: 0x000000, alpha: f === current ? 0.28 : 0.14 });
      row.addChild(bgRow);
      const lamp = new Sprite(glowTexture());
      lamp.anchor.set(0.5);
      lamp.position.set(96, 0);
      lamp.width = lamp.height = 110;
      lamp.tint = f === 5 ? 0xc9a0ff : COLORS.lamp;
      lamp.blendMode = 'add';
      lamp.alpha = 0;
      const btn = new Graphics();
      let num: Text | null = null;
      const draw = (lit: boolean) => {
        if (num) num.style.fill = lit ? 0x1b1013 : locked ? 0x6a5a4a : 0xfff1c4;
        btn.clear();
        btn.circle(96, 3, 25).fill({ color: 0x000000, alpha: 0.4 });
        btn.circle(96, 0, 25).fill(COLORS.brassDark);
        btn.circle(96, 0, 20).fill(lit ? 0xfff1c4 : locked ? 0x3a2a1e : 0x1b1013).stroke({ color: 0xffe2a0, width: 1.5, alpha: 0.7 });
      };
      draw(f === current);
      num = new Text({ text: String(f), style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: f === current ? 0x1b1013 : locked ? 0x6a5a4a : 0xfff1c4 } });
      num.anchor.set(0.5);
      num.position.set(96, 1);
      row.addChild(lamp, btn, num);
      const name = new Text({ text: room.name, style: { fontFamily: FONT_DISPLAY, fontSize: 21, fill: locked ? 0x6a4a20 : 0x2a1608 } });
      name.anchor.set(0, 0.5);
      name.position.set(136, -10);
      const tag = new Text({ text: room.tagline, style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '600', fill: locked ? 0x7a5a2a : 0x4a2a10 } });
      tag.anchor.set(0, 0.5);
      tag.position.set(136, 15);
      row.addChild(name, tag);
      const status = new Text({
        text: f === current ? 'HIER' : locked ? `🔒 ab Tag ${floorOpensOnDay(f)}` : f === 5 ? 'BOSS' : '',
        style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: f === current ? 0x1b5a2a : locked ? 0x6a4a20 : 0x5a1a6a },
      });
      status.anchor.set(1, 0.5);
      status.position.set(W - 62, -10);
      row.addChild(status);
      if (f === highlight && !locked) {
        const badge = new Container();
        badge.addChild(new Graphics().roundRect(-34, -14, 68, 28, 14).fill(COLORS.red).stroke({ color: 0xfff1c4, width: 2 }));
        const bt = new Text({ text: 'NEU', style: { fontFamily: FONT_DISPLAY, fontSize: 16, fill: 0xfff6e6 } });
        bt.anchor.set(0.5);
        badge.addChild(bt);
        badge.position.set(W - 96, 14);
        row.addChild(badge);
        this.newBadge = badge;
      }
      if (!locked) {
        row.eventMode = 'static';
        row.cursor = 'pointer';
        row.hitArea = { contains: (x: number, yy: number) => x > 46 && x < W - 46 && yy > -ROW_H / 2 && yy < ROW_H / 2 };
        row.on('pointerover', () => !this.riding && (bgRow.alpha = 1.8));
        row.on('pointerout', () => (bgRow.alpha = 1));
        row.on('pointertap', () => this.choose(f));
      }
      p.addChild(row);
      this.rows.push({ floor: f, room, locked, lamp, btn, draw });
    });

    const stay = button({ label: 'AUSSTEIGEN', width: 240, height: 54, color: 0x2a1608, textColor: 0xfff1c4, fontSize: 20, onClick: () => this.choose(this.current) });
    stay.position.set(W / 2, H - 54);
    p.addChild(stay);

    window.addEventListener('keydown', this.onKey);
    p.alpha = 0;
    void tween(p, { alpha: 1 }, 250);
    if (highlight) void this.pulseHint(highlight);
  }

  /** Dial angle of a floor: 1 on the left, 5 on the right. */
  private angle(f: number) {
    return Math.PI + ((f - 0.5) / 5) * Math.PI;
  }

  private onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 5) this.choose(n);
    else if (e.key === 'Escape') this.choose(this.current);
  };

  private async pulseHint(f: number) {
    const row = this.rows.find((r) => r.floor === f);
    if (!row) return;
    await wait(400);
    for (let i = 0; i < 3 && !this.riding; i++) {
      await animate(500, (k) => (row.lamp.alpha = Math.sin(k * Math.PI) * 0.8));
    }
  }

  private async choose(f: number) {
    const row = this.rows.find((r) => r.floor === f);
    if (this.riding || !row || row.locked) return;
    this.riding = true;
    window.removeEventListener('keydown', this.onKey);
    sfx.elevatorButton();
    row.draw(true);
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
    await tween(this.panel, { alpha: 0 }, 250);
    this.onChoose(f);
  }

  resize(w: number, h: number) {
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.9 });
    // Cabin walls behind the panel: dark wood panels and a brass handrail.
    for (let x = 0; x < w; x += 90) this.bg.rect(x + 6, 0, 78, h).fill({ color: 0x2a1608, alpha: 0.5 });
    this.bg.rect(0, h * 0.62, w, 10).fill({ color: COLORS.brass, alpha: 0.55 });
    const s = Math.min((w * 0.94) / W, (h * 0.94) / H, 1.05);
    this.panel.scale.set(s);
    this.panel.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    if (this.newBadge) this.newBadge.scale.set(1 + Math.sin(this.time * 5) * 0.06);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.view.destroy({ children: true });
  }
}

/** Big "ETAGE 3 · UHRWERK" title shown when the doors open on a floor. */
export function floorTitle(room: RoomDefinition) {
  const c = new Container();
  const t = glowText(`ETAGE ${room.floor}`, { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 6 }, { color: room.theme.neon, distance: 10, outerStrength: 1.5 });
  t.position.set(0, -36);
  const n = glowText(room.name.toUpperCase(), { fontFamily: FONT_DISPLAY, fontSize: 52, fill: 0xfff6e6, letterSpacing: 3 }, { color: room.theme.neon, distance: 16, outerStrength: 2.5 });
  n.position.set(0, 18);
  c.addChild(t, n);
  return c;
}
