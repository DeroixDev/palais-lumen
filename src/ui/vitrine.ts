// The trophy cabinet: every trophy and medal earned in this save, on lit glass shelves
// behind a brass-framed velvet front.

import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from '../core/fx';
import { animate } from '../core/tween';
import { button } from '../core/ui';
import { MEDAL_LABEL, formatChips, type GameState, type Medal, type Trophy } from '../core/state';
import { MEDAL_COLORS } from '../world/trophies';
import { glowAt, paint, rrect } from '../world/painted/brush';
import { CREAM, MUTED, PANEL_PAD, bodyText, closeKnob, enterMotion, leaveMotion, panelTexture, plaque, plateTexture } from './kit';
import { paintedMedal, paintedTrophy } from './trophyArt';

const shelfCache = new Map<string, ReturnType<typeof paint>>();
/** The inside of the cabinet: dark velvet back, a spotlight per slot, glass shelves with brass rails. */
function cabinetTex(w: number, rows: number, cols: number, rowH: number) {
  const key = `${w}-${rows}-${cols}-${rowH}`;
  let t = shelfCache.get(key);
  if (t) return t;
  const h = rows * rowH + 12;
  t = paint(w, h, (c) => {
    rrect(c, 0, 0, w, h, 14);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a0c1c');
    g.addColorStop(1, '#14060e');
    c.fillStyle = g;
    c.fill();
    c.save();
    rrect(c, 0, 0, w, h, 14);
    c.clip();
    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      for (let k = 0; k < cols; k++) {
        const x = (w / cols) * (k + 0.5);
        // Light cone from a little lamp in the shelf above.
        const cg = c.createLinearGradient(0, y0, 0, y0 + rowH - 34);
        cg.addColorStop(0, 'rgba(255,226,170,0.22)');
        cg.addColorStop(1, 'rgba(255,226,170,0)');
        c.fillStyle = cg;
        c.beginPath();
        c.moveTo(x - 10, y0 + 6);
        c.lineTo(x + 10, y0 + 6);
        c.lineTo(x + (w / cols) * 0.42, y0 + rowH - 34);
        c.lineTo(x - (w / cols) * 0.42, y0 + rowH - 34);
        c.closePath();
        c.fill();
        glowAt(c, x, y0 + rowH - 40, (w / cols) * 0.4, 14, 0xffe2aa, 0.16);
        c.fillStyle = 'rgba(255,240,200,0.8)';
        c.beginPath();
        c.ellipse(x, y0 + 7, 7, 2.5, 0, 0, Math.PI * 2);
        c.fill();
      }
      // Glass shelf with a bright front edge and a brass rail.
      const sy = y0 + rowH - 38;
      c.fillStyle = 'rgba(180,220,230,0.12)';
      c.fillRect(0, sy - 6, w, 8);
      c.fillStyle = 'rgba(230,250,255,0.55)';
      c.fillRect(0, sy + 2, w, 2);
      const bg = c.createLinearGradient(0, sy + 4, 0, sy + 12);
      bg.addColorStop(0, '#fff1c0');
      bg.addColorStop(0.5, '#c99440');
      bg.addColorStop(1, '#6a4410');
      c.fillStyle = bg;
      c.fillRect(0, sy + 4, w, 7);
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fillRect(0, sy + 11, w, 6);
    }
    // Inner shadow.
    c.strokeStyle = 'rgba(6,2,8,0.7)';
    c.lineWidth = 16;
    rrect(c, 0, 2, w, h, 14);
    c.stroke();
    // Glass front: a couple of long reflections.
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,255,255,0.035)';
    c.beginPath();
    c.moveTo(w * 0.1, 0);
    c.lineTo(w * 0.22, 0);
    c.lineTo(w * 0.1, h);
    c.lineTo(-w * 0.02, h);
    c.fill();
    c.beginPath();
    c.moveTo(w * 0.62, 0);
    c.lineTo(w * 0.66, 0);
    c.lineTo(w * 0.54, h);
    c.lineTo(w * 0.5, h);
    c.fill();
    c.restore();
    rrect(c, 0, 0, w, h, 14);
    c.strokeStyle = 'rgba(224,178,90,0.7)';
    c.lineWidth = 2;
    c.stroke();
  }, 2);
  shelfCache.set(key, t);
  return t;
}

export class Vitrine {
  readonly view = new Container();
  private dim = new Graphics();
  private stage = new Container();
  private panel = new Container();
  private trophies: { c: Sprite; phase: number; base: number }[] = [];
  private time = 0;
  private W = 980;
  private H = 700;
  private narrow: boolean | null = null;
  private entered = false;
  private closing = false;

  constructor(
    private state: GameState,
    private onClose: () => void,
  ) {
    this.stage.addChild(this.panel);
    this.view.addChild(this.dim, this.stage);
    this.view.eventMode = 'static';
  }

  private build(n: boolean) {
    this.panel.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.trophies = [];
    const d = this.state.data;
    const cols = n ? 3 : 6;
    const max = n ? 9 : 18;
    const all = d.trophies.slice().reverse();
    const list: Trophy[] = all.slice(0, max);
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const rowH = n ? 178 : 186;
    const W = (this.W = n ? 404 : 980);
    const cabX = n ? 26 : 44;
    const cabY = n ? 196 : 196;
    const cabW = W - cabX * 2;
    const H = (this.H = cabY + rows * rowH + 12 + (n ? 104 : 96));
    const p = this.panel;

    const bgs = new Sprite(panelTexture(W, H, { accent: 0x5a3a10 }));
    bgs.position.set(-PANEL_PAD, -PANEL_PAD);
    p.addChild(bgs);
    const pl = plaque('DEINE VITRINE', { size: n ? 24 : 28, minW: n ? 240 : 320 });
    pl.position.set(W / 2, 4);
    p.addChild(pl);
    const x = closeKnob(() => this.onClose());
    x.position.set(W - 40, 40);
    p.addChild(x);

    // Medal tally.
    const medals: Medal[] = ['bronze', 'silver', 'gold', 'diamond'];
    const step = n ? 88 : 200;
    medals.forEach((m, i) => {
      const cx = W / 2 + (i - 1.5) * step;
      const y = n ? 94 : 96;
      const md = paintedMedal(m);
      md.scale.set(n ? 0.22 : 0.27);
      md.position.set(n ? cx : cx - 46, n ? y - 6 : y + 4);
      if (d.medals[m] === 0) md.alpha = 0.35;
      p.addChild(md);
      if (n) {
        const t = bodyText(`${d.medals[m]}×`, 18, MEDAL_COLORS[m].light, { bold: true });
        t.anchor.set(0.5, 0);
        t.position.set(cx, y + 20);
        p.addChild(t);
      } else {
        const t = bodyText(`${d.medals[m]}× ${MEDAL_LABEL[m]}`, 22, MEDAL_COLORS[m].light, { bold: true });
        t.anchor.set(0, 0.5);
        t.position.set(cx - 18, y + 4);
        p.addChild(t);
      }
    });
    const stats = bodyText(
      n
        ? `${d.stats.rounds} Runden · Rekord ${formatChips(d.stats.biggestWin)} · Tag ${d.evening.number}`
        : `${d.stats.rounds} Runden gespielt  ·  größter Gewinn ${formatChips(d.stats.biggestWin)}  ·  Tag ${d.evening.number}`,
      n ? 16 : 18,
      MUTED,
    );
    stats.anchor.set(0.5, 0);
    stats.position.set(W / 2, n ? 146 : 148);
    if (stats.width > W - 50) stats.scale.set((W - 50) / stats.width);
    p.addChild(stats);

    // The cabinet.
    const cab = new Sprite(cabinetTex(cabW, rows, cols, rowH));
    cab.position.set(cabX, cabY);
    p.addChild(cab);
    if (list.length === 0) {
      const t = bodyText('Noch keine Trophäen.\nHol dir an einem Tag Silber, Gold oder Diamant, oder knack einen Jackpot.', n ? 17 : 21, 0xe6d6b0, { wrap: cabW - 40 });
      t.anchor.set(0.5);
      t.position.set(W / 2, cabY + rowH / 2 - 16);
      p.addChild(t);
    }
    const cw = cabW / cols;
    list.forEach((tr, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = cabX + cw * (col + 0.5);
      const ty = cabY + row * rowH + rowH - 42;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.position.set(tx, ty - 50);
      glow.width = glow.height = n ? 130 : 160;
      glow.tint = MEDAL_COLORS[tr.medal].base;
      glow.alpha = 0.3;
      glow.blendMode = 'add';
      p.addChild(glow);
      const t = paintedTrophy(tr.kind, tr.medal);
      const sc = n ? 0.82 : 0.9;
      t.scale.set(sc);
      t.position.set(tx, ty);
      p.addChild(t);
      this.trophies.push({ c: t, phase: i * 0.7, base: sc });
      // Little brass label under the shelf.
      const lw = Math.min(cw - 12, n ? 116 : 146);
      const plate = new Sprite(plateTexture(Math.round(lw), 34, 'brass'));
      plate.anchor.set(0.5, 0);
      plate.position.set(tx, ty + 14);
      p.addChild(plate);
      const cap = bodyText(tr.title, 14, 0x2a1406, { bold: true, wrap: lw - 26 });
      cap.style.dropShadow = false;
      cap.style.lineHeight = 14;
      cap.anchor.set(0.5, 0.5);
      cap.position.set(tx, ty + 32);
      if (cap.height > 30) cap.scale.set(30 / cap.height);
      if (cap.width > lw - 22) cap.scale.set(Math.min(cap.scale.x, (lw - 22) / (cap.width / cap.scale.x)));
      p.addChild(cap);
    });
    if (all.length > list.length) {
      const more = bodyText(`und ${all.length - list.length} weitere`, 15, MUTED);
      more.anchor.set(1, 0);
      more.position.set(cabX + cabW, cabY + rows * rowH + 16);
      p.addChild(more);
    }

    const close = button({ label: 'SCHLIESSEN', width: n ? 220 : 240, height: 54, color: 0x3a1428, textColor: CREAM, fontSize: 20, onClick: () => this.onClose() });
    close.position.set(W / 2, H - 48);
    p.addChild(close);
  }

  resize(w: number, h: number) {
    const n = w < 720;
    if (n !== this.narrow) {
      this.narrow = n;
      this.build(n);
    }
    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.62 });
    const top = 26;
    const s = Math.min((w * 0.97) / this.W, (h * 0.97 - top) / this.H, 1.1);
    this.stage.scale.set(s);
    this.stage.position.set(w / 2, h / 2 + (top * s) / 2);
    this.panel.position.set(-this.W / 2, -this.H / 2);
    if (!this.entered) {
      this.entered = true;
      void enterMotion(this.stage);
    }
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    // A slow fake 3D turn, so the trophies catch the light.
    for (const t of this.trophies) t.c.scale.x = t.base * (0.75 + 0.25 * Math.cos(this.time * 0.9 + t.phase));
  }

  destroy() {
    if (this.closing) return;
    this.closing = true;
    this.view.eventMode = 'none';
    this.view.interactiveChildren = false;
    const dim = this.dim;
    void animate(180, (k) => !dim.destroyed && (dim.alpha = 1 - k));
    void leaveMotion(this.stage).then(() => !this.view.destroyed && this.view.destroy({ children: true }));
  }
}

