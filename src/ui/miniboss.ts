// Stages the mini bosses (src/core/miniboss.ts): the intro when you first stand on the boss's
// floor that day (the screen dims, a portrait and a plaque name the boss and the rule, the boss
// speaks), a small boss plate under the top bar (portrait, name, resistance bar = Falter still
// missing to the goal, and the rule's live status), the rule's moments (the gardener cuts other
// games, the clock runs down, the beat drops), the victory when the goal is reached, and the
// win plaque after the day is settled.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, announce, glowTexture, plaqueTexture, reducedMotion } from '../core/fx';
import { ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { getGame } from '../core/registry';
import { formatChips, type GameState, type RoundReport } from '../core/state';
import { BEAT, CLOCK_ROUNDS, MB_KEYS, MINIBOSSES, VELVET_STAKE, beatIndex, gardenClosed, minibossFor, roundsLeft, roundsToCut, ruleStatus, type MiniBoss } from '../core/miniboss';
import { fillInk, gold, paint, rgb, rrect } from '../world/painted/brush';
import { bossPortrait } from '../world/painted/propsBoss';
import type { RoomScene } from '../world/room';
import { leavePhoto } from './photo';

export interface MinibossHost {
  /** Screen-space layer above rooms and games. */
  layer: Container;
  screen(): { w: number; h: number; top: number };
  room(): RoomScene | null;
  /** 'room', 'game', 'overlay', 'title', 'transition'. */
  mode(): string;
  /** The open game's id, or null. */
  game(): string | null;
  gameBusy(): boolean;
  leaveGame(): void;
  toast(text: string): void;
  modal(title: string, body: string, buttons: { label: string; primary?: boolean; onClick: () => void }[]): void;
  closeModal(): void;
  modalOpen(): boolean;
  endEvening(): void;
}

const gameName = (id: string) => {
  try {
    return getGame(id).name;
  } catch {
    return id;
  }
};
const list = (ids: string[]) => ids.map(gameName).join(', ');
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A few characters of the rule's status for the compact plate. */
function shortStatus(d: Parameters<typeof ruleStatus>[0]) {
  const b = minibossFor(d);
  if (b?.id === 'gaertner') return `✂ ${roundsToCut(d)}`;
  if (b?.id === 'uhrmacher') return `⏱ ${roundsLeft(d)}`;
  if (b?.id === 'falterbeat') return `×${BEAT[beatIndex(d)]}`;
  return `×${VELVET_STAKE}`;
}

/** Breaks a long line into lines of about `n` characters (for plaques on narrow screens). */
function wrap(text: string, n: number) {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > n) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

const PLATE_H = 62;
let plateTex: { key: string; tex: Texture } | null = null;

/** Velvet plate with a brass rim and a bar bed (painted once per width and colour). */
function plateTexture(w: number, color: number) {
  const key = `${w}-${color}`;
  if (plateTex?.key === key) return plateTex.tex;
  plateTex?.tex.destroy(true);
  const h = PLATE_H;
  const tex = paint(w + 8, h + 8, (c) => {
    c.translate(4, 4);
    rrect(c, 2, 4, w - 2, h - 2, 14);
    c.fillStyle = 'rgba(6,2,10,0.5)';
    c.fill();
    rrect(c, 0, 0, w, h - 2, 14);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2e1024');
    g.addColorStop(1, '#14060f');
    fillInk(c, g, 2.2);
    rrect(c, 2.5, 2.5, w - 5, h - 7, 12);
    c.strokeStyle = gold(c, 0, 0, w, h);
    c.lineWidth = 2.2;
    c.stroke();
    // Accent stripe along the top.
    c.fillStyle = rgb(color, 0.5);
    c.fillRect(50, 5, w - 64, 2);
    // Bar bed.
    rrect(c, 52, 27, w - 64, 10, 5);
    c.fillStyle = '#07020a';
    c.fill();
    c.strokeStyle = 'rgba(224,178,90,0.6)';
    c.lineWidth = 1.2;
    c.stroke();
  }, 2);
  plateTex = { key, tex };
  return tex;
}

const bubbleCache = new Map<string, Texture>();
function bubbleTexture(w: number, h: number, color: number) {
  const key = `${w}x${h}-${color}`;
  let t = bubbleCache.get(key);
  if (t) return t;
  t = paint(w + 12, h + 30, (c) => {
    c.translate(6, 6);
    const r = 14;
    c.beginPath();
    c.moveTo(r, 0);
    c.lineTo(w - r, 0);
    c.quadraticCurveTo(w, 0, w, r);
    c.lineTo(w, h - r);
    c.quadraticCurveTo(w, h, w - r, h);
    c.lineTo(w * 0.3, h);
    c.lineTo(w * 0.16, h + 18);
    c.lineTo(w * 0.18, h);
    c.lineTo(r, h);
    c.quadraticCurveTo(0, h, 0, h - r);
    c.lineTo(0, r);
    c.quadraticCurveTo(0, 0, r, 0);
    c.closePath();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff8ea');
    g.addColorStop(1, '#eedfcf');
    fillInk(c, g, 2.4);
    c.strokeStyle = rgb(color, 0.7);
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(r, 4);
    c.lineTo(w - r, 4);
    c.stroke();
  }, 2);
  bubbleCache.set(key, t);
  return t;
}

/** What the debug panel can do (see src/ui/debug.ts). */
export let minibossDebug: MinibossDirector | null = null;

export class MinibossDirector {
  private plate = new Container();
  private plateBg = new Sprite();
  private portrait = new Sprite();
  private nameText: Text;
  private statusText: Text;
  private bar = new Graphics();
  private plateKey = '';
  private plateW = 0;
  private barShown = -1;
  private pulse = 0;
  private bubble: Container | null = null;
  private staging = false;
  private lastRoom: RoomScene | null = null;
  private roomSince = 0;
  private fresh = false;
  private lastClosed = '';
  private lastBeat = -1;
  private sayAt = 0;
  private clockAsked = false;
  private wonReady = 0;

  constructor(
    private state: GameState,
    private host: MinibossHost,
  ) {
    this.nameText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xfff1c4, letterSpacing: 0.5 } });
    this.statusText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xf3e2c4 } });
    this.portrait.anchor.set(0.5);
    this.plate.addChild(this.plateBg, this.bar, this.nameText, this.statusText, this.portrait);
    this.plate.visible = false;
    this.plate.eventMode = 'static';
    this.plate.cursor = 'pointer';
    this.plate.on('pointertap', (e) => {
      e.stopPropagation();
      this.explain();
    });
    host.layer.addChild(this.plate);
    state.onRound((r) => this.round(r));
    state.onChange(() => this.check());
    minibossDebug = this;
  }

  private get boss() {
    return minibossFor(this.state.data);
  }

  /** Every frame. */
  update(dtMs: number) {
    const b = this.boss;
    const mode = this.host.mode();
    const room = this.host.room();
    if (room !== this.lastRoom) {
      // Arriving on a floor from the elevator: wait until the floor title and the day card are gone.
      this.fresh = !this.lastRoom || this.lastRoom.def.floor !== room?.def.floor;
      this.lastRoom = room;
      this.roomSince = performance.now();
    }
    this.plate.visible = !!b && (mode === 'room' || mode === 'game') && !this.staging;
    if (b && this.plate.visible) this.layoutPlate(b);
    if (this.pulse > 0) {
      this.pulse = Math.max(0, this.pulse - dtMs / 600);
      this.plate.scale.set(1 + Math.sin(this.pulse * Math.PI) * 0.06);
    }
    const d = this.state.data;
    // The day was settled with a win: the plaque once play goes on (normally in the foyer).
    const calm = mode === 'room' && !!room && !room.frozen && !this.staging && !this.host.modalOpen();
    if (d.counters[MB_KEYS.won] && calm) {
      if (!this.wonReady) this.wonReady = performance.now();
      else if (performance.now() - this.wonReady > 1400) void this.wonPlaque();
    } else this.wonReady = 0;
    if (!b) return;
    // The intro: once a day, the first time you stand on the boss's floor.
    if (!d.counters[MB_KEYS.intro] && calm && room?.miniboss) {
      const delay = this.fresh ? 8300 : 900;
      if (performance.now() - this.roomSince > delay) void this.intro(b);
    }
  }

  // ---- The plate under the top bar ----------------------------------------------------------------

  private layoutPlate(b: MiniBoss) {
    const { w, top } = this.host.screen();
    const d = this.state.data;
    const narrow = w < 640;
    // In a game on a phone only the portrait with a resistance ring and a short badge, so the
    // game's title and buttons stay free.
    const compact = narrow && this.host.mode() === 'game';
    const pw = compact ? 64 : narrow ? Math.min(230, w - 24) : Math.min(300, Math.max(220, w * 0.3));
    const name = b.name;
    const missing = this.state.goalMissing;
    const status = missing <= 0 ? (compact ? '✓' : 'Besiegt! Rechne den Tag ab.') : compact ? shortStatus(d) : ruleStatus(d);
    const key = `${pw}|${status}|${name}`;
    if (key !== this.plateKey) {
      this.plateKey = key;
      this.plateW = pw;
      this.plateBg.visible = this.nameText.visible = !compact;
      if (!compact) this.plateBg.texture = plateTexture(Math.round(pw), b.color);
      this.plateBg.position.set(-4, -4);
      this.portrait.texture = bossPortrait(b.n, b.color, 96);
      this.portrait.width = this.portrait.height = compact ? 50 : 58;
      this.portrait.position.set(compact ? pw / 2 : 24, compact ? 28 : PLATE_H / 2 - 1);
      this.nameText.text = name.toUpperCase();
      this.nameText.position.set(54, 7);
      const maxName = pw - 66;
      this.nameText.scale.set(Math.min(1, maxName / (this.nameText.width / this.nameText.scale.x)));
      this.statusText.text = status;
      this.statusText.scale.set(1);
      if (compact) {
        this.statusText.anchor.set(0.5, 0);
        this.statusText.position.set(pw / 2, 52);
      } else {
        this.statusText.anchor.set(0, 0);
        this.statusText.position.set(54, 39);
        this.statusText.scale.set(Math.min(1, maxName / this.statusText.width));
      }
      this.statusText.style.stroke = { color: 0x14060f, width: compact ? 4 : 0 };
      this.barShown = -1;
      this.plate.accessibleTitle = `${name}: ${b.ruleName}. ${ruleStatus(d)}`;
    }
    // Resistance: the Falter still missing to today's goal.
    const q = Math.max(1, d.evening.quota);
    const k = Math.max(0, Math.min(1, missing / q));
    if (Math.abs(k - this.barShown) > 0.002) {
      this.barShown = k;
      this.bar.clear();
      if (compact) {
        this.bar.circle(pw / 2, 28, 27).stroke({ color: 0x07020a, width: 5 });
        if (k > 0) this.bar.arc(pw / 2, 28, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).stroke({ color: b.color, width: 4 });
      } else {
        const bw = pw - 68;
        if (k > 0) this.bar.roundRect(54, 29, Math.max(6, bw * k), 6, 3).fill(b.color).roundRect(56, 29.5, Math.max(3, bw * k - 4), 2, 1).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
    this.plate.pivot.set(pw / 2, PLATE_H / 2);
    // Narrow screens: under the folded task list, which takes the top left; in a game in the corner.
    this.plate.position.set(w - pw / 2 - (compact ? 6 : 12), top + (compact ? 6 : narrow ? 50 : 10) + PLATE_H / 2);
  }

  /** Tap on the plate or the boss: the rule again, with today's numbers. */
  explain() {
    const b = this.boss;
    if (!b) return;
    const d = this.state.data;
    sfx.click();
    if (this.host.mode() === 'room' && b.id === 'uhrmacher' && roundsLeft(d) <= 0 && !this.state.goalReached) return this.askSettle(b);
    const won = this.state.goalReached;
    const body = [
      `${b.title}.`,
      `${b.ruleName}: ${b.rule}`,
      `Jetzt: ${ruleStatus(d)}.`,
      won ? `Das Tagesziel von ${formatChips(this.state.goalBalance)} Falter ist erreicht. Rechne den Tag ab, um den Sieg zu sichern (+${b.reward} Mondsteine).` : `So gewinnst du: erreiche das Tagesziel von ${formatChips(this.state.goalBalance)} Falter (noch ${formatChips(this.state.goalMissing)}) und rechne ab. Belohnung: +${b.reward} Mondsteine${d.minibosses.includes(b.id) ? '' : ' und eine Trophäe'}.`,
      'Die Gewinnchancen der Spiele bleiben gleich.',
    ].join('\n\n');
    this.host.modal(b.name, body, [{ label: 'Verstanden', primary: true, onClick: () => this.host.closeModal() }]);
  }

  /** Tap on the boss in the room. */
  interact(id: string) {
    if (id !== 'miniboss') return false;
    const b = this.boss;
    if (!b) return true;
    const d = this.state.data;
    if (!d.counters[MB_KEYS.intro] && !this.staging) {
      void this.intro(b);
      return true;
    }
    this.host.room()?.miniboss?.bounce();
    this.say(this.state.goalReached ? b.win : pick(b.taunts), b);
    setTimeout(() => this.explain(), 700);
    return true;
  }

  // ---- Rounds: the rule's moments -----------------------------------------------------------------

  private round(r: RoundReport) {
    const b = this.boss;
    if (!b) return;
    const d = this.state.data;
    const now = performance.now();
    if (b.id === 'gaertner') {
      const closed = gardenClosed(d);
      const key = closed.join(',');
      if (this.lastClosed && key !== this.lastClosed) {
        const was = this.lastClosed.split(',').filter((g) => !closed.includes(g));
        this.host.toast(`${b.name} schneidet zurück: ${list(closed)} ${closed.length === 1 ? 'ist' : 'sind'} jetzt zu${was.length ? `, ${list(was)} wieder offen` : ''}.`);
        this.say('Schnipp, schnapp!', b);
        const g = this.host.game();
        if (g && closed.includes(g)) this.escort(`${gameName(g)} wird zurückgeschnitten. Bitte wechsle das Spiel.`);
      }
      this.lastClosed = key;
    } else if (b.id === 'uhrmacher') {
      const left = roundsLeft(d);
      if (left === 0) {
        this.host.toast('Die Uhr des Uhrmachers ist abgelaufen: alle Spiele schließen.');
        sfx.bossSting(2);
        this.say('Tick … tack … Stopp.', b);
        if (this.host.game()) this.escort('');
      } else if ([20, 10, 5, 3, 1].includes(left)) this.host.toast(`Uhrmacher: noch ${left} ${left === 1 ? 'Runde' : 'Runden'}.`);
    } else if (b.id === 'falterbeat') {
      const k = beatIndex(d);
      if (k !== this.lastBeat && this.lastBeat >= 0) {
        this.pulse = 1;
        this.say(BEAT[k] === 3 ? 'DROP! Einsätze ×3!' : BEAT[k] === 2 ? 'Bass rein: ×2!' : 'Und runter: ×1.', b);
      }
      this.lastBeat = k;
    }
    // Reactions now and then: a hit makes them flinch, a loss makes them gloat.
    if (now - this.sayAt > 9000) {
      if (r.stake > 0 && r.win >= r.stake * 10) this.say(pick(b.ouch), b);
      else if (r.stake > 0 && r.win < r.stake && Math.random() < 0.3) this.say(pick(b.taunts), b);
    }
  }

  /** The player sits at a game that just closed: walk them out once the round is done. */
  private escort(text: string, tries = 0) {
    if (this.host.mode() !== 'game' || tries > 30) return;
    if (tries === 0 && text) this.host.toast(text);
    if (this.host.gameBusy()) {
      setTimeout(() => this.escort(text, tries + 1), 700);
      return;
    }
    setTimeout(() => this.host.mode() === 'game' && this.host.leaveGame(), 900);
  }

  /** State changed: the clock ran out (ask to settle), or the goal was reached (victory). */
  private check() {
    const b = this.boss;
    if (!b || this.host.mode() === 'title') return;
    const d = this.state.data;
    if (b.id === 'falterbeat' && this.lastBeat < 0) this.lastBeat = beatIndex(d);
    if (b.id === 'gaertner' && !this.lastClosed) this.lastClosed = gardenClosed(d).join(',');
    if (this.state.goalReached && !d.counters[MB_KEYS.beat]) {
      d.counters[MB_KEYS.beat] = 1;
      void this.victory(b);
    }
    if (b.id === 'uhrmacher' && roundsLeft(d) <= 0 && !this.clockAsked && !this.state.goalReached) {
      this.clockAsked = true;
      const ask = (n = 0) => {
        if (this.host.mode() === 'room' && !this.host.modalOpen() && !this.staging) this.askSettle(b);
        else if (n < 60) setTimeout(() => ask(n + 1), 800);
      };
      setTimeout(ask, 1500);
    }
    if (b.id !== 'uhrmacher' || roundsLeft(d) > 0) this.clockAsked = false;
  }

  private askSettle(b: MiniBoss) {
    this.host.modal(
      'Die Uhr steht still',
      `${b.name} hat die Uhr angehalten: ${CLOCK_ROUNDS} Runden sind gespielt, alle Spiele bleiben heute zu. Das Tagesziel von ${formatChips(this.state.goalBalance)} Falter fehlt noch um ${formatChips(this.state.goalMissing)}. Rechne den Tag ab, wenn du bereit bist.`,
      [
        { label: 'Tag abrechnen', primary: true, onClick: () => { this.host.closeModal(); this.host.endEvening(); } },
        { label: 'Noch nicht', onClick: () => this.host.closeModal() },
      ],
    );
  }

  // ---- Speech --------------------------------------------------------------------------------------

  /** A speech bubble: over the boss in the room, else next to the plate. */
  say(text: string, b: MiniBoss) {
    this.sayAt = performance.now();
    this.bubble?.destroy({ children: true });
    this.bubble = null;
    const { w, top } = this.host.screen();
    const room = this.host.room();
    const fig = this.host.mode() === 'room' ? room?.miniboss : null;
    const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: 0x2a1406, wordWrap: true, wordWrapWidth: Math.min(250, w - 70), lineHeight: 21 } });
    const bw = Math.ceil(t.width + 30);
    const bh = Math.ceil(t.height + 18);
    const c = new Container();
    const bg = new Sprite(bubbleTexture(bw, bh, b.color));
    bg.position.set(-6, -6);
    t.position.set(15, 9);
    c.addChild(bg, t);
    if (fig && room) {
      const p = room.toScreen(fig.head.x, fig.head.y);
      c.position.set(Math.max(8, Math.min(w - bw - 8, p.x - bw * 0.2)), Math.max(top + 8, p.y - bh - 24));
    } else {
      // Under the plate, pointing up at the portrait.
      c.position.set(Math.max(8, w - Math.max(this.plateW, 220) - 12 - 6), top + PLATE_H + 30);
      bg.scale.y = -1;
      bg.y = bh + 24;
      t.y = 9 + 18;
    }
    c.eventMode = 'none';
    this.host.layer.addChild(c);
    this.bubble = c;
    announce(`${b.name}: ${text}`);
    c.alpha = 0;
    const calm = reducedMotion();
    if (!calm) c.scale.set(0.7);
    void Promise.all([tween(c, { alpha: 1 }, 160), calm ? Promise.resolve() : tween(c.scale, { x: 1, y: 1 }, 260, ease.outBack)])
      .then(() => wait(2600))
      .then(() => (c.destroyed ? undefined : tween(c, { alpha: 0 }, 300)))
      .then(() => {
        if (!c.destroyed) c.destroy({ children: true });
        if (this.bubble === c) this.bubble = null;
      });
  }

  // ---- Big moments ---------------------------------------------------------------------------------

  /** Dim, portrait and plaque in, hold (tap skips), out. */
  private async banner(b: MiniBoss, title: string, sub: string, hold: number, dimA = 0.6) {
    leavePhoto();
    const { w, h, top } = this.host.screen();
    const L = this.host.layer;
    const calm = reducedMotion();
    const dim = new Graphics().rect(0, 0, w, h).fill(0x0b0208);
    dim.alpha = 0;
    dim.eventMode = 'static';
    L.addChild(dim);
    const narrow = w < 640;
    const { tex, fullW, visW } = plaqueTexture(title, b.color, { size: 54, sub: sub.split('\n').map((l) => wrap(l, narrow ? 34 : 58)).join('\n'), subSize: narrow ? 28 : 24 });
    const c = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.tint = b.color;
    glow.blendMode = 'add';
    glow.width = fullW * 1.2;
    glow.height = tex.height * 1.4;
    glow.alpha = 0.45;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    const face = new Sprite(bossPortrait(b.n, b.color, 160));
    face.anchor.set(0.5);
    face.width = face.height = 132;
    face.y = -tex.height / 2 + 6;
    c.addChild(glow, s, face);
    const fullH = tex.height + 66;
    const fit = Math.min(1, (w - 24) / visW, (h - top - 24) / fullH);
    c.position.set(w / 2, Math.max(top + 12 + (66 + tex.height / 2) * fit, h * 0.46));
    c.alpha = 0;
    c.scale.set(calm ? fit : fit * 0.7);
    L.addChild(c);
    announce(`${title}. ${sub.replace(/\n/g, ' ')}`);
    let skip = false;
    dim.on('pointertap', () => (skip = true));
    await Promise.all([
      tween(dim, { alpha: dimA }, calm ? 150 : 320, ease.outCubic),
      tween(c, { alpha: 1 }, 260),
      calm ? Promise.resolve() : tween(c.scale, { x: fit, y: fit }, 480, ease.outBack),
    ]);
    const until = performance.now() + hold;
    while (!skip && performance.now() < until && !c.destroyed) await wait(100);
    await Promise.all([tween(c, { alpha: 0 }, 320, ease.inCubic), tween(dim, { alpha: 0 }, 420)]);
    c.destroy({ children: true });
    tex.destroy(true);
    dim.destroy();
  }

  private async intro(b: MiniBoss) {
    if (this.staging) return;
    this.staging = true;
    const d = this.state.data;
    d.counters[MB_KEYS.intro] = 1;
    this.state.emit();
    sfx.bossSting(1);
    this.host.room()?.miniboss?.bounce();
    const goal = `Ziel heute: ${formatChips(this.state.goalBalance)} Falter${b.quota !== 1 ? ` (${b.quota > 1 ? '+' : '−'}${Math.round(Math.abs(b.quota - 1) * 100)} %)` : ''}`;
    await this.banner(b, b.name.toUpperCase(), `${b.title}\n${b.ruleName}: ${b.rule}\n${goal}`, 4600);
    this.staging = false;
    this.say(b.intro, b);
    this.pulse = 1;
    this.host.toast(`Mini-Boss ${b.name} · ${b.ruleName}: ${b.rule} Die Gewinnchancen bleiben gleich.`);
  }

  private async victory(b: MiniBoss) {
    // Wait for a free moment (no other staging); in a game the banner shows over the table.
    while (this.staging) await wait(300);
    this.staging = true;
    sfx.medal();
    this.host.room()?.miniboss?.bounce();
    await this.banner(b, 'BESIEGT!', `${b.name} gibt sich geschlagen.\nRechne den Tag ab: +${b.reward} Mondsteine${this.state.data.minibosses.includes(b.id) ? '' : ' und eine Trophäe'}.`, 2600, 0.45);
    this.staging = false;
    this.say(b.win, b);
  }

  private async wonPlaque() {
    const d = this.state.data;
    const b = MINIBOSSES[(d.counters[MB_KEYS.won] ?? 0) - 1];
    const first = !!d.counters[MB_KEYS.first];
    const stones = d.counters['mb:reward'] ?? b?.reward ?? 0;
    delete d.counters[MB_KEYS.won];
    delete d.counters[MB_KEYS.first];
    delete d.counters['mb:reward'];
    if (!b) return;
    this.staging = true;
    sfx.shimmer();
    await this.banner(b, 'MINI-BOSS BESIEGT', `${b.name}: +${stones} Mondsteine${first ? '\nNeue Trophäe in der Vitrine!' : ''}`, 2600, 0.4);
    this.staging = false;
  }
}
