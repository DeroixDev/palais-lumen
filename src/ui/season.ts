// Ties the season systems into the game loop: the perk draft after a passed day (src/ui/draft.ts),
// the moon dial at the start of a season (src/ui/moonDial.ts), the boss phases (src/ui/boss.ts)
// and their bits in the top bar (src/ui/seasonHud.ts). main.ts only calls a few hooks.

import type { Container } from 'pixi.js';
import type { Particles } from '../core/fx';
import { sfx } from '../core/audio';
import { installPerks, rollDraft } from '../core/perks';
import { MOON_LEVELS, canPickHeat, draftSize, installMoon, setHeat } from '../core/moon';
import { installBoss } from '../core/boss';
import type { EveningResult, GameState } from '../core/state';
import type { RoomScene } from '../world/room';
import { BossDirector } from './boss';
import { DraftPanel } from './draft';
import { MoonDialPanel } from './moonDial';
import { SeasonHud } from './seasonHud';

interface Overlay {
  view: Container;
  resize(w: number, h: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

export interface SeasonHost {
  showOverlay(o: Overlay): void;
  closeOverlay(): void;
  toast(text: string): void;
  modal(title: string, body: HTMLElement, close: () => void): void;
  particles: Particles;
  /** Screen-space layer above games (the particle layer). */
  layer: Container;
  screen(): { w: number; h: number; top: number };
  room(): RoomScene | null;
  mode(): string;
  leaveGame(): void;
  gameBusy(): boolean;
}

/** What the debug panel can do (see src/ui/debug.ts). */
export let seasonDebug: Season | null = null;

export class Season {
  readonly boss: BossDirector;
  readonly hud: SeasonHud;
  /** Messages from perks that came while a menu was up; shown once play goes on. */
  private notes: string[] = [];
  private busy = false;

  constructor(
    private state: GameState,
    private host: SeasonHost,
  ) {
    installPerks(state, (t) => this.note(t));
    installMoon(state);
    installBoss(state);
    this.boss = new BossDirector(state, host);
    this.hud = new SeasonHud(state, {
      showPerks: (body) => host.modal('Glücksbringer-Kette', body, () => undefined),
      openDial: () => this.openDial(),
      canDial: () => canPickHeat(state.data) && host.mode() === 'room',
    });
    seasonDebug = this;
  }

  private note(t: string) {
    const m = this.host.mode();
    if (m === 'room' || m === 'game') this.host.toast(t);
    else this.notes.push(t);
  }

  /** Every frame. */
  update() {
    this.boss.update();
    const m = this.host.mode();
    if (this.notes.length && (m === 'room' || m === 'game')) for (const t of this.notes.splice(0)) this.host.toast(t);
  }

  /** Right after state.endEvening(): a passed day (not the season's end) earns a draft. Saved at once. */
  dayEnded(r: EveningResult) {
    if (r.passed && !r.seasonWon) this.state.data.draft = rollDraft(this.state.data, draftSize(this.state.data));
  }

  /** After the recap: the draft if one is waiting, then `next`. */
  afterRecap(next: () => void) {
    if (!this.state.data.draft?.length) return next();
    this.showDraft(next);
  }

  /** On arrival or after loading: a pending draft, or the moon dial at a fresh season. */
  resume() {
    if (this.busy || this.host.mode() !== 'room') return;
    if (this.state.data.draft?.length) this.showDraft(() => undefined);
    else if (canPickHeat(this.state.data)) this.openDial();
  }

  showDraft(next: () => void) {
    if (this.busy) return;
    const d = this.state.data;
    if (!d.draft?.length) d.draft = rollDraft(d, draftSize(d));
    this.busy = true;
    sfx.shimmer();
    this.host.showOverlay(
      new DraftPanel(this.state, this.host.particles, (perk, bonus) => {
        this.busy = false;
        this.host.closeOverlay();
        this.host.toast(`${perk.name}: ${perk.desc}${bonus > 0 ? ` Heute schon +${bonus.toLocaleString('de-DE')} Falter.` : ''}`);
        next();
      }),
    );
  }

  openDial() {
    if (this.busy) return;
    this.busy = true;
    sfx.chime();
    this.host.showOverlay(
      new MoonDialPanel(this.state, (lv) => {
        this.busy = false;
        setHeat(this.state, lv);
        this.host.closeOverlay();
        sfx.shimmer();
        this.host.toast(lv > 0 ? `Mondstufe ${lv} (${MOON_LEVELS[lv].name}): Ziele +${lv * 12} %, mehr Mondsteine. Viel Glück!` : 'Normale Saison. Viel Glück!');
      }),
    );
  }

  // ---- Debug -------------------------------------------------------------------------------------

  debugDraft() {
    const d = this.state.data;
    d.draft = rollDraft(d, draftSize(d));
    if (this.host.mode() === 'room') this.showDraft(() => undefined);
  }

  debugHeat(level: number) {
    const d = this.state.data;
    d.heatUnlocked = Math.max(d.heatUnlocked, level);
    setHeat(this.state, level);
  }
}
