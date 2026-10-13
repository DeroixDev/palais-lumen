// "Sternenhimmel": keno under an observatory dome. Pick 1–10 of 40 stars, then 10 shooting
// stars fall. Picked stars that are hit burst into sparks and join a golden constellation.
// The draw is decided before the first star falls (rules.ts); the animation only shows it.
//
// Round report tags: 'keno' (every round), 'keno5' (5 or more hits), 'kenoall' (every picked
// star hit, with at least 3 picks).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion, rewardLevel, sparkTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { winStage } from '../slots/stage';
import { BetStepper, DrawShell, MIN_FONT, fmtMult, infoKnob, rtpText, spaceKey } from '../drawKit';
import { DRAWS, MAX_PICKS, PAYTABLE, POOL, drawStars, kenoMultiplier, quickPick, returnToPlayer, starRtp } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { setItemRtp } from '../../core/modifiers';
import { domeTexture, kenoStation, lineTexture, ringTexture, starTexture, tailTexture } from './paint';
import { seeded } from '../../world/painted/brush';
import { luckDraw } from '../../core/debugLuck';

import { CURRENCY_PLURAL } from '../../core/brand';
const SW = 720;
const SH = 600;
const BETS = [10, 20, 50, 100, 200, 500];
const RULES =
  'Wähle 1 bis 10 der 40 Sterne (antippen oder Schnellwahl) und setze deinen Einsatz. ' +
  'Dann fallen 10 Sternschnuppen auf zufällige Sterne. Jede Sternschnuppe, die einen deiner Sterne trifft, ist ein Treffer.\n\n' +
  'Die Gewinntabelle zeigt für deine Anzahl Sterne, wie viel Treffer bringen (× Einsatz). ' +
  'Mehr Sterne heißt: mehr Treffer nötig, aber höhere Spitzengewinne. Die Auszahlungsquote liegt bei jeder Anzahl zwischen 95 und 97 %.';

interface Star {
  n: number;
  x: number;
  y: number;
  c: Container;
  glow: Sprite;
  ring: Sprite;
  sprite: Sprite;
  text: Text;
  a11y: FocusHandle;
  twinkle: number;
}

/** The winning rows for n picks, best first. */
function payRows(n: number) {
  const rows: { k: number; m: number }[] = [];
  for (let k = n; k >= 0; k--) if (PAYTABLE[n][k] > 0) rows.push({ k, m: PAYTABLE[n][k] });
  return rows;
}

class KenoGame implements GameInstance {
  view: Container;
  private shell: DrawShell;
  private stars: Star[] = [];
  private picks = new Set<number>();
  private lineLayer = new Container();
  private fxLayer = new Container();
  private running = false;
  private calm = reducedMotion();
  private time = 0;
  private bet: BetStepper;
  private header!: Text;
  private quick!: Button;
  private clear!: Button;
  private main!: Button;
  private rtp!: ReturnType<typeof rtpText>;
  /** Odds item: the Sternschnuppe lets an 11th shooting star fall. */
  private odds: OddsWatch;
  private oddsDirty = false;
  private pay = new Container();
  private payRows: { k: number; hi: Graphics; a: Text; b: Text }[] = [];
  private hitStars = new Set<number>();
  private tall = false;
  private unkey: () => void;

  constructor(private ctx: GameContext) {
    this.shell = new DrawShell({ sceneW: SW, sceneH: SH, deckWide: 480, deckTall: 500, velvet: 0x182042, layout: (t, w, h) => this.layout(t, w, h) });
    this.view = this.shell.view;
    this.bet = new BetStepper(ctx, BETS, 300);
    this.odds = new OddsWatch(ctx.state, 'keno', ['sternschnuppe']);
    this.build();
    this.unkey = spaceKey(() => this.play());
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  // ---- Build ----------------------------------------------------------------------------------

  private build() {
    const sc = this.shell.scene;
    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.position.set(SW / 2, SH / 2);
    halo.width = SW * 1.6;
    halo.height = SH * 1.4;
    halo.tint = 0x6a7aff;
    halo.alpha = 0.16;
    halo.blendMode = 'add';
    sc.addChild(halo, new Sprite(domeTexture(SW, SH)));
    const tg = new Sprite(glowTexture());
    tg.anchor.set(0.5);
    tg.position.set(SW / 2, 84);
    tg.width = 420;
    tg.height = 70;
    tg.tint = 0xffcf7a;
    tg.alpha = 0.35;
    tg.blendMode = 'add';
    const title = new Text({ text: 'STERNENHIMMEL', style: { fontFamily: FONT_DISPLAY, fontSize: 34, fill: 0xfff1c4, letterSpacing: 4, stroke: { color: 0x14081e, width: 6 } } });
    title.anchor.set(0.5);
    title.position.set(SW / 2, 84);
    sc.addChild(tg, title, this.lineLayer);

    // 40 stars in a loose 8×5 sky.
    const r = seeded(2207);
    for (let i = 0; i < POOL; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const x = 66 + col * 84 + (r() - 0.5) * 18;
      const y = 152 + row * 94 + (r() - 0.5) * 14;
      this.stars.push(this.makeStar(i + 1, x, y));
    }
    sc.addChild(this.fxLayer);
    const info = infoKnob(() => this.shell.showRules(`${RULES}\n\n${this.rtp.line()}`));
    info.position.set(34, 34);
    sc.addChild(info);

    // Deck.
    const d = this.shell.deck;
    this.header = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 0.5 } });
    this.header.anchor.set(0, 0.5);
    this.quick = button({ label: 'Schnellwahl', width: 176, height: 54, color: 0x3a4a8a, textColor: 0xfff6e6, fontSize: 25, display: false, onClick: () => this.quickPick() });
    this.clear = button({ label: 'Löschen', width: 130, height: 54, color: 0x4a2a3a, textColor: 0xfff6e6, fontSize: 25, display: false, onClick: () => this.setPicks([]) });
    this.main = button({ label: 'STERNSCHNUPPEN', width: 330, height: 72, color: COLORS.lamp, textColor: 0x1a0610, fontSize: 27, onClick: () => this.play() });
    this.rtp = rtpText(returnToPlayer(5), 420);
    this.rtp.text.style.fontSize = MIN_FONT;
    d.addChild(this.header, this.pay, this.quick, this.clear, this.bet.view, this.main, this.rtp.text);
    this.setPicks([]);
  }

  private makeStar(n: number, x: number, y: number): Star {
    const c = new Container();
    c.position.set(x, y);
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 120;
    glow.tint = 0xffcf7a;
    glow.alpha = 0;
    glow.blendMode = 'add';
    const ring = new Sprite(ringTexture());
    ring.anchor.set(0.5);
    ring.width = ring.height = 96;
    ring.visible = false;
    const sprite = new Sprite(starTexture('dim'));
    sprite.anchor.set(0.5);
    sprite.width = sprite.height = 84;
    const text = new Text({ text: String(n), style: { fontFamily: FONT_BODY, fontSize: 26, fontWeight: '800', fill: 0x1a0f24 } });
    text.anchor.set(0.5);
    text.y = 3;
    c.addChild(glow, ring, sprite, text);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = { contains: (px: number, py: number) => px * px + py * py < 42 * 42 };
    c.on('pointertap', () => this.toggle(n));
    this.shell.scene.addChild(c);
    const star: Star = { n, x, y, c, glow, ring, sprite, text, twinkle: Math.random() * 6, a11y: null as unknown as FocusHandle };
    star.a11y = focusable(c, {
      label: () => `Stern ${n}${this.picks.has(n) ? ', gewählt' : ''}`,
      rect: { w: 84, h: 84 },
      radius: 42,
      enabled: () => !this.running,
      activate: () => this.toggle(n),
    });
    return star;
  }

  /** Places the deck controls: a column beside the dome, or a wide band under it. */
  private layout(tall: boolean, w: number, _h: number) {
    this.tall = tall;
    this.deckW = w;
    this.header.position.set(56, 48);
    if (tall) {
      this.quick.position.set(36 + 88, 102);
      this.clear.position.set(36 + 176 + 18 + 65, 102);
      this.pay.position.set(34, 146);
      this.rtp.text.position.set(w / 2, 372);
      this.bet.view.position.set(36, 440);
      this.main.position.set(w - 36 - 165, 440);
    } else {
      this.pay.position.set(30, 76);
      this.quick.position.set(32 + 88, 412);
      this.clear.position.set(w - 32 - 65, 412);
      this.bet.view.position.set((w - 300) / 2, 482);
      this.main.position.set(w / 2, 548);
    }
    this.fitHeader();
    this.buildPayTable();
  }

  private deckW = 460;

  private setHeader(t: string) {
    this.header.text = t;
    this.fitHeader();
  }

  private fitHeader() {
    const max = this.deckW - 110;
    this.header.scale.set(1);
    if (this.header.width > max) this.header.scale.set(max / this.header.width);
  }

  // ---- Picking ------------------------------------------------------------------------------

  private toggle(n: number) {
    if (this.running) return;
    if (this.picks.has(n)) this.picks.delete(n);
    else if (this.picks.size >= MAX_PICKS) {
      this.ctx.toast('Höchstens 10 Sterne – tippe einen gewählten Stern an, um ihn abzugeben.');
      return;
    } else this.picks.add(n);
    this.ctx.sfx.pegTick(this.picks.size);
    this.resetSky();
    const s = this.stars[n - 1];
    if (!this.calm) {
      s.sprite.scale.set(s.sprite.scale.x * 1.25);
      void tween(s.sprite.scale, { x: 84 / 96, y: 84 / 96 }, 260, ease.outBack);
    }
    this.picksChanged();
  }

  private setPicks(list: number[]) {
    if (this.running) return;
    this.picks = new Set(list);
    this.resetSky();
    this.picksChanged();
  }

  private quickPick() {
    if (this.running) return;
    const n = this.picks.size || 5;
    this.setPicks(quickPick(n));
    this.ctx.sfx.shimmer();
    if (!this.calm)
      for (const p of this.picks) {
        const s = this.stars[p - 1];
        s.glow.alpha = 1;
        s.glow.width = s.glow.height = 180;
      }
  }

  private picksChanged() {
    const n = this.picks.size;
    this.setHeader(n ? `${n} von ${MAX_PICKS} Sternen gewählt` : 'Tippe 1 bis 10 Sterne an');
    this.buildPayTable();
    for (const s of this.stars) s.a11y.refresh();
  }

  /** All stars back to their resting look (chosen ones golden). */
  private resetSky() {
    this.hitStars.clear();
    this.lineLayer.removeChildren().forEach((c) => c.destroy());
    for (const s of this.stars) {
      const on = this.picks.has(s.n);
      s.sprite.texture = starTexture(on ? 'pick' : 'dim');
      s.ring.visible = on;
      s.glow.tint = 0xffcf7a;
      s.glow.alpha = on ? 0.45 : 0;
      s.glow.width = s.glow.height = 120;
      s.text.style.fill = 0x1a0f24;
      s.c.alpha = 1;
    }
  }

  // ---- Paytable -----------------------------------------------------------------------------

  private buildPayTable() {
    this.pay.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.payRows = [];
    const n = Math.max(1, this.picks.size);
    const rows = payRows(n);
    const tall = this.tall;
    const W = tall ? SW - 68 : this.deckW - 60;
    const head = new Text({ text: `GEWINNTABELLE · ${n} ${n === 1 ? 'STERN' : 'STERNE'}`, style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '700', fill: 0xd9c6a0, letterSpacing: 1.5 } });
    head.position.set(4, 0);
    this.pay.addChild(head);
    const cols = tall ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const cw = cols === 2 ? (W - 16) / 2 : W;
    const rh = tall ? 40 : 30;
    const top = 36;
    rows.forEach((r, i) => {
      const col = Math.floor(i / perCol);
      const x = col * (cw + 16);
      const y = top + (i % perCol) * rh;
      const bg = new Graphics().roundRect(x, y, cw, rh - 3, 8).fill({ color: 0xffffff, alpha: i % 2 ? 0.04 : 0.08 });
      const hi = new Graphics().roundRect(x, y, cw, rh - 3, 8).fill({ color: 0xffcf7a, alpha: 0.32 }).stroke({ color: 0xffcf7a, width: 2 });
      hi.visible = false;
      const a = new Text({ text: `${r.k} Treffer`, style: { fontFamily: FONT_BODY, fontSize: MIN_FONT, fontWeight: '600', fill: 0xf2e6c9 } });
      a.anchor.set(0, 0.5);
      a.position.set(x + 12, y + (rh - 3) / 2);
      const b = new Text({ text: fmtMult(r.m), style: { fontFamily: FONT_DISPLAY, fontSize: MIN_FONT, fill: r.m >= 20 ? 0xff9ac8 : r.m >= 1 ? 0xffcf7a : 0xc9b48e } });
      b.anchor.set(1, 0.5);
      b.position.set(x + cw - 12, y + (rh - 3) / 2);
      this.pay.addChild(bg, hi, a, b);
      this.payRows.push({ k: r.k, hi, a, b });
    });
    // The payout line belongs to the table: it changes with the number of stars.
    const rtp = returnToPlayer(n);
    setItemRtp('keno', 'sternschnuppe', starRtp(n));
    const line = this.odds?.id ? itemRtpText(starRtp(n), 'sternschnuppe') : undefined;
    const fill = line ? 0xfff3a0 : 0xe6d6b4;
    if (tall) this.rtp.set(rtp, SW - 72, line, fill);
    else {
      this.rtp.set(rtp, W, line, fill);
      this.rtp.text.position.set(this.pay.x + W / 2, this.pay.y + top + rows.length * rh + 22);
    }
  }

  /** Lights the row for the current number of hits. */
  private markRow(hits: number) {
    for (const r of this.payRows) {
      const on = r.k === hits;
      r.hi.visible = on;
      r.a.style.fill = on ? 0xfff6e6 : 0xf2e6c9;
      if (on && !this.calm) {
        r.b.scale.set(1.3 * Math.min(1, r.b.scale.y));
        void tween(r.b.scale, { x: 1, y: 1 }, 300, ease.outBack);
      }
    }
  }

  // ---- Round ----------------------------------------------------------------------------------

  async play() {
    if (this.running) return;
    this.shell.closeRules();
    const n = this.picks.size;
    if (!n) {
      this.ctx.toast('Wähle zuerst 1 bis 10 Sterne – oder nimm die Schnellwahl.');
      if (!this.calm) {
        this.quick.scale.set(1.15);
        void tween(this.quick.scale, { x: 1, y: 1 }, 350, ease.outBack);
      }
      return;
    }
    const stake = this.bet.bet;
    if (!this.ctx.state.placeBet(stake)) {
      this.ctx.toast(`Nicht genug ${CURRENCY_PLURAL} für diesen Einsatz.`);
      return;
    }
    this.running = true;
    this.lockControls(true);
    this.resetSky();
    this.markRow(-1);
    // Decide everything first.
    const extra = this.odds.on('sternschnuppe');
    const picks = new Set(this.picks);
    const draws = luckDraw(
      () => drawStars(Math.random, extra ? DRAWS + 1 : DRAWS),
      (ds) => kenoMultiplier(n, ds.filter((d) => picks.has(d)).length) - 1,
    );
    const hitsTotal = draws.filter((d) => picks.has(d)).length;
    const mult = kenoMultiplier(n, hitsTotal);
    const rtp = extra ? starRtp(n) : returnToPlayer(n);
    let hits = 0;
    let prev: Star | null = null;
    for (let i = 0; i < draws.length; i++) {
      const s = this.stars[draws[i] - 1];
      if (i === DRAWS) {
        // Sternschnuppe: the extra star announces itself before it falls.
        this.setHeader(`Sternschnuppe ${i + 1} / ${draws.length} · ${hits} Treffer`);
        this.ctx.sfx.medal();
        await itemMoment(this.shell.scene, SW / 2, SH * 0.3, 'sternschnuppe', 'STERNSCHNUPPE!', 1);
        await wait(this.calm ? 200 : 500);
        if (this.view.destroyed) return;
      }
      this.setHeader(`Sternschnuppe ${i + 1} / ${draws.length} · ${hits} Treffer`);
      await this.fall(s, i);
      if (this.view.destroyed) return;
      if (picks.has(s.n)) {
        hits++;
        this.hit(s, hits, prev);
        prev = s;
        this.markRow(hits);
      } else this.miss(s);
      this.setHeader(`Sternschnuppe ${i + 1} / ${draws.length} · ${hits} Treffer`);
      await wait(this.calm ? 60 : 110);
      if (this.view.destroyed) return;
    }
    await this.settle(stake, n, hitsTotal, mult, rtp);
  }

  /** One shooting star streaks in from above and lands on `s`. */
  private async fall(s: Star, i: number) {
    this.ctx.sfx.starFall();
    if (this.calm) {
      await wait(160);
      return;
    }
    const side = i % 2 ? 1 : -1;
    const sx = Math.max(-60, Math.min(SW + 60, s.x + side * (180 + Math.random() * 160)));
    const sy = -30 - Math.random() * 40;
    const ang = Math.atan2(s.y - sy, s.x - sx);
    const dist = Math.hypot(s.x - sx, s.y - sy);
    const head = new Sprite(glowTexture());
    head.anchor.set(0.5);
    head.width = head.height = 46;
    head.tint = 0xfff1c4;
    head.blendMode = 'add';
    const tail = new Sprite(tailTexture());
    tail.anchor.set(1, 0.5);
    tail.rotation = ang;
    tail.height = 22;
    tail.blendMode = 'add';
    this.fxLayer.addChild(tail, head);
    const dur = 330 + Math.min(160, dist * 0.25);
    await animate(
      dur,
      (k) => {
        if (head.destroyed) return;
        const x = sx + (s.x - sx) * k;
        const y = sy + (s.y - sy) * k;
        head.position.set(x, y);
        tail.position.set(x, y);
        tail.width = Math.min(260, dist * k) + 4;
        tail.alpha = 0.6 + 0.4 * k;
      },
      ease.inCubic,
    );
    if (!head.destroyed) {
      head.destroy();
      void tween(tail, { alpha: 0, width: 20 }, 220, ease.outCubic).then(() => tail.destroy());
    }
  }

  private hit(s: Star, nth: number, prev: Star | null) {
    this.hitStars.add(s.n);
    this.ctx.sfx.starHit(nth);
    s.sprite.texture = starTexture('hit');
    s.ring.visible = true;
    s.glow.tint = 0xfff1c4;
    s.glow.alpha = 1;
    s.glow.width = s.glow.height = 200;
    void tween(s.glow, { width: 140, height: 140, alpha: 0.8 }, 500, ease.outCubic);
    if (!this.calm) {
      s.c.scale.set(1.5);
      void tween(s.c.scale, { x: 1, y: 1 }, 420, ease.outBack);
      // Sparks fly off the star.
      for (let i = 0; i < 10; i++) {
        const p = new Sprite(sparkTexture());
        p.anchor.set(0.5);
        p.position.set(s.x, s.y);
        p.width = p.height = 16 + Math.random() * 10;
        p.tint = i % 3 ? 0xffe7a8 : 0xffffff;
        p.blendMode = 'add';
        this.fxLayer.addChild(p);
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const d = 50 + Math.random() * 40;
        void tween(p, { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d + 14, alpha: 0 }, 520 + Math.random() * 200, ease.outCubic).then(() => p.destroy());
      }
      const g = this.shell.global(s.x, s.y);
      this.ctx.particles.sparkle(g.x, g.y, 6, 0xffe7a8, 90);
    }
    if (prev) this.link(prev, s);
  }

  /** A golden constellation line from the previous hit to this one. */
  private link(a: Star, b: Star) {
    const l = new Sprite(lineTexture());
    l.anchor.set(0, 0.5);
    l.position.set(a.x, a.y);
    l.rotation = Math.atan2(b.y - a.y, b.x - a.x);
    l.height = 10;
    l.tint = 0xffd890;
    l.blendMode = 'add';
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    this.lineLayer.addChild(l);
    if (this.calm) l.width = len;
    else {
      l.width = 1;
      void tween(l, { width: len }, 260, ease.outCubic);
    }
  }

  private miss(s: Star) {
    this.ctx.sfx.tick();
    s.sprite.texture = starTexture('miss');
    s.glow.tint = 0x7fc8ff;
    s.glow.alpha = 0.55;
    s.glow.width = s.glow.height = 110;
    if (!this.calm) {
      s.c.scale.set(1.2);
      void tween(s.c.scale, { x: 1, y: 1 }, 300, ease.outBack);
    }
  }

  private async settle(stake: number, n: number, hits: number, mult: number, rtp: number) {
    const win = Math.round(stake * mult);
    if (win > 0) this.ctx.state.payout(win);
    const tags = ['keno'];
    if (hits >= 5) tags.push('keno5');
    if (n >= 3 && hits === n) tags.push('kenoall');
    this.ctx.state.report({ game: 'keno', stake, win, rtp, tags });
    this.setHeader(win > 0 ? `${hits} Treffer · Gewinn ${formatChips(win)}` : `${hits} Treffer · leider kein Gewinn`);
    const centre = this.shell.global(SW / 2, SH / 2);
    if (mult > 1) {
      // Every hit star flares once more, the constellation glows.
      for (const s of this.stars) if (this.hitStars.has(s.n)) {
        s.glow.alpha = 1;
        void tween(s.glow, { alpha: 0.7 }, 900);
      }
      this.ctx.celebrate(mult, centre.x, centre.y, { x: centre.x, y: centre.y, r: 220 * this.shell.scale });
      if (rewardLevel(mult) >= 3) {
        await winStage(this.shell.over, {
          x: 20,
          y: 110,
          w: SW - 40,
          h: SH - 140,
          title: rewardLevel(mult) === 4 ? 'STERNSTUNDE' : 'GROSSER GEWINN',
          sub: `${hits} Treffer · ×${fmtMult(mult).replace('×', '')}`,
          amount: win,
          accent: rewardLevel(mult) === 4 ? 0xfff1c4 : COLORS.lamp,
          durationMs: rewardLevel(mult) === 4 ? 2600 : 2100,
          onTick: () => this.ctx.sfx.tick(),
        });
      } else floatText(this.shell.scene, SW / 2, SH / 2, `+${formatChips(win)}`, COLORS.lamp, 44);
    } else if (win > 0) {
      this.ctx.sfx.partial();
      floatText(this.shell.scene, SW / 2, SH / 2, `${formatChips(win)} zurück`, 0xd9c6a0, 36);
    } else this.ctx.sfx.lose();
    if (this.view.destroyed) return;
    this.running = false;
    this.lockControls(false);
  }

  private lockControls(on: boolean) {
    this.bet.lock(on);
    this.quick.setEnabled(!on);
    this.clear.setEnabled(!on);
    this.main.setEnabled(!on);
    for (const s of this.stars) {
      s.c.cursor = on ? 'default' : 'pointer';
      s.a11y.refresh();
    }
  }

  // ---- Instance -----------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
  }

  update(dtMs: number) {
    this.bet.poll(this.running);
    if (this.odds.poll()) this.oddsDirty = true;
    if (this.oddsDirty && !this.running) {
      this.oddsDirty = false;
      this.buildPayTable();
    }
    this.time += dtMs / 1000;
    if (this.calm) return;
    // Resting stars twinkle softly; the quick-pick flare settles.
    for (const s of this.stars) {
      if (s.glow.width > 140 && !this.running) {
        s.glow.width = s.glow.height = Math.max(120, s.glow.width - dtMs * 0.15);
      }
      if (!this.running && !this.picks.has(s.n)) s.sprite.alpha = 0.82 + 0.18 * Math.sin(this.time * 1.7 + s.twinkle);
      else s.sprite.alpha = 1;
      if (s.ring.visible) s.ring.rotation += dtMs * 0.0004;
    }
  }

  busy() {
    return this.running;
  }

  destroy() {
    this.unkey();
    this.view.destroy({ children: true });
  }
}

export const keno: GameDefinition = {
  id: 'keno',
  name: 'Sternenhimmel',
  houseEdge: 1 - returnToPlayer(5),
  footprint: { w: 76, h: 64 },
  size: 'cabinet',
  blurb: 'Wähle Sterne, ruf zehn Sternschnuppen – jeder Treffer leuchtet im Sternbild.',
  drawStation: () => kenoStation(),
  create: (ctx) => new KenoGame(ctx),
};
