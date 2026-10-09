// The perk draft after a passed day: three painted cards fall in face down and flip over one
// after another; hover or tap lifts a card, choosing it shrinks it into its medallion, which
// flies onto the Glücksbringer-Kette hanging at the bottom. The choice is saved at once.

import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_DISPLAY, drawMoth, reducedMotion, type Particles } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { brass, velvetNap } from '../core/ui';
import { RARITY_LABEL, perkById, perkCount, takePerk, type Perk } from '../core/perks';
import type { GameState } from '../core/state';
import { INK, dark, fillInk, glowAt, light, paint, rgb, rrect } from '../world/painted/brush';
import { CREAM, MUTED, bodyText, enterMotion, plaque } from './kit';
import { RARITY_COLOR, perkTexture } from './perkArt';

const cache = new Map<string, Texture>();
const once = (k: string, make: () => Texture) => {
  let t = cache.get(k);
  if (!t) cache.set(k, (t = make()));
  return t;
};

/** Face of a card: brass frame (rim colour by rarity), velvet in the perk's colour, a lit niche for the medallion. */
function cardFace(p: Perk, w: number, h: number, wide: boolean) {
  return once(`face-${p.id}-${w}x${h}`, () =>
    paint(w + 16, h + 18, (c) => {
      c.translate(8, 6);
      const r = 18;
      rrect(c, 2, 7, w - 4, h, r);
      c.fillStyle = 'rgba(6,2,8,0.55)';
      c.fill();
      rrect(c, 0, 0, w, h, r);
      fillInk(c, brass(c, 0, 0, w * 0.3, h, p.rarity === 'legendary' ? 0.25 : 0, p.rarity === 'common'), 2.4);
      c.save();
      rrect(c, 0, 0, w, h, r);
      c.clip();
      c.strokeStyle = 'rgba(255,248,226,0.8)';
      c.lineWidth = 2;
      rrect(c, 1.5, 1.5, w + 4, h + 4, r);
      c.stroke();
      c.restore();
      const b = 9;
      rrect(c, b, b, w - b * 2, h - b * 2, r - 6);
      const vg = c.createLinearGradient(0, b, 0, h - b);
      vg.addColorStop(0, rgb(dark(p.color, 0.25)));
      vg.addColorStop(0.5, rgb(dark(p.color, 0.6)));
      vg.addColorStop(1, rgb(dark(p.color, 0.82)));
      fillInk(c, vg, 1.4);
      c.save();
      rrect(c, b, b, w - b * 2, h - b * 2, r - 6);
      c.clip();
      velvetNap(c, b, b, w - b * 2, h - b * 2, w * 7 + h + p.color, 1, 0.05);
      // Spotlight on the medallion.
      if (wide) glowAt(c, w / 2, h * 0.27, w * 0.48, h * 0.24, light(p.color, 0.5), 0.35);
      else glowAt(c, h * 0.5, h / 2, h * 0.5, h * 0.48, light(p.color, 0.5), 0.35);
      c.strokeStyle = 'rgba(6,2,8,0.6)';
      c.lineWidth = 10;
      rrect(c, b, b + 3, w - b * 2, h - b * 2, r - 6);
      c.stroke();
      c.restore();
      // Rarity hairline and little deco steps.
      rrect(c, b + 6, b + 6, w - b * 2 - 12, h - b * 2 - 12, r - 10);
      c.strokeStyle = rgb(RARITY_COLOR[p.rarity], 0.55);
      c.lineWidth = 1.4;
      c.stroke();
      if (wide) {
        const y = h * 0.53;
        c.strokeStyle = 'rgba(224,178,90,0.5)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(w * 0.2, y);
        c.lineTo(w * 0.42, y);
        c.moveTo(w * 0.58, y);
        c.lineTo(w * 0.8, y);
        c.stroke();
        c.beginPath();
        c.moveTo(w / 2, y - 5);
        c.lineTo(w / 2 + 5, y);
        c.lineTo(w / 2, y + 5);
        c.lineTo(w / 2 - 5, y);
        c.closePath();
        c.fillStyle = '#e0b25a';
        c.fill();
      }
    }, 2),
  );
}

/** Back of every card: plum velvet, brass border, a golden moth in a deco sun. */
function cardBack(w: number, h: number) {
  return once(`back-${w}x${h}`, () =>
    paint(w + 16, h + 18, (c) => {
      c.translate(8, 6);
      const r = 18;
      rrect(c, 2, 7, w - 4, h, r);
      c.fillStyle = 'rgba(6,2,8,0.55)';
      c.fill();
      rrect(c, 0, 0, w, h, r);
      fillInk(c, brass(c, 0, 0, w * 0.3, h), 2.4);
      const b = 9;
      rrect(c, b, b, w - b * 2, h - b * 2, r - 6);
      const vg = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, '#5a1a3e');
      vg.addColorStop(1, '#1a0612');
      fillInk(c, vg, 1.4);
      c.save();
      rrect(c, b, b, w - b * 2, h - b * 2, r - 6);
      c.clip();
      // Rays.
      c.translate(w / 2, h / 2);
      for (let i = 0; i < 24; i++) {
        c.rotate((Math.PI * 2) / 24);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(-6, -Math.max(w, h));
        c.lineTo(6, -Math.max(w, h));
        c.closePath();
        c.fillStyle = i % 2 ? 'rgba(224,178,90,0.07)' : 'rgba(224,178,90,0.03)';
        c.fill();
      }
      c.restore();
      rrect(c, b + 7, b + 7, w - b * 2 - 14, h - b * 2 - 14, r - 10);
      c.strokeStyle = 'rgba(224,178,90,0.55)';
      c.lineWidth = 1.5;
      c.stroke();
      const s = Math.min(w, h) * 0.42;
      glowAt(c, w / 2, h / 2, s, s, 0xffcf7a, 0.25);
      const mg = c.createLinearGradient(w / 2 - s / 2, h / 2 - s / 2, w / 2 + s / 2, h / 2 + s / 2);
      mg.addColorStop(0, '#fff4c2');
      mg.addColorStop(0.5, '#e6b85a');
      mg.addColorStop(1, '#9a6a22');
      drawMoth(c, w / 2 + 1, h / 2 + 2, s, 'rgba(10,4,16,0.6)', 'rgba(10,4,16,0.7)');
      drawMoth(c, w / 2, h / 2, s, mg, '#6a4210', 'rgba(255,240,200,0.8)');
    }, 2),
  );
}

/** The brass chain the medallions hang on. */
function chainTex(w: number) {
  return once(`chain-${w}`, () =>
    paint(w + 20, 34, (c) => {
      c.translate(10, 14);
      const n = Math.max(6, Math.round(w / 16));
      const step = w / n;
      for (let i = 0; i <= n; i++) {
        const x = i * step;
        const sag = Math.sin((i / n) * Math.PI) * 8;
        c.beginPath();
        if (i % 2) c.ellipse(x, sag, step * 0.62, 3.2, 0, 0, Math.PI * 2);
        else c.ellipse(x, sag, step * 0.66, 6, 0, 0, Math.PI * 2);
        c.strokeStyle = INK;
        c.lineWidth = 4.4;
        c.stroke();
        c.strokeStyle = i % 2 ? '#b07a2a' : '#f0c868';
        c.lineWidth = 2.4;
        c.stroke();
      }
    }, 2),
  );
}

interface Card {
  c: Container;
  perk: Perk;
  front: Container;
  back: Sprite;
  baseY: number;
  hover: number;
  medal: Sprite;
}

export class DraftPanel {
  readonly view = new Container();
  private dim = new Graphics();
  private stage = new Container();
  private cards: Card[] = [];
  private chain = new Container();
  private slots: { x: number; y: number }[] = [];
  private picked = false;
  private ready = false;
  private time = 0;
  private W = 860;
  private H = 640;
  private narrow = false;
  private built = false;
  private hanging: Sprite[] = [];
  /** Start money the chosen perk paid at once. */
  bonus = 0;

  constructor(
    private state: GameState,
    private particles: Particles,
    private onDone: (perk: Perk, bonus: number) => void,
  ) {
    this.view.addChild(this.dim, this.stage);
    this.view.eventMode = 'static';
  }

  resize(w: number, h: number) {
    const n = w < 720;
    if (!this.built || n !== this.narrow) {
      this.narrow = n;
      this.build(!this.built);
      this.built = true;
    }
    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.8 });
    const s = Math.min((w * 0.97) / this.W, (h * 0.96) / this.H, 1.15);
    this.stage.scale.set(s);
    this.stage.position.set(w / 2 - (this.W / 2) * s, h / 2 - (this.H / 2) * s);
  }

  private build(first: boolean) {
    this.stage.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cards = [];
    this.hanging = [];
    const n = this.narrow;
    const ids = this.state.data.draft ?? [];
    const perks = ids.map(perkById).filter((p): p is Perk => !!p);
    const cw = n ? 376 : 232;
    const ch = n ? 136 : 340;
    const gap = n ? 14 : 26;
    this.W = n ? 404 : Math.max(760, perks.length * cw + (perks.length - 1) * gap + 60);
    const top = n ? 150 : 158;
    const cardsH = n ? perks.length * (ch + gap) - gap : ch;
    this.H = top + cardsH + (n ? 150 : 170);

    const title = plaque('GLÜCKSBRINGER', { size: n ? 24 : 30, minW: n ? 260 : 340 });
    title.position.set(this.W / 2, 34);
    this.stage.addChild(title);
    const day = this.state.data.evening.number - 1;
    const sub = bodyText(
      n ? `Tag ${day} geschafft! Such dir einen aus.` : `Tag ${day} geschafft! Such dir einen Glücksbringer für den Rest der Saison aus.`,
      n ? 18 : 21,
      CREAM,
      { wrap: this.W - 40 },
    );
    sub.anchor.set(0.5, 0);
    sub.position.set(this.W / 2, 82);
    this.stage.addChild(sub);
    const hint = bodyText('Sie ändern nie die Gewinnchancen der Spiele.', n ? 14 : 16, MUTED);
    hint.anchor.set(0.5, 0);
    hint.position.set(this.W / 2, 82 + sub.height + 4);
    this.stage.addChild(hint);

    // Cards.
    const x0 = (this.W - (n ? cw : perks.length * cw + (perks.length - 1) * gap)) / 2;
    perks.forEach((p, i) => {
      const cx = n ? this.W / 2 : x0 + i * (cw + gap) + cw / 2;
      const cy = n ? top + i * (ch + gap) + ch / 2 : top + ch / 2;
      const card = this.card(p, cw, ch, !n);
      card.c.position.set(cx, cy);
      card.baseY = cy;
      this.stage.addChild(card.c);
      this.cards.push(card);
    });

    // The chain with what is already on it.
    this.chain = new Container();
    const chainW = this.W - (n ? 40 : 120);
    const chY = top + cardsH + (n ? 46 : 64);
    const lab = bodyText('GLÜCKSBRINGER-KETTE', n ? 14 : 15, MUTED, { bold: true });
    lab.anchor.set(0.5, 1);
    lab.position.set(this.W / 2, chY - 8);
    const chain = new Sprite(chainTex(chainW));
    chain.position.set((this.W - chainW) / 2 - 10, chY - 14);
    this.chain.addChild(lab, chain);
    this.stage.addChild(this.chain);
    const owned = this.state.data.perks;
    const total = Math.max(owned.length + 1, n ? 8 : 12);
    const md = Math.min(n ? 40 : 54, (chainW - 20) / total);
    this.slots = [];
    for (let i = 0; i < total; i++) {
      const k = (i + 0.5) / total;
      const sx = (this.W - chainW) / 2 + k * chainW;
      const sag = Math.sin(k * Math.PI) * 8;
      this.slots.push({ x: sx, y: chY + sag + md * 0.55 });
    }
    owned.forEach((id, i) => this.hang(id, i, md));
    (this.chain as Container & { md: number }).md = md;

    if (first) this.dealIn();
    else this.cards.forEach((c) => this.showFront(c, true));
  }

  /** A medallion hanging from the chain at slot i. */
  private hang(id: string, i: number, md: number) {
    const s = this.slots[Math.min(i, this.slots.length - 1)];
    const m = new Sprite(perkTexture(id, 96));
    m.anchor.set(0.5, 0.1);
    m.width = m.height = md;
    m.position.set(s.x, s.y - md * 0.5);
    this.chain.addChild(m);
    this.hanging.push(m);
    return m;
  }

  private card(p: Perk, w: number, h: number, wide: boolean): Card {
    const c = new Container();
    const front = new Container();
    const face = new Sprite(cardFace(p, w, h, wide));
    face.position.set(-w / 2 - 8, -h / 2 - 6);
    front.addChild(face);
    const md = wide ? 118 : 96;
    const medal = new Sprite(perkTexture(p.id, 128));
    medal.anchor.set(0.5);
    medal.width = medal.height = md;
    const owned = perkCount(this.state.data, p.id);
    const name = new Text({
      text: p.name.toUpperCase(),
      style: { fontFamily: FONT_DISPLAY, fontSize: wide ? 21 : 19, fill: 0xfff1d0, letterSpacing: 1, dropShadow: { color: 0x0a0410, alpha: 0.85, blur: 1, distance: 2, angle: Math.PI / 2 } },
    });
    const rar = bodyText(RARITY_LABEL[p.rarity].toUpperCase() + (owned ? ` · ${owned + 1}. Stück` : p.max > 1 ? ` · bis ${p.max}×` : ''), wide ? 14 : 13, RARITY_COLOR[p.rarity], { bold: true });
    const desc = bodyText(p.desc.replace(/ %/g, ' %'), wide ? 18 : 16, 0xe9dcc0, { wrap: wide ? w - 44 : w - md - 52, align: wide ? 'center' : 'left' });
    if (wide) {
      medal.position.set(0, -h * 0.23);
      name.anchor.set(0.5, 0);
      name.position.set(0, h * 0.06);
      if (name.width > w - 30) name.scale.set((w - 30) / name.width);
      rar.anchor.set(0.5, 0);
      rar.position.set(0, name.y + 30);
      desc.anchor.set(0.5, 0);
      desc.position.set(0, rar.y + 26);
    } else {
      const lx = -w / 2 + md + 30;
      medal.position.set(-w / 2 + md / 2 + 16, 0);
      name.position.set(lx, -h / 2 + 14);
      const room = w / 2 - lx - 18;
      if (name.width > room) name.scale.set(room / name.width);
      rar.position.set(lx, name.y + 25);
      desc.position.set(lx, rar.y + 19);
      if (desc.height > h / 2 - desc.y - 10) desc.scale.set((h / 2 - desc.y - 10) / desc.height);
    }
    front.addChild(medal, name, rar, desc);
    const back = new Sprite(cardBack(w, h));
    back.position.set(-w / 2 - 8, -h / 2 - 6);
    c.addChild(front, back);
    front.visible = false;
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    const card: Card = { c, perk: p, front, back, baseY: 0, hover: 0, medal };
    c.on('pointerover', () => {
      if (!this.ready || this.picked) return;
      card.hover = 1;
      sfx.hover();
    });
    c.on('pointerout', () => (card.hover = 0));
    c.on('pointertap', () => this.pick(card));
    return card;
  }

  private showFront(card: Card, on: boolean) {
    card.front.visible = on;
    card.back.visible = !on;
  }

  /** Cards drop in face down, then flip one after another. */
  private async dealIn() {
    void enterMotion(this.stage);
    const calm = reducedMotion();
    if (calm) {
      this.cards.forEach((c) => this.showFront(c, true));
      this.ready = true;
      return;
    }
    this.cards.forEach((k, i) => {
      k.c.alpha = 0;
      k.c.y = k.baseY - 60;
      k.c.rotation = (i - 1) * 0.06;
      void wait(80 + i * 110).then(() => {
        if (k.c.destroyed) return;
        sfx.tick();
        void tween(k.c, { alpha: 1 }, 180);
        void tween(k.c, { y: k.baseY, rotation: 0 }, 380, ease.outBack);
      });
    });
    await wait(80 + this.cards.length * 110 + 260);
    for (const k of this.cards) {
      if (k.c.destroyed) return;
      sfx.click();
      const sx = k.c.scale.x;
      await animate(130, (t) => !k.c.destroyed && (k.c.scale.x = sx * (1 - t)), ease.inCubic);
      if (k.c.destroyed) return;
      this.showFront(k, true);
      void animate(200, (t) => !k.c.destroyed && (k.c.scale.x = sx * t), ease.outBack);
      if (k.perk.rarity !== 'common') {
        const g = k.c.toGlobal({ x: 0, y: 0 });
        this.particles.sparkle(g.x, g.y, k.perk.rarity === 'legendary' ? 26 : 14, RARITY_COLOR[k.perk.rarity], 160);
        if (k.perk.rarity === 'legendary') sfx.shimmer();
      }
      await wait(90);
    }
    this.ready = true;
  }

  private async pick(card: Card) {
    if (!this.ready || this.picked) return;
    this.picked = true;
    const d = this.state.data;
    this.bonus = takePerk(this.state, card.perk.id);
    sfx.chip();
    // The others fall away.
    for (const k of this.cards) {
      if (k === card) continue;
      void tween(k.c, { alpha: 0, y: k.baseY + 40 }, 260, ease.inCubic);
    }
    const md = (this.chain as Container & { md: number }).md;
    const slot = this.slots[Math.min(d.perks.length - 1, this.slots.length - 1)];
    const calm = reducedMotion();
    // The chosen card glows up, then turns into its medallion and flies to the chain.
    if (!calm) await tween(card.c.scale, { x: 1.08, y: 1.08 }, 180, ease.outCubic);
    const mp = this.stage.toLocal(card.medal.getGlobalPosition());
    const fly = new Sprite(perkTexture(card.perk.id, 128));
    fly.anchor.set(0.5);
    const m0 = card.medal.width * card.c.scale.x;
    fly.width = fly.height = m0;
    fly.position.copyFrom(mp);
    this.stage.addChild(fly);
    void tween(card.c, { alpha: 0 }, 200);
    sfx.whoosh();
    const sx = mp.x;
    const sy = mp.y;
    const tx = slot.x;
    const ty = slot.y - md * 0.5 + md * 0.4;
    await animate(calm ? 200 : 620, (k) => {
      if (fly.destroyed) return;
      const s = m0 + (md - m0) * k;
      fly.width = fly.height = s;
      fly.x = sx + (tx - sx) * k;
      // A little arc upwards on the way.
      fly.y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 70;
      fly.rotation = calm ? 0 : Math.sin(k * Math.PI) * 0.6;
    }, ease.inOutCubic);
    fly.destroy();
    const m = this.hang(card.perk.id, d.perks.length - 1, md);
    const g = m.getGlobalPosition();
    this.particles.sparkle(g.x, g.y + md * 0.4, 30, RARITY_COLOR[card.perk.rarity], 180);
    sfx.medal();
    if (!calm) {
      const base = m.scale.x;
      void animate(700, (k) => !m.destroyed && (m.rotation = Math.sin(k * Math.PI * 4) * 0.35 * (1 - k)));
      void animate(260, (k) => !m.destroyed && m.scale.set(base * (1 + 0.3 * Math.sin(k * Math.PI))));
    }
    await wait(calm ? 400 : 950);
    this.onDone(card.perk, this.bonus);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    for (const k of this.cards) {
      if (k.c.destroyed || this.picked || !this.ready) continue;
      const target = k.hover ? 1 : 0;
      const cur = (k.c as Container & { lift?: number }).lift ?? 0;
      const next = cur + (target - cur) * Math.min(1, dtMs / 90);
      (k.c as Container & { lift?: number }).lift = next;
      k.c.y = k.baseY - next * 16 + (reducedMotion() ? 0 : Math.sin(this.time * 1.6 + k.baseY + k.c.x * 0.01) * 2.5);
      k.c.scale.set(1 + next * 0.04);
    }
    for (let i = 0; i < this.hanging.length; i++) {
      const m = this.hanging[i];
      if (!m.destroyed && !reducedMotion()) m.skew.x = Math.sin(this.time * 1.3 + i) * 0.04;
    }
  }

  destroy() {
    this.view.eventMode = 'none';
    const v = this.view;
    void animate(200, (k) => !v.destroyed && (v.alpha = 1 - k)).then(() => !v.destroyed && v.destroy({ children: true }));
  }
}
