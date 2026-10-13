// In a game the day board is hidden, so the HUD's day line carries a small chip instead: the
// event's medallion and the task count ("Aufträge 1/3"). Tapping it lays the full board over
// the game for a moment. Lives in the DOM so it can never cover a game's controls.

import { sfx } from '../core/audio';
import type { GameState } from '../core/state';
import { currentEvent } from '../core/events';
import { eventMedalUrl } from './dayBoard';

export class GameChip {
  readonly el: HTMLButtonElement;
  private medal: HTMLElement;
  private count: HTMLElement;
  private dot: HTMLElement;
  private medalFor = '';

  constructor(
    private state: GameState,
    onToggle: () => void,
  ) {
    const el = document.createElement('button');
    el.className = 'day-chip';
    el.type = 'button';
    el.setAttribute('aria-expanded', 'false');
    el.innerHTML = '<span class="dc-medal" aria-hidden="true"></span><span class="dc-long">Aufträge</span><span class="dc-n"></span><span class="dc-dot" aria-hidden="true"></span>';
    this.medal = el.querySelector('.dc-medal')!;
    this.count = el.querySelector('.dc-n')!;
    this.dot = el.querySelector('.dc-dot')!;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.click();
      onToggle();
    });
    // Between "Tag 3 · Etage 1" and the goal.
    const line = document.querySelector('.evening-top');
    const goal = document.getElementById('ev-goal');
    if (line && goal) line.insertBefore(el, goal);
    this.el = el;
    state.onChange(() => this.refresh());
    this.refresh();
  }

  refresh() {
    const d = this.state.data;
    const e = currentEvent(d);
    const qs = d.quests;
    this.el.classList.toggle('has', !!e || qs.length > 0);
    const key = e?.id ?? '';
    if (key !== this.medalFor) {
      this.medalFor = key;
      this.medal.style.backgroundImage = e ? `url(${eventMedalUrl(e)})` : '';
      this.medal.hidden = !e;
    }
    const done = qs.filter((q) => q.done).length;
    this.count.textContent = qs.length ? `${done}/${qs.length}` : e ? e.name : '';
    this.el.querySelector<HTMLElement>('.dc-long')!.hidden = !qs.length;
    this.dot.hidden = !qs.some((q) => !q.accepted && !q.done);
    const parts = [e ? `Ereignis: ${e.name}` : '', qs.length ? `Aufträge ${done} von ${qs.length} erledigt` : ''].filter(Boolean);
    this.el.setAttribute('aria-label', `${parts.join(', ')}. Tippen zeigt die Liste.`);
  }

  set open(on: boolean) {
    this.el.setAttribute('aria-expanded', String(on));
  }
}
