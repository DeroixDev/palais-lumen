// Works under strict Content-Security-Policy (no eval), e.g. when embedded.
import 'pixi.js/unsafe-eval';
import { showDevlog } from './ui/devlog';
import { Application, Container, Filter, Graphics, Sprite, Texture } from 'pixi.js';
import './games';
import './rooms';
import { getGame, getRoom, mainRoomOf, type GameInstance, type StationPlacement } from './core/registry';
import { BOSS_DAY, GameState, formatChips, newSave, type SaveData } from './core/state';
import { latestSave, readSlot, writeSlot } from './core/save';
import { closeStaleRun, installDaily, isDailyRun, newDailySave, todayKey } from './core/daily';
import { installLongRun } from './core/longRun';
import { LearnPage, addLearnButton } from './ui/learn';
import type { DailyStart } from './ui/dailyBoard';
import { COLORS, Particles, purse, rewardLevel, setRenderer, shake } from './core/fx';
import { animate, cancelAllTweens, ease, tween, updateTweens, wait } from './core/tween';
import { sfx } from './core/audio';
import { RoomScene, type Interactable } from './world/room';
import { useClubProp } from './world/clubUse';
import { ElevatorPanel, floorTitle } from './ui/elevator';
import { Hud } from './ui/hud';
import { Recap } from './ui/recap';
import { Vitrine } from './ui/vitrine';
import { Lobby } from './ui/lobby';
import { Street, type StreetMood } from './world/street';
import { ShopPanel } from './ui/shop';
import { WardrobePanel } from './ui/wardrobe';
import { PianoPanel } from './ui/piano';
import { dayCard } from './ui/dayCard';
import { scheduleStrip } from './ui/schedule';
import { DayFeatures } from './ui/dayFeatures';
import { Season } from './ui/season';
import { StampCardPanel } from './ui/stampCard';
import { setupFeel } from './ui/feel';
import { initFocus } from './core/focus';
import { installRotation } from './core/rotation';
import { installMiniboss } from './core/miniboss';
import { MinibossDirector } from './ui/miniboss';
import { BossRun } from './ui/bossRun';
import { Bag } from './ui/bag';
import { AlbumFeature } from './ui/album';
import { installStory } from './core/story';
import { showChapterIfDue } from './ui/chapter';
import { installDebugLuck } from './core/debugLuck';

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
  installRotation(state);
  // Mini bosses on days 3, 6, 9, 12; before the events and tasks, so their day setup comes first.
  installMiniboss(state);
  installDaily(state);
  installLongRun(state);
  installStory(state);
  // Mod-Menü cheats (Gewinnchance, stake/goal factors, speed); neutral unless set in the menu.
  installDebugLuck(state);
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
    // The daily challenge saves under its own key, never over the normal run.
    writeSlot(state.data.dailySeed ? 'daily' : 'auto', state.data);
  };
  // Boss day: every Falter won is a hit on the Moth Queen.
  let bossProfit = 0;
  let goalShown = state.goalReached;
  state.onChange(() => {
    const p = state.eveningProfit;
    if (state.data.evening.number >= BOSS_DAY && room?.def.floor === 5 && p > bossProfit) room.bossHit();
    bossProfit = p;
    // The goal is a fixed end balance; say so the moment it's in, once per day.
    const reached = state.goalReached;
    if (reached && !goalShown && mode !== 'title' && state.data.evening.number < BOSS_DAY) {
      hud.toast(`Tagesziel erreicht: ${formatChips(state.goalBalance)} Falter! Jeder weitere Falter bringt eine bessere Medaille.`);
      sfx.medal();
    }
    goalShown = reached;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(autosave, 1200);
    checkRescue();
    if (mode !== 'title') {
      for (const a of state.checkAchievements()) {
        hud.achievementToast(a);
        sfx.medal();
        room?.refreshAchievements();
      }
    }
  });
  window.addEventListener('beforeunload', autosave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && autosave());

  let brokeOpen = false;
  let brokeTimer = 0;
  /**
   * Out of Falter: the day can only be settled, and that ends the season. Checked again
   * when the timer fires, and only once no round is running, so an all-in can still win.
   */
  function checkRescue() {
    if (brokeOpen || brokeTimer || state.balance >= 10) return;
    brokeTimer = window.setTimeout(brokeCheck, 900);
  }
  function brokeCheck() {
    brokeTimer = 0;
    if (brokeOpen || state.balance >= 10) return;
    if ((game && game.busy()) || mode === 'title' || mode === 'overlay' || mode === 'transition' || hud.modalOpen) {
      brokeTimer = window.setTimeout(brokeCheck, 500);
      return;
    }
    brokeOpen = true;
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
    // Transitions fade through the velvet dark of the house, not flat black.
    fade.clear().rect(0, 0, w, h).fill(0x0b0609);
    if (mode !== 'game' && mode !== 'transition') room?.resize(w, h);
    game?.resize(w, h - TOP);
    overlay?.resize(w, h);
    days.layout(w, h, TOP);
    run.layout(w, h, TOP);
    street?.resize(w, h);
    feel.resize(w, h);
  }
  window.addEventListener('resize', () => requestAnimationFrame(layout));

  // ---- Rooms ------------------------------------------------------------

  function enterRoom(id: string) {
    room?.destroy();
    const def = getRoom(id);
    state.data.roomId = def.id;
    room = new RoomScene(def.id, state, onInteract);
    sfx.setFloorMood(def.theme.style);
    hud.setFoyer(def.floor === 0);
    room.topInset = TOP || 64;
    roomLayer.addChild(room.view);
    room.resize(app.screen.width, app.screen.height);
  }

  const roomForFloor = (f: number) => mainRoomOf(f) ?? getRoom('f1');

  /** A floor that opened at the last settlement; the elevator marks it until you go there. */
  let newFloorHint: number | null = null;
  /** The day whose title card was shown (it shows when you first reach a floor that day). */
  let dayCardFor = -1;

  /** Step into the elevator and open the floor panel. `highlight` marks a floor that just opened. */
  async function rideElevator(highlight: number | null = null) {
    if (mode !== 'room') return;
    await room.boardElevator();
    showOverlay(new ElevatorPanel(state, room.def.floor, (f) => void arriveOnFloor(f), highlight ?? newFloorHint));
  }

  /** After the ride: the doors open on the chosen floor and the player steps out. */
  async function arriveOnFloor(f: number) {
    const fresh = f !== room.def.floor;
    if (fresh) fade.alpha = 1;
    overlay?.destroy();
    overlay = null;
    hud.show(true);
    hud.holdToasts(false);
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
    if (f === newFloorHint) newFloorHint = null;
    if (f > 0 && dayCardFor !== state.data.evening.number) {
      dayCardFor = state.data.evening.number;
      // After the floor title has gone, so the two plaques never overlap.
      setTimeout(eveningCard, fresh ? 2500 : 200);
    }
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
    if (i.kind === 'station') {
      // The boss corridor's machines are mandatory: its own rules, never closed.
      if (!run.station(i.station) && days.canPlay(i.station)) void openGame(i.station);
    } else if (i.kind === 'extra') {
      if (!run.interact(i.id) && !mini.interact(i.id) && !room.regulars?.talk(i.id) && !album.interact(i.id)) days.interact(i.id);
    }
    else if (i.kind === 'shelf') openVitrine();
    else if (i.kind === 'achievements') {
      sfx.door();
      hud.achievements();
    } else if (i.kind === 'use') useProp(i);
    else if (i.kind === 'door') void walkThrough(i.door.to);
    else void rideElevator();
  }

  /** Through a door into another room of the same floor (side rooms, the club's dance floors). */
  async function walkThrough(to: string) {
    if (mode !== 'room') return;
    mode = 'transition';
    const door = room.def.doors?.find((d) => d.to === to);
    const from = room.def.id;
    if (door) await room.leaveThrough(door);
    await tween(fade, { alpha: 1 }, 220);
    state.data.position = { x: -1, y: -1 };
    enterRoom(to);
    layout();
    mode = 'room';
    room.frozen = true;
    void tween(fade, { alpha: 0 }, 320);
    await room.arriveFrom(from);
    room.savePosition();
    autosave();
  }

  const WISHES = ['Das Wasser glitzert kurz golden.', 'Eine Motte nickt dir zu.', 'Irgendwo klingelt ein Glöckchen.', 'Du wünschst dir eine ruhige Hand.', 'Der Brunnen gluckst zufrieden.'];
  const DRINKS = ['Mondschein-Limo', 'Falterfizz mit Minze', 'Holunder-Spritz ohne Alkohol', 'Kirsch-Mocktail', 'Laternen-Eistee'];
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

  /** Piano, fountain, jukebox and all the other things on the floors. */
  function useProp(i: Extract<Interactable, { kind: 'use' }>) {
    const prop = i.prop;
    if (prop === 'fountain') {
      if (state.balance < 11) return hud.toast('Für einen Wunsch brauchst du ein paar Falter mehr.');
      if (!room.use(i, false)) return;
      // The wish costs a Falter, but it doesn't count against today's goal.
      state.data.balance -= 1;
      state.data.evening.startBalance -= 1;
      void room.tossCoin(i.cx + (Math.random() - 0.5) * 30, i.cy + (Math.random() - 0.5) * 20).then(() => {
        i.poke?.();
        sfx.wish();
        room.floatText('✦', i.cx, i.cy - 30, 0x9fe8ff);
        if (Math.random() < 0.5) hud.toast(pick(WISHES));
      });
      state.count('prop:fountain');
      state.count('wish');
      return;
    }
    if (!room.use(i)) return;
    if (prop !== 'shopCounter' && prop !== 'wardrobe' && prop !== 'reception') state.count(`prop:${prop}`);
    const y = i.cy - 40;
    switch (prop) {
      case 'shopCounter':
        sfx.till();
        showOverlay(new ShopPanel(state, particles, (t) => hud.toast(t), closeOverlay));
        break;
      case 'wardrobe':
        sfx.rustle();
        showOverlay(
          new WardrobePanel(state, (t) => hud.toast(t), (changed) => {
            closeOverlay();
            if (!changed) return;
            room.refreshLook();
            const p = room.toScreen(room.player.view.x, room.player.view.y - 20);
            particles.sparkle(p.x, p.y, 30, 0xff9ac0, 200);
            hud.toast('Neuer Look!');
          }),
        );
        break;
      case 'plaque':
        void openLearn();
        break;
      case 'reception':
        sfx.deskBell();
        mode = 'overlay';
        room.frozen = true;
        lobby.showParty(() => {
          mode = 'room';
          room.frozen = false;
          room.refreshLook();
          autosave();
        });
        break;
      case 'piano':
        showOverlay(
          new PianoPanel(
            () => {
              state.count('piano');
              i.poke?.();
            },
            (name) => {
              hud.toast(`Bravo! „${name}“ ganz durchgespielt.`);
              state.count('song');
            },
            closeOverlay,
          ),
        );
        break;
      case 'jukebox': {
        const name = sfx.nextRecord();
        sfx.click();
        state.count('jukebox');
        room.floatText('♫', i.cx, y);
        hud.toast(`Jukebox: ${name}${sfx.musicOn ? '' : ' (Musik ist gerade aus)'}`);
        break;
      }
      case 'bar':
        sfx.fizz();
        room.floatText('Prost!', i.cx, y, 0x7bd47b, 22);
        hud.toast(`Du bekommst: ${pick(DRINKS)}.`);
        break;
      case 'champagne':
        sfx.clink();
        room.floatText('Prost!', i.cx, y, COLORS.lamp, 22);
        hud.toast('Prickelnder Traubensaft, ganz ohne Alkohol.');
        break;
      case 'clockTower':
        sfx.chime();
        room.floatText('♪', i.cx, y);
        break;
      case 'boiler':
        sfx.steamWhistle();
        break;
      case 'moonPool':
        sfx.shimmer();
        room.floatText('☾', i.cx, y, 0xfff1c4, 30);
        break;
      case 'lanternPost':
        sfx.rustle();
        break;
      case 'crystal':
        sfx.shimmer();
        room.floatText('✦', i.cx, y, 0x9fe8ff);
        break;
      case 'brazier':
        sfx.whoosh();
        for (let k = 0; k < 3; k++) setTimeout(() => room.floatText('✦', i.cx + (Math.random() - 0.5) * 30, y + 10, 0xffa94a, 20), k * 120);
        break;
      case 'iceSwan':
        sfx.shimmer();
        room.floatText('✦', i.cx, y, 0xdff6ff);
        hud.toast('Der Eisschwan glitzert im Kerzenlicht.');
        break;
      default:
        useClubProp(prop, i.cx, i.cy, { floatText: (t, x, yy, c, sz) => room.floatText(t, x, yy, c, sz), toast: (t) => hud.toast(t) });
    }
  }

  // ---- Games ------------------------------------------------------------

  async function openGame(st: StationPlacement) {
    mode = 'transition';
    room.frozen = true;
    room.savePosition();
    const def = getGame(st.game);
    state.count(`game:${st.game}`);
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
    game = def.create(run.wrap(st, {
      state,
      sfx,
      particles,
      renderer: app.renderer,
      options: st.options ?? {},
      shake: (s = 12) => void shake(gameLayer, s),
      toast: (t) => hud.toast(t),
      celebrate: (mult, x, y, orbit) => celebrate(mult, x, y, orbit),
      exit: () => void closeGame(),
    }));
    gameLayer.position.set(0, TOP);
    game.resize(w, h - TOP);
    gameLayer.addChild(game.view);
    game.view.alpha = 0;
    await tween(game.view, { alpha: 1 }, 250);
    hud.setInGame(true);
    bag.setGame(st.game);
    feel.gameOpened(st.game);
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
    bag.setGame(null);
    feel.gameOpened(null);
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

  /**
   * The shared win celebration, so every game feels like the same casino. It follows the
   * reward ladder of the UI guide: small = coins fly into the purse; medium (10×) = plus a
   * wave of light at the table; big (20×) = plus the moth swarm (the game itself runs the
   * stage moment with the title); jackpot (50×) = plus coin rain and the only shake.
   */
  function celebrate(mult: number, x: number, y: number, orbit?: { x: number; y: number; r: number }) {
    const level = rewardLevel(mult);
    bag.winAt(x, y);
    feel.celebrate(mult);
    if (!level) return;
    const w = app.screen.width;
    if (level === 1) {
      sfx.win();
      particles.sparkle(x, y, 10, COLORS.lamp, 120);
      particles.coinsToPurse(x, y, Math.min(8, 3 + Math.round(mult * 1.5)));
      return;
    }
    if (level === 2) {
      sfx.win();
      particles.lightWave(x, y, COLORS.lamp, Math.min(w, app.screen.height) * 0.42);
      particles.sparkle(x, y, 18, COLORS.lamp, 200);
      particles.coinsToPurse(x, y, 12);
      return;
    }
    sfx.bigWin();
    particles.lightWave(x, y, level === 4 ? 0xfff1c4 : COLORS.lamp, Math.min(w, app.screen.height) * 0.55);
    if (level === 3) {
      particles.mothSwarm(x, y, 20, orbit ?? null, COLORS.lamp);
      particles.coinBurst(x, y, 22);
      particles.coinsToPurse(x, y, 16);
      return;
    }
    setTimeout(() => sfx.bigWin(), 900);
    void shake(gameLayer, 8, 300);
    particles.mothSwarm(x, y, 40, orbit ?? null, 0xfff1c4, 4.5);
    particles.coinRain(w, 110);
    particles.coinsToPurse(x, y, 24);
  }

  // ---- Overlays ---------------------------------------------------------

  function showOverlay(o: Overlay) {
    overlay = o;
    mode = 'overlay';
    room.frozen = true;
    overlayLayer.addChild(o.view);
    o.resize(app.screen.width, app.screen.height);
    hud.show(false);
    // Full panels keep the toasts waiting; the shop, wardrobe and piano answer with toasts.
    hud.holdToasts(!(o instanceof ShopPanel || o instanceof WardrobePanel || o instanceof PianoPanel));
  }

  function closeOverlay() {
    overlay?.destroy();
    overlay = null;
    room.frozen = false;
    mode = 'room';
    room.refreshShelf();
    room.refreshAchievements();
    hud.show(true);
    hud.holdToasts(false);
    layout();
  }

  /** "Wie das Haus gewinnt" (src/ui/learn.ts), from the HUD menu and the foyer plaque. */
  async function openLearn() {
    if (mode === 'game') {
      if (game?.busy()) return hud.toast('Warte kurz, die Runde läuft noch.');
      await closeGame();
    }
    if (mode !== 'room') return;
    showOverlay(new LearnPage(state, closeOverlay));
  }
  addLearnButton(() => void openLearn());

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
    season.dayEnded(result);
    autosave();
    showOverlay(
      new Recap(result, sfx, particles, () => {
        closeOverlay();
        room.refreshShelf();
        autosave();
        // A new day gets its title card, a new floor sends you to the elevator,
        // and a new season starts with a new arrival.
        if (state.data.dailySeed && (result.seasonWon || (!result.passed && !result.rescued))) void leaveDaily();
        // After a win against the Queen the house's story goes on (src/ui/chapter.ts).
        else if (result.seasonWon && showChapterIfDue(state, showOverlay, () => { closeOverlay(); void arrival('clear'); })) return;
        else if (result.seasonWon || (!result.passed && !result.rescued)) void arrival(result.seasonWon ? 'clear' : 'rain');
        else season.afterRecap(() => void toFoyer(result.newFloor, result.bonus));
      }),
    );
  }

  /** After a day: ride down to the foyer. A floor that just opened is marked in the elevator. */
  async function toFoyer(newFloor: number, bonus: number) {
    mode = 'transition';
    room.frozen = true;
    await tween(fade, { alpha: 1 }, 300);
    newFloorHint = newFloor || null;
    state.data.position = { x: -1, y: -1 };
    enterRoom('foyer');
    layout();
    mode = 'room';
    room.frozen = true;
    void tween(fade, { alpha: 0 }, 400);
    await room.exitElevator();
    autosave();
    if (bonus > 0) hud.toast(`Glücksbringer: +${bonus} Falter zum Start von Tag ${state.data.evening.number}.`);
    setTimeout(() => {
      const f = state.topFloor;
      hud.toast(newFloor ? `Etage ${newFloor} ist offen! Der Aufzug bringt dich hin.` : `Tag ${state.data.evening.number} wartet auf Etage ${f}. Nimm den Aufzug, wenn du bereit bist.`);
    }, bonus > 0 ? 900 : 300);
  }

  /** Debug: start `day` fresh with the current money and walk out of the elevator in the foyer. */
  async function debugDay(day: number) {
    if (mode === 'title' || mode === 'transition') return;
    if (game) await closeGame();
    if (overlay) closeOverlay();
    state.data.evening = { number: day, startBalance: state.data.balance, quota: 0 };
    state.beginDay();
    dayCardFor = -1;
    await toFoyer(0, 0);
  }

  // ---- Loading ----------------------------------------------------------

  function loadSave(data: SaveData) {
    if (game) {
      game.destroy();
      game = null;
      hud.setInGame(false);
      bag.setGame(null);
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
    season.resume();
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
      state.beginDay();
      if (mode !== 'title') hud.toast('Neues Spiel gestartet. Viel Glück!');
    },
    debugDay: (day) => void debugDay(day),
    debugOpenGame: (id) => {
      if (mode === 'title' || mode === 'transition') return;
      void (async () => {
        if (game) await closeGame();
        if (overlay) closeOverlay();
        if (mode !== 'room') return;
        const g = getGame(id);
        const p = room.player.view.position;
        void openGame({ game: id, x: Math.round(p.x - g.footprint.w / 2), y: Math.round(p.y - g.footprint.h), label: g.name, options: {} });
      })();
    },
    debugToRoom: (id) => {
      if (mode === 'title' || mode === 'transition') return;
      void (async () => {
        if (game) await closeGame();
        if (overlay) closeOverlay();
        if (mode !== 'room') return;
        state.data.position = { x: -1, y: -1 };
        enterRoom(id);
        layout();
      })();
    },
  });

  // Modifier items: the bag in the HUD, reaction offers, round stones (src/ui/bag.ts).
  const bag = new Bag(state, {
    toast: (t) => hud.toast(t),
    modal: (title, body, buttons) => hud.modal(title, body, buttons),
    closeModal: () => hud.closeModal(),
    modalOpen: () => hud.modalOpen,
    busy: () => !!game?.busy(),
    gameName: (id) => {
      try {
        return getGame(id).name;
      } catch {
        return id;
      }
    },
  });

  // Day events, guest tasks and the stamp card (src/ui/dayFeatures.ts).
  const days = new DayFeatures(state, { toast: (t) => hud.toast(t), showOverlay, closeOverlay, game: () => (mode === 'game' ? feel.game : null), gameBusy: () => !!game?.busy(), leaveGame: () => void closeGame() });
  app.stage.addChildAt(days.view, app.stage.getChildIndex(overlayLayer));

  // Boss corridor on floor 5: one try per machine, gates, the Queen's duel (src/ui/bossRun.ts).
  const run = new BossRun(state, { room: () => room ?? null, mode: () => mode, openGame: (st) => void openGame(st), leaveGame: () => void closeGame(), gameBusy: () => !!game?.busy(), toast: (t) => hud.toast(t), endEvening: () => void endEvening() });
  app.stage.addChildAt(run.view, app.stage.getChildIndex(overlayLayer));

  // Moth album: moths after wins, the catch card and the album book (src/ui/album.ts).
  const album = new AlbumFeature(state, { particles, toast: (t) => hud.toast(t), showOverlay, closeOverlay, mode: () => mode, screen: () => ({ w: app.screen.width, h: app.screen.height, top: TOP }), modalOpen: () => hud.modalOpen });
  app.stage.addChildAt(album.view, app.stage.getChildIndex(overlayLayer));

  // Perk draft, moon levels and the boss phases (src/ui/season.ts).
  const season = new Season(state, {
    showOverlay,
    closeOverlay,
    toast: (t) => hud.toast(t),
    modal: (title, body) => hud.modal(title, body, [{ label: 'Schließen', primary: true, onClick: () => hud.closeModal() }]),
    particles,
    layer: particles.view,
    screen: () => ({ w: app.screen.width, h: app.screen.height, top: TOP }),
    room: () => room ?? null,
    mode: () => mode,
    leaveGame: () => void closeGame(),
    gameBusy: () => !!game?.busy(),
  });

  // Mini bosses: intro, boss plate, rule moments, victory (src/ui/miniboss.ts).
  const mini = new MinibossDirector(state, {
    layer: particles.view,
    screen: () => ({ w: app.screen.width, h: app.screen.height, top: TOP }),
    room: () => room ?? null,
    mode: () => mode,
    game: () => (mode === 'game' ? feel.game : null),
    gameBusy: () => !!game?.busy(),
    leaveGame: () => void closeGame(),
    toast: (t) => hud.toast(t),
    modal: (title, body, buttons) => hud.modal(title, body, buttons),
    closeModal: () => hud.closeModal(),
    modalOpen: () => hud.modalOpen,
    endEvening: () => void endEvening(),
  });

  // Staff quips, photo mode, vibration and floor music (src/ui/feel.ts).
  const feel = setupFeel({ app, state, hud, quipsBelow: overlayLayer, photoBelow: fade, mode: () => mode, room: () => room ?? null, top: () => TOP, layout });
  // Keyboard focus ring, screen-reader mirror of the canvas buttons, dialog focus trap.
  initFocus(app, { below: fade, games: gameLayer, panels: [overlayLayer] }, state);

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (hud.modalOpen) return hud.closeModal();
    if (mode === 'game') void closeGame();
    else if (mode === 'overlay' && (overlay instanceof Vitrine || overlay instanceof ShopPanel || overlay instanceof PianoPanel)) closeOverlay();
    else if (mode === 'overlay' && overlay instanceof WardrobePanel) closeOverlay();
    else if (mode === 'overlay' && overlay instanceof StampCardPanel) closeOverlay();
  });

  enterRoom(state.data.roomId);
  room.frozen = true;
  layout();

  if (import.meta.env.DEV) {
    // Test hooks for automated browser checks (not in the production build).
    (window as any).__nf = {
      state,
      openStation: (roomIdx: number) => openGame(room.def.stations[roomIdx]),
      // Opens any registered game directly (for testing new games without the rotation).
      openGame: (id: string, options: Record<string, unknown> = {}) => openGame({ game: id, x: 0, y: 0, label: getGame(id).name, options }),
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
      // Jumps straight into any room (side rooms too), for testing.
      toRoom: (id: string) => {
        state.data.position = { x: -1, y: -1 };
        enterRoom(id);
        layout();
      },
      toFoyer: () => {
        state.data.position = { x: -1, y: -1 };
        enterRoom('foyer');
        layout();
      },
      use: (prop: string) => {
        const i = (room as any).interactables.find((x: Interactable) => x.kind === 'use' && x.prop === prop);
        if (i) onInteract(i);
        return !!i;
      },
      overlay: () => overlay,
      arrival: () => arrival(),
      go: () => lobbyGo(),
      mode: () => mode,
      days,
      season,
      run,
      eveningCard: () => eveningCard(),
      feel,
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
    days.update(dt, mode);
    run.update(dt);
    album.update(dt);
    feel.update(dt);
    season.update();
    mini.update(t.deltaMS);
  });

  // ---- Start screen, lobby and arrival -----------------------------------

  function showStreet() {
    if (street) return street;
    street = new Street();
    streetLayer.addChild(street.view);
    street.resize(app.screen.width, app.screen.height);
    return street;
  }

  /** "Tag 3 · Ziel heute 1.250 Falter" plaque at the start of every evening. */
  function eveningCard() {
    const d = state.data;
    const goal = `Ziel heute: ${formatChips(d.evening.startBalance + d.evening.quota)} Falter · Einsätze ab ${formatChips(state.stakeUnit)}`;
    const c = dayCard(`TAG ${d.evening.number}`, goal, app.screen.width, app.screen.height, TOP, days.ribbon(app.screen.width), scheduleStrip(state, room.def, app.screen.width));
    particles.view.addChild(c);
    sfx.win();
  }

  /** Taxi to the door, walk in, then the casino floor. Tap or any key speeds it up. */
  async function arrival(mood: StreetMood = 'drizzle') {
    mode = 'transition';
    if (room) room.frozen = true;
    hud.show(false);
    const st = showStreet();
    st.setMood(mood);
    roomLayer.visible = false;
    lobby.arriving(true);
    sfx.setScene('menu');
    if (fade.alpha > 0) void tween(fade, { alpha: 0 }, 500);
    const skip = () => (timeScale = 6);
    const titleEl = document.getElementById('title')!;
    titleEl.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    const host = state.data.players.host;
    await st.arrive({ ...state.look, color: host?.color ?? COLORS.lamp, skin: host?.skin });
    titleEl.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', skip);
    await tween(fade, { alpha: 1 }, 300);
    timeScale = 1;
    st.destroy();
    street = null;
    lobby.arriving(false);
    lobby.hide();
    state.data.position = { x: -1, y: -1 };
    enterRoom('foyer');
    roomLayer.visible = true;
    hud.show(true);
    layout();
    sfx.setScene('casino');
    room.frozen = true;
    mode = 'room';
    void tween(fade, { alpha: 0 }, 500);
    await room.enterThroughDoor();
    showFloorTitle();
    autosave();
    setTimeout(() => season.resume(), 1400);
    dayCardFor = -1;
    setTimeout(() => hud.toast(`Willkommen im Foyer! Tag ${state.data.evening.number} wartet auf Etage ${state.topFloor}. Der Aufzug ist hinten rechts.`), 1600);
    if (state.data.stats.rounds === 0 && state.data.season.number === 1) setTimeout(() => mode === 'room' && !hud.modalOpen && hud.help(), 3600);
  }

  /** Tagesherausforderung from the start screen: its own save key, seeded by today's date. */
  function startDaily(kind: DailyStart) {
    sfx.unlock();
    autosave();
    const today = todayKey();
    const prev = readSlot('daily');
    // An unfinished counted run of an earlier date counts with what it reached.
    if (prev && prev.dailySeed !== today && isDailyRun(prev)) {
      closeStaleRun(prev);
      writeSlot('daily', prev);
    }
    const resume = kind === 'continue' && prev && prev.dailySeed === today && isDailyRun(prev);
    loadSave(resume ? prev : newDailySave(today, state.data, prev, kind === 'practice'));
    if (!resume) state.beginDay();
    void arrival().then(() => {
      if (state.data.dailySeed) setTimeout(() => hud.toast(`Tagesherausforderung ${today.split('-').reverse().join('.')}: ${kind === 'practice' ? 'Übungslauf, zählt nicht für die Bestenliste.' : 'dein gewerteter Versuch. Viel Glück!'}`), 4200);
    });
  }

  /** A daily run is over: back to the start screen with the normal run loaded and the board open. */
  async function leaveDaily() {
    mode = 'transition';
    if (room) room.frozen = true;
    await tween(fade, { alpha: 1 }, 400);
    autosave();
    const ended = state.data;
    mode = 'title';
    hud.show(false);
    const normal = latestSave();
    loadSave(normal ?? newSave());
    if (!normal) state.beginDay();
    roomLayer.visible = false;
    showStreet().setMood('drizzle');
    sfx.setScene('menu');
    lobby.showDaily(ended);
    void tween(fade, { alpha: 0 }, 500);
  }

  function lobbyGo() {
    sfx.unlock();
    autosave();
    void arrival();
  }

  const lobby = new Lobby(state, {
    openSaves: () => hud.openSaves(),
    go: lobbyGo,
    newGame: () => hud.confirmNewGame(lobbyGo),
    daily: startDaily,
    news: () => showDevlog(hud),
  });
  roomLayer.visible = false;
  showStreet();
  lobby.showMain();
  sfx.setScene('menu');
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

void boot();
