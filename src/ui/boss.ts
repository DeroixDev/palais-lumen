// Stages the Moth Queen's boss day: phase changes (the screen dims, she rises and grows, a
// painted banner names the phase, a sting plays, the HUD bar changes colour), her reactions
// to the player's rounds (recoils from big wins, laughs at losses, in a speech bubble), and
// the rotating closed game of "Letzter Tanz".

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { announce, glowTexture, mothTexture, plaqueTexture, reducedMotion } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { getGame } from '../core/registry';
import { PHASE_NAME, PHASE_TEXT, ROTATE_EVERY, bossClosedGame, enterPhase, isBossDay, phaseFor } from '../core/boss';
import type { GameState, RoundReport } from '../core/state';
import type { RoomScene } from '../world/room';
import { fillInk, paint } from '../world/painted/brush';
import { bodyText } from './kit';
import { leavePhoto } from './photo';

export interface BossHost {
  /** Screen-space layer above rooms and games. */
  layer: Container;
  screen(): { w: number; h: number; top: number };
  room(): RoomScene | null;
  /** 'room', 'game', 'overlay', 'title', 'transition'. */
  mode(): string;
  leaveGame(): void;
  gameBusy(): boolean;
  toast(text: string): void;
}

const LAUGH = [
  'Hihihi! Noch eine Runde, Liebling?',
  'Flatter nur, kleiner Falter!',
  'Das Haus dankt dir!',
  'Ha! Das kitzelt nicht mal.',
  'Meine Krone glänzt schon heller.',
  'Mehr, mehr! Ich liebe dieses Spiel.',
  'Oh, wie schade … für dich!',
];
const OUCH = ['Autsch! Meine Flügel!', 'Unerhört!', 'Das war doch nur Glück!', 'Nein! Mein Mondstaub!', 'Wie kannst du es wagen?'];
const PHASE_COLOR = [0xc9a0ff, 0xc9a0ff, 0xff6ad0, 0xff4a4a];

const gameName = (id: string) => {
  try {
    return getGame(id).name;
  } catch {
    return id;
  }
};

let bubbleTex: { tex: Texture; key: string } | null = null;

export class BossDirector {
  private dim = new Graphics();
  private lastRoom: RoomScene | null = null;
  private lastPhase = -1;
  private lastClosed = '';
  private lastGame = '';
  private laughAt = 0;
  private bubble: Container | null = null;
  private staging = false;

  constructor(
    private state: GameState,
    private host: BossHost,
  ) {
    this.dim.alpha = 0;
    this.dim.eventMode = 'none';
    state.onChange(() => this.check());
    state.onRound((r) => this.round(r));
  }

  /** Called every frame: keeps the queen on a freshly built boss floor in her phase, and the HUD in sync. */
  update() {
    const room = this.host.room();
    const d = this.state.data;
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      if (room?.def.floor === 5) room.bossPhase(isBossDay(d) ? Math.max(1, d.bossPhase) : 1);
    }
    if (this.lastPhase !== d.bossPhase) {
      this.lastPhase = d.bossPhase;
      const ev = document.querySelector('.evening');
      for (let p = 1; p <= 3; p++) ev?.classList.toggle(`boss-p${p}`, isBossDay(d) && d.bossPhase === p);
      this.lastClosed = bossClosedGame(d);
    }
  }

  /** Life went down: the queen may enter her next phase. */
  private check() {
    const d = this.state.data;
    if (!isBossDay(d) || d.evening.quota <= 0 || this.host.mode() === 'title') return;
    if (d.bossPhase <= 0) d.bossPhase = 1; // a save from before the phases
    const p = phaseFor(d);
    if (p > d.bossPhase) {
      enterPhase(d, p);
      void this.stage(p);
    }
  }

  /** Debug: jump the queen into a phase (with the staging). */
  setPhase(p: number) {
    const d = this.state.data;
    if (!isBossDay(d)) return 'Das geht nur am Boss-Tag (Tag 13).';
    enterPhase(d, p);
    this.state.emit();
    void this.stage(p);
    return '';
  }

  private round(r: RoundReport) {
    const d = this.state.data;
    if (!isBossDay(d)) return;
    this.lastGame = r.game;
    const now = performance.now();
    if (r.stake > 0 && r.win >= r.stake * 10) {
      this.host.room()?.bossHit();
      this.say(OUCH[Math.floor(Math.random() * OUCH.length)], true);
      this.laughAt = now;
    } else if (r.stake > 0 && r.win < r.stake && now - this.laughAt > 7000 && Math.random() < 0.45) {
      this.laughAt = now;
      this.host.room()?.bossLaugh();
      sfx.queenLaugh();
      this.say(LAUGH[Math.floor(Math.random() * LAUGH.length)], false);
    }
    // "Letzter Tanz": the closed game moves on every few rounds.
    const closed = bossClosedGame(d);
    if (closed && closed !== this.lastClosed) {
      const was = this.lastClosed;
      this.lastClosed = closed;
      this.host.toast(`Letzter Tanz: ${gameName(closed)} ist jetzt geschlossen${was ? `, ${gameName(was)} wieder offen` : ''}.`);
      if (this.host.mode() === 'game' && this.lastGame === closed) this.escort();
    }
  }

  /** The player sits at a game that just closed: walk them out once the round is done. */
  private escort(tries = 0) {
    if (this.host.mode() !== 'game' || tries > 20) return;
    if (tries === 0) this.host.toast('Die Königin schließt diesen Tisch. Bitte wechsle das Spiel.');
    if (this.host.gameBusy()) {
      setTimeout(() => this.escort(tries + 1), 700);
      return;
    }
    setTimeout(() => this.host.mode() === 'game' && this.host.leaveGame(), 900);
  }

  /** The phase change, staged: dim, rise, banner with the phase name, sting, light again. */
  private async stage(p: number) {
    if (this.staging || p < 2) {
      this.host.room()?.bossPhase(p);
      return;
    }
    this.staging = true;
    leavePhoto();
    const { w, h, top } = this.host.screen();
    const L = this.host.layer;
    const calm = reducedMotion();
    this.dim.clear().rect(0, 0, w, h).fill(0x0b0208);
    L.addChild(this.dim);
    sfx.bossSting(p);
    const room = this.host.room();
    await tween(this.dim, { alpha: 0.6 }, calm ? 150 : 320, ease.outCubic);
    if (room && room.def.floor === 5) room.bossPhase(p);
    // A swarm of dark moths across the screen.
    const moths: Sprite[] = [];
    if (!calm) {
      for (let i = 0; i < 14; i++) {
        const m = new Sprite(mothTexture());
        m.anchor.set(0.5);
        m.tint = PHASE_COLOR[p];
        m.alpha = 0.8;
        const sz = 18 + Math.random() * 22;
        m.width = m.height = sz;
        const y = top + Math.random() * (h - top) * 0.8;
        m.position.set(-40 - Math.random() * 200, y);
        L.addChild(m);
        moths.push(m);
        const vx = w + 300;
        const ph = Math.random() * 6;
        const base = m.scale.x;
        void animate(1500 + Math.random() * 700, (k) => {
          if (m.destroyed) return;
          m.x = -40 + vx * k;
          m.y = y + Math.sin(k * 8 + ph) * 20;
          m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(k * 40 + ph)));
        }).then(() => m.destroy());
      }
    }
    // The banner: phase name and what it changes.
    const { tex, fullW, visW } = plaqueTexture(PHASE_NAME[p].toUpperCase(), PHASE_COLOR[p], { size: 56, sub: PHASE_TEXT[p], subSize: 24 });
    const c = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.tint = PHASE_COLOR[p];
    glow.blendMode = 'add';
    glow.width = fullW * 1.2;
    glow.height = tex.height * 1.4;
    glow.alpha = 0.5;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    c.addChild(glow, s);
    const fit = Math.min(1, (w - 24) / visW);
    // Low on the screen, so the queen rising above stays in view.
    c.position.set(w / 2, Math.max(top + (tex.height * fit) / 2, h * 0.64));
    c.alpha = 0;
    c.scale.set(calm ? fit : fit * 0.6);
    c.rotation = calm ? 0 : -0.05;
    L.addChild(c);
    announce(`${PHASE_NAME[p]}. ${PHASE_TEXT[p]}`);
    await Promise.all([
      tween(c, { alpha: 1 }, 220),
      calm ? Promise.resolve() : tween(c, { rotation: 0 }, 450, ease.outBack),
      calm ? Promise.resolve() : tween(c.scale, { x: fit, y: fit }, 450, ease.outBack),
    ]);
    await wait(1900);
    await Promise.all([tween(c, { alpha: 0 }, 360, ease.inCubic), tween(this.dim, { alpha: 0 }, 500)]);
    c.destroy({ children: true });
    tex.destroy(true);
    this.dim.removeFromParent();
    this.staging = false;
    if (p >= 3) {
      const g = bossClosedGame(this.state.data);
      this.lastClosed = g;
      if (g) this.host.toast(`Letzter Tanz: ${gameName(g)} ist geschlossen. Alle ${ROTATE_EVERY} Runden schließt die Königin ein anderes Spiel.`);
      if (g && this.host.mode() === 'game' && this.lastGame === g) this.escort();
      if (!g) this.host.toast('Letzter Tanz: Jeder Treffer im Duell der Königin bringt jetzt einen Mondstein extra. Die Gewinnchancen bleiben gleich.');
    } else this.host.toast('Die Königin erhebt sich: alle Einsätze sind jetzt doppelt so hoch. Die Gewinnchancen bleiben gleich.');
  }

  /** A painted speech bubble: over the queen on her floor, else in the top-right corner with a small moth. */
  private say(text: string, hurt: boolean) {
    this.bubble?.destroy({ children: true });
    const { w, top } = this.host.screen();
    const room = this.host.room();
    const p = this.host.mode() === 'room' && room?.def.floor === 5 ? room.bossPoint() : null;
    const t = bodyText(text, 19, 0x2a1406, { bold: true, wrap: 230 });
    t.style.dropShadow = false;
    const bw = Math.ceil(t.width + 34);
    const bh = Math.ceil(t.height + 22);
    const b = new Container();
    const bg = new Sprite(this.bubbleTex(bw, bh, hurt));
    bg.position.set(-6, -6);
    t.position.set(17, 11);
    b.addChild(bg, t);
    if (p) {
      b.position.set(Math.min(w - bw - 10, p.x + 40), Math.max(top + 8, p.y - bh - 70));
    } else {
      const m = new Sprite(mothTexture());
      m.anchor.set(0.5);
      m.tint = 0xc9a0ff;
      m.width = m.height = 34;
      m.position.set(bw + 18, bh + 10);
      b.addChild(m);
      b.position.set(w - bw - 50, top + 70);
    }
    b.eventMode = 'none';
    this.host.layer.addChild(b);
    this.bubble = b;
    b.alpha = 0;
    const calm = reducedMotion();
    if (!calm) b.scale.set(0.7);
    void Promise.all([tween(b, { alpha: 1 }, 160), calm ? Promise.resolve() : tween(b.scale, { x: 1, y: 1 }, 260, ease.outBack)])
      .then(() => wait(2200))
      .then(() => (b.destroyed ? undefined : tween(b, { alpha: 0 }, 300)))
      .then(() => {
        if (!b.destroyed) b.destroy({ children: true });
        if (this.bubble === b) this.bubble = null;
      });
  }

  private bubbleTex(w: number, h: number, hurt: boolean) {
    const key = `${w}x${h}-${hurt}`;
    if (bubbleTex?.key === key) return bubbleTex.tex;
    bubbleTex?.tex.destroy(true);
    const tex = paint(w + 12, h + 30, (c) => {
      c.translate(6, 6);
      const r = 16;
      const path = () => {
        c.beginPath();
        c.moveTo(r, 0);
        c.lineTo(w - r, 0);
        c.quadraticCurveTo(w, 0, w, r);
        c.lineTo(w, h - r);
        c.quadraticCurveTo(w, h, w - r, h);
        c.lineTo(w * 0.32, h);
        c.lineTo(w * 0.18, h + 18);
        c.lineTo(w * 0.2, h);
        c.lineTo(r, h);
        c.quadraticCurveTo(0, h, 0, h - r);
        c.lineTo(0, r);
        c.quadraticCurveTo(0, 0, r, 0);
        c.closePath();
      };
      c.save();
      c.translate(2, 4);
      path();
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fill();
      c.restore();
      path();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fff8ea');
      g.addColorStop(1, hurt ? '#ffd6d0' : '#ecd9f4');
      fillInk(c, g, 2.4);
      c.strokeStyle = 'rgba(160,90,220,0.6)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(r, 4);
      c.lineTo(w - r, 4);
      c.stroke();
    }, 2);
    bubbleTex = { tex, key };
    return tex;
  }
}
