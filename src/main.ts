// Works under strict Content-Security-Policy (no eval), e.g. when embedded.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import './games';
import './rooms';
import { getGame, getRoom, type GameInstance, type StationPlacement } from './core/registry';
import { GameState, newSave, type SaveData } from './core/state';
import { latestSave, writeSlot } from './core/save';
import { COLORS, Particles, setRenderer, shake } from './core/fx';
import { animate, cancelAllTweens, ease, tween, updateTweens } from './core/tween';
import { sfx } from './core/audio';
import { RoomScene, WALL_H, type Interactable } from './world/room';
import { Hud } from './ui/hud';
import { Recap } from './ui/recap';
import { Vitrine } from './ui/vitrine';

type Mode = 'title' | 'room' | 'game' | 'overlay' | 'transition';

interface Overlay {
  view: Container;
  resize(w: number, h: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

async function loadFonts() {
  const fonts = Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('600 20px "Barlow Condensed"'), document.fonts.load('700 20px "Barlow Condensed"')]);
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]);
}

function vignetteTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(256, 256, 120, 256, 256, 360);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(8,4,10,0.75)');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 512);
  return Texture.from(cv);
}

async function boot() {
  await loadFonts();
  const app = new Application();
  const host = document.getElementById('stage')!;
  await app.init({
    resizeTo: host,
    background: COLORS.ink,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  host.appendChild(app.canvas);
  // Keep animations in real time even when frames are slow.
  app.ticker.minFPS = 4;
  setRenderer(app.renderer);

  const roomLayer = new Container();
  const vignette = new Sprite(vignetteTexture());
  const backdrop = new Graphics();
  backdrop.alpha = 0;
  const gameLayer = new Container();
  const overlayLayer = new Container();
  const particles = new Particles();
  const fade = new Graphics();
  fade.alpha = 0;
  fade.eventMode = 'none';
  app.stage.addChild(roomLayer, vignette, backdrop, gameLayer, overlayLayer, particles.view, fade);

  /** Space the HTML bar takes at the top of the screen. */
  const hudEl = document.getElementById('hud')!;
  let TOP = 64;
  const measureTop = () => (TOP = hudEl.hidden ? 0 : Math.ceil(hudEl.getBoundingClientRect().height));

  const state = new GameState(latestSave() ?? newSave());
  let mode: Mode = 'title';
  let room!: RoomScene;
  let game: GameInstance | null = null;
  let overlay: Overlay | null = null;

  // ---- Saving -----------------------------------------------------------

  let saveTimer = 0;
  const autosave = () => {
    room?.savePosition();
    writeSlot('auto', state.data);
  };
  state.onChange(() => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(autosave, 1200);
    checkRescue();
  });
  window.addEventListener('beforeunload', autosave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && autosave());

  let rescueOpen = false;
  function checkRescue() {
    if (rescueOpen || state.balance >= 10 || (game && game.busy())) return;
    rescueOpen = true;
    setTimeout(() => {
      hud.modal('Spielgeld alle', 'Kein Problem: Der Nachtfalter spendiert dir 500 Spielgeld, damit es weitergeht. Echtes Geld gibt es hier nie.', [
        {
          label: 'Danke!',
          primary: true,
          onClick: () => {
            hud.closeModal();
            state.rescue();
            particles.coinRain(app.screen.width, 50);
            sfx.bigWin();
            rescueOpen = false;
          },
        },
      ]);
    }, 900);
  }

  // ---- Layout -----------------------------------------------------------

  function layout() {
    measureTop();
    if (room) room.topInset = TOP || 64;
    const w = app.screen.width;
    const h = app.screen.height;
    vignette.width = w;
    vignette.height = h;
    backdrop.clear().rect(0, 0, w, h).fill(0x0b0609);
    fade.clear().rect(0, 0, w, h).fill(0x000000);
    if (mode !== 'game' && mode !== 'transition') room?.resize(w, h);
    game?.resize(w, h - TOP);
    overlay?.resize(w, h);
  }
  window.addEventListener('resize', () => requestAnimationFrame(layout));

  // ---- Rooms ------------------------------------------------------------

  function enterRoom(id: string, fromRoom?: string) {
    room?.destroy();
    const def = getRoom(id);
    if (fromRoom) {
      // Arrive in front of the door that leads back.
      const back = def.doors.find((d) => d.to === fromRoom);
      state.data.position = back ? { x: back.x, y: WALL_H + 60 } : { ...def.spawn };
    }
    state.data.roomId = def.id;
    room = new RoomScene(def.id, state, onInteract);
    room.topInset = TOP || 64;
    roomLayer.addChild(room.view);
    room.resize(app.screen.width, app.screen.height);
  }

  async function switchRoom(id: string) {
    mode = 'transition';
    sfx.door();
    await tween(fade, { alpha: 1 }, 300);
    const from = room.def.id;
    enterRoom(id, from);
    autosave();
    await tween(fade, { alpha: 0 }, 350);
    mode = 'room';
  }

  function onInteract(i: Interactable) {
    if (mode !== 'room' || hud.modalOpen) return;
    if (i.kind === 'station') void openGame(i.station);
    else if (i.kind === 'shelf') openVitrine();
    else {
      const target = getRoom(i.door.to);
      const locked = !!target.unlockCost && !state.data.unlockedRooms.includes(target.id);
      if (!locked) return void switchRoom(target.id);
      const cost = target.unlockCost!;
      const enough = state.balance >= cost;
      hud.modal(
        `${target.name} freischalten`,
        enough
          ? `Die ${target.name} kostet einmalig ${cost.toLocaleString('de-DE')} Spielgeld und bleibt danach in diesem Spielstand offen.`
          : `Dafür brauchst du ${cost.toLocaleString('de-DE')} Spielgeld. Dir fehlen noch ${(cost - state.balance).toLocaleString('de-DE')}.`,
        enough
          ? [
              { label: 'Später', onClick: () => hud.closeModal() },
              {
                label: 'Freischalten',
                primary: true,
                onClick: () => {
                  hud.closeModal();
                  state.unlockRoom(target.id, cost);
                  sfx.medal();
                  void switchRoom(target.id);
                },
              },
            ]
          : [{ label: 'Alles klar', primary: true, onClick: () => hud.closeModal() }],
      );
    }
  }

  // ---- Games ------------------------------------------------------------

  async function openGame(st: StationPlacement) {
    mode = 'transition';
    room.frozen = true;
    room.savePosition();
    const def = getGame(st.game);
    const w = app.screen.width;
    const h = app.screen.height;
    const world = room.world;
    const wx = st.x + def.footprint.w / 2;
    const wy = st.y + def.footprint.h / 2;
    const z0 = world.scale.x;
    const p0 = { x: world.x, y: world.y };
    const z1 = z0 * 2.6;
    sfx.whoosh();
    // Zoom the camera into the machine while the backdrop darkens.
    await Promise.all([
      animate(
        480,
        (k) => {
          const z = z0 + (z1 - z0) * k;
          world.scale.set(z);
          const sx = p0.x + wx * z0 + (w / 2 - (p0.x + wx * z0)) * k;
          const sy = p0.y + wy * z0 + (h / 2 - (p0.y + wy * z0)) * k;
          world.position.set(sx - wx * z, sy - wy * z);
        },
        ease.inOutCubic,
      ),
      tween(backdrop, { alpha: 0.9 }, 480, ease.inCubic),
    ]);
    game = def.create({
      state,
      sfx,
      particles,
      renderer: app.renderer,
      options: st.options ?? {},
      shake: (s = 12) => void shake(gameLayer, s),
      toast: (t) => hud.toast(t),
      exit: () => void closeGame(),
    });
    gameLayer.position.set(0, TOP);
    game.resize(w, h - TOP);
    gameLayer.addChild(game.view);
    game.view.alpha = 0;
    await tween(game.view, { alpha: 1 }, 250);
    hud.setInGame(true);
    mode = 'game';
  }

  async function closeGame() {
    if (!game || mode !== 'game') return;
    if (game.busy()) {
      hud.toast('Warte kurz, die Runde läuft noch.');
      return;
    }
    mode = 'transition';
    hud.setInGame(false);
    const g = game;
    game = null;
    await tween(g.view, { alpha: 0 }, 200);
    g.destroy();
    gameLayer.position.set(0, TOP);
    const world = room.world;
    const z1 = world.scale.x;
    const p1 = { x: world.x, y: world.y };
    room.resize(app.screen.width, app.screen.height); // computes the normal camera
    const z0 = world.scale.x;
    const p0 = { x: world.x, y: world.y };
    world.scale.set(z1);
    world.position.set(p1.x, p1.y);
    await Promise.all([
      animate(
        420,
        (k) => {
          world.scale.set(z1 + (z0 - z1) * k);
          world.position.set(p1.x + (p0.x - p1.x) * k, p1.y + (p0.y - p1.y) * k);
        },
        ease.inOutCubic,
      ),
      tween(backdrop, { alpha: 0 }, 420),
    ]);
    room.frozen = false;
    mode = 'room';
    room.refreshShelf();
    autosave();
    checkRescue();
  }

  // ---- Overlays ---------------------------------------------------------

  function showOverlay(o: Overlay) {
    overlay = o;
    mode = 'overlay';
    room.frozen = true;
    overlayLayer.addChild(o.view);
    o.resize(app.screen.width, app.screen.height);
    hud.show(false);
  }

  function closeOverlay() {
    overlay?.destroy();
    overlay = null;
    room.frozen = false;
    mode = 'room';
    room.refreshShelf();
    hud.show(true);
    layout();
  }

  function openVitrine() {
    sfx.door();
    showOverlay(new Vitrine(state, closeOverlay));
  }

  async function endEvening() {
    if (mode === 'game') {
      if (game?.busy()) {
        hud.toast('Warte kurz, die Runde läuft noch.');
        return;
      }
      await closeGame();
    }
    if (mode !== 'room') return;
    const result = state.endEvening();
    autosave();
    showOverlay(
      new Recap(result, sfx, particles, () => {
        closeOverlay();
        room.refreshShelf();
        autosave();
      }),
    );
  }

  // ---- Loading ----------------------------------------------------------

  function loadSave(data: SaveData) {
    if (game) {
      game.destroy();
      game = null;
      hud.setInGame(false);
    }
    if (overlay) closeOverlay();
    cancelAllTweens();
    backdrop.alpha = 0;
    fade.alpha = 0;
    gameLayer.position.set(0, 0);
    particles.clear();
    state.replace(data);
    enterRoom(data.roomId);
    room.frozen = false;
    mode = 'room';
    autosave();
  }

  const hud = new Hud(state, {
    save: (slot) => {
      room.savePosition();
      writeSlot(slot, state.data);
    },
    load: loadSave,
    endEvening: () => void endEvening(),
    leaveGame: () => void closeGame(),
    newGame: () => {
      loadSave(newSave());
      hud.toast('Neues Spiel gestartet. Viel Glück!');
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (hud.modalOpen) return hud.closeModal();
    if (mode === 'game') void closeGame();
    else if (mode === 'overlay' && overlay instanceof Vitrine) closeOverlay();
  });

  enterRoom(state.data.roomId);
  room.frozen = true;
  layout();

  if (import.meta.env.DEV) {
    // Test hooks for automated browser checks (not in the production build).
    (window as any).__nf = {
      state,
      openStation: (roomIdx: number) => openGame(room.def.stations[roomIdx]),
      closeGame,
      endEvening,
      openVitrine,
      switchRoom,
      mode: () => mode,
      app,
    };
  }

  app.ticker.add((t) => {
    const dt = t.deltaMS;
    updateTweens(dt);
    if (mode === 'room' || mode === 'title') room.update(dt);
    game?.update(dt);
    overlay?.update(dt);
    particles.update(dt);
  });

  // ---- Title screen -----------------------------------------------------

  const title = document.getElementById('title')!;
  const cont = document.getElementById('title-continue') as HTMLButtonElement;
  const info = document.getElementById('title-info')!;
  const hasSave = !!latestSave();
  cont.textContent = hasSave ? 'Weiterspielen' : 'Casino betreten';
  info.textContent = hasSave
    ? `Abend ${state.data.evening.number} · ${state.balance.toLocaleString('de-DE')} Spielgeld · ${state.data.trophies.length} Trophäen`
    : 'Du startest mit 1.000 Spielgeld.';
  const start = () => {
    sfx.unlock();
    title.classList.add('out');
    setTimeout(() => (title.hidden = true), 500);
    hud.show(true);
    room.frozen = false;
    mode = 'room';
    layout();
    if (!hasSave) setTimeout(() => hud.help(), 600);
  };
  cont.addEventListener('click', start);
  cont.focus();
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

void boot();
