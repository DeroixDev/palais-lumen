// HTML overlay: top bar, toasts and dialogs. Pixi draws the game, the DOM draws the menus.

import { BOSS_DAY, floorForDay, formatChips, quotaFor, type GameState } from '../core/state';
import { allRooms } from '../core/registry';
import { MANUAL_SLOTS, exportCode, importCode, listSlots, type SlotId } from '../core/save';
import type { SaveData } from '../core/state';
import { sfx } from '../core/audio';
import { coinDataUrl } from '../core/fx';
import { ACHIEVEMENTS, type Achievement, type AchievementIcon } from '../core/achievements';
import { stoneDataUrl } from './stone';

const ICON: Record<AchievementIcon, string> = { spin: '🎰', medal: '🏅', floor: '🛗', crown: '👑', star: '⭐', coin: '🪙', bag: '💰', heart: '❤️', note: '🎵', fountain: '⛲', moth: '🦋' };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export interface HudActions {
  save(slot: SlotId): void;
  load(data: SaveData): void;
  endEvening(): void;
  leaveGame(): void;
  newGame(): void;
}

export class Hud {
  private shown = 0;
  private shownStones = 0;
  private inFoyer = false;
  private raf = 0;

  constructor(
    private state: GameState,
    private actions: HudActions,
  ) {
    $('#btn-save').addEventListener('click', () => this.openSaves());
    $('#btn-end').addEventListener('click', () => this.confirmEndEvening());
    $('#btn-back').addEventListener('click', () => this.actions.leaveGame());
    const mute = $('#btn-mute');
    const syncMute = () => {
      mute.textContent = sfx.muted ? 'Ton aus' : 'Ton an';
      mute.setAttribute('aria-pressed', String(!sfx.muted));
    };
    syncMute();
    mute.addEventListener('click', () => {
      sfx.setMuted(!sfx.muted);
      syncMute();
    });
    const music = $('#btn-music');
    const syncMusic = () => {
      music.querySelector('.long')!.textContent = sfx.musicOn ? 'Musik an' : 'Musik aus';
      music.setAttribute('aria-pressed', String(sfx.musicOn));
      music.style.opacity = sfx.musicOn ? '1' : '0.6';
    };
    syncMusic();
    music.addEventListener('click', () => {
      sfx.unlock();
      sfx.setMusic(!sfx.musicOn);
      syncMusic();
    });
    $('#btn-help').addEventListener('click', () => this.help());
    state.onChange(() => this.render());
    // Brand coin in the purse, and a little bump whenever a coin lands in it.
    const coinUrl = coinDataUrl(96);
    document.querySelectorAll<HTMLElement>('.coin').forEach((el) => (el.style.backgroundImage = `url(${coinUrl})`));
    const purseEl = document.querySelector('.purse') as HTMLElement;
    window.addEventListener('purse-bump', () => {
      purseEl.classList.remove('bump');
      void purseEl.offsetWidth;
      purseEl.classList.add('bump');
      sfx.tick();
    });
    ($('.stone-ic') as HTMLElement).style.backgroundImage = `url(${stoneDataUrl(64)})`;
    this.shownStones = state.data.moonstones;
    this.shown = state.balance;
    this.render();
  }

  show(on: boolean) {
    $('#hud').hidden = !on;
  }

  /** In the foyer the day hasn't started, so there is nothing to settle. */
  setFoyer(on: boolean) {
    $('#hud').classList.toggle('foyer', on);
    this.inFoyer = on;
    this.render();
  }

  setInGame(on: boolean) {
    $('#btn-back').hidden = !on;
  }

  render() {
    const d = this.state.data;
    const profit = this.state.eveningProfit;
    const ratio = Math.max(0, profit / d.evening.quota);
    const day = d.evening.number;
    const floor = floorForDay(day);
    const boss = day >= BOSS_DAY;
    const floorName = allRooms().find((r) => r.floor === floor)?.name ?? '';
    $('#ev-num').textContent = this.inFoyer ? `Foyer · Tag ${day} auf Etage ${floor}` : boss ? `Tag ${day} · Boss` : `Tag ${day} · Etage ${floor}`;
    $('#ev-num').title = `Saison ${d.season.number} · Etage ${floor}: ${floorName}`;
    $('#ev-bar').classList.toggle('boss', boss);
    if (boss) {
      // On the boss day the goal bar is the Moth Queen's life: every Falter won hurts her.
      const hp = Math.max(0, d.evening.quota - Math.max(0, profit));
      $('#ev-goal').textContent = hp > 0 ? `Königin: ${formatChips(hp)}` : 'Königin besiegt!';
      $('#ev-fill').style.width = `${(hp / d.evening.quota) * 100}%`;
    } else {
      $('#ev-goal').textContent = `${profit >= 0 ? '+' : '−'}${formatChips(Math.abs(profit))} / +${formatChips(d.evening.quota)}`;
      $('#ev-fill').style.width = `${Math.min(100, (ratio / 3) * 100)}%`;
    }
    $('#stones').textContent = String(d.moonstones);
    if (d.moonstones !== this.shownStones) {
      const el = $('.stones');
      el.classList.remove('bump');
      void el.offsetWidth;
      if (d.moonstones > this.shownStones) el.classList.add('bump');
      this.shownStones = d.moonstones;
    }
    $('#ev-bar').setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    // Roll the balance towards its new value.
    cancelAnimationFrame(this.raf);
    const from = this.shown;
    const to = d.balance;
    const start = performance.now();
    const el = $('#balance');
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 600);
      this.shown = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = formatChips(this.shown);
      if (k < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    el.classList.toggle('up', to > from);
    el.classList.toggle('down', to < from);
  }

  /** Every achievement with its progress, as a list. */
  achievements() {
    const d = this.state.data;
    const wrap = document.createElement('div');
    const done = ACHIEVEMENTS.filter((a) => d.achievements[a.id]).length;
    const sum = document.createElement('p');
    sum.className = 'ach-sum';
    sum.textContent = `${done} von ${ACHIEVEMENTS.length} geschafft. Jeder Erfolg zahlt einmal Mondsteine aus.`;
    wrap.appendChild(sum);
    const list = document.createElement('div');
    list.className = 'ach';
    const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(!!d.achievements[b.id]) - Number(!!d.achievements[a.id]));
    for (const a of sorted) {
      const ok = !!d.achievements[a.id];
      const [v, max] = a.progress(d);
      const item = document.createElement('div');
      item.className = 'ach-item' + (ok ? ' done' : '');
      const pct = Math.min(100, (v / max) * 100);
      item.innerHTML = `<div class="ach-ic">${ICON[a.icon]}</div><div><strong></strong><span></span>${ok ? '' : `<div class="ach-bar"><i style="width:${pct}%"></i></div>`}</div><div class="ach-rew">${ok ? '✓' : `${Math.min(v, max).toLocaleString('de-DE')} / ${max.toLocaleString('de-DE')}`} · +${a.reward} ◆</div>`;
      item.querySelector('strong')!.textContent = a.name;
      item.querySelector('span')!.textContent = a.desc;
      list.appendChild(item);
    }
    wrap.appendChild(list);
    this.modal('Erfolge', wrap, [{ label: 'Schließen', primary: true, onClick: () => this.closeModal() }]);
  }

  /** A freshly unlocked achievement. */
  achievementToast(a: Achievement) {
    this.toast(`${ICON[a.icon]} Erfolg: ${a.name}  ·  +${a.reward} Mondstein${a.reward === 1 ? '' : 'e'}`, 'ach-toast');
  }

  toast(text: string, cls = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (cls ? ' ' + cls : '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ---- Dialogs ----------------------------------------------------------

  modal(title: string, body: HTMLElement | string, buttons: { label: string; primary?: boolean; onClick: () => void }[]) {
    const root = $('#modal');
    root.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2');
    h.textContent = title;
    card.appendChild(h);
    if (typeof body === 'string') {
      const p = document.createElement('p');
      p.textContent = body;
      card.appendChild(p);
    } else card.appendChild(body);
    const row = document.createElement('div');
    row.className = 'actions';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', () => {
        sfx.click();
        b.onClick();
      });
      row.appendChild(btn);
    }
    card.appendChild(row);
    root.appendChild(card);
    root.hidden = false;
    (row.querySelector<HTMLButtonElement>('button.primary') ?? row.querySelector<HTMLButtonElement>('button'))?.focus();
  }

  closeModal() {
    $('#modal').hidden = true;
    $('#modal').innerHTML = '';
  }

  get modalOpen() {
    return !$('#modal').hidden;
  }

  confirmEndEvening() {
    const d = this.state.data;
    const profit = this.state.eveningProfit;
    const ratio = profit / d.evening.quota;
    this.modal(
      `Tag ${d.evening.number} beenden?`,
      ratio >= 1 && d.evening.number >= BOSS_DAY
        ? 'Die Mottenkönigin ist besiegt. Rechne ab und die Saison ist gewonnen!'
        : ratio >= 1
        ? `Ziel geschafft (${Math.round(ratio * 100)} %). Der nächste Tag hat ein höheres Ziel: +${formatChips(quotaFor(d.evening.number + 1))}.`
        : `Du stehst erst bei ${Math.round(Math.max(0, ratio) * 100)} % vom Ziel. Wenn du jetzt abrechnest, ist die Saison vorbei und du startest neu mit 1.000 Falter. Trophäen und Rekorde bleiben.`,
      [
        { label: 'Weiterspielen', onClick: () => this.closeModal() },
        {
          label: 'Abrechnen',
          primary: true,
          onClick: () => {
            this.closeModal();
            this.actions.endEvening();
          },
        },
      ],
    );
  }

  openSaves() {
    const wrap = document.createElement('div');
    wrap.className = 'slots';
    const names: Record<SlotId, string> = { auto: 'Autosave', slot1: 'Platz 1', slot2: 'Platz 2', slot3: 'Platz 3' };
    for (const s of listSlots()) {
      const row = document.createElement('div');
      row.className = 'slot';
      const info = document.createElement('div');
      info.className = 'slot-info';
      const name = document.createElement('strong');
      name.textContent = names[s.id];
      const meta = document.createElement('span');
      meta.textContent = s.data
        ? `Tag ${s.data.evening.number} · ${formatChips(s.data.balance)} Falter · ${s.data.trophies.length} Trophäen · ${new Date(s.data.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
        : 'leer';
      info.append(name, meta);
      row.appendChild(info);
      const btns = document.createElement('div');
      btns.className = 'slot-btns';
      if (MANUAL_SLOTS.includes(s.id)) {
        const save = document.createElement('button');
        save.textContent = 'Hier speichern';
        save.addEventListener('click', () => {
          this.actions.save(s.id);
          this.toast(`Gespeichert in ${names[s.id]}.`);
          this.openSaves();
        });
        btns.appendChild(save);
      }
      if (s.data) {
        const load = document.createElement('button');
        load.textContent = 'Laden';
        load.className = 'primary';
        const data = s.data;
        load.addEventListener('click', () => {
          this.closeModal();
          this.actions.load(data);
          this.toast(`${names[s.id]} geladen.`);
        });
        btns.appendChild(load);
      }
      row.appendChild(btns);
      wrap.appendChild(row);
    }
    const transfer = document.createElement('details');
    transfer.className = 'transfer';
    transfer.innerHTML = `<summary>Spielstand übertragen</summary>
      <p>Kopiere den Code und füge ihn auf einem anderen Gerät oder Browser wieder ein.</p>
      <textarea id="save-code" rows="3" spellcheck="false" aria-label="Spielstand-Code"></textarea>
      <div class="actions"><button id="code-copy">Aktuellen Stand als Code</button><button id="code-load" class="primary">Code laden</button></div>`;
    wrap.appendChild(transfer);
    this.modal('Spielstände', wrap, [{ label: 'Schließen', onClick: () => this.closeModal() }]);
    const area = $('#save-code') as unknown as HTMLTextAreaElement;
    $('#code-copy').addEventListener('click', async () => {
      area.value = exportCode(this.state.data);
      area.select();
      try {
        await navigator.clipboard.writeText(area.value);
        this.toast('Code kopiert.');
      } catch {
        this.toast('Code markiert. Mit Strg+C kopieren.');
      }
    });
    $('#code-load').addEventListener('click', () => {
      const data = importCode(area.value);
      if (!data) {
        this.toast('Der Code ist ungültig. Bitte vollständig einfügen.');
        return;
      }
      this.closeModal();
      this.actions.load(data);
      this.toast('Spielstand aus Code geladen.');
    });
  }

  help() {
    const body = document.createElement('div');
    body.className = 'help';
    body.innerHTML = `
      <p><strong>Laufen:</strong> WASD oder Pfeiltasten. Am Handy wischen und den Finger halten, dann läufst du in diese Richtung. Kurz tippen läuft zu der Stelle.</p>
      <p><strong>Spielen:</strong> einfach gegen einen Automaten, Tisch oder Stand laufen. Oder davor <kbd>E</kbd> drücken oder auf die Sprechblase tippen. <kbd>Leertaste</kbd> dreht, <kbd>Esc</kbd> geht zurück.</p>
      <p><strong>Saison:</strong> Jeder Tag hat ein Gewinnziel, und es steigt von Tag zu Tag. Schaffst du es, gibt es Bronze, Silber, Gold oder Diamant und es geht weiter. Ab Silber gibt es eine Trophäe für die Vitrine.</p>
      <p><strong>Etagen:</strong> Alle 3 Tage öffnet sich eine neue Etage, mit dem Aufzug fährst du hin. An Tag 13 wartet die Mottenkönigin ganz oben im Thronsaal. Besiegst du sie, hast du die Saison gewonnen.</p>
      <p><strong>Foyer:</strong> Hier startest du und hierher kommst du nach jedem Tag zurück. Im Laden gibt es Kleidung, Begleiter und Glücksbringer für Mondsteine, in der Umkleide ziehst du dich um, am Empfang stellst du deine Gruppe zusammen. Mondsteine gibt es für Medaillen, Erfolge und die Mottenkönigin, nie für Geld.</p>
      <p><strong>Ausprobieren:</strong> Klavier, Brunnen, Jukebox und vieles mehr auf den Etagen kannst du benutzen. Einfach hingehen und <kbd>E</kbd> drücken.</p>
      <p><strong>Ziel verfehlt oder pleite:</strong> Dann ist die Saison vorbei und die nächste startet mit 1.000 Falter. Trophäen, Medaillen und Rekorde bleiben, die Etagen sind wieder zu.</p>
      <p><strong>Speichern:</strong> Das Spiel speichert automatisch. Unter „Spielstände“ kannst du zusätzlich drei Plätze belegen.</p>
      <p class="safe">Hier gibt es nur Falter. Man kann nichts einzahlen und nichts kaufen. Jedes Spiel zeigt offen, wie viel das Haus im Schnitt behält.</p>`;
    this.modal('So geht’s', body, [
      { label: 'Neues Spiel', onClick: () => this.confirmNewGame() },
      { label: 'Los geht’s', primary: true, onClick: () => this.closeModal() },
    ]);
  }

  confirmNewGame() {
    this.modal('Neues Spiel starten?', 'Der Autosave wird mit dem neuen Spiel überschrieben. Was in Platz 1 bis 3 liegt, bleibt erhalten. Speichere vorher dort, wenn du den aktuellen Stand behalten willst.', [
      { label: 'Abbrechen', onClick: () => this.closeModal() },
      {
        label: 'Neues Spiel',
        primary: true,
        onClick: () => {
          this.closeModal();
          this.actions.newGame();
        },
      },
    ]);
  }
}
