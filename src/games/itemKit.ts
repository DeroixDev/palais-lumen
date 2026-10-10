// Shared pieces for the odds items inside the games (src/core/oddsItems.ts registers them):
// a watcher that tells a game when one of its items switches on or off, the honest RTP line
// with the item, and the painted brass medallion that pops up when an item does its thing.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import type { GameState } from '../core/state';
import { isActive, itemDef } from '../core/modifiers';
import { FONT_DISPLAY, announce, glowTexture, reducedMotion } from '../core/fx';
import { ease, tween, wait } from '../core/tween';
import { INK, ellipse, fillInk, glowAt, gold, light, paint, rgb, rim, rrect, type Ctx } from '../world/painted/brush';

/** Tells a game which of its odds items is working right now (polled once per frame). */
export class OddsWatch {
  id: string | null;
  constructor(
    private state: GameState,
    private game: string,
    private ids: string[],
  ) {
    this.id = this.find();
  }

  private find() {
    return this.ids.find((id) => isActive(this.state, id, this.game)) ?? null;
  }

  private first = true;

  /** True when the active item changed since the last call (and once on the first call). */
  poll() {
    const n = this.find();
    if (this.first) {
      this.first = false;
      this.id = n;
      return true;
    }
    if (n === this.id) return false;
    this.id = n;
    return true;
  }

  /** Is `id` on right now (fresh check, e.g. at the start of a round). */
  on(id: string) {
    return isActive(this.state, id, this.game);
  }
}

export const itemName = (id: string) => itemDef(id)?.name ?? id;

const p1 = (x: number) => (x * 100).toFixed(1).replace('.', ',');

/** "Auszahlungsquote 105,1 % mit Röntgenbrille · Vorteil Spieler 5,1 %" (note in brackets after the name). */
export function itemRtpText(rtp: number, id: string, note = '') {
  const edge = rtp <= 1 ? `Hausvorteil ${p1(1 - rtp)} %` : `Vorteil bei dir ${p1(rtp - 1)} %`;
  return `Auszahlungsquote ${p1(rtp)} % mit ${itemName(id)}${note ? ` (${note})` : ''} · ${edge}`;
}

// ---- Medallion -------------------------------------------------------------------------------

const ITEM_COLOR: Record<string, number> = {
  roentgenbrille: 0x6fe0ff,
  gluecksfeder: 0xffcf7a,
  minensucher: 0xffa94a,
  magnetkugel: 0xff5a5a,
  mottenfluegel: 0xff8fc8,
  mondschirm: 0xbfd8ff,
  gezinkte: 0xfff1c4,
  radbremse: 0xff5fa2,
  ruhigehand: 0x9fe8ff,
  sternschnuppe: 0xfff3a0,
  leuchtkaefer: 0xd8ff7a,
  brotkrumen: 0xffc86a,
  eulenauge: 0xffb43a,
  mottenstaub: 0xe8c8ff,
  mondspiegel: 0xcfe6ff,
  falternetz: 0x9fe8c8,
};

export const itemColor = (id: string) => ITEM_COLOR[id] ?? 0xffcf7a;

const medalCache = new Map<string, Texture>();

/** A brass medallion with the item's little painted picture (baked once per item). */
export function itemMedalTexture(id: string) {
  let t = medalCache.get(id);
  if (t) return t;
  const S = 112;
  t = paint(S, S, (c) => {
    const m = S / 2;
    glowAt(c, m, m + 4, 54, 54, 0x0a0410, 0.55);
    ellipse(c, m, m, 48, 48);
    fillInk(c, gold(c, 0, 8, 0, S - 8), 3);
    rim(c, 0.6, 2);
    ellipse(c, m, m, 38, 38);
    const g = c.createRadialGradient(m - 10, m - 12, 4, m, m, 40);
    g.addColorStop(0, rgb(0x4a1a3a));
    g.addColorStop(1, rgb(0x14060f));
    fillInk(c, g, 2);
    glowAt(c, m, m, 34, 34, itemColor(id), 0.3, 'lighter');
    c.save();
    c.translate(m, m);
    ICONS[id]?.(c);
    c.restore();
  });
  medalCache.set(id, t);
  return t;
}

const ICONS: Record<string, (c: Ctx) => void> = {
  roentgenbrille(c) {
    // Round brass spectacles with glowing blue lenses.
    for (const x of [-13, 13]) {
      ellipse(c, x, 0, 11, 11);
      const g = c.createRadialGradient(x - 3, -4, 1, x, 0, 12);
      g.addColorStop(0, '#e8fbff');
      g.addColorStop(0.5, rgb(0x6fe0ff));
      g.addColorStop(1, rgb(0x1a5a7a));
      fillInk(c, g, 3);
    }
    c.strokeStyle = rgb(0xe0b25a);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-3, -2);
    c.quadraticCurveTo(0, -7, 3, -2);
    c.stroke();
    c.beginPath();
    c.moveTo(-24, -3);
    c.lineTo(-30, -9);
    c.moveTo(24, -3);
    c.lineTo(30, -9);
    c.stroke();
  },
  gluecksfeder(c) {
    c.rotate(-0.6);
    c.beginPath();
    c.moveTo(0, -28);
    c.quadraticCurveTo(14, -8, 4, 20);
    c.lineTo(-4, 20);
    c.quadraticCurveTo(-14, -8, 0, -28);
    const g = c.createLinearGradient(-12, 0, 12, 0);
    g.addColorStop(0, rgb(0xffe9b0));
    g.addColorStop(1, rgb(0xd88a2a));
    fillInk(c, g, 2);
    c.strokeStyle = 'rgba(90,40,10,0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -24);
    c.lineTo(0, 28);
    for (let i = -18; i < 16; i += 6) {
      c.moveTo(0, i);
      c.lineTo(-7, i - 5);
      c.moveTo(0, i);
      c.lineTo(7, i - 5);
    }
    c.stroke();
  },
  minensucher(c) {
    // A little miner's lantern.
    rrect(c, -10, -12, 20, 26, 5);
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(1, rgb(0xffa94a));
    fillInk(c, g, 2.5);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-6, -12);
    c.lineTo(-6, 14);
    c.moveTo(6, -12);
    c.lineTo(6, 14);
    c.stroke();
    rrect(c, -13, -18, 26, 7, 3);
    fillInk(c, gold(c, 0, -18, 0, -11), 2);
    rrect(c, -13, 13, 26, 7, 3);
    fillInk(c, gold(c, 0, 13, 0, 20), 2);
    c.beginPath();
    c.arc(0, -22, 7, Math.PI, 0);
    c.strokeStyle = rgb(0xe0b25a);
    c.lineWidth = 2.5;
    c.stroke();
  },
  magnetkugel(c) {
    // Horseshoe magnet with a ball between the poles.
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(0, -2, 17, Math.PI, 0, true);
    c.strokeStyle = INK;
    c.lineWidth = 15;
    c.stroke();
    c.strokeStyle = rgb(0xd8342e);
    c.lineWidth = 11;
    c.stroke();
    for (const x of [-17, 17]) {
      c.fillStyle = INK;
      c.fillRect(x - 7.5, -14, 15, 12);
      c.fillStyle = '#e8e4f0';
      c.fillRect(x - 5.5, -12, 11, 9);
    }
    ellipse(c, 0, 18, 7, 7);
    const g = c.createRadialGradient(-2, 16, 1, 0, 18, 8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#9a9ab0');
    fillInk(c, g, 2);
  },
  mottenfluegel(c) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -2);
      c.bezierCurveTo(s * 18, -30, s * 34, -14, s * 26, 4);
      c.bezierCurveTo(s * 22, 14, s * 8, 10, 0, 4);
      const g = c.createLinearGradient(0, -20, s * 30, 10);
      g.addColorStop(0, rgb(0xffd0e8));
      g.addColorStop(1, rgb(0xc84a8a));
      fillInk(c, g, 2);
      c.beginPath();
      c.moveTo(0, 4);
      c.bezierCurveTo(s * 12, 8, s * 20, 22, s * 10, 24);
      c.bezierCurveTo(s * 4, 22, 0, 14, 0, 8);
      fillInk(c, rgb(0xa83a72), 2);
    }
    ellipse(c, 0, 4, 3.5, 14);
    fillInk(c, rgb(0x3a1a2a), 1.5);
  },
  mondschirm(c) {
    // A parachute with a crescent on its canopy.
    c.beginPath();
    c.moveTo(-26, 0);
    c.quadraticCurveTo(-24, -28, 0, -28);
    c.quadraticCurveTo(24, -28, 26, 0);
    c.quadraticCurveTo(13, -6, 0, 0);
    c.quadraticCurveTo(-13, -6, -26, 0);
    const g = c.createLinearGradient(0, -28, 0, 0);
    g.addColorStop(0, '#f4f8ff');
    g.addColorStop(1, rgb(0x7a9ad8));
    fillInk(c, g, 2.5);
    c.strokeStyle = 'rgba(240,244,255,0.85)';
    c.lineWidth = 1.2;
    c.beginPath();
    for (const x of [-26, -10, 10, 26]) {
      c.moveTo(x, x === -26 || x === 26 ? 0 : -3);
      c.lineTo(0, 20);
    }
    c.stroke();
    rrect(c, -6, 18, 12, 9, 3);
    fillInk(c, gold(c, 0, 18, 0, 27), 2);
    c.fillStyle = rgb(0xffe08a);
    c.beginPath();
    c.arc(4, -15, 7, 0, Math.PI * 2);
    c.arc(7, -17, 6, 0, Math.PI * 2, true);
    c.fill();
  },
  gezinkte(c) {
    for (const [x, y, r, pips] of [
      [-10, 4, -0.25, 6],
      [12, -6, 0.3, 6],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(r);
      rrect(c, -12, -12, 24, 24, 5);
      const g = c.createLinearGradient(-12, -12, 12, 12);
      g.addColorStop(0, '#fffaf0');
      g.addColorStop(1, rgb(0xd8c8a8));
      fillInk(c, g, 2.5);
      rim(c, 0.7);
      c.fillStyle = rgb(0x2a0a18);
      const at = pips === 6 ? [-6, -6, -6, 0, -6, 6, 6, -6, 6, 0, 6, 6] : [];
      for (let i = 0; i < at.length; i += 2) {
        c.beginPath();
        c.arc(at[i], at[i + 1], 2.4, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  },
  radbremse(c) {
    // A wheel rim with a brake shoe pressing on it.
    ellipse(c, 0, 4, 22, 22);
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.stroke();
    c.strokeStyle = rgb(0xff5fa2);
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = 'rgba(255,240,220,0.8)';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.moveTo(0, 4);
      c.lineTo(Math.cos(a) * 19, 4 + Math.sin(a) * 19);
    }
    c.stroke();
    rrect(c, -9, -28, 18, 12, 3);
    fillInk(c, gold(c, 0, -28, 0, -16), 2);
    rrect(c, -3, -36, 6, 10, 2);
    fillInk(c, rgb(0x6a4a2a), 1.5);
  },
  ruhigehand(c) {
    // An open painted hand.
    c.beginPath();
    c.moveTo(-12, 26);
    c.lineTo(-14, 4);
    for (const [x, h] of [
      [-12, -18],
      [-4, -24],
      [4, -22],
      [12, -16],
    ] as const) {
      c.lineTo(x - 3.5, 0);
      c.lineTo(x - 3.5, h + 3);
      c.quadraticCurveTo(x, h - 3, x + 3.5, h + 3);
      c.lineTo(x + 3.5, -2);
    }
    c.quadraticCurveTo(22, -4, 24, 2);
    c.quadraticCurveTo(18, 10, 14, 26);
    c.closePath();
    const g = c.createLinearGradient(0, -24, 0, 26);
    g.addColorStop(0, rgb(0xffe2c4));
    g.addColorStop(1, rgb(0xc88a6a));
    fillInk(c, g, 2.5);
  },
  sternschnuppe(c) {
    const g = c.createLinearGradient(-26, 22, 6, -6);
    g.addColorStop(0, 'rgba(255,243,160,0)');
    g.addColorStop(1, 'rgba(255,243,160,0.9)');
    c.strokeStyle = g;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(-26, 24);
    c.lineTo(4, -4);
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 6 : 15;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = 8 + Math.cos(a) * r;
      const y = -8 + Math.sin(a) * r;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.closePath();
    const sg = c.createRadialGradient(6, -10, 1, 8, -8, 15);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(1, rgb(0xffcf4a));
    fillInk(c, sg, 2);
  },
  leuchtkaefer(c) {
    // A beetle with a glowing tail.
    glowAt(c, 0, 12, 24, 24, 0xd8ff7a, 0.8, 'lighter');
    ellipse(c, 0, 12, 10, 12);
    const g = c.createRadialGradient(0, 14, 1, 0, 12, 12);
    g.addColorStop(0, '#fbffe0');
    g.addColorStop(1, rgb(0xa8e03a));
    fillInk(c, g, 2);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -12);
      c.quadraticCurveTo(s * 16, -12, s * 13, 6);
      c.quadraticCurveTo(s * 6, 4, 0, 2);
      c.closePath();
      fillInk(c, rgb(0x5a2a1a), 2);
    }
    ellipse(c, 0, -16, 6, 5);
    fillInk(c, rgb(0x2a1410), 1.5);
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(-3, -20);
    c.quadraticCurveTo(-8, -28, -12, -27);
    c.moveTo(3, -20);
    c.quadraticCurveTo(8, -28, 12, -27);
    c.stroke();
  },
  brotkrumen(c) {
    // A little loaf with crumbs.
    c.beginPath();
    c.moveTo(-22, 8);
    c.quadraticCurveTo(-24, -14, 0, -16);
    c.quadraticCurveTo(24, -14, 22, 8);
    c.closePath();
    const g = c.createLinearGradient(0, -16, 0, 8);
    g.addColorStop(0, rgb(0xf0b060));
    g.addColorStop(1, rgb(0xa86020));
    fillInk(c, g, 2.5);
    c.strokeStyle = 'rgba(255,240,200,0.8)';
    c.lineWidth = 2;
    c.beginPath();
    for (const x of [-10, 0, 10]) {
      c.moveTo(x - 4, -10);
      c.lineTo(x + 3, -2);
    }
    c.stroke();
    for (const [x, y, r] of [[-16, 20, 3.5], [-4, 23, 2.5], [8, 19, 3], [18, 24, 2.2]] as const) {
      ellipse(c, x, y, r, r * 0.8);
      fillInk(c, rgb(0xe8a850), 1.2);
    }
  },
  eulenauge(c) {
    // An owl's round eye with a target-like iris.
    ellipse(c, 0, 2, 26, 22);
    fillInk(c, rgb(0x7a4a2a), 2.5);
    ellipse(c, 0, 2, 19, 17);
    const g = c.createRadialGradient(-4, -2, 2, 0, 2, 19);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(1, rgb(0xe08a1a));
    fillInk(c, g, 2);
    ellipse(c, 0, 2, 8, 8);
    fillInk(c, rgb(0x14080a), 1.5);
    ellipse(c, -3, -1, 2.5, 2.5);
    c.fillStyle = '#ffffff';
    c.fill();
    c.fillStyle = rgb(0x5a3018);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 8, -18);
      c.lineTo(s * 24, -28);
      c.lineTo(s * 20, -14);
      c.closePath();
      c.fill();
    }
  },
  mottenstaub(c) {
    // A sprinkle of glittering dust over a ticket corner.
    c.save();
    c.rotate(-0.2);
    rrect(c, -20, -8, 34, 26, 4);
    fillInk(c, gold(c, 0, -8, 0, 18), 2);
    c.restore();
    c.fillStyle = '#fff4ff';
    for (const [x, y, r] of [[10, -20, 3], [18, -10, 2.2], [4, -12, 1.8], [22, -24, 1.6], [-6, -22, 2.4], [14, 2, 1.8], [24, 6, 2.4]] as const) {
      glowAt(c, x, y, r * 4, r * 4, 0xe8c8ff, 0.7, 'lighter');
      c.beginPath();
      c.moveTo(x, y - r * 2);
      c.lineTo(x + r * 0.6, y);
      c.lineTo(x, y + r * 2);
      c.lineTo(x - r * 0.6, y);
      c.closePath();
      c.fill();
    }
  },
  mondspiegel(c) {
    // A hand mirror with a crescent in the glass.
    rrect(c, -4, 14, 8, 18, 3);
    fillInk(c, gold(c, 0, 14, 0, 32), 2);
    ellipse(c, 0, -4, 20, 22);
    fillInk(c, gold(c, 0, -26, 0, 18), 2.5);
    ellipse(c, 0, -4, 15, 17);
    const g = c.createLinearGradient(-15, -20, 15, 12);
    g.addColorStop(0, '#f4fbff');
    g.addColorStop(1, rgb(0x6a8ab8));
    fillInk(c, g, 1.5);
    c.fillStyle = rgb(0xffe08a);
    c.beginPath();
    c.arc(-2, -6, 8, 0, Math.PI * 2);
    c.arc(2, -9, 7, 0, Math.PI * 2, true);
    c.fill();
  },
  falternetz(c) {
    // A butterfly net on a stick.
    c.strokeStyle = rgb(0x8a5a2a);
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-24, 28);
    c.lineTo(-2, 2);
    c.stroke();
    ellipse(c, 8, -10, 16, 14);
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    c.beginPath();
    c.moveTo(-6, -4);
    c.quadraticCurveTo(4, 26, 20, 10);
    c.quadraticCurveTo(26, 0, 22, -16);
    const g = c.createLinearGradient(-6, -20, 22, 20);
    g.addColorStop(0, 'rgba(230,255,244,0.85)');
    g.addColorStop(1, 'rgba(120,200,170,0.85)');
    fillInk(c, g, 2);
    c.strokeStyle = 'rgba(30,60,50,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = -4; i <= 20; i += 6) {
      c.moveTo(i, -18);
      c.lineTo(i - 2, 14);
    }
    for (let j = -12; j <= 12; j += 6) {
      c.moveTo(-6, j);
      c.lineTo(24, j);
    }
    c.stroke();
    ellipse(c, 8, -10, 16, 14);
    c.strokeStyle = rgb(0xe0b25a);
    c.lineWidth = 2.5;
    c.stroke();
  },
};

/**
 * The item's moment: its medallion pops up at (x, y) in `parent` with a glow and a caption,
 * holds, then floats away. With reduced motion it only fades. Resolves when it has popped.
 */
export async function itemMoment(parent: Container, x: number, y: number, id: string, caption: string, scale = 1) {
  const col = itemColor(id);
  const c = new Container();
  c.position.set(x, y);
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.width = glow.height = 230;
  glow.tint = col;
  glow.blendMode = 'add';
  glow.alpha = 0.7;
  const medal = new Sprite(itemMedalTexture(id));
  medal.anchor.set(0.5);
  const t = new Text({
    text: caption,
    style: { fontFamily: FONT_DISPLAY, fontSize: 24, fill: light(col, 0.35), stroke: { color: 0x14080f, width: 6, join: 'round' }, align: 'center', letterSpacing: 1 },
  });
  t.anchor.set(0.5, 0);
  t.y = 54;
  c.addChild(glow, medal, t);
  parent.addChild(c);
  announce(caption);
  const calm = reducedMotion();
  const done = () => {
    if (c.destroyed) return;
    void tween(c, { alpha: 0, y: y - (calm ? 0 : 26) }, 380, ease.inCubic).then(() => c.destroy({ children: true }));
  };
  if (calm) {
    c.scale.set(scale);
    c.alpha = 0;
    await tween(c, { alpha: 1 }, 220);
  } else {
    c.scale.set(scale * 0.35);
    c.rotation = -0.25;
    await Promise.all([tween(c.scale, { x: scale, y: scale }, 380, ease.outBack), tween(c, { rotation: 0 }, 380, ease.outBack), tween(glow, { alpha: 0.35 }, 600)]);
  }
  void wait(calm ? 1100 : 900).then(done);
}

/** A small persistent brass badge "✦ Name" for a game's corner while the item works. */
export function itemTag(id: string, fontSize = 16) {
  const c = new Container();
  const medal = new Sprite(itemMedalTexture(id));
  medal.anchor.set(0.5);
  medal.width = medal.height = fontSize * 2.2;
  const t = new Text({ text: itemName(id), style: { fontFamily: FONT_DISPLAY, fontSize, fill: light(itemColor(id), 0.4), stroke: { color: 0x14080f, width: 4, join: 'round' } } });
  t.anchor.set(0, 0.5);
  t.x = fontSize * 1.25;
  c.addChild(medal, t);
  return c;
}

