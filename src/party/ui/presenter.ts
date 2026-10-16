// The board show: plays the engine's events on the 3D board and the side panels, and asks this
// browser's player for decisions (dice + items, junction arrows, shop, star, duel, Bande …).
// It is the same for solo, host and friends: it only reads the GameState it is given.

import { getBoard } from '../boards';
import type { BoardDef } from '../boards/types';
import type { Answer, Ask, GameEvent, GameState } from '../engine/state';
import { BONUS, BUDDIES, FINALE_RULES, ITEMS, STAR_PRICE, type BonusId, type ItemId } from '../engine/tables';
import { ranking } from '../engine/state';
import { sfx } from '../sfx';
import { LEGEND, SP } from '../spaces';
import type { Seat } from '../types';
import { $, E, SPEED, esc, reduced, wait } from '../util';
import { BoardView } from '../view3d/boardview';
import { hopFig } from '../view3d/figures';
import { floatText } from '../view3d/stage';
import { charSVG, coinSVG, starSVG } from './avatars';

export type BonusList = { id: BonusId; winners: number[] }[];

let toastT = 0;
export function toast(text: string, col = 'var(--acid)') {
  const t = $('#toast');
  t.textContent = text;
  t.style.setProperty('--tc', col);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => t.classList.remove('show'), 2600 * Math.max(SPEED, 0.6));
}
export async function banner(text: string, col = 'var(--acid)') {
  const b = $('#bannerBand');
  b.textContent = text;
  b.style.setProperty('--bc', col);
  sfx.whoosh();
  if (reduced) { await b.animate([{ opacity: 0, transform: 'rotate(-6deg)' }, { opacity: 1, transform: 'rotate(-6deg)', offset: 0.2 }, { opacity: 1, transform: 'rotate(-6deg)', offset: 0.8 }, { opacity: 0, transform: 'rotate(-6deg)' }], { duration: 900 }).finished; return; }
  await b.animate([{ transform: 'rotate(-6deg) translateX(-110%)', opacity: 1 }, { transform: 'rotate(-6deg) translateX(-2%)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-6deg) translateX(2%)', opacity: 1, offset: 0.74 }, { transform: 'rotate(-6deg) translateX(110%)', opacity: 1 }], { duration: 1250 * Math.max(SPEED, 0.3), easing: 'cubic-bezier(.2,.9,.25,1)' }).finished;
}

const kindText = (s: Seat, me: boolean) => (me ? 'Du' : s.kind === 'bot' ? `Bot · ${s.bot}` : s.away ? 'weg · Bot spielt' : 'Online');

export class Presenter {
  board: BoardDef;
  view: BoardView;
  st!: GameState;
  /** A friend whose show is behind skips the animations. */
  hurry = false;
  bonus: BonusList = [];
  private rows: HTMLElement[] = [];
  private pathDone: ((to: number) => void) | null = null;
  private pathOpts: { to: number; ok: boolean }[] = [];
  private rollDone: (() => void) | null = null;
  private watching = false;
  private keyFn: ((e: KeyboardEvent) => void) | null = null;

  constructor(public seats: Seat[], public me: number, boardId: string) {
    this.board = getBoard(boardId);
    this.view = new BoardView(this.board);
    this.view.setSeats(seats);
    const canvas = $<HTMLCanvasElement>('#gl');
    const onMove = (e: PointerEvent) => {
      if (!this.pathDone) return;
      const to = this.view.pickArrow(e.clientX, e.clientY, canvas.getBoundingClientRect());
      this.view.hoverArrow(to ?? -1);
      canvas.style.cursor = to !== null ? 'pointer' : '';
    };
    const onClick = (e: MouseEvent) => {
      if (!this.pathDone) return;
      const to = this.view.pickArrow(e.clientX, e.clientY, canvas.getBoundingClientRect());
      if (to !== null && this.pathOpts.some((o) => o.to === to && o.ok)) this.pathDone(to);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);
    this.keyFn = (e) => this.onKey(e);
    addEventListener('keydown', this.keyFn);
    $('#viewBtn').onclick = () => { this.setUser(!this.view.view.user); sfx.pop(); };
    $('#rollBtn').onclick = () => this.rollDone?.();
    $('#boardName').textContent = this.board.name;
    $('#tBoard').textContent = `Brett: ${this.board.name}`;
    $('#legend').innerHTML = LEGEND.map((k) => `<li><i style="--sc:${SP[k].c}"></i>${k === 'X' ? esc(this.board.xName) : SP[k].short}</li>`).join('') + `<li><i style="--sc:#ffe14a"></i>Stern: ${STAR_PRICE}</li>`;
    this.buildRank();
  }

  dispose() {
    if (this.keyFn) removeEventListener('keydown', this.keyFn);
    this.view.dispose();
  }

  private setUser(on: boolean) { this.view.view.user = on; $('#viewBtn').setAttribute('aria-pressed', String(on)); }

  private onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || document.body.classList.contains('in-mg') || document.body.classList.contains('in-pod')) return;
    if (this.pathDone) {
      const ok = this.pathOpts.filter((o) => o.ok);
      const order = [...this.pathOpts].sort((a, b) => this.view.arrowScreenX(a.to) - this.view.arrowScreenX(b.to));
      let pick: number | null = null;
      if (e.code === 'ArrowLeft') pick = order.find((o) => o.ok)?.to ?? null;
      else if (e.code === 'ArrowRight') pick = [...order].reverse().find((o) => o.ok)?.to ?? null;
      else if (/^Digit[1-3]$/.test(e.code)) { const o = order[Number(e.code[5]) - 1]; if (o?.ok) pick = o.to; }
      if (pick !== null && ok.length) { e.preventDefault(); this.pathDone(pick); }
      return;
    }
    if (e.code === 'KeyO' || e.code === 'KeyM') { this.setUser(!this.view.view.user); return; }
    if (e.code === 'Space' && !e.repeat && this.rollDone && !(e.target instanceof HTMLButtonElement) && $('#ask').hidden) { e.preventDefault(); this.rollDone(); }
  }

  name(p: number) { return this.seats[p].name; }
  private wait(ms: number) { return this.hurry ? Promise.resolve() : wait(ms); }

  // ---------------- panels ----------------
  private buildRank() {
    const box = $('#rank');
    box.innerHTML = '';
    this.rows = this.seats.map((s, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.style.setProperty('--pc', s.color);
      li.innerHTML = `<span class="r-n">${i + 1}</span><span class="r-ava">${charSVG(s, true)}</span><span class="r-txt"><span class="r-name">${esc(s.name)}<span class="r-tag">am Zug</span><span class="r-badges"></span></span><span class="r-sub"></span></span><span class="r-vals"><span class="val s">${starSVG()}<b>0</b></span><span class="val c">${coinSVG}<b>0</b></span></span>`;
      box.appendChild(li);
      return li;
    });
  }

  renderRank(animate = true) {
    const st = this.st;
    if (!st) return;
    const before = this.rows.map((r) => r.getBoundingClientRect().top);
    const order = ranking(st);
    const box = $('#rank');
    order.forEach((p, n) => {
      const row = this.rows[p], P = st.players[p], s = this.seats[p];
      row.dataset.rank = String(n + 1);
      (row.querySelector('.r-n') as HTMLElement).textContent = String(n + 1);
      box.appendChild(row);
      const [sv, cv] = row.querySelectorAll<HTMLElement>('.r-vals b');
      if (sv.textContent !== String(P.stars)) { sv.textContent = String(P.stars); bump(sv); }
      if (cv.textContent !== String(P.coins)) { cv.textContent = String(P.coins); bump(cv); }
      row.classList.toggle('turn', st.turn === p && st.phase === 'play');
      const bits = [kindText(this.seats[p], p === this.me)];
      if (P.items.length) bits.push(P.items.map((i) => ITEMS[i].name).join(', '));
      if (st.buddy?.owner === p) bits.push(`Kumpel ${BUDDIES[st.buddy.kind].name} (${st.buddy.left})`);
      (row.querySelector('.r-sub') as HTMLElement).textContent = bits.join(' · ');
      const badges: string[] = [];
      if (P.bande) badges.push(`<span class="badge">Bande ${esc(this.seats[P.bande.with].name)}</span>`);
      if (P.rival) badges.push(`<span class="badge riv">Rivale ${esc(this.seats[P.rival.target].name)}</span>`);
      if (st.buddy?.owner === p) badges.push('<span class="badge bud">Kumpel</span>');
      (row.querySelector('.r-badges') as HTMLElement).innerHTML = badges.join('');
      void s;
    });
    if (!animate || reduced || this.hurry) return;
    this.rows.forEach((r, i) => {
      const dy = before[i] - r.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.9,.25,1)' });
    });
  }

  renderRound() {
    const st = this.st, R = st.rules.rounds;
    $('#dialN').innerHTML = `${st.round}<small>von ${R}</small>`;
    $('#dialVal').setAttribute('stroke-dashoffset', String(263.9 * (1 - st.round / R)));
    $('#tRound').textContent = `Runde ${st.round} / ${R}`;
    const left = R - st.round;
    $('#roundLeft').textContent = left > 0 ? `Noch ${left} Runde${left > 1 ? 'n' : ''}` : 'Letzte Runde!';
    $('#starChip').textContent = `Stern kostet ${st.finaleRule === 'cheapStar' ? 15 : STAR_PRICE} Münzen`;
    this.renderInfo();
  }

  renderInfo() {
    const st = this.st;
    const lines = this.board.info(st.bs, st.round, st.rules.rounds);
    const sn = this.board.graph.nodes[st.star];
    lines.splice(1, 0, { color: '#ffe14a', title: `Stern ${sn ? this.board.where(sn) : ''}.`, text: 'Zieht nach jedem Kauf um.' });
    lines.push(st.finale
      ? { color: '#ff4fb0', title: 'Finale läuft:', text: `Plus und Minus zählen doppelt.${st.finaleRule ? ` Regel: ${FINALE_RULES[st.finaleRule].name}.` : ''}` }
      : { color: '#ff4fb0', title: `Finale ab Runde ${Math.max(1, st.rules.rounds - 2)}:`, text: 'Plus- und Minusfelder zählen doppelt.' });
    if (st.buddy && st.buddy.owner === null && st.buddy.at !== null) lines.push({ color: BUDDIES[st.buddy.kind].color, title: `Kumpel ${BUDDIES[st.buddy.kind].name} wartet.`, text: `${BUDDIES[st.buddy.kind].text} Lande auf einem Kumpel-Feld.` });
    $('#boardInfo').innerHTML = lines.map((l) => `<li><i style="--ic:${l.color}"></i><span><b>${esc(l.title)}</b> ${esc(l.text)}</span></li>`).join('');
  }

  setTurn(p: number) {
    const lbl = $('#turnLbl');
    lbl.style.setProperty('--pc', this.seats[p].color);
    lbl.classList.toggle('me', p === this.me);
    $('#turnTxt').textContent = p === this.me ? 'Du bist dran!' : `${this.name(p)} ist dran`;
  }

  /** Everything from the state without animation (start, resume, a friend catching up). */
  sync(st: GameState) {
    this.st = st;
    this.view.apply(st);
    this.view.hideCounter();
    this.view.diceHide();
    this.renderRound();
    this.renderRank(false);
    if (st.phase === 'play') this.setTurn(Math.min(st.turn, st.players.length - 1));
  }

  // ---------------- events ----------------
  async play(ev: GameEvent, st: GameState) {
    this.st = st;
    this.clearWatch();
    const V = this.view, H = this.hurry;
    switch (ev.k) {
      case 'sync': this.sync(st); break;
      case 'banner': if (!H) await banner(ev.text, ev.color); break;
      case 'toast': toast(ev.text, ev.color); await this.wait(1400); break;
      case 'round':
        this.renderRound();
        $('#turnLbl').classList.remove('me');
        $('#turnTxt').textContent = `Runde ${ev.round}`;
        if (!H) await banner(ev.round === st.rules.rounds ? 'Letzte Runde!' : `Runde ${ev.round}`, ev.round === st.rules.rounds ? 'var(--yellow)' : 'var(--acid)');
        break;
      case 'turn':
        V.turn = ev.p;
        V.view.mode = 'follow';
        this.setTurn(ev.p);
        this.renderRank();
        await this.wait(350);
        break;
      case 'item': sfx.pop(); toast(`${this.name(ev.p)} setzt ${ITEMS[ev.item].name} ein.`, '#ffe14a'); this.renderRank(); await this.wait(900); break;
      case 'roll': {
        sfx.roll();
        if (!H) await V.diceHit(ev.p, ev.dice, ev.dieKind);
        const total = ev.dice.reduce((a, b) => a + b, 0) + ev.bonus;
        if (ev.bonus) toast(`Pips würfelt mit: +${ev.bonus}`, '#7dff8a');
        if (ev.dice.length > 1 && !H) floatText(V.figs[ev.p].root.position.clone().setY(3.6), ev.dice.join(' + '), '#ffe14a', V.scene);
        V.showCounter(ev.p, total);
        await this.wait(200);
        break;
      }
      case 'hop':
        if (H) { V.teleport(ev.p, ev.to); V.figs[ev.p].root.position.copy(V.nodePos(ev.to, ev.p)); }
        else { sfx.hop(ev.left); await V.hop(ev.p, ev.from, ev.to, 0); }
        if (ev.left > 0) V.showCounter(ev.p, ev.left); else V.hideCounter();
        break;
      case 'blocked': V.hideCounter(); sfx.bonk(); toast(`${this.name(ev.p)}: ${ev.text}`, 'var(--pink)'); await this.wait(1100); break;
      case 'coins': {
        if (ev.d) {
          const f = V.figs[ev.p];
          if (!H) {
            floatText(f.root.position.clone().setY(f.root.position.y + 2.5), `${ev.d > 0 ? '+' : '−'}${Math.abs(ev.d)} Münzen${ev.text ? ` · ${ev.text}` : ''}`, ev.d > 0 ? '#ffe14a' : '#ff8fb0', V.scene);
            V.coinBurst(ev.p, ev.d);
          }
          if (ev.d > 0) sfx.coin(); else sfx.lose();
        }
        this.renderRank();
        await this.wait(420);
        break;
      }
      case 'starBuy':
        V.hideCounter();
        sfx.star();
        if (!H) await V.starFly(ev.p);
        toast(`${this.name(ev.p)} holt sich einen Stern!`, '#ffe14a');
        this.renderRank();
        await this.wait(700);
        break;
      case 'starMove': if (!H) await V.starMove(ev.to); else V.placeStar(ev.to); this.renderInfo(); break;
      case 'starMiss': toast(`Der Stern kostet ${ev.price} Münzen. ${this.name(ev.p)} hat zu wenig.`, 'var(--pink)'); await this.wait(1200); break;
      case 'land': V.hideCounter(); sfx.land(); await this.wait(250); break;
      case 'buddy': {
        const b = BUDDIES[ev.kind];
        V.setBuddy(st.buddy?.kind ?? null, st.buddy?.owner ?? null, st.buddy?.at ?? null);
        if (ev.what === 'appear') { toast(`Kumpel ${b.name} (${b.look}) wartet auf einem Kumpel-Feld. ${b.text}`, b.color); if (ev.node !== undefined && !H) { V.view.mode = 'point'; const n = this.board.graph.nodes[ev.node]; V.view.pt.set(n.x, 0, n.z); await this.wait(1300); V.view.mode = 'follow'; } }
        else if (ev.what === 'join') { sfx.star(); toast(`${b.name} kommt mit ${this.name(ev.p!)}! ${b.text}`, b.color); }
        else if (ev.what === 'leave') toast(`${b.name} verabschiedet sich von ${this.name(ev.p!)}.`, b.color);
        else toast(`${b.name} wechselt zu ${this.name(ev.p!)}.`, b.color);
        this.renderRank();
        this.renderInfo();
        await this.wait(1300);
        break;
      }
      case 'swap': {
        sfx.whoosh();
        V.teleport(ev.a, st.players[ev.a].node);
        V.teleport(ev.b, st.players[ev.b].node);
        if (H) V.apply(st);
        else await Promise.all([hopFig(V.figs[ev.a], V.nodePos(st.players[ev.a].node, ev.a), 0.6, 4), hopFig(V.figs[ev.b], V.nodePos(st.players[ev.b].node, ev.b), 0.6, 4)]);
        break;
      }
      case 'wheel': await this.wheel(ev.options, ev.pick); break;
      case 'path': V.hideArrows(); $('#choice').hidden = true; break;
      case 'shop':
        if (ev.item) { sfx.buy(); toast(`${this.name(ev.p)} kauft ${ITEMS[ev.item].name} für ${ev.price} Münzen.`, '#b46bff'); }
        else toast(`${this.name(ev.p)} kauft nichts.`, '#b46bff');
        this.renderRank();
        await this.wait(900);
        break;
      case 'trap': V.setTraps(st.traps); break;
      case 'look': {
        if (H) break;
        const n = this.board.graph.nodes[ev.node];
        V.view.mode = 'point';
        V.view.pt.set(n.x, 0, n.z);
        await this.wait(1000);
        V.view.mode = 'follow';
        break;
      }
      case 'gimmick':
        if (!H) await V.decor.play(ev.name, ev.data); else V.decor.apply(st.bs);
        this.renderInfo();
        break;
      case 'mgAnnounce':
        V.hideCounter();
        if (!H) await banner('Minispiel!', 'var(--pink)');
        toast(ev.text, 'var(--pink)');
        await this.wait(1200);
        break;
      case 'bonus': this.bonus = ev.list; break;
      case 'end': break;
    }
  }

  private async wheel(options: string[], pick: number) {
    const w = $('#wheel'), t = $('#wheelTxt');
    w.hidden = false;
    sfx.wheel();
    const spins = this.hurry ? 1 : 14 + pick;
    for (let k = 0; k <= spins; k++) {
      const i = (pick - spins + k + options.length * 20) % options.length;
      t.textContent = options[i];
      if (k < spins) await this.wait(60 + E.out(k / spins) * 140);
    }
    t.textContent = options[pick];
    sfx.pop();
    await this.wait(900);
    w.hidden = true;
  }

  // ---------------- watching somebody else decide ----------------
  watch(p: number, a: Ask) {
    const n = this.name(p);
    const txt: Record<Ask['q'], string> = {
      roll: `${n} würfelt gleich …`, joker: `${n} wählt eine Zahl …`, target: `${n} überlegt …`, path: `${n} wählt einen Weg …`,
      buyStar: `${n} überlegt beim Stern …`, shop: `${n} stöbert im Laden …`, duel: `${n} wählt ein Duell …`, bandeOffer: `${n} überlegt …`,
      finale: `${n} wählt die Finale-Regel …`, yesno: `${n} überlegt …`,
    };
    const el = $('#watch');
    el.textContent = txt[a.q];
    el.hidden = false;
    this.watching = true;
    if (a.q === 'roll') this.view.diceShow(p, 1);
    if (a.q === 'path') this.view.showArrows(a.node, a.options);
  }
  clearWatch() {
    if (!this.watching) return;
    this.watching = false;
    $('#watch').hidden = true;
    if (!this.pathDone) this.view.hideArrows();
  }

  // ---------------- asking this browser's player ----------------
  async ask(p: number, a: Ask): Promise<Answer> {
    this.clearWatch();
    this.setUser(false);
    this.view.view.mode = 'follow';
    this.view.turn = this.st.turn < this.st.players.length ? this.st.turn : p;
    sfx.pop();
    switch (a.q) {
      case 'roll': return this.askRoll(p, a.items);
      case 'joker': {
        const n = await this.choose('Würfel-Joker', 'Welche Zahl soll es sein?', [1, 2, 3, 4, 5, 6].map((v) => ({ label: String(v), value: v })));
        return { n };
      }
      case 'target': {
        const opts = a.options.map((o) => ({ label: o < 0 ? 'Niemand' : this.name(o), value: o, sub: o < 0 ? '' : this.playerLine(o) }));
        return { p: await this.choose(a.title, a.text, opts, true) };
      }
      case 'path': return { to: await this.askPath(a.node, a.options) };
      case 'buyStar': {
        const yes = await this.choose('Stern kaufen?', `Ein Stern kostet ${a.price} Münzen. Du hast ${this.st.players[p].coins}.`, [{ label: `Kaufen (${a.price})`, value: true }, { label: 'Nicht jetzt', value: false }]);
        return { yes };
      }
      case 'shop': {
        const coins = this.st.players[p].coins;
        const opts = a.offer.map((o) => ({ label: ITEMS[o.item].name, value: o.item as ItemId | null, sub: `${o.price} Münzen · ${ITEMS[o.item].text}`, disabled: !o.ok }));
        opts.push({ label: 'Nichts kaufen', value: null, sub: '', disabled: false });
        const item = await this.choose(a.passing ? 'Laden im Vorbeigehen' : 'Laden', `Du hast ${coins} Münzen und ${this.st.players[p].items.length} von 3 Plätzen belegt.`, opts, true);
        return { item };
      }
      case 'duel': {
        const o = await this.choose('Duell!', 'Wen forderst du heraus?', a.opponents.map((q) => ({ label: this.name(q), value: q, sub: this.playerLine(q) })), true);
        const stake = await this.choose('Einsatz', `Worum spielt ihr gegen ${this.name(o)}?`, a.stakes.map((s, i) => ({ label: 'star' in s ? '1 Stern' : `${s.coins} Münzen`, value: i, sub: 'Wer gewinnt, bekommt den Einsatz des anderen.' })), true);
        return { p: o, stake };
      }
      case 'bandeOffer': {
        const yes = await this.choose('Bande?', `${this.name(a.from)} bietet dir eine Bande für 2 Runden an: Ihr teilt alle Minispiel-Münzen 50:50.`, [{ label: 'Einschlagen', value: true }, { label: 'Lieber nicht', value: false }]);
        return { yes };
      }
      case 'finale': {
        const rule = await this.choose('Finale-Regel', 'Du liegst hinten und darfst eine Regel für die letzten 3 Runden wählen.', a.options.map((r) => ({ label: FINALE_RULES[r].name, value: r, sub: FINALE_RULES[r].text })), true);
        return { rule };
      }
      case 'yesno': {
        const yes = await this.choose(a.title, a.text, [{ label: a.yes, value: true }, { label: a.no, value: false }]);
        return { yes };
      }
    }
  }

  private playerLine(p: number) {
    const P = this.st.players[p];
    return `${P.stars} Sterne · ${P.coins} Münzen`;
  }

  choose<T>(title: string, sub: string, opts: { label: string; value: T; sub?: string; disabled?: boolean }[], grid = false): Promise<T> {
    return new Promise((res) => {
      const box = $('#ask');
      $('#askT').textContent = title;
      $('#askS').textContent = sub;
      const wrap = $('#askB');
      wrap.className = grid ? 'grid' : '';
      wrap.innerHTML = '';
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = grid ? 'opt' : 'btn' + (i === 0 ? ' go' : ' ghost');
        b.innerHTML = grid ? `${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}` : esc(o.label);
        b.disabled = !!o.disabled;
        b.onclick = () => { box.hidden = true; sfx.pop(); res(o.value); };
        wrap.appendChild(b);
      });
      box.hidden = false;
      box.scrollTop = 0;
      (wrap.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
  }

  private askRoll(p: number, items: ItemId[]): Promise<Answer> {
    return new Promise((res) => {
      let sel: ItemId | null = null;
      const dock = $('#dock'), itms = $('#itms'), rb = $<HTMLButtonElement>('#rollBtn');
      const count = () => (sel === 'dw' ? 2 : sel === 'tw' ? 3 : 1);
      const show = () => this.view.diceShow(p, count(), sel === 'hw' ? 'half' : 'w6');
      const paint = () => {
        itms.innerHTML = '';
        for (const i of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'itm';
          b.setAttribute('aria-pressed', String(sel === i));
          b.textContent = sel === i ? `${ITEMS[i].name} aktiv` : ITEMS[i].name;
          b.title = ITEMS[i].text;
          b.onclick = () => { sel = sel === i ? null : i; sfx.pop(); paint(); show(); };
          itms.appendChild(b);
        }
        $('#rollSub').textContent = sel && !['dw', 'tw', 'hw', 'joker'].includes(sel) ? `${ITEMS[sel].name} einsetzen, dann würfeln` : document.body.classList.contains('coarse') ? 'Tippen zum Schlagen' : 'Leertaste oder Klick';
      };
      paint();
      show();
      dock.hidden = false;
      rb.disabled = false;
      rb.classList.add('ready');
      rb.focus({ preventScroll: true });
      this.rollDone = () => {
        this.rollDone = null;
        dock.hidden = true;
        rb.classList.remove('ready');
        itms.innerHTML = '';
        res({ use: sel });
      };
    });
  }

  private askPath(node: number, options: { to: number; name: string; len: number; blocked: string | null; key: boolean }[]): Promise<number> {
    return new Promise((res) => {
      const V = this.view;
      V.showArrows(node, options);
      this.pathOpts = options.map((o) => ({ to: o.to, ok: !o.blocked || o.key }));
      const ch = $('#choice');
      ch.innerHTML = '';
      const order = [...options].sort((a, b) => V.arrowScreenX(a.to) - V.arrowScreenX(b.to));
      order.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.disabled = !!o.blocked && !o.key;
        b.innerHTML = `${esc(o.name)}<small>${o.blocked ? (o.key ? 'gesperrt · Schlüssel öffnet' : esc(o.blocked)) : `${o.len} Felder`} · ${i + 1}</small>`;
        b.onmouseenter = () => V.hoverArrow(o.to);
        b.onmouseleave = () => V.hoverArrow(-1);
        b.onclick = () => this.pathDone?.(o.to);
        ch.appendChild(b);
      });
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Pfeil antippen oder ← →';
      ch.appendChild(hint);
      ch.hidden = false;
      $('#stage').classList.add('choosing');
      this.pathDone = (to) => {
        this.pathDone = null;
        ch.hidden = true;
        $('#stage').classList.remove('choosing');
        $<HTMLCanvasElement>('#gl').style.cursor = '';
        V.hideArrows();
        sfx.pop();
        res(to);
      };
    });
  }

  /** Close any open question (a friend's ask was answered by a bot after a timeout). */
  cancelAsk() {
    $('#ask').hidden = true;
    $('#choice').hidden = true;
    $('#dock').hidden = true;
    this.pathDone = null;
    this.rollDone = null;
    this.view.hideArrows();
    $('#stage').classList.remove('choosing');
  }
}

function bump(el: HTMLElement) {
  if (reduced) return;
  el.parentElement?.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.45,.45,1)' });
}

export const bonusText = (id: BonusId) => BONUS[id];
