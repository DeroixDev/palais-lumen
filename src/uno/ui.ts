// The table on screen. Gets a View from the table (local or over the network), draws it, and
// turns what changed into motion: cards fly from hand to pile and from the deck to hands, the
// direction ring flips, UNO! slams in. Everything that moves uses transform and opacity only.

import { BACK_INNER, CARD_COLORS, SPRITE, cardClass, cardInner } from './cards';
import { COLOR_NAME, type Action, type Card, type Color, type GameEvent } from './engine';
import { glitterBurst } from './fx';
import { PLAYER_COLORS } from './profile';
import { setMuted, sfx, unlock } from './sfx';
import type { TableView } from './table';

export interface Client {
  send(a: Action): void;
  /** May start the next round (solo, or the host online). */
  owner: boolean;
  online: boolean;
  /** Name of whoever starts the next round (shown to friends). */
  ownerName: string;
}

export interface UIOpts {
  muted: boolean;
  onMute(m: boolean): void;
  onLeave(): void;
  /** After a match: back to the lobby (online: the room). */
  onLobby(): void;
  onEvent?(e: GameEvent, v: TableView): void;
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ORDER: Record<string, number> = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const KORD: Record<string, number> = { num: 0, skip: 10, rev: 11, d2: 12, wild: 13, d4: 14 };
const sortKey = (c: Card) => ORDER[c.c] * 100 + (c.k === 'num' ? c.n! : KORD[c.k]);
const COLOR_KEYS: Color[] = ['r', 'y', 'g', 'b'];
const pcol = (i: number) => PLAYER_COLORS[i] ?? PLAYER_COLORS[0];
const initial = (n: string) => esc([...n.trim()][0]?.toUpperCase() ?? '?');

function avatar(name: string, color: number, cls = '') {
  return `<span class="ava ${cls}" style="--pc:${pcol(color)}" aria-hidden="true">${initial(name)}</span>`;
}

/** Positions of opponents around the table, clockwise from my left. */
function seatPositions(n: number): string[] {
  if (n === 1) return ['top'];
  if (n === 2) return ['left', 'right'];
  return ['left', 'top', 'right'];
}

export class TableUI {
  v: TableView | null = null;
  private el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector<T>(s)!;
  private slots = new Map<number, HTMLButtonElement>();
  private opps = new Map<number, HTMLElement>();
  private focusIdx = 0;
  private mid = 0;
  private modal: 'color' | 'target' | 'result' | 'leave' | null = null;
  private pickFor: Card | null = null;
  private resultTimer = 0;
  private layoutRaf = 0;
  private cw = 100;
  private wasMyTurn = false;
  private discTop = -1;
  private ro: ResizeObserver;

  constructor(root: HTMLElement, private client: Client, private opts: UIOpts) {
    this.el = document.createElement('div');
    this.el.className = 'tbl';
    this.el.innerHTML = `${SPRITE}
<header class="tbar">
  <a class="back" href="./index.html"><span aria-hidden="true">←</span> Alle Spiele</a>
  <div class="tinfo"><b class="t-round">Runde 1</b><span class="t-target"></span></div>
  <div class="tbtns">
    <button class="ib b-mute" type="button" aria-pressed="false" title="Ton an/aus (M)"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="wav" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M16 9l6 6M22 9l-6 6"/></svg><span class="sr">Ton</span></button>
    <button class="ib b-leave" type="button">Verlassen</button>
  </div>
</header>
<div class="felt">
  <div class="felt-deco" aria-hidden="true"></div>
  <div class="ringwrap" aria-hidden="true"><div class="ringflip"><svg class="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 9" opacity=".5"/>${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 100 100)" d="M100 6l12 6-12 6z" fill="currentColor"/>`).join('')}</svg></div></div>
  <div class="opps"></div>
  <div class="mid">
    <button class="pile draw" type="button" aria-label="Karte ziehen (Z)">
      <span class="stack"><span class="card back s3">${BACK_INNER}</span><span class="card back s2">${BACK_INNER}</span><span class="card back s1">${BACK_INNER}</span></span>
      <span class="draw-lbl">Ziehen</span><span class="draw-n"></span>
    </button>
    <div class="pile disc" aria-live="polite"><div class="cur" aria-hidden="true"></div><div class="disc-cards"></div><span class="cur-lbl"></span></div>
    <div class="pend" aria-hidden="true"></div>
  </div>
  <p class="status" aria-live="polite"></p>
  <div class="toast" aria-live="polite"></div>
</div>
<div class="mebar">
  <div class="me-id"></div>
  <div class="acts">
    <button class="act b-catch" type="button" hidden></button>
    <button class="act b-pass" type="button" hidden>Behalten</button>
    <button class="act b-uno" type="button" disabled><span>UNO!</span></button>
  </div>
</div>
<div class="hand" role="group" aria-label="Deine Hand"></div>
<div class="fly" aria-hidden="true"></div>
<div class="callout" aria-hidden="true"><div class="co-band"></div><div class="co-big"></div><div class="co-sub"></div></div>
<div class="modal" hidden><div class="sheet" role="dialog" aria-modal="true"></div></div>`;
    root.appendChild(this.el);

    this.q('.b-mute').addEventListener('click', () => this.toggleMute());
    this.q('.b-leave').addEventListener('click', () => this.openLeave());
    this.q('.pile.draw').addEventListener('click', () => this.draw());
    this.q('.b-pass').addEventListener('click', () => this.send({ t: 'pass' }));
    this.q('.b-uno').addEventListener('click', () => this.send({ t: 'uno' }));
    this.q('.b-catch').addEventListener('click', () => { if (this.v?.open != null) this.send({ t: 'catch', target: this.v.open }); });
    this.q('.hand').addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLButtonElement>('.slot');
      if (slot) this.tryPlay(Number(slot.dataset.id));
    });
    this.q('.hand').addEventListener('keydown', (e) => this.handKey(e));
    this.q('.modal').addEventListener('keydown', (e) => this.modalKey(e));
    this.keyFn = (e: KeyboardEvent) => this.globalKey(e);
    addEventListener('keydown', this.keyFn);
    this.ro = new ResizeObserver(() => this.scheduleLayout());
    this.ro.observe(this.q('.hand'));
    this.setMuteBtn();
  }

  private keyFn: (e: KeyboardEvent) => void;

  destroy() {
    removeEventListener('keydown', this.keyFn);
    this.ro.disconnect();
    clearTimeout(this.resultTimer);
    this.el.remove();
  }

  private send(a: Action) {
    unlock();
    this.client.send(a);
  }

  // ---------------- input ----------------

  private myTurn() {
    const v = this.v;
    return !!v && v.turn === v.me && (v.phase === 'play' || v.phase === 'drawn');
  }

  private draw() {
    unlock();
    if (!this.myTurn() || this.v!.phase !== 'play') { this.shake(this.q('.pile.draw')); return; }
    this.send({ t: 'draw' });
  }

  private tryPlay(id: number) {
    unlock();
    const v = this.v;
    if (!v) return;
    const c = v.hand.find((h) => h.id === id);
    if (!c) return;
    if (!v.can.includes(id)) {
      const slot = this.slots.get(id);
      if (slot) this.shake(slot.firstElementChild as HTMLElement);
      sfx.nope();
      return;
    }
    if (c.c === 'w') return this.openColor(c);
    if (v.rules.sevenZero && c.k === 'num' && c.n === 7 && v.hand.length > 1) return this.openTarget(c);
    this.send({ t: 'play', id });
  }

  private shake(el: HTMLElement) {
    if (reduced.matches) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  private sortedHand() {
    return [...(this.v?.hand ?? [])].sort((a, b) => sortKey(a) - sortKey(b));
  }

  private handKey(e: KeyboardEvent) {
    const hand = this.sortedHand();
    if (!hand.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      this.focusIdx = Math.max(0, Math.min(hand.length - 1, this.focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      this.slots.get(hand[this.focusIdx].id)?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.focusIdx = e.key === 'Home' ? 0 : hand.length - 1;
      this.slots.get(hand[this.focusIdx].id)?.focus();
    }
  }

  private globalKey(e: KeyboardEvent) {
    if (this.modal || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'd') { e.preventDefault(); this.draw(); }
    else if (k === 'u') { e.preventDefault(); if (this.v?.canUno) this.send({ t: 'uno' }); }
    else if (k === 'e') { e.preventDefault(); if (this.v?.open != null && this.v.open !== this.v.me) this.send({ t: 'catch', target: this.v.open }); }
    else if (k === 'b' && this.v?.phase === 'drawn' && this.myTurn()) { e.preventDefault(); this.send({ t: 'pass' }); }
    else if (k === 'm') { e.preventDefault(); this.toggleMute(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement).closest('.hand, .sheet')) {
      // arrows anywhere start in the hand: the first playable card
      const hand = this.sortedHand();
      if (!hand.length) return;
      e.preventDefault();
      const first = hand.findIndex((c) => this.v!.can.includes(c.id));
      this.focusIdx = first >= 0 ? first : 0;
      this.slots.get(hand[this.focusIdx].id)?.focus();
    }
  }

  private toggleMute() {
    this.opts.muted = !this.opts.muted;
    setMuted(this.opts.muted);
    this.opts.onMute(this.opts.muted);
    this.setMuteBtn();
    if (!this.opts.muted) { unlock(); sfx.flick(); }
  }

  private setMuteBtn() {
    const b = this.q('.b-mute');
    b.classList.toggle('off', this.opts.muted);
    b.setAttribute('aria-pressed', String(this.opts.muted));
    b.title = this.opts.muted ? 'Ton an (M)' : 'Ton aus (M)';
  }

  // ---------------- modals ----------------

  private openModal(kind: NonNullable<TableUI['modal']>, html: string, focus = 'button') {
    this.modal = kind;
    const m = this.q('.modal');
    const sheet = this.q('.sheet');
    sheet.className = 'sheet sh-' + kind;
    sheet.innerHTML = html;
    m.hidden = false;
    if (!reduced.matches) sheet.animate([{ opacity: 0, transform: 'translateY(24px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.9,.25,1)' });
    sheet.querySelector<HTMLElement>(focus)?.focus();
  }

  private closeModal() {
    this.modal = null;
    this.pickFor = null;
    this.q('.modal').hidden = true;
    const hand = this.sortedHand();
    const c = hand[Math.min(this.focusIdx, hand.length - 1)];
    if (c && document.activeElement === document.body) this.slots.get(c.id)?.focus({ preventScroll: true });
  }

  private modalKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && (this.modal === 'color' || this.modal === 'target' || this.modal === 'leave')) { e.preventDefault(); this.closeModal(); return; }
    const btns = [...this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick')];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      btns[(i + d + btns.length) % btns.length].focus();
    } else if (/^[1-4]$/.test(e.key) && this.modal === 'color') {
      btns[Number(e.key) - 1]?.click();
    }
  }

  private openColor(c: Card) {
    this.pickFor = c;
    const v = this.v!;
    const counts: Record<Color, number> = { r: 0, y: 0, g: 0, b: 0 };
    for (const h of v.hand) if (h.c !== 'w') counts[h.c]++;
    this.openModal('color', `
      <h2 class="sh-title">Welche Farbe?</h2>
      <div class="picks">${COLOR_KEYS.map((k, i) => `<button class="pick pc-${k}" type="button" data-c="${k}" style="--cc:${CARD_COLORS[k]}"><span class="pk-n">${i + 1}</span><b>${COLOR_NAME[k]}</b><small>${counts[k]} auf der Hand</small></button>`).join('')}</div>
      <button class="ghost cancel" type="button">Abbrechen</button>`, '.pick');
    this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.addEventListener('click', () => {
      const card = this.pickFor;
      this.closeModal();
      if (!card) return;
      this.send({ t: 'play', id: card.id, color: b.dataset.c as Color });
    }));
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openTarget(c: Card) {
    this.pickFor = c;
    const v = this.v!;
    const others = v.seats.map((s, i) => ({ s, i })).filter((x) => x.i !== v.me);
    this.openModal('target', `
      <h2 class="sh-title">Mit wem tauschen?</h2>
      <p class="sh-sub">Die 7: Du gibst deine Hand ab und bekommst die andere.</p>
      <div class="picks tg">${others.map(({ s, i }) => `<button class="pick" type="button" data-i="${i}">${avatar(s.name, s.color)}<b>${esc(s.name)}</b><small>${s.count} ${s.count === 1 ? 'Karte' : 'Karten'}</small></button>`).join('')}</div>
      <button class="ghost cancel" type="button">Abbrechen</button>`, '.pick');
    this.q('.sheet').querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.addEventListener('click', () => {
      const card = this.pickFor;
      this.closeModal();
      if (card) this.send({ t: 'play', id: card.id, target: Number(b.dataset.i) });
    }));
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openLeave() {
    this.openModal('leave', `
      <h2 class="sh-title">Tisch verlassen?</h2>
      <p class="sh-sub">${this.client.online ? (this.client.owner ? 'Du bist Gastgeber: Für alle endet das Spiel.' : 'Ein Bot übernimmt deinen Platz.') : 'Die laufende Partie wird nicht gewertet.'}</p>
      <div class="row"><button class="btn-main yes" type="button">Verlassen</button><button class="ghost cancel" type="button">Weiterspielen</button></div>`, '.cancel');
    this.q('.sheet .yes').addEventListener('click', () => { this.closeModal(); this.opts.onLeave(); });
    this.q('.sheet .cancel').addEventListener('click', () => this.closeModal());
  }

  private openResult(v: TableView) {
    const r = v.result;
    if (!r) return;
    const w = v.seats[r.winner];
    const meWon = r.winner === v.me;
    const final = r.final;
    const order = v.seats.map((s, i) => ({ s, i })).sort((a, b) => b.s.score - a.s.score);
    const target = v.rules.target;
    const title = final ? (meWon ? 'Du gewinnst das Spiel' : `${esc(w.name)} gewinnt das Spiel`) : meWon ? 'Runde an dich' : `Runde an ${esc(w.name)}`;
    const btn = this.client.owner
      ? final
        ? `<button class="btn-main go" type="button">Revanche</button><button class="ghost to-lobby" type="button">${this.client.online ? 'Zurück in den Raum' : 'Zur Lobby'}</button>`
        : `<button class="btn-main go" type="button">Nächste Runde</button>`
      : `<p class="wait">${final ? 'Gleich geht es weiter: ' : ''}${esc(this.client.ownerName)} startet die nächste ${final ? 'Partie' : 'Runde'}.</p>`;
    this.openModal('result', `
      <p class="sh-kick">${final ? 'Spielende' : `Runde ${v.round}`}</p>
      <h2 class="sh-title big">${title}</h2>
      <p class="sh-pts"><b>+${r.points}</b> Punkte${final ? '' : ` · Ziel ${target}`}</p>
      <ol class="score">${order.map(({ s, i }) => `<li class="${i === r.winner ? 'won' : ''}${i === v.me ? ' me' : ''}">
        ${avatar(s.name, s.color)}<span class="sc-name">${esc(s.name)}${i === v.me ? ' <small>(du)</small>' : ''}</span>
        <span class="sc-hand">${i === r.winner ? 'leer' : `${r.hands[i]} in der Hand`}</span>
        <span class="sc-bar"><i style="transform:scaleX(${Math.min(1, s.score / target).toFixed(3)})"></i></span>
        <b class="sc-tot">${s.score}</b></li>`).join('')}</ol>
      <div class="row">${btn}</div>`, '.go');
    this.q('.sheet').querySelector('.go')?.addEventListener('click', () => { this.closeModal(); this.send({ t: 'next' }); });
    this.q('.sheet').querySelector('.to-lobby')?.addEventListener('click', () => { this.closeModal(); this.opts.onLobby(); });
  }

  // ---------------- update ----------------

  update(v: TableView) {
    const prev = this.v;
    // remember where things were, to fly from there
    const before = new Map<number, DOMRect>();
    for (const [id, s] of this.slots) before.set(id, (s.firstElementChild as HTMLElement).getBoundingClientRect());
    const newMatch = v.mid !== this.mid;
    this.mid = v.mid;
    this.v = v;
    if (newMatch && this.modal === 'result') this.closeModal();
    if (this.modal === 'result' && (v.phase === 'play' || v.phase === 'drawn')) this.closeModal();
    if ((this.modal === 'color' || this.modal === 'target') && (!this.pickFor || !v.can.includes(this.pickFor.id))) this.closeModal();

    this.renderTop(v);
    this.renderOpps(v);
    this.renderMid(v, prev);
    this.renderMe(v);
    const fresh = this.renderHand(v);
    this.layoutHand(true);
    this.animate(v, before, fresh);

    const my = this.myTurn();
    if (my && !this.wasMyTurn && v.events.every((e) => e.k !== 'deal')) sfx.turn();
    this.wasMyTurn = my;
  }

  private renderTop(v: TableView) {
    this.q('.t-round').textContent = `Runde ${v.round}`;
    this.q('.t-target').textContent = `bis ${v.rules.target} Punkte`;
  }

  private renderOpps(v: TableView) {
    const n = v.seats.length;
    const others: number[] = [];
    for (let k = 1; k < n; k++) others.push((v.me + k) % n);
    const pos = seatPositions(others.length);
    const box = this.q('.opps');
    box.dataset.n = String(others.length);
    for (const [i, el] of this.opps) if (!others.includes(i)) { el.remove(); this.opps.delete(i); }
    others.forEach((i, k) => {
      const s = v.seats[i];
      let el = this.opps.get(i);
      if (!el) {
        el = document.createElement('div');
        el.className = 'opp';
        el.dataset.seat = String(i);
        el.innerHTML = `<div class="o-head"><span class="o-ava"></span><span class="o-txt"><b class="o-name"></b><span class="o-sub"></span></span></div><div class="o-fan"></div><span class="o-count"></span><span class="o-flash"></span>`;
        box.appendChild(el);
        this.opps.set(i, el);
      }
      el.dataset.pos = pos[k];
      el.style.setProperty('--pc', pcol(s.color));
      el.classList.toggle('turn', v.turn === i && (v.phase === 'play' || v.phase === 'drawn'));
      el.classList.toggle('uno', s.count === 1);
      el.classList.toggle('open', v.open === i);
      const ava = el.querySelector('.o-ava')!;
      const key = `${s.name}|${s.color}`;
      if (ava.getAttribute('data-k') !== key) { ava.setAttribute('data-k', key); ava.innerHTML = avatar(s.name, s.color); }
      el.querySelector('.o-name')!.textContent = s.name;
      el.querySelector('.o-sub')!.textContent = `${s.score} Pkt${s.away ? ' · weg, Bot spielt' : s.bot ? ' · Bot' : ''}`;
      el.querySelector('.o-count')!.textContent = String(s.count);
      const fan = el.querySelector<HTMLElement>('.o-fan')!;
      const show = Math.min(s.count, 8);
      if (fan.childElementCount !== show) {
        let h = '';
        for (let j = 0; j < show; j++) {
          const a = (j - (show - 1) / 2) * 7;
          h += `<span class="card back mini" style="transform:translateX(calc(var(--fs) * ${(j - (show - 1) / 2).toFixed(1)})) rotate(${a.toFixed(1)}deg)"></span>`;
        }
        fan.innerHTML = h;
      }
      el.setAttribute('aria-label', `${s.name}: ${s.count} ${s.count === 1 ? 'Karte' : 'Karten'}, ${s.score} Punkte${v.turn === i ? ', ist dran' : ''}`);
    });
  }

  private renderMid(v: TableView, prev: TableView | null) {
    const mid = this.q('.mid');
    const cur = v.color;
    mid.style.setProperty('--cur', cur ? CARD_COLORS[cur] : '#f7f2ff');
    const top = v.pile[v.pile.length - 1];
    const lbl = this.q('.cur-lbl');
    lbl.textContent = cur ? COLOR_NAME[cur] : 'Freie Farbe';
    lbl.classList.toggle('show', !!top && (top.c === 'w' || !cur));
    if (top && top.id !== this.discTop) {
      this.discTop = top.id;
      const box = this.q('.disc-cards');
      // keep the last few cards, each a little turned: a real pile
      const cards = v.pile.slice(-4);
      box.innerHTML = cards
        .map((c) => {
          const r = ((c.id * 37) % 23) - 11;
          const x = ((c.id * 13) % 9) - 4;
          return `<div class="${cardClass(c)}" data-id="${c.id}" style="transform:translate(${x}px,${(((c.id * 7) % 7) - 3)}px) rotate(${r}deg)">${cardInner(c)}</div>`;
        })
        .join('');
    }
    this.q('.draw-n').textContent = String(v.drawCount);
    const drawBtn = this.q('.pile.draw');
    const my = this.myTurn();
    drawBtn.classList.toggle('hint', my && v.phase === 'play' && (v.can.length === 0 || v.pending > 0));
    drawBtn.classList.toggle('empty', v.drawCount === 0);
    this.q('.draw-lbl').textContent = v.pending > 0 && my ? `+${v.pending} ziehen` : 'Ziehen';
    const pend = this.q('.pend');
    pend.textContent = v.pending ? `+${v.pending}` : '';
    pend.classList.toggle('show', v.pending > 0);
    const ring = this.q('.ringwrap');
    ring.classList.toggle('ccw', v.dir === -1);
    void prev;

    // the status line
    const s = this.q('.status');
    const t = v.seats[v.turn];
    let txt = '';
    if (v.phase === 'roundEnd' || v.phase === 'matchEnd') txt = v.result ? (v.result.winner === v.me ? 'Du hast keine Karten mehr!' : `${v.seats[v.result.winner].name} ist raus!`) : '';
    else if (my) {
      if (v.pending > 0) txt = v.can.length ? `+${v.pending} kommt auf dich zu: drauflegen oder ziehen` : `Du ziehst ${v.pending} Karten`;
      else if (v.phase === 'drawn') txt = 'Gezogene Karte spielen oder behalten?';
      else txt = v.can.length ? 'Du bist dran' : 'Nichts passt: zieh eine Karte';
    } else txt = `${t.name} ist dran`;
    if (s.textContent !== txt) s.textContent = txt;
    s.classList.toggle('mine', my);
    this.el.classList.toggle('my-turn', my);
  }

  private renderMe(v: TableView) {
    const me = v.seats[v.me];
    const box = this.q('.me-id');
    const key = `${me.name}|${me.color}|${me.score}|${v.hand.length}`;
    if (box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = `${avatar(me.name, me.color)}<span class="me-txt"><b>${esc(me.name)}</b><span>${me.score} Pkt · ${v.hand.length} ${v.hand.length === 1 ? 'Karte' : 'Karten'}</span></span>`;
    }
    const uno = this.q<HTMLButtonElement>('.b-uno');
    uno.disabled = !v.canUno;
    uno.classList.toggle('hot', v.canUno && (v.open === v.me || v.turn === v.me));
    const pass = this.q<HTMLButtonElement>('.b-pass');
    pass.hidden = !(v.phase === 'drawn' && this.myTurn());
    const ca = this.q<HTMLButtonElement>('.b-catch');
    const open = v.open !== null && v.open !== v.me ? v.open : null;
    ca.hidden = open === null;
    if (open !== null) ca.innerHTML = `Erwischt! <small>${esc(v.seats[open].name)} hat nicht UNO gesagt</small>`;
  }

  /** Builds/updates the hand; returns ids of cards that just arrived. */
  private renderHand(v: TableView): Set<number> {
    const hand = this.sortedHand();
    const ids = new Set(hand.map((c) => c.id));
    const fresh = new Set<number>();
    const box = this.q('.hand');
    for (const [id, s] of this.slots) if (!ids.has(id)) { s.remove(); this.slots.delete(id); }
    const my = this.myTurn() || (v.rules.jumpIn && v.can.length > 0);
    hand.forEach((c, i) => {
      let s = this.slots.get(c.id);
      if (!s) {
        s = document.createElement('button');
        s.type = 'button';
        s.className = 'slot';
        s.dataset.id = String(c.id);
        s.innerHTML = `<span class="${cardClass(c)}">${cardInner(c)}</span>`;
        box.appendChild(s);
        this.slots.set(c.id, s);
        fresh.add(c.id);
      }
      const can = v.can.includes(c.id);
      s.classList.toggle('can', can);
      s.classList.toggle('dim', my && !can);
      s.classList.toggle('drawn', v.drawnId === c.id);
      s.tabIndex = i === Math.min(this.focusIdx, hand.length - 1) ? 0 : -1;
      s.style.zIndex = String(i + 1);
      s.setAttribute('aria-label', `${cardLabel(c)}${can ? ', spielbar' : ''}`);
    });
    return fresh;
  }

  private scheduleLayout() {
    if (this.layoutRaf) return;
    this.layoutRaf = requestAnimationFrame(() => { this.layoutRaf = 0; this.layoutHand(false); });
  }

  /** Fans the hand out: one arc, or two rows when it gets long. */
  private layoutHand(animated: boolean) {
    const box = this.q('.hand');
    const W = box.clientWidth;
    const hand = this.sortedHand();
    const n = hand.length;
    if (!n) return;
    // layout width of a card (transforms don't change offsetWidth)
    this.cw = (this.slots.get(hand[0].id)?.offsetWidth ?? 0) || this.cw;
    const cw = this.cw;
    const minStep = cw * 0.36;
    const perRow = Math.max(1, Math.floor((W - cw) / minStep) + 1);
    const rows = Math.ceil(n / perRow);
    const per = Math.ceil(n / rows);
    hand.forEach((c, i) => {
      const s = this.slots.get(c.id);
      if (!s) return;
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const j = i - row * per;
      const step = inRow > 1 ? Math.min(cw * 0.72, (W - cw) / (inRow - 1)) : 0;
      const mid = (inRow - 1) / 2;
      const off = j - mid;
      const ang = rows > 1 ? off * 1.2 : off * Math.min(4, 36 / Math.max(inRow, 1));
      const x = off * step;
      // a gentle arc: the middle card highest, the outer ones level with the bottom edge
      const k = Math.min(2.2, 40 / Math.max(inRow * inRow, 1)) * (cw / 100);
      const y = (rows > 1 ? 0 : (Math.abs(off) ** 2 - mid * mid) * k) - (rows - 1 - row) * cw * 0.62;
      s.style.transition = animated && !reduced.matches ? '' : 'none';
      s.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`;
    });
    box.style.setProperty('--rows', String(rows));
  }

  // ---------------- motion ----------------

  private seatRect(i: number): DOMRect {
    const v = this.v!;
    if (i === v.me) return this.q('.hand').getBoundingClientRect();
    const el = this.opps.get(i)?.querySelector('.o-fan') ?? this.opps.get(i);
    return (el ?? this.q('.opps')).getBoundingClientRect();
  }

  /** Flies a card element from rect a to rect b (fixed layer), transform/opacity only. */
  private fly(make: () => HTMLElement, a: DOMRect, b: DOMRect, delay: number, dur: number, opts: { spin?: number; fromScale?: number; onDone?: () => void; onStart?: () => void } = {}) {
    if (reduced.matches) { opts.onStart?.(); opts.onDone?.(); return; }
    const layer = this.q('.fly');
    const el = make();
    el.classList.add('flying');
    const w = b.width, h = b.height;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = b.left + 'px';
    el.style.top = b.top + 'px';
    el.style.setProperty('--cw', w + 'px');
    const sx = a.width / w;
    const dx = a.left + a.width / 2 - (b.left + w / 2);
    const dy = a.top + a.height / 2 - (b.top + h / 2);
    const s0 = opts.fromScale ?? sx;
    const spin = opts.spin ?? 0;
    el.style.opacity = '0';
    layer.appendChild(el);
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(${s0})`, opacity: 1 },
        { transform: `translate(${dx * 0.12}px, ${dy * 0.12 - 18}px) rotate(${spin * 0.1}deg) scale(1.06)`, opacity: 1, offset: 0.8 },
        { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 },
      ],
      { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' },
    );
    let started = false;
    const start = () => { if (!started) { started = true; el.style.opacity = '1'; opts.onStart?.(); } };
    if (delay > 0) setTimeout(start, delay); else start();
    anim.finished.then(() => { start(); el.remove(); opts.onDone?.(); }, () => { el.remove(); opts.onDone?.(); });
  }

  private animate(v: TableView, before: Map<number, DOMRect>, fresh: Set<number>) {
    let delay = 0;
    const drawRect = this.q('.pile.draw .s1').getBoundingClientRect();
    const hiddenFresh = new Set<number>();
    const showSlot = (id: number) => this.slots.get(id)?.classList.remove('incoming');
    const deal = v.events.some((e) => e.k === 'deal');
    if (deal) {
      // the whole hand comes off the deck one by one
      if (this.modal === 'result') this.closeModal();
      sfx.shuffle();
      const hand = this.sortedHand();
      hand.forEach((c, i) => {
        const s = this.slots.get(c.id);
        if (!s) return;
        s.classList.add('incoming');
        const card = s.firstElementChild as HTMLElement;
        this.fly(() => { const e = document.createElement('div'); e.className = 'card back'; e.innerHTML = BACK_INNER; return e; }, drawRect, card.getBoundingClientRect(), 200 + i * 70, 380, { onDone: () => showSlot(c.id), spin: -20 });
      });
      for (const i of this.opps.keys()) {
        const fan = this.opps.get(i)!.querySelector<HTMLElement>('.o-fan')!;
        if (!reduced.matches) fan.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 300, fill: 'backwards' });
      }
      this.flipIn(700);
      for (const e of v.events) this.opts.onEvent?.(e, v);
      return;
    }
    for (const e of v.events) {
      this.opts.onEvent?.(e, v);
      switch (e.k) {
        case 'play': {
          const topEl = this.q('.disc-cards').querySelector<HTMLElement>(`[data-id="${e.card.id}"]`);
          const dest = (topEl ?? this.q('.disc-cards')).getBoundingClientRect();
          const src = e.p === v.me ? before.get(e.card.id) ?? this.seatRect(e.p) : this.seatRect(e.p);
          const fromScale = e.p === v.me ? undefined : 0.5;
          if (topEl) topEl.style.opacity = '0';
          const d = delay;
          this.fly(() => { const el = document.createElement('div'); el.className = cardClass(e.card); el.innerHTML = cardInner(e.card); return el; }, src, dest, d, 330, {
            spin: ((e.card.id * 37) % 23) - 11 + (e.p === v.me ? 0 : 40),
            fromScale,
            onStart: () => sfx.flick(),
            onDone: () => { if (topEl) topEl.style.opacity = ''; this.thud(); },
          });
          if (e.jump) this.callout('Reingeworfen!', v.seats[e.p].name, 'jump', d);
          if (e.color && e.card.c === 'w') setTimeout(() => this.toast(`${v.seats[e.p].name} wählt ${COLOR_NAME[e.color!]}`, e.color), d + 320);
          delay += 260;
          break;
        }
        case 'draw': {
          const n = Math.min(e.n, 6);
          const d0 = delay;
          if (e.p === v.me) {
            e.cards.forEach((c, k) => {
              const s = this.slots.get(c.id);
              if (!s || !fresh.has(c.id)) return;
              s.classList.add('incoming');
              hiddenFresh.add(c.id);
              this.fly(() => { const el = document.createElement('div'); el.className = 'card back'; el.innerHTML = BACK_INNER; return el; }, drawRect, (s.firstElementChild as HTMLElement).getBoundingClientRect(), d0 + k * 110, 360, {
                spin: -14, onStart: () => sfx.draw(), onDone: () => showSlot(c.id),
              });
            });
          } else {
            const dest = this.seatRect(e.p);
            const small = new DOMRect(dest.left + dest.width / 2 - drawRect.width * 0.25, dest.top + dest.height / 2 - drawRect.height * 0.25, drawRect.width * 0.5, drawRect.height * 0.5);
            for (let k = 0; k < n; k++) {
              this.fly(() => { const el = document.createElement('div'); el.className = 'card back'; el.innerHTML = BACK_INNER; return el; }, drawRect, small, d0 + k * 110, 360, { fromScale: 2, spin: 12, onStart: () => sfx.draw() });
            }
          }
          if (e.penalty && e.n) this.flash(e.p, `+${e.n}`, d0);
          delay += 120 * n + 120;
          break;
        }
        case 'uno':
          this.callout('UNO!', v.seats[e.p].name, 'uno', delay);
          setTimeout(() => sfx.uno(), delay);
          break;
        case 'caught':
          this.callout('Erwischt!', `${v.seats[e.p].name} zieht 2`, 'caught', delay);
          setTimeout(() => sfx.caught(), delay);
          delay += 200;
          break;
        case 'skip':
          this.flash(e.p, 'Aussetzen', delay + 200);
          setTimeout(() => sfx.skip(), delay + 200);
          break;
        case 'rev':
          this.spinRing(delay);
          setTimeout(() => sfx.rev(), delay);
          break;
        case 'swap':
          this.toast(`${v.seats[e.a].name} tauscht mit ${v.seats[e.b].name}`);
          sfx.shuffle();
          if (e.a === v.me || e.b === v.me) this.flipIn(delay);
          break;
        case 'rotate':
          this.toast('Alle Hände wandern weiter');
          sfx.shuffle();
          this.flipIn(delay);
          break;
        case 'reshuffle':
          this.toast('Ablage neu gemischt');
          sfx.shuffle();
          break;
        case 'round': {
          clearTimeout(this.resultTimer);
          const won = e.winner === v.me;
          const fin = v.events.some((x) => x.k === 'match');
          this.resultTimer = window.setTimeout(() => {
            if (won || fin) {
              const rect = this.seatRect(e.winner);
              glitterBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, fin);
              if (won) sfx.win();
            }
            if (this.v?.result) this.openResult(this.v);
          }, delay + 750);
          break;
        }
        default:
          break;
      }
    }
    void hiddenFresh;
  }

  /** Cards in my hand turn up (deal, swap). */
  private flipIn(delay: number) {
    if (reduced.matches) return;
    let i = 0;
    for (const s of this.slots.values()) {
      if (s.classList.contains('incoming')) continue;
      (s.firstElementChild as HTMLElement).animate([{ opacity: 0, transform: 'translateY(30px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: delay + i++ * 30, fill: 'backwards', easing: 'cubic-bezier(.2,.9,.25,1)' });
    }
  }

  private thud() {
    if (reduced.matches) return;
    this.q('.disc-cards').animate([{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 160 });
  }

  private spinRing(delay: number) {
    const r = this.q('.ringflip');
    if (reduced.matches) return;
    r.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(200deg) scale(1.12)', offset: 0.6 }, { transform: 'rotate(360deg) scale(1)' }], { duration: 700, delay, easing: 'cubic-bezier(.3,.7,.3,1)' });
  }

  private flash(seat: number, text: string, delay: number) {
    const v = this.v!;
    const el = seat === v.me ? this.q('.me-id') : this.opps.get(seat);
    if (!el) return;
    let f = el.querySelector<HTMLElement>('.o-flash');
    if (!f) { f = document.createElement('span'); f.className = 'o-flash'; el.appendChild(f); }
    const fl = f;
    setTimeout(() => {
      fl.textContent = text;
      if (reduced.matches) { fl.style.opacity = '1'; setTimeout(() => (fl.style.opacity = ''), 1100); return; }
      fl.animate([{ opacity: 0, transform: 'translate(-50%, 6px) rotate(-6deg) scale(.7)' }, { opacity: 1, transform: 'translate(-50%, -4px) rotate(-6deg) scale(1.08)', offset: 0.2 }, { opacity: 1, transform: 'translate(-50%, -8px) rotate(-6deg) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%, -20px) rotate(-6deg) scale(1)' }], { duration: 1300 });
    }, delay);
  }

  private toastTimer = 0;
  toast(text: string, color?: Color) {
    const t = this.q('.toast');
    t.textContent = text;
    t.style.setProperty('--tc', color ? CARD_COLORS[color] : 'var(--acid)');
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
  }

  /** The big punchy callout across the table. */
  callout(big: string, sub: string, kind: string, delay = 0) {
    const co = this.q('.callout');
    setTimeout(() => {
      co.className = 'callout show k-' + kind;
      co.querySelector('.co-big')!.textContent = big;
      co.querySelector('.co-sub')!.textContent = sub;
      if (reduced.matches) { setTimeout(() => (co.className = 'callout'), 1100); return; }
      const bigEl = co.querySelector<HTMLElement>('.co-big')!;
      const band = co.querySelector<HTMLElement>('.co-band')!;
      const subEl = co.querySelector<HTMLElement>('.co-sub')!;
      band.animate([{ transform: 'rotate(-4deg) scaleX(0)', opacity: 1 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 1, offset: 0.15 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 1, offset: 0.8 }, { transform: 'rotate(-4deg) scaleX(1)', opacity: 0 }], { duration: 1250, easing: 'cubic-bezier(.2,.9,.25,1)' });
      bigEl.animate([{ transform: 'rotate(-7deg) scale(2.4)', opacity: 0 }, { transform: 'rotate(-7deg) scale(.94)', opacity: 1, offset: 0.14 }, { transform: 'rotate(-7deg) scale(1)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-7deg) scale(1.03)', opacity: 1, offset: 0.8 }, { transform: 'rotate(-7deg) translateY(-40px) scale(1.08)', opacity: 0 }], { duration: 1250, easing: 'ease-out' });
      subEl.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none', offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1250 });
      setTimeout(() => (co.className = 'callout'), 1260);
    }, delay);
  }
}

export function cardLabel(c: Card) {
  const col = c.c === 'w' ? '' : COLOR_NAME[c.c] + ' ';
  switch (c.k) {
    case 'num': return `${col}${c.n}`;
    case 'skip': return `${col}Aussetzen`;
    case 'rev': return `${col}Richtungswechsel`;
    case 'd2': return `${col}plus 2`;
    case 'wild': return 'Farbwahl';
    case 'd4': return 'Plus 4 Farbwahl';
  }
}
