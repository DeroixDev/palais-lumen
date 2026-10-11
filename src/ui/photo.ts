// Photo mode: hides the HUD, lets you pan and zoom the camera over the room, strike a pose,
// pick a painted frame or a sepia look, and take a picture (renderer.extract → PNG). The photo
// opens in a dialog with "Speichern" (download) and "Nochmal"; Escape or the knob leaves.

import { Container, Graphics, Rectangle, Sprite, Texture, type Application, type FederatedPointerEvent } from 'pixi.js';
import { FONT_BODY, drawEmblem, reducedMotion } from '../core/fx';
import { sfx } from '../core/audio';
import { button, brass, type Button } from '../core/ui';
import { focusable } from '../core/focus';
import type { GameState } from '../core/state';
import type { RoomScene } from '../world/room';
import { poufTexture } from '../world/painted/chibi';
import { INK, fillInk, glowAt, gold, paint, seeded } from '../world/painted/brush';
import { bodyText, closeKnob, enterMotion } from './kit';
import { animate } from '../core/tween';

import { HOUSE, HOUSE_SLUG } from '../core/brand';
export interface PhotoHost {
  app: Application;
  state: GameState;
  room(): RoomScene;
  /** True when a photo can be taken right now (walking around a room, nothing open). */
  canEnter(): boolean;
  /** main's mode: photo mode only lasts while it stays 'room'. */
  mode(): string;
  /** Hide or show the HUD, the toasts and the quips. */
  chrome(show: boolean): void;
  modal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; onClick: () => void }[]): void;
  closeModal(): void;
  modalOpen(): boolean;
  toast(text: string): void;
}

type Pose = 'none' | 'wave' | 'cheer' | 'sit';
type Look = 'none' | 'polaroid' | 'gold' | 'sepia';

const POSES: [Pose, string][] = [
  ['wave', 'Winken'],
  ['cheer', 'Jubeln'],
  ['sit', 'Sitzen'],
];
const LOOKS: [Look, string][] = [
  ['none', 'Ohne'],
  ['polaroid', 'Polaroid'],
  ['gold', 'Gold-Rahmen'],
  ['sepia', 'Sepia'],
];

/** A raised arm (sleeve and hand) in the player's colours; the shoulder is at the bottom. */
function armTexture(skin: number, jacket: number) {
  const css = (n: number) => `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
  return paint(16, 34, (c) => {
    c.translate(8, 30);
    c.beginPath();
    c.moveTo(-3.5, 2);
    c.lineTo(-3, -19);
    c.lineTo(3, -19);
    c.lineTo(3.5, 2);
    c.closePath();
    const g = c.createLinearGradient(-4, 0, 4, 0);
    g.addColorStop(0, css(jacket));
    g.addColorStop(1, 'rgba(10,4,14,0.9)');
    c.fillStyle = css(jacket);
    fillInk(c, g, 1.3);
    c.beginPath();
    c.arc(0, -22, 4.6, 0, Math.PI * 2);
    fillInk(c, css(skin), 1.3);
  }, 3);
}

/** The active photo mode, so day cards and the boss banner can end it first (see leavePhoto). */
let current: PhotoMode | null = null;

/**
 * Anything big that starts while photo mode is on (a day card, a boss phase, an overlay, a game,
 * a dialog) ends photo mode first, so it never plays hidden under the camera or ends up in a picture.
 */
export function leavePhoto() {
  current?.leave();
}

/** The round shutter key: brass ring, velvet lens with aperture blades. */
function shutterTexture(size: number, hot: boolean) {
  return paint(size + 16, size + 16, (c) => {
    const o = size / 2 + 8;
    const r = size / 2;
    if (hot) glowAt(c, o, o, r + 8, r + 8, 0xffcf7a, 0.5);
    c.beginPath();
    c.arc(o + 1, o + 3, r - 1, 0, Math.PI * 2);
    c.fillStyle = 'rgba(6,2,8,0.5)';
    c.fill();
    c.beginPath();
    c.arc(o, o, r - 1, 0, Math.PI * 2);
    fillInk(c, brass(c, o - r, o - r, o + r * 0.6, o + r, hot ? 0.2 : 0), 2.2);
    c.beginPath();
    c.arc(o, o, r * 0.72, 0, Math.PI * 2);
    const g = c.createRadialGradient(o - r * 0.25, o - r * 0.3, 1, o, o, r * 0.72);
    g.addColorStop(0, '#5a3a6a');
    g.addColorStop(1, '#120614');
    fillInk(c, g, 1.6);
    // Aperture blades.
    c.save();
    c.beginPath();
    c.arc(o, o, r * 0.72, 0, Math.PI * 2);
    c.clip();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(o + Math.cos(a) * r * 0.22, o + Math.sin(a) * r * 0.22);
      c.lineTo(o + Math.cos(a + 0.9) * r * 0.8, o + Math.sin(a + 0.9) * r * 0.8);
      c.strokeStyle = 'rgba(255,230,190,0.22)';
      c.lineWidth = 1.4;
      c.stroke();
    }
    c.restore();
    c.beginPath();
    c.arc(o - r * 0.22, o - r * 0.26, r * 0.12, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
  }, 2.5);
}

/** The frame or tint over the whole picture, painted once per size. */
function lookTexture(look: Look, w: number, h: number, caption: string) {
  return paint(w, h, (c) => {
    if (look === 'polaroid') {
      const m = Math.max(14, Math.round(Math.min(w, h) * 0.035));
      const bottom = Math.max(54, Math.round(h * 0.13));
      c.beginPath();
      c.rect(0, 0, w, h);
      c.rect(m, m, w - m * 2, h - m - bottom);
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, '#fbf7ee');
      g.addColorStop(1, '#ece3d0');
      c.fillStyle = g;
      c.fill('evenodd');
      // Paper grain.
      const rnd = seeded(w * 7 + h);
      for (let i = 0; i < (w * h) / 900; i++) {
        c.fillStyle = `rgba(120,90,50,${0.03 + rnd() * 0.04})`;
        c.fillRect(rnd() * w, rnd() * h, 1.2, 1.2);
      }
      // Inner shadow of the photo window.
      c.strokeStyle = 'rgba(40,24,10,0.35)';
      c.lineWidth = 2;
      c.strokeRect(m - 1, m - 1, w - m * 2 + 2, h - m - bottom + 2);
      // Caption, as if written with a felt pen.
      const fs = Math.round(Math.min(bottom * 0.42, w * 0.045));
      c.font = `italic 600 ${fs}px ${FONT_BODY}`;
      c.fillStyle = '#2a2a4a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // Phones keep the shutter bottom right: the caption moves left of it.
      const cx = w < 720 ? (w - 104) / 2 + 6 : w / 2;
      c.fillText(caption, cx, h - bottom / 2 + 2, w < 720 ? w - 124 : w - 40);
      return;
    }
    if (look === 'gold') {
      const m = Math.max(18, Math.round(Math.min(w, h) * 0.045));
      for (const [inset, wid, dark] of [[0, m, false], [m * 0.32, m * 0.2, true]] as const) {
        c.beginPath();
        c.rect(inset, inset, w - inset * 2, h - inset * 2);
        c.rect(inset + wid, inset + wid, w - (inset + wid) * 2, h - (inset + wid) * 2);
        c.fillStyle = dark ? 'rgba(90,50,12,0.55)' : gold(c, 0, 0, w * 0.4, h);
        c.fill('evenodd');
      }
      // Bevel: lit top-left edges, shaded bottom-right.
      c.strokeStyle = 'rgba(255,246,214,0.8)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(1, h - 1);
      c.lineTo(1, 1);
      c.lineTo(w - 1, 1);
      c.stroke();
      c.strokeStyle = 'rgba(60,30,6,0.7)';
      c.beginPath();
      c.moveTo(w - 1, 1);
      c.lineTo(w - 1, h - 1);
      c.lineTo(1, h - 1);
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = 2.4;
      c.strokeRect(m, m, w - m * 2, h - m * 2);
      // Moth ornaments in the corners and the middle of the long edges.
      const pts: [number, number][] = [[m / 2, m / 2], [w - m / 2, m / 2], [m / 2, h - m / 2], [w - m / 2, h - m / 2], [w / 2, m / 2], [w / 2, h - m / 2]];
      for (const [x, y] of pts) {
        c.beginPath();
        c.arc(x, y, m * 0.62, 0, Math.PI * 2);
        fillInk(c, gold(c, x - m, y - m, x + m, y + m), 1.6);
        drawEmblem(c, x, y + 1, m * 1.0, '#7a4a12', '#3a1a08');
      }
      return;
    }
    if (look === 'sepia') {
      // Brown wash (mixes the colours towards sepia), a darker rim and some film grain.
      c.fillStyle = 'rgba(112,72,30,0.28)';
      c.fillRect(0, 0, w, h);
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      v.addColorStop(0, 'rgba(40,20,6,0)');
      v.addColorStop(1, 'rgba(40,20,6,0.6)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
      const rnd = seeded(w + h * 3);
      for (let i = 0; i < (w * h) / 500; i++) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.06)' : 'rgba(30,16,4,0.07)';
        c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
      }
    }
  }, 1);
}

export class PhotoMode {
  readonly view = new Container();
  active = false;
  private catcher = new Container();
  private warm = new Sprite(Texture.WHITE);
  private overlay = new Sprite(Texture.EMPTY);
  private ui = new Container();
  private flash = new Graphics();
  private hint: Container | null = null;
  private poseBtns = new Map<Pose, Button>();
  private lookBtns = new Map<Look, Button>();
  private shutter = new Container();
  private close: Container;
  private pose: Pose = 'none';
  private look: Look = 'none';
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; z: number } | null = null;
  private poseBits: Container[] = [];
  private poseBase: { y: number; rot: number } | null = null;
  private time = 0;
  private sparkleAt = 0;
  private w = 800;
  private h = 600;
  private busy = false;
  private btnW = new Map<Button, number>();
  /** The room photo mode was opened in. */
  private openedIn: RoomScene | null = null;
  /** The snapshot dialog is ours; any other dialog ends photo mode. */
  private ownModal = false;
  /** Pictures taken this time; counted when photo mode ends, so the achievement toast can be seen. */
  private shots = 0;

  constructor(private host: PhotoHost) {
    current = this;
    this.view.visible = false;
    this.catcher.eventMode = 'static';
    this.catcher.cursor = 'grab';
    this.catcher.on('pointerdown', (e: FederatedPointerEvent) => this.down(e));
    this.warm.tint = 0xe6c8a0;
    this.warm.blendMode = 'multiply';
    this.warm.visible = false;
    this.warm.eventMode = 'none';
    this.overlay.eventMode = 'none';
    this.flash.eventMode = 'none';
    this.flash.alpha = 0;
    this.close = closeKnob(() => this.exit(), 52);
    const sTex = shutterTexture(78, false);
    const sHot = shutterTexture(78, true);
    const s = new Sprite(sTex);
    s.anchor.set(0.5);
    this.shutter.addChild(s);
    this.shutter.eventMode = 'static';
    this.shutter.cursor = 'pointer';
    this.shutter.on('pointerover', () => (s.texture = sHot));
    this.shutter.on('pointerout', () => (s.texture = sTex));
    this.shutter.on('pointertap', () => void this.snap());
    focusable(this.shutter, { label: 'Foto aufnehmen', rect: { w: 78, h: 78 }, radius: 39 });
    for (const [p, label] of POSES) {
      const b = button({ label, width: 104, height: 42, display: false, fontSize: 18, color: 0x5a2238, onClick: () => this.setPose(this.pose === p ? 'none' : p) });
      this.btnW.set(b, 104);
      this.poseBtns.set(p, b);
    }
    for (const [l, label] of LOOKS) {
      const width = l === 'gold' ? 124 : 100;
      const b = button({ label, width, height: 42, display: false, fontSize: 18, onClick: () => this.setLook(l) });
      this.btnW.set(b, width);
      this.lookBtns.set(l, b);
    }
    this.ui.addChild(...this.poseBtns.values(), ...this.lookBtns.values(), this.shutter, this.close);
    this.view.addChild(this.catcher, this.warm, this.overlay, this.ui, this.flash);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.key, true);
    host.app.canvas.addEventListener('wheel', this.wheel, { passive: false });
  }

  private get room() {
    return this.host.room();
  }

  open() {
    if (this.active) return;
    if (!this.host.canEnter()) {
      this.host.toast('Fotos gehen, während du durch einen Saal läufst.');
      return;
    }
    this.active = true;
    this.view.visible = true;
    this.openedIn = this.room;
    this.room.setPhotoMode(true);
    this.host.chrome(false);
    sfx.click();
    this.setPose('none');
    this.setLook(this.look);
    this.resize(this.host.app.screen.width, this.host.app.screen.height);
    void enterMotion(this.ui, 260);
    this.showHint();
  }

  exit() {
    if (!this.active || this.busy) return;
    if (this.host.modalOpen() && this.ownModal) this.host.closeModal();
    this.end();
    sfx.click();
  }

  /** Ends photo mode right away because something else starts (even mid-snap). Leaves other dialogs open. */
  leave() {
    if (!this.active) return;
    if (this.ownModal && this.host.modalOpen()) this.host.closeModal();
    this.end();
  }

  private end() {
    const room = this.openedIn;
    this.ownModal = false;
    this.active = false;
    this.view.visible = false;
    this.ui.visible = true;
    this.flash.alpha = 0;
    this.pointers.clear();
    this.pinch = null;
    this.openedIn = null;
    if (room && !room.view.destroyed) {
      this.setPose('none', room);
      // Back to the normal camera; the room stays frozen if an overlay or game took over.
      room.setPhotoMode(false);
      if (this.host.mode() !== 'room') room.frozen = true;
    } else {
      this.poseBits = [];
      this.poseBase = null;
      this.pose = 'none';
    }
    this.host.chrome(true);
    if (this.shots) this.host.state.count('photo', this.shots);
    this.shots = 0;
  }

  private showHint() {
    this.hint?.destroy({ children: true });
    const touch = matchMedia('(pointer: coarse)').matches;
    const t = bodyText(touch ? 'Ziehen zum Schwenken · Zwei Finger zum Zoomen' : 'Ziehen zum Schwenken · Mausrad zum Zoomen', 17, 0xfff1c4, { bold: true });
    t.anchor.set(0.5);
    const bg = new Graphics().roundRect(-t.width / 2 - 16, -17, t.width + 32, 34, 17).fill({ color: 0x14080f, alpha: 0.72 }).stroke({ color: 0xe0b25a, width: 1.5, alpha: 0.8 });
    const c = new Container();
    c.addChild(bg, t);
    c.eventMode = 'none';
    this.ui.addChild(c);
    this.hint = c;
    this.placeHint();
    void animate(4200, (k) => {
      if (!c.destroyed) c.alpha = k < 0.8 ? 1 : (1 - k) / 0.2;
    }).then(() => {
      if (this.hint === c) this.hint = null;
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  /** Top middle, clear of the close knob; shrinks on narrow screens. */
  private placeHint() {
    const c = this.hint;
    if (!c) return;
    const room = this.w - 2 * 80;
    c.scale.set(Math.min(1, room / (c.width / c.scale.x)));
    c.position.set(this.w / 2, 44);
  }

  // ---- Camera -------------------------------------------------------------------------------

  private zoomLimits() {
    const d = this.room.def;
    const fit = Math.min(this.w / d.width, this.h / d.height);
    return { min: Math.max(0.25, Math.min(fit, this.room.zoom * 0.8)), max: 2.6 };
  }

  private clamp() {
    const world = this.room.world;
    const d = this.room.def;
    const z = world.scale.x;
    const W = d.width * z;
    const H = d.height * z;
    world.x = W <= this.w ? (this.w - W) / 2 : Math.min(0, Math.max(this.w - W, world.x));
    world.y = H <= this.h ? (this.h - H) / 2 : Math.min(0, Math.max(this.h - H, world.y));
  }

  /** Zooms to `z` keeping the screen point (sx, sy) on the same spot of the room. */
  private zoomAt(z: number, sx: number, sy: number) {
    const world = this.room.world;
    const { min, max } = this.zoomLimits();
    z = Math.max(min, Math.min(max, z));
    const wx = (sx - world.x) / world.scale.x;
    const wy = (sy - world.y) / world.scale.y;
    world.scale.set(z);
    world.position.set(sx - wx * z, sy - wy * z);
    this.clamp();
  }

  private down(e: FederatedPointerEvent) {
    if (this.busy) return;
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    this.catcher.cursor = 'grabbing';
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.room.world.scale.x };
    }
  }

  private local(e: MouseEvent) {
    const r = this.host.app.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.w, y: ((e.clientY - r.top) / r.height) * this.h };
  }

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!this.active || !p) return;
    const q = this.local(e);
    if (this.pinch && this.pointers.size >= 2) {
      p.x = q.x;
      p.y = q.y;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.zoomAt(this.pinch.z * (d / this.pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const world = this.room.world;
    world.x += q.x - p.x;
    world.y += q.y - p.y;
    p.x = q.x;
    p.y = q.y;
    this.clamp();
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.catcher.cursor = 'grab';
  };

  private wheel = (e: WheelEvent) => {
    if (!this.active || this.busy) return;
    e.preventDefault();
    const q = this.local(e);
    this.zoomAt(this.room.world.scale.x * Math.exp(-e.deltaY * 0.0015), q.x, q.y);
  };

  private key = (e: KeyboardEvent) => {
    if (!this.active || e.code !== 'Escape') return;
    // The first Escape closes the photo dialog (main does that); the next one leaves photo mode.
    if (this.host.modalOpen()) return;
    e.stopPropagation();
    this.exit();
  };

  // ---- Pose and look ---------------------------------------------------------------------------

  private setPose(p: Pose, room: RoomScene = this.room) {
    const player = room.player as RoomScene['player'] & { sit?(on: boolean): void };
    const pv = player.view;
    for (const b of this.poseBits) if (!b.destroyed) b.destroy();
    this.poseBits = [];
    player.sit?.(false);
    if (this.poseBase && !pv.destroyed) {
      pv.y = this.poseBase.y;
      pv.rotation = this.poseBase.rot;
    }
    this.poseBase = null;
    this.pose = p;
    for (const [k, b] of this.poseBtns) b.setSelected(k === p);
    if (p === 'none') return;
    this.poseBase = { y: pv.y, rot: pv.rotation };
    this.room.player.faceTowards(Math.PI / 2);
    const skin = this.host.state.data.players.host?.skin ?? 0xe8b48a;
    if (p === 'wave' || p === 'cheer') {
      const tex = armTexture(skin, this.host.state.look.jacket ?? 0x2a1630);
      for (const side of p === 'wave' ? [1] : [-1, 1]) {
        const arm = new Sprite(tex);
        arm.anchor.set(0.5, 30 / 34);
        arm.position.set(side * 12, -50);
        arm.label = String(side);
        pv.addChild(arm);
        this.poseBits.push(arm);
      }
    } else if (player.sit) {
      // Sitting: the painted figure sits down on its pouf (src/world/painted/chibi.ts).
      player.sit(true);
    } else {
      // The simple figure: a pouf behind it at hip height.
      const s = new Sprite(poufTexture());
      s.anchor.set(0.5, 34 / 38);
      s.position.set(0, 4);
      s.scale.set(1.3);
      pv.addChildAt(s, 1);
      this.poseBits.push(s);
    }
    sfx.click();
  }

  private setLook(l: Look) {
    this.look = l;
    for (const [k, b] of this.lookBtns) b.setSelected(k === l);
    this.bakeLook();
  }

  private bakeLook() {
    const old = this.overlay.texture;
    if (old !== Texture.EMPTY) old.destroy(true);
    this.overlay.texture = Texture.EMPTY;
    this.warm.visible = this.look === 'sepia';
    if (this.look === 'none') return;
    const d = this.host.state.data;
    const floor = this.room.def.floor;
    const caption = `${HOUSE} · Tag ${d.evening.number} · ${floor ? `Etage ${floor}` : 'Foyer'}`;
    this.overlay.texture = lookTexture(this.look, Math.ceil(this.w), Math.ceil(this.h), caption);
  }

  // ---- Taking the picture --------------------------------------------------------------------

  private async snap() {
    if (this.busy || !this.active) return;
    this.busy = true;
    const app = this.host.app;
    this.ui.visible = false;
    let url = '';
    try {
      const cv = app.renderer.extract.canvas({ target: app.stage, frame: new Rectangle(0, 0, this.w, this.h) }) as HTMLCanvasElement;
      url = cv.toDataURL('image/png');
    } catch {
      url = '';
    }
    this.ui.visible = true;
    sfx.shutter();
    this.flash.clear().rect(0, 0, this.w, this.h).fill(0xfff8e8);
    const peak = reducedMotion() ? 0.35 : 0.95;
    await animate(380, (k) => (this.flash.alpha = peak * (1 - k)));
    this.flash.alpha = 0;
    this.busy = false;
    // Something else started during the flash: the picture is dropped.
    if (!this.active) return;
    if (!url) {
      this.host.toast('Das Foto hat leider nicht geklappt.');
      return;
    }
    this.shots++;
    this.showPhoto(url);
  }

  private showPhoto(url: string) {
    const d = this.host.state.data;
    const wrap = document.createElement('div');
    wrap.className = 'photo-shot';
    wrap.style.cssText = 'display:grid;gap:10px;justify-items:center';
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Foto aus dem ${HOUSE}, Tag ${d.evening.number}`;
    img.style.cssText = 'display:block;max-width:100%;max-height:min(52vh,52dvh);border-radius:6px;box-shadow:0 0 0 2px rgba(224,178,90,.85),0 8px 22px rgba(0,0,0,.55);-webkit-touch-callout:default;user-select:auto';
    const tip = document.createElement('p');
    tip.textContent = 'Auf dem Handy kannst du das Bild auch lange drücken, um es zu sichern.';
    tip.style.cssText = 'margin:0;font-size:.95rem;opacity:.8;text-align:center';
    wrap.append(img, tip);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    this.ownModal = true;
    this.host.modal('Schnappschuss', wrap, [
      {
        label: 'Speichern',
        primary: true,
        onClick: () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = `${HOUSE_SLUG}-tag${d.evening.number}-${stamp}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          sfx.click();
        },
      },
      {
        label: 'Nochmal',
        onClick: () => {
          this.host.closeModal();
          sfx.click();
        },
      },
    ]);
  }

  // ---- Layout and animation ---------------------------------------------------------------------

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.catcher.hitArea = new Rectangle(0, 0, w, h);
    this.warm.width = w;
    this.warm.height = h;
    if (!this.active) return;
    this.bakeLook();
    this.clamp();
    const narrow = w < 720;
    const poses = [...this.poseBtns.values()];
    const looks = [...this.lookBtns.values()];
    if (narrow) {
      // Phones: two rows over the shutter at the bottom.
      const bottom = h - 18;
      // Shutter bottom right (under the thumb), clear of a Polaroid's caption.
      this.shutter.position.set(w - 52, bottom - 38);
      const row = (btns: Button[], cy: number) => {
        const gap = 8;
        const widths = btns.map((b) => this.btnW.get(b) ?? 100);
        const total = widths.reduce((a, b) => a + b, 0) + gap * (btns.length - 1);
        const s = Math.min(1, (w - 24) / total);
        let x = w / 2 - (total * s) / 2;
        btns.forEach((b, i) => {
          b.scale.set(s);
          b.position.set(x + (widths[i] * s) / 2, cy);
          x += (widths[i] + gap) * s;
        });
      };
      row(looks, bottom - 100);
      row(poses, bottom - 150);
    } else {
      // Wider screens: poses down the left edge, looks and the shutter down the right,
      // so the bottom of a Polaroid stays free.
      const step = 52;
      const col = (btns: Button[], x: number, top: number) =>
        btns.forEach((b, i) => {
          b.scale.set(1);
          b.position.set(x, top + i * step);
        });
      col(poses, 30 + 52, h / 2 - step);
      const top = h / 2 - step * 2;
      col(looks, w - 30 - 62, top);
      this.shutter.position.set(w - 30 - 62, top + step * 4 + 34);
    }
    this.close.position.set(w - 44, 44);
    if (this.hint) this.placeHint();
  }

  update(dtMs: number) {
    if (!this.active) return;
    if (this.ownModal && !this.host.modalOpen()) this.ownModal = false;
    // An overlay, a game, a new room or someone else's dialog took over: end photo mode cleanly.
    if (this.host.mode() !== 'room' || this.host.room() !== this.openedIn || (this.host.modalOpen() && !this.ownModal)) {
      this.leave();
      return;
    }
    this.time += dtMs / 1000;
    const t = this.time;
    const pv = this.room.player.view;
    const base = this.poseBase;
    if (!base) return;
    if (this.pose === 'wave') {
      for (const h of this.poseBits) h.rotation = 0.45 + Math.sin(t * 9) * 0.35;
      pv.rotation = base.rot + Math.sin(t * 4.5) * 0.04;
    } else if (this.pose === 'cheer') {
      const hop = Math.abs(Math.sin(t * 6));
      pv.y = base.y - hop * 10;
      for (const h of this.poseBits) h.rotation = Number(h.label) * (0.35 + hop * 0.25);
      if (t > this.sparkleAt) {
        this.sparkleAt = t + 0.7;
        this.room.floatText('✦', pv.x + (Math.random() - 0.5) * 40, pv.y - 90, 0xffcf7a, 20);
      }
    }
  }
}
