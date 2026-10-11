// Shows the quips: a bubble over the bartender (or a guest) in the rooms, and a bubble next to a
// small painted portrait of the dealer at the edge of a game. Lives in screen space, between
// the game layer and the overlays, so the game views themselves stay untouched.

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameState } from '../core/state';
import { BOSS_DAY } from '../core/state';
import { QuipEngine, QuipPicker, SPEAKER_NAME, gameSpeaker, type Situation, type Speaker } from '../core/quips';
import { drawEmblem } from '../core/fx';
import { brass } from '../core/ui';
import { Chibi } from '../world/painted/chibi';
import type { PlayerLook } from '../world/player';
import type { RoomScene } from '../world/room';
import { INK, fillInk, glowAt, paint } from '../world/painted/brush';
import { SpeechBubble } from './bubble';
import { QuipStrip, stripLayout } from './quipStrip';

export interface QuipHost {
  mode(): string;
  room(): RoomScene | null;
  topInset(): number;
  screen(): { width: number; height: number };
  /** A dialog or menu covers the scene. */
  blocked(): boolean;
}

const PORTRAIT: Partial<Record<Speaker, PlayerLook & { color: number }>> = {
  roulette: { color: 0x7bd47b, jacket: 0x1b1b22, hairStyle: 'sidePart', hair: 0x1b1b22, accessory: 'bowTie', skin: 0xd9a27a },
  crash: { color: 0x9fe8ff, jacket: 0x26305a, hairStyle: 'short', hair: 0x6b3a1e, accessory: 'tie', hat: 'fedora', hatColor: 0x3a2a20, skin: 0xe8b48a },
  plinko: { color: 0xff9ac0, jacket: 0x6b1a2e, hairStyle: 'curly', hair: 0xd9b26a, accessory: 'bowTie', hat: 'topHat', hatColor: 0x1b1b22, skin: 0xc68a5e },
};

const R = 30;
let frameTex: Texture | null = null;
let backTex: Texture | null = null;

/** Brass ring of the portrait, and the velvet behind the figure. */
function frameTextures() {
  if (!frameTex || !backTex) {
    const S = R * 2 + 12;
    backTex = paint(S, S, (c) => {
      c.translate(S / 2, S / 2);
      c.beginPath();
      c.arc(2, 4, R + 3, 0, Math.PI * 2);
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fill();
      const g = c.createRadialGradient(-8, -10, 4, 0, 0, R);
      g.addColorStop(0, '#5a1e38');
      g.addColorStop(1, '#1e0a16');
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      glowAt(c, 0, -6, R * 0.8, R * 0.7, 0xffcf7a, 0.25, 'lighter');
    }, 2.5);
    frameTex = paint(S, S, (c) => {
      c.translate(S / 2, S / 2);
      c.beginPath();
      c.arc(0, 0, R + 3, 0, Math.PI * 2);
      c.arc(0, 0, R - 2, 0, Math.PI * 2, true);
      fillInk(c, brass(c, -R, -R, R * 0.6, R * 1.4), 2);
      c.beginPath();
      c.arc(0, 0, R - 2, 0, Math.PI * 2);
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.stroke();
      // Little moth crest at the bottom of the ring.
      drawEmblem(c, 0, R + 1, 16, '#ffd98a', '#3a1a08');
    }, 2.5);
  }
  return { frame: frameTex, back: backTex };
}

/** The machine's voice has no face: a glowing moth in the ring instead. */
let voiceTex: Texture | null = null;
function voiceTexture() {
  if (!voiceTex)
    voiceTex = paint(R * 2, R * 2, (c) => {
      c.translate(R, R);
      glowAt(c, 0, 0, R * 0.9, R * 0.9, 0xff5fa2, 0.5, 'lighter');
      drawEmblem(c, 0, 2, 40, '#ff9ac0', '#3a0a1e', '#fff1c4');
    }, 2.5);
  return voiceTex;
}

class Portrait {
  readonly view = new Container();
  private chibi: Chibi | null = null;

  constructor(speaker: Speaker) {
    const { frame, back } = frameTextures();
    const b = new Sprite(back);
    b.anchor.set(0.5);
    this.view.addChild(b);
    const look = PORTRAIT[speaker];
    if (look) {
      const inner = new Container();
      const mask = new Graphics().circle(0, 0, R - 1).fill(0xffffff);
      const ch = new Chibi(look.color, look);
      ch.view.scale.set(1.15);
      ch.view.position.set(0, 72);
      inner.addChild(ch.view, mask);
      inner.mask = mask;
      this.view.addChild(inner);
      this.chibi = ch;
    } else {
      const v = new Sprite(voiceTexture());
      v.anchor.set(0.5);
      this.view.addChild(v);
    }
    const f = new Sprite(frame);
    f.anchor.set(0.5);
    this.view.addChild(f);
  }

  update(dt: number) {
    this.chibi?.update(dt, null);
  }
}

export class Quips {
  readonly view = new Container();
  /** Photo mode hides the bubbles. */
  hidden = false;
  private engine: QuipEngine;
  private picker = new QuipPicker();
  private roomBubble = new SpeechBubble();
  private gameBubble = new SpeechBubble();
  /** Phones: game quips go into a paper strip over the HUD, off the table. */
  private strip = new QuipStrip();
  private portrait: Portrait | null = null;
  private portraitFor: Speaker | null = null;
  private game: string | null = null;
  private speaker: Container | null = null;
  private lastRoom: RoomScene | null = null;
  private goalShown: boolean;

  constructor(
    state: GameState,
    private host: QuipHost,
  ) {
    this.view.eventMode = 'none';
    this.view.addChild(this.roomBubble.view, this.gameBubble.view);
    this.engine = new QuipEngine((s) => this.deliver(s));
    state.onRound((r) => {
      if (r.stake > 0 && r.win >= r.stake * 20) this.stage();
      this.engine.round(r);
    });
    state.onDayStart(() => this.engine.day());
    // A tap anywhere sends a game bubble away early; so does the day board opening over the game.
    window.addEventListener('pointerdown', () => this.gameBubble.showing && this.gameBubble.hide());
    window.addEventListener('nf-board-peek', () => this.gameBubble.showing && this.gameBubble.hide());
    this.goalShown = state.goalReached;
    state.onChange(() => {
      const reached = state.goalReached;
      if (reached && !this.goalShown && host.mode() !== 'title' && state.data.evening.number < BOSS_DAY) this.engine.goal();
      this.goalShown = reached;
    });
  }

  /** The game that was just opened (null when back in the room). */
  setGame(id: string | null) {
    this.game = id;
    this.gameBubble.clear();
    this.strip.clear();
    this.engine.touch(2500);
  }

  /** A big-win stage (≥ 20×) begins: bubbles make room. */
  stage() {
    this.engine.stage();
    this.roomBubble.hide();
    this.gameBubble.hide();
    this.strip.hide();
  }

  /** Test hook: say something right away. */
  sayNow(s: Situation) {
    return this.deliver(s);
  }

  private deliver(s: Situation): boolean {
    if (this.hidden || this.host.blocked()) return false;
    const mode = this.host.mode();
    if (mode === 'game') {
      const sp = gameSpeaker(this.game);
      if (!sp) return false;
      this.showGame(sp, this.picker.pick(sp, s));
      return true;
    }
    if (mode !== 'room') return false;
    const room = this.host.room();
    if (!room || room.frozen) return false;
    const bartender = room.world.getChildByLabel('bartender', true);
    let who: Speaker = 'bar';
    let target: Container | null = bartender && this.onScreen(room, this.head(bartender, 'bar')) ? bartender : null;
    if (!target) {
      who = 'guest';
      target = this.nearestGuest(room);
    }
    if (!target) return false;
    this.speaker = target;
    this.roomBubble.say(SPEAKER_NAME[who], this.picker.pick(who, s), 'center', Math.max(0.85, Math.min(1.05, room.world.scale.x)));
    this.place(room);
    return true;
  }

  private head(c: Container, who: 'bar' | 'guest') {
    // The bartender's figure is the container's first child; guests are the figure itself.
    const fig = who === 'bar' ? c.children[0] : c;
    return { x: fig.x, y: fig.y - (who === 'bar' ? 102 : 104) };
  }

  private onScreen(room: RoomScene, p: { x: number; y: number }) {
    const s = room.toScreen(p.x, p.y);
    const { width, height } = this.host.screen();
    return s.x > 60 && s.x < width - 60 && s.y > this.host.topInset() + 70 && s.y < height - 20;
  }

  private nearestGuest(room: RoomScene) {
    const pv = room.player.view;
    let best: Container | null = null;
    let bestD = Infinity;
    for (const g of room.world.getChildrenByLabel('guest', true)) {
      const h = this.head(g, 'guest');
      if (!this.onScreen(room, h)) continue;
      const d = Math.hypot(g.x - pv.x, g.y - pv.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  private showGame(sp: Speaker, line: string) {
    if (stripLayout()) {
      this.gameBubble.clear();
      this.strip.say(SPEAKER_NAME[sp], line);
      return;
    }
    if (this.portraitFor !== sp) {
      this.portrait?.view.destroy({ children: true });
      this.portrait = new Portrait(sp);
      this.portraitFor = sp;
      this.view.addChild(this.portrait.view);
    }
    this.gameBubble.say(SPEAKER_NAME[sp], line, 'side', 0.82);
  }

  private place(room: RoomScene) {
    if (!this.speaker || this.speaker.destroyed) return;
    const who = this.speaker.label === 'bartender' ? 'bar' : 'guest';
    const h = this.head(this.speaker, who);
    const s = room.toScreen(h.x, h.y);
    const { width } = this.host.screen();
    // Keep the whole bubble on screen.
    const half = (this.roomBubble.view.width || 200) / 2;
    this.roomBubble.view.position.set(Math.max(half + 8, Math.min(width - half - 8, s.x)), Math.max(this.host.topInset() + 80, s.y));
  }

  update(dtMs: number) {
    this.engine.update(dtMs);
    const mode = this.host.mode();
    const room = this.host.room();
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.roomBubble.clear();
      this.speaker = null;
      this.engine.touch(7000);
    }
    if (mode !== 'room' || this.hidden || this.host.blocked()) this.roomBubble.clear();
    if (mode !== 'game' || this.hidden) {
      this.gameBubble.clear();
      this.strip.clear();
    }
    this.roomBubble.update(dtMs);
    this.gameBubble.update(dtMs);
    if (this.roomBubble.showing && room) this.place(room);
    // The dealer's portrait shows with the bubble, at the top left of the game.
    const p = this.portrait;
    if (p) {
      p.view.visible = this.gameBubble.showing;
      if (p.view.visible) {
        // Tucked right under the HUD, above the frames of the tables (crash's sky panel).
        const top = this.host.topInset();
        const k = 0.85;
        p.view.scale.set(k);
        p.view.position.set(14 + R * k, top + 36);
        p.view.alpha = this.gameBubble.view.alpha;
        p.update(dtMs);
        this.gameBubble.view.position.set(14 + R * 2 * k + 8, top + 40);
      }
    }
  }
}
