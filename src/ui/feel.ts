// Wiring for the "feel" of the house: quips from the staff, photo mode, vibration and the
// per-floor music intensity. Keeps main.ts down to a few calls.

import type { Application, Container } from 'pixi.js';
import type { GameState } from '../core/state';
import { sfx } from '../core/audio';
import { haptics } from '../core/haptics';
import type { RoomScene } from '../world/room';
import type { Hud } from './hud';
import { Quips } from './quipView';
import { PhotoMode } from './photo';

export interface FeelHost {
  app: Application;
  state: GameState;
  hud: Hud;
  /** Quip bubbles go just below this layer (the overlays). */
  quipsBelow: Container;
  /** Photo mode goes just below this layer (the fade). */
  photoBelow: Container;
  mode(): string;
  room(): RoomScene | null;
  top(): number;
  /** Re-lays the screen out (after the HUD comes back). */
  layout(): void;
}

export function setupFeel(h: FeelHost) {
  const { app, state, hud } = h;
  haptics.bind(state);

  const quips = new Quips(state, {
    mode: h.mode,
    room: h.room,
    topInset: h.top,
    screen: () => app.screen,
    blocked: () => hud.modalOpen,
  });
  app.stage.addChildAt(quips.view, app.stage.getChildIndex(h.quipsBelow));

  const toasts = document.getElementById('toasts');
  const photo = new PhotoMode({
    app,
    state,
    room: () => h.room()!,
    canEnter: () => h.mode() === 'room' && !!h.room() && !h.room()!.frozen && !hud.modalOpen,
    mode: h.mode,
    chrome: (show) => {
      // Leaving because an overlay or the title took over: they keep the top bar hidden.
      const m = h.mode();
      hud.show(show && m !== 'overlay' && m !== 'title');
      if (toasts) toasts.style.visibility = show ? '' : 'hidden';
      quips.hidden = !show;
      if (show && m !== 'overlay' && m !== 'title') h.layout();
    },
    modal: (title, body, buttons) => hud.modal(title, body, buttons),
    closeModal: () => hud.closeModal(),
    modalOpen: () => hud.modalOpen,
    toast: (t) => hud.toast(t, '', true),
  });
  app.stage.addChildAt(photo.view, app.stage.getChildIndex(h.photoBelow));
  document.getElementById('btn-photo')?.addEventListener('click', () => photo.open());

  // "Vibration" key in the HUD menu.
  const vib = document.getElementById('btn-haptics');
  const syncVib = () => {
    if (!vib) return;
    const on = haptics.on;
    vib.querySelector('.lbl')!.textContent = on ? 'Vibration an' : 'Vibration aus';
    vib.setAttribute('aria-pressed', String(on));
    vib.title = haptics.supported ? '' : 'Dieses Gerät kann nicht vibrieren.';
  };
  vib?.addEventListener('click', () => {
    haptics.set(!haptics.on);
    sfx.click();
    syncVib();
  });
  syncVib();

  // The throne floor's music pushes harder in the boss phases.
  state.onChange(() => {
    syncVib();
    const r = h.room();
    sfx.setIntensity(r && r.def.floor === 5 ? state.data.bossPhase : 0);
  });

  return {
    quips,
    photo,
    /** Id of the open game, or null. */
    game: null as string | null,
    /** A game opened (its id) or closed (null). */
    gameOpened(id: string | null) {
      this.game = id;
      quips.setGame(id);
    },
    /** The shared win celebration ran with this multiple. */
    celebrate(mult: number) {
      if (mult >= 20) quips.stage();
    },
    update(dtMs: number) {
      quips.update(dtMs);
      photo.update(dtMs);
    },
    resize(w: number, hgt: number) {
      photo.resize(w, hgt);
    },
  };
}
