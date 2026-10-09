// End-of-day settlement, staged like a reward moment: the ledger rolls, the quota tube
// fills past its medal marks (rising notes), the medal lands under rotating light rays,
// a trophy rises, the Mondsteine fly in one by one. A tap anywhere (after 0.5 s) jumps
// straight to the end state; nothing is lost by skipping.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_DISPLAY, Particles, announce, banner, glowTexture, reducedMotion, shake } from '../core/fx';
import { animate, ease } from '../core/tween';
import { brass, button } from '../core/ui';
import { MEDAL_LABEL, formatChips, type EveningResult, type Medal } from '../core/state';
import type { Sfx } from '../core/audio';
import { MEDAL_COLORS } from '../world/trophies';
import { fillInk, glowAt, paint, rrect } from '../world/painted/brush';
import { drawStone } from './stone';
import { CREAM, MUTED, PANEL_PAD, bodyText, enterMotion, leaveMotion, panelTexture, plaque } from './kit';
import { paintedMedal, paintedTrophy } from './trophyArt';

const MARKERS: [number, Medal][] = [
  [1, 'bronze'],
  [1.5, 'silver'],
  [2, 'gold'],
  [3, 'diamond'],
];
const MAX_RATIO = 3.2;

let raysTex: Texture | null = null;
/** Soft light rays for the medal stage; tinted per medal, rotated slowly. */
function rays() {
  return (raysTex ??= paint(420, 420, (c) => {
    c.translate(210, 210);
    for (let i = 0; i < 14; i++) {
      c.save();
      c.rotate((i / 14) * Math.PI * 2);
      const g = c.createLinearGradient(0, 0, 0, -205);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-22, -205);
      c.lineTo(22, -205);
      c.closePath();
      c.fill();
      c.restore();
    }
    glowAt(c, 0, 0, 120, 120, 0xffffff, 0.5);
  }, 1));
}

const tubeCache = new Map<string, Texture>();
/** The quota tube: a glass tube in a brass cradle. */
function tubeTex(w: number, h: number) {
  const k = `${w}x${h}`;
  let t = tubeCache.get(k);
  if (t) return t;
  t = paint(w + 16, h + 18, (c) => {
    c.translate(8, 6);
    rrect(c, -6, -6, w + 12, h + 12, (h + 12) / 2);
    fillInk(c, brass(c, 0, -6, w * 0.2, h + 12), 2);
    rrect(c, 0, 0, w, h, h / 2);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0c0610');
    g.addColorStop(1, '#2a1420');
    fillInk(c, g, 1.5);
  }, 2);
  tubeCache.set(k, t);
  return t;
}

export class Recap {
  readonly view = new Container();
  private dim = new Graphics();
  private stage = new Container();
  private panel = new Container();
  private time = 0;
  private spinning: Sprite | null = null;
  private spinBase = 1;
  private medalFloat: Container | null = null;
  private raysSpr: Sprite | null = null;
  private screenW = 1200;
  private n = false;
  private W = 900;
  private H = 820;
  private started = false;
  private startedAt = 0;
  /** Set by a tap: every remaining step finishes at once. */
  private fast = false;
  private done = false;
  private skipHint: Text | null = null;

  constructor(
    private r: EveningResult,
    private sfx: Sfx,
    private particles: Particles,
    private onDone: () => void,
  ) {
    this.stage.addChild(this.panel);
    this.view.addChild(this.dim, this.stage);
    this.view.eventMode = 'static'; // swallow clicks to the room below
    this.view.on('pointertap', () => {
      if (!this.done && this.time - this.startedAt > 0.5) this.skip();
    });
  }

  private skip() {
    if (this.fast) return;
    this.fast = true;
    this.sfx.click();
  }

  /** An animation step that completes at once when skipped. */
  private anim(ms: number, fn: (k: number) => void, ez: (t: number) => number = ease.outCubic): Promise<void> {
    if (this.fast || ms <= 0 || this.view.destroyed) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((res) => {
      let fin = false;
      void animate(ms, (k) => {
        if (fin) return;
        if (this.fast || this.view.destroyed) {
          fin = true;
          if (!this.view.destroyed) fn(1);
          res();
          return;
        }
        fn(ez(k));
        if (k >= 1) {
          fin = true;
          res();
        }
      });
    });
  }

  private pause(ms: number) {
    return this.anim(ms, () => {});
  }

  /** Sound only while the show runs at normal speed (no burst of sounds on skip). */
  private play2(f: () => void) {
    if (!this.fast) f();
  }

  private text(t: string, size: number, color: number, display = false) {
    const x = display
      ? new Text({ text: t, style: { fontFamily: FONT_DISPLAY, fontSize: size, fill: color, letterSpacing: 2, dropShadow: { color: 0x0a0410, alpha: 0.75, blur: 2, distance: 2, angle: Math.PI / 2 } } })
      : bodyText(t, size, color);
    this.panel.addChild(x);
    return x;
  }

  private async play() {
    const r = this.r;
    const p = this.panel;
    const n = this.n;
    const W = this.W;
    const H = this.H;
    const L = n ? 34 : 110;
    const R = W - L;

    const bg = new Sprite(panelTexture(W, H, { accent: 0x6b1a2e }));
    bg.position.set(-PANEL_PAD, -PANEL_PAD);
    p.addChild(bg);
    const pl = plaque(`TAG ${r.evening} · ABRECHNUNG`, { size: n ? 21 : 28, minW: n ? 300 : 420 });
    pl.position.set(W / 2, 4);
    p.addChild(pl);
    this.skipHint = bodyText(n ? 'Tippen zum Überspringen' : 'Klicken zum Überspringen', 15, MUTED);
    this.skipHint.anchor.set(0.5);
    this.skipHint.position.set(W / 2, H - 30);
    this.skipHint.alpha = 0.8;
    p.addChild(this.skipHint);
    await enterMotion(this.stage);

    // Ledger.
    const rows: [string, number, string][] = [
      ['Eingesetzt', r.wagered, ''],
      ['Ausgezahlt', r.won, ''],
      ['Ergebnis des Tages', r.profit, r.profit >= 0 ? '+' : '−'],
    ];
    const y0 = n ? 66 : 74;
    const rh = n ? 40 : 44;
    for (let i = 0; i < rows.length; i++) {
      const [name, value, sign] = rows[i];
      const last = i === 2;
      const y = y0 + i * rh + (last ? 6 : 0);
      const l = this.text(name, last ? (n ? 21 : 24) : n ? 19 : 22, last ? CREAM : 0xd9c6a0);
      l.style.fontWeight = last ? '700' : '500';
      l.anchor.set(0, 0.5);
      l.position.set(L, y);
      const col = last ? (r.profit >= 0 ? COLORS.lamp : 0xff9aa8) : CREAM;
      const v = this.text('0', last ? (n ? 26 : 30) : n ? 21 : 24, col, true);
      v.anchor.set(1, 0.5);
      v.position.set(R, y);
      l.alpha = 0;
      void this.anim(200, (k) => (l.alpha = k));
      let lastTick = 0;
      await this.anim(last ? 800 : 550, (k) => {
        const val = Math.round(Math.abs(value) * k);
        v.text = `${sign}${formatChips(val)}`;
        if (k - lastTick > 0.12 && k < 1) {
          lastTick = k;
          this.play2(() => this.sfx.tick());
        }
      });
      if (last && !this.fast) void this.anim(260, (k) => v.scale.set(1 + Math.sin(k * Math.PI) * 0.12), ease.linear);
    }
    const line = new Graphics();
    const ly = y0 + 2 * rh + (n ? 34 : 40);
    line.rect(L, ly, R - L, 2).fill({ color: COLORS.brass, alpha: 0.55 });
    line.rect(L, ly + 2, R - L, 1).fill({ color: 0x000000, alpha: 0.5 });
    p.addChild(line);

    // Quota tube with medal marks.
    const barX = L + 4;
    const barW = R - L - 8;
    const barH = n ? 26 : 30;
    const barY = ly + (n ? 64 : 70);
    const quotaLabel = this.text(n ? `Ziel: +${formatChips(r.quota)}` : `Ziel für Tag ${r.evening}: +${formatChips(r.quota)} (${formatChips(r.startBalance + r.quota)} auf dem Konto)`, n ? 17 : 19, 0xd9c6a0);
    quotaLabel.anchor.set(0, 1);
    quotaLabel.position.set(barX, barY - 12);
    const tube = new Sprite(tubeTex(barW, barH));
    tube.position.set(barX - 8, barY - 6);
    p.addChild(tube);
    const fill = new Graphics();
    p.addChild(fill);
    const shine = new Graphics().roundRect(barX + 6, barY + 4, barW - 12, barH * 0.28, barH * 0.14).fill({ color: 0xffffff, alpha: 0.16 });
    const markerViews = MARKERS.map(([m, medal], i) => {
      const x = barX + (m / MAX_RATIO) * barW;
      const tick = new Graphics().rect(x - 1.5, barY - 4, 3, barH + 8).fill({ color: MEDAL_COLORS[medal].base, alpha: 0.9 });
      p.addChild(tick);
      const icon = paintedMedal(medal);
      icon.scale.set(n ? 0.13 : 0.15);
      icon.position.set(x, barY + barH + (n ? 22 : 26));
      icon.alpha = 0.4;
      p.addChild(icon);
      const t = this.text(n ? `${Math.round(m * 100)} %` : `${MEDAL_LABEL[medal]} · ${Math.round(m * 100)} %`, n ? 14 : 15, MEDAL_COLORS[medal].light);
      t.anchor.set(0.5, 0);
      t.position.set(x, barY + barH + (n ? 38 : 44));
      t.alpha = 0.45;
      return { m, t, icon, medal, i };
    });
    p.addChild(shine);
    const target = Math.max(0, Math.min(MAX_RATIO, r.ratio));
    let lit = 0;
    const fillCol = r.passed ? COLORS.lamp : 0xd0708a;
    await this.anim(
      Math.max(500, 1500 * (target / MAX_RATIO) + 400),
      (k) => {
        const v = target * k;
        fill.clear();
        if (v > 0) {
          const fw = Math.max(barH - 6, (v / MAX_RATIO) * barW - 6);
          fill.roundRect(barX + 3, barY + 3, fw, barH - 6, (barH - 6) / 2).fill(fillCol);
          fill.roundRect(barX + 3, barY + 3, fw, (barH - 6) * 0.4, (barH - 6) * 0.2).fill({ color: 0xffffff, alpha: 0.28 });
        }
        while (lit < markerViews.length && v >= markerViews[lit].m) {
          const mv = markerViews[lit];
          mv.t.alpha = 1;
          mv.icon.alpha = 1;
          const s0 = mv.icon.scale.x;
          if (!this.fast) void animate(320, (q) => !mv.icon.destroyed && mv.icon.scale.set(s0 * (1 + Math.sin(q * Math.PI) * 0.5)));
          // One step up the scale per mark.
          this.play2(() => this.sfx.lineHit(lit));
          lit++;
        }
      },
      ease.outCubic,
    );
    const pctText = this.text(`${Math.floor(r.ratio * 100)} % vom Ziel`, n ? 18 : 21, CREAM);
    pctText.style.fontWeight = '700';
    pctText.anchor.set(1, 1);
    pctText.position.set(barX + barW, barY - 12);

    // The medal stage.
    await this.pause(220);
    const mx = W / 2;
    const my = barY + (n ? 230 : 240);
    if (r.medal !== 'none') {
      const col = MEDAL_COLORS[r.medal];
      const ray = new Sprite(rays());
      ray.anchor.set(0.5);
      ray.position.set(mx, my);
      ray.tint = col.base;
      ray.blendMode = 'add';
      ray.alpha = 0;
      ray.scale.set(n ? 0.8 : 1);
      p.addChild(ray);
      this.raysSpr = ray;
      void this.anim(600, (k) => (ray.alpha = 0.55 * k));
      const holder = new Container();
      const medal = paintedMedal(r.medal);
      holder.addChild(medal);
      holder.position.set(mx, my);
      p.addChild(holder);
      const endS = n ? 0.62 : 0.78;
      this.play2(() => this.sfx.whoosh());
      await this.anim(520, (k) => {
        holder.alpha = Math.min(1, k * 2);
        holder.rotation = -0.7 * (1 - k);
        holder.scale.set(endS * (2.6 - 1.6 * k));
      }, ease.outBack);
      this.medalFloat = medal;
      this.play2(() => this.sfx.medal());
      const gp = this.panel.toGlobal({ x: mx, y: my });
      this.particles.sparkle(gp.x, gp.y, this.fast ? 16 : 40, col.light, 320);
      // Shake is kept for the very top result only.
      if (r.medal === 'diamond' && !this.fast) void shake(this.stage, 8, 300);
      if (r.medal !== 'bronze' && !this.fast) this.particles.confetti(this.screenW, r.medal === 'silver' ? 70 : 140);
      const mt = this.text(`${MEDAL_LABEL[r.medal].toUpperCase()}-MEDAILLE`, n ? (r.trophy ? 17 : 21) : 26, col.light, true);
      mt.anchor.set(0.5);
      mt.position.set(mx, my + (n ? 80 : 92));
      announce(`${MEDAL_LABEL[r.medal]}-Medaille für Tag ${r.evening}.`);
      if (r.trophy) {
        // Medal slides left, trophy rises on the right.
        const dx = n ? 92 : 170;
        // Keep the medal's title inside the panel.
        const tx = Math.max(mx - dx, L + mt.width / 2);
        await this.anim(420, (k) => {
          holder.x = mx - dx * k;
          mt.x = mx + (tx - mx) * k;
          ray.x = mx - dx * k;
        }, ease.inOutCubic);
        await this.revealTrophy(mx + dx, my + (n ? 50 : 66));
      }
      if (r.seasonWon) {
        const gp2 = this.panel.toGlobal({ x: mx, y: my - 150 });
        if (!this.fast) {
          void banner(this.particles.view, 'SAISON GEWONNEN!', COLORS.lamp, gp2.x, gp2.y, this.screenW * 0.9);
          this.particles.confetti(this.screenW, 220);
          this.sfx.bigWin();
        }
        announce('Saison gewonnen!');
      } else if (r.newFloor) {
        const gp2 = this.panel.toGlobal({ x: mx, y: my - 150 });
        const label = r.newFloor === 5 ? 'BOSS-ETAGE OFFEN' : `ETAGE ${r.newFloor} OFFEN`;
        if (!this.fast) void banner(this.particles.view, label, COLORS.cyan, gp2.x, gp2.y, this.screenW * 0.8);
        const t = this.text(label, n ? 16 : 18, 0x9fe8ff, true);
        t.anchor.set(0.5);
        t.position.set(mx, my - (n ? 118 : 140));
      }
    } else if (r.rescued) {
      // The "Zweite Chance" charm catches a missed day once per season.
      this.play2(() => this.sfx.medal());
      const head = this.text('ZWEITE CHANCE!', n ? 28 : 36, 0xff9ac0, true);
      head.anchor.set(0.5);
      head.position.set(mx, my - 50);
      head.alpha = 0;
      void this.anim(400, (k) => (head.alpha = k));
      const t = bodyText('Ziel verfehlt, aber dein Glücksbringer hat dich gerettet. Die Saison geht weiter. Das klappt nur einmal pro Saison.', n ? 18 : 22, 0xe6d6b0, { wrap: W - 2 * L });
      t.anchor.set(0.5);
      t.position.set(mx, my + 24);
      t.alpha = 0;
      p.addChild(t);
      await this.anim(500, (k) => (t.alpha = k));
      const gp = this.panel.toGlobal({ x: mx, y: my - 50 });
      this.particles.sparkle(gp.x, gp.y, 40, 0xff9ac0, 260);
    } else {
      // Season over: a calm summary of how far this season got.
      this.play2(() => this.sfx.seasonOver());
      const head = this.text(`SAISON ${r.season} IST VORBEI`, n ? 24 : 32, 0xff9aa8, true);
      head.anchor.set(0.5);
      head.position.set(mx, my - 60);
      head.alpha = 0;
      void this.anim(500, (k) => (head.alpha = k));
      const cleared = r.cleared === 1 ? '1 Tag' : `${r.cleared} Tage`;
      const t = bodyText(`Ziel verfehlt. Geschafft: ${cleared}.\nTrophäen, Medaillen und Rekorde bleiben in deiner Vitrine.`, n ? 18 : 22, 0xe6d6b0, { wrap: W - 2 * L });
      t.anchor.set(0.5);
      t.position.set(mx, my + 10);
      t.alpha = 0;
      p.addChild(t);
      await this.anim(500, (k) => (t.alpha = k));
      if (r.newRecord && r.cleared > 0) {
        const gp = this.panel.toGlobal({ x: mx, y: my + 80 });
        if (!this.fast) {
          void banner(this.particles.view, 'NEUER REKORD!', COLORS.lamp, gp.x, gp.y, this.screenW * 0.8);
          this.sfx.medal();
        }
      }
    }

    // Mondsteine earned today, flying in one by one.
    if (r.moonstones > 0) {
      const row = new Container();
      row.position.set(W / 2, H - (n ? 156 : 158));
      p.addChild(row);
      const label = bodyText(`+${r.moonstones} ${r.moonstones === 1 ? 'Mondstein' : 'Mondsteine'}`, n ? 21 : 24, 0xdff6ff, { bold: true });
      label.anchor.set(0, 0.5);
      const cnt = Math.min(r.moonstones, n ? 8 : 12);
      const gap = n ? 24 : 30;
      const total = cnt * gap + 14 + label.width;
      label.position.set(-total / 2 + cnt * gap + 14, 0);
      label.alpha = 0;
      row.addChild(label);
      for (let i = 0; i < cnt; i++) {
        const st = drawStone(n ? 10 : 12);
        st.position.set(-total / 2 + i * gap + 12, -60);
        st.alpha = 0;
        row.addChild(st);
        void this.anim(380, (k) => {
          st.y = -60 * (1 - k);
          st.alpha = Math.min(1, k * 2);
        }, ease.outBack);
        this.play2(() => this.sfx.coin());
        await this.pause(100);
      }
      void this.anim(300, (k) => (label.alpha = k));
    }

    // Reality check, then continue.
    const kept = r.wagered - r.won;
    const note = bodyText(
      kept > 0
        ? `Das Haus hat heute ${formatChips(kept)} Falter behalten. Auf Dauer gewinnt immer das Haus.`
        : `Heute hattest du Glück. Auf Dauer gewinnt trotzdem immer das Haus.`,
      n ? 15 : 17,
      MUTED,
      { wrap: W - 2 * L },
    );
    note.anchor.set(0.5);
    note.position.set(W / 2, H - (n ? 108 : 104));
    p.addChild(note);
    this.skipHint?.destroy();
    this.skipHint = null;
    const nb = button({ label: r.seasonWon || (!r.passed && !r.rescued) ? 'NEUE SAISON' : 'INS FOYER', width: n ? 260 : 300, height: 60, color: COLORS.brass, fontSize: 23, onClick: () => void this.close() });
    nb.position.set(W / 2, H - 48);
    p.addChild(nb);
    this.done = true;
    nb.alpha = 0;
    await this.anim(300, (k) => (nb.alpha = k));
    this.fast = false;
  }

  private async revealTrophy(x: number, y: number) {
    const tr = this.r.trophy!;
    const n = this.n;
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(x, y - 60);
    glow.width = glow.height = n ? 220 : 340;
    glow.tint = MEDAL_COLORS[tr.medal].base;
    glow.blendMode = 'add';
    glow.alpha = 0;
    this.panel.addChild(glow);
    const t = paintedTrophy(tr.kind, tr.medal);
    const sc = n ? 0.95 : 1.3;
    t.scale.set(sc);
    t.position.set(x, y + 120);
    t.alpha = 0;
    this.panel.addChild(t);
    this.spinning = t;
    this.spinBase = sc;
    this.play2(() => this.sfx.whoosh());
    await this.anim(650, (k) => {
      t.y = y + 120 * (1 - k);
      t.alpha = Math.min(1, k * 1.6);
      glow.alpha = 0.7 * k;
    }, ease.outBack);
    this.play2(() => this.sfx.medal());
    const gp = this.panel.toGlobal({ x, y: y - 70 });
    this.particles.sparkle(gp.x, gp.y, this.fast ? 16 : 50, MEDAL_COLORS[tr.medal].light, 260);
    const label = this.text(n ? 'NEU IN DEINER\nVITRINE' : 'NEU IN DEINER VITRINE', n ? 14 : 17, CREAM, true);
    label.style.align = 'center';
    label.style.lineHeight = 18;
    label.anchor.set(0.5, 0);
    label.position.set(x, y + (n ? 14 : 20));
  }

  private async close() {
    if (this.view.destroyed) return;
    this.view.eventMode = 'none';
    const dim = this.dim;
    void animate(180, (k) => !dim.destroyed && (dim.alpha = 1 - k));
    await leaveMotion(this.stage);
    this.onDone();
  }

  resize(w: number, h: number) {
    this.screenW = w;
    if (!this.started) {
      this.n = w < 720;
      this.W = this.n ? 404 : 900;
      this.H = this.n ? 820 : 820;
    }
    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0b0609, alpha: 0.72 });
    const top = 26;
    const s = Math.min((w * 0.97) / this.W, (h * 0.97 - top) / this.H, 1.25);
    this.stage.scale.set(s);
    this.stage.position.set(w / 2, h / 2 + (top * s) / 2);
    this.panel.position.set(-this.W / 2, -this.H / 2);
    if (!this.started) {
      this.started = true;
      this.startedAt = this.time;
      void this.play();
    }
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const calm = reducedMotion();
    // Fake 3D turn of the trophy and a gentle float of the medal.
    if (this.spinning && !this.spinning.destroyed) this.spinning.scale.x = this.spinBase * (calm ? 1 : Math.cos(this.time * 1.6));
    if (this.medalFloat && !this.medalFloat.destroyed && !calm) this.medalFloat.y = Math.sin(this.time * 2) * 4;
    if (this.raysSpr && !this.raysSpr.destroyed && !calm) this.raysSpr.rotation += dtMs / 6000;
    if (this.skipHint && !this.skipHint.destroyed) this.skipHint.alpha = 0.55 + Math.sin(this.time * 3) * 0.25;
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}

