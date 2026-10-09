// End-of-evening settlement: animated numbers, quota bar, medal and trophy reveal.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { COLORS, FONT_BODY, FONT_DISPLAY, Particles, countUp, glowTexture } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { button } from '../core/ui';
import { MEDAL_LABEL, formatChips, type EveningResult, type Medal } from '../core/state';
import type { Sfx } from '../core/audio';
import { drawMedal, drawTrophy, MEDAL_COLORS } from '../world/trophies';

const W = 900;
const H = 760;

const MARKERS: [number, Medal][] = [
  [1, 'bronze'],
  [1.5, 'silver'],
  [2, 'gold'],
  [3, 'diamond'],
];

export class Recap {
  readonly view = new Container();
  private bg = new Graphics();
  private panel = new Container();
  private medalHolder = new Container();
  private trophyHolder = new Container();
  private time = 0;
  private spinning: Container | null = null;
  private halo: Sprite;
  private screenW = 1200;

  constructor(
    private r: EveningResult,
    private sfx: Sfx,
    private particles: Particles,
    private onDone: () => void,
  ) {
    this.view.addChild(this.bg, this.panel);
    this.view.eventMode = 'static'; // swallow clicks to the room below
    this.halo = new Sprite(glowTexture());
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.halo.alpha = 0;
    this.panel.addChild(this.halo);
    void this.play();
  }

  private text(t: string, size: number, color: number, display = false) {
    const x = new Text({
      text: t,
      style: { fontFamily: display ? FONT_DISPLAY : FONT_BODY, fontSize: size, fontWeight: display ? '400' : '600', fill: color, letterSpacing: display ? 2 : 0.5 },
    });
    this.panel.addChild(x);
    return x;
  }

  private async play() {
    const r = this.r;
    const p = this.panel;
    p.alpha = 0;
    await tween(p, { alpha: 1 }, 400);

    const title = this.text(`ABEND ${r.evening} · ABRECHNUNG`, 40, 0xfff6e6, true);
    title.anchor.set(0.5);
    title.position.set(W / 2, 40);
    title.filters = [new GlowFilter({ color: COLORS.neon, distance: 16, outerStrength: 2.5, quality: 0.2 })];
    title.y = -20;
    await tween(title, { y: 40 }, 500, ease.outBack);

    // Numbers.
    const rows: [string, number, string][] = [
      ['Eingesetzt', r.wagered, ''],
      ['Ausgezahlt', r.won, ''],
      ['Ergebnis des Abends', r.profit, r.profit >= 0 ? '+' : '−'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const [name, value, sign] = rows[i];
      const y = 110 + i * 46;
      const l = this.text(name, 26, 0xd9c6a0);
      l.position.set(150, y);
      const v = this.text('0', 30, i === 2 ? (r.profit >= 0 ? COLORS.lamp : 0xff8a9a) : 0xfff6e6, true);
      v.anchor.set(1, 0);
      v.position.set(W - 150, y - 2);
      l.alpha = 0;
      void tween(l, { alpha: 1 }, 250);
      await countUp(v, 0, Math.abs(value), 700, sign, () => this.sfx.tick());
    }
    const line = new Graphics().rect(150, 252, W - 300, 2).fill({ color: COLORS.brass, alpha: 0.5 });
    p.addChild(line);

    // Quota bar.
    const barX = 110;
    const barY = 300;
    const barW = W - 220;
    const maxRatio = 3.2;
    const bar = new Graphics();
    bar.roundRect(barX, barY, barW, 30, 15).fill(0x14080f).stroke({ color: COLORS.brass, width: 2 });
    p.addChild(bar);
    const fill = new Graphics();
    p.addChild(fill);
    const quotaLabel = this.text(`Ziel heute: +${formatChips(r.quota)}`, 22, 0xd9c6a0);
    quotaLabel.position.set(barX, barY - 34);
    const markerViews = MARKERS.map(([m, medal]) => {
      const x = barX + (m / maxRatio) * barW;
      const tick = new Graphics().rect(x - 1.5, barY - 4, 3, 38).fill(MEDAL_COLORS[medal].base);
      const t = this.text(MEDAL_LABEL[medal], 18, MEDAL_COLORS[medal].base);
      t.anchor.set(0.5, 0);
      t.position.set(x, barY + 40);
      const pct = this.text(`${Math.round(m * 100)} %`, 15, 0x9a8a7a);
      pct.anchor.set(0.5, 0);
      pct.position.set(x, barY + 62);
      t.alpha = 0.45;
      p.addChild(tick);
      return { m, t, medal };
    });
    const target = Math.max(0, Math.min(maxRatio, r.ratio));
    let lit = 0;
    await animate(
      Math.max(500, 1600 * (target / maxRatio) + 400),
      (k) => {
        const v = target * k;
        fill.clear();
        if (v > 0) fill.roundRect(barX + 3, barY + 3, Math.max(24, (v / maxRatio) * barW - 6), 24, 12).fill(COLORS.lamp);
        while (lit < markerViews.length && v >= markerViews[lit].m) {
          const mv = markerViews[lit];
          mv.t.alpha = 1;
          void tween(mv.t.scale, { x: 1.25, y: 1.25 }, 150).then(() => tween(mv.t.scale, { x: 1, y: 1 }, 200));
          this.sfx.coin();
          lit++;
        }
      },
      ease.outCubic,
    );
    const pctText = this.text(`${Math.round(r.ratio * 100)} % vom Ziel`, 22, 0xfff6e6, true);
    pctText.anchor.set(1, 0);
    pctText.position.set(barX + barW, barY - 36);

    // Medal.
    await wait(250);
    const mx = W / 2;
    const my = 520;
    if (r.medal !== 'none') {
      this.halo.position.set(mx, my);
      this.halo.width = this.halo.height = 520;
      this.halo.tint = MEDAL_COLORS[r.medal].base;
      void tween(this.halo, { alpha: 0.55 }, 600);
      const medal = drawMedal(r.medal);
      this.medalHolder.addChild(medal);
      this.medalHolder.position.set(mx, my);
      this.medalHolder.scale.set(3.5);
      this.medalHolder.alpha = 0;
      this.medalHolder.rotation = -0.8;
      p.addChild(this.medalHolder);
      this.sfx.whoosh();
      await Promise.all([
        tween(this.medalHolder, { alpha: 1, rotation: 0 }, 450, ease.outCubic),
        tween(this.medalHolder.scale, { x: 0.85, y: 0.85 }, 500, ease.outBack),
      ]);
      this.sfx.medal();
      const gp = this.panel.toGlobal({ x: mx, y: my });
      this.particles.sparkle(gp.x, gp.y, 40, MEDAL_COLORS[r.medal].light, 320);
      if (r.medal !== 'bronze') this.particles.confetti(this.screenW, 140);
      const mt = this.text(`${MEDAL_LABEL[r.medal].toUpperCase()}-MEDAILLE`, 26, MEDAL_COLORS[r.medal].light, true);
      mt.anchor.set(0.5);
      mt.position.set(mx, my + 96);
      if (r.trophy) {
        // Medal slides left, trophy rises on the right.
        await tween(this.medalHolder, { x: mx - 170 }, 450, ease.inOutCubic);
        void tween(mt, { x: mx - 170 }, 450, ease.inOutCubic);
        void tween(this.halo, { x: mx - 170 }, 450, ease.inOutCubic);
        await this.revealTrophy(mx + 170, my + 60);
      }
    } else {
      const t = this.text('Ziel heute nicht erreicht.\nKein Spielstand geht verloren, morgen ist ein neuer Abend.', 24, 0xd9c6a0);
      t.style.align = 'center';
      t.anchor.set(0.5);
      t.position.set(mx, my);
      t.alpha = 0;
      await tween(t, { alpha: 1 }, 500);
    }

    // Reality check, then continue.
    const kept = r.wagered - r.won;
    const note = this.text(
      kept > 0
        ? `Das Haus hat heute ${formatChips(kept)} Falter behalten. Auf Dauer gewinnt immer das Haus.`
        : `Heute hattest du Glück. Auf Dauer gewinnt trotzdem immer das Haus.`,
      18,
      0x9a8a7a,
    );
    note.anchor.set(0.5);
    note.position.set(W / 2, H - 104);
    const next = button({ label: 'NÄCHSTER ABEND', width: 300, height: 64, color: COLORS.brass, fontSize: 24, onClick: () => this.close() });
    next.position.set(W / 2, H - 48);
    next.alpha = 0;
    p.addChild(next);
    void tween(next, { alpha: 1 }, 400);
  }

  private async revealTrophy(x: number, y: number) {
    const tr = this.r.trophy!;
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(x, y - 50);
    glow.width = glow.height = 360;
    glow.tint = MEDAL_COLORS[tr.medal].base;
    glow.blendMode = 'add';
    glow.alpha = 0;
    this.panel.addChild(glow);
    this.trophyHolder.position.set(x, y + 160);
    this.trophyHolder.alpha = 0;
    const t = drawTrophy(tr.kind, tr.medal);
    t.scale.set(1.4);
    this.trophyHolder.addChild(t);
    this.panel.addChild(this.trophyHolder);
    this.spinning = t;
    this.sfx.whoosh();
    await Promise.all([tween(this.trophyHolder, { y, alpha: 1 }, 700, ease.outBack), tween(glow, { alpha: 0.7 }, 700)]);
    this.sfx.medal();
    const gp = this.panel.toGlobal({ x, y: y - 70 });
    this.particles.sparkle(gp.x, gp.y, 50, MEDAL_COLORS[tr.medal].light, 260);
    const label = this.text('NEU IN DEINER VITRINE', 20, 0xfff6e6, true);
    label.anchor.set(0.5);
    label.position.set(x, y + 36);
  }

  private async close() {
    await tween(this.view, { alpha: 0 }, 350);
    this.onDone();
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.bg.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.93 });
    const s = Math.min((w * 0.95) / W, (h * 0.95) / H, 1.3);
    this.panel.scale.set(s);
    this.panel.position.set((w - W * s) / 2, (h - H * s) / 2);
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    // Fake 3D turn of the trophy and a gentle float of the medal.
    if (this.spinning) this.spinning.scale.x = 1.4 * Math.cos(this.time * 1.6);
    if (this.medalHolder.children.length) this.medalHolder.children[0].y = Math.sin(this.time * 2) * 4;
    this.halo.rotation += dtMs / 4000;
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}
