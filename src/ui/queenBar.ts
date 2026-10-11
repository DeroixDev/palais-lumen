// Selene's big life bar across the top of the screen: in the duel and under the dome
// at the end of the boss corridor. Her life is the Lumen still missing to today's goal
// (the quota logic, shown as a fight): it drops when the balance rises and grows back when a
// stake is lost. A pale chunk trails a hit; a moon-silver shimmer marks healing.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, glowTexture, reducedMotion } from '../core/fx';
import { PHASE_NAME } from '../core/boss';
import { formatChips, type GameState } from '../core/state';
import { INK, fillInk, gold, paint, rrect } from '../world/painted/brush';
import { crestEmblem } from '../world/painted/propsCrystal';

import { BOSS_CAPS, CURRENCY_PLURAL } from '../core/brand';
const PHASE_FILL = [0x8aa8ff, 0x8aa8ff, 0xffb347, 0xe8483a];
export const BAR_H = 66;

let frameTex: { w: number; tex: Texture } | null = null;

/** Brass frame with a night-blue velvet bed and Selene's crest on the left. */
function frameTexture(w: number) {
  if (frameTex?.w === w) return frameTex.tex;
  frameTex?.tex.destroy(true);
  const h = BAR_H;
  const tex = paint(w, h, (c) => {
    rrect(c, 3, 5, w - 6, h - 8, 14);
    c.fillStyle = 'rgba(6,2,10,0.55)';
    c.fill();
    rrect(c, 2, 2, w - 4, h - 8, 14);
    const g = c.createLinearGradient(0, 2, 0, h - 6);
    g.addColorStop(0, '#1a2458');
    g.addColorStop(1, '#0a0e24');
    fillInk(c, g, 2.4);
    rrect(c, 4, 4, w - 8, h - 12, 12);
    c.strokeStyle = gold(c, 0, 0, w, h);
    c.lineWidth = 2.6;
    c.stroke();
    // Bar bed.
    rrect(c, 66, 30, w - 82, 22, 9);
    c.fillStyle = '#04060f';
    c.fill();
    c.strokeStyle = 'rgba(224,178,90,0.75)';
    c.lineWidth = 1.6;
    c.stroke();
    // Crest.
    c.save();
    c.translate(34, h / 2 - 3);
    crestEmblem(c, 30, '#fff1c4');
    c.restore();
    c.strokeStyle = INK;
  }, 2);
  frameTex = { w, tex };
  return tex;
}

export class QueenBar {
  readonly view = new Container();
  private frame = new Sprite();
  private trail = new Graphics();
  private fill = new Graphics();
  private shine = new Sprite(glowTexture());
  private name: Text;
  private value: Text;
  private w = 600;
  /** Shown and trailing life share (0..1). */
  private shown = -1;
  private trailK = -1;
  private healFlash = 0;
  private hitFlash = 0;

  constructor(private state: GameState) {
    this.name = new Text({ text: BOSS_CAPS, style: { fontFamily: FONT_DISPLAY, fontSize: 17, fill: 0xfff1c4, letterSpacing: 2 } });
    this.value = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: 0xf2e6c9 } });
    this.value.anchor.set(1, 0);
    this.shine.anchor.set(0.5);
    this.shine.blendMode = 'add';
    this.shine.alpha = 0;
    this.view.addChild(this.frame, this.trail, this.fill, this.shine, this.name, this.value);
    this.view.eventMode = 'none';
  }

  /** Life left (Lumen missing) and its share of the day's goal. */
  life() {
    const q = Math.max(1, this.state.data.evening.quota);
    const missing = this.state.goalMissing;
    return { missing, k: Math.max(0, Math.min(1, missing / q)) };
  }

  /** Lays the bar out `width` wide (its height is BAR_H). */
  resize(width: number) {
    this.w = Math.max(260, Math.round(width));
    this.frame.texture = frameTexture(this.w);
    this.name.position.set(66, 7);
    this.value.position.set(this.w - 16, 6);
    this.draw();
  }

  /** Flash: 'hit' (she took damage) or 'heal' (a stake went to her). */
  pulse(kind: 'hit' | 'heal') {
    if (kind === 'hit') this.hitFlash = 1;
    else this.healFlash = 1;
  }

  update(dtMs: number) {
    const { missing, k } = this.life();
    const calm = reducedMotion();
    if (this.shown < 0 || calm) this.shown = k;
    else this.shown += (k - this.shown) * Math.min(1, dtMs / 120);
    // The pale chunk of a hit slides after the bar; healing has none.
    if (this.trailK < 0 || calm || k >= this.trailK) this.trailK = k;
    else this.trailK = Math.max(this.shown, this.trailK - Math.max(0.0004, (this.trailK - this.shown) * 0.05) * (dtMs / 16));
    this.hitFlash = Math.max(0, this.hitFlash - dtMs / 600);
    this.healFlash = Math.max(0, this.healFlash - dtMs / 700);
    const d = this.state.data;
    const phase = Math.max(1, d.bossPhase);
    const txt = missing > 0 ? `${formatChips(missing)} ${CURRENCY_PLURAL}` : 'BESIEGT';
    if (this.value.text !== txt) this.value.text = txt;
    const pn = PHASE_NAME[phase]?.toUpperCase() ?? '';
    const nm = this.w < 420 ? BOSS_CAPS : pn.startsWith(BOSS_CAPS) ? pn : `${BOSS_CAPS} · ${pn}`;
    if (this.name.text !== nm) this.name.text = nm;
    const room = this.w - 16 - this.value.width - 66 - 12;
    this.name.scale.set(Math.min(1, room / Math.max(1, this.name.width / this.name.scale.x)));
    this.draw();
  }

  private draw() {
    const x0 = 68;
    const y0 = 32;
    const bw = this.w - 86;
    const bh = 18;
    const col = PHASE_FILL[Math.max(1, Math.min(3, this.state.data.bossPhase))];
    this.trail.clear();
    if (this.trailK > this.shown + 0.002) this.trail.roundRect(x0, y0, bw * this.trailK, bh, 7).fill({ color: 0xfff1e0, alpha: 0.85 });
    this.fill.clear();
    const fw = bw * Math.max(0, this.shown);
    if (fw > 1) {
      this.fill.roundRect(x0, y0, fw, bh, 7).fill(this.hitFlash > 0.5 ? 0xffffff : col);
      this.fill.roundRect(x0 + 2, y0 + 2, Math.max(0, fw - 4), bh * 0.35, 5).fill({ color: 0xffffff, alpha: 0.25 });
      // Segment notches every 10 %.
      for (let i = 1; i < 10; i++) {
        const nx = x0 + (bw * i) / 10;
        if (nx < x0 + fw - 2) this.fill.rect(nx - 0.75, y0 + 3, 1.5, bh - 6).fill({ color: 0x14060f, alpha: 0.35 });
      }
    }
    this.shine.position.set(x0 + fw, y0 + bh / 2);
    this.shine.width = 120;
    this.shine.height = 60;
    this.shine.tint = this.healFlash > 0 ? 0xbcd0ff : 0xfff1c4;
    this.shine.alpha = Math.max(this.healFlash * 0.8, this.hitFlash * 0.9);
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}
