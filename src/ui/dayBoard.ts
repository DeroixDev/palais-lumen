// Today at a glance, painted into the world's look: the event chip (a brass medallion with
// the event's sign; tap it for the exact rule), the guests' tasks as a small velvet list
// under the HUD (tap the header to fold it), the event ribbon for the day card, and the
// speech bubble in which a guest asks for something.

import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY } from '../core/fx';
import { animate } from '../core/tween';
import { sfx } from '../core/audio';
import { button, brass } from '../core/ui';
import { focusable } from '../core/focus';
import type { GameState, Quest } from '../core/state';
import { currentEvent, type DayEvent } from '../core/events';
import { rewardText } from '../core/quests';
import { INK, fillInk, glowAt, paint, rgb, rrect, dark, light } from '../world/painted/brush';
import { Chibi } from '../world/painted/chibi';
import { CREAM, MUTED, bodyText, enterMotion, leaveMotion, plaque } from './kit';
import { drawStone } from './stone';
import { giverLook } from '../world/roomExtras';

const cache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

/** Brass medallion with the event's enamel colour and sign. */
export function eventMedal(e: DayEvent, r = 20) {
  return cached(`evmedal-${e.id}-${r}`, () =>
    paint(r * 2 + 10, r * 2 + 10, (c) => {
      const o = r + 5;
      glowAt(c, o, o, r + 5, r + 5, e.color, 0.35);
      c.beginPath();
      c.arc(o + 1, o + 2, r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.fill();
      c.beginPath();
      c.arc(o, o, r, 0, Math.PI * 2);
      fillInk(c, brass(c, o - r, o - r, o + r * 0.6, o + r), 1.8);
      c.beginPath();
      c.arc(o, o, r * 0.74, 0, Math.PI * 2);
      const g = c.createRadialGradient(o - r * 0.25, o - r * 0.3, 0, o, o, r * 0.8);
      g.addColorStop(0, rgb(light(e.color, 0.35)));
      g.addColorStop(1, rgb(dark(e.color, 0.45)));
      fillInk(c, g, 1.2);
      c.font = `700 ${Math.round(r * 1.05)}px "Barlow Condensed", "Segoe UI Symbol", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(8,10,24,0.7)';
      c.strokeText(e.icon, o, o + 1);
      c.fillStyle = '#fff6e0';
      c.fillText(e.icon, o, o + 1);
      c.beginPath();
      c.ellipse(o - r * 0.32, o - r * 0.42, r * 0.28, r * 0.12, -0.6, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fill();
    }, 3),
  );
}

/** The medallion as an image URL, for the HUD's in-game chip. */
export function eventMedalUrl(e: DayEvent) {
  const res = eventMedal(e, 19).source.resource as HTMLCanvasElement;
  return res.toDataURL();
}

/** Dark velvet strip with a brass hairline (lists, ribbons). */
function velvetTexture(w: number, h: number, accent = 0xe0b25a) {
  const W = Math.round(w);
  const H = Math.round(h);
  return cached(`velvet-${W}x${H}-${accent}`, () =>
    paint(W + 8, H + 10, (c) => {
      c.translate(4, 3);
      rrect(c, 1, 4, W - 2, H, 12);
      c.fillStyle = 'rgba(2,4,12,0.45)';
      c.fill();
      rrect(c, 0, 0, W, H, 12);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(30,42,90,0.94)');
      g.addColorStop(1, 'rgba(10,14,36,0.94)');
      fillInk(c, g, 1.6);
      rrect(c, 3, 3, W - 6, H - 6, 10);
      c.strokeStyle = rgb(accent, 0.55);
      c.lineWidth = 1.2;
      c.stroke();
      c.save();
      rrect(c, 0, 0, W, H, 12);
      c.clip();
      c.strokeStyle = 'rgba(255,240,210,0.18)';
      c.lineWidth = 2;
      rrect(c, 1.5, 1.5, W + 6, H + 6, 12);
      c.stroke();
      c.restore();
    }, 2),
  );
}

/** Event line for the day card: medallion, name and the rule on a velvet ribbon. */
export function eventRibbon(e: DayEvent, maxW: number) {
  const c = new Container();
  const name = new Text({ text: e.name.toUpperCase(), style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: e.color, letterSpacing: 2 } });
  const rule = bodyText(e.rule, 18, CREAM, { wrap: Math.max(200, maxW - 90), align: 'left' });
  const w = Math.min(maxW, Math.max(name.width, rule.width) + 92);
  const h = Math.max(62, name.height + rule.height + 18);
  const bg = new Sprite(velvetTexture(w, h, e.color));
  bg.position.set(-w / 2 - 4, -3);
  const m = new Sprite(eventMedal(e, 22));
  m.anchor.set(0.5);
  m.position.set(-w / 2 + 36, h / 2);
  name.position.set(-w / 2 + 68, 8);
  rule.position.set(-w / 2 + 68, 10 + name.height);
  c.addChild(bg, m, name, rule);
  return c;
}

// ---- The board under the HUD ---------------------------------------------------------------------

export class DayBoard {
  readonly view = new Container();
  private sig = '';
  private ruleOpen = false;
  private folded: boolean;
  private w = 280;
  private narrow = false;
  private off: () => void;
  /** Opened from the in-game chip: shown unfolded over the game; any tap closes it. */
  peek = false;
  onPeekTap: (() => void) | null = null;

  constructor(private state: GameState) {
    this.folded = matchMedia('(max-width: 560px)').matches;
    this.off = state.onChange(() => this.refresh());
  }

  layout(sw: number, top: number) {
    const narrow = sw < 600;
    const w = Math.round(narrow ? Math.min(260, sw - 24) : 290);
    this.view.position.set(12, top + 8);
    if (narrow !== this.narrow || w !== this.w) {
      this.narrow = narrow;
      this.w = w;
      this.sig = '';
      this.refresh();
    }
  }

  private signature() {
    const d = this.state.data;
    return [d.event, this.ruleOpen, this.folded, this.peek, this.w, d.quests.map((q) => `${q.id}${q.accepted ? 1 : 0}${q.done ? 1 : 0}${q.have}`).join(',')].join('#');
  }

  refresh() {
    const s = this.signature();
    if (s === this.sig) return;
    this.sig = s;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    const d = this.state.data;
    let y = 0;
    const e = currentEvent(d);
    if (e) y = this.chip(e) + 8;
    if (d.quests.length) this.quests(d.quests, y);
  }

  /** The event chip; returns its height. */
  private chip(e: DayEvent) {
    const c = new Container();
    const name = new Text({ text: e.name, style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 0.5 } });
    const hint = new Text({ text: this.ruleOpen ? '▴' : 'ⓘ', style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: e.color } });
    let w = Math.min(this.w, name.width + 84);
    let h = 40;
    let rule: Text | null = null;
    if (this.ruleOpen) {
      w = this.w;
      rule = bodyText(e.rule, 16, CREAM, { wrap: w - 24, align: 'left' });
      h = 46 + rule.height + 4;
    }
    const bg = new Sprite(velvetTexture(w, h, e.color));
    bg.position.set(-4, -3);
    const m = new Sprite(eventMedal(e, 19));
    m.anchor.set(0.5);
    m.position.set(20, 20);
    name.position.set(44, 20 - name.height / 2);
    hint.anchor.set(1, 0.5);
    hint.position.set(w - 12, 20);
    c.addChild(bg, m, name, hint);
    if (rule) {
      rule.position.set(14, 42);
      c.addChild(rule);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new Rectangle(0, 0, w, h);
    c.on('pointertap', (ev) => {
      ev.stopPropagation();
      sfx.click();
      if (this.peek) return this.onPeekTap?.();
      this.ruleOpen = !this.ruleOpen;
      this.refresh();
    });
    focusable(c, { label: `Ereignis heute: ${e.name}. ${this.ruleOpen ? e.rule : 'Regel zeigen'}`, rect: { x: 0, y: 0, w, h }, radius: 10 });
    this.view.addChild(c);
    return h;
  }

  private quests(qs: Quest[], y0: number) {
    const w = this.w;
    const c = new Container();
    c.y = y0;
    const done = qs.filter((q) => q.done).length;
    const folded = this.folded && !this.peek;
    const head = new Text({ text: `AUFTRÄGE  ${done}/${qs.length}`, style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xe0b25a, letterSpacing: 2 } });
    const arrow = new Text({ text: folded ? '▾' : '▴', style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700', fill: 0xe0b25a } });
    const open = qs.filter((q) => !q.accepted && !q.done).length;
    const rows: Container[] = [];
    let y = 34;
    if (!folded) {
      for (const q of qs) {
        const r = new Container();
        r.y = y;
        const icon = new Graphics();
        const col = q.done ? 0x7bd47b : q.accepted ? 0xe0b25a : 0xff6b5f;
        icon.circle(11, 10, 9).fill({ color: col, alpha: 0.95 }).stroke({ color: 0x0a0c1c, width: 1.5 });
        const sign = new Text({ text: q.done ? '✓' : q.accepted ? '…' : '!', style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700', fill: 0x0a0c1c } });
        sign.anchor.set(0.5);
        sign.position.set(11, q.accepted && !q.done ? 7 : 10);
        const text = q.accepted || q.done ? q.text : `${q.giver} wartet auf dich und hat einen Wunsch.`;
        const t = bodyText(text, 15, q.done ? MUTED : CREAM, { wrap: w - 84, align: 'left' });
        t.position.set(28, 0);
        r.addChild(icon, sign, t);
        if (q.accepted && !q.done) {
          const p = new Text({ text: `${q.have}/${q.need}`, style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700', fill: 0xfff1c4 } });
          p.anchor.set(1, 0);
          p.position.set(w - 14, 0);
          r.addChild(p);
        } else if (q.done) {
          const p = new Text({ text: '✓', style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700', fill: 0x7bd47b } });
          p.anchor.set(1, 0);
          p.position.set(w - 14, 0);
          r.addChild(p);
        }
        if (q.done) t.alpha = 0.7;
        rows.push(r);
        y += Math.max(22, t.height) + 8;
      }
    }
    const h = folded ? 32 : y + 2;
    const bg = new Sprite(velvetTexture(w, h));
    bg.position.set(-4, -3);
    head.position.set(14, 16 - head.height / 2);
    arrow.anchor.set(1, 0.5);
    arrow.position.set(w - 12, 16);
    c.addChild(bg, head, arrow, ...rows);
    if (folded && open) {
      const dot = new Graphics().circle(head.x + head.width + 12, 16, 6).fill(0xff6b5f).stroke({ color: 0x0a0c1c, width: 1.2 });
      c.addChild(dot);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new Rectangle(0, 0, w, h);
    c.on('pointertap', (ev) => {
      ev.stopPropagation();
      sfx.click();
      if (this.peek) return this.onPeekTap?.();
      this.folded = !this.folded;
      this.refresh();
    });
    focusable(c, { label: `Aufträge, ${done} von ${qs.length} erledigt${this.folded ? ', zugeklappt' : `: ${qs.map((q) => (q.done ? `erledigt: ${q.text}` : q.accepted ? `${q.text}, ${q.have} von ${q.need}` : `${q.giver} hat einen Wunsch`)).join('. ')}`}`, rect: { x: 0, y: 0, w, h }, radius: 10 });
    this.view.addChild(c);
  }

  destroy() {
    this.off();
    this.view.destroy({ children: true });
  }
}

// ---- The guest's speech bubble ---------------------------------------------------------------------

const HELLO = ['Ach, Sie kommen wie gerufen!', 'Darf ich Sie kurz entführen?', 'Sie sehen nach Glück aus!', 'Psst, ich hätte da eine Bitte.', 'Wie schön, ein bekanntes Gesicht!'];
const THANKS = ['Großartig, vielen Dank!', 'Sie sind ein Schatz!', 'Das vergesse ich Ihnen nie.'];
const BUSY = ['Ich drücke die Daumen!', 'Nur keine Eile.', 'Ich schaue gespannt zu.'];

function pickBy<T>(a: T[], key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return a[h % a.length];
}

/** Cream paper bubble with ink outline; the tail points left to the guest. */
function bubbleTexture(w: number, h: number) {
  return cached(`speech-${w}x${h}`, () =>
    paint(w + 40, h + 16, (c) => {
      c.translate(30, 4);
      const shape = () => {
        rrect(c, 0, 0, w, h, 26);
        c.moveTo(4, h * 0.42);
        c.lineTo(-26, h * 0.5);
        c.lineTo(6, h * 0.62);
      };
      c.save();
      c.translate(3, 6);
      shape();
      c.fillStyle = 'rgba(2,4,12,0.45)';
      c.fill();
      c.restore();
      shape();
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, '#fffaf0');
      g.addColorStop(1, '#ecdcb6');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 3;
      c.stroke();
      // Paper over the seam where the tail joins the bubble.
      c.beginPath();
      c.moveTo(7, h * 0.42 + 2);
      c.lineTo(-20, h * 0.5);
      c.lineTo(8, h * 0.62 - 2);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      rrect(c, 8, 8, w - 16, h - 16, 20);
      c.strokeStyle = 'rgba(184,140,60,0.45)';
      c.lineWidth = 1.2;
      c.stroke();
    }, 2),
  );
}

/** A guest talks to you: their wish, its reward, and "Abgemacht!". Implements the overlay contract. */
export class QuestDialog {
  readonly view = new Container();
  private dim = new Graphics();
  private stage = new Container();
  private guest: Chibi;
  private closing = false;

  constructor(
    private q: Quest,
    private onAccept: () => void,
    private onClose: () => void,
  ) {
    this.view.eventMode = 'static';
    this.view.addChild(this.dim, this.stage);
    this.dim.eventMode = 'static';
    this.dim.on('pointertap', () => this.close());
    const { color, look } = giverLook(q.giver);
    this.guest = new Chibi(color, look);
    this.build();
    void enterMotion(this.stage);
  }

  private W = 560;
  private H = 250;

  private build() {
    const q = this.q;
    const W = this.W;
    const H = this.H;
    const s = this.stage;
    const gx = 70;
    this.guest.view.scale.set(1.6);
    this.guest.view.position.set(gx, H * 0.5 + 100);
    this.guest.faceTowards(0);
    s.addChild(this.guest.view);
    const bx = 150;
    const bw = W - bx;
    const bub = new Sprite(bubbleTexture(bw, H));
    bub.position.set(bx - 30, -4);
    bub.eventMode = 'static';
    s.addChild(bub);
    const name = plaque(q.giver.toUpperCase(), { size: 17 });
    name.position.set(bx + bw / 2, 0);
    s.addChild(name);
    const ink = 0x2a1406;
    const say = q.done ? pickBy(THANKS, q.id) : q.accepted ? pickBy(BUSY, q.id) : pickBy(HELLO, q.id);
    const hello = bodyText(say, 18, 0x7a1d34, { bold: true, wrap: bw - 50 });
    hello.anchor.set(0.5, 0);
    hello.position.set(bx + bw / 2, 30);
    const main = q.done ? `„${q.text}“ – erledigt! Die Belohnung hast du schon bekommen.` : q.accepted ? `„${q.text}“\nStand: ${q.have} von ${q.need}.` : `„${q.text}“`;
    const body = bodyText(main, 20, ink, { wrap: bw - 50 });
    body.anchor.set(0.5, 0);
    body.position.set(bx + bw / 2, 30 + hello.height + 6);
    s.addChild(hello, body);
    // Reward line with the stone.
    const ry = 30 + hello.height + body.height + 22;
    const rw = new Container();
    const st = drawStone(11);
    const rt = bodyText(`Belohnung: ${rewardText(q)}`, 17, 0x4a2a1a, { bold: true });
    rt.position.set(18, -rt.height / 2);
    rw.addChild(st, rt);
    rw.position.set(bx + bw / 2 - (rt.width + 18) / 2 + 8, ry);
    s.addChild(rw);
    const by = Math.max(ry + 44, H - 40);
    if (!q.accepted && !q.done) {
      const ok = button({ label: 'Abgemacht!', width: 170, height: 48, fontSize: 20, display: false, onClick: () => { this.onAccept(); this.close(); } });
      ok.position.set(bx + bw / 2 - 92, by);
      const later = button({ label: 'Später', width: 130, height: 48, color: 0x3a1428, fontSize: 18, display: false, onClick: () => this.close() });
      later.position.set(bx + bw / 2 + 82, by);
      s.addChild(ok, later);
    } else {
      const ok = button({ label: q.done ? 'Gern geschehen' : 'Bis gleich', width: 190, height: 48, fontSize: 20, display: false, onClick: () => this.close() });
      ok.position.set(bx + bw / 2, by);
      s.addChild(ok);
    }
    this.H = Math.max(H, by + 34);
  }

  private close() {
    if (this.closing) return;
    this.onClose();
  }

  resize(w: number, h: number) {
    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x05060f, alpha: 0.35 });
    const sc = Math.min(1.1, (w - 20) / this.W, (h * 0.9) / (this.H + 120));
    this.stage.scale.set(sc);
    this.stage.pivot.set(this.W / 2, this.H / 2);
    this.stage.position.set(w / 2, h * 0.55);
  }

  update(dtMs: number) {
    this.guest.update(dtMs, null);
  }

  destroy() {
    if (this.closing) return;
    this.closing = true;
    this.view.eventMode = 'none';
    const d = this.dim;
    void animate(180, (k) => !d.destroyed && (d.alpha = 1 - k));
    void leaveMotion(this.stage).then(() => !this.view.destroyed && this.view.destroy({ children: true }));
  }
}

