// Start menu (HTML over the street scene) and the group card at the foyer reception, where
// players gather: for now it has your seat, the other three are kept for coop.

import { formatChips, type GameState, type SaveData } from '../core/state';
import { dailyLine, showDailyBoard, type DailyStart } from './dailyBoard';
import { sfx } from '../core/audio';
import { dark, ellipse, fillInk, glowAt, light, rgb, rim, rrect, shadow, vgrad } from '../world/painted/brush';
import { markButton } from './devlog';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export const PLAYER_COLORS = [0xffcf7a, 0xff5fa2, 0x5fe3ff, 0x7bd47b, 0xc9a0ff, 0xffa94a];
export const SKINS = [0xf1c9a5, 0xe8b48a, 0xc68a5e, 0x8d5a3b, 0x6b4127];

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export interface LobbyActions {
  openSaves(): void;
  go(): void;
  /** Start over from the title screen (asks first). */
  newGame(): void;
  /** Tagesherausforderung: start, practise or continue (src/ui/dailyBoard.ts). */
  daily(kind: DailyStart): void;
  /** The update log (src/ui/devlog.ts). */
  news(): void;
}

export class Lobby {
  constructor(
    private state: GameState,
    private actions: LobbyActions,
  ) {
    $('#m-play').addEventListener('click', () => {
      sfx.unlock();
      sfx.click();
      this.actions.go();
    });
    // Tagesherausforderung: a button under "Spielstände" and one line about today.
    const daily = document.createElement('button');
    daily.id = 'm-daily';
    daily.textContent = 'Tagesherausforderung';
    $('#m-saves').after(daily);
    const line = document.createElement('div');
    line.id = 'daily-line';
    $('#menu-main .menu-btns').after(line);
    daily.addEventListener('click', () => {
      sfx.unlock();
      sfx.click();
      this.showDaily();
    });
    // Neuigkeiten: the update log, with a dot while there is an unread update.
    const news = document.createElement('button');
    news.id = 'm-news';
    news.textContent = 'Neuigkeiten';
    daily.after(news);
    markButton(news);
    news.addEventListener('click', () => {
      sfx.unlock();
      sfx.click();
      this.actions.news();
    });
    // "Neues Spiel" next to "Spielstände" while a game is running.
    const fresh = document.createElement('button');
    fresh.id = 'm-new';
    fresh.textContent = 'Neues Spiel';
    $('#m-saves').before(fresh);
    fresh.addEventListener('click', () => {
      sfx.unlock();
      sfx.click();
      this.actions.newGame();
    });
    $('#m-saves').addEventListener('click', () => {
      sfx.unlock();
      this.actions.openSaves();
    });
    $('#lobby-back').addEventListener('click', () => {
      sfx.click();
      this.showMain();
    });
    $('#lobby-go').addEventListener('click', () => {
      sfx.click();
      const done = this.onPartyDone;
      this.onPartyDone = null;
      this.hideParty();
      done?.();
    });
    const name = $<HTMLInputElement>('#lobby-name');
    name.addEventListener('input', () => {
      this.host.name = name.value.trim() || 'Du';
    });
    this.buildSwatches('#sw-color', PLAYER_COLORS, () => this.host.color, (c) => (this.host.color = c));
    this.buildSwatches('#sw-skin', SKINS, () => this.host.skin ?? SKINS[1], (c) => (this.host.skin = c));
  }

  private onPartyDone: (() => void) | null = null;

  /** The group card, opened at the reception desk in the foyer. */
  showParty(onDone: () => void) {
    this.onPartyDone = onDone;
    const t = $('#title');
    t.hidden = false;
    t.classList.remove('out', 'arriving');
    t.classList.add('party');
    $('#menu-main').hidden = true;
    $('#skip-hint').hidden = true;
    $('#lobby-title').textContent = 'Empfang · Deine Gruppe';
    $('#lobby-go').textContent = 'Fertig';
    this.showLobby();
  }

  private hideParty() {
    $('#menu-lobby').hidden = true;
    const t = $('#title');
    t.classList.remove('party');
    t.hidden = true;
  }

  get partyOpen() {
    return this.onPartyDone !== null;
  }

  private get host() {
    const p = this.state.data.players;
    if (!p.host) p.host = { name: 'Du', color: PLAYER_COLORS[0] };
    return p.host;
  }

  private buildSwatches(sel: string, colors: number[], get: () => number, set: (c: number) => void) {
    const box = $(sel);
    box.innerHTML = '';
    for (const c of colors) {
      const b = document.createElement('button');
      b.style.background = hex(c);
      b.setAttribute('aria-label', hex(c));
      b.addEventListener('click', () => {
        set(c);
        sfx.chip();
        this.refresh();
      });
      box.appendChild(b);
    }
    box.dataset.colors = colors.join(',');
    void get;
  }

  /** The daily challenge card; `justEnded` is a daily run that just finished, for its result. */
  showDaily(justEnded: SaveData | null = null) {
    showDailyBoard(this.state.data, { start: (k) => this.actions.daily(k), close: () => this.showMain() }, justEnded);
  }

  /** Main menu: logo and buttons. */
  showMain() {
    document.getElementById('daily-card')?.remove();
    $('#daily-line').textContent = dailyLine(this.state.data);
    const t = $('#title');
    t.hidden = false;
    t.classList.remove('out', 'arriving');
    $('#menu-main').hidden = false;
    $('#menu-lobby').hidden = true;
    $('#skip-hint').hidden = true;
    const d = this.state.data;
    const fresh = d.stats.rounds === 0 && d.evening.number === 1 && d.season.number === 1;
    $('#m-play').textContent = fresh ? 'Spielen' : 'Weiterspielen';
    $('#m-new').hidden = fresh;
    $('#title-info').textContent = fresh
      ? 'Du startest mit 1.000 Falter.'
      : `Saison ${d.season.number} · Tag ${d.evening.number} · ${formatChips(d.balance)} Falter · ${d.trophies.length} Trophäen`;
    $('#m-play').focus();
  }

  showLobby() {
    $('#menu-main').hidden = true;
    $('#menu-lobby').hidden = false;
    $<HTMLInputElement>('#lobby-name').value = this.host.name === 'Du' ? '' : this.host.name;
    $<HTMLInputElement>('#lobby-name').placeholder = 'Dein Name';
    this.refresh();
    $('#lobby-go').focus();
  }

  private refresh() {
    const h = this.host;
    for (const [sel, value] of [['#sw-color', h.color], ['#sw-skin', h.skin ?? SKINS[1]]] as const) {
      const box = $(sel);
      const colors = (box.dataset.colors ?? '').split(',').map(Number);
      [...box.children].forEach((b, i) => b.setAttribute('aria-pressed', String(colors[i] === value)));
    }
    this.drawAvatar();
    const d = this.state.data;
    const rec = d.records.bestEvening > 0 ? ` · Rekord: ${d.records.bestEvening} ${d.records.bestEvening === 1 ? 'Tag' : 'Tage'}` : '';
    $('#lobby-info').textContent = `Saison ${d.season.number} · Tag ${d.evening.number} · Ziel heute ${formatChips(d.evening.startBalance + d.evening.quota)} Falter (+${formatChips(d.evening.quota)})${rec}`;
  }

  /** The host as a little painted figure in a spotlight: ink outlines, light from the upper left. */
  private drawAvatar() {
    const cv = $<HTMLCanvasElement>('#lobby-avatar');
    const res = 2;
    if (cv.width !== 120 * res) {
      cv.width = 120 * res;
      cv.height = 150 * res;
      cv.style.width = '120px';
      cv.style.height = '150px';
    }
    const c = cv.getContext('2d')!;
    c.setTransform(res, 0, 0, res, 0, 0);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const h = this.host;
    const look = this.state.look;
    const skin = h.skin ?? SKINS[1];
    c.clearRect(0, 0, 120, 150);
    // Spotlight and contact shadow.
    glowAt(c, 60, 78, 58, 70, h.color, 0.32);
    glowAt(c, 60, 52, 30, 30, 0xfff4dc, 0.12);
    shadow(c, 60, 141, 30, 7, 0.6);
    // Legs and shoes.
    for (const x of [46, 63]) {
      rrect(c, x, 98, 11, 40, 4);
      fillInk(c, vgrad(c, 98, 138, 0x1b1b22, 0.15, 0.3), 2);
      ellipse(c, x + 5, 139, 8, 3.5);
      fillInk(c, '#0d0a10', 1.6);
    }
    // Jacket with lapels in the player colour.
    rrect(c, 37, 52, 46, 56, 13);
    fillInk(c, vgrad(c, 52, 108, look.jacket, 0.22, 0.35), 2.4);
    rrect(c, 37, 52, 46, 56, 13);
    rim(c, 0.35, 1.4);
    c.beginPath();
    c.moveTo(52, 52);
    c.lineTo(68, 52);
    c.lineTo(60, 78);
    c.closePath();
    fillInk(c, '#fff6e6', 1.6);
    c.beginPath();
    c.moveTo(52, 52);
    c.lineTo(60, 78);
    c.lineTo(46, 66);
    c.closePath();
    fillInk(c, rgb(dark(look.jacket, 0.25)), 1.4);
    c.beginPath();
    c.moveTo(68, 52);
    c.lineTo(60, 78);
    c.lineTo(74, 66);
    c.closePath();
    fillInk(c, rgb(dark(look.jacket, 0.25)), 1.4);
    // Bow tie.
    c.beginPath();
    c.moveTo(52, 55);
    c.lineTo(60, 59);
    c.lineTo(68, 55);
    c.lineTo(68, 63);
    c.lineTo(60, 59);
    c.lineTo(52, 63);
    c.closePath();
    fillInk(c, vgrad(c, 55, 63, h.color, 0.3, 0.3), 1.4);
    // Head.
    ellipse(c, 60, 35, 17, 17);
    const face = c.createRadialGradient(54, 29, 2, 60, 35, 19);
    face.addColorStop(0, rgb(light(skin, 0.25)));
    face.addColorStop(1, rgb(dark(skin, 0.18)));
    fillInk(c, face, 2.2);
    if (look.hairStyle !== 'bald') {
      c.beginPath();
      c.ellipse(60, 27, 18.5, 11, 0, Math.PI, Math.PI * 2);
      c.quadraticCurveTo(70, 26, 60, 25);
      c.quadraticCurveTo(50, 26, 41.5, 27);
      c.closePath();
      fillInk(c, vgrad(c, 16, 28, look.hair, 0.3, 0.2), 2);
    }
    // Eyes and cheeks.
    c.fillStyle = '#1b1020';
    ellipse(c, 54.5, 37, 1.8, 2.3);
    c.fill();
    ellipse(c, 65.5, 37, 1.8, 2.3);
    c.fill();
    glowAt(c, 50, 42, 4, 3, 0xff7a8a, 0.35);
    glowAt(c, 70, 42, 4, 3, 0xff7a8a, 0.35);
    if (look.hat !== 'none') {
      const top = look.hat === 'topHat';
      rrect(c, 46, top ? 0 : 9, 28, top ? 22 : 13, 4);
      fillInk(c, vgrad(c, top ? 0 : 9, 22, look.hatColor, 0.25, 0.3), 2);
      ellipse(c, 60, 21, 23, 4.5);
      fillInk(c, vgrad(c, 17, 26, look.hatColor, 0.2, 0.35), 2);
    }
  }

  /** Hides the menus but keeps the overlay to catch "skip" taps during the arrival. */
  arriving(on: boolean) {
    const t = $('#title');
    t.hidden = false;
    t.classList.toggle('arriving', on);
    $('#skip-hint').hidden = !on;
  }

  hide() {
    const t = $('#title');
    t.classList.add('out');
    setTimeout(() => (t.hidden = true), 500);
  }
}
