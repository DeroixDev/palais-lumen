// "Drei Laternen": a moth hides under one of three brass lanterns, the lanterns dance round
// each other, the player picks one. The shuffle is only a show: when the pick is made, chance
// alone decides (1 in 3) whether the moth is under it. The table says so, plainly.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import type { GameContext, GameDefinition, GameInstance } from '../../core/registry';
import { COLORS, FONT_BODY, FONT_DISPLAY, floatText, glowTexture, reducedMotion } from '../../core/fx';
import { animate, ease, wait } from '../../core/tween';
import { button, type Button } from '../../core/ui';
import { focusable, type FocusHandle } from '../../core/focus';
import { formatChips } from '../../core/state';
import { StakeWatch } from '../stakeWatch';
import { SceneShell, type Layout } from '../sceneShell';
import { barSize, layoutBar } from '../barLayout';
import { FLY_RTP, FLY_SELF_RTP, PAY, RTP, flyRound, hitPays, mothUnder } from './rules';
import { OddsWatch, itemMoment, itemRtpText } from '../itemKit';
import { FLAME_Y, LANTERN, boothLayout, boothTexture, drawShellsStation, flameTexture, lanternTexture, mothTexture, type BoothLayout } from './paint';
import { luckStep, luckOn } from '../../core/debugLuck';

const BETS = [10, 20, 50, 100, 200, 500];
const CREAM = 0xfff3dc;
const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');
const LUCK = 'Die Motte entscheidet der Zufall, nicht dein Auge.';

type Tempo = 'slow' | 'mid' | 'fast';
const TEMPO: Record<Tempo, { label: string; moves: number; ms: number }> = {
  slow: { label: 'Gemächlich', moves: 5, ms: 620 },
  mid: { label: 'Flink', moves: 8, ms: 420 },
  fast: { label: 'Wirbelwind', moves: 13, ms: 270 },
};
const TEMPOS: Tempo[] = ['slow', 'mid', 'fast'];

const RULES = [
  'Unter einer der drei Laternen sitzt eine Motte. Die Laternen tanzen umeinander, dann tippst du auf eine.',
  '',
  `Sitzt die Motte darunter, bekommst du das ${String(PAY).replace('.', ',')}-Fache deines Einsatzes zurück (ein halber Falter wird per Zufall auf- oder abgerundet).`,
  '',
  `${LUCK} Motten flattern, wohin sie wollen: Ob sie unter deiner Laterne sitzt, wird erst bei deiner Wahl ausgelost – mit einer Chance von 1 zu 3, egal wie gut du hinsiehst. Das Tempo ändert nur den Tanz, nicht die Chance.`,
  '',
  `Auszahlungsquote ${pct(RTP)}\u00a0% · Hausvorteil ${pct(1 - RTP)}\u00a0%.`,
].join('\n');

interface Lantern {
  root: Container;
  /** Lifts and tilts; the shadow stays on the cloth. */
  body: Container;
  sprite: Sprite;
  flame: Sprite;
  glow: Sprite;
  shadow: Sprite;
  ring: Sprite;
  slot: number;
  lean: number;
  focus: FocusHandle;
}

type Phase = 'idle' | 'shuffle' | 'pick' | 'reveal';

class ShellsGame implements GameInstance {
  view = new Container();
  private shell: SceneShell;
  private L!: BoothLayout;
  private boothTex: Texture | null = null;
  private booth = new Sprite();
  private layer = new Container();
  private table = new Container();
  private trail = new Container();
  private lanterns: Lantern[] = [];
  private moth = new Container();
  private mothSprite = new Sprite(mothTexture());
  private mothGlow = new Sprite(glowTexture());
  private luck!: Text;
  private prompt!: Text;
  private phase: Phase = 'idle';
  private tempo: Tempo = 'mid';
  private betIndex = 0;
  private bets: number[];
  private stake = 0;
  private time = 0;
  private calm = reducedMotion();
  private stakeWatch: StakeWatch;
  private mothFlap = 0;
  private mothIdle = true;
  private odds: OddsWatch;
  /** Leuchtkäfer round: where the firefly sits and the moth is (drawn after the dance). */
  private fly: { fly: number; moth: number } | null = null;
  private firefly = new Container();
  private rtpText!: Text;
  private sceneW = 600;
  private sceneH = 400;

  private minus!: Button;
  private plus!: Button;
  private betText!: Text;
  private tempoBtn!: Button;
  private actionBtn!: Button;

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void this.action();
    } else if (this.phase === 'pick' && /^(Digit|Numpad)[123]$/.test(e.code)) {
      const n = Number(e.code.slice(-1)) - 1;
      const l = this.lanterns.find((x) => x.slot === n);
      if (l) void this.pick(l);
    }
  };

  constructor(private ctx: GameContext) {
    this.bets = ctx.state.stakes(BETS);
    this.stakeWatch = new StakeWatch(ctx.state);
    this.odds = new OddsWatch(ctx.state, 'shells', ['leuchtkaefer']);
    this.shell = new SceneShell({
      title: 'DREI LATERNEN',
      accent: 0x9fe0ff,
      rules: RULES,
      ctrlSize: barSize,
      buildControls: (c, w, h, layout, fs) => this.buildControls(c, w, h, layout, fs),
      layoutScene: (w, h, layout) => this.layoutScene(w, h, layout === 'tall'),
    });
    this.view.addChild(this.shell.board);
    this.shell.scene.addChild(this.layer);
    for (let i = 0; i < 3; i++) this.lanterns.push(this.makeLantern(i));
    this.mothGlow.anchor.set(0.5);
    this.mothGlow.tint = 0xfff1c4;
    this.mothGlow.blendMode = 'add';
    this.mothGlow.alpha = 0.5;
    this.mothSprite.anchor.set(0.5);
    this.moth.addChild(this.mothGlow, this.mothSprite);
    this.buildFirefly();
    window.addEventListener('keydown', this.keyHandler);
    if (import.meta.env.DEV) (window as unknown as { __nfGame?: unknown }).__nfGame = this;
  }

  private makeLantern(i: number): Lantern {
    const root = new Container();
    const body = new Container();
    const shadow = new Sprite(glowTexture());
    shadow.anchor.set(0.5);
    shadow.tint = 0x000000;
    shadow.alpha = 0.55;
    const ring = new Sprite(glowTexture());
    ring.anchor.set(0.5);
    ring.tint = 0xffcf7a;
    ring.blendMode = 'add';
    ring.alpha = 0;
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.tint = 0xffb050;
    glow.blendMode = 'add';
    glow.position.set(0, FLAME_Y);
    glow.width = glow.height = 200;
    glow.alpha = 0.5;
    const sprite = new Sprite(lanternTexture());
    sprite.anchor.set(LANTERN.ax / LANTERN.w, LANTERN.ay / LANTERN.h);
    const flame = new Sprite(flameTexture());
    flame.anchor.set(0.5, 42 / 48);
    flame.position.set(0, -40);
    flame.scale.set(0.9);
    const inner = new Sprite(glowTexture());
    inner.anchor.set(0.5);
    inner.position.set(0, FLAME_Y + 10);
    inner.width = 90;
    inner.height = 120;
    inner.tint = 0xffd890;
    inner.blendMode = 'add';
    inner.alpha = 0.35;
    body.addChild(glow, sprite, inner, flame);
    root.addChild(shadow, ring, body);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.hitArea = { contains: (x: number, y: number) => x > -LANTERN.w / 2 && x < LANTERN.w / 2 && y > -LANTERN.ay && y < 10 };
    const l: Lantern = { root, body, sprite, flame, glow, shadow, ring, slot: i, lean: 0, focus: null as unknown as FocusHandle };
    root.on('pointertap', () => void this.pick(l));
    l.focus = focusable(root, {
      label: () => `Laterne ${l.slot + 1}${this.phase === 'pick' ? ' wählen' : ''}`,
      rect: { x: -LANTERN.w / 2, y: -LANTERN.ay, w: LANTERN.w, h: LANTERN.ay + 8 },
      radius: 18,
      enabled: () => this.phase === 'pick',
    });
    return l;
  }

  private get bet() {
    return this.bets[this.betIndex];
  }

  // ---- Layout ------------------------------------------------------------------------------------------

  private layoutScene(sw: number, sh: number, tall: boolean) {
    this.sceneW = sw;
    this.sceneH = sh;
    this.L = boothLayout(sw, sh, tall);
    const L = this.L;
    this.boothTex?.destroy(true);
    this.boothTex = boothTexture(L, Math.min(2, Math.max(1.25, window.devicePixelRatio || 1)));
    this.booth.texture = this.boothTex;
    this.layer.removeChildren();
    this.table.removeChildren();
    this.layer.addChild(this.booth, this.trail, this.table);
    for (const l of this.lanterns) {
      l.root.scale.set(L.k);
      l.shadow.width = LANTERN.w * 1.2;
      l.shadow.height = 34;
      l.ring.width = LANTERN.w * 1.6;
      l.ring.height = 60;
      if (this.phase !== 'shuffle') {
        const s = L.slots[l.slot];
        l.root.position.set(s.x, s.y);
      }
      this.table.addChild(l.root);
    }
    this.mothSprite.width = this.mothSprite.height = 70 * L.k;
    this.mothGlow.width = this.mothGlow.height = 150 * L.k;
    this.table.addChild(this.moth, this.firefly);
    this.firefly.scale.set(L.k);
    if (this.fly) this.placeFirefly(this.lanterns.find((x) => x.slot === this.fly!.fly)!);
    if (this.mothIdle) this.moth.visible = true;
    const fs = this.shell.fs;
    this.luck?.destroy();
    this.prompt?.destroy();
    this.luck = new Text({ text: this.luckText(), style: { fontFamily: FONT_BODY, fontSize: fs(tall ? 16 : 19), fontWeight: '700', fill: 0xf2e6c9, align: 'center', lineHeight: fs(tall ? 19 : 23), stroke: { color: 0x0a0410, width: 4 } } });
    this.luck.anchor.set(0.5, 0);
    this.luck.position.set(sw / 2, Math.min(sh - this.luck.height - 6, L.apronY));
    if (this.luck.width > sw - 16) this.luck.scale.set((sw - 16) / this.luck.width);
    this.prompt = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: fs(tall ? 22 : 28), fill: 0xffcf7a, stroke: { color: 0x0a0410, width: 6 }, letterSpacing: 1 } });
    this.prompt.anchor.set(0.5);
    this.prompt.position.set(sw / 2, Math.max(70, L.slots[0].y - LANTERN.ay * L.k - 34));
    this.layer.addChild(this.luck, this.prompt);
    this.refreshPrompt();
  }

  private buildControls(c: Container, width: number, height: number, layout: Layout, fs: (px: number) => number) {
    const tall = layout === 'tall';
    const rtp = new Text({
      text: '',
      style: { fontFamily: FONT_BODY, fontSize: fs(tall ? 13 : 15), fontWeight: '600', fill: 0xbfa98a, lineHeight: fs(tall ? 15 : 18) },
    });
    this.rtpText = rtp;
    this.refreshRtp();
    const bar = layoutBar(c, width, height, layout, fs, {
      stepCaption: 'EINSATZ',
      onStep: (d) => this.changeBet(d),
      secCaption: 'TEMPO DES TANZES',
      secondary: (w) => button({ label: '', ariaLabel: (t) => `Tempo: ${t}`, width: w, height: 52, color: 0x203a48, textColor: CREAM, fontSize: fs(19), display: false, onClick: () => this.cycleTempo() }),
      main: (w, h, f) => button({ label: 'MISCHEN', width: w, height: h, color: COLORS.brass, fontSize: f, onClick: () => void this.action() }),
      rtp,
    });
    this.minus = bar.minus;
    this.plus = bar.plus;
    this.betText = bar.text;
    this.tempoBtn = bar.secondary;
    this.actionBtn = bar.main;
    this.changeBet(0);
    this.cycleTempo(0);
  }


  // ---- Controls ----------------------------------------------------------------------------------------

  private changeBet(d: number) {
    if (d !== 0 && this.phase !== 'idle') return;
    this.betIndex = Math.max(0, Math.min(this.bets.length - 1, this.betIndex + d));
    this.betText.text = formatChips(this.bet);
    this.betText.scale.set(Math.min(1, 84 / Math.max(1, this.betText.width / this.betText.scale.x)));
    if (d) this.ctx.sfx.chip();
    this.refreshButtons();
  }

  private cycleTempo(step = 1) {
    if (step && this.phase !== 'idle') return;
    this.tempo = TEMPOS[(TEMPOS.indexOf(this.tempo) + step) % 3];
    this.tempoBtn.setLabel(TEMPO[this.tempo].label);
    if (step) this.ctx.sfx.click();
  }

  private refreshButtons() {
    if (!this.actionBtn) return;
    const idle = this.phase === 'idle';
    this.minus.setEnabled(idle && this.betIndex > 0);
    this.plus.setEnabled(idle && this.betIndex < this.bets.length - 1);
    this.tempoBtn.setEnabled(idle);
    this.actionBtn.setLabel(idle ? `MISCHEN · ${formatChips(this.bet)}` : this.phase === 'pick' ? 'LATERNE WÄHLEN' : '…');
    this.actionBtn.setEnabled(idle);
    for (const l of this.lanterns) l.focus.refresh();
  }

  private refreshPrompt() {
    if (!this.prompt) return;
    this.prompt.text = this.phase === 'pick' ? (this.fly ? 'DER KÄFER MAG ES DUNKEL' : 'WÄHLE EINE LATERNE') : '';
  }

  private luckText() {
    return this.odds.id
      ? `Leuchtkäfer: unter seiner Laterne 1 zu 5, unter jeder anderen 2 zu 5\nzahlt ${String(PAY).replace('.', ',')}× · Auszahlungsquote ${pct(FLY_RTP)}\u00a0% ohne Käfer-Laterne`
      : `${LUCK}\nTrefferchance 1 zu 3 · zahlt ${String(PAY).replace('.', ',')}×`;
  }

  /** The honest line under the controls (and the luck line on the cloth). */
  private refreshRtp() {
    if (this.rtpText) {
      this.rtpText.text = this.odds.id
        ? this.shell.layout === 'tall'
          ? `${itemRtpText(FLY_RTP, 'leuchtkaefer')}\nnur die Käfer-Laterne: ${pct(FLY_SELF_RTP)}\u00a0%`
          : `${itemRtpText(FLY_RTP, 'leuchtkaefer').replace(' · ', '\n')}\nnur die Käfer-Laterne: ${pct(FLY_SELF_RTP)}\u00a0%`
        : `Auszahlungsquote ${pct(RTP)}\u00a0% · Hausvorteil ${pct(1 - RTP)}\u00a0%\nDas Tempo ändert nur den Tanz, nicht die Chance`;
      this.rtpText.style.fill = this.odds.id ? 0xe4ffb0 : 0xbfa98a;
    }
    if (this.luck && !this.luck.destroyed && this.L) {
      this.luck.scale.set(1);
      this.luck.text = this.luckText();
      if (this.luck.width > this.sceneW - 16) this.luck.scale.set((this.sceneW - 16) / this.luck.width);
      this.luck.y = Math.min(this.sceneH - this.luck.height - 6, this.L.apronY);
    }
  }

  // ---- Leuchtkäfer -------------------------------------------------------------------------------------

  /** A painted firefly: green-gold glow, dark wings flicking. */
  private buildFirefly() {
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 230;
    glow.tint = 0xd8ff7a;
    glow.blendMode = 'add';
    glow.alpha = 0.8;
    const core = new Sprite(glowTexture());
    core.anchor.set(0.5);
    core.width = core.height = 70;
    core.y = 8;
    core.tint = 0xf0ffb0;
    core.blendMode = 'add';
    const bug = new Sprite(mothTexture());
    bug.anchor.set(0.5);
    bug.width = bug.height = 38;
    bug.tint = 0x8a7a3a;
    const tail = new Sprite(glowTexture());
    tail.anchor.set(0.5);
    tail.width = tail.height = 40;
    tail.y = 10;
    tail.tint = 0xf4ffc0;
    tail.blendMode = 'add';
    this.firefly.addChild(glow, bug, tail, core);
    this.firefly.visible = false;
    this.firefly.zIndex = 30000;
  }

  private placeFirefly(l: Lantern) {
    this.firefly.position.set(l.root.x + 34 * this.L.k, l.root.y - (LANTERN.ay - 30) * this.L.k);
    this.firefly.visible = true;
    // Its lantern stands in a green-gold pool of light.
    l.ring.tint = 0xd8ff7a;
    l.ring.alpha = 0.7;
  }

  /** After the dance: the firefly drifts in and settles on its lantern. */
  private async landFirefly() {
    const fly = flyRound();
    this.fly = fly;
    const l = this.lanterns.find((x) => x.slot === fly.fly)!;
    const to = { x: l.root.x + 34 * this.L.k, y: l.root.y - (LANTERN.ay - 30) * this.L.k };
    const from = { x: this.L.moon.x, y: this.L.moon.y };
    this.firefly.visible = true;
    this.ctx.sfx.flutter();
    await animate(this.calm ? 200 : 900, (k) => {
      const e = ease.inOutCubic(k);
      this.firefly.position.set(from.x + (to.x - from.x) * e + (this.calm ? 0 : Math.sin(k * 11) * 18 * (1 - k)), from.y + (to.y - from.y) * e);
    });
    this.placeFirefly(l);
    await itemMoment(this.layer, to.x + (fly.fly === 2 ? -150 : 90) * this.L.k, to.y - 40 * this.L.k, 'leuchtkaefer', 'LEUCHTKÄFER', Math.max(0.55, this.L.k * 0.75));
  }

  // ---- Round -------------------------------------------------------------------------------------------

  async action() {
    if (this.shell.rulesOpen) return;
    if (this.phase === 'idle') return this.startRound();
    if (this.phase === 'pick') this.ctx.toast('Tippe auf eine Laterne (oder 1, 2, 3).');
  }

  private async startRound() {
    if (!this.ctx.state.placeBet(this.bet)) {
      this.ctx.toast('Nicht genug Falter für diesen Einsatz.');
      return;
    }
    this.stake = this.bet;
    this.phase = 'shuffle';
    this.refreshButtons();
    this.ctx.sfx.chip();
    // The moth slips under the middle lantern.
    const mid = this.lanterns.find((l) => l.slot === 1)!;
    await this.lift(mid, true);
    this.mothIdle = false;
    await this.flyMoth(this.moth.x, this.moth.y, mid.root.x, mid.root.y - 18 * this.L.k, 600, true);
    this.moth.visible = false;
    await this.lift(mid, false);
    await wait(this.calm ? 100 : 250);
    await this.shuffle();
    if (this.odds.on('leuchtkaefer')) await this.landFirefly();
    this.phase = 'pick';
    this.refreshButtons();
    this.refreshPrompt();
  }

  /** The dance: pairs swap along arcs (one passes in front, one behind), sometimes all three turn. */
  private async shuffle() {
    const T = TEMPO[this.tempo];
    const moves = this.calm ? 3 : T.moves;
    // A few times during the dance a moth shadow flits from lantern to lantern: it moves on its own.
    const flits = new Set<number>();
    while (flits.size < Math.min(3, moves - 1)) flits.add(1 + Math.floor(Math.random() * (moves - 1)));
    let last = -1;
    for (let m = 0; m < moves; m++) {
      const speed = this.calm ? 1.4 : 1 - 0.25 * (m / moves);
      const dur = T.ms * speed;
      if (this.tempo === 'fast' && m % 4 === 3) {
        await this.rotateAll(dur * 1.4, Math.random() < 0.5 ? 1 : -1);
      } else {
        let pair: [number, number];
        do {
          const a = Math.floor(Math.random() * 3);
          pair = [a, (a + 1 + Math.floor(Math.random() * 2)) % 3];
        } while (pair[0] * 3 + pair[1] === last);
        last = pair[0] * 3 + pair[1];
        const a = this.lanterns.find((l) => l.slot === pair[0])!;
        const b = this.lanterns.find((l) => l.slot === pair[1])!;
        if (flits.has(m)) void this.flit();
        await this.swap(a, b, dur);
      }
      this.ctx.sfx.tick();
    }
    for (const l of this.lanterns) l.lean = 0;
  }

  private async swap(a: Lantern, b: Lantern, ms: number) {
    const L = this.L;
    const sa = L.slots[a.slot];
    const sb = L.slots[b.slot];
    const mx = (sa.x + sb.x) / 2;
    const rx = (sb.x - sa.x) / 2;
    const depth = Math.min(46, L.table.ry * 0.55) * (Math.abs(a.slot - b.slot) === 2 ? 1.25 : 1);
    this.ctx.sfx.whoosh();
    await animate(ms, (k) => {
      const t = ease.inOutCubic(k);
      const ang = Math.PI * t;
      // a goes behind (up), b comes in front (down).
      this.place(a, mx - Math.cos(ang) * rx, sa.y - Math.sin(ang) * depth, -Math.sin(ang));
      this.place(b, mx + Math.cos(ang) * rx, sb.y + Math.sin(ang) * depth * 0.7, Math.sin(ang));
      a.lean = (Math.sin(ang) * Math.sign(rx) * 0.5) * (1 - Math.abs(0.5 - k));
      b.lean = -a.lean;
      this.puff(a);
      this.puff(b);
    });
    [a.slot, b.slot] = [b.slot, a.slot];
    this.place(a, sb.x, sb.y, 0);
    this.place(b, sa.x, sa.y, 0);
  }

  /** All three move one place round: two step along in front, the third sweeps round the back. */
  private async rotateAll(ms: number, dir: number) {
    const L = this.L;
    const depth = Math.min(50, L.table.ry * 0.6);
    const moves = this.lanterns.map((l) => {
      const to = (l.slot + dir + 3) % 3;
      return { l, from: L.slots[l.slot], to: L.slots[to], slot: to, back: Math.abs(to - l.slot) === 2 };
    });
    this.ctx.sfx.whoosh();
    await animate(ms, (k) => {
      const t = ease.inOutCubic(k);
      for (const m of moves) {
        const x = m.from.x + (m.to.x - m.from.x) * t;
        const lift = Math.sin(Math.PI * t) * (m.back ? -depth * 1.3 : depth * 0.45);
        this.place(m.l, x, m.from.y + lift, m.back ? -Math.sin(Math.PI * t) : Math.sin(Math.PI * t) * 0.5);
        m.l.lean = -Math.sign(m.to.x - m.from.x) * 0.45 * Math.sin(Math.PI * k);
        this.puff(m.l);
      }
    });
    for (const m of moves) {
      m.l.slot = m.slot;
      this.place(m.l, m.to.x, m.to.y, 0);
    }
  }

  /** Places a lantern; `depth` −1 (behind) … 1 (in front) scales and shades it. */
  private place(l: Lantern, x: number, y: number, depth: number) {
    l.root.position.set(x, y);
    const k = this.L.k * (1 + depth * 0.07);
    l.root.scale.set(k);
    l.sprite.tint = depth < 0 ? 0xffffff - Math.round(-depth * 0x30) * 0x010101 : 0xffffff;
    l.root.zIndex = y;
    this.table.sortableChildren = true;
  }

  private puffClock = 0;
  /** Light trail behind a moving lantern (pooled sprites fading out). */
  private puff(l: Lantern) {
    if (this.calm) return;
    this.puffClock++;
    if (this.puffClock % 3) return;
    const s = this.trail.children.find((c) => c.alpha <= 0.01) as Sprite | undefined ?? (() => {
      const n = new Sprite(glowTexture());
      n.anchor.set(0.5);
      n.tint = 0xffb050;
      n.blendMode = 'add';
      this.trail.addChild(n);
      return n;
    })();
    s.position.set(l.root.x, l.root.y + FLAME_Y * this.L.k);
    s.width = s.height = 70 * this.L.k;
    s.alpha = 0.45;
  }

  /** A little moth shadow darts from one lantern's glass to another's. */
  private async flit() {
    if (this.calm) return;
    const ghost = new Sprite(mothTexture());
    ghost.anchor.set(0.5);
    ghost.tint = 0x2a1a10;
    ghost.alpha = 0;
    ghost.width = ghost.height = 30 * this.L.k;
    this.table.addChild(ghost);
    const from = this.lanterns[Math.floor(Math.random() * 3)];
    const to = this.lanterns.filter((l) => l !== from)[Math.floor(Math.random() * 2)];
    const y = FLAME_Y * this.L.k;
    ghost.zIndex = 10000;
    await animate(300, (k) => {
      if (ghost.destroyed) return;
      ghost.position.set(from.root.x + (to.root.x - from.root.x) * k, from.root.y + y + (to.root.y - from.root.y) * k - Math.sin(k * Math.PI) * 40 * this.L.k);
      ghost.alpha = Math.sin(k * Math.PI) * 0.8;
      ghost.scale.x = (ghost.scale.y || 0.1) * (0.35 + 0.65 * Math.abs(Math.sin(k * 30)));
    });
    ghost.destroy();
  }

  private async lift(l: Lantern, up: boolean, tilt = 0) {
    const h = 96;
    if (up) this.ctx.sfx.rustle();
    await animate(this.calm ? 180 : 360, (k) => {
      const e = up ? ease.outCubic(k) : 1 - ease.inCubic(k);
      l.body.y = -h * e;
      l.body.rotation = tilt * e;
      l.shadow.alpha = 0.55 - 0.3 * e;
      l.shadow.scale.x = (LANTERN.w * 1.2 / 256) * (1 + 0.3 * e);
    });
    if (!up) this.ctx.sfx.thud();
  }

  private async flyMoth(x0: number, y0: number, x1: number, y1: number, ms: number, inward: boolean) {
    this.moth.visible = true;
    this.moth.zIndex = 20000;
    this.ctx.sfx.flutter();
    await animate(this.calm ? ms * 0.5 : ms, (k) => {
      const e = ease.inOutCubic(k);
      this.moth.position.set(x0 + (x1 - x0) * e + Math.sin(k * 9) * 10 * (1 - k), y0 + (y1 - y0) * e - Math.sin(k * Math.PI) * 50 * this.L.k);
      const s = inward ? 1 - 0.35 * e : 0.65 + 0.35 * e;
      this.moth.scale.set(s);
    });
  }

  private async pick(l: Lantern) {
    if (this.phase !== 'pick') return;
    this.phase = 'reveal';
    this.refreshButtons();
    this.refreshPrompt();
    this.ctx.sfx.click();
    for (const x of this.lanterns) x.body.y = 0;
    // The pick is made: now chance decides where the moth is (with the firefly: drawn with it).
    const fly = this.fly;
    // Mod-Menü Gewinnchance: with the firefly the moth is drawn again for its lantern (same odds).
    const flyMoth = (f: number) => {
      let r = flyRound();
      while (r.fly !== f) r = flyRound();
      return r.moth;
    };
    const under = fly
      ? luckOn()
        ? luckStep(() => flyMoth(fly.fly), (m) => m === l.slot)
        : fly.moth
      : luckStep(() => mothUnder(l.slot), (m) => m === l.slot);
    const rtp = fly ? (l.slot === fly.fly ? FLY_SELF_RTP : FLY_RTP) : RTP;
    const won = under === l.slot;
    l.ring.tint = 0xffcf7a;
    l.ring.alpha = 0.9;
    await this.lift(l, true, -0.12);
    const spot = { x: l.root.x, y: l.root.y - 18 * this.L.k };
    const win = won ? hitPays(this.stake) : 0;
    if (won) {
      // The moth flutters up out of the light and circles the lantern.
      this.moth.position.set(spot.x, spot.y);
      this.moth.scale.set(0.6);
      await this.flyMoth(spot.x, spot.y, spot.x, spot.y - 120 * this.L.k, 520, false);
      this.ctx.state.payout(win);
      const g = this.shell.scene.toGlobal({ x: spot.x, y: spot.y - 80 * this.L.k });
      this.ctx.celebrate(PAY, g.x, g.y, { x: g.x, y: g.y, r: 70 * this.L.k * this.shell.s });
      this.ctx.sfx.win();
      const p = this.view.toLocal(g);
      floatText(this.view, p.x, p.y - 30, `+${formatChips(win)}`, COLORS.lamp, Math.round(32 * Math.max(0.8, this.shell.s)));
      this.shell.addHistory(`${l.slot + 1} ✓`, 0xffcf7a);
    } else {
      // Empty: a little dust. Then the right lantern lifts and the moth flies off to the moon.
      this.ctx.sfx.lose();
      await wait(this.calm ? 200 : 450);
      const other = this.lanterns.find((x) => x.slot === under)!;
      await this.lift(other, true, 0.1);
      const os = { x: other.root.x, y: other.root.y - 18 * this.L.k };
      this.moth.position.set(os.x, os.y);
      this.moth.scale.set(0.6);
      await this.flyMoth(os.x, os.y, this.L.moon.x, this.L.moon.y, 900, true);
      this.moth.visible = false;
      this.shell.addHistory(`${l.slot + 1} ✗`, 0x6a4a5a, 0xf2e6c9);
    }
    // One report per round (tags: shells).
    this.ctx.state.report({ game: 'shells', stake: this.stake, win, rtp, tags: ['shells'] });
    await wait(this.calm ? 400 : 900);
    await Promise.all(this.lanterns.filter((x) => x.body.y < -20).map((x) => this.lift(x, false)));
    for (const x of this.lanterns) {
      x.ring.alpha = 0;
      x.ring.tint = 0xffcf7a;
    }
    this.fly = null;
    this.firefly.visible = false;
    // The moth comes back and rests in front of the middle lantern for the next round.
    const home = this.idleSpot();
    if (!won) this.moth.position.set(this.L.moon.x, this.L.moon.y);
    await this.flyMoth(this.moth.x, this.moth.y, home.x, home.y, 700, false);
    this.mothIdle = true;
    this.phase = 'idle';
    this.refreshButtons();
  }

  private idleSpot() {
    const s = this.L.slots[1];
    return { x: s.x + LANTERN.w * this.L.k * 0.62, y: s.y - LANTERN.ay * this.L.k * 0.62 };
  }

  // ---- Frame -------------------------------------------------------------------------------------------

  resize(w: number, h: number) {
    this.shell.resize(w, h);
    if (this.mothIdle) {
      const p = this.idleSpot();
      this.moth.position.set(p.x, p.y);
      this.moth.visible = true;
    }
    this.refreshButtons();
  }

  update(dtMs: number) {
    if (this.stakeWatch.changed(this.busy())) {
      this.bets = this.ctx.state.stakes(BETS);
      this.changeBet(0);
      this.ctx.toast(this.stakeWatch.note);
    }
    if (this.odds.poll()) {
      this.shell.rebuildControls();
      this.refreshRtp();
    }
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    if (!this.L) return;
    if (this.firefly.visible && !this.calm) {
      const f = this.firefly.children[0];
      f.alpha = 0.75 + 0.25 * Math.sin(this.time * 5);
      this.firefly.children[1].scale.x = (38 / 72) * (0.4 + 0.6 * Math.abs(Math.cos(this.time * 20)));
    }
    const t = this.time;
    this.lanterns.forEach((l, i) => {
      const flick = this.calm ? 0 : Math.sin(t * 13 + i * 2) * 0.06 + Math.sin(t * 29 + i) * 0.04;
      l.flame.scale.set(0.9 + flick, 0.9 - flick * 0.6 + (this.calm ? 0 : Math.sin(t * 7 + i) * 0.04));
      // The flame leans against the motion.
      l.flame.rotation += (l.lean - l.flame.rotation) * Math.min(1, dt * 12);
      l.body.rotation = this.phase === 'shuffle' ? l.lean * 0.12 : l.body.rotation;
      l.glow.alpha = 0.45 + flick * 1.5;
      if (l.ring.alpha > 0) l.ring.alpha = 0.6 + 0.3 * Math.sin(t * 6);
      // While waiting for the pick the lanterns breathe a little.
      if (this.phase === 'pick' && !this.calm) l.body.y = -3 - 3 * Math.sin(t * 3 + i * 1.7);
    });
    for (const c of this.trail.children) if (c.alpha > 0) c.alpha = Math.max(0, c.alpha - dt * 1.6);
    // Moth: wings flap, and at rest it hovers by the middle lantern.
    this.mothFlap += dt * (this.mothIdle ? 9 : 22);
    const base = (70 * this.L.k) / 72;
    this.mothSprite.scale.set(base * (0.35 + 0.65 * Math.abs(Math.cos(this.mothFlap))), base);
    if (this.mothIdle && this.phase === 'idle') {
      const p = this.idleSpot();
      this.moth.position.set(p.x + Math.sin(t * 1.3) * 14 * this.L.k, p.y + Math.sin(t * 2.1) * 8 * this.L.k);
    }
  }

  busy() {
    return this.phase !== 'idle';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.shell.destroy();
    this.boothTex?.destroy(true);
    this.view.destroy({ children: true });
  }
}

export const shells: GameDefinition = {
  id: 'shells',
  name: 'Drei Laternen',
  houseEdge: 1 - RTP,
  footprint: { w: 110, h: 72 },
  size: 'table',
  blurb: 'Unter welcher Laterne sitzt die Motte? Reines Glück, 1 zu 3.',
  drawStation: () => drawShellsStation(),
  create: (ctx) => new ShellsGame(ctx),
};
