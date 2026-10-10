// The flow of the boss corridor (floor 5): which machine may be played, the one try (the game's
// context is wrapped so a second stake is refused, and the game closes by itself once its round
// is shown), the gate opening afterwards, the lantern strip "Automat 2 von 5", the Queen's big
// life bar in the throne hall, and the duel at the end. main.ts forwards a few calls here.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_DISPLAY, reducedMotion } from '../core/fx';
import type { GameContext, StationPlacement } from '../core/registry';
import { formatChips, type GameState } from '../core/state';
import { CORRIDOR, MACHINES, OneShot, RUN_KEY, installBossRun, machineIndex, markSpent, spentCount } from '../core/bossRun';
import { sfx } from '../core/audio';
import { tween } from '../core/tween';
import type { RoomScene } from '../world/room';
import { fillInk, glowAt, gold, paint, rrect } from '../world/painted/brush';
import { mothEmblem } from '../world/painted/propsCrystal';
import { QueenBar } from './queenBar';

export interface RunHost {
  room(): RoomScene | null;
  /** 'room', 'game', 'overlay', 'title', 'transition'. */
  mode(): string;
  openGame(st: StationPlacement): void;
  leaveGame(): void;
  gameBusy(): boolean;
  toast(text: string): void;
  endEvening(): void;
}

/** What the debug panel can do (see src/ui/debug.ts). */
export let bossRunDebug: BossRun | null = null;

const texCache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => texCache.get(k) ?? (texCache.set(k, make()), texCache.get(k)!);

/** A small hanging lantern: lit once its machine is done. */
function lanternTexture(lit: boolean) {
  return cached(`lan-${lit}`, () =>
    paint(30, 40, (c) => {
      c.translate(15, 4);
      c.beginPath();
      c.moveTo(0, -2);
      c.lineTo(0, 4);
      c.strokeStyle = '#7a5a2a';
      c.lineWidth = 1.5;
      c.stroke();
      if (lit) glowAt(c, 0, 18, 14, 14, 0xffcf7a, 0.6, 'lighter');
      rrect(c, -8, 4, 16, 6, 2);
      fillInk(c, gold(c, -8, 4, 8, 10), 1.2);
      rrect(c, -9, 10, 18, 18, 5);
      const g = c.createLinearGradient(0, 10, 0, 28);
      g.addColorStop(0, lit ? '#fff1c4' : '#3a2a44');
      g.addColorStop(1, lit ? '#e6a040' : '#1a1020');
      fillInk(c, g, 1.4);
      rrect(c, -6, 28, 12, 5, 2);
      fillInk(c, gold(c, -6, 28, 6, 33), 1.1);
    }),
  );
}

function crownTexture(lit: boolean) {
  return cached(`crown-${lit}`, () =>
    paint(40, 40, (c) => {
      if (lit) glowAt(c, 20, 20, 20, 20, 0xc9a0ff, 0.6, 'lighter');
      c.translate(20, 21);
      c.globalAlpha = lit ? 1 : 0.6;
      mothEmblem(c, 26, lit ? '#ff5fa2' : '#6a4a7a');
    }),
  );
}

export class BossRun {
  /** Screen-space: the lantern strip and, in the throne hall, the Queen's bar. */
  readonly view = new Container();
  private strip = new Container();
  private stripBg = new Sprite();
  private lanterns: Sprite[] = [];
  private crown = new Sprite(crownTexture(false));
  private stripText: Text;
  private bar: QueenBar;
  private shot: OneShot | null = null;
  /** The corridor game we opened has actually been on screen. */
  private shotSeen = false;
  private closing = false;
  private hinted = new Set<number>();
  private lastRoom: RoomScene | null = null;

  constructor(
    private state: GameState,
    private host: RunHost,
  ) {
    installBossRun(state);
    state.onRound(() => this.round());
    this.bar = new QueenBar(state);
    this.stripText = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 15, fill: 0xfff1c4, letterSpacing: 1, stroke: { color: 0x14060f, width: 4 } } });
    this.stripText.anchor.set(0.5, 0);
    for (let i = 0; i < MACHINES; i++) {
      const s = new Sprite(lanternTexture(false));
      s.anchor.set(0.5, 0);
      this.lanterns.push(s);
    }
    this.crown.anchor.set(0.5, 0);
    this.strip.addChild(this.stripBg, ...this.lanterns, this.crown, this.stripText);
    this.view.addChild(this.strip, this.bar.view);
    this.view.eventMode = 'none';
    this.view.visible = false;
    bossRunDebug = this;
  }

  private corridor(room = this.host.room()) {
    return room?.def.corridor ? room : null;
  }

  // ---- Machines -------------------------------------------------------------------------------

  /** A station tapped in the corridor. False if this is not a corridor room (the caller goes on). */
  station(st: StationPlacement): boolean {
    const room = this.corridor();
    if (!room) return false;
    const i = machineIndex(room.def, st);
    const spent = spentCount(this.state.data);
    if (i < 0) return false;
    if (i < spent) {
      sfx.thud();
      this.host.toast('Dieser Automat hatte seinen Versuch. Kein zweiter Versuch – weiter nach rechts!');
      return true;
    }
    if (i > spent) {
      sfx.thud();
      this.host.toast('Erst der Automat davor.');
      return true;
    }
    if (this.tooPoor()) {
      this.passThrough(i);
      return true;
    }
    this.shot = new OneShot(this.state, i, st.game, (t) => this.host.toast(t));
    this.shotSeen = false;
    this.closing = false;
    this.host.openGame(st);
    if (i === 0 && !this.state.data.counters['run:told']) {
      this.state.data.counters['run:told'] = 1;
      setTimeout(() => this.host.toast('Ein Versuch: eine Runde, dann schließt der Automat. Wähle deinen Einsatz mit Bedacht.'), 900);
    }
    return true;
  }

  /** Not even the smallest stake left: the machine can't be played, the gate opens anyway. */
  private tooPoor() {
    return this.state.balance < this.state.stakeUnit;
  }

  private passThrough(i: number) {
    markSpent(this.state.data, i);
    this.state.emit();
    this.corridor()?.corridor?.openGate(i);
    this.host.toast(`Zu wenig Falter für einen Einsatz (ab ${formatChips(this.state.stakeUnit)}). Die Königin winkt dich spöttisch durch.`);
    this.lightStrip(i);
  }

  /** Wraps the game's context for the corridor's one try (unchanged for every other game). */
  wrap(st: StationPlacement, ctx: GameContext): GameContext {
    const s = this.shot;
    if (!s || s.game !== st.game) return ctx;
    return s.wrap(ctx);
  }

  /** A round was reported: in a corridor game that was the try; the game closes once it's shown. */
  private round() {
    const s = this.shot;
    if (!s || s.reported || this.host.mode() !== 'game') return;
    s.reported = true;
    this.closing = true;
    this.host.toast(s.index < MACHINES - 1 ? 'Versuch gespielt. Gleich öffnet sich das Tor.' : 'Versuch gespielt. Gleich öffnet sich das letzte Tor.');
    const tryClose = (n: number) => {
      if (this.shot !== s || this.host.mode() !== 'game') return;
      if (this.host.gameBusy() && n < 40) {
        setTimeout(() => tryClose(n + 1), 400);
        return;
      }
      this.host.leaveGame();
    };
    setTimeout(() => tryClose(0), 2200);
  }

  /** Back in the corridor after a machine: open its gate if the try was used. */
  private finishShot() {
    const s = this.shot;
    if (!s) return;
    this.shot = null;
    this.closing = false;
    const room = this.corridor();
    if (spentCount(this.state.data) > s.index) {
      room?.corridor?.openGate(s.index);
      this.lightStrip(s.index);
      this.host.toast(s.index < MACHINES - 1 ? `Tor ${s.index + 1} öffnet sich. Weiter zum nächsten Automaten!` : 'Das letzte Tor öffnet sich. Die Mottenkönigin erwartet dich.');
    } else {
      this.host.toast('Du hast nicht gespielt – das Tor bleibt zu. Dieser Automat ist Pflicht.');
    }
  }

  // ---- Gates and the Queen ----------------------------------------------------------------------

  /** 'gate:i' and 'queen' interactables. False for anything else. */
  interact(id: string): boolean {
    if (id.startsWith('gate:')) {
      const i = Number(id.slice(5));
      if (i === spentCount(this.state.data) && this.tooPoor()) {
        this.passThrough(i);
        return true;
      }
      sfx.thud();
      this.host.toast(i === spentCount(this.state.data) ? 'Das Tor ist zu. Erst den Automaten spielen – ein Versuch, kein zweiter.' : 'Das Tor ist zu.');
      return true;
    }
    if (id === 'queen') {
      const t = CORRIDOR.throne;
      sfx.bossSting(2);
      this.host.openGame({ game: 'queen', x: t.x - 110, y: t.y - 200, label: 'Duell der Königin', options: { settle: () => this.host.endEvening() } });
      return true;
    }
    return false;
  }

  // ---- Frame ------------------------------------------------------------------------------------

  layout(w: number, h: number, top: number) {
    const gap = 36;
    const sw = gap * MACHINES + 44;
    const W = sw + 40;
    this.stripBg.texture = cached(`stripbg-${W}`, () =>
      paint(W, 66, (c) => {
        rrect(c, 2, 2, W - 4, 60, 14);
        c.fillStyle = 'rgba(14,4,20,0.72)';
        c.fill();
        c.strokeStyle = 'rgba(224,178,90,0.7)';
        c.lineWidth = 1.6;
        c.stroke();
      }),
    );
    this.stripBg.position.set(-W / 2, 0);
    this.lanterns.forEach((s, i) => s.position.set(-sw / 2 + gap * (i + 0.5), 4));
    this.crown.position.set(sw / 2 - 20, 2);
    this.stripText.position.set(0, 44);
    this.strip.position.set(w / 2, h - 66 - 10);
    const bw = Math.min(w - 20, 680);
    this.bar.resize(bw);
    this.bar.view.position.set((w - bw) / 2, top + 8);
  }

  private lightStrip(i: number) {
    const s = this.lanterns[i];
    if (!s || reducedMotion()) return;
    s.scale.set(1.8);
    void tween(s.scale, { x: 1, y: 1 }, 420);
  }

  update(dtMs: number) {
    const mode = this.host.mode();
    const room = this.host.room();
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.hinted.clear();
    }
    if (this.shot) {
      if (mode === 'game') this.shotSeen = true;
      else if (mode === 'room' && this.shotSeen) this.finishShot();
      else if (mode === 'room' && !this.closing && !this.shotSeen) {
        // The game never opened (closed by an event, a reload): drop the try.
        this.shot = null;
      }
    }
    const cor = this.corridor(room);
    this.view.visible = !!cor && mode === 'room';
    if (!cor || mode !== 'room') return;
    const d = this.state.data;
    const n = spentCount(d);
    this.lanterns.forEach((s, i) => (s.texture = lanternTexture(i < n)));
    this.crown.texture = crownTexture(n >= MACHINES);
    const txt = n < MACHINES ? `AUTOMAT ${n + 1} VON ${MACHINES}` : 'ZUR KÖNIGIN';
    if (this.stripText.text !== txt) this.stripText.text = txt;
    const px = cor.player.view.x;
    // The Queen's bar shows once the throne hall is in sight.
    this.bar.view.visible = px > CORRIDOR.gates[MACHINES - 1] - 200;
    if (this.bar.view.visible) this.bar.update(dtMs);
    // Walking into a closed gate: say why, once per gate and visit.
    const g = cor.corridor?.closedGateNear(px, 64, cor.player.view.y) ?? -1;
    if (g >= 0 && !this.hinted.has(g)) {
      this.hinted.add(g);
      sfx.thud();
      this.host.toast(g === n ? 'Erst den Automaten spielen – dann öffnet sich das Tor.' : 'Das Tor ist zu.');
    }
  }

  // ---- Debug ----------------------------------------------------------------------------------

  /** Debug: all gates closed again, every machine fresh. */
  debugReset() {
    delete this.state.data.counters[RUN_KEY];
    this.state.emit();
    this.corridor()?.corridor?.refresh();
    return 'Boss-Gang zurückgesetzt: alle Tore zu, jeder Automat hat wieder einen Versuch.';
  }

  /** Debug: every machine spent, the player stands before the throne. */
  debugToQueen() {
    for (let i = 0; i < MACHINES; i++) markSpent(this.state.data, i);
    this.state.emit();
    const room = this.corridor();
    if (!room) return 'Erst auf Etage 5 gehen (Boss-Tag), dann klappt der Sprung zur Königin.';
    room.corridor?.refresh();
    room.player.view.position.set(CORRIDOR.throne.x - 40, CORRIDOR.throne.y + 92);
    return 'Alle Tore offen. Die Königin wartet.';
  }
}

