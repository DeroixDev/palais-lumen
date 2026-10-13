// The changing room: a tall brass mirror with your avatar and, next to it, a display case
// with every piece of the chosen slot on velvet. Pieces you don't own yet show their price
// on a brass plate; they are sold in the shop next door.

import { Container, Sprite, type Texture } from 'pixi.js';
import { COLORS, glowTexture, emblemTexture } from '../core/fx';
import { button, brass } from '../core/ui';
import { focusable } from '../core/focus';
import { sfx } from '../core/audio';
import { COMPANION_COLOR, SLOT_LABEL, WARDROBE, type Outfitting, type WardrobeOption, type WardrobeSlot } from '../core/items';
import type { GameState } from '../core/state';
import { Chibi } from '../world/painted/chibi';
import { INK, dark, fillInk, glowAt, light, paint, rgb } from '../world/painted/brush';
import { Panel } from './panel';
import { drawStone } from './stone';
import { CREAM, caseTexture, plateTexture, screw } from './kit';

const SLOTS: WardrobeSlot[] = ['outfit', 'jacket', 'hairStyle', 'hair', 'hat', 'accessory', 'companion'];

const matches = (o: WardrobeOption, look: Outfitting) => Object.entries(o.set).every(([k, v]) => look[k as keyof Outfitting] === v);

const texCache = new Map<string, Texture>();
function once(key: string, make: () => Texture) {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = make()));
  return t;
}

/** The standing mirror: brass frame with an arched top, silvered glass and reflections. */
function mirrorTexture(w: number, h: number) {
  return once(`mirror-${w}x${h}`, () =>
    paint(w + 16, h + 16, (c) => {
      c.translate(8, 6);
      const arch = (inset: number) => {
        const r = (w - inset * 2) / 2;
        const top = inset + Math.min(r, h * 0.42);
        c.beginPath();
        c.moveTo(inset, h - inset - 18);
        c.lineTo(inset, top);
        c.ellipse(w / 2, top, r, Math.min(r, h * 0.42) - inset * 0.2, 0, Math.PI, 0);
        c.lineTo(w - inset, h - inset - 18);
        c.quadraticCurveTo(w - inset, h - inset, w - inset - 18, h - inset);
        c.lineTo(inset + 18, h - inset);
        c.quadraticCurveTo(inset, h - inset, inset, h - inset - 18);
        c.closePath();
      };
      // Shadow.
      c.save();
      c.translate(3, 6);
      arch(0);
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.fill();
      c.restore();
      arch(0);
      fillInk(c, brass(c, 0, 0, w * 0.4, h), 2.5);
      c.save();
      arch(0);
      c.clip();
      c.strokeStyle = 'rgba(255,248,226,0.8)';
      c.lineWidth = 2.5;
      c.translate(2, 2);
      arch(0);
      c.stroke();
      c.restore();
      arch(7);
      c.strokeStyle = 'rgba(80,46,10,0.55)';
      c.lineWidth = 1.4;
      c.stroke();
      // Glass.
      arch(13);
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#5a7488');
      g.addColorStop(0.45, '#2a3c4c');
      g.addColorStop(1, '#141c28');
      fillInk(c, g, 1.6);
      c.save();
      arch(13);
      c.clip();
      // A dim reflection of the foyer: warm lamp glow and the floor.
      glowAt(c, w * 0.3, h * 0.25, w * 0.5, h * 0.35, 0xffd8a0, 0.22);
      c.fillStyle = 'rgba(20,10,20,0.35)';
      c.fillRect(0, h * 0.72, w, h);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? 'rgba(255,240,220,0.04)' : 'rgba(0,0,0,0.06)';
        c.beginPath();
        c.moveTo((i / 6) * w, h * 0.72);
        c.lineTo(((i + 1) / 6) * w, h * 0.72);
        c.lineTo(((i + 1) / 6) * w * 1.3 - w * 0.15, h);
        c.lineTo((i / 6) * w * 1.3 - w * 0.15, h);
        c.fill();
      }
      glowAt(c, w / 2, h * 0.82, w * 0.32, h * 0.06, 0x05030a, 0.55);
      // Streaks.
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.beginPath();
      c.moveTo(w * 0.16, h * 0.12);
      c.lineTo(w * 0.32, h * 0.06);
      c.lineTo(w * 0.12, h * 0.75);
      c.lineTo(w * 0.04, h * 0.8);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.beginPath();
      c.moveTo(w * 0.38, h * 0.04);
      c.lineTo(w * 0.44, h * 0.04);
      c.lineTo(w * 0.2, h * 0.8);
      c.lineTo(w * 0.15, h * 0.8);
      c.fill();
      c.restore();
      // Inner shadow.
      c.save();
      arch(13);
      c.clip();
      c.strokeStyle = 'rgba(6,2,8,0.5)';
      c.lineWidth = 10;
      c.translate(0, 3);
      arch(13);
      c.stroke();
      c.restore();
      // Crest with a moth at the top.
      const cx = w / 2;
      const cy = 10;
      c.beginPath();
      c.moveTo(cx - 26, cy + 10);
      c.quadraticCurveTo(cx, cy - 16, cx + 26, cy + 10);
      c.quadraticCurveTo(cx, cy + 2, cx - 26, cy + 10);
      fillInk(c, brass(c, cx - 26, cy - 16, cx + 26, cy + 10, 0.1), 1.6);
      screw(c, 24, h - 24, 4);
      screw(c, w - 24, h - 24, 4);
    }, 2),
  );
}

/** A fabric or hair swatch: a round, shaded button of colour. */
function swatchTexture(col: number, hair: boolean) {
  return once(`sw-${col}-${hair}`, () =>
    paint(60, 60, (c) => {
      c.beginPath();
      c.arc(31, 33, 24, 0, Math.PI * 2);
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fill();
      c.beginPath();
      c.arc(30, 30, 24, 0, Math.PI * 2);
      const g = c.createRadialGradient(22, 20, 2, 30, 30, 26);
      g.addColorStop(0, rgb(light(col, 0.35)));
      g.addColorStop(0.55, rgb(col));
      g.addColorStop(1, rgb(dark(col, 0.45)));
      fillInk(c, g, 2);
      c.save();
      c.clip();
      if (hair) {
        // Strands.
        c.strokeStyle = rgb(light(col, 0.3), 0.45);
        c.lineWidth = 1.4;
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(30 + i * 6, 4);
          c.bezierCurveTo(30 + i * 6 + 10, 22, 30 + i * 6 - 10, 38, 30 + i * 6 + 4, 58);
          c.stroke();
        }
      } else {
        // Woven cloth and a stitched hem.
        c.strokeStyle = 'rgba(255,255,255,0.06)';
        c.lineWidth = 1;
        for (let y = 6; y < 58; y += 3) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(60, y);
          c.stroke();
        }
        c.setLineDash([3, 3]);
        c.strokeStyle = rgb(light(col, 0.45), 0.6);
        c.beginPath();
        c.arc(30, 30, 19, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();
      c.beginPath();
      c.ellipse(22, 19, 8, 5, -0.6, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fill();
      c.strokeStyle = INK;
    }, 2),
  );
}

export class WardrobePanel extends Panel {
  private slot = 0;
  private fresh = true;
  private draft: Outfitting;

  constructor(
    private state: GameState,
    private toast: (t: string) => void,
    private onDone: (changed: boolean) => void,
  ) {
    super();
    this.draft = { ...state.look };
  }

  protected build() {
    const n = this.narrow;
    const cols = n ? 4 : 5;
    const chipW = n ? 86 : 108;
    const chipH = n ? 104 : 120;
    const gap = n ? 8 : 12;
    const gridW = cols * chipW + (cols - 1) * gap;
    const options = WARDROBE.filter((o) => o.slot === SLOTS[this.slot]);
    const gridRows = Math.max(2, ...SLOTS.map((sl) => Math.ceil(WARDROBE.filter((o) => o.slot === sl).length / cols)));
    const mirrorW = n ? 230 : 300;
    const mirrorH = n ? 240 : 470;
    let gridX: number;
    let tabsY: number;
    let gridY: number;
    if (n) {
      this.W = 404;
      tabsY = 66 + mirrorH + 30;
      gridY = tabsY + 2 * 56 + 4;
      this.H = gridY + gridRows * (chipH + gap) + 86;
      gridX = (this.W - gridW) / 2;
    } else {
      this.W = 40 + mirrorW + 40 + gridW + 44;
      tabsY = 96;
      gridY = tabsY + 2 * 56 + 8;
      this.H = Math.max(gridY + gridRows * (chipH + gap) + 100, 80 + mirrorH + 110);
      gridX = 40 + mirrorW + 40;
    }
    this.frame('UMKLEIDE', 0xff5fa2, () => this.onDone(false));

    // Mirror with the avatar.
    const mx = n ? (this.W - mirrorW) / 2 : 40;
    const my = n ? 58 : 76;
    const mirror = new Sprite(mirrorTexture(mirrorW, mirrorH));
    mirror.position.set(mx - 8, my - 6);
    this.panel.addChild(mirror);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(mx + mirrorW / 2, my + mirrorH * 0.55);
    halo.width = mirrorW * 1.0;
    halo.height = mirrorH * 0.75;
    halo.tint = light(this.draft.jacket ?? 0x6b1a2e, 0.3);
    halo.alpha = 0.22;
    halo.blendMode = 'add';
    this.panel.addChild(halo);
    const host = this.state.data.players[this.state.selfId];
    const p = new Chibi(host?.color ?? COLORS.lamp, { ...this.draft, skin: host?.skin });
    const floor = my + mirrorH * (n ? 0.86 : 0.84);
    p.view.scale.set(n ? 1.75 : 2.6);
    p.view.position.set(mx + mirrorW / 2, floor);
    this.panel.addChild(p.view);
    // Turns to the side now and then, so you see the profile too.
    this.tickers.push((time, dt) => {
      const k = (time * 0.35) % 1;
      p.faceTowards(k < 0.4 ? Math.PI / 2 : k < 0.5 ? 0.15 : k < 0.9 ? Math.PI / 2 : Math.PI - 0.15);
      p.update(dt, null);
    });
    if (this.draft.companion !== 'none') {
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.width = m.height = n ? 28 : 40;
      m.tint = COMPANION_COLOR[this.draft.companion];
      const base = m.scale.x;
      const gl = new Sprite(glowTexture());
      gl.anchor.set(0.5);
      gl.width = gl.height = n ? 80 : 110;
      gl.tint = m.tint;
      gl.alpha = 0.6;
      gl.blendMode = 'add';
      this.panel.addChild(gl, m);
      const cx = mx + mirrorW / 2;
      const cy = my + mirrorH * 0.4;
      this.tickers.push((time) => {
        const a = time * 1.4;
        m.position.set(cx + Math.cos(a) * mirrorW * 0.3, cy + Math.sin(a * 1.6) * mirrorH * 0.12);
        gl.position.copyFrom(m.position);
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(time * 18)));
      });
    }

    // Slot tabs and the options of the chosen slot.
    this.tabs(SLOTS.map((s) => SLOT_LABEL[s]), this.slot, tabsY, (i) => {
      this.slot = i;
      this.fresh = true;
      sfx.rustle();
      this.rebuild();
    }, 4, n ? 86 : (gridW - 24) / 4, gridX, gridW);

    const chips: Container[] = [];
    // A short list sits centred under the tabs.
    const used = Math.min(cols, options.length);
    const ox = (gridW - (used * chipW + (used - 1) * gap)) / 2;
    options.forEach((o, i) => {
      const chip = this.chip(o, chipW, chipH);
      chip.pivot.set(chipW / 2, chipH / 2);
      chip.position.set(gridX + ox + (i % cols) * (chipW + gap) + chipW / 2, gridY + Math.floor(i / cols) * (chipH + gap) + chipH / 2);
      this.panel.addChild(chip);
      chips.push(chip);
    });
    if (this.fresh) this.popIn(chips);
    this.fresh = false;

    const changed = JSON.stringify(this.draft) !== JSON.stringify(this.state.look);
    const by = this.H - 48;
    const ok = button({ label: 'ANZIEHEN', width: n ? 160 : 220, height: 54, color: COLORS.brass, fontSize: n ? 19 : 21, onClick: () => this.apply() });
    const back = button({ label: 'ZURÜCK', width: n ? 140 : 190, height: 54, color: 0x3a1428, textColor: CREAM, fontSize: n ? 18 : 20, onClick: () => this.onDone(false) });
    if (n) {
      back.position.set(this.W / 2 - 82, by);
      ok.position.set(this.W / 2 + 90, by);
    } else {
      const cx = gridX + gridW / 2;
      back.position.set(cx - 118, by);
      ok.position.set(cx + 118, by);
    }
    ok.setEnabled(changed);
    this.panel.addChild(back, ok);
  }

  private chip(o: WardrobeOption, w: number, h: number) {
    const c = new Container();
    const n = this.narrow;
    const owned = this.state.isOwned(o.id);
    const on = matches(o, this.draft);
    const box = new Sprite(caseTexture(w, h, on ? 0x6b2a18 : 0x4a1428, on));
    box.position.set(-6, -4);
    c.addChild(box);
    const cx = w / 2;
    const floor = h * 0.62;
    if (o.slot === 'jacket' || o.slot === 'hair') {
      const s = new Sprite(swatchTexture(o.swatch ?? 0, o.slot === 'hair'));
      s.anchor.set(0.5);
      s.scale.set(n ? 0.72 : 0.85);
      s.position.set(cx, floor - (n ? 20 : 24));
      c.addChild(s);
    } else if (o.slot === 'companion') {
      if (o.set.companion === 'none') {
        const t = this.text('—', 30, 0x8a7a6a, true);
        t.anchor.set(0.5);
        t.position.set(cx, floor - 22);
        c.addChild(t);
      } else {
        const col = COMPANION_COLOR[o.set.companion as keyof typeof COMPANION_COLOR];
        const gl = new Sprite(glowTexture());
        gl.anchor.set(0.5);
        gl.width = gl.height = 70;
        gl.tint = col;
        gl.alpha = 0.5;
        gl.blendMode = 'add';
        gl.position.set(cx, floor - 26);
        const m = new Sprite(emblemTexture());
        m.anchor.set(0.5);
        m.width = m.height = n ? 34 : 40;
        m.tint = col;
        m.position.set(cx, floor - 26);
        c.addChild(gl, m);
      }
    } else {
      const host = this.state.data.players[this.state.selfId];
      const p = new Chibi(host?.color ?? COLORS.lamp, { ...this.draft, ...o.set, skin: host?.skin });
      p.view.scale.set((floor - 8) / (o.slot === 'hat' ? 104 : 80));
      p.view.position.set(cx, floor + 2);
      c.addChild(p.view);
      if (on) this.tickers.push((_t, dt) => p.update(dt, null));
    }
    const name = this.text(o.name, n ? 15 : 16, owned ? CREAM : 0xb8a8a0, true);
    name.anchor.set(0.5, 0.5);
    name.position.set(cx, h - (n ? 18 : 20));
    if (name.width > w - 10) name.scale.set((w - 10) / name.width);
    c.addChild(name);
    if (!owned) {
      // Dimmed behind the glass, with the price on a brass plate.
      const veil = new Sprite(caseTexture(w, h, 0x000000, false));
      veil.position.set(-6, -4);
      veil.tint = 0x000000;
      veil.alpha = 0.3;
      c.addChildAt(veil, c.children.length - 1);
      const plate = new Container();
      const ps = new Sprite(plateTexture(n ? 58 : 66, 28, 'brass'));
      ps.anchor.set(0.5);
      const st = drawStone(8, false);
      st.x = -13;
      const t = this.text(String(o.price), 17, 0x2a1406, true);
      t.style.dropShadow = false;
      t.anchor.set(0, 0.5);
      t.position.set(-4, 1);
      plate.addChild(ps, st, t);
      plate.position.set(w - (n ? 31 : 36), -3);
      c.addChild(plate);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerdown', () => c.scale.set(0.95));
    c.on('pointerup', () => c.scale.set(1));
    c.on('pointerupoutside', () => c.scale.set(1));
    c.on('pointerout', () => c.scale.set(1));
    c.on('pointertap', () => {
      if (!owned) {
        sfx.tick();
        this.toast(`${o.name} gibt es im Laden für ${o.price} Mondsteine.`);
        return;
      }
      if (on) return;
      sfx.rustle();
      // The outfit picks a fitting accessory, but keep a chosen one where it still fits.
      this.draft = { ...this.draft, ...o.set };
      this.rebuild();
    });
    focusable(c, { label: `${o.name}${on ? ', gewählt' : ''}`, locked: () => (owned ? null : `im Laden für ${o.price} Mondsteine`) });
    return c;
  }

  private apply() {
    this.state.setLook(this.draft);
    sfx.rustle();
    sfx.shimmer();
    this.onDone(true);
  }
}

