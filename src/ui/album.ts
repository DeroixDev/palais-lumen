// The Lampenbuch, in play: a little lamp that drifts across the screen after a won round (tap
// it, press F, or use the hidden "Leuchte fangen" button with a screen reader), the little card
// that says what you caught, and the book itself, painted leather with one page per floor.
// main.ts creates one AlbumFeature, adds its view between the game and the overlays, and
// forwards 'extra' interactables ('album' = the lectern in the foyer) and update calls to it.

import { Circle, Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, announce, glowTexture, reducedMotion, type Particles } from '../core/fx';
import { animate, ease, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { focusable } from '../core/focus';
import type { GameState } from '../core/state';
import {
  ALBUM_PAGES,
  LAMPS,
  RARITY_COLOR,
  RARITY_NAME,
  catchLamp,
  caught,
  caughtCount,
  debugFlight,
  fillAlbum,
  hintText,
  installAlbum,
  lampsOnPage,
  onLampFlight,
  pageDone,
  pageRewarded,
  whereText,
  type CatchNews,
  type LampSpecies,
} from '../core/album';
import { speciesAnchorY, speciesTexture } from '../world/painted/lampArt';
import { dark, fillInk, glowAt, light, paint, rgb, rrect, seeded } from '../world/painted/brush';
import { brass } from '../core/ui';
import { Panel } from './panel';
import { CREAM, PANEL_PAD, bodyText, closeKnob, plaque } from './kit';

import { ALBUM_ENTRIES, ALBUM_ENTRY, ALBUM_NAME, ALBUM_TITLE, CURRENCY_PLURAL } from '../core/brand';
interface Overlay {
  view: Container;
  resize(w: number, h: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

export interface AlbumHost {
  particles: Particles;
  toast(text: string): void;
  showOverlay(o: Overlay): void;
  closeOverlay(): void;
  /** main.ts mode: 'room', 'game', 'overlay' … */
  mode(): string;
  screen(): { w: number; h: number; top: number };
  modalOpen(): boolean;
}

const PAPER_INK = 0x3a2414;
const PAPER_MUTED = 0x7a5a3a;
const LEATHER = 0x4a1420;

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

/** Painted cream paper with fibres, for the catch card. */
function cardTexture(w: number, h: number) {
  return cached(`mcard-${w}x${h}`, () =>
    paint(w + 10, h + 12, (c) => {
      c.translate(4, 3);
      rrect(c, 2, 5, w - 2, h, 12);
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.fill();
      rrect(c, 0, 0, w, h, 12);
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, '#fbf3df');
      g.addColorStop(1, '#e2cea0');
      fillInk(c, g, 2);
      c.save();
      rrect(c, 0, 0, w, h, 12);
      c.clip();
      const r = seeded(w + h);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(120,90,50,${0.03 + r() * 0.04})`;
        c.fillRect(r() * w, r() * h, 1 + r() * 6, 0.8);
      }
      c.restore();
      rrect(c, 5, 5, w - 10, h - 10, 9);
      c.strokeStyle = 'rgba(176,122,42,0.55)';
      c.lineWidth = 1.4;
      c.stroke();
    }, 2),
  );
}

// ---- The drifting lamp ------------------------------------------------------------------------------

interface Flight {
  m: LampSpecies;
  c: Container;
  lamp: Sprite;
  t: number;
  dur: number;
  x0: number;
  x1: number;
  yb: number;
  size: number;
  ph: number;
  away: number;
  done: boolean;
}

class LampFlight {
  readonly view = new Container();
  private f: Flight | null = null;
  private time = 0;
  private btn: HTMLButtonElement;
  private cards = new Container();

  constructor(
    private state: GameState,
    private host: AlbumHost,
  ) {
    this.view.addChild(this.cards);
    this.cards.eventMode = 'none';
    // Keyboard and screen readers: a real button, only visible while it has the focus.
    const css = document.createElement('style');
    css.textContent =
      '#lamp-catch{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);transform:translateX(-50%);z-index:40;' +
      'clip-path:inset(50%);width:1px;height:1px;overflow:hidden;white-space:nowrap;padding:0;border:0}' +
      '#lamp-catch:focus-visible{clip-path:none;width:auto;height:auto;padding:12px 22px;min-height:48px;font:700 1.15rem/1 "Barlow Condensed",sans-serif;' +
      'color:#2a1406;background:linear-gradient(#fff1c0,#e0b25a 55%,#a8741f);border:2px solid rgba(22,10,20,.9);border-radius:14px;box-shadow:0 0 0 3px #ffd98a,0 6px 18px rgba(0,0,0,.5)}';
    document.head.appendChild(css);
    this.btn = document.createElement('button');
    this.btn.id = 'lamp-catch';
    this.btn.type = 'button';
    this.btn.hidden = true;
    this.btn.textContent = `${ALBUM_ENTRY} fangen (Taste F)`;
    this.btn.addEventListener('click', () => this.catch());
    document.body.appendChild(this.btn);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this.f || this.f.done) return;
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (!this.allowed()) return;
      e.preventDefault();
      this.catch();
    });
  }

  private allowed() {
    const m = this.host.mode();
    return (m === 'room' || m === 'game') && !this.host.modalOpen();
  }

  /** A dialog only pauses the lamp; a menu or a transition lets it go. */
  private paused() {
    const m = this.host.mode();
    return (m === 'room' || m === 'game') && this.host.modalOpen();
  }

  get flying() {
    return !!this.f;
  }

  /** Sends a lamp across the screen, above the game or the room. */
  launch(m: LampSpecies) {
    if (this.f) return;
    const { w, h, top } = this.host.screen();
    const calm = reducedMotion();
    const size = Math.round(Math.min(110, Math.max(64, Math.min(w, h) * 0.13)) * (m.rarity === 'legendary' ? 1.25 : m.rarity === 'epic' ? 1.12 : 1));
    const c = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = size * 2.2;
    glow.tint = m.art.glow ?? 0xffe7a8;
    glow.alpha = m.art.glow ? 0.55 : 0.32;
    glow.blendMode = 'add';
    const lamp = new Sprite(speciesTexture(m, 120));
    lamp.anchor.set(0.5, speciesAnchorY(120));
    lamp.scale.set(size / 120);
    c.addChild(glow, lamp);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    // Generous target: a moving lamp is hard to hit with a thumb.
    c.hitArea = new Circle(0, 0, Math.max(48, size * 0.75));
    c.on('pointerdown', (e) => {
      e.stopPropagation();
      this.catch();
    });
    const fromLeft = Math.random() < 0.5;
    const yb = top + 70 + Math.random() * Math.max(40, h * 0.62 - top - 70);
    this.f = { m, c, lamp, t: 0, dur: calm ? 9000 : 5600, x0: fromLeft ? -size : w + size, x1: fromLeft ? w + size : -size, yb, size, ph: Math.random() * 6, away: 0, done: false };
    c.alpha = 0;
    this.view.addChildAt(c, 0);
    this.place(this.f);
    sfx.shimmer();
    this.btn.hidden = false;
    const who = caught(this.state.data, m.id) ? m.name : `Eine unbekannte ${ALBUM_ENTRY}`;
    announce(`${who} zeigt sich! Taste F fängt sie.`);
  }

  private place(f: Flight) {
    const calm = reducedMotion();
    const t = f.t;
    // Slower in the middle of the screen, so there is a moment to catch it.
    const u = Math.min(1, Math.max(0, t + 0.11 * Math.sin(2 * Math.PI * t)));
    const x = f.x0 + (f.x1 - f.x0) * u;
    const s = this.time;
    const y = calm ? f.yb + Math.sin(t * Math.PI * 2) * 10 : f.yb + Math.sin(s * 2.1 + f.ph) * 42 + Math.sin(s * 5.3 + f.ph) * 12;
    f.c.position.set(x, y);
    // A lamp does not flap: it bobs, sways on the draught and its light breathes.
    f.lamp.scale.set(f.size / 120);
    f.c.rotation = calm ? 0 : Math.sin(s * 2.3 + f.ph) * 0.1;
    const glow = f.c.children[0];
    if (glow) glow.alpha = (f.m.art.glow ? 0.55 : 0.32) * (calm ? 1 : 0.85 + 0.15 * Math.sin(s * 7 + f.ph) * Math.sin(s * 3.1));
    f.c.alpha = Math.min(1, t * 14, (1 - t) * 14);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const ok = this.allowed();
    this.view.visible = ok;
    const f = this.f;
    if (!f || f.done) return;
    if (this.paused()) return;
    if (!ok) {
      // A menu or a transition took over: the lamp slips away quietly.
      f.away += dtMs;
      if (f.away > 600) this.drop();
      return;
    }
    f.away = 0;
    f.t += dtMs / f.dur;
    if (f.t >= 1) {
      this.drop();
      announce(`Die ${ALBUM_ENTRY} ist weitergezogen.`);
      return;
    }
    this.place(f);
  }

  private drop() {
    if (!this.f) return;
    this.f.c.destroy({ children: true });
    this.f = null;
    this.btn.hidden = true;
  }

  /** Caught: into the album it goes, with a sparkle and a little card. */
  catch() {
    const f = this.f;
    if (!f || f.done) return;
    f.done = true;
    this.btn.hidden = true;
    if (document.activeElement === this.btn) this.btn.blur();
    const news = catchLamp(this.state, f.m.id);
    if (!news) return this.drop();
    const calm = reducedMotion();
    sfx.chime();
    if (news.fresh) setTimeout(() => sfx.shimmer(), 160);
    this.host.particles.sparkle(f.c.x, f.c.y, news.fresh ? 26 : 14, f.m.art.glow ?? 0xffe7a8, 150);
    announce(`Gefangen: ${f.m.name}. ${news.fresh ? 'Neu im Album!' : `Schon ${this.state.data.album[f.m.id]}-mal gefangen.`}`);
    const c = f.c;
    const x0 = c.x;
    const y0 = c.y;
    const { w } = this.host.screen();
    // Off towards the menu key, where the album lives.
    const tx = w - 60;
    const ty = 30;
    const sc = f.lamp.scale.y;
    void animate(calm ? 300 : 650, (k) => {
      if (c.destroyed) return;
      if (calm) {
        c.alpha = 1 - k;
        return;
      }
      const q = ease.inCubic(k);
      c.position.set(x0 + (tx - x0) * q, y0 + (ty - y0) * q - Math.sin(k * Math.PI) * 40);
      const s = k < 0.2 ? 1 + k * 1.5 : 1.3 * (1 - q);
      f.lamp.scale.set(sc * s);
      c.rotation *= 0.9;
      c.alpha = 1 - q * 0.6;
    }).then(() => {
      if (this.f === f) this.drop();
    });
    void this.card(news);
    for (const p of news.pages) this.host.toast(`Album-Seite „${p.title}“ voll! +${p.stones} Mondsteine.`);
    if (news.pages.length) setTimeout(() => sfx.medal(), 300);
    if (news.complete) this.host.toast(`Das ganze ${ALBUM_NAME} ist voll! Eine Kristall-Trophäe steht jetzt in deiner Vitrine.`);
  }

  /** "NEU IM ALBUM · Talglicht" card at the bottom of the screen. */
  private async card(n: CatchNews) {
    const m = n.lamp;
    const W = 320;
    const H = 96;
    const c = new Container();
    const bg = new Sprite(cardTexture(W, H));
    bg.position.set(-4, -3);
    c.addChild(bg);
    const ms = new Sprite(speciesTexture(m, 120));
    ms.anchor.set(0.5, speciesAnchorY(120));
    ms.scale.set(76 / 120);
    ms.position.set(54, H / 2 + 2);
    c.addChild(ms);
    const head = new Text({ text: n.fresh ? 'NEU IM ALBUM' : 'GEFANGEN', style: { fontFamily: FONT_DISPLAY, fontSize: 13, fill: n.fresh ? 0xb8243a : PAPER_MUTED, letterSpacing: 1.5 } });
    head.position.set(104, 14);
    const name = bodyText(m.name, 24, PAPER_INK, { bold: true });
    name.position.set(104, 30);
    if (name.width > W - 116) name.scale.set((W - 116) / name.width);
    const count = this.state.data.album[m.id] ?? 1;
    const sub = bodyText(`${RARITY_NAME[m.rarity]} · ${n.fresh ? `${caughtCount(this.state.data)} von ${LAMPS.length}` : `${count}× gefangen`}`, 16, dark(RARITY_COLOR[m.rarity], 0.25), { bold: true });
    sub.position.set(104, 60);
    c.addChild(head, name, sub);
    const { w, h } = this.host.screen();
    const s = Math.min(1, (w - 24) / W);
    c.scale.set(s);
    const x = (w - W * s) / 2;
    const y = h - H * s - 24;
    c.position.set(x, y + 30);
    c.alpha = 0;
    this.cards.addChild(c);
    await animate(260, (k) => {
      c.alpha = k;
      c.y = y + 30 * (1 - k);
    }, ease.outCubic);
    await wait(n.fresh ? 2600 : 1800);
    await animate(220, (k) => {
      c.alpha = 1 - k;
      c.y = y + 16 * k;
    }, ease.inCubic);
    c.destroy({ children: true });
  }

  /** Debug: drop everything (a new save was loaded). */
  clear() {
    this.drop();
  }
}

// ---- The album book -------------------------------------------------------------------------------

/** The leather book with its pages, painted once per size. `spread` = two pages, else one. */
function bookTexture(W: number, H: number, pageTop: number, spread: boolean) {
  return cached(`book-${W}x${H}-${pageTop}-${spread}`, () => {
    const res = Math.min(2, 2400 / Math.max(W, H));
    return paint(W + PANEL_PAD * 2, H + PANEL_PAD * 2, (c) => {
      c.translate(PANEL_PAD, PANEL_PAD);
      for (let i = 0; i < 8; i++) {
        rrect(c, -i * 1.5, 8 + i * 0.6 - i * 1.5, W + i * 3, H + i * 3, 26 + i * 2);
        c.fillStyle = `rgba(6,2,8,${0.12 - i * 0.012})`;
        c.fill();
      }
      // Leather cover.
      rrect(c, 0, 0, W, H, 24);
      const g = c.createRadialGradient(W * 0.3, H * 0.15, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, rgb(light(LEATHER, 0.12)));
      g.addColorStop(0.6, rgb(LEATHER));
      g.addColorStop(1, rgb(dark(LEATHER, 0.5)));
      fillInk(c, g, 3);
      c.save();
      rrect(c, 0, 0, W, H, 24);
      c.clip();
      // Leather grain.
      const r = seeded(W * 3 + H);
      for (let i = 0; i < (W * H) / 260; i++) {
        c.fillStyle = r() < 0.5 ? 'rgba(255,220,200,0.035)' : 'rgba(10,2,6,0.06)';
        c.beginPath();
        c.arc(r() * W, r() * H, 0.6 + r() * 1.6, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = 'rgba(255,240,220,0.35)';
      c.lineWidth = 2;
      rrect(c, 2, 2, W + 6, H + 6, 24);
      c.stroke();
      c.restore();
      // Stitched border.
      rrect(c, 11, 11, W - 22, H - 22, 18);
      c.setLineDash([6, 5]);
      c.strokeStyle = 'rgba(224,178,90,0.55)';
      c.lineWidth = 1.6;
      c.stroke();
      c.setLineDash([]);
      // Brass corner caps.
      for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]] as const) {
        c.save();
        c.translate(x, y);
        c.scale(sx, sy);
        c.beginPath();
        c.moveTo(0, 46);
        c.lineTo(0, 20);
        c.quadraticCurveTo(0, 0, 20, 0);
        c.lineTo(46, 0);
        c.lineTo(28, 10);
        c.quadraticCurveTo(10, 10, 10, 28);
        c.closePath();
        fillInk(c, brass(c, 0, 0, 46, 46), 1.6);
        c.restore();
      }
      // Pages.
      const top = pageTop;
      const bottom = H - 40;
      const pages: [number, number][] = spread ? [[30, W / 2 - 4], [W / 2 + 4, W - 30]] : [[22, W - 22]];
      for (const [x0, x1] of pages) {
        // Stack of page edges under the top sheet.
        for (let k = 3; k > 0; k--) {
          rrect(c, x0 - k * 1.5, top + k * 2, x1 - x0 + k * 3, bottom - top, 6);
          c.fillStyle = k % 2 ? '#d8c49a' : '#efe2c2';
          c.fill();
          c.strokeStyle = 'rgba(90,60,30,0.35)';
          c.lineWidth = 0.8;
          c.stroke();
        }
        rrect(c, x0, top, x1 - x0, bottom - top, 6);
        const pg = c.createLinearGradient(x0, top, x1, bottom);
        pg.addColorStop(0, '#fbf4e2');
        pg.addColorStop(1, '#ead9b0');
        fillInk(c, pg, 1.4);
        c.save();
        rrect(c, x0, top, x1 - x0, bottom - top, 6);
        c.clip();
        const fr = seeded(x0 + top);
        for (let i = 0; i < ((x1 - x0) * (bottom - top)) / 500; i++) {
          c.fillStyle = `rgba(120,90,50,${0.03 + fr() * 0.04})`;
          c.fillRect(x0 + fr() * (x1 - x0), top + fr() * (bottom - top), 1 + fr() * 7, 0.8);
        }
        glowAt(c, x1 - (x1 - x0) * 0.15, bottom - 40, (x1 - x0) * 0.35, 90, 0xa06e32, 0.1);
        // The gutter: shade towards the spine.
        if (spread) {
          const left = x1 < W / 2 + 1;
          const gx = left ? x1 : x0;
          const gg = c.createLinearGradient(gx, 0, gx + (left ? -50 : 50), 0);
          gg.addColorStop(0, 'rgba(90,56,24,0.35)');
          gg.addColorStop(1, 'rgba(90,56,24,0)');
          c.fillStyle = gg;
          c.fillRect(left ? gx - 50 : gx, top, 50, bottom - top);
        }
        c.restore();
      }
      if (spread) {
        c.strokeStyle = 'rgba(60,30,16,0.6)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(W / 2, top + 2);
        c.lineTo(W / 2, bottom - 2);
        c.stroke();
      }
    }, res);
  });
}

/** A leather index tab in the page's colour; `on` is the open page (lighter, joined to the paper). */
function tabTexture(w: number, h: number, color: number, on: boolean) {
  return cached(`mtab-${w}x${h}-${color}-${on}`, () =>
    paint(w + 6, h + 8, (c) => {
      c.translate(3, 3);
      c.beginPath();
      c.moveTo(0, h + 2);
      c.lineTo(0, 10);
      c.quadraticCurveTo(0, 0, 10, 0);
      c.lineTo(w - 10, 0);
      c.quadraticCurveTo(w, 0, w, 10);
      c.lineTo(w, h + 2);
      c.closePath();
      const base = on ? light(color, 0.12) : dark(color, 0.25);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgb(light(base, 0.2)));
      g.addColorStop(1, rgb(dark(base, 0.25)));
      fillInk(c, g, 1.8);
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(255,240,220,0.35)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(3, h);
      c.lineTo(3, 10);
      c.quadraticCurveTo(3, 3, 10, 3);
      c.lineTo(w - 10, 3);
      c.stroke();
      c.setLineDash([4, 3]);
      c.strokeStyle = 'rgba(224,178,90,0.5)';
      c.lineWidth = 1.2;
      rrect(c, 5, 5, w - 10, h + 4, 7);
      c.stroke();
      c.restore();
    }, 2),
  );
}

/** A specimen frame on the page: a thin pencilled card with a pin. */
function slotTexture(w: number, h: number, on: boolean) {
  return cached(`mslot-${w}x${h}-${on}`, () =>
    paint(w + 8, h + 8, (c) => {
      c.translate(4, 4);
      rrect(c, 0, 0, w, h, 8);
      c.fillStyle = on ? 'rgba(255,214,120,0.28)' : 'rgba(255,250,236,0.35)';
      c.fill();
      c.strokeStyle = on ? 'rgba(176,112,24,0.95)' : 'rgba(120,86,48,0.35)';
      c.lineWidth = on ? 2.6 : 1.2;
      c.stroke();
      if (on) {
        rrect(c, 3, 3, w - 6, h - 6, 6);
        c.strokeStyle = 'rgba(255,230,160,0.8)';
        c.lineWidth = 1;
        c.stroke();
      }
    }, 2),
  );
}

/** Small gem in the rarity colour. */
function gemTexture(color: number) {
  return cached(`mgem-${color}`, () =>
    paint(18, 18, (c) => {
      c.beginPath();
      c.moveTo(9, 2);
      c.lineTo(16, 8);
      c.lineTo(9, 16);
      c.lineTo(2, 8);
      c.closePath();
      const g = c.createLinearGradient(2, 2, 16, 16);
      g.addColorStop(0, rgb(light(color, 0.5)));
      g.addColorStop(1, rgb(dark(color, 0.3)));
      fillInk(c, g, 1.2);
      c.beginPath();
      c.moveTo(9, 3.5);
      c.lineTo(12.5, 7.5);
      c.lineTo(9, 8.5);
      c.closePath();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fill();
    }, 3),
  );
}

export class AlbumPanel extends Panel {
  private pageIdx: number;
  private sel: string;
  private detail = new Container();
  private slots: { id: string; frame: Sprite; w: number; h: number }[] = [];
  private bigLamp: Sprite | null = null;

  constructor(
    private state: GameState,
    private onClose: () => void,
    page = 0,
  ) {
    super();
    this.pageIdx = page;
    this.sel = lampsOnPage(ALBUM_PAGES[page].id)[0].id;
  }

  protected build() {
    const n = this.narrow;
    const d = this.state.data;
    this.W = n ? 404 : 1000;
    this.H = n ? 740 : 680;
    const tabsY = n ? 64 : 64;
    const tabH = 40;
    const tabRows = n ? 2 : 1;
    const pageTop = tabsY + tabRows * (tabH + 4) + (n ? 2 : 0);
    const p = this.panel;
    const book = new Sprite(bookTexture(this.W, this.H, pageTop, !n));
    book.position.set(-PANEL_PAD, -PANEL_PAD);
    p.addChild(book);
    const pl = plaque(ALBUM_TITLE.toLocaleUpperCase('de-DE'), { size: n ? 22 : 28, minW: n ? 220 : 320 });
    pl.position.set(this.W / 2, 4);
    p.addChild(pl);
    const x = closeKnob(this.onClose);
    x.position.set(this.W - 40, 40);
    p.addChild(x);
    const total = bodyText(`${caughtCount(d)} / ${LAMPS.length} ${ALBUM_ENTRIES}`, n ? 16 : 18, CREAM, { bold: true });
    total.anchor.set(0, 0.5);
    total.position.set(n ? 26 : 40, n ? 42 : 40);
    p.addChild(total);

    // Index tabs, one per page.
    const perRow = n ? 3 : 6;
    const tw = n ? Math.floor((this.W - 44 - 2 * 6) / 3) : Math.floor((this.W - 60 - 5 * 6) / 6);
    ALBUM_PAGES.forEach((pg, i) => {
      const on = i === this.pageIdx;
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const tab = new Container();
      const s = new Sprite(tabTexture(tw, tabH + 6, pg.color, on));
      s.position.set(-3, -3);
      tab.addChild(s);
      const have = lampsOnPage(pg.id).filter((m) => caught(d, m.id)).length;
      const all = lampsOnPage(pg.id).length;
      const t = bodyText(pg.title, n ? 15 : 16, on ? 0xfff6e0 : 0xe8d4b0, { bold: true });
      t.anchor.set(0.5, 0);
      t.position.set(tw / 2, 4);
      if (t.width > tw - 12) t.scale.set((tw - 12) / t.width);
      const cnt = bodyText(pageDone(d, pg.id) ? `✓ ${have}/${all}` : `${have}/${all}`, 13, pageDone(d, pg.id) ? 0xffe08a : 0xc9b48e, { bold: true });
      cnt.anchor.set(0.5, 0);
      cnt.position.set(tw / 2, 22);
      tab.addChild(t, cnt);
      tab.position.set((n ? 22 : 30) + col * (tw + 6), tabsY + row * (tabH + 4) + (on ? -3 : 0));
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.hitArea = new Rectangle(0, 0, tw, Math.max(44, tabH));
      tab.on('pointertap', () => {
        if (i === this.pageIdx) return;
        sfx.rustle();
        this.pageIdx = i;
        this.sel = lampsOnPage(ALBUM_PAGES[i].id)[0].id;
        this.rebuild();
      });
      focusable(tab, { label: `Seite ${pg.title}: ${have} von ${all} ${ALBUM_ENTRIES}${on ? ' (aufgeschlagen)' : ''}`, rect: { x: 0, y: 0, w: tw, h: tabH } }).setPressed(on);
      p.addChild(tab);
    });

    const page = ALBUM_PAGES[this.pageIdx];
    const lamps = lampsOnPage(page.id);
    // Left page (or the top of the single page): title and the specimen grid.
    const lx = n ? 34 : 46;
    const lw = n ? this.W - 68 : this.W / 2 - 4 - 30 - 32;
    const title = new Text({ text: page.title.toUpperCase(), style: { fontFamily: FONT_DISPLAY, fontSize: n ? 18 : 22, fill: dark(page.color, 0.1), letterSpacing: 1.5 } });
    title.position.set(lx, pageTop + 16);
    p.addChild(title);
    const rule = new Graphics().moveTo(lx, pageTop + 46).lineTo(lx + lw, pageTop + 46).stroke({ color: 0xb07a2a, width: 1.5, alpha: 0.7 });
    p.addChild(rule);
    const cols = n ? 3 : 2;
    const rows = Math.ceil(lamps.length / cols);
    const gy = pageTop + 58;
    const gap = n ? 8 : 12;
    const sw = Math.floor((lw - (cols - 1) * gap) / cols);
    const sh = n ? 116 : Math.floor((this.H - 40 - gy - 60 - (rows - 1) * gap) / rows);
    this.slots = [];
    const items: Container[] = [];
    lamps.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const has = caught(d, m.id);
      const slot = new Container();
      const fr = new Sprite(slotTexture(sw, sh, m.id === this.sel));
      fr.position.set(-4, -4);
      slot.addChild(fr);
      const span = n ? 66 : Math.min(104, sh - 48);
      const ms = new Sprite(speciesTexture(m, 120, has ? 'color' : 'dark'));
      ms.anchor.set(0.5, speciesAnchorY(120));
      ms.scale.set(span / 120);
      ms.position.set(sw / 2, 10 + span * 0.5);
      slot.addChild(ms);
      if (!has) {
        const q = new Text({ text: '?', style: { fontFamily: FONT_DISPLAY, fontSize: n ? 22 : 28, fill: 0xfff4dc } });
        q.anchor.set(0.5);
        q.alpha = 0.85;
        q.position.copyFrom(ms.position);
        slot.addChild(q);
      }
      const nm = bodyText(has ? m.name : '???', n ? 14 : 17, has ? PAPER_INK : PAPER_MUTED, { bold: true });
      nm.anchor.set(0.5, 1);
      nm.position.set(sw / 2, sh - 6);
      if (nm.width > sw - 10) nm.scale.set((sw - 10) / nm.width);
      slot.addChild(nm);
      const gem = new Sprite(gemTexture(RARITY_COLOR[m.rarity]));
      gem.position.set(5, 5);
      slot.addChild(gem);
      if (has) {
        const k = bodyText(`×${d.album[m.id]}`, n ? 13 : 15, PAPER_MUTED, { bold: true });
        k.anchor.set(1, 0);
        k.position.set(sw - 7, 4);
        slot.addChild(k);
      }
      slot.position.set(lx + col * (sw + gap), gy + row * (sh + gap));
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.hitArea = new Rectangle(0, 0, sw, sh);
      slot.on('pointertap', () => this.select(m.id));
      focusable(slot, { label: () => `${has ? m.name : `Unbekannte ${ALBUM_ENTRY}`}, ${RARITY_NAME[m.rarity]}${has ? `, ${d.album[m.id]}-mal gefangen` : ''}`, rect: { x: 0, y: 0, w: sw, h: sh } });
      p.addChild(slot);
      this.slots.push({ id: m.id, frame: fr, w: sw, h: sh });
      items.push(slot);
    });

    // Reward for the full page.
    const rewardY = n ? gy + rows * (sh + gap) + 2 : this.H - 40 - 52;
    const got = pageRewarded(d, page.id);
    const rw = bodyText(got ? `✓ Seite voll · ${page.stones} Mondsteine erhalten` : `Volle Seite: +${page.stones} Mondsteine (einmal)`, n ? 15 : 17, got ? 0x2f6a2a : PAPER_INK, { bold: true });
    rw.position.set(lx, rewardY);
    p.addChild(rw);

    // Detail of the chosen lamp: right page, or below the grid on a phone.
    this.detail = new Container();
    p.addChild(this.detail);
    this.fillDetail();

    const foot = bodyText(`${ALBUM_ENTRIES} zählen nur fürs Album: ${CURRENCY_PLURAL} und Gewinnchancen bleiben gleich. Volles Album: eine Trophäe für die Vitrine.`, n ? 13 : 14, CREAM, { wrap: this.W - 80 });
    foot.anchor.set(0.5, 0.5);
    foot.alpha = 0.8;
    foot.position.set(this.W / 2, this.H - 21);
    p.addChild(foot);
    this.tickers.push((_t, dt) => this.flicker(dt));
    if (!this.shown) {
      this.shown = true;
      this.popIn(items);
    }
  }

  private shown = false;
  private ft = 0;

  /** The big lamp on the detail side sways a little now and then, as if someone walked past. */
  private flicker(dt: number) {
    const s = this.bigLamp;
    if (!s || s.destroyed || reducedMotion()) return;
    this.ft += dt / 1000;
    const k = this.ft % 5;
    s.rotation = k < 1.6 ? Math.sin(k * Math.PI * 2.5) * 0.05 * (1 - k / 1.6) : 0;
  }

  private select(id: string) {
    if (id === this.sel) return;
    sfx.click();
    this.sel = id;
    for (const s of this.slots) s.frame.texture = slotTexture(s.w, s.h, s.id === id);
    this.fillDetail();
  }

  private fillDetail() {
    const c = this.detail;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    const m = LAMPS.find((x) => x.id === this.sel);
    if (!m) return;
    const d = this.state.data;
    const has = caught(d, m.id);
    const n = this.narrow;
    const pageTop = n ? 64 + 2 * 44 + 2 : 64 + 44;
    if (n) {
      // Below the grid: picture on the left, words on the right.
      const y0 = pageTop + 58 + 2 * (116 + 8) + 34;
      const box = new Graphics().moveTo(34, y0 - 8).lineTo(this.W - 34, y0 - 8).stroke({ color: 0xb07a2a, width: 1.2, alpha: 0.5 });
      c.addChild(box);
      const span = 120;
      const ms = new Sprite(speciesTexture(m, 160, has ? 'color' : 'dark'));
      ms.anchor.set(0.5, speciesAnchorY(160));
      ms.scale.set(span / 160);
      ms.position.set(34 + 66, y0 + 62);
      c.addChild(ms);
      this.bigLamp = ms;
      this.words(c, m, has, 34 + 140, y0, this.W - 34 - 140 - 34, true);
      return;
    }
    const rx = this.W / 2 + 4 + 30;
    const rw = this.W - 30 - 30 - rx;
    const cx = rx + rw / 2;
    const span = 220;
    const ms = new Sprite(speciesTexture(m, 240, has ? 'color' : 'dark'));
    ms.anchor.set(0.5, speciesAnchorY(240));
    ms.scale.set(span / 240);
    ms.position.set(cx, pageTop + 30 + span * 0.5);
    c.addChild(ms);
    this.bigLamp = ms;
    this.words(c, m, has, rx, pageTop + 30 + span * 0.95, rw, false);
  }

  /** Name, rarity, line, where and how many: the text of the detail side. */
  private words(c: Container, m: LampSpecies, has: boolean, x: number, y: number, w: number, small: boolean) {
    const d = this.state.data;
    const name = new Text({ text: has ? m.name : 'Noch nicht gefangen', style: { fontFamily: FONT_DISPLAY, fontSize: small ? 17 : 24, fill: PAPER_INK, letterSpacing: 0.5, wordWrap: true, wordWrapWidth: w, align: small ? 'left' : 'center' } });
    const center = !small;
    name.anchor.set(center ? 0.5 : 0, 0);
    name.position.set(center ? x + w / 2 : x, y);
    c.addChild(name);
    let yy = y + name.height + 4;
    const rar = bodyText(`◆ ${RARITY_NAME[m.rarity]}`, small ? 15 : 18, dark(RARITY_COLOR[m.rarity], 0.2), { bold: true });
    rar.anchor.set(center ? 0.5 : 0, 0);
    rar.position.set(center ? x + w / 2 : x, yy);
    c.addChild(rar);
    yy += rar.height + (small ? 4 : 10);
    const lines: [string, number, boolean][] = has
      ? [[`„${m.line}“`, PAPER_INK, false], [`Fundort: ${whereText(m.where)}`, PAPER_MUTED, true], [`Gefangen: ${d.album[m.id]}×`, PAPER_MUTED, true]]
      : [[`Tipp: ${hintText(m)}`, PAPER_INK, false], [`Seltene ${ALBUM_ENTRIES} zeigen sich nur nach großen Gewinnen.`, PAPER_MUTED, false]];
    for (const [t, col, bold] of lines) {
      const tx = new Text({ text: t, style: { fontFamily: FONT_BODY, fontSize: small ? 14 : 18, fontWeight: bold ? '700' : '500', fontStyle: !bold && has ? 'italic' : 'normal', fill: col, wordWrap: true, wordWrapWidth: w, align: center ? 'center' : 'left', lineHeight: small ? 17 : 22 } });
      tx.anchor.set(center ? 0.5 : 0, 0);
      tx.position.set(center ? x + w / 2 : x, yy);
      c.addChild(tx);
      yy += tx.height + (small ? 3 : 8);
    }
  }
}

// ---- Wiring ---------------------------------------------------------------------------------------

/** Debug hooks for the test panel (set when the feature is created). */
export let albumDebug: { spawn(): string; fill(): string } | null = null;

export class AlbumFeature {
  readonly view = new Container();
  private flight: LampFlight;
  private panel: AlbumPanel | null = null;

  constructor(
    private state: GameState,
    private host: AlbumHost,
  ) {
    this.flight = new LampFlight(state, host);
    this.view.addChild(this.flight.view);
    installAlbum(state, () => this.flight.flying);
    // A lamp after a win: a beat later, once the game's own celebration has started.
    onLampFlight((m, mult) => setTimeout(() => this.flight.launch(m), mult >= 10 ? 1400 : 700));
    this.hudKey();
    if (import.meta.env.DEV) (window as unknown as { __album: AlbumFeature }).__album = this;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.panel && this.host.mode() === 'overlay' && !this.host.modalOpen()) this.close();
    });
    albumDebug = {
      spawn: () => {
        const m = debugFlight(state);
        return `Eine ${ALBUM_ENTRY} zeigt sich: ${m.name} (${RARITY_NAME[m.rarity]}).`;
      },
      fill: () => {
        const r = fillAlbum(state);
        return `Album gefüllt: ${LAMPS.length} ${ALBUM_ENTRIES}.${r.stones ? ` +${r.stones} Mondsteine für volle Seiten.` : ''}${r.complete ? ' Trophäe in der Vitrine.' : ''}`;
      },
    };
  }

  /** The album key in the HUD menu, next to the photo mode. */
  private hudKey() {
    const b = document.createElement('button');
    b.id = 'btn-album';
    b.type = 'button';
    b.className = 'hud-btn icon';
    b.innerHTML =
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v2M9.5 4.5h5M8 7.5h8l-1 9H9zM9 16.5h6v2.5H9zM10.5 19v2h3v-2M12 10c-1.2 1.4-1.2 2.8 0 4 1.2-1.2 1.2-2.6 0-4z"/></svg><span class="lbl">${ALBUM_TITLE}</span>`;
    b.addEventListener('click', () => this.open());
    const menu = document.getElementById('hud-menu');
    const photo = document.getElementById('btn-photo');
    if (photo && photo.parentElement === menu) menu!.insertBefore(b, photo);
    else menu?.appendChild(b);
  }

  /** The lectern in the foyer. */
  interact(id: string) {
    if (id !== 'album') return false;
    this.open();
    return true;
  }

  open() {
    const mode = this.host.mode();
    if (mode === 'game') {
      this.host.toast(`Das ${ALBUM_NAME} schlägst du auf, wenn du gerade nicht spielst.`);
      return;
    }
    if (mode !== 'room' || this.host.modalOpen() || this.panel) return;
    sfx.rustle();
    // Open on the page of the floor you stand on.
    let page = 0;
    const f = this.roomFloor();
    if (f >= 1 && f <= 5) page = f - 1;
    this.panel = new AlbumPanel(this.state, () => this.close(), page);
    this.host.showOverlay(this.panel);
  }

  private roomFloor() {
    const id = this.state.data.roomId;
    const m = /^f(\d)/.exec(id);
    return m ? Number(m[1]) : 0;
  }

  close() {
    if (!this.panel) return;
    this.panel = null;
    sfx.rustle();
    this.host.closeOverlay();
  }

  update(dtMs: number) {
    // The panel may have been closed by someone else (a new save, the debug panel).
    if (this.panel && this.panel.view.destroyed) this.panel = null;
    this.flight.update(dtMs);
  }
}
