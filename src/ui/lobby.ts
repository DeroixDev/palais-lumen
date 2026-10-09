// Start menu (HTML over the street scene) and the group card at the foyer reception, where
// players gather: for now it has your seat, the other three are kept for coop.

import { formatChips, quotaFor, type GameState } from '../core/state';
import { sfx } from '../core/audio';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export const PLAYER_COLORS = [0xffcf7a, 0xff5fa2, 0x5fe3ff, 0x7bd47b, 0xc9a0ff, 0xffa94a];
export const SKINS = [0xf1c9a5, 0xe8b48a, 0xc68a5e, 0x8d5a3b, 0x6b4127];

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export interface LobbyActions {
  openSaves(): void;
  go(): void;
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

  /** Main menu: logo and buttons. */
  showMain() {
    const t = $('#title');
    t.hidden = false;
    t.classList.remove('out', 'arriving');
    $('#menu-main').hidden = false;
    $('#menu-lobby').hidden = true;
    $('#skip-hint').hidden = true;
    const d = this.state.data;
    const fresh = d.stats.rounds === 0 && d.evening.number === 1 && d.season.number === 1;
    $('#m-play').textContent = fresh ? 'Spielen' : 'Weiterspielen';
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
    $('#lobby-info').textContent = `Saison ${d.season.number} · Tag ${d.evening.number} · Ziel heute +${formatChips(d.evening.quota || quotaFor(d.evening.number))} Falter${rec}`;
  }

  private drawAvatar() {
    const cv = $<HTMLCanvasElement>('#lobby-avatar');
    const c = cv.getContext('2d')!;
    const h = this.host;
    c.clearRect(0, 0, cv.width, cv.height);
    const g = c.createRadialGradient(60, 70, 4, 60, 70, 70);
    g.addColorStop(0, hex(h.color) + '55');
    g.addColorStop(1, '#00000000');
    c.fillStyle = g;
    c.fillRect(0, 0, 120, 150);
    // Legs, jacket, shirt, bow tie, head, hair.
    c.fillStyle = '#1b1b22';
    c.fillRect(46, 100, 11, 40);
    c.fillRect(63, 100, 11, 40);
    const look = this.state.look;
    c.fillStyle = hex(look.jacket);
    c.beginPath();
    c.roundRect(38, 52, 44, 56, 12);
    c.fill();
    c.strokeStyle = hex(h.color);
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = '#fff6e6';
    c.beginPath();
    c.moveTo(53, 52);
    c.lineTo(67, 52);
    c.lineTo(60, 76);
    c.fill();
    c.fillStyle = hex(h.color);
    c.beginPath();
    c.moveTo(53, 56);
    c.lineTo(67, 62);
    c.lineTo(67, 56);
    c.lineTo(53, 62);
    c.fill();
    c.fillStyle = hex(h.skin ?? SKINS[1]);
    c.beginPath();
    c.arc(60, 36, 17, 0, Math.PI * 2);
    c.fill();
    if (look.hairStyle !== 'bald') {
      c.fillStyle = hex(look.hair);
      c.beginPath();
      c.ellipse(60, 25, 18, 10, 0, Math.PI, Math.PI * 2);
      c.fill();
    }
    if (look.hat !== 'none') {
      c.fillStyle = hex(look.hatColor);
      c.fillRect(38, 20, 44, 5);
      c.fillRect(46, look.hat === 'topHat' ? 0 : 10, 28, look.hat === 'topHat' ? 22 : 12);
    }
    c.fillStyle = '#1b1b22';
    c.fillRect(53, 36, 3, 3);
    c.fillRect(64, 36, 3, 3);
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
