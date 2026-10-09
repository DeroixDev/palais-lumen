// A casino room seen from above: floor, walls, machines, decor, the player and the camera.

import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { getGame, getRoom, type DecorPlacement, type DoorPlacement, type RoomDefinition, type StationPlacement } from '../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, bake, glowTexture } from '../core/fx';
import type { GameState } from '../core/state';
import { formatChips } from '../core/state';
import { drawTrophy } from './trophies';
import { Player } from './player';

export const WALL_H = 150;
const SIDE = 24;

export type Interactable =
  | { kind: 'station'; station: StationPlacement; x: number; y: number; title: string }
  | { kind: 'door'; door: DoorPlacement; x: number; y: number; title: string }
  | { kind: 'shelf'; x: number; y: number; title: string };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class RoomScene {
  readonly view = new Container();
  readonly world = new Container();
  readonly def: RoomDefinition;
  readonly player: Player;
  private entities = new Container();
  private lights = new Container();
  private obstacles: Rect[] = [];
  private interactables: Interactable[] = [];
  private stationLamps: { g: Container; phase: number }[] = [];
  private prompt = new Container();
  private promptText: Text;
  private shelf: Container | null = null;
  private shelfSize = { w: 300, h: 44 };
  private sign!: Sprite;
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;
  private pending: Interactable | null = null;
  private nearest: Interactable | null = null;
  private time = 0;
  private screenW = 800;
  private screenH = 600;
  zoom = 1;
  /** Height of the HTML bar covering the top of the screen. */
  topInset = 64;
  /** Disables movement while a game or menu is open. */
  frozen = false;

  constructor(
    roomId: string,
    private state: GameState,
    private onInteract: (i: Interactable) => void,
  ) {
    this.def = getRoom(roomId);
    this.view.addChild(this.world);
    this.buildFloor();
    this.buildWalls();
    this.world.addChild(this.entities);
    this.entities.sortableChildren = true;
    this.buildStations();
    this.buildDecor();
    this.buildDoors();
    this.world.addChild(this.lights);
    this.buildLights();

    const pos = state.data.roomId === this.def.id && state.data.position.x > 0 ? state.data.position : this.def.spawn;
    this.player = new Player(state.data.players.host?.color ?? COLORS.lamp);
    this.player.view.position.set(pos.x, pos.y);
    this.entities.addChild(this.player.view);

    // Interaction prompt bubble.
    const bubble = new Graphics();
    this.promptText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: COLORS.ink } });
    this.promptText.anchor.set(0.5);
    this.prompt.addChild(bubble, this.promptText);
    this.prompt.visible = false;
    this.prompt.eventMode = 'static';
    this.prompt.cursor = 'pointer';
    this.prompt.on('pointertap', (e) => {
      e.stopPropagation();
      if (this.nearest) this.onInteract(this.nearest);
    });
    this.world.addChild(this.prompt);

    this.world.eventMode = 'static';
    this.world.on('pointertap', (e: FederatedPointerEvent) => this.onTap(e));
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearKeys);
  }

  // ---- Building ---------------------------------------------------------

  private buildFloor() {
    const { width: W, height: H, theme } = this.def;
    const g = new Graphics();
    g.rect(0, 0, W, H).fill(theme.carpet);
    // Classic casino carpet: diamond lattice with small medallions.
    const s = 64;
    for (let y = WALL_H - s; y < H + s; y += s) {
      for (let x = -s; x < W + s; x += s) {
        const ox = (Math.floor(y / s) % 2) * (s / 2);
        const cx = x + ox;
        g.poly([cx, y - s / 2, cx + s / 2, y, cx, y + s / 2, cx - s / 2, y]).stroke({ color: theme.carpetPattern, width: 3 });
        g.circle(cx, y, 5).fill({ color: theme.carpetAccent, alpha: 0.45 });
        g.circle(cx + s / 4, y - s / 4, 2).fill({ color: theme.carpetAccent, alpha: 0.3 });
      }
    }
    const floor = new Sprite(bake(g));
    floor.position.set(0, 0);
    this.world.addChild(floor);
  }

  private buildWalls() {
    const { width: W, height: H, theme } = this.def;
    const g = new Graphics();
    // Back wall (seen at an angle, so it has height).
    g.rect(0, 0, W, WALL_H).fill(theme.wall);
    for (let x = 40; x < W; x += 80) g.rect(x, 10, 2, WALL_H - 30).fill({ color: 0x000000, alpha: 0.25 });
    g.rect(0, WALL_H - 22, W, 22).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(0, WALL_H - 24, W, 4).fill(theme.wallTrim);
    g.rect(0, WALL_H, W, 10).fill({ color: 0x000000, alpha: 0.35 });
    // Side and front walls.
    g.rect(0, 0, SIDE, H).fill(theme.wall);
    g.rect(W - SIDE, 0, SIDE, H).fill(theme.wall);
    g.rect(0, H - SIDE, W, SIDE).fill(theme.wall);
    g.rect(SIDE, 0, 3, H).fill({ color: theme.wallTrim, alpha: 0.5 });
    g.rect(W - SIDE - 3, 0, 3, H).fill({ color: theme.wallTrim, alpha: 0.5 });
    g.rect(0, H - SIDE, W, 3).fill({ color: theme.wallTrim, alpha: 0.5 });
    this.world.addChild(g);

    // Neon sign, baked once with its glow so the filter doesn't run every frame.
    const signText = new Text({ text: this.def.sign, style: { fontFamily: FONT_DISPLAY, fontSize: 44, fill: 0xfff6e6, letterSpacing: 6 } });
    const signWrap = new Container();
    signWrap.addChild(new Graphics().rect(-30, -30, signText.width + 60, signText.height + 60).fill({ color: 0, alpha: 0.001 }));
    signText.filters = [new GlowFilter({ color: theme.neon, distance: 20, outerStrength: 3.5, innerStrength: 0.6, quality: 0.2 })];
    signWrap.addChild(signText);
    this.sign = new Sprite(bake(signWrap));
    this.sign.anchor.set(0.5);
    this.sign.position.set(W / 2, 62);
    this.world.addChild(this.sign);

    this.obstacles.push({ x: 0, y: 0, w: W, h: WALL_H + 6 }, { x: 0, y: 0, w: SIDE, h: H }, { x: W - SIDE, y: 0, w: SIDE, h: H }, { x: 0, y: H - SIDE, w: W, h: SIDE });
  }

  private buildStations() {
    for (const st of this.def.stations) {
      const game = getGame(st.game);
      const c = game.drawStation(st.options ?? {});
      c.position.set(st.x, st.y);
      c.zIndex = st.y + game.footprint.h;
      this.entities.addChild(c);
      const lamp = c.children.find((ch) => ch.label === 'lamp');
      if (lamp) this.stationLamps.push({ g: lamp as Container, phase: Math.random() * 10 });
      if (st.label) {
        const t = new Text({ text: st.label.toUpperCase(), style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xfff6e6, letterSpacing: 1 } });
        t.anchor.set(0.5, 1);
        t.position.set(game.footprint.w / 2, -4);
        t.alpha = 0.8;
        c.addChild(t);
      }
      this.obstacles.push({ x: st.x, y: st.y, w: game.footprint.w, h: game.footprint.h });
      this.interactables.push({
        kind: 'station',
        station: st,
        x: st.x + game.footprint.w / 2,
        y: st.y + game.footprint.h + 22,
        title: `${st.label ?? game.name} spielen`,
      });
    }
  }

  private buildDecor() {
    for (const d of this.def.decor) {
      const c = this.drawDecor(d);
      c.position.set(d.x, d.y);
      this.entities.addChild(c);
    }
  }

  private drawDecor(d: DecorPlacement): Container {
    const c = new Container();
    const g = new Graphics();
    c.addChild(g);
    const th = this.def.theme;
    switch (d.kind) {
      case 'plant': {
        g.circle(0, 6, 22).fill({ color: 0x000000, alpha: 0.35 });
        g.circle(0, 0, 18).fill(0x6b3a1e).stroke({ color: COLORS.brass, width: 2 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          g.ellipse(Math.cos(a) * 14, Math.sin(a) * 14 - 6, 14, 8).fill(i % 2 ? 0x2f7d32 : 0x3f9a45);
        }
        g.circle(0, -6, 10).fill(0x4caf50);
        c.zIndex = d.y + 18;
        this.obstacles.push({ x: d.x - 18, y: d.y - 18, w: 36, h: 36 });
        break;
      }
      case 'pillar': {
        g.circle(0, 8, 30).fill({ color: 0x000000, alpha: 0.35 });
        g.circle(0, 0, 28).fill(th.wall).stroke({ color: th.wallTrim, width: 4 });
        g.circle(0, 0, 18).fill({ color: th.wallTrim, alpha: 0.25 });
        c.zIndex = d.y + 28;
        this.obstacles.push({ x: d.x - 26, y: d.y - 26, w: 52, h: 52 });
        break;
      }
      case 'bar': {
        const w = d.w ?? 300;
        const h = d.h ?? 70;
        g.roundRect(4, 8, w, h, 14).fill({ color: 0x000000, alpha: 0.4 });
        g.roundRect(0, 0, w, h, 14).fill(0x4a2414).stroke({ color: COLORS.brass, width: 3 });
        g.roundRect(8, 8, w - 16, 22, 8).fill(0x6b3a1e);
        const bottles = [COLORS.cyan, COLORS.neon, COLORS.lamp, 0x7bd47b, COLORS.cyan, COLORS.lamp];
        for (let i = 0; i < Math.floor(w / 36); i++) g.circle(22 + i * 36, 19, 6).fill(bottles[i % bottles.length]);
        for (let i = 0; i < Math.floor(w / 60); i++) g.circle(30 + i * 60, h + 18, 11).fill(0x3a2230).stroke({ color: COLORS.brassDark, width: 2 });
        const t = new Text({ text: 'BAR · Limo & Mocktails', style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xfff1c4 } });
        t.anchor.set(0.5);
        t.position.set(w / 2, 50);
        c.addChild(t);
        c.zIndex = d.y + h;
        this.obstacles.push({ x: d.x, y: d.y, w, h });
        break;
      }
      case 'sofa': {
        const w = d.w ?? 160;
        const h = d.h ?? 50;
        g.roundRect(4, 8, w, h, 16).fill({ color: 0x000000, alpha: 0.4 });
        g.roundRect(0, 0, w, h, 16).fill(0x5a1a3a);
        g.roundRect(0, 0, w, 16, 8).fill(0x7a2550);
        g.roundRect(0, 0, 16, h, 8).fill(0x7a2550);
        g.roundRect(w - 16, 0, 16, h, 8).fill(0x7a2550);
        c.zIndex = d.y + h;
        this.obstacles.push({ x: d.x, y: d.y, w, h });
        break;
      }
      case 'rope': {
        const w = d.w ?? 200;
        g.moveTo(0, 0).quadraticCurveTo(w / 2, 22, w, 0).stroke({ color: 0xb3132b, width: 6 });
        g.circle(0, 0, 9).fill(COLORS.brass);
        g.circle(w, 0, 9).fill(COLORS.brass);
        c.zIndex = d.y + 10;
        break;
      }
      case 'trophyShelf': {
        const w = d.w ?? 300;
        const h = d.h ?? 44;
        g.roundRect(0, -60, w, h + 60, 8).fill(0x1a0b10).stroke({ color: COLORS.brass, width: 3 });
        g.rect(6, h - 8, w - 12, 6).fill(COLORS.brass);
        g.rect(6, -54, w - 12, 50).fill({ color: 0xffffff, alpha: 0.04 });
        const t = new Text({ text: 'VITRINE', style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2 } });
        t.anchor.set(0.5);
        t.position.set(w / 2, h + 12);
        c.addChild(t);
        this.shelf = new Container();
        c.addChild(this.shelf);
        this.shelfSize = { w, h };
        this.refreshShelf();
        c.zIndex = d.y + h;
        this.obstacles.push({ x: d.x, y: d.y - 60, w, h: h + 60 });
        this.interactables.push({ kind: 'shelf', x: d.x + w / 2, y: d.y + h + 30, title: 'Vitrine ansehen' });
        break;
      }
    }
    return c;
  }

  refreshShelf() {
    if (!this.shelf) return;
    const { w, h } = this.shelfSize;
    this.shelf.removeChildren().forEach((c) => c.destroy({ children: true }));
    const trophies = this.state.data.trophies.slice(-8);
    if (trophies.length === 0) {
      const t = new Text({ text: 'noch leer', style: { fontFamily: FONT_BODY, fontSize: 14, fill: 0x8a7a6a, fontStyle: 'italic' } });
      t.anchor.set(0.5);
      t.position.set(w / 2, h / 2 - 14);
      this.shelf.addChild(t);
      return;
    }
    const step = (w - 20) / Math.max(1, trophies.length);
    trophies.forEach((tr, i) => {
      const t = drawTrophy(tr.kind, tr.medal);
      t.scale.set(0.42);
      t.position.set(10 + step * (i + 0.5), h - 8);
      this.shelf!.addChild(t);
    });
  }

  private buildDoors() {
    for (const door of this.def.doors) {
      const target = getRoom(door.to);
      const locked = !!target.unlockCost && !this.state.data.unlockedRooms.includes(target.id);
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-46, 20, 92, WALL_H - 20, 10).fill(0x050304).stroke({ color: this.def.theme.wallTrim, width: 4 });
      g.roundRect(-38, 28, 76, WALL_H - 28, 8).fill(locked ? 0x1a0b10 : 0x2a1a10);
      if (!locked) {
        const glow = new Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.position.set(0, WALL_H - 10);
        glow.width = 160;
        glow.height = 90;
        glow.tint = target.theme.neon;
        glow.alpha = 0.5;
        glow.blendMode = 'add';
        c.addChild(glow);
      }
      c.addChildAt(g, 0);
      const t = new Text({
        text: locked ? `${door.label}\n🔒 ${formatChips(target.unlockCost!)}` : door.label,
        style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xfff6e6, align: 'center' },
      });
      t.anchor.set(0.5);
      t.position.set(0, 82);
      c.addChild(t);
      c.position.set(door.x, 0);
      this.world.addChild(c);
      this.interactables.push({
        kind: 'door',
        door,
        x: door.x,
        y: WALL_H + 30,
        title: locked ? `${door.label} öffnen (${formatChips(target.unlockCost!)})` : `Zur ${door.label}`,
      });
    }
  }

  private buildLights() {
    const th = this.def.theme;
    // Ceiling lamps: soft pools of light on the carpet.
    for (let y = WALL_H + 120; y < this.def.height; y += 260) {
      for (let x = 160; x < this.def.width; x += 320) {
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.width = s.height = 420;
        s.tint = th.light;
        s.alpha = 0.16;
        s.blendMode = 'add';
        this.lights.addChild(s);
      }
    }
    for (const st of this.def.stations) {
      const game = getGame(st.game);
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.position.set(st.x + game.footprint.w / 2, st.y + game.footprint.h / 2);
      s.width = game.footprint.w * 2.6;
      s.height = game.footprint.h * 2.6;
      s.tint = th.neon;
      s.alpha = 0.22;
      s.blendMode = 'add';
      this.lights.addChild(s);
    }
    const signGlow = new Sprite(glowTexture());
    signGlow.anchor.set(0.5);
    signGlow.position.set(this.def.width / 2, 70);
    signGlow.width = 900;
    signGlow.height = 240;
    signGlow.tint = th.neon;
    signGlow.alpha = 0.25;
    signGlow.blendMode = 'add';
    this.lights.addChild(signGlow);
  }

  // ---- Input ------------------------------------------------------------

  private keyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if ((e.code === 'KeyE' || e.code === 'Enter') && !this.frozen && this.nearest) this.onInteract(this.nearest);
    if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      this.target = null;
      this.pending = null;
    }
  };
  private keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private clearKeys = () => this.keys.clear();

  private onTap(e: FederatedPointerEvent) {
    if (this.frozen) return;
    const p = this.world.toLocal(e.global);
    // Tapped close to something interactive? Walk there and use it.
    let best: Interactable | null = null;
    let bestD = 90;
    for (const i of this.interactables) {
      const d = Math.hypot(i.x - p.x, i.y - 20 - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best) {
      this.target = { x: best.x, y: best.y };
      this.pending = best;
    } else {
      this.target = { x: p.x, y: p.y };
      this.pending = null;
    }
  }

  // ---- Simulation -------------------------------------------------------

  private collides(x: number, y: number) {
    const r = 20;
    return this.obstacles.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const dt = Math.min(dtMs, 50) / 1000;
    let dx = 0;
    let dy = 0;
    if (!this.frozen) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      if (dx === 0 && dy === 0 && this.target) {
        const tx = this.target.x - this.player.view.x;
        const ty = this.target.y - this.player.view.y;
        const d = Math.hypot(tx, ty);
        if (d < 8) {
          this.target = null;
          if (this.pending) {
            const p = this.pending;
            this.pending = null;
            this.onInteract(p);
          }
        } else {
          dx = tx / d;
          dy = ty / d;
        }
      }
    }
    const len = Math.hypot(dx, dy);
    const pv = this.player.view;
    if (len > 0) {
      const speed = 280;
      const mx = (dx / len) * speed * dt;
      const my = (dy / len) * speed * dt;
      const ox = pv.x;
      const oy = pv.y;
      if (!this.collides(pv.x + mx, pv.y)) pv.x += mx;
      if (!this.collides(pv.x, pv.y + my)) pv.y += my;
      // Stuck while walking to a tap target: give up, but still use the thing if we're close.
      if (this.target && Math.hypot(pv.x - ox, pv.y - oy) < 0.5) {
        const p = this.pending;
        const close = p && Math.hypot(p.x - pv.x, p.y - pv.y) < 70;
        this.target = null;
        this.pending = null;
        if (p && close) this.onInteract(p);
      }
    }
    this.player.update(dtMs, len > 0 ? Math.atan2(dy, dx) : null);
    pv.zIndex = pv.y + 16;

    // Nearest interactable and prompt.
    let best: Interactable | null = null;
    let bestD = 64;
    for (const i of this.interactables) {
      const d = Math.hypot(i.x - pv.x, i.y - pv.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      this.showPrompt(best);
    }
    if (this.prompt.visible) this.prompt.y = pv.y - 58 + Math.sin(this.time * 4) * 3;

    // Lamps on machines pulse; the neon sign flickers now and then.
    for (const l of this.stationLamps) l.g.alpha = 0.55 + 0.45 * Math.sin(this.time * 3 + l.phase);
    this.sign.alpha = Math.sin(this.time * 31) > 0.97 ? 0.55 : 1;

    this.updateCamera();
  }

  private showPrompt(i: Interactable | null) {
    if (!i || this.frozen) {
      this.prompt.visible = false;
      return;
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    this.promptText.text = `${touch ? 'Tippen' : 'E'} · ${i.title}`;
    const w = this.promptText.width + 28;
    const bubble = this.prompt.children[0] as Graphics;
    bubble.clear().roundRect(-w / 2, -18, w, 36, 18).fill(COLORS.lamp).stroke({ color: COLORS.ink, width: 2 });
    bubble.poly([-8, 17, 8, 17, 0, 27]).fill(COLORS.lamp);
    this.prompt.x = this.player.view.x;
    this.prompt.visible = true;
  }

  savePosition() {
    this.state.data.roomId = this.def.id;
    this.state.data.position = { x: Math.round(this.player.view.x), y: Math.round(this.player.view.y) };
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    const narrow = w < 700;
    this.zoom = Math.max(narrow ? 0.72 : 0.5, Math.min(1.2, Math.min(w / 1000, (h - this.topInset) / 720)));
    this.world.scale.set(this.zoom);
    this.updateCamera();
  }

  private updateCamera() {
    const z = this.world.scale.x;
    const W = this.def.width * z;
    const H = this.def.height * z;
    const px = this.player.view.x * z;
    const py = this.player.view.y * z;
    const cx = W <= this.screenW ? (this.screenW - W) / 2 : Math.min(0, Math.max(this.screenW - W, this.screenW / 2 - px));
    const top = this.topInset;
    const free = this.screenH - top;
    const cy = H <= free ? top + (free - H) / 2 : Math.min(top, Math.max(this.screenH - H, top + free / 2 - py));
    this.world.position.set(cx, cy);
  }

  /** Screen position of a world point (used to zoom into a machine). */
  toScreen(x: number, y: number) {
    return this.world.toGlobal({ x, y });
  }

  destroy() {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearKeys);
    this.view.destroy({ children: true });
  }
}
