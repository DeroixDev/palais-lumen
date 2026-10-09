// The changing room: a big mirror view of your avatar and every piece you own, slot by slot.
// Pieces you don't own yet show their price; they are sold in the shop next door.

import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, glowTexture, mothTexture } from '../core/fx';
import { button } from '../core/ui';
import { sfx } from '../core/audio';
import { COMPANION_COLOR, SLOT_LABEL, WARDROBE, type Outfitting, type WardrobeOption, type WardrobeSlot } from '../core/items';
import type { GameState } from '../core/state';
import { Player } from '../world/player';
import { Panel } from './panel';
import { drawStone } from './stone';

const SLOTS: WardrobeSlot[] = ['outfit', 'jacket', 'hairStyle', 'hair', 'hat', 'accessory', 'companion'];

const matches = (o: WardrobeOption, look: Outfitting) => Object.entries(o.set).every(([k, v]) => look[k as keyof Outfitting] === v);

export class WardrobePanel extends Panel {
  private slot = 0;
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
    const chipW = n ? 118 : 112;
    const chipH = 104;
    const cols = n ? 4 : 5;
    const gridW = cols * chipW + (cols - 1) * 12;
    const previewW = n ? gridW : 330;
    const previewH = n ? 290 : 470;
    this.W = n ? gridW + 60 : previewW + gridW + 100;
    const tabsPer = 4;
    const options = WARDROBE.filter((o) => o.slot === SLOTS[this.slot]);
    const gridRows = Math.ceil(options.length / cols);
    const right = n ? 30 : previewW + 70;
    const tabsTop = n ? 110 + previewH + 30 : 120;
    const gridTop = tabsTop + 2 * 52 + 10;
    this.H = Math.max(n ? 0 : 120 + previewH + 110, gridTop + Math.max(2, gridRows) * (chipH + 12) + 110);
    this.frame('UMKLEIDE', 0xff5fa2, () => this.onDone(false));

    // Mirror with the avatar.
    const mx = n ? 30 : 40;
    const my = n ? 96 : 110;
    const mirror = new Graphics();
    mirror.roundRect(mx - 8, my - 8, previewW + 16, previewH + 16, previewW / 3).fill(COLORS.brassDark);
    mirror.roundRect(mx, my, previewW, previewH, previewW / 3.2).fill(0x24384a).stroke({ color: COLORS.brass, width: 3 });
    mirror.poly([mx + 30, my + 40, mx + 70, my + 20, mx + 30, my + previewH * 0.6]).fill({ color: 0xffffff, alpha: 0.08 });
    this.panel.addChild(mirror);
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(mx + previewW / 2, my + previewH / 2);
    halo.width = previewW * 1.1;
    halo.height = previewH * 0.9;
    halo.tint = this.draft.jacket;
    halo.alpha = 0.3;
    halo.blendMode = 'add';
    this.panel.addChild(halo);
    const host = this.state.data.players.host;
    const p = new Player(host?.color ?? COLORS.lamp, { ...this.draft, skin: host?.skin });
    p.view.scale.set(n ? 4 : 4.2);
    p.view.position.set(mx + previewW / 2, my + previewH / 2 + 10);
    this.panel.addChild(p.view);
    this.tickers.push((time, dt) => {
      p.faceTowards(Math.PI / 2 + Math.sin(time * 0.7) * 0.6);
      p.update(dt, null);
    });
    if (this.draft.companion !== 'none') {
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.width = m.height = 40;
      m.tint = COMPANION_COLOR[this.draft.companion];
      const base = m.scale.x;
      const gl = new Sprite(glowTexture());
      gl.anchor.set(0.5);
      gl.width = gl.height = 110;
      gl.tint = m.tint;
      gl.alpha = 0.6;
      gl.blendMode = 'add';
      this.panel.addChild(gl, m);
      const cx = mx + previewW / 2;
      const cy = my + previewH / 2;
      this.tickers.push((time) => {
        const a = time * 1.4;
        m.position.set(cx + Math.cos(a) * previewW * 0.32, cy - 30 + Math.sin(a * 1.6) * previewH * 0.18);
        gl.position.copyFrom(m.position);
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(time * 18)));
      });
    }

    // Slot tabs and the options of the chosen slot.
    const saveX = this.W;
    this.W = n ? this.W : gridW + 40;
    const tabsShift = n ? 0 : right - 20;
    const before = this.panel.children.length;
    this.tabs(SLOTS.map((s) => SLOT_LABEL[s]), this.slot, tabsTop, (i) => {
      this.slot = i;
      this.rebuild();
    }, tabsPer, n ? 126 : 118);
    this.W = saveX;
    for (const c of this.panel.children.slice(before)) c.x += tabsShift;

    options.forEach((o, i) => {
      const chip = this.chip(o, chipW, chipH);
      chip.position.set(right + (i % cols) * (chipW + 12), gridTop + Math.floor(i / cols) * (chipH + 12));
      this.panel.addChild(chip);
    });

    const changed = JSON.stringify(this.draft) !== JSON.stringify(this.state.look);
    const ok = button({ label: 'ANZIEHEN', width: 220, height: 54, color: COLORS.brass, fontSize: 22, onClick: () => this.apply() });
    ok.position.set(this.W / 2 + 120, this.H - 50);
    ok.setEnabled(changed);
    const back = button({ label: 'ZURÜCK', width: 200, height: 54, color: 0x2a1608, textColor: 0xfff1c4, fontSize: 20, onClick: () => this.onDone(false) });
    back.position.set(this.W / 2 - 120, this.H - 50);
    this.panel.addChild(back, ok);
  }

  private chip(o: WardrobeOption, w: number, h: number) {
    const c = new Container();
    const owned = this.state.isOwned(o.id);
    const on = matches(o, this.draft);
    const g = new Graphics();
    g.roundRect(0, 0, w, h, 14).fill(on ? 0x3a2a10 : 0x221019).stroke({ color: on ? COLORS.lamp : owned ? COLORS.brassDark : 0x3a2a3a, width: on ? 3 : 1.5 });
    c.addChild(g);
    const cx = w / 2;
    const cy = 40;
    if (o.slot === 'jacket' || o.slot === 'hair') {
      g.circle(cx, cy, 24).fill(o.swatch ?? 0).stroke({ color: 0xfff1c4, width: 2, alpha: 0.6 });
      g.circle(cx - 8, cy - 8, 6).fill({ color: 0xffffff, alpha: 0.25 });
    } else if (o.slot === 'companion') {
      if (o.set.companion === 'none') {
        const t = this.text('—', 30, 0x8a7a6a, true);
        t.anchor.set(0.5);
        t.position.set(cx, cy);
        c.addChild(t);
      } else {
        const m = new Sprite(mothTexture());
        m.anchor.set(0.5);
        m.width = m.height = 40;
        m.tint = COMPANION_COLOR[o.set.companion as keyof typeof COMPANION_COLOR];
        m.position.set(cx, cy);
        c.addChild(m);
      }
    } else {
      const host = this.state.data.players.host;
      const p = new Player(host?.color ?? COLORS.lamp, { ...this.draft, ...o.set, skin: host?.skin });
      p.view.scale.set(1.5);
      p.view.position.set(cx, cy + 2);
      c.addChild(p.view);
    }
    const name = this.text(o.name, 15, owned ? 0xfff6e6 : 0x9a8a9a, true);
    name.anchor.set(0.5, 0);
    name.position.set(cx, 72);
    if (name.width > w - 8) name.scale.set((w - 8) / name.width);
    c.addChild(name);
    if (!owned) {
      c.addChild(new Graphics().roundRect(0, 0, w, h, 14).fill({ color: 0x000000, alpha: 0.45 }));
      const s = drawStone(8, false);
      s.position.set(cx - 14, cy);
      c.addChild(s);
      const t = this.text(String(o.price), 18, 0xdff6ff, true);
      t.anchor.set(0, 0.5);
      t.position.set(cx - 2, cy);
      c.addChild(t);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
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
    return c;
  }

  private apply() {
    this.state.setLook(this.draft);
    sfx.rustle();
    sfx.shimmer();
    this.onDone(true);
  }
}
