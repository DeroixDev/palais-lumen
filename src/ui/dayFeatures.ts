// Wires the day features into the game loop: events, guest tasks and the stamp card.
// main.ts creates one DayFeatures, adds its view between the game and the overlays, and
// forwards station taps, 'extra' interactables and layout/update calls to it.

import { Container } from 'pixi.js';
import { sfx } from '../core/audio';
import type { StationPlacement } from '../core/registry';
import type { GameState } from '../core/state';
import { currentEvent, installEvents, isClosed } from '../core/events';
import { acceptQuest, installQuests, onQuest, rewardText } from '../core/quests';
import { STAMP_REWARDS, installStamps, onStamp } from '../core/stamps';
import { getGame } from '../core/registry';
import { DayBoard, QuestDialog, eventRibbon } from './dayBoard';
import { StampCardPanel, StampPopup } from './stampCard';

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
}

export class DayFeatures {
  readonly view = new Container();
  readonly board: DayBoard;
  private popup: StampPopup;

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
    onQuest(({ quest: q, kind }) => {
      if (kind === 'accepted') deps.toast(`Auftrag von ${q.giver}: ${q.text}`);
      else if (kind === 'done') {
        deps.toast(`Auftrag erledigt! ${q.giver} gibt dir ${rewardText(q)}.`);
        sfx.medal();
      } else if (q.need <= 3 || q.have === Math.ceil(q.need / 2) || q.have === q.need - 1) deps.toast(`${q.giver}: ${q.have} von ${q.need}`);
    });
    onStamp((n) => {
      this.popup.push(n);
      if (n.unlocked) deps.toast(`Stammkunden-Karte voll! Etage ${n.floor.slice(1)}: ${STAMP_REWARDS[n.floor].name} freigeschaltet.`);
    });
  }

  layout(w: number, _h: number, top: number) {
    this.board.layout(w, top);
    this.popup.layout(w, top);
  }

  /** Board only in the rooms; stamp popups in the rooms and games. */
  update(_dtMs: number, mode: string) {
    this.board.view.visible = mode === 'room';
    this.popup.tick(mode === 'room' || mode === 'game');
  }

  /** False (with a toast) if the station's game is closed today. */
  canPlay(st: StationPlacement) {
    if (!isClosed(this.state.data, st.game)) return true;
    const e = currentEvent(this.state.data);
    sfx.thud();
    const why = e?.closed?.includes(st.game) ? e.name : 'Letzter Tanz der Königin';
    this.deps.toast(`${st.label ?? getGame(st.game).name} ist heute geschlossen (${why}).`);
    return false;
  }

  /** A guest with a task or the stamp card stand. */
  interact(id: string) {
    if (id === 'stamps') {
      sfx.deskBell();
      this.deps.showOverlay(new StampCardPanel(this.state, () => this.deps.closeOverlay()));
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
