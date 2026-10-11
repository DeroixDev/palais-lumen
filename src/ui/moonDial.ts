// The moon dial at the start of a season: a brass arc with six moon phases (Neumond to
// Blutmond). Levels up to the highest unlocked one can be chosen; a needle swings to the
// pick, and the panel lists exactly what the level changes and what it pays.

import { Container, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_DISPLAY, reducedMotion } from '../core/fx';
import { animate, ease } from '../core/tween';
import { button, brass, lockTexture } from '../core/ui';
import { focusable } from '../core/focus';
import { sfx } from '../core/audio';
import { HEAT_GOAL_STEP, MAX_HEAT, MOON_LEVELS, heatStoneFactor } from '../core/moon';
import type { GameState } from '../core/state';
import { INK, fillInk, glowAt, paint, type Ctx } from '../world/painted/brush';
import { Panel } from './panel';
import { CREAM, MUTED } from './kit';

import { CURRENCY_PLURAL } from '../core/brand';
/** Lit share of the moon per level; level 5 is the full blood moon. */
const LIT = [0, 0.25, 0.5, 0.75, 1, 1];

/** A painted moon of radius r at (0,0), lit from the right. */
export function paintMoon(c: Ctx, level: number, r: number, dim = false) {
  const blood = level >= 5;
  c.beginPath();
  c.arc(1, r * 0.12, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(6,2,8,0.5)';
  c.fill();
  if (!dim) glowAt(c, 0, 0, r * 1.6, r * 1.6, blood ? 0xff5a4a : 0xcfe8ff, level === 0 ? 0.08 : 0.12 + LIT[level] * 0.22);
  // Dark side.
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  const dg = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  dg.addColorStop(0, '#2a2440');
  dg.addColorStop(1, '#0e0a1a');
  fillInk(c, dg, 1.6);
  // Lit side.
  const f = LIT[level];
  if (f > 0) {
    c.save();
    c.beginPath();
    c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    const rx = r * Math.abs(1 - 2 * f);
    if (f >= 1) c.arc(0, 0, r, Math.PI / 2, (Math.PI * 3) / 2);
    else if (f < 0.5) c.ellipse(0, 0, Math.max(0.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, true);
    else c.ellipse(0, 0, Math.max(0.01, rx), r, 0, Math.PI / 2, (Math.PI * 3) / 2, false);
    c.closePath();
    const lg = c.createRadialGradient(r * 0.3, -r * 0.35, 0, 0, 0, r * 1.1);
    if (blood) {
      lg.addColorStop(0, '#ffd0b0');
      lg.addColorStop(0.5, '#e0503a');
      lg.addColorStop(1, '#7a1a1a');
    } else {
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.5, '#e8f2ff');
      lg.addColorStop(1, '#9fb4d0');
    }
    c.fillStyle = lg;
    c.fill();
    c.clip();
    // Craters.
    for (const [x, y, s] of [[0.35, -0.3, 0.18], [0.1, 0.35, 0.14], [0.55, 0.25, 0.1], [-0.3, -0.1, 0.16], [-0.1, -0.55, 0.09]]) {
      c.beginPath();
      c.arc(x * r, y * r, s * r, 0, Math.PI * 2);
      c.fillStyle = blood ? 'rgba(90,10,10,0.25)' : 'rgba(80,100,140,0.22)';
      c.fill();
    }
    c.restore();
  }
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  if (dim) {
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,4,16,0.55)';
    c.fill();
  }
}

const cache = new Map<string, Texture>();
function moonTex(level: number, r: number, dim: boolean) {
  const k = `${level}-${r}-${dim}`;
  let t = cache.get(k);
  if (!t) cache.set(k, (t = paint(r * 4, r * 4, (c) => (c.translate(r * 2, r * 2), paintMoon(c, level, r, dim)), 2)));
  return t;
}

/** The brass dial: an arc band with engraved ticks and a hub. */
function dialTex(R: number) {
  const k = `dial-${R}`;
  let t = cache.get(k);
  if (!t) {
    t = paint(R * 2 + 60, R + 70, (c) => {
      c.translate(R + 30, R + 30);
      const band = 34;
      c.beginPath();
      c.arc(0, 0, R + band / 2, Math.PI, 0);
      c.arc(0, 0, R - band / 2, 0, Math.PI, true);
      c.closePath();
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.save();
      c.translate(0, 5);
      c.fill();
      c.restore();
      fillInk(c, brass(c, -R, -R, R * 0.4, 0), 2.4);
      c.beginPath();
      c.arc(0, 0, R - band / 2 + 5, Math.PI, 0);
      c.strokeStyle = 'rgba(80,46,10,0.55)';
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath();
      c.arc(0, 0, R + band / 2 - 5, Math.PI, 0);
      c.stroke();
      for (let i = 0; i <= 30; i++) {
        const a = Math.PI + (i / 30) * Math.PI;
        const l = i % 6 === 0 ? 10 : 5;
        c.beginPath();
        c.moveTo(Math.cos(a) * (R - band / 2 + 6), Math.sin(a) * (R - band / 2 + 6));
        c.lineTo(Math.cos(a) * (R - band / 2 + 6 + l), Math.sin(a) * (R - band / 2 + 6 + l));
        c.strokeStyle = 'rgba(80,46,10,0.6)';
        c.stroke();
      }
      // Hub.
      c.beginPath();
      c.arc(0, 0, 26, Math.PI, 0);
      c.lineTo(26, 6);
      c.lineTo(-26, 6);
      c.closePath();
      fillInk(c, brass(c, -26, -26, 10, 6), 2);
    }, 2);
    cache.set(k, t);
  }
  return t;
}

function needleTex(len: number) {
  const k = `needle-${len}`;
  let t = cache.get(k);
  if (!t) {
    t = paint(len + 20, 24, (c) => {
      c.translate(10, 12);
      c.beginPath();
      c.moveTo(-6, 0);
      c.lineTo(0, -6);
      c.lineTo(len, 0);
      c.lineTo(0, 6);
      c.closePath();
      fillInk(c, brass(c, 0, -6, len * 0.3, 6, 0.2), 2);
      c.beginPath();
      c.arc(0, 0, 7, 0, Math.PI * 2);
      fillInk(c, '#3a1428', 1.6);
    }, 2);
    cache.set(k, t);
  }
  return t;
}

export class MoonDialPanel extends Panel {
  private pick: number;
  private needleA = Math.PI * 1.5;

  constructor(
    private state: GameState,
    private onPick: (level: number) => void,
  ) {
    super();
    this.pick = Math.min(state.data.heat, state.data.heatUnlocked);
  }

  /** Angle of a level on the arc (left to right over the top). */
  private angle(level: number) {
    return Math.PI + ((level + 0.5) / (MAX_HEAT + 1)) * Math.PI;
  }

  protected build() {
    const n = this.narrow;
    const d = this.state.data;
    this.W = n ? 404 : 780;
    const R = n ? 132 : 250;
    const dialY = (n ? 160 : 150) + R;
    // What the level does (measured first, so the panel fits it).
    const level = MOON_LEVELS[this.pick];
    const big = new Text({ text: `${level.name.toUpperCase()}`, style: { fontFamily: FONT_DISPLAY, fontSize: n ? 30 : 38, fill: this.pick >= 5 ? 0xff9a7a : 0xdff0ff, letterSpacing: 2, dropShadow: { color: 0x0a0410, alpha: 0.85, blur: 2, distance: 2, angle: Math.PI / 2 } } });
    const lines: string[] = [];
    if (this.pick === 0) lines.push('Normale Ziele, normale Belohnungen.');
    else {
      lines.push(`Alle Ziele +${Math.round(HEAT_GOAL_STEP * this.pick * 100)} %`);
      for (let i = 2; i <= this.pick; i++) lines.push(MOON_LEVELS[i].twist);
      lines.push(`Belohnung: Mondsteine für Medaillen ×${heatStoneFactor(this.pick).toLocaleString('de-DE')} · Trophäen im Mondglanz`);
    }
    const texts = lines.map((l, i) => {
      const reward = i === lines.length - 1 && this.pick > 0;
      return this.text(l.replace(/ %/g, '\u00a0%'), n ? 16 : 19, reward ? 0x9fe8ff : i === 0 ? CREAM : 0xe9c9a0, reward, this.W - 80);
    });
    const textH = texts.reduce((h, t) => h + t.height + 2, 0);
    this.H = Math.max(dialY + (n ? 300 : 280), dialY + 26 + big.height + 8 + textH + (n ? 156 : 130));
    this.frame('MONDSTUFE', 0x9fd0ff, () => this.onPick(this.pick));
    const intro = this.text(n ? `Saison ${d.season.number}: Wie hell soll der Mond sein?` : `Saison ${d.season.number} beginnt. Wähle die Mondstufe: höhere Stufen sind schwerer und lohnen mehr.`, n ? 17 : 19, CREAM, false, this.W - 70);
    intro.anchor.set(0.5, 0);
    intro.position.set(this.W / 2, n ? 56 : 62);
    this.panel.addChild(intro);

    const dial = new Sprite(dialTex(R));
    dial.position.set(this.W / 2 - R - 30, dialY - R - 30);
    this.panel.addChild(dial);
    const mr = n ? 21 : 30;
    for (let lv = 0; lv <= MAX_HEAT; lv++) {
      const a = this.angle(lv);
      const locked = lv > d.heatUnlocked;
      const m = new Container();
      const s = new Sprite(moonTex(lv, mr, locked));
      s.anchor.set(0.5);
      m.addChild(s);
      if (locked) {
        const l = new Sprite(lockTexture());
        l.anchor.set(0.5);
        l.scale.set(n ? 0.7 : 0.9);
        m.addChild(l);
      }
      const rr = R + (n ? 4 : 6);
      m.position.set(this.W / 2 + Math.cos(a) * rr, dialY + Math.sin(a) * rr);
      const num = new Text({ text: String(lv), style: { fontFamily: FONT_DISPLAY, fontSize: n ? 14 : 17, fill: lv === this.pick ? 0xffe9a8 : 0xc9b48e, dropShadow: { color: 0x0a0410, alpha: 0.8, blur: 1, distance: 1.5, angle: Math.PI / 2 } } });
      num.anchor.set(0.5);
      num.position.set(Math.cos(a) * (mr + (n ? 14 : 18)), Math.sin(a) * (mr + (n ? 14 : 18)));
      m.addChild(num);
      if (lv === this.pick) {
        m.scale.set(1.18);
        const ring = new Sprite(paint(mr * 3, mr * 3, (c) => {
          c.beginPath();
          c.arc(mr * 1.5, mr * 1.5, mr + 5, 0, Math.PI * 2);
          c.strokeStyle = lv >= 5 ? '#ff8a6a' : '#ffe9a8';
          c.lineWidth = 3;
          c.stroke();
        }, 2));
        ring.anchor.set(0.5);
        m.addChildAt(ring, 0);
        if (!reducedMotion()) this.tickers.push((t) => (ring.alpha = 0.65 + Math.sin(t * 4) * 0.35));
      }
      m.eventMode = 'static';
      m.cursor = locked ? 'not-allowed' : 'pointer';
      m.hitArea = new Rectangle(-mr - 10, -mr - 10, mr * 2 + 20, mr * 2 + 20);
      focusable(m, {
        label: () => `Mondstufe ${lv}, ${MOON_LEVELS[lv]?.name ?? ''}: ${MOON_LEVELS[lv]?.twist ?? ''}${lv === this.pick ? ' Gewählt.' : ''}`,
        rect: { w: mr * 2 + 8, h: mr * 2 + 8 },
        radius: mr + 4,
        locked: () => (locked ? `öffnet sich nach einem Saisonsieg auf Stufe ${lv - 1}` : null),
      });
      m.on('pointertap', () => {
        if (locked) {
          sfx.lose();
          intro.text = `Stufe ${lv} öffnet sich, wenn du eine Saison auf Stufe ${lv - 1} gewinnst.`;
          return;
        }
        if (lv === this.pick) return;
        this.pick = lv;
        sfx.chime();
        this.rebuild();
      });
      this.panel.addChild(m);
    }
    // Needle from the hub to the chosen moon.
    const needle = new Sprite(needleTex(R - (n ? 40 : 56)));
    needle.anchor.set(10 / (needle.width), 0.5);
    needle.position.set(this.W / 2, dialY);
    this.panel.addChild(needle);
    const target = this.angle(this.pick);
    const from = this.needleA;
    this.needleA = target;
    needle.rotation = from;
    if (reducedMotion()) needle.rotation = target;
    else void animate(520, (k) => !needle.destroyed && (needle.rotation = from + (target - from) * k), ease.outBack);

    big.anchor.set(0.5, 0);
    big.position.set(this.W / 2, dialY + (n ? 22 : 26));
    this.panel.addChild(big);
    let y = big.y + big.height + 8;
    lines.forEach((l, i) => {
      const reward = i === lines.length - 1 && this.pick > 0;
      const t = this.text(l.replace(/ %/g, ' %'), n ? 16 : 19, reward ? 0x9fe8ff : i === 0 ? CREAM : 0xe9c9a0, reward, this.W - 80);
      t.anchor.set(0.5, 0);
      t.position.set(this.W / 2, y);
      this.panel.addChild(t);
      y += t.height + 2;
    });
    const note = this.text(`Ändert nie die Gewinnchancen. Tag 1 startet immer mit 1.000 ${CURRENCY_PLURAL}.`, n ? 14 : 15, MUTED, false, this.W - 70);
    note.anchor.set(0.5, 1);
    note.position.set(this.W / 2, this.H - 96);
    this.panel.addChild(note);
    const go = button({ label: 'SAISON BEGINNEN', width: n ? 260 : 300, height: 54, fontSize: 21, onClick: () => this.onPick(this.pick) });
    go.position.set(this.W / 2, this.H - 50);
    this.panel.addChild(go);
  }
}
