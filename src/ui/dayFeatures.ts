// Wires the day features into the game loop: events, guest tasks and the stamp card.
// main.ts creates one DayFeatures, adds its view between the game and the overlays, and
// forwards station taps, 'extra' interactables and layout/update calls to it.

import { Container } from 'pixi.js';
import { sfx } from '../core/audio';
import type { StationPlacement } from '../core/registry';
import type { GameState } from '../core/state';
import { currentEvent, installEvents, isClosed, onEventSwitch } from '../core/events';
import { acceptQuest, installQuests, onQuest, rewardText } from '../core/quests';
import { STAMP_REWARDS, installStamps, onStamp } from '../core/stamps';
import { getGame } from '../core/registry';
import { DayBoard, QuestDialog, eventRibbon } from './dayBoard';
import { StampCardPanel, StampPopup } from './stampCard';
import { GameChip } from './gameChip';
import { ProgramPanel } from './program';
import { reducedMotion } from '../core/fx';
import { takeCurio } from '../core/curios';
import { minibossClosedReason } from '../core/miniboss';

import { BOSS_GEN } from '../core/brand';
interface Overlay {
  view: Container;
  resize(w: number, h: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

export interface DayDeps {
  toast(text: string): void;
  showOverlay(o: Overlay): void;
  closeOverlay(): void;
  /** The open game's id, or null in the rooms. */
  game?(): string | null;
  gameBusy?(): boolean;
  leaveGame?(): void;
}

export class DayFeatures {
  readonly view = new Container();
  readonly board: DayBoard;
  private popup: StampPopup;
  /** HUD chip that opens the board over a game. */
  private chip: GameChip;
  private peekTimer = 0;
  /** Narrow screens: the board steps aside while a stamp card drops in. */
  private crowded = false;
  private shift = 0;

  constructor(
    private state: GameState,
    private deps: DayDeps,
  ) {
    // Order matters: the event is rolled before the tasks (no task for a closed game).
    installEvents(state, (t) => {
      deps.toast(t);
      sfx.shimmer();
    });
    installQuests(state);
    installStamps(state);
    this.board = new DayBoard(state);
    this.popup = new StampPopup(state);
    this.view.addChild(this.board.view, this.popup.view);
    this.chip = new GameChip(state, () => this.setPeek(!this.board.peek));
    this.board.onPeekTap = () => this.setPeek(false);
    window.addEventListener('pointerdown', (e) => {
      if (this.board.peek && !(e.target as HTMLElement).closest?.('.day-chip')) this.setPeek(false);
    });
    onQuest(({ quest: q, kind }) => {
      if (kind === 'accepted') deps.toast(`Auftrag von ${q.giver}: ${q.text}`);
      else if (kind === 'done') {
        deps.toast(`Auftrag erledigt! ${q.giver} gibt dir ${rewardText(q)}.`);
        sfx.medal();
      } else if (q.need <= 3 || q.have === Math.ceil(q.need / 2) || q.have === q.need - 1) deps.toast(`${q.giver}: ${q.have} von ${q.need}`);
    });
    // Debug switched the event mid-day: walk the player out of a game that just closed.
    onEventSwitch(() => {
      const g = deps.game?.();
      if (g && isClosed(state.data, g)) this.leaveClosed(g);
    });
    onStamp((n) => {
      this.popup.push(n);
      if (n.unlocked) deps.toast(`Stammkunden-Karte voll! Etage ${n.floor.slice(1)}: ${STAMP_REWARDS[n.floor].name} freigeschaltet.`);
    });
  }

  layout(w: number, _h: number, top: number) {
    this.board.layout(w, top);
    this.popup.layout(w, top);
    this.crowded = w < 640;
  }

  /** The board over a game, opened from the HUD chip; closes itself after a while. */
  private setPeek(on: boolean) {
    clearTimeout(this.peekTimer);
    if (this.board.peek === on) return;
    this.board.peek = on;
    this.chip.open = on;
    this.board.refresh();
    if (on) window.dispatchEvent(new Event('nf-board-peek'));
    if (on) this.peekTimer = window.setTimeout(() => this.setPeek(false), 8000);
  }

  /** Board in the rooms (and over a game when peeked); stamp popups in the rooms and games. */
  update(dtMs: number, mode: string) {
    if (this.board.peek && mode !== 'game') this.setPeek(false);
    this.board.view.visible = mode === 'room' || (mode === 'game' && this.board.peek);
    this.popup.tick(mode === 'room' || mode === 'game');
    // The stamp card drops in at the top right; on a phone it would land on the task list.
    const away = this.crowded && this.popup.pending && !this.board.peek;
    if (reducedMotion()) {
      this.shift = 0;
      this.board.view.alpha = away ? 0 : 1;
    } else {
      const target = away ? -(this.board.view.width + 24) : 0;
      this.shift += (target - this.shift) * Math.min(1, dtMs / 90);
      if (Math.abs(target - this.shift) < 0.5) this.shift = target;
      this.board.view.alpha = 1;
    }
    this.board.view.x = 12 + this.shift;
  }

  /** False (with a toast) if the station's game is closed today. */
  canPlay(st: StationPlacement) {
    if (!isClosed(this.state.data, st.game)) return true;
    const e = currentEvent(this.state.data);
    sfx.thud();
    const why = e?.closed?.includes(st.game) ? e.name : minibossClosedReason(this.state.data, st.game) ?? `${BOSS_GEN} letzter Tanz`;
    this.deps.toast(`${st.label ?? getGame(st.game).name} ist heute geschlossen (${why}).`);
    return false;
  }

  /** The open game closed today: leave it once its round is over. */
  private leaveClosed(game: string, tries = 0) {
    if (this.deps.game?.() !== game || tries > 30) return;
    if (tries === 0) this.deps.toast(`${getGame(game).name} ist heute geschlossen (${currentEvent(this.state.data)?.name ?? 'Ereignis'}).`);
    if (this.deps.gameBusy?.()) {
      setTimeout(() => this.leaveClosed(game, tries + 1), 700);
      return;
    }
    setTimeout(() => this.deps.game?.() === game && this.deps.leaveGame?.(), 600);
  }

  /** A guest with a task or the stamp card stand. */
  interact(id: string) {
    if (id.startsWith('curio:')) {
      if (takeCurio(this.state, id.slice(6), this.deps.toast)) sfx.shimmer();
      else sfx.click();
      return;
    }
    if (id === 'stamps') {
      sfx.deskBell();
      this.deps.showOverlay(new StampCardPanel(this.state, () => this.deps.closeOverlay()));
      return;
    }
    if (id === 'program') {
      sfx.rustle();
      this.deps.showOverlay(new ProgramPanel(this.state, () => this.deps.closeOverlay()));
      return;
    }
    if (id.startsWith('quest:')) {
      const q = this.state.data.quests.find((x) => `quest:${x.id}` === id);
      if (!q) return;
      sfx.click();
      this.deps.showOverlay(
        new QuestDialog(
          q,
          () => {
            acceptQuest(this.state, q.id);
            sfx.chime();
          },
          () => this.deps.closeOverlay(),
        ),
      );
    }
  }

  /** The event ribbon for the day card, or null on a plain day. */
  ribbon(screenW: number) {
    const e = currentEvent(this.state.data);
    return e ? eventRibbon(e, Math.min(620, screenW - 24)) : null;
  }
}
