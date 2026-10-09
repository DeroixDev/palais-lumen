// Painted speech bubble: cream paper in an ink outline with a small brass name tag.
// Each line is painted once into a texture; the bubble pops in, floats a little and fades.

import { Container, Sprite, type Texture } from 'pixi.js';
import { FONT_BODY, reducedMotion } from '../core/fx';
import { brass, softBack } from '../core/ui';
import { fillInk, paint, rrect, type Ctx } from '../world/painted/brush';

const PAD_X = 14;
const PAD_Y = 10;
const LINE = 21;
const TAG_H = 20;
const TAIL = 14;

function wrap(c: Ctx, text: string, maxW: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && c.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Where the tail sits: under the bubble (left, middle, right), or on its left side pointing left. */
export type TailAt = 'left' | 'center' | 'right' | 'side';

/** Paints the bubble with its tail; returns the texture and where the tail's tip is. */
export function bubbleTexture(speaker: string, text: string, maxW = 250, tailAt: TailAt = 'center') {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `600 17px ${FONT_BODY}`;
  const lines = wrap(probe, text, maxW);
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  probe.font = `700 12px ${FONT_BODY}`;
  const tagW = probe.measureText(speaker.toUpperCase()).width + 22;
  const w = Math.ceil(Math.max(textW + PAD_X * 2, tagW + 26, 90));
  const h = Math.ceil(lines.length * LINE + PAD_Y * 2 + 6);
  const top = TAG_H / 2;
  const side = tailAt === 'side';
  const ox = side ? TAIL + 4 : 5;
  const W = w + ox + 7;
  const H = top + h + (side ? 0 : TAIL) + 8;
  const tx = tailAt === 'left' ? 30 : tailAt === 'right' ? w - 30 : w / 2;
  const ty = top + Math.min(h / 2, 24);
  const tail = (c: Ctx) => {
    if (side) {
      c.moveTo(1, ty - 9);
      c.quadraticCurveTo(-TAIL * 0.5, ty - 2, -TAIL, ty + 6);
      c.quadraticCurveTo(-TAIL * 0.4, ty + 8, 1, ty + 9);
    } else {
      c.moveTo(tx - 9, top + h - 1);
      c.quadraticCurveTo(tx - 2, top + h + TAIL * 0.5, tx - 6, top + h + TAIL);
      c.quadraticCurveTo(tx + 8, top + h + TAIL * 0.4, tx + 11, top + h - 1);
    }
  };
  const tex = paint(W, H, (c) => {
    c.translate(ox, 2);
    const shape = () => {
      rrect(c, 0, top, w, h, 14);
      tail(c);
    };
    // Soft drop shadow.
    c.save();
    c.translate(2, 4);
    c.beginPath();
    shape();
    c.fillStyle = 'rgba(6,2,8,0.35)';
    c.fill();
    c.restore();
    c.beginPath();
    shape();
    const g = c.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, '#fbf3df');
    g.addColorStop(1, '#ead8b0');
    fillInk(c, g, 2.4);
    // Paint over the seam where the tail meets the bubble.
    c.fillStyle = side ? '#f3e6c8' : '#ead8b0';
    if (side) c.fillRect(-0.5, ty - 7, 3.5, 14);
    else c.fillRect(tx - 7, top + h - 3.5, 17, 4);
    // Rim light along the top and a faint inner gold line.
    c.save();
    rrect(c, 0, top, w, h, 14);
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    rrect(c, 1.5, top + 1.5, w - 3, h, 13);
    c.stroke();
    c.restore();
    rrect(c, 4, top + 4, w - 8, h - 8, 10);
    c.strokeStyle = 'rgba(176,128,52,0.35)';
    c.lineWidth = 1;
    c.stroke();
    // Brass name tag on the top edge.
    rrect(c, 12, 0, tagW, TAG_H, 6);
    fillInk(c, brass(c, 12, 0, 12 + tagW * 0.4, TAG_H * 1.8), 1.8);
    c.font = `700 12px ${FONT_BODY}`;
    c.fillStyle = '#2a1406';
    c.textBaseline = 'middle';
    c.fillText(speaker.toUpperCase(), 23, TAG_H / 2 + 1);
    // The line itself.
    c.font = `600 17px ${FONT_BODY}`;
    c.fillStyle = '#2a1406';
    c.textBaseline = 'alphabetic';
    lines.forEach((l, i) => c.fillText(l, PAD_X, top + PAD_Y + 8 + LINE * (i + 0.72)));
  }, 2.5);
  return side ? { tex, w: W, h: H, tipX: ox - TAIL, tipY: ty + 8 } : { tex, w: W, h: H, tipX: tx + ox - 6, tipY: top + h + TAIL + 2 };
}

/** One bubble that follows a point; `say` replaces whatever it showed. */
export class SpeechBubble {
  readonly view = new Container();
  private sprite: Sprite | null = null;
  private life = 0;
  private age = 0;
  private baseScale = 1;

  constructor() {
    this.view.eventMode = 'none';
    this.view.visible = false;
  }

  get showing() {
    return this.view.visible;
  }

  /** Shows a line for a while (about 3 s plus reading time). */
  say(speaker: string, text: string, tailAt: TailAt = 'center', scale = 1) {
    this.clear();
    const b = bubbleTexture(speaker, text, 250, tailAt);
    const s = new Sprite(b.tex);
    // Anchor on the tip of the tail, so the bubble grows out of the speaker.
    s.anchor.set(b.tipX / b.w, b.tipY / b.h);
    this.sprite = s;
    this.view.addChild(s);
    this.view.visible = true;
    this.baseScale = scale;
    this.life = 3200 + text.length * 45;
    this.age = 0;
    this.view.alpha = 0;
    this.view.scale.set(scale * (reducedMotion() ? 1 : 0.6));
  }

  clear() {
    if (this.sprite) {
      const t: Texture = this.sprite.texture;
      this.sprite.destroy();
      t.destroy(true);
      this.sprite = null;
    }
    this.view.visible = false;
  }

  /** Quick fade (e.g. when a big win starts). */
  hide() {
    if (!this.sprite) return;
    this.life = Math.min(this.life, this.age + 250);
  }

  update(dtMs: number) {
    if (!this.sprite) return;
    this.age += dtMs;
    const a = this.age;
    const s = this.baseScale;
    if (a < 260) {
      const k = a / 260;
      this.view.alpha = Math.min(1, k * 1.6);
      this.view.scale.set(reducedMotion() ? s : s * (0.6 + 0.4 * softBack(k)));
    } else if (a > this.life - 300) {
      this.view.alpha = Math.max(0, (this.life - a) / 300);
      this.view.scale.set(s);
    } else {
      this.view.alpha = 1;
      this.view.scale.set(s);
    }
    if (a >= this.life) this.clear();
  }
}
