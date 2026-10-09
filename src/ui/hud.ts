// HTML overlay: top bar, toasts and dialogs. Pixi draws the game, the DOM draws the menus.

import { formatChips, quotaFor, type GameState } from '../core/state';
import { MANUAL_SLOTS, exportCode, importCode, listSlots, type SlotId } from '../core/save';
import type { SaveData } from '../core/state';
import { sfx } from '../core/audio';

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
    $('#btn-help').addEventListener('click', () => this.help());
    state.onChange(() => this.render());
    this.shown = state.balance;
    this.render();
  }

  show(on: boolean) {
    $('#hud').hidden = !on;
  }

  setInGame(on: boolean) {
    $('#btn-back').hidden = !on;
  }

  render() {
    const d = this.state.data;
    const profit = this.state.eveningProfit;
    const ratio = Math.max(0, profit / d.evening.quota);
    $('#ev-num').textContent = `Abend ${d.evening.number}`;
    $('#ev-goal').textContent = `${profit >= 0 ? '+' : '−'}${formatChips(Math.abs(profit))} / +${formatChips(d.evening.quota)}`;
    $('#ev-fill').style.width = `${Math.min(100, (ratio / 3) * 100)}%`;
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

  toast(text: string) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast';
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
      `Abend ${d.evening.number} beenden?`,
      `Du stehst bei ${Math.round(Math.max(0, ratio) * 100)} % vom Ziel. Danach wird abgerechnet, und der nächste Abend startet mit einem Ziel von +${formatChips(quotaFor(Math.max(d.balance, 50)))}.`,
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
        ? `Abend ${s.data.evening.number} · ${formatChips(s.data.balance)} Spielgeld · ${s.data.trophies.length} Trophäen · ${new Date(s.data.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
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
      <p><strong>Laufen:</strong> WASD oder Pfeiltasten, oder irgendwo hintippen.</p>
      <p><strong>Spielen:</strong> an einen Automaten oder Tisch gehen und <kbd>E</kbd> drücken oder tippen. <kbd>Leertaste</kbd> dreht, <kbd>Esc</kbd> geht zurück.</p>
      <p><strong>Abende:</strong> Jeder Abend hat ein Gewinnziel. Wer es übertrifft, bekommt Bronze, Silber, Gold oder Diamant. Ab Silber gibt es eine Trophäe für die Vitrine.</p>
      <p><strong>Speichern:</strong> Das Spiel speichert automatisch. Unter „Spielstände“ kannst du zusätzlich drei Plätze belegen.</p>
      <p class="safe">Hier gibt es nur Spielgeld. Man kann nichts einzahlen und nichts kaufen. Jedes Spiel zeigt offen, wie viel das Haus im Schnitt behält.</p>`;
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
