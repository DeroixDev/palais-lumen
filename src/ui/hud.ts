// HTML overlay: top bar, toasts and dialogs. Pixi draws the game, the DOM draws the menus.

import { showDevlog } from './devlog';
import { BOSS_DAY, floorForDay, formatChips, type GameState } from '../core/state';
import { mainRoomOf } from '../core/registry';
import { MANUAL_SLOTS, deleteSlot, exportCode, importCode, listSlots, type SlotId } from '../core/save';
import type { SaveData } from '../core/state';
import { sfx } from '../core/audio';
import { coinDataUrl } from '../core/fx';
import { ACHIEVEMENTS, type Achievement, type AchievementIcon } from '../core/achievements';
import { stoneDataUrl } from './stone';
import { installHudArt } from './hudArt';
import { TABLET_TITLE, openTablet } from './tablet';
import './fit.css';
import { actor } from '../net/actor';

import { BOSS_FULL, BOSS_GEN, BOSS_NAME, CURRENCY_PLURAL, DOME, HOUSE } from '../core/brand';
const ICON: Record<AchievementIcon, string> = { spin: '🎰', medal: '🏅', floor: '🛗', crown: '👑', star: '⭐', coin: '🪙', bag: '💰', heart: '❤️', note: '🎵', fountain: '⛲', moth: '💡', camera: '📷' };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export interface HudActions {
  save(slot: SlotId): void;
  load(data: SaveData): void;
  endEvening(): void;
  leaveGame(): void;
  newGame(): void;
  debugDay(day: number): void;
  /** House tablet: open any game right here / walk into any room. */
  debugOpenGame(id: string): void;
  debugToRoom(id: string): void;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Height of one digit row in a balance reel, in em (must match `#balance .reel > span > b` in casino.html). */
const REEL_ROW = 1.1;

/** Medal marks on the day gauge, as multiples of the day's quota. */
const MARKS: [string, number][] = [['m-bronze', 1], ['m-silver', 1.5], ['m-gold', 2], ['m-diamond', 3]];

interface ToastItem {
  text: string;
  cls: string;
  count: number;
  at: number;
  /** Shows even while a dialog or a full panel is open (answers to a tap inside it). */
  urgent?: boolean;
  el?: HTMLElement;
  timer?: number;
}

export class Hud {
  private inFoyer = false;
  private shownBalance = -1;
  private shownStones = 0;
  private flashTimer = 0;
  private isOpen = false;
  private closeTimer = 0;
  private openTitle = '';
  /** The house tablet is open (see openTablet). */
  private quiet = false;
  private toastsShown: ToastItem[] = [];
  private toastQueue: ToastItem[] = [];
  /** A full-screen panel (recap, draft, moon dial …) is open: toasts wait in line. */
  private toastHold = false;
  private inGame = false;

  constructor(
    private state: GameState,
    private actions: HudActions,
  ) {
    installHudArt();
    const hud = $('#hud');
    // Phones keep the rarely used keys in a drop-down behind one menu key.
    const more = $('#hud-more');
    const setMenu = (on: boolean) => {
      hud.classList.toggle('menu-open', on);
      more.setAttribute('aria-expanded', String(on));
    };
    more.addEventListener('click', () => {
      sfx.click();
      setMenu(!hud.classList.contains('menu-open'));
    });
    $('#hud-menu').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) setMenu(false);
    });
    window.addEventListener('pointerdown', (e) => {
      if (hud.classList.contains('menu-open') && !(e.target as HTMLElement).closest('#hud-menu, #hud-more')) setMenu(false);
    });
    $('#btn-save').addEventListener('click', () => this.openSaves());
    $('#btn-end').addEventListener('click', () => this.confirmEndEvening());
    $('#btn-back').addEventListener('click', () => this.actions.leaveGame());
    const mute = $('#btn-mute');
    const syncMute = () => {
      mute.querySelector('.lbl')!.textContent = sfx.muted ? 'Ton aus' : 'Ton an';
      mute.setAttribute('aria-pressed', String(!sfx.muted));
    };
    syncMute();
    mute.addEventListener('click', () => {
      sfx.setMuted(!sfx.muted);
      syncMute();
    });
    const music = $('#btn-music');
    const syncMusic = () => {
      music.querySelector('.lbl')!.textContent = sfx.musicOn ? 'Musik an' : 'Musik aus';
      music.setAttribute('aria-pressed', String(sfx.musicOn));
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
    const stoneUrl = stoneDataUrl(64);
    document.documentElement.style.setProperty('--nf-coin', `url(${coinUrl})`);
    document.documentElement.style.setProperty('--nf-stone', `url(${stoneUrl})`);
    const purseEl = document.querySelector('.purse') as HTMLElement;
    window.addEventListener('purse-bump', () => {
      purseEl.classList.remove('bump');
      void purseEl.offsetWidth;
      purseEl.classList.add('bump');
      sfx.tick();
    });
    ($('.stone-ic') as HTMLElement).style.backgroundImage = `url(${stoneUrl})`;
    // Toasts and dialogs keep clear of the HUD: publish its height as --hud-h.
    const syncHeight = () => {
      const h = hud.hidden ? 0 : Math.ceil(hud.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--hud-h', `${h}px`);
    };
    new ResizeObserver(syncHeight).observe(hud);
    window.addEventListener('resize', syncHeight);
    this.syncHeight = syncHeight;
    this.shownStones = state.data.moonstones;
    this.render();
    if (import.meta.env.DEV) (window as unknown as { __hud: Hud }).__hud = this;
  }

  private syncHeight: () => void;

  show(on: boolean) {
    $('#hud').hidden = !on;
    document.body.classList.toggle('hud-off', !on);
    if (!on) $('#hud').classList.remove('menu-open');
    this.syncHeight();
  }

  /** In the foyer the day hasn't started, so there is nothing to settle. */
  setFoyer(on: boolean) {
    $('#hud').classList.toggle('foyer', on);
    this.inFoyer = on;
    this.render();
  }

  setInGame(on: boolean) {
    $('#btn-back').hidden = !on;
    this.inGame = on;
    document.body.classList.toggle('in-game', on);
  }

  /**
   * While a full-screen panel is open, new toasts wait and the ones on screen step back into
   * the line, so nothing covers the panel's title. Urgent ones still show.
   */
  holdToasts(on: boolean) {
    if (this.toastHold === on) return;
    this.toastHold = on;
    if (on) this.shelveToasts();
    else this.pumpToasts();
  }

  private get toastsHeld() {
    return this.toastHold || this.isOpen;
  }

  /** Puts the toasts on screen back at the front of the line (fresh ones) or lets them go. */
  private shelveToasts() {
    const now = performance.now();
    const back: ToastItem[] = [];
    for (const t of [...this.toastsShown]) {
      if (t.urgent) continue;
      clearTimeout(t.timer);
      t.el?.remove();
      this.toastsShown = this.toastsShown.filter((x) => x !== t);
      if (now - t.at < 1500) back.push({ text: t.text, cls: t.cls, count: t.count, at: now });
    }
    this.toastQueue.unshift(...back);
  }

  render() {
    const d = this.state.data;
    const profit = this.state.eveningProfit;
    const ratio = Math.max(0, profit / d.evening.quota);
    const day = d.evening.number;
    const floor = floorForDay(day);
    const boss = day >= BOSS_DAY;
    const floorName = mainRoomOf(floor)?.name ?? '';
    $('#ev-num').textContent = this.inFoyer ? `Foyer · Tag ${day} auf Etage ${floor}` : boss ? `Tag ${day} · Boss` : `Tag ${day} · Etage ${floor}`;
    $('#ev-num').title = `Saison ${d.season.number} · Etage ${floor}: ${floorName}`;
    $('#ev-bar').classList.toggle('boss', boss);
    $('.evening').classList.toggle('boss', boss);
    if (boss) {
      // On the boss day the goal bar is the Selene's life: every Lumen won hurts her.
      const hp = Math.max(0, d.evening.quota - Math.max(0, profit));
      $('#ev-goal').textContent = hp > 0 ? `${BOSS_NAME}: ${formatChips(hp)}` : `${BOSS_NAME} besiegt!`;
      $('#ev-goal').title = `${BOSS_GEN} Lebenskraft`;
      $('#ev-fill').style.width = `${(hp / d.evening.quota) * 100}%`;
      $('#ev-bar').setAttribute('aria-label', `${BOSS_GEN} Lebenskraft`);
    } else {
      // The goal is a fixed end balance, known from the start of the day.
      const missing = this.state.goalMissing;
      $('#ev-goal').textContent = missing > 0 ? `Ziel ${formatChips(this.state.goalBalance)} · noch ${formatChips(missing)}` : `Ziel ${formatChips(this.state.goalBalance)} ✓`;
      $('#ev-goal').title = `Tagesgewinn ${profit >= 0 ? '+' : '−'}${formatChips(Math.abs(profit))} von +${formatChips(d.evening.quota)}`;
      $('#ev-fill').style.width = `${Math.min(100, (ratio / 3) * 100)}%`;
      $('#ev-bar').setAttribute('aria-label', 'Fortschritt zum Tagesziel');
      // Reached medal studs light up; the next one breathes.
      let next = true;
      for (const [cls, k] of MARKS) {
        const el = $(`#ev-bar .${cls}`);
        const hit = ratio >= k;
        el.classList.toggle('hit', hit);
        el.classList.toggle('next', !hit && next);
        if (!hit) next = false;
      }
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
    this.rollBalance(d.balance);
  }

  /** The balance as brass reels: every digit rolls to its new place, 50 ms after its right neighbour. */
  private rollBalance(to: number) {
    const from = this.shownBalance;
    if (to === from) return;
    this.shownBalance = to;
    const el = $('#balance');
    const text = formatChips(to);
    const oldText = from < 0 ? text : formatChips(from);
    const shape = (t: string) => t.replace(/\d/g, '0');
    let reels = el.querySelector('.reels') as HTMLElement | null;
    if (!reels || reels.dataset.shape !== shape(text)) {
      // New layout (a digit more or less): rebuild, starting from the old digits aligned right.
      el.innerHTML = '';
      reels = document.createElement('span');
      reels.className = 'reels';
      reels.setAttribute('aria-hidden', 'true');
      reels.style.display = 'flex';
      reels.dataset.shape = shape(text);
      const pad = oldText.replace(/\D/g, '').padStart(text.replace(/\D/g, '').length, '0');
      let di = pad.length - text.replace(/\D/g, '').length;
      for (const ch of text) {
        if (!/\d/.test(ch)) {
          const s = document.createElement('span');
          s.className = 'sep';
          s.textContent = ch;
          reels.appendChild(s);
          continue;
        }
        const r = document.createElement('span');
        r.className = 'reel';
        const strip = document.createElement('span');
        strip.innerHTML = '<b>0</b><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6</b><b>7</b><b>8</b><b>9</b>';
        const start = Number(pad[Math.max(0, di++)] ?? 0);
        strip.style.transition = 'none';
        strip.style.transform = `translateY(${-start * REEL_ROW}em)`;
        r.appendChild(strip);
        reels.appendChild(r);
      }
      const sr = document.createElement('span');
      sr.className = 'sr';
      el.append(reels, sr);
      void reels.offsetWidth;
      reels.querySelectorAll<HTMLElement>('.reel > span').forEach((s) => (s.style.transition = ''));
    }
    const digits = text.replace(/\D/g, '');
    const strips = [...reels.querySelectorAll<HTMLElement>('.reel > span')];
    const calm = reduceMotion();
    strips.forEach((s, i) => {
      s.style.transitionDelay = calm ? '0ms' : `${(strips.length - 1 - i) * 50}ms`;
      s.style.transform = `translateY(${-Number(digits[i]) * REEL_ROW}em)`;
    });
    (el.querySelector('.sr') as HTMLElement).textContent = `${text} ${CURRENCY_PLURAL}`;
    if (from < 0) return;
    clearTimeout(this.flashTimer);
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    el.classList.add(to > from ? 'up' : 'down');
    this.flashTimer = window.setTimeout(() => el.classList.remove('up', 'down'), to > from ? 900 : 450);
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

  /**
   * A brass strip under the HUD. Two at a time, the rest wait in line; the same message twice
   * within 3 s becomes one strip with a counter. Tap to dismiss.
   */
  toast(text: string, cls = '', urgent = false) {
    // A friend's round in a group: what it causes (a task done, a perk paying) shows on their screen.
    if (actor.id && actor.toast) return actor.toast(actor.id, text, cls);
    // The house tablet is open: what it changes stays quiet (no toasts now, none queued for later).
    if (this.quiet) return;
    const now = performance.now();
    const same = [...this.toastsShown, ...this.toastQueue].find((t) => t.text === text && (t.el || now - t.at < 3000));
    if (same) {
      same.count++;
      same.at = now;
      if (same.el) {
        let c = same.el.querySelector('.count');
        if (!c) {
          c = document.createElement('span');
          c.className = 'count';
          same.el.querySelector('.toast-t')!.appendChild(c);
        }
        c.textContent = `×${same.count}`;
        this.armToast(same);
      }
      return;
    }
    this.toastQueue.push({ text, cls, count: 1, at: now, urgent });
    this.pumpToasts();
  }

  private pumpToasts() {
    // In a game on a phone only one strip at a time, so the second never reaches the table.
    const max = this.inGame && matchMedia('(max-width: 1100px)').matches ? 1 : 2;
    while (this.toastsShown.length < max && this.toastQueue.length) {
      const i = this.toastsHeld ? this.toastQueue.findIndex((x) => x.urgent) : 0;
      if (i < 0) break;
      const t = this.toastQueue.splice(i, 1)[0];
      t.at = performance.now();
      const el = document.createElement('div');
      el.className = 'toast' + (t.cls ? ' ' + t.cls : '');
      el.innerHTML = '<span class="toast-ic" aria-hidden="true"></span><span class="toast-t"></span>';
      el.querySelector('.toast-t')!.textContent = t.text;
      el.addEventListener('pointerdown', () => this.dropToast(t));
      t.el = el;
      $('#toasts').appendChild(el);
      this.toastsShown.push(t);
      this.armToast(t);
    }
  }

  private armToast(t: ToastItem) {
    clearTimeout(t.timer);
    const long = /ach-toast|error/.test(t.cls);
    const ms = Math.min(6500, Math.max(long ? 4000 : 2500, t.text.length * 45));
    t.timer = window.setTimeout(() => this.dropToast(t), ms);
  }

  private dropToast(t: ToastItem) {
    if (!t.el || t.el.classList.contains('out')) return;
    clearTimeout(t.timer);
    const el = t.el;
    el.classList.add('out');
    setTimeout(() => {
      el.remove();
      this.toastsShown = this.toastsShown.filter((x) => x !== t);
      this.pumpToasts();
    }, 150);
  }

  // ---- Dialogs ----------------------------------------------------------

  /**
   * A velvet panel in the brass frame. A second dialog replaces the first. The 48 px close key
   * (and Escape) is there unless the dialog is a single forced choice.
   */
  modal(title: string, body: HTMLElement | string, buttons: { label: string; primary?: boolean; onClick: () => void }[], opts: { closable?: boolean } = {}) {
    const root = $('#modal');
    if (title !== TABLET_TITLE) this.quiet = false;
    const replacing = this.isOpen && this.openTitle === title;
    clearTimeout(this.closeTimer);
    root.classList.remove('closing');
    root.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (replacing) card.style.animation = 'none';
    const h = document.createElement('h2');
    h.textContent = title;
    h.id = 'modal-title';
    card.setAttribute('aria-labelledby', 'modal-title');
    card.appendChild(h);
    const closable = opts.closable ?? !(buttons.length === 1 && buttons[0].label !== 'Schließen');
    if (closable) {
      const x = document.createElement('button');
      x.className = 'card-x';
      x.setAttribute('aria-label', 'Schließen');
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      x.addEventListener('click', () => {
        sfx.click();
        this.closeModal();
      });
      card.appendChild(x);
    }
    const content = document.createElement('div');
    content.className = 'card-body';
    if (typeof body === 'string') {
      const p = document.createElement('p');
      p.textContent = body;
      content.appendChild(p);
    } else content.appendChild(body);
    card.appendChild(content);
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
    if (!this.isOpen) root.style.animation = '';
    else root.style.animation = 'none';
    if (!this.isOpen) this.shelveToasts();
    this.isOpen = true;
    this.openTitle = title;
    document.body.classList.add('modal-open');
    $('#hud').classList.remove('menu-open');
    (row.querySelector<HTMLButtonElement>('button.primary') ?? row.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
  }

  closeModal() {
    this.quiet = false;
    if (!this.isOpen) return;
    this.isOpen = false;
    this.openTitle = '';
    document.body.classList.remove('modal-open');
    const root = $('#modal');
    root.classList.add('closing');
    this.closeTimer = window.setTimeout(() => {
      root.hidden = true;
      root.innerHTML = '';
      root.classList.remove('closing');
    }, 180);
    this.pumpToasts();
  }

  get modalOpen() {
    return this.isOpen;
  }

  confirmEndEvening() {
    const d = this.state.data;
    const profit = this.state.eveningProfit;
    const ratio = profit / d.evening.quota;
    const reached = this.state.goalReached;
    this.modal(
      `Tag ${d.evening.number} beenden?`,
      reached && d.evening.number >= BOSS_DAY
        ? `${BOSS_NAME} ist besiegt. Rechne ab und die Saison ist gewonnen!`
        : reached
        ? `Ziel geschafft (${Math.floor(ratio * 100)} %). Morgen startest du mit ${formatChips(d.balance)} ${CURRENCY_PLURAL}, die Einsätze wachsen mit, und das Ziel ist +${formatChips(this.state.quotaToday(d.evening.number + 1, d.balance))}.`
        : `Dir fehlen noch ${formatChips(this.state.goalMissing)} ${CURRENCY_PLURAL} bis ${formatChips(this.state.goalBalance)} (${Math.floor(Math.max(0, ratio) * 100)} % vom Ziel). Wenn du jetzt abrechnest, ist die Saison vorbei und du startest neu mit 1.000 ${CURRENCY_PLURAL}. Trophäen und Rekorde bleiben.`,
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

  /**
   * The house-tech tablet on the wall (code pad, then the house controls from ./debug.ts on its
   * screen). Its only way in is the tablet itself; what it changes stays quiet.
   */
  openTablet() {
    openTablet(
      this.state,
      {
        show: (body) => {
          this.modal(TABLET_TITLE, body, []);
          this.quiet = true;
          document.querySelector('#modal .card')?.classList.add('card-tablet');
          document.querySelector('#modal .card')?.classList.toggle('card-mod', body.classList.contains('tab-screen'));
        },
        close: () => this.closeModal(),
        isOpen: () => this.isOpen && this.openTitle === TABLET_TITLE,
      },
      {
        jumpToDay: (day) => this.actions.debugDay(day),
        endDay: () => this.actions.endEvening(),
        openGame: (id) => this.actions.debugOpenGame(id),
        toRoom: (id) => this.actions.debugToRoom(id),
      },
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
        ? `Tag ${s.data.evening.number} · ${formatChips(s.data.balance)} ${CURRENCY_PLURAL} · ${s.data.trophies.length} Trophäen · ${new Date(s.data.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
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
          this.toast(`Gespeichert in ${names[s.id]}.`, '', true);
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
        const del = document.createElement('button');
        del.textContent = 'Löschen';
        del.className = 'danger';
        del.setAttribute('aria-label', `${names[s.id]} löschen`);
        del.addEventListener('click', () => this.confirmDelete(s.id, names[s.id]));
        btns.appendChild(del);
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
    this.modal('Spielstände', wrap, [
      { label: 'Neues Spiel', onClick: () => this.confirmNewGame() },
      { label: 'Schließen', primary: true, onClick: () => this.closeModal() },
    ]);
    const area = $('#save-code') as unknown as HTMLTextAreaElement;
    $('#code-copy').addEventListener('click', async () => {
      area.value = exportCode(this.state.data);
      area.select();
      try {
        await navigator.clipboard.writeText(area.value);
        this.toast('Code kopiert.', '', true);
      } catch {
        this.toast('Code markiert. Mit Strg+C kopieren.', '', true);
      }
    });
    $('#code-load').addEventListener('click', () => {
      const data = importCode(area.value);
      if (!data) {
        this.toast('Der Code ist ungültig. Bitte vollständig einfügen.', 'error', true);
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
      <p><strong>Etagen:</strong> Alle 3 Tage öffnet sich eine neue Etage, mit dem Aufzug fährst du hin. An Tag 13 wartet ${BOSS_FULL}, ganz oben unter der ${DOME}. Besiegst du sie, hast du die Saison gewonnen.</p>
      <p><strong>Foyer:</strong> Hier startest du und hierher kommst du nach jedem Tag zurück. Im Laden gibt es Kleidung, Begleiter, Glücksbringer und Glücksgriffe (Items) für Mondsteine, in der Umkleide ziehst du dich um, am Empfang stellst du deine Gruppe zusammen. Mondsteine gibt es für gewonnene Runden, Medaillen, den Überschuss über dem Tagesziel, Erfolge und den Sieg über ${BOSS_NAME}.</p>
      <p><strong>Beutel:</strong> Gekaufte Items trägst du im Beutel oben in der Leiste (oder Taste <kbd>I</kbd>), auch am Spieltisch. Was ein Item an der Auszahlungsquote ändert, steht im Beutel und in den Regeln des Spiels.</p>
      <p><strong>Ausprobieren:</strong> Klavier, Brunnen, Jukebox und vieles mehr auf den Etagen kannst du benutzen. Einfach hingehen und <kbd>E</kbd> drücken.</p>
      <p><strong>Ziel verfehlt oder pleite:</strong> Dann ist die Saison vorbei und die nächste startet mit 1.000 ${CURRENCY_PLURAL}. Trophäen, Medaillen und Rekorde bleiben, die Etagen sind wieder zu.</p>
      <p><strong>Speichern:</strong> Das Spiel speichert automatisch. Unter „Spielstände“ kannst du zusätzlich drei Plätze belegen.</p>
      <p class="safe">In den Regeln jedes Spiels („So geht’s“) steht offen, wie viel das Haus im Schnitt behält.</p>
      <details class="credits"><summary>Musik &amp; Klang</summary>
        <p>Alle Stücke sind für ${HOUSE} geschrieben und werden live im Spiel gespielt. Die Instrumente sind freie Aufnahmen:</p>
        <p>Versilian Community Sample Library (Versilian Studios, CC0) · Splendid Grand Piano (Akai, gemeinfrei) · Kontrabass von D. Smolken (CC0) · Wurlitzer EP200 von Greg Sullivan (CC BY 3.0) · FluidR3 GM von Frank Wen, aufbereitet von gleitz/midi-js-soundfonts (CC BY 3.0) · tonejs-instruments von Nicholaus Brosowsky (CC BY 3.0) · LinnDrum, TR-808 und MFB-512 aus smpldsnds/drum-machines (gemeinfrei).</p>
      </details>`;
    this.modal('So geht’s', body, [
      { label: 'Neues Spiel', onClick: () => this.confirmNewGame() },
      { label: 'Neuigkeiten', onClick: () => showDevlog(this) },
      { label: 'Los geht’s', primary: true, onClick: () => this.closeModal() },
    ]);
  }

  /** Asks before starting over; `after` runs once the new game is set up (the title screen walks in). */
  confirmNewGame(after?: () => void) {
    this.modal('Neues Spiel starten?', `Du beginnst bei Tag 1 mit 1.000 ${CURRENCY_PLURAL}. Der Autosave wird mit dem neuen Spiel überschrieben. Was in Platz 1 bis 3 liegt, bleibt erhalten. Speichere vorher dort, wenn du den aktuellen Stand behalten willst.`, [
      { label: 'Abbrechen', onClick: () => this.closeModal() },
      {
        label: 'Neues Spiel',
        primary: true,
        onClick: () => {
          this.closeModal();
          this.actions.newGame();
          after?.();
        },
      },
    ]);
  }

  /** Deleting a slot asks first. The autosave is the running game, so deleting it starts over. */
  private confirmDelete(id: SlotId, name: string) {
    const auto = id === 'auto';
    this.modal(`${name} löschen?`, auto ? 'Der Autosave ist dein laufendes Spiel. Löschst du ihn, beginnt ein neues Spiel bei Tag 1. Das lässt sich nicht rückgängig machen.' : 'Der Spielstand ist danach weg. Das lässt sich nicht rückgängig machen.', [
      { label: 'Abbrechen', onClick: () => this.openSaves() },
      {
        label: 'Löschen',
        primary: true,
        onClick: () => {
          deleteSlot(id);
          if (auto) this.actions.newGame();
          this.toast(`${name} gelöscht.`, '', true);
          this.openSaves();
        },
      },
    ]);
  }
}
