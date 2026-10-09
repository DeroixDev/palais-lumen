// The trophy cabinet: every trophy and medal earned in this save.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, glowText, glowTexture } from '../core/fx';
import { ease, tween } from '../core/tween';
import { button } from '../core/ui';
import { MEDAL_LABEL, formatChips, type GameState, type Medal } from '../core/state';
import { drawMedal, drawTrophy, MEDAL_COLORS } from '../world/trophies';

const W = 980;
const COLS = 6;
const CELL = 150;

export class Vitrine {
  readonly view = new Container();
  private bg = new Graphics();
  private panel = new Container();
  private trophies: { c: Container; phase: number }[] = [];
  private time = 0;
  private H: number;

  constructor(state: GameState, onClose: () => void) {
    this.view.addChild(this.bg, this.panel);
    this.view.eventMode = 'static';
    const d = state.data;
    const list = d.trophies.slice(-18).reverse();
    const rows = Math.max(1, Math.ceil(list.length / COLS));
    this.H = 300 + rows * (CELL + 40);
    const p = this.panel;

    p.addChild(new Graphics().roundRect(0, 0, W, this.H, 28).fill(0x140a10).stroke({ color: COLORS.brass, width: 4 }));
    const title = glowText('DEINE VITRINE', { fontFamily: FONT_DISPLAY, fontSize: 40, fill: 0xfff6e6, letterSpacing: 3 }, { color: COLORS.lamp, distance: 14, outerStrength: 2 });
    title.position.set(W / 2, 52);
    p.addChild(title);

    // Medal tally.
    const medals: Medal[] = ['bronze', 'silver', 'gold', 'diamond'];
    medals.forEach((m, i) => {
      const x = W / 2 - 300 + i * 200;
      const md = drawMedal(m);
      md.scale.set(0.32);
      md.position.set(x - 30, 128);
      if (d.medals[m] === 0) md.alpha = 0.3;
      p.addChild(md);
      const t = new Text({ text: `${d.medals[m]}× ${MEDAL_LABEL[m]}`, style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: MEDAL_COLORS[m].light } });
      t.anchor.set(0, 0.5);
      t.position.set(x, 128);
      p.addChild(t);
    });
    const stats = new Text({
      text: `${d.stats.rounds} Runden gespielt  ·  größter Gewinn ${formatChips(d.stats.biggestWin)}  ·  Abend ${d.evening.number}`,
      style: { fontFamily: FONT_BODY, fontSize: 19, fill: 0xb69a6a },
    });
    stats.anchor.set(0.5, 0);
    stats.position.set(W / 2, 176);
    p.addChild(stats);

    // Velvet shelves.
    for (let r = 0; r < rows; r++) {
      const y = 230 + r * (CELL + 40);
      p.addChild(new Graphics().roundRect(30, y, W - 60, CELL + 10, 14).fill(0x3a0f20));
      p.addChild(new Graphics().rect(30, y + CELL - 6, W - 60, 10).fill(COLORS.brass));
    }
    if (list.length === 0) {
      const t = new Text({
        text: 'Noch keine Trophäen.\nHol dir an einem Abend Silber, Gold oder Diamant, oder knack einen Jackpot.',
        style: { fontFamily: FONT_BODY, fontSize: 22, fill: 0xd9c6a0, align: 'center' },
      });
      t.anchor.set(0.5);
      t.position.set(W / 2, 230 + CELL / 2);
      p.addChild(t);
    }
    list.forEach((tr, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = 30 + (W - 60) / COLS * (col + 0.5);
      const y = 230 + row * (CELL + 40) + CELL - 6;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(x, y - 60);
      glow.width = glow.height = 170;
      glow.tint = MEDAL_COLORS[tr.medal].base;
      glow.alpha = 0.35;
      glow.blendMode = 'add';
      p.addChild(glow);
      const t = drawTrophy(tr.kind, tr.medal);
      t.position.set(x, y);
      t.scale.set(0.95);
      p.addChild(t);
      this.trophies.push({ c: t, phase: i * 0.7 });
      const cap = new Text({ text: tr.title, style: { fontFamily: FONT_BODY, fontSize: 14, fill: 0xd9c6a0, wordWrap: true, wordWrapWidth: 140, align: 'center' } });
      cap.anchor.set(0.5, 0);
      cap.position.set(x, y + 10);
      p.addChild(cap);
    });

    const close = button({ label: 'SCHLIESSEN', width: 220, height: 56, color: COLORS.brass, fontSize: 22, onClick: onClose });
    close.position.set(W / 2, this.H - 48);
    p.addChild(close);

    p.alpha = 0;
    p.scale.set(0.9);
    void tween(p, { alpha: 1 }, 250);
  }

  resize(w: number, h: number) {
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.88 });
    const s = Math.min((w * 0.95) / W, (h * 0.92) / this.H, 1.1);
    void tween(this.panel.scale, { x: s, y: s }, 250, ease.outBack);
    this.panel.position.set((w - W * s) / 2, (h - this.H * s) / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    for (const t of this.trophies) t.c.scale.x = 0.95 * Math.cos(this.time * 0.9 + t.phase);
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}
