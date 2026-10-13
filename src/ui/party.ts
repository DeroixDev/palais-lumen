// Playing with friends, on the HTML side: the "Mit Freunden" card on the start screen (join by
// code), the group strip on the reception's party card (open a group, code and link, close or
// leave), and the small group cluster in the HUD (players' dots and quick reactions).

import { sfx } from '../core/audio';
import { net, cleanCode, joinLink, validCode } from '../net/session';
import { brokerText, currentBroker, saveBroker, DEFAULT_BROKER, webrtcAvailable } from '../net/peer';
import { NetError, netErrorText } from '../net/transport';
import { EMOTES, LINES } from '../net/protocol';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Copies text; falls back to a hidden field where the clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = el('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

/** The broker field under "Vermittlungsserver" (shared by the join card and the group strip). */
function brokerField(): HTMLDetailsElement {
  const det = el('details', 'mp-adv');
  det.appendChild(el('summary', '', 'Vermittlungsserver'));
  const input = el('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = `${DEFAULT_BROKER.host} (Standard)`;
  const cur = brokerText(currentBroker());
  if (cur !== brokerText(DEFAULT_BROKER)) input.value = cur;
  input.setAttribute('aria-label', 'Vermittlungsserver');
  const hint = el('small', '', 'Nur nötig, wenn ihr einen eigenen PeerJS-Server betreibt, z. B. „localhost:9000“. Leer lassen für den öffentlichen Dienst.');
  input.addEventListener('change', () => {
    if (!saveBroker(input.value)) hint.textContent = 'Das sieht nicht nach einer Server-Adresse aus. Beispiel: „peer.example.org“ oder „localhost:9000“.';
    else hint.textContent = input.value.trim() ? `Gespeichert: ${brokerText(currentBroker())}` : 'Wieder der öffentliche Dienst.';
  });
  det.append(input, hint);
  return det;
}

export interface JoinHost {
  modal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; onClick: () => void }[]): void;
  closeModal(): void;
  /** Connects; resolves when the friend is in, rejects with a NetError. */
  join(code: string, name: string): Promise<void>;
  /** This browser's own name (from its own save). */
  name(): string;
}

/** "Mit Freunden": the card for joining a group by code. */
export function showJoinCard(h: JoinHost, code = '') {
  const wrap = el('div', 'mp-join');
  wrap.appendChild(el('p', '', 'Gib den Code ein, den dir der Gastgeber geschickt hat. Ihr spielt dann zusammen in seinem Palais: ein gemeinsames Konto, ein gemeinsames Tagesziel.'));
  const codeIn = el('input', 'mp-code-in');
  codeIn.maxLength = 5;
  codeIn.autocomplete = 'off';
  codeIn.spellcheck = false;
  codeIn.placeholder = 'CODE';
  codeIn.setAttribute('aria-label', 'Code der Gruppe');
  codeIn.value = cleanCode(code);
  codeIn.addEventListener('input', () => {
    const v = cleanCode(codeIn.value);
    if (v !== codeIn.value) codeIn.value = v;
  });
  const nameIn = el('input', 'mp-name-in');
  nameIn.maxLength = 14;
  nameIn.autocomplete = 'off';
  nameIn.spellcheck = false;
  nameIn.placeholder = 'Dein Name';
  nameIn.setAttribute('aria-label', 'Dein Name');
  const own = h.name();
  nameIn.value = own === 'Du' ? '' : own;
  const fields = el('div', 'mp-fields');
  const l1 = el('label', '', 'Code');
  l1.appendChild(codeIn);
  const l2 = el('label', '', 'Dein Name am Tisch');
  l2.appendChild(nameIn);
  fields.append(l1, l2);
  const status = el('p', 'mp-status');
  status.setAttribute('role', 'status');
  wrap.append(fields, status, brokerField());
  if (!webrtcAvailable()) {
    status.textContent = netErrorText(new NetError('unsupported'));
    status.classList.add('err');
  }
  let busy = false;
  const go = () => {
    if (busy) return;
    const c = cleanCode(codeIn.value);
    if (!validCode(c)) {
      status.textContent = 'Der Code hat fünf Buchstaben, zum Beispiel „KQXMR“.';
      status.classList.add('err');
      codeIn.focus();
      return;
    }
    busy = true;
    status.classList.remove('err');
    status.textContent = `Verbinde mit der Gruppe ${c} …`;
    wrap.classList.add('busy');
    h.join(c, nameIn.value.trim()).then(
      () => h.closeModal(),
      (e) => {
        busy = false;
        wrap.classList.remove('busy');
        status.textContent = netErrorText(e);
        status.classList.add('err');
      },
    );
  };
  for (const i of [codeIn, nameIn]) i.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  h.modal('Mit Freunden spielen', wrap, [
    { label: 'Abbrechen', onClick: () => h.closeModal() },
    { label: 'Beitreten', primary: true, onClick: go },
  ]);
  setTimeout(() => (codeIn.value ? nameIn : codeIn).focus({ preventScroll: true }), 50);
}

export interface GroupStripHost {
  openGroup(): Promise<void>;
  closeGroup(): void;
  leaveGroup(): void;
  toast(text: string): void;
  /** Why a group can't be opened right now ('' = it can). */
  blocked(): string;
  rerender(): void;
}

let opening = false;
let openError = '';

/** The strip under the seats of the party card: open a group, share it, close or leave it. */
export function renderGroupStrip(box: HTMLElement, h: GroupStripHost) {
  box.innerHTML = '';
  box.className = 'mp-group';
  if (net.isGuest) {
    const host = net.nameOf('host');
    const p = el('p');
    p.append('Du spielst in der Gruppe von ', el('strong', '', host), ` · Code ${net.code}`);
    const leave = el('button', 'mp-leave', 'Gruppe verlassen');
    leave.addEventListener('click', () => {
      sfx.click();
      h.leaveGroup();
    });
    box.append(p, leave);
    return;
  }
  if (net.isHost) {
    const code = el('div', 'mp-code');
    code.append(el('small', '', 'Code'), el('strong', '', net.code));
    code.setAttribute('aria-label', `Code ${net.code.split('').join(' ')}`);
    const btns = el('div', 'mp-btns');
    const link = el('button', '', 'Link kopieren');
    link.addEventListener('click', () => {
      sfx.click();
      void copyText(joinLink(net.code)).then((ok) => h.toast(ok ? 'Einladungslink kopiert. Schick ihn deinen Freunden!' : `Kopieren ging nicht. Der Link: ${joinLink(net.code)}`));
    });
    const copy = el('button', '', 'Code kopieren');
    copy.addEventListener('click', () => {
      sfx.click();
      void copyText(net.code).then((ok) => h.toast(ok ? `Code ${net.code} kopiert.` : `Der Code lautet ${net.code}.`));
    });
    const close = el('button', 'mp-close', 'Gruppe schließen');
    close.addEventListener('click', () => {
      sfx.click();
      h.closeGroup();
    });
    btns.append(link, copy, close);
    const n = net.online().length;
    const note = el('p', 'mp-note', n > 1 ? `${n} von 4 Plätzen besetzt. Ihr teilt euch das Konto, jeder spielt an seinem eigenen Automaten.` : 'Schick deinen Freunden den Link, oder sie tippen auf dem Startbildschirm auf „Mit Freunden“ und geben den Code ein.');
    box.append(code, btns, note);
    return;
  }
  const why = h.blocked();
  const p = el('p', '', why || 'Spiel mit bis zu drei Freunden: ein gemeinsames Konto, ein Tagesziel, jeder an seinem eigenen Automaten.');
  const open = el('button', 'primary', opening ? 'Wird geöffnet …' : 'Gruppe öffnen');
  open.disabled = opening || !!why;
  open.addEventListener('click', () => {
    if (opening) return;
    sfx.click();
    opening = true;
    openError = '';
    h.rerender();
    h.openGroup().then(
      () => {
        opening = false;
        h.rerender();
      },
      (e) => {
        opening = false;
        openError = netErrorText(e);
        h.rerender();
      },
    );
  });
  const row = el('div', 'mp-row');
  row.append(p, open);
  box.appendChild(row);
  if (openError) box.appendChild(el('p', 'mp-status err', openError));
  if (!why) box.appendChild(brokerField());
}

export interface MpHudHost {
  openGroup(): void;
  emote(e: string): void;
}

/** The group cluster in the HUD: a dot per player, and the reactions key with its palette. */
export class MpHud {
  private root = el('div', 'mp-hud');
  private dots = el('button', 'mp-dots');
  private key = el('button', 'hud-btn icon mp-key');
  private pal = el('div', 'mp-pal');

  constructor(private h: MpHudHost) {
    this.root.id = 'mp-hud';
    this.root.hidden = true;
    this.dots.type = 'button';
    this.dots.addEventListener('click', () => {
      sfx.click();
      this.h.openGroup();
    });
    this.key.type = 'button';
    this.key.setAttribute('aria-label', 'Reaktion senden');
    this.key.setAttribute('aria-expanded', 'false');
    this.key.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9h-8l-4.5 3.5v-3.5h-2.5z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/></svg><span class="lbl">Reaktion</span>';
    this.key.addEventListener('click', () => {
      sfx.click();
      this.toggle(!this.open);
    });
    this.pal.hidden = true;
    this.pal.setAttribute('role', 'menu');
    const emos = el('div', 'mp-emos');
    for (const e of EMOTES) {
      const b = el('button', '', e);
      b.type = 'button';
      b.setAttribute('aria-label', { '👏': 'Applaus', '😮': 'Staunen', '🎉': 'Feiern', '🍀': 'Viel Glück' }[e] ?? e);
      b.addEventListener('click', () => this.pick(e));
      emos.appendChild(b);
    }
    const lines = el('div', 'mp-lines');
    for (const l of LINES) {
      const b = el('button', '', l);
      b.type = 'button';
      b.addEventListener('click', () => this.pick(l));
      lines.appendChild(b);
    }
    this.pal.append(emos, lines);
    this.root.append(this.dots, this.key, this.pal);
    document.getElementById('btn-back')!.before(this.root);
    window.addEventListener('pointerdown', (e) => {
      if (this.open && !(e.target as HTMLElement).closest('.mp-hud')) this.toggle(false);
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') {
        e.stopPropagation();
        this.toggle(false);
      }
    }, true);
  }

  private get open() {
    return !this.pal.hidden;
  }

  private toggle(on: boolean) {
    this.pal.hidden = !on;
    this.key.setAttribute('aria-expanded', String(on));
  }

  private pick(e: string) {
    sfx.click();
    this.toggle(false);
    this.h.emote(e);
  }

  /** Shown while in a group: one dot per player at the table, in their colour. */
  render() {
    const on = net.on;
    this.root.hidden = !on;
    document.body.classList.toggle('mp-on', on);
    document.body.classList.toggle('mp-guest', net.isGuest);
    if (!on) {
      this.toggle(false);
      return;
    }
    const r = net.roster();
    this.dots.innerHTML = '';
    for (const p of r) {
      const i = el('i');
      i.style.setProperty('--c', hex(p.color));
      if (p.self) i.className = 'self';
      i.title = p.self ? `${p.name} (du)` : p.name;
      this.dots.appendChild(i);
    }
    const names = r.map((p) => (p.self ? `${p.name} (du)` : p.name)).join(', ');
    this.dots.setAttribute('aria-label', `Gruppe ${net.code}: ${names}`);
    this.dots.title = `Gruppe ${net.code}: ${names}`;
  }
}
