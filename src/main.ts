// Works under strict Content-Security-Policy (no eval), e.g. when embedded.
import 'pixi.js/unsafe-eval';
import { Application, Container, Filter, Graphics, Sprite, Text, Texture } from 'pixi.js';
import './games';
import './rooms';
import { allRooms, getGame, getRoom, type GameInstance, type StationPlacement } from './core/registry';
import { BOSS_DAY, GameState, newSave, type SaveData } from './core/state';
import { latestSave, writeSlot } from './core/save';
import { COLORS, FONT_BODY, FONT_DISPLAY, Particles, banner, glowText, purse, setRenderer, shake, tierFor } from './core/fx';
import { animate, cancelAllTweens, ease, tween, updateTweens, wait } from './core/tween';
import { sfx } from './core/audio';
import { RoomScene, type Interactable } from './world/room';
import { ElevatorPanel, floorTitle } from './ui/elevator';
import { Hud } from './ui/hud';
import { Recap } from './ui/recap';
import { Vitrine } from './ui/vitrine';
import { Lobby } from './ui/lobby';
import { Street } from './world/street';

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
  // Filters (glows) render at the screen's pixel density, otherwise they look blocky on sharp displays.
  Filter.defaultOptions.resolution = 'inherit';
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

  const streetLayer = new Container();
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
  app.stage.addChild(streetLayer, roomLayer, vignette, backdrop, gameLayer, overlayLayer, particles.view, fade);

  /** Space the HTML bar takes at the top of the screen. */
  const hudEl = document.getElementById('hud')!;
  let TOP = 64;
  const measureTop = () => (TOP = hudEl.hidden ? 0 : Math.ceil(hudEl.getBoundingClientRect().height));

  const state = new GameState(latestSave() ?? newSave());
  let mode: Mode = 'title';
  let room!: RoomScene;
  let game: GameInstance | null = null;
  let overlay: Overlay | null = null;
  let street: Street | null = null;
  /** Speeds up the arrival when the player skips it. */
  let timeScale = 1;

  // ---- Saving -----------------------------------------------------------

  let saveTimer = 0;
  const autosave = () => {
    room?.savePosition();
    writeSlot('auto', state.data);
  };
  // Boss day: every Falter won is a hit on the Moth Queen.
  let bossProfit = 0;
  state.onChange(() => {
    const p = state.eveningProfit;
    if (state.data.evening.number >= BOSS_DAY && room?.def.floor === 5 && p > bossProfit) room.bossHit();
    bossProfit = p;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(autosave, 1200);
    checkRescue();
  });
  window.addEventListener('beforeunload', autosave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && autosave());

  let brokeOpen = false;
  /** Out of Falter: the evening can only be settled, and that ends the season. */
  function checkRescue() {
    if (brokeOpen || state.balance >= 10 || (game && game.busy()) || mode === 'title' || mode === 'overlay') return;
    brokeOpen = true;
    setTimeout(() => {
      hud.modal('Keine Falter mehr', 'Damit ist diese Saison vorbei. Deine Trophäen, Medaillen und Rekorde bleiben. Die nächste Saison startet wieder mit 1.000 Falter.', [
        {
          label: 'Abrechnen',
          primary: true,
          onClick: () => {
            hud.closeModal();
            brokeOpen = false;
            void endEvening();
          },
        },
      ]);
    }, 900);
  }

  // ---- Layout -----------------------------------------------------------

  function layout() {
    measureTop();
    const coin = document.querySelector('#hud .coin');
    if (coin && !hudEl.hidden) {
      const r = coin.getBoundingClientRect();
      purse.x = r.left + r.width / 2;
      purse.y = r.top + r.height / 2;
    }
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
    street?.resize(w, h);
  }
  window.addEventListener('resize', () => requestAnimationFrame(layout));

  // ---- Rooms ------------------------------------------------------------

  function enterRoom(id: string) {
    room?.destroy();
    const def = getRoom(id);
    state.data.roomId = def.id;
    room = new RoomScene(def.id, state, onInteract);
    room.topInset = TOP || 64;
    roomLayer.addChild(room.view);
    room.resize(app.screen.width, app.screen.height);
  }

  const roomForFloor = (f: number) => allRooms().find((r) => r.floor === f) ?? getRoom('f1');

  /** Step into the elevator and open the floor panel. `highlight` marks a floor that just opened. */
  async function rideElevator(highlight: number | null = null) {
    if (mode !== 'room') return;
    await room.boardElevator();
    showOverlay(new ElevatorPanel(state, room.def.floor, (f) => void arriveOnFloor(f), highlight));
  }

  /** After the ride: the doors open on the chosen floor and the player steps out. */
  async function arriveOnFloor(f: number) {
    const fresh = f !== room.def.floor;
    if (fresh) fade.alpha = 1;
    overlay?.destroy();
    overlay = null;
    hud.show(true);
    if (fresh) {
      state.data.position = { x: -1, y: -1 };
      enterRoom(roomForFloor(f).id);
    }
    layout();
    room.frozen = true;
    mode = 'room';
    if (fresh) void tween(fade, { alpha: 0 }, 400);
    await room.exitElevator();
    if (fresh) showFloorTitle();
    room.savePosition();
    autosave();
  }

  /** "ETAGE 2 · MONDGARTEN" when you arrive on a floor. */
  function showFloorTitle() {
    const c = floorTitle(room.def);
    const w = app.screen.width;
    const s = Math.min(1, (w * 0.9) / c.width);
    c.scale.set(s * 0.8);
    c.position.set(w / 2, app.screen.height * 0.3);
    c.alpha = 0;
    particles.view.addChild(c);
    void Promise.all([tween(c, { alpha: 1 }, 350), tween(c.scale, { x: s, y: s }, 500, ease.outBack)])
      .then(() => wait(1600))
      .then(() => tween(c, { alpha: 0 }, 500))
      .then(() => c.destroy({ children: true }));
  }

  function onInteract(i: Interactable) {
    if (mode !== 'room' || hud.modalOpen || room.frozen) return;
    if (i.kind === 'station') void openGame(i.station);
    else if (i.kind === 'shelf') openVitrine();
    else void rideElevator();
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
      celebrate: (mult, x, y, orbit) => celebrate(mult, x, y, orbit),
      exit: () => void closeGame(),
    });
    gameLayer.position.set(0, TOP);
    game.resize(w, h - TOP);
    gameLayer.addChild(game.view);
    game.view.alpha = 0;
    await tween(game.view, { alpha: 1 }, 250);
    hud.setInGame(true);
    sfx.setScene('game');
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
    sfx.setScene('casino');
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

  /** The shared win celebration, so every game feels like the same casino. */
  function celebrate(mult: number, x: number, y: number, orbit?: { x: number; y: number; r: number }) {
    const tier = tierFor(mult);
    if (!tier) return;
    const w = app.screen.width;
    const h = app.screen.height;
    if (tier === 'small') {
      sfx.win();
      particles.sparkle(x, y, 14, COLORS.lamp, 140);
      particles.coinsToPurse(x, y, Math.min(10, 3 + Math.round(mult * 2)));
      return;
    }
    if (tier === 'big') {
      sfx.bigWin();
      void shake(gameLayer, 9);
      particles.mothSwarm(x, y, 22, orbit ?? null, COLORS.lamp);
      particles.coinBurst(x, y, 26);
      particles.coinsToPurse(x, y, 16);
      void banner(particles.view, 'GROSSER GEWINN', COLORS.neon, w / 2, h * 0.4, w);
      return;
    }
    sfx.bigWin();
    setTimeout(() => sfx.bigWin(), 900);
    void shake(gameLayer, 18, 700);
    particles.mothSwarm(x, y, 48, orbit ?? null, 0xfff1c4, 4.5);
    particles.coinRain(w, 140);
    particles.coinsToPurse(x, y, 26);
    void banner(particles.view, 'JACKPOT!', COLORS.lamp, w / 2, h * 0.4, w);
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
        // A new day gets its title card, a new floor sends you to the elevator,
        // and a new season starts with a new arrival.
        if (result.seasonWon || !result.passed) void arrival();
        else if (result.newFloor) void toNewFloor(result.newFloor);
        else eveningCard();
      }),
    );
  }

  /** A floor just opened: fade, stand at the elevator, ride up with the new floor marked. */
  async function toNewFloor(f: number) {
    mode = 'transition';
    room.frozen = true;
    await tween(fade, { alpha: 1 }, 300);
    room.player.view.position.set(room.def.elevatorX, room.def.spawn.y);
    room.resize(app.screen.width, app.screen.height);
    mode = 'room';
    await tween(fade, { alpha: 0 }, 300);
    eveningCard();
    await wait(1400);
    room.frozen = false;
    await rideElevator(f);
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
    autosave();
    if (mode === 'title') {
      room.frozen = true;
      lobby.showMain();
      return;
    }
    room.frozen = false;
    mode = 'room';
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
      if (mode !== 'title') hud.toast('Neues Spiel gestartet. Viel Glück!');
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
      rideElevator: (h?: number) => rideElevator(h ?? null),
      toFloor: (f: number) => {
        state.data.position = { x: -1, y: -1 };
        enterRoom(roomForFloor(f).id);
        layout();
      },
      room: () => room,
      arrival: () => arrival(),
      go: () => lobbyGo(),
      mode: () => mode,
      app,
    };
  }

  app.ticker.add((t) => {
    const dt = t.deltaMS * timeScale;
    updateTweens(dt);
    street?.update(dt);
    if (mode === 'room') room.update(dt);
    game?.update(dt);
    overlay?.update(dt);
    particles.update(dt);
  });

  // ---- Start screen, lobby and arrival -----------------------------------

  function showStreet() {
    if (street) return street;
    street = new Street();
    streetLayer.addChild(street.view);
    street.resize(app.screen.width, app.screen.height);
    return street;
  }

  /** "Tag 3 · Ziel heute +500 Falter" card at the start of every evening. */
  function eveningCard() {
    const d = state.data;
    const w = app.screen.width;
    const h = app.screen.height;
    const c = new Container();
    const t1 = glowText(`TAG ${d.evening.number}`, { fontFamily: FONT_DISPLAY, fontSize: 76, fill: 0xfff6e6, letterSpacing: 4 }, { color: COLORS.neon, distance: 20, outerStrength: 3 });
    const t2 = new Text({
      text: `Saison ${d.season.number} · Ziel heute: +${d.evening.quota.toLocaleString('de-DE')} Falter`,
      style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: COLORS.lamp, stroke: { color: COLORS.ink, width: 5 } },
    });
    t2.anchor.set(0.5);
    t2.y = 72;
    c.addChild(t1, t2);
    const s = Math.min(1, (w * 0.9) / Math.max(t1.width, t2.width));
    c.scale.set(s * 0.6);
    c.position.set(w / 2, h * 0.38);
    c.alpha = 0;
    particles.view.addChild(c);
    sfx.win();
    void Promise.all([tween(c, { alpha: 1 }, 400), tween(c.scale, { x: s, y: s }, 600, ease.outBack)])
      .then(() => wait(2200))
      .then(() => tween(c, { alpha: 0, y: c.y - 30 }, 600, ease.inCubic))
      .then(() => c.destroy({ children: true }));
  }

  /** Taxi to the door, walk in, then the casino floor. Tap or any key speeds it up. */
  async function arrival() {
    mode = 'transition';
    if (room) room.frozen = true;
    hud.show(false);
    const st = showStreet();
    roomLayer.visible = false;
    lobby.arriving(true);
    sfx.setScene('menu');
    if (fade.alpha > 0) void tween(fade, { alpha: 0 }, 500);
    const skip = () => (timeScale = 6);
    const titleEl = document.getElementById('title')!;
    titleEl.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    const host = state.data.players.host;
    await st.arrive({ color: host?.color ?? COLORS.lamp, skin: host?.skin });
    titleEl.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', skip);
    await tween(fade, { alpha: 1 }, 300);
    timeScale = 1;
    st.destroy();
    street = null;
    lobby.arriving(false);
    lobby.hide();
    state.data.position = { x: -1, y: -1 };
    enterRoom(roomForFloor(state.topFloor).id);
    roomLayer.visible = true;
    hud.show(true);
    layout();
    sfx.setScene('casino');
    room.frozen = true;
    mode = 'room';
    void tween(fade, { alpha: 0 }, 500);
    await room.exitElevator();
    showFloorTitle();
    autosave();
    setTimeout(eveningCard, 1500);
    if (state.data.stats.rounds === 0 && state.data.season.number === 1) setTimeout(() => hud.help(), 3200);
  }

  function lobbyGo() {
    sfx.unlock();
    autosave();
    void arrival();
  }

  const lobby = new Lobby(state, {
    openSaves: () => hud.openSaves(),
    go: lobbyGo,
  });
  roomLayer.visible = false;
  showStreet();
  lobby.showMain();
  sfx.setScene('menu');
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

void boot();
